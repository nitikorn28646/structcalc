// Candidate of the PyNite differential test for continuous beams: solve each line of a difftest/frame3d/contbeam-*.json
// file with engine/contBeam.js and print reactions, node deflections (mm) and M at 11 points per element (kg, kg-m).
// node cli/contbeam-solve.mjs <lines.json>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { solveBeam } = await import(pathToFileURL(join(root, "web/engine/contBeam.js")));
const f = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d), out = [];
JSON.parse(readFileSync(process.argv[2], "utf8")).forEach((ln, k) => {
  const r = solveBeam(ln);
  if (r.error) { out.push(`L${k} error`); return; }
  out.push(`L${k}R ${r.R.map((v) => f(v)).join(" ")}`);
  out.push(`L${k}D ${[...r.el.map((e) => e.d[0]), r.el[r.el.length - 1].d[1]].map((v) => f(-v * 1000, 3)).join(" ")}`);
  r.el.forEach((e, j) => out.push(`L${k}E${j} ${Array.from({ length: 11 }, (_, i) => f(e.M((e.L * i) / 10))).join(" ")}`));
});
console.log(out.join("\n"));
