// Independent audit of the tied-column design (user 2026-11-05) — READ ONLY. Program path: frame.js checkColumn → column.js tiedColumn
// (WSD, ACI 318-63 / ว.ส.ท.). The checker re-derives everything with its own code:
//  (A) WSD per ACI 318-63 with the real bar positions: Pa = 0.85·Ag(0.25f′c + fs·pg) (fs = 0.4fy ≤ 2,100), Fa = 0.34(1 + pg·m)f′c,
//      Fb = 0.45f′c, transformed I with (2n − 1)·As at the real bar rows, eb = (0.67·pg·m + 0.17)·d, compression: fa/Fa + fbx/Fb + fby/Fb ≤ 1,
//      tension: M ≤ Mo + (Mb − Mo)·P/Pb, minimum eccentricity 0.1t about EACH axis (not only x), slenderness with r = 0.3t of the bending
//      direction, braced R = 1.32 − 0.006·h′/r ≤ 1 and unbraced R = 1.07 − 0.008·h′/r ≤ 1 (318-63 §915–916), ties ≤ min(16db, 48dt, b),
//      bar clear spacing ≥ max(1.5db, 4 cm) (§804), 1 % ≤ pg ≤ 8 %.
//  (B) ultimate strength by strain compatibility (εcu 0.003, rectangular block 0.85f′c·β1c, steel elastic-plastic), biaxial by Bresler
//      1/Pn = 1/Pnx + 1/Pny − 1/Po, φ = 0.65, Pn,max = 0.8·Po (ACI 318-11 10.3.6) — compared with the service load × 1.55 (≈ 1.4D + 1.7L).
// node cli/audit-column.mjs [--json out.json]
import fs from "fs";
import { checkColumn } from "../web/engine/frame.js";

const BAR = { "DB 12": [1.131, 1.2], "DB 16": [2.011, 1.6], "DB 20": [3.142, 2.0], "DB 25": [4.909, 2.5], "RB 6": [0.283, 0.6], "RB 9": [0.636, 0.9] };
const MAT = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
// own bar layout: n bars around a rectangle Bx × By (cm), 4 corners + the rest on the faces in proportion to the face lengths
function layout(Bx, By, n, bar, tie, cover) {
  const db = BAR[bar][1], dt = BAR[tie][1], dp = cover + dt + db / 2, xs = Bx / 2 - dp, ys = By / 2 - dp, extra = n - 4;
  const ex = Math.round((extra * Bx) / (Bx + By) / 2) * 2, ey = extra - ex; // extra bars on the two x-faces (top/bottom, along x) and y-faces
  const pts = [[-xs, -ys], [xs, -ys], [xs, ys], [-xs, ys]];
  for (let i = 1; i <= ex / 2; i++) { const x = -xs + (2 * xs * i) / (ex / 2 + 1); pts.push([x, -ys], [x, ys]); }
  for (let i = 1; i <= ey / 2; i++) { const y = -ys + (2 * ys * i) / (ey / 2 + 1); pts.push([-xs, y], [xs, y]); }
  const perFaceX = 2 + ex / 2, perFaceY = 2 + ey / 2, clearX = (2 * xs - (perFaceX - 1) * 0 - db * 0) / (perFaceX - 1) - db, clearY = (2 * ys) / (perFaceY - 1) - db;
  return { pts, dp, db, A: BAR[bar][0], clearX, clearY, perFaceX, perFaceY };
}
function wsd(inp) {
  const { Bx, By, n, bar, tie, s, P, Mx, My, L, mat } = inp, fcp = mat.fcPrime, fy = mat.fy, Lay = layout(Bx, By, n, bar, tie, mat.cover), Ag = Bx * By, Ast = n * Lay.A, pg = Ast / Ag;
  const fs = Math.min(0.4 * fy, 2100), Ec = 15100 * Math.sqrt(fcp), nn = mat.Es / Ec, m = fy / (0.85 * fcp), Fa = 0.34 * (1 + pg * m) * fcp, Fb = 0.45 * fcp;
  const Pa = 0.85 * Ag * (0.25 * fcp + fs * pg), Po = Fa * Ag;
  const Ix = (Bx * By ** 3) / 12 + (2 * nn - 1) * Lay.pts.reduce((t, [, y]) => t + Lay.A * y * y, 0), Iy = (By * Bx ** 3) / 12 + (2 * nn - 1) * Lay.pts.reduce((t, [x]) => t + Lay.A * x * x, 0);
  // minimum eccentricity 0.1t about each axis separately (two checks), the larger result governs
  const eminX = Math.max(2.5, 0.1 * By), eminY = Math.max(2.5, 0.1 * Bx);
  const cases = [{ Mx: Math.max(Mx, (P * eminX) / 100), My }, { Mx, My: Math.max(My, (P * eminY) / 100) }];
  // slenderness, r = 0.3t of the bending direction, h′ = L
  const hr = (t) => (L * 100) / (0.3 * t), Rb = (t) => Math.min(1, 1.32 - 0.006 * hr(t)), Ru = (t) => Math.min(1, 1.07 - 0.008 * hr(t));
  const Rbr = Math.min(Rb(Bx), Rb(By)), Run = Math.min(Ru(Bx), Ru(By));
  const res = (R) => cases.map((cq) => { const Pd = P / R, Mxd = cq.Mx / R, Myd = cq.My / R, fa = Pd / Ag, fbx = (Mxd * 100 * (By / 2)) / Ix, fby = (Myd * 100 * (Bx / 2)) / Iy;
    const dX = By - Lay.dp, dY = Bx - Lay.dp, ebX = (0.67 * pg * m + 0.17) * dX, ebY = (0.67 * pg * m + 0.17) * dY, ey = (Mxd * 100) / Pd, ex = (Myd * 100) / Pd;
    const comp = ey <= ebX && ex <= ebY, ratioC = fa / Fa + fbx / Fb + fby / Fb;
    const Asx = Lay.A * Lay.perFaceX, Asy = Lay.A * Lay.perFaceY, MoX = 0.4 * Asx * fy * (By - 2 * Lay.dp), MoY = 0.4 * Asy * fy * (Bx - 2 * Lay.dp);
    const PbX = 1 / (1 / Po + (ebX * (By / 2)) / (Ix * Fb)), PbY = 1 / (1 / Po + (ebY * (Bx / 2)) / (Iy * Fb)), MbX = PbX * ebX, MbY = PbY * ebY;
    const MaX = MoX + (MbX - MoX) * Math.min(1, Pd / PbX), MaY = MoY + (MbY - MoY) * Math.min(1, Pd / PbY), ratioT = (Mxd * 100) / MaX + (Myd * 100) / MaY;
    return { comp, util: Math.max(Pd / Pa, comp ? ratioC : ratioT), Pd, ratioC, ratioT }; });
  const sTie = Math.min(16 * Lay.db, 48 * BAR[tie][1], Math.min(Bx, By)), clear = Math.min(Lay.clearX, Lay.clearY), clearReq = Math.max(1.5 * Lay.db, 4);
  const br = res(Rbr), un = res(Run), utilB = Math.max(...br.map((x) => x.util)), utilU = Math.max(...un.map((x) => x.util));
  return { Ag, Ast, pg: pg * 100, Pa, Fa, Po, Ix, Iy, hrMax: Math.max(hr(Bx), hr(By)), Rbr, Run, utilB, utilU, sTie, sOk: s * 100 <= sTie + 1e-9, clear, clearReq, fitOk: clear >= clearReq - 1e-9, pgOk: pg * 100 >= 1 - 1e-9 && pg * 100 <= 8,
    okB: utilB <= 1.005 && s * 100 <= sTie + 1e-9 && pg * 100 >= 1 - 1e-9 && pg * 100 <= 8 && clear >= clearReq - 1e-9 && hr(Math.min(Bx, By)) <= 100, Lay };
}
// ultimate strength (independent physics): uniaxial Pn at eccentricity e by strain compatibility, biaxial Bresler
function Pn_e(b, h, bars, e, fcp, fy, Es) { // bending about the axis parallel to b, h = depth; bars [{y (from centre, + towards the compression face), A}]
  const b1 = fcp <= 280 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fcp - 280)) / 70), ecu = 0.003;
  const force = (c) => { const a = Math.min(b1 * c, h), Cc = 0.85 * fcp * b * a; let N = Cc, M = Cc * (h / 2 - a / 2);
    for (const s of bars) { const dist = h / 2 - s.y, eps = (ecu * (c - dist)) / c, fsv = Math.max(-fy, Math.min(fy, eps * Es)), fcDisp = dist < a ? 0.85 * fcp : 0; N += s.A * (fsv - fcDisp); M += s.A * (fsv - fcDisp) * s.y; }
    return { N, M }; };
  // find c where M/N = e (bisection on c over (0.01h, 10h))
  let lo = 0.01 * h, hi = 20 * h; const g = (c) => { const f = force(c); return f.M - e * f.N; };
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (g(lo) * g(mid) <= 0) hi = mid; else lo = mid; }
  return Math.max(0, force((lo + hi) / 2).N);
}
function usd(inp, w) {
  const { Bx, By, P, Mx, My, mat } = inp, fcp = mat.fcPrime, fy = mat.fy, A = w.Lay.A;
  const Po = 0.85 * fcp * (w.Ag - w.Ast) + fy * w.Ast, eminX = Math.max(2.5, 0.1 * By), eminY = Math.max(2.5, 0.1 * Bx);
  const Mxu = Math.max(Mx, (P * eminX) / 100), Myu = My; // first eccentricity case (as the program)
  const ey = (Mxu * 100) / P, ex = (Myu * 100) / P;
  const Pnx = ey > 0 ? Pn_e(Bx, By, w.Lay.pts.map(([, y]) => ({ y, A })), ey, fcp, fy, mat.Es) : Po, Pny = ex > 0 ? Pn_e(By, Bx, w.Lay.pts.map(([x]) => ({ y: x, A })), ex, fcp, fy, mat.Es) : Po;
  const Pn = 1 / (1 / Pnx + 1 / Pny - 1 / Po), phiPn = 0.65 * Math.min(Pn, 0.8 * Po);
  return { Po, Pnx, Pny, Pn, phiPn, need: 1.55 * P, ratio: (1.55 * P) / phiPn };
}
// ---------- cases ----------
const C = [], add = (name, o) => C.push({ name, ...o });
const L3 = 2.7;
add("1 20×20 4-DB12 แรงอัดล้วน 15 ตัน", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 15000, Mx: 0, My: 0, L: L3 });
add("2 20×20 4-DB12 ใกล้ขีด 25 ตัน", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 25000, Mx: 0, My: 0, L: L3 });
add("3 20×20 4-DB12 + Mx 400", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 12000, Mx: 400, My: 0, L: L3 });
add("4 20×20 4-DB12 สองแกน 300/300", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 12000, Mx: 300, My: 300, L: L3 });
add("5 20×20 6-DB12 ปลอก @0.20 (> 16db)", { Bx: 20, By: 20, n: 6, bar: "DB 12", tie: "RB 6", s: 0.2, P: 15000, Mx: 0, My: 0, L: L3 });
add("6 20×20 4-DB12 สูง 4.0 ม. (ชะลูด)", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 15000, Mx: 0, My: 0, L: 4.0 });
add("7 20×20 สูง 5.0 ม.", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 10000, Mx: 0, My: 0, L: 5.0 });
add("8 20×20 ยื่น 3 ม. (L = 2·3)", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 3000, Mx: 0, My: 0, L: 6.0 });
add("9 25×25 8-DB16 35 ตัน", { Bx: 25, By: 25, n: 8, bar: "DB 16", tie: "RB 9", s: 0.15, P: 35000, Mx: 0, My: 0, L: L3 });
add("10 25×25 8-DB16 + 1,500/800", { Bx: 25, By: 25, n: 8, bar: "DB 16", tie: "RB 9", s: 0.15, P: 25000, Mx: 1500, My: 800, L: L3 });
add("11 30×30 8-DB12 50 ตัน", { Bx: 30, By: 30, n: 8, bar: "DB 12", tie: "RB 6", s: 0.15, P: 50000, Mx: 0, My: 0, L: L3 });
add("12 30×30 8-DB16 + Mx 3,000", { Bx: 30, By: 30, n: 8, bar: "DB 16", tie: "RB 9", s: 0.2, P: 30000, Mx: 3000, My: 0, L: L3 });
add("13 30×30 แรงอัดน้อย โมเมนต์มาก (ควบคุมด้วยแรงดึง)", { Bx: 30, By: 30, n: 8, bar: "DB 16", tie: "RB 9", s: 0.2, P: 5000, Mx: 2500, My: 0, L: L3 });
add("14 40×40 12-DB20 120 ตัน", { Bx: 40, By: 40, n: 12, bar: "DB 20", tie: "RB 9", s: 0.2, P: 120000, Mx: 0, My: 0, L: 3.5 });
add("15 20×30 6-DB12 Mx (แกนแข็ง)", { Bx: 20, By: 30, n: 6, bar: "DB 12", tie: "RB 6", s: 0.15, P: 15000, Mx: 1200, My: 0, L: L3 });
add("16 20×30 6-DB12 My (แกนอ่อน)", { Bx: 20, By: 30, n: 6, bar: "DB 12", tie: "RB 6", s: 0.15, P: 15000, Mx: 0, My: 800, L: L3 });
add("17 30×20 6-DB12 ไม่มีโมเมนต์ (ขั้นต่ำแกนอ่อน)", { Bx: 30, By: 20, n: 6, bar: "DB 12", tie: "RB 6", s: 0.15, P: 26000, Mx: 0, My: 0, L: L3 });
add("18 40×20 8-DB12 สูง 3.5 (ชะลูดแกนอ่อน)", { Bx: 40, By: 20, n: 8, bar: "DB 12", tie: "RB 6", s: 0.15, P: 20000, Mx: 0, My: 0, L: 3.5 });
add("19 20×40 8-DB12 สูง 3.5", { Bx: 20, By: 40, n: 8, bar: "DB 12", tie: "RB 6", s: 0.15, P: 20000, Mx: 0, My: 0, L: 3.5 });
add("20 20×20 เหล็กน้อย 4-DB12 (1.13 %)", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 10000, Mx: 0, My: 0, L: L3 });
add("21 25×25 4-DB12 (0.72 % < 1 %)", { Bx: 25, By: 25, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 10000, Mx: 0, My: 0, L: L3 });
add("22 20×20 8-DB20 (7.9 % — จัดไม่ได้)", { Bx: 20, By: 20, n: 8, bar: "DB 20", tie: "RB 6", s: 0.1, P: 30000, Mx: 0, My: 0, L: L3 });
add("23 20×20 8-DB16 (4 % — ระยะช่องว่าง)", { Bx: 20, By: 20, n: 8, bar: "DB 16", tie: "RB 6", s: 0.1, P: 25000, Mx: 0, My: 0, L: L3 });
add("24 ตอม่อ 20×20 สูง 2 ม.", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 13400, Mx: 106, My: 123, L: 2.0 });
add("25 เสามุม 20×20 แรงจากโครง 3 มิติ", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: 8000, Mx: 600, My: 600, L: L3 });
add("26 เสาริม 25×25 8-DB12 + 1,200", { Bx: 25, By: 25, n: 8, bar: "DB 12", tie: "RB 6", s: 0.15, P: 18000, Mx: 1200, My: 0, L: L3 });
add("27 20×20 RB9 ปลอก @0.20", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 9", s: 0.2, P: 12000, Mx: 0, My: 0, L: L3 });
add("28 30×30 สูง 6 ม.", { Bx: 30, By: 30, n: 8, bar: "DB 16", tie: "RB 9", s: 0.2, P: 30000, Mx: 0, My: 0, L: 6.0 });
add("29 25×25 8-DB16 ลม D+0.75L+0.75W", { Bx: 25, By: 25, n: 8, bar: "DB 16", tie: "RB 9", s: 0.15, P: 15000, Mx: 2000, My: 500, L: L3 });
add("30 20×20 แรงดึง (ยกขึ้น)", { Bx: 20, By: 20, n: 4, bar: "DB 12", tie: "RB 6", s: 0.15, P: -2000, Mx: 0, My: 0, L: L3 });
add("31 35×35 12-DB16 80 ตัน + 2 แกน", { Bx: 35, By: 35, n: 12, bar: "DB 16", tie: "RB 9", s: 0.2, P: 80000, Mx: 2500, My: 2500, L: 3.0 });
add("32 25×40 10-DB16 สองแกน", { Bx: 25, By: 40, n: 10, bar: "DB 16", tie: "RB 9", s: 0.2, P: 40000, Mx: 2500, My: 1500, L: 3.0 });

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const rows = [];
for (const cs of C) {
  const mat = { ...MAT }, lv = { level: "x", Bx: cs.Bx, By: cs.By, n: cs.n, mainBar: cs.bar, tieBar: cs.tie, s: cs.s };
  let p; try { p = checkColumn(lv, cs.P, cs.L, mat, { Mx: cs.Mx, My: cs.My }); } catch (e) { p = { error: e.message }; }
  const w = cs.P > 0 ? wsd({ ...cs, mat }) : null, u = w ? usd({ ...cs, mat }, w) : null;
  rows.push({ case: cs.name, inp: cs, prog: p && { ok: p.ok, util: p.util, mode: p.r?.mode, Pa: p.r?.Pa, Fa: p.r?.Fa, pg: p.r?.pg, R: p.r?.R, klr: p.r?.klr, slender: p.r?.slender, sTie: p.r?.sTie, sOk: p.sOk, pgOk: p.r?.pgOk, Ix: p.r?.Ix, Iy: p.r?.Iy, e: p.e, Mx: p.r && p.r.ey * cs.P / 100, error: p.error, ratio: p.r?.ratio, axialRatio: p.r?.axialRatio }, w, u });
}
const f = (v, k = 2) => (v == null || !Number.isFinite(v) ? "–" : v.toFixed(k));
console.log("case | prog ok/util/mode | indep WSD braced util / unbraced util | Pa prog/indep | klu/r prog/indep | R prog/braced/unbraced | sTie | fit | USD 1.55P/φPn | flags");
for (const r of rows) { const p = r.prog, w = r.w, u = r.u, fl = [];
  if (w) { if (p.ok && !w.okB) fl.push("PROG ผ่าน / อิสระ(braced) ไม่ผ่าน"); if (p.ok && w.utilU > 1.005) fl.push("unbraced ไม่ผ่าน"); if (!w.fitOk) fl.push(`ช่องว่างเหล็ก ${f(w.clear, 1)} < ${f(w.clearReq, 1)}`); if (u && p.ok && u.ratio > 1) fl.push(`USD ${f(u.ratio)} > 1`); if (Math.abs(p.Pa - w.Pa) > 0.01 * w.Pa) fl.push("Pa ต่าง"); }
  console.log([r.case, `${p.error ? "ERR " + p.error : (p.ok ? "ผ่าน" : "ไม่ผ่าน") + " " + f(p.util) + " " + p.mode}`, w ? `${f(w.utilB)} / ${f(w.utilU)}` : "-", `${f(p.Pa, 0)}/${f(w?.Pa, 0)}`, `${f(p.klr, 1)}/${f(w?.hrMax, 1)}`, `${f(p.R)}/${f(w?.Rbr)}/${f(w?.Run)}`, `${f(p.sTie, 1)}${p.sOk ? "" : "✗"}`, w ? (w.fitOk ? "ok" : "✗") : "-", u ? `${f(u.need, 0)}/${f(u.phiPn, 0)} = ${f(u.ratio)}` : "-", fl.join("; ")].join(" | ")); }
if (arg("--json")) fs.writeFileSync(arg("--json"), JSON.stringify(rows, null, 1));
// ---------- every column of a project (forces from the program's analysis; section checks independent) ----------
const proj = arg("--project");
if (proj) {
  const { analyzeFrame } = await import("../web/engine/frame.js"), pj = JSON.parse(fs.readFileSync(proj)), fr = pj.frame, r = analyzeFrame(fr), out = [];
  for (const c of r.columns) { const ch = c.check, q = ch?.r; if (!q || !c.lv) continue;
    const amp = q.slender ? q.R : 1, P = q.Pd * amp, Mx = q.Mxd * amp, My = q.Myd * amp, L = c.Leff ?? c.Lu ?? c.L, mat = { ...MAT, ...fr.mat, fcPrime: fr.mat.fcCol ?? fr.mat.fcPrime, cover: fr.mat.coverCol ?? fr.mat.cover ?? 3 };
    const cs = { Bx: c.lv.Bx, By: c.lv.By, n: c.lv.n, bar: c.lv.mainBar.replace(/\s+/, " "), tie: c.lv.tieBar.replace(/\s+/, " "), s: c.lv.s, P, Mx, My, L };
    if (!(P > 0)) { out.push({ id: `${fr.floors[c.floor].name} ${c.stack}`, tension: true, P }); continue; }
    const w = wsd({ ...cs, mat }), u = usd({ ...cs, mat }, w);
    out.push({ id: `${fr.floors[c.floor].name} ${c.stack}`, lv: `${cs.Bx}×${cs.By} ${cs.n}-${cs.bar} ${cs.tie}@${cs.s}`, P, Mx, My, L, prog: { ok: ch.ok, util: ch.util, mode: q.mode, combo: ch.combo }, ind: { ok: w.okB, util: w.utilB, utilU: w.utilU, fit: w.fitOk, s: w.sOk }, usd: u.ratio }); }
  const bad = out.filter((x) => x.prog?.ok && !x.ind?.ok), unb = out.filter((x) => x.prog?.ok && x.ind?.utilU > 1.005), usdBad = out.filter((x) => x.prog?.ok && x.usd > 1), progOnlyFail = out.filter((x) => x.prog && !x.prog.ok && x.ind?.ok);
  console.log(`\n${proj}: columns ${out.length} · program pass ${out.filter((x) => x.prog?.ok).length} · independent (braced) pass ${out.filter((x) => x.ind?.ok).length} · program pass but independent NG ${bad.length} · program pass but unbraced NG ${unb.length} · program pass but USD 1.55P > φPn ${usdBad.length} · program NG but independent ok ${progOnlyFail.length} · tension ${out.filter((x) => x.tension).length}`);
  for (const x of [...bad, ...usdBad].slice(0, 6)) console.log("   ", x.id, x.lv, `P ${x.P.toFixed(0)} Mx ${x.Mx.toFixed(0)} My ${x.My.toFixed(0)} L ${x.L}`, "prog", x.prog.util.toFixed(2), x.prog.mode, "ind", x.ind.util.toFixed(2), "USD", x.usd.toFixed(2), x.ind.fit ? "" : "fit✗");
  for (const x of progOnlyFail.slice(0, 4)) console.log("   prog NG / ind ok:", x.id, x.lv, `P ${x.P.toFixed(0)} Mx ${x.Mx.toFixed(0)} My ${x.My.toFixed(0)}`, "prog", x.prog.util.toFixed(2), x.prog.mode, "ind", x.ind.util.toFixed(2));
  const mx = out.filter((x) => x.ind).reduce((a, x) => (x.usd > (a?.usd ?? 0) ? x : a), null); console.log("    highest USD ratio:", mx?.id, mx?.usd?.toFixed(2), "· highest unbraced util:", Math.max(...out.filter((x) => x.ind).map((x) => x.ind.utilU)).toFixed(2));
  if (arg("--json")) fs.writeFileSync(arg("--json") + ".proj.json", JSON.stringify(out, null, 1));
}
