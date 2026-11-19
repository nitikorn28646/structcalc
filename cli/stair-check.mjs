// Stair load checks: every kind / direction / landing support → the stair's total load reaches beams (foot + head + landing), no
// "no beam" warning when beams are there, 3D frame builds. node cli/stair-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES } from "../web/engine/floor.js";
const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const Bm = (a, b, x = {}) => ({ a, b, type: null, ...x });
const box = (name, h, t) => ({ name, h, t, finish: t ? 100 : 0, live: t ? 200 : 0, columns: [[0, 0], [3, 0], [0, 4], [3, 4], [6, 0], [6, 4]], panels: {},
  beams: [Bm([0, 0], [3, 0]), Bm([3, 0], [6, 0]), Bm([0, 4], [3, 4]), Bm([3, 4], [6, 4]), Bm([0, 0], [0, 4]), Bm([3, 0], [3, 4]), Bm([6, 0], [6, 4])] });
let bad = 0;
const cases = [
  ["long +y", { a: [0, 0], b: [3, 4], up: "+y", kind: "long" }],
  ["long -y", { a: [0, 0], b: [3, 4], up: "-y", kind: "long" }],
  ["long +x", { a: [0, 0], b: [3, 4], up: "+x", kind: "long" }],
  ["long -x", { a: [3, 0], b: [6, 4], up: "-x", kind: "long" }],
  ["long +y all to top", { a: [0, 0], b: [3, 4], up: "+y", kind: "long", support: "top" }, null, [0, 1]],
  ["long +y all to bottom", { a: [0, 0], b: [3, 4], up: "+y", kind: "long", support: "bottom" }, null, [1, 0]],
  ["long -x all to top", { a: [3, 0], b: [6, 4], up: "-x", kind: "long", support: "top" }, null, [0, 1]],
  ["long -x both ends", { a: [3, 0], b: [6, 4], up: "-x", kind: "long", support: "both" }, null, [0.5, 0.5]],
  ["side +y", { a: [0, 0], b: [3, 4], up: "+y", kind: "side" }],
  ["cant +y side B", { a: [0, 0], b: [3, 4], up: "+y", kind: "cant", side: 1 }],
  ["landing → below", { a: [0, 0], b: [3, 4], up: "+y", kind: "landing", landingL: 1.2, landingTo: "below" }],
  ["landing → this", { a: [0, 0], b: [3, 4], up: "+y", kind: "landing", landingL: 1.2, landingTo: "this" }],
  ["landing → mid beam", { a: [0, 0], b: [3, 4], up: "+y", kind: "landing", landingL: 1.2 }, true],
  ["landing -x → mid beam", { a: [3, 0], b: [6, 4], up: "-x", kind: "landing", landingL: 1.0 }, "x"],
];
for (const [name, st, mid, share] of cases) {
  const f2 = box("ชั้น 2", 3, 0.12); f2.stairs = [{ t: 0.15, riser: 0.17, tread: 0.25, finish: 100, live: 300, ...st }];
  if (mid === true) f2.beams.push(Bm([0, 4], [3, 4], { lvl: 1.5 }));
  if (mid === "x") f2.beams.push(Bm([3, 0], [3, 4], { lvl: 1.5 }));
  const r = analyzeFrame({ mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [box("GB", 1.5, 0), f2] });
  const tot = r.floors[1].stairs[0].total, T = tot.DL + tot.SDL + tot.LL;
  const sum = (an) => an.lines.flatMap((l) => l.slab).filter((l) => String(l.from).startsWith("บันได")).reduce((t, l) => t + ((l.wa + l.wb) / 2) * (l.b - l.a), 0);
  const got = sum(r.floors[0]) + sum(r.floors[1]), noBeam = r.warnings.filter((w) => /บันได.*ไม่มีคาน|ชานพักไม่มีคาน/.test(w));
  // share [bottom beam (floor below), top beam (this floor)] of the total — st.support "top" / "bottom" puts all of it on one end
  const shareOk = !share || (Math.abs(sum(r.floors[0]) - share[0] * T) < 1e-6 * T && Math.abs(sum(r.floors[1]) - share[1] * T) < 1e-6 * T);
  const ok = Math.abs(got - T) < 1e-6 * T && !noBeam.length && !r.frame3d?.error && shareOk;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: total ${T.toFixed(0)} → beams ${got.toFixed(0)}${share ? ` (ล่าง ${sum(r.floors[0]).toFixed(0)} · บน ${sum(r.floors[1]).toFixed(0)})` : ""}${noBeam.length ? " · " + noBeam[0].slice(0, 90) : ""}${r.frame3d?.error ? " · 3D " + r.frame3d.error : ""}`);
}
process.exit(bad ? 1 : 0);
