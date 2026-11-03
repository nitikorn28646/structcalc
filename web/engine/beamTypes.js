// Automatic beam types, one more per press (user 2026-11-03: "like the spread-footing auto types", economy first):
// every span gets the cheapest section that passes all its checks with its design forces; spans are sorted by that cost and
// split into k groups of about equal count; each group's type = the cheapest section passing every span of the group.
// Names B1, B2, … from the cheapest. Cantilever spans are not a group of their own: they use the type whose support bars suffice,
// shown as <name>A (B1A = B1 with its top bars run the whole cantilever — floor.js span.detail).
// Limits (user): b ≥ 0.20 m, h ≤ 0.80 m, at most 2 bar layers. Cost per metre: concrete 2,500 ฿/m³, steel 28 ฿/kg,
// formwork 350 ฿/m² (b + 2h) — only the ranking matters.
import { BARS } from "./tables.js";
import { barLayers, parseBars } from "./floor.js";
import { checkEnv } from "./frame.js";

export const BEAM_GEN = { b: [0.2, 0.25, 0.3], hMin: 0.3, hMax: 0.8, dh: 0.05, bars: ["DB 12", "DB 16", "DB 20"], stirrups: ["RB 9", "DB 10", "DB 12"],
  sMax: 0.2, sMin: 0.1, ds: 0.025, maxLayers: 2, price: { conc: 2500, steel: 28, form: 350 } };

const kgm = (s) => { const x = parseBars(s); return x ? (x.n * BARS[x.bar].A * 7850) / 1e4 : 0; }; // kg per metre of bars
// rough steel per metre of beam: through bars full length, extra top bars ~ L/2 (two quarters), extra bottom bars 3/5,
// stirrups (perimeter × area) at the mean spacing
export function beamCost(t, g = BEAM_GEN) {
  const stA = BARS[t.st]?.A ?? (t.st === "DB 10" ? 0.79 : 0.64), per = 2 * (t.b + t.h) - 0.16;
  const st = ((stA * 7850) / 1e4) * per * (1 / t.sSup + 1 / t.sMid) / 2;
  const steel = kgm(t.top) + kgm(t.bot) + 0.5 * kgm(t.topX) + 0.6 * kgm(t.botX) + st;
  return t.b * t.h * g.price.conc + steel * g.price.steel + (t.b + 2 * t.h) * g.price.form;
}
const bars = (n, bar) => (n > 0 ? `${n}-${bar.replace(" ", "")}` : "");
const fitsLayers = (t, mat, g) => {
  const lay = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x)), used = (L) => L.filter((l) => l.main || l.special).length;
  return used(lay(t.top, t.topX)) <= g.maxLayers && used(lay(t.bot, t.botX)) <= g.maxLayers;
};

// cheapest type of one b × h × bar size that passes every span in `sps` (null if none): bars and stirrups grown from the minimum
function designBH(sps, b, h, bar, mat, g) {
  const t = { name: "", b, h, top: bars(2, bar), bot: bars(2, bar), topX: "", botX: "", st: g.stirrups[0], sSup: g.sMax, sMid: g.sMax };
  let nT = 2, nB = 2, xT = 0, xB = 0, si = 0;
  for (let it = 0; it < 40; it++) {
    Object.assign(t, { top: bars(nT, bar), bot: bars(nB, bar), topX: bars(xT, bar), botX: bars(xB, bar), st: g.stirrups[si] });
    if (!fitsLayers(t, mat, g)) return null;
    const cs = sps.map((sp) => checkEnv(t, sp, mat));
    if (cs.every((c) => c.ok)) return { ...t };
    let grew = false;
    for (const c of cs.filter((x) => !x.ok)) {
      if (c.error || c.defl?.ok === false || c.mid?.minDepthOk === false || c.sup?.minDepthOk === false) return null; // needs another b × h
      const m = c.mid, s = c.sup;
      if (m && (m.botOk === false || m.doublyCheck !== "OK")) { xB++; grew = true; }
      if (m && m.topOk === false) { nT++; grew = true; }
      if (s && (s.botOk === false || (s.doublyCheck && s.doublyCheck !== "OK"))) { xT++; grew = true; }
      if (s && s.topOk === false) { nB++; grew = true; }
      for (const [r, k] of [[s, "sSup"], [m, "sMid"]]) if (r && (r.stirrup === "CHECK_SPACING" || r.AminOk === false || r.vOk === false)) {
        if (r.vOk === false || r.VpOk === false) return null; // shear / torsion stress beyond the section: deeper or wider
        if (t[k] - g.ds >= g.sMin - 1e-9) t[k] = +(t[k] - g.ds).toFixed(3); else if (si + 1 < g.stirrups.length) { si++; t.sSup = t.sMid = g.sMax; } else return null;
        grew = true;
      }
      if (c.mid && c.mid.VpOk === false || c.sup?.VpOk === false) return null;
    }
    if (!grew) return null;
    if (Math.max(nT, nB) > 4) { nT = Math.min(nT, 4); nB = Math.min(nB, 4); } // through bars: keep them few, extras do the rest
  }
  return null;
}
// cheapest of every b × h × bar size
export function designGroup(sps, mat, g = BEAM_GEN) {
  let best = null;
  for (const b of g.b) for (let h = Math.max(g.hMin, b); h <= g.hMax + 1e-9; h = +(h + g.dh).toFixed(3)) for (const bar of g.bars) {
    const t = designBH(sps, b, h, bar, mat, g);
    if (t) { const c = beamCost(t, g); if (!best || c < best.cost) best = { t, cost: c }; }
  }
  return best;
}

// res = analyzeFrame result (span design forces in place); k = number of types wanted → { types, groups, unmatched }
export function autoBeamTypes(res, mat, k, g = BEAM_GEN) {
  const spans = res.floors.flatMap((an) => an.spans).map((sp) => ({ ...sp, vDone: true }));
  // the cheapest own section of each span (sort key); a span that nothing within the limits can carry stays unmatched
  const own = spans.map((sp) => ({ sp, d: designGroup([sp], mat, g) }));
  const unmatched = own.filter((o) => !o.d).map((o) => o.sp.id);
  const list = own.filter((o) => o.d).sort((a, b) => a.d.cost - b.d.cost);
  const n = Math.max(1, Math.min(k, list.length)), types = [];
  for (let i = 0; i < n; i++) {
    const grp = list.slice(Math.round((i * list.length) / n), Math.round(((i + 1) * list.length) / n));
    if (!grp.length) continue;
    const d = designGroup(grp.map((o) => o.sp), mat, g) ?? grp[grp.length - 1].d;
    types.push({ ...d.t, cost: d.cost, count: grp.length });
  }
  // identical types merged, cheapest first, named B1, B2, …
  const uniq = [...new Map(types.map((t) => [`${t.b}|${t.h}|${t.top}|${t.bot}|${t.topX}|${t.botX}|${t.st}|${t.sSup}|${t.sMid}`, t])).values()].sort((a, b) => a.cost - b.cost);
  return { types: uniq.map((t, i) => ({ name: `B${i + 1}`, b: t.b, h: t.h, top: t.top, bot: t.bot, topX: t.topX, botX: t.botX, st: t.st, sSup: t.sSup, sMid: t.sMid, auto: true })), unmatched };
}

// One press of the button: k types for the whole project. The design forces depend on the types (self weight, stiffness of the
// 3D frame), so the types are re-derived from a fresh analysis up to 4 times; the set with the most passing spans, then the
// lowest cost, is kept. All drawn beams go back to "auto" (the analysis then takes the cheapest passing type per beam).
import { analyzeFrame } from "./frame.js";
export function generateBeamTypes(frame, k, g = BEAM_GEN) {
  let f = { ...frame, floors: frame.floors.map((fl) => ({ ...fl, beams: (fl.beams ?? []).map((b) => ({ ...b, type: null })) })) };
  let r = analyzeFrame(f), best = null;
  const score = (rr) => { const sp = rr.floors.flatMap((a) => a.spans); return { ok: sp.filter((s) => s.ok).length, n: sp.length, cost: sp.reduce((s, x) => s + beamCost(x.type, g) * x.len, 0) }; };
  for (let pass = 0; pass < 4; pass++) {
    const out = autoBeamTypes(r, f.mat, k, g);
    if (!out.types.length) break;
    f = { ...f, beamTypes: out.types }; r = analyzeFrame(f);
    const s = score(r);
    if (!best || s.ok > best.s.ok || (s.ok === best.s.ok && s.cost < best.s.cost)) best = { types: out.types, s, unmatched: out.unmatched };
    if (s.ok === s.n) break;
  }
  return best ? { beamTypes: best.types, floors: f.floors, ...best.s, unmatched: best.unmatched } : null;
}
