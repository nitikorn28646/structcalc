// Footing DXF (src/footingDxf.js + engine/footingDetail.js): every mark has a detail, the drawn bars = the designed bar counts,
// the bar texts are the design's, coordinates finite, the plan sheet carries every footing and the schedule.
// usage: node cli/footingdxf-check.mjs [project.json …]
import fs from "node:fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { footingSheetsDxf, footingDetailModels, footingGroups } from "../web/src/footingDxf.js";
import { dimText } from "../web/engine/dimParts.js";

let bad = 0, n = 0;
const ok = (name, c, info = "") => { n++; if (!c) bad++; if (!c || process.env.V) console.log(`${c ? "ok  " : "FAIL"} ${name}${info ? ` — ${info}` : ""}`); };
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["web/public/projects/yasothon.json", ...["_anucha2", "_user", "_big", "_roof3"].map((x) => `web/public/projects/${x}.json`).filter((p) => fs.existsSync(p))];
for (const file of [...files, "weak-soil"]) {
  // last run: Yasothon on weak soil (qa 6 t/m²) — makes a combined footing
  const raw = JSON.parse(fs.readFileSync(file === "weak-soil" ? "web/public/projects/yasothon.json" : file)), fr = raw.frame ?? raw, tag = file.split("/").pop();
  if (file === "weak-soil") { fr.soil = { qa: 6000, gamma: 1800 }; fr.footTypes = [{ name: "F1", kind: "spread", Bx: 0, By: 0, t: 0.3, Df: 1.2, bar: "DB 12", s: 0.15 }]; }
  const res = analyzeFrame(fr);
  const { groups } = footingGroups(fr, res), models = footingDetailModels(fr, res);
  ok(`${tag}: one detail per mark (${groups.length})`, models.length === groups.length && groups.length > 0);
  for (const [i, g] of groups.entries()) {
    const m = models[i].model, f = g.f, items = m.items;
    const finite = items.every((p) => Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v)) && (!p.pts || p.pts.every((q) => q.every(Number.isFinite))));
    ok(`${tag} ${g.mark}: coordinates finite`, finite && m.box.every(Number.isFinite));
    if (f.kind === "combined") { // combined footing (engine/footingDetail.js combinedDetailModel): bar counts from the design in the notes
      const t2 = items.filter((p) => p.t === "text").map((p) => p.s).join(" | "), C = f.combined;
      ok(`${tag} ${g.mark}: combined — bottom / top / transverse bar texts`, t2.includes(`${C.bot.n}-${C.barL.replace(" ", " ")}`) && t2.includes(`${C.top.n}-`) && C.trans.every((x) => t2.includes(`${x.n}-`)));
      ok(`${tag} ${g.mark}: combined — overall dims L / B`, items.some((p) => p.t === "dim" && dimText(p) === C.L.toFixed(2)) && items.some((p) => p.t === "dim" && dimText(p) === C.B.toFixed(2)));
      continue;
    }
    // plan bars: polylines of 2 points on C-BAR (along X) / C-BAR-EXTRA (along Y)
    const xb = items.filter((p) => p.t === "poly" && p.layer === "C-BAR" && p.pts.length === 2 && Math.abs(p.pts[0][1] - p.pts[1][1]) < 1e-9).length;
    const yb = items.filter((p) => p.t === "poly" && p.layer === "C-BAR-EXTRA" && p.pts.length === 2).length;
    ok(`${tag} ${g.mark}: plan bars = nLong ${f.r.nLong} / nShort ${f.r.nShort}`, xb === f.r.nLong && yb === f.r.nShort, `${xb} / ${yb}`);
    const dots = items.filter((p) => p.t === "disk" && p.layer === "C-BAR-EXTRA").length;
    ok(`${tag} ${g.mark}: section shows every Y bar as a dot`, dots === f.r.nShort, `${dots}`);
    const txt = items.filter((p) => p.t === "text").map((p) => p.s).join(" | "), num = (s) => (/^(\d+)-/.exec(s ?? "") ?? [])[1];
    ok(`${tag} ${g.mark}: bar texts from the design`, txt.includes(`${num(f.r.longText)}-${f.inp.longBar}`) && txt.includes(`${num(f.r.shortText)}-${f.inp.shortBar}`));
    const wTxt = items.filter((p) => p.t === "dim").map((p) => dimText(p));
    ok(`${tag} ${g.mark}: overall dims ${f.r.Bx.toFixed(2)} × ${f.r.By.toFixed(2)}`, wTxt.includes(f.r.Bx.toFixed(2)) && wTxt.includes(f.r.By.toFixed(2)));
    if (f.kind !== "spread" && f.n > 0) ok(`${tag} ${g.mark}: piles drawn (${f.n})`, items.filter((p) => p.layer === "C-PILE").length >= f.n);
    ok(`${tag} ${g.mark}: no pier bar callout (user 2026-11-24)`, !/ตอม่อ|เดือย|ปลอก RB/.test(txt));
  }
  const o = footingSheetsDxf(fr, res, { name: "test" });
  ok(`${tag}: DXF with plan + detail sheets (${o.sheets}, 1:${o.scale})`, o.dxf.startsWith("  0\nSECTION") || o.dxf.includes("ENTITIES") && o.sheets >= 2);
  const tags = groups.reduce((a, g) => a + g.list.length, 0), labels = (o.dxf.match(/\nC-TAG\n/g) ?? []).length;
  ok(`${tag}: plan tags ≥ footings (${tags})`, labels >= tags, `${labels}`);
  ok(`${tag}: schedule lists every mark`, groups.every((g) => o.dxf.includes(`\n1\n${g.mark}\n`)));
  ok(`${tag}: no NaN / undefined in the file`, !/NaN|undefined|Infinity/.test(o.dxf));
  // one entity per grid line / pile outline (line types, user 2026-11-24 "ให้เส้นเป็นเส้นเดียวกัน"); line types defined in the LTYPE table
  const body = o.dxf.slice(o.dxf.indexOf("\n  2\nENTITIES")), ents = body.split(/\n0\n(?=LINE|LWPOLYLINE|CIRCLE|ARC|TEXT|DIMENSION)/);
  const gridLines = ents.filter((e) => /\n8\nC-GRID\n/.test(e) && e.startsWith("LINE")), axes = (() => { const G = fr.floors[0].grid ?? {}; return (G.dx?.length ?? 0) + (G.dy?.length ?? 0) + 2; })();
  ok(`${tag}: grid lines are single CENTER2 lines (${gridLines.length})`, gridLines.length > 0 && gridLines.every((e) => /\n6\nCENTER2\n/.test(e)) && (!fr.floors[0].grid?.dx?.length || gridLines.length === axes), `axes ${axes}`);
  const nDim = ents.filter((e) => e.startsWith("DIMENSION")).length, nBlk = (o.dxf.match(/\n  2\n\*D\d+\n/g) ?? []).length;
  ok(`${tag}: dimensions are DIMENSION entities, each with its block (${nDim})`, nDim > 50 && nBlk === 2 * nDim, `blocks ${nBlk / 2}`);
  ok(`${tag}: LTYPE table has CENTER2 + HIDDEN2`, /\nLTYPE\n[\s\S]*?\n  2\nCENTER2\n/.test(o.dxf) && /\n  2\nHIDDEN2\n/.test(o.dxf));
}
console.log(`footingdxf-check: ${n - bad}/${n}${bad ? ` · ${bad} FAILED` : " all ok"}`);
process.exit(bad ? 1 : 0);
