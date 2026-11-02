// Closed-form checks of the 3D frame solver. Usage: node cli/frame3d-check.mjs → exit 1 on failure.
import { solveFrame3D } from "../web/engine/frame3d.js";

let bad = 0;
const near = (name, got, want, tol = 1e-4) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got.toFixed(5)} (want ${want.toFixed(5)})`);
};
const E = 2e9, one = { beam: 1, column: 1, J: 1 }, w = 1000, L = 5;
// 1. fixed-fixed beam, UDL: end moments −wL²/12, mid-span +wL²/24, reactions wL/2
let r = solveFrame3D({ E, factors: one, nodes: [{ x: 0, y: 0, z: 3, fixed: true }, { x: L, y: 0, z: 3, fixed: true }],
  members: [{ i: 0, j: 1, kind: "beam", b: 0.2, h: 0.5, loads: [{ a: 0, b: L, wa: w, wb: w }] }] });
near("fixed beam M end", r.members[0].ML, (-w * L * L) / 12); near("fixed beam M mid", r.members[0].M(L / 2), (w * L * L) / 24); near("fixed beam Rz", r.R[0][2], (w * L) / 2);
// 2. propped: pinned (released) end at j on a fixed support → M at i = −wL²/8, R_j = 3wL/8
r = solveFrame3D({ E, factors: one, nodes: [{ x: 0, y: 0, z: 3, fixed: true }, { x: L, y: 0, z: 3, fixed: true }],
  members: [{ i: 0, j: 1, kind: "beam", b: 0.2, h: 0.5, release: [false, true], loads: [{ a: 0, b: L, wa: w, wb: w }] }] });
near("released end M_i", r.members[0].ML, (-w * L * L) / 8); near("released end M_j", r.members[0].MR, 0); near("released end R_j", r.R[1][2], (3 * w * L) / 8);
// 3. cantilever column, lateral H at the top along X and Y: δ = H·h³ / (3EI)
const h = 3, H = 1000, Bx = 0.3, By = 0.2, col = { nodes: [{ x: 0, y: 0, z: 0, fixed: true }, { x: 0, y: 0, z: h }], members: [{ i: 0, j: 1, kind: "column", b: Bx, h: By }] };
r = solveFrame3D({ E, factors: one, ...col, lateral: [{ n: 1, F: [H, H] }] });
near("column δx (bending about Y, I = By·Bx³/12)", r.disp(1)[0], (H * h ** 3) / (3 * E * (By * Bx ** 3) / 12));
near("column δy (I = Bx·By³/12)", r.disp(1)[1], (H * h ** 3) / (3 * E * (Bx * By ** 3) / 12));
near("column base moment", r.R[0][4], -H * h, 1e-6);
// 4. P-Delta: axial P = 30 % of the Euler load → δ ≈ δ₀ / (1 − P/Pcr), Pcr = π²EI / (2h)²
const I = (By * Bx ** 3) / 12, Pcr = (Math.PI ** 2 * E * I) / (2 * h) ** 2, P = 0.3 * Pcr;
r = solveFrame3D({ E, factors: one, ...col, nodeLoads: [{ n: 1, P }], lateral: [{ n: 1, F: [H, 0] }], pDelta: true });
near("P-Delta amplification", r.disp(1)[0] / ((H * h ** 3) / (3 * E * I)), 1 / (1 - 0.3), 0.02);
// 5. portal frame: equilibrium of the base reactions with the loads
r = solveFrame3D({ E, factors: { beam: 0.5, column: 0.7, J: 0.2 },
  nodes: [{ x: 0, y: 0, z: 0, fixed: true }, { x: 0, y: 0, z: 3 }, { x: 6, y: 0, z: 3 }, { x: 6, y: 0, z: 0, fixed: true }],
  members: [{ i: 0, j: 1, kind: "column", b: 0.2, h: 0.2 }, { i: 1, j: 2, kind: "beam", b: 0.2, h: 0.5, loads: [{ a: 0, b: 6, wa: 800, wb: 800 }, { at: 2, P: 1500 }] }, { i: 3, j: 2, kind: "column", b: 0.2, h: 0.2 }],
  lateral: [{ n: 1, F: [500, 0] }] });
near("portal ΣRz", r.R[0][2] + r.R[3][2], 800 * 6 + 1500); near("portal ΣRx", r.R[0][0] + r.R[3][0], -500);
process.exit(bad ? 1 : 0);
