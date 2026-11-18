// Beam type details as a DXF file for drafting (user 2026-11-18: "export เป็นไฟล์ cad เพื่อเขียนแบบได้").
// One row per beam type in use: support section ("ช่วงหัวเสา") and mid-span section ("ช่วงกลางคาน") drawn at true size in METRES
// (1 unit = 1 m, $INSUNITS 6), with the same bars / notes as the app and the report (engine/beamDetail.js), dimensions, titles and a
// type tag. Written by hand as DXF R12 (AC1009) so the file opens in AutoCAD / ZWCAD / GstarCAD / LibreCAD:
//   layers C-CONC (outline) · C-STIRRUP · C-BAR · C-BAR-EXTRA · C-DIM · C-TEXT · C-TITLE,
//   text style T5 (AngsanaUPC.ttf, the same name / font as the user's drawings — user 2026-11-18), every non-ASCII character written as \U+XXXX (Thai shows correctly whatever the code page).
import { barLayout } from "./drawings.js";
import { barLayers, parseBars } from "../engine/floor.js";
import { STIRRUPS } from "../engine/tables.js";
import { sectionNotes, extraFootnote, hasExtras, cantNote } from "../engine/beamDetail.js";

// sheets (user 2026-11-18, their A3 sheet EN-08 "แบบขยายคาน" as the model): A3 at 1:25 drawn in metres = 10.50 × 7.425, drawing area
// inside the red border, title column on the right (fields filled from the project data, logo area left empty, Dwg / Sheet No. empty —
// user), one panel per beam type with a tag bubble, sheet 1 also carries the typical beam elevation (L, 1/4L, 3/5L) and the notes
const LAYERS = [["C-CONC", 3], ["C-STIRRUP", 1], ["C-BAR", 5], ["C-BAR-EXTRA", 5], ["C-DIM", 2], ["C-TEXT", 3], ["C-TITLE", 3], ["C-TAG", 5], ["C-FRAME", 1], ["C-FRAME2", 8], ["C-ELEV", 3], ["Defpoints", 7]];
const uni = (s) => [...String(s)].map((ch) => { const c = ch.codePointAt(0); return c < 128 ? ch : `\\U+${c.toString(16).toUpperCase().padStart(4, "0")}`; }).join("");
const f = (v) => (Math.abs(v) < 1e-9 ? 0 : v).toFixed(4);

class Dxf {
  constructor() { this.e = []; }
  line(x1, y1, x2, y2, l) { this.e.push(`0\nLINE\n8\n${l}\n10\n${f(x1)}\n20\n${f(y1)}\n30\n0\n11\n${f(x2)}\n21\n${f(y2)}\n31\n0`); }
  circle(x, y, r, l) { this.e.push(`0\nCIRCLE\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(r)}`); }
  // closed polyline; pts [[x, y, bulge]]
  poly(pts, l, closed = true) {
    this.e.push(`0\nPOLYLINE\n8\n${l}\n66\n1\n70\n${closed ? 1 : 0}\n10\n0\n20\n0\n30\n0`);
    for (const [x, y, b = 0] of pts) this.e.push(`0\nVERTEX\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0${b ? `\n42\n${f(b)}` : ""}`);
    this.e.push(`0\nSEQEND\n8\n${l}`);
  }
  // h = text height (m); ha 0 left / 1 centre / 2 right, va 0 baseline / 2 middle
  text(x, y, h, s, l = "C-TEXT", ha = 0, va = 0, rot = 0) {
    const align = ha || va ? `\n72\n${ha}\n11\n${f(x)}\n21\n${f(y)}\n31\n0\n73\n${va}` : "";
    this.e.push(`0\nTEXT\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(h)}\n1\n${uni(s)}\n7\nT5${rot ? `\n50\n${rot}` : ""}${align}`);
  }
  // dimension drawn with lines + ticks + text (no DIMENSION entity: same look in every CAD program)
  dim(x1, y1, x2, y2, off, label, h) {
    const vert = Math.abs(x1 - x2) < 1e-9, t = h * 0.6;
    if (!vert) { const y = y1 + off; this.line(x1, y1, x1, y + Math.sign(off) * t, "C-DIM"); this.line(x2, y2, x2, y + Math.sign(off) * t, "C-DIM"); this.line(x1 - t, y, x2 + t, y, "C-DIM");
      for (const x of [x1, x2]) this.line(x - t * 0.6, y - t * 0.6, x + t * 0.6, y + t * 0.6, "C-DIM"); this.text((x1 + x2) / 2, y + h * 0.5, h, label, "C-DIM", 1, 0); }
    else { const x = x1 + off; this.line(x1, y1, x + Math.sign(off) * t, y1, "C-DIM"); this.line(x2, y2, x + Math.sign(off) * t, y2, "C-DIM"); this.line(x, y1 - t, x, y2 + t, "C-DIM");
      for (const y of [y1, y2]) this.line(x - t * 0.6, y - t * 0.6, x + t * 0.6, y + t * 0.6, "C-DIM"); this.text(x - h * 0.5, (y1 + y2) / 2, h, label, "C-DIM", 1, 0, 90); }
  }
  toString() {
    const head = ["0\nSECTION\n2\nHEADER", "9\n$ACADVER\n1\nAC1009", "9\n$DWGCODEPAGE\n3\nANSI_874", "9\n$INSUNITS\n70\n6", "0\nENDSEC"].join("\n");
    const ltype = "0\nTABLE\n2\nLTYPE\n70\n1\n0\nLTYPE\n2\nCONTINUOUS\n70\n0\n3\nSolid line\n72\n65\n73\n0\n40\n0.0\n0\nENDTAB";
    const layer = `0\nTABLE\n2\nLAYER\n70\n${LAYERS.length}\n${LAYERS.map(([n, c]) => `0\nLAYER\n2\n${n}\n70\n0\n62\n${c}\n6\nCONTINUOUS`).join("\n")}\n0\nENDTAB`;
    const style = "0\nTABLE\n2\nSTYLE\n70\n1\n0\nSTYLE\n2\nT5\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n0.025\n3\nAngsanaUPC.ttf\n4\n\n0\nENDTAB";
    return `${head}\n0\nSECTION\n2\nTABLES\n${ltype}\n${layer}\n${style}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${this.e.join("\n")}\n0\nENDSEC\n0\nEOF\n`;
  }
}

// one section at (ox, oy) = bottom-left corner of the concrete (m)
function section(d, t, mat, at, ext, ox, oy, title, th = 0.035, sub = "") {
  const B = t.b * 100, H = t.h * 100, cover = mat.cover ?? 3, sd = STIRRUPS[t.st]?.d ?? 0.6, m = (v) => v / 100;
  const lay = (a, b) => barLayers(t.b, mat, t.st, parseBars(a), parseBars(b));
  const top = at !== "mid" ? lay(t.top, t.topX) : lay(t.top), bot = at !== "mid" ? lay(t.bot) : lay(t.bot, t.botX); // "cant" = cantilever root
  const bars = [...barLayout(B, H, cover, sd, top, true), ...barLayout(B, H, cover, sd, bot, false)];
  d.poly([[ox, oy], [ox + t.b, oy], [ox + t.b, oy + t.h], [ox, oy + t.h]], "C-CONC");
  // stirrup centre line with rounded corners (bulge = tan(90°/4)) and 90° hooks at the top-left corner
  const ins = m(cover + sd / 2), r = Math.min(m(2), (t.b - 2 * ins) / 4), x0 = ox + ins, y0 = oy + ins, x1 = ox + t.b - ins, y1 = oy + t.h - ins, k = 0.41421356;
  d.poly([[x0 + r, y0], [x1 - r, y0, k], [x1, y0 + r], [x1, y1 - r, k], [x1 - r, y1], [x0 + r, y1, k], [x0, y1 - r], [x0, y0 + r, k]], "C-STIRRUP");
  for (let s = 0; s < (t.stSets ?? 1) - 1; s++) { const g = m(sd * 1.1) * (s + 1); d.poly([[x0 + g, y0 + g], [x1 - g, y0 + g], [x1 - g, y1 - g], [x0 + g, y1 - g]], "C-STIRRUP"); }
  // 90° hooks (user): the two ends overlap the other leg by the hook extension 6·db, at least 7.5 cm
  const hk = Math.max(m(6 * sd), 0.075), g = m(sd); d.line(x0 + g, y1 - r, x0 + g, y1 - r - hk, "C-STIRRUP"); d.line(x0 + r, y1 - g, x0 + r + hk, y1 - g, "C-STIRRUP");
  for (const b of bars) d.circle(ox + m(b.x), oy + m(b.y), m(b.d) / 2, b.special ? "C-BAR-EXTRA" : "C-BAR");
  // notes with leaders (as on the screen / report)
  const notes = sectionNotes(t, at, ext), tx = ox + t.b + 0.09, lh = th * 1.7;
  const topBars = bars.filter((b) => b.y > H / 2), botBars = bars.filter((b) => b.y <= H / 2);
  const pick = (list, extra, outer) => { const c = list.filter((b) => !!b.special === extra), k = c.length ? c : list; return k.reduce((a, b) => (Math.abs(b.y - outer) < Math.abs(a.y - outer) - 0.1 || (Math.abs(b.y - a.y) < 0.1 && b.x > a.x) ? b : a), k[0]); };
  const tops = notes.filter((n) => n.side === "top"), bots = notes.filter((n) => n.side === "bot"), st = notes.find((n) => n.side === "st");
  const rows = [...tops.map((n, i) => ({ n, y: oy + t.h - th * 0.6 - i * lh })), ...(st ? [{ n: st, y: oy + t.h / 2 }] : []), ...bots.map((n, i) => ({ n, y: oy + th * 0.6 + (bots.length - 1 - i) * lh }))];
  for (const { n, y } of rows) {
    const b = n.side === "st" ? null : pick(n.side === "top" ? topBars : botBars, n.extra, n.side === "top" ? H : 0);
    const from = b ? [ox + m(b.x), oy + m(b.y)] : [x1, oy + t.h / 2];
    if (n.side !== "st" && !b) continue;
    d.line(from[0], from[1], tx - 0.03, y, "C-TEXT"); d.line(tx - 0.03, y, tx - 0.01, y, "C-TEXT");
    d.text(tx, y, th, n.text, "C-TEXT", 0, 2);
  }
  d.dim(ox, oy + t.h, ox + t.b, oy + t.h, 0.08, t.b.toFixed(2), th);
  d.dim(ox, oy, ox, oy + t.h, -0.09, t.h.toFixed(2), th);
  d.text(ox - 0.05, oy - 0.15, th * 1.6, title, "C-TITLE", 0, 0);
  const foot = [sub, top.odd || bot.odd ? "⚠ ชั้น 2 เหลือเส้นเดียว เสริมจริงไม่ได้" : "", extraFootnote(at, ext, true)].filter(Boolean);
  foot.forEach((x, i) => d.text(ox - 0.05, oy - 0.22 - i * th * 1.3, th * 0.85, x, "C-TEXT", 0, 0));
}

// ---------------------------------------------------------------- sheet frame (A3 1:25 in metres) — the user's title block layout
const SW = 10.5, SH = 7.425, BX0 = 0.407, BX1 = 10.15, BY0 = 0.225, BY1 = 7.2, TX = 9.057;
const TB_LINES = [0.95, 0.957, 1.207, 1.332, 1.34, 1.715, 1.84, 1.847, 2.097, 2.222, 2.23, 2.48, 2.605, 2.612, 2.737, 3.112, 3.237, 3.245, 3.37,
  3.745, 3.87, 3.877, 4.002, 4.377, 4.502, 4.51, 4.635, 5.135, 5.26, 5.267, 5.767, 5.892, 5.9];
const thDate = (iso) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? ""); return m ? `${m[3]} / ${m[2]} / ${+m[1] + 543}` : (iso || ""); };
// split a long Thai line in two at a space near the middle
const split2 = (s, max) => { s = String(s ?? "").trim(); if (s.length <= max) return [s]; const sp = [...s.matchAll(/\s+/g)].map((m) => m.index); if (!sp.length) return [s];
  const k = sp.reduce((a, b) => (Math.abs(b - s.length / 2) < Math.abs(a - s.length / 2) ? b : a)); return [s.slice(0, k).trim(), s.slice(k).trim()]; };
function frame(d, X, p, title) {
  const L = (x1, y1, x2, y2, l = "C-FRAME2") => d.line(X + x1, y1, X + x2, y2, l), T = (x, y, h, s, ha = 0) => s && d.text(X + x, y, h, s, "C-TEXT", ha, ha ? 2 : 0);
  d.poly([[X, 0], [X + SW, 0], [X + SW, SH], [X, SH]], "Defpoints"); // sheet edge (not plotted, as in the user's frame)
  d.poly([[X + BX0, BY0], [X + BX1, BY0], [X + BX1, BY1], [X + BX0, BY1]], "C-FRAME");
  L(TX, BY0, TX, BY1, "C-FRAME");
  for (const y of TB_LINES) L(TX, y, BX1, y, y === 0.957 || y === 1.34 || y === 1.847 || y === 2.23 || y === 2.612 || y === 3.245 || y === 3.877 || y === 4.51 || y === 5.267 || y === 5.9 ? "C-FRAME" : "C-FRAME2");
  L(9.605, BY0, 9.605, 0.95); L(9.605, 0.35, BX1, 0.35); L(9.605, 0.357, BX1, 0.357, "C-FRAME"); L(9.605, 0.357, BX1, 0.825);
  L(9.75, 3.245, 9.75, 3.37); L(9.75, 2.612, 9.75, 2.737);
  const H = 0.048;
  T(9.112, 6.222, H, "PROJECT"); split2(p.name, 30).forEach((s, i) => T(9.6, 6.1 - i * 0.12, H, s, 1));
  T(9.114, 5.807, H, "LOCATION"); split2(p.location, 30).forEach((s, i) => T(9.6, 5.56 - i * 0.135, H, s, 1));
  T(9.114, 5.175, H, "OWNER"); T(9.6, 4.572, H, p.owner, 1);
  T(9.114, 4.417, H, "DRAWING"); T(9.6, 3.94, H, p.drafter, 1);
  T(9.114, 3.785, H, "STRUCTURAL ENGINEER"); T(9.4, 3.307, H, p.engineer, 1); T(9.95, 3.307, H, p.license, 1);
  T(9.114, 3.152, H, "ARCHITECT"); T(9.114, 2.52, H, "ELECTRICAL ENGINEER"); T(9.114, 2.137, H, "SANITARY ENGINEER");
  T(9.114, 1.755, H, "TITLE :"); T(9.6, 1.5, 0.065, title, 1);
  T(9.114, 1.247, H, "DATE :"); T(9.6, 1.08, 0.0525, thDate(p.date), 1);
  T(9.114, 0.865, H, "Dwg. No."); T(9.661, 0.865, H, "Sheet No."); T(9.792, 0.265, H, "Total.");
}

// typical beam elevation (sheet 1): continuous span L between two column centres, top extras L/4 each side, bottom extra 3L/5
function elevation(d, X, x0, y0, mat) {
  const Ls = 3.6, a = x0 + 0.7, b = a + Ls, e0 = x0, e1 = b + 0.7, h = 0.4, c = (mat.cover ?? 3) / 100 + 0.01, cw = 0.2, l = "C-ELEV";
  const Lx = (x1, y1, x2, y2, ly = l) => d.line(X + x1, y1, X + x2, y2, ly);
  Lx(e0, y0, e1, y0); Lx(e0, y0 + h, e1, y0 + h);
  for (const xe of [e0, e1]) { Lx(xe, y0 - 0.05, xe, y0 + h * 0.45); Lx(xe, y0 + h * 0.45, xe + 0.04, y0 + h * 0.55); Lx(xe + 0.04, y0 + h * 0.55, xe, y0 + h * 0.62); Lx(xe, y0 + h * 0.62, xe, y0 + h + 0.05); } // break lines
  for (const xc of [a, b]) { const x1 = xc - cw / 2, x2 = xc + cw / 2; Lx(x1, y0 - 0.3, x1, y0 + h + 0.3); Lx(x2, y0 - 0.3, x2, y0 + h + 0.3); Lx(x1, y0, x2, y0 + h); Lx(x1, y0 + h, x2, y0); }
  Lx(e0 + 0.05, y0 + h - c, e1 - 0.05, y0 + h - c, "C-BAR"); Lx(e0 + 0.05, y0 + c, e1 - 0.05, y0 + c, "C-BAR");
  for (const xc of [a, b]) Lx(xc - Ls / 4, y0 + h - c - 0.035, xc + Ls / 4, y0 + h - c - 0.035, "C-BAR-EXTRA");
  Lx(a + Ls / 5, y0 + c + 0.035, b - Ls / 5, y0 + c + 0.035, "C-BAR-EXTRA");
  for (let x = e0 + 0.1; x < e1 - 0.05; x += 0.15) if (Math.abs(x - a) > cw / 2 + 0.02 && Math.abs(x - b) > cw / 2 + 0.02) Lx(x, y0 + c - 0.01, x, y0 + h - c + 0.01, "C-STIRRUP");
  const th = 0.045;
  d.dim(X + a, y0 + h, X + b, y0 + h, 0.55, "L", th);
  d.dim(X + a, y0 + h, X + a + Ls / 4, y0 + h, 0.35, "1/4L", th); d.dim(X + b - Ls / 4, y0 + h, X + b, y0 + h, 0.35, "1/4L", th);
  d.dim(X + a + Ls / 5, y0, X + b - Ls / 5, y0, -0.35, "3/5L", th);
  d.text(X + (e0 + e1) / 2, y0 - 0.62, 0.07, "รูปด้านคาน (ทั่วไป)", "C-TITLE", 1, 0); d.text(X + (e0 + e1) / 2, y0 - 0.72, 0.045, "มาตราส่วน 1:25", "C-TEXT", 1, 0);
  return e1;
}

// items: [{ t, ext }] = the types in use (ext from extraSpec); project = name / location / owner / engineer / license / date
export function beamSheetsDxf(items, mat, project = {}, title = "แบบขยายคาน") {
  const d = new Dxf(), th = 0.035, cellW = (t) => Math.max(1.2, t.b + 1.0), pad = 0.18, tagH = 0.15;
  // panels: cells = sections of one type (one "ตลอดคาน" when it has no extra bars; + the cantilever "A")
  const panels = items.map(({ t, ext }) => {
    const cells = [];
    if (ext.spans > 0 || !ext.cant) (hasExtras(t) ? [["sup", "ช่วงหัวเสา"], ["mid", "ช่วงกลางคาน"]] : [["all", "ตลอดคาน"]]).forEach(([at, w]) => cells.push({ at, title: `${t.name} ${w}`, tag: t.name }));
    if (ext.cant > 0) cells.push({ at: "cant", title: `${t.name}A ตลอดคาน`, tag: `${t.name}A`, sub: cantNote(ext) });
    const w = cells.reduce((s) => s + cellW(t), 0) + 2 * pad;
    return { t, ext, cells, w, h: t.h + 0.8 };
  }).filter((x) => x.cells.length);
  // pack panels into rows by width, then rows into sheets by height (sheet 1 keeps the bottom for the elevation + notes)
  const AW = TX - BX0, rows = [], sheets = [];
  for (const pn of panels) { const r = rows.at(-1); if (!r || r.w + pn.w > AW + 1e-9) rows.push({ panels: [pn], w: pn.w, h: pn.h }); else { r.panels.push(pn); r.w += pn.w; r.h = Math.max(r.h, pn.h); } }
  let sheet = null, y = 0;
  const newSheet = () => { sheet = { rows: [], bottom: sheets.length === 0 ? BY0 + 2.1 : BY0 }; sheets.push(sheet); y = BY1; };
  newSheet();
  for (const r of rows) {
    if (y - r.h - tagH < sheet.bottom - 1e-9 && sheet.rows.length) newSheet();
    r.y1 = y; r.y0 = y - r.h - tagH; y = r.y0; sheet.rows.push(r);
  }
  sheets.forEach((sh, k) => {
    const X = k * (SW + 0.5);
    frame(d, X, project, sheets.length > 1 ? `${title} (${k + 1}/${sheets.length})` : title);
    for (const row of sh.rows) {
      let x = BX0;
      for (const pn of row.panels) {
        const yb = row.y0 + tagH, sy = yb + 0.42 + (row.h - 0.8 - pn.t.h) / 2; // section bottom (title + notes below, dimension above)
        let cx = x + pad;
        const tags = {};
        for (const c of pn.cells) { section(d, pn.t, mat, c.at, pn.ext, X + cx + 0.12, sy, c.title, th, c.sub); (tags[c.tag] ??= []).push(cx + cellW(pn.t) / 2 - 0.1); cx += cellW(pn.t); }
        for (const [tag, xs] of Object.entries(tags)) { const xm = xs.reduce((s, v) => s + v, 0) / xs.length; d.circle(X + xm, row.y0 + tagH / 2, 0.055, "C-TAG"); d.text(X + xm, row.y0 + tagH / 2, 0.05, tag, "C-TAG", 1, 2); }
        x += pn.w;
        d.line(X + x, row.y0, X + x, row.y1, "C-FRAME2");
      }
      d.line(X + BX0, row.y0, X + TX, row.y0, "C-FRAME2"); d.line(X + BX0, row.y0 + tagH, X + x, row.y0 + tagH, "C-FRAME2");
    }
    if (k === 0) {
      const xe = elevation(d, X, BX0 + 0.5, BY0 + 0.95, mat), nx = X + xe + 0.45;
      const notes = ["หมายเหตุ", `1. ระยะหุ้มคอนกรีตของคานไม่น้อยกว่า ${mat.cover ?? 3} ซม.`, "2. L = ระยะศูนย์ถึงศูนย์ของที่รองรับ เหล็กเสริมพิเศษบนวัดจากศูนย์เสาแต่ละข้าง เหล็กเสริมพิเศษล่างวางกึ่งกลางช่วง",
        "3. ความยาวเหล็กเสริมพิเศษตามที่ระบุในรูปตัดของแต่ละ type (L/4, L/3, 3L/5, 4L/5 หรือยาวตลอดช่วง ตามผลตรวจระยะตัดเหล็ก)",
        "4. คานยื่น (A) เหล็กบนทั้งหมดยาวตลอดคานยื่น งอขอที่ปลาย และฝากเข้าช่วงหลังตามที่ระบุใต้รูปตัด", "5. เหล็กปลอกงอขอ 90° ยาว 6 เท่าของขนาดเหล็ก ไม่น้อยกว่า 7.5 ซม. · ทุกชั้นของเหล็กเสริมมีอย่างน้อย 2 เส้น"];
      notes.forEach((s, i) => { const parts = split2(s, 62); parts.forEach((q, j) => d.text(nx, BY0 + 1.85 - i * 0.16 - j * 0.07, i ? 0.042 : 0.056, q, i ? "C-TEXT" : "C-TITLE", 0, 0)); });
    }
  });
  return { dxf: d.toString(), sheets: sheets.length };
}

// save a text file: try a download, and always offer the save box of the app (App listens to "structcalc:savefile") because the
// claude.ai frame blocks downloads (user 2026-11-18: "กดส่งออกไม่ได้") — new tab / copy the text
export function downloadText(text, name, type = "application/dxf") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try { const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); } catch { /* blocked */ }
  window.dispatchEvent(new CustomEvent("structcalc:savefile", { detail: { name, url, text } }));
}
