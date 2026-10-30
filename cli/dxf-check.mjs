import { twoWay } from "../web/engine/slab.js";
import { slabSectionModel, toDxf } from "../web/src/drawings.js";
const s = { kind: "twoway", case: 2, fcPrime: 180, F: 0.45, fy: 2400, Es: 2040000, cover: 2, unitWeight: 2400, t: 0.1, S: 3, L: 4, extra: 100, live: 200, shortBar: "RB 9", longBar: "RB 9" };
const dxf = toDxf(slabSectionModel(s, twoWay(s)));
const n = (k) => (dxf.match(new RegExp(`\\n${k}\\r?\\n`, "g")) || []).length;
console.log(dxf.length, "bytes", n("LINE"), "LINE", n("TEXT"), "TEXT", n("CIRCLE"), "CIRCLE", n("LAYER"), "LAYER");
