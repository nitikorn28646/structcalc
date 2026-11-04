// Independent beam analysis for the audits (no program code): force method on a fine mesh, double integration, moment-area.
// ---------- independent continuous beam: force method (redundant = interior support reactions), fine mesh ----------
// beam on the x axis, supports at xs (pins), ends may overhang; EI(x) piecewise; loads: [{a,b,w}] kg/m (uniform pieces), [{at,P}]
export function forceMethod(L, xs, EIf, loads, N = 4000) {
  const h = L / N, X = Array.from({ length: N + 1 }, (_, i) => i * h);
  const sA = xs[0], sB = xs[xs.length - 1], red = xs.slice(1, -1);
  // statics of the primary structure (pins at sA, sB) under a load set → M(x)
  const Mprim = (ld, unit = null) => { // unit: { at } unit downward load
    const all = unit ? [{ at: unit.at, P: 1 }] : ld;
    let RB = 0, W = 0; // moments about sA
    for (const l of all) { if (l.P !== undefined) { RB += l.P * (l.at - sA); W += l.P; } else { const F = l.w * (l.b - l.a), xc = (l.a + l.b) / 2; RB += F * (xc - sA); W += F; } }
    RB /= sB - sA; const RA = W - RB;
    return X.map((x) => { let M = 0; if (x > sA) M += RA * (x - sA); if (x > sB) M += RB * (x - sB);
      for (const l of all) { if (l.P !== undefined) { if (l.at < x) M -= l.P * (x - l.at); } else { const b = Math.min(l.b, x); if (b > l.a) M -= l.w * (b - l.a) * (x - (l.a + b) / 2); } } return M; });
  };
  const EI = X.map(EIf), integ = (f) => { let s = 0; for (let i = 0; i < N; i++) s += ((f(i) + f(i + 1)) / 2) * h; return s; };
  const M0 = Mprim(loads), m = red.map((r) => Mprim(null, { at: r }));
  // compatibility: deflection at each redundant = 0 (upward reactions R): Σ f_ij R_j = δ_i0, δ_i0 = ∫ M0 m_i / EI
  const n = red.length, A = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => integ((k) => (m[i][k] * m[j][k]) / EI[k]))), bvec = red.map((_, i) => integ((k) => (M0[k] * m[i][k]) / EI[k]));
  const R = solve(A, bvec); // reactions upward at interior supports
  const M = X.map((_, k) => M0[k] - R.reduce((s, Rj, j) => s + Rj * m[j][k], 0));
  return { X, M, EI, h, R };
}
export function solve(A, b) { const n = b.length, M = A.map((r, i) => [...r, b[i]]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r; [M[c], M[p]] = [M[p], M[c]];
  for (let r = 0; r < n; r++) if (r !== c) { const f = M[r][c] / M[c][c]; for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k]; } } return M.map((r, i) => r[n] / r[i]); }
// deflection by double integration of M/EI (sagging + → downward), boundary v = 0 at the first two supports
export function doubleInt(fm, xs) { const { X, M, EI, h } = fm, N = X.length - 1, th = [0], v = [0];
  for (let i = 1; i <= N; i++) { th.push(th[i - 1] + ((M[i - 1] / EI[i - 1] + M[i] / EI[i]) / 2) * h); v.push(v[i - 1] + ((th[i - 1] + th[i]) / 2) * h); }
  const ia = Math.round(xs[0] / h), ib = Math.round(xs[1] / h), c1 = (v[ib] - v[ia]) / (X[ib] - X[ia]), c0 = v[ia] - c1 * X[ia];
  return v.map((vi, i) => -(vi - c0 - c1 * X[i])); } // + = down
// moment-area: deflection at x between supports a < x < b = (x−a)/(b−a)·t_b/a − t_x/a (tangential deviations about the left support tangent)
export function momentArea(fm, a, b, x) { const { X, M, EI, h } = fm, k0 = Math.round(a / h), kb = Math.round(b / h), kx = Math.round(x / h), mom = (k1, xp) => { let s = 0; for (let k = k0; k < k1; k++) { const xm = (X[k] + X[k + 1]) / 2, mm = ((M[k] / EI[k] + M[k + 1] / EI[k + 1]) / 2) * h; s += mm * (xp - xm); } return s; };
  return ((x - a) / (b - a)) * mom(kb, X[kb]) - mom(kx, X[kx]); }

