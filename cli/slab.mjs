// Usage: node slab.mjs <oneway|cantilever|twoway|stair> '<input JSON>'  → key=value lines for differential testing.
import { oneWay, cantilever, twoWay, stair, ONE_WAY_KEYS, CANTILEVER_KEYS, TWO_WAY_KEYS } from "../web/engine/slab.js";
import { formatValue } from "../web/engine/beam.js";

const [kind, json] = process.argv.slice(2);
const [fn, keys] = { oneway: [oneWay, ONE_WAY_KEYS], cantilever: [cantilever, CANTILEVER_KEYS], twoway: [twoWay, TWO_WAY_KEYS], stair: [stair, ONE_WAY_KEYS] }[kind];
const r = fn(JSON.parse(json));
process.stdout.write(keys.map((k) => `${k}=${formatValue(r[k])}`).join("\n") + "\n");

