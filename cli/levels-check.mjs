// Levels (user 2026-11-20: porch slab 10 cm below the rooms → the beams it rests on lowered whole, no notch beams): slab level per panel →
// beam levels (lowest slab beside it), step joints (higher beam's support checked with h − dz unless its top bars hook in the column),
// warnings (depth left, secondary bottom). Loads must not change with levels. node cli/levels-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, checkSpan, cutType } from "../web/engine/floor.js";
import { levelJoints, jointGroups, jointDetailModel, depthJoints, depthGroups, depthDetailModel } from "../web/engine/levelDetail.js";
import { DEFAULT_LATERAL } from "../web/engine/lateral.js";
import { BARS } from "../web/engine/tables.js";
const BARS_A = (r) => BARS[r.addBar.split("-")[1]].A;
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
// joint table + detail drawing (P2): one row per joint, every primitive finite
const fm = porch(), rows = levelJoints(fm, r1), gs = jointGroups(rows), mdl = gs.map((g) => jointDetailModel(g, mat));
const finite = (m) => m.items.every((p) => Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v)) && (!p.pts || p.pts.flat().every(Number.isFinite))) && m.box.every(Number.isFinite);
ok("joint table: one row per step joint, detail drawings finite", rows.length === an.levels.steps.length && rows.length >= 2 && mdl.every(finite) && rows.every((r) => r.mode && r.ld > 0), `${rows.length} rows · ${gs.length} details`);

// D: beams of different depth with level tops at a column (user 2026-11-20): B5 20×50 (x 0–4) next to B1 20×40 (x 4–8) on y = 0
const depthM = (lat) => ({ ...model((f) => { f.beams[bi(f, [4, 0], [8, 0])].type = 0; return f; }), ...(lat ? { lateral: { ...DEFAULT_LATERAL, asked: true, wind: { ...DEFAULT_LATERAL.wind, on: true } } } : {}) });
const rD = analyzeFrame(depthM(false)), dj = rD.depthJoints.filter((r) => r.floor === 1 && Math.abs(r.p[0] - 4) < 1e-6 && Math.abs(r.p[1]) < 1e-6);
ok("depth joint found at (4, 0): deep B5, shallow B1, Δh 0.10, tops level", dj.length === 1 && dj[0].deep.name === "B5" && dj[0].sh.name === "B1" && Math.abs(dj[0].dh - 0.1) < 1e-9 && !rD.depthJoints.some((r) => r.dh < 0.05), JSON.stringify(dj[0] && { dh: dj[0].dh, along: dj[0].along, hook: dj[0].hook }));
const h0 = dj[0].hook, ldh = Math.max((0.075 * 4000 * 1.6) / Math.sqrt(240) * (h0.side ? 0.7 : 1), 8 * 1.6, 15);
ok("deep bottom bars (DB16) hook: ldh = 0.075·fy·db/√f′c (×0.7) ≥ 8db ≥ 15, available = column − 5 cm", Math.abs(h0.ldh - +ldh.toFixed(1)) < 0.06 && Math.abs(h0.avail - (dj[0].along * 100 - 5)) < 0.06, `${h0.ldh} / ${h0.avail}`);
ok("no lateral load: hook not required (12.11.1) → joint ok, no warning", dj[0].jointOk && !rD.warnings.some((w) => w.includes("คานลึกต่างกัน")));
const rDL = analyzeFrame(depthM(true)), djL = rDL.depthJoints.find((r) => r.floor === 1 && Math.abs(r.p[0] - 4) < 1e-6 && Math.abs(r.p[1]) < 1e-6);
ok("wind on: the deep bottom bars must develop fy (12.11.2) — hook does not fit the 20 cm column → NG + warning", djL && !djL.jointOk && rDL.warnings.some((w) => w.includes("คานลึกต่างกัน") && w.includes("12.11.2")), djL?.mode);
const dm = depthGroups(rD.depthJoints).map((g) => depthDetailModel(g, mat));
ok("depth detail drawings finite", dm.length > 0 && dm.every(finite));
ok("same model without the type change: no depth joint on y = 0", !analyzeFrame(model()).depthJoints.some((r) => r.floor === 1 && Math.abs(r.p[1]) < 1e-6 && Math.abs(r.p[0] - 4) < 1e-6));

// E: column too small for the hook (user "เพิ่มขนาดเสาตามใจไม่ได้"): bars through the joint at the lower level ≥ As required at h − Δ
{ const rws = levelJoints(porch().floors ? porch() : porch(), r1).filter((r) => r.needCut);
  const okAll = rws.every((r) => r.AsThrough >= r.reqAs - 1e-9 && (r.nAdd === 0 || r.AsThrough - BARS_A(r) < r.reqAs - 1e-9));
  ok("through bars (lower beam top + added bars) ≥ As required at h − Δ, fewest added bars", rws.length > 0 && okAll, rws.map((r) => `${r.reqAs.toFixed(2)}→${r.lo?.top}${r.addBar ? " + " + r.addBar : ""}`).join(" · ")); }

{ const rws = levelJoints(porch(), r1).filter((r) => r.needCut);
  ok("non-contact lap: into the higher beam 1.3·ld, Δ 0.10 ≤ 15 cm and ≤ lap/5 → lapOk", rws.every((r) => Math.abs(r.lapLo - 1.3 * Math.max(r.ld, 0.3)) < 1e-9 && r.lapOk));
  const rBig = analyzeFrame(porch(-0.2)), rwB = levelJoints(porch(-0.2), rBig).filter((r) => r.needCut);
  ok("Δ 0.20 > 15 cm → lap not allowed: joint NG + warning", rwB.length > 0 && rwB.every((r) => !r.lapOk && !r.ok) && rBig.warnings.some((w) => w.includes("12.14.2.3")), rwB[0]?.mode); }
{ // walls on a lowered beam (user 2026-11-20 "ผนังลอยจากคาน"): an auto-height wall is taller by the drop → load × (h + Δ)/h; a typed height is kept
  const wl = (auto) => ({ a: [0, 0], b: [4, 0], kind: "brick", h: 3, hAuto: auto, open: 0, layers: 1 });
  const rA = analyzeFrame(porch(-0.1, {})), m0 = porch(); m0.floors[1].walls = [wl(true)]; const rW = analyzeFrame(m0);
  const m1 = model((f) => { f.walls = [wl(true)]; return f; }), rF = analyzeFrame(m1);
  const m2 = porch(); m2.floors[1].walls = [wl(false)]; const rT = analyzeFrame(m2);
  const qL = rW.floors[1].walls[0].q, qF = rF.floors[1].walls[0].q, qT = rT.floors[1].walls[0].q;
  ok("auto-height wall on the beam lowered 0.10: q = q(flat) × 3.10/3.00; typed height unchanged", Math.abs(qL - qF * 3.1 / 3) < 1e-6 && Math.abs(qT - qF) < 1e-6, `${qF.toFixed(1)} → ${qL.toFixed(1)} / typed ${qT.toFixed(1)}`); }
console.log(bad ? `levels-check: ${bad} FAIL` : "levels-check: all ok");
process.exit(bad ? 1 : 0);
