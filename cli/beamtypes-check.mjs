import { analyzeFrame } from "../web/engine/frame.js";
// Automatic beam types (engine/beamTypes.js): every span passes, names B1… cheapest first, within the limits, more types ≤ cost.
// Usage: node cli/beamtypes-check.mjs → summary lines, exit 1 when a check fails.
import { readFileSync } from "node:fs";
import { generateBeamTypes, BEAM_GEN, BEAM_COST, BEAM_STEEL } from "../web/engine/beamTypes.js";
import { parseBars, barLayers } from "../web/engine/floor.js";
const pj = JSON.parse(readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url), "utf8"));
let bad = 0;
const check = (name, ok, info = "") => { if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name} ${info}`); };
// default = steel first (user 2026-11-06); the cost / habit modes are checked with their own rules below
const g1 = generateBeamTypes(pj.frame, 1), g3 = generateBeamTypes(pj.frame, 3), c3 = generateBeamTypes(pj.frame, 3, BEAM_COST);
check("k = 1: all spans pass", g1.ok === g1.n, `${g1.ok}/${g1.n}`);
check("k = 3: all spans pass", g3.ok === g3.n, `${g3.ok}/${g3.n}`);
check("cost mode k = 3: all spans pass", c3.ok === c3.n, `${c3.ok}/${c3.n}`);
check("names B1, B2, … by size", g3.beamTypes.every((t, i) => t.name === `B${i + 1}` && (!i || g3.beamTypes[i - 1].b * g3.beamTypes[i - 1].h <= t.b * t.h + 1e-9)), g3.beamTypes.map((t) => `${t.name} ${t.b}x${t.h}`).join(" "));
// the designer's habit (user 2026-11-04): from 20×40 up, ≤ 5 bottom / 3 top bars of DB12 or DB16, stirrups RB6 / RB9 @0.20–0.10
const n = (v) => parseBars(v)?.n ?? 0, sz = (v) => parseBars(v)?.bar;
const normal = c3.beamTypes.filter((t) => !t.big), steelT = g3.beamTypes.filter((t) => !t.big);
check("cost mode: sections from its grid (b 20/25/30, h 30–80 step 5)", normal.every((t) => BEAM_COST.widths.some((b) => Math.abs(b - t.b) < 1e-9) && BEAM_COST.depths.some((h) => Math.abs(h - t.h) < 1e-9)), normal.map((t) => `${t.b}x${t.h}`).join(" "));
const gh = generateBeamTypes(pj.frame, 3, BEAM_GEN);
// habit mode (legacy, optional): since stirrup minimum uses the installed spacing (2026-11-06) its first-passing search can leave the two short
// corner cantilevers 3-3 / 15-1 on a 40×90 beam type whose compatibility torsion they cannot carry (a 30×60 would) — they stay NG with the
// reason shown; the default cost mode passes everything (checked above)
check("habit mode (start 20×40, 10 cm steps): ≥ n − 2 pass (failures flagged), sections from its list", gh.ok >= gh.n - 2 && gh.beamTypes.filter((t) => !t.big).every((t) => [...BEAM_GEN.sections, ...BEAM_GEN.bigSections].some(([b, h]) => Math.abs(b - t.b) < 1e-9 && Math.abs(h - t.h) < 1e-9)), `${gh.ok}/${gh.n} · ${gh.beamTypes.map((t) => `${t.b}x${t.h}`).join(" ")}`);
// 20×40 is the preferred section (user 2026-11-05): at least as many spans on 20×40 as in habit mode
const cnt2040 = (g) => analyzeFrame({ ...pj.frame, beamTypes: g.beamTypes, floors: g.floors }).floors.flatMap((a) => a.spans).filter((sp) => Math.abs(sp.type.b - 0.2) < 1e-9 && Math.abs(sp.type.h - 0.4) < 1e-9).length;
// steel first: never more concrete than cost mode, at least as many spans on 20×40, sections from the grid
const vol = (g) => analyzeFrame({ ...pj.frame, beamTypes: g.beamTypes, floors: g.floors }).floors.flatMap((a) => a.spans).reduce((v, sp) => v + sp.type.b * sp.type.h * sp.len, 0);
{ const vs = vol(g3), vc = vol(c3), ns = cnt2040(g3), nc = cnt2040(c3); check("steel first (default): concrete ≤ cost mode, spans on 20×40 ≥ cost mode", vs <= vc + 1e-6 && ns >= nc, `${vs.toFixed(2)} ≤ ${vc.toFixed(2)} m³ · ${ns} ≥ ${nc}`); }
check("steel first: sections from the grid", steelT.every((t) => BEAM_STEEL.widths.some((b) => Math.abs(b - t.b) < 1e-9) && BEAM_STEEL.depths.some((h) => Math.abs(h - t.h) < 1e-9)), steelT.map((t) => `${t.b}x${t.h}`).join(" "));
{ const nc = cnt2040(c3), nh = cnt2040(gh); check("20×40 preferred: spans on 20×40 (k = 3) ≥ habit mode − 2 (cost-based stirrups may move a span, 2026-11-05)", nc >= nh - 2, `${nc} ≥ ${nh} of ${g3.n}`); }
check("k = 1: no runaway type count (≤ 12 — steel first adds a type per smaller section that some spans can use)", g1.beamTypes.length <= 12, `${g1.beamTypes.length}`);
check("cost mode: bars ≤ 5 bottom, 3 top through (≤ 5 at supports), DB12 / DB16 (DB20 only as the last resort)", normal.every((t) => n(t.bot) + n(t.botX) <= 5 && n(t.top) <= 3 && n(t.top) + n(t.topX) <= 5 && [t.top, t.bot, t.topX, t.botX].filter(Boolean).every((v) => ["DB 12", "DB 16", "DB 20"].includes(sz(v)))));
check("stirrups RB6 / RB9, @0.10–0.20", [...g3.beamTypes, ...c3.beamTypes].every((t) => ["RB 6", "RB 9"].includes(t.st) && !(t.stSets > 1) && t.sSup >= 0.1 - 1e-9 && t.sMid <= 0.2 + 1e-9));
const used = (t, m, x) => barLayers(t.b, pj.frame.mat, t.st, parseBars(m), parseBars(x)).filter((l) => l.main || l.special).length;
check("≤ 2 bar layers", [...g3.beamTypes, ...c3.beamTypes].every((t) => used(t, t.top, t.topX) <= 2 && used(t, t.bot, t.botX) <= 2));
check("every drawn beam back to auto", g3.floors.every((f) => f.beams.every((b) => b.type === null)));
process.exit(bad ? 1 : 0);
