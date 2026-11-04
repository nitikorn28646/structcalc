// Reinforcement inside a bored pile (user 2026-11-04: "ออกแบบเหล็กเสริมในตัวเข็มเจาะ"; the pile capacity from the soil is NOT computed here —
// the safe load per pile is the engineer's / the boring log's). The pile is checked as a short axially loaded RC member (WSD, tied):
//   Pa = 0.85·Ag·(0.25·f'c + fs·ρg),  fs = 0.40·fy ≤ 2,100 ksc  (ACI 318 WSD / ว.ส.ท.)
// with the usual detailing minimums for bored piles: ρg ≥ 0.5 % (common practice), at least 6 bars, clear spacing ≥ 10 cm (concrete
// placed under slurry / tremie; 5 cm for small dry-process piles Ø ≤ 0.40), ties RB9 ≤ min(16·db, 48·dt, D, 0.20 m), cage anchored into the cap ≥ 40·db.
const BAR = { "DB 12": { d: 1.2, A: 1.131 }, "DB 16": { d: 1.6, A: 2.011 }, "DB 20": { d: 2.0, A: 3.142 }, "DB 25": { d: 2.5, A: 4.909 } };
export function borePileRebar({ D, P, fc = 240, fy = 4000, cover = D <= 0.4 ? 5 : 7.5, clearMin = D <= 0.4 ? 5 : 10, rhoMin = 0.005, nMin = 6, L = 0 }) {
  // small dry-process piles (Ø ≤ 0.40) cover 5 cm / clear 5 cm; wet-process (larger) 7.5 cm / 10 cm
  const Ag = (Math.PI * (D * 100) ** 2) / 4, fs = Math.min(0.4 * fy, 2100), ring = Math.PI * (D * 100 - 2 * cover - 1.8); // bar circle cm (RB9 ties)
  for (const [bar, b] of Object.entries(BAR)) {
    for (let n = nMin; n <= 40; n++) {
      const As = n * b.A, rho = As / Ag, Pa = 0.85 * Ag * (0.25 * fc + fs * rho), clear = ring / n - b.d;
      if (clear < clearMin) break; // too many of this size → next size
      if (rho < rhoMin - 1e-9 || Pa < P) continue;
      const s = Math.min(16 * b.d, 48 * 0.9, D * 100, 20) / 100, sTie = Math.floor(s * 40) / 40;
      return { ok: true, bar, n, As, rho, Pa, P, fs, Ag, clear, tie: "RB 9", sTie, ld: Math.ceil(40 * b.d) / 100, L,
        text: `${n}-${bar} (ρ ${(rho * 100).toFixed(2)} %) · ปลอก RB 9 @ ${sTie.toFixed(3).replace(/0$/, "")} · ฝังในฐาน ≥ ${(Math.ceil(40 * b.d) / 100).toFixed(2)} ม.` };
    }
  }
  return { ok: false, P, Ag, text: "เหล็กเสริมไม่พอ — เพิ่มขนาดเข็ม" };
}
