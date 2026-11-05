// Column stability / slenderness checks (WP2 + WP4, 2026-11-05): node cli/colstab-check.mjs
import fs from "fs";
import { checkColumn, analyzeFrame } from "../web/engine/frame.js";
import { tiedColumn } from "../web/engine/column.js";
import { kSway } from "../web/engine/colStability.js";
const res = []; const ck = (ok, name, info = "") => { res.push(ok); console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " — " + info : ""}`); };
const mat = { fcPrime: 240, F: 0.45, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
// 1 alignment chart (ACI 318-11 Fig. R10.10.1.1 b): sway k
for (const [a, b, ref] of [[0, 0, 1], [1, 1, 1.32], [Infinity, 0, 2], [10, 10, 3.0], [2, 2, 1.6]]) { const k = kSway(a, b); ck(Math.abs(k - ref) < 0.02 * ref, `sway k(ψ ${a}, ${b})`, `${k.toFixed(3)} vs ${ref}`); }
// 2 one reduction only: R = 1 given → same as the original short-column path; R = 0.8 → P/0.8 once
const lv = { Bx: 20, By: 20, n: 6, mainBar: "DB 12", tieBar: "RB 6", s: 0.15 };
const a = checkColumn(lv, 12000, 2.8, mat, {}), b = checkColumn(lv, 12000, 2.8, mat, {}, { R: 1, klr: 56 });
ck(Math.abs(a.util - b.util) < 1e-12, "external R = 1 on a short column = original path", `${a.util.toFixed(4)} / ${b.util.toFixed(4)}`);
const c = checkColumn(lv, 12000, 2.8, mat, {}, { R: 0.8, klr: 70 });
ck(Math.abs(c.r.Pd - 12000 / 0.8) < 1e-6, "external R = 0.8 → Pd = P / R once", `${c.r.Pd.toFixed(1)}`);
const d = checkColumn(lv, 12000, 4.0, mat, {}, { R: 0.8, klr: 70 }); // L/B 20 > 15: column.js would reduce by itself — must not happen again
ck(Math.abs(d.r.Pd - 12000 / 0.8) < 1e-6 && d.r.R === 0.8, "L/B > 15 with external R: column.js does not reduce a second time", `R ${d.r.R} Pd ${d.r.Pd.toFixed(1)}`);
// 3 K1: tension-controlled with Mx only — external path gives a finite R′
const big = checkColumn(lv, 3000, 2.8, mat, { Mx: 1500 }, { R: 0.7, klr: 80 });
ck(big.r.mode === "III" ? Number.isFinite(big.r.R) && big.util < 9 : true, "K1 mode III with Mx only: R′ finite (external path)", `mode ${big.r.mode} R ${big.r.R?.toFixed(3)}`);
const old = (() => { try { return tiedColumn({ ...mat, L: 2.8, Bx: 20, By: 20, nx: 4, ny: 4, mainBar: "DB 12", tieBar: "RB 6", tieSets: 1, P: 3000, Mx: 1500, My: 0, frameCase: 2, beamTL: { L: 400, b: 20, t: 40 }, beamTR: { L: 400, b: 20, t: 40 }, beamBL: { L: 400, b: 20, t: 40 }, beamBR: { L: 400, b: 20, t: 40 }, colTop: { L: 280, bx: 20, by: 20 }, colThis: { L: 280, bx: 20, by: 20 }, colThisB: { L: 280, bx: 20, by: 20 }, colBot: { L: 280, bx: 20, by: 20 } }); } catch { return null; } })();
ck(!!old && (old.mode !== "III" || Number.isFinite(old.R)), "K1 default column.js path: mode III with Mx only gives a finite R′ (was NaN)", `mode ${old?.mode} R ${old?.R}`);
// K2: narrow 20×50 bending about the weak axis (My) — the moment must be checked (mode II/III), not axial only (mode I)
const k2 = tiedColumn({ ...mat, fcPrime: 180, cover: 2.5, L: 3, Bx: 20, By: 50, nx: 4, ny: 8, mainBar: "DB 16", tieBar: "RB 6", tieSets: 1, P: 20000, Mx: 100, My: 1000, frameCase: 2, beamTL: { L: 450, b: 20, t: 40 }, beamTR: { L: 450, b: 20, t: 40 }, beamBL: { L: 450, b: 20, t: 45 }, beamBR: { L: 450, b: 20, t: 45 }, colTop: { L: 700, bx: 45, by: 45 }, colThis: { L: 400, bx: 45, by: 45 }, colThisB: { L: 400, bx: 45, by: 45 }, colBot: { L: 700, bx: 45, by: 45 } });
ck(k2.mode !== "I", "K2 axis pairing: 20×50 with My about the weak axis is not axial-only", `mode ${k2.mode} (ex ${k2.ex.toFixed(2)} vs ea ${k2.eay.toFixed(2)})`);
// 4 K3: minimum eccentricity about each axis — rectangular 20×40, no moments: the weaker axis governs
const rect = checkColumn({ ...lv, By: 40, n: 8 }, 20000, 2.8, mat, {});
ck(Math.abs(rect.util - Math.max(rect.utilX, rect.utilY)) < 1e-12 && rect.utilX !== rect.utilY, "K3 e min about x and y, worse governs", `x ${rect.utilX.toFixed(3)} y ${rect.utilY.toFixed(3)} → ${rect.eminAxis}`);
// 5 K5: 8-DB20 in 20×20 does not fit
const crowd = checkColumn({ ...lv, n: 8, mainBar: "DB 20" }, 12000, 2.8, mat, {});
ck(crowd.fit.ok === false && crowd.ok === false, "K5 8-DB20 in 20×20: clear spacing NG", `clear ${crowd.fit.clear.toFixed(1)} < ${crowd.fit.clearReq.toFixed(1)} cm`);
const fine = checkColumn(lv, 12000, 2.8, mat, {}); ck(fine.fit.ok, "K5 6-DB12 in 20×20 fits", `clear ${fine.fit.clear.toFixed(1)} cm`);
// 6 K6: tension
const t = checkColumn(lv, -5000, 2.8, mat, {}); ck(!!t.tension && Math.abs(t.tension.cap - 6 * 1.13 * 1700) < 1 && t.tension.ok, "K6 tension 5 t on 6-DB12: As·fs", `cap ${t.tension.cap.toFixed(0)}`);
const t2 = checkColumn(lv, -15000, 2.8, mat, {}); ck(!!t2.tension && !t2.ok, "K6 tension 15 t on 6-DB12: NG", `util ${t2.util.toFixed(2)}`);
// 7 project: R used never above the old rule; Q of Yasothon floor 2 vs the independent audit (cli/audit-column3.mjs, ∝ w·h, 1.2D + 1.6L: 0.0643)
const pj = JSON.parse(fs.readFileSync("web/public/projects/yasothon.json")), r = analyzeFrame(pj.frame);
const sl = r.columns.map((x) => x.check?.slender).filter(Boolean);
ck(sl.length === r.columns.length && sl.every((s) => s.R <= s.Rold + 1e-12), "every column: R used ≤ R of the previous rule (no safety lowered)", `${sl.length} columns`);
const q2 = r.stability?.storeys?.[1]?.Q; ck(Math.abs(q2 - 0.0643) < 0.03 * 0.0643, "Q Yasothon ชั้น 2 = independent audit", `${q2?.toFixed(4)} vs 0.0643`);
ck(r.stability.storeys[1].sway && !r.stability.storeys[0].sway, "ชั้น 2 sway, คานคอดิน non-sway");
console.log(`${res.filter(Boolean).length}/${res.length}`); if (!res.every(Boolean)) process.exitCode = 1;
