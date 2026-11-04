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
// spread footings too close → the lighter one becomes a rectangle that keeps ≥ 0.10 m clear and still passes
const { analyzeFrame: aF } = await import("../web/engine/frame.js"); const yj = JSON.parse((await import("node:fs")).readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url), "utf8"));
const rr = aF({ ...yj.frame, footTypes: [{ kind: "spread", name: "F", Bx: 0, By: 0, t: 0.3, Df: 1.2, bar: "DB 12", s: 0.15 }], soil: { qa: 6000, gamma: 1800 } });
const re = rr.footings.filter((f) => f.reshaped), ok4 = re.length > 0 && re.every((f) => f.ok && f.r.Bx !== f.r.By);
console.log(`${ok4 ? "ok  " : "FAIL"} clashing spread footings reshaped to rectangles: ${re.map((f) => `${f.r.Bx}x${f.r.By}`).join(", ")}`);
// stair with a landing on a beam inside the storey (user 2026-11-04): foot on the floor below, landing on the landing beam (lvl 1.5),
// head on this floor — three beams loaded; the 3D frame puts the landing beam at +1.5 on the columns (split) and balances
let okS = false, okS3 = false;
{
  const fl = (name, h, t) => ({ name, h, t, finish: t ? 100 : 0, live: t ? 200 : 0, columns: [[0, 0], [3, 0], [0, 4], [3, 4]], panels: {},
    beams: [Bm(g(0, 0), g(3, 0)), Bm(g(0, 4), g(3, 4)), Bm(g(0, 0), g(0, 4)), Bm(g(3, 0), g(3, 4))] });
  const f2 = fl("ชั้น 2", 3, 0.12);
  f2.beams.push({ a: [0, 4], b: [3, 4], type: null, lvl: 1.5 }); // landing beam along the far edge, half way up
  f2.stairs = [{ a: [0, 0], b: [3, 4], up: "+y", kind: "landing", t: 0.15, landingL: 1.2 }];
  f2.panels = { }; // the panel under the stair is its well
  const fr = { mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [fl("GB", 1.5, 0), f2], analysis: "envelope" };
  const rr = analyzeFrame(fr), an = rr.floors[1], mid = an.lines.find((l) => l.lvl), msp = an.spans.find((s) => s.line === mid?.id);
  const onMid = (mid?.slab ?? []).filter((l) => String(l.from).startsWith("บันได")).reduce((t, l) => t + ((l.wa + l.wb) / 2) * (l.b - l.a), 0);
  const onFoot = rr.floors[0].lines.flatMap((l) => l.slab).filter((l) => String(l.from).startsWith("บันได")).reduce((t, l) => t + ((l.wa + l.wb) / 2) * (l.b - l.a), 0);
  const onHead = an.lines.filter((l) => !l.lvl).flatMap((l) => l.slab).filter((l) => String(l.from).startsWith("บันได")).reduce((t, l) => t + ((l.wa + l.wb) / 2) * (l.b - l.a), 0);
  const tot = an.stairs[0].total, T = tot.DL + tot.SDL + tot.LL;
  okS = !!msp && onMid > 0 && onFoot > 0 && onHead > 0 && Math.abs(onMid + onFoot + onHead - T) < 1e-6 * T && msp.Mpos > 0;
  console.log(`${okS ? "ok  " : "FAIL"} stair landing on a mid-level beam: foot ${onFoot.toFixed(0)} + landing ${onMid.toFixed(0)} + head ${onHead.toFixed(0)} = ${T.toFixed(0)} · landing beam M+ ${msp?.Mpos.toFixed(0)} (${msp?.typeName})`);
  const f3 = rr.frame3d, z = f3?.nodes?.filter?.((n) => Math.abs(n.z - 3) < 1e-6 && !n.master).length;
  okS3 = !!f3 && !f3.error;
  console.log(`${okS3 ? "ok  " : "FAIL"} 3D frame with the landing beam ${f3?.error ?? ""} ${rr.warnings.filter((w) => /ชานพัก|เสถียร/.test(w)).join(" | ")}`);
}
process.exit(ok && ok2 && ok3 && ok4 && okS && okS3 ? 0 : 1);
