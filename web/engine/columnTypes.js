// Auto column types (user 2026-11-04: "like the spread-footing types — choose how many types"). Every column (stack × floor) takes its
// cheapest passing section from a list in the user's habit (square 20 → 50 cm, 4 / 6 / 8 / 12 bars DB12 → DB16 → DB20, ties RB6 at the
// widest spacing the 16db / 48dt / side rule allows), stacks are sorted by need and split into k groups of about equal count, and each
// group gets one type: per floor level the cheapest section passing every column of the group. Up to 3 re-analyses (column self
// weight and frame stiffness follow the sections). Names C1… by size. frame.colTypes / colPick are replaced; frame.colAutoK = k.
import { analyzeFrame, columnLevelCheck } from "./frame.js";
import { BARS } from "./tables.js";

export const COL_GEN = { sizes: [20, 25, 30, 35, 40, 50], bars: [[4, "DB 12"], [6, "DB 12"], [8, "DB 12"], [4, "DB 16"], [6, "DB 16"], [8, "DB 16"], [12, "DB 16"], [8, "DB 20"], [12, "DB 20"]],
  ties: [["RB 6", [0.2, 0.15, 0.1]], ["RB 9", [0.2, 0.15, 0.1]]], price: { conc: 2500, steel: 28, form: 350 } };
// cost per metre of column (concrete + steel + formwork), for ordering only
const cost = (lv, g = COL_GEN) => { const A = (lv.Bx * lv.By) / 1e4, st = (lv.n * (BARS[lv.mainBar]?.A ?? 1.13) * 7850) / 1e4 + ((2 * (lv.Bx + lv.By)) / 100) * ((BARS[lv.tieBar]?.A ?? 0.28) * 7850 / 1e4) / lv.s;
  return A * g.price.conc + st * g.price.steel + ((2 * (lv.Bx + lv.By)) / 100) * g.price.form; };
function candidates(g = COL_GEN) {
  const out = [];
  for (const B of g.sizes) for (const [n, mainBar] of g.bars) {
    const rho = (n * (BARS[mainBar]?.A ?? 1)) / (B * B); if (rho < 0.01 - 1e-9 || rho > 0.025 + 1e-9) continue; // 1 % … 2.5 % (practical: a bigger section before crowded bars)
    if (n >= 8 && B < 25) continue; // 8 bars need room on each face
    for (const [tieBar, ss] of g.ties) for (const s of ss) out.push({ Bx: B, By: B, n, mainBar, tieBar, s });
  }
  return out.sort((a, b) => cost(a, g) - cost(b, g));
}
export function generateColumnTypes(frame, k, g = COL_GEN) {
  const C = candidates(g), nf = frame.floors.length;
  let f = frame, r = analyzeFrame(f), best = null;
  for (let pass = 0; pass < 3; pass++) {
    const stacks = r.stacks ?? [];
    if (!stacks.length) return null;
    // per stack and floor: index (cost rank) of the cheapest passing section
    const need = stacks.map((st) => { const v = new Array(nf).fill(-1); for (const c of st.list) { const i = C.findIndex((lv) => columnLevelCheck(f, lv, c).ok); v[c.floor] = i < 0 ? C.length - 1 : i; } return v; });
    const order = stacks.map((_, i) => i).sort((a, b) => need[a].reduce((t, x) => t + Math.max(0, x), 0) - need[b].reduce((t, x) => t + Math.max(0, x), 0));
    const kk = Math.max(1, Math.min(k, stacks.length)), groups = Array.from({ length: kk }, (_, j) => order.slice(Math.round((j * order.length) / kk), Math.round(((j + 1) * order.length) / kk))).filter((x) => x.length);
    const types = groups.map((gr) => ({ levels: frame.floors.map((fl, fi) => {
      const cols = gr.flatMap((si) => stacks[si].list.filter((c) => c.floor === fi));
      const lv = cols.length ? C.find((cand) => cols.every((c) => columnLevelCheck(f, cand, c).ok)) ?? C[C.length - 1] : C[0];
      return { level: fi === 0 ? "ตอม่อ" : `ชั้น ${fi}`, ...lv }; // ชั้น 1 = the columns of the ground storey (as the drawings)
    }), gr }));
    // name by size (largest top section first is C1? the user's drawings number from the smallest): C1 = lightest
    types.sort((a, b) => a.levels.reduce((t, lv) => t + cost(lv, g), 0) - b.levels.reduce((t, lv) => t + cost(lv, g), 0));
    // groups that ended with the same sections are one type
    const sig = (t) => t.levels.map((lv) => `${lv.Bx}x${lv.By}|${lv.n}|${lv.mainBar}|${lv.tieBar}|${lv.s}`).join("/"), uniq = [];
    for (const t of types) { const o = uniq.find((u) => sig(u) === sig(t)); if (o) o.gr = [...o.gr, ...t.gr]; else uniq.push({ ...t }); }
    const colPick = {}; uniq.forEach((t, i) => t.gr.forEach((si) => (colPick[stacks[si].key] = i)));
    const colTypes = uniq.map((t, i) => ({ name: `C${i + 1}`, levels: t.levels }));
    f = { ...frame, colTypes, colPick, colAutoK: colTypes.length }; r = analyzeFrame(f);
    const ok = r.columns.filter((c) => c.ok).length, tot = r.columns.reduce((t, c) => t + cost(c.lv, g) * (c.L ?? 3), 0);
    if (!best || ok > best.ok || (ok === best.ok && tot < best.cost)) best = { colTypes, colPick, ok, n: r.columns.length, cost: tot };
    if (ok === r.columns.length) break;
  }
  return best;
}
