// Regression of the Yasothon house: compares the analysis summary with a saved baseline.
// Usage: node cli/regress-yasothon.mjs [--save]  → exit 1 when anything differs.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { analyzeFrame } from "../web/engine/frame.js";

const pj = JSON.parse(readFileSync("web/public/projects/yasothon.json", "utf8")), r = analyzeFrame(pj.frame), T = pj.frame.beamTypes;
const r1 = (v) => Math.round(v * 10) / 10;
const sum = {
  spans: r.floors.flatMap((a, k) => a.spans.map((s) => `${k}:${s.id}:${T[s.typeIdx].name}:${s.ok ? 1 : 0}:${r1(s.Mpos)}:${r1(s.Mneg)}:${r1(s.V)}`)),
  columns: r.columns.map((c) => `${c.floor}:${c.stack}:${r1(c.Pbot)}:${c.ok ? 1 : 0}`),
  footings: r.footings.map((f) => `${f.stack}:${f.n}x${f.pile}:${r1(f.P)}:${f.ok ? 1 : 0}`),
  groups: r.floors.map((a) => Object.values(a.groups).map(r1).join(",")),
};
const file = "cli/regress-yasothon.baseline.json";
if (process.argv.includes("--save") || !existsSync(file)) { writeFileSync(file, JSON.stringify(sum, null, 1)); console.log("baseline saved"); process.exit(0); }
const base = JSON.parse(readFileSync(file, "utf8"));
let bad = 0;
for (const k of Object.keys(sum)) {
  const a = base[k].join("\n"), b = sum[k].join("\n");
  if (a !== b) { bad++; console.log(`DIFF ${k}`); base[k].forEach((v, i) => v !== sum[k][i] && console.log(`  - ${v}\n  + ${sum[k][i]}`)); }
  else console.log(`ok   ${k} (${sum[k].length})`);
}
process.exit(bad ? 1 : 0);
