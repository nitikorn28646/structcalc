// Automatic beam types, one more per press (user 2026-11-03: "like the spread-footing auto types", economy first):
// every span gets the cheapest section that passes all its checks with its design forces; spans are sorted by that cost and
// split into k groups of about equal count; each group's type = the cheapest section passing every span of the group.
// Names B1, B2, … by size (b × h, then steel); types no span uses are dropped. Cantilever spans are not a group of their own: they use the type whose support bars suffice,
// shown as <name>A (B1A = B1 with its top bars run the whole cantilever — floor.js span.detail).
// Limits (user): b ≥ 0.20 m, h ≤ 0.80 m, sizes in whole 10 cm, at most 2 bar layers. Cost per metre: concrete 2,500 ฿/m³, steel 28 ฿/kg,
// formwork 350 ฿/m² (b + 2h) — only the ranking matters.
import { BARS } from "./tables.js";
import { barLayers, parseBars } from "./floor.js";
import { checkEnv } from "./frame.js";

// the designer's habit (user 2026-11-04): start at 20×40 (easy to build), add DB12 bars up to 5 bottom / 3 top, then DB16 up to
// 5 bottom / 3 top, only then a bigger section — and so on. Stirrups RB6 @0.20 → @0.15 → @0.10, then RB9 @0.20 → @0.15 → @0.10; when
// shear is still too high, a bigger section. The first section in this order that passes is taken (not the cheapest of all).
export const BEAM_GEN = { sections: [[0.2, 0.4], [0.2, 0.5], [0.2, 0.6], [0.3, 0.6], [0.3, 0.7], [0.3, 0.8]],
  bigSections: [[0.4, 0.8], [0.4, 0.9], [0.4, 1.0]], // only for spans nothing above carries (flagged "ใหญ่พิเศษ")
  bars: ["DB 12", "DB 16"], maxBot: 5, maxTop: 3,
  stirrups: [["RB 6", 1], ["RB 9", 1]],
  sMax: 0.2, sMin: 0.1, ds: 0.05, maxLayers: 2, price: { conc: 2500, steel: 28, form: 350 } };

const kgm = (s) => { const x = parseBars(s); return x ? (x.n * BARS[x.bar].A * 7850) / 1e4 : 0; }; // kg per metre of bars
// rough steel per metre of beam: through bars full length, extra top bars ~ L/2 (two quarters), extra bottom bars 3/5,
// stirrups (perimeter × area) at the mean spacing
export function beamCost(t, g = BEAM_GEN) {
  const stA = (BARS[t.st]?.A ?? (t.st === "RB 6" ? 0.28 : t.st === "DB 10" ? 0.79 : 0.64)) * (t.stSets ?? 1), per = 2 * (t.b + t.h) - 0.16;
  const st = ((stA * 7850) / 1e4) * per * (1 / t.sSup + 1 / t.sMid) / 2;
  const steel = kgm(t.top) + kgm(t.bot) + 0.5 * kgm(t.topX) + 0.6 * kgm(t.botX) + st;
  return t.b * t.h * g.price.conc + steel * g.price.steel + (t.b + 2 * t.h) * g.price.form;
}
const bars = (n, bar) => (n > 0 ? `${n}-${bar.replace(" ", "")}` : "");
const fitsLayers = (t, mat, g) => {
  const lay = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x)), used = (L) => L.filter((l) => l.main || l.special).length;
  const T = lay(t.top, t.topX), B = lay(t.bot, t.botX), Tm = lay(t.top), Bm = lay(t.bot, t.botX ? null : undefined);
  // never a single bar alone in an upper layer (cannot be tied): such a bar count is skipped (user 2026-11-04)
  return used(T) <= g.maxLayers && used(B) <= g.maxLayers && !T.odd && !B.odd && !Tm.odd && !lay(t.bot).odd;
};

// cheapest type of one b × h × bar size that passes every span in `sps` (null if none): bars and stirrups grown from the minimum
// start: grow an existing type instead of the minimum (repair after a re-analysis)
export function designBH(sps, b, h, bar, mat, g, start = null) {
  const t = { name: "", b, h, top: bars(2, bar), bot: bars(2, bar), topX: "", botX: "", st: g.stirrups[0][0], stSets: g.stirrups[0][1], sSup: g.sMax, sMid: g.sMax };
  const cnt = (x) => parseBars(x)?.n ?? 0;
  let nT = 2, nB = 2, xT = 0, xB = 0, si = 0;
  if (start) {
    nT = Math.max(2, cnt(start.top)); nB = Math.max(2, cnt(start.bot)); xT = cnt(start.topX); xB = cnt(start.botX);
    si = Math.max(0, g.stirrups.findIndex(([st, n]) => st === start.st && n === (start.stSets ?? 1)));
    Object.assign(t, { sSup: start.sSup, sMid: start.sMid });
  }
  for (let it = 0; it < 40; it++) {
    Object.assign(t, { top: bars(nT, bar), bot: bars(nB, bar), topX: bars(xT, bar), botX: bars(xB, bar), st: g.stirrups[si][0], stSets: g.stirrups[si][1] });
    // bar count limits of this size (user: bottom 5, top 3): bottom bars in all; top = the bars running through, extra top bars at the
    // supports may bring the top up to the bottom limit — then the next bar size, then the next section
    if (nB + xB > (g.maxBot ?? 99) || nT > (g.maxTop ?? 99) || nT + xT > (g.maxBot ?? 99)) return null;
    if (!fitsLayers(t, mat, g)) return null;
    const cs = sps.map((sp) => checkEnv(t, sp, mat));
    if (cs.every((c) => c.ok)) return { ...t };
    let grew = false;
    for (const c of cs.filter((x) => !x.ok)) {
      if (c.error || c.defl?.ok === false || c.mid?.minDepthOk === false || c.sup?.minDepthOk === false) return null; // needs another b × h
      const m = c.mid, s = c.sup;
      if (m && (m.botOk === false || m.doublyCheck !== "OK" || m.AsMinOk === false)) { xB++; grew = true; } // As,min too: more bars, not a bigger size
      if (m && m.topOk === false) { nT++; grew = true; }
      if (s && (s.botOk === false || (s.doublyCheck && s.doublyCheck !== "OK") || s.AsMinOk === false)) { xT++; grew = true; }
      if (s && s.topOk === false) { nB++; grew = true; }
      if ([m, s].some((r) => r && (r.compBarsOk === false || r.barsFit === false))) return null; // needs another b × h (audit F1 / F5)
      for (const r of [m, s]) if (r?.torsionAciOk === false && r.torsionAci.extraFace > 0) { if (r === m) { xB++; nT++; } else { xT++; nB++; } grew = true; } // torsion longitudinal bars
      if (m?.stressOk === false) { xB++; grew = true; }
      if (s?.stressOk === false) { xT++; grew = true; }
      for (const [r, k] of [[s, "sSup"], [m, "sMid"]]) if (r && (r.stirrup === "CHECK_SPACING" || r.AminOk === false || r.vOk === false || r.minShearOk === false || r.torsionAciOk === false)) {
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
// the cheapest version of type t that still passes `sps`: stirrups from RB6 up with the widest spacing that passes (support and
// mid-span apart), then extra / through bars removed one at a time while everything passes
function trimType(t, sps, mat, g) {
  const ok = (x) => sps.every((sp) => checkEnv(x, sp, mat).ok);
  const steps = []; for (let v = g.sMax; v >= g.sMin - 1e-9; v = +(v - g.ds).toFixed(3)) steps.push(v);
  let best = { ...t };
  for (const [st, n] of g.stirrups) {
    const x = { ...best, st, stSets: n };
    const sSup = steps.find((v) => ok({ ...x, sSup: v, sMid: g.sMin })), sMid = sSup !== undefined ? steps.find((v) => ok({ ...x, sSup, sMid: v })) : undefined;
    if (sSup === undefined || sMid === undefined) continue;
    const cand = { ...x, sSup, sMid };
    if (beamCost(cand, g) < beamCost(best, g) - 1e-6 || !ok(best)) best = cand;
    break; // the first (smallest) stirrup that works: RB6 before RB9 before two sets (user)
  }
  const cnt = (v) => parseBars(v)?.n ?? 0, bar = (v) => parseBars(v)?.bar;
  for (const k of ["topX", "botX", "top", "bot"]) {
    for (;;) {
      const n = cnt(best[k]), min = k === "top" || k === "bot" ? 2 : 0;
      if (n <= min) break;
      const cand = { ...best, [k]: n - 1 > 0 ? `${n - 1}-${bar(best[k]).replace(" ", "")}` : "" };
      if (!ok(cand)) break;
      best = cand;
    }
  }
  if (best.stSets === 1) delete best.stSets;
  return best;
}

// the first section × bar size in the designer's order that passes every span in sps (BEAM_GEN.sections, then bars DB12 → DB16)
export function designGroup(sps, mat, g = BEAM_GEN) {
  for (const [b, h] of g.sections) for (const bar of g.bars) {
    const t = designBH(sps, b, h, bar, mat, g);
    if (t) return { t, cost: beamCost(t, g) };
  }
  return null;
}

// res = analyzeFrame result (span design forces in place); k = number of types wanted → { types, groups, unmatched }
export function autoBeamTypes(res, mat, k, g = BEAM_GEN, env = null) {
  // env: Map "floor|span" → largest design forces seen in earlier passes (the forces move with the types: keep the largest)
  const spans = res.floors.flatMap((an, f) => an.spans.map((sp) => {
    const e = env?.get(`${f}|${sp.id}`), x = { ...sp, vDone: true };
    if (e) for (const k2 of ["Mpos", "Mneg", "V", "Mt"]) x[k2] = Math.max(x[k2] ?? 0, e[k2] ?? 0);
    env?.set(`${f}|${sp.id}`, { Mpos: x.Mpos, Mneg: x.Mneg, V: x.V, Mt: x.Mt ?? 0 });
    return x;
  }));
  // the cheapest own section of each span (sort key); a span that nothing within the limits can carry stays unmatched
  const own = spans.map((sp) => ({ sp, d: designGroup([sp], mat, g) }));
  // spans that nothing within the limits carries (e.g. a transfer girder): extended limits for those spans only (user 2026-11-03:
  // b up to 0.40, h up to 1.00 m), one type for all of them if one passes, else one each — flagged big ("คานใหญ่พิเศษ")
  const gBig = { ...g, sections: [...g.sections, ...(g.bigSections ?? [])] }; // same habit, larger sections only
  const over = own.filter((o) => !o.d), bigTypes = [], bigIds = [];
  if (over.length) {
    const all = designGroup(over.map((o) => o.sp), mat, gBig);
    const ds = all ? [{ d: all, ids: over.map((o) => o.sp.id) }] : over.map((o) => ({ d: designGroup([o.sp], mat, gBig), ids: [o.sp.id] }));
    for (const x of ds) if (x.d) { bigTypes.push({ ...x.d.t, cost: x.d.cost, big: true }); bigIds.push(...x.ids); }
  }
  const unmatched = over.map((o) => o.sp.id).filter((id) => !bigIds.includes(id));
  const list = own.filter((o) => o.d).sort((a, b) => a.d.cost - b.d.cost);
  const n = Math.max(1, Math.min(k, list.length)), types = [];
  for (let i = 0; i < n; i++) {
    const grp = list.slice(Math.round((i * list.length) / n), Math.round(((i + 1) * list.length) / n));
    if (!grp.length) continue;
    const d = designGroup(grp.map((o) => o.sp), mat, g) ?? grp[grp.length - 1].d;
    types.push({ ...d.t, cost: d.cost, count: grp.length });
  }
  types.push(...bigTypes);
  // identical types merged, cheapest first, named B1, B2, …
  const uniq = [...new Map(types.map((t) => [`${t.b}|${t.h}|${t.top}|${t.bot}|${t.topX}|${t.botX}|${t.st}|${t.stSets}|${t.sSup}|${t.sMid}`, t])).values()].sort((a, b) => a.cost - b.cost);
  return { types: uniq.map((t, i) => ({ name: `B${i + 1}`, b: t.b, h: t.h, top: t.top, bot: t.bot, topX: t.topX, botX: t.botX, st: t.st, ...(t.stSets > 1 ? { stSets: t.stSets } : {}), sSup: t.sSup, sMid: t.sMid, auto: true, ...(t.big ? { big: true } : {}) })), unmatched, big: bigIds };
}

// One press of the button: k types for the whole project. The design forces depend on the types (self weight, stiffness of the
// 3D frame), so the types are re-derived from a fresh analysis up to 4 times; the set with the most passing spans, then the
// lowest cost, is kept. All drawn beams go back to "auto" (the analysis then takes the cheapest passing type per beam).
import { analyzeFrame } from "./frame.js";
export function generateBeamTypes(frame, k, g = BEAM_GEN) {
  let f = { ...frame, floors: frame.floors.map((fl) => ({ ...fl, beams: (fl.beams ?? []).map((b) => ({ ...b, type: null })) })) };
  let r = analyzeFrame(f), best = null;
  const env = new Map();
  const score = (rr) => { const sp = rr.floors.flatMap((a) => a.spans); return { ok: sp.filter((s) => s.ok).length, n: sp.length, cost: sp.reduce((s, x) => s + beamCost(x.type, g) * x.len, 0) }; };
  for (let pass = 0; pass < 5; pass++) {
    const out = autoBeamTypes(r, f.mat, k, g, env);
    if (!out.types.length) break;
    f = { ...f, beamTypes: out.types }; r = analyzeFrame(f);
    const s = score(r);
    if (!best || s.ok > best.s.ok || (s.ok === best.s.ok && s.cost < best.s.cost)) best = { types: out.types, s, unmatched: out.unmatched, big: out.big };
    if (s.ok === s.n) break;
  }
  // repair: the spans still failing get their own type grown in place (stirrups closer / RB6 → RB9 → 2 sets, more bars) — the
  // types hardly change the stiffness then, so this settles in a pass or two
  if (best && best.s.ok < best.s.n) {
    let types = best.types.map((t) => ({ ...t }));
    for (let pass = 0; pass < 3; pass++) {
      f = { ...f, beamTypes: types }; r = analyzeFrame(f);
      const fail = r.floors.flatMap((a) => a.spans).filter((sp) => !sp.ok);
      if (!fail.length) break;
      for (const [ti, sps] of [...new Set(fail.map((sp) => sp.typeIdx))].map((ti) => [ti, fail.filter((sp) => sp.typeIdx === ti)])) {
        const t = types[ti], bar = parseBars(t.top)?.bar ?? "DB 12", grown = designBH(sps.map((sp) => ({ ...sp, vDone: true })), t.b, t.h, bar, f.mat, g, t);
        if (grown) types[ti] = { ...t, ...grown, name: t.name };
      }
    }
    f = { ...f, beamTypes: types }; r = analyzeFrame(f);
    const s = score(r);
    if (s.ok > best.s.ok || (s.ok === best.s.ok && s.cost < best.s.cost)) best = { ...best, types, s };
  }
  // trim (user 2026-11-03: "B3 got RB9 but RB6 passes"): a type was sized for its whole group and for the largest forces of all
  // passes, but in the end only some spans use it — take each type down to what the spans really using it need (stirrups RB6
  // first and the widest spacing, then fewer bars), confirm with a fresh analysis, undo a type whose spans no longer pass
  if (best) {
    let types = best.types.map((t) => ({ ...t }));
    for (let pass = 0; pass < 2; pass++) {
      f = { ...f, beamTypes: types }; r = analyzeFrame(f);
      const sps = r.floors.flatMap((a) => a.spans).map((sp) => ({ ...sp, vDone: true }));
      const trimmed = types.map((t, ti) => { const mine = sps.filter((sp) => sp.typeIdx === ti); return mine.length && mine.every((sp) => sp.ok) ? trimType(t, mine, f.mat, g) : t; });
      f = { ...f, beamTypes: trimmed }; const r2 = analyzeFrame(f);
      const bad = new Set(r2.floors.flatMap((a) => a.spans).filter((sp) => !sp.ok).map((sp) => sp.typeIdx));
      const okNow = r.floors.flatMap((a) => a.spans).filter((sp) => sp.ok).length;
      types = trimmed.map((t, ti) => (bad.has(ti) ? types[ti] : t));
      if (!bad.size && okNow === best.s.ok) { r = r2; break; }
    }
    f = { ...f, beamTypes: types }; r = analyzeFrame(f);
    const s = score(r);
    if (s.ok >= best.s.ok) best = { ...best, types, s };
  }
  if (!best) return null;
  // types no span uses are dropped; the rest named by size (user 2026-11-03): b × h, then depth, then steel → B1, B2, …
  // (all beams are "auto": the analysis picks by section and steel, so the order and the names do not change the result)
  f = { ...f, beamTypes: best.types }; r = analyzeFrame(f);
  const used = new Set(r.floors.flatMap((a) => a.spans).map((sp) => sp.typeIdx));
  const area = (x) => { const b = parseBars(x); return b ? b.n * BARS[b.bar].A : 0; }, steel = (t) => area(t.top) + area(t.bot) + area(t.topX) + area(t.botX);
  const types = best.types.filter((_, i) => used.has(i)).sort((a, b) => a.b * a.h - b.b * b.h || a.h - b.h || steel(a) - steel(b) || beamCost(a, g) - beamCost(b, g))
    .map((t, i) => ({ ...t, name: `B${i + 1}` }));
  return { beamTypes: types, floors: f.floors, ...best.s, unmatched: best.unmatched, big: best.big ?? [], asked: k };
}
