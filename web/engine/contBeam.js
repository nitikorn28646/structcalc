// Continuous beam by the 1-D stiffness method (Euler–Bernoulli elements, 2 DOF per node: deflection, rotation).
// Units: m, kg, kg-m. Loads act downward. Supports are pins (no rotational restraint); a span past the last support is a cantilever.
//
// solveBeam({ x: [node positions, increasing], sup: [bool per node], EI: [per element] (optional, default 1),
//             loads: [{ a, b, wa, wb }  linear distributed load from a to b (line coordinates),
//                     { at, P }         point load] })
// → { R: [reaction per node, + up], el: [{ x0, L, V(x), M(x) local, Mmax, Mmin, Vmax, ML, MR }], V(x), M(x) over the whole line }
// Sign: M > 0 sagging (tension at the bottom), V = shear just right of x (+ when the left part is pushed up).

const GP = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]]; // Gauss–Legendre, exact for the quartic integrands here

// Hermite shape functions of an element of length L at local x
const shape = (x, L) => {
  const s = x / L;
  return [1 - 3 * s * s + 2 * s ** 3, L * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, L * (s ** 3 - s * s)];
};

// distributed load parts falling inside [x0, x1], in local coordinates
function partsIn(loads, x0, x1, last) { // a point load on a node belongs to the element on its right (the last element keeps its end)
  const out = [];
  for (const l of loads) {
    if (l.P !== undefined) { if (l.at >= x0 - 1e-9 && (l.at < x1 - 1e-9 || (last && l.at <= x1 + 1e-9))) out.push({ at: l.at - x0, P: l.P }); continue; }
    const a = Math.max(l.a, x0), b = Math.min(l.b, x1);
    if (b - a < 1e-9) continue;
    const w = (x) => l.wa + ((l.wb - l.wa) * (x - l.a)) / (l.b - l.a || 1);
    out.push({ a: a - x0, b: b - x0, wa: w(a), wb: w(b) });
  }
  return out;
}

// Gaussian elimination with partial pivoting; null when singular (unstable beam)
function solve(A, f) {
  const n = f.length, M = A.map((r, i) => [...r, f[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12 * (1 + Math.abs(M[c][c]))) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) { const k = M[r][c] / M[c][c]; for (let j = c; j <= n; j++) M[r][j] -= k * M[c][j]; }
  }
  return M.map((r, i) => r[n] / r[i]);
}

export function solveBeam({ x, sup, EI, loads }) {
  const nN = x.length, nE = nN - 1, nd = 2 * nN;
  const K = Array.from({ length: nd }, () => new Array(nd).fill(0)), F = new Array(nd).fill(0);
  const els = [];
  for (let e = 0; e < nE; e++) {
    const L = x[e + 1] - x[e], k = (EI?.[e] ?? 1) / L ** 3, parts = partsIn(loads, x[e], x[e + 1], e === nE - 1);
    const ke = [[12, 6 * L, -12, 6 * L], [6 * L, 4 * L * L, -6 * L, 2 * L * L], [-12, -6 * L, 12, -6 * L], [6 * L, 2 * L * L, -6 * L, 4 * L * L]].map((r) => r.map((v) => v * k));
    const fe = [0, 0, 0, 0]; // equivalent nodal loads (+ up, + counter-clockwise)
    for (const p of parts) {
      if (p.P !== undefined) { shape(p.at, L).forEach((N, i) => (fe[i] -= p.P * N)); continue; }
      const h = (p.b - p.a) / 2, m = (p.a + p.b) / 2;
      for (const [g, wt] of GP) {
        const xs = m + g * h, w = p.wa + ((p.wb - p.wa) * (xs - p.a)) / (p.b - p.a);
        shape(xs, L).forEach((N, i) => (fe[i] -= wt * h * w * N));
      }
    }
    const dof = [2 * e, 2 * e + 1, 2 * e + 2, 2 * e + 3];
    for (let i = 0; i < 4; i++) { F[dof[i]] += fe[i]; for (let j = 0; j < 4; j++) K[dof[i]][dof[j]] += ke[i][j]; }
    els.push({ x0: x[e], L, ke, fe, dof, parts });
  }
  const free = [...Array(nd).keys()].filter((d) => !(d % 2 === 0 && sup[d / 2]));
  const u = solve(free.map((i) => free.map((j) => K[i][j])), free.map((i) => F[i]));
  if (!u) return { error: "คานไม่มีเสถียรภาพ (จุดรองรับไม่พอ)" };
  const d = new Array(nd).fill(0);
  free.forEach((i, k) => (d[i] = u[k]));
  const R = new Array(nN).fill(0);
  for (const el of els) {
    const de = el.dof.map((i) => d[i]);
    const q = el.ke.map((r, i) => r.reduce((s, v, j) => s + v * de[j], 0) - el.fe[i]); // end forces on the element
    R[el.dof[0] / 2] += q[0]; R[el.dof[2] / 2] += q[2];
    const { parts, L } = el;
    // load resultant and its moment about x for the part of the element left of x
    const left = (xx) => parts.reduce(([W, Mw], p) => {
      if (p.P !== undefined) return p.at < xx - 1e-9 ? [W + p.P, Mw + p.P * (xx - p.at)] : [W, Mw];
      if (xx <= p.a) return [W, Mw];
      const b = Math.min(xx, p.b), wb = p.wa + ((p.wb - p.wa) * (b - p.a)) / (p.b - p.a), len = b - p.a;
      const Wp = ((p.wa + wb) / 2) * len, cx = (p.wa + wb) > 0 ? p.a + (len * (p.wa + 2 * wb)) / (3 * (p.wa + wb)) : p.a + len / 2;
      return [W + Wp, Mw + Wp * (xx - cx)];
    }, [0, 0]);
    el.V = (xx) => q[0] - left(xx)[0];
    el.M = (xx) => -q[1] + q[0] * xx - left(xx)[1];
    const xs = [...Array.from({ length: 41 }, (_, i) => (L * i) / 40), ...parts.map((p) => p.at).filter((v) => v !== undefined)];
    const Ms = xs.map(el.M), Vs = xs.flatMap((xx) => [el.V(xx), el.V(Math.min(L, xx + 1e-6))]);
    Object.assign(el, { Mmax: Math.max(0, ...Ms), Mmin: Math.min(0, ...Ms), Vmax: Math.max(...Vs.map(Math.abs)), ML: el.M(0), MR: el.M(L), d: [de[0], de[2]] });
  }
  const at = (xx) => els.find((el) => xx <= el.x0 + el.L + 1e-9) ?? els[els.length - 1];
  return { R, el: els, V: (xx) => { const el = at(xx); return el.V(xx - el.x0); }, M: (xx) => { const el = at(xx); return el.M(xx - el.x0); } };
}
