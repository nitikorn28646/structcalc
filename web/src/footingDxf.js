// Footing drawings as one DXF file (user 2026-11-24: "สั่งออกเป็น dxf แปลนและแบบขยายฐานราก ตามตัวอย่างนี้", their new_block.dxf:
// EN-02 plan 1:100 + EN-11…13 details 1:25 as the model):
//   sheet 1 = FOOTING PLAN on the same A3 frame drawn ×(scale/25) (1:100, or 1:125 / 1:150 / 1:200 … when the plan does not fit):
//     grid dash-dot with bubbles (X letters on top, Y numbers on the right, as the app), grid spacing chains + overall, every footing at
//     true size (red = overlapping / too close), its width / length dims where there is room, tag "F1,C1", columns solid at true size,
//     piles dashed, title + scale, footing schedule (mark, count, size, Df, piles, bars, pier, dowels) and notes;
//   sheets 2… = one DETAIL per footing mark (engine/footingDetail.js: plan + section ก–ก, 1:25), packed two or more per sheet.
// Metres in model space; everything goes through the R2010 writer of src/beamDetailDxf.js (Thai text style T5 = AngsanaUPC).
import { Dxf, frame, emitModel, modelSheets, SW, SH, BX0, BY0, BY1, TX } from "./beamDetailDxf.js";
import { footingDetailModel, footingScheduleRow, combinedDetailModel } from "../engine/footingDetail.js";
import { footingMarks } from "./footingMarks.js";
import { dimItem } from "../engine/dimParts.js";
import { gridAxes } from "./planKit.js";
import { PILES } from "../engine/footing.js";

const f2 = (v) => Number(v).toFixed(2);
const SCALES = [100, 125, 150, 200, 250, 300, 400, 500];

// the same frame calls drawn k times bigger at (X0, 0): every coordinate and text height × k
const scaled = (d, k, X0) => ({
  line: (x1, y1, x2, y2, l, c) => d.line(X0 + x1 * k, y1 * k, X0 + x2 * k, y2 * k, l, c),
  poly: (pts, l, cl, w = 0, c = 0) => d.poly(pts.map(([x, y, b]) => [X0 + x * k, y * k, b]), l, cl, w * k, c),
  text: (x, y, h, s, l, ha, va, rot, color, at, wf) => d.text(X0 + x * k, y * k, h * k, s, l, ha, va, rot, color, at ? [X0 + at[0] * k, at[1] * k] : null, wf),
  circle: (x, y, r, l, c) => d.circle(X0 + x * k, y * k, r * k, l, c),
  arc: (x, y, r, a0, a1, l, c) => d.arc(X0 + x * k, y * k, r * k, a0, a1, l, c),
});

// groups by mark: { mark, f (first footing), list, cols (column type names) }
export function footingGroups(frame, res) {
  const foots = (res.footings ?? []).filter((f) => f.r && f.inp), M = footingMarks(foots);
  const cols0 = (res.columns ?? []).filter((c) => c.floor === 0), colAt = (p) => cols0.find((c) => Math.hypot(c.p[0] - p[0], c.p[1] - p[1]) < 0.05);
  const by = new Map();
  for (const f of foots) { const m = M.mark(f); if (!by.has(m)) by.set(m, { mark: m, f, list: [], cols: new Set() }); const g = by.get(m); g.list.push(f);
    const c = colAt(f.p), n = c ? frame.colTypes?.[c.typeIdx]?.name : null; if (n) g.cols.add(n); }
  const groups = [...by.values()].sort((a, b) => a.mark.localeCompare(b.mark, undefined, { numeric: true }));
  return { foots, M, groups, colAt };
}

export function footingDetailModels(frame, res) {
  const { groups, colAt } = footingGroups(frame, res), mat = frame.mat ?? {};
  return groups.map((g) => { const c = colAt(g.f.p);
    if (g.f.kind === "combined") return { mark: g.mark, model: combinedDetailModel(g.f, { mark: g.mark }) };
    return { mark: g.mark, model: footingDetailModel(g.f, { mark: g.mark, count: g.list.length, lv: c?.lv, colName: [...g.cols].join(", "), coverCol: mat.coverPier ?? mat.coverCol ?? mat.cover ?? 3 }) }; })
    .filter((x) => x.model);
}

function planSheet(d, X0, k, frameData, res, project, title) {
  const { foots, M, groups, colAt } = footingGroups(frameData, res), S = k * 25, u = S / 100;
  const sd = scaled(d, k, X0);
  frame(sd, 0, project, title);
  // ---- extents (model metres)
  const G = frameData.floors?.[0]?.grid ?? {}, ax = G.dx?.length ? gridAxes(G) : null;
  const uniq = (vs) => [...new Set(vs.map((v) => +v.toFixed(3)))].sort((a, b) => a - b);
  const GX = ax && ax.GX.length > 1 ? ax.GX : uniq(foots.map((f) => f.p[0])), GY = ax && ax.GY.length > 1 ? ax.GY : uniq(foots.map((f) => f.p[1]));
  const xName = ax && ax.GX.length > 1 ? ax.xName : (i) => String.fromCharCode(65 + i), yName = ax && ax.GY.length > 1 ? ax.yName : (i) => String(GY.length - i);
  const fx = foots.flatMap((f) => [(f.center ?? f.p)[0] - f.r.Bx / 2, (f.center ?? f.p)[0] + f.r.Bx / 2]), fy = foots.flatMap((f) => [(f.center ?? f.p)[1] - f.r.By / 2, (f.center ?? f.p)[1] + f.r.By / 2]);
  const mx0 = Math.min(...fx, ...GX), mx1 = Math.max(...fx, ...GX), my0 = Math.min(...fy, ...GY), my1 = Math.max(...fy, ...GY);
  // layout inside the drawing area (sheet units × k = model metres from the sheet's left / bottom)
  const AL = BX0 * k + 0.6 * u, AR = TX * k - 0.6 * u, AT = BY1 * k - 0.5 * u, AB = BY0 * k + 0.5 * u;
  const tabH = (groups.length + 2) * 0.36 * u + 0.5 * u, planW = mx1 - mx0 + 4.6 * u, planH = my1 - my0 + 4.0 * u;
  const ox = X0 + AL + Math.max(0, (AR - AL - planW) / 2) + 1.0 * u - mx0, oy = AB + tabH + 0.6 * u + Math.max(0, (AT - AB - tabH - 0.6 * u - planH) / 2) + 0.8 * u - my0;
  const P = (x, y) => [ox + x, oy + y];
  const L = (x1, y1, x2, y2, l = "C-CONC", c = 0) => { const [a, b] = P(x1, y1), [e, g] = P(x2, y2); d.line(a, b, e, g, l, c); };
  const T = (x, y, h, s, l = "C-TEXT", ha = 0, va = 0, rot = 0, c = 0) => { const [a, b] = P(x, y); d.text(a, b, h, s, l, ha, va, rot, c); };
  // REAL dimensions (DIMENSION entities, user 2026-11-24): line red, extension lines gray, text green (red for a clashing footing);
  // without an object point the extension lines are short (the dimension line runs 0.1·u from the measured points)
  const dimO = { th: 0.15 * u, cd: 1, ce: 8 };
  const dimH = (xa, xb, y, label, yObj = null, c = 0) => d.dimension(dimItem(xa, yObj ?? y - 0.1 * u, xb, yObj ?? y - 0.1 * u, y - (yObj ?? y - 0.1 * u), label, dimO.th, { ...dimO, ct: c || 3 }), ox, oy);
  const dimV = (ya, yb, x, label, xObj = null, c = 0) => { const xo = xObj ?? x - 0.1 * u; d.dimension(dimItem(xo, ya, xo, yb, xo - x, label, dimO.th, { ...dimO, ct: c || 3 }), ox, oy); };
  // ---- grid: dash-dot lines, bubbles, chains
  const gx0 = mx0 - 0.8 * u, gx1 = mx1 + 0.9 * u, gy0 = my0 - 0.8 * u, gy1 = my1 + 0.9 * u;
  // grid line = ONE line with the CENTER2 line type (1.125 m pattern at 1:100), user 2026-11-24 "ให้เส้นเป็นเส้นเดียวกัน"
  const dashDot = (x1, y1, x2, y2) => d.withLt("CENTER2", u, () => L(x1, y1, x2, y2, "C-GRID", 8));
  for (const x of GX) dashDot(x, gy0, x, gy1 + 1.4 * u);
  for (const y of GY) dashDot(gx0, y, gx1 + 1.6 * u, y);
  const rB = 0.25 * u;
  GX.forEach((x, i) => { const [a, b] = P(x, gy1 + 1.4 * u + rB); d.circle(a, b, rB, "C-GRID", 3); T(x, gy1 + 1.4 * u + rB, 0.22 * u, xName(i), "C-TEXT", 1, 2, 0, 6); });
  GY.forEach((y, i) => { const [a, b] = P(gx1 + 1.6 * u + rB, y); d.circle(a, b, rB, "C-GRID", 3); T(gx1 + 1.6 * u + rB, y, 0.22 * u, yName(i), "C-TEXT", 1, 2, 0, 6); });
  for (let i = 1; i < GX.length; i++) dimH(GX[i - 1], GX[i], gy1 + 0.45 * u, f2(GX[i] - GX[i - 1]));
  if (GX.length > 2) dimH(GX[0], GX.at(-1), gy1 + 0.85 * u, f2(GX.at(-1) - GX[0]));
  for (let i = 1; i < GY.length; i++) dimV(GY[i - 1], GY[i], gx1 + 0.5 * u, f2(GY[i] - GY[i - 1]));
  if (GY.length > 2) dimV(GY[0], GY.at(-1), gx1 + 0.95 * u, f2(GY.at(-1) - GY[0]));
  // ---- footings
  const need = 0.45 * u;
  const ctr = (f) => f.center ?? f.p; // combined footing: its own centre (the second column's entry is drawn as a column only)
  for (const f of foots) {
    const B = f.r.Bx, D = f.r.By, [cx, cy] = ctr(f), red = f.clash?.length ? 1 : 0, mark = M.mark(f);
    if (f.dup) { const col = colAt(f.p), cB = (col?.lv?.Bx ?? 20) / 100, cD = (col?.lv?.By ?? 20) / 100, [a, b] = P(f.p[0] - cB / 2, f.p[1]), [e] = P(f.p[0] + cB / 2, f.p[1]); d.poly([[a, b], [e, b]], "C-COL", false, cD, 3); continue; }
    const room = (dir) => Math.min(Infinity, ...foots.filter((g) => g !== f && !g.dup && !(g.combined && g.combined === f.combined)).map((g) => {
      const gp = ctr(g), ox_ = Math.abs(gp[0] - cx) < (B + g.r.Bx) / 2 + 0.3 * u, oy_ = Math.abs(gp[1] - cy) < (D + g.r.By) / 2 + 0.3 * u;
      if (dir === "up" && ox_ && gp[1] > cy) return gp[1] - g.r.By / 2 - (cy + D / 2);
      if (dir === "down" && ox_ && gp[1] < cy) return cy - D / 2 - (gp[1] + g.r.By / 2);
      if (dir === "right" && oy_ && gp[0] > cx) return gp[0] - g.r.Bx / 2 - (cx + B / 2);
      if (dir === "left" && oy_ && gp[0] < cx) return cx - B / 2 - (gp[0] + g.r.Bx / 2);
      return Infinity; }));
    const up = room("up"), dn = room("down"), rt = room("right"), lf = room("left"), tagH = 0.32 * u;
    const wSide = up >= need + (up < Infinity ? tagH : 0) ? 1 : dn >= need + tagH + (dn < Infinity ? need : 0) ? -1 : 0, dSide = rt >= need ? 1 : lf >= need ? -1 : 0;
    // outline, piles, column
    { const [a, b] = P(cx - B / 2, cy - D / 2), [e, g] = P(cx + B / 2, cy + D / 2); d.poly([[a, b], [e, b], [e, g], [a, g]], "C-CONC", true, red ? 0.04 * u : 0, red || 3); }
    for (const [px, py] of f.r.piles ?? []) { if (f.kind === "spread" || !f.n) break; const h = (PILES[f.pile]?.b ?? 0.2) / 2;
      d.withLt("HIDDEN2", 0.5 * u, () => d.poly([[-h, -h], [h, -h], [h, h], [-h, h]].map(([a, b]) => P(cx + px + a, cy + py + b)), "C-PILE", true, 0, 2)); }
    const col = colAt(f.p), cB = (col?.lv?.Bx ?? 20) / 100, cD = (col?.lv?.By ?? 20) / 100;
    { const [a, b] = P(f.p[0] - cB / 2, f.p[1]), [e] = P(f.p[0] + cB / 2, f.p[1]); d.poly([[a, b], [e, b]], "C-COL", false, cD, 3); }
    if (wSide) dimH(cx - B / 2, cx + B / 2, wSide > 0 ? cy + D / 2 + 0.22 * u : cy - D / 2 - 0.22 * u, f2(B), wSide > 0 ? cy + D / 2 : cy - D / 2, red);
    if (dSide) dimV(cy - D / 2, cy + D / 2, dSide > 0 ? cx + B / 2 + 0.22 * u : cx - B / 2 - 0.22 * u, f2(D), dSide > 0 ? cx + B / 2 : cx - B / 2, red);
    const ct = col ? frameData.colTypes?.[col.typeIdx]?.name : "", label = `${mark}${ct ? `,${ct}` : ""}${!wSide || !dSide ? ` ${f2(B)}x${f2(D)}` : ""}`;
    const below = dn >= (wSide < 0 ? need : 0) + tagH;
    const ty = below ? cy - D / 2 - (wSide < 0 ? need : 0) - 0.08 * u : cy + D / 2 + (wSide > 0 ? need : 0) + 0.08 * u;
    T(cx - B / 2 + 0.03 * u, ty, 0.15 * u, label, "C-TAG", 0, below ? 3 : 1, 0, red || 3);
  }
  // ---- schedule table + notes (bottom of the drawing area), title + scale at the bottom right
  const heads = ["ฐาน", "จำนวน", "กว้าง × ยาว × หนา (ม.)", "ลึก Df (ม.)", "เข็ม / ฐานแผ่", "เหล็กล่างแนว X", "เหล็กล่างแนว Y", "ตอม่อ (ม.)", "เดือย"];
  const cw = [0.8, 0.8, 2.3, 1.1, 1.6, 2.6, 2.6, 1.3, 1.2].map((v) => v * u), rh = 0.36 * u, tX = X0 + AL, tY = AB + tabH - 0.35 * u, tw = cw.reduce((a, b) => a + b, 0);
  d.text(tX, tY + 0.12 * u, 0.22 * u, "ตารางฐานราก", "C-TITLE", 0, 1, 0, 3);
  const rows = [heads, ...groups.map((g) => footingScheduleRow(g.f, g.mark, g.list.filter((x) => !x.dup).length))];
  rows.forEach((row, i) => { const y = tY - i * rh; d.line(tX, y, tX + tw, y, i ? "C-FRAME2" : "C-FRAME"); let x = tX; row.forEach((s, j) => { d.text(x + 0.08 * u, y - rh / 2, (i ? 0.14 : 0.15) * u, s, "C-TEXT", 0, 2, 0, 3); x += cw[j]; }); });
  { const yE = tY - rows.length * rh; d.line(tX, yE, tX + tw, yE, "C-FRAME"); let x = tX; for (let j = 0; j <= cw.length; j++) { d.line(x, tY, x, yE, "C-FRAME2"); x += cw[j] ?? 0; } }
  const qa = frameData.soil?.qa, pileF = groups.find((g) => g.f.kind !== "spread" && g.f.n);
  const notes = ["หมายเหตุ", "1. ขนาดเป็นเมตร ศูนย์ฐานรากตรงศูนย์เสา เว้นแต่ระบุ · Df วัดจากระดับดินถึงท้องฐานราก",
    "2. เหล็กเสริม ระยะหุ้ม และรายละเอียดอื่น ดูแบบขยายฐานราก (แผ่นถัดไป)", "3. ใต้ฐานรากเทคอนกรีตหยาบ 5 ซม. บนทรายอัดแน่น 5 ซม.",
    ...(qa ? [`4. ฐานแผ่ออกแบบด้วยแรงแบกทานดินที่ยอมให้ ${Math.round(qa).toLocaleString()} กก./ตร.ม. — ตรวจสอบดินจริงก่อนก่อสร้าง`] : []),
    ...(pileF ? [`${qa ? 5 : 4}. เข็ม ${[...new Set(groups.filter((g) => g.f.kind !== "spread" && g.f.n).map((g) => `${g.f.pile}${g.f.r?.Pallow ? ` ${f2(g.f.r.Pallow / 1000)} ตัน/ต้น` : ""}`))].join(", ")} (น้ำหนักปลอดภัย)`] : []),
    ...(foots.some((f) => f.clash?.length) ? ["ฐานที่ขอบหนา = ซ้อนหรือชิดฐานข้างเคียงเกินไป ต้องแก้ก่อนใช้แบบ"] : [])];
  const nX = tX + tw + 0.6 * u; notes.forEach((s, i) => d.text(nX, tY - i * 0.3 * u, (i ? 0.15 : 0.18) * u, s, i ? "C-TEXT" : "C-TITLE", 0, 2, 0, 3));
  const xT = X0 + AR - 3.2 * u, yT = AB + 0.4 * u;
  d.text(xT, yT + 0.45 * u, 0.3 * u, "แปลนฐานราก", "C-TITLE", 0, 1, 0, 3); d.line(xT, yT + 0.38 * u, xT + 2.4 * u, yT + 0.38 * u, "C-TITLE", 3); d.text(xT, yT + 0.12 * u, 0.17 * u, `มาตราส่วน 1:${S}`, "C-TEXT", 0, 1, 0, 3);
}

// whole file: plan sheet + detail sheets. project = { name, location, owner, engineer, license, date }
export function footingSheetsDxf(frameData, res, project = {}) {
  const foots = (res.footings ?? []).filter((f) => f.r && f.inp);
  if (!foots.length) return { dxf: "", sheets: 0, error: "ยังไม่มีฐานรากที่ออกแบบแล้ว" };
  const fx = foots.flatMap((f) => [(f.center ?? f.p)[0] - f.r.Bx / 2, (f.center ?? f.p)[0] + f.r.Bx / 2]), fy = foots.flatMap((f) => [(f.center ?? f.p)[1] - f.r.By / 2, (f.center ?? f.p)[1] + f.r.By / 2]);
  const G = frameData.floors?.[0]?.grid ?? {}, ax = G.dx?.length ? gridAxes(G) : { GX: [], GY: [] };
  const w = Math.max(...fx, ...ax.GX) - Math.min(...fx, ...ax.GX), h = Math.max(...fy, ...ax.GY) - Math.min(...fy, ...ax.GY), nG = footingGroups(frameData, res).groups.length;
  // smallest scale where the plan (+ bubbles / dims) and the table fit the drawing area
  const S = SCALES.find((s) => { const k = s / 25, u = s / 100; return w + 4.6 * u <= (TX - BX0) * k - 1.2 * u && h + 4.0 * u <= (BY1 - BY0) * k - 1.6 * u - ((nG + 2) * 0.36 * u + 0.5 * u); }) ?? 500;
  const k = S / 25, models = footingDetailModels(frameData, res).map((m) => ({ model: m.model }));
  const nDet = modelSheets(new Dxf(), models, project, "", 0), total = 1 + nDet, d = new Dxf();
  planSheet(d, 0, k, frameData, res, project, total > 1 ? `แปลนฐานราก (1/${total})` : "แปลนฐานราก");
  modelSheets(d, models, project, "แบบขยายฐานราก", SW * k + 2, 2, total);
  void SH;
  return { dxf: d.toString(), sheets: total, scale: S };
}

// the detail model of one footing (app / report figure = the same drawing as the DXF sheet)
export function footingDetailFor(frameData, res, f, mark = "") {
  const mat = frameData.mat ?? {}, c = (res.columns ?? []).find((x) => x.floor === 0 && Math.hypot(x.p[0] - f.p[0], x.p[1] - f.p[1]) < 0.05);
  const count = (res.footings ?? []).filter((g) => g.r && footingMarks(res.footings.filter((x) => x.r && x.inp)).mark(g) === mark).length;
  if (f.kind === "combined") return combinedDetailModel(f, { mark });
  return footingDetailModel(f, { mark, count: mark ? count : 0, lv: c?.lv, colName: c ? frameData.colTypes?.[c.typeIdx]?.name : "", coverCol: mat.coverPier ?? mat.coverCol ?? mat.cover ?? 3 });
}
