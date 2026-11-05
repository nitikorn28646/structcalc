// Column audit round 3 (user 2026-11-05) — READ ONLY: column.js / frame.js / WSD formulas untouched; this script only reads results.
// node cli/audit-column3.mjs <project.json> [--json out.json]
// 1 Q per storey and per load combination: Q = ΣPu·Δo/(Vus·lc) (ACI 318-11 10.10.5.2), ΣPu = cD·ΣD + cL·ΣL of that combination
//   (D, L split from an own first-order 3D solve with an L-only case), Δo/Vus from a first-order solve with 0.70Ig columns / 0.35Ig beams
//   (10.10.4.1) and rigid floors; Δo ∝ Vus (linear), so Δo/Vus does not depend on the size of the lateral load, only its distribution
//   (two patterns shown). lc = storey height (centre-to-centre of joints).
// 2 ψ = Σ(EI/lc)columns / Σ(EI/l)beams at each end (ACI 318-11 R10.10.1 / Fig. R10.10.1.1 with 10.10.4.1 stiffnesses; l = beam span
//   centre-to-centre of the joints = to the next column on the line, NOT the 3D element), far-end corrections (AISC 360-10 Comm. C-A-7:
//   sway far end pinned ×0.5, braced ×1.5; free far end 0), base pinned ψ = ∞ (alt. 10), fixed ψ = 1; k from the alignment-chart
//   equations; and the 318-63-type h′ formulas exactly as column.js slenderRows (case 3: 0.78 + 0.22·r′avg, case 4: 2(0.78 + 0.22·r′)).
// 4 P-Delta: program (P-Delta) vs first-order column moments.
// 5 live-load patterns: one L case per loaded beam element, D = (D + L) − ΣL; per column the on/off set that maximises each end
//   moment (±) / N max / N min → consistent (N, Mx, My) triples; WSD check of every triple; USD separately with Pu = 1.2D + 1.6L.
import fs from "fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { frame3dModel, solveFrame3D } from "../web/engine/frame3d.js";
import { windForces, DEFAULT_LATERAL } from "../web/engine/lateral.js";
const BAR = { "DB 12": [1.131, 1.2], "DB 16": [2.011, 1.6], "DB 20": [3.142, 2.0], "DB 25": [4.909, 2.5], "RB 6": [0.283, 0.6], "RB 9": [0.636, 0.9] };
const file = process.argv[2], pj = JSON.parse(fs.readFileSync(file)), fr = pj.frame;
const mat = { fcPrime: 240, fy: 4000, Es: 2040000, ...fr.mat }; mat.fcPrime = fr.mat.fcCol ?? fr.mat.fcPrime ?? 240; mat.cover = fr.mat.coverCol ?? fr.mat.cover ?? 3;
// ---- own section checks (same code as cli/audit-column.mjs, effective length per bending direction) ----
function layout(Bx, By, n, bar, tie, cover) {
  const db = BAR[bar][1], dt = BAR[tie][1], dp = cover + dt + db / 2, xs = Bx / 2 - dp, ys = By / 2 - dp, extra = n - 4;
  const ex = Math.round((extra * Bx) / (Bx + By) / 2) * 2, ey = extra - ex, pts = [[-xs, -ys], [xs, -ys], [xs, ys], [-xs, ys]];
  for (let i = 1; i <= ex / 2; i++) { const x = -xs + (2 * xs * i) / (ex / 2 + 1); pts.push([x, -ys], [x, ys]); }
  for (let i = 1; i <= ey / 2; i++) { const y = -ys + (2 * ys * i) / (ey / 2 + 1); pts.push([-xs, y], [xs, y]); }
  const perFaceX = 2 + ex / 2, perFaceY = 2 + ey / 2;
  return { pts, dp, db, A: BAR[bar][0], clear: Math.min((2 * xs) / (perFaceX - 1) - db, (2 * ys) / (perFaceY - 1) - db), perFaceX, perFaceY };
}
// R: { braced: bool, hx (cm, effective length for bending about x = depth By), hy }
function wsd({ Bx, By, n, bar, tie, s, P, Mx, My }, R) {
  const fcp = mat.fcPrime, fy = mat.fy, Lay = layout(Bx, By, n, bar, tie, mat.cover), Ag = Bx * By, Ast = n * Lay.A, pg = Ast / Ag;
  const fs = Math.min(0.4 * fy, 2100), nn = mat.Es / (15100 * Math.sqrt(fcp)), m = fy / (0.85 * fcp), Fa = 0.34 * (1 + pg * m) * fcp, Fb = 0.45 * fcp;
  const Pa = 0.85 * Ag * (0.25 * fcp + fs * pg), Po = Fa * Ag;
  const Ix = (Bx * By ** 3) / 12 + (2 * nn - 1) * Lay.pts.reduce((t, [, y]) => t + Lay.A * y * y, 0), Iy = (By * Bx ** 3) / 12 + (2 * nn - 1) * Lay.pts.reduce((t, [x]) => t + Lay.A * x * x, 0);
  const rf = (h, t) => (R.braced ? Math.min(1, 1.32 - (0.006 * h) / (0.3 * t)) : Math.min(1, 1.07 - (0.008 * h) / (0.3 * t)));
  // R.prog: the program's / Excel's rule (column.js): slender only when Lu / min(B) > 15, then 1.07 − 0.008·Lu/(0.25·Bx) (case 2, k = 1)
  const Rp = R.prog ? (R.hx / Math.min(Bx, By) > 15 ? Math.min(1, 1.07 - (0.008 * R.hx) / (0.25 * Bx)) : 1) : null;
  const Rx = R.prog ? Rp : rf(R.hx, By), Ry = R.prog ? Rp : rf(R.hy, Bx), Rr = Math.min(Rx, Ry), slOk = Math.max(R.hx / (0.3 * By), R.hy / (0.3 * Bx)) <= 100 && Rr > 0;
  const one = (MxS, MyS) => { if (!(Rr > 0)) return { util: 99 };
    const Pd = P / Rr, Mxd = MxS / Rr, Myd = MyS / Rr, fa = Pd / Ag, fbx = (Mxd * 100 * (By / 2)) / Ix, fby = (Myd * 100 * (Bx / 2)) / Iy;
    const ebX = (0.67 * pg * m + 0.17) * (By - Lay.dp), ebY = (0.67 * pg * m + 0.17) * (Bx - Lay.dp), ey = (Mxd * 100) / Pd, ex = (Myd * 100) / Pd, comp = ey <= ebX && ex <= ebY;
    const MoX = 0.4 * Lay.A * Lay.perFaceX * fy * (By - 2 * Lay.dp), MoY = 0.4 * Lay.A * Lay.perFaceY * fy * (Bx - 2 * Lay.dp);
    const PbX = 1 / (1 / Po + (ebX * (By / 2)) / (Ix * Fb)), PbY = 1 / (1 / Po + (ebY * (Bx / 2)) / (Iy * Fb));
    const MaX = MoX + (PbX * ebX - MoX) * Math.min(1, Pd / PbX), MaY = MoY + (PbY * ebY - MoY) * Math.min(1, Pd / PbY);
    return { util: Math.max(Pd / Pa, comp ? fa / Fa + fbx / Fb + fby / Fb : (Mxd * 100) / MaX + (Myd * 100) / MaY), comp }; };
  const eX = (P * Math.max(2.5, 0.1 * By)) / 100, eY = (P * Math.max(2.5, 0.1 * Bx)) / 100;
  const X = one(Math.max(Mx, eX), 0), Y = one(0, Math.max(My, eY)), B1 = one(Math.max(Mx, eX), My), B2 = one(Mx, Math.max(My, eY));
  const sTie = Math.min(16 * Lay.db, 48 * BAR[tie][1], Bx, By), detail = [];
  if (s * 100 > sTie + 1e-9) detail.push(`ปลอก @${s} > ${(sTie / 100).toFixed(3)}`); if (Lay.clear < Math.max(1.5 * Lay.db, 4) - 1e-9) detail.push(`ช่องว่างเหล็ก ${Lay.clear.toFixed(1)} ซม.`);
  if (pg < 0.01 - 1e-9 || pg > 0.08) detail.push(`pg ${(pg * 100).toFixed(2)} %`); if (!slOk) detail.push("kh/r > 100");
  const util = Math.max(B1.util, B2.util);
  return { Rx, Ry, R: Rr, uX: X.util, uY: Y.util, uB: util, detail, ok: util <= 1.005 && !detail.length, strengthOk: util <= 1.005, Lay, Ag, Ast };
}
function Pn_e(b, h, bars, e, fcp, fy, Es) {
  const b1 = fcp <= 280 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (fcp - 280)) / 70), ecu = 0.003;
  const force = (c) => { const a = Math.min(b1 * c, h), Cc = 0.85 * fcp * b * a; let N = Cc, M = Cc * (h / 2 - a / 2);
    for (const s of bars) { const dist = h / 2 - s.y, eps = (ecu * (c - dist)) / c, fsv = Math.max(-fy, Math.min(fy, eps * Es)), fcD = dist < a ? 0.85 * fcp : 0; N += s.A * (fsv - fcD); M += s.A * (fsv - fcD) * s.y; }
    return { N, M }; };
  let lo = 0.01 * h, hi = 20 * h; const g = (c) => { const f = force(c); return f.M - e * f.N; };
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (g(lo) * g(mid) <= 0) hi = mid; else lo = mid; }
  return Math.max(0, force((lo + hi) / 2).N);
}
function usd(cs, w, mag = 1) {
  const fcp = mat.fcPrime, fy = mat.fy, A = w.Lay.A, P = cs.P, Po = 0.85 * fcp * (w.Ag - w.Ast) + fy * w.Ast;
  const Mxu = Math.max(cs.Mx * mag, (P * Math.max(2.5, 0.1 * cs.By)) / 100), Myu = Math.max(cs.My * mag, 0), ey = (Mxu * 100) / P, ex = (Myu * 100) / P;
  const Pnx = ey > 0 ? Pn_e(cs.Bx, cs.By, w.Lay.pts.map(([, y]) => ({ y, A })), ey, fcp, fy, mat.Es) : Po, Pny = ex > 0 ? Pn_e(cs.By, cs.Bx, w.Lay.pts.map(([x]) => ({ y: x, A })), ex, fcp, fy, mat.Es) : Po;
  const Pn = 1 / (1 / Pnx + 1 / Pny - 1 / Po); return (1.55 * P) / (0.65 * Math.min(Pn, 0.8 * Po));
}
// ---- effective length factor from ψ (alignment-chart equations) ----
const kSway = (a, b) => { a = Math.min(a, 1e4); b = Math.min(b, 1e4); const f = (x) => (a * b * x * x - 36) / (6 * (a + b)) - x / Math.tan(x); let lo = 1e-6, hi = Math.PI - 1e-9;
  if (f(lo) > 0) return 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return Math.PI / ((lo + hi) / 2); };
const kBraced = (a, b) => { a = Math.min(a, 1e4); b = Math.min(b, 1e4); const f = (x) => ((a * b) / 4) * x * x + ((a + b) / 2) * (1 - x / Math.tan(x)) + (2 * Math.tan(x / 2)) / x - 1; let lo = Math.PI + 1e-9, hi = 2 * Math.PI - 1e-6;
  for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) > 0) hi = m; else lo = m; } return Math.PI / ((lo + hi) / 2); };
const KREF = [["sway", 0, 0, 1.0], ["sway", 1, 1, 1.32], ["sway", Infinity, 0, 2.0], ["sway", 10, 10, 3.0], ["non-sway", 0, 0, 0.5], ["non-sway", 1, 1, 0.77], ["non-sway", Infinity, Infinity, 1.0], ["non-sway", Infinity, 0, 0.70]]
  .map(([m, a, b, ref]) => ({ m, a, b, ref, k: m === "sway" ? kSway(a, b) : kBraced(a, b) }));
const k63 = (rT, rB, hinged) => { const a = (x) => Math.min(x, 1e4); return hinged ? 2 * (0.78 + 0.22 * a(rT > 0 && rT < 1e4 ? rT : rB)) : 0.78 + 0.22 * (0.5 * (a(rT) + a(rB))); };

const rA = analyzeFrame({ ...fr, colMethod: "axial" }), m3 = rA.frame3d, Z = []; { let z = 0; for (const f of fr.floors) Z.push((z += f.h ?? 3)); }
const nF = fr.floors.length;
// ---------- 1. Q ----------
const lat = frame3dModel(fr, rA, { pDelta: false, lateral: { cases: [{ key: "Wx", F: Z.map(() => [1, 0]) }], combos: [] } });
const DI = lat.diaphragms, LI = lat.input, colPieces = (ms) => { const o = new Map(); ms.forEach((m, i) => { if (m.kind !== "column") return; const k = `${m.floor}|${m.ci}`; o.set(k, [...(o.get(k) ?? []), i]); }); return o; };
const PCS = colPieces(LI.members), Ncol = (mres, k) => Math.max(...PCS.get(k).map((i) => mres[i].f[0]));
const storeyN = (mres) => fr.floors.map((_, f) => [...PCS.keys()].filter((k) => +k.split("|")[0] === f).reduce((s, k) => s + Ncol(mres, k), 0));
const Lcase = { loads: LI.members.map((m) => ({ loads: (m.loads ?? []).filter((l) => l.g === "LL"), torque: m.torqueL ?? [] })) };
const base0 = solveFrame3D({ ...LI, diaphragms: DI, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 }, cases: [Lcase] });
const SDL = storeyN(base0.members), SL = storeyN(base0.cases[0].members), SD = SDL.map((v, k) => v - SL[k]);
const Wlev = SDL.map((v, k) => v - (SDL[k + 1] ?? 0)); // weight hanging on each level
const PAT = { "∝ w (เร่งเท่ากัน)": Wlev.map((w) => Math.max(w, 1)), "∝ w·h (สามเหลี่ยม ELF)": Wlev.map((w, k) => Math.max(w, 1) * Z[k]) };
const latCases = Object.values(PAT).flatMap((F) => [0, 1].map((ax) => ({ lateral: DI.map((d) => { const k = Z.findIndex((z) => Math.abs(z - d.z) < 1e-6); return { n: d.master, F: ax ? [0, F[k] * 1e-3, 0] : [F[k] * 1e-3, 0, 0] }; }) })));
const own = solveFrame3D({ ...LI, diaphragms: DI, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 }, cases: latCases });
const flex = Object.keys(PAT).map((name, p) => ({ name, fl: [0, 1].map((ax) => { const F = latCases[p * 2 + ax].lateral, u = own.cases[p * 2 + ax].u;
  return fr.floors.map((_, k) => { const d = DI.findIndex((x) => Math.abs(x.z - Z[k]) < 1e-6), db = k ? DI.findIndex((x) => Math.abs(x.z - Z[k - 1]) < 1e-6) : -1;
    const dd = Math.abs((d >= 0 ? u[DI[d].master * 6 + ax] : 0) - (db >= 0 ? u[DI[db].master * 6 + ax] : 0)), V = F.filter((q) => DI.find((x) => x.master === q.n).z >= Z[k] - 1e-6).reduce((s, q) => s + Math.abs(q.F[ax]), 0);
    return dd / V; }); }) }));
const rawQ = Object.keys(PAT).map((name, p) => ({ name, ax: [0, 1].map((ax) => { const F = latCases[p * 2 + ax].lateral, u = own.cases[p * 2 + ax].u;
  return fr.floors.map((_, k) => { const d = DI.findIndex((x) => Math.abs(x.z - Z[k]) < 1e-6), db = k ? DI.findIndex((x) => Math.abs(x.z - Z[k - 1]) < 1e-6) : -1;
    const dd = Math.abs((d >= 0 ? u[DI[d].master * 6 + ax] : 0) - (db >= 0 ? u[DI[db].master * 6 + ax] : 0)), V = F.filter((q) => DI.find((x) => x.master === q.n).z >= Z[k] - 1e-6).reduce((s, q) => s + Math.abs(q.F[ax]), 0);
    const mxJ = Math.max(...DI[d].slaves.map((i) => { const x = N3j(i), lo = k ? nodeBelow(i) : -1; return Math.abs(u[i * 6 + ax] - (lo >= 0 ? u[lo * 6 + ax] : 0)); }));
    return { V, dd, mxJ }; }); }) }));
function N3j(i) { return i; }
function nodeBelow(i) { const n = LI.nodes[i], zb = LI.nodes.filter((q) => !q.master && q.z < n.z - 1e-6).reduce((a, q) => Math.max(a, q.z), -1); return LI.nodes.findIndex((q) => !q.master && Math.abs(q.z - zb) < 1e-6 && Math.hypot(q.x - n.x, q.y - n.y) < 0.035); }
// real wind (มยผ. 1311-50, program defaults) as Vus of the wind combinations: Δo and Vus from the SAME case (factor cancels in Q)
const WND = windForces({ ...fr, lateral: { ...DEFAULT_LATERAL, ...(fr.lateral ?? {}), wind: { ...DEFAULT_LATERAL.wind, ...(fr.lateral?.wind ?? {}), on: true } } });
const wCases = [0, 1].map((ax) => ({ lateral: DI.map((d) => { const k = Z.findIndex((z) => Math.abs(z - d.z) < 1e-6), F = WND[ax ? "y" : "x"].floors[k]?.F ?? 0; return { n: d.master, F: ax ? [0, F, 0] : [F, 0, 0] }; }) }));
const wSol = solveFrame3D({ ...LI, diaphragms: DI, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 }, cases: wCases });
const wind = [0, 1].map((ax) => fr.floors.map((f, k) => { const u = wSol.cases[ax].u, d = DI.findIndex((x) => Math.abs(x.z - Z[k]) < 1e-6), db = k ? DI.findIndex((x) => Math.abs(x.z - Z[k - 1]) < 1e-6) : -1;
  const dd = Math.abs((d >= 0 ? u[DI[d].master * 6 + ax] : 0) - (db >= 0 ? u[DI[db].master * 6 + ax] : 0)), V = WND[ax ? "y" : "x"].floors.slice(k).reduce((s, q) => s + q.F, 0);
  return { V, dd, rows: [["1.2D + 1.0L + 1.6W", 1.2, 1.0, 1.6], ["0.9D + 1.6W", 0.9, 0, 1.6], ["0.75(1.4D + 1.7L + 1.7W)", 1.05, 1.275, 1.275]].map(([name, cD, cL, cW]) => {
    const Pu = cD * SD[k] + cL * SL[k], Vu = cW * V, Do = cW * dd; return { name, Pu, Vu, Do, lc: f.h ?? 3, Q: (Pu * Do) / (Vu * (f.h ?? 3)) }; }) }; }));
// linearity proof: the same pattern ×1000 gives the same Δo/V
const big = solveFrame3D({ ...LI, diaphragms: DI, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 }, cases: [{ lateral: latCases[0].lateral.map((q) => ({ ...q, F: q.F.map((v) => v * 1000) })) }] });
const lin = (() => { const d = DI.findIndex((x) => Math.abs(x.z - Z[nF > 1 ? 1 : 0]) < 1e-6), m = DI[d].master; return big.cases[0].u[m * 6] / 1000 / own.cases[0].u[m * 6]; })();
const COMBOS = [
  { name: "D + L", src: "WSD (โปรแกรม, ใช้งาน)", cD: 1, cL: 1 }, { name: "D + 0.75L + 0.75W", src: "WSD (โปรแกรม)", cD: 1, cL: 0.75 }, { name: "0.6D + W", src: "WSD (โปรแกรม)", cD: 0.6, cL: 0 },
  { name: "1.4D", src: "ACI 318-11 (9-1)", cD: 1.4, cL: 0 }, { name: "1.2D + 1.6L", src: "ACI 318-11 (9-2)", cD: 1.2, cL: 1.6 }, { name: "1.2D + 1.0L + 1.6W", src: "ACI 318-11 (9-4)", cD: 1.2, cL: 1.0 },
  { name: "0.9D + 1.6W", src: "ACI 318-11 (9-6)", cD: 0.9, cL: 0 }, { name: "1.4D + 1.7L", src: "ว.ส.ท./ACI 318-99 (UNVERIFIED ข้อความไทย)", cD: 1.4, cL: 1.7 },
  { name: "0.75(1.4D + 1.7L + 1.7W)", src: "ว.ส.ท./ACI 318-99 (UNVERIFIED)", cD: 1.05, cL: 1.275 }];
const Qtab = fr.floors.map((f, k) => ({ name: f.name, h: f.h ?? 3, D: SD[k], L: SL[k], rows: COMBOS.map((c) => ({ ...c, P: c.cD * SD[k] + c.cL * SL[k],
  Q: flex.map((p) => p.fl.map((ax) => ((c.cD * SD[k] + c.cL * SL[k]) * ax[k]) / (f.h ?? 3))) })) }));
const Qmax = (k, filt) => Math.max(...Qtab[k].rows.filter(filt).flatMap((r) => r.Q.flat()));
const QACI = fr.floors.map((_, k) => Qmax(k, (r) => r.src.startsWith("ACI 318-11"))), QSRV = fr.floors.map((_, k) => Qmax(k, (r) => r.name === "D + L"));
const sway = QACI.map((q) => q > 0.05);

// ---------- 2. ψ and k ----------
const N3 = LI.nodes, M3 = LI.members, floorsA = rA.floors;
const touches = (f, p, self) => floorsA[f].lines.some((o) => o.id !== self && (o.lvl ?? null) === null && [o.A, o.B].some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.035));
function beamTerms(n, ax) {
  const out = [];
  for (const m of M3) { if (m.kind !== "beam" || (m.i !== n && m.j !== n)) continue; const end = m.i === n ? 0 : 1; if (m.release?.[end]) { out.push({ m, rel: true }); continue; }
    const ln = floorsA[m.floor].lines.find((l) => l.id === m.line), tj = end ? m.x1 : m.x0, dir = end ? -1 : 1;
    const ts = ln.cols.map((c) => c.t).filter((t) => dir * (t - tj) > 1e-6).sort((a, b) => dir * (a - b));
    const Le = Math.hypot(N3[m.j].x - N3[m.i].x, N3[m.j].y - N3[m.i].y), w = (ax === "x" ? Math.abs(N3[m.j].y - N3[m.i].y) : Math.abs(N3[m.j].x - N3[m.i].x)) / Le;
    let far, Lb;
    if (ts.length) { far = "col"; Lb = Math.abs(ts[0] - tj); }
    else { const tEnd = dir > 0 ? ln.L : 0; Lb = Math.abs(tEnd - tj); const pE = dir > 0 ? ln.B : ln.A;
      far = ln.carriers.some((c) => Math.abs(c.t - tEnd) < 1e-3) || touches(m.floor, pE, ln.id) ? "pin" : "free"; }
    if (Lb < 1e-6 || w < 1e-6) continue;
    const I = (m.b * m.h ** 3) / 12; out.push({ m, Le, Lb, far, w, EI: m.E * I, line: ln.id });
  }
  return out;
}
function psiAt(n, ax, mode) { // mode: "sway" | "braced" (far-end corrections) — ACI stiffnesses; mode "63": gross, no corrections (column.js stiffness)
  const nd = N3[n]; if (nd.pinned) return { psi: Infinity, base: "pinned" }; if (nd.fixed) return { psi: mode === "63" ? 0 : 1, base: "fixed" };
  const cols = new Map(); for (const m of M3) if (m.kind === "column" && (m.i === n || m.j === n)) cols.set(`${m.floor}|${m.ci}`, m);
  const C = [...cols.values()].reduce((s, m) => s + ((mode === "63" ? 1 : 0.7) * m.E * (ax === "x" ? m.b * m.h ** 3 : m.h * m.b ** 3)) / 12 / (fr.floors[m.floor].h ?? 3), 0);
  const bt = beamTerms(n, ax); let B = 0, Bel = 0;
  for (const t of bt) { if (t.rel) continue; const fac = mode === "63" ? (t.far === "free" ? 0 : 1) : t.far === "col" ? 1 : t.far === "pin" ? (mode === "sway" ? 0.5 : 1.5) : 0;
    B += (t.w * (mode === "63" ? 1 : 0.35) * t.EI * fac) / t.Lb; Bel += (t.w * (mode === "63" ? 1 : 0.35) * t.EI) / t.Le; }
  return { psi: B > 0 ? C / B : Infinity, psiEl: Bel > 0 ? C / Bel : Infinity, beams: bt.filter((t) => !t.rel).map((t) => `${t.m.b * 100}×${t.m.h * 100} l ${t.Lb.toFixed(2)} (element ${t.Le.toFixed(2)}) ${t.far}`), nRel: bt.filter((t) => t.rel).length };
}
const nodeAt = (x, y, z) => N3.findIndex((p) => !p.master && Math.abs(p.z - z) < 1e-6 && Math.hypot(p.x - x, p.y - y) < 0.035);

// ---------- 4/5. first-order + live-load patterns (program stiffness 0.5Ig / 0.7Ig, as the design moments) ----------
const LLm = M3.map((m, i) => ({ i, l: (m.loads ?? []).filter((l) => l.g === "LL"), t: m.torqueL ?? [] })).filter((x) => x.l.length || x.t.length);
const pc = solveFrame3D({ ...m3.input, pDelta: false, cases: LLm.map((x) => ({ loads: M3.map((_, j) => (j === x.i ? { loads: x.l, torque: x.t } : { loads: [], torque: [] })) })) });
const pd = solveFrame3D({ ...m3.input, pDelta: true });
const Q5 = (f) => [f[0], f[5], f[11], f[4], f[10]]; // f[0] = compression + (frame3d columnsOf: N = −m.N, m.N = −f[0]) // N, Mx bottom/top (about global X = local z), My bottom/top
const PCp = colPieces(m3.input.members);
const triple = (piece, coef) => { // coef[i] for each L case (D always 1): returns column (N, Mx, My)
  let N = -Infinity, Mx = 0, My = 0;
  for (const p of piece) { const base = Q5(pc.members[p].f), Ls = pc.cases.map((c) => Q5(c.members[p].f)), sumL = Ls.reduce((a, q) => a.map((v, j) => v + q[j]), [0, 0, 0, 0, 0]);
    const D = base.map((v, j) => v - sumL[j]), t = D.map((v, j) => v + Ls.reduce((s, q, i) => s + coef[i] * q[j], 0));
    N = Math.max(N, t[0]); Mx = Math.max(Mx, Math.abs(t[1]), Math.abs(t[2])); My = Math.max(My, Math.abs(t[3]), Math.abs(t[4])); }
  return { N, Mx, My }; };
const split = (piece) => { const p = piece[0], base = Q5(pc.members[p].f), Ls = pc.cases.map((c) => Q5(c.members[p].f)), sumL = Ls.reduce((a, q) => a.map((v, j) => v + q[j]), [0, 0, 0, 0, 0]);
  return { D: base.map((v, j) => v - sumL[j]), L: sumL, Ls }; };

// ---------- per column ----------
const rows = [];
for (const c of rA.columns) {
  if (!c.lv) continue; const f = c.floor, zb = f ? Z[f - 1] : 0, zt = Z[f], [x, y] = fr.floors[f].columns[c.i], key = `${f}|${c.i}`, nb = nodeAt(x, y, zb), nt = nodeAt(x, y, zt);
  const lv = c.lv, cs0 = { Bx: lv.Bx, By: lv.By, n: lv.n, bar: lv.mainBar.replace(/\s+/, " "), tie: lv.tieBar.replace(/\s+/, " "), s: lv.s }, Lu = (c.Lu ?? c.L) * 100;
  const ps = {}; for (const ax of ["x", "y"]) for (const md of ["sway", "braced", "63"]) ps[ax + md] = [psiAt(nb, ax, md), psiAt(nt, ax, md)];
  const kk = {}; for (const ax of ["x", "y"]) { const [b, t] = ps[ax + "sway"], [b2, t2] = ps[ax + "braced"], [b3, t3] = ps[ax + "63"], lean = b.psi > 50 && t.psi > 50;
    kk[ax] = { sway: lean ? 1 : kSway(b.psi, t.psi), swayEl: kSway(b.psi === Infinity ? Infinity : b.psiEl, t.psi === Infinity ? Infinity : t.psiEl), nonsway: kBraced(b2.psi, t2.psi), lean,
      k63: k63(t3.psi, b3.psi, b3.base === "pinned" || t3.psi > 1e3 || b3.psi > 1e3), hinged: b3.base === "pinned" || t3.psi > 1e3 || b3.psi > 1e3 }; kk[ax].k63f = kk[ax].hinged ? Math.max(2, kk[ax].k63) : Math.max(1, kk[ax].k63);
    if (b3.psi > 1e3 && t3.psi > 1e3) { kk[ax].k63 = kk[ax].k63f = 1; kk[ax].lean = true; } } // no rotational restraint at either end: leaning column (k = 1 itself)
  const pcs = PCp.get(key), coefAll = pc.cases.map(() => 1), sp = split(pcs);
  const trip = [{ name: "D + L เต็ม", ...triple(pcs, coefAll) }, { name: "D อย่างเดียว", ...triple(pcs, pc.cases.map(() => 0)) }];
  pcs.forEach((p) => [1, 2, 3, 4].forEach((q) => [1, -1].forEach((sg) => { const co = pc.cases.map((cc) => (sg * Q5(cc.members[p].f)[q] > 0 ? 1 : 0)); trip.push({ name: `${["", "Mx ล่าง", "Mx บน", "My ล่าง", "My บน"][q]} ${sg > 0 ? "+" : "−"}`, ...triple(pcs, co) }); })));
  const coN = (sg) => pc.cases.map((cc) => (sg * Q5(cc.members[pcs[0]].f)[0] > 0 ? 1 : 0)); trip.push({ name: "N สูงสุด", ...triple(pcs, coN(1)) }, { name: "N ต่ำสุด", ...triple(pcs, coN(-1)) });
  const pdM = triple(pcs, coefAll), pdel = (() => { let Mx = 0, My = 0; for (const p of pcs) { const q = Q5(pd.members[p].f); Mx = Math.max(Mx, Math.abs(q[1]), Math.abs(q[2])); My = Math.max(My, Math.abs(q[3]), Math.abs(q[4])); } return { Mx, My }; })();
  // WSD (318-63 type, own code): decision by Q (ACI 318-11) — non-sway: braced R (h = Lu); sway: R with h′ = k·Lu (k63 formula as column.js, and chart)
  const sw = sway[f], Rn = { braced: true, hx: Lu, hy: Lu }, R63 = { braced: false, hx: kk.x.k63f * Lu, hy: kk.y.k63f * Lu }, Rch = { braced: false, hx: kk.x.sway * Lu, hy: kk.y.sway * Lu };
  const Rd = sw ? R63 : Rn, RdC = sw ? Rch : Rn;
  const chk = (R) => { const ev = trip.filter((t) => t.N > 1).map((t) => ({ t, w: wsd({ ...cs0, P: t.N, Mx: t.Mx, My: t.My }, R) })), g = ev.reduce((a, e) => (!a || e.w.uB > a.w.uB ? e : a), null);
    const ax = wsd({ ...cs0, P: c.Pd ?? c.Pbot, Mx: 0, My: 0 }, R); return { gov: g?.t.name, uX: g?.w.uX, uY: g?.w.uY, uB: g?.w.uB, axial: ax.uB, detail: [...new Set([...(g?.w.detail ?? []), ...ax.detail])], ok: (!g || g.w.ok) && ax.ok, R: g?.w.R ?? ax.R, onlyTension: !g }; };
  // tension (N < 0 in some pattern): As·fs ≥ T, fs = 1,700 ksc (UNVERIFIED: ว.ส.ท. 0.5fy ≤ 1,700 / ACI 318-63 §1003 24 ksi ≈ 1,690); USD φAs·fy ≥ Tu (φ 0.9)
  const As = lv.n * BAR[cs0.bar][0], Tmin = Math.min(...trip.map((t) => t.N)), Tu = -(1.2 * sp.D[0] + 1.6 * Math.min(0, ...sp.Ls.map((q) => q[0])) + 1.6 * 0) , tension = Tmin < 0 ? { T: -Tmin, cap: As * 1700, ok: -Tmin <= As * 1700, fsAct: -Tmin / As, half: -Tmin / As <= 0.5 * mat.fy } : null;
  const pdr = Math.max(1, pdM.Mx > 50 ? pdel.Mx / pdM.Mx : 1, pdM.My > 50 ? pdel.My / pdM.My : 1);
  const chkA = (() => { const ev = trip.filter((t) => t.N > 1).map((t) => ({ t, w: wsd({ ...cs0, P: t.N, Mx: t.Mx * pdr, My: t.My * pdr }, Rn) })), g = ev.reduce((a, e) => (!a || e.w.uB > a.w.uB ? e : a), null);
    const ax = wsd({ ...cs0, P: c.Pd ?? c.Pbot, Mx: 0, My: 0 }, Rn); return { uB: g?.w.uB, uX: g?.w.uX, uY: g?.w.uY, axial: ax.uB, ok: (!g || g.w.ok) && ax.ok, detail: [...new Set([...(g?.w.detail ?? []), ...ax.detail])] }; })();
  // raw k from column.js formulas WITHOUT the h′ ≥ h / ≥ 2h floor (as coded)
  const dec = chk(Rd), decC = chk(RdC), allB = chk(Rn), all63 = chk(R63);
  // USD (separate): Pu = 1.2D + 1.6L of the full-load case, moment magnifier ACI 318-11 10.10.6 (non-sway, Cm = 1) / 10.10.7 Q method (sway)
  const Pu = 1.2 * sp.D[0] + 1.6 * sp.L[0], Mxu = Math.max(Math.abs(1.2 * sp.D[1] + 1.6 * sp.L[1]), Math.abs(1.2 * sp.D[2] + 1.6 * sp.L[2])), Myu = Math.max(Math.abs(1.2 * sp.D[3] + 1.6 * sp.L[3]), Math.abs(1.2 * sp.D[4] + 1.6 * sp.L[4]));
  const Ec = 15100 * Math.sqrt(mat.fcPrime), bd = (1.2 * sp.D[0]) / Math.max(Pu, 1), EIx = (0.4 * Ec * (lv.Bx * lv.By ** 3) / 12) / (1 + bd), EIy = (0.4 * Ec * (lv.By * lv.Bx ** 3) / 12) / (1 + bd);
  const kU = (ax) => Math.min(1, kk[ax].nonsway), // δns always with the non-sway k (10.10.6.3); sway part by δs = 1/(1 − Q) (10.10.7.4)
    Pcx = (Math.PI ** 2 * EIx) / (kU("x") * Lu) ** 2, Pcy = (Math.PI ** 2 * EIy) / (kU("y") * Lu) ** 2;
  const dns = (Pc) => (Pu < 0.75 * Pc ? Math.max(1, 1 / (1 - Pu / (0.75 * Pc))) : Infinity), ds = sw ? 1 / (1 - QACI[f]) : 1, magX = dns(Pcx) * ds, magY = dns(Pcy) * ds;
  let usdR = null; if (Pu > 0) { const w0 = wsd({ ...cs0, P: Pu / 1.55, Mx: 0, My: 0 }, Rn); const csU = { ...cs0, P: Pu / 1.55, Mx: (Mxu * magX) / 1.55, My: (Myu * magY) / 1.55 }; usdR = usd(csU, w0); }
  rows.push({ id: `${fr.floors[f].name} @(${x.toFixed(2)}, ${y.toFixed(2)})`, floor: f, x, y, lv: `${lv.Bx}×${lv.By} ${lv.n}-${cs0.bar} ${cs0.tie}@${lv.s}`, Lu: Lu / 100, free: !!c.free,
    Pacc: c.Pd ?? c.Pbot, N: trip[0].N, Nmin: Math.min(...trip.map((t) => t.N)), ND: sp.D[0], NL: sp.L[0], Mx: trip[0].Mx, My: trip[0].My,
    MxPat: Math.max(...trip.map((t) => t.Mx)), MyPat: Math.max(...trip.map((t) => t.My)), pdRatio: Math.max(pdM.Mx > 50 ? pdel.Mx / pdM.Mx : 1, pdM.My > 50 ? pdel.My / pdM.My : 1), pdel, first: pdM,
    psi: Object.fromEntries(Object.entries(ps).map(([k2, v]) => [k2, v.map((q) => ({ psi: q.psi, psiEl: q.psiEl, base: q.base, beams: q.beams }))])), k: kk,
    klr: { x63: (kk.x.k63f * Lu) / (0.3 * lv.By), y63: (kk.y.k63f * Lu) / (0.3 * lv.Bx), xCh: (kk.x.sway * Lu) / (0.3 * lv.By), yCh: (kk.y.sway * Lu) / (0.3 * lv.Bx), prog: Lu / (0.25 * lv.Bx) },
    prog: { ok: c.ok, util: c.check?.util }, sway: sw, tension, A: chkA, pdr, dec, decC, allB, all63, usd: { Pu, Mxu, Myu, magX, magY, ratio: usdR?.ratio ?? usdR, Pcx, Pcy } });
}
const out = { rawQ, lin, wind, Z, file, baseFixity: fr.baseFixity ?? "pinned", lateral: !!fr.lateral?.on, kref: KREF, Qtab, QACI, QSRV, sway, flexNames: Object.keys(PAT), rows, nLLcases: LLm.length };
const J = process.argv.indexOf("--json"); if (J > 0) fs.writeFileSync(process.argv[J + 1], JSON.stringify(out, (k, v) => (v === Infinity ? "∞" : v)));
const f2 = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : "∞");
console.log(file, "k check", KREF.map((r) => `${r.m}(${r.a},${r.b}) ${f2(r.k)}/${r.ref}`).join(" · "));
for (const q of Qtab) console.log(" ", q.name, "ΣD", f2(q.D, 0), "ΣL", f2(q.L, 0), q.rows.map((r) => `${r.name}: ${f2(Math.max(...r.Q.flat()), 3)}`).join(" | "));
console.log(" Q ACI max", QACI.map((q) => f2(q, 3)).join(", "), "service", QSRV.map((q) => f2(q, 3)).join(", "), "sway", sway.join(","));
const cnt = (k2) => rows.filter((r) => r[k2].ok).length;
console.log(" pass: decision(63 h′)", cnt("dec"), "decision(chart k)", cnt("decC"), "all braced", cnt("allB"), "all sway 63", cnt("all63"), "of", rows.length, "· program", rows.filter((r) => r.prog.ok).length, "· USD >1", rows.filter((r) => r.usd.ratio > 1).length, "· tension Nmin<0", rows.filter((r) => r.Nmin < 0).map((r) => `${r.id} ${f2(r.Nmin, 0)}`).join("; "), "· P-Delta/first max", f2(Math.max(...rows.map((r) => r.pdRatio)), 3), "· pattern/full Mx max", f2(Math.max(...rows.map((r) => r.MxPat / Math.max(r.Mx, 1))), 2));
for (const r of rows.filter((r) => !r.dec.ok)) console.log("  NG", r.id, r.lv, "P", f2(r.Pacc, 0), "N", f2(r.N, 0), "Mx", f2(r.MxPat, 0), "My", f2(r.MyPat, 0), "k63", f2(r.k.x.k63f), f2(r.k.y.k63f), "kch", f2(r.k.x.sway), f2(r.k.y.sway), "klr", f2(r.klr.x63, 0), f2(r.klr.y63, 0), "u", f2(r.dec.uB), r.dec.gov, r.dec.detail.join(","), "USD", f2(r.usd.ratio));
