// Where a warning is (user 2026-11-04: pointing at a warning should flash the place on the plan and in 3D).
// Warnings are text: "<floor name>: … แนว 5 … (6.70, 1.00) … ผนัง 7 … บันได 1 … คาน 3/4 …". The floor comes from the name prefix,
// points from "(x, y)", segments from beam lines / walls / stairs / drawn beams named in the text. → { floor, p, segs, bad } | null
import { wallsOf } from "../engine/floor.js";
export function locateWarning(w, frame, res) {
  const floors = frame.floors ?? [];
  let k = floors.map((f, i) => [f.name, i]).filter(([n]) => n && w.startsWith(`${n}:`)).sort((a, b) => b[0].length - a[0].length)[0]?.[1];
  if (k === undefined) { const m = w.match(/\(ชั้น ([^)]+)\)/); if (m) k = floors.findIndex((f) => f.name.startsWith(m[1].split(' ')[0] === 'ชั้น' ? m[1] : `ชั้น ${m[1]}`) || f.name === m[1]); if (k < 0) k = undefined; }
  const fl = floors[k], an = res?.floors?.[k], body = k === undefined ? w : w.slice(floors[k].name.length + 1);
  const pts = [...body.matchAll(/\((-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/g), ...w.matchAll(/เสา\s*(-?\d+\.\d+),\s*(-?\d+\.\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]), segs = [];
  if (fl) {
    // "แนว 5", "แนวคาน 5", "แนว 5/6, 8/17", "แนว 6, 7 … แนว 5"
    for (const m of body.matchAll(/แนว(?:คาน)?\s*((?:\d+(?:\/\d+)?(?:,\s*)?)+)/g)) for (const id of m[1].split(/[,/\s]+/).filter(Boolean)) {
      const ln = an?.lines?.find((l) => l.id === Number(id) - 1); if (ln) segs.push([ln.A, ln.B]);
    }
    for (const m of body.matchAll(/ผนัง\s*(\d+)/g)) { const x = wallsOf(fl)[Number(m[1]) - 1]; if (x) segs.push([x.a, x.b]); }
    for (const m of body.matchAll(/คาน\s*(\d+)\/(\d+)/g)) for (const i of [m[1], m[2]]) { const b = fl.beams?.[Number(i) - 1]; if (b) segs.push([b.a, b.b]); }
    for (const m of body.matchAll(/บันได\s*(\d+)/g)) { const st = fl.stairs?.[Number(m[1]) - 1]; if (st) { const [a, b] = [st.a, st.b], c = [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]]; c.forEach((p, i) => segs.push([p, c[(i + 1) % 4]])); } }
  }
  if (!pts.length && !segs.length) return k === undefined ? null : { floor: k, p: null, segs: [], bad: true };
  const p = pts[0] ?? [(segs[0][0][0] + segs[0][1][0]) / 2, (segs[0][0][1] + segs[0][1][1]) / 2];
  return { floor: k, p, pts, segs, bad: true };
}
