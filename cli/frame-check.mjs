// Multi-storey frame check: Σ column loads at the base = all slab + beam + column weights. Usage: node frame-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { CONC, DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES } from "../web/engine/floor.js";

const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const floor = (name, h, t, xs, ys, extraCols = [], extraBeams = []) => {
  const beams = [];
  for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) beams.push({ a: [xs[i], y], b: [xs[i + 1], y], type: null, wall: { h: 0 } });
  for (const x of xs) for (let i = 0; i + 1 < ys.length; i++) beams.push({ a: [x, ys[i]], b: [x, ys[i + 1]], type: null, wall: { h: 0 } });
  return { name, h, t, finish: t ? 100 : 0, live: t ? 200 : 0, columns: [...xs.flatMap((x) => ys.map((y) => [x, y])), ...extraCols], beams: [...beams, ...extraBeams], panels: {} };
};
const xs = [0, 4, 8], ys = [0, 4];
// top floor has an extra column at (4, 2) standing on a beam (4,0)-(4,4) of the floor below (no column there)
const frame = { mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [
  floor("GB", 1.5, 0, xs, ys), floor("ชั้น 2", 3, 0.12, xs, ys),
  floor("หลังคา", 3, 0.1, xs, [0, 2, 4], [], []),
] };
frame.floors[2].columns = [...xs.flatMap((x) => ys.map((y) => [x, y])), [4, 2]];
const r = analyzeFrame(frame);
const slab = r.floors.reduce((s, a) => s + a.panels.reduce((t, p) => t + p.w * p.area, 0), 0);
const beams = r.floors.reduce((s, a) => s + a.spans.reduce((t, sp) => t + CONC * sp.type.b * sp.type.h * sp.len, 0), 0);
const colW = r.columns.reduce((s, c) => s + c.W, 0), base = r.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0);
// column loads are an envelope (max of continuous / simple-span reactions): at least all the weights, never negative
const ok = base >= slab + beams + colW - 1e-6 && Math.min(...r.columns.map((c) => c.Pbot)) > 0;
console.log(`${ok ? "ok  " : "FAIL"} base ΣP ${base.toFixed(0)} ≥ slab ${slab.toFixed(0)} + beams ${beams.toFixed(0)} + columns ${colW.toFixed(0)}`);
for (const st of r.stacks) console.log(`     ${st.key} ${frame.colTypes[st.typeIdx].name} ${st.list.map((c) => `${c.floor}:${(c.Pbot / 1000).toFixed(1)}t ${c.check.r?.mode ?? c.check.error} ${(c.check.util * 100).toFixed(0)}%${c.ok ? "" : " NG"}`).join(" | ")}`);
if (r.warnings.length) console.log(`     warn ${r.warnings.join(" | ")}`);
// a beam end drawn 2 cm off the beam it rests on (accepted by the floor analysis): the 3D frame must join it, not leave a loose
// joint (user 2026-11-03: "ไม่มีเสถียรภาพ" at a short secondary beam)
const g = (x, y) => [x, y], Bm = (a, b) => ({ a, b, type: null }), cs = [g(0, 0), g(4, 0), g(0, 4), g(4, 4)];
const fl = (name, h, ex) => ({ name, h, t: 0.12, finish: 100, live: 200, columns: cs, beams: [Bm(g(0, 0), g(4, 0)), Bm(g(0, 4), g(4, 4)), Bm(g(0, 0), g(0, 4)), Bm(g(4, 0), g(4, 4)), ...ex], walls: [], panels: {}, cants: [], stairs: [], lineLoads: [], pointLoads: [] });
const near = analyzeFrame({ ...frame, floors: [{ ...fl("GB", 1.5, []), t: 0 }, fl("F2", 3, [Bm(g(2, 0), g(2, 4)), Bm(g(2.02, 2), g(4, 2))])], colPick: {}, analysis: "envelope" });
const ok2 = !!near.frame3d && Math.abs(near.frame3d.base.reduce((s, b) => s + b.R[2], 0) - near.frame3d.load) < 1e-6 * near.frame3d.load;
console.log(`${ok2 ? "ok  " : "FAIL"} beam end 2 cm off its carrier: 3D frame stable and in equilibrium`);
// bored pile reinforcement (engine/borePile.js): Pa = 0.85·Ag·(0.25 f'c + fs ρ) ≥ P, ρ ≥ 0.5 %, ≥ 6 bars, clear spacing kept
const { borePileRebar } = await import("../web/engine/borePile.js");
const bp = [[0.35, 30000], [0.5, 60000], [0.6, 85000], [1.0, 230000]].map(([D, P]) => ({ D, P, r: borePileRebar({ D, P, fc: 240 }) }));
const ok3 = bp.every(({ P, r }) => r.ok && r.Pa >= P && r.rho >= 0.005 - 1e-9 && r.n >= 6) && Math.abs(bp[1].r.Pa - 0.85 * bp[1].r.Ag * (0.25 * 240 + 1600 * bp[1].r.rho)) < 1e-6;
console.log(`${ok3 ? "ok  " : "FAIL"} bored pile bars: ${bp.map(({ D, r }) => `Ø${D} ${r.n}-${r.bar}`).join(" · ")}`);
process.exit(ok && ok2 && ok3 ? 0 : 1);
