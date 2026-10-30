// Usage: node footing.mjs '<input JSON>'          (spread footing)
//        node footing.mjs pilecap '<input JSON>'  (pile cap)  → key=value lines for differential testing.
import { spreadFooting, pileCap, FOOTING_KEYS, PILECAP_KEYS } from "../web/engine/footing.js";
import { formatValue } from "../web/engine/beam.js";

const cap = process.argv[2] === "pilecap";
const inp = JSON.parse(process.argv[cap ? 3 : 2]);
const r = cap ? pileCap(inp) : spreadFooting(inp);
// the 5/7/9-pile reference sheets have no punching-stress cells around the pier: not compared
// 2-pile sheets have no short-direction or y-axis checks; 1-pile sheets only check pile load and minimum steel
const SKIP = {
  2: ["dShort", "Mxx", "V1y", "V2y", "dReqX", "vX", "vpX", "vppY", "uS", "perimReqS", "perimS", "ancS", "ancAvailS"],
  5: ["vpX", "vpY"], 7: ["vpX", "vpY"], 9: ["vpX", "vpY"],
};
const ONLY1 = ["Bx", "By", "Ptmax", "P1", "P2", "Pf", "Pallow", "AsReqL", "AsProvL", "nLong"];
const skip = new Set(cap ? SKIP[inp.n] ?? [] : []);
const keys = cap ? (inp.n === 1 ? ONLY1 : PILECAP_KEYS) : FOOTING_KEYS;
process.stdout.write(keys.map((k) => `${k}=${skip.has(k) ? "-" : formatValue(r[k])}`).join("\n") + "\n");
