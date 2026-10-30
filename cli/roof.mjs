// Usage: node roof.mjs <purlin|rafter|hip|valley|ridge|plate> '<input JSON>'  → key=value lines for differential testing.
import { purlin, rafter, hip, simpleBeam, ROOF_KEYS } from "../web/engine/roofDesign.js";
import { formatValue } from "../web/engine/beam.js";

const kind = process.argv[2], inp = JSON.parse(process.argv[3]);
const group = { valley: "hip", ridge: "beam", plate: "beam" }[kind] ?? kind;
const r = { purlin, rafter, hip, beam: simpleBeam }[group](inp);
// purlin: fb with sag rods is not compared (see oracle); sag-rod keys only exist when rods are used
const skip = new Set(kind === "purlin" ? (inp.sagRows ? ["fb"] : ["T", "AsReq"]) : []);
process.stdout.write(ROOF_KEYS[group].map((k) => `${k}=${skip.has(k) ? "-" : formatValue(r[k])}`).join("\n") + "\n");
