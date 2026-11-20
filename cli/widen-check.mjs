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
const t = DEFAULT_BEAM_TYPES[0], wt = DEFAULT_WIDEN_TYPES[0], qw = 2400 * wt.w * t.h, c = r1.floors[1].widen[0][0];
ok("strip weight = 2400·w·h", Math.abs(c.qw - qw) < 1e-9, `${c.qw} kg/m`);
ok("3D ΣRz rises by the strip weight exactly", Math.abs(rz(r1) - rz(r0) - qw * 4) < 1e-6 * rz(r0), `Δ ${(rz(r1) - rz(r0)).toFixed(2)} / ${qw * 4}`);
const e = t.b / 2 + wt.w - 0.1 / 2, m = qw * (t.b + wt.w) / 2 + 180 * 3 * e; // brick 180 kg/m² × 3 m, wall 0.10 thick
ok("torque per metre m = q_strip·(b + w)/2 + q_wall·e", Math.abs(c.m - m) < 1e-6 && Math.abs(c.e - e) < 1e-9, `${c.m.toFixed(2)} / ${m.toFixed(2)}`);
const sp0 = r0.floors[1].spans.find((s) => s.members.includes(0)), sp1 = r1.floors[1].spans.find((s) => s.members.includes(0));
ok("span end torque rises by m·L/2 (equilibrium, MtEq)", Math.abs((sp1.MtEq ?? 0) - (sp0.MtEq ?? 0) - (m * 4) / 2) < 1e-6, `${(sp1.MtEq - (sp0.MtEq ?? 0)).toFixed(2)} / ${(m * 2).toFixed(2)}`);
const Avf = (2 * 0.283 * 1) / 0.15, phiVn = 0.75 * 1.4 * 2400 * Avf; // RB 6: A = 0.283 cm²
ok("shear friction: Vu = 1.4(q_strip + q_wall), φVn = 0.75·1.4·fy·Avf", Math.abs(c.Vu - 1.4 * (qw + 540)) < 1e-6 && Math.abs(c.phiVn - phiVn) < 1e-6 && c.ok, `Vu ${c.Vu.toFixed(0)} ≤ φVn ${c.phiVn.toFixed(0)}`);
const r2 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0, side: 1 }; return f; }));
ok("side does not change the forces", Math.abs(r2.floors[1].widen[0][0].m - c.m) < 1e-9 && Math.abs(rz(r2) - rz(r1)) < 1e-6);
const r3 = analyzeFrame({ ...model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0 }; return f; }), widenTypes: [{ ...wt, s: 0.5, top: "", bot: "1-DB12" }] });
ok("stirrup spacing > d/2 and no top corner bar → not ok + warning", !r3.floors[1].widen[0][0].ok && r3.warnings.some((w) => w.includes("พอกข้าง")), r3.floors[1].widen[0][0].why.join(" · "));
for (const [j, w] of DEFAULT_WIDEN_TYPES.entries()) { const r = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: j }; return f; }));
  ok(`default ${w.name} (w ${w.w}) meets the detailing rules on B1 20×40`, r.floors[1].widen[0][0].ok, r.floors[1].widen[0][0].why.join(" · ")); }
const r5 = analyzeFrame({ ...model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0 }; return f; }), widenTypes: [{ ...DEFAULT_WIDEN_TYPES[2], top: "1-DB12", bot: "1-DB12" }] });
ok("w 0.30 with one bar per face → spacing > 30 cm warned (11.5.6.2)", r5.floors[1].widen[0][0].why.some((x) => x.includes("11.5.6.2")));
const r6 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0, from: 1, to: 2.5 }; return f; }));
ok("partial widening 1.0–2.5 m: weight = q·1.5 m, end torque by the lever rule m·1.5·(L − 1.75)/L (near end)", Math.abs(rz(r6) - rz(r0) - qw * 1.5) < 1e-6 * rz(r0) && Math.abs(r6.floors[1].widen[0][0].len - 1.5) < 1e-9
  && Math.abs((r6.floors[1].spans.find((s) => s.members.includes(0)).MtEq ?? 0) - (sp0.MtEq ?? 0) - m * 1.5 * (4 - 1.75) / 4) < 1e-6, `Δ ${(rz(r6) - rz(r0)).toFixed(2)} / ${qw * 1.5}`);
const r7 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0] = { ...f.beams[0], a: [4, 0], b: [0, 0], widen: { type: 0, from: 1, to: 2.5 } }; return f; }));
ok("same part on a beam drawn the other way (from its own start)", Math.abs(rz(r7) - rz(r6)) < 1e-6 && Math.abs(r7.floors[1].widen[0][0].len - 1.5) < 1e-9);
// a wall drawn ON the strip (centre line 0.20 m off the axis for W20 on B1): a line load on the beam with its real eccentricity
const wallOff = { ...wall, a: [0, -0.2], b: [4, -0.2] };
const r8 = analyzeFrame(model((f) => { f.walls = [wallOff]; f.beams[0].widen = { type: 1, side: -1 }; return f; })), c8 = r8.floors[1].widen[0][0];
const r9 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 1, side: -1 }; return f; }));
ok("wall drawn mid-strip → on the beam (same total as on the axis), e moved out flush with the strip: 0.10 + 0.20 − 0.05 = 0.25", Math.abs(rz(r8) - rz(r9)) < 1e-6 && Math.abs(c8.e - 0.25) < 1e-9 && c8.eSrc === "flush" && c8.qWall === 540
  && !r8.warnings.some((w) => w.includes("ไม่อยู่บนคานหรือพื้น")), `e ${c8.e} · q ${c8.qWall}`);
const r10 = analyzeFrame(model((f) => { f.walls = [{ ...wall, a: [0, 0.2], b: [4, 0.2] }]; f.beams[0].widen = { type: 1, side: -1 }; return f; }));
ok("a wall on the OTHER side (no strip there) is not taken by the strip", r10.floors[1].widen[0][0].qWall === 0);
// both sides of one beam (user 2026-11-20 "พอกทั้ง 2 ฝั่ง"): two strip weights, torques added (conservative), each strip checked on its own
const r11 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = [{ type: 0, side: 1 }, { type: 1, side: -1 }]; return f; })), w11 = r11.floors[1].widen[0];
const qw2 = 2400 * DEFAULT_WIDEN_TYPES[1].w * t.h; // the wall drawn on the axis goes to the first strip (W10, e as before)
ok("both sides: weight = both strips, two checks", Math.abs(rz(r11) - rz(r0) - (qw + qw2) * 4) < 1e-6 * rz(r0) && w11.length === 2 && w11.every((x) => x && x.ok), `Δ ${(rz(r11) - rz(r0)).toFixed(2)} / ${(qw + qw2) * 4}`);
const sp11 = r11.floors[1].spans.find((s) => s.members.includes(0)), mSum = w11[0].m + w11[1].m;
ok("both sides: torques of the two strips added (not cancelled)", Math.abs((sp11.MtEq ?? 0) - (sp0.MtEq ?? 0) - (mSum * 4) / 2) < 1e-6 && Math.abs(w11[0].m - m) < 1e-6 && w11[1].qWall === 0
  && Math.abs(w11[1].m - qw2 * (t.b + DEFAULT_WIDEN_TYPES[1].w) / 2) < 1e-6, `${w11[0].m.toFixed(1)} + ${w11[1].m.toFixed(1)}`);
const r12 = analyzeFrame(model((f) => { f.walls = [wallOff]; f.beams[0].widen = [{ type: 0, side: 1 }, { type: 1, side: -1 }]; return f; })), w12 = r12.floors[1].widen[0];
ok("both sides: a wall drawn on the right strip goes to that strip", w12[0].qWall === 0 && w12[1].qWall === 540 && Math.abs(w12[1].e - 0.25) < 1e-9, `q ${w12[0].qWall} / ${w12[1].qWall}`);
ok("check lists the strip's end torque per span (full length: m·L/2) and the span total", c.spans?.length === 1 && Math.abs(c.spans[0].T - m * 2) < 1e-6 && c.spans[0].Mt >= c.spans[0].T - 1e-9, JSON.stringify(c.spans?.[0]));
const r13 = analyzeFrame(model((f) => { f.walls = [wall]; f.beams[0].widen = { type: 0, from: 2.5, to: 4 }; return f; }));
ok("partial widening at the span end 2.5–4.0 m: end torque m·1.5·3.25/4 (not m·1.5/2)", Math.abs((r13.floors[1].spans.find((s) => s.members.includes(0)).MtEq ?? 0) - (sp0.MtEq ?? 0) - m * 1.5 * 3.25 / 4) < 1e-6);
const r14 = analyzeFrame(model((f) => { f.walls = [{ ...wall, a: [0, -0.35], b: [4, -0.35] }]; f.beams[0].widen = { type: 1, side: -1 }; return f; })), c14 = r14.floors[1].widen[0][0];
ok("wall drawn past the strip edge keeps its real offset (0.35 > flush 0.25)", Math.abs(c14.e - 0.35) < 1e-9 && c14.eSrc === "drawn" && c14.qWall === 540, `e ${c14.e}`);
const r15 = analyzeFrame(model((f) => { f.walls = [wallOff]; f.beams[0].widen = { type: 1, side: -1, e: 0.18 }; return f; })), c15 = r15.floors[1].widen[0][0];
ok("e typed at the beam overrides", Math.abs(c15.e - 0.18) < 1e-9 && c15.eSrc === "set");
const mdl = widenDetailModel(t, DEFAULT_WIDEN_TYPES[2], mat);
ok("section drawing finite", mdl.items.every((p) => Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v))) && mdl.box.every(Number.isFinite));
const r4 = analyzeFrame(model((f) => ({ ...f, walls: [wall] })));
ok("no widening → identical results", JSON.stringify(r4.floors[1].spans.map((s) => [s.Mpos, s.Mneg, s.V, s.Mt])) === JSON.stringify(r0.floors[1].spans.map((s) => [s.Mpos, s.Mneg, s.V, s.Mt])));
console.log(bad ? `widen-check: ${bad} FAIL` : "widen-check: all ok");
process.exit(bad ? 1 : 0);
