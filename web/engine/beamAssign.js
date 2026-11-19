// Beam type assignment (user 2026-11-19: "แก้เหล็ก B5 แล้วคานเคลื่อนไป B6 หมด" · "อยากเลือกเองว่าคานไหนเป็นเบอร์นี้"):
// - a drawn beam is AUTO (type null: the analysis picks the lightest passing type every run), HAND-SET (type = index, set by the user)
//   or LOCKED (type = index + autoLock: the type the automatic choice gave, frozen so editing a type never moves beams to another one)
// - types made by hand (t.manual) are never picked by the automatic choice (floor.js autoOrder), only where the user puts them
// - names never shift by themselves (deleting a type keeps the others' names); renumberTypes does it on request
// Pure functions on the project frame; analyzeFrame only where a result is needed.
import { analyzeFrame } from "./frame.js";

const KEYS = ["b", "h", "top", "bot", "topX", "botX", "st", "stSets", "sSup", "sMid"];
export const typeKey = (t) => KEYS.map((k) => String(t?.[k] ?? (k === "stSets" ? 1 : ""))).join("|");
const mapBeams = (frame, fn) => frame.floors.map((fl, k) => ({ ...fl, beams: (fl.beams ?? []).map((b, m) => fn(b, k, m)) }));
const strip = (b) => { const { autoLock, ...rest } = b; return rest; }; // eslint-disable-line no-unused-vars

export const beamMode = (b) => (b.type == null ? "auto" : b.autoLock ? "lock" : "hand");
export function beamCounts(frame) {
  const c = { auto: 0, lock: 0, hand: 0 };
  for (const fl of frame.floors) for (const b of fl.beams ?? []) c[beamMode(b)]++;
  return c;
}

// every AUTO beam gets the type it has in the result res (of this same frame) and is marked locked; hand-set beams stay as they are.
// The analysis then finds exactly the types it found before (fixed = what auto chose), so no result changes.
export function lockBeams(frame, res) {
  let n = 0;
  const floors = mapBeams(frame, (b, k, m) => {
    if (b.type != null) return b;
    const t = res?.floors?.[k]?.beamTypeOf?.[m];
    if (t == null || !frame.beamTypes[t]) return b;
    n++; return { ...b, type: t, autoLock: true };
  });
  return { floors, n };
}

// locked beams back to auto (hand-set beams keep their type)
export function unlockBeams(frame) {
  let n = 0;
  const floors = mapBeams(frame, (b) => (b.autoLock ? (n++, { ...strip(b), type: null }) : b));
  return { floors, n };
}

// set type ti (index, or null = auto) on beams idxs of floor k — always as the user's own choice (no autoLock)
export function assignBeams(frame, k, idxs, ti) {
  const set = new Set(idxs);
  return mapBeams(frame, (b, kk, m) => (kk === k && set.has(m) ? { ...strip(b), type: ti } : b));
}

// next free B<n> name
export function nextTypeName(types) {
  const used = new Set(types.map((t) => t.name));
  let n = types.length + 1; while (used.has(`B${n}`)) n++;
  for (let i = 1; i < n; i++) if (!used.has(`B${i}`)) return `B${i}`;
  return `B${n}`;
}

// delete type i: beams on it go back to auto, later indices shift down, OTHER NAMES STAY (was: B<n> renumbered → B6 became B5)
export function deleteBeamType(frame, i) {
  const beamTypes = frame.beamTypes.filter((_, j) => j !== i);
  const floors = mapBeams(frame, (b) => (b.type == null ? b : b.type === i ? { ...strip(b), type: null } : b.type > i ? { ...b, type: b.type - 1 } : b));
  return { beamTypes, floors };
}

// on request: types sorted by size (b·h, h, then the list order) and B<n> names renumbered in that order (custom names kept); beams follow
export function renumberTypes(frame) {
  const idx = frame.beamTypes.map((t, i) => ({ t, i })).sort((x, y) => x.t.b * x.t.h - y.t.b * y.t.h || x.t.h - y.t.h || x.i - y.i);
  const map = new Map(idx.map((o, j) => [o.i, j]));
  const taken = new Set(frame.beamTypes.filter((t) => !/^B\d+$/.test(t.name ?? "")).map((t) => t.name));
  let n = 0; const name = () => { do n++; while (taken.has(`B${n}`)); return `B${n}`; };
  const beamTypes = idx.map(({ t }) => (/^B\d+$/.test(t.name ?? "") ? { ...t, name: name() } : t));
  const floors = mapBeams(frame, (b) => (b.type == null ? b : { ...b, type: map.get(b.type) }));
  return { beamTypes, floors };
}

// After the automatic type generator (engine/beamTypes.js generateBeamTypes, which re-types every beam): beams the USER set by hand
// before keep their type (the same section and bars of a generated type → that type, else their type is added to the list), every
// other beam is locked to the type the analysis gives it, generated types no beam uses are dropped, generated names skip the names
// of the kept types. Returns { beamTypes, floors, res } (res = its analysis; type indices there are before dropping unused types).
export function finalizeGenerated(frame, g) {
  const sameShape = g.floors.length === frame.floors.length && g.floors.every((fl, k) => (fl.beams ?? []).length === (frame.floors[k].beams ?? []).length);
  let types = g.beamTypes.map((t) => ({ ...t })), floors = g.floors;
  const nGen = types.length, kept = new Map(); // old index → new index
  if (sameShape) {
    floors = g.floors.map((fl, k) => ({ ...fl, beams: (fl.beams ?? []).map((b, m) => {
      const ob = frame.floors[k].beams[m];
      if (ob.type == null || ob.autoLock || !frame.beamTypes[ob.type]) return { ...strip(b), type: null };
      if (!kept.has(ob.type)) {
        const old = frame.beamTypes[ob.type], j = types.findIndex((t) => typeKey(t) === typeKey(old));
        kept.set(ob.type, j >= 0 ? j : types.push({ ...old }) - 1);
      }
      return { ...strip(b), type: kept.get(ob.type) };
    }) }));
  }
  let f = { ...frame, beamTypes: types, floors };
  let res = analyzeFrame(f);
  f = { ...f, floors: lockBeams(f, res).floors };
  // drop generated types no beam uses (kept / hand-made ones stay even when unused here)
  const used = new Set(f.floors.flatMap((fl) => (fl.beams ?? []).map((b) => b.type)).filter((x) => x != null));
  const keepIdx = types.map((_, i) => i).filter((i) => i >= nGen || used.has(i) || [...kept.values()].includes(i));
  if (keepIdx.length < types.length) {
    const map = new Map(keepIdx.map((i, j) => [i, j]));
    types = keepIdx.map((i) => types[i]);
    f = { ...f, beamTypes: types, floors: mapBeams(f, (b) => (b.type == null ? b : { ...b, type: map.get(b.type) })) };
  }
  // generated names B1, B2 … in order, skipping the names of the kept types added to the list
  const genIdx = new Set(keepIdx.map((i, j) => (i < nGen ? j : -1)).filter((j) => j >= 0));
  const taken = new Set(types.filter((_, j) => !genIdx.has(j)).map((t) => t.name));
  let n = 0; types = types.map((t, j) => { if (!genIdx.has(j) || !/^B\d+$/.test(t.name ?? "")) return t; do n++; while (taken.has(`B${n}`)); return { ...t, name: `B${n}` }; });
  return { beamTypes: types, floors: f.floors, res }; // res: the analysis before unused types were dropped (same members and checks)
}
