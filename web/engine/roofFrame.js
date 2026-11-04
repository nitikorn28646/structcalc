// Roof framing from roof geometry: rafters (จันทัน), purlins (แป), rafter supports (สะพานรับจันทัน) and posts (ดั้ง/ตุ๊กตา). Units m.

// Plan intersections of the line p + t·u with every edge of polygon P (returns sorted t).
function cuts(P, p, u) {
  const ts = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], b = P[(i + 1) % P.length], ex = b[0] - a[0], ey = b[1] - a[1], den = u[0] * ey - u[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - p[0]) * ey - (a[1] - p[1]) * ex) / den, s = ((a[0] - p[0]) * u[1] - (a[1] - p[1]) * u[0]) / den;
    if (s >= -1e-9 && s < 1 - 1e-9) ts.push(t);
  }
  return ts.sort((x, y) => x - y);
}

// point on the outline (within 2 cm of an edge)
const onWall = (P, [x, y]) => P.some((a, i) => {
  const b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2));
  return Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y) < 0.02;
});

const inside = (P, [x, y]) => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const [xi, yi] = P[i], [xj, yj] = P[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
};

// Face frame: eave start point, unit direction along the eave, inward normal and the farthest plan reach.
function faceFrame(g, f) {
  const n = g.eave.length, a = g.eave[f.edge], b = g.eave[(f.edge + 1) % n], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nrm = [-u[1], u[0]];
  const reach = Math.max(...f.P.map((v) => (v[0] - a[0]) * nrm[0] + (v[1] - a[1]) * nrm[1]));
  return { a, u, nrm, L, reach, plan: f.P.map((v) => [v[0], v[1]]) };
}

// Roof surface height at a plan point (face that contains it, else eave height).
export function surfaceZ(g, pt) {
  for (const f of g.faces) if (!f.gable && f.plane && inside(f.P, pt)) return f.plane.a * pt[0] + f.plane.b * pt[1] + f.plane.c;
  return g.H;
}

// Segments of the line parallel to the face's eave at plan offset d, clipped to the face.
function strip(F, d) {
  const p = [F.a[0] + F.nrm[0] * d, F.a[1] + F.nrm[1] * d], ts = cuts(F.plan, p, F.u), out = [];
  for (let k = 0; k + 1 < ts.length; k += 2) out.push([[p[0] + F.u[0] * ts[k], p[1] + F.u[1] * ts[k]], [p[0] + F.u[0] * ts[k + 1], p[1] + F.u[1] * ts[k + 1]]]);
  return out;
}

const roofFaces = (g) => g.faces.filter((f) => !f.gable && f.plane);

// Default supports: rings parallel to each eave so that no rafter span (along the slope) exceeds maxSpan.
export function autoSupports(g, roof) {
  const cos = 1 / Math.sqrt(1 + g.tan * g.tan), out = [];
  for (const f of roofFaces(g)) {
    const F = faceFrame(g, f), clear = F.reach - roof.overhang;
    const n = Math.ceil(clear / cos / roof.frame.maxSpan - 1e-9) - 1;
    for (let k = 1; k <= n; k++) for (const [a0, b0] of strip(F, roof.overhang + (clear * k) / (n + 1))) {
      // keep only the part over the walls (gable overhangs are not supported)
      const L = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]), u = [(b0[0] - a0[0]) / L, (b0[1] - a0[1]) / L];
      const ts = [0, ...cuts(g.pts, a0, u).filter((t) => t > 0 && t < L), L];
      for (let i = 0; i + 1 < ts.length; i++) {
        const m = (ts[i] + ts[i + 1]) / 2, a = [a0[0] + u[0] * ts[i], a0[1] + u[1] * ts[i]], b = [a0[0] + u[0] * ts[i + 1], a0[1] + u[1] * ts[i + 1]];
        if (ts[i + 1] - ts[i] > 0.3 && inside(g.pts, [a0[0] + u[0] * m, a0[1] + u[1] * m])) out.push({ a: a.map((v) => +v.toFixed(3)), b: b.map((v) => +v.toFixed(3)) });
      }
    }
  }
  return out;
}

function segX(p, q, a, b) {
  // plan intersection parameter along p→q with segment a→b (or null)
  const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, s = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
  return t > 1e-6 && t < 1 - 1e-6 && s >= -1e-6 && s <= 1 + 1e-6 ? t : null;
}

export function frameRoof(g, roof, supportsIn) {
  const { rafterSp, purlinSp, postSp } = roof.frame, sec = Math.sqrt(1 + g.tan * g.tan), cos = 1 / sec;
  const supports = (supportsIn ?? autoSupports(g, roof)).map((s) => ({ ...s, za: surfaceZ(g, s.a), zb: surfaceZ(g, s.b) }));
  const z = (f, [x, y]) => f.plane.a * x + f.plane.b * y + f.plane.c;
  const rafters = [], purlins = [];
  for (const f of roofFaces(g)) {
    const F = faceFrame(g, f);
    // rafters perpendicular to the eave over the whole face: common rafters start at the eave, valley jack rafters
    // (where the face reaches past its own eave edge) run from the valley up to the hip / ridge
    const m = Math.max(1, Math.round(F.L / rafterSp)), step = F.L / m;
    const proj = F.plan.map((v) => (v[0] - F.a[0]) * F.u[0] + (v[1] - F.a[1]) * F.u[1]);
    const s0 = Math.min(...proj), s1 = Math.max(...proj);
    for (let k = Math.ceil((s0 - 1e-6) / step); k * step <= s1 + 1e-6; k++) {
      const s = Math.min(Math.max(k * step + 1e-4, s0 + 0.01), s1 - 0.01), o = [F.a[0] + F.u[0] * s, F.a[1] + F.u[1] * s];
      const base = [o[0] - F.nrm[0] * 0.01, o[1] - F.nrm[1] * 0.01], ts = cuts(F.plan, base, F.nrm).map((t) => t - 0.01);
      for (let j = 0; j + 1 < ts.length; j += 2) {
        const t0 = Math.max(ts[j], 0), t1 = ts[j + 1];
        if (t1 - t0 < 0.05) continue;
        const p = [o[0] + F.nrm[0] * t0, o[1] + F.nrm[1] * t0], q = [o[0] + F.nrm[0] * t1, o[1] + F.nrm[1] * t1], L = t1 - t0, atEave = t0 < 1e-3;
        // supports along the rafter (plan distance from its lower end): valley end, wall line, crossing สะพาน, top end
        const st = atEave ? [] : [0];
        for (let w = 0; w < g.pts.length; w++) { const v = segX(p, q, g.pts[w], g.pts[(w + 1) % g.pts.length]); if (v !== null) st.push(v * L); }
        for (const sp of supports) { const v = segX(p, q, sp.a, sp.b); if (v !== null) st.push(v * L); }
        st.push(L);
        st.sort((x, y) => x - y);
        const spans = st.slice(1).map((v, i) => (v - st[i]) * sec).filter((v) => v > 0.02);
        // eave rafters beyond a gable wall (barge / verge) hang off the purlins, not the wall line
        // two faces of one straight wall (split by a collinear point) both put a rafter at their common edge: keep one
        if (rafters.some((r) => Math.hypot(r.p[0] - p[0], r.p[1] - p[1]) < 0.05 && Math.hypot(r.q[0] - q[0], r.q[1] - q[1]) < 0.05)) continue;
        const barge = atEave &&!inside(g.pts, [p[0] + F.nrm[0] * (roof.overhang + 0.05), p[1] + F.nrm[1] * (roof.overhang + 0.05)]);
        rafters.push({ p: [...p, z(f, p)], q: [...q, z(f, q)], len: L * sec, cant: atEave ? st[0] * sec : 0, spans: barge ? [] : spans, barge, jack: !atEave, face: f.edge });
      }
    }    // purlins parallel to the eave, spaced along the slope; one near the eave and one just below the top
    const offs = [];
    for (let d = 0.05; d < F.reach - 0.1; d += purlinSp * cos) offs.push(d);
    if (F.reach - 0.1 - offs[offs.length - 1] > 0.15 * purlinSp) offs.push(F.reach - 0.1);
    for (const d of offs) for (const [a, b] of strip(F, d + 1e-6)) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > 0.1) purlins.push({ p: [...a, z(f, a)], q: [...b, z(f, b)], len });
    }
  }
  // posts: ดั้ง under ridge/hip junctions and along ridges, ตุ๊กตา at support ends and along supports
  const posts = [], key = new Set();
  const addPost = ([x, y], top, kind) => {
    const k = `${x.toFixed(2)},${y.toFixed(2)}`;
    // a post needs something to stand on: none beyond the walls (ridge ends over a gable overhang)
    if (top - g.H > 0.15 && !key.has(k) && (inside(g.pts, [x, y]) || onWall(g.pts, [x, y]))) { key.add(k); posts.push({ x, y, top, kind, len: top - g.H }); }
  };
  const along = (a, b, za, zb, kind) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / postSp - 1e-9));
    for (let k = 0; k <= n; k++) addPost([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n], za + ((zb - za) * k) / n, kind);
    // where the line crosses a wall (gable wall under the ridge) the wall carries it: post on the wall line
    for (let w = 0; w < g.pts.length; w++) {
      const t = segX(a, b, g.pts[w], g.pts[(w + 1) % g.pts.length]);
      if (t !== null) addPost([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], za + (zb - za) * t, kind);
    }
  };
  if (roof.dang) for (const [x, y] of roof.dang) addPost([x, y], surfaceZ(g, [x, y]), "ดั้ง"); // placed by the user
  else {
    for (const l of g.lines) if (l.type === "ridge") along(l.p, l.q, l.p[2], l.q[2], "ดั้ง");
    for (const l of g.lines) if (l.type === "hip" || l.type === "valley") for (const v of [l.p, l.q]) addPost(v, v[2], "ดั้ง");
  }
  // ตุ๊กตา along the supports only while the posts are automatic; once the engineer places the ดั้ง (roof.dang) they place every
  // post themselves (user 2026-11-04: "สะพานสร้างดั้งเอง ไม่ต้อง เดี๋ยวผมสร้างเอง") — the support then spans between those posts
  if (!roof.dang) for (const s of supports) along(s.a, s.b, s.za, s.zb, "ตุ๊กตา");
  const supLen = supports.reduce((a, s) => a + Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1], s.zb - s.za), 0);
  const sum = (arr) => arr.reduce((a, m) => a + m.len, 0);
  return {
    rafters, purlins, supports, posts,
    totals: { purlin: sum(purlins), rafter: sum(rafters), ridge: g.ridge, hip: g.hip, valley: g.valley, support: supLen, post: sum(posts) },
    maxSpan: Math.max(0, ...rafters.flatMap((r) => r.spans)), maxCant: Math.max(0, ...rafters.filter((r) => !r.barge).map((r) => Math.min(r.cant, r.len))), // barge rafters hang off the purlins
  };
}
