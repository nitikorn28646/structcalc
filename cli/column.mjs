// Usage: node column.mjs '<input JSON>'  → key=value lines for differential testing.
// Spiral: node column.mjs spiral '<input JSON>'
import { tiedColumn, spiralColumn, COLUMN_KEYS, SPIRAL_KEYS } from "../web/engine/column.js";
import { formatValue } from "../web/engine/beam.js";

const spiral = process.argv[2] === "spiral";
const inp = JSON.parse(process.argv[spiral ? 3 : 2]);
const r = spiral ? spiralColumn(inp) : tiedColumn(inp);
process.stdout.write((spiral ? SPIRAL_KEYS : COLUMN_KEYS).map((k) => `${k}=${formatValue(r[k])}`).join("\n") + "\n");
