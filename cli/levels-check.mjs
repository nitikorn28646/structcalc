// Levels (user 2026-11-20: porch slab 10 cm below the rooms → beams at different levels): slab level per panel → beam levels, step
// beams (notch, checked with b × (h − dz)), step joints (higher beam's support checked with h − dz), warnings (depth left, secondary
// bottom, PS bearing ≥ max(5 cm, ln/180)). Loads must not change with levels. node cli/levels-check.mjs
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
ok("porch/room beam = step beam 0.10", L([0, 1.5], [4, 1.5]).top === 0 && L([0, 1.5], [4, 1.5]).step === 0.1);
ok("porch/side bay beam = step beam 0.10", L([4, 0], [4, 1.5]).step === 0.1, JSON.stringify(L([4, 0], [4, 1.5])));
const j0 = an.levels.steps.find((j) => j.p[0] === 0 && j.p[1] === 1.5);
ok("step joint at (0, 1.5), higher = the room beam", j0 && j0.dz === 0.1 && j0.hi === bi(f2, [0, 1.5], [0, 5.5]) && j0.col && j0.ok);
const spStep = an.spans.find((s) => s.members.includes(bi(f2, [0, 1.5], [4, 1.5]))), spHi = an.spans.find((s) => s.members.includes(bi(f2, [0, 1.5], [0, 5.5])));
ok("step beam span checked with h − 0.10 (whole span)", spStep.hCut === 0.1);
ok("higher beam span: support checked with h − 0.10", spHi.hCutSup === 0.1 && !spHi.hCut && spHi.check.step?.cut === 0.1);
const t5 = DEFAULT_BEAM_TYPES[4], full = checkSpan(t5, { ...spStep, hCut: 0 }, mat), cut = checkSpan(cutType(t5, 0.1), { ...spStep, hCut: 0 }, mat), used = checkSpan(t5, spStep, mat);
ok("cut check = check with the type 10 cm shallower", Math.abs(used.util - cut.util) < 1e-12 && cut.util >= full.util - 1e-12, `util full ${full.util.toFixed(3)} · cut ${cut.util.toFixed(3)}`);
const rz = (r) => r.frame3d.base.reduce((s, b) => s + b.R[2], 0);
ok("weight unchanged by levels (3D ΣRz, fixed types)", Math.abs(rz(r1) - rz(r0)) < 1e-6 * rz(r0), `${rz(r0).toFixed(1)} / ${rz(r1).toFixed(1)} kg`);
ok("accumulated column loads ≥ the weight", base(r1) >= rz(r1) - 1);

// C: depth left too small (−0.35 with B1 0.40 deep) → warning + not ok
const r2 = analyzeFrame(model((f) => { f.panels = { "2.00,0.75": { dz: -0.35 } }; f.beams = f.beams.map((b) => ({ ...b, type: 0 })); return f; }));
ok("step deeper than the beam allows → warned", r2.floors[1].levels.steps.some((j) => !j.ok) && r2.warnings.some((w) => w.includes("ไม่พอให้เหล็กบนวิ่งผ่าน")));

// D: a secondary beam lower and deeper than the beam carrying it → warned
const r3 = analyzeFrame(model((f) => { f.beams.push(Bm([2, 1.5], [2, 5.5], { type: 4, dz: -0.1 })); f.beams = f.beams.map((b, i) => (i < f.beams.length - 1 ? { ...b, type: 0 } : b)); return f; }));
ok("secondary bottom below the main beam bottom → warned", r3.warnings.some((w) => w.includes("ท้องคานซอยต่ำกว่าท้องคานหลัก")));

// E: precast planks spanning Y on the porch: step beam (0,1.5)–(4,1.5) carries them on its notch; default notch b/2 = 0.10 passes, 0.03 fails
const r4 = analyzeFrame(porch(-0.1, { kind: "PS", dir: "y" }));
ok("PS bearing on the notch b/2 = 10 cm → no warning", !r4.warnings.some((w) => w.includes("วางได้")));
const r5 = analyzeFrame(model((f) => { f.panels = { "2.00,0.75": { dz: -0.1, kind: "PS", dir: "y" } }; f.beams[bi(f, [0, 1.5], [4, 1.5])].notchW = 0.03; return f; }));
ok("PS bearing on a 3 cm notch → warned (≥ 5 cm, ACI 318-11 16.6.2.2)", r5.warnings.some((w) => w.includes("ฝั่งต่ำบนบ่า วางได้ 3.0 ซม.")));

// F: a level set by hand on a beam overrides the slabs
const r6 = analyzeFrame(model((f) => { f.beams[bi(f, [4, 1.5], [8, 1.5])].dz = -0.05; return f; }));
ok("beam.dz overrides", r6.floors[1].levels.beams[bi(floor("x", 3, 0.1), [4, 1.5], [8, 1.5])].top === -0.05);
ok("3D frame still builds with levels", !r1.frame3d?.error);

console.log(bad ? `levels-check: ${bad} FAIL` : "levels-check: all ok");
process.exit(bad ? 1 : 0);
