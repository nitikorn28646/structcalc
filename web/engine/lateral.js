// Lateral loads and WSD load combinations for the whole building (user decision 2026-11-02):
//   wind    — มยผ. 1311-50, static (simplified) procedure: p = Iw·q·Ce·Cg·Cp, q = ½ρV50² (ρ = 1.25 kg/m³);
//             windward Cp at Ce(z of the band top), leeward Cp at Ce(H/2); force per floor = p × exposed width × band height
//   seismic — มยผ. 1301/1302-61, equivalent static force: SDS = ⅔·Fa·Ss, SD1 = ⅔·Fv·S1, T = Ct·H, Cs = Sa·I/R (≥ 0.01),
//             V = Cs·W, Fx = V·wx·hx^k / Σ wi·hi^k
//   combos  — D+L, D+0.75L+0.75W, 0.6D+W, D+0.7E, D+0.75L+0.525E, 0.6D+0.7E, each with ±X ±Y (editable)
// Every coefficient is an input with a default, shown in the report. Units: m, kg, s.
export const DEFAULT_LATERAL = {
  asked: false, // the user has answered "include wind / earthquake?" at the start of the project
  wind: { on: false, V50: 25, terrain: "A", Iw: 1.0, Cg: 2.0, Cpw: 0.8, Cpl: null, roofH: 1.5 },
  seismic: { on: false, Ss: 0.1, S1: 0.05, site: "D", I: 1.0, R: 3, Cd: 2.5, Ct: 0.02 },
  combos: null, // null = DEFAULT_COMBOS
};
export const DEFAULT_COMBOS = [
  { name: "D+L", D: 1, L: 1 },
  { name: "D+0.75L+0.75W", D: 1, L: 0.75, W: 0.75 },
  { name: "0.6D+W", D: 0.6, W: 1 },
  { name: "D+0.7E", D: 1, E: 0.7 },
  { name: "D+0.75L+0.525E", D: 1, L: 0.75, E: 0.525 },
  { name: "0.6D+0.7E", D: 0.6, E: 0.7 },
];
export const TERRAINS = { A: "ภูมิประเทศโล่ง (ทุ่ง ชายทะเล ชานเมือง)", B: "ภูมิประเทศขรุขระ (ในเมือง ชุมชนหนาแน่น)" };
export const SITES = { A: "หินแข็ง", B: "หิน", C: "ดินแข็งมาก / หินอ่อน", D: "ดินแข็ง", E: "ดินอ่อน" };

const q50 = (V) => (0.5 * 1.25 * V * V) / 9.81; // kg/m²
// exposure factor (z above ground, m)
export const Ce = (z, terrain) => (terrain === "B" ? Math.max(0.7, 0.7 * (Math.max(z, 0) / 12) ** 0.3) : Math.max(0.9, (Math.max(z, 0) / 10) ** 0.2));
const lerp = (x, xs, ys) => { if (x <= xs[0]) return ys[0]; for (let i = 1; i < xs.length; i++) if (x <= xs[i]) return ys[i - 1] + ((ys[i] - ys[i - 1]) * (x - xs[i - 1])) / (xs[i] - xs[i - 1]); return ys[ys.length - 1]; };
// site coefficients (short period Fa at Ss = 0.25…1.25, long period Fv at S1 = 0.1…0.5)
const FA = { A: [0.8, 0.8, 0.8, 0.8, 0.8], B: [1, 1, 1, 1, 1], C: [1.2, 1.2, 1.1, 1.0, 1.0], D: [1.6, 1.4, 1.2, 1.1, 1.0], E: [2.5, 1.7, 1.2, 0.9, 0.9] };
const FV = { A: [0.8, 0.8, 0.8, 0.8, 0.8], B: [1, 1, 1, 1, 1], C: [1.7, 1.6, 1.5, 1.4, 1.3], D: [2.4, 2.0, 1.8, 1.6, 1.5], E: [3.5, 3.2, 2.8, 2.4, 2.4] };

// plan extents of a floor (columns and beam ends)
function extents(fl) {
  const P = [...(fl.columns ?? []), ...(fl.beams ?? []).flatMap((b) => [b.a, b.b])];
  if (!P.length) return null;
  const xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}
// floor levels: Z[k] = top of floor k above the footing top; ground ≈ the lowest floor (ground beams)
export const levels = (frame) => { let z = 0; return frame.floors.map((f) => (z += f.h ?? 3)); };

// wind forces per floor for wind along X (dir "x", acting on the Y width) and along Y
export function windForces(frame) {
  const w = { ...DEFAULT_LATERAL.wind, ...frame.lateral?.wind }, Z = levels(frame), z0 = Z[0], n = Z.length;
  const H = Z[n - 1] - z0 + (w.roofH ?? 0), q = q50(w.V50);
  const ex = frame.floors.map(extents), all = ex.filter(Boolean);
  const box = { x0: Math.min(...all.map((e) => e.x0)), x1: Math.max(...all.map((e) => e.x1)), y0: Math.min(...all.map((e) => e.y0)), y1: Math.max(...all.map((e) => e.y1)) };
  const dir = (d) => {
    const D = d === "x" ? box.x1 - box.x0 : box.y1 - box.y0, r = H / Math.max(D, 0.1);
    const Cpl = w.Cpl ?? -lerp(r, [0.25, 1], [0.3, 0.5]), CeL = Ce(H / 2, w.terrain);
    const floors = Z.map((zk, k) => {
      const lo = k === 0 ? z0 : (Z[k - 1] + zk) / 2, hi = k === n - 1 ? zk + (w.roofH ?? 0) : (zk + Z[k + 1]) / 2, e = ex[k] ?? box;
      const B = d === "x" ? e.y1 - e.y0 : e.x1 - e.x0, CeW = Ce(hi - z0, w.terrain);
      const p = w.Iw * q * w.Cg * (w.Cpw * CeW + Math.abs(Cpl) * CeL);
      return { floor: k, z: zk, lo, hi, B, CeW, p, F: p * B * Math.max(0, hi - lo) };
    });
    return { D, HD: r, Cpl, CeL, floors, V: floors.reduce((s, f) => s + f.F, 0) };
  };
  return { ...w, q, H, x: dir("x"), y: dir("y") };
}

// seismic weight per floor (dead + superimposed, no live): weights[k] from the gravity analysis
export function seismicForces(frame, weights) {
  const s = { ...DEFAULT_LATERAL.seismic, ...frame.lateral?.seismic }, Z = levels(frame), z0 = Z[0] - (frame.floors[0]?.h ?? 0);
  const Fa = lerp(s.Ss, [0.25, 0.5, 0.75, 1, 1.25], FA[s.site] ?? FA.D), Fv = lerp(s.S1, [0.1, 0.2, 0.3, 0.4, 0.5], FV[s.site] ?? FV.D);
  const SDS = (2 / 3) * Fa * s.Ss, SD1 = (2 / 3) * Fv * s.S1, H = Z[Z.length - 1] - Z[0] + (frame.floors[0]?.h ?? 0), T = s.Ct * H;
  const Ts = SD1 / Math.max(SDS, 1e-9), T0 = 0.2 * Ts, Sa = T < T0 ? SDS * (0.4 + (0.6 * T) / T0) : T <= Ts ? SDS : SD1 / T;
  const Cs = Math.max((Sa * s.I) / s.R, 0.01), W = weights.reduce((a, b) => a + b, 0), V = Cs * W;
  const k = T <= 0.5 ? 1 : T >= 2.5 ? 2 : 1 + (T - 0.5) / 2, hk = Z.map((zk) => Math.max(zk - z0, 0) ** k), sum = weights.reduce((a, wk, i) => a + wk * hk[i], 0) || 1;
  const floors = Z.map((zk, i) => ({ floor: i, z: zk, h: zk - z0, w: weights[i], F: (V * weights[i] * hk[i]) / sum }));
  return { ...s, Fa, Fv, SDS, SD1, H, T, Ts, T0, Sa, Cs, W, V, k, floors };
}

// combinations with directions: W and E cases become ±X and ±Y; result { name, D, L, Wx, Wy, Ex, Ey }
export function expandCombos(frame) {
  const L = frame.lateral ?? {}, wOn = !!L.wind?.on, eOn = !!L.seismic?.on, out = [];
  for (const c of (L.combos ?? DEFAULT_COMBOS).filter((c) => c.on !== false)) {
    if (c.W && !wOn) continue;
    if (c.E && !eOn) continue;
    const base = { D: c.D ?? 0, L: c.L ?? 0, Wx: 0, Wy: 0, Ex: 0, Ey: 0 };
    if (!c.W && !c.E) { out.push({ name: c.name, ...base }); continue; }
    const key = c.W ? "W" : "E", f = c.W ?? c.E;
    for (const [d, s, lab] of [["x", 1, "+X"], ["x", -1, "−X"], ["y", 1, "+Y"], ["y", -1, "−Y"]])
      out.push({ name: `${c.name} ${lab}`, ...base, [`${key}${d}`]: s * f, lateral: key, dir: d });
  }
  return out;
}
