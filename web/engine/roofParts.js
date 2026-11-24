// Multi-level roofs (user 2026-11-24 "หลังคาหลายระดับ — ชายคาสูงต่างกัน"): a roof is one or more PARTS (ผืน), each with its own outline,
// edge types, slope, overhang, wall-plate level H, plates, columns, ดั้ง, สะพาน and the structure floor it bears on. Everything else
// (rafter / purlin spacing, design data, grid, guide) is shared.
// Storage: part 1 = the roof object itself (old files are a one-part roof, results identical); parts 2… = roof.parts[].
// An edge of type "wall" is where a lower part abuts the higher wall of another part: no overhang, the planes are cut on the wall
// line, the rafters end on a wall plate fixed to that wall (roofGeometry / designRoof), its load goes down to the columns / beams there.

export const PART_KEYS = ["pts", "edges", "slope", "overhang", "H", "plates", "innerPlates", "columns", "dang", "supports", "name", "linkFloor", "plateDiv"];

// every part as a full roof object (shared keys from the roof, own keys from the part)
export function partsOf(roof) {
  const extra = roof?.parts ?? [];
  const main = { ...roof, parts: undefined, partIdx: 0 };
  return [main, ...extra.map((p, i) => ({ ...roof, parts: undefined, ...Object.fromEntries(PART_KEYS.map((k) => [k, p[k] ?? (k === "dang" || k === "supports" || k === "linkFloor" ? null : roof[k])])), dang: p.dang ?? null, supports: p.supports ?? null, linkFloor: p.linkFloor ?? null, partIdx: i + 1 }))];
}
export const partName = (roof, i) => (i === 0 ? roof?.name : roof?.parts?.[i - 1]?.name) || `ผืน ${i + 1}`;

// the roof object a board edits for part `cur` (shared keys as they are)
export const partView = (roof, cur) => (cur > 0 && roof?.parts?.[cur - 1] ? partsOf(roof)[cur] : roof);

// write key k of part `cur`: part 1 and shared keys at the top level, own keys of parts 2… inside roof.parts (functional update so
// several writes in one event all land)
export function partSetter(set, cur) {
  return (k, v) => {
    if (cur === 0 || !PART_KEYS.includes(k)) return set(k, v);
    set("parts", (ps = []) => ps.map((p, i) => (i === cur - 1 ? { ...p, [k]: typeof v === "function" ? v(p[k]) : v } : p)));
  };
}

// new part: a rectangle beside the bounding box of the others, 1.0 m lower, no overhang problems
export function newPart(roof) {
  const all = partsOf(roof).flatMap((p) => p.pts ?? []), xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const x0 = xs.length ? Math.max(...xs) : 0, y0 = ys.length ? Math.min(...ys) : 0, W = 3, D = ys.length ? Math.min(4, Math.max(...ys) - y0) : 4;
  const pts = [[x0, y0], [x0 + W, y0], [x0 + W, y0 + D], [x0, y0 + D]];
  return { name: `ผืน ${(roof.parts?.length ?? 0) + 2}`, pts, edges: [{ type: "hip" }, { type: "hip" }, { type: "hip" }, { type: "wall" }], slope: roof.slope, overhang: roof.overhang,
    H: +((roof.H ?? 3) - 1).toFixed(2), plates: [], innerPlates: [], columns: [], dang: null, supports: null, linkFloor: null };
}

// design data of part i: per-member choices are stored with the part prefix ("P2:plate-1-1"); part 1 has none (old files)
export const partPrefix = (i) => (i === 0 ? "" : `P${i + 1}:`);
export function partDesign(d, i) {
  if (i === 0 || !d) return d;
  const pre = partPrefix(i), strip = (m) => (m ? Object.fromEntries(Object.entries(m).filter(([k]) => k.startsWith(pre)).map(([k, v]) => [k.slice(pre.length), v])) : m);
  return { ...d, memberPick: strip(d.memberPick), memberCount: strip(d.memberCount), memberType: strip(d.memberType), plateDiv: strip(d.plateDiv) };
}
// one result for the whole roof: faces / lines / members of every part together (each tagged with its part), ids / tags / labels of
// parts 2… prefixed, totals added, ok = every part ok. runs[i] = { g, fr, dz } of part i (or { error }).
export function mergeRuns(roof, runs) {
  if (runs.length === 1) return runs[0];
  const err = runs.map((r, i) => (r.error ? `${partName(roof, i)}: ${r.error}` : null)).filter(Boolean);
  const okRuns = runs.map((r, i) => ({ ...r, i })).filter((r) => r.g && r.dz);
  if (!okRuns.length) return { error: err.join(" · ") };
  const main = okRuns[0], tagF = (arr, i) => (arr ?? []).map((x) => ({ ...x, part: i }));
  const pre = (i, s) => (i === 0 ? s : `${partName(roof, i)} · ${s}`);
  const g = { ...main.g, parts: okRuns.map((r) => r.g), faces: okRuns.flatMap((r) => tagF(r.g.faces, r.i)), lines: okRuns.flatMap((r) => tagF(r.g.lines, r.i)),
    V: okRuns.flatMap((r) => r.g.V), top: Math.max(...okRuns.map((r) => r.g.top)), warnings: okRuns.flatMap((r) => (r.g.warnings ?? []).map((w) => pre(r.i, w))) };
  for (const k of ["planArea", "wallArea", "roofArea", "gableArea", "ridge", "hip", "valley", "rake", "eaveLen"]) g[k] = okRuns.reduce((a, r) => a + (r.g[k] ?? 0), 0);
  const fr = { ...main.fr, parts: okRuns.map((r) => r.fr) };
  for (const k of ["rafters", "purlins", "supports", "posts"]) fr[k] = okRuns.flatMap((r) => tagF(r.fr[k], r.i));
  fr.totals = Object.fromEntries(Object.keys(main.fr.totals).map((k) => [k, okRuns.reduce((a, r) => a + (r.fr.totals[k] ?? 0), 0)]));
  fr.maxSpan = Math.max(...okRuns.map((r) => r.fr.maxSpan)); fr.maxCant = Math.max(...okRuns.map((r) => r.fr.maxCant));
  const pid = (i, id) => `${partPrefix(i)}${id}`, ptag = (i, t) => (i === 0 || !t ? t : `${i + 1}·${t}`);
  const members = okRuns.flatMap((r) => r.dz.members.map((m) => (r.i === 0 ? { ...m, part: 0 } : { ...m, part: r.i, id: pid(r.i, m.id), tag: ptag(r.i, m.tag), label: pre(r.i, m.label) })));
  const rows = okRuns.flatMap((r) => r.dz.rows.map((x) => (r.i === 0 ? { ...x, part: 0 } : { ...x, part: r.i, label: pre(r.i, x.label), members: x.members?.map((m) => members.find((q) => q.part === r.i && q.id === pid(r.i, m.id)) ?? m) })));
  const cat = (k) => okRuns.flatMap((r) => (r.dz[k] ?? []).map((x) => (typeof x === "object" && !Array.isArray(x) ? { ...x, part: r.i } : x)));
  const dz = { ...main.dz, parts: okRuns.map((r) => r.dz), rows, members, loose: cat("loose"), bearLoose: cat("bearLoose"), bearDirect: cat("bearDirect"),
    plateLines: okRuns.flatMap((r) => (r.dz.plateLines ?? []).map((l) => ({ ...l, label: pre(r.i, l.label), tags: l.tags?.map((t) => ptag(r.i, t)) }))),
    warnings: [...err, ...okRuns.flatMap((r) => r.dz.warnings.map((w) => pre(r.i, w)))],
    weight: okRuns.reduce((a, r) => a + r.dz.weight, 0), ok: !err.length && okRuns.every((r) => r.dz.ok) };
  return { g, fr, dz, partErrors: err };
}
