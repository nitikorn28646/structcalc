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
    else if ((c === 10 || c === 20) && tgt.type === "POLYLINE") continue; // header carries a dummy point
    else if (c === 10) (tgt.type === "VERTEX" ? tgt.owner.pts : tgt.pts).push([parseFloat(v), 0]);
    else if (c === 20) { const P = tgt.type === "VERTEX" ? tgt.owner.pts : tgt.pts; if (P.length) P[P.length - 1][1] = parseFloat(v); }
    else if (c === 11 && tgt.type === "LINE") tgt.pts.push([parseFloat(v), 0]);
    else if (c === 21 && tgt.type === "LINE") tgt.pts[tgt.pts.length - 1][1] = parseFloat(v);
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
