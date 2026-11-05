// Column audit round 2 (user 2026-11-05) — READ ONLY, no program code changed.
// For every column of a project: forces from the program (accumulated P with live-load patterns; 3D frame N, Mx, My — one load case D + L
// when lateral is off), sway check by the stability index Q = ΣPu·Δo/(Vus·lc) per storey (ACI 318-11 10.10.5.2; Δo from a first-order
// 3D solve with a test lateral load ∝ floor weight on rigid diaphragms, cracked 0.7Ig columns / program 0.5Ig beams), effective length
// factor k from the joint stiffness ratios ψ (alignment-chart equations, 0.70Ig columns, 0.35Ig beams, pinned beam ends excluded,
// pinned base ψ = ∞, fixed base ψ = 1, free top ψ = ∞), then the independent WSD check (ACI 318-63: braced R = 1.32 − 0.006h/r,
// unbraced R = 1.07 − 0.008·k·h/r, r = 0.3t of the bending direction) for 4 variants Axial/Frame × Braced/Unbraced, X / Y / biaxial.
// Ultimate strength (strain compatibility + Bresler, φ 0.65 vs 1.55P, sway moments × δs = 1/(1 − Q)) is reported SEPARATELY.
// node cli/audit-column2.mjs web/public/projects/x.json [--json out.json]
import fs from "fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { frame3dModel, solveFrame3D } from "../web/engine/frame3d.js";

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

// ---- program results ----
const rA = analyzeFrame({ ...fr, colMethod: "axial" }), rF = analyzeFrame({ ...fr, colMethod: "frame" });
const latOn = !!fr.lateral?.on;
const m3 = rA.frame3d, NODES = m3.input.nodes, MEM = m3.input.members;
const Z = []; { let z = 0; for (const f of fr.floors) Z.push((z += f.h ?? 3)); }
// stability index: test load ∝ floor weight (columns' 3D N difference per storey), first order
const Nfl = fr.floors.map((_, k) => m3.columns.filter((c) => c.floor === k).reduce((s, c) => s + Math.max(0, c.N), 0)); // storey gravity ΣP (3D, D + L)
const Wfl = Nfl.map((N, k) => N - (Nfl[k + 1] ?? 0)), test = Wfl.map((w) => 0.01 * Math.max(w, 1));
const lat = frame3dModel(fr, rA, { pDelta: false, lateral: { cases: [{ key: "Wx", F: test.map((v) => [v, 0]) }, { key: "Wy", F: test.map((v) => [0, v]) }], combos: [] } });
// own first-order solve of the same model with ACI 318-11 10.10.4.1 stiffnesses (0.70Ig columns, 0.35Ig beams); storey drift = translation of
// the floor master node (rigid diaphragm) minus the floor below
const DI = lat.diaphragms, zOf = (d) => DI.findIndex((x) => Math.abs(x.z - d) < 1e-6);
const cs2 = [0, 1].map((ax) => ({ lateral: DI.map((d) => { const k = Z.findIndex((z) => Math.abs(z - d.z) < 1e-6); return { n: d.master, F: ax ? [0, test[k], 0] : [test[k], 0, 0] }; }) }));
const own = solveFrame3D({ ...lat.input, diaphragms: DI, cases: cs2, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 } });
const storeys = fr.floors.map((f, k) => {
  const V = test.slice(k).reduce((s, v) => s + v, 0), d = zOf(Z[k]), db = k ? zOf(Z[k - 1]) : -1, q = {};
  for (const ax of [0, 1]) { const u = own.cases[ax].u, dd = Math.abs((d >= 0 ? u[DI[d].master * 6 + ax] : 0) - (db >= 0 ? u[DI[db].master * 6 + ax] : 0));
    q[ax] = { dd, Q: (1.55 * Nfl[k] * dd) / (V * (f.h ?? 3)), Qs: (Nfl[k] * dd) / (V * (f.h ?? 3)), Qprog: (1.55 * Nfl[k] * (lat.drifts[ax ? "Wy" : "Wx"][d]?.dd ?? 0)) / (V * (f.h ?? 3)) }; }
  return { name: f.name, h: f.h, P: Nfl[k], V, Qx: q[0].Q, Qy: q[1].Q, QxS: q[0].Qs, QyS: q[1].Qs, QxP: q[0].Qprog, QyP: q[1].Qprog, sway: Math.max(q[0].Q, q[1].Q) > 0.05 };
});
// ψ at a node about global X (rotation in the y-z plane) / about Y
const EIc = (m, ax) => (0.7 * m.E * (ax === "x" ? m.b * m.h ** 3 : m.h * m.b ** 3)) / 12; // column: b = Bx, h = By
const len = (m) => Math.hypot(NODES[m.j].x - NODES[m.i].x, NODES[m.j].y - NODES[m.i].y, NODES[m.j].z - NODES[m.i].z);
function psi(n, ax) {
  if (NODES[n].pinned) return Infinity; if (NODES[n].fixed) return 1;
  let c = 0, b = 0;
  for (const m of MEM) { if (m.i !== n && m.j !== n) continue; const L = len(m);
    if (m.kind === "column") c += EIc(m, ax) / L;
    else { const dx = Math.abs(NODES[m.j].x - NODES[m.i].x), dy = Math.abs(NODES[m.j].y - NODES[m.i].y), end = m.i === n ? 0 : 1; if (m.release?.[end]) continue;
      // bending about X is resisted by beams running along Y (and the X-component of a skew beam)
      const w = ax === "x" ? dy / L : dx / L; b += (w * 0.35 * m.E * m.b * m.h ** 3) / 12 / L; } }
  return b > 0 ? c / b : Infinity;
}
const nodeAt = (x, y, z) => NODES.findIndex((p) => !p.master && Math.abs(p.z - z) < 1e-6 && Math.hypot(p.x - x, p.y - y) < 0.035);
const rows = [];
for (const c of rA.columns) {
  if (!c.lv) continue; const f = fr.floors[c.floor], zb = c.floor ? Z[c.floor - 1] : 0, zt = Z[c.floor], [x, y] = fr.floors[c.floor].columns[c.i];
  const nb = nodeAt(x, y, zb), nt = nodeAt(x, y, zt), cF = rF.columns.find((q) => q.floor === c.floor && q.i === c.i), f3 = c.f3 ?? { N: 0, Mx: 0, My: 0 };
  const lv = c.lv, cs0 = { Bx: lv.Bx, By: lv.By, n: lv.n, bar: lv.mainBar.replace(/\s+/, " "), tie: lv.tieBar.replace(/\s+/, " "), s: lv.s };
  const Lu = (c.Lu ?? c.L) * 100, psX = [psi(nb, "x"), psi(nt, "x")], psY = [psi(nb, "y"), psi(nt, "y")];
  // both ends without rotational restraint in a plane = leaning column (held by the diaphragm through the other columns): k = 1 for itself
  const lean = (p) => p[0] > 50 && p[1] > 50, kx = lean(psX) ? 1 : kSway(...psX), ky = lean(psY) ? 1 : kSway(...psY), kbx = kBraced(...psX), kby = kBraced(...psY);
  const st = storeys[c.floor];
  const axial = { ...cs0, P: c.Pd ?? c.Pbot, Mx: 0, My: 0 }, frame = { ...cs0, P: Math.max(c.Pd ?? c.Pbot, f3.N), Mx: f3.Mx, My: f3.My };
  const B = { braced: true, hx: Lu, hy: Lu }, U = { braced: false, hx: kx * Lu, hy: ky * Lu };
  const v = { AB: wsd(axial, B), AU: wsd(axial, U), FB: wsd(frame, B), FU: wsd(frame, U) };
  // apples to apples with the program: its own section and inputs of each mode, its slenderness rule (1.07 − 0.008·h/r, k = 1)
  const secOf = (q) => ({ Bx: q.lv.Bx, By: q.lv.By, n: q.lv.n, bar: q.lv.mainBar.replace(/\s+/, " "), tie: q.lv.tieBar.replace(/\s+/, " "), s: q.lv.s });
  const K1 = { prog: true, hx: Lu, hy: Lu };
  v.PA = wsd({ ...secOf(c), P: c.Pd ?? c.Pbot, Mx: 0, My: 0 }, K1);
  if (cF?.lv) { const g = cF.f3 ?? f3; v.PF = wsd({ ...secOf(cF), P: Math.max(cF.Pd ?? cF.Pbot, g.N), Mx: g.Mx, My: g.My }, K1); v.PF.sec = `${cF.lv.Bx}×${cF.lv.By} ${cF.lv.n}-${cF.lv.mainBar}`; }
  v.AD = st.sway ? v.AU : v.AB; v.FD = st.sway ? v.FU : v.FB; // decision by Q of the storey
  const Qm = Math.max(st.Qx, st.Qy), ds = Qm > 0.05 && Qm < 1 ? 1 / (1 - Qm) : Qm >= 1 ? Infinity : 1;
  const usdB = usd(frame, v.FB), usdS = Number.isFinite(ds) ? usd(frame, v.FU, ds) : Infinity;
  rows.push({ id: `${f.name} @(${x.toFixed(2)}, ${y.toFixed(2)})`, floor: c.floor, x, y, lv: `${lv.Bx}×${lv.By} ${lv.n}-${cs0.bar} ${cs0.tie}@${lv.s}`, typeName: c.typeName ?? lv.name,
    Lu: Lu / 100, Pacc: axial.P, N3: f3.N, Mx: f3.Mx, My: f3.My, psX, psY, kx, ky, kbx, kby, sway: st.sway, Q: Qm, leanX: lean(psX), leanY: lean(psY), free: !!c.free,
    prog: { A: { ok: c.ok, util: c.check?.util }, F: { ok: cF?.ok, util: cF?.check?.util } },
    v: Object.fromEntries(Object.entries(v).map(([k2, w]) => [k2, { uX: w.uX, uY: w.uY, uB: w.uB, R: w.R, ok: w.ok, strengthOk: w.strengthOk, detail: w.detail, sec: w.sec }])), secF: cF?.lv ? `${cF.lv.Bx}×${cF.lv.By} ${cF.lv.n}-${cF.lv.mainBar}` : null, usdB, usdS, ds,
    combos: c.combos?.length ?? 0 });
}
const out = { file, latOn, baseFixity: fr.baseFixity ?? "pinned", storeys, rows,
  check: { gravity3D: m3.base.reduce((s, b) => s + b.R[2], 0), load3D: m3.load, accBase: rA.columns.filter((c) => c.floor === 0).reduce((s, c) => s + (c.Pd ?? c.Pbot), 0) } };
const J = process.argv.indexOf("--json"); if (J > 0) fs.writeFileSync(process.argv[J + 1], JSON.stringify(out, null, 1));
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : "∞");
console.log(file, "lateral", latOn, "base", out.baseFixity, "ΣRz 3D", out.check.gravity3D.toFixed(0), "load", out.check.load3D.toFixed(0), "Σ acc base", out.check.accBase.toFixed(0));
for (const s of storeys) console.log(" storey", s.name, "h", s.h, "ΣP", s.P.toFixed(0), "Q 0.35Ig", s.Qx.toFixed(3), s.Qy.toFixed(3), "service", s.QxS.toFixed(3), s.QyS.toFixed(3), "prog 0.5Ig max joint", s.QxP.toFixed(3), s.QyP.toFixed(3), s.sway ? "SWAY" : "braced (Q ≤ 0.05)");
const cnt = (k2) => rows.filter((r) => r.v[k2].ok).length;
console.log(" pass AB/AU/FB/FU/AD/FD", cnt("AB"), cnt("AU"), cnt("FB"), cnt("FU"), cnt("AD"), cnt("FD"), "of", rows.length, "· prog axial", rows.filter((r) => r.prog.A.ok).length, "prog frame", rows.filter((r) => r.prog.F.ok).length, "· USD braced>1", rows.filter((r) => r.usdB > 1).length, "USD sway>1", rows.filter((r) => r.usdS > 1).length);
for (const r of rows.filter((r) => !r.v.FD.ok || !r.v.FB.ok || !r.v.AD.ok)) console.log("  ", r.id, r.lv, "P", r.Pacc.toFixed(0), "N3", r.N3.toFixed(0), "Mx", r.Mx.toFixed(0), "My", r.My.toFixed(0), "k", f2(r.kx), f2(r.ky), "AB", f2(r.v.AB.uB), "AU", f2(r.v.AU.uB), "FB", f2(r.v.FB.uB), "FU", f2(r.v.FU.uB), "FD", f2(r.v.FD.uB), r.v.FD.detail.join(","), r.leanX || r.leanY ? "lean" : "", r.free ? "freeTop" : "", "USD", f2(r.usdB), f2(r.usdS));
const dif = rows.filter((r) => (r.prog.A.ok && !r.v.PA.strengthOk) || (r.prog.F.ok && r.v.PF && !r.v.PF.strengthOk));
console.log(" program pass but own WSD (same section, same inputs, same k = 1) NG:", dif.length, dif.slice(0, 5).map((r) => `${r.id} A ${f2(r.prog.A.util)}/${f2(r.v.PA.uB)} F ${f2(r.prog.F.util)}/${f2(r.v.PF?.uB)} ${r.secF}`).join(" · "));
const retyped = rows.filter((r) => r.secF && r.secF.replace(/\s+/g, "") !== r.lv.split(" RB")[0].replace(/\s+/g, "")); console.log(" frame mode re-typed", retyped.length, "columns");
