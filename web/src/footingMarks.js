// Footing marks F1, F2 … (shared by the footing plan, the report, the DXF sheets) — plain JS so node scripts can use it.
import { fmt } from "./beamModel.js";

export const COLORS = ["#3e63dd", "#e5484d", "#30a46c", "#f76b15", "#8e4ec6", "#0e9384", "#d6409f", "#a16207", "#0284c7", "#65a30d"];
// marks F1, F2 … — the largest footing is F1 (as on the drawings); same size / piles / bars = same mark
export function footingMarks(footings) {
  // one mark = one footing (size, piles, thickness, bars). A footing of a user type keeps the type's name only while it has that
  // type's size; a footing reshaped / resized away from it (e.g. a rectangle next to a neighbour) gets the next free F number
  // (user 2026-11-04: "ถ้าเป็น F1 เหมือนกัน ขนาดก็ควรจะเท่ากัน … ไม่ได้ก็ทำ F อื่น")
  const size = (f) => `${f.kind ?? "pile"}|${f.n}|${f.pile}|${fmt(f.r?.Bx ?? 0, 2)}x${fmt(f.r?.By ?? 0, 2)}|${fmt(f.inp?.t ?? 0, 2)}|${f.r?.longText ?? f.inp?.sLong ?? ""}`;
  const groups = [...new Map(footings.map((f) => [size(f), f])).entries()].sort((a, b) => (b[1].r?.Bx ?? 0) * (b[1].r?.By ?? 0) - (a[1].r?.Bx ?? 0) * (a[1].r?.By ?? 0));
  const names = new Map(), used = new Set();
  // a type name goes to the group of that type with the most footings (its own size); other groups of that type get new names
  const byType = new Map(); for (const [k, f] of groups) if (f.type && !f.reshaped) { const n = footings.filter((x) => size(x) === k).length; if (!byType.has(f.type) || n > byType.get(f.type).n) byType.set(f.type, { k, n }); }
  for (const [t, { k }] of byType) { names.set(k, t); used.add(t); }
  let next = 1; const free = () => { while (used.has(`F${next}`)) next++; used.add(`F${next}`); return `F${next}`; };
  for (const [k] of groups) if (!names.has(k)) names.set(k, free());
  return { mark: (f) => names.get(size(f)), list: [...new Set(names.values())], color: (f) => COLORS[[...names.keys()].indexOf(size(f)) % COLORS.length] };
}

