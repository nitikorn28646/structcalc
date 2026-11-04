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
check("names B1, B2, … by size", g3.beamTypes.every((t, i) => t.name === `B${i + 1}` && (!i || g3.beamTypes[i - 1].b * g3.beamTypes[i - 1].h <= t.b * t.h + 1e-9)), g3.beamTypes.map((t) => `${t.name} ${t.b}x${t.h}`).join(" "));
// the designer's habit (user 2026-11-04): from 20×40 up, ≤ 5 bottom / 3 top bars of DB12 or DB16, stirrups RB6 / RB9 @0.20–0.10
const n = (v) => parseBars(v)?.n ?? 0, sz = (v) => parseBars(v)?.bar;
const normal = g3.beamTypes.filter((t) => !t.big);
check("sections from the list (start 20×40)", normal.every((t) => BEAM_GEN.sections.some(([b, h]) => Math.abs(b - t.b) < 1e-9 && Math.abs(h - t.h) < 1e-9)), normal.map((t) => `${t.b}x${t.h}`).join(" "));
check("bars ≤ 5 bottom, 3 top through (≤ 5 at supports), DB12 / DB16 (DB20 only as the last resort)", normal.every((t) => n(t.bot) + n(t.botX) <= 5 && n(t.top) <= 3 && n(t.top) + n(t.topX) <= 5 && [t.top, t.bot, t.topX, t.botX].filter(Boolean).every((v) => ["DB 12", "DB 16", "DB 20"].includes(sz(v)))));
check("stirrups RB6 / RB9, @0.10–0.20", g3.beamTypes.every((t) => ["RB 6", "RB 9"].includes(t.st) && !(t.stSets > 1) && t.sSup >= 0.1 - 1e-9 && t.sMid <= 0.2 + 1e-9));
const used = (t, m, x) => barLayers(t.b, pj.frame.mat, t.st, parseBars(m), parseBars(x)).filter((l) => l.main || l.special).length;
check("≤ 2 bar layers", g3.beamTypes.every((t) => used(t, t.top, t.topX) <= 2 && used(t, t.bot, t.botX) <= 2));
check("every drawn beam back to auto", g3.floors.every((f) => f.beams.every((b) => b.type === null)));
process.exit(bad ? 1 : 0);
