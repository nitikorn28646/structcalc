// Floor engine smoke/equilibrium check. Usage: node floor-check.mjs → summary lines, exit 1 when a check fails.
import { analyzeFloor, DEFAULT_BEAM_TYPES, CONC } from "../web/engine/floor.js";

const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
const grid = (xs, ys) => {
  const columns = xs.flatMap((x) => ys.map((y) => [x, y])), beams = [];
  for (const y of ys) for (let i = 0; i + 1 < xs.length; i++) beams.push({ a: [xs[i], y], b: [xs[i + 1], y], type: null, wall: { h: 0 } });
  for (const x of xs) for (let i = 0; i + 1 < ys.length; i++) beams.push({ a: [x, ys[i]], b: [x, ys[i + 1]], type: null, wall: { h: 0 } });
  return { columns, beams, t: 0.12, finish: 100, live: 200, panels: {} };
};
let bad = 0;
const check = (name, ok, info) => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
const run = (name, f) => {
  const r = analyzeFloor(f, DEFAULT_BEAM_TYPES, mat);
  const slab = r.panels.reduce((s, p) => s + p.w * p.area, 0);
  const self = r.spans.reduce((s, sp) => s + CONC * sp.type.b * sp.type.h * sp.len, 0);
  const sumR = r.columns.reduce((s, c) => s + c.from.reduce((t, f) => t + (f.Rc ?? f.R), 0), 0); // continuous reactions (the column load is an envelope ≥ these)
  check(`${name} equilibrium`, Math.abs(sumR - slab - self) < 1e-6 * sumR, `ΣR ${sumR.toFixed(0)} = slab ${slab.toFixed(0)} + self ${self.toFixed(0)}`);
  console.log(`     panels ${r.panels.map((p) => `${p.kind}${p.area.toFixed(1)}`).join(" ")} | spans ${r.spans.map((s) => `${s.id}:${s.kind[0]}:${s.type.name}:${s.ok ? "ok" : "NG"}`).join(" ")}`);
  if (r.warnings.length) console.log(`     warn ${r.warnings.join(" | ")}`);
  return r;
};
run("2x2 bays", grid([0, 4, 8], [0, 3.5, 7.5]));
const f = grid([0, 5], [0, 4]);
f.beams.push({ a: [2.5, 0], b: [2.5, 4], type: null, wall: { h: 0 } }); // secondary beam on the two x-beams
const r = run("secondary beam", f);
check("secondary carried", r.lines.find((l) => l.carriers.length === 2) !== undefined, "");
const g = grid([0, 6], [0, 2.5]);
run("one-way panel", g);
process.exit(bad ? 1 : 0);
