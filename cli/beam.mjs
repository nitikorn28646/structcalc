// Usage: node beam.mjs '<section input JSON>'  → key=value lines for differential testing.
import { designSection, COMPARED_KEYS, formatValue } from "../web/engine/beam.js";

const r = designSection(JSON.parse(process.argv[2]));
process.stdout.write(COMPARED_KEYS.map((k) => `${k}=${formatValue(r[k])}`).join("\n") + "\n");
