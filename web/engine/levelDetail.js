// Beams at different levels meeting at a column (user 2026-11-20: porch slab −0.10, the beams under it lowered whole): the joint table
// and the typical elevation detail (drawing only — the checks are in engine/floor.js: hookFit / stepSup / cutType).
// Detail used (ACI 318-11; ว.ส.ท. clause numbers not checked against the text):
//   top bars of the HIGHER beam: into the column, 90° standard hook turned down, ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 cm (12.5.2),
//     × 0.7 with side cover ≥ 6.5 cm (12.5.3a), tail 12db (7.1.2); when the column is too short for ldh, the face is checked with h − Δ
//   top bars of the LOWER beam: straight through the column into the higher beam ≥ ld beyond the face (12.12.1: negative-moment bars
//     anchored in or through the support)
//   bottom bars of both beams: into the column ≥ 15 cm (12.11.1); at different bottom levels each ends with a hook up
// Primitives as engine/stairDetail.js (metres, y up): rendered by src/stairSvg.js and the DXF writer.
import { BARS } from "./tables.js";
import { devLength, hookFit, parseBars } from "./floor.js";

const barOf = (t, keys) => { const bs = keys.map((k) => parseBars(t?.[k])).filter(Boolean); return bs.reduce((a, b) => (!a || BARS[b.bar].d > BARS[a.bar].d ? b : a), null); };
const f2 = (v) => Number(v).toFixed(2), cm = (v) => `${Math.round(v * 1000) / 10}`.replace(/\.0$/, "");

// every step joint of the project with what the detail needs
export function levelJoints(frame, res) {
  const out = [], types = frame.beamTypes ?? [], mat = frame.mat ?? {};
  (res?.floors ?? []).forEach((an, k) => {
    for (const j of an?.levels?.steps ?? []) {
      const hi = types[an.beamTypeOf?.[j.hi] ?? frame.floors[k].beams[j.hi]?.type ?? 0] ?? types[0], lo = types[an.beamTypeOf?.[j.lo] ?? frame.floors[k].beams[j.lo]?.type ?? 0] ?? types[0];
      const col = res.columns?.find((c) => c.floor === k && Math.hypot(c.p[0] - j.p[0], c.p[1] - j.p[1]) < 0.01);
      const alongX = Math.abs((an.levels.beams[j.hi]?.u ?? [1, 0])[0]) >= 0.7;
      const cs = col?.lv ? { Bx: col.lv.Bx / 100, By: col.lv.By / 100 } : null, along = cs ? (alongX ? cs.Bx : cs.By) : j.colAlong ?? null, perp = cs ? (alongX ? cs.By : cs.Bx) : j.colPerp ?? null;
      const hook = j.col && along ? hookFit(hi, mat, { along, perp }) : { ok: false, ldh: null, avail: 0 };
      const loBar = barOf(lo, ["top"]), ld = loBar ? devLength(BARS[loBar.bar].d, mat, true) : 0.3;
      const sps = an.spans.filter((s) => s.members.includes(j.hi) && (Math.hypot(s.a[0] - j.p[0], s.a[1] - j.p[1]) < 0.01 || Math.hypot(s.b[0] - j.p[0], s.b[1] - j.p[1]) < 0.01));
      out.push({ floor: k, floorName: frame.floors[k].name, line: j.line, p: j.p, dz: j.dz, col: j.col, ok: j.ok && sps.every((s) => s.ok), depthOk: j.ok,
        hi, lo, hiTop: an.levels.beams[j.hi]?.top ?? 0, loTop: an.levels.beams[j.lo]?.top ?? 0, along, perp, hook, ld, loBar, hiBar: barOf(hi, ["top", "topX"]),
        spans: sps.map((s) => s.id), mode: !j.col ? "กลางแนวคาน — ตรวจทั้งช่วงด้วย h − Δ" : hook.ok ? "งอขอในเสาได้ — ใช้ความลึกเต็ม" : "งอขอในเสาไม่พอ — ตรวจที่หัวเสาด้วย h − Δ" });
    }
  });
  return out;
}

// distinct details (same types, column depth and Δ draw the same)
export const jointGroups = (rows) => { const m = new Map();
  for (const r of rows) { const key = `${r.hi?.name}|${r.lo?.name}|${r.along}|${r.dz}`; if (!m.has(key)) m.set(key, { ...r, n: 0, at: [] }); const g = m.get(key); g.n++; g.at.push(r); }
  return [...m.values()]; };

export function jointDetailModel(r, mat = {}, o = {}) {
  const P = [], TH = 0.05;
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false, fill = null) => P.push({ t: "poly", pts, layer, closed, fill });
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
  const bar = (pts, d, layer) => P.push({ t: "poly", pts, layer, closed: false, bar: d });
  const dimH = (x1, x2, y, label, above = true) => { line(x1, y, x2, y, "C-DIM"); for (const x of [x1, x2]) { line(x, y - 0.03, x, y + 0.03, "C-DIM"); line(x - 0.012, y - 0.012, x + 0.012, y + 0.012, "C-DIM"); }
    text((x1 + x2) / 2, y + (above ? 0.015 : -0.015), TH * 0.9, label, "C-DIM", 1, above ? 1 : 3); };
  const dimV = (x, y1, y2, label) => { line(x, y1, x, y2, "C-DIM"); for (const y of [y1, y2]) { line(x - 0.03, y, x + 0.03, y, "C-DIM"); line(x - 0.012, y - 0.012, x + 0.012, y + 0.012, "C-DIM"); }
    text(x - 0.015, (y1 + y2) / 2, TH * 0.9, label, "C-DIM", 1, 1, 90); };
  const leader = (bx, by, tx, ty, s, ha = 0) => { const w = String(s).length * TH * 0.55 + 0.03, ex = ha === 0 ? tx + w : tx - w; poly([[bx, by], [tx, ty], [ex, ty]], "C-TEXT"); text(ha === 0 ? tx + 0.015 : tx - 0.015, ty + 0.01, TH, s, "C-TEXT", ha, 1); };

  const c = r.along ?? 0.25, h1 = r.hi?.h ?? 0.4, h2 = r.lo?.h ?? 0.4, dz = r.dz, cv = (mat.cover ?? 3) / 100 + 0.01, Lb = 1.3;
  const dbH = (BARS[r.hiBar?.bar]?.d ?? 1.2) / 100, dbL = (BARS[r.loBar?.bar]?.d ?? 1.2) / 100, botH = -h1, botL = -dz - h2, same = Math.abs(botH - botL) < 0.005;
  const yLo = Math.min(botH, botL) - 0.45, yHi = 0.45;
  // concrete: column (broken top / bottom), higher beam left, lower beam right, slabs
  poly([[0, yLo], [0, botH]]); poly([[0, 0], [0, yHi]]); poly([[c, yLo], [c, botL]]); poly([[c, -dz], [c, yHi]]);
  for (const y of [yLo, yHi]) poly([[-0.02, y], [c * 0.4, y], [c * 0.5, y + 0.03], [c * 0.55, y - 0.03], [c * 0.65, y], [c + 0.02, y]]);
  poly([[-Lb, 0], [0, 0]]); poly([[-Lb, botH], [0, botH]]); poly([[c, -dz], [c + Lb, -dz]]); poly([[c, botL], [c + Lb, botL]]);
  for (const [x, y0, y1] of [[-Lb, botH, 0.0], [c + Lb, botL, -dz]]) poly([[x, y0 - 0.03], [x, (y0 + y1) / 2 - 0.02], [x + 0.025, (y0 + y1) / 2], [x - 0.025, (y0 + y1) / 2 + 0.02], [x, y1 + 0.03]]);
  // stirrups / column ties
  for (let x = -0.05; x > -Lb + 0.05; x -= 0.15) line(x, botH + cv - 0.01, x, -cv + 0.01, "C-STIRRUP");
  for (let x = c + 0.05; x < c + Lb - 0.05; x += 0.15) line(x, botL + cv - 0.01, x, -dz - cv + 0.01, "C-STIRRUP");
  for (let y = Math.min(botH, botL) - 0.1; y < yHi - 0.05; y += 0.15) line(0.025, y, c - 0.025, y, "C-STIRRUP", true);
  for (const x of [0.04, c - 0.04]) line(x, yLo + 0.02, x, yHi - 0.02, "C-STIRRUP");
  // bars
  const ldh = Math.max((r.hook?.ldh ?? 15) / 100, 0.15), xh = Math.min(ldh, c - 0.05), tail = Math.max(12 * dbH, 0.1);
  bar([[-Lb + 0.05, -cv], [xh, -cv], [xh, -cv - tail]], dbH, "C-BAR");
  const ld = Math.max(r.ld ?? 0.3, 0.3), yl = -dz - cv;
  bar([[c + Lb - 0.05, yl], [-Math.min(ld, Lb - 0.1), yl]], dbL, "C-BAR-EXTRA");
  if (same) bar([[-Lb + 0.05, botH + cv], [c + Lb - 0.05, botH + cv]], dbH, "C-BAR");
  else {
    bar([[-Lb + 0.05, botH + cv], [c - 0.05, botH + cv], [c - 0.05, botH + cv + Math.max(12 * dbH, 0.1)]], dbH, "C-BAR");
    bar([[c + Lb - 0.05, botL + cv], [0.05, botL + cv], [0.05, botL + cv + Math.max(12 * dbL, 0.1)]], dbL, "C-BAR-EXTRA");
  }
  // dimensions
  dimH(0, c, yLo - 0.12, `เสา ${cm(c)} ซม.`, false);
  dimH(0, xh, 0.12, `ldh ≥ ${cm(ldh)} ซม.${r.hook?.ok ? "" : " (ไม่พอ)"}`);
  dimH(-Math.min(ld, Lb - 0.1), 0, yl - 0.2, `≥ ld ${cm(ld)} ซม.`, false);
  dimV(-Lb - 0.15, botH, 0, `${cm(h1)}`); dimV(c + Lb + 0.15, botL, -dz, `${cm(h2)}`); dimV(c + Lb + 0.32, -dz, 0, `Δ ${cm(dz)}`);
  line(c + 0.05, 0, c + Lb + 0.36, 0, "C-DIM", true);
  // labels
  const nH = (b) => (b ? `${b.n}-${b.bar} มม.` : "เหล็กบน");
  leader(-0.6, -cv, -0.75, yHi + 0.15, `เหล็กบน ${r.hi?.name ?? ""} ${nH(parseBars(r.hi?.top))} งอขอ 90° ฝังในเสา ยาว ≥ ldh (ACI 318-11 12.5)`, 0);
  leader(c + 0.7, yl, c + 0.55, yHi + 0.32, `เหล็กบน ${r.lo?.name ?? ""} ${nH(parseBars(r.lo?.top))} วิ่งผ่านเสาเข้าคานตัวสูง ≥ ld (12.12.1)`, 0);
  leader(c + 0.8, botL + cv, c + 0.95, yLo - 0.32, `เหล็กล่างเข้าเสา ≥ 15 ซม.${same ? " ต่อเนื่องผ่านเสา" : " งอขอขึ้น"} (12.11.1)`, 0);
  text(-Lb, 0.03, TH, `${r.hi?.name ?? ""} ${cm(r.hi?.b ?? 0.2)}×${cm(h1)} หลังคาน ${r.hiTop > 0 ? "+" : ""}${f2(r.hiTop)}`, "C-TEXT", 0, 0);
  text(c + Lb, -dz + 0.03, TH, `${r.lo?.name ?? ""} ${cm(r.lo?.b ?? 0.2)}×${cm(h2)} หลังคาน ${r.loTop > 0 ? "+" : ""}${f2(r.loTop)}`, "C-TEXT", 2, 0);
  const title = o.title ?? "รายละเอียดคานต่างระดับที่หัวเสา", yT = yLo - 0.45;
  text(c / 2, yT, TH * 1.4, title, "C-TITLE", 1, 0);
  text(c / 2, yT - 0.12, TH * 0.9, `${o.sub ?? ""}มาตราส่วน 1:20`, "C-TEXT", 1, 0);
  return { items: P, box: [-Lb - 0.45, yT - 0.2, c + Lb + 1.6, yHi + 0.45] };
}
