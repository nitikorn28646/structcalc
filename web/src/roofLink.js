// Roof → structure link: wall-plate (and interior-plate / post) reactions of the roof module as point loads where they bear.
import { loadSkeleton, runRoof } from "./RoofPage.jsx";

// host: the linked floor of the structure { columns, beams } — a reaction where no column stands but a beam passes stays there as a
// point load on that beam (the plate bears on the RC beam); only a point on neither goes to the nearest column (named, warned)
export async function roofPoints(roof, host = {}) {
    const sk = await loadSkeleton(), { dz, fr, error } = runRoof(roof, sk);
    if (error || !dz) return { error: error ?? "ไม่มีข้อมูลหลังคา" };
    const pts = [], plates = dz.members.filter((x) => x.group === "plate"), cols = roof.columns ?? [];
    const addAt = (p, P) => { const hit = pts.find((x) => Math.hypot(x.p[0] - p[0], x.p[1] - p[1]) < 0.05); if (hit) hit.P += P; else pts.push({ p: [+p[0].toFixed(3), +p[1].toFixed(3)], P, name: "หลังคา" }); };
    for (const m of plates) for (const [p, R] of [[m.p, m.inner ? m.r.Rl : m.r.R], [m.q, m.inner ? m.r.Rr : m.r.R]]) {
      // an interior plate ending on a wall plate between columns: split its reaction to that span's ends (lever rule)
      const onCol = cols.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) < 0.05), host = m.inner && !onCol && plates.find((w) => !w.inner && (() => {
        const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((p[0] - w.p[0]) * (w.q[0] - w.p[0]) + (p[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > 0.01 && t < 0.99 && Math.abs((p[0] - w.p[0]) * (w.q[1] - w.p[1]) - (p[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.05; })());
      if (host) { const L = Math.hypot(host.q[0] - host.p[0], host.q[1] - host.p[1]), a = Math.hypot(p[0] - host.p[0], p[1] - host.p[1]); addAt(host.p, (R * (L - a)) / L); addAt(host.q, (R * a) / L); }
      else addAt(p, R);
    }
    // ดั้ง standing on a wall plate (not on an interior plate): ridge / hip reactions down that post
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05, innerLines = plates.filter((x) => x.inner);
    for (const post of fr.posts.filter((x) => x.kind === "ดั้ง")) {
      const q = [post.x, post.y];
      if (innerLines.some((w) => { const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((q[0] - w.p[0]) * (w.q[0] - w.p[0]) + (q[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > -0.01 && t < 1.01 && Math.abs((q[0] - w.p[0]) * (w.q[1] - w.p[1]) - (q[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.15; })) continue; // carried by an interior plate (already in its reactions)
      const P = dz.members.reduce((t, x) => t + ((x.group === "ridge" || x.group === "support") && (near(x.p, q) || near(x.q, q)) ? x.r.R : 0)
        + ((x.group === "hip" || x.group === "valley") && near(x.q, q) ? Math.max(0, x.r.Rmin) : 0), 0);
      if (!(P > 0)) continue;
      const host = plates.find((w) => !w.inner && (() => { const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((q[0] - w.p[0]) * (w.q[0] - w.p[0]) + (q[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > -0.01 && t < 1.01 && Math.abs((q[0] - w.p[0]) * (w.q[1] - w.p[1]) - (q[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.05; })());
      if (host) { const L = Math.hypot(host.q[0] - host.p[0], host.q[1] - host.p[1]), a = Math.hypot(q[0] - host.p[0], q[1] - host.p[1]); addAt(host.p, (P * (L - a)) / L); addAt(host.q, (P * a) / L); }
      else addAt(q, P);
    }
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
  const top = frame.floors.length - 1, Z = frame.floors.reduce((s, f) => s + (f.h ?? 3), 0) - (frame.floors[0]?.h ?? 0);
  const g = frame.floors[top].grid ?? frame.floors[0].grid;
  return { pts: P, edges: P.map(() => ({ type: "hip" })), columns: frame.floors[top].columns.map((c) => [...c]), plates: P.map((a, i) => ({ a, b: P[(i + 1) % P.length] })),
    innerPlates: [], dang: null, supports: null, H: +Z.toFixed(2), ...(g ? { grid: { x0: g.x0 ?? 0, y0: g.y0 ?? 0, dx: g.dx, dy: g.dy, sub: g.sub ?? 1 } } : {}), linkFloor: top };
}
