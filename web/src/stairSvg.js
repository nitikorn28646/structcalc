// Primitives of engine/stairDetail.js → one SVG string (app panel, report, tests). Model units = metres, y up; SVG y down.
// poly points may carry a DXF bulge as the third value (arc to the next point, + = counter-clockwise in y-up).
const COL = {
  "C-CONC": "#1f2937", "C-STIRRUP": "#0f766e", "C-BAR": "#b91c1c", "C-BAR-EXTRA": "#1d4ed8", "C-DIM": "#4b5563",
  "C-TEXT": "#111827", "C-TITLE": "#111827", "C-ELEV": "#6b7280", "C-FRAME2": "#9ca3af",
};
const W = { "C-CONC": 1.4, "C-STIRRUP": 1.0, "C-BAR": 1.6, "C-BAR-EXTRA": 1.6, "C-DIM": 0.6, "C-TEXT": 0.6, "C-TITLE": 0.9, "C-ELEV": 0.6, "C-FRAME2": 0.6 };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function stairSvgString(model, { px = 190, mono = false } = {}) {
  const [x0, y0, x1, y1] = model.box, k = px, X = (x) => ((x - x0) * k).toFixed(2), Y = (y) => ((y1 - y) * k).toFixed(2);
  const col = (l) => (mono ? "#111" : COL[l] ?? "#111"), sw = (l, bar) => (bar ? Math.max(1.3, bar * k * 0.9) : W[l] ?? 0.8);
  const out = [];
  const path = (pts, closed) => {
    let d = `M${X(pts[0][0])} ${Y(pts[0][1])}`;
    for (let i = 1; i < pts.length + (closed ? 1 : 0); i++) {
      const p = pts[i - 1], q = pts[i % pts.length], b = p[2] ?? 0;
      if (Math.abs(b) > 1e-9) {
        const ch = Math.hypot(q[0] - p[0], q[1] - p[1]), ang = 4 * Math.atan(Math.abs(b)), r = ch / (2 * Math.sin(ang / 2));
        d += ` A${(r * k).toFixed(2)} ${(r * k).toFixed(2)} 0 ${ang > Math.PI ? 1 : 0} ${b > 0 ? 0 : 1} ${X(q[0])} ${Y(q[1])}`;
      } else d += ` L${X(q[0])} ${Y(q[1])}`;
    }
    return d + (closed ? " Z" : "");
  };
  const hatchId = "sh" + Math.random().toString(36).slice(2, 7);
  out.push(`<defs><pattern id="${hatchId}" width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="#9ca3af" stroke-width="0.6"/></pattern></defs>`);
  for (const p of model.items) {
    const c = col(p.layer);
    if (p.t === "line") out.push(`<line x1="${X(p.x1)}" y1="${Y(p.y1)}" x2="${X(p.x2)}" y2="${Y(p.y2)}" stroke="${c}" stroke-width="${sw(p.layer)}"${p.dash ? ' stroke-dasharray="6 3 1.5 3"' : ""}/>`);
    else if (p.t === "poly") {
      const fill = p.fill ? `url(#${hatchId})` : "none";
      out.push(`<path d="${path(p.pts, p.closed)}" fill="${fill}" stroke="${c}" stroke-width="${sw(p.layer, p.bar)}" stroke-linejoin="round" stroke-linecap="round"/>`);
    } else if (p.t === "circle") out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${Math.max(1.6, p.r * k).toFixed(2)}" fill="none" stroke="${c}" stroke-width="1"/>`);
    else if (p.t === "disk") out.push(`<circle cx="${X(p.x)}" cy="${Y(p.y)}" r="${Math.max(1.5, p.r * k).toFixed(2)}" fill="${c}"/>`);
    else if (p.t === "tri") out.push(`<path d="M${X(p.x)} ${Y(p.y)} l${(-p.s * k * 0.6).toFixed(2)} ${(-p.s * k).toFixed(2)} h${(p.s * k * 1.2).toFixed(2)} Z" fill="${c}"/>`);
    else if (p.t === "text") {
      const anchor = ["start", "middle", "end"][p.ha ?? 0], base = ["alphabetic", "text-after-edge", "central", "hanging"][p.va ?? 0];
      out.push(`<text x="${X(p.x)}" y="${Y(p.y)}" font-size="${(p.h * k * 1.25).toFixed(2)}" text-anchor="${anchor}" dominant-baseline="${base}" fill="${c}"${p.rot ? ` transform="rotate(${(-p.rot).toFixed(2)} ${X(p.x)} ${Y(p.y)})"` : ""}${p.layer === "C-TITLE" ? ' font-weight="700"' : ""}>${esc(p.s)}</text>`);
    }
  }
  const w = ((x1 - x0) * k).toFixed(0), h = ((y1 - y0) * k).toFixed(0);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="100%" style="max-width:${w}px;font-family:Sarabun,Tahoma,sans-serif" role="img">${out.join("")}</svg>`;
}
