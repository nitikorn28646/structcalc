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
      // bars THROUGH the joint at the lower level (user 2026-11-20: "เพิ่มขนาดเสาตามใจไม่ได้"): when the higher beam's top bars cannot be hooked
      // in the column, its support was checked at h − Δ with its own top steel — that steel must really be there at the lower level: the
      // lower beam's top bars run through ≥ ld into the higher beam, and short bars of the higher beam's size are ADDED through the joint
      // (≥ ld each side) until As(through) ≥ As required at h − Δ. No column change needed.
      const needCut = !j.col || !hook.ok, hiB = barOf(hi, ["top", "topX"]), loTop = parseBars(lo.top);
      const reqAs = needCut ? Math.max(0, ...sps.map((s) => +((s.check?.step?.sup ?? s.check?.sup)?.reqBot)).filter(Number.isFinite)) : 0, AsLo = loTop ? loTop.n * BARS[loTop.bar].A : 0;
      const nAdd = needCut && hiB ? Math.max(0, Math.ceil((reqAs - AsLo) / BARS[hiB.bar].A - 1e-9)) : 0, AsThrough = AsLo + (hiB ? nAdd * BARS[hiB.bar].A : 0);
      const ldAdd = hiB ? devLength(BARS[hiB.bar].d, mat, true) : 0.3;
      // the bars at the lower level overlap the higher beam's own top bars Δ higher = a NON-CONTACT lap splice: length 1.3·ld (class B,
      // ACI 318-11 12.15.1) into the higher beam, bars apart ≤ 15 cm and ≤ lap/5 (12.14.2.3); else the joint is NG (no splice)
      const lapLo = 1.3 * Math.max(ld, 0.3), lapAdd = 1.3 * Math.max(ldAdd, 0.3), lapOk = !needCut || (j.dz <= 0.15 + 1e-9 && j.dz <= Math.min(lapLo, nAdd ? lapAdd : lapLo) / 5 + 1e-9);
      out.push({ floor: k, floorName: frame.floors[k].name, line: j.line, p: j.p, dz: j.dz, col: j.col, ok: j.ok && lapOk && sps.every((s) => s.ok), depthOk: j.ok,
        needCut, reqAs, AsLo, nAdd, addBar: nAdd ? `${nAdd}-${hiB.bar}` : null, AsThrough, ldAdd, lapLo, lapAdd, lapOk,
        hi, lo, hiTop: an.levels.beams[j.hi]?.top ?? 0, loTop: an.levels.beams[j.lo]?.top ?? 0, along, perp, hook, ld, loBar, hiBar: barOf(hi, ["top", "topX"]),
        spans: sps.map((s) => s.id), mode: !lapOk ? `ต่างระดับ ${Math.round(j.dz * 100)} ซม. เกินระยะทาบไม่สัมผัส (≤ 15 ซม. และ ≤ 1.3ld/5) — ลดความต่างระดับ หรือให้เหล็กบนคานตัวสูงงอขอในเสาได้` : !j.col ? "กลางแนวคาน — ตรวจทั้งช่วงด้วย h − Δ" : hook.ok ? "งอขอในเสาได้ — ใช้ความลึกเต็ม" : "งอขอในเสาไม่พอ — ตรวจที่หัวเสาด้วย h − Δ" });
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
  // leader: a dot on the bar, straight up / down to the text level, then the underline the text sits on (no slanted lines crossing)
  let maxX = -Infinity; // right end of the leader texts (box)
  const leader = (bx, by, ty, s, ha = 0, s2 = "") => { const w = Math.max(String(s).length, String(s2).length * 0.9) * TH * 0.52 + 0.03, ex = ha === 0 ? bx + w : bx - w; maxX = Math.max(maxX, ex);
    P.push({ t: "disk", x: bx, y: by, r: 0.008, layer: "C-TEXT" }); poly([[bx, by], [bx, ty], [ex, ty]], "C-TEXT");
    text(ha === 0 ? bx + 0.015 : bx - 0.015, ty + 0.012, TH, s, "C-TEXT", ha, 1); if (s2) text(ha === 0 ? bx + 0.015 : bx - 0.015, ty - 0.015, TH * 0.82, s2, "C-DIM", ha, 3); };

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
  const ld = r.needCut ? r.lapLo ?? 1.3 * Math.max(r.ld ?? 0.3, 0.3) : Math.max(r.ld ?? 0.3, 0.3), yl = -dz - cv; // into the higher beam: a lap (1.3·ld) when it carries the h − Δ moment
  bar([[c + Lb - 0.05, yl], [-Math.min(ld, Lb - 0.1), yl]], dbL, "C-BAR-EXTRA");
  if (r.addBar) { const lh = Math.min(r.lapAdd ?? 0.4, Lb - 0.12), ll = Math.min(Math.max(r.ldAdd ?? 0.3, 0.3), Lb - 0.12); bar([[-lh, yl - 0.022], [c + ll, yl - 0.022]], dbH, "C-BAR-EXTRA"); } // bars added through the joint
  if (same) bar([[-Lb + 0.05, botH + cv], [c + Lb - 0.05, botH + cv]], dbH, "C-BAR");
  else {
    bar([[-Lb + 0.05, botH + cv], [c - 0.05, botH + cv], [c - 0.05, botH + cv + Math.max(12 * dbH, 0.1)]], dbH, "C-BAR");
    bar([[c + Lb - 0.05, botL + cv], [0.05, botL + cv], [0.05, botL + cv + Math.max(12 * dbL, 0.1)]], dbL, "C-BAR-EXTRA");
  }
  // dimensions
  dimH(0, c, Math.min(yLo, botH - 0.3) - 0.12, `เสา ${cm(c)} ซม.`, false);
  dimH(0, xh, 0.12, r.hook?.ok ? `ฝังในเสา ${cm(ldh)} ซม. — ผ่าน` : `ฝังได้ ${cm(xh)} ซม. ไม่ถึง ${cm(ldh)} → หัวเสาคิดคานลึกแค่ ${cm(h1 - dz)} ซม. (h − Δ)`);
  { const xl = -Math.min(ld, Lb - 0.1), yd = botH - 0.16; line(xl, yl - 0.02, xl, yd - 0.03, "C-DIM", true); line(0, botH - 0.02, 0, yd - 0.03, "C-DIM"); dimH(xl, 0, yd, r.needCut ? `ทาบ ≥ 1.3ld ${cm(ld)} ซม.` : `≥ ld ${cm(ld)} ซม.`, false); }
  dimV(-Lb - 0.15, botH, 0, `${cm(h1)}`); dimV(c + Lb + 0.15, botL, -dz, `${cm(h2)}`); dimV(c + Lb + 0.32, -dz, 0, `Δ ${cm(dz)}`);
  line(c + 0.05, 0, c + Lb + 0.36, 0, "C-DIM", true);
  // labels
  const nH = (b) => (b ? `${b.n}-${b.bar} มม.` : "เหล็กบน");
  leader(-0.85, -cv, yHi + 0.12, `เหล็กบน ${r.hi?.name ?? ""} ${nH(parseBars(r.hi?.top))}`, 0, "งอขอ 90° ฝังในเสา ≥ ldh (ACI 318-11 12.5)");
  leader(c + 0.85, yl, yHi + 0.12, r.addBar ? `เหล็กบน ${r.lo?.name ?? ""} ${nH(parseBars(r.lo?.top))} + ${r.addBar} มม. ผ่านรอยต่อ` : `เหล็กบน ${r.lo?.name ?? ""} ${nH(parseBars(r.lo?.top))}`, 0,
    r.addBar ? `ตัวเสริม: ในคานตัวสูง ≥ 1.3ld ${cm(r.lapAdd ?? 0.4)} · ในคานตัวต่ำ ≥ ld ${cm(Math.max(r.ldAdd ?? 0.3, 0.3))} ซม. · As ${(r.AsThrough ?? 0).toFixed(2)} ≥ ${(r.reqAs ?? 0).toFixed(2)} ซม.²` : r.needCut ? "วิ่งผ่านเสาเข้าคานตัวสูง ทาบ ≥ 1.3ld (12.15.1)" : "วิ่งผ่านเสาเข้าคานตัวสูง ≥ ld (12.12.1)");
  leader(c + Lb - 0.12, botL + cv, Math.min(yLo, botH - 0.3) - 0.3, "เหล็กล่างเข้าเสา ≥ 15 ซม.", 0, same ? "ต่อเนื่องผ่านเสา (12.11.1)" : "งอขอขึ้นในเสา (12.11.1)");
  text(-Math.min(Math.max(r.ld ?? 0.3, 0.3), Lb - 0.1) - 0.05, botH - 0.035, TH, `${r.hi?.name ?? ""} ${cm(r.hi?.b ?? 0.2)}×${cm(h1)} หลังคาน ${r.hiTop > 0 ? "+" : ""}${f2(r.hiTop)}`, "C-TEXT", 2, 3); // ends left of the ld extension line
  text(c + 0.05, botL - 0.035, TH, `${r.lo?.name ?? ""} ${cm(r.lo?.b ?? 0.2)}×${cm(h2)} หลังคาน ${r.loTop > 0 ? "+" : ""}${f2(r.loTop)}`, "C-TEXT", 0, 3);
  const title = o.title ?? "รายละเอียดคานต่างระดับที่หัวเสา", yT = Math.min(yLo, botH - 0.3) - 0.55;
  text(c / 2, yT, TH * 1.4, title, "C-TITLE", 1, 0);
  text(c / 2, yT - 0.12, TH * 0.9, `${o.sub ?? ""}มาตราส่วน ${o.scale ?? "1:25"}`, "C-TEXT", 1, 0); // drawn at true size on the 1:25 sheet (user 2026-11-20)
  return { items: P, box: [-Lb - 0.45, yT - 0.2, Math.max(c + Lb + 0.75, maxX + 0.05), yHi + 0.3] };
}

// ── Beams of different depth meeting at a column with their TOPS level (user 2026-11-20: "คานคนละ type หลังคานเท่ากัน ท้องคานต่างระดับ") ──
// Analysis / section checks already use each span's own depth. What the joint adds (ACI 318-11; ว.ส.ท. clause numbers not checked):
//   top bars: same level → continuous through the column (negative moment, 12.12.1) — nothing new
//   bottom bars of the SHALLOW beam: straight through the column into the deeper beam ≥ ld (they lie inside its depth) — ≥ 15 cm (12.11.1)
//   bottom bars of the DEEP beam: cannot continue (the shallow beam is above them) → end in the column with a 90° hook turned UP; required
//     to develop fy at the face (ldh ≤ column depth along the beam − 5 cm, 12.11.2) when the frame takes wind / earthquake (lateral on:
//     the beam is part of the lateral-load-resisting system, positive moment may reach the support); else ≥ 15 cm straight is the minimum
//     (12.11.1) and the hook is detailing.
export function depthJoints(frame, res) {
  const out = [], types = frame.beamTypes ?? [], mat = frame.mat ?? {}, lateral = !!(frame.lateral?.wind?.on || frame.lateral?.seismic?.on);
  (res?.floors ?? []).forEach((an, k) => {
    if (!an?.spans) return;
    const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.01, seen = new Set();
    // two collinear spans meeting end to end (same line, or two lines split at that column), s1 before s2 in the drawing direction of s1
    const dir = (s) => { const L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) || 1; return [(s.b[0] - s.a[0]) / L, (s.b[1] - s.a[1]) / L]; };
    const flip = (s) => ({ ...s, a: s.b, b: s.a });
    for (const s1 of an.spans) for (const s2r of an.spans) {
      if (s1 === s2r) continue; const u1 = dir(s1), u2 = dir(s2r); if (Math.abs(u1[0] * u2[1] - u1[1] * u2[0]) > 1e-3) continue;
      const s2 = near(s1.b, s2r.a) ? s2r : near(s1.b, s2r.b) ? flip(s2r) : null; if (!s2) continue;
      const p = s1.b, key = `${p[0].toFixed(3)}|${p[1].toFixed(3)}|${Math.abs(u1[0]) >= 0.7 ? "x" : "y"}`; if (seen.has(key)) continue;
      const t1 = types[s1.typeIdx] ?? types[0], t2 = types[s2.typeIdx] ?? types[0]; if (!t1 || !t2 || Math.abs(t1.h - t2.h) < 0.05 - 1e-9) continue;
      const lv1 = an.levels?.beams?.[s1.member], lv2 = an.levels?.beams?.[s2.member]; if (Math.abs((lv1?.top ?? 0) - (lv2?.top ?? 0)) > 0.005) continue; // tops differ = a step joint (levelJoints)
      const col = res.columns?.find((c) => c.floor === k && near(c.p, p)) ?? null; if (!col && !(frame.floors[k]?.columns ?? []).some((q) => near(q, p))) continue; // at a column only
      seen.add(key);
      const alongX = Math.abs(dir(s1)[0]) >= 0.7;
      const cs = col?.lv ? { Bx: col.lv.Bx / 100, By: col.lv.By / 100 } : null, along = cs ? (alongX ? cs.Bx : cs.By) : null, perp = cs ? (alongX ? cs.By : cs.Bx) : null;
      const deepFirst = t1.h > t2.h, deep = deepFirst ? t1 : t2, sh = deepFirst ? t2 : t1, sD = deepFirst ? s1 : s2, sS = deepFirst ? s2 : s1;
      const hook = along ? hookFit({ ...deep, top: deep.bot, topX: deep.botX }, mat, { along, perp }) : { ok: false, ldh: null, avail: 0 };
      const shBar = barOf(sh, ["bot"]), ld = shBar ? devLength(BARS[shBar.bar].d, mat, false) : 0.3;
      const ok = !lateral || hook.ok, mode = hook.ok ? "เหล็กล่างคานลึกงอขอขึ้นในเสาได้ (ยึดเต็มกำลัง)" : lateral ? "มีแรงด้านข้าง — เหล็กล่างคานลึกต้องยึดเต็มกำลังแต่เสาสั้นกว่า ldh: ขยายเสา หรือใช้เหล็กเล็กลง" : "เสาสั้นกว่า ldh — เหล็กล่างคานลึกงอขอเข้าเสา ≥ 15 ซม. (ไม่มีแรงด้านข้าง ข้อ 12.11.1 พอ)";
      const modeShort = hook.ok ? "ขอยึดในเสาได้" : lateral ? "ไม่ผ่าน: ต้องยึดเต็มกำลัง เสาสั้นกว่า ldh" : "เข้าเสา ≥ 15 ซม. (ไม่มีแรงด้านข้าง)";
      out.push({ floor: k, floorName: frame.floors[k]?.name, line: s1.line, p, col: !!col, deep, sh, modeShort, dh: +(deep.h - sh.h).toFixed(3), deepLeft: deepFirst, along, perp, hook, ld, shBar, deepBar: barOf(deep, ["bot"]),
        top: (lv1?.top ?? 0), lateral, spans: [s1.id, s2.id], deepSpan: sD.id, shSpan: sS.id, ok: ok && s1.ok !== false && s2.ok !== false, jointOk: ok, mode });
    }
  });
  return out;
}
export const depthGroups = (rows) => { const m = new Map();
  for (const r of rows) { const key = `${r.deep?.name}|${r.sh?.name}|${r.along}`; if (!m.has(key)) m.set(key, { ...r, n: 0, at: [] }); const g = m.get(key); g.n++; g.at.push(r); }
  return [...m.values()]; };

// elevation of the joint: deep beam left, shallow beam right, column between, both tops at 0
export function depthDetailModel(r, mat = {}, o = {}) {
  const P = [], TH = 0.05;
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false) => P.push({ t: "poly", pts, layer, closed });
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
  const bar = (pts, d, layer) => P.push({ t: "poly", pts, layer, closed: false, bar: d });
  const dimH = (x1, x2, y, label, above = true) => { line(x1, y, x2, y, "C-DIM"); for (const x of [x1, x2]) { line(x, y - 0.03, x, y + 0.03, "C-DIM"); line(x - 0.012, y - 0.012, x + 0.012, y + 0.012, "C-DIM"); }
    text((x1 + x2) / 2, y + (above ? 0.015 : -0.015), TH * 0.9, label, "C-DIM", 1, above ? 1 : 3); };
  const dimV = (x, y1, y2, label) => { line(x, y1, x, y2, "C-DIM"); for (const y of [y1, y2]) { line(x - 0.03, y, x + 0.03, y, "C-DIM"); line(x - 0.012, y - 0.012, x + 0.012, y + 0.012, "C-DIM"); }
    text(x - 0.015, (y1 + y2) / 2, TH * 0.9, label, "C-DIM", 1, 1, 90); };
  const leader = (bx, by, ty, s, s2 = "") => { const w = Math.max(String(s).length, String(s2).length * 0.9) * TH * 0.52 + 0.03;
    P.push({ t: "disk", x: bx, y: by, r: 0.008, layer: "C-TEXT" }); poly([[bx, by], [bx, ty], [bx + w, ty]], "C-TEXT");
    text(bx + 0.015, ty + 0.012, TH, s, "C-TEXT", 0, 1); if (s2) text(bx + 0.015, ty - 0.015, TH * 0.82, s2, "C-DIM", 0, 3); };
  const c = r.along ?? 0.25, hD = r.deep?.h ?? 0.6, hS = r.sh?.h ?? 0.4, cv = (mat.cover ?? 3) / 100 + 0.01, Lb = 1.3;
  const dbD = (BARS[r.deepBar?.bar]?.d ?? 1.2) / 100, dbS = (BARS[r.shBar?.bar]?.d ?? 1.2) / 100, dbT = (BARS[barOf(r.deep, ["top"])?.bar]?.d ?? 1.2) / 100;
  const yLo = -hD - 0.62, yHi = 0.45;
  // concrete: column (broken), deep beam left, shallow beam right
  poly([[0, yLo], [0, -hD]]); poly([[0, 0], [0, yHi]]); poly([[c, yLo], [c, -hS]]); poly([[c, 0], [c, yHi]]);
  for (const y of [yLo, yHi]) poly([[-0.02, y], [c * 0.4, y], [c * 0.5, y + 0.03], [c * 0.55, y - 0.03], [c * 0.65, y], [c + 0.02, y]]);
  poly([[-Lb, 0], [c + Lb, 0]]); poly([[-Lb, -hD], [0, -hD]]); poly([[c, -hS], [c + Lb, -hS]]);
  for (const [x, y0] of [[-Lb, -hD], [c + Lb, -hS]]) poly([[x, y0 - 0.03], [x, y0 / 2 - 0.02], [x + 0.025, y0 / 2], [x - 0.025, y0 / 2 + 0.02], [x, 0.03]]);
  for (let x = -0.05; x > -Lb + 0.05; x -= 0.15) line(x, -hD + cv - 0.01, x, -cv + 0.01, "C-STIRRUP");
  for (let x = c + 0.05; x < c + Lb - 0.05; x += 0.15) line(x, -hS + cv - 0.01, x, -cv + 0.01, "C-STIRRUP");
  for (let y = -hD - 0.1; y < yHi - 0.05; y += 0.15) line(0.025, y, c - 0.025, y, "C-STIRRUP", true);
  for (const x of [0.04, c - 0.04]) line(x, yLo + 0.02, x, yHi - 0.02, "C-STIRRUP");
  // bars: top continuous; deep bottom hooked up at the far face; shallow bottom straight through into the deep beam ≥ ld
  bar([[-Lb + 0.05, -cv], [c + Lb - 0.05, -cv]], dbT, "C-BAR");
  const ldh = Math.max((r.hook?.ldh ?? 15) / 100, 0.15), xh = Math.min(ldh, c - 0.05), tail = Math.max(12 * dbD, 0.1);
  bar([[-Lb + 0.05, -hD + cv], [xh, -hD + cv], [xh, -hD + cv + tail]], dbD, "C-BAR");
  const ld = Math.max(r.ld ?? 0.3, 0.3), xl = -Math.min(ld, Lb - 0.1);
  bar([[c + Lb - 0.05, -hS + cv], [xl, -hS + cv]], dbS, "C-BAR-EXTRA");
  // dims
  const yb = -hD - 0.42; // dimension rows under the deep soffit: ld, ldh, column
  line(xl, -hS + cv - 0.02, xl, -hD - 0.14, "C-DIM", true); line(0, -hD - 0.02, 0, yb - 0.14, "C-DIM", true); dimH(xl, 0, -hD - 0.12, `≥ ld ${cm(ld)} ซม.`, false);
  line(xh, -hD + cv - 0.02, xh, -hD - 0.28, "C-DIM", true); dimH(0, xh, -hD - 0.26, r.hook?.ok ? `ฝังในเสา ${cm(ldh)} ซม. — ผ่าน` : r.lateral ? `ฝังได้ ${cm(xh)} ซม. — ไม่พอ (ต้องการ ${cm(ldh)} ซม.)` : `ฝังในเสา ${cm(xh)} ซม. — ผ่าน (ขั้นต่ำ 15 ซม.)`, false);
  line(c, -hS - 0.02, c, yb - 0.14, "C-DIM", true); dimH(0, c, yb - 0.12, `เสา ${cm(c)} ซม.`, false);
  dimV(-Lb - 0.15, -hD, 0, `${cm(hD)}`); dimV(c + Lb + 0.15, -hS, 0, `${cm(hS)}`); dimV(c + Lb + 0.32, -hD, -hS, `Δh ${cm(hD - hS)}`);
  line(c + 0.05, -hD, c + Lb + 0.36, -hD, "C-DIM", true);
  const nB = (b) => (b ? `${b.n}-${b.bar} มม.` : "");
  leader(-0.85, -cv, yHi + 0.12, `เหล็กบน ${nB(barOf(r.deep, ["top"]))} ต่อเนื่องผ่านเสา`, "หลังคานเท่ากัน (12.12.1)");
  leader(c + 0.6, -hS + cv, yHi + 0.12, `เหล็กล่าง ${r.sh?.name ?? ""} ${nB(r.shBar)}`, "วิ่งผ่านเสาเข้าคานลึก ≥ ld (12.11.1)");
  leader(-1.0, -hD + cv, yb - 0.3, `เหล็กล่าง ${r.deep?.name ?? ""} ${nB(r.deepBar)}`, `งอขอ 90° ขึ้นในเสา ≥ ldh${r.lateral ? " (ยึดเต็มกำลัง 12.11.2)" : " (≥ 15 ซม. 12.11.1)"}`);
  text(-Lb + 0.05, -hD - 0.035, TH, `${r.deep?.name ?? ""} ${cm(r.deep?.b ?? 0.2)}×${cm(hD)}`, "C-TEXT", 0, 3);
  text(c + Lb - 0.05, -hS - 0.035, TH, `${r.sh?.name ?? ""} ${cm(r.sh?.b ?? 0.2)}×${cm(hS)}`, "C-TEXT", 2, 3);
  const title = o.title ?? "รายละเอียดคานลึกต่างกันที่หัวเสา (หลังคานเท่ากัน)", yT = yb - 0.62;
  text(c / 2, yT, TH * 1.4, title, "C-TITLE", 1, 0);
  text(c / 2, yT - 0.12, TH * 0.9, `${o.sub ?? ""}มาตราส่วน ${o.scale ?? "1:25"}`, "C-TEXT", 1, 0);
  return { items: P, box: [-Lb - 0.3, yT - 0.2, c + Lb + 0.5, yHi + 0.3] }; // narrow enough for two details side by side on the A3 sheet
}
