// Curved (circular-arc) beam checks. Usage: node cli/arc-check.mjs → exit 1 on failure.
// 1. quarter-circle cantilever in plan, tip load P (statics: M = T = P·R at the fixed end; Castigliano tip deflection
//    δ = P·R³/EI·π/4 + P·R³/GJ·(3π/4 − 2)) solved with the arc as 12 straight pieces (nodes on the arc)
// 2. the whole pipeline: a floor with a quarter-arc beam between two columns → equilibrium, torsion appears, chord vs arc
import { solveFrame3D } from "../web/engine/frame3d.js";
import { arcGeom, arcPoint, quarterSagitta } from "../web/engine/arc.js";
import { analyzeFrame } from "../web/engine/frame.js";
import { CONC, DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES } from "../web/engine/floor.js";

let bad = 0;
const near = (name, got, want, tol = 1e-4) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got.toFixed(5)} (want ${want.toFixed(5)})`);
};

// arc geometry: chord 2 m, sagitta 1 m = half circle R 1; quarter arc sagitta on chord c
{ const g = arcGeom([0, 0], [2, 0], 1); near("R of a half circle", g.R, 1); near("angle", g.th, Math.PI); near("mid-arc point y", arcPoint(g, 1)[1], 1, 1e-9); near("length πR", g.L, Math.PI); }
{ const c = Math.SQRT2, g = arcGeom([1, 0], [0, 1], quarterSagitta(c)); near("quarter sagitta → 90°", g.th, Math.PI / 2, 1e-9); near("quarter R", g.R, 1, 1e-9); }

// 1. cantilever quarter circle R = 2 m about the origin, fixed at (R, 0), tip at (0, R), z = 3 m
{
  const R = 2, n = 12, E = 2e9, b = 0.2, h = 0.4, P = 1000, one = { beam: 1, column: 1, J: 1 };
  const nodes = Array.from({ length: n + 1 }, (_, i) => { const a = (Math.PI / 2) * (i / n); return { x: R * Math.cos(a), y: R * Math.sin(a), z: 3, ...(i === 0 ? { fixed: true } : {}) }; });
  const members = Array.from({ length: n }, (_, i) => ({ i, j: i + 1, kind: "beam", b, h }));
  const r = solveFrame3D({ E, factors: one, nodes, members, nodeLoads: [{ n, P }] });
  near("fixed end Rz = P", r.R[0][2], P, 1e-9);
  near("fixed end |moment about X| = P·R", Math.abs(r.R[0][3]), P * R, 1e-6);
  near("fixed end |moment about Y| = P·R", Math.abs(r.R[0][4]), P * R, 1e-6);
  const I = (b * h ** 3) / 12, a = Math.min(b, h), c = Math.max(b, h), J = a ** 3 * c * (1 / 3 - 0.21 * (a / c) * (1 - a ** 4 / (12 * c ** 4))), G = E / 2.4;
  const want = (P * R ** 3) / (E * I) * (Math.PI / 4) + (P * R ** 3) / (G * J) * ((3 * Math.PI) / 4 - 2);
  near("tip deflection vs Castigliano (12 chords, ≤ 2 %)", -r.u[n * 6 + 2], want, 0.02);
}

// 2. pipeline: columns at (0, 0) and (4, 4), quarter-arc beam between them bulging outward, plus straight beams
{
  const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
  const s = -quarterSagitta(Math.hypot(4, 4));
  const fl = (name, h, arc) => ({ name, h, t: 0, finish: 0, live: 0, columns: [[0, 0], [4, 4], [0, 4]], panels: {},
    beams: [{ a: [0, 0], b: [4, 4], type: null, ...(arc ? { arc: { s } } : {}) }, { a: [0, 0], b: [0, 4], type: null }, { a: [0, 4], b: [4, 4], type: null }],
    lineLoads: [{ a: [0, 0], b: [4, 4], q: 500, name: "ราว" }] });
  const run = (arc) => analyzeFrame({ mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [fl("GB", 1, false), fl("ชั้น 2", 3, arc)] });
  const ra = run(true), rc = run(false), f3 = ra.frame3d;
  near("arc: base ΣRz = applied loads (3D)", f3.base.reduce((t, b) => t + b.R[2], 0), f3.load, 1e-6);
  const arcSp = ra.floors[1].spans.find((x) => ra.floors[1].lines[x.line].arc), chSp = rc.floors[1].spans.find((x) => x.line === arcSp.line);
  console.log(`     arc span ${arcSp.id}: M+ ${arcSp.Mpos.toFixed(0)} M− ${arcSp.Mneg.toFixed(0)} T ${arcSp.Mt.toFixed(0)} · chord M+ ${chSp.Mpos.toFixed(0)} M− ${chSp.Mneg.toFixed(0)} T ${chSp.Mt.toFixed(0)}`);
  const ok = arcSp.f3.T > 10 * Math.max(1, chSp.f3?.T ?? 0);
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} torsion appears on the arc (${arcSp.f3.T.toFixed(0)} kg-m) but not on the chord (${(chSp.f3?.T ?? 0).toFixed(0)})`);
  near("3D members of the arc lie on the arc (radius)", (() => { const g = arcGeom([0, 0], [4, 4], s), m = f3.members.find((x) => x.kind === "beam" && x.floor === 1 && x.line === arcSp.line && x.x0 > 0.1), p = f3.nodes[m.i]; return Math.hypot(p.x - g.cen[0], p.y - g.cen[1]); })(), arcGeom([0, 0], [4, 4], s).R, 1e-6);
  void CONC;
}
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
