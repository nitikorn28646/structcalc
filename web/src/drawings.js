// Reinforcement drawings built as Maker.js models (units: cm) → SVG for screen/PDF, DXF for CAD.
import makerjs from "makerjs";
import { arcPolyline } from "../engine/arc.js";
import { BARS, STIRRUPS } from "../engine/tables.js";
import { barText } from "./beamModel.js";
import { SYM } from "../engine/steelSections.js";

const { paths, models } = makerjs;

// one colour per wall-plate section size (plan, legend and 3D share it)
export const PLATE_COLORS = ["#e5484d", "#3e63dd", "#30a46c", "#f76b15", "#8e4ec6", "#0e9384"];

export const LAYERS = {
  OUTLINE: { stroke: "#475467", dxf: 8 },
  SUPPORT: { stroke: "#98a2b3", fill: "#e4e7ec", dxf: 9 },
  BOTTOM: { stroke: "#465fff", dxf: 5 },
  BOTTOM2: { stroke: "#12b76a", dxf: 3 },
  TOP: { stroke: "#f04438", dash: "6 4", dxf: 1 },
  STIRRUP: { stroke: "#12b76a", dxf: 3 },
  BAR: { stroke: "#1d2939", fill: "#1d2939", dxf: 7 },
  DIM: { stroke: "#667085", dxf: 8 },
  TEXT: { stroke: "none", fill: "#344054", dxf: 7 },
  FRAME: { stroke: "none", dxf: 7 },
  SFD: { stroke: "#12b76a", dxf: 3 },
  BMD: { stroke: "#465fff", dxf: 5 },
  SFD_H: { stroke: "#a6f4c5", dxf: 3 },
  BMD_H: { stroke: "#c7d2fe", dxf: 5 },
  LOAD: { stroke: "#f04438", dxf: 1 },
  EAVE: { stroke: "#8b8d98", dash: "8 5", dxf: 8 },
  PURLIN: { stroke: "#98a2b3", dxf: 9 },
  RAFTER: { stroke: "#b54708", dxf: 30 },
  RIDGE: { stroke: "#e5484d", dxf: 1 },
  HIP: { stroke: "#3e63dd", dxf: 5 },
  VALLEY: { stroke: "#30a46c", dxf: 3 },
  RAKE: { stroke: "#f76b15", dxf: 30 },
  SUPPORTL: { stroke: "#7a5af8", dxf: 6 },
  POST: { stroke: "#0e9384", fill: "#0e9384", dxf: 4 },
  ...Object.fromEntries(PLATE_COLORS.map((c, i) => [`PLATE${i}`, { stroke: c, dxf: [1, 5, 3, 30, 6, 4][i] }])),
  COLUMN: { stroke: "#1d2939", fill: "#1d2939", dxf: 7 },
};

const num = (x, dp = 0) => x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });

// Loading sketch + shear force + bending moment diagrams for one span.
// fns: {V(x), M(x)} in kg and kg-m with x in m; supports: [left, right] each "pin" | "fixed" | "free".
export function forceDiagramModel({ L, w, fns, supports, point }) {
  const W = L * 100, Hp = W * 0.2, gap = W * 0.12;
  const d = new Draw((W * 1.35) / 70);
  const N = 96, xs = Array.from({ length: N + 1 }, (_, k) => (L * k) / N);
  const Vs = xs.map(fns.V), Ms = xs.map(fns.M);
  const vMax = Math.max(...Vs.map(Math.abs), 1e-9), mMax = Math.max(...Ms.map(Math.abs), 1e-9);

  // loading row
  const yB = 2 * Hp + 2 * gap + Hp * 0.9;
  d.line([0, yB], [W, yB], "OUTLINE");
  const qh = Hp * 0.35;
  d.line([0, yB + qh], [W, yB + qh], "LOAD");
  for (let k = 0; k <= 10; k++) {
    const x = (W * k) / 10;
    d.line([x, yB + qh], [x, yB + 1], "LOAD");
    d.poly([[x - 2, yB + 5], [x, yB + 1], [x + 2, yB + 5]], "LOAD");
  }
  d.text(`w = ${num(w)} kg/m`, W / 2, yB + qh + 8);
  if (point?.P > 0) {
    const x = point.a * 100;
    d.line([x, yB + qh * 2], [x, yB + 1], "LOAD");
    d.poly([[x - 3, yB + 7], [x, yB + 1], [x + 3, yB + 7]], "LOAD");
    d.text(`P = ${num(point.P)} kg`, x, yB + qh * 2 + 8);
  }
  supports.forEach((t, i) => {
    const x = i ? W : 0, s = 7;
    if (t === "pin") d.poly([[x, yB], [x - s, yB - s * 1.4], [x + s, yB - s * 1.4], [x, yB]], "OUTLINE");
    if (t === "fixed") {
      const dir = i ? 1 : -1;
      d.line([x, yB - 12], [x, yB + 12], "OUTLINE");
      for (let k = -12; k < 12; k += 5) d.line([x, yB + k], [x + dir * 5, yB + k + 5], "OUTLINE");
    }
  });
  d.dim(0, W, yB - 22, `L = ${L} m.`);

  // a diagram: baseline, hatched area, outline and labels
  const plot = (vals, max, base, layer, unit, label) => {
    const sc = Hp / max;
    d.line([0, base], [W, base], "OUTLINE");
    xs.forEach((x, k) => { if (k % 4 === 0 && Math.abs(vals[k]) > max * 0.02) d.line([x * 100, base], [x * 100, base + vals[k] * sc], `${layer}_H`); });
    d.poly(xs.map((x, k) => [x * 100, base + vals[k] * sc]), layer);
    d.line([0, base], [0, base + vals[0] * sc], layer);
    d.line([W, base], [W, base + vals[N] * sc], layer);
    d.textAt(label, -6, base, -1);
    const marks = new Map();
    const iMax = vals.indexOf(Math.max(...vals)), iMin = vals.indexOf(Math.min(...vals));
    for (const k of [0, N, iMax, iMin]) if (Math.abs(vals[k]) > max * 0.01) marks.set(k, vals[k]);
    for (const [k, v] of marks) {
      const x = xs[k] * 100, y = base + v * sc + (v >= 0 ? 7 : -7);
      const at = k === iMax && k !== 0 && k !== N ? ` @ ${xs[k].toFixed(2)} m` : "";
      d.text(`${num(v, unit === "kg-m" ? 0 : 0)} ${unit}${at}`, Math.min(Math.max(x, W * 0.08), W * 0.92), y);
    }
  };
  plot(Vs, vMax, Hp + gap + Hp, "SFD", "kg", "V");
  plot(Ms, mMax, 0, "BMD", "kg-m", "M");
  return d.framed(20);
}

class Draw {
  constructor(charUnits = 0) {
    this.model = { paths: {}, models: {} };
    this.i = 0;
    this.cu = charUnits; // approx. model units per character at the intended print size
    this.texts = [];
  }
  path(p, layer) { p.layer = layer; this.model.paths[`p${this.i++}`] = p; }
  line(a, b, layer) { this.path(new paths.Line(a, b), layer); }
  poly(pts, layer) { for (let k = 1; k < pts.length; k++) this.line(pts[k - 1], pts[k], layer); }
  circle(c, r, layer) { this.path(new paths.Circle(c, r), layer); }
  rect(x, y, w, h, layer, radius = 0) {
    const m = radius ? new models.RoundRectangle(w, h, radius) : new models.Rectangle(w, h);
    makerjs.model.move(m, [x, y]);
    m.layer = layer;
    this.model.models[`m${this.i++}`] = m;
  }
  text(t, x, y, vertical = false) {
    const a = vertical ? new paths.Line([x, y - 0.01], [x, y + 0.01]) : new paths.Line([x - 0.01, y], [x + 0.01, y]);
    this.model.models[`t${this.i++}`] = { caption: { text: t, anchor: a }, layer: "TEXT" };
    this.texts.push({ x, y, half: (t.length * this.cu) / 2, vertical });
  }
  // Text whose start (side = 1) or end (side = -1) sits at x, instead of its centre.
  textAt(t, x, y, side) { this.text(t, x + (side * t.length * this.cu) / 2, y); }
  // Invisible padded frame so captions (not counted in Maker.js extents) are not clipped in SVG.
  framed(pad = 24) {
    const e = makerjs.measure.modelExtents(this.model) ?? { low: [0, 0], high: [1, 1] }; // empty drawing (a floor with nothing drawn yet)
    let [x0, y0] = e.low, [x1, y1] = e.high;
    for (const t of this.texts) {
      const [hx, hy] = t.vertical ? [this.cu, t.half] : [t.half, this.cu];
      x0 = Math.min(x0, t.x - hx); x1 = Math.max(x1, t.x + hx);
      y0 = Math.min(y0, t.y - hy); y1 = Math.max(y1, t.y + hy);
    }
    const f = new models.Rectangle(x1 - x0 + 2 * pad, y1 - y0 + 2 * pad);
    makerjs.model.move(f, [x0 - pad, y0 - pad]);
    f.layer = "FRAME";
    this.model.models.frame = f;
    return this.model;
  }
  // Axis-aligned dimension: horizontal between x1..x2 at height y (vertical when `v`).
  dim(p1, p2, at, label, v = false, tick = 4) {
    const P = (s, t) => (v ? [t, s] : [s, t]);
    this.line(P(p1, at), P(p2, at), "DIM");
    for (const s of [p1, p2]) {
      this.line(P(s - tick / 2, at - tick / 2), P(s + tick / 2, at + tick / 2), "DIM");
      this.line(P(s, at - tick), P(s, at + tick), "DIM");
    }
    const mid = (p1 + p2) / 2, off = v ? -7 : 7;
    this.text(label, ...(v ? [at + off, mid] : [mid, at + off]), v);
  }
}

const range = (from, to, step) => {
  const out = [];
  if (!(step > 0)) return out;
  const n = Math.floor((to - from) / step + 1e-9);
  const start = from + ((to - from) - n * step) / 2; // centre the bar field
  for (let k = 0; k <= n; k++) out.push(start + k * step);
  return out;
};

// ---------------------------------------------------------------- slab section (along the main span)
// Top-bar extension at each end, as fraction denominators of the span, following the reference detail.
const ONE_WAY_TOP = { simple: [4, 4], one_end: [4, 3], both_ends: [3, 3] };
const TWO_WAY_TOP = { 1: [3, 3], 2: [4, 3], 3: [4, 3], 4: [4, 3], 5: [4, 4] };

export function slabSectionModel(s, r) {
  const two = s.kind === "twoway", cant = s.kind === "cantilever";
  const span = (two ? s.S : s.L) * 100;
  const d = new Draw(((cant ? span * 1.8 : span + 50) * 1.3) / 72);
  const T = s.t * 100;
  const ev = Math.max(1, span / 14 / T); // thickness drawn exaggerated so bars stay readable
  const Td = T * ev, cv = Math.max(s.cover * ev, Td * 0.18);
  const bw = 25, bd = Td * 2.2, hook = Td * 0.55;
  const dot = Math.max(1.6, Td * 0.06);
  const mainText = two ? r.shortText : r.mainText, distText = two ? r.longText : r.tempText;
  const distS = (two ? r.sLong : r.sTemp) * 100;
  const leader = (from, to, text, anchor = "left") => {
    const side = anchor === "left" ? 1 : -1;
    d.line(from, to, "DIM");
    d.line(to, [to[0] + side * 12, to[1]], "DIM");
    d.textAt(text, to[0] + side * 14, to[1], side);
  };

  if (cant) {
    const back = Math.min(120, span * 0.8);
    d.poly([[-bw - back, Td], [span, Td], [span, 0], [0, 0]], "OUTLINE");
    d.poly([[-bw - back, 0], [-bw, 0], [-bw, -bd], [0, -bd], [0, 0]], "SUPPORT");
    d.line([-bw - back, 0], [-bw - back, Td], "DIM");
    // main steel is at the top, anchored into the back span; hooked down at the free end
    d.poly([[-bw - back + 3, Td - cv], [span - 3, Td - cv], [span - 3, Td - cv - hook]], "TOP");
    const xs = range(3, span - 3, distS * ev > 6 ? distS : 6 / ev);
    xs.forEach((x) => d.circle([x, Td - cv - dot * 2.2], dot, "BAR"));
    if (s.P > 0 && s.a > 0 && s.a * 100 <= span) {
      const x = s.a * 100;
      d.poly([[x, Td + 45], [x, Td + 4]], "TOP");
      d.poly([[x - 4, Td + 12], [x, Td + 4], [x + 4, Td + 12]], "TOP");
      d.text(`P = ${s.P} kg`, x, Td + 52);
    }
    d.dim(0, span, -bd - 20, `L = ${s.L} m.`);
    d.text(`t = ${s.t} m.`, -bw - back - 30, Td / 2);
    leader([span * 0.7, Td - cv], [span * 0.8, -bd + 4], `${mainText} m. (Main rebars)`);
    leader([xs[Math.floor(xs.length / 3)] ?? span / 3, Td - cv - dot * 2.2], [-bw - 10, -bd - 4], `${distText} m. (Temperature rebars)`, "right");
    return d.framed(30);
  }

  // slab between two supporting beams, clear span 0..span
  d.poly([[-bw, Td], [span + bw, Td]], "OUTLINE");
  d.line([0, 0], [span, 0], "OUTLINE");
  for (const x0 of [-bw, span]) d.poly([[x0, Td], [x0, -bd], [x0 + bw, -bd], [x0 + bw, 0]], "SUPPORT");
  d.line([-bw, Td], [-bw, -bd], "SUPPORT");
  // bottom main bar, hooked up into both supports
  d.poly([[-bw + 4, cv + hook], [-bw + 4, cv], [span + bw - 4, cv], [span + bw - 4, cv + hook]], "BOTTOM");
  // top bars over each support
  const [dl, dr] = two ? TWO_WAY_TOP[s.case] : ONE_WAY_TOP[s.support];
  const yT = Td - cv;
  d.poly([[-bw + 4, yT - hook], [-bw + 4, yT], [span / dl, yT], [span / dl, yT - hook * 0.6]], "TOP");
  d.poly([[span + bw - 4, yT - hook], [span + bw - 4, yT], [span - span / dr, yT], [span - span / dr, yT - hook * 0.6]], "TOP");
  // distribution bars (temperature / long-direction) as dots resting on the main bar
  const xs = range(6, span - 6, distS * ev > 6 ? distS : 6 / ev);
  xs.forEach((x) => d.circle([x, cv + dot * 2.2], dot, "BAR"));
  // distribution bars tied under each top-bar zone
  const zoneStep = distS * ev > 6 ? distS : 6 / ev;
  for (const [a, b] of [[4, span / dl - 3], [span - span / dr + 3, span - 4]]) {
    range(a, b, zoneStep).forEach((x) => d.circle([x, yT - dot * 2.2], dot, "BAR"));
  }

  // dimensions
  const sym = two ? "S" : "L";
  d.dim(0, span, Td + 26, `Clear span = ${(span / 100).toFixed(2)} m.`);
  d.dim(-bw / 2, span + bw / 2, Td + 48, sym);
  d.dim(0, span / dl, Td + 10, `${(span / dl / 100).toFixed(2)} m. (${sym}/${dl})`, false, 3);
  d.dim(span - span / dr, span, Td + 10, `${(span / dr / 100).toFixed(2)} m. (${sym}/${dr})`, false, 3);
  d.text(`t = ${s.t} m.`, -bw - 32, Td / 2);
  // leaders to the callouts
  leader([span * 0.62, cv], [span * 0.62 + 18, -bd - 18], `${mainText} m. (${two ? "Short span" : "Main rebars"})`);
  leader([xs[Math.floor(xs.length / 2)] ?? span / 2, cv + dot * 2.2], [span * 0.4, -bd - 36],
    `${distText} m. (${two ? "Long span" : "Temperature rebars"})`, "right");
  leader([span / dl * 0.6, yT], [span / dl * 0.6 - 10, -bd - 18], `${mainText} m. (Top bars)`, "right");
  d.text(two ? "Short span section" : "Section along span", span / 2, -bd - 62);
  return d.framed(30);
}


// ---------------------------------------------------------------- stair section (cm)
// Geometry shared with the 3D view: inclined waist slab between two beams, steps on top.
export function stairGeometry(s, steps) {
  const W = s.L * 100, b = s.tread * 100, h = s.riser * 100, n = steps;
  const H = n * h, slope = Math.hypot(b, h) / b;
  const tv = s.t * 100 * slope; // waist thickness measured vertically
  const profile = [[0, tv]];
  for (let k = 0; k < n; k++) profile.push([k * b, tv + (k + 1) * h], [Math.min((k + 1) * b, W), tv + (k + 1) * h]);
  return { W, H, b, h, n, slope, tv, profile, yAt: (x) => (x * H) / W };
}

export function stairSectionModel(s, r) {
  const g = stairGeometry(s, r.steps);
  const { W, H, tv, slope, yAt } = g;
  const d = new Draw((W + 80) * 1.3 / 72);
  const bw = 25, bd = 40, cvv = s.cover * slope, hk = Math.min(tv * 0.6, 12);
  d.poly([[0, 0], [W, H]], "OUTLINE"); // soffit
  d.poly(g.profile, "OUTLINE");
  d.poly([[-bw, tv], [0, tv]], "OUTLINE");
  d.poly([[W, H + tv], [W + bw, H + tv]], "OUTLINE");
  for (const [x0, y0] of [[-bw, 0], [W, H]]) d.poly([[x0, y0 + tv], [x0, y0 - bd], [x0 + bw, y0 - bd], [x0 + bw, y0]], "SUPPORT");
  // bottom main bar along the soffit, hooked up into both beams
  const yb = (x) => yAt(x) + cvv;
  d.poly([[-bw + 4, yb(-bw + 4) + hk], [-bw + 4, yb(-bw + 4)], [W + bw - 4, yb(W + bw - 4)], [W + bw - 4, yb(W + bw - 4) + hk]], "BOTTOM");
  // top bars over each support (L/4), hooked down
  const yt = (x) => yAt(x) + tv - cvv;
  d.poly([[-bw + 4, yt(-bw + 4) - hk], [-bw + 4, yt(-bw + 4)], [W / 4, yt(W / 4)], [W / 4, yt(W / 4) - hk * 0.6]], "TOP");
  d.poly([[W + bw - 4, yt(W + bw - 4) - hk], [W + bw - 4, yt(W + bw - 4)], [(3 * W) / 4, yt((3 * W) / 4)], [(3 * W) / 4, yt((3 * W) / 4) - hk * 0.6]], "TOP");
  // temperature bars (dots) on the main bar, spaced along the slope
  const dot = 1.4, step = Math.max((r.sTemp * 100) / slope, 6);
  const xs = range(6, W - 6, step);
  xs.forEach((x) => d.circle([x, yb(x) + dot * 2.2], dot, "BAR"));
  // dimensions and callouts
  d.dim(0, W, -bd - 22, `L = ${s.L} m. (${r.steps} ขั้น)`);
  d.textAt(`ลูกนอน ${s.tread} · ลูกตั้ง ${s.riser} ม.`, W * 0.55, H + tv + 28, -1);
  d.text(`t = ${s.t} m.`, -bw - 30, tv / 2);
  const leader = (from, to, text, side) => {
    d.line(from, to, "DIM");
    d.line(to, [to[0] + side * 12, to[1]], "DIM");
    d.textAt(text, to[0] + side * 14, to[1], side);
  };
  leader([W * 0.7, yb(W * 0.7)], [W * 0.82, yb(W * 0.7) - 30], `${r.mainText} m. (Main rebars)`, 1);
  const xm = xs[Math.floor(xs.length / 3)] ?? W / 3;
  leader([xm, yb(xm) + dot * 2.2], [xm - 10, -bd - 6], `${r.tempText} m. (Temperature rebars)`, -1);
  leader([W / 8, yt(W / 8)], [-bw - 10, H * 0.45], `${r.mainText} m. (Top bars)`, -1);
  return d.framed(30);
}

// ---------------------------------------------------------------- spread footing: plan (top) + section (bottom), cm
export function footingModel(f, r) {
  const Bx = f.Bx * 100, By = f.By * 100, T = f.t * 100, bx = r.bx * 100, by = r.by * 100, Df = f.Df * 100;
  const d = new Draw((Bx + 80) * 1.3 / 64);
  // plan
  const oy = T + Df + 70; // plan sits above the section
  d.rect(-Bx / 2, oy, Bx, By, "OUTLINE");
  if (f.pier === "circle") d.circle([0, oy + By / 2], (f.D * 100) / 2, "SUPPORT");
  else d.rect(-bx / 2, oy + By / 2 - by / 2, bx, by, "SUPPORT");
  const c = f.cover;
  for (const y of range(c, By - c, f.sLong * 100)) d.line([-Bx / 2 + c, oy + y], [Bx / 2 - c, oy + y], "BOTTOM");
  for (const x of range(c, Bx - c, f.sShort * 100)) d.line([-Bx / 2 + x, oy + c], [-Bx / 2 + x, oy + By - c], "BOTTOM2");
  d.dim(-Bx / 2, Bx / 2, oy + By + 14, `Bx = ${f.Bx} m.`);
  d.dim(oy, oy + By, -Bx / 2 - 14, `By = ${f.By} m.`, true);
  d.text("แปลนฐานราก", 0, oy + By + 32);
  // section along x
  const pw = f.pier === "circle" ? f.D * 100 : bx;
  d.poly([[-Bx / 2, 0], [Bx / 2, 0], [Bx / 2, T], [pw / 2, T], [pw / 2, T + Df + 20]], "OUTLINE");
  d.poly([[-Bx / 2, 0], [-Bx / 2, T], [-pw / 2, T], [-pw / 2, T + Df + 20]], "OUTLINE");
  d.line([-Bx / 2 - 25, T + Df - 10], [Bx / 2 + 25, T + Df - 10], "DIM"); // ground line
  d.text("ระดับดิน", Bx / 2 + 10, T + Df - 4);
  const hk = Math.min(T - 2 * c, 15);
  d.poly([[-Bx / 2 + c, c + hk], [-Bx / 2 + c, c], [Bx / 2 - c, c], [Bx / 2 - c, c + hk]], "BOTTOM");
  for (const x of range(c + 3, Bx - c - 3, f.sShort * 100)) d.circle([-Bx / 2 + x, c + 2.4], 1, "BAR");
  // dowels: L-bars standing on the mat
  for (const sx of [-1, 1]) d.poly([[sx * (pw / 2 - 6) - sx * 18, c + 4], [sx * (pw / 2 - 6), c + 4], [sx * (pw / 2 - 6), T + Df + 15]], "TOP");
  d.dim(-Bx / 2, Bx / 2, -16, `${f.Bx} m.`);
  d.dim(0, T, -Bx / 2 - 14, `t = ${f.t}`, true);
  d.dim(T, T + Df - 10, Bx / 2 + 14, `Df`, true);
  d.text(`เหล็กทางยาว ${r.longText} m. · ทางสั้น ${r.shortText} m.`, 0, -36);
  d.text(`เหล็กเดือย ${f.dowelN}-${f.dowelBar} ฝัง ${r.ancUseD} m.`, 0, -52);
  return d.framed(24);
}

// ---------------------------------------------------------------- pile cap: plan (top) + section (bottom), cm
export function pileCapModel(f, r, pileB) {
  const Bx = r.Bx * 100, By = r.By * 100, T = f.t * 100, bx = r.bx * 100, by = r.by * 100, Df = f.Df * 100, pb = pileB * 100;
  const d = new Draw((Bx + 80) * 1.3 / 64);
  const oy = T + Df + 90;
  const tri = f.n === 3 && r.outline;
  // plan origin: bounding-box centre of the cap at (0, oy + By/2)
  const cy = tri ? (Math.max(...r.outline.map((p) => p[1])) + Math.min(...r.outline.map((p) => p[1]))) / 2 * 100 : 0;
  const P = (x, y) => [x * 100, oy + By / 2 + y * 100 - cy];
  if (tri) d.poly([...r.outline, r.outline[0]].map(([x, y]) => P(x, y)), "OUTLINE");
  else d.rect(-Bx / 2, oy, Bx, By, "OUTLINE");
  const [, pyc] = P(0, 0);
  if (f.pier === "circle") d.circle([0, pyc], (f.D * 100) / 2, "SUPPORT");
  else d.rect(-bx / 2, pyc - by / 2, bx, by, "SUPPORT");
  for (const [x, y] of r.piles) {
    const [px, py] = P(x, y);
    if (f.pile.startsWith("Ø")) d.circle([px, py], pb / 2, "DIM");
    else d.rect(px - pb / 2, py - pb / 2, pb, pb, "DIM");
  }
  const c = f.cover;
  if (tri) {
    // three bands of bars along the pile-to-pile lines, extended past each pile to the cap edge
    // along a pile line the cut corner lies e/√3 past the pile centre (e = edge distance); keep the cover
    const ext = (pileB * 1.3 + f.cover / 100) / Math.sqrt(3) - f.cover / 100;
    r.piles.forEach((a, i) => {
      const b = r.piles[(i + 1) % 3], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, nx = -uy, ny = ux;
      for (let k = 0; k < r.nTri; k++) {
        const o = (k - (r.nTri - 1) / 2) * r.sTri;
        d.line(P(a[0] - ux * ext + nx * o, a[1] - uy * ext + ny * o), P(b[0] + ux * ext + nx * o, b[1] + uy * ext + ny * o), i === 1 ? "BOTTOM2" : "BOTTOM");
      }
    });
  } else {
    for (const y of range(c, By - c, f.sLong * 100)) d.line([-Bx / 2 + c, oy + y], [Bx / 2 - c, oy + y], "BOTTOM");
    for (const x of range(c, Bx - c, f.sShort * 100)) d.line([-Bx / 2 + x, oy + c], [-Bx / 2 + x, oy + By - c], "BOTTOM2");
  }
  d.dim(-Bx / 2, Bx / 2, oy + By + 14, `Bx = ${r.Bx} m.`);
  d.dim(oy, oy + By, -Bx / 2 - 14, `By = ${r.By} m.`, true);
  if (f.n > 1) d.text(`เสาเข็ม ${f.n} ต้น ${f.pile} ระยะ ${f.sx} × ${f.sy} m.`, 0, oy + By + 32);
  // section along x
  const pw = f.pier === "circle" ? f.D * 100 : bx;
  d.poly([[-Bx / 2, 0], [Bx / 2, 0], [Bx / 2, T], [pw / 2, T], [pw / 2, T + Df + 20]], "OUTLINE");
  d.poly([[-Bx / 2, 0], [-Bx / 2, T], [-pw / 2, T], [-pw / 2, T + Df + 20]], "OUTLINE");
  d.line([-Bx / 2 - 25, T + Df - 10], [Bx / 2 + 25, T + Df - 10], "DIM");
  d.text("ระดับดิน", Bx / 2 + 10, T + Df - 4);
  const xsec = [...new Set(r.piles.map((p) => Math.round(p[0] * 100)))];
  for (const x of xsec) d.poly([[x - pb / 2, 5], [x - pb / 2, -60], [x + pb / 2, -60], [x + pb / 2, 5]], "SUPPORT");
  const hk = Math.min(T - 2 * c, 15);
  d.poly([[-Bx / 2 + c, c + 5 + hk], [-Bx / 2 + c, c + 5], [Bx / 2 - c, c + 5], [Bx / 2 - c, c + 5 + hk]], "BOTTOM");
  for (const sx of [-1, 1]) d.poly([[sx * (pw / 2 - 6) - sx * 18, c + 9], [sx * (pw / 2 - 6), c + 9], [sx * (pw / 2 - 6), T + Df + 15]], "TOP");
  d.dim(-Bx / 2, Bx / 2, -76, `${r.Bx} m.`);
  d.dim(0, T, -Bx / 2 - 14, `t = ${f.t}`, true);
  d.text(tri ? `เหล็กล่าง ${r.longText} (แถบกว้าง ${r.bandW.toFixed(2)} m.)` : `เหล็กทางยาว ${r.longText} m. · ทางสั้น ${r.shortText} m.`, 0, -96);
  d.text(`เหล็กเดือย ${f.dowelN}-${f.dowelBar} ฝัง ${r.ancUseD} m.`, 0, -112);
  return d.framed(24);
}

// ---------------------------------------------------------------- beam section
// Bar centres in a b×h section (cm, origin bottom-left): main bars at the corners, special bars between,
// layers 2.5 cm clear apart.
export function barLayout(B, H, cover, sd, layers, fromTop) {
  const out = [];
  let off = cover + sd;
  (layers ?? []).forEach((l) => {
    const main = [], sp = [];
    if (l?.main?.n) for (let k = 0; k < l.main.n; k++) main.push({ d: BARS[l.main.bar]?.d ?? 1.6, special: false });
    if (l?.special?.n) for (let k = 0; k < l.special.n; k++) sp.push({ d: BARS[l.special.bar]?.d ?? 1.6, special: true });
    const ordered = main.length >= 2 ? [main[0], ...sp, ...main.slice(1)] : [...main, ...sp];
    if (!ordered.length) return;
    const x0 = cover + sd + ordered[0].d / 2, x1 = B - cover - sd - ordered.at(-1).d / 2;
    ordered.forEach((bar, k) => {
      const x = ordered.length === 1 ? B / 2 : x0 + ((x1 - x0) * k) / (ordered.length - 1);
      out.push({ ...bar, x, y: fromTop ? H - off - bar.d / 2 : off + bar.d / 2 });
    });
    off += (BARS[l?.main?.bar]?.d ?? ordered[0].d) + 2.5;
  });
  return out;
}

// Bar runs along the span from the two designed sections: bars common to both run full length, support-only
// bars extend L/4 from each support carrying negative moment, midspan-only bars cover L/8…7L/8, and a bar that
// changes size at the same position is lap-spliced (0.3 m) between the zones.
export function barRuns(midBars, supBars, L, ends) {
  const zone = L / 4, lap = 0.3, runs = [];
  const used = new Set();
  const midFrom = ends.L ? zone - lap : 0, midTo = ends.R ? L - zone + lap : L;
  for (const m of midBars) {
    const j = supBars.findIndex((q, k) => !used.has(k) && Math.abs(q.x - m.x) < 0.6 && Math.abs(q.y - m.y) < 0.6);
    if (j < 0) { runs.push({ ...m, z0: ends.L ? L / 8 : 0, z1: ends.R ? (7 * L) / 8 : L }); continue; }
    used.add(j);
    if (supBars[j].d === m.d) { runs.push({ ...m, z0: 0, z1: L }); continue; }
    runs.push({ ...m, z0: midFrom, z1: midTo });
    if (ends.L) runs.push({ ...supBars[j], z0: 0, z1: zone });
    if (ends.R) runs.push({ ...supBars[j], z0: L - zone, z1: L });
  }
  supBars.forEach((q, k) => {
    if (used.has(k)) return;
    if (ends.L) runs.push({ ...q, z0: 0, z1: zone });
    if (ends.R) runs.push({ ...q, z0: L - zone, z1: L });
  });
  return runs;
}

// Column bar centres (cm, origin at the section centre): nx/2 bars on each face parallel to x (incl. corners),
// ny/2 on each face parallel to y (incl. corners).
export function columnBarLayout(Bx, By, cover, tieD, barD, nx, ny) {
  const ax = Bx / 2 - cover - tieD - barD / 2, ay = By / 2 - cover - tieD - barD / 2;
  const pts = [];
  const nX = Math.max(2, nx / 2), nY = Math.max(2, ny / 2);
  for (let k = 0; k < nX; k++) {
    const x = -ax + (2 * ax * k) / (nX - 1);
    pts.push({ x, y: ay }, { x, y: -ay });
  }
  for (let k = 1; k < nY - 1; k++) {
    const y = -ay + (2 * ay * k) / (nY - 1);
    pts.push({ x: ax, y }, { x: -ax, y });
  }
  return pts.map((p) => ({ ...p, d: barD }));
}

// Circular spiral column: n bars equally spaced on the bar circle (cm, origin at the centre).
export function spiralBarLayout(D, cover, spD, barD, n) {
  const rad = D / 2 - cover - spD - barD / 2;
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n + Math.PI / 2;
    return { x: rad * Math.cos(a), y: rad * Math.sin(a), d: barD };
  });
}

export function spiralSectionModel({ D, cover, spD, barD, n, label }) {
  const d = new Draw((D + 30) / 24);
  d.circle([0, 0], D / 2, "OUTLINE");
  d.circle([0, 0], D / 2 - cover - spD / 2, "STIRRUP");
  for (const p of spiralBarLayout(D, cover, spD, barD, n)) d.circle([p.x, p.y], p.d / 2, "BAR");
  d.dim(-D / 2, D / 2, -D / 2 - 7, `D = ${D}`);
  if (label) d.text(label, 0, D / 2 + 7);
  return d.framed(8);
}

export function columnSectionModel({ Bx, By, cover, tieD, barD, nx, ny, label }) {
  const d = new Draw((Bx + 30) / 24);
  d.rect(-Bx / 2, -By / 2, Bx, By, "OUTLINE");
  const ins = cover + tieD / 2;
  d.rect(-Bx / 2 + ins, -By / 2 + ins, Bx - 2 * ins, By - 2 * ins, "STIRRUP", Math.min(2, (Bx - 2 * ins) / 4));
  for (const p of columnBarLayout(Bx, By, cover, tieD, barD, nx, ny)) d.circle([p.x, p.y], p.d / 2, "BAR");
  d.dim(-Bx / 2, Bx / 2, -By / 2 - 7, `Bx = ${Bx}`);
  d.dim(-By / 2, By / 2, -Bx / 2 - 7, `By = ${By}`, true);
  if (label) d.text(label, 0, By / 2 + 7);
  return d.framed(8);
}

export function beamSectionModel({ b, h, cover, stirrupBar, top, bottom, showText = true }) {
  const d = new Draw((b * 100 + 30) / 26);
  const B = b * 100, H = h * 100;
  const sd = STIRRUPS[stirrupBar]?.d ?? 0.9;
  d.rect(0, 0, B, H, "OUTLINE");
  const ins = cover + sd / 2;
  d.rect(ins, ins, B - 2 * ins, H - 2 * ins, "STIRRUP", Math.min(2, (B - 2 * ins) / 4));
  for (const p of [...barLayout(B, H, cover, sd, top, true), ...barLayout(B, H, cover, sd, bottom, false)]) {
    d.circle([p.x, p.y], p.d / 2, "BAR");
  }
  d.dim(0, B, -8, `${B.toFixed(0)}`);
  d.dim(0, H, -8, `${H.toFixed(0)}`, true);
  if (showText) {
    const t = (top ?? []).map(barText).filter(Boolean).join(" / ") || "-";
    const btm = (bottom ?? []).map(barText).filter(Boolean).join(" / ") || "-";
    d.text(t, B / 2, H + 7);
    d.text(btm, B / 2, -18);
  }
  return d.framed(showText ? 12 : 6);
}

// ---------------------------------------------------------------- export
export function toSvg(model, fontSize = 11, targetWidth = 520) {
  const ext = makerjs.measure.modelExtents(model);
  const scale = ext ? targetWidth / Math.max(ext.width, 1) : 1;
  const layerOptions = Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, {
    stroke: v.stroke, fill: v.fill ?? "none",
    cssStyle: v.dash ? `stroke-dasharray:${v.dash}` : undefined,
  }]));
  const svg = makerjs.exporter.toSVG(model, {
    scale, strokeWidth: "1.3px", fontSize: `${fontSize}px`, layerOptions, useSvgPathOnly: false,
    svgAttrs: { preserveAspectRatio: "xMidYMid meet" },
  });
  return svg.replace(/<svg ([^>]*?)width="[^"]*" height="[^"]*"/, '<svg $1');
}

export function toDxf(model) {
  model = { ...model, models: { ...model.models } };
  delete model.models.frame;
  const layerOptions = Object.fromEntries(Object.entries(LAYERS).map(([k, v]) => [k, { color: v.dxf }]));
  return makerjs.exporter.toDXF(model, { units: makerjs.unitType.Centimeter, layerOptions, fontSize: 4 });
}

export function downloadDxf(model, name) {
  const dxf = toDxf(model);
  const url = URL.createObjectURL(new Blob([dxf], { type: "application/dxf" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.dxf` });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}


// ---------------------------------------------------------------- roof framing plan (input in m, drawn in cm)
export function roofPlanModel(g, fr) {
  const d = new Draw(9), c = ([x, y]) => [x * 100, y * 100];
  const ring = (P, layer) => d.poly([...P, P[0]].map(c), layer);
  ring(g.eave, "EAVE");
  for (const m of fr.purlins) d.line(c(m.p), c(m.q), "PURLIN");
  for (const m of fr.rafters) d.line(c(m.p), c(m.q), "RAFTER");
  ring(g.pts, "OUTLINE");
  for (const s of fr.supports) d.line(c(s.a), c(s.b), "SUPPORTL");
  const LAY = { ridge: "RIDGE", hip: "HIP", valley: "VALLEY", rake: "RAKE" };
  for (const l of g.lines) if (LAY[l.type]) d.line(c(l.p), c(l.q), LAY[l.type]);
  for (const p of fr.posts) d.rect(p.x * 100 - 6, p.y * 100 - 6, 12, 12, "POST");
  // overall dimensions of the wall outline
  const xs = g.pts.map((p) => p[0] * 100), ys = g.pts.map((p) => p[1] * 100);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys), o = g.eave ? 100 + Math.abs(g.eave[0][1] * 100 - g.pts[0][1] * 100) : 100;
  d.dim(x0, x1, y0 - o, `${num((x1 - x0) / 100, 2)} ม.`, false, 16);
  d.dim(y0, y1, x0 - o, `${num((y1 - y0) / 100, 2)} ม.`, true, 16);
  return d.framed(60);
}
// ---------------------------------------------------------------- wall-plate plan: spans coloured by section, tagged A1…
export function plateSizes(plates) {
  const keys = [...new Set(plates.map((m) => `${m.count}|${m.r.section.type}|${m.r.section.name}`))];
  return keys.map((k, i) => { const [count, type, name] = k.split("|"); return { k, count: +count, type, name, color: PLATE_COLORS[i % PLATE_COLORS.length], layer: `PLATE${i % PLATE_COLORS.length}` }; });
}
export const plateText = (s) => `${s.count > 1 ? "2" : ""}${SYM[s.type] ?? ""}${s.name}`;

export function plateModel(g, plates, posts = []) {
  const d = new Draw(9), c = ([x, y]) => [x * 100, y * 100], sizes = plateSizes(plates);
  const size = (m) => sizes.find((s) => s.k === `${m.count}|${m.r.section.type}|${m.r.section.name}`);
  d.poly([...g.eave, g.eave[0]].map(c), "EAVE");
  for (const m of plates) {
    const a = c(m.p), b = c(m.q), L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L;
    // double line = the plate, offset outward from the wall centre line
    for (const o of [0, 8]) d.line([a[0] + nx * o, a[1] + ny * o], [b[0] + nx * o, b[1] + ny * o], size(m).layer);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, vert = Math.abs(nx) > 0.7, off = 34;
    d.text(`${m.tag}${m.typeName ? ` ${m.typeName}` : ""} ${plateText(size(m))}`, mx - nx * off, my - ny * off, vert);
    if (!m.inner) for (const p of [a, b]) d.rect(p[0] - 9, p[1] - 9, 18, 18, "COLUMN");
  }
  for (const p of posts) { d.circle([p.x * 100, p.y * 100], 14, "POST"); d.text(p.kind, p.x * 100 + 30, p.y * 100 - 24); }
  const xs = g.pts.map((p) => p[0] * 100), ys = g.pts.map((p) => p[1] * 100);
  d.dim(Math.min(...xs), Math.max(...xs), Math.min(...g.eave.map((p) => p[1] * 100)) - 60, `${num((Math.max(...xs) - Math.min(...xs)) / 100, 2)} ม.`, false, 16);
  d.dim(Math.min(...ys), Math.max(...ys), Math.min(...g.eave.map((p) => p[0] * 100)) - 60, `${num((Math.max(...ys) - Math.min(...ys)) / 100, 2)} ม.`, true, 16);
  return d.framed(60);
}
// ---------------------------------------------------------------- RC floor framing plan: grid, beams (true width, coloured by type), columns, slab panels
export function framePlanModel(floor, an, beamTypes, cols = []) {
  const d = new Draw(9), c = ([x, y]) => [x * 100, y * 100];
  const pts = [...floor.columns, ...floor.beams.flatMap((b) => [b.a, b.b])];
  if (!pts.length) return d.framed(60);
  const G = floor.grid, axis = (o, ds) => ds.reduce((a, v) => [...a, a[a.length - 1] + v], [o]), GX = axis(G.x0, G.dx), GY = axis(G.y0, G.dy);
  const x0 = Math.min(...GX, ...pts.map((p) => p[0])) * 100 - 120, x1 = Math.max(...GX, ...pts.map((p) => p[0])) * 100 + 120;
  const y0 = Math.min(...GY, ...pts.map((p) => p[1])) * 100 - 120, y1 = Math.max(...GY, ...pts.map((p) => p[1])) * 100 + 120;
  GX.forEach((x, i) => { d.line([x * 100, y0], [x * 100, y1], "DIM"); d.circle([x * 100, y1 + 40], 28, "DIM"); d.text(String.fromCharCode(65 + i), x * 100, y1 + 40); });
  GY.forEach((y, i) => { d.line([x0, y * 100], [x1, y * 100], "DIM"); d.circle([x1 + 40, y * 100], 28, "DIM"); d.text(String(GY.length - i), x1 + 40, y * 100); });
  GX.slice(1).forEach((x, i) => d.dim(GX[i] * 100, x * 100, y0 - 40, `${num(x - GX[i], 2)}`, false, 10));
  GY.slice(1).forEach((y, i) => d.dim(GY[i] * 100, y * 100, x0 - 40, `${num(y - GY[i], 2)}`, true, 10));
  an?.panels.forEach((p, i) => {
    const m = p.P.reduce((s, q) => [s[0] + (q[0] * 100) / p.P.length, s[1] + (q[1] * 100) / p.P.length], [0, 0]);
    d.text(p.open ? `P${i + 1} ช่องเปิด` : `P${i + 1} (${p.kind === "twoway" ? "2 ทาง" : p.kind === "oneway" ? "1 ทาง" : "อื่นๆ"}) t=${num(p.t * 100, 0)} ซม.`, m[0], m[1]);
  });
  floor.beams.forEach((b, i) => {
    const sp = an?.spans.find((s) => s.member === i), ti = sp?.typeIdx ?? b.type ?? 0, t = beamTypes[ti] ?? beamTypes[0], layer = `PLATE${ti % PLATE_COLORS.length}`;
    const a = c(b.a), e = c(b.b), L = Math.hypot(e[0] - a[0], e[1] - a[1]), n = [-(e[1] - a[1]) / L, (e[0] - a[0]) / L], w = (t.b * 100) / 2;
    if (b.arc?.s) { // arc beam: inner and outer faces as short chords, offsets in plan metres
      const sc = L / Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]);
      for (const s of [-1, 1]) { const P = arcPolyline(b.a, b.b, b.arc.s, 16), off = P.map((p, k) => { const q = P[Math.min(k + 1, P.length - 1)], r = P[Math.max(k - 1, 0)], tx = q[0] - r[0], ty = q[1] - r[1], tl = Math.hypot(tx, ty); return c([p[0] - (ty / tl) * (w / sc) * s, p[1] + (tx / tl) * (w / sc) * s]); }); off.slice(1).forEach((p, k) => d.line(off[k], p, layer)); }
    } else for (const s of [-1, 1]) d.line([a[0] + n[0] * w * s, a[1] + n[1] * w * s], [e[0] + n[0] * w * s, e[1] + n[1] * w * s], layer);
    const vert = Math.abs(n[0]) > 0.7;
    d.text(`${t.name} ${num(t.b * 100, 0)}x${num(t.h * 100, 0)}`, (a[0] + e[0]) / 2 - n[0] * (w + 26), (a[1] + e[1]) / 2 - n[1] * (w + 26), vert);
  });
  floor.columns.forEach((p, i) => {
    const col = cols.find((x) => x.i === i), B = col?.lv?.Bx ?? 20, D = col?.lv?.By ?? 20, q = c(p);
    d.rect(q[0] - B / 2, q[1] - D / 2, B, D, "COLUMN");
  });
  return d.framed(60);
}
