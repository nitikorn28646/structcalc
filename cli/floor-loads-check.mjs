// Load kinds check: Σ column reactions = Σ load groups for slab kinds, walls and cantilever slabs. Usage: node floor-loads-check.mjs
import { analyzeFloor, DEFAULT_BEAM_TYPES, DEFAULT_WALL_TYPES } from "../web/engine/floor.js";

const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const XS = [0, 4, 8], YS = [0, 5];
const base = () => ({ t: 0.12, finish: 100, live: 200, panels: {}, walls: [], cants: [],
  columns: XS.flatMap((x) => YS.map((y) => [x, y])),
  beams: [...YS.flatMap((y) => XS.slice(1).map((x, i) => ({ a: [XS[i], y], b: [x, y] }))), ...XS.map((x) => ({ a: [x, 0], b: [x, 5] }))].map((b) => ({ ...b, type: null })) });
let bad = 0;
const run = (name, f, expect) => {
  const r = analyzeFloor(f, DEFAULT_BEAM_TYPES, mat, [], DEFAULT_WALL_TYPES), sumR = r.columns.reduce((s, c) => s + c.from.reduce((t, f) => t + (f.Rc ?? f.R), 0), 0), sumG = Object.values(r.groups).reduce((s, v) => s + v, 0);
  const ok = Math.abs(sumR - sumG) < 1e-6 * sumR && (!expect || expect(r));
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}: ΣR ${sumR.toFixed(0)} = Σgroups ${sumG.toFixed(0)} | ${Object.entries(r.groups).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(" ")}${r.warnings.length ? ` | ${r.warnings.join("; ")}` : ""}`);
  return r;
};
const key = (r, i) => r.panels[i].key;
let f = base(), r0 = run("S two-way", f);
f = base(); f.panels[key(r0, 0)] = { kind: "PS", dir: "x" }; f.panels[key(r0, 1)] = { kind: "PS", dir: "y" };
run("PS x / y", f, (r) => r.panels[0].kind === "oneway" && r.panels[0].span === 4 && r.panels[1].span === 5);
f = base(); f.panels[key(r0, 0)] = { kind: "GS" };
run("GS", f, (r) => r.groups.LL === 200 * 20);
f = base(); f.walls = [{ a: [0, 0], b: [8, 0], kind: "brick", h: 3, open: 20, layers: 2 }, { a: [0, 0], b: [4, 0], kind: "light", h: 3 }, { a: [2, 1], b: [2, 4], kind: "brick", h: 2.8 }];
run("walls: double + stacked on a beam, one on a slab", f, (r) => Math.abs(r.groups.WALL - (180 * 3 * 0.8 * 2 * 8 + 90 * 3 * 4 + 180 * 2.8 * 3)) < 1e-6 && r.walls[2].panel);
f = base(); f.cants = [{ a: [0, 0], b: [8, 0], L: 1.2, side: -1 }];
run("cantilever slab + torsion", f, (r) => r.spans.some((s) => s.Mt > 0) && r.cants[0].P[2][1] < 0);
f = base(); f.cants = [{ a: [0, 0], b: [8, 0], L: 1.2, side: -1 }]; f.lineLoads = [{ a: [0, -1.2], b: [8, -1.2], q: 100, name: "ราวกันตก" }, { a: [4, 0], b: [4, 5], q: 50 }];
f.pointLoads = [{ p: [2, 5], P: 1000 }, { p: [6, 2.5], P: 500 }]; f.panels[key(r0, 0)] = { extra: 50 };
run("railing on cant tip + line on beam + points + extra SDL", f, (r) => Math.abs(r.groups.SP - (100 * 8 + 50 * 5 + 1500)) < 1e-6 && r.lineLoads[0].on === "cant" && r.pointLoads[1].on === "panel");
for (const kind of ["long", "side", "cant", "landing"]) {
  f = base(); f.beams.push({ a: [4, 2], b: [8, 2], type: null }); // stair well 4–8 × 0–2 (beam on y = 2)
  f.stairs = [{ a: [4, 0], b: [8, 2], up: "+x", kind, side: 1, landingL: 1.2, landingTo: "this" }];
  const r = run(`stair ${kind}`, f, (x) => x.stairs.length === 1);
  const here = Object.values(r.groups).reduce((s, v) => s + v, 0) - r.spans.reduce((s, sp) => s + 2400 * sp.type.b * sp.type.h * sp.len, 0);
  const slab = r.panels.reduce((s, p) => s + p.w * p.area, 0), down = r.down.reduce((s, d) => s + d.q * Math.hypot(d.b[0] - d.a[0], d.b[1] - d.a[1]), 0);
  const st = r.stairs[0], tot = st.total.DL + st.total.SDL + st.total.LL, ok = Math.abs(here + down - slab - tot) < 1e-6 * tot;
  if (!ok) bad++;
  console.log(`${ok ? "ok  " : "FAIL"}   stair ${kind}: on this floor ${(here - slab).toFixed(0)} + to floor below ${down.toFixed(0)} = stair ${tot.toFixed(0)}`);
}
process.exit(bad ? 1 : 0);
