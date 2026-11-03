// Hand checks of the wall model: build-up kg/m², clear height under the beam above, doors / windows as opening %, gable walls.
import { resolveWall, wallTypeW, wallLoad } from "../web/engine/floor.js";

let bad = 0;
const eq = (name, got, want, tol = 1e-6) => { const ok = Math.abs(got - want) <= tol; if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${got} (hand ${want})`); };
eq("brick 10 cm + plaster 1.5 cm × 2", wallTypeW({ core: "brick", t: 0.1, plaster: 1.5, sides: 2 }), 1600 * 0.1 + 2000 * 0.015 * 2);
eq("AAC 7.5 cm + plaster 1 cm × 2", wallTypeW({ core: "aac", t: 0.075, plaster: 1, sides: 2 }), 650 * 0.075 + 2000 * 0.01 * 2);
eq("gypsum dry wall", wallTypeW({ core: "gypsum", dry: 30 }), 30);
eq("old type keeps w", wallTypeW({ w: 180 }), 180);
const frame = { beamTypes: [{ h: 0.5 }], floors: [{ h: 1, beams: [] }, { h: 3.0, beams: [{ a: [0, 0], b: [4, 0], type: 0 }] }] };
const w = { a: [0, 0], b: [4, 0], kind: "brick", hAuto: true };
eq("clear height = 3.0 − 0.5", resolveWall(w, frame, 0).h, 2.5);
eq("no beam type above → 0.40 deep", resolveWall({ ...w, a: [0, 2], b: [4, 2] }, frame, 0).h, 2.6);
const d = resolveWall({ ...w, openings: [{ w: 0.9, h: 2.0 }, { w: 1.2, h: 1.1 }] }, frame, 0);
eq("door + window opening %", d.open, (100 * (0.9 * 2 + 1.2 * 1.1)) / (4 * 2.5));
eq("wall load kg/m", wallLoad(d, [{ id: "brick", w: 220 }]), 220 * 2.5 * (1 - (0.9 * 2 + 1.2 * 1.1) / 10));
eq("gable: average half height", resolveWall({ a: [0, 0], b: [6, 0], h: 2.4, gable: true }, null, 0).h, 1.2);
eq("legacy % kept", resolveWall({ a: [0, 0], b: [4, 0], h: 3, open: 15 }, null, 0).open, 15);
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
