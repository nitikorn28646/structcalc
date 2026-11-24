// One dimension primitive for every detail model (user 2026-11-24: "ไดเมนชั่นต้องเป็นไดเมนชั่นจริงๆ ไม่ใช่แปะเส้นและข้อความ"):
// the models push { t: "dim", … } and
//   - the DXF writer (src/beamDetailDxf.js Dxf.dimension) turns it into a real DIMENSION entity (rotated 0° / 90° or aligned) with its
//     own anonymous block *Dn holding the same lines / ticks / text as below and a dim style (text height, tick size, colours);
//   - the SVG renderer (src/stairSvg.js) draws dimParts(p).
// Geometry: x1,y1 / x2,y2 = measured points (extension line origins); ax,ay / bx,by = dimension line ends (same direction as p1→p2);
// label = text (blank → measured length, 2 decimals); th = text height; cd / ce / ct = colours of the line / extension lines / text.

export const DIM_DEC = 2;
export const dimSizes = (th) => ({ tsz: 0.28 * th, exo: 0.3 * th, exe: 0.6 * th, dle: 0.6 * th, gap: 0.28 * th });

// off = distance of the dimension line from p1→p2, to the LEFT of p1→p2 (negative = right)
export function dimItem(x1, y1, x2, y2, off, label, th = 0.05, o = {}) {
  const L = Math.hypot(x2 - x1, y2 - y1) || 1, nx = -(y2 - y1) / L, ny = (x2 - x1) / L;
  return { t: "dim", x1, y1, x2, y2, ax: x1 + nx * off, ay: y1 + ny * off, bx: x2 + nx * off, by: y2 + ny * off, label: label ?? "", th, layer: o.layer ?? "C-DIM", ...o };
}
// horizontal: measured points at yObj, dimension line at y · vertical: measured points at xObj, dimension line at x
export const dimH = (xa, xb, yObj, y, label, th, o) => ({ ...dimItem(xa, yObj, xb, yObj, y - yObj, label, th, o) });
export const dimV = (ya, yb, xObj, x, label, th, o) => ({ ...dimItem(xObj, ya, xObj, yb, xObj - x, label, th, o) });

export const dimText = (p) => (String(p.label ?? "") !== "" ? String(p.label) : Math.hypot(p.bx - p.ax, p.by - p.ay).toFixed(DIM_DEC));

// the drawing of a dimension: lines + one text (model primitives, absolute coordinates)
export function dimParts(p) {
  const { tsz, exo, exe, dle, gap } = dimSizes(p.th), out = [], s = dimText(p);
  const L = Math.hypot(p.bx - p.ax, p.by - p.ay) || 1, ux = (p.bx - p.ax) / L, uy = (p.by - p.ay) / L, nx = -uy, ny = ux;
  for (const [ox, oy, qx, qy] of [[p.x1, p.y1, p.ax, p.ay], [p.x2, p.y2, p.bx, p.by]]) { // extension lines (none when the line runs through the point)
    const d = Math.hypot(qx - ox, qy - oy); if (d < 1e-6) continue; const ex = (qx - ox) / d, ey = (qy - oy) / d;
    if (d > exo) out.push({ t: "line", x1: ox + ex * exo, y1: oy + ey * exo, x2: qx + ex * exe, y2: qy + ey * exe, layer: p.layer, c: p.ce ?? 0 });
  }
  out.push({ t: "line", x1: p.ax - ux * dle, y1: p.ay - uy * dle, x2: p.bx + ux * dle, y2: p.by + uy * dle, layer: p.layer, c: p.cd ?? 0 });
  for (const [qx, qy] of [[p.ax, p.ay], [p.bx, p.by]]) out.push({ t: "line", x1: qx - (ux + nx) * tsz * 0.7071, y1: qy - (uy + ny) * tsz * 0.7071, x2: qx + (ux + nx) * tsz * 0.7071, y2: qy + (uy + ny) * tsz * 0.7071, layer: p.layer, c: p.cd ?? 0 });
  // text: above the line (reading from the bottom / the right), beside the far end when it does not fit between the ticks
  let rot = (Math.atan2(uy, ux) * 180) / Math.PI; if (rot > 90.01 || rot <= -90.01) rot += rot > 0 ? -180 : 180;
  const r = (rot * Math.PI) / 180, upx = -Math.sin(r), upy = Math.cos(r), w = s.length * p.th * 0.55;
  let tx = (p.ax + p.bx) / 2, ty = (p.ay + p.by) / 2;
  if (w + 2 * tsz > L && s.length <= 7) { tx = p.bx + ux * (dle + gap + w / 2); ty = p.by + uy * (dle + gap + w / 2); } // short numbers beside, long notes stay centred
  const k = p.below ? -(gap + p.th) : gap; // text under the line on request (labels of the joint / planted-column details)
  out.push({ t: "text", x: tx + upx * k, y: ty + upy * k, h: p.th, s, layer: p.layer, ha: 1, va: 1, rot, c: p.ct ?? 0 });
  return out;
}

// extents of a dimension (for the models' boxes)
export function dimBox(p) {
  const xs = [], ys = [];
  for (const q of dimParts(p)) { if (q.t === "line") { xs.push(q.x1, q.x2); ys.push(q.y1, q.y2); } else { const w = q.s.length * q.h * 0.55;
    if (Math.abs(q.rot) > 45) { xs.push(q.x - q.h * 1.4, q.x + q.h); ys.push(q.y - w / 2, q.y + w / 2); } else { xs.push(q.x - w / 2, q.x + w / 2); ys.push(q.y - q.h, q.y + q.h * 1.4); } } }
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
}
