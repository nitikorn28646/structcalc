// Roof geometry from a wall outline: eave offset, straight-skeleton faces, gable ends, line classification (units m).
// `skeleton(ring)` is injected (CGAL wasm in the browser) and must return { vertices: [x,y,t][], polygons: number[][] }.

export const signedArea = (pts) => pts.reduce((a, [x, y], i) => { const [u, v] = pts[(i + 1) % pts.length]; return a + x * v - u * y; }, 0) / 2;

// Offset every edge outward by d and intersect neighbouring lines (outline must be CCW).
export function offsetPolygon(pts, d) {
  const n = pts.length, lines = pts.map((p, i) => {
    const q = pts[(i + 1) % n], L = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const nx = (q[1] - p[1]) / L, ny = -(q[0] - p[0]) / L; // outward normal of a CCW ring
    return { p: [p[0] + nx * d, p[1] + ny * d], u: [(q[0] - p[0]) / L, (q[1] - p[1]) / L] };
  });
  return lines.map((b, i) => {
    const a = lines[(i - 1 + n) % n], den = a.u[0] * b.u[1] - a.u[1] * b.u[0];
    if (Math.abs(den) < 1e-9) return b.p;
    const t = ((b.p[0] - a.p[0]) * b.u[1] - (b.p[1] - a.p[1]) * b.u[0]) / den;
    return [a.p[0] + a.u[0] * t, a.p[1] + a.u[1] * t];
  });
}

function plane(P) {
  // least-effort plane through three well-spread points: z = a·x + b·y + c
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    const [p, q, r] = [P[i], P[j], P[k]];
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(nz) > 1e-6 * Math.hypot(nx, ny, nz) && Math.hypot(nx, ny, nz) > 1e-9) return { a: -nx / nz, b: -ny / nz, c: p[2] + (nx * p[0] + ny * p[1]) / nz };
  }
  return null;
}

const area3 = (P) => {
  let x = 0, y = 0, z = 0;
  for (let i = 0; i < P.length; i++) {
    const p = P[i], q = P[(i + 1) % P.length];
    x += p[1] * q[2] - p[2] * q[1]; y += p[2] * q[0] - p[0] * q[2]; z += p[0] * q[1] - p[1] * q[0];
  }
  return Math.hypot(x, y, z) / 2;
};

// roof: { pts: [[x,y]] wall outline, edges: [{ type: "hip"|"gable" }], slope (deg), overhang (m), H eave height (m) }
export function roofGeometry(roof, skeleton) {
  let pts = roof.pts.map((p) => [...p]), edges = roof.edges;
  if (signedArea(pts) < 0) { pts = pts.reverse(); edges = [...edges.slice(0, -1)].reverse().concat(edges.slice(-1)); }
  const n = pts.length, eave = offsetPolygon(pts, roof.overhang), tan = Math.tan((roof.slope * Math.PI) / 180);
  const sk = skeleton([[...eave, eave[0]]]);
  if (!sk) throw new Error("รูปร่างหลังคาไม่ถูกต้อง (ขอบตัดกันเอง)");
  // H is the wall-plate level where the rafters bear on the wall; the eave edge sits lower by overhang·tanθ
  const V = sk.vertices.map(([x, y, t]) => [x, y, roof.H + (t - roof.overhang) * tan]);
  const key = (p) => `${p[0].toFixed(5)},${p[1].toFixed(5)}`, eaveIdx = new Map();
  sk.vertices.forEach((v, i) => { if (v[2] < 1e-9) eaveIdx.set(key(v), i); });
  const ei = eave.map((p) => eaveIdx.get(key(p)));
  // assign each skeleton face to the eave edge it contains
  const faceOf = new Array(n).fill(null);
  for (const poly of sk.polygons) for (let e = 0; e < n; e++) if (poly.includes(ei[e]) && poly.includes(ei[(e + 1) % n])) { faceOf[e] = poly; break; }
  // gable: pull the face's interior vertices onto the eave line, turning the face into a vertical gable wall
  edges.forEach((ed, e) => {
    if (ed.type !== "gable" || !faceOf[e]) return;
    const a = eave[e], b = eave[(e + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
    for (const i of faceOf[e]) if (sk.vertices[i][2] > 1e-9) {
      const s = (V[i][0] - a[0]) * ux + (V[i][1] - a[1]) * uy;
      V[i] = [a[0] + ux * s, a[1] + uy * s, V[i][2]];
    }
  });
  const faces = faceOf.map((poly, e) => poly && { edge: e, gable: edges[e].type === "gable", idx: poly, P: poly.map((i) => V[i]) }).filter(Boolean);
  faces.forEach((f) => { f.plane = f.gable ? null : plane(f.P); f.area = area3(f.P); });
  // unique skeleton segments, classified
  const seg = new Map();
  faces.forEach((f) => f.idx.forEach((i, k) => {
    const j = f.idx[(k + 1) % f.idx.length], id = i < j ? `${i}-${j}` : `${j}-${i}`;
    (seg.get(id) ?? seg.set(id, { i, j, faces: [] }).get(id)).faces.push(f);
  }));
  const lines = [];
  for (const s of seg.values()) {
    const p = V[s.i], q = V[s.j], len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (len < 1e-6) continue;
    let type;
    if (s.faces.length < 2) type = sk.vertices[s.i][2] < 1e-9 && sk.vertices[s.j][2] < 1e-9 ? "eave" : "rake";
    else if (s.faces.some((f) => f.gable)) type = "rake";
    else if (Math.abs(q[2] - p[2]) < 1e-6) type = "ridge";
    else {
      const [A, B] = s.faces, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, cB = B.P.reduce((c, v) => [c[0] + v[0] / B.P.length, c[1] + v[1] / B.P.length], [0, 0]);
      const t = 0.05, x = mx + (cB[0] - mx) * t, y = my + (cB[1] - my) * t; // a point just inside face B
      const zA = A.plane.a * x + A.plane.b * y + A.plane.c, zB = B.plane.a * x + B.plane.b * y + B.plane.c;
      type = zA > zB ? "hip" : "valley";
    }
    lines.push({ type, p, q, len });
  }
  const sum = (t) => lines.filter((l) => l.type === t).reduce((a, l) => a + l.len, 0);
  const roofFaces = faces.filter((f) => !f.gable);
  return {
    pts, edges, eave, faces, lines, V, tan, H: roof.H,
    planArea: Math.abs(signedArea(eave)), wallArea: Math.abs(signedArea(pts)),
    roofArea: roofFaces.reduce((a, f) => a + f.area, 0), gableArea: faces.filter((f) => f.gable).reduce((a, f) => a + f.area, 0),
    ridge: sum("ridge"), hip: sum("hip"), valley: sum("valley"), rake: sum("rake"), eaveLen: sum("eave"),
    top: Math.max(...V.map((v) => v[2])),
  };
}
