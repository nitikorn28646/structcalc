// Beam side widening (พอกข้างคาน, user 2026-11-20): strip weight 2400·w·h on the beam (3D ΣRz rises by exactly that), equilibrium torque
// m = q_strip·(b + w)/2 + q_wall·e on the beam (end torque m·L/2 on a span between columns), shear friction across the strip/beam joint
// (Vu = 1.4(q_strip + q_wall) ≤ φVn = 0.75·1.4·fy·Avf), spacing / corner-bar rules, section drawing finite. node cli/widen-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WIDEN_TYPES } from "../web/engine/floor.js";
import { widenDetailModel } from "../web/engine/widenDetail.js";
const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const Bm = (a, b, x = {}) => ({ a, b, type: 0, ...x }); // B1 20×40 fixed → weights independent of the run
const xs = [0, 4, 8], ys = [0, 5];
const floor = (name, h, t) => ({ name, h, t, finish: t ? 100 : 0, live: t ? 200 : 0, panels: {}, columns: xs.flatMap((x) => ys.map((y) => [x, y])),
  beams: [...ys.flatMap((y) => [Bm([0, y], [4, y]), Bm([4, y], [8, y])]), ...xs.map((x) => Bm([x, 0], [x, 5]))] });
const model = (patch = (f) => f) => ({ mat, analysis: "envelope", beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [floor("GB", 1.5, 0), patch(floor("ชั้น 2", 3, 0.1))] });
const wall = { a: [0, 0], b: [4, 0], kind: "brick", h: 3, hAuto: false, open: 0, layers: 1 };
let bad = 0; const ok = (n, c, i = "") => { if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${n}${i ? ` — ${i}` : ""}`); };
const rz = (r) => r.frame3d.base.reduce((s, b) => s + b.R[2], 0);

const r0 = analyzeFrame(model((f) => ({ ...f, walls: [wall] })));
const r1 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0, side: -1 }; return f; }));
const t = DEFAULT_BEAM_TYPES[0], wt = DEFAULT_WIDEN_TYPES[0], qw = 2400 * wt.w * t.h, c = r1.floors[1].widen[0];
ok("strip weight = 2400·w·h", Math.abs(c.qw - qw) < 1e-9, `${c.qw} kg/m`);
ok("3D ΣRz rises by the strip weight exactly", Math.abs(rz(r1) - rz(r0) - qw * 4) < 1e-6 * rz(r0), `Δ ${(rz(r1) - rz(r0)).toFixed(2)} / ${qw * 4}`);
const e = t.b / 2 + wt.w - 0.1 / 2, m = qw * (t.b + wt.w) / 2 + 180 * 3 * e; // brick 180 kg/m² × 3 m, wall 0.10 thick
ok("torque per metre m = q_strip·(b + w)/2 + q_wall·e", Math.abs(c.m - m) < 1e-6 && Math.abs(c.e - e) < 1e-9, `${c.m.toFixed(2)} / ${m.toFixed(2)}`);
const sp0 = r0.floors[1].spans.find((s) => s.members.includes(0)), sp1 = r1.floors[1].spans.find((s) => s.members.includes(0));
ok("span end torque rises by m·L/2 (equilibrium, MtEq)", Math.abs((sp1.MtEq ?? 0) - (sp0.MtEq ?? 0) - (m * 4) / 2) < 1e-6, `${(sp1.MtEq - (sp0.MtEq ?? 0)).toFixed(2)} / ${(m * 2).toFixed(2)}`);
const Avf = (2 * 0.283 * 1) / 0.15, phiVn = 0.75 * 1.4 * 2400 * Avf; // RB 6: A = 0.283 cm²
ok("shear friction: Vu = 1.4(q_strip + q_wall), φVn = 0.75·1.4·fy·Avf", Math.abs(c.Vu - 1.4 * (qw + 540)) < 1e-6 && Math.abs(c.phiVn - phiVn) < 1e-6 && c.ok, `Vu ${c.Vu.toFixed(0)} ≤ φVn ${c.phiVn.toFixed(0)}`);
const r2 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0, side: 1 }; return f; }));
ok("side does not change the forces", Math.abs(r2.floors[1].widen[0].m - c.m) < 1e-9 && Math.abs(rz(r2) - rz(r1)) < 1e-6);
const r3 = analyzeFrame({ ...model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0 }; return f; }), widenTypes: [{ ...wt, s: 0.5, top: "", bot: "1-DB12" }] });
ok("stirrup spacing > d/2 and no top corner bar → not ok + warning", !r3.floors[1].widen[0].ok && r3.warnings.some((w) => w.includes("พอกข้าง")), r3.floors[1].widen[0].why.join(" · "));
for (const [j, w] of DEFAULT_WIDEN_TYPES.entries()) { const r = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: j }; return f; }));
  ok(`default ${w.name} (w ${w.w}) meets the detailing rules on B1 20×40`, r.floors[1].widen[0].ok, r.floors[1].widen[0].why.join(" · ")); }
const r5 = analyzeFrame({ ...model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0 }; return f; }), widenTypes: [{ ...DEFAULT_WIDEN_TYPES[2], top: "1-DB12", bot: "1-DB12" }] });
ok("w 0.30 with one bar per face → spacing > 30 cm warned (11.5.6.2)", r5.floors[1].widen[0].why.some((x) => x.includes("11.5.6.2")));
const mdl = widenDetailModel(t, DEFAULT_WIDEN_TYPES[2], mat);
ok("section drawing finite", mdl.items.every((p) => Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v))) && mdl.box.every(Number.isFinite));
const r4 = analyzeFrame(model((f) => ({ ...f, walls: [wall] })));
ok("no widening → identical results", JSON.stringify(r4.floors[1].spans.map((s) => [s.Mpos, s.Mneg, s.V, s.Mt])) === JSON.stringify(r0.floors[1].spans.map((s) => [s.Mpos, s.Mneg, s.V, s.Mt])));
console.log(bad ? `widen-check: ${bad} FAIL` : "widen-check: all ok");
process.exit(bad ? 1 : 0);
