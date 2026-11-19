// Roof → structure link: wall-plate (and interior-plate / post) reactions of the roof module as point loads where they bear.
import { loadSkeleton, runRoof } from "./RoofPage.jsx";
import { elevations } from "./StoreyTable.jsx";

// host: the linked floor of the structure { columns, beams } — a reaction where no column stands but a beam passes stays there as a
// point load on that beam (the plate bears on the RC beam); only a point on neither goes to the nearest column (named, warned)
export async function roofPoints(roof, host = {}) {
    const sk = await loadSkeleton(), { dz, fr, error } = runRoof(roof, sk);
    if (error || !dz) return { error: error ?? "ไม่มีข้อมูลหลังคา" };
    // every plate hands down what it carries (roofMembers: m.bear — wall plates incl. the posts / interior plates standing on them,
    // interior plates only at ends that rest on nothing else); posts standing on no plate go down where they stand (dz.bearLoose)
    const pts = [], cols = roof.columns ?? [];
    const addAt = (p, P) => { const hit = pts.find((x) => Math.hypot(x.p[0] - p[0], x.p[1] - p[1]) < 0.05); if (hit) hit.P += P; else pts.push({ p: [+p[0].toFixed(3), +p[1].toFixed(3)], P, name: "หลังคา" }); };
    for (const m of dz.members.filter((x) => x.group === "plate")) for (const b of m.bear ?? []) if (b.P > 0) addAt(b.p, b.P);
    for (const b of dz.bearLoose ?? []) if (b.P > 0) addAt(b.p, b.P);
    for (const b of dz.bearDirect ?? []) if (b.P > 0) addAt(b.p, b.P); // rafters on the RC ring beam (no steel wall plate)
    // the roof plan and the structure are drawn separately: a bearing point a little off a column / beam (wall face vs column centre,
    // e.g. 0.25 m) is the same support — within host.tol (default 0.30 m) it goes to that column, else onto that beam (projected)
    const tol = host.tol ?? 0.3, fcols = host.columns?.length ? host.columns : cols, d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
    const onBeam = (p) => { let best = null;
      for (const b of host.beams ?? []) { const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); if (!(L > 0)) continue;
        const t = Math.max(0, Math.min(1, ((p[0] - b.a[0]) * (b.b[0] - b.a[0]) + (p[1] - b.a[1]) * (b.b[1] - b.a[1])) / (L * L))), q = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t];
        if (d2(p, q) <= tol && (!best || d2(p, q) < best.d)) best = { q, d: d2(p, q) }; }
      return best; };
    for (const x of pts) {
      x.at = [...x.p];
      const c = fcols.length ? fcols.reduce((a, b) => (d2(b, x.p) < d2(a, x.p) ? b : a)) : null, bm = onBeam(x.p);
      if (c && d2(c, x.p) <= tol) { x.to = "col"; x.snap = d2(c, x.p); x.p = [+c[0].toFixed(3), +c[1].toFixed(3)]; }
      else if (bm) { x.to = "beam"; x.snap = bm.d; x.p = bm.q.map((v) => +v.toFixed(3)); x.name = "หลังคา (ลงคาน)"; }
      else if (c) { x.to = "moved"; x.name = `หลังคา (จาก ${x.at[0].toFixed(2)}, ${x.at[1].toFixed(2)} ไม่มีเสา/คานใกล้ → ย้ายมาเสาใกล้สุด)`; x.p = [+c[0].toFixed(3), +c[1].toFixed(3)]; }
    }
    // the same column / beam point reached from two nearby roof points: one load
    for (let a = 0; a < pts.length; a++) for (let b = pts.length - 1; b > a; b--) if (d2(pts[a].p, pts[b].p) < 0.01) { pts[a].P += pts[b].P; pts.splice(b, 1); }
    return { pts: pts.map((x) => ({ ...x, P: Math.round(x.P) })), total: pts.reduce((s, x) => s + x.P, 0) };
}

// Roof plan from the structure (user: no second drawing of walls / columns): outline = the outer boundary of the slab panels of the
// highest floor that has panels; columns = the top floor's columns; plates on every outline edge; same structural grid.
// H (plate level) = top of the frame above the first floor. Returns a partial roof object or { error }.
// a beam that carries a roof point with no column / beam under it: through p along X or Y (the shorter one) between the nearest
// beams on both sides — a secondary beam, so the roof load bears where it really is
export function carrierBeam(floor, p) {
  const segs = (floor.beams ?? []).map((b) => [b.a, b.b]);
  const hit = (d) => segs.reduce((best, [a, b]) => {
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return best;
    const w = [a[0] - p[0], a[1] - p[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    return t > 0.05 && u >= -1e-6 && u <= 1 + 1e-6 ? Math.min(best, t) : best;
  }, Infinity);
  const opts = [[[1, 0], [-1, 0]], [[0, 1], [0, -1]]].map(([d1, d2]) => { const t1 = hit(d1), t2 = hit(d2);
    return { L: t1 + t2, a: [p[0] + d2[0] * t2, p[1] + d2[1] * t2], b: [p[0] + d1[0] * t1, p[1] + d1[1] * t1] }; }).filter((o) => Number.isFinite(o.L)).sort((x, y) => x.L - y.L);
  return opts.length ? { a: opts[0].a.map((v) => +v.toFixed(3)), b: opts[0].b.map((v) => +v.toFixed(3)), type: null } : null;
}

export function roofFromFrame(frame, res) {
  const k = [...res.floors.keys()].reverse().find((i) => res.floors[i].panels?.length);
  if (k === undefined) return { error: "ยังไม่มีแผ่นพื้น — วาดเสาและคานให้เป็นห้องปิดก่อน (ขั้น 2)" };
  // outer face of the beam plan: split the beam lines at every crossing / T, drop dangling pieces (cantilevers), then walk the
  // boundary from the lowest-left point taking the right-most turn each time (a slab-less corner does not break the outline)
  const lines = res.floors[k].lines, V = [], vid = (p) => { let i = V.findIndex((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02); if (i < 0) { V.push(p); i = V.length - 1; } return i; };
  const adj = new Map(), link = (a, b) => { if (a === b) return; (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)).add(a); };
  for (const ln of lines) {
    const ts = [0, ln.L];
    for (const o of lines) if (o !== ln) {
      const den = ln.u[0] * o.u[1] - ln.u[1] * o.u[0], d = [o.A[0] - ln.A[0], o.A[1] - ln.A[1]];
      if (Math.abs(den) > 1e-9) { const t = (d[0] * o.u[1] - d[1] * o.u[0]) / den, r = (d[0] * ln.u[1] - d[1] * ln.u[0]) / den; if (t > -0.02 && t < ln.L + 0.02 && r > -0.02 && r < o.L + 0.02) ts.push(t); }
    }
    const pts = [...new Set(ts.map((t) => +Math.min(ln.L, Math.max(0, t)).toFixed(3)))].sort((a, b) => a - b).map((t) => vid([ln.A[0] + ln.u[0] * t, ln.A[1] + ln.u[1] * t]));
    for (let i = 0; i + 1 < pts.length; i++) link(pts[i], pts[i + 1]);
  }
  for (let pruned = true; pruned;) { pruned = false; for (const [v, n] of adj) if (n.size < 2) { for (const w of n) adj.get(w)?.delete(v); adj.delete(v); pruned = true; } }
  if (adj.size < 3) return { error: "หาขอบอาคารไม่ได้ — แนวคานยังไม่ล้อมเป็นวง" };
  const ids = [...adj.keys()], start = ids.reduce((a, b) => (V[b][1] < V[a][1] - 1e-6 || (Math.abs(V[b][1] - V[a][1]) < 1e-6 && V[b][0] < V[a][0]) ? b : a));
  const ang = (a, b) => Math.atan2(V[b][1] - V[a][1], V[b][0] - V[a][0]);
  let prevDir = -Math.PI / 2, cur = start; const loop = [start]; // arriving "from below"
  for (let guard = 0; guard < 4 * V.length; guard++) {
    let best = null, bestTurn = Infinity;
    for (const w of adj.get(cur)) { let turn = ang(cur, w) - prevDir; while (turn <= -Math.PI) turn += 2 * Math.PI; while (turn > Math.PI) turn -= 2 * Math.PI; if (loop.length > 1 && w === loop[loop.length - 2]) turn = 10; if (turn < bestTurn) { bestTurn = turn; best = w; } }
    if (best === null || best === start) break;
    prevDir = ang(cur, best); cur = best; loop.push(best);
  }
  let P = loop.map((i) => V[i]);
  P = P.filter((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6; }); // drop collinear points
  if (P.reduce((s, p, i) => { const q = P[(i + 1) % P.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) < 0) P.reverse(); // counter-clockwise
  // plate level = elevation of the top floor (base level + storey heights) — it assumed the ground beam at ±0.00 (0.40 m low on Yasothon)
  const top = frame.floors.length - 1, Z = elevations(frame)[top];
  const g = frame.floors[top].grid ?? frame.floors[0].grid;
  return { pts: P, edges: P.map(() => ({ type: "hip" })), columns: frame.floors[top].columns.map((c) => [...c]), plates: P.map((a, i) => ({ a, b: P[(i + 1) % P.length] })),
    innerPlates: [], dang: null, supports: null, H: +Z.toFixed(2), ...(g ? { grid: { x0: g.x0 ?? 0, y0: g.y0 ?? 0, dx: g.dx, dy: g.dy, sub: g.sub ?? 1 } } : {}), linkFloor: top };
}

// Roof plan drawn at the wall faces (or by hand) a little off the structure (user 2026-11-19: "อะเสไม่วางบนเสา" in the 3D): the outline
// corners move onto the linked floor within tol — a column centre, else the column / beam lines along X and Y (a corner with no column
// lands on the crossing), else the nearest point of a slanted beam. Points ON the old outline (wall-plate ends, ดั้ง / columns / interior
// plate ends on a wall) move with their edge; roof columns elsewhere go to the frame column within tol; interior plates and ดั้ง inside
// the outline stay where they were drawn (they may be off the column lines on purpose). Returns { patch, n, max }.
export function snapRoofToFrame(roof, floor, tol = 0.3) {
  const cols = floor?.columns ?? [], beams = (floor?.beams ?? []).filter((b) => Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) > 0);
  const d2 = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]), r3 = (q) => [+q[0].toFixed(3), +q[1].toFixed(3)];
  const xs = [...cols.map((c) => c[0]), ...beams.filter((b) => Math.abs(b.a[0] - b.b[0]) < 1e-3).map((b) => b.a[0])];
  const ys = [...cols.map((c) => c[1]), ...beams.filter((b) => Math.abs(b.a[1] - b.b[1]) < 1e-3).map((b) => b.a[1])];
  const line = (list, v) => list.reduce((a, c) => (Math.abs(c - v) <= tol && (a == null || Math.abs(c - v) < Math.abs(a - v)) ? c : a), null);
  const nearCol = (p) => cols.reduce((a, c) => (d2(c, p) <= tol && (!a || d2(c, p) < d2(a, p)) ? c : a), null);
  const corner = (p) => {
    let q = nearCol(p);
    if (!q) { const qx = line(xs, p[0]), qy = line(ys, p[1]); if (qx != null || qy != null) q = [qx ?? p[0], qy ?? p[1]]; }
    if (!q) for (const b of beams) {
      const L2 = (b.b[0] - b.a[0]) ** 2 + (b.b[1] - b.a[1]) ** 2, t = Math.max(0, Math.min(1, ((p[0] - b.a[0]) * (b.b[0] - b.a[0]) + (p[1] - b.a[1]) * (b.b[1] - b.a[1])) / L2));
      const c = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t];
      if (d2(c, p) <= tol && (!q || d2(c, p) < d2(q, p))) q = c;
    }
    return q ? r3(q) : p;
  };
  const P0 = roof.pts ?? [], P1 = P0.map(corner);
  let n = 0, max = 0;
  const moved = (p, q) => { if (d2(p, q) > 1e-4) { n++; max = Math.max(max, d2(p, q)); } return q; };
  const onOutline = (p) => { // same point on the moved outline, or null when p is not on the old outline
    for (let i = 0; i < P0.length; i++) {
      const a = P0[i], b = P0[(i + 1) % P0.length], L2 = (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2;
      if (!(L2 > 0)) continue;
      const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / L2;
      if (t < -1e-6 || t > 1 + 1e-6 || d2(p, [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]) > 0.01) continue;
      const A = P1[i], B = P1[(i + 1) % P1.length];
      return r3([A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t]);
    }
    return null;
  };
  const pt = (p) => (p ? moved(p, onOutline(p) ?? p) : p);
  const patch = {};
  if (P0.length) { patch.pts = P1; P0.forEach((p, i) => moved(p, P1[i])); }
  if (roof.columns?.length) patch.columns = roof.columns.map((c) => moved(c, onOutline(c) ?? (nearCol(c) ? r3(nearCol(c)) : c)));
  if (roof.plates?.length) patch.plates = roof.plates.map((x) => ({ ...x, a: pt(x.a), b: pt(x.b) }));
  if (roof.innerPlates?.length) patch.innerPlates = roof.innerPlates.map((x) => ({ ...x, a: pt(x.a), b: pt(x.b) }));
  if (Array.isArray(roof.dang)) patch.dang = roof.dang.map(pt);
  return { patch, n, max };
}
