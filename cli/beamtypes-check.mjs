// Automatic beam types (engine/beamTypes.js): every span passes, names B1… cheapest first, within the limits, more types ≤ cost.
// Usage: node cli/beamtypes-check.mjs → summary lines, exit 1 when a check fails.
import { readFileSync } from "node:fs";
import { generateBeamTypes, BEAM_GEN } from "../web/engine/beamTypes.js";
import { parseBars, barLayers } from "../web/engine/floor.js";
const pj = JSON.parse(readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url), "utf8"));
let bad = 0;
const check = (name, ok, info = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
const g1 = generateBeamTypes(pj.frame, 1), g3 = generateBeamTypes(pj.frame, 3);
check("k = 1: all spans pass", g1.ok === g1.n, `${g1.ok}/${g1.n}`);
check("k = 3: all spans pass", g3.ok === g3.n, `${g3.ok}/${g3.n}`);
check("more types cost less", g3.cost <= g1.cost + 1e-6, `${Math.round(g1.cost)} → ${Math.round(g3.cost)}`);
check("names B1, B2, …", g3.beamTypes.every((t, i) => t.name === `B${i + 1}`), g3.beamTypes.map((t) => t.name).join(" "));
const used = (t, m, x) => barLayers(t.b, pj.frame.mat, t.st, parseBars(m), parseBars(x)).filter((l) => l.main || l.special).length;
check("limits b ≥ 0.20, h ≤ 0.80, ≤ 2 layers", g3.beamTypes.every((t) => t.b >= BEAM_GEN.b[0] - 1e-9 && t.h <= BEAM_GEN.hMax + 1e-9 && used(t, t.top, t.topX) <= 2 && used(t, t.bot, t.botX) <= 2));
check("sizes in whole 10 cm", g3.beamTypes.every((t) => Math.abs(t.b * 10 - Math.round(t.b * 10)) < 1e-9 && Math.abs(t.h * 10 - Math.round(t.h * 10)) < 1e-9), g3.beamTypes.map((t) => `${t.b}x${t.h}`).join(" "));
check("every drawn beam back to auto", g3.floors.every((f) => f.beams.every((b) => b.type === null)));
process.exit(bad ? 1 : 0);
