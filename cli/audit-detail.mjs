// Reinforcement DETAILING audit (user 2026-11-20: "ตรวจเช็คการเสริมเหล็กใหม่ อย่างละเอียด") — independent re-check that what the drawings
// say (type sections + notes, engine/beamDetail.js) matches what the analysis checked, and the detailing rules, for every member:
//   beams   B1 drawn steel ≥ the steel the check counted (support top / support bottom / mid top / mid bottom)
//           B2 top extra length written (L/4, L/3, full) ≥ the cut-off each span needs (floor.js cutoffs) on both sides
//           B3 bottom extra written (3L/5, 4L/5, full, centred) covers the zone each span needs
//           B4 ACI 318-11 12.11.1: through bottom bars ≥ 1/3 (simple) or 1/4 (continuous) of the mid-span bottom steel
//           B5 bars fit the layers, no lone bar in an upper layer (barLayers odd / over)
//           B6 ≥ 2 through bars on each face (stirrup corners)
//           B7 clear spacing in every drawn layer ≥ max(db, 2.5 cm, mat.barClear) (ACI 7.6.1)
//           B8 cantilevers: top bars over the whole cantilever + back span ≥ max(L, ld), or through / anchored note
//           B9 beams at different levels: top bars hooked in the column (ldh) or the h − Δ check passes
//           B10 the span passes its design check (reasons listed)
//   columns C1 ρ = As/Ag 1 – 8 % (ACI 10.9.1) · C2 ≥ 4 bars · C3 clear spacing ≥ max(1.5db, 4 cm) (7.6.3) · C4 ties s ≤ 16db, 48dt, least side (7.10.5)
//           C5 the column passes its check
//   slabs   S1 main s ≤ min(3t, 45 cm), temp s ≤ min(5t, 45 cm) (7.6.5, 7.12.2) · S2 provided As ≥ required and ≥ ρ·b·t by the bar's grade
//           (SR24 0.0025 · SD30 0.0020 · SD40 0.0018; ACI 318-11 7.12.2.1, 10.5.4)
//           S3 the slab / stair passes · footings F1 pass
// node cli/audit-detail.mjs <project.json> [panelKey=dz ...]   (e.g. "5.00,0.75=-0.1" to set a slab level before the run)
import fs from "fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { BARS, STIRRUPS } from "../web/engine/tables.js";
import { barLayers, parseBars, faceBars, spanReasons, DEFAULT_BAR_CLEAR } from "../web/engine/floor.js";
import { extraSpec, sectionBarSpec, sectionNotes, fullExtras } from "../web/engine/beamDetail.js";
import { designSlabs } from "../web/engine/slabDesign.js";
import { levelJoints } from "../web/engine/levelDetail.js";

const file = process.argv[2];
const P = JSON.parse(fs.readFileSync(file)), fr = P.frame ?? P;
for (const a of process.argv.slice(3)) { const [k, v] = a.split("="); for (const f of fr.floors) if (f.panels?.[k]) f.panels[k].dz = +v; }
const mat = fr.mat ?? {}, types = fr.beamTypes ?? [], res = analyzeFrame(fr);
const spans = res.floors.flatMap((an, k) => an.spans.map((s) => Object.assign(s, { floor: k })));
const issues = [], stat = {};
const tick = (code, ok, msg) => { stat[code] ??= { n: 0, bad: 0 }; stat[code].n++; if (!ok) { stat[code].bad++; issues.push(`${code} ${msg}`); } };
const As = (s) => { const b = parseBars(s); return b ? b.n * BARS[b.bar].A : 0; };
const tol = 0.005;
const lbl = (sp) => `${fr.floors[sp.floor].name} ช่วง ${sp.id} ${sp.typeName ?? ""} L ${sp.len.toFixed(2)}`;

// ---------------- beams
for (const sp of spans) {
  const ti = sp.typeIdx, t = types[ti]; if (!t) continue;
  const ext = extraSpec(ti, spans), cant = sp.kind === "cantilever";
  const atS = cant ? "cant" : "sup", spS = sectionBarSpec(t, atS, ext), spM = cant ? null : sectionBarSpec(t, "mid", ext);
  const drawn = (pair) => As(pair[0]) + As(pair[1]);
  // B1: what the check counted (floor.js checkSpan: sup = top + topX over bot; mid = top over bot + botX)
  tick("B1", drawn(spS.top) >= As(t.top) + As(t.topX) - 1e-9, `${lbl(sp)}: เหล็กบนหัวเสาที่เขียน ${drawn(spS.top).toFixed(2)} < ที่ใช้ตรวจ ${(As(t.top) + As(t.topX)).toFixed(2)} ซม.²`);
  tick("B1", drawn(spS.bot) >= As(t.bot) - 1e-9, `${lbl(sp)}: เหล็กล่างหัวเสาที่เขียนน้อยกว่าที่ใช้ตรวจ`);
  if (spM) { tick("B1", drawn(spM.bot) >= As(t.bot) + As(t.botX) - 1e-9, `${lbl(sp)}: เหล็กล่างกลางคานที่เขียน ${drawn(spM.bot).toFixed(2)} < ที่ใช้ตรวจ ${(As(t.bot) + As(t.botX)).toFixed(2)}`);
    tick("B1", drawn(spM.top) >= As(t.top) - 1e-9, `${lbl(sp)}: เหล็กบนกลางคานที่เขียนน้อยกว่าที่ใช้ตรวจ`); }
  // notes say the same count as the drawing (one count per face, extras separate)
  for (const [at, spec] of [[atS, spS], ...(spM ? [["mid", spM]] : [])]) {
    const notes = sectionNotes(t, at, ext), num = (side) => notes.filter((n) => n.side === side).reduce((s, n) => { const m = /^(\d+)-(\w+ \d+)/.exec(n.text); return s + (m ? +m[1] * (BARS[m[2]]?.A ?? 0) : 0); }, 0);
    tick("B1", Math.abs(num("top") - drawn(spec.top)) < 1e-6 && Math.abs(num("bot") - drawn(spec.bot)) < 1e-6, `${lbl(sp)} (${at}): ป้ายเหล็ก ≠ เหล็กที่วาด (บน ${num("top").toFixed(2)}/${drawn(spec.top).toFixed(2)} · ล่าง ${num("bot").toFixed(2)}/${drawn(spec.bot).toFixed(2)})`);
  }
  const c = sp.cut ?? sp.check?.cut;
  // B2 top extras
  if (!cant && parseBars(t.topX) && c?.top) {
    const f = ext.top === "L/4" ? 0.25 : ext.top === "L/3" ? 1 / 3 : Infinity, needFull = sp.topFull || c.topFull;
    if (needFull) tick("B2", f === Infinity || !!ext.topNote, `${lbl(sp)}: ต้องเหล็กเสริมบนยาวตลอด แต่ป้าย ${ext.top} ไม่มีหมายเหตุ`);
    else for (const s of c.top) if (!s.none) tick("B2", s.len <= f * sp.len + tol, `${lbl(sp)}: เหล็กเสริมบนด้าน ${s.side} ต้องยาว ${s.len.toFixed(2)} ม. > ${ext.top} = ${(f * sp.len).toFixed(2)} ม.`);
  }
  // B3 bottom extras
  if (!cant && parseBars(t.botX) && c?.bot && !c.bot.notNeeded) {
    const f = ext.bot === "3L/5" ? 0.6 : ext.bot === "4L/5" ? 0.8 : Infinity, e = ((1 - f) / 2) * sp.len;
    if (c.bot.full) tick("B3", f === Infinity || !!ext.botNote, `${lbl(sp)}: ต้องเหล็กเสริมล่างยาวตลอด แต่ป้าย ${ext.bot}`);
    else tick("B3", f === Infinity || (c.bot.start >= e - tol && c.bot.end <= sp.len - e + tol), `${lbl(sp)}: เหล็กเสริมล่างต้องคลุม ${c.bot.start.toFixed(2)}–${c.bot.end.toFixed(2)} ม. แต่ ${ext.bot} คลุม ${e.toFixed(2)}–${(sp.len - e).toFixed(2)}`);
  }
  // B4 12.11.1
  if (!cant) { const frac = sp.kind === "simple" ? 1 / 3 : 1 / 4, tot = As(t.bot) + As(t.botX);
    tick("B4", As(t.bot) >= frac * tot - 1e-9, `${lbl(sp)}: เหล็กล่างที่เข้าจุดรองรับ ${As(t.bot).toFixed(2)} < ${frac === 1 / 3 ? "1/3" : "1/4"} ของ ${tot.toFixed(2)} ซม.² (ACI 12.11.1)`); }
  // B5 / B7 layers of every drawn face
  for (const pair of [spS.top, spS.bot, ...(spM ? [spM.top, spM.bot] : [])]) {
    const L = barLayers(t.b, mat, t.st, parseBars(pair[0]), parseBars(pair[1]));
    tick("B5", !L.odd && !L.over, `${lbl(sp)}: ${pair.filter(Boolean).join(" + ")} จัดชั้นไม่ได้ (${L.odd ? "ชั้นบนเหลือเส้นเดียว" : "เกินจำนวนชั้น"})`);
    const ds = BARS[t.st]?.d ?? 0.6, cover = mat.cover ?? 3, need = (db) => Math.max(db, 2.5, mat.barClear ?? DEFAULT_BAR_CLEAR);
    for (const l of L.filter((x) => x && (x.main || x.special))) {
      const parts = [l.main, l.special].filter(Boolean), n = parts.reduce((s, g) => s + g.n, 0), dmax = Math.max(...parts.map((g) => BARS[g.bar].d)), sumd = parts.reduce((s, g) => s + g.n * BARS[g.bar].d, 0);
      if (n < 2) continue;
      const clear = (t.b * 100 - 2 * cover - 2 * ds - sumd) / (n - 1);
      tick("B7", clear >= need(dmax) - 1e-6, `${lbl(sp)}: ระยะห่างเหล็ก ${n} เส้นในชั้น = ${clear.toFixed(1)} ซม. < ${need(dmax).toFixed(1)} ซม.`);
    }
  }
  // B6
  tick("B6", (parseBars(t.top)?.n ?? 0) >= 2 && (parseBars(t.bot)?.n ?? 0) >= 2, `${t.name}: เหล็กตลอดน้อยกว่า 2 เส้นต่อด้าน`);
  // B8 cantilevers
  if (cant && sp.fixedAt) { const d = sp.detail;
    tick("B8", !!d && (d.noBack || d.through || d.ext >= Math.max(sp.len, d.ld) - tol), `${lbl(sp)}: คานยื่น เหล็กบนฝากช่วงหลัง ${d ? d.ext.toFixed(2) : "-"} < max(L, ld) ${d ? Math.max(sp.len, d.ld).toFixed(2) : ""}`);
    if (d?.noBack) issues.push(`B8i ${lbl(sp)}: คานยื่นไม่มีช่วงหลัง — เหล็กบนต้องฝังในเสา (ตรวจระยะฝัง)`); }
  // B10
  tick("B10", sp.ok, `${lbl(sp)}: ไม่ผ่าน — ${spanReasons(sp.check).join(" · ")}`);
}
// B9 joints at different levels
for (const r of levelJoints(fr, res)) tick("B9", r.ok, `${r.floorName} แนว ${r.line + 1} (${r.p.join(", ")}): จุดต่างระดับ ${r.mode}`);

// ---------------- columns
for (const c of res.columns) {
  const lv = c.lv; if (!lv) continue;
  const at = `เสา ${c.stack} (${fr.floors[c.floor].name}) ${lv.Bx}×${lv.By} ${lv.n}-${lv.mainBar} ${lv.tieBar} @${lv.s}`;
  const b = BARS[lv.mainBar], tie = STIRRUPS[lv.tieBar] ?? BARS[lv.tieBar] ?? { d: 0.6 }, Ast = lv.n * b.A, rho = Ast / (lv.Bx * lv.By);
  tick("C1", rho >= 0.01 - 1e-9 && rho <= 0.08 + 1e-9, `${at}: ρ = ${(rho * 100).toFixed(2)} % (1–8 %)`);
  tick("C2", lv.n >= 4, `${at}: เหล็กยืนน้อยกว่า 4 เส้น`);
  const [nx, ny] = faceBars(lv.n), cov = mat.coverCol ?? mat.cover ?? 3;
  for (const [B, m] of [[lv.Bx, nx / 2], [lv.By, ny / 2]]) { const clear = (B - 2 * cov - 2 * tie.d - m * b.d) / (m - 1);
    tick("C3", clear >= Math.max(1.5 * b.d, 4) - 1e-6, `${at}: ระยะห่างเหล็กยืน ${clear.toFixed(1)} ซม. < ${Math.max(1.5 * b.d, 4).toFixed(1)} ซม.`); }
  const sMax = Math.min(16 * b.d, 48 * tie.d, Math.min(lv.Bx, lv.By)) / 100;
  tick("C4", lv.s <= sMax + 1e-9, `${at}: ระยะปลอก ${lv.s} > ${sMax.toFixed(3)} ม. (16db / 48dt / ด้านแคบ)`);
  tick("C5", c.ok, `${at}: ไม่ผ่าน`);
}

// ---------------- slabs / stairs (thickness: the panel's / the stair's; two-way rows carry short / long texts)
const RT = await import("../web/engine/floor.js").then((m) => m.stairRT);
res.floors.forEach((an, k) => { for (const row of designSlabs(an, fr.floors[k], mat)) {
  const at = `${fr.floors[k].name} ${row.name}`, r = row.r;
  if (!r) { if (row.kind === "S") issues.push(`S0i ${at}: ไม่ได้ออกแบบในโปรแกรม — ${row.note ?? ""}`); continue; }
  const t = row.kind === "ST" ? RT(fr.floors[k].stairs[row.si]).t : row.kind === "C" ? (an.cants[row.ci]?.t ?? 0.1) : (an.panels.find((p) => p.key === row.key)?.t ?? 0.1);
  const bars = row.way === "สองทาง" ? [[r.shortText, 3, "ด้านสั้น", Math.max(...(r.AsS ?? [0]))], [r.longText, 3, "ด้านยาว", Math.max(...(r.AsL ?? [0]))]] : [[r.mainText, 3, "หลัก", r.As], [r.tempText, 5, "กันร้าว", null]];
  for (const [txt, kmax, name, req] of bars) { const m = /^(\w+ \d+) @ ([\d.]+)/.exec(txt ?? ""); if (!m) { issues.push(`S0i ${at}: อ่านเหล็ก${name}ไม่ได้ "${txt}"`); continue; }
    const sp = +m[2], A = BARS[m[1]].A / sp, smax = Math.min(kmax * t, 0.45);
    tick("S1", sp <= smax + 1e-9, `${at}: เหล็ก${name} @${sp} > min(${kmax}t, 0.45) = ${smax.toFixed(2)} ม.`);
    if (req != null) tick("S2", A >= req - 1e-6, `${at}: เหล็ก${name} ${A.toFixed(2)} < ต้องการ ${(+req).toFixed(2)} ซม.²/ม.`);
    const rho = m[1].startsWith("RB") ? 0.0025 : (mat.fy ?? 4000) >= 4000 ? 0.0018 : 0.002; // SR24 / SD30 / SD40 (ACI 318-11 7.12.2.1, 10.5.4; the sheet's table)
    tick("S2", A >= rho * 100 * t * 100 - 1e-6, `${at}: เหล็ก${name} ${A.toFixed(2)} < ${rho}·b·t = ${(rho * 100 * t * 100).toFixed(2)} ซม.²/ม.`); }
  tick("S3", row.ok, `${at}: ไม่ผ่าน`); } });
for (const f of res.footings ?? []) tick("F1", f.ok, `ฐานราก ${f.stack ?? f.key}: ไม่ผ่าน`);

const names = { B1: "เหล็กที่เขียนในแบบ = เหล็กที่ใช้ตรวจ", B2: "ความยาวเหล็กเสริมบน ≥ ระยะตัดที่ต้องการ", B3: "ช่วงเหล็กเสริมล่างคลุมที่ต้องการ", B4: "เหล็กล่างเข้าจุดรองรับ (12.11.1)",
  B5: "จัดชั้นเหล็กได้ ไม่มีเส้นเดียวลอย", B6: "เหล็กตลอด ≥ 2 เส้นต่อด้าน", B7: "ระยะห่างเหล็กในชั้น (7.6.1)", B8: "คานยื่น: เหล็กบนฝากช่วงหลัง", B9: "จุดคานต่างระดับ", B10: "คานผ่านการออกแบบ",
  C1: "เสา ρ 1–8 %", C2: "เสา ≥ 4 เส้น", C3: "เสา ระยะห่างเหล็กยืน (7.6.3)", C4: "เสา ระยะปลอก (7.10.5)", C5: "เสาผ่านการออกแบบ",
  S1: "พื้น ระยะเหล็กสูงสุด", S2: "พื้น เหล็กพอ / เหล็กกันร้าวขั้นต่ำ", S3: "พื้น/บันไดผ่าน", F1: "ฐานรากผ่าน" };
console.log(`\n${file}${process.argv.length > 3 ? " " + process.argv.slice(3).join(" ") : ""}`);
for (const [k, v] of Object.entries(stat)) console.log(`${v.bad ? "FAIL" : "ok  "} ${k.padEnd(4)} ${names[k] ?? ""}: ${v.n - v.bad}/${v.n}`);
const shown = issues.slice(0, 80); if (shown.length) console.log("\n" + shown.join("\n")); if (issues.length > 80) console.log(`… อีก ${issues.length - 80}`);
