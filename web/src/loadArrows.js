// Load arrows of one floor for the 3D view (user 2026-11-21 "ลูกศรน้ำหนักในภาพ 3D (ผนัง น้ำหนักจุด น้ำหนักจากหลังคา)"): the loads exactly as
// the floor analysis took them — wall weight per metre (an.walls[i].q, incl. the height added by a lowered beam / slab), drawn line loads
// (floor.lineLoads q), drawn point loads (floor.pointLoads P) and the roof bearing points linked to this floor (frame.roofPoints, the
// same list the analysis appends to the point loads). Pure data (no three.js) so a node check can compare the totals with the engine.
// Plan coordinates [x, y]; z = height of the arrow tip above the floor level (a wall on a lowered beam starts lower).

import { wallsOf } from "../engine/floor.js";

const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);

// base of wall i of floor analysis `an` (m from the floor level): top of the lowest beam part it stands on, else its slab panel's level
export function wallBase(an, i) {
  const r = an?.walls?.[i], lns = (r?.on ?? []).map((o) => an?.lines?.find((l) => l.id === o.line)).filter(Boolean);
  const tops = lns.flatMap((ln) => (ln.parts ?? []).map((pt) => an?.levels?.beams?.[pt.i]?.top).filter(Number.isFinite));
  return tops.length ? Math.min(...tops) : r?.panel ? an?.panels?.find((p) => p.key === r.panel)?.dz ?? 0 : 0;
}

// { walls: [{ a, b, q, z, name, to }], lines: [{ a, b, q, z, name, to }], points: [{ p, P, z, name, to }], roof: [{ p, P, z, to }], totals }
// `to` = what carries it (beam / slab / column / cantilever / nothing) in words, for the label tooltip
export function loadArrowData(frame, an, k, walls = null) {
  const fl = frame.floors[k] ?? {}, out = { walls: [], lines: [], points: [], roof: [] };
  if (!an) return { ...out, totals: { walls: 0, lines: 0, points: 0, roof: 0 } };
  const onTxt = (o) => (o === "beam" ? "ลงคาน" : o === "panel" ? "กระจายลงพื้น" : o === "column" ? "ลงเสาตรง" : o === "cant" ? "ปลายพื้นยื่น → คานริม" : "ไม่มีอะไรรับ");
  (walls ?? wallsOf(fl)).forEach((w, i) => {
    const r = an.walls?.[i]; if (!r || !(r.q > 0)) return;
    out.walls.push({ a: w.a, b: w.b, q: r.q, z: wallBase(an, i), name: `ผนัง ${i + 1}`, to: r.on?.length ? "ลงคาน" : r.panel ? "กระจายลงพื้น" : r.ground ? "บนพื้นวางบนดิน (ไม่เข้าโครงสร้าง)" : "ไม่มีอะไรรับ" });
  });
  (fl.lineLoads ?? []).forEach((l, i) => { if (l.q > 0) out.lines.push({ a: l.a, b: l.b, q: l.q, z: 0, name: l.name || `น้ำหนักเส้น ${i + 1}`, to: onTxt(an.lineLoads?.[i]?.on) }); });
  const nOwn = (fl.pointLoads ?? []).length;
  (fl.pointLoads ?? []).forEach((pl, i) => { if (pl.P > 0) out.points.push({ p: pl.p, P: pl.P, z: 0, name: pl.name || `น้ำหนักจุด ${i + 1}`, to: onTxt(an.pointLoads?.[i]?.on) }); });
  // roof points: the analysis appended frame.roofPoints after the floor's own point loads (frame.js gravity) — same order here
  if (frame.roofLink?.on && frame.roofLink.floor === k) // exactly the condition of frame.js gravity()
    (frame.roofPoints ?? []).forEach((rp, j) => { if (rp.P > 0) out.roof.push({ p: rp.p, P: rp.P, z: 0, name: rp.name || "หลังคา", to: onTxt(an.pointLoads?.[nOwn + j]?.on) }); });
  const totals = {
    walls: out.walls.reduce((s, x) => s + x.q * len(x.a, x.b), 0), lines: out.lines.reduce((s, x) => s + x.q * len(x.a, x.b), 0),
    points: out.points.reduce((s, x) => s + x.P, 0), roof: out.roof.reduce((s, x) => s + x.P, 0),
  };
  return { ...out, totals };
}

// arrow tips along a distributed load: one every ~0.5 m (at least at both ends)
export function alongPoints(a, b, step = 0.5) {
  const L = len(a, b), n = Math.max(1, Math.round(L / step));
  return Array.from({ length: n + 1 }, (_, j) => [a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n]);
}
