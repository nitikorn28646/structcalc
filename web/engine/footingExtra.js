// Checks added outside the frozen, Excel diff-tested spreadFooting (engine/footing.js).
// Punching shear, conventional (footing audit 2026-11-05): the sheet takes HALF the footing load outside the d/2 section over the FULL
// perimeter (= ½ of V/(b₀·d)). Here v = (P − qn·(bx + d)(by + d)) / (b₀·d), qn = P/A, d = the smaller effective depth, b₀ = 2(bx + d) + 2(by + d),
// against the same allowable vcp = 0.53√f′c. A stricter check only — the sheet's own values stay as they are.
export function punchingFull(r, P, A) {
  const d = Math.min(r.dLong, r.dShort), cx = r.bx * 100 + d, cy = r.by * 100 + d, b0 = 2 * (cx + cy), Vp = Math.max(0, P - (P / (A * 1e4)) * cx * cy);
  const vpFull = Vp / (b0 * d);
  return { vpFull, VpFull: Vp, b0Full: b0, dPunch: d, vpFullOk: vpFull < r.vcp };
}
