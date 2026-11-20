// Notes of a beam type's section details (user 2026-11-18: "เสริมพิเศษ" written like the construction drawings):
//   support section: top through bars · top extra bars "เสริมพิเศษ L/4" · stirrups · bottom through bars
//   mid-span section: top through bars · stirrups · bottom extra bars "เสริมพิเศษ 3L/5" · bottom through bars
// The extra-bar length written is NEVER shorter than what the cut-off check (floor.js cutoffs, sp.cut) needs on any span of the
// type: L/4 (top, from each support centre) and 3L/5 (bottom, centred) are the drawing standard; a span that needs more moves the
// label to the next standard length (L/3 · 4L/5) or "ยาวตลอดช่วง". L = span length centre to centre of the supports.
import { barLayers, parseBars } from "./floor.js";
import { BARS } from "./tables.js";

const EPS = 1e-6;
const TOP_STEPS = [[0.25, "L/4"], [1 / 3, "L/3"]], BOT_STEPS = [[0.6, "3L/5"], [0.8, "4L/5"]];

// spans: every span of the project (res.floors[].spans) — only those using type index ti count; cantilever spans have their own rule
// (top bars full length, span.detail) and are reported apart
export function extraSpec(ti, spans) {
  const mine = spans.filter((s) => s.typeIdx === ti), cant = mine.filter((s) => s.kind === "cantilever").length;
  let topR = 0, topFull = 0, botR = 0, botFull = 0, n = 0, cantBack = 0, cantThrough = 0, cantNoBack = 0, cantLen = 0;
  // cantilever spans (type name + "A"): every top bar runs the whole cantilever, hooked at the tip, and back into the span behind it
  // ext = max(cantilever length, ld) (floor.js span.detail); a back span shorter than that → the bars run its whole length
  for (const s of mine) if (s.kind === "cantilever" && s.detail) { cantLen = Math.max(cantLen, s.len); if (s.detail.noBack) cantNoBack++; else if (s.detail.through) cantThrough++; else cantBack = Math.max(cantBack, s.detail.ext); }
  for (const s of mine) {
    if (s.kind === "cantilever" || !(s.len > 0)) continue; n++;
    const c = s.cut ?? s.check?.cut;
    if (s.topFull || c?.topFull) topFull++;
    else for (const side of c?.top ?? []) if (!side.none && side.len > 0) topR = Math.max(topR, side.len / s.len);
    if (c?.bot?.full) botFull++;
    else if (c?.bot && !c.bot.notNeeded && c.bot.len > 0) { const edge = Math.min(c.bot.start, s.len - c.bot.end); botR = Math.max(botR, 1 - (2 * edge) / s.len); }
  }
  const pick = (r, steps) => steps.find(([v]) => r <= v + EPS)?.[1] ?? null;
  // every span needs them over the whole span → the label is "ยาวตลอดช่วง" (was the first fraction when all spans were full)
  const top = n && topFull === n ? null : pick(topR, TOP_STEPS), bot = n && botFull === n ? null : pick(botR, BOT_STEPS);
  return {
    top: top ?? "ยาวตลอดช่วง", bot: bot ?? "ยาวตลอดช่วง", topFull, botFull, cant, spans: n,
    // some spans need the extras over the whole span while the type label is a fraction: the label says so (cut-off table has each span)
    topNote: topFull && top ? `${topFull} ช่วงยาวตลอด` : "", botNote: botFull && bot ? `${botFull} ช่วงยาวตลอด` : "",
    topRatio: topR, botRatio: botR, cantBack, cantThrough, cantNoBack, cantLen,
  };
}

// extra bars that run the whole span for every span of the type (label "ยาวตลอดช่วง" without a footnote)
export const fullExtras = (ext) => ({ top: ext?.top === "ยาวตลอดช่วง" && !ext?.topNote, bot: ext?.bot === "ยาวตลอดช่วง" && !ext?.botNote });
// the bars drawn in a section: [through, extra] per face; full-length extras of the same size become through bars (one count)
export function sectionBarSpec(t, at, ext) {
  const fx = fullExtras(ext), mg = (a, x) => { const A = parseBars(a), X = parseBars(x); return A && X && A.bar === X.bar ? [`${A.n + X.n}-${A.bar}`, null] : [a, x]; };
  const top = at === "cant" || at === "sup" ? (fx.top ? mg(t.top, t.topX) : [t.top, t.topX]) : at === "mid" && fx.top ? mg(t.top, t.topX) : [t.top, at === "all" ? t.topX : null];
  const bot = at === "mid" ? (fx.bot ? mg(t.bot, t.botX) : [t.bot, t.botX]) : at === "sup" && fx.bot ? mg(t.bot, t.botX) : [t.bot, null];
  return { top, bot };
}
const barTxt = (s) => { const b = parseBars(s); return b ? `${b.n}-${b.bar} มม.` : null; };
const stTxt = (t, s) => `${t.stSets ?? 1}ป-${t.st} มม. @ ${Number(s).toFixed(2)} ม.`;

// lines of notes for one section, top → bottom; side "top" | "st" | "bot", extra = the bars are the special (extra) ones
export function sectionNotes(t, at, ext = { top: "L/4", bot: "3L/5" }) {
  const out = [], add = (text, side, extra = false) => { if (text) out.push({ text, side, extra }); };
  const xt = (s, lab, note) => { const b = barTxt(s); return b ? `${b} เสริมพิเศษ ${lab}${note ? " *" : ""}` : null; };
  if (at === "cant") { // cantilever (B1A): every top bar runs the whole cantilever — written as one count like the drawings (user's sheet)
    const a = parseBars(t.top), x = parseBars(t.topX);
    if (a && x && a.bar === x.bar) add(`${a.n + x.n}-${a.bar} มม.`, "top"); else { add(barTxt(t.top), "top"); add(barTxt(t.topX), "top"); }
    add(stTxt(t, t.sSup), "st"); add(barTxt(t.bot), "bot"); return out;
  }
  // a type without extra bars (GB, GB-A …): one section "ตลอดคาน" (user 2026-11-18)
  if (at === "all") { add(barTxt(t.top), "top"); add(stTxt(t, Math.min(t.sSup, t.sMid)), "st"); add(barTxt(t.bot), "bot"); return out; }
  // extras running the whole span of every span (fullExtras) are through bars: same size → one count "3-DB 12 มม." (user 2026-11-20:
  // "ทำไมไม่ใส่เป็น 3DB12"), as the cantilever section does
  const fx0 = fullExtras(ext), merge = (a, x) => { const A = parseBars(a), X = parseBars(x); return A && X && A.bar === X.bar ? `${A.n + X.n}-${A.bar} มม.` : null; };
  const mTop = fx0.top ? merge(t.top, t.topX) : null, mBot = fx0.bot ? merge(t.bot, t.botX) : null;
  if (mTop || mBot) { add(mTop ?? barTxt(t.top), "top"); if (!mTop && (at === "sup" || fx0.top)) add(xt(t.topX, ext.top, ext.topNote), "top", true);
    add(stTxt(t, at === "sup" ? t.sSup : t.sMid), "st");
    if (!mBot && (at === "mid" || fx0.bot)) add(xt(t.botX, ext.bot, ext.botNote), "bot", true); add(mBot ?? barTxt(t.bot), "bot"); return out; }
  add(barTxt(t.top), "top");
  // extras running the whole span (every span of the type needs it, user 2026-11-20: "บอกยาวตลอดช่วง แต่กลางคานไม่มี") are drawn and
  // noted in BOTH sections
  const fx = fullExtras(ext);
  if (at === "sup" || fx.top) add(xt(t.topX, ext.top, ext.topNote), "top", true);
  add(stTxt(t, at === "sup" ? t.sSup : t.sMid), "st");
  if (at === "mid" || fx.bot) add(xt(t.botX, ext.bot, ext.botNote), "bot", true);
  add(barTxt(t.bot), "bot");
  return out;
}

// footnote for the "*" of a section (spans of the type that need the extra bars over the whole span)
// back-span anchorage of a type's cantilevers (shown under the "A" section title)
export function cantNote(ext) {
  if (!ext?.cant) return "";
  return ext.cantBack > 0 ? `เหล็กบนงอขอที่ปลาย ฝากช่วงหลัง ≥ ${Number(ext.cantBack).toFixed(2)} ม.` : ext.cantThrough ? "เหล็กบนงอขอที่ปลาย ยาวตลอดช่วงหลัง" : "เหล็กบนงอขอที่ปลาย ฝังในเสา ≥ ld";
}
export const hasExtras = (t) => !!(parseBars(t.topX) || parseBars(t.botX));
export function extraFootnote(at, ext, short = false) {
  if (at === "cant") { const p = [ext?.cantThrough && `${ext.cantThrough} ตัวมีช่วงหลังสั้น: เหล็กบนยาวตลอดช่วงหลัง`, ext?.cantNoBack && `${ext.cantNoBack} ตัวไม่มีช่วงหลัง: ฝังในเสา ≥ ld`].filter(Boolean);
    return p.length && (ext.cantBack > 0 || p.length > 1) ? `* ${p.join(" · ")}` : ""; }
  const n = at === "sup" ? ext?.topNote && ext.topFull : ext?.botNote && ext.botFull;
  return n ? (short ? `* ${n} ช่วงเสริม${at === "sup" ? "บน" : "ล่าง"}ยาวตลอดช่วง` : `* ${n} ช่วงของ type นี้ต้องเสริม${at === "sup" ? "บน" : "ล่าง"}ยาวตลอดช่วง — ดูตารางระยะตัดเหล็กเสริม`) : "";
}
// bar diameter (cm) of a bar string, for drawing
export const barDia = (s) => BARS[parseBars(s)?.bar]?.d ?? 1.2;

// make a type buildable (user 2026-11-18: "ชั้นที่ 2 ห้ามมีเส้นเดียว ต้องมีอย่างน้อย 2 เส้น"): a face whose bars leave ONE bar alone in a
// layer gets one more extra bar of the same size (never fewer bars — the steel only grows, the checks run again); returns null when
// nothing needs changing, { type } when fixed, { type: null, why } when no count up to 2 more bars works (wider beam / bigger bars)
export function fixLoneBars(t, mat) {
  const out = { ...t }; let changed = false;
  for (const [m, x] of [["top", "topX"], ["bot", "botX"]]) {
    const L = (xs) => barLayers(t.b, mat, t.st, parseBars(t[m]), parseBars(xs));
    if (!L(t[x]).odd) continue;
    const main = parseBars(t[m]), ex = parseBars(t[x]), bar = ex?.bar ?? main?.bar;
    let ok = null;
    for (let k = (ex?.n ?? 0) + 1; k <= (ex?.n ?? 0) + 2 && !ok; k++) { const s = `${k}-${bar}`, l = L(s); if (!l.odd && !l.over) ok = s; }
    if (!ok) return { type: null, why: `เหล็ก${m === "top" ? "บน" : "ล่าง"} — เพิ่มเหล็กเสริมแล้วยังจัดชั้นไม่ได้ ต้องขยายความกว้างคานหรือใช้เหล็กเส้นใหญ่ขึ้น` };
    out[x] = ok; changed = true;
  }
  return changed ? { type: out } : null;
}
