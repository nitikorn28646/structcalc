// Notes of a beam type's section details (user 2026-11-18: "เสริมพิเศษ" written like the construction drawings):
//   support section: top through bars · top extra bars "เสริมพิเศษ L/4" · stirrups · bottom through bars
//   mid-span section: top through bars · stirrups · bottom extra bars "เสริมพิเศษ 3L/5" · bottom through bars
// The extra-bar length written is NEVER shorter than what the cut-off check (floor.js cutoffs, sp.cut) needs on any span of the
// type: L/4 (top, from each support centre) and 3L/5 (bottom, centred) are the drawing standard; a span that needs more moves the
// label to the next standard length (L/3 · 4L/5) or "ยาวตลอดช่วง". L = span length centre to centre of the supports.
import { parseBars } from "./floor.js";
import { BARS } from "./tables.js";

const EPS = 1e-6;
const TOP_STEPS = [[0.25, "L/4"], [1 / 3, "L/3"]], BOT_STEPS = [[0.6, "3L/5"], [0.8, "4L/5"]];

// spans: every span of the project (res.floors[].spans) — only those using type index ti count; cantilever spans have their own rule
// (top bars full length, span.detail) and are reported apart
export function extraSpec(ti, spans) {
  const mine = spans.filter((s) => s.typeIdx === ti), cant = mine.filter((s) => s.kind === "cantilever").length;
  let topR = 0, topFull = 0, botR = 0, botFull = 0, n = 0;
  for (const s of mine) {
    if (s.kind === "cantilever" || !(s.len > 0)) continue; n++;
    const c = s.cut ?? s.check?.cut;
    if (s.topFull || c?.topFull) topFull++;
    else for (const side of c?.top ?? []) if (!side.none && side.len > 0) topR = Math.max(topR, side.len / s.len);
    if (c?.bot?.full) botFull++;
    else if (c?.bot && !c.bot.notNeeded && c.bot.len > 0) { const edge = Math.min(c.bot.start, s.len - c.bot.end); botR = Math.max(botR, 1 - (2 * edge) / s.len); }
  }
  const pick = (r, steps) => steps.find(([v]) => r <= v + EPS)?.[1] ?? null;
  const top = pick(topR, TOP_STEPS), bot = pick(botR, BOT_STEPS);
  return {
    top: top ?? "ยาวตลอดช่วง", bot: bot ?? "ยาวตลอดช่วง", topFull, botFull, cant, spans: n,
    // some spans need the extras over the whole span while the type label is a fraction: the label says so (cut-off table has each span)
    topNote: topFull && top ? `${topFull} ช่วงยาวตลอด` : "", botNote: botFull && bot ? `${botFull} ช่วงยาวตลอด` : "",
    topRatio: topR, botRatio: botR,
  };
}

const barTxt = (s) => { const b = parseBars(s); return b ? `${b.n}-${b.bar} มม.` : null; };
const stTxt = (t, s) => `${t.stSets ?? 1}ป-${t.st} มม. @ ${Number(s).toFixed(2)} ม.`;

// lines of notes for one section, top → bottom; side "top" | "st" | "bot", extra = the bars are the special (extra) ones
export function sectionNotes(t, at, ext = { top: "L/4", bot: "3L/5" }) {
  const out = [], add = (text, side, extra = false) => { if (text) out.push({ text, side, extra }); };
  const xt = (s, lab, note) => { const b = barTxt(s); return b ? `${b} เสริมพิเศษ ${lab}${note ? " *" : ""}` : null; };
  add(barTxt(t.top), "top");
  if (at === "sup") add(xt(t.topX, ext.top, ext.topNote), "top", true);
  add(stTxt(t, at === "sup" ? t.sSup : t.sMid), "st");
  if (at === "mid") add(xt(t.botX, ext.bot, ext.botNote), "bot", true);
  add(barTxt(t.bot), "bot");
  return out;
}

// footnote for the "*" of a section (spans of the type that need the extra bars over the whole span)
export function extraFootnote(at, ext) {
  const n = at === "sup" ? ext?.topNote && ext.topFull : ext?.botNote && ext.botFull;
  return n ? `* ${n} ช่วงของ type นี้ต้องเสริม${at === "sup" ? "บน" : "ล่าง"}ยาวตลอดช่วง — ดูตารางระยะตัดเหล็กเสริม` : "";
}
// bar diameter (cm) of a bar string, for drawing
export const barDia = (s) => BARS[parseBars(s)?.bar]?.d ?? 1.2;
