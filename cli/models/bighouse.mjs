// Test model: a large 3-storey RC house with many secondary beams (review 2026-11-03, user: "บ้าน 2-3 ชั้น หลังใหญ่ โครงสร้างยากๆ
// คานซอยเยอะ"). 20 × 14 m, L-shaped upper floors, X-crossing and T secondary beams, a missing interior column (transfer beam with a
// column of the floor above standing on it), cantilever balconies, a stair with a landing, walls on beams and on slabs.
// Usage: node cli/models/bighouse.mjs → web/public/projects/_big.json (git-ignored test file) + an analysis summary.
import { writeFileSync, mkdirSync } from "node:fs";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WALL_TYPES } from "../../web/engine/floor.js";
import { analyzeFrame } from "../../web/engine/frame.js";

const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const X = [0, 4, 8, 12, 16, 20], Y = [0, 3.5, 7, 10.5, 14];
const B = (a, b, extra = {}) => ({ a, b, type: null, ...extra });
const grid = (xs, ys, skip = () => false) => {
  const beams = [];
  for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) if (!skip([xs[i], y], [xs[i + 1], y])) beams.push(B([xs[i], y], [xs[i + 1], y]));
  for (const x of xs) for (let i = 0; i + 1 < ys.length; i++) if (!skip([x, ys[i]], [x, ys[i + 1]])) beams.push(B([x, ys[i]], [x, ys[i + 1]]));
  return beams;
};
const nodes = (xs, ys, skip = () => false) => xs.flatMap((x) => ys.map((y) => [x, y])).filter((p) => !skip(p));
// secondary beams: in each 4 × 3.5 bay one along x and one along y crossing at the middle (X, no column), plus a few T beams
const secondaries = (bays) => bays.flatMap(([x0, y0]) => [B([x0 + 2, y0], [x0 + 2, y0 + 3.5]), B([x0, y0 + 1.75], [x0 + 4, y0 + 1.75])]);
const walls = (list, h) => list.map(([a, b]) => ({ a, b, kind: "brick", h, open: 15, layers: 1 }));

// columns: full grid, interior column (8, 7) missing above the ground beams (big living room → transfer girders on ชั้น 2)
const noCol = ([x, y]) => x === 8 && y === 7;
const colsAll = nodes(X, Y), colsUp = nodes(X, Y, noCol);
// upper floors: the L shape — no building in x > 12 for y > 7
const outL = ([x, y]) => x > 12 + 1e-9 && y > 7 + 1e-9;
const skipL = (a, b) => outL([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
const colsL = colsUp.filter((p) => !(p[0] > 12 + 1e-9 && p[1] > 7 + 1e-9));

const perim = [[[0, 0], [20, 0]], [[20, 0], [20, 14]], [[20, 14], [0, 14]], [[0, 14], [0, 0]]];
const fl0 = { name: "คานคอดิน +0.50", h: 1.5, t: 0, finish: 0, live: 0, grid: { x0: 0, y0: 0, dx: [4, 4, 4, 4, 4], dy: [3.5, 3.5, 3.5, 3.5], sub: 1, on: true },
  columns: colsAll, beams: grid(X, Y), walls: walls(perim, 3.0), panels: {}, cants: [], stairs: [], lineLoads: [], pointLoads: [] };
// every ground panel on grade (GS)
const f1beams = [...grid(X, Y), ...secondaries([[0, 0], [4, 0], [12, 0], [16, 0], [0, 10.5], [4, 10.5], [16, 10.5]]),
  B([8, 1.75], [12, 1.75]), B([10, 7], [10, 14]) /* long secondary across two bays (T at both ends, crosses y = 10.5) */];
const fl1 = { name: "ชั้น 2 +4.00", h: 3.5, t: 0.12, finish: 120, live: 200, grid: fl0.grid, columns: colsUp, beams: f1beams,
  walls: [...walls(perim, 2.9), ...walls([[[4, 7], [12, 7]], [[12, 0], [12, 7]]], 2.9)],
  panels: {}, cants: [{ a: [0, 14], b: [8, 14], L: 1.5, side: 1 }], lineLoads: [{ a: [0, 15.5], b: [8, 15.5], q: 100, name: "ราวกันตก" }], pointLoads: [],
  stairs: [{ a: [12, 7], b: [16, 10.5], up: "+y", kind: "landing", t: 0.15, riser: 0.175, tread: 0.25, finish: 100, live: 300, landingL: 1.2, landingTo: "this" }] };
const f2beams = [...grid(X, Y, skipL), ...secondaries([[0, 0], [4, 0], [8, 0], [0, 3.5], [4, 3.5], [8, 3.5], [0, 10.5], [4, 10.5], [8, 10.5]]),
  B([12, 1.75], [20, 1.75]) /* long x secondary through two bays, crosses x = 16 grid beam at a column? no: (16, 1.75) has none */];
const fl2 = { name: "ชั้น 3 +7.20", h: 3.2, t: 0.12, finish: 120, live: 200, grid: fl0.grid, columns: [...colsL, [8, 7]] /* stands on the ชั้น 2 transfer girders */, beams: f2beams,
  walls: [...walls([[[0, 0], [20, 0]], [[20, 0], [20, 7]], [[20, 7], [12, 7]], [[12, 7], [12, 14]], [[12, 14], [0, 14]], [[0, 14], [0, 0]]], 2.7), ...walls([[[2, 3.5], [2, 7]]], 2.7) /* on a slab */],
  panels: {}, cants: [{ a: [20, 0], b: [20, 7], L: 1.2, side: 1 }], lineLoads: [], pointLoads: [], stairs: [] };
const fl3 = { name: "คานหลังคา +10.20", h: 3.0, t: 0, finish: 0, live: 0, grid: fl0.grid, columns: [...colsL, [8, 7]], beams: grid(X, Y, skipL),
  walls: [], panels: {}, cants: [], stairs: [], lineLoads: [], pointLoads: nodes([0, 4, 8, 12], [0, 3.5, 7, 10.5, 14]).map((p) => ({ p, P: 900, name: "หลังคา" })) };

const frame = { frameNo: "บ้านทดสอบ 3 ชั้น", mat, cur: 1, floors: [fl0, fl1, fl2, fl3], beamTypes: [...DEFAULT_BEAM_TYPES,
  { name: "B7", b: 0.25, h: 0.6, top: "3-DB16", bot: "3-DB16", topX: "3-DB20", botX: "3-DB20", st: "RB 9", sSup: 0.1, sMid: 0.15 },
  { name: "B8", b: 0.3, h: 0.7, top: "3-DB20", bot: "3-DB20", topX: "4-DB25", botX: "4-DB25", st: "DB 12", sSup: 0.1, sMid: 0.15 }],
  colTypes: [...DEFAULT_COLUMN_TYPES, { name: "C2", levels: ["ตอม่อ", "ชั้น 1", "ชั้น 2", "ชั้น 3"].map((level, i) => ({ level, Bx: [40, 30, 30, 25][i], By: [40, 30, 30, 25][i], n: [12, 8, 8, 8][i], mainBar: "DB 16", tieBar: "RB 9", s: 0.15 })) },
    { name: "C3", levels: ["ตอม่อ", "ชั้น 1", "ชั้น 2", "ชั้น 3"].map((level, i) => ({ level, Bx: [50, 40, 40, 30][i], By: [50, 40, 40, 30][i], n: [16, 12, 12, 8][i], mainBar: "DB 20", tieBar: "RB 9", s: 0.15 })) }],
  colPick: {}, analysis: "envelope", baseFixity: "pinned", wallTypes: DEFAULT_WALL_TYPES };
const project = { app: "StructCalc", version: 1, frame };
mkdirSync("web/public/projects", { recursive: true });
writeFileSync("web/public/projects/_big.json", JSON.stringify(project, null, 1));

const t0 = Date.now(), res = analyzeFrame(frame), ms = Date.now() - t0;
const all = res.floors.flatMap((f) => f.spans);
console.log(`analysis ${ms} ms · beams ${all.filter((s) => s.ok).length}/${all.length} · columns ${res.columns.filter((c) => c.ok).length}/${res.columns.length} · footings ${res.footings.filter((f) => f.ok).length}/${res.footings.length}`);
for (const [k, a] of res.floors.entries()) console.log(`  ${frame.floors[k].name}: lines ${a.lines.length} spans ${a.spans.length} NG ${a.spans.filter((s) => !s.ok).map((s) => `${s.id}(${s.type.name} ${s.len.toFixed(2)}m)`).join(" ")} · panels ${a.panels.length}`);
// equilibrium: 3D frame base reactions = everything applied
const f3 = res.frame3d, Rz = f3.base.reduce((s, b) => s + b.R[2], 0);
console.log(`3D ΣRz ${(Rz / 1000).toFixed(2)} t vs applied ${(f3.load / 1000).toFixed(2)} t (${(((Rz - f3.load) / f3.load) * 100).toFixed(4)} %) · accumulated ΣPbot ${(res.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) / 1000).toFixed(2)} t`);
console.log(`warnings (${res.warnings.length}):\n  ${res.warnings.join("\n  ")}`);
