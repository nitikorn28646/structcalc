// Closed-form checks of the continuous-beam solver. Usage: node contbeam-check.mjs → one line per case, exit 1 on failure.
import { solveBeam } from "../web/engine/contBeam.js";

let bad = 0;
const near = (name, got, want, tol = 1e-6) => {
  const ok = Math.abs(got - want) <= tol * Math.max(1, Math.abs(want));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got.toFixed(4)} (want ${want.toFixed(4)})`);
};
const w = 1000, L = 4, P = 2000;
// simple span UDL: M = wL²/8, R = wL/2
let r = solveBeam({ x: [0, L], sup: [true, true], loads: [{ a: 0, b: L, wa: w, wb: w }] });
near("simple UDL Mmax", r.el[0].Mmax, (w * L * L) / 8); near("simple UDL R", r.R[0], (w * L) / 2);
// two equal spans UDL: Msup = −wL²/8, Rmid = 1.25wL, Rend = 0.375wL, M+ = 9wL²/128
r = solveBeam({ x: [0, L, 2 * L], sup: [true, true, true], loads: [{ a: 0, b: 2 * L, wa: w, wb: w }] });
near("2-span Msup", r.M(L), (-w * L * L) / 8); near("2-span Rmid", r.R[1], 1.25 * w * L); near("2-span Rend", r.R[0], 0.375 * w * L);
near("2-span M+", r.el[0].Mmax, (9 * w * L * L) / 128);
// three equal spans UDL: Msup = −0.1wL², Rint = 1.1wL
r = solveBeam({ x: [0, L, 2 * L, 3 * L], sup: [true, true, true, true], loads: [{ a: 0, b: 3 * L, wa: w, wb: w }] });
near("3-span Msup", r.M(L), -0.1 * w * L * L); near("3-span Rint", r.R[1], 1.1 * w * L);
// simple span, point load at a = 1: M = Pab/L
r = solveBeam({ x: [0, L], sup: [true, true], loads: [{ at: 1, P }] });
near("point M", r.el[0].Mmax, (P * 1 * 3) / L); near("point RL", r.R[0], (P * 3) / L);
// simple span + overhang a = 1.5 (UDL everywhere): Msupport = −wa²/2, Rnear = w(L² + a²)/(2L) + wa
r = solveBeam({ x: [0, L, L + 1.5], sup: [true, true, false], loads: [{ a: 0, b: L + 1.5, wa: w, wb: w }] });
near("cantilever Msup", r.M(L), (-w * 1.5 ** 2) / 2); near("cantilever Rnear", r.R[1], (w / (2 * L)) * (L * L + 1.5 ** 2) + w * 1.5);
// triangular load 0→w on a simple span: Mmax = wL²/(9√3), R = wL/6, wL/3
r = solveBeam({ x: [0, L], sup: [true, true], loads: [{ a: 0, b: L, wa: 0, wb: w }] });
near("triangle Mmax", r.el[0].Mmax, (w * L * L) / (9 * Math.sqrt(3)), 1e-3); near("triangle RL", r.R[0], (w * L) / 6);
// symmetric trapezoid (ramps 1 m) on a fixed-free check via equilibrium: ΣR = total load
r = solveBeam({ x: [0, 2, 5], sup: [true, true, true], loads: [{ a: 0, b: 1, wa: 0, wb: w }, { a: 1, b: 4, wa: w, wb: w }, { a: 4, b: 5, wa: w, wb: 0 }] });
near("trapezoid ΣR", r.R.reduce((a, b) => a + b, 0), w * 4);
// unstable: one support only
console.log(solveBeam({ x: [0, L], sup: [true, false], loads: [] }).error ? "ok   unstable detected" : (bad++, "FAIL unstable not detected"));
process.exit(bad ? 1 : 0);
