// Columns standing on beams (engine/plantedCol.js): hand checks of the formulas and of a small model.
// usage: node cli/planted-check.mjs
import { analyzeFrame } from "../web/engine/frame.js";
import { DEFAULT_BEAM_TYPES } from "../web/engine/floor.js";
import { BARS } from "../web/engine/tables.js";
import { ldcOf, ldhOf, plantedColumns } from "../web/engine/plantedCol.js";

let bad = 0, n = 0;
const ok = (name, c, info = "") => { n++; if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); };
const eq = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;

// 1 formulas (kg/cm², cm) — ACI 318-11 12.3.2 and 12.5.2 converted from psi: 0.02·14.223/√14.223 = 0.0754, 0.0003·14.223 = 0.00427
ok("ldc DB12 fy 4000 f'c 240 = 0.075·4000·1.2/√240", eq(ldcOf(1.2, 4000, 240), (0.075 * 4000 * 1.2) / Math.sqrt(240)), ldcOf(1.2, 4000, 240).toFixed(2));
ok("ldc lower limit 0.00427·fy·db governs at high f'c", eq(ldcOf(1.6, 4000, 600), Math.max((0.075 * 4000 * 1.6) / Math.sqrt(600), 0.00427 * 4000 * 1.6, 20)));
ok("ldc ≥ 20 cm", ldcOf(0.6, 2400, 240) === 20);
ok("ldh × 0.7 with side cover ≥ 6.5 cm", eq(ldhOf(1.6, 4000, 240, true), Math.max(((0.075 * 4000 * 1.6) / Math.sqrt(240)) * 0.7, 8 * 1.6, 15)));
ok("ldh ≥ 8db ≥ 15 cm", ldhOf(1.2, 2400, 400, true) === 15);

// 2 model: 2 storeys, 6 m beam on the lower floor between two columns, a column of the upper storey standing at its middle
const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3, coverCol: 3 };
const T = (name, b, h, top, bot, st = "RB 9") => ({ name, b, h, top, topX: "", bot, botX: "", st, sSup: 0.1, sMid: 0.15 });
const C = (Bx, n, mainBar) => ({ name: "C", levels: [{ level: "1", Bx, By: Bx, n, mainBar, tieBar: "RB 6", s: 0.15 }, { level: "2", Bx, By: Bx, n, mainBar, tieBar: "RB 6", s: 0.15 }] });
const model = (beam, col, extra = {}) => ({ mat, analysis: "continuous", beamTypes: [beam, ...DEFAULT_BEAM_TYPES], colTypes: [col], colPick: {},
  floors: [
    { name: "F1", h: 3, t: 0, finish: 0, live: 0, columns: [[0, 0], [6, 0]], beams: [{ a: [0, 0], b: [6, 0], type: 0 }], panels: {} },
    { name: "F2", h: 3, t: 0, finish: 0, live: 0, columns: [[0, 0], [6, 0], [3, 0]], beams: [{ a: [0, 0], b: [3, 0], type: 1 }, { a: [3, 0], b: [6, 0], type: 1 }], panels: {}, pointLoads: [{ p: [3, 0], P: extra.P ?? 1500, name: "test" }] },
  ], ...extra.frame });
const run = (beam, col, extra) => { const fr = model(beam, col, extra), r = analyzeFrame(fr); return { fr, r, row: r.planted[0] }; };

const A = run(T("BX", 0.2, 0.6, "2-DB16", "4-DB16"), C(20, 4, "DB 12"));
ok("one planted column found (3.00, 0.00 on F1)", A.r.planted.length === 1 && A.row.stack === "3.00,0.00" && A.row.hostName === "F1");
const col = A.r.columns.find((c) => c.floor === 1 && c.i === 2), line = A.r.floors[0].lines.find((l) => l.id === A.row.line);
ok("P = the column's accumulated load", eq(A.row.P, col.Pbot), `${A.row.P.toFixed(0)} kg`);
ok("the carrying line has that load as a point load at 3.00 m", (line.extra ?? []).some((e) => eq(e.at, 3, 1e-6) && eq(e.P, col.Pbot)));
ok("beam reactions carry the column load (Σ end columns ≥ point load)", A.r.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.R, 0) >= col.Pbot - 1e-6);
const avail = 60 - 3 - BARS["RB 9"].d - BARS["DB 16"].d;
ok("available straight length = h − cover − stirrup − bottom bar", eq(A.row.avail, avail), `${A.row.avail.toFixed(2)} cm`);
ok("ldc of DB12 fits in a 60 cm beam", A.row.compOk && eq(A.row.ldc, ldcOf(1.2, 4000, 240)));
ok("20×20 on b 0.20: width ok, bars cranked in ≤ 1 cm", A.row.widthOk && A.row.barsIn && A.row.crank > 0 && A.row.crank < 1.01, `crank ${A.row.crank.toFixed(2)} cm`);
ok("bearing P/A ≤ 0.25 f'c", A.row.bearOk && eq(A.row.fbr, A.row.P / 400) && eq(A.row.fAllow, 60));
ok("planted column passes, no warning", A.row.ok && !A.r.warnings.some((w) => w.startsWith("เสาตั้งบนคาน")), A.row.why.join(" · "));

const W = run(T("BX", 0.2, 0.5, "2-DB16", "3-DB16"), C(25, 4, "DB 12"));
ok("25×25 column on a 0.20 beam → NG (wider than the beam)", !W.row.widthOk && !W.row.ok && W.r.warnings.some((w) => w.includes("เสากว้าง 25")));
const B = run(T("BX", 0.2, 0.5, "2-DB16", "3-DB16"), C(20, 8, "DB 16"));
ok("20×20 8-DB16 on b 0.20 → 3 bars across do not fit in the cage", !B.row.barsIn && !B.row.ok && eq(B.row.needIn, 3 * 1.6 + 2 * Math.max(1.5 * 1.6, 4)), `need ${B.row.needIn.toFixed(1)} > ${B.row.inner.toFixed(1)} cm`);
const S = run(T("BS", 0.2, 0.3, "2-DB12", "2-DB12"), C(20, 4, "DB 16"), { P: 500 });
ok("DB16 column bars in a 30 cm beam → ldc 31 cm > available → NG", !S.row.compOk && !S.row.ok && S.r.warnings.some((w) => w.includes("ldc")), `${S.row.avail.toFixed(1)} < ${S.row.ldc.toFixed(1)}`);
// bearing: force a heavy column on the same row (the check itself, not the beam)
const heavy = plantedColumns(A.fr, { ...A.r, columns: A.r.columns.map((c) => (c.floor === 1 && c.i === 2 ? { ...c, Pbot: 40000 } : c)) })[0];
ok("40 t on 20×20: f = 100 > 60 → dowels (40000 − 60·400)/(0.4·4000) = 10 cm² > 4.52 → NG", !heavy.bearOk && eq(heavy.AsDowel, (40000 - 60 * 400) / 1600), `${heavy.AsDowel.toFixed(2)} cm²`);
// tension in the column (3D N < 0) → the hook must fit
const ten = plantedColumns(S.fr, { ...S.r, columns: S.r.columns.map((c) => (c.floor === 1 && c.i === 2 ? { ...c, f3: { N: -800, Mx: 0, My: 0 } } : c)) })[0];
ok("tension 800 kg: ldh checked (DB16 hook in a 30 cm beam does not fit → NG)", ten.tension && ten.T === 800 && !ten.hookOk && ten.why.some((w) => w.includes("แรงดึง")));
// bent-up bars (คอม้า, user's detail): the fewest DB12 that carry the column load share of the more loaded side, ≥ 2, anchored ≥ max(0.30, ld)
{ const b = A.row.bent, Pside = A.row.P * 0.5, n = Math.max(2, Math.ceil(Pside / (BARS["DB 12"].A * 1700 * Math.SQRT1_2)));
  ok("คอม้า: n = ⌈P/2 / (Ab·1700·sin45)⌉ ≥ 2 DB12 for a column at mid-span", b && b.bar === "DB 12" && b.n === n && eq(b.Pside, Pside, 1e-6) && b.ok, b ? `${b.n}-${b.bar} cap ${b.cap.toFixed(0)} ≥ ${Pside.toFixed(0)}` : "none");
  ok("คอม้า: top leg ≥ max(0.30 m, ld top DB12), flat = column + 0.40", b && b.ltop >= 0.3 && eq(b.flat, 0.6)); }
const H = plantedColumns(A.fr, { ...A.r, columns: A.r.columns.map((c) => (c.floor === 1 && c.i === 2 ? { ...c, Pbot: 30000 } : c)) })[0];
ok("คอม้า: 30 t on b 0.20 → the strongest set that fits the cage, the rest left to the stirrups (ok false)", H.bent && H.bent.n >= 2 && H.bent.n * H.bent.db + (H.bent.n - 1) * Math.max(H.bent.db, 3.5) <= H.inner + 1e-9 && H.bent.cap <= H.bent.Vlim + 1e-6 && H.bent.ok === (H.bent.cap >= H.bent.Pside), `${H.bent?.n}-${H.bent?.bar} cap ${H.bent?.cap.toFixed(0)} / ${H.bent?.Pside.toFixed(0)} (limit ${H.bent?.Vlim.toFixed(0)})`);
// no planted column → no rows; a column with a column under it is not planted
const plain = analyzeFrame({ ...A.fr, floors: [{ ...A.fr.floors[0], columns: [[0, 0], [6, 0], [3, 0]] }, A.fr.floors[1]] });
ok("a column with a column under it is not planted", plain.planted.length === 0);

console.log(`planted-check: ${n - bad}/${n}${bad ? ` · ${bad} FAILED` : " all ok"}`);
process.exit(bad ? 1 : 0);
