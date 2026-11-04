// Auto column types: Yasothon with k = 1…4 → every column passes, identical groups merged, cost does not rise with k. node cli/coltypes-check.mjs
import { readFileSync } from "node:fs";
import { generateColumnTypes } from "../web/engine/columnTypes.js";
const p = JSON.parse(readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url), "utf8"));
let bad = 0, prev = Infinity;
for (const k of [1, 2, 3, 4]) {
  const g = generateColumnTypes(p.frame, k), sigs = new Set(g.colTypes.map((t) => JSON.stringify(t.levels)));
  const ok = g.ok === g.n && sigs.size === g.colTypes.length && g.colTypes.length <= k && g.cost <= prev + 1;
  if (!ok) bad++; prev = Math.min(prev, g.cost);
  console.log(`${ok ? "ok  " : "FAIL"} k ${k}: ${g.colTypes.length} types · ${g.ok}/${g.n} pass · ${Math.round(g.cost)} ฿`);
}
process.exit(bad ? 1 : 0);
