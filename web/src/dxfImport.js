// Minimal ASCII DXF reader for plan import: LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC centre, POINT, INSERT — grouped by layer.
const UNIT = { 1: 0.0254, 4: 0.001, 5: 0.01, 6: 1 }; // $INSUNITS → metres

export function parseDxf(text) {
  const raw = text.replace(/^﻿/, "").split(/\r?\n/), pairs = [];
  for (let i = 0; i + 1 < raw.length; i += 2) pairs.push([parseInt(raw[i], 10), raw[i + 1].trim()]);
  let unit = null, i = 0;
  const hu = pairs.findIndex(([c, v]) => c === 9 && v === "$INSUNITS");
  if (hu >= 0) unit = UNIT[parseInt(pairs[hu + 1]?.[1], 10)] ?? null;
  while (i < pairs.length && !(pairs[i][0] === 2 && pairs[i][1] === "ENTITIES")) i++;
  const ents = [];
  let e = null, poly = null;
  const flush = () => { if (e) ents.push(e); e = null; };
  for (i++; i < pairs.length; i++) {
    const [c, v] = pairs[i];
    if (c === 0) {
      if (v === "ENDSEC") break;
      if (v === "VERTEX" && poly) { flush(); e = { type: "VERTEX", owner: poly }; continue; }
      if (v === "SEQEND") { flush(); if (poly) { ents.push(poly); poly = null; } continue; }
      flush();
      e = { type: v, layer: "0", pts: [], flags: 0 };
      if (v === "POLYLINE") { poly = e; e = null; }
      continue;
    }
    const tgt = e ?? poly;
    if (!tgt) continue;
    if (c === 8 && tgt.type !== "VERTEX") tgt.layer = v;
    else if (c === 70 && tgt.type !== "VERTEX") tgt.flags = parseInt(v, 10);
    else if (c === 70 && tgt.type === "VERTEX" && (parseInt(v, 10) & 128)) tgt.owner.mesh = true; // polyface face record: not a line
    else if ((c === 10 || c === 20) && tgt.type === "POLYLINE") continue; // header carries a dummy point
    else if (c === 10) (tgt.type === "VERTEX" ? tgt.owner.pts : tgt.pts).push([parseFloat(v), 0]);
    else if (c === 20) { const P = tgt.type === "VERTEX" ? tgt.owner.pts : tgt.pts; if (P.length) P[P.length - 1][1] = parseFloat(v); }
    else if (c === 11 && tgt.type === "LINE") tgt.pts.push([parseFloat(v), 0]);
    else if (c === 21 && tgt.type === "LINE") tgt.pts[tgt.pts.length - 1][1] = parseFloat(v);
    else if (c === 30 || (c === 31 && tgt.type === "LINE")) { const P = tgt.type === "VERTEX" ? tgt.owner.pts : tgt.pts; if (P.length) P[P.length - 1][2] = parseFloat(v); } // z (3D models, e.g. SketchUp)
    else if (c === 40) tgt.r = parseFloat(v);
  }
  flush();
  const out = ents.filter((x) => x.type !== "VERTEX" && x.pts.length);
  const layers = {};
  for (const x of out) (layers[x.layer] ??= []).push(x);
  return { unit, layers };
}

// Guess what a layer is from its name.
export function guessRole(name) {
  const n = name.toUpperCase();
  if (/อะเสรับดั้ง|INNER|TIE|BEAM-IN/.test(n)) return "inner";
  if (/อะเส|PLATE|RING|BEAM/.test(n)) return "plates";
  if (/เสา|COL/.test(n)) return "columns";
  if (/ผนัง|WALL|OUTLINE/.test(n)) return "walls";
  return "skip";
}

const area = (P) => P.reduce((a, [x, y], i) => { const [u, v] = P[(i + 1) % P.length]; return a + x * v - u * y; }, 0) / 2;

// Convert chosen layers to plan data (metres), shifted so the drawing's lower-left corner sits at the origin.
export function toPlan(dxf, roles, scale) {
  const all = Object.entries(dxf.layers).filter(([l]) => roles[l] && roles[l] !== "skip").flatMap(([, ents]) => ents.flatMap((x) => x.pts));
  if (!all.length) return null;
  const x0 = Math.min(...all.map((p) => p[0])), y0 = Math.min(...all.map((p) => p[1]));
  const T = ([x, y]) => [+((x - x0) * scale).toFixed(3), +((y - y0) * scale).toFixed(3)];
  const res = { walls: null, columns: [], plates: [], inner: [] };
  for (const [layer, ents] of Object.entries(dxf.layers)) {
    const role = roles[layer];
    if (!role || role === "skip") continue;
    for (const x of ents) {
      const P = x.pts.map(T), closed = (x.flags & 1) === 1 || (P.length > 2 && Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-3);
      if (role === "columns") {
        // circle / insert / point = centre; small closed outline = its centre
        if (["CIRCLE", "ARC", "POINT", "INSERT"].includes(x.type)) res.columns.push(P[0]);
        else if (closed) res.columns.push(T([x.pts.reduce((a, p) => a + p[0], 0) / x.pts.length, x.pts.reduce((a, p) => a + p[1], 0) / x.pts.length]));
      } else if (role === "walls") {
        if (closed && P.length >= 3) {
          const ring = Math.hypot(P[0][0] - P[P.length - 1][0], P[0][1] - P[P.length - 1][1]) < 1e-3 ? P.slice(0, -1) : P;
          if (!res.walls || Math.abs(area(ring)) > Math.abs(area(res.walls))) res.walls = ring;
        }
      } else if (x.type === "LINE" || x.type === "LWPOLYLINE" || x.type === "POLYLINE") {
        const segs = P.slice(1).map((b, k) => ({ a: P[k], b }));
        if (closed && P.length > 2) segs.push({ a: P[P.length - 1], b: P[0] });
        res[role === "plates" ? "plates" : "inner"].push(...segs.filter((s) => Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > 0.05));
      }
    }
  }
  if (res.walls && area(res.walls) < 0) res.walls.reverse(); // counter-clockwise outline
  return res;
}

// ── 3D roof frame (one layer, e.g. exported from SketchUp): plates / ดั้ง / ridges told apart by their z ──
// horizontal lines at the plate level = wall plates (outer loop) + interior plates; vertical lines = ดั้ง; horizontal lines higher up
// = ridges (give the slope); sloped lines = hips / valleys / rafters (rebuilt by the program). Returns null for a flat drawing.
function outerLoop(segs) {
  const V = [], vid = (p) => { let i = V.findIndex((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.02); if (i < 0) { V.push(p); i = V.length - 1; } return i; };
  const adj = new Map(), link = (a, b) => { if (a === b) return; (adj.get(a) ?? adj.set(a, new Set()).get(a)).add(b); (adj.get(b) ?? adj.set(b, new Set()).get(b)).add(a); };
  // split every segment where another one touches it
  for (const s of segs) {
    const d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], L = Math.hypot(...d), u = [d[0] / L, d[1] / L], ts = [0, L];
    for (const o of segs) if (o !== s) for (const q of [o.a, o.b]) { const t = (q[0] - s.a[0]) * u[0] + (q[1] - s.a[1]) * u[1], off = Math.abs((q[0] - s.a[0]) * u[1] - (q[1] - s.a[1]) * u[0]); if (off < 0.02 && t > 0.02 && t < L - 0.02) ts.push(t); }
    const pts = [...new Set(ts.map((t) => +t.toFixed(3)))].sort((a, b) => a - b).map((t) => vid([s.a[0] + u[0] * t, s.a[1] + u[1] * t]));
    for (let i = 0; i + 1 < pts.length; i++) link(pts[i], pts[i + 1]);
  }
  for (let pr = true; pr;) { pr = false; for (const [v, n] of adj) if (n.size < 2) { for (const w of n) adj.get(w)?.delete(v); adj.delete(v); pr = true; } }
  if (adj.size < 3) return null;
  const ids = [...adj.keys()], start = ids.reduce((a, b) => (V[b][1] < V[a][1] - 1e-6 || (Math.abs(V[b][1] - V[a][1]) < 1e-6 && V[b][0] < V[a][0]) ? b : a));
  const ang = (a, b) => Math.atan2(V[b][1] - V[a][1], V[b][0] - V[a][0]);
  let prev = -Math.PI / 2, cur = start; const loop = [start];
  for (let g = 0; g < 4 * V.length; g++) {
    let best = null, bt = Infinity;
    for (const w of adj.get(cur)) { let t = ang(cur, w) - prev; while (t <= -Math.PI) t += 2 * Math.PI; while (t > Math.PI) t -= 2 * Math.PI; if (loop.length > 1 && w === loop[loop.length - 2]) t = 10; if (t < bt) { bt = t; best = w; } }
    if (best === null || best === start) break;
    prev = ang(cur, best); cur = best; loop.push(best);
  }
  let P = loop.map((i) => V[i]);
  P = P.filter((p, i) => { const a = P[(i + P.length - 1) % P.length], b = P[(i + 1) % P.length]; return Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) > 1e-6; });
  if (area(P) < 0) P.reverse();
  return P;
}
// join collinear pieces that touch end to end (exports split every line at every node)
function mergeSegs(segs) {
  const out = segs.map((s) => ({ a: [...s.a], b: [...s.b] }));
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < out.length; i++) for (let j = i + 1; j < out.length; j++) {
      const s = out[i], o = out[j], d = [s.b[0] - s.a[0], s.b[1] - s.a[1]], e = [o.b[0] - o.a[0], o.b[1] - o.a[1]];
      if (Math.abs(d[0] * e[1] - d[1] * e[0]) > 1e-6 * Math.hypot(...d) * Math.hypot(...e)) continue;
      for (const [p, q, r, t] of [[s.a, s.b, o.a, o.b], [s.a, s.b, o.b, o.a], [s.b, s.a, o.a, o.b], [s.b, s.a, o.b, o.a]])
        if (Math.hypot(q[0] - r[0], q[1] - r[1]) < 0.005) { out[i] = { a: p, b: t }; out.splice(j, 1); changed = true; break outer; }
    }
  }
  return out;
}
export function roof3d(dxf, scale = 1) {
  const S = [];
  for (const ents of Object.values(dxf.layers)) for (const x of ents) {
    if (x.mesh || x.type === "INSERT" || x.type === "CIRCLE" || x.type === "POINT") continue;
    const P = x.pts.map((p) => [p[0] * scale, p[1] * scale, (p[2] ?? 0) * scale]);
    for (let k = 0; k + 1 < P.length; k++) S.push([P[k], P[k + 1]]);
  }
  const zs = S.flatMap(([a, b]) => [a[2], b[2]]);
  if (!S.length || Math.max(...zs) - Math.min(...zs) < 0.3) return null;
  const plan = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  const posts = [], horiz = new Map(), sloped = [];
  for (const [a, b] of S) {
    if (plan(a, b) < 0.02 && Math.abs(b[2] - a[2]) > 0.05) { if (!posts.some((p) => Math.hypot(p[0] - a[0], p[1] - a[1]) < 0.02)) posts.push([a[0], a[1], Math.min(a[2], b[2]), Math.max(a[2], b[2])]); }
    else if (plan(a, b) >= 0.02 && Math.abs(b[2] - a[2]) < 0.02) { const z = Math.round(((a[2] + b[2]) / 2) * 50) / 50; (horiz.get(z) ?? horiz.set(z, []).get(z)).push({ a: a.slice(0, 2), b: b.slice(0, 2) }); }
    else if (plan(a, b) >= 0.02) sloped.push([a, b]);
  }
  const lv = [...horiz.entries()].map(([z, l]) => ({ z, l, len: l.reduce((s, x) => s + plan(x.a, x.b), 0) })).sort((p, q) => p.z - q.z);
  if (!lv.length) return null;
  const big = Math.max(...lv.map((x) => x.len)), plateLv = lv.find((x) => x.len >= 0.2 * big), zP = plateLv.z;
  const ridges = mergeSegs(lv.filter((x) => x.z > zP + 0.1).flatMap((x) => x.l));
  // same coordinates as the drawing (models are drawn on the structure's axes — no shift); plate-level lines merged into plates
  return { plates: mergeSegs(plateLv.l), posts: posts.map((p) => [+p[0].toFixed(3), +p[1].toFixed(3)]), ridges, H: zP, ridgeZ: lv.at(-1).z,
    counts: { plates: mergeSegs(plateLv.l).length, posts: posts.length, ridges: ridges.length, sloped: sloped.length } };
}

// what a 3D roof frame changes in the roof: with an outline already there (e.g. from the structure) the plate-level lines that are
// not on it become interior plates (อะเสรับดั้ง) and the vertical lines become ดั้ง; slope = rise of the ridges over their plan
// distance to the nearest outline edge (median). Without an outline, the outer loop of the plate lines becomes the outline.
export function roof3dPatch(r, roof) {
  const plan = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  let loop = roof?.pts?.length >= 3 ? roof.pts : outerLoop(r.plates);
  if (!loop) return null;
  const onLoop = (p) => loop.some((q, i) => { const s = loop[(i + 1) % loop.length], L = plan(q, s), t = ((p[0] - q[0]) * (s[0] - q[0]) + (p[1] - q[1]) * (s[1] - q[1])) / (L * L);
    return t > -0.001 && t < 1.001 && Math.abs((p[0] - q[0]) * (s[1] - q[1]) - (p[1] - q[1]) * (s[0] - q[0])) / L < 0.03; });
  const inner = r.plates.filter((x) => !(onLoop(x.a) && onLoop(x.b) && onLoop([(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2])));
  const edgeDist = (p) => Math.min(...loop.map((q, i) => { const s = loop[(i + 1) % loop.length], L = plan(q, s), t = Math.max(0, Math.min(1, ((p[0] - q[0]) * (s[0] - q[0]) + (p[1] - q[1]) * (s[1] - q[1])) / (L * L))); return plan(p, [q[0] + (s[0] - q[0]) * t, q[1] + (s[1] - q[1]) * t]); }));
  const tans = r.ridges.map((x) => (r.ridgeZ - r.H) / Math.max(0.1, edgeDist([(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2]))).sort((a, b) => a - b);
  const slope = tans.length ? +((Math.atan(tans[tans.length >> 1]) * 180) / Math.PI).toFixed(1) : null;
  const R3 = (p) => p.map((v) => +v.toFixed(3));
  return { ...(roof?.pts?.length >= 3 ? {} : { pts: loop.map(R3), edges: loop.map(() => ({ type: "hip" })), plates: loop.map((p, i) => ({ a: R3(p), b: R3(loop[(i + 1) % loop.length]) })) }),
    innerPlates: inner.map((x) => ({ a: R3(x.a), b: R3(x.b) })), dang: r.posts, slope, rise: +(r.ridgeZ - r.H).toFixed(2) };
}
