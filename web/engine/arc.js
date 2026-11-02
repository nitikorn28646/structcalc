// Circular-arc beams in plan: a drawn beam { a, b, arc: { s } } where s is the sagitta (m, mid-arc offset from the chord;
// + = to the left of a → b). Floor loads use the chord (plus the slab between chord and arc, see floor.js); the 3D frame
// places its nodes on the true arc so the curvature gives the torsion. Units m.
export function arcGeom(a, b, s) {
  const dx = b[0] - a[0], dy = b[1] - a[1], c = Math.hypot(dx, dy);
  if (!s || Math.abs(s) < 1e-6 || c < 1e-9) return null;
  const n = [-dy / c, dx / c], h = Math.abs(s), R = (c * c) / (8 * h) + h / 2, th = 4 * Math.atan((2 * h) / c); // subtended angle
  const sg = Math.sign(s), mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], cen = [mid[0] + n[0] * sg * (h - R), mid[1] + n[1] * sg * (h - R)];
  const a0 = Math.atan2(a[1] - cen[1], a[0] - cen[0]), a1 = Math.atan2(b[1] - cen[1], b[0] - cen[0]);
  // sweep from a to b through the mid-arc point: + (counter-clockwise) when the bulge is to the right of a → b
  const dir = sg > 0 ? -1 : 1;
  return { c, R, th, s, cen, a0, a1, dir, L: R * th, area: (R * R * (th - Math.sin(th))) / 2, mid: [mid[0] + n[0] * s, mid[1] + n[1] * s] };
}
// point on the arc at chord parameter t ∈ [0, c] (equal angle steps ↔ equal chord-parameter steps)
export function arcPoint(g, t) {
  const ang = g.a0 + g.dir * g.th * (t / g.c);
  return [g.cen[0] + g.R * Math.cos(ang), g.cen[1] + g.R * Math.sin(ang)];
}
// sagitta of a quarter (90°) arc on a chord c: s = c/2 · tan(22.5°)
export const quarterSagitta = (c) => (c / 2) * Math.tan(Math.PI / 8);
// polyline of an arc beam for drawing (n segments)
export const arcPolyline = (a, b, s, n = 24) => { const g = arcGeom(a, b, s); return g ? Array.from({ length: n + 1 }, (_, i) => arcPoint(g, (g.c * i) / n)) : [a, b]; };
