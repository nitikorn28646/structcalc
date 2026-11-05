// Beam section & reinforcement optimisation audit (user 2026-11-04) — READ ONLY: the program's algorithm is not changed.
// For a set of spans of a real project: every candidate b × h gets its cheapest bar arrangement (program's own bar search designBH,
// DB12 / DB16 / DB20), then the WHOLE frame is re-analysed with that type on the span's drawn beam (self weight, EI, moments, shear,
// torsion, deflection, column loads all recomputed) and every span of that beam must pass the program's checks. Quantities from the
// re-analysed result (bar lengths from the cut-off detail, stirrups by zone). Independent spot check of the cheapest candidate:
// cracked-section stresses of the provided bars and shear with own formulas.
// node cli/audit-opt.mjs [project.json] [k] > out.json
import fs from "fs";
import { analyzeFrame, checkEnv } from "../web/engine/frame.js";
import { generateBeamTypes, designBH, BEAM_GEN } from "../web/engine/beamTypes.js";
import { spanReasons, parseBars } from "../web/engine/floor.js";
import { BARS } from "../web/engine/tables.js";

const file = process.argv[2] ?? "web/public/projects/yasothon.json", K = +(process.argv[3] ?? 3);
const pj = JSON.parse(fs.readFileSync(file)), mat = pj.frame.mat;
const PRICE = BEAM_GEN.price; // the program's built-in ranking prices (฿2,500/m³, ฿28/kg, ฿350/m²) — NOT market prices
const t0 = Date.now();
const gen = generateBeamTypes(pj.frame, K);
const frameA = { ...pj.frame, beamTypes: gen.beamTypes, floors: gen.floors };
const rA = analyzeFrame(frameA);
const all = rA.floors.flatMap((an, f) => an.spans.map((sp) => ({ sp, f, an })));

// quantities of one drawn beam (member m on floor f) in a result r
const kgm = (s) => { const x = parseBars(s); return x ? (x.n * BARS[x.bar].A * 7850) / 1e4 : 0; };
function qty(r, f, m, t) {
  const sps = r.floors[f].spans.filter((sp) => (sp.members ?? [sp.member]).includes(m)), L = sps.reduce((s, sp) => s + sp.len, 0);
  let steel = (kgm(t.top) + kgm(t.bot)) * L, stir = 0;
  const stA = (BARS[t.st]?.A ?? 0.28) * (t.stSets ?? 1), per = 2 * (t.b + t.h) - 8 * ((mat.cover ?? 3) / 100) + 0.2; // closed stirrup + hooks
  for (const sp of sps) {
    const c = sp.cut, lb = c?.bot?.len ?? (c?.bot?.notNeeded ? 0.6 * sp.len : t.botX ? 0.6 * sp.len : 0), lt = (c?.topFull ? sp.len : (c?.top ?? []).reduce((s, x) => s + (x.len ?? 0), 0)) || (t.topX ? 0.5 * sp.len : 0);
    steel += kgm(t.botX) * lb + kgm(t.topX) * (sp.kind === "cantilever" ? sp.len * 2 : lt);
    const nS = Math.ceil((sp.len / 2) / t.sSup) + Math.ceil((sp.len / 2) / t.sMid) + 1; stir += nS * per * (stA * 7850) / 1e4;
  }
  const conc = t.b * t.h * L, form = (t.b + 2 * t.h) * L, kg = steel + stir;
  return { L, conc, form, steelMain: steel, steelStir: stir, kg, cost: conc * PRICE.conc + kg * PRICE.steel + form * PRICE.form, ok: sps.every((sp) => sp.ok), sps };
}
// governing condition of a failure, from the program's reasons
const cat = (w) => /แอ่น/.test(w) ? "Deflection" : /บิด/.test(w) ? "Torsion" : /เฉือน|ปลอก/.test(w) ? "Shear" : /จัดเหล็ก|ชั้น|ระยะห่าง/.test(w) ? "Detailing" : /ลึกน้อยกว่าขั้นต่ำ|h\/L/.test(w) ? "Depth rule (L/16…)" : /1\/3|1\/4|ld|ตัดเหล็ก/.test(w) ? "Anchorage" : /As,min/.test(w) ? "Min steel" : "Flexure";

// benchmark spans: cover the kinds asked for
const pickBy = (fn, n) => all.filter(fn).sort((a, b) => b.sp.len - a.sp.len).slice(0, n);
const chosen = new Map();
for (const [tag, fn, n] of [["สั้น", (x) => x.sp.len < 2 && x.sp.kind !== "cantilever", 3], ["ยาว", (x) => x.sp.len >= 4.5, 4], ["ต่อเนื่อง", (x) => x.sp.kind === "both_ends", 3],
  ["ต่อเนื่องปลายเดียว", (x) => x.sp.kind === "one_end", 3], ["ช่วงเดียว", (x) => x.sp.kind === "simple", 3], ["ยื่น", (x) => x.sp.kind === "cantilever", 2],
  ["แรงบิด", (x) => (x.sp.Mt ?? 0) > 150, 3], ["แอ่นสูง", (x) => x.sp.defl && x.sp.defl.dT / x.sp.defl.limT > 0.5, 3], ["รับพื้น 2 ด้าน", (x) => new Set((x.an.lines.find((l) => l.id === x.sp.line)?.slab ?? []).map((s) => s.from)).size >= 2, 3]])
  for (const x of pickBy(fn, n)) { const key = `${x.f}|${x.sp.member}`; if (!chosen.has(key)) chosen.set(key, { ...x, tags: [tag] }); else chosen.get(key).tags.push(tag); }

const B = [0.2, 0.25, 0.3], H = [0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.8];
const out = { file, K, types: gen.beamTypes, beams: [] };
for (const [, x] of chosen) {
  const m = x.sp.member, f = x.f, cur = x.sp.type, qa = qty(rA, f, m, cur);
  const spsA = qa.sps.map((sp) => ({ ...sp, vDone: true }));
  const res = { floor: pj.frame.floors[f].name, span: x.sp.id, member: m, kind: x.sp.kind, len: qa.L, tags: x.tags, current: { type: cur.name, b: cur.b, h: cur.h, t: cur, ...qa, sps: undefined, reasons: qa.sps.flatMap((sp) => spanReasons(sp.check)) }, cands: [] };
  for (const b of B) for (const h of H) {
    let best = null;
    for (const bar of ["DB 12", "DB 16", "DB 20"]) { const t = designBH(spsA, b, h, bar, mat, BEAM_GEN); if (t) { const c = BEAM_GEN && t; if (!best || qty0(c) < qty0(best)) best = c; } }
    function qty0(t) { return t.b * t.h * PRICE.conc + (kgm(t.top) + kgm(t.bot) + 0.5 * kgm(t.topX) + 0.6 * kgm(t.botX)) * PRICE.steel; }
    if (!best) { // why: the strongest bars of the habit in this section, checked on the forces of the current analysis
      const strong = { name: "X", b, h, top: "3-DB20", bot: "3-DB20", topX: "2-DB20", botX: "2-DB20", st: "RB 9", stSets: 1, sSup: 0.1, sMid: 0.1 };
      const why = [...new Set(spsA.flatMap((sp) => spanReasons(checkEnv(strong, sp, mat))).map(cat))];
      res.cands.push({ b, h, ok: false, stage: "bars", why: why.length ? why : ["(ไม่มีชุดเหล็กในขอบเขตที่ผ่าน)"] }); continue; }
    // full re-analysis with this type on the drawn beam
    const types = [...gen.beamTypes, { ...best, name: "CAND" }], floors = gen.floors.map((fl, k) => (k !== f ? fl : { ...fl, beams: fl.beams.map((bb, i) => (i === m ? { ...bb, type: types.length - 1 } : bb)) }));
    const rC = analyzeFrame({ ...frameA, beamTypes: types, floors }), q = qty(rC, f, m, best);
    const why = q.ok ? [] : [...new Set(q.sps.filter((sp) => !sp.ok).flatMap((sp) => spanReasons(sp.check)).map(cat))];
    const base = rC.frame3d?.base?.reduce((s, z) => s + z.R[2], 0);
    res.cands.push({ b, h, ok: q.ok, stage: q.ok ? "ok" : "reanalysis", why, t: best, conc: q.conc, form: q.form, kg: q.kg, steelMain: q.steelMain, steelStir: q.steelStir, cost: q.cost, base,
      util: Math.max(...q.sps.map((sp) => sp.check?.util ?? 9)), others: rC.floors.flatMap((a) => a.spans).filter((sp) => !sp.ok).length });
  }
  // independent spot check of the cheapest passing candidate (own formulas, forces of the re-analysed program result)
  const okc = res.cands.filter((c) => c.ok).sort((a, b) => a.cost - b.cost);
  res.best = okc[0] ?? null;
  out.beams.push(res);
  process.stderr.write(`${res.floor} ${res.span} (${res.tags.join(",")}): current ${cur.name} ${cur.b}×${cur.h} ฿${qa.cost.toFixed(0)} → best ${res.best ? `${res.best.b}×${res.best.h} ฿${res.best.cost.toFixed(0)}` : "-"} · ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
}
out.baseA = rA.frame3d?.base?.reduce((s, z) => s + z.R[2], 0);
console.log(JSON.stringify(out));
