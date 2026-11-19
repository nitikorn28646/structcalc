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

// a straight stair from a line (tool "stairLine"): head = the first click (on a beam of this floor), foot = the second (ortho to the
// run), width w centred on the line → the usual stair rectangle { a, b, up } stored on THIS floor (head = this floor's beam, foot
// handed to the floor below by the analysis). The head beam must cross the run (a beam along the run cannot carry the stair head).
export const STAIR_W = 1.0;
export function stairFromLine(head, foot, beams, w = STAIR_W) {
  const dx = foot[0] - head[0], dy = foot[1] - head[1], ax = Math.abs(dx) >= Math.abs(dy) ? "x" : "y", L = Math.abs(ax === "x" ? dx : dy);
  if (!(L >= 0.5)) return { error: "บันไดสั้นเกินไป (ต้องยาวอย่างน้อย 0.50 ม.)" };
  const f = ax === "x" ? [foot[0], head[1]] : [head[0], foot[1]], h2 = w / 2;
  const a = ax === "x" ? [Math.min(head[0], f[0]), head[1] - h2] : [head[0] - h2, Math.min(head[1], f[1])];
  const b = ax === "x" ? [Math.max(head[0], f[0]), head[1] + h2] : [head[0] + h2, Math.max(head[1], f[1])];
  const up = ax === "x" ? (head[0] > f[0] ? "+x" : "-x") : (head[1] > f[1] ? "+y" : "-y");
  const r3 = (q) => q.map((v) => +v.toFixed(3));
  const stair = { a: r3(a), b: r3(b), up, kind: "long", line: true, w, t: 0.15, riser: 0.17, tread: 0.25, finish: 100, live: 300, landingL: 1.2, side: 1 };
  const host = beams.find((bm) => segDist(head, bm.a, bm.b).d < 0.03), u = host ? [host.b[0] - host.a[0], host.b[1] - host.a[1]] : null;
  if (host && Math.abs(ax === "x" ? u[0] : u[1]) > 0.5 * Math.hypot(u[0], u[1])) return { stair, L, error: "คานที่คลิกขนานกับทางขึ้น — หัวบันไดต้องวางบนคานที่ขวางทางขึ้น" };
  return { stair, L };
}

