// Render sample drawings to an HTML sheet for visual checks: node drawings-preview.mjs <out.html>
import { writeFileSync } from "node:fs";
import { oneWay, cantilever, twoWay } from "../web/engine/slab.js";
import { slabSectionModel, beamSectionModel, forceDiagramModel, toSvg } from "../web/src/drawings.js";
import { spanFunctions } from "../web/src/beamModel.js";

const base = { fcPrime: 180, F: 0.45, capFc: true, fy: 2400, Es: 2040000, cover: 2, unitWeight: 2400, t: 0.12,
  extra: 100, live: 200, mainBar: "RB 9", tempBar: "RB 9", shortBar: "RB 9", longBar: "RB 9" };
const cases = [
  ["one-way simple", { ...base, kind: "oneway", support: "simple", L: 2.5 }, oneWay],
  ["one-way one end", { ...base, kind: "oneway", support: "one_end", L: 3 }, oneWay],
  ["one-way both ends", { ...base, kind: "oneway", support: "both_ends", L: 3 }, oneWay],
  ["cantilever", { ...base, kind: "cantilever", L: 1.2, P: 100, a: 1.2 }, cantilever],
  ["two-way", { ...base, kind: "twoway", case: 2, S: 3, L: 4 }, twoWay],
];
const diag = (type, L, w, ML, MR, sup, point) =>
  toSvg(forceDiagramModel({ L, w, fns: spanFunctions(type, L, w, ML, MR, point), supports: sup, point }), 14, 560);
const diagrams = [
  ["SFD/BMD both ends w=2880", diag("both_ends", 5, 2880, 6000, 6000, ["fixed", "fixed"])],
  ["SFD/BMD one end w=2000", diag("one_end", 5, 2000, 0, 6250, ["pin", "fixed"])],
  ["SFD/BMD cantilever + P", diag("cantilever", 1.2, 420, 0, 0, ["fixed", "free"], { P: 100, a: 1.2 })],
];
const svgs = diagrams.map(([t, svg]) => `<figure><figcaption>${t}</figcaption>${svg}</figure>`);
svgs.push(...cases.slice(3, 5).map(([t, s, fn]) => `<figure><figcaption>${t}</figcaption>${toSvg(slabSectionModel(s, fn(s)), 14, 560)}</figure>`));
svgs.push(`<figure><figcaption>beam section</figcaption>${toSvg(beamSectionModel({ b: 0.2, h: 0.5, cover: 3, stirrupBar: "RB 9",
  top: [{ main: { n: 2, bar: "DB 20" }, special: { n: 2, bar: "DB 16" } }],
  bottom: [{ main: { n: 2, bar: "DB 20" }, special: { n: 1, bar: "DB 16" } }, { main: { n: 2, bar: "DB 16" } }] }), 14, 220)}</figure>`);
writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><style>body{font-family:Tahoma;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:8px}
figure{margin:0;border:1px solid #ddd;height:430px}figure svg{width:100%;height:400px}figcaption{font:12px Tahoma}</style>${svgs.join("")}`);

