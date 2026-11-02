// Shared plan-drawing helpers (structural grid, distances, crossings) for the floor board. Model metres, y up.
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

export function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return { d: Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]), q: [a[0] + dx * t, a[1] + dy * t], t };
}

// crossing point of segments a-b and c-d (ends included), or null
export function segCross(a, b, c, d) {
  const rx = b[0] - a[0], ry = b[1] - a[1], sx = d[0] - c[0], sy = d[1] - c[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
  return t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6 ? [a[0] + rx * t, a[1] + ry * t] : null;
}

// STAAD-style grid { x0, y0, dx[], dy[], sub } → axis coordinates and node coordinates (with subdivisions)
export function gridAxes(G) {
  const axis = (o, ds) => ds.reduce((a, d) => [...a, +(a[a.length - 1] + d).toFixed(4)], [o]);
  const n = G.sub || 1, GX = axis(G.x0, G.dx), GY = axis(G.y0, G.dy);
  const subdiv = (P) => P.flatMap((v, i) => (i ? Array.from({ length: n }, (_, k) => +(P[i - 1] + ((v - P[i - 1]) * (k + 1)) / n).toFixed(4)) : [v]));
  return { GX, GY, SX: subdiv(GX), SY: subdiv(GY), xName: (i) => String.fromCharCode(65 + i), yName: (i) => String(GY.length - i) };
}

export const round3 = (p) => p.map((v) => +v.toFixed(3));
