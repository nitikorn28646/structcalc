// Candidate of the PyNite differential test: solve a difftest/frame3d/*.json model with engine/frame3d.js and print
// "<tag> <value>" tokens in global axes (x, y, z up; kg, kg-m, mm) — the same layout as oracle/pynite_frame.py:
// reactions of held nodes, displacements of every node, member end forces (on the member, both ends) and beam M max / min.
// node cli/frame3d-solve.mjs <model.json>
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const { solveFrame3D } = await import(pathToFileURL(join(root, "web/engine/frame3d.js")));
const m = JSON.parse(readFileSync(process.argv[2], "utf8"));
const sol = solveFrame3D(m);
if (sol.error) { console.log("error", sol.error); process.exit(1); }
const f = (v, d = 1) => (Math.abs(v) < 0.5 * 10 ** -d ? 0 : v).toFixed(d), lines = [];
const toG = (T3, v) => [0, 1, 2].map((c) => T3[0][c] * v[0] + T3[1][c] * v[1] + T3[2][c] * v[2]);
m.nodes.forEach((n, i) => { if (n.fixed || n.pinned) lines.push(`R${i} ${sol.R[i].map((v) => f(v)).join(" ")}`); });
m.nodes.forEach((_, i) => lines.push(`U${i} ${[0, 1, 2].map((d) => f(sol.u[i * 6 + d] * 1000, 3)).join(" ")}`));
sol.members.forEach((e, k) => {
  const g = [0, 1, 2, 3].flatMap((b) => toG(e.T3, e.f.slice(b * 3, b * 3 + 3)));
  lines.push(`F${k} ${g.map((v) => f(v)).join(" ")}`);
  if (e.kind === "beam") lines.push(`M${k} ${f(e.Mmax)} ${f(e.Mmin)}`);
});
console.log(lines.join("\n"));
