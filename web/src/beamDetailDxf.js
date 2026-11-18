// Beam type details as a DXF file for drafting (user 2026-11-18: "export เป็นไฟล์ cad เพื่อเขียนแบบได้").
// One row per beam type in use: support section ("ช่วงหัวเสา") and mid-span section ("ช่วงกลางคาน") drawn at true size in METRES
// (1 unit = 1 m, $INSUNITS 6), with the same bars / notes as the app and the report (engine/beamDetail.js), dimensions, titles and a
// type tag. Written by hand as DXF R12 (AC1009) so the file opens in AutoCAD / ZWCAD / GstarCAD / LibreCAD:
//   layers C-CONC (outline) · C-STIRRUP · C-BAR · C-BAR-EXTRA · C-DIM · C-TEXT · C-TITLE,
//   text style THAI (tahoma.ttf), every non-ASCII character written as \U+XXXX (Thai shows correctly whatever the code page).
import { barLayout } from "./drawings.js";
import { barLayers, parseBars } from "../engine/floor.js";
import { STIRRUPS } from "../engine/tables.js";
import { sectionNotes, extraFootnote } from "../engine/beamDetail.js";

const LAYERS = [["C-CONC", 7], ["C-STIRRUP", 1], ["C-BAR", 5], ["C-BAR-EXTRA", 6], ["C-DIM", 2], ["C-TEXT", 3], ["C-TITLE", 3]];
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
    this.e.push(`0\nTEXT\n8\n${l}\n10\n${f(x)}\n20\n${f(y)}\n30\n0\n40\n${f(h)}\n1\n${uni(s)}\n7\nTHAI${rot ? `\n50\n${rot}` : ""}${align}`);
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
    const style = "0\nTABLE\n2\nSTYLE\n70\n1\n0\nSTYLE\n2\nTHAI\n70\n0\n40\n0.0\n41\n1.0\n50\n0.0\n71\n0\n42\n0.025\n3\ntahoma.ttf\n4\n\n0\nENDTAB";
    return `${head}\n0\nSECTION\n2\nTABLES\n${ltype}\n${layer}\n${style}\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n${this.e.join("\n")}\n0\nENDSEC\n0\nEOF\n`;
  }
}

// one section at (ox, oy) = bottom-left corner of the concrete (m)
function section(d, t, mat, at, ext, ox, oy, title) {
  const B = t.b * 100, H = t.h * 100, cover = mat.cover ?? 3, sd = STIRRUPS[t.st]?.d ?? 0.6, m = (v) => v / 100;
  const lay = (a, b) => barLayers(t.b, mat, t.st, parseBars(a), parseBars(b));
  const top = at === "sup" ? lay(t.top, t.topX) : lay(t.top), bot = at === "sup" ? lay(t.bot) : lay(t.bot, t.botX);
  const bars = [...barLayout(B, H, cover, sd, top, true), ...barLayout(B, H, cover, sd, bot, false)];
  const th = 0.025; // text height 2.5 cm at 1:1 → 2.5 mm on a 1:10 sheet
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
  d.text(ox, oy - 0.14, th * 1.8, title, "C-TITLE", 0, 0);
  const foot = extraFootnote(at, ext); if (foot) d.text(ox, oy - 0.21, th * 0.8, foot, "C-TEXT", 0, 0);
}

// types in use, each with its extraSpec; returns the DXF text
export function beamDetailsDxf(items, mat, title = "") {
  const d = new Dxf(), colW = 1.6, rowGap = 0.55;
  let y = 0;
  if (title) d.text(0, 0.35, 0.06, title, "C-TITLE");
  for (const { t, ext } of items) {
    y -= t.h + rowGap;
    section(d, t, mat, "sup", ext, 0, y, `${t.name} ช่วงหัวเสา`);
    section(d, t, mat, "mid", ext, colW, y, `${t.name} ช่วงกลางคาน`);
    d.text(colW * 2 + 0.2, y + t.h / 2, 0.035, `${t.name}  ${(t.b * 100).toFixed(0)}×${(t.h * 100).toFixed(0)} ซม.`, "C-TITLE", 0, 2);
    y -= 0.15;
  }
  d.text(0, y - 0.25, 0.025, "หน่วย: เมตร (1 หน่วย = 1 ม.) · L = ช่วงคานศูนย์ถึงศูนย์ที่รองรับ · เสริมพิเศษบนวัดจากศูนย์เสาแต่ละข้าง · เสริมพิเศษล่างวางกึ่งกลางช่วง", "C-TEXT");
  return d.toString();
}

// save a text file: try a download, and always offer the save box of the app (App listens to "structcalc:savefile") because the
// claude.ai frame blocks downloads (user 2026-11-18: "กดส่งออกไม่ได้") — new tab / copy the text
export function downloadText(text, name, type = "application/dxf") {
  const url = URL.createObjectURL(new Blob([text], { type }));
  try { const a = Object.assign(document.createElement("a"), { href: url, download: name }); document.body.appendChild(a); a.click(); a.remove(); } catch { /* blocked */ }
  window.dispatchEvent(new CustomEvent("structcalc:savefile", { detail: { name, url, text } }));
}
