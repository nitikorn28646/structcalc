// Clean joints for the 3D view (user 2026-11-04: beams / columns / slabs should meet like the real thing, and pieces lying in one
// another flickered — z-fighting of coplanar faces). Pure geometry, plan coordinates:
// - a beam end at a column stops at the column face; a beam passing over a column is cut around it;
// - at a beam-to-beam joint the main one (deepest, then widest, then a beam running straight through) runs through and covers
//   the corner, the others stop at its face;
// - slab panels are shrunk to the inner faces of their beams, cantilever slabs start at the beam face.
const TOL = 0.03;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]), dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];

// beams: [{ a, b, w, h, arc }], cols: [{ p, B, D }] → per beam [[p, q], …] solid pieces (arc beams: null = draw as before)
export function beamPieces(beams, cols) {
  const geo = beams.map((b) => { const d = sub(b.b, b.a), L = len(d); return { L, u: L ? [d[0] / L, d[1] / L] : [1, 0] }; });
  const colAt = (p) => cols.find((c) => len(sub(c.p, p)) < TOL);
  const halfCol = (c, u) => (Math.abs(u[0]) * c.B + Math.abs(u[1]) * c.D) / 2;
  const rank = (i) => [beams[i].h, beams[i].w, -i];
  const better = (i, j) => { const a = rank(i), b = rank(j); for (let k = 0; k < 3; k++) if (a[k] !== b[k]) return a[k] > b[k]; return false; };
  // half width of beam j seen along beam i (crossing angle)
  const face = (i, j) => { const s = Math.abs(crs(geo[i].u, geo[j].u)); return s < 0.2 ? 0 : beams[j].w / 2 / s; };
  return beams.map((b, i) => {
    if (b.arc?.s || geo[i].L < TOL) return null;
    const { L, u } = geo[i], ends = [0, L].map((t, e) => {
      const E = e ? b.b : b.a, c = colAt(E);
      if (c) return halfCol(c, u) * (e ? -1 : 1); // stop at the column face
      // other beams at this point: passing through (E inside them) or ending here
      const through = [], ending = [];
      beams.forEach((o, j) => {
        if (j === i || o.arc?.s || geo[j].L < TOL) return;
        const d = sub(E, o.a), tt = dot(d, geo[j].u);
        if (Math.abs(crs(geo[j].u, d)) > TOL || tt < -TOL || tt > geo[j].L + TOL) return;
        if (Math.abs(crs(u, geo[j].u)) < 0.2) return; // collinear continuation: just meets
        (tt > TOL && tt < geo[j].L - TOL ? through : ending).push(j);
      });
      if (through.length) return Math.max(...through.map((j) => face(i, j))) * (e ? -1 : 1);
      if (!ending.length) return 0;
      const top = ending.every((j) => better(i, j)) || (ending.length && beams.some((o, j) => j !== i && Math.abs(crs(u, geo[j].u)) < 0.2 && (len(sub(o.a, E)) < TOL || len(sub(o.b, E)) < TOL) && ending.every((m) => better(j, m))));
      if (top) return -Math.max(...ending.map((j) => face(i, j))) * (e ? -1 : 1); // main: covers the corner
      const main = ending.reduce((m, j) => (better(j, m) ? j : m), ending[0]);
      return face(i, main) * (e ? -1 : 1);
    });
    let t0 = ends[0], t1 = L + ends[1];
    // columns along the beam (not at its ends): cut around them
    const gaps = cols.map((c) => { const d = sub(c.p, b.a), t = dot(d, u); return Math.abs(crs(u, d)) < TOL && t > TOL && t < L - TOL ? [t - halfCol(c, u), t + halfCol(c, u)] : null; }).filter(Boolean).sort((x, y) => x[0] - y[0]);
    const out = [], P = (t) => [b.a[0] + u[0] * t, b.a[1] + u[1] * t];
    for (const [g0, g1] of gaps) { if (g0 - t0 > 1e-3) out.push([P(t0), P(g0)]); t0 = Math.max(t0, g1); }
    if (t1 - t0 > 1e-3) out.push([P(t0), P(t1)]);
    return out;
  });
}

// width of the beam lying along a plan edge p–q (0 when none)
export function edgeWidth(beams, p, q) {
  const d = sub(q, p), L = len(d); if (L < TOL) return 0;
  const u = [d[0] / L, d[1] / L], m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  let w = 0;
  for (const b of beams) {
    if (b.arc?.s) continue;
    const e = sub(b.b, b.a), Lb = len(e); if (Lb < TOL) continue;
    const v = [e[0] / Lb, e[1] / Lb], dm = sub(m, b.a), t = dot(dm, v);
    if (Math.abs(crs(u, v)) < 1e-3 && Math.abs(crs(v, dm)) < TOL && t > -TOL && t < Lb + TOL) w = Math.max(w, b.w);
  }
  return w;
}

// polygon shrunk by off[i] (≥ 0) along edge i (P[i] → P[i+1]); corners = crossings of the shifted edges
export function insetPolygon(P, off) {
  const n = P.length; if (n < 3) return P;
  const area = P.reduce((s, p, i) => s + crs(p, P[(i + 1) % n]), 0), sg = area > 0 ? 1 : -1; // inward normal = left for CCW
  const lines = P.map((p, i) => { const q = P[(i + 1) % n], d = sub(q, p), L = len(d) || 1, nrm = [(-d[1] / L) * sg, (d[0] / L) * sg]; return { p: [p[0] + nrm[0] * off[i], p[1] + nrm[1] * off[i]], d }; });
  const out = lines.map((l, i) => {
    const a = lines[(i + n - 1) % n], den = crs(a.d, l.d);
    if (Math.abs(den) < 1e-9) return l.p;
    const t = crs(sub(l.p, a.p), l.d) / den;
    return [a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t];
  });
  const area2 = out.reduce((s, p, i) => s + crs(p, out[(i + 1) % n]), 0);
  return area2 * area > 0 && Math.abs(area2) > 1e-4 ? out : P; // degenerate → keep the original
}
