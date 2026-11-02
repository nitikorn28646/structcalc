// Model of the Yasothon house (drawings EN-01…EN-17, Good Home Builder, 27/10/2569) → web/public/projects/yasothon.json.
// Grid: x A 0 · B 3.5 · C 6.0 · D 6.9 · E 10.5 · F 14.0; y 6 = 0 · 5 = 1.0 · 4 = 2.4 · 3 = 3.4 · 2 = 6.9 · 1 = 7.9 (m).
// Usage: node cli/models/yasothon.mjs → writes the project and prints an analysis summary.
import { writeFileSync, mkdirSync } from "node:fs";
import { analyzeFloor, DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WALL_TYPES } from "../../web/engine/floor.js";
import { analyzeFrame } from "../../web/engine/frame.js";

const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const B = (a, b, wallH = 0) => ({ a, b, type: null, wallH });
const split = (list) => ({ beams: list.map(({ a, b }) => ({ a, b, type: null })), walls: list.filter((x) => x.wallH > 0).map((x) => ({ a: x.a, b: x.b, kind: "brick", h: x.wallH, open: x.open ?? 15, layers: 1 })) });
const COLS = [[0, 6.9], [0, 2.4], [3.5, 7.9], [3.5, 6.9], [3.5, 2.4], [6, 7.9], [6, 3.4], [6, 2.4], [10.5, 7.9], [10.5, 3.4], [10.5, 0], [14, 7.9], [14, 3.4], [14, 0]];

// ---- คานคอดิน +0.40 (EN-03): ground-floor walls 3.20 m on the beams, slabs on ground (GS) except the bathroom S1
const W1 = 3.2;
const gb = split([
  B([3.5, 7.9], [6, 7.9], W1), B([6, 7.9], [10.5, 7.9], W1), B([10.5, 7.9], [14, 7.9], W1),
  B([0, 6.9], [3.5, 6.9], W1), B([3.5, 6.9], [6, 6.9], W1), B([0, 5.4], [3.5, 5.4], W1), B([2.6, 5.4], [2.6, 6.9], W1),
  B([3.5, 5.0], [6, 5.0]), B([4.75, 5.0], [4.75, 6.9]),
  B([0, 2.4], [0, 6.9], W1), B([3.5, 2.4], [3.5, 6.9], W1), B([3.5, 6.9], [3.5, 7.9], W1), B([6, 2.4], [6, 3.4], W1), B([6, 3.4], [6, 7.9], W1),
  B([10.5, 3.4], [10.5, 7.9], W1), B([14, 3.4], [14, 7.9], W1), B([10.5, 0], [10.5, 3.4]), B([14, 0], [14, 3.4]),
  B([6, 3.4], [10.5, 3.4], W1), B([10.5, 3.4], [14, 3.4], W1), B([0, 2.4], [3.5, 2.4], W1), B([3.5, 2.4], [6, 2.4], W1), B([10.5, 0], [14, 0]),
  B([6, 2.4], [6, 1.8]), B([6, 1.8], [6.9, 1.0]), B([6.9, 1.0], [10.5, 1.0]), // porch edge: curved beam taken as its chord
]);
const fl0 = { name: "คานคอดิน +0.40", h: 0.8, t: 0.1, finish: 100, live: 200, grid: { x0: 0, y0: 0, dx: [3.5, 2.5, 0.9, 3.6, 3.5], dy: [1, 1.4, 1, 3.5, 1], sub: 1, on: true },
  columns: [...COLS, [6.9, 1.0]], ...gb, cants: [], stairs: [], lineLoads: [], pointLoads: [], panels: {} };

// ---- ชั้น 2 +4.00 (EN-04): precast planks (PS) with their directions, S1 wet areas / terrace, walls 3.0 m up to the roof plates
const W2 = 3.0;
const f2 = split([
  B([3.5, 7.9], [6, 7.9], W2), B([6, 7.9], [10.5, 7.9], W2), B([10.5, 8.5], [14, 8.5], W2),
  B([10.5, 0], [10.5, 3.4]), B([10.5, 3.4], [10.5, 8.5]), B([14, 3.4], [14, 8.5]),
  B([0, 6.9], [3.5, 6.9], W2), B([10.5, 6.9], [14, 6.9], W2), B([11.7, 6.9], [11.7, 8.5], W2),
  B([0, 5.4], [3.5, 5.4], W2), B([2.6, 5.4], [2.6, 6.9], W2),
  B([0, 2.4], [0, 6.9], W2), B([3.5, 2.4], [3.5, 6.9], W2), B([3.5, 6.9], [3.5, 7.9], W2),
  B([0, 2.4], [3.5, 2.4], W2), B([3.5, 2.4], [6, 2.4], W2),
  B([3.5, 4.42], [6, 4.42]), B([3.5, 3.4], [6, 3.4]),
  B([6, 1.8], [6, 7.9]), B([6, 1.8], [6.8, 1.0]), B([6.8, 1.0], [10.5, 1.0]),
  B([6.9, 1.0], [6.9, 3.4]), B([9.6, 1.0], [9.6, 3.4]), B([9.6, 3.4], [9.6, 7.9], W2),
  B([6, 3.4], [10.5, 3.4], W2), B([10.5, 3.4], [14, 3.4], W2),
]);
f2.walls.push({ a: [6, 3.4], b: [6, 7.9], kind: "brick", h: W2, open: 10, layers: 1 }, { a: [10.5, 3.4], b: [10.5, 6.9], kind: "brick", h: W2, open: 10, layers: 1 }, { a: [10.5, 7.9], b: [10.5, 8.5], kind: "brick", h: W2, open: 0, layers: 1 }, { a: [14, 3.4], b: [14, 8.5], kind: "brick", h: W2, open: 15, layers: 1 });
const fl1 = { name: "ชั้น 2 +4.00", h: 3.6, t: 0.1, finish: 100, live: 200, grid: fl0.grid, columns: COLS, ...f2,
  cants: [{ a: [0, 2.4], b: [0, 6.9], L: 0.4, side: -1 }, { a: [0, 2.4], b: [3.5, 2.4], L: 0.4, side: 1 }],
  stairs: [{ a: [3.5, 4.42], b: [6, 7.9], up: "-y", kind: "landing", t: 0.18, riser: 0.178, tread: 0.25, finish: 100, live: 300, landingL: 0.8, landingTo: "this" }],
  lineLoads: [{ a: [6.8, 1.0], b: [10.5, 1.0], q: 100, name: "ราวกันตกระเบียง" }, { a: [6, 1.8], b: [6.8, 1.0], q: 100, name: "ราวกันตกระเบียง" }],
  pointLoads: [], panels: {} };

// ---- คานหลังคา +6.60 (EN-05): roof plates bear on the column tops; one beam B1 with the 0.5 m canopy slab S2
const fl2 = { name: "คานหลังคา +6.60", h: 2.6, t: 0.1, finish: 50, live: 100, grid: fl0.grid, columns: COLS, beams: [{ a: [3.5, 2.4], b: [6, 2.4], type: null }], walls: [],
  cants: [{ a: [3.5, 2.4], b: [6, 2.4], L: 0.5, side: 1, t: 0.1, finish: 50, live: 100 }], stairs: [], lineLoads: [],
  // porch roof (hip, concrete tile ≈ 16 m² × 125 kg/m²) on its four columns; main roof loads are added from the roof module in the browser
  pointLoads: [...[[10.5, 0], [14, 0], [10.5, 3.4], [14, 3.4]].map((p) => ({ p, P: 500, name: "หลังคาพอร์ช" })),
    // main roof: wall-plate reactions on the column tops, from the roof module ("ดึงแรงจากโครงหลังคา", 31/10/2569)
    ...[[[0, 2.4], 1103], [[3.5, 2.4], 861], [[6, 2.4], 503], [[6, 3.4], 777], [[10.5, 3.4], 1123], [[14, 3.4], 1103], [[14, 7.9], 1103], [[10.5, 7.9], 1123], [[6, 7.9], 1008], [[3.5, 7.9], 503], [[3.5, 6.9], 630], [[0, 6.9], 1103]]
      .map(([p, P]) => ({ p, P, name: "หลังคา" }))], panels: {} };

// panel kinds by drawing (key = panel centroid): set after the panels are found
const kinds = (fl, rules) => {
  const an = analyzeFloor(fl, DEFAULT_BEAM_TYPES, mat, [], DEFAULT_WALL_TYPES);
  for (const p of an.panels) {
    const c = p.P.reduce((s, q) => [s[0] + q[0] / p.P.length, s[1] + q[1] / p.P.length], [0, 0]);
    const r = rules.find(([x0, y0, x1, y1]) => c[0] > x0 && c[0] < x1 && c[1] > y0 && c[1] < y1);
    fl.panels[p.key] = r ? r[4] : { kind: "S" };
  }
};
kinds(fl0, [[0, 5.4, 2.6, 6.9, { kind: "S", t: 0.1 }], [-1, -1, 15, 9, { kind: "GS" }]]);
kinds(fl1, [
  [0, 2.4, 3.5, 5.4, { kind: "PS", dir: "y" }], [2.6, 5.4, 3.5, 6.9, { kind: "PS", dir: "y" }], [0, 5.4, 2.6, 6.9, { kind: "S", t: 0.1 }],
  [3.5, 3.4, 6, 4.42, { kind: "PS", dir: "x" }], [3.5, 2.4, 6, 3.4, { kind: "S", t: 0.1 }],
  [6, 3.4, 9.6, 7.9, { kind: "PS", dir: "x" }], [9.6, 3.4, 10.5, 7.9, { kind: "PS", dir: "x" }], [10.5, 3.4, 14, 6.9, { kind: "PS", dir: "x" }],
  [10.5, 6.9, 11.7, 8.5, { kind: "PS", dir: "y" }], [11.7, 6.9, 14, 8.5, { kind: "S", t: 0.1 }],
  [6, 1, 10.5, 3.4, { kind: "S", t: 0.1 }],
]);

// B1–B6 = the drawing's schedule; B7/B8 added for the floor-2 spans that B1–B6 cannot carry (E/F lines under the cantilevered box, C line, stair hall)
const T = (name, b, h, top, bot, topX, botX, st, sSup, sMid) => ({ name, b, h, top, bot, topX, botX, st, sSup, sMid });
const beamTypes = [...DEFAULT_BEAM_TYPES, T("B7", 0.2, 0.5, "3-DB16", "3-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15), T("B8", 0.2, 0.6, "2-DB16", "2-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15),
  T("B9", 0.2, 0.6, "3-DB16", "3-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15)]; // B9: line B short span over the stair (envelope M− 5.9 t-m)
// C1 = drawing schedule (ties @0.20 fail 16db); C2 = C1 with ties @0.15; C3 = corner columns that take frame moments
const CT = (level, B, n, bar, s) => ({ level, Bx: B, By: B, n, mainBar: bar, tieBar: "RB 6", s });
const colTypes = [...DEFAULT_COLUMN_TYPES, { name: "C2", levels: [CT("ตอม่อ", 30, 8, "DB 12", 0.15), CT("ชั้น 1", 20, 6, "DB 12", 0.15), CT("ชั้น 2", 20, 4, "DB 12", 0.15)] },
  { name: "C3", levels: [CT("ตอม่อ", 30, 8, "DB 20", 0.15), CT("ชั้น 1", 25, 8, "DB 16", 0.15), CT("ชั้น 2", 25, 8, "DB 16", 0.15)] }];
const frame = { frameNo: "บ้านยโสธร", mat, cur: 1, floors: [fl0, fl1, fl2], beamTypes, colTypes, colPick: {}, analysis: "envelope", baseFixity: "pinned", wallTypes: DEFAULT_WALL_TYPES };
// roof (EN-09/EN-11): hip roof, concrete tiles, plates on the 12 house columns
const pts = [[0, 2.4], [6, 2.4], [6, 3.4], [14, 3.4], [14, 7.9], [3.5, 7.9], [3.5, 6.9], [0, 6.9]];
const roof = { roofNo: "R1", slope: 30, overhang: 1.2, H: 7.25, snap: 0.5, supports: null, pts, edges: pts.map(() => ({ type: "hip" })),
  frame: { rafterSp: 1.0, purlinSp: 0.32, maxSpan: 2.5, postSp: 2.5 },
  columns: COLS.filter(([, y]) => y > 0), plates: pts.map((a, i) => ({ a, b: pts[(i + 1) % pts.length] })), dang: null,
  innerPlates: [[[6, 3.4], [6, 7.9]], [[3.5, 6.9], [3.5, 2.4]], [[3.75, 7.9], [3.75, 2.4]], [[2.25, 6.9], [2.25, 2.4]], [[11.75, 7.9], [11.75, 3.4]], [[9.75, 7.9], [9.75, 3.4]], [[7.75, 7.9], [7.75, 3.4]], [[5.75, 7.9], [5.75, 2.4]], [[5.25, 7.9], [5.25, 2.4]], [[4.25, 7.9], [4.25, 2.4]]].map(([a, b]) => ({ a, b })), // auto (อะเสรับดั้ง)
  design: { roofing: "cpac", battenW: 0.6, minT: 2.3, minSec: "100x50x20x2.3", live: 30, wind: 50, extra: 15, grade: "Fe-24", E: 2100000, sagRows: 1, rodFy: 2400, plateSpan: 4,
    pick: { purlin: "batten", rafter: "auto:C", hip: "auto:C", ridge: "auto:C", support: "auto:C", plate: "auto:C", post: "auto:C" }, counts: { hip: 2, ridge: 2, support: 2, plate: 2, post: 2 } } };
const project = { app: "StructCalc", version: 1, beam: { project: { name: "บ้านพักอาศัย คสล. 2 ชั้น — คุณหนูเลียง สีลาทอง", owner: "คุณหนูเลียง สีลาทอง", location: "หมู่ 11 ต.กระจาย อ.ป่าติ้ว จ.ยโสธร", engineer: "", license: "", beamNo: "B1", floor: "", date: "2026-10-31" } }, roof, frame };
mkdirSync("web/public/projects", { recursive: true });
writeFileSync("web/public/projects/yasothon.json", JSON.stringify(project, null, 1));

const res = analyzeFrame(frame);
for (const [k, a] of res.floors.entries()) {
  console.log(`${frame.floors[k].name}: panels ${a.panels.length} (${a.panels.map((p) => p.stairWell ? "ST" : p.st + (p.dir ?? "")).join(" ")}) · lines ${a.lines.length} · spans ${a.spans.length} NG ${a.spans.filter((s) => !s.ok).length} · groups t ${Object.entries(a.groups).map(([g, v]) => `${g} ${(v / 1000).toFixed(1)}`).join(" ")}`);
  for (const s of a.spans.filter((s) => !s.ok)) console.log(`   NG ${s.id} L${s.len.toFixed(2)} ${s.kind} ${frame.beamTypes[s.typeIdx].name} M+${s.Mpos.toFixed(0)} M-${s.Mneg.toFixed(0)} V${s.V.toFixed(0)} Mt${(s.Mt ?? 0).toFixed(0)} ${s.check.error ?? ""}`);
}
console.log(`columns NG ${res.columns.filter((c) => !c.ok).length}/${res.columns.length} · footings ${res.footings.map((f) => `${f.n}×${f.pile}`).join(" ")} · base ΣP ${(res.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) / 1000).toFixed(1)} t`);
console.log(`warnings:\n  ${res.warnings.join("\n  ")}`);
