// Section of a beam with a side widening (พอกข้างคาน, user 2026-11-20, drawn like the user's sheet "GB1 ตลอดคาน"):
// the beam (grey outline, its stirrup and corner bars), the strip w wide on one side (green outline) with its corner bars, and the strip's
// closed stirrup(s) (red) running past the joint to enclose the beam's corner bars — size H × W written as on the sheet ("ขนาด 35 × 15 ซม."):
// H = h − 2·cover_to_stirrup, W = w + the beam's cover + bar (≈ 5 cm) for the first set; a second set (sets 2) is 10 cm wider.
// Primitives as engine/stairDetail.js (metres, y up) → src/stairSvg.js and the DXF writer. Drawing only (checks: floor.js widen).
import { dimItem } from "./dimParts.js";
import { BARS, STIRRUPS } from "./tables.js";
import { parseBars } from "./floor.js";

const cm = (v) => `${Math.round(v * 1000) / 10}`.replace(/\.0$/, "");
export function widenStirrups(t, wt, mat = {}) {
  // outer set: w + 5 cm (encloses the beam's corner bars, as "35 × 15" for w 0.10 on the user's sheet); a 2nd set inside the strip: w − 5 cm
  // ("35 × 25 และ 35 × 35" for w 0.30); H = h − 2·cover
  const c = (mat.cover ?? 3) / 100, H = t.h - 2 * c;
  return Array.from({ length: wt.sets ?? 1 }, (_, k) => ({ H: +H.toFixed(2), W: +Math.max(0.05, wt.w + (k === 0 ? 0.05 : -0.05 * k)).toFixed(2) })).sort((a, b) => a.W - b.W);
}
export function widenNotes(t, wt, mat = {}) {
  const bt = (s) => { const b = parseBars(s); return b ? `${b.n}-${b.bar} มม.` : "-"; }, sts = widenStirrups(t, wt, mat);
  return { top: bt(wt.top), bot: bt(wt.bot), st: `${wt.sets ?? 1}ป-${wt.st} มม. @ ${Number(wt.s).toFixed(2)} ม.`, size: `ขนาด ${sts.map((s) => `${cm(s.H)} ซม. x ${cm(s.W)} ซม.`).join(" และ ")}` };
}

// t = the beam's type (b, h, bars), wt = widening type, side 1 = strip drawn on the right of the beam in the section
export function widenDetailModel(t, wt, mat = {}, o = {}) {
  const P = [], TH = 0.035;
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false) => P.push({ t: "poly", pts, layer, closed });
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
  const circle = (x, y, r, layer = "C-BAR") => P.push({ t: "circle", x, y, r, layer });
  const c = (mat.cover ?? 3) / 100, b = t.b, h = t.h, w = wt.w, sdB = (STIRRUPS[t.st]?.d ?? 0.6) / 100, sdW = (STIRRUPS[wt.st]?.d ?? BARS[wt.st]?.d ?? 0.6) / 100;
  // beam (grey) and strip (green)
  poly([[0, 0], [b, 0], [b, h], [0, h]], "C-FRAME2", true);
  poly([[b, 0], [b + w, 0], [b + w, h], [b, h]], "C-CONC", true);
  // beam stirrup + its corner bars
  const ins = c + sdB / 2; poly([[ins, ins], [b - ins, ins], [b - ins, h - ins], [ins, h - ins]], "C-FRAME2", true);
  const tb = parseBars(t.top), bb = parseBars(t.bot), dB = (BARS[(tb ?? bb)?.bar]?.d ?? 1.2) / 100, rB = dB / 2, xb0 = c + sdB + rB, xb1 = b - c - sdB - rB;
  const row = (n, y) => { for (let k = 0; k < Math.max(2, n); k++) circle(xb0 + ((xb1 - xb0) * k) / Math.max(1, Math.max(2, n) - 1), y, rB, "C-FRAME2"); };
  row(tb?.n ?? 2, h - c - sdB - rB); row(bb?.n ?? 2, c + sdB + rB);
  // strip stirrup(s): from the beam's near corner bars (inside the beam) to the strip's outer face − cover
  const sts = widenStirrups(t, wt, mat), xo = b + w - c - sdW / 2;
  sts.forEach((sz, k) => { const x1 = xo - k * 0.008, x0 = x1 - sz.W, y0 = ins + k * 0.008, y1 = h - ins - k * 0.008; poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]], "C-STIRRUP", true); });
  // strip corner bars
  const tw = parseBars(wt.top), bw = parseBars(wt.bot), dW = (BARS[(tw ?? bw)?.bar]?.d ?? 1.2) / 100, rW = dW / 2, xw0 = b + 0.02 + rW, xw1 = b + w - c - sdW - rW;
  const rowW = (n, y) => { const m = Math.max(1, n); for (let k = 0; k < m; k++) circle(m === 1 ? xw1 : xw0 + ((xw1 - xw0) * k) / (m - 1), y, rW, "C-BAR"); };
  rowW(tw?.n ?? 1, h - c - sdW - rW); rowW(bw?.n ?? 1, c + sdW + rW);
  // dims: strip width on top, beam depth on the left
  // real dimensions (engine/dimParts.js → DIMENSION in the DXF): strip width on top, beam depth on the left
  P.push(dimItem(b, h, b + w, h, 0.08, w.toFixed(2), TH)); P.push(dimItem(0, 0, 0, h, 0.08, h.toFixed(2), TH));
  // notes (leader: straight from the bar / stirrup to the right, text on the line)
  const n = widenNotes(t, wt, mat), tx = b + w + 0.1;
  const lead = (bx, by, ty, s) => { poly([[bx, by], [tx - 0.04, ty], [tx - 0.015, ty]], "C-TEXT"); text(tx, ty, TH, s, "C-TEXT", 0, 2); };
  lead(xw1, h - c - sdW - rW, h - 0.03, n.top);
  lead(xo, h / 2, h / 2 + 0.025, n.st); text(tx, h / 2 - 0.025, TH, n.size, "C-TEXT", 0, 2);
  lead(xw1, c + sdW + rW, 0.03, n.bot);
  const title = o.title ?? `${wt.name} ตลอดคาน`, longest = Math.max(...[n.top, n.st, n.size, n.bot].map((x) => x.length)) * TH * 0.62;
  text((b + w) / 2 + 0.1, -0.14, TH * 1.6, title, "C-TITLE", 1, 0);
  if (o.sub) text((b + w) / 2 + 0.1, -0.2, TH * 0.85, o.sub, "C-TEXT", 1, 0);
  return { items: P, box: [-0.2, -0.26, tx + longest + 0.05, h + 0.16] };
}

// Section of ONE drawn beam with all its widenings and the walls on them (inspector, report calc sheet; user 2026-11-20 "คลิกคานให้ขึ้นรูปตัด
// คานพอก แนวผนัง"). Looking from the beam start a → end b: side 1 (left of a→b) on the left. strips = [{ wt, side, chk }] (chk = floor.js an.widen[i][j]:
// e, tw, qWall, qw, m). Beam axis at x = 0; wall drawn on the strip at its offset e with its thickness, dims e / b / w, torque line under.
export function widenBeamModel(t, strips, mat = {}, o = {}) {
  const P = [], TH = o.th ?? 0.028;
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false, fill = false) => P.push({ t: "poly", pts, layer, closed, fill });
  let bx0 = Infinity, bx1 = -Infinity; // horizontal extent of the texts (so the box never cuts a label)
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => { P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
    if (!rot) { const L = String(s).length * h * 0.62, a = ha === 0 ? x : ha === 1 ? x - L / 2 : x - L; bx0 = Math.min(bx0, a); bx1 = Math.max(bx1, a + L); } };
  const circle = (x, y, r, layer = "C-BAR") => P.push({ t: "circle", x, y, r, layer });
  const c = (mat.cover ?? 3) / 100, b = t.b, h = t.h, sdB = (STIRRUPS[t.st]?.d ?? 0.6) / 100, ins = c + sdB / 2;
  poly([[-b / 2, 0], [b / 2, 0], [b / 2, h], [-b / 2, h]], "C-CONC", true);
  poly([[-b / 2 + ins, ins], [b / 2 - ins, ins], [b / 2 - ins, h - ins], [-b / 2 + ins, h - ins]], "C-FRAME2", true);
  const tb = parseBars(t.top), bb = parseBars(t.bot), rB = (BARS[(tb ?? bb)?.bar]?.d ?? 1.2) / 200, xb0 = -b / 2 + c + sdB + rB, xb1 = b / 2 - c - sdB - rB;
  const row = (n, y) => { const m = Math.max(2, n ?? 2); for (let k = 0; k < m; k++) circle(xb0 + ((xb1 - xb0) * k) / (m - 1), y, rB, "C-FRAME2"); };
  row(tb?.n, h - c - sdB - rB); row(bb?.n, c + sdB + rB);
  // one strip per side (the widest when a side has several parts)
  const bySide = new Map(); for (const s of strips) { const k = (s.side ?? 1) > 0 ? -1 : 1; if (!bySide.has(k) || s.wt.w > bySide.get(k).wt.w) bySide.set(k, s); }
  let xl = -b / 2, xr = b / 2, wallTop = h; const notes = [];
  for (const [g, s] of bySide) { // g = −1 left, +1 right
    const w = s.wt.w, xi = (g * b) / 2, xo = g * (b / 2 + w), sdW = (STIRRUPS[s.wt.st]?.d ?? BARS[s.wt.st]?.d ?? 0.6) / 100;
    poly([[xi, 0], [xo, 0], [xo, h], [xi, h]], "C-CONC", true);
    const sx1 = xo - g * (c + sdW / 2), sx0 = sx1 - g * (w + 0.05); // closed stirrup from the outer face − cover back past the joint (encloses the beam bars)
    poly([[sx0, ins], [sx1, ins], [sx1, h - ins], [sx0, h - ins]], "C-STIRRUP", true);
    const tw = parseBars(s.wt.top), bw = parseBars(s.wt.bot), rW = (BARS[(tw ?? bw)?.bar]?.d ?? 1.2) / 200, xw = xo - g * (c + sdW + rW);
    for (const [n, y] of [[tw?.n, h - c - sdW - rW], [bw?.n, c + sdW + rW]]) { const m = Math.max(1, n ?? 1), xa = xi + g * (0.02 + rW);
      for (let k = 0; k < m; k++) circle(m === 1 ? xw : xa + ((xw - xa) * k) / (m - 1), y, rW, "C-BAR"); }
    if (g < 0) xl = xo; else xr = xo;
    text((xi + xo) / 2, -0.05, TH * 0.85, `${s.wt.name} · ${Math.round(w * 100)} ซม.`, "C-DIM", 1, 3);
    const k = s.chk;
    if (k && k.qWall > 0) { // the wall on the strip at its real offset
      const xc = g * k.e, tw2 = k.tw ?? 0.1, H = Math.min(0.32, Math.max(0.24, h * 0.7)), x0 = xc - tw2 / 2, x1 = xc + tw2 / 2, zz = [[x1, h + H - 0.03], [xc + tw2 / 6, h + H + 0.02], [xc - tw2 / 6, h + H - 0.05], [x0, h + H]];
      poly([[x0, h], [x1, h], ...zz], "C-CONC", true, true); wallTop = Math.max(wallTop, h + H + 0.02);
      line(xc, h + H + 0.06, xc, h + 0.04, "C-DIM", true);
      const yd = h + H + 0.12; line(0, yd, xc, yd, "C-DIM"); for (const x of [0, xc]) { line(x - 0.01, yd - 0.01, x + 0.01, yd + 0.01, "C-DIM"); line(x, yd - 0.02, x, yd + 0.02, "C-DIM"); }
      text(xc / 2, yd + 0.012, TH, `e = ${k.e.toFixed(3)}`, "C-DIM", 1, 0);
      text(xc + g * (tw2 / 2 + 0.02), h + H * 0.55, TH * 0.85, `ผนัง ${Math.round(tw2 * 100)} ซม.`, "C-TEXT", g > 0 ? 0 : 2, 2);
      text(xc + g * (tw2 / 2 + 0.02), h + H * 0.55 - TH * 1.3, TH * 0.85, `${Math.round(k.qWall)} กก./ม.`, "C-TEXT", g > 0 ? 0 : 2, 2);
      wallTop = Math.max(wallTop, yd + 0.05);
    }
    if (k) notes.push(`${g < 0 ? "ซ้าย" : "ขวา"} ${s.wt.name}: m = ${Math.round(k.qw)}·${((b + w) / 2).toFixed(3)}${k.qWall > 0 ? ` + ${Math.round(k.qWall)}·${k.e.toFixed(3)}` : ""} = ${Math.round(k.m)} กก.-ม./ม.${k.ok ? "" : " ✕"}`);
  }
  line(0, -0.03, 0, Math.max(wallTop, h + 0.1), "C-DIM", true); // beam axis
  // dims: beam width under it, depth on the left
  const yb = -0.11; line(-b / 2, yb, b / 2, yb, "C-DIM"); for (const x of [-b / 2, b / 2]) line(x - 0.01, yb - 0.01, x + 0.01, yb + 0.01, "C-DIM");
  text(0, yb - 0.012, TH * 0.85, `${t.name ?? ""} ${Math.round(b * 100)}×${Math.round(h * 100)}`, "C-DIM", 1, 3);
  const xd = xl - 0.06; line(xd, 0, xd, h, "C-DIM"); for (const y of [0, h]) line(xd - 0.01, y - 0.01, xd + 0.01, y + 0.01, "C-DIM");
  text(xd - 0.012, h / 2, TH * 0.85, h.toFixed(2), "C-DIM", 1, 0, 90);
  let y = yb - 0.07; if (o.notes !== false) { for (const n of notes) { text(xl - 0.1, y, TH * 0.9, n, "C-TEXT", 0, 3); y -= TH * 1.6; }
    text(xl - 0.1, y, TH * 0.8, "มองจากต้นคาน → ปลายคาน · แรงบิดสองด้านรวมกัน (ไม่หักล้าง)", "C-ELEV", 0, 3); y -= TH * 1.6; }
  return { items: P, box: [Math.min(xl - 0.14, bx0 - 0.02), y - 0.02, Math.max(xr + 0.06, bx1 + 0.02), wallTop + 0.06] };
}
