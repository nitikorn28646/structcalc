// Hand-calculation checks of the lateral loads (engine/lateral.js), the rigid-floor diaphragm and the load combinations
// (engine/frame3d.js cases). Usage: node cli/lateral-check.mjs → exit 1 on failure.
import { readFileSync } from "node:fs";
import { Ce, DEFAULT_COMBOS, expandCombos, seismicForces, windForces } from "../web/engine/lateral.js";
import { solveFrame3D } from "../web/engine/frame3d.js";
import { analyzeFrame } from "../web/engine/frame.js";

let bad = 0;
const near = (name, got, want, tol = 1e-4) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got.toFixed(5)} (want ${want.toFixed(5)})`);
};

// 1. wind: q = ½·1.25·V²/9.81, Ce open / rough terrain, one-storey box 10 × 6 m, storey 3 m
near("q (V50 = 25 m/s) kg/m²", windForces({ floors: [{ h: 3, columns: [[0, 0], [10, 6]] }], lateral: { wind: { on: true } } }).q, (0.5 * 1.25 * 625) / 9.81);
near("Ce open z = 20 m", Ce(20, "A"), 2 ** 0.2); near("Ce open z = 3 m (min 0.9)", Ce(3, "A"), 0.9); near("Ce rough z = 24 m", Ce(24, "B"), 0.7 * 2 ** 0.3);
{ // two floors: ground beams at 1 m, roof beams at 4 m, roofH 1 m → bands: ground 1…2.5, top 2.5…5 (above ground 1.5 and 4)
  const fr = { floors: [{ h: 1, columns: [[0, 0], [10, 0], [10, 6], [0, 6]] }, { h: 3, columns: [[0, 0], [10, 0], [10, 6], [0, 6]] }], lateral: { wind: { on: true, roofH: 1 } } };
  const w = windForces(fr), q = w.q, H = 4, CeL = Ce(H / 2, "A");
  const CplX = -(0.3 + ((0.5 - 0.3) * (H / 10 - 0.25)) / 0.75); // H/D = 4/10 between 0.25 (−0.3) and 1 (−0.5)
  near("wind X: leeward Cp (H/D = 0.4)", w.x.Cpl, CplX);
  near("wind X: top floor force", w.x.floors[1].F, (1 * q * 2 * (0.8 * Ce(4, "A") + -CplX * CeL)) * 6 * 2.5);
  near("wind X: ground floor force", w.x.floors[0].F, (1 * q * 2 * (0.8 * Ce(1.5, "A") + -CplX * CeL)) * 6 * 1.5);
  near("wind Y: base shear = Σ floors", w.y.V, w.y.floors[0].F + w.y.floors[1].F);
}
// 2. seismic: Ss 0.5, S1 0.2, site D → Fa 1.4, Fv 2.0; H = 6 m, T = 0.12 s (plateau), R 3, I 1
{
  const fr = { floors: [{ h: 3 }, { h: 3 }], lateral: { seismic: { on: true, Ss: 0.5, S1: 0.2, site: "D" } } }, s = seismicForces(fr, [100000, 50000]);
  near("SDS", s.SDS, (2 / 3) * 1.4 * 0.5); near("SD1", s.SD1, (2 / 3) * 2.0 * 0.2); near("T = 0.02H", s.T, 0.12);
  near("Cs = SDS·I/R", s.Cs, (2 / 3) * 1.4 * 0.5 / 3); near("V = Cs·W", s.V, s.Cs * 150000);
  near("F top = V·w·h / Σw·h (k = 1)", s.floors[1].F, (s.V * 50000 * 6) / (100000 * 3 + 50000 * 6));
  const t = seismicForces({ floors: [{ h: 3 }], lateral: { seismic: { on: true, Ss: 0.02, S1: 0.01, site: "B" } } }, [1000]);
  near("Cs minimum 0.01", t.Cs, 0.01);
}
// 3. combinations: W and E expand into ±X, ±Y; off → only gravity
near("combos, wind only", expandCombos({ lateral: { wind: { on: true } } }).length, 1 + 2 * 4);
near("combos, wind + earthquake", expandCombos({ lateral: { wind: { on: true }, seismic: { on: true } } }).length, 1 + 5 * 4);
near("combos, none", expandCombos({ lateral: {} }).length, DEFAULT_COMBOS.filter((c) => !c.W && !c.E).length);
// 4. rigid diaphragm: four cantilever columns (different sizes) at the corners of 6 × 4 m, load at the centroid with a torque.
//    Hand solution: u_i = u − θ(y_i − cy), v_i = v + θ(x_i − cx); Σkx·u_i = Fx, Σky·v_i = Fy, Σ(−kx·u_i·dy + ky·v_i·dx) + Σkt·θ = Mz
{
  const E = 2e9, h = 3, one = { beam: 1, column: 1, J: 1 }, P = [[0, 0, 0.3, 0.3], [6, 0, 0.2, 0.4], [6, 4, 0.25, 0.25], [0, 4, 0.2, 0.2]];
  const nodes = [], members = [];
  P.forEach(([x, y, b, d]) => { nodes.push({ x, y, z: 0, fixed: true }, { x, y, z: h }); members.push({ i: nodes.length - 2, j: nodes.length - 1, kind: "column", b, h: d }); });
  nodes.push({ x: 3, y: 2, z: h, master: true });
  const Fx = 1000, Fy = 600, Mz = 800, r = solveFrame3D({ E, factors: one, nodes, members, diaphragms: [{ master: 8, slaves: [1, 3, 5, 7] }], lateral: [{ n: 8, F: [Fx, Fy, Mz] }] });
  const J = (b, d) => { const a = Math.min(b, d), c = Math.max(b, d); return a ** 3 * c * (1 / 3 - 0.21 * (a / c) * (1 - a ** 4 / (12 * c ** 4))); };
  const k = P.map(([x, y, b, d]) => ({ dx: x - 3, dy: y - 2, kx: (3 * E * (d * b ** 3) / 12) / h ** 3, ky: (3 * E * (b * d ** 3) / 12) / h ** 3, kt: ((E / 2.4) * J(b, d)) / h }));
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const c of k) {
    A[0][0] += c.kx; A[0][2] += -c.kx * c.dy; A[1][1] += c.ky; A[1][2] += c.ky * c.dx;
    A[2][0] += -c.kx * c.dy; A[2][1] += c.ky * c.dx; A[2][2] += c.kx * c.dy ** 2 + c.ky * c.dx ** 2 + c.kt;
  }
  const solve3 = (M, b) => { const m = M.map((row, i) => [...row, b[i]]); for (let c = 0; c < 3; c++) { for (let r2 = 0; r2 < 3; r2++) if (r2 !== c) { const f = m[r2][c] / m[c][c]; for (let j = c; j < 4; j++) m[r2][j] -= f * m[c][j]; } } return m.map((row, i) => row[3] / row[i]); };
  const [u, v, th] = solve3(A, [Fx, Fy, Mz]);
  near("diaphragm u", r.u[8 * 6], u, 3e-3); near("diaphragm v", r.u[8 * 6 + 1], v, 3e-3); near("diaphragm θ", r.u[8 * 6 + 5], th, 3e-3);
  near("column 2 shear Rx", -r.R[2][0], k[1].kx * (u - th * k[1].dy), 3e-3);
  near("Σ base Rx = −Fx", r.R.reduce((s, x) => s + x[0], 0), -Fx, 1e-6); near("Σ base Ry = −Fy", r.R.reduce((s, x) => s + x[1], 0), -Fy, 1e-6);
}
// 5. Yasothon with wind: combination D+L equals the gravity analysis; base shear of 0.6D+W +X = wind base shear
{
  const pj = JSON.parse(readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url), "utf8")), res = analyzeFrame({ ...pj.frame, lateral: { wind: { on: true } } });
  const f3 = res.frame3d, g = f3.combos.find((c) => c.name === "D+L"), wx = f3.combos.find((c) => c.name === "0.6D+W +X");
  near("D+L combo ΣRz = total load", g.base.reduce((s, b) => s + b.R[2], 0), f3.load, 1e-6);
  near("0.6D+W +X ΣRx = −Vx", wx.base.reduce((s, b) => s + b.R[0], 0), -res.lateral.wind.x.V, 1e-6);
  near("D+L combo span = gravity frame span (first)", g.spans[0].Mpos, f3.spans[0].Mpos, 1e-6);
}
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
