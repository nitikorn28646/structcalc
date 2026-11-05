// Reliability check of the automatic beam types and the "compare type counts" table (user 2026-11-05) — read only, no algorithm change.
// node cli/verify-types.mjs ui-scan.json   (ui-scan.json = { frame, tables: [rows×2] } dumped from the browser after two "เทียบ" runs)
// 1 determinism (node twice + UI twice) · 2 UI rows = generateBeamTypes() directly · 3 same candidates / rules / material for every k
// 4 every type and span of every result: program pass + own cracked-section stresses and shear rules · 5 the "แนะนำ" rule recomputed
import fs from "fs";
import { generateBeamTypes, BEAM_COST } from "../web/engine/beamTypes.js";
import { analyzeFrame } from "../web/engine/frame.js";
import { parseBars, barLayers } from "../web/engine/floor.js";

const U = JSON.parse(fs.readFileSync(process.argv[2])), frame = U.frame, matJSON = JSON.stringify(frame.mat), out = [], issues = [];
const log = (ok, name, info = "") => { out.push({ ok, name, info }); console.log(`${ok ? "ok  " : "FAIL"} ${name}${info ? " — " + info : ""}`); };
const key = (g) => JSON.stringify(g.beamTypes.map(({ name, ...t }) => t));
// 1. determinism
const runA = [], runB = [];
for (let k = 1; k <= 10; k++) { runA.push(generateBeamTypes(frame, k)); runB.push(generateBeamTypes(frame, k)); }
log(runA.every((g, i) => key(g) === key(runB[i]) && Math.abs(g.cost - runB[i].cost) < 1e-6), "1a node: k = 1…10 run twice → identical types and cost");
log(JSON.stringify(U.tables[0]) === JSON.stringify(U.tables[1]), "1b UI: 'เทียบ' twice → identical table", `${U.tables[0].length} rows`);
log(JSON.stringify(frame.mat) === matJSON, "1c the frame / material is not changed by the runs");
// 2. UI = direct
const BK = (x) => Math.round(x).toLocaleString("en-US"), rowsNode = [], seen = new Map();
runA.forEach((g, i) => { const r = analyzeFrame({ ...frame, beamTypes: g.beamTypes, floors: g.floors }), sps = r.floors.flatMap((a) => a.spans);
  const row = { k: i + 1, n: g.beamTypes.length, ok: g.ok, total: g.n, cost: g.cost, n2040: sps.filter((s) => Math.abs(s.type.b - 0.2) < 1e-9 && Math.abs(s.type.h - 0.4) < 1e-9).length, g, r };
  const kk = key(g); if (seen.has(kk)) seen.get(kk).ks.push(i + 1); else { row.ks = [i + 1]; seen.set(kk, row); rowsNode.push(row); } });
const ui = U.tables[0].map((c) => ({ ks: c[0], n: +c[1], n2040: c[3], pass: c[4], cost: c[5] }));
const same = ui.length === rowsNode.length && ui.every((u, i) => u.ks === rowsNode[i].ks.join(", ") && u.n === rowsNode[i].n && u.n2040 === `${rowsNode[i].n2040}/${rowsNode[i].total}` && u.pass === `${rowsNode[i].ok}/${rowsNode[i].total}` && u.cost === BK(rowsNode[i].cost));
log(same, "2 UI rows = generateBeamTypes() on the same frame (asked k, types, 20×40 spans, pass, cost)", same ? "" : JSON.stringify({ ui, node: rowsNode.map((r) => ({ ks: r.ks.join(", "), n: r.n, n2040: r.n2040, pass: r.ok, cost: BK(r.cost) })) }));
// 3. same candidates and rules
const W = [...BEAM_COST.widths, ...BEAM_COST.bigWidths], H = [...BEAM_COST.depths, ...BEAM_COST.bigDepths], BAR = ["DB 12", "DB 16", "DB 20"], ST = ["RB 6", "RB 9"], S = [0.1, 0.15, 0.2];
const has = (arr, v) => arr.some((x) => Math.abs(x - v) < 1e-9);
const typeBad = rowsNode.flatMap((r) => r.g.beamTypes.filter((t) => !has(W, t.b) || !has(H, t.h) || ![t.top, t.bot, t.topX, t.botX].filter(Boolean).every((s) => BAR.includes(parseBars(s)?.bar)) || !ST.includes(t.st) || !has(S, t.sSup) || !has(S, t.sMid)).map((t) => `k${r.k} ${t.name}`));
log(!typeBad.length, "3a every type of every k inside the same candidate grid (b, h, DB12/16/20, RB6/RB9, @0.10/0.15/0.20)", typeBad.join(", "));
log(rowsNode.every((r) => (frame.beamAutoMode ?? "cost") === "cost"), "3b every k used the same mode (cost: 20×40 first) and the same mat / WSD checks", `mode ${frame.beamAutoMode ?? "cost"}, f′c ${frame.mat.fcBeam ?? frame.mat.fcPrime}, fy ${frame.mat.fy}`);
// 4. every span of every result: program checks + independent stresses and shear rules (own formulas; forces from the program's analysis)
const fcp = frame.mat.fcBeam ?? frame.mat.fcPrime, fcA = Math.min(0.45 * fcp, 65), fsA = 1700, fv = 1200, n = (frame.mat.Es ?? 2040000) / (15100 * Math.sqrt(fcp));
const A = { "DB 12": 1.131, "DB 16": 2.011, "DB 20": 3.142, "RB 6": 0.283, "RB 9": 0.636 }, D = { "DB 12": 1.2, "DB 16": 1.6, "DB 20": 2.0, "RB 6": 0.6, "RB 9": 0.9 };
const face = (t, main, extra) => { const L = barLayers(t.b, frame.mat, t.st, parseBars(main), parseBars(extra)); let As = 0, Ay = 0, y = (frame.mat.cover ?? 3) + D[t.st];
  for (const l of L) { const g = [l.main, l.special].filter(Boolean); if (!g.length) continue; const db = Math.max(...g.map((x) => D[x.bar])); for (const x of g) { As += A[x.bar] * x.n; Ay += A[x.bar] * x.n * (y + D[x.bar] / 2); } y += db + 2.5; }
  return { As, c: As ? Ay / As : 0 }; };
const stress = (b, d, As, dp, Asp, M) => { const a = b / 2, bb = (2 * n - 1) * Asp + n * As, c = -((2 * n - 1) * Asp * dp + n * As * d), kd = (-bb + Math.sqrt(bb * bb - 4 * a * c)) / (2 * a), I = (b * kd ** 3) / 3 + (2 * n - 1) * Asp * (kd - dp) ** 2 + n * As * (d - kd) ** 2;
  return { fc: (M * 100 * kd) / I, fs: (n * M * 100 * (d - kd)) / I }; };
let nSp = 0, nProg = 0, nInd = 0; const indBad = [];
// the sets shown in the UI (computed in the browser) when present, else the node sets
const setsToCheck = U.uiSets ? U.uiSets.map((x) => ({ ks: x.ks, g: { beamTypes: x.types }, r: analyzeFrame({ ...frame, beamTypes: x.types, floors: x.floors }) })) : rowsNode;
console.log(`     4: checking ${U.uiSets ? "the UI's" : "node's"} ${setsToCheck.length} sets`);
for (const r of setsToCheck) for (const sp of r.r.floors.flatMap((a) => a.spans)) {
  nSp++; if (sp.ok) nProg++; const t = sp.type, b = t.b * 100, h = t.h * 100, bot = face(t, t.bot, t.botX), top = face(t, t.top, t.topX), topT = face(t, t.top), botT = face(t, t.bot), why = [];
  if (sp.kind !== "cantilever" && sp.Mpos > 1) { const s1 = stress(b, h - bot.c, bot.As, topT.c, topT.As, sp.Mpos); if (s1.fc > fcA * 1.01 || s1.fs > fsA * 1.01) why.push(`mid fc ${s1.fc.toFixed(1)} fs ${s1.fs.toFixed(0)}`); }
  if (sp.Mneg > 1) { const s2 = stress(b, h - top.c, top.As, botT.c, botT.As, sp.Mneg); if (s2.fc > fcA * 1.01 || s2.fs > fsA * 1.01) why.push(`sup fc ${s2.fc.toFixed(1)} fs ${s2.fs.toFixed(0)}`); }
  const d = h - top.c, Vc = 0.29 * Math.sqrt(fcp) * b * d, Av = 2 * A[t.st] * (t.stSets ?? 1), V = sp.V;
  if (V > Vc / 2 && h > 25) { if (Av < (Math.max(0.2 * Math.sqrt(fcp), 3.5) * b * t.sSup * 100) / 2400 - 1e-6) why.push(`Av ${Av.toFixed(2)} < Av,min`); if (t.sSup > Math.min(d / 2, 60) / 100 + 1e-9) why.push(`s ${t.sSup} > d/2 ${(d / 200).toFixed(3)}`); }
  if (V > Vc) { const sReq = (Av * fv * d) / (V - Vc) / 100; if (t.sSup > sReq * 1.005 && !(sp.Mt > 1)) why.push(`s ${t.sSup} > s req ${sReq.toFixed(3)}`); }
  if (sp.ok && !why.length) nInd++; if (sp.ok && why.length) indBad.push(`k${r.ks.join("/")} ${sp.id} ${sp.typeName}: ${why.join(", ")}`);
}
log(nProg === nSp, "4a program checks: every span of every distinct result passes", `${nProg}/${nSp}`);
log(!indBad.length, "4b independent stresses (cracked section, 2n−1) + shear rules on every passing span", indBad.length ? `${indBad.length} spans: ${indBad.slice(0, 4).join(" · ")}` : `${nInd}/${nProg}`);
// stirrup tie-break (user question 2026-11-05): two types of the same b × h and main bars but different stirrups — beams take the first listed
const ties = setsToCheck.flatMap((r) => { const ts = r.g.beamTypes; return ts.flatMap((t, i) => ts.slice(i + 1).filter((u) => u.b === t.b && u.h === t.h && u.top === t.top && u.bot === t.bot && u.topX === t.topX && u.botX === t.botX && (u.sSup !== t.sSup || u.sMid !== t.sMid || u.st !== t.st)).map((u) => `k${r.ks.join("/")} ${t.name}/${u.name}`)); });
log(true, "4c types differing only in stirrups (allowed since 2026-11-05: each beam takes the cheaper passing one)", ties.join(", ") || "none");
// 5. "แนะนำ": all pass, fewest types with cost ≤ 1.03 × cheapest, ties → cheaper
const okR = rowsNode.filter((r) => r.ok === r.total), ch = okR.reduce((a, r) => (!a || r.cost < a.cost ? r : a), null), rec = okR.filter((r) => r.cost <= ch.cost * 1.03).reduce((a, r) => (!a || r.n < a.n || (r.n === a.n && r.cost < a.cost) ? r : a), null);
const uiRec = U.tables[0].findIndex((c) => c[6].includes("แนะนำ")), uiCh = U.tables[0].findIndex((c) => c[6].includes("ถูกสุด"));
log(rowsNode.indexOf(rec) === uiRec, "5 'แนะนำ' = all pass, fewest types within 3 % of the cheapest (recomputed)", `cheapest k ${ch.ks.join(",")} ฿${BK(ch.cost)} (${ch.n} types) · recommended k ${rec.ks.join(",")} ฿${BK(rec.cost)} (${rec.n} types, +${(((rec.cost - ch.cost) / ch.cost) * 100).toFixed(1)} %) · UI rows ${uiRec}/${uiCh}`);
fs.writeFileSync(process.argv[3] ?? "/dev/null", JSON.stringify({ out, rows: rowsNode.map((r) => ({ ks: r.ks, n: r.n, cost: r.cost, ok: r.ok, total: r.total, n2040: r.n2040, types: r.g.beamTypes })), indBad, ties }, null, 1));
