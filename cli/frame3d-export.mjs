// Writes the 3D frame models used by the PyNite differential test (difftest/frame3d/*.json): small hand-made frames
// (fixed / pinned bases, pinned secondary beam with torque, two storeys with lateral loads) and the whole Yasothon house
// as the app builds it. Each file = solveFrame3D input + the section properties / releases it used (for the oracle).
// node cli/frame3d-export.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { solveFrame3D } = await import(pathToFileURL(join(root, "web/engine/frame3d.js")));
const { analyzeFrame } = await import(pathToFileURL(join(root, "web/engine/frame.js")));
const out = join(root, "difftest/frame3d");
mkdirSync(out, { recursive: true });
const E = 2.323 ** 1.5 * 4270 * Math.sqrt(240) * 1e4; // kg/m², f'c 240 ksc

function save(name, m) {
  const sol = solveFrame3D(m);
  if (sol.error) throw new Error(`${name}: ${sol.error}`);
  const members = m.members.map((x, k) => ({ ...x, sec: sol.members[k].sec, rel: sol.members[k].rel }));
  writeFileSync(join(out, `${name}.json`), JSON.stringify({ ...m, members }));
  console.log(name, m.nodes.length, "nodes", members.length, "members");
}

// builder: columns from z0 to z1 at (x, y); beams between nodes
function builder() {
  const nodes = [], members = [], idx = new Map();
  const node = (x, y, z, sup) => { const k = `${x},${y},${z}`; if (!idx.has(k)) { idx.set(k, nodes.length); nodes.push({ x, y, z }); } const i = idx.get(k); if (sup) nodes[i][sup] = true; return i; };
  return { nodes, members, node };
}

// 1 portal frame, fixed bases: UDL, partial trapezoid and a point load on the beam
{
  const { nodes, members, node } = builder();
  const a = node(0, 0, 0, "fixed"), b = node(5, 0, 0, "fixed"), c = node(0, 0, 3), d = node(5, 0, 3);
  members.push({ i: a, j: c, kind: "column", b: 0.25, h: 0.25 }, { i: b, j: d, kind: "column", b: 0.25, h: 0.25 },
    { i: c, j: d, kind: "beam", b: 0.2, h: 0.5, loads: [{ a: 0, b: 5, wa: 800, wb: 800 }, { a: 1, b: 3.5, wa: 200, wb: 900 }, { at: 3.7, P: 1500 }] });
  save("portal-fixed", { nodes, members, nodeLoads: [{ n: c, P: 300 }], E, pDelta: false });
}
// 2 box of 4 columns on pinned bases, perimeter beams, a secondary beam pinned onto two girders with a cantilever-slab torque
function box(sup, torque) {
  const { nodes, members, node } = builder(), C = [[0, 0], [6, 0], [6, 4], [0, 4]];
  const top = C.map(([x, y]) => { const a = node(x, y, 0, sup), t = node(x, y, 3.2); members.push({ i: a, j: t, kind: "column", b: 0.2, h: 0.2 }); return t; });
  const m1 = node(3, 0, 3.2), m2 = node(3, 4, 3.2), w = { a: 0, b: 3, wa: 600, wb: 600 };
  members.push({ i: top[0], j: m1, kind: "beam", b: 0.2, h: 0.4, loads: [w] }, { i: m1, j: top[1], kind: "beam", b: 0.2, h: 0.4, loads: [w] },
    { i: top[3], j: m2, kind: "beam", b: 0.2, h: 0.4, loads: [w], torque: torque ? [450] : [] }, { i: m2, j: top[2], kind: "beam", b: 0.2, h: 0.4, loads: [w], torque: torque ? [450] : [] },
    { i: top[1], j: top[2], kind: "beam", b: 0.15, h: 0.35, loads: [{ a: 0, b: 4, wa: 0, wb: 700 }] }, { i: top[0], j: top[3], kind: "beam", b: 0.15, h: 0.35, loads: [{ a: 0, b: 2, wa: 500, wb: 500 }] },
    { i: m1, j: m2, kind: "beam", b: 0.15, h: 0.3, loads: [{ a: 0, b: 4, wa: 900, wb: 900 }, { at: 1.2, P: 700 }], release: [true, true] });
  return { nodes, members, nodeLoads: [], E, pDelta: false };
}
save("box-pinned-secondary", box("pinned", true));
save("box-fixed-secondary", box("fixed", false));
// 3 two storeys, 2 × 1 bays, rectangular beams both directions, lateral forces at each floor (both axes), P-Delta off / on
function twoStorey(pDelta) {
  const { nodes, members, node } = builder(), X = [0, 4, 9], Y = [0, 5], Z = [0, 3, 6];
  const lateral = [];
  for (let s = 1; s < Z.length; s++) {
    for (const x of X) for (const y of Y) members.push({ i: node(x, y, Z[s - 1], s === 1 ? "fixed" : null), j: node(x, y, Z[s]), kind: "column", b: 0.25, h: 0.25 });
    for (const y of Y) for (let k = 0; k + 1 < X.length; k++) members.push({ i: node(X[k], y, Z[s]), j: node(X[k + 1], y, Z[s]), kind: "beam", b: 0.2, h: 0.5, loads: [{ a: 0, b: X[k + 1] - X[k], wa: 1200 + 300 * k, wb: 1200 + 300 * k }] });
    for (const x of X) members.push({ i: node(x, 0, Z[s]), j: node(x, 5, Z[s]), kind: "beam", b: 0.2, h: 0.4, loads: [{ a: 0, b: 5, wa: 400, wb: 1000 }] });
    lateral.push({ n: node(0, 0, Z[s]), F: [800 * s, 0] }, { n: node(9, 5, Z[s]), F: [0, -500 * s] });
  }
  return { nodes, members, nodeLoads: [], lateral, E, pDelta };
}
save("two-storey-lateral", twoStorey(false));
save("two-storey-pdelta", twoStorey(true));
// 4 the Yasothon house exactly as the app builds it (gravity), linear and with P-Delta
{
  const pj = JSON.parse(readFileSync(join(root, "web/public/projects/yasothon.json"), "utf8"));
  const inp = analyzeFrame(pj.frame).frame3d.input;
  const strip = (m) => ({ i: m.i, j: m.j, kind: m.kind, b: m.b, h: m.h, loads: m.loads ?? [], torque: m.torque ?? [], release: m.release });
  for (const pDelta of [false, true]) save(pDelta ? "yasothon-pdelta" : "yasothon-linear", { nodes: inp.nodes, members: inp.members.map(strip), nodeLoads: inp.nodeLoads, E: inp.E, pDelta });
}
// 5 continuous beams (engine/contBeam.js): hand-made lines and every beam line of the Yasothon house as floor.js solves it
{
  const lines = [
    { x: [0, 4, 8], sup: [true, true, true], EI: [1e6, 1e6], loads: [{ a: 0, b: 8, wa: 1000, wb: 1000 }] },
    { x: [0, 1.2, 4.2, 9, 12.5], sup: [false, true, true, true, false], EI: [8e5, 8e5, 1.6e6, 8e5], loads: [{ a: 0, b: 12.5, wa: 900, wb: 900 }, { at: 0, P: 400 }, { a: 4.2, b: 9, wa: 0, wb: 1500 }, { at: 6.1, P: 2200 }, { a: 10, b: 12.5, wa: 700, wb: 200 }] },
    { x: [0, 2.5, 3.5, 7], sup: [true, false, true, true], EI: [1e6, 1e6, 2e6], loads: [{ at: 2.5, P: 3000 }, { a: 1, b: 6, wa: 600, wb: 600 }] },
  ];
  const pj = JSON.parse(readFileSync(join(root, "web/public/projects/yasothon.json"), "utf8"));
  for (const an of analyzeFrame(pj.frame).floors) for (const ln of an.lines) if (ln.beamIn) lines.push(ln.beamIn);
  const strip = (l) => ({ x: l.x, sup: l.sup, EI: l.EI, loads: l.loads.map((q) => (q.P !== undefined ? { at: q.at, P: q.P } : { a: q.a, b: q.b, wa: q.wa, wb: q.wb })) });
  writeFileSync(join(out, "contbeam-hand.json"), JSON.stringify(lines.slice(0, 3).map(strip)));
  writeFileSync(join(out, "contbeam-yasothon.json"), JSON.stringify(lines.slice(3).map(strip)));
  console.log("contbeam", 3, "hand lines,", lines.length - 3, "Yasothon lines");
}
