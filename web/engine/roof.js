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
  // plane z = a·x + b·y + c through the best-spread three points (the skeleton may repeat a vertex at nearly the same spot,
  // and a triple using both copies gives a wild plane)
  let best = null, bn = 1e-9;
  for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) for (let k = j + 1; k < P.length; k++) {
    const [p, q, r] = [P[i], P[j], P[k]];
    const ux = q[0] - p[0], uy = q[1] - p[1], uz = q[2] - p[2], vx = r[0] - p[0], vy = r[1] - p[1], vz = r[2] - p[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    if (Math.abs(nz) > bn) { bn = Math.abs(nz); best = { a: -nx / nz, b: -ny / nz, c: p[2] + (nx * p[0] + ny * p[1]) / nz }; }
  }
  return best;
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
  // segments i, j of a closed ring cross (not neighbours) → the outline folds over itself
  const crosses = (P) => { const m = P.length, X = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    for (let i = 0; i < m; i++) for (let j = i + 2; j < m; j++) { if (i === 0 && j === m - 1) continue; const a = P[i], b = P[(i + 1) % m], c = P[j], d = P[(j + 1) % m];
      if (X(a, b, c) * X(a, b, d) < -1e-9 && X(c, d, a) * X(c, d, b) < -1e-9) return true; } return false; };
  if (eave.some((p, i) => Math.hypot(p[0] - eave[(i + 1) % n][0], p[1] - eave[(i + 1) % n][1]) < 1e-6) || crosses(eave))
    throw new Error(`ชายคาชนกันที่ช่องแคบ (ช่องกว้างไม่เกิน 2 × ชายคา ${roof.overhang} ม.) — ลดระยะชายคา หรือขยายช่องระหว่างปีกอาคาร`);
  const isG = edges.map((e) => e?.type === "gable"), isM = edges.map((e) => e?.type === "manila"), zE = roof.H - roof.overhang * tan;
  // GABLES (user 2026-11-04: only hip roofs came out right): every gable edge is pushed far outward (its two neighbours lengthened),
  // the hip skeleton of that extended outline is taken, and each roof face is cut back at the real gable line → exact planes for
  // gable / shed (หมาแหงน: three gables) / mixed gable-hip / gable wings of L, T, U plans. The gable wall is the vertical face left
  // on that line. (Before: the hip end-face was pulled onto the line, wrong for sheds and wings.)
  const out = (k) => { const a = eave[k], b = eave[(k + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]); return { a, u: [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nrm: [(b[1] - a[1]) / L, -(b[0] - a[0]) / L] }; };
  const E = eave.map((_, k) => out(k)), span = Math.max(...eave.map((p) => Math.hypot(p[0] - eave[0][0], p[1] - eave[0][1]))), D = 4 * span + 10;
  const lineOf = (k, withM = true, f = 1) => { const e = E[k], sft = isG[k] || (withM && isM[k]) ? D * f : 0; return { p: [e.a[0] + e.nrm[0] * sft, e.a[1] + e.nrm[1] * sft], u: e.u }; };
  const meet = (l1, l2) => { const den = l1.u[0] * l2.u[1] - l1.u[1] * l2.u[0]; if (Math.abs(den) < 1e-9) return l2.p; const t = ((l2.p[0] - l1.p[0]) * l2.u[1] - (l2.p[1] - l1.p[1]) * l2.u[0]) / den; return [l1.p[0] + l1.u[0] * t, l1.p[1] + l1.u[1] * t]; };
  // a gable on an inner edge (its outward side runs into the building, e.g. the inside corner of an L) cannot be pushed out: such
  // edges become hips again (warned). Test: the outward ray from the edge's middle hits another edge of the outline.
  const warn = [], X = (u, v, w) => (v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0]);
  for (let k = 0; k < n; k++) if (isG[k]) {
    const mid = [(eave[k][0] + eave[(k + 1) % n][0]) / 2 + E[k].nrm[0] * 1e-3, (eave[k][1] + eave[(k + 1) % n][1]) / 2 + E[k].nrm[1] * 1e-3], far = [mid[0] + E[k].nrm[0] * D, mid[1] + E[k].nrm[1] * D];
    for (let q = 0; q < n; q++) { if (q === k) continue; const a = eave[q], b = eave[(q + 1) % n];
      if (X(mid, far, a) * X(mid, far, b) < 0 && X(a, b, mid) * X(a, b, far) < 0) { isG[k] = false; warn.push(k); break; } }
  }
  // two gables meeting at an inside (reflex) corner would be pushed into each other: both become hips (warned)
  for (let k = 0; k < n; k++) { const j = (k + 1) % n, c = E[k].u[0] * E[j].u[1] - E[k].u[1] * E[j].u[0];
    if (isG[k] && isG[j] && c < -1e-9) { isG[k] = isG[j] = false; warn.push(k, j); } }
  // MANILA (มนิลา, user 2026-11-04): the end face is a hip up to a cut line dm inside the eave, above it the side planes run on to a
  // small vertical gable (gablet). dm = edge.dm (m) or a quarter of the edge length.
  const dm = eave.map((p, k) => (isM[k] ? edges[k].dm ?? 0.25 * Math.hypot(eave[(k + 1) % n][0] - p[0], eave[(k + 1) % n][1] - p[1]) : 0));
  // hip skeleton of the outline with the chosen edges pushed far out; faces per edge (3D points)
  const build = (withM) => {
    // push distance: as far as the outline stays a simple ring (neighbours of a gable that converge — angled walls — would cross)
    const push = isG.some(Boolean) || (withM && isM.some(Boolean)), mk = (f) => eave.map((_, k) => meet(lineOf((k + n - 1) % n, withM, f), lineOf(k, withM, f)));
    let ext = eave;
    if (push) for (let f = 1; f > 1e-3; f /= 2) { ext = mk(f); if (!crosses(ext) && signedArea(ext) > 0) break; }
    const sk = skeleton([[...ext, ext[0]]]);
    if (!sk) throw new Error("รูปร่างหลังคาไม่ถูกต้อง (ขอบตัดกันเอง)");
    // H is the wall-plate level where the rafters bear on the wall; the eave edge sits lower by overhang·tanθ
    const V = sk.vertices.map(([x, y, t]) => [x, y, roof.H + (t - roof.overhang) * tan]);
    // outline corners in the skeleton: nearest vertex at time 0 (far-out extended corners come back with rounding, a text key missed them)
    const base = sk.vertices.map((v, i) => [v, i]).filter(([v]) => v[2] < 1e-7);
    const ei = ext.map((p) => { let best = null, bd = Infinity; for (const [v, i] of base) { const dd = Math.hypot(v[0] - p[0], v[1] - p[1]); if (dd < bd) { bd = dd; best = i; } } return bd < 1e-4 * (1 + Math.hypot(p[0], p[1])) ? best : undefined; });
    const fo = new Array(n).fill(null);
    for (const poly of sk.polygons) for (let e = 0; e < n; e++) if (poly.includes(ei[e]) && poly.includes(ei[(e + 1) % n])) { fo[e] = poly.map((i) => V[i]); break; }
    return fo;
  };
  // cut a planar 3D polygon by half-planes (Sutherland–Hodgman, z interpolated): keep f(p) ≤ 0 for every f
  const side = (k, p) => (p[0] - E[k].a[0]) * E[k].nrm[0] + (p[1] - E[k].a[1]) * E[k].nrm[1];
  const cut = (P, fs) => { let Q = P; for (const fn of fs) { if (Q.length < 3) break; const R = [];
    Q.forEach((p, i) => { const q = Q[(i + 1) % Q.length], sp = fn(p), sq = fn(q);
      if (sp <= 1e-9) R.push(p);
      if ((sp < -1e-9 && sq > 1e-9) || (sp > 1e-9 && sq < -1e-9)) { const t = sp / (sp - sq); R.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t]); } });
    Q = R.filter((p, i) => Math.hypot(p[0] - R[(i + 1) % R.length][0], p[1] - R[(i + 1) % R.length][1], p[2] - R[(i + 1) % R.length][2]) > 1e-7); }
    return Q; };
  const gCuts = [...Array(n).keys()].filter((k) => isG[k]).map((k) => (p) => side(k, p));
  const mCuts = [...Array(n).keys()].filter((k) => isM[k]).map((k) => (p) => side(k, p) + dm[k]); // beyond the manila cut line
  const roofF = [], faceOf = build(true);
  for (let e = 0; e < n; e++) if (!isG[e] && !isM[e] && faceOf[e]) { const P = cut(faceOf[e], [...gCuts, ...mCuts]); if (P.length >= 3) roofF.push({ edge: e, gable: false, P }); }
  if (isM.some(Boolean)) { // hip skirts in the strip between each manila eave and its cut line
    const hipF = build(false);
    for (let k = 0; k < n; k++) if (isM[k]) for (let e = 0; e < n; e++) if (!isG[e] && hipF[e]) {
      // a corner inside two manila strips belongs to the first one only
      const others = [...Array(k).keys()].filter((m) => isM[m]).map((m) => (p) => side(m, p) + dm[m]);
      const P = cut(hipF[e], [...gCuts, ...others, (p) => -(side(k, p) + dm[k])]); if (P.length >= 3) roofF.push({ edge: e, gable: false, P, skirt: k });
    }
  }
  // gable walls: the roof profile left on each gable line, closed at eave level
  const gableF = [];
  for (let e = 0; e < n; e++) if (isG[e]) {
    const on = []; for (const f of roofF) for (const p of f.P) if (Math.abs(side(e, p)) < 1e-6) on.push(p);
    const s = (p) => (p[0] - E[e].a[0]) * E[e].u[0] + (p[1] - E[e].a[1]) * E[e].u[1], L = Math.hypot(eave[(e + 1) % n][0] - eave[e][0], eave[(e + 1) % n][1] - eave[e][1]);
    const prof = [...new Map(on.filter((p) => s(p) > -1e-6 && s(p) < L + 1e-6).map((p) => [`${s(p).toFixed(5)}|${p[2].toFixed(5)}`, p])).values()].sort((a, b) => s(a) - s(b) || a[2] - b[2]);
    if (prof.length < 2) continue;
    const a = [...eave[e], zE], b = [...eave[(e + 1) % n], zE], P = [a, ...prof.filter((p) => p[2] > zE + 1e-6), b];
    if (P.length >= 3) gableF.push({ edge: e, gable: true, P });
  }
  for (let k = 0; k < n; k++) if (isM[k]) { // gablet: between the skirt top and the side planes on the cut line
    const onL = (p) => Math.abs(side(k, p) + dm[k]) < 1e-6, s = (p) => (p[0] - E[k].a[0]) * E[k].u[0] + (p[1] - E[k].a[1]) * E[k].u[1];
    const uniq = (l) => [...new Map(l.map((p) => [`${s(p).toFixed(5)}|${p[2].toFixed(5)}`, p])).values()];
    const top = uniq(roofF.filter((f) => f.skirt === undefined).flatMap((f) => f.P.filter(onL))).sort((a, b) => s(a) - s(b));
    const bot = uniq(roofF.filter((f) => f.skirt === k).flatMap((f) => f.P.filter(onL))).sort((a, b) => s(b) - s(a));
    if (top.length >= 2 && bot.length >= 2) { const P = [...top, ...bot.filter((p) => !top.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]) < 1e-6))]; if (P.length >= 3) gableF.push({ edge: k, gable: true, gablet: true, P }); }
  }
  const faces = [...roofF, ...gableF];
  faces.forEach((f) => { f.plane = f.gable ? null : plane(f.P); f.area = area3(f.P); });
  // unique segments by coordinates, classified
  const vk = (p) => `${p[0].toFixed(4)},${p[1].toFixed(4)},${p[2].toFixed(4)}`, seg = new Map();
  faces.forEach((f) => f.P.forEach((p, k) => { const q = f.P[(k + 1) % f.P.length], a = vk(p), b = vk(q); if (a === b) return; const id = a < b ? `${a}|${b}` : `${b}|${a}`;
    (seg.get(id) ?? seg.set(id, { p, q, faces: [] }).get(id)).faces.push(f); }));
  const lines = [], onG = (p) => isG.some((g, k) => g && Math.abs(side(k, p)) < 1e-6) || isM.some((m, k) => m && Math.abs(side(k, p) + dm[k]) < 1e-6);
  for (const s0 of seg.values()) {
    const { p, q } = s0, len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    if (len < 1e-6) continue;
    const rf = s0.faces.filter((f) => !f.gable);
    if (rf.length === 2) { const [A, B] = rf; if (Math.abs(A.plane.a - B.plane.a) < 1e-6 && Math.abs(A.plane.b - B.plane.b) < 1e-6 && Math.abs(A.plane.c - B.plane.c) < 1e-4) continue; }
    if (rf.length === 0) continue; // gable wall's own edges (its base is the eave line, its top is a rake already)
    let type;
    if (rf.length === 1) type = onG(p) && onG(q) ? (Math.abs(q[2] - p[2]) < 1e-6 && p[2] > zE + 1e-6 ? "ridge" : "rake") : Math.abs(p[2] - zE) < 1e-6 && Math.abs(q[2] - zE) < 1e-6 ? "eave" : "rake";
    else if (Math.abs(q[2] - p[2]) < 1e-6) type = "ridge";
    else {
      const [A, B] = rf, mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2, cB = B.P.reduce((c, v) => [c[0] + v[0] / B.P.length, c[1] + v[1] / B.P.length], [0, 0]);
      const t = 0.05, x = mx + (cB[0] - mx) * t, y = my + (cB[1] - my) * t;
      const zA = A.plane.a * x + A.plane.b * y + A.plane.c, zB = B.plane.a * x + B.plane.b * y + B.plane.c;
      type = zA > zB ? "hip" : "valley";
    }
    lines.push({ type, p, q, len });
  }
  const sum = (t) => lines.filter((l) => l.type === t).reduce((a, l) => a + l.len, 0);
  const roofFaces = faces.filter((f) => !f.gable);
  return {
    pts, edges, eave, faces, lines, V: faces.flatMap((f) => f.P), tan, H: roof.H,
    planArea: Math.abs(signedArea(eave)), wallArea: Math.abs(signedArea(pts)),
    roofArea: roofFaces.reduce((a, f) => a + f.area, 0), gableArea: faces.filter((f) => f.gable).reduce((a, f) => a + f.area, 0),
    ridge: sum("ridge"), hip: sum("hip"), valley: sum("valley"), rake: sum("rake"), eaveLen: sum("eave"),
    top: Math.max(...faces.flatMap((f) => f.P.map((v) => v[2]))),
    warnings: [...new Set(warn)].map((k) => `ขอบที่ ${k + 1} ตั้งเป็นหน้าจั่วไม่ได้ (หันเข้าหาตัวอาคาร / ชนหน้าจั่วอื่นที่มุมใน) — คิดเป็นปั้นหยาแทน`),
  };
}
