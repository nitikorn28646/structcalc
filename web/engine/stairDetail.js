// Stair section detail drawn after the user's own sheet (2d644ae4-new_block.dxf, 2026-11-19: "รูปตัดบันได ST-1 ช่วงที่ 1/2", 1:25):
// the flight goes UP to the right from the foot support (beam under the first riser / slab / ground) to the head support (landing
// slab + landing beam, or the floor beam). Detailing exactly as on that sheet:
//   main bars ("เหล็กเสริมหลัก") — vertical leg in the foot beam with a 180° hook, along the soffit at the cover, STRAIGHT past the knee
//     up to the top of the landing, along the landing top and down into the head beam with a hook;
//   landing bottom bars — along the landing soffit (hooked up in the head beam) and on past the knee 0.75 m along the slope near the
//     top of the waist (crossed bars at the knee), 180° hook;
//   top bars at the foot ("เหล็กเสริมบน") — vertical leg in the foot beam, 0.75 m along the slope near the top of the waist, hook;
//   step bars ("เหล็กลูกขั้น") — zig-zag at the cover inside every riser and under every tread, on 0.25 m along the top, hooks;
//   a bar at every bend ("ทุกมุม") and distribution bars ("เหล็กกันร้าว") as dots along the bars;
//   dimensions (support widths / run / landing / overall, tread, riser, waist square to the pitch, soffit length, the 0.75 m bar
//   lengths, thicknesses, rise), level lines ▼ with names, leaders = vertical from the bar + an underline the text sits on,
//   a note line (thickness / riser / tread / cover), title underlined + scale.
// METRES, x from the outer face of the foot support (first riser) to the right, y up from the foot floor level. Output = primitives
// (line / poly with bulges / circle / disk / tri / text) so the SVG (app, report) and the DXF draw the same thing. Drawing only.

const BAR_D = { "RB 6": 0.006, "RB 9": 0.009, "DB 10": 0.01, "DB 12": 0.012, "DB 16": 0.016, "DB 20": 0.02, "DB 25": 0.025 };
export function parseBarText(s, fallback = "DB 12 @ 0.20") {
  const rx = /^\s*((?:RB|DB)\s*\d+)\s*@\s*([\d.]+)/i, m = rx.exec(s ?? "") ?? rx.exec(fallback);
  const bar = m[1].toUpperCase().replace(/(RB|DB)\s*/, "$1 ");
  return { bar, d: BAR_D[bar] ?? (parseInt(bar.replace(/\D/g, ""), 10) / 1000 || 0.012), s: Number(m[2]) || 0.2 };
}
const lvTxt = (z) => (Math.abs(z) < 0.005 ? "±0.00" : `${z > 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`);
const f2 = (v) => Number(v).toFixed(2);
const cmTxt = (v) => `${Math.round(v * 1000) / 10}`.replace(/\.0$/, "");

// o: { n risers, R, T, t (waist), Lt (landing length on top, 0 = the head beam right at the top riser), tl (landing thickness),
//      head {b, h, name, bars}, foot "beam"|"panel"|"ground"|"none", footBeam {b, h, name, bars}, slabT (floor slab at the head, long),
//      cover, main "DB 12 @ 0.12", temp "RB 9 @ 0.15", stepBar, zFoot, zTop, footLevelName, topLevelName, title, scale }
export function stairDetailModel(o) {
  const P = [];
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false, fill = null) => P.push({ t: "poly", pts, layer, closed, fill });
  const circle = (x, y, r, layer = "C-BAR") => P.push({ t: "circle", x, y, r, layer });
  const disk = (x, y, r, layer = "C-BAR") => P.push({ t: "disk", x, y, r: Math.max(r, 0.0045), layer });
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
  const TH = o.th ?? 0.0625, DH = 0.0625;

  // aligned dimension p1 → p2, dimension line `off` to the LEFT of p1→p2, 45° ticks, text above the line, reading upwards
  const dim = (x1, y1, x2, y2, off, label) => {
    const L = Math.hypot(x2 - x1, y2 - y1) || 1, ux = (x2 - x1) / L, uy = (y2 - y1) / L, nx = -uy, ny = ux, sg = Math.sign(off) || 1;
    const a = [x1 + nx * off, y1 + ny * off], b = [x2 + nx * off, y2 + ny * off], g = 0.012;
    if (Math.abs(off) > 0.02) { line(x1 + nx * g * sg, y1 + ny * g * sg, a[0] + nx * 0.03 * sg, a[1] + ny * 0.03 * sg, "C-DIM"); line(x2 + nx * g * sg, y2 + ny * g * sg, b[0] + nx * 0.03 * sg, b[1] + ny * 0.03 * sg, "C-DIM"); }
    line(a[0] - ux * 0.03, a[1] - uy * 0.03, b[0] + ux * 0.03, b[1] + uy * 0.03, "C-DIM");
    const tk = 0.016; for (const q of [a, b]) line(q[0] - (ux + nx) * tk * 0.7, q[1] - (uy + ny) * tk * 0.7, q[0] + (ux + nx) * tk * 0.7, q[1] + (uy + ny) * tk * 0.7, "C-DIM");
    let rot = (Math.atan2(uy, ux) * 180) / Math.PI, flip = false; if (rot > 90.01 || rot <= -90.01) { rot += rot > 0 ? -180 : 180; flip = true; }
    const r = (rot * Math.PI) / 180, up = [-Math.sin(r), Math.cos(r)]; // the text's "up" direction
    text((a[0] + b[0]) / 2 + up[0] * 0.012, (a[1] + b[1]) / 2 + up[1] * 0.012, DH, label, "C-DIM", 1, 1, rot);
    void flip;
  };
  // leader as on the sheet: a tick at the bar, a line to the text level, and an underline the text sits on (ha 0 → text to the right)
  const leader = (bx, by, ty, tx, s, ha = 0, viaX = null) => {
    const w = textW(s, TH) + 0.04, ex = ha === 0 ? tx + w : tx - w, vx = viaX ?? bx;
    line(bx - 0.006, by, bx + 0.006, by, "C-TEXT");
    poly([[bx, by], [vx, ty], [ex, ty]], "C-TEXT");
    text(ha === 0 ? tx + 0.02 : tx - 0.02, ty + 0.012, TH, s, "C-TEXT", ha, 1);
  };
  const hook = (pts, end, d, dir = 1) => { // 180° hook at the start (end = 0) or the end (end = 1) of a bar polyline
    const r = Math.max(2.5 * d, 0.02), [p, q] = end ? [pts.at(-1), pts.at(-2)] : [pts[0], pts[1]];
    const L = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1, ux = (p[0] - q[0]) / L, uy = (p[1] - q[1]) / L, nx = -uy * dir, ny = ux * dir;
    const a = [p[0] + nx * 2 * r, p[1] + ny * 2 * r], tail = [a[0] - ux * 0.05, a[1] - uy * 0.05];
    const bulge = -dir; // semicircle
    if (end) { pts[pts.length - 1] = [p[0], p[1], bulge]; pts.push(a, tail); } else { pts.unshift(tail, [a[0], a[1], -bulge]); }
    return pts;
  };
  const bar = (pts, d, layer) => P.push({ t: "poly", pts, layer, closed: false, bar: d });
  const beamBars = (x0, y0, b, h, bars, cover) => {
    const st = cover, d = bars?.d ?? 0.012, r = d / 2;
    poly([[x0 + st, y0 + st], [x0 + b - st, y0 + st], [x0 + b - st, y0 + h - st], [x0 + st, y0 + h - st]], "C-STIRRUP", true);
    const xa = x0 + st + 0.004 + r, xb = x0 + b - st - 0.004 - r, ya = y0 + st + 0.004 + r, yb = y0 + h - st - 0.004 - r;
    for (const [x, y] of [[xa, ya], [xb, ya], [xa, yb], [xb, yb]]) circle(x, y, r, "C-BAR");
    if ((bars?.bot ?? 2) >= 3) circle((xa + xb) / 2, ya, r, "C-BAR");
    if ((bars?.top ?? 2) >= 3) circle((xa + xb) / 2, yb, r, "C-BAR");
  };

  // ---- geometry
  const n = Math.max(2, o.n | 0), R = o.R, T = o.T, t = o.t, th = Math.atan2(R, T), cs = Math.cos(th), tn = Math.tan(th), sn = Math.sin(th);
  const Hf = n * R, xe = (n - 1) * T, Lt = Math.max(0, o.Lt ?? 0), xh = xe + Lt; // top riser / head support inner face
  const HB = o.head ?? { b: 0.2, h: 0.4 }, hb = HB.b, hh = HB.h, tl = Lt > 0 ? (o.tl ?? t) : (o.slabT ?? 0.1), c = o.cover ?? 0.025, cb = o.beamCover ?? 0.025;
  const foot = o.foot ?? "ground", FB = o.footBeam ?? { b: 0.2, h: 0.4 }, fb = foot === "beam" ? FB.b : 0, fh = foot === "beam" ? FB.h : 0;
  const main = parseBarText(o.main), temp = parseBarText(o.temp, "RB 9 @ 0.15"), step = parseBarText(o.stepBar ?? o.temp, "RB 9 @ 0.15");
  const soff = (x) => x * tn - t / cs; // soffit (through the re-entrant corners (kT, kR) minus the waist square to the pitch)
  const xk = (Hf - tl + t / cs) / tn; // knee: soffit meets the landing / slab soffit
  const ySoffHead = Lt > 0 ? Hf - tl : Math.max(Hf - hh + 0.02, soff(xh));

  // ---- concrete (one outline: foot support + flight + landing + head beam, as on the sheet)
  const out = [[0, -fh]];
  for (let k = 1; k <= n; k++) { out.push([(k - 1) * T, (k - 1) * R]); out.push([(k - 1) * T, k * R]); if (k < n) out.push([k * T, k * R]); }
  out.splice(1, 1); // the first riser starts at the bottom of the foot support
  out.push([xh + hb, Hf], [xh + hb, Hf - hh], [xh, Hf - hh]);
  if (Lt > 0) out.push([xh, Hf - tl], [xk, Hf - tl]); else out.push([xh, ySoffHead]);
  if (foot === "beam") { out.push([fb, Math.max(soff(fb), -fh + 0.02)], [fb, -fh]); }
  else { const x0 = (t / cs) / tn; out.push([x0, 0]); out.splice(0, 1, [0, 0]); }
  poly(out, "C-CONC", true, "stair");
  // supports drawn inside the outline: stirrups + bars
  beamBars(xh, Hf - hh, hb, hh, HB.bars, cb);
  if (foot === "beam") beamBars(0, -fh, fb, fh, FB.bars, cb);
  if (Lt === 0) { // floor slab beyond the head beam (broken off)
    poly([[xh + hb, Hf], [xh + hb + 0.45, Hf]]); poly([[xh + hb, Hf - tl], [xh + hb + 0.45, Hf - tl]]);
    poly([[xh + hb + 0.45, Hf + 0.05], [xh + hb + 0.45, Hf - tl * 0.35], [xh + hb + 0.425, Hf - tl * 0.5], [xh + hb + 0.475, Hf - tl * 0.6], [xh + hb + 0.45, Hf - tl * 0.7], [xh + hb + 0.45, Hf - tl - 0.05]]);
  }
  if (foot === "panel" || foot === "beam") { poly([[-0.45, 0], [0, 0]]); poly([[-0.45, -0.1], [0, -0.1]]);
    poly([[-0.45, 0.05], [-0.45, -0.035], [-0.425, -0.05], [-0.475, -0.06], [-0.45, -0.075], [-0.45, -0.15]]); }
  if (foot === "ground" || foot === "none") for (let x = -0.4; x < (t / cs) / tn + 0.3; x += 0.05) line(x, -0.002, x - 0.035, -0.04, "C-FRAME2");

  // ---- bars
  const cm = c + main.d / 2, onMain = (x) => soff(x) + cm / cs, onTop = (x) => soff(x) + (t - c - main.d / 2) / cs;
  // 1 main bars: foot leg → soffit → straight past the knee → landing top → down into the head beam
  const xTopReach = (Hf - c - main.d / 2 - soff(0) - cm / cs) / tn; // where the main-bar line reaches the top cover
  const mainPts = [];
  if (foot === "beam") { const xv = Math.min(fb * 0.35, 0.07); mainPts.push([xv, -fh + cb + 0.03], [xv, onMain(xv)]); }
  else { const x0 = Math.max(c, (c + main.d / 2 - (soff(0) + cm / cs)) / tn); mainPts.push([c + 0.03, c + main.d / 2], [x0, c + main.d / 2]); }
  const xEndTop = xh + hb - cb - 0.01;
  if (xTopReach < xEndTop) mainPts.push([xTopReach, Hf - c - main.d / 2], [xEndTop, Hf - c - main.d / 2]);
  else mainPts.push([xEndTop, onMain(xEndTop)]);
  mainPts.push([xEndTop, Hf - hh + cb + 0.03]);
  bar(hook(hook(mainPts, 0, main.d, foot === "beam" ? -1 : 1), 1, main.d, 1), main.d, "C-BAR");
  // 2 landing bottom bars (with a landing): hooked up in the head beam, along the landing soffit, on past the knee 0.75 m along the slope
  const LB = 0.75;
  let landPts = null, landKey = null;
  if (Lt > 0) {
    const yl = Hf - tl + c + main.d / 2, xKneeTop = (yl - soff(0) - (t - c - main.d / 2) / cs) / tn; // landing bar level meets the top-zone line
    landPts = [[xKneeTop - LB * cs, onTop(xKneeTop - LB * cs)], [xKneeTop, yl], [xh + hb - cb - 0.04, yl], [xh + hb - cb - 0.04, yl + 0.06]];
    landKey = landPts.map((q) => [...q]); bar(hook(landPts, 0, main.d, -1), main.d, "C-BAR");
  }
  // 3 top bars at the foot (on a beam / slab): leg in the support, 0.75 m along the slope near the top of the waist
  let topPts = null, topKey = null;
  if (foot === "beam" || foot === "panel") {
    const xv = foot === "beam" ? fb - Math.min(fb * 0.35, 0.07) : Math.max(0.03, fb), x2 = Math.min(xv + LB * cs, (Lt > 0 ? xk : xh) - 0.05);
    topPts = foot === "beam" ? [[xv, -fh + cb + 0.03], [xv, onTop(xv)], [x2, onTop(x2)]] : [[0.03, -0.05], [0.03, onTop(0.03)], [x2, onTop(x2)]];
    topKey = topPts.map((q) => [...q]); bar(hook(hook(topPts, 0, main.d, 1), 1, main.d, 1), main.d, "C-BAR-EXTRA");
  }
  // 3b top bars at the head when there is no landing (the main bars stop in the head beam): 0.75 m along the slope near the top,
  // into the head beam over its far side and down, hooks at both ends
  let headKey = null;
  if (Lt === 0) {
    const yTopC = Hf - c - main.d / 2, xv = xh + hb - cb - 0.05, x1 = Math.max(xh - LB * cs, (2 * (c + main.d / 2)) / cs / tn + fb, 0.05), xr = Math.min(xv, (yTopC - soff(0) - (t - c - main.d / 2) / cs) / tn);
    const pts = [[x1, onTop(x1)], [xr, onTop(xr)], ...(xr < xv - 1e-6 ? [[xv, yTopC]] : []), [xv, Hf - hh + cb + 0.03]];
    headKey = pts.map((q) => [...q]); bar(hook(hook(pts, 0, main.d, -1), 1, main.d, -1), main.d, "C-BAR-EXTRA");
  }
  // 4 step bars: zig-zag at the cover (inside each riser, under each tread), on 0.25 m along the top, hooks at both ends
  const sc = c + step.d / 2, zig = foot === "beam" ? [[sc + 0.08, -sc], [sc, -sc + 0.02]] : [[sc + 0.1, sc], [sc, sc]];
  for (let k = 1; k < n; k++) { zig.push([(k - 1) * T + sc, k * R - sc], [k * T + sc, k * R - sc]); }
  zig.push([xe + sc, Hf - sc], [xe + Math.min(0.25, Lt > 0 ? Lt - 0.05 : 0.25), Hf - sc], [xe + Math.min(0.25, Lt > 0 ? Lt - 0.05 : 0.25), Hf - sc - 0.06]);
  bar(zig, step.d, "C-BAR-EXTRA");
  const corners = []; // a bar at every bend (inside the bend)
  for (let k = 1; k < n; k++) corners.push([(k - 1) * T + sc + step.d, k * R - sc - step.d], [k * T + sc + step.d, k * R - sc - step.d]);
  corners.push([xe + sc + step.d, Hf - sc - step.d]);
  for (const [x, y] of corners) disk(x, y, step.d / 2);
  // 5 distribution bars: dots on the inner side of the main bars (slope + landing top), the landing bars and the foot top bars
  const dIn = main.d / 2 + temp.d / 2 + 0.001, dots = [];
  const along = (x0, x1, f) => { const Ls = (x1 - x0) / cs, k = Math.max(1, Math.floor(Ls / temp.s)); for (let i = 0; i <= k; i++) { const x = x0 + ((x1 - x0) * i) / k; dots.push([x, f(x)]); } };
  along(Math.max(fb, 0.08) + 0.03, Math.min(xTopReach, xEndTop) - 0.05, (x) => onMain(x) + dIn / cs);
  if (xTopReach < xEndTop) for (let x = xTopReach + 0.08; x < xEndTop - 0.04; x += temp.s) dots.push([x, Hf - c - main.d / 2 - dIn]);
  if (landKey) {
    const yl = Hf - tl + c + main.d / 2, xKneeTop = (yl - soff(0) - (t - c - main.d / 2) / cs) / tn;
    along(xKneeTop - LB * cs + 0.03, xKneeTop - 0.03, (x) => onTop(x) - dIn / cs);
    for (let x = xKneeTop + 0.08; x < xh + hb - cb - 0.06; x += temp.s) dots.push([x, yl + dIn]); }
  if (topKey) along(topKey[1][0] + 0.04, topKey[2][0] - 0.03, (x) => onTop(x) - dIn / cs);
  if (headKey) along(headKey[0][0] + 0.03, headKey[1][0] - 0.03, (x) => onTop(x) - dIn / cs);
  for (const [x, y] of dots) disk(x, y, temp.d / 2);

  // ---- dimensions
  const yB = -fh - 0.45, xEnd = xh + hb;
  const chain = [[0, fb], [fb, xe], ...(Lt > 0 ? [[xe, xh]] : []), [xh, xEnd]].filter(([a, b]) => b - a > 0.005);
  for (const [a, b] of chain) dim(a, yB, b, yB, 0, f2(b - a));
  dim(0, yB - 0.2, xEnd, yB - 0.2, 0, f2(xEnd));
  for (const x of [0, fb, xe, xh, xEnd]) line(x, yB - 0.24, x, -fh - 0.05, "C-DIM");
  const km = Math.min(n - 2, Math.max(1, Math.round(n / 2))); // tread above step km, riser left of it (as on the sheet)
  dim(km * T, (km + 1) * R, (km + 1) * T, (km + 1) * R, 0.13, f2(T));
  dim(km * T, km * R, km * T, (km + 1) * R, 0.13, f2(R));
  const xw = Math.max(fb + 0.25, xe * 0.3); dim(xw, soff(xw) + t / cs, xw + sn * t, soff(xw) + t / cs - cs * t, 0, f2(t));
  const s0 = [Math.max(fb, (t / cs) / tn), soff(Math.max(fb, (t / cs) / tn))], s1 = Lt > 0 ? [xk, Hf - tl] : [xh, ySoffHead];
  dim(s0[0], s0[1], s1[0], s1[1], -0.22, f2(Math.hypot(s1[0] - s0[0], s1[1] - s0[1])));
  let xTopBar = null;
  if (topKey) { xTopBar = topKey[1][0]; const [a, b] = [topKey[1], topKey[2]]; dim(a[0], a[1], b[0], b[1], 0.2 + R * cs, f2(Math.hypot(b[0] - a[0], b[1] - a[1]))); }
  if (headKey) { const a = headKey[0], xb = Math.max(a[0] + 0.05, xh), b = [xb, onTop(xb)]; dim(a[0], a[1], b[0], b[1], 0.2 + R * cs, f2(Math.hypot(b[0] - a[0], b[1] - a[1]))); }
  if (landKey) { const xq = landKey[1][0]; dim(xq - LB * cs, onTop(xq - LB * cs), xq, onTop(xq), 0.2 + R * cs, f2(LB)); }
  const xA = xEnd + (Lt > 0 ? 0.12 : 0.58), xB2 = xA + 0.14, xC = xB2 + 0.29;
  dim(xA, Hf - tl, xA, Hf, 0, f2(tl)); dim(xB2, Hf - hh, xB2, Hf, 0, f2(hh));
  dim(xC, 0, xC, Hf, 0, f2(Hf));
  if (foot === "beam") dim(xC, -fh, xC, 0, 0, f2(fh));
  for (const y of [Hf - tl, Hf - hh]) line(xEnd + 0.02, y, xB2 + 0.04, y, "C-DIM");

  // ---- levels: dashed level lines across the drawing, dashed grid lines at the support faces, ▼ + name
  const xl1 = xC + 0.12;
  const lv = [[Hf, o.topLevelName ?? (Lt > 0 ? "ระดับพื้นชานพักบันได" : "ระดับพื้น"), o.zTop], [0, o.footLevelName ?? "ระดับพื้น", o.zFoot]];
  for (const [y, name, z] of lv) {
    line(-0.25, y, xl1 + 0.12, y, "C-ELEV", true);
    P.push({ t: "tri", x: xl1 + 0.06, y, s: 0.045, layer: "C-ELEV" });
    text(xl1 + 0.16, y + 0.012, TH, `${name}   ${lvTxt(z ?? y)} ม.`, "C-ELEV", 0, 1);
  }
  for (const x of [0, fb, xe, xh, xEnd]) line(x, Hf + 0.05, x, -fh - 0.05, "C-ELEV", true);

  // ---- leaders: the top cluster (foot top bars / corner bars / step bars) — the bar furthest right takes the lowest row so no
  // leader crosses another row's text; distribution + main bars below the flight with the text to the left (as on the sheet)
  const yTop = Hf + 0.2, cBar = corners[Math.min(2, corners.length - 1)], zBar = zig[Math.min(6, zig.length - 3)];
  const rows = [
    topKey ? [xTopBar + 0.25 * cs, onTop(xTopBar + 0.25 * cs), `${main.bar} มม. @ ${f2(main.s)} ม. (เหล็กเสริมบน)`]
      : headKey ? [headKey[0][0] + 0.12, onTop(headKey[0][0] + 0.12), `${main.bar} มม. @ ${f2(main.s)} ม. (เหล็กเสริมบน)`] : null,
    [cBar[0], cBar[1], `${step.bar} มม. ทุกมุม`],
    [zBar[0], zBar[1], `${step.bar} มม. @ ${f2(step.s)} ม. (เหล็กลูกขั้น)`],
  ].filter(Boolean).sort((a, b) => b[0] - a[0]);
  const xs = rows.map((r) => r[0]); for (let i = 1; i < xs.length; i++) xs[i] = Math.min(xs[i], xs[i - 1] - 0.18); // leaders ≥ 0.18 m apart
  rows.forEach(([bx, by, s], i) => leader(bx, by, yTop + i * 0.15, xs[i], s, 0, xs[i]));
  const kneeX = Lt > 0 ? xk : xh, dd = dots.filter((p) => p[0] < kneeX - 0.05).sort((a, b) => b[0] - a[0])[1] ?? dots[0];
  // tall flight: distribution text under the flight (as on the sheet); short one: both texts below, the right leader on the lower row
  const tall = Hf >= 1.2, xm = Math.min(Math.max(fb + 0.3, xe * 0.62), (dd?.[0] ?? xe) - 0.15);
  if (dd) leader(dd[0], dd[1], tall ? Hf * 0.15 : -fh - 0.27, dd[0], `${temp.bar} มม. @ ${f2(temp.s)} ม. (เหล็กกันร้าว)`, 2);
  leader(xm, onMain(xm), tall ? -fh - 0.2 : -fh - 0.12, xm, `${main.bar} มม. @ ${f2(main.s)} ม. (เหล็กเสริมหลัก)`, 2);
  // support names
  const bn = (B, def) => `${B?.name ? `คาน ${B.name}` : def} ${Math.round((B?.b ?? 0.2) * 100)}×${Math.round((B?.h ?? 0.4) * 100)}`;
  leader(xh + hb * 0.6, Hf - hh * 0.6, Hf - hh - 0.1, xh + hb * 0.6 + 0.08, bn(HB, "คาน"), 0, xh + hb * 0.6 + 0.08);
  if (foot === "beam") leader(fb * 0.4, -fh * 0.6, 0.3, -0.12, bn(FB, "คาน"), 2, -0.12);
  else text(-0.08, 0.03, TH * 0.9, { panel: "พื้นชั้นล่าง", ground: "ดินอัดแน่น / พื้นบนดิน", none: "⚠ ไม่มีที่รับปลายล่าง" }[foot] ?? "", foot === "none" ? "C-TITLE" : "C-TEXT", 2, 0);

  // ---- note line, title, scale
  const yN = yB - 0.4;
  text(0, yN, TH, `${Lt > 0 ? `พื้นชานพักหนา ${cmTxt(tl)} ซม.   ` : ""}ท้องบันไดหนา ${cmTxt(t)} ซม.   ลูกตั้ง ${cmTxt(R)} ซม.   ลูกนอน ${cmTxt(T)} ซม.   (ระยะหุ้มคอนกรีต ไม่น้อยกว่า ${cmTxt(c)} ซม.)`, "C-TEXT", 0, 0);
  const xc = xEnd / 2, title = o.title ?? "รูปตัดบันได";
  text(xc, yN - 0.22, TH * 1.4, title, "C-TITLE", 1, 0);
  const tw = textW(title, TH * 1.4); line(xc - tw / 2, yN - 0.24, xc + tw / 2, yN - 0.24, "C-TITLE");
  text(xc, yN - 0.37, TH * 0.9, `มาตราส่วน ${o.scale ?? "1:25"}`, "C-TEXT", 1, 0);

  return { items: P, box: bbox(P, 0.08) };
}

// rough text width (Thai upper / lower marks take no width)
export const textW = (s, h) => [...String(s)].filter((ch) => !/[ัิ-ฺ็-๎]/.test(ch)).length * h * 0.6;
function bbox(P, pad) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  const add = (x, y) => { a = Math.min(a, x); b = Math.min(b, y); c = Math.max(c, x); d = Math.max(d, y); };
  for (const p of P) {
    if (p.t === "line") { add(p.x1, p.y1); add(p.x2, p.y2); }
    else if (p.t === "poly") p.pts.forEach((q) => add(q[0], q[1]));
    else if (p.t === "text") { const w = p.rot ? 0 : textW(p.s, p.h), x0 = p.x - w * [0, 0.5, 1][p.ha ?? 0]; add(x0, p.y - p.h * 0.4); add(x0 + w, p.y + p.h * 1.2); }
    else add(p.x, p.y);
  }
  return [a - pad, b - pad, c + pad, d + pad];
}
