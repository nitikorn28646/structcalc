// Independent audit of the RC beam design (user 2026-11-04: "deep engineering audit — never trust the program's own functions").
// The program path is analyzeFloor → checkSpan → designSection (WSD, ว.ส.ท. / ACI 318 WSD). The checker below re-derives everything
// with its OWN code: bar table, layer fitting, a force-method continuous-beam solver on a fine mesh (any EI per span), live-load
// patterns, shear at d, cracked transformed-section stresses of the bars actually provided, deflection by double integration AND by
// moment-area, Branson's Ie, cut-off coverage along the beam. Nothing here imports a design or analysis function of the program.
// node cli/audit-beam.mjs [--case N] [--md out.md]
import fs from "fs";
import { analyzeFloor, vAtD } from "../web/engine/floor.js"; // the program (only to obtain its results)
import { designGroup, BEAM_COST } from "../web/engine/beamTypes.js"; // the program's automatic section + bar selection (to audit its choice)

// ---------- independent data (not the program's tables) ----------
const BAR = { "DB12": [1.131, 1.2], "DB16": [2.011, 1.6], "DB20": [3.142, 2.0], "DB25": [4.909, 2.5], "RB6": [0.283, 0.6], "RB9": [0.636, 0.9], "DB10": [0.785, 1.0] };
const pb = (s) => { const m = /^(\d+)-([A-Z]+)\s?(\d+)$/.exec((s ?? "").replace(/\s/g, "")); return m ? { n: +m[1], A: BAR[m[2] + m[3]][0], db: BAR[m[2] + m[3]][1] } : null; };
const MAT = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3, barClear: 3.5 };
const fcA = (m) => Math.min(0.45 * m.fcPrime, 65), fsA = (fy) => (fy >= 4000 ? 1700 : fy === 3000 ? 1500 : 1200), Ec = (m) => 15100 * Math.sqrt(m.fcPrime); // ksc
const nMod = (m) => m.Es / Ec(m);

import { forceMethod, doubleInt, momentArea } from "./indep-beam.mjs";

// ---------- independent section mechanics (WSD, transformed cracked section) ----------
// layers of one face: [{n, A, db}] per layer from the given bars, my own fitting: clear spacing max(barClear, db, 2.5)
function myLayers(b, st, groups, mat) {
  const ds = BAR[st.replace(/\s/g, "")][1], all = groups.filter(Boolean).flatMap((g) => Array.from({ length: g.n }, () => g)), dbMax = Math.max(...all.map((g) => g.db), 0);
  const s = Math.max(mat.barClear ?? 3.5, dbMax, 2.5), C = Math.max(2, Math.floor((b * 100 - 2 * mat.cover - 2 * ds + s) / (dbMax + s) + 1e-9));
  const lay = []; let i = 0; while (i < all.length) { lay.push(all.slice(i, i + C)); i += C; }
  return { lay, C, ds, s, fitAll: lay.every((l) => l.length <= C), clear: (n) => (b * 100 - 2 * mat.cover - 2 * ds - n * dbMax) / (n - 1) };
}
function faceProps(L, cover, ds) { let A = 0, Ay = 0, y = cover + ds; L.lay.forEach((l, k) => { const db = Math.max(...l.map((g) => g.db)); l.forEach((g) => { A += g.A; Ay += g.A * (y + g.db / 2); }); y += db + 2.5; }); return { A, c: A ? Ay / A : 0 }; }
// stresses of a cracked section under M (kg-m): tension As at depth d, compression As' at d' (2n−1 for As', ACI WSD)
function stresses(bcm, d, As, dp, Asp, M, n) {
  const a = bcm / 2, bb = (2 * n - 1) * Asp + n * As, c = -((2 * n - 1) * Asp * dp + n * As * d), kd = (-bb + Math.sqrt(bb * bb - 4 * a * c)) / (2 * a);
  const I = (bcm * kd ** 3) / 3 + (2 * n - 1) * Asp * (kd - dp) ** 2 + n * As * (d - kd) ** 2, Mc = M * 100;
  return { kd, I, fc: (Mc * kd) / I, fs: (n * Mc * (d - kd)) / I, fsp: (2 * n * Mc * Math.max(kd - dp, 0)) / I };
}
// allowable moment of the provided bars (singly, through bars only) — for cut-off coverage
const Mallow = (bcm, d, As, dp, Asp, n, fc, fs) => { const s = stresses(bcm, d, As, dp, Asp, 1000, n); return Math.min(fc / (s.fc / 1000), fs / (s.fs / 1000)); };

// ---------- the cases ----------
// span types: { b, h, top, bot, topX, botX, st, sSup, sMid }
const T = (b, h, top, bot, topX = "", botX = "", st = "RB9", sSup = 0.1, sMid = 0.15) => ({ b, h, top, bot, topX, botX, st: st.replace(/^([A-Z]+)(\d+)$/, "$1 $2"), sSup, sMid });
const cases = [];
const C = (name, o) => cases.push({ name, ...o });
// o: spans [L...], cant: { side: "end"|"start", L }, types: [type per span] (cantilever last), D: dead kg/m (extra, on all), Lv: live kg/m, P: [{at, P, g}]
C("1 ช่วงเดียว 4 ม.", { spans: [4], types: [T(0.2, 0.4, "2-DB12", "3-DB12")], D: 800, Lv: 400 });
C("2 ต่อเนื่อง 2 ช่วง 4+4", { spans: [4, 4], types: [T(0.2, 0.4, "2-DB12", "2-DB12", "2-DB12", "1-DB12"), T(0.2, 0.4, "2-DB12", "2-DB12", "2-DB12", "1-DB12")], D: 900, Lv: 500 });
C("3 ต่อเนื่อง 3 ช่วง 4+5+4", { spans: [4, 5, 4], types: Array(3).fill(T(0.2, 0.5, "2-DB16", "2-DB16", "2-DB16", "1-DB16")), D: 1200, Lv: 600 });
C("4 ช่วงสั้น 1.5 ม.", { spans: [1.5], types: [T(0.2, 0.4, "2-DB12", "2-DB12")], D: 2000, Lv: 1000 });
C("5 ช่วงยาว 8 ม.", { spans: [8], types: [T(0.3, 0.7, "2-DB16", "4-DB16", "", "2-DB16")], D: 1500, Lv: 800 });
C("6 คานลึก 2 ม. h 1.0", { spans: [2], types: [T(0.3, 1.0, "2-DB16", "3-DB16")], D: 6000, Lv: 3000 });
C("7 คานยื่น 1.5 ม. + ช่วงใน 4", { spans: [4], cant: { L: 1.5 }, types: [T(0.2, 0.5, "2-DB16", "2-DB16", "2-DB16"), T(0.2, 0.5, "2-DB16", "2-DB16", "2-DB16")], D: 900, Lv: 400, P: [{ at: 5.5, P: 600, g: "SP" }] });
C("8 คานรับผนัง 4.5 ม. (ผนัง 2.8 ม. × 180)", { spans: [4.5], types: [T(0.2, 0.5, "2-DB12", "3-DB12", "", "1-DB12")], D: 504 + 300, Lv: 300 });
C("9 คานรับพื้นสองด้าน (โหลดสูง)", { spans: [5], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "", "1-DB16")], D: 1800, Lv: 1000 });
C("10 คานรับพื้นด้านเดียว", { spans: [5], types: [T(0.2, 0.4, "2-DB12", "3-DB12")], D: 900, Lv: 500 });
C("11 Edge beam + พื้นยื่น 1.2 ม.", { spans: [4], types: [T(0.2, 0.5, "2-DB12", "3-DB12")], D: 300, Lv: 0, slab: { L: 1.2, t: 0.1, fin: 100, live: 200 } });
C("12 แรงบิดสูง (พื้นยื่น 1.8 ม.)", { spans: [4], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "", "", "RB9", 0.1, 0.1)], D: 300, Lv: 0, slab: { L: 1.8, t: 0.12, fin: 100, live: 300 } });
C("13 แรงจุดกลางช่วง 3 ตัน", { spans: [5], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "", "1-DB16")], D: 300, Lv: 0, P: [{ at: 2.5, P: 3000, g: "SP" }] });
C("14 แผ่สม่ำเสมอ ล้วน", { spans: [4.5], types: [T(0.2, 0.4, "2-DB12", "3-DB12")], D: 1000, Lv: 600 });
C("15 M+ สูง", { spans: [6], types: [T(0.25, 0.5, "2-DB16", "4-DB16", "", "2-DB16")], D: 1800, Lv: 900 });
C("16 M− สูง (ช่วงยาวติดช่วงสั้น)", { spans: [6, 2], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "3-DB16"), T(0.2, 0.5, "2-DB16", "3-DB16", "3-DB16")], D: 1500, Lv: 800 });
C("17 Doubly reinforced 20×40 ช่วง 5", { spans: [5], types: [T(0.2, 0.4, "3-DB16", "3-DB16", "", "3-DB16")], D: 1600, Lv: 800 });
C("18 เหล็กหลายชั้น 7-DB20 ใน 25", { spans: [6], types: [T(0.25, 0.6, "2-DB20", "3-DB20", "", "4-DB20")], D: 2600, Lv: 1200 });
C("19 แรงเฉือนสูงที่หัวเสา", { spans: [3], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "", "", "RB9", 0.1, 0.1)], D: 3500, Lv: 2000, P: [{ at: 0.3, P: 4000, g: "SP" }] });
C("20 ระยะแอ่นสูง ช่วง 7 h 0.5", { spans: [7], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "", "2-DB16")], D: 900, Lv: 500 });
C("21 หน้าตัดเปลี่ยน 20×40 | 20×60", { spans: [4, 6], types: [T(0.2, 0.4, "2-DB12", "2-DB12", "2-DB12"), T(0.2, 0.6, "2-DB16", "3-DB16", "2-DB16", "1-DB16")], D: 1000, Lv: 500 });
C("22 หลาย Element (แรงจุด 3 จุด)", { spans: [6], types: [T(0.2, 0.6, "2-DB16", "3-DB16", "", "1-DB16")], D: 400, Lv: 0, P: [{ at: 1.2, P: 1500, g: "SP" }, { at: 2.9, P: 2000, g: "SP" }, { at: 4.4, P: 1200, g: "SP" }] });
C("23 คานรองมารับ (แรงจุดจากคานซอย)", { spans: [5, 5], types: Array(2).fill(T(0.2, 0.6, "2-DB16", "3-DB16", "2-DB16", "1-DB16")), D: 800, Lv: 300, P: [{ at: 2.5, P: 4500, g: "SP" }] });
C("24 แรงเยื้องศูนย์ (พื้นยื่น 0.8 ม. ด้านเดียว)", { spans: [4], types: [T(0.2, 0.5, "2-DB12", "3-DB12")], D: 500, Lv: 200, slab: { L: 0.8, t: 0.1, fin: 50, live: 200 } });
C("25 ความกว้างจำกัด b 0.15", { spans: [4], types: [T(0.15, 0.4, "2-DB12", "3-DB12", "", "", "RB6", 0.15, 0.2)], D: 600, Lv: 300 });
C("26 ความลึกจำกัด h 0.30 (GB)", { spans: [4], types: [T(0.2, 0.3, "2-DB12", "2-DB12", "", "1-DB12", "RB6", 0.15, 0.2)], D: 700, Lv: 300 });
C("27 เหล็กแน่น 8-DB20 ใน b 0.20", { spans: [5], types: [T(0.2, 0.5, "2-DB20", "4-DB20", "", "4-DB20")], D: 2500, Lv: 1200 });
C("28 doubly ตื้น h 0.25 (k < d'/d)", { spans: [4], types: [T(0.2, 0.25, "2-DB12", "3-DB12", "", "", "RB6", 0.1, 0.1)], D: 900, Lv: 400 });
C("29 เหล็กขั้นต่ำ (โหลดเบา)", { spans: [4], types: [T(0.2, 0.5, "2-DB12", "2-DB12", "", "", "RB6", 0.2, 0.2)], D: 150, Lv: 0 });
C("30 เหล็กสูงสุด / หน้าตัดเกินกำลัง", { spans: [6], types: [T(0.2, 0.4, "3-DB20", "3-DB20", "", "2-DB20")], D: 3000, Lv: 1500 });
C("31 ต่อเนื่อง EI ต่างกัน 3 ช่วง", { spans: [3, 6, 3], types: [T(0.2, 0.4, "2-DB12", "2-DB12", "2-DB12"), T(0.3, 0.7, "2-DB16", "3-DB16", "3-DB16", "2-DB16"), T(0.2, 0.4, "2-DB12", "2-DB12", "2-DB12")], D: 1200, Lv: 600 });
C("32 คานยื่นต่อคานหลัก 2 ช่วง + ยื่น 2 ม.", { spans: [4, 4], cant: { L: 2 }, types: [T(0.2, 0.5, "2-DB16", "2-DB16", "2-DB16"), T(0.2, 0.5, "2-DB16", "2-DB16", "3-DB16"), T(0.2, 0.5, "2-DB16", "2-DB16", "3-DB16")], D: 900, Lv: 400, P: [{ at: 10, P: 800, g: "SP" }] });

C("33 GB 20×20 doubly (d'/d > k)", { spans: [3], types: [T(0.2, 0.2, "2-DB12", "4-DB12", "", "", "RB6", 0.075, 0.075)], D: 330, Lv: 100 });
C("34 V ระหว่าง Vc/2 กับ Vc, s > d/2", { spans: [4], types: [T(0.2, 0.3, "2-DB12", "3-DB12", "", "1-DB12", "RB6", 0.2, 0.2)], D: 500, Lv: 300 });
C("35 ชั้นที่ 3 ล้น 7-DB20 ใน b 0.20", { spans: [6], types: [T(0.2, 0.6, "2-DB20", "2-DB20", "", "5-DB20")], D: 1500, Lv: 800 });
C("36 M− ยาวเกิน L/4 (ช่วง 1.5 ติด 5 ม.)", { spans: [5, 1.5], types: [T(0.2, 0.5, "2-DB16", "3-DB16", "3-DB16"), T(0.2, 0.5, "2-DB16", "3-DB16", "3-DB16")], D: 1100, Lv: 500 });
C("37 ชั้นที่ 3 ล้น 8-DB20 ใน 20×70 (singly)", { spans: [5], types: [T(0.2, 0.7, "2-DB20", "2-DB20", "", "6-DB20")], D: 700, Lv: 400 });

// ---------- run ----------
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; }, only = arg("--case") ? +arg("--case") : 0;
const rows = [], findings = [];
const F = (sev, cs, text) => findings.push({ sev, cs, text });
const buildFloor = (cs, xs, Ltot, seg) => { const floor = { name: "audit", h: 3, t: 0, finish: 0, live: 0, panels: {}, walls: [], cants: [], stairs: [],
    columns: xs.map((x) => [x, 0]), beams: seg.map(([a, b, i]) => ({ a: [a, 0], b: [b, 0], type: i })),
    lineLoads: [{ a: [0, 0], b: [Ltot, 0], q: cs.D, g: "SDL", name: "D" }, ...(cs.Lv ? [{ a: [0, 0], b: [Ltot, 0], q: cs.Lv, g: "LL", name: "L" }] : [])],
    pointLoads: (cs.P ?? []).map((p) => ({ p: [p.at, 0], P: p.P, g: p.g })) };
  if (cs.slab) floor.cants.push({ a: [0, 0], b: [xs.at(-1), 0], L: cs.slab.L, side: -1, t: cs.slab.t, finish: cs.slab.fin, live: cs.slab.live });
  return floor; };
// automatic choice: the program's designGroup per span, re-analysed with the chosen types until they settle (self weight / EI)
function autoTypes(cs, mat) {
  const xs = [0]; cs.spans.forEach((L) => xs.push(xs.at(-1) + L)); const Ltot = xs.at(-1) + (cs.cant?.L ?? 0);
  const seg = [...cs.spans.map((L, i) => [xs[i], xs[i + 1], i]), ...(cs.cant ? [[xs.at(-1), Ltot, cs.spans.length]] : [])];
  let types = cs.types.map((t, i) => ({ name: `T${i + 1}`, ...t }));
  for (let it = 0; it < 4; it++) {
    const an = analyzeFloor(buildFloor(cs, xs, Ltot, seg), types, mat); let changed = false;
    types = seg.map(([a, b, i]) => { const sp = an.spans.find((x) => Math.abs(x.x0 - a) < 1e-6 && Math.abs(x.x1 - b) < 1e-6); const d = sp && designGroup([sp], mat, BEAM_COST);
      if (!d) return { ...types[i], name: `A${i + 1}`, none: true }; const t = { ...d.t, name: `A${i + 1}`, st: d.t.st }; if (JSON.stringify(t) !== JSON.stringify({ ...types[i], name: t.name })) changed = true; return t; });
    if (!changed) break;
  }
  return types;
}
const runs = cases.flatMap((cs, ci) => [{ ci, cs, mode: "given" }, { ci, cs, mode: "auto" }]);
for (const { ci, cs: cs0, mode } of runs) {
  if (only && only !== ci + 1) continue;
  const mat = { ...MAT, ...(cs0.mat ?? {}) };
  let cs = cs0;
  if (mode === "auto") { const at = autoTypes(cs0, mat); if (at.some((t) => t.none)) { F("INFO", cs0.name, "auto: no section within the limits passes (span flagged by the program)"); }
    cs = { ...cs0, name: `${cs0.name} [อัตโนมัติ]`, types: at.map((t) => T(t.b, t.h, t.top, t.bot, t.topX ?? "", t.botX ?? "", (t.st ?? "RB 6").replace(" ", ""), t.sSup, t.sMid)), auto: true }; }
  // geometry along x: supports at the span ends, optional cantilever at the end
  const xs = [0]; cs.spans.forEach((L) => xs.push(xs.at(-1) + L)); const Ltot = xs.at(-1) + (cs.cant?.L ?? 0);
  const types = cs.types.map((t, i) => ({ name: `T${i + 1}`, ...t }));
  const seg = [...cs.spans.map((L, i) => [xs[i], xs[i + 1], i]), ...(cs.cant ? [[xs.at(-1), Ltot, cs.spans.length]] : [])];
  const floor = buildFloor(cs, xs, Ltot, seg);
  let an;
  try { an = analyzeFloor(floor, types, mat); } catch (e) { F("CRITICAL", cs.name, `program threw ${e.message}`); continue; }
  // torque: the program takes cantilever slabs as line load + torsion; emulate a pure torque by a tiny cantilever slab is not exact —
  // instead read the torsion the program put on the beam and compare with the independent value only when the case asks
  const spans = an.spans;
  // ---- independent analysis: self weight + D (dead), Lv (live, patterned), points (dead)
  const EIat = (x) => { const s = seg.find(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9) ?? seg.at(-1), t = types[s[2]]; return Ec(mat) * 1e4 * 0.5 * (t.b * t.h ** 3) / 12; }; // kg-m², 0.5 Ig (as the program's stated model)
  const sw = seg.map(([a, b, i]) => ({ a, b, w: 2400 * types[i].b * types[i].h }));
  const sl = cs.slab, slabD = sl ? (2400 * sl.t + sl.fin) * sl.L : 0, slabL = sl ? sl.live * sl.L : 0, Lsl = sl ? xs.at(-1) : 0;
  const deadL = [...sw, { a: 0, b: Ltot, w: cs.D }, ...(sl ? [{ a: 0, b: Lsl, w: slabD }] : []), ...(cs.P ?? []).map((p) => ({ at: p.at, P: p.P }))];
  const liveW = (a, b) => [...(cs.Lv ? [{ a, b, w: cs.Lv }] : []), ...(sl && a < Lsl ? [{ a, b: Math.min(b, Lsl), w: slabL }] : [])];
  const fmD = forceMethod(Ltot, xs, EIat, deadL);
  const liveBy = seg.map(([a, b]) => (liveW(a, b).length ? forceMethod(Ltot, xs, EIat, liveW(a, b)) : null)).filter(Boolean);
  const fmLall = liveW(0, Ltot).length ? forceMethod(Ltot, xs, EIat, liveW(0, Ltot)) : null;
  const N = fmD.X.length - 1, h = fmD.h;
  const Mmax = fmD.M.map((m, k) => m + liveBy.reduce((s, f) => s + Math.max(0, f.M[k]), 0)), Mmin = fmD.M.map((m, k) => m + liveBy.reduce((s, f) => s + Math.min(0, f.M[k]), 0));
  const Vof = (M) => M.map((_, k) => (k < N ? (M[k + 1] - M[k]) / h : (M[k] - M[k - 1]) / h));
  const VD = Vof(fmD.M), VLs = liveBy.map((f) => Vof(f.M)), Vabs = VD.map((v, k) => Math.max(Math.abs(v + VLs.reduce((s, x) => s + Math.max(0, x[k]), 0)), Math.abs(v + VLs.reduce((s, x) => s + Math.min(0, x[k]), 0))));
  // deflections: dead (×3) + live, both by double integration and moment-area (between supports), 0.5 Ig
  // Branson (independent, ACI 318-11 9.5.2.3/9.5.2.4/9.5.2.5): Ie per span from my own cracked section (n·As, (n−1)·As′), Ma of D and of
  // D + L, continuous spans = average of the mid-span and continuous-end values, live = (D + L) − D, λ = 2/(1 + 50ρ′)
  const nB = nMod(mat), fcB = mat.fcPrime;
  const secB = (t, face) => { const tg = face === "pos" ? [pb(t.bot), pb(t.botX)] : [pb(t.top), pb(t.topX)], cg = face === "pos" ? [pb(t.top)] : [pb(t.bot)];
    const LT = myLayers(t.b, t.st, tg, mat), LC = myLayers(t.b, t.st, cg, mat), T0 = faceProps(LT, mat.cover, LT.ds), C0 = faceProps(LC, mat.cover, LC.ds), b = t.b * 100, hh = t.h * 100, d = hh - T0.c, dp = C0.c;
    const a2 = b / 2, b2 = nB * T0.A + (nB - 1) * C0.A, c2 = -(nB * T0.A * d + (nB - 1) * C0.A * dp), kd = (-b2 + Math.sqrt(b2 * b2 - 4 * a2 * c2)) / (2 * a2);
    return { Ig: (b * hh ** 3) / 12, Icr: (b * kd ** 3) / 3 + nB * T0.A * (d - kd) ** 2 + (nB - 1) * C0.A * Math.max(0, kd - dp) ** 2, Mcr: (2 * Math.sqrt(fcB) * (b * hh ** 3) / 12) / (hh / 2) / 100, rho: C0.A / (b * d) }; };
  const IeB = (S, Ma) => (Ma <= S.Mcr ? S.Ig : Math.max(S.Icr, (S.Mcr / Ma) ** 3 * S.Ig + (1 - (S.Mcr / Ma) ** 3) * S.Icr));
  const spanIeB = (fm) => seg.map(([a, b, i]) => { const t = types[i], k0 = Math.round(a / fm.h), k1 = Math.round(b / fm.h), Ms = fm.M.slice(k0, k1 + 1), P = secB(t, "pos"), N = secB(t, "neg");
    const cantS = !xs.some((x) => Math.abs(x - a) < 1e-6) || !xs.some((x) => Math.abs(x - b) < 1e-6); if (cantS) return { Ie: IeB(N, Math.max(0, ...Ms.map((m) => -m))), rho: N.rho };
    const negs = [Ms[0], Ms.at(-1)].map((m) => -m).filter((m) => m > 1), IeP = IeB(P, Math.max(0, ...Ms));
    return { Ie: negs.length && cs.spans.length > 1 ? (IeP + negs.reduce((s2, m) => s2 + IeB(N, m), 0) / negs.length) / 2 : IeP, rho: P.rho }; });
  const fmDL0 = forceMethod(Ltot, xs, EIat, [...deadL, ...liveW(0, Ltot).map((l) => l)]), IeD = spanIeB(fmD), IeDL = spanIeB(fmDL0);
  const EIofB = (arr) => (x) => { const k = seg.findIndex(([a, b]) => x >= a - 1e-9 && x <= b + 1e-9); return Ec(mat) * 1e4 * arr[Math.max(0, k)].Ie / 1e8; };
  const fmDb = forceMethod(Ltot, xs, EIofB(IeD), deadL), fmDLb = forceMethod(Ltot, xs, EIofB(IeDL), [...deadL, ...liveW(0, Ltot)]), vDb = doubleInt(fmDb, xs), vDLb = doubleInt(fmDLb, xs);
  const vD = doubleInt(fmD, xs), vL = fmLall ? doubleInt(fmLall, xs) : vD.map(() => 0);
  for (const sp of spans) {
    const si = seg.findIndex(([a, b]) => Math.abs(a - sp.x0) < 1e-6 && Math.abs(b - sp.x1) < 1e-6), t = types[seg[si]?.[2] ?? 0], cant = sp.kind === "cantilever";
    const k0 = Math.round(sp.x0 / h), k1 = Math.round(sp.x1 / h), rng = (arr) => arr.slice(k0, k1 + 1);
    const myMpos = Math.max(0, ...rng(Mmax)), myMneg = Math.max(0, -Math.min(0, ...(cant ? rng(Mmin) : [Mmin[k0], Mmin[k1], Mmin[k0 + 1], Mmin[k1 - 1]])));
    // shear at d from a column face (= centre line here) where no point load is within d
    const d0 = t.h - (mat.cover + 1.5) / 100, nearP = (x) => (cs.P ?? []).some((p) => Math.abs(p.at - x) < d0 + 1e-9 && Math.abs(p.at - x) > 1e-9);
    let a0 = !cant && !nearP(sp.x0) ? d0 : 0, a1 = !cant && !nearP(sp.x1) ? d0 : 0;
    if (a0 + a1 >= sp.len - 1e-6) { a0 = 0; a1 = 0; } // span shorter than 2d: the largest shear (as the code's deep-beam rule)
    const kv0 = Math.round((sp.x0 + a0) / h), kv1 = Math.round((sp.x1 - a1) / h), myV = Math.max(...Vabs.slice(cant ? k0 : kv0, (cant ? k1 : kv1) + 1).slice(0, -1).concat(Vabs[cant ? k0 : kv0]));
    const myVmax = Math.max(...Vabs.slice(k0, k1));
    // deflection: double integration and moment-area (mid of the span), program's δ total = 3 δD + δL
    const si2 = seg.findIndex(([a, b]) => Math.abs(a - sp.x0) < 1e-6 && Math.abs(b - sp.x1) < 1e-6), lamB = 2 / (1 + 50 * IeD[Math.max(0, si2)].rho);
    const dDb = Math.max(...rng(vDb).map(Math.abs)), dLb = Math.max(...rng(vDLb).map((v, i) => Math.abs(v - rng(vDb)[i]))), dBr = dDb + lamB * dDb + dLb;
    const dInt0 = cant ? Math.abs(vD[k1 === Math.round(Ltot / h) ? k1 : k0]) * 3 + Math.abs(vL[k1]) : Math.max(...rng(vD).map((v, i) => 3 * v + (rng(vL)[i] ?? 0)));
    const dInt = dBr; void dInt0;
    const dMA = cant ? null : 3 * momentArea(fmD, sp.x0, sp.x1, (sp.x0 + sp.x1) / 2) + (fmLall ? momentArea(fmLall, sp.x0, sp.x1, (sp.x0 + sp.x1) / 2) : 0);
    const pD = sp.defl?.dT ?? NaN;
    // section with the program's bar layout rules re-done independently
    const top = pb(t.top), bot = pb(t.bot), topX = pb(t.topX), botX = pb(t.botX), n = nMod(mat), fc = fcA(mat), fs = fsA(mat.fy), bcm = t.b * 100;
    const Lbot = myLayers(t.b, t.st, [bot, botX], mat), Ltop = myLayers(t.b, t.st, [top, topX], mat), LtopT = myLayers(t.b, t.st, [top], mat), LbotT = myLayers(t.b, t.st, [bot], mat);
    const pBot = faceProps(Lbot, mat.cover, Lbot.ds), pTop = faceProps(Ltop, mat.cover, Ltop.ds), pTopT = faceProps(LtopT, mat.cover, LtopT.ds), pBotT = faceProps(LbotT, mat.cover, LbotT.ds);
    const hcm = t.h * 100, dMid = hcm - pBot.c, dSup = hcm - pTop.c;
    // required steel (WSD) — independent: k, j, R from fc, fs, n; doubly with fs' = 2fs(k−d'/d)/(1−k) ≤ fs
    const req = (M, d, dp) => { const k = (n * fc) / (n * fc + fs), j = 1 - k / 3, R = 0.5 * fc * k * j, Mc = (R * bcm * d * d) / 100;
      if (M <= Mc) return { As: (M * 100) / (fs * j * d), Asp: 0, k, Mc, singly: true };
      const fsp = Math.min(fs, (2 * fs * (k - dp / d)) / (1 - k)); return { As: (Mc * 100) / (fs * j * d) + ((M - Mc) * 100) / (fs * (d - dp)), Asp: fsp > 0 ? ((M - Mc) * 100) / (fsp * (d - dp)) : Infinity, k, Mc, singly: false, fsp }; };
    const rM0 = cant ? null : req(myMpos, dMid, pTopT.c), rS0 = myMneg > 1 ? req(myMneg, dSup, pBotT.c) : null;
    // torsion (independent: equilibrium torque of the cantilever slab m = w·Lc²/2 per metre, T at the support = m·L/2 (simple), thin tube:
    // At/s (one leg) = T/(2·A0·fv), A0 = 0.85·Aoh, Aoh to the stirrup centre line; longitudinal Al = (At/s)·ph, half to each face)
    const wsl = sl ? 2400 * sl.t + sl.fin + sl.live : 0, myT = sl && !cant ? (wsl * sl.L ** 2) / 2 * sp.len / 2 : 0;
    const dsT = BAR[t.st.replace(/\s/g, "")][1], xo = t.b * 100 - 2 * mat.cover - dsT, yo = t.h * 100 - 2 * mat.cover - dsT, A0 = 0.85 * xo * yo, ph = 2 * (xo + yo), fvT = fsA(mat.fys);
    const At1 = myT > 0 ? (myT * 100) / (2 * A0 * fvT) : 0, Al = At1 * ph;
    const rM = rM0 && { ...rM0, As: rM0.As + Al / 2, Asp: rM0.Asp + Al / 2 }, rS = rS0 && { ...rS0, As: rS0.As + Al / 2 };
    // actual stresses of the provided bars
    const stM = cant ? null : stresses(bcm, dMid, pBot.A, pTopT.c, pTopT.A, myMpos, n), stS = rS ? stresses(bcm, dSup, pTop.A, pBotT.c, pBotT.A, myMneg, n) : null;
    // shear (WSD): vc = 0.29√f'c; V' = V − Vc; Av fv d / s ≥ V' ; s ≤ d/2 (d/4 if V' > 0.795√f'c bd); Av ≥ 0.0015 b s where stirrups needed (V > Vc/2, ACI 318-71+)
    const stA = 2 * BAR[t.st.replace(/\s/g, "")][0], fv = fsA(mat.fys), Vc = 0.29 * Math.sqrt(mat.fcPrime) * bcm * dSup, Vp = Math.max(0, myV - Vc);
    const AvS = Vp / (fv * dSup) + 2 * At1, sReq = AvS > 0 ? stA / AvS / 100 : Infinity, sLim = Math.min((Vp > 0.795 * Math.sqrt(mat.fcPrime) * bcm * dSup ? dSup / 4 : dSup / 2) / 100, 0.6), sMinA = (stA / (0.0015 * bcm)) / 100;
    const sUsed = t.sSup, shearOk = sUsed <= sReq + 1e-9 && (myV <= Vc / 2 || (sUsed <= sLim + 1e-9 && sUsed <= sMinA + 1e-9)) && Vp <= 1.32 * Math.sqrt(mat.fcPrime) * bcm * dSup;
    // cut-off coverage: extra top bars only over L/4 at each support → beyond L/4, M− ≤ allowable of the through top bars; extra
    // bottom bars over the middle 3L/5 → in the end fifths M+ ≤ allowable of the through bottom bars
    let cutTop = null, cutBot = null;
    if (!cant) { const L = sp.len, full = !!sp.topFull, MaT = Mallow(bcm, hcm - pTopT.c, pTopT.A, pBotT.c, pBotT.A, n, fc, fs), MaB = Mallow(bcm, hcm - pBotT.c, pBotT.A, pTopT.c, pTopT.A, n, fc, fs);
      for (let k = k0; k <= k1; k++) { const x = k * h - sp.x0; const tl = sp.cut?.top?.[0]?.len ?? L / 4, tr = sp.cut?.top?.[1]?.len ?? L / 4, b0 = sp.cut?.bot?.start ?? L / 5, b1 = sp.cut?.bot?.end ?? (4 * L) / 5, bAll = sp.cut?.bot?.full || sp.cut?.bot?.notNeeded;
        if (topX && !full && !sp.cut?.topFull && x > tl + 1e-9 && x < L - tr - 1e-9 && -Mmin[k] > MaT) cutTop = Math.max(cutTop ?? 0, -Mmin[k] / MaT);
        if (botX && !bAll && (x < b0 - 1e-9 || x > b1 + 1e-9) && Mmax[k] > MaB) cutBot = Math.max(cutBot ?? 0, Mmax[k] / MaB); } }
    // Branson Ie (independent, ACI 9.5.2.3): Mcr = fr·Ig/yt, fr = 2√f'c (ksc), Ie = (Mcr/Ma)³Ig + (1−(Mcr/Ma)³)Icr ≥ Icr
    const Ig = (bcm * hcm ** 3) / 12, Mcr = (2 * Math.sqrt(mat.fcPrime) * Ig) / (hcm / 2) / 100, Ma = cant ? myMneg : Math.max(myMpos, 1), stCr = cant ? stS : stM;
    const Icr = stCr?.I ?? Ig, Ie = Math.max(Icr, Math.min(Ig, (Mcr / Ma) ** 3 * Ig + (1 - (Mcr / Ma) ** 3) * Icr)), bransonRatio = (0.5 * Ig) / Ie; // > 1 → the program's 0.5 Ig deflection is low by this factor
    // allowable moment of the full provided section (the WSD counterpart of φMn) and shear capacity Vc + Av·fv·d/s (WSD counterpart of φVn)
    const MaMid = cant ? null : Mallow(bcm, dMid, pBot.A, pTopT.c, pTopT.A, n, fc, fs), MaSup = rS ? Mallow(bcm, dSup, pTop.A, pBotT.c, pBotT.A, n, fc, fs) : null;
    const Vcap = Vc + (stA * fv * dSup) / (sUsed * 100) - 2 * At1 * 0, VcapT = myT > 0 ? null : null;
    const indepOk = (!stM || (stM.fc <= fc * 1.02 && stM.fs <= fs * 1.02)) && (!stS || (stS.fc <= fc * 1.02 && stS.fs <= fs * 1.02)) && shearOk && !(rM && !rM.singly && !(rM.fsp > 0));
    // program values
    const c = sp.check ?? {}, pm = c.mid, ps = c.sup;
    const row = { case: cs.name, span: sp.id, kind: sp.kind, sec: `${t.b * 100}×${t.h * 100}`, Mpos: [sp.Mpos, myMpos], Mneg: [sp.Mneg, myMneg], V: [sp.V, myV], Vmax: myVmax, Mt: sp.Mt ?? 0,
      AsReq: [pm?.reqBot ?? ps?.reqBot, rM?.As ?? rS?.As], AsProv: [pm?.provBot ?? ps?.provBot, pBot.A], d: [pm?.d ?? ps?.d, cant ? dSup : dMid], defl: [pD, dInt, dMA], branson: bransonRatio,
      fcAct: stM ? stM.fc : stS?.fc, fsAct: stM ? stM.fs : stS?.fs, fcS: stS?.fc, fsS: stS?.fs, ok: sp.ok, indepOk, MaMid, MaSup, Vcap, dMidI: dMid, dSupI: dSup, shearOk, sReq, sLim, sUsed, Vc, sMinA, Vp, myT, At1, Al, A0, ph, pAtS: (ps ?? pm)?.AtS, pAst: (ps ?? pm)?.Ast, pMt: c.MtUse, pVd: vAtD(sp, t.h, mat), rM, rS, stM, stS, n, fc, fs, fv, k: rM0?.k ?? rS0?.k, dpM: pTopT.c, dpS: pBotT.c, Ig, Icr, Ie, Mcr, Ma, topFull: !!sp.topFull, pm, ps, t, L: sp.len, reasons: [], cutTop, cutBot, fit: [Lbot.lay.length, Lbot.lay.map((l) => l.length).join("+"), Lbot.C, Lbot.lay.every((l) => l.length <= Lbot.C) && Lbot.lay.length <= 3] };
    rows.push(row);
    const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1);
    if (rel(sp.Mpos, myMpos) > 0.01 && Math.abs(sp.Mpos - myMpos) > 10) F("HIGH", `${cs.name} ${sp.id}`, `M+ program ${sp.Mpos.toFixed(0)} vs independent ${myMpos.toFixed(0)} kg-m`);
    if (rel(sp.Mneg, myMneg) > 0.01 && Math.abs(sp.Mneg - myMneg) > 10) F(sp.Mneg < myMneg ? "HIGH" : "LOW", `${cs.name} ${sp.id}`, `M− program ${sp.Mneg.toFixed(0)} vs independent ${myMneg.toFixed(0)} kg-m`);
    { const pv = vAtD(sp, t.h, mat); if (pv < myV * 0.995 - 5) F("MEDIUM", `${cs.name} ${sp.id}`, `V at d program ${pv.toFixed(0)} < independent ${myV.toFixed(0)} kg (${((1 - pv / myV) * 100).toFixed(1)} % low)`); }
    if (Number.isFinite(pD) && pD < dInt * 0.98 - 1e-4) F("HIGH", `${cs.name} ${sp.id}`, `deflection program ${(pD * 1000).toFixed(2)} mm < double integration ${(dInt * 1000).toFixed(2)} mm`);
    if (dMA != null && Math.abs(dMA - Math.max(...rng(vD).map((v, i) => 3 * v + (rng(vL)[i] ?? 0)))) > 0.03 * Math.abs(dMA) + 1e-4 && sp.kind !== "cantilever") { /* mid vs max: info only */ }
    if (row.AsReq[0] != null && typeof row.AsReq[0] === "number" && row.AsReq[1] != null && Number.isFinite(row.AsReq[1]) && rel(row.AsReq[0], row.AsReq[1]) > 0.03 && Math.abs(row.AsReq[0] - row.AsReq[1]) > 0.1) F("MEDIUM", `${cs.name} ${sp.id}`, `As req program ${row.AsReq[0].toFixed(2)} vs independent ${row.AsReq[1].toFixed(2)} cm²`);
    if (sp.ok && stM && (stM.fc > fc * 1.05 || stM.fs > fs * 1.03)) F("HIGH", `${cs.name} ${sp.id}`, `passes, but the provided bars at mid-span give fc ${stM.fc.toFixed(1)} (allow ${fc}) / fs ${stM.fs.toFixed(0)} (allow ${fs}) ksc`);
    if (sp.ok && stS && (stS.fc > fc * 1.05 || stS.fs > fs * 1.03)) F("HIGH", `${cs.name} ${sp.id}`, `passes, but the provided bars at the support give fc ${stS.fc.toFixed(1)} (allow ${fc}) / fs ${stS.fs.toFixed(0)} (allow ${fs}) ksc`);
    if (sp.ok && !shearOk) F("HIGH", `${cs.name} ${sp.id}`, `passes, shear independent NG: V ${myV.toFixed(0)}, Vc ${Vc.toFixed(0)}, s used ${sUsed}, s req ${Number.isFinite(sReq) ? sReq.toFixed(3) : "∞"}, s limit ${sLim.toFixed(3)}, s(Av,min) ${sMinA.toFixed(3)}`);
    if (sp.ok && cutTop) F("HIGH", `${cs.name} ${sp.id}`, `extra top bars stop at L/4 but M− beyond is ${cutTop.toFixed(2)}× the allowable of the through top bars`);
    if (sp.ok && cutBot) F("HIGH", `${cs.name} ${sp.id}`, `extra bottom bars stop at L/5 but M+ there is ${cutBot.toFixed(2)}× the allowable of the through bottom bars`);
    if (sp.ok && !row.fit[3]) F("HIGH", `${cs.name} ${sp.id}`, `passes, but the bars do not fit: ${row.fit[1]} per layer, max ${row.fit[2]} per layer`);
    if (sp.ok && sp.defl && sp.defl.dT * bransonRatio > sp.defl.limT) F("HIGH", `${cs.name} ${sp.id}`, `passes with 0.5·Ig (${(sp.defl.dT * 1000).toFixed(1)} mm), Branson Ie gives ${(sp.defl.dT * bransonRatio * 1000).toFixed(1)} mm > limit ${(sp.defl.limT * 1000).toFixed(1)} mm`);
    else if (bransonRatio > 1.15 && sp.defl && sp.defl.dT > 0.5 * sp.defl.limT) F("MEDIUM", `${cs.name} ${sp.id}`, `0.5·Ig is ${bransonRatio.toFixed(2)}× stiffer than Branson Ie (Ma ${Ma.toFixed(0)}, Mcr ${Mcr.toFixed(0)}) — deflection would be ${((sp.defl.dT * bransonRatio) * 1000).toFixed(1)} mm vs limit ${(sp.defl.limT * 1000).toFixed(1)}`);
    if (rM && !rM.singly && !(rM.fsp > 0)) F(sp.ok ? "CRITICAL" : "HIGH", `${cs.name} ${sp.id}`, `doubly reinforced with k ${rM.k.toFixed(3)} < d'/d: compression bars in the tension zone (fs' ≤ 0) — program ${pm?.doublyCheck} AsPrime ${pm?.AsPrime?.toFixed?.(2)} reqTop ${pm?.reqTop?.toFixed?.(2)} → ${sp.ok ? "PASSES" : "fails"}`);
  }
}
// ---------- report ----------
const f1 = (v, k = 0) => (v == null || !Number.isFinite(v) ? "-" : v.toFixed(k));
console.log("case | span | kind | section | M+ prog/indep | M− prog/indep | V prog/indep | As req prog/indep | As prov | δ prog/2∫/M-A mm | Branson× | ok | shear indep");
for (const r of rows) console.log([r.case, r.span, r.kind, r.sec, `${f1(r.Mpos[0])}/${f1(r.Mpos[1])}`, `${f1(r.Mneg[0])}/${f1(r.Mneg[1])}`, `${f1(r.V[0])}/${f1(r.V[1])}`, `${f1(typeof r.AsReq[0] === "number" ? r.AsReq[0] : NaN, 2)}/${f1(r.AsReq[1], 2)}`, f1(r.AsProv[1], 2),
  `${f1(r.defl[0] * 1000, 2)}/${f1(r.defl[1] * 1000, 2)}/${f1(r.defl[2] != null ? r.defl[2] * 1000 : NaN, 2)}`, f1(r.branson, 2), r.ok ? "ผ่าน" : "ไม่ผ่าน", r.shearOk ? "ok" : "NG"].join(" | "));
console.log(`\n${findings.length} findings`);
for (const x of findings) console.log(`${x.sev.padEnd(8)} ${x.cs}: ${x.text}`);
if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify({ rows, findings }, null, 1));
