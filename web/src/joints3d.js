// Clean joints for the 3D view (user 2026-11-04: beams / columns / slabs should meet like the real thing, and pieces lying in one
// another flickered — z-fighting of coplanar faces). Pure geometry, plan coordinates:
// - a beam end at a column stops at the column face; a beam passing over a column is cut around it;
// - at a beam-to-beam joint the main one (deepest, then widest, then a beam running straight through) runs through and covers
//   the corner, the others stop at its face;
// - slab panels are shrunk to the inner faces of their beams, cantilever slabs start at the beam face.
const TOL = 0.03;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]], len = (v) => Math.hypot(v[0], v[1]), dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const crs = (a, b) => a[0] * b[1] - a[1] * b[0];

// beams: [{ a, b, w, h, arc }], cols: [{ p, B, D }] → per beam [[p, q], …] solid pieces (arc beams: null = draw as before).
// At every joint the beams are grouped by direction; the direction holding the deepest beam (then widest, then the one that
// continues through the joint, then drawn first) is the main one and runs through, every other beam stops at its face — whether
// that beam ends there or passes through (then it is cut around the main beam).
export function beamPieces(beams, cols) {
  const geo = beams.map((b) => { const d = sub(b.b, b.a), L = len(d); return { L, u: L ? [d[0] / L, d[1] / L] : [1, 0] }; });
  const ok = (j) => !beams[j].arc?.s && geo[j].L >= TOL;
  const colAt = (p) => cols.find((c) => len(sub(c.p, p)) < TOL);
  const halfCol = (c, u) => (Math.abs(u[0]) * c.B + Math.abs(u[1]) * c.D) / 2;
  const par = (i, j) => Math.abs(crs(geo[i].u, geo[j].u)) < 0.2;
  const face = (i, j) => { const s = Math.abs(crs(geo[i].u, geo[j].u)); return s < 0.2 ? 0 : beams[j].w / 2 / s; };
  const onBeam = (j, P) => { const d = sub(P, beams[j].a), t = dot(d, geo[j].u); return Math.abs(crs(geo[j].u, d)) <= TOL && t >= -TOL && t <= geo[j].L + TOL ? t : null; };
  // the main direction at point P: { dir: [beam ids], ids } — beams of the winning direction
  const mainAt = (P) => {
    const at = beams.map((_, j) => (ok(j) && onBeam(j, P) !== null ? j : -1)).filter((j) => j >= 0), groups = [];
    for (const j of at) { const g = groups.find((x) => par(x[0], j)); if (g) g.push(j); else groups.push([j]); }
    const score = (g) => {
      const through = g.length > 1 || g.some((j) => { const t = onBeam(j, P); return t > TOL && t < geo[j].L - TOL; });
      return [Math.max(...g.map((j) => beams[j].h)), Math.max(...g.map((j) => beams[j].w)), through ? 1 : 0, -Math.min(...g)];
    };
    let best = groups[0], bs = best && score(best);
    for (const g of groups.slice(1)) { const sc = score(g); for (let k = 0; k < 4; k++) if (sc[k] !== bs[k]) { if (sc[k] > bs[k]) { best = g; bs = sc; } break; } }
    return { groups, best: best ?? [] };
  };
  return beams.map((b, i) => {
    if (!ok(i)) return null;
    const { L, u } = geo[i], P = (t) => [b.a[0] + u[0] * t, b.a[1] + u[1] * t];
    let t0 = 0, t1 = L; const gaps = [];
    // joints: ends of this beam, columns on it, other beams touching it
    const ts = new Set([0, L]);
    for (const c of cols) { const t = onBeam(i, c.p); if (t !== null) ts.add(Math.round(t * 1e4) / 1e4); }
    beams.forEach((o, j) => { if (j === i || !ok(j) || par(i, j)) return; for (const E of [o.a, o.b]) { const t = onBeam(i, E); if (t !== null) ts.add(Math.round(t * 1e4) / 1e4); }
      // a beam passing across this one: the crossing point
      const den = crs(u, geo[j].u), t = crs(sub(o.a, b.a), geo[j].u) / den, s2 = crs(sub(o.a, b.a), u) / den;
      if (t > -TOL && t < L + TOL && s2 > -TOL && s2 < geo[j].L + TOL) ts.add(Math.round(Math.min(L, Math.max(0, t)) * 1e4) / 1e4); });
    for (const t of ts) {
      const J = P(t), end0 = t < TOL, end1 = t > L - TOL, c = colAt(J);
      let f0 = 0, f1 = 0; // how far the solid stops short of J on the − / + side (negative = runs past)
      if (c) { f0 = f1 = halfCol(c, u); }
      else {
        const { groups, best } = mainAt(J); if (groups.length < 2) continue;
        const others = groups.filter((g) => g !== best).flat();
        if (best.includes(i)) { // main: continues; at a corner (no collinear partner on the far side) it covers the others' width
          const partner = best.some((j) => j !== i) || (!end0 && !end1);
          if (!partner) { const ext = Math.max(...others.map((j) => face(i, j))); if (end0) f1 = -ext; else f0 = -ext; }
          else continue;
        } else { const m = Math.max(...best.map((j) => face(i, j))); f0 = f1 = m; }
      }
      if (end0) t0 = Math.max(t0, f1);
      else if (end1) t1 = Math.min(t1, L - f0);
      else gaps.push([t - f0, t + f1]);
      if (end0 && f1 < 0) t0 = f1;
      if (end1 && f0 < 0) t1 = L - f0;
    }
    const out = []; gaps.sort((x, y) => x[0] - y[0]);
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
