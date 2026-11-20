// Levels (user 2026-11-20: porch slab 10 cm below the rooms → the beams it rests on lowered whole, no notch beams): slab level per panel →
// beam levels (lowest slab beside it), step joints (higher beam's support checked with h − dz unless its top bars hook in the column),
// warnings (depth left, secondary bottom). Loads must not change with levels. node cli/levels-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, checkSpan, cutType } from "../web/engine/floor.js";
const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const Bm = (a, b, x = {}) => ({ a, b, type: 4, ...x }); // fixed type B5 20×50 → self weight independent of the levels
const xs = [0, 4, 8], ys = [0, 1.5, 5.5];
const grid = () => {
  const columns = xs.flatMap((x) => ys.map((y) => [x, y])), beams = [];
  for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) beams.push(Bm([xs[i], y], [xs[i + 1], y]));
  for (const x of xs) for (let j = 0; j + 1 < ys.length; j++) beams.push(Bm([x, ys[j]], [x, ys[j + 1]]));
  return { columns, beams };
};
const floor = (name, h, t, extra = {}) => ({ name, h, t, finish: t ? 100 : 0, live: t ? 200 : 0, panels: {}, ...grid(), ...extra });
const model = (f2patch = (f) => f) => ({ mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors: [floor("GB", 1.5, 0), f2patch(floor("ชั้น 2", 3, 0.1))] });
const base = (r) => r.columns.filter((c) => c.floor === 0).reduce((t, c) => t + c.Pbot, 0);
const bi = (f, a, b) => f.beams.findIndex((q) => (q.a + "" === a + "" && q.b + "" === b + "") || (q.a + "" === b + "" && q.b + "" === a + ""));
let bad = 0;
const ok = (name, cond, info = "") => { if (!cond) bad++; console.log(`${cond ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); };

// A: no levels = explicit 0 everywhere (identical results)
const r0 = analyzeFrame(model()), rZ = analyzeFrame(model((f) => ({ ...f, panels: { "2.00,0.75": { dz: 0 } } })));
const key = (r) => JSON.stringify(r.floors.flatMap((f) => f.spans.map((s) => [s.id, s.Mpos, s.Mneg, s.V, s.check.util])));
ok("no levels = level 0", key(r0) === key(rZ) && !r0.floors[1].spans.some((s) => s.hCut || s.hCutSup));

// B: porch panel (x 0–4, y 0–1.5) at −0.10
const porch = (dz = -0.1, more = {}) => model((f) => { f.panels = { "2.00,0.75": { dz, ...more } }; return f; });
const r1 = analyzeFrame(porch()), an = r1.floors[1], f2 = porch().floors[1], lv = an.levels.beams;
const L = (a, b) => lv[bi(f2, a, b)];
ok("porch front beam lowered", L([0, 0], [4, 0]).top === -0.1 && !L([0, 0], [4, 0]).step);
ok("porch end beam lowered", L([0, 0], [0, 1.5]).top === -0.1 && !L([0, 0], [0, 1.5]).step);
ok("porch/room beam lowered whole (no notch)", L([0, 1.5], [4, 1.5]).top === -0.1 && !L([0, 1.5], [4, 1.5]).step && L([0, 1.5], [4, 1.5]).up === 0.1);
ok("porch/side bay beam lowered whole", L([4, 0], [4, 1.5]).top === -0.1 && !L([4, 0], [4, 1.5]).step);
ok("room beams stay at 0", L([0, 1.5], [0, 5.5]).top === 0 && L([4, 1.5], [8, 1.5]).top === 0);
const j0 = an.levels.steps.find((j) => j.p[0] === 0 && j.p[1] === 1.5), j1 = an.levels.steps.find((j) => j.p[0] === 4 && j.p[1] === 1.5);
ok("step joints at (0, 1.5) and (4, 1.5), higher = the room beams", j0?.hi === bi(f2, [0, 1.5], [0, 5.5]) && j1?.hi === bi(f2, [4, 1.5], [8, 1.5]) && j0.col && j0.ok && j0.dz === 0.1);
ok("no span checked with a notch", !an.spans.some((s) => s.hCut));
const spHi = an.spans.find((s) => s.members.includes(bi(f2, [0, 1.5], [0, 5.5])));
ok("higher beam span, 20 cm column: hook does not fit → support checked with h − 0.10", spHi.stepSup?.length && spHi.check.step?.cut === 0.1 && spHi.check.stepHook?.[0]?.ok === false, JSON.stringify(spHi.check.stepHook));
const t5 = DEFAULT_BEAM_TYPES[4], c0 = checkSpan(t5, { ...spHi, stepSup: null }, mat), cc = checkSpan(cutType(t5, 0.1), { ...spHi, stepSup: null, Mpos: 0 }, mat);
ok("joint check = full-depth check and the h − 0.10 support check", Math.abs(spHi.check.util - Math.max(c0.util, cc.util)) < 1e-9 || spHi.check.util >= Math.max(c0.util, cc.util) - 1e-9);
const big = [{ name: "C40", levels: [0, 1, 2].map(() => ({ level: "-", Bx: 40, By: 40, n: 8, mainBar: "DB 16", tieBar: "RB 9", s: 0.15 })) }];
const rB = analyzeFrame({ ...porch(), colTypes: big }), spB = rB.floors[1].spans.find((s) => s.members.includes(bi(f2, [0, 1.5], [0, 5.5])));
ok("higher beam span, 40 cm column: hooked → full depth", spB.check.stepHook?.[0]?.ok === true && !spB.check.step, JSON.stringify(spB.check.stepHook));
const rz = (r) => r.frame3d.base.reduce((s, b) => s + b.R[2], 0);
ok("weight unchanged by levels (3D ΣRz, fixed types)", Math.abs(rz(r1) - rz(r0)) < 1e-6 * rz(r0), `${rz(r0).toFixed(1)} / ${rz(r1).toFixed(1)} kg`);
ok("accumulated column loads ≥ the weight", base(r1) >= rz(r1) - 1);

// C: depth left too small (−0.35 with B1 0.40 deep) → warning + not ok
const r2 = analyzeFrame(model((f) => { f.panels = { "2.00,0.75": { dz: -0.35 } }; f.beams = f.beams.map((b) => ({ ...b, type: 0 })); return f; }));
ok("step deeper than the beam allows → warned", r2.floors[1].levels.steps.some((j) => !j.ok) && r2.warnings.some((w) => w.includes("ไม่พอให้เหล็กบนวิ่งผ่าน")));

// D: a secondary beam lower and deeper than the beam carrying it → warned
const r3 = analyzeFrame(model((f) => { f.beams.push(Bm([2, 1.5], [2, 5.5], { type: 4, dz: -0.1 })); f.beams = f.beams.map((b, i) => (i < f.beams.length - 1 ? { ...b, type: 0 } : b)); return f; }));
ok("secondary bottom below the main beam bottom → warned", r3.warnings.some((w) => w.includes("ท้องคานซอยต่ำกว่าท้องคานหลัก")));

// F: a level set by hand on a beam overrides the slabs
const r6 = analyzeFrame(model((f) => { f.beams[bi(f, [4, 1.5], [8, 1.5])].dz = -0.05; return f; }));
ok("beam.dz overrides", r6.floors[1].levels.beams[bi(floor("x", 3, 0.1), [4, 1.5], [8, 1.5])].top === -0.05);
ok("3D frame still builds with levels", !r1.frame3d?.error);

console.log(bad ? `levels-check: ${bad} FAIL` : "levels-check: all ok");
process.exit(bad ? 1 : 0);
