// New-project starter (user 2026-11-16, plan A4): five answers → floors, grid, columns on every grid node, beams on every grid line, slab
// defaults, and an optional roof linked to the top floor. Everything made here is ordinary project data the engineer edits afterwards.
import { analyzeFrame } from "../engine/frame.js";
import { roofFromFrame } from "./roofLink.js";

export const STARTER_DEFAULT = { name: "", storeys: 2, h: 3.0, gbH: 1.5, dx: "4, 4", dy: "3.5, 4", slab: "S", t: 0.12, ground: "GS", roof: "hip", slope: 30, overhang: 0.6 };
export const parseSpans = (s) => String(s).split(/[,\s]+/).map(Number).filter((v) => v > 0);

export function buildStarter(base, emptyRoof, o) {
  const dx = parseSpans(o.dx), dy = parseSpans(o.dy);
  if (!dx.length || !dy.length) return { error: "ใส่ระยะกริดอย่างน้อย 1 ช่วงทั้งแกน X และ Y (เช่น 4, 4)" };
  const grid = { x0: 0, y0: 0, dx, dy, sub: 2, on: true };
  const xs = [0, ...dx.map((_, i) => dx.slice(0, i + 1).reduce((a, b) => a + b, 0))].map((v) => +v.toFixed(3));
  const ys = [0, ...dy.map((_, i) => dy.slice(0, i + 1).reduce((a, b) => a + b, 0))].map((v) => +v.toFixed(3));
  const columns = xs.flatMap((x) => ys.map((y) => [x, y]));
  const beams = [...ys.flatMap((y) => xs.slice(1).map((x, i) => ({ a: [xs[i], y], b: [x, y], type: null }))), ...xs.flatMap((x) => ys.slice(1).map((y, i) => ({ a: [x, ys[i]], b: [x, y], type: null })))];
  const floor = (name, h, kind, t, finish, live) => ({ name, h, t, finish, live, slabKind: kind, grid: { ...grid }, columns: columns.map((p) => [...p]), beams: beams.map((b) => ({ ...b, a: [...b.a], b: [...b.b] })),
    panels: {}, walls: [], cants: [], stairs: [], lineLoads: [], pointLoads: [] });
  const n = Math.max(1, Math.min(4, Math.round(o.storeys)));
  // ground beam level (columns from the footing), then each upper floor, then the roof beams; the ground floor slab on soil (GS) or carried
  const floors = [floor("คานคอดิน", o.gbH, o.ground, o.ground === "GS" ? 0.1 : o.t, 100, 200)];
  for (let i = 2; i <= n; i++) floors.push(floor(`ชั้น ${i}`, o.h, o.slab, o.t, 100, 200));
  floors.push(floor("คานหลังคา", o.h, "S", 0, 0, 0));
  // the roof-beam level carries no slab (t 0, no finish / live — as the default project) unless the engineer adds one
  let frame = { ...base, floors, cur: 0, colPick: {}, roofLink: undefined, roofPoints: [] };
  let roof = emptyRoof;
  if (o.roof !== "none") {
    const res = analyzeFrame(frame);
    const r = roofFromFrame(frame, res);
    if (!r.error) {
      const pts = r.pts, L = (i) => Math.hypot(pts[(i + 1) % pts.length][0] - pts[i][0], pts[(i + 1) % pts.length][1] - pts[i][1]);
      const short = pts.length === 4 ? Math.min(L(0), L(1)) : 0;
      const edges = pts.map((_, i) => ({ type: o.roof === "gable" && pts.length === 4 && Math.abs(L(i) - short) < 1e-6 ? "gable" : "hip" }));
      const beamsG = (frame.floors[r.linkFloor]?.beams ?? []).map((b) => ({ a: b.a, b: b.b, w: 0.2 }));
      roof = { ...emptyRoof, pts, edges, slope: o.slope, overhang: o.overhang, H: r.H, columns: r.columns, grid: r.grid, fromFrame: true, guide: { outline: pts, beams: beamsG } };
      frame = { ...frame, roofLink: { on: true, floor: r.linkFloor } };
    }
  }
  return { frame, roof };
}
