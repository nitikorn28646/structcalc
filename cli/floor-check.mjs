// Floor engine smoke/equilibrium check. Usage: node floor-check.mjs → summary lines, exit 1 when a check fails.
import { analyzeFloor, DEFAULT_BEAM_TYPES, CONC, findOverlaps, mergeOverlaps } from "../web/engine/floor.js";

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
// main / secondary at a crossing without a column (2026-11-03): the result must not depend on how the beams were drawn
const room = () => grid([0, 6], [0, 5]), Mof = (r) => r.spans.map((s) => `${s.len.toFixed(2)}:${Math.round(s.Mpos)}`).sort().join(" ");
const x1 = room(); x1.beams.push({ a: [3, 0], b: [3, 5], type: null }, { a: [0, 2.5], b: [6, 2.5], type: null }); // X, one beam each
const x2 = room(); x2.beams.push({ a: [3, 0], b: [3, 5], type: null }, { a: [0, 2.5], b: [3, 2.5], type: null }, { a: [3, 2.5], b: [6, 2.5], type: null }); // y-beam in two pieces
const rx1 = run("X crossing", x1), rx2 = run("X crossing drawn in pieces", x2);
check("crossing: same result however drawn", Mof(rx1) === Mof(rx2), Mof(rx1));
check("crossing: shorter (5 m) run is the main beam", rx1.lines.some((l) => Math.abs(l.L - 5) < 1e-6 && l.carriers.length === 2) && rx1.lines.filter((l) => Math.abs(l.L - 3) < 1e-6 && l.carriers.length === 2).length === 2, "");
check("crossing: guess is warned", rx1.warnings.some((w) => w.startsWith("คานตัดกัน")), "");
// secondary past an edge beam (user 2026-11-04): the stub beyond the main beam is a cantilever of the secondary, not a loose piece
const st = room(); st.beams.push({ a: [3, 0], b: [3, 6.2], type: null }); // crosses the y = 5 edge beam, 1.2 m stub
const rst = run("secondary with a stub past the edge beam", st), stub = rst.spans.find((s) => s.kind === "cantilever");
check("stub: cantilever span with forces", !!stub && Math.abs(stub.len - 1.2) < 1e-6 && stub.Mneg > 0 && !rst.lines.some((l) => l.error), stub ? `L ${stub.len.toFixed(2)} M- ${Math.round(stub.Mneg)} ${stub.typeName}` : "none");
// corner without a column past the last column (user 2026-11-04): the y-line runs 0.6 m past its column and the edge beam ends on its tip
const cn = { columns: [[0, 0], [4, 0], [0, 4], [4, 4], [0, 4.6]], beams: [{ a: [0, 0], b: [4, 0] }, { a: [0, 0], b: [0, 4] }, { a: [4, 0], b: [4, 4.6] }, { a: [0, 4], b: [4, 4] },
  { a: [0, 4], b: [0, 4.6] }, { a: [0, 4.6], b: [4, 4.6] }].map((b) => ({ ...b, type: null })), t: 0.12, finish: 100, live: 200, panels: {} };
const rcn = run("corner on a cantilever tip", cn), tip = rcn.spans.find((s) => s.kind === "cantilever");
check("corner: stub is a cantilever carrying the edge beam", !!tip && Math.abs(tip.len - 0.6) < 1e-6 && tip.Mneg > 0 && !rcn.warnings.some((w) => w.startsWith("มุมคานไม่มีเสา")), tip ? `M- ${Math.round(tip.Mneg)} ${tip.typeName}` : "none");
const x3 = room(); x3.beams.push({ a: [3, 0], b: [3, 5], type: null }, { a: [0, 2.5], b: [6, 2.5], type: null, role: "main" });
const rx3 = run("X crossing, role main on the long beam", x3);
check("crossing: role main wins", rx3.lines.some((l) => Math.abs(l.L - 6) < 1e-6 && l.carriers.length === 2) && rx3.lines.filter((l) => Math.abs(l.L - 2.5) < 1e-6 && l.carriers.length === 2).length === 2 && !rx3.warnings.some((w) => w.startsWith("คานตัดกัน")), "");
// carried point load = reaction of the secondary (statics): both secondaries 3 m with the same panels → equal reactions
const main = rx1.lines.find((l) => Math.abs(l.L - 5) < 1e-6 && l.carriers.length === 2);
check("crossing: main beam carries both secondary reactions", Math.abs(main.pts.reduce((s, p) => s + p.P, 0) - rx1.lines.filter((l) => Math.abs(l.L - 3) < 1e-6).reduce((s, l) => s + (dist2(l.A, [3, 2.5]) < 1e-6 ? l.res.R[0] : l.res.R[l.x.length - 1]), 0)) < 1e-6, "");
// cantilevers carrying an edge beam (user 2026-11-03): the edge beam (no column) rests on the cantilever tips, not the reverse
const cb = room(); cb.beams.push({ a: [0, 0], b: [0, -1.5], type: null }, { a: [6, 0], b: [6, -1.5], type: null }, { a: [3, 5], b: [3, -1.5], type: null }, { a: [0, -1.5], b: [6, -1.5], type: null });
cb.columns.push([3, 0], [3, 5]); cb.beams = cb.beams.flatMap((b) => (b.a[1] === 0 && b.b[1] === 0 && b.a[0] === 0 && b.b[0] === 6 ? [{ a: [0, 0], b: [3, 0], type: null }, { a: [3, 0], b: [6, 0], type: null }] : [b]));
const rcb = run("edge beam on cantilever tips", cb), edge = rcb.lines.find((l) => l.A[1] === -1.5 && l.B[1] === -1.5);
check("edge beam rests on the 3 tips", edge.carriers.length === 3 && rcb.lines.filter((l) => l.cols.length && l.carriers.length).length === 0, JSON.stringify(edge.carriers.map((c) => c.t)));
check("cantilever tips carry the edge beam", rcb.spans.filter((s) => s.kind === "cantilever").length === 3 && rcb.spans.filter((s) => s.kind === "cantilever").every((s) => s.Mneg > 0), "");
const cb1 = JSON.parse(JSON.stringify(cb)); cb1.beams = cb1.beams.map((b) => (b.a[0] === 3 && b.a[1] === 5 ? { ...b, a: [3, 0] } : b)); cb1.columns = cb1.columns.filter((c) => !(c[0] === 3 && c[1] === 5));
run("cantilever with one column only (no back span): nothing lost", cb1); // equilibrium checked in run()
// overlapping beams (user 2026-11-04): drawn twice / one inside another → found, merged into one beam over the union
const ovB = [{ a: [0, 0], b: [4, 0], type: 2 }, { a: [3, 0], b: [6, 0], type: null }, { a: [1, 0], b: [2, 0], type: null }, { a: [6, 0], b: [8, 0], type: null }, { a: [0, 0], b: [0, 4], type: null }];
const ov = findOverlaps(ovB), mg = mergeOverlaps(ovB);
check("overlaps found (touching end to end is not an overlap)", ov.length === 2 && ov.every((o) => o.i === 0) && Math.abs(ov[0].len - 1) < 1e-9, JSON.stringify(ov.map((o) => [o.i, o.j, o.len])));
check("overlaps merged", mg.length === 3 && mg[0].a[0] === 0 && mg[0].b[0] === 6 && mg[0].type === 2 && findOverlaps(mg).length === 0, JSON.stringify(mg.map((b) => [b.a, b.b])));
// compatibility torsion (ACI 318 22.7.3): the 3D part above the equilibrium torsion is capped at Tlim = 0.53·√f'c·(bh)²/(2(b+h))
{ const { checkSpan } = await import("../web/engine/floor.js"); const t = { name: "T", b: 0.2, h: 0.5, top: "2-DB16", topX: "", bot: "2-DB16", botX: "", st: "RB 9", sSup: 0.1, sMid: 0.1 };
  const sp = { kind: "both_ends", len: 4, Mpos: 1000, Mneg: 1500, V: 2000, Mt: 1500, MtEq: 200, vDone: true }, c = checkSpan(t, sp, mat), lim = (0.53 * Math.sqrt(240) * (20 * 50) ** 2 / (2 * 70)) / 100;
  const c2 = checkSpan(t, sp, { ...mat, compatTorsion: false }), c3 = checkSpan(t, { ...sp, MtEq: 1500 }, mat);
  check("compatibility torsion capped, equilibrium kept", Math.abs(c.MtUse - (200 + lim)) < 1e-6 && c2.MtUse === 1500 && c3.MtUse === 1500, `${Math.round(c.MtUse)} (lim ${Math.round(lim)})`); }
function dist2(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
process.exit(bad ? 1 : 0);
