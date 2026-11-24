// Combined footings (engine/combinedFooting.js + frame.js): independent statics and stress checks on designed footings.
// usage: node cli/combined-check.mjs
import { combinedFooting } from "../web/engine/combinedFooting.js";
import { analyzeFrame } from "../web/engine/frame.js";
import { BARS, allowableFs } from "../web/engine/tables.js";
import fs from "node:fs";

let bad = 0, n = 0;
const ok = (name, c, info = "") => { n++; if (!c) bad++; console.log(`${c ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); };
const mat = { fcPrime: 240, fcFoot: 240, fy: 4000, F: 0.45, capFc: true, Es: 2040000, coverFoot: 7.5 };
const col = (x, y, P, b = 0.3) => ({ p: [x, y], P, bx: b, by: b, stack: `${x},${y}`, dowelBar: "DB 12", dowelN: 8 });

// independent: net line load from the pressure distribution, moment by direct summation of the loads left of a section
function indep(r, cols) {
  const { L, uL, R, e } = r, uc = uL + L / 2, w0 = R / L, w = (u) => w0 * (1 + (12 * e * (u - uc)) / (L * L)), loads = [[0, cols[0].P], [r.s, cols[1].P]];
  const M = (x) => { let m = 0; const N = 2000, h = (x - uL) / N; for (let i = 0; i < N; i++) { const u = uL + (i + 0.5) * h; m += w(u) * h * (x - u); } for (const [ul, P] of loads) if (ul < x) m -= P * (x - ul); return m; };
  return M;
}
const cases = [["unequal 28 t + 6 t, 1.0 m", [col(0, 0, 28000), col(1, 0, 6000)]], ["equal 20 t + 20 t, 1.5 m", [col(0, 0, 20000), col(1.5, 0, 20000)]],
  ["15 t + 25 t, 2.0 m along y", [col(2, 0, 15000), col(2, 2, 25000)]], ["limited end (hi)", [col(0, 0, 20000), col(1.2, 0, 12000)], { hi: 1.8 }]];
for (const [name, cols, extra = {}] of cases) {
  const r = combinedFooting(cols, { mat, qa: 6000, gamma: 1800, Df: 1.2, ...extra });
  ok(`${name}: designed`, r?.ok, r?.error ?? `${r.Bx} × ${r.By} × ${r.t}`);
  if (!r?.ok) continue;
  const [A, B] = r.cols, M = indep(r, [A, B]);
  // soil: gross pressure with the footing and soil weight, linear distribution
  const q = (r.R + 2400 * r.t * r.B * r.L + 1800 * (r.Df - r.t) * r.B * r.L) / (r.B * r.L) + (6 * Math.abs(r.R * r.e)) / (r.B * r.L * r.L);
  ok(`${name}: q max ${q.toFixed(0)} ≤ qa`, q <= 6000 + 1e-6 && Math.abs(q - r.qMax) < 1, `engine ${r.qMax.toFixed(0)}`);
  ok(`${name}: equilibrium (M, V at the far end ≈ 0)`, Math.abs(r.diag.M.at(-1)) < 1 && Math.abs(r.diag.V.at(-1)) < 1);
  // moment at the faces of both columns (independent summation) ≤ the design moments
  const faces = [-A.bx / 2, A.bx / 2, r.s - B.bx / 2, r.s + B.bx / 2].map((u) => M(u));
  const mb = Math.max(0, ...faces), mt = Math.max(0, ...faces.map((m) => -m));
  ok(`${name}: face moments within the design moments`, mb <= r.Mbot + 5 && mt <= r.Mtop + 5, `faces ${faces.map((m) => m.toFixed(0)).join(" / ")} · Mbot ${r.Mbot.toFixed(0)} Mtop ${r.Mtop.toFixed(0)}`);
  // steel: As provided ≥ M/(fs·j·d) independent
  const fs_ = allowableFs(4000, 0.45), As = (m, d) => (m * 100) / (fs_ * r.j * d * 100);
  ok(`${name}: bottom bars ${r.bot.n}-${r.barL} ≥ Mbot/(fs·j·d)`, r.bot.n * BARS[r.barL].A >= As(r.Mbot, r.dB) - 1e-6);
  ok(`${name}: top bars ${r.top.n}-${r.barL} ≥ Mtop/(fs·j·d)`, r.top.n * BARS[r.barL].A >= As(r.Mtop, r.dTop) - 1e-6);
  ok(`${name}: shrinkage steel each way`, r.bot.As >= 0.0018 * r.B * 100 * r.t * 100 - 1e-6);
  ok(`${name}: spacing ≤ min(3h, 45 cm)`, r.bot.s <= Math.min(3 * r.t, 0.45) + 1e-9 && r.top.s <= Math.min(3 * r.t, 0.45) + 1e-9);
  ok(`${name}: one-way shear v ≤ 0.29√f′c, punching ≤ 0.53√f′c`, r.v <= 0.29 * Math.sqrt(240) + 1e-9 && r.vp <= 0.53 * Math.sqrt(240) + 1e-9, `v ${r.v.toFixed(2)} vp ${r.vp.toFixed(2)}`);
  // transverse bands: As ≥ (P/B)·((B − c)/2)²/2 / (fs·j·d)
  ok(`${name}: transverse bands carry the cantilever moment`, r.trans.every((t) => t.As >= (t.M * 100) / (fs_ * r.j * r.dTr * 100) - 1e-6));
  if (extra.hi != null) ok(`${name}: stays inside the limit`, r.uL + r.L <= extra.hi + 1e-9);
}
// skewed pair (> 0.15 m off the line) → not combined
ok("columns not on one line → null", combinedFooting([col(0, 0, 10000), col(1.5, 0.4, 10000)], { mat, qa: 6000 }) === null);

// in the frame: Yasothon with weak soil (qa 6 t/m²) — the pair 3.50,6.90 + 3.50,7.90 becomes one footing, clear of all others
{
  const fr = JSON.parse(fs.readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url))).frame;
  fr.soil = { qa: 6000, gamma: 1800 }; fr.footTypes = [{ name: "F1", kind: "spread", Bx: 0, By: 0, t: 0.3, Df: 1.2, bar: "DB 12", s: 0.15 }];
  const res = analyzeFrame(fr), cf = res.footings.filter((f) => f.kind === "combined");
  ok("Yasothon qa 6 t: a combined footing is made (2 entries, one marked dup)", cf.length === 2 && cf.filter((f) => f.dup).length === 1 && cf[0].combined === cf[1].combined);
  const C = cf[0]?.combined;
  ok("combined footing carries both column loads", C && Math.abs(C.R - cf.reduce((a, f) => a + f.P, 0)) < 1e-6);
  const rect = (f) => ({ c: f.center ?? f.p, Bx: f.r.Bx, By: f.r.By }), gap = (a, b) => { const A = rect(a), B = rect(b); return Math.max(Math.abs(A.c[0] - B.c[0]) - (A.Bx + B.Bx) / 2, Math.abs(A.c[1] - B.c[1]) - (A.By + B.By) / 2); };
  ok("combined footing clears every other footing ≥ 0.10 m", res.footings.filter((f) => !f.combined).every((f) => gap(cf[0], f) >= 0.1 - 1e-9));
  const off = analyzeFrame({ ...fr, combineFootings: false });
  ok("combineFootings false → no combined footing", !off.footings.some((f) => f.kind === "combined"));
}
console.log(`combined-check: ${n - bad}/${n}${bad ? ` · ${bad} FAILED` : " all ok"}`);
process.exit(bad ? 1 : 0);
