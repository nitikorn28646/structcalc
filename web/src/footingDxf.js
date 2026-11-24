// Footing drawings as one DXF file (user 2026-11-24: "สั่งออกเป็น dxf แปลนและแบบขยายฐานราก ตามตัวอย่างนี้", their new_block.dxf:
// EN-02 plan 1:100 + EN-11…13 details 1:25 as the model):
//   sheet 1 = FOOTING PLAN on the same A3 frame drawn ×(scale/25) (1:100, or 1:125 / 1:150 / 1:200 … when the plan does not fit):
//     grid dash-dot with bubbles (X letters on top, Y numbers on the right, as the app), grid spacing chains + overall, every footing at
//     true size (red = overlapping / too close), its width / length dims where there is room, tag "F1,C1", columns solid at true size,
//     piles dashed, title + scale, footing schedule (mark, count, size, Df, piles, bars, pier, dowels) and notes;
//   sheets 2… = one DETAIL per footing mark (engine/footingDetail.js: plan + section ก–ก, 1:25), packed two or more per sheet.
// Metres in model space; everything goes through the R2010 writer of src/beamDetailDxf.js (Thai text style T5 = AngsanaUPC).
import { Dxf, frame, emitModel, modelSheets, SW, SH, BX0, BY0, BY1, TX } from "./beamDetailDxf.js";
import { footingDetailModel, footingScheduleRow } from "../engine/footingDetail.js";
import { footingMarks } from "./footingMarks.js";
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
  const fx = foots.flatMap((f) => [f.p[0] - f.r.Bx / 2, f.p[0] + f.r.Bx / 2]), fy = foots.flatMap((f) => [f.p[1] - f.r.By / 2, f.p[1] + f.r.By / 2]);
  const mx0 = Math.min(...fx, ...GX), mx1 = Math.max(...fx, ...GX), my0 = Math.min(...fy, ...GY), my1 = Math.max(...fy, ...GY);
  // layout inside the drawing area (sheet units × k = model metres from the sheet's left / bottom)
  const AL = BX0 * k + 0.6 * u, AR = TX * k - 0.6 * u, AT = BY1 * k - 0.5 * u, AB = BY0 * k + 0.5 * u;
  const tabH = (groups.length + 2) * 0.36 * u + 0.5 * u, planW = mx1 - mx0 + 4.6 * u, planH = my1 - my0 + 4.0 * u;
  const ox = X0 + AL + Math.max(0, (AR - AL - planW) / 2) + 1.0 * u - mx0, oy = AB + tabH + 0.6 * u + Math.max(0, (AT - AB - tabH - 0.6 * u - planH) / 2) + 0.8 * u - my0;
  const P = (x, y) => [ox + x, oy + y];
  const L = (x1, y1, x2, y2, l = "C-CONC", c = 0) => { const [a, b] = P(x1, y1), [e, g] = P(x2, y2); d.line(a, b, e, g, l, c); };
  const T = (x, y, h, s, l = "C-TEXT", ha = 0, va = 0, rot = 0, c = 0) => { const [a, b] = P(x, y); d.text(a, b, h, s, l, ha, va, rot, c); };
  const tick = (x, y) => L(x - 0.06 * u, y - 0.06 * u, x + 0.06 * u, y + 0.06 * u, "C-DIM", 1);
  // colours as on the user's sheet: dimension line red, extension lines gray, text green
  const dimH = (xa, xb, y, label, yObj = null, c = 0) => { if (yObj != null) for (const x of [xa, xb]) L(x, yObj, x, y + Math.sign(y - yObj) * 0.1 * u, "C-DIM", 8);
    L(xa - 0.1 * u, y, xb + 0.1 * u, y, "C-DIM", 1); tick(xa, y); tick(xb, y); T((xa + xb) / 2, y + 0.06 * u, 0.15 * u, label, "C-DIM", 1, 1, 0, c || 3); };
  const dimV = (ya, yb, x, label, xObj = null, c = 0) => { if (xObj != null) for (const y of [ya, yb]) L(xObj, y, x + Math.sign(x - xObj) * 0.1 * u, y, "C-DIM", 8);
    L(x, ya - 0.1 * u, x, yb + 0.1 * u, "C-DIM", 1); tick(x, ya); tick(x, yb); T(x - 0.06 * u, (ya + yb) / 2, 0.15 * u, label, "C-DIM", 1, 1, 90, c || 3); };
  // ---- grid: dash-dot lines, bubbles, chains
  const gx0 = mx0 - 0.8 * u, gx1 = mx1 + 0.9 * u, gy0 = my0 - 0.8 * u, gy1 = my1 + 0.9 * u;
  const dashDot = (x1, y1, x2, y2) => { const len = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / len, uy = (y2 - y1) / len, pat = [0.8 * u, 0.15 * u, 0.06 * u, 0.15 * u]; let s = 0, i = 0;
    while (s < len - 1e-9) { const e = Math.min(len, s + pat[i % 4]); if (i % 2 === 0) L(x1 + ux * s, y1 + uy * s, x1 + ux * e, y1 + uy * e, "C-GRID", 8); s = e; i++; } };
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
  for (const f of foots) {
    const B = f.r.Bx, D = f.r.By, [cx, cy] = f.p, red = f.clash?.length ? 1 : 0, mark = M.mark(f);
    const room = (dir) => Math.min(Infinity, ...foots.filter((g) => g !== f).map((g) => {
      const ox_ = Math.abs(g.p[0] - cx) < (B + g.r.Bx) / 2 + 0.3 * u, oy_ = Math.abs(g.p[1] - cy) < (D + g.r.By) / 2 + 0.3 * u;
      if (dir === "up" && ox_ && g.p[1] > cy) return g.p[1] - g.r.By / 2 - (cy + D / 2);
      if (dir === "down" && ox_ && g.p[1] < cy) return cy - D / 2 - (g.p[1] + g.r.By / 2);
      if (dir === "right" && oy_ && g.p[0] > cx) return g.p[0] - g.r.Bx / 2 - (cx + B / 2);
      if (dir === "left" && oy_ && g.p[0] < cx) return cx - B / 2 - (g.p[0] + g.r.Bx / 2);
      return Infinity; }));
    const up = room("up"), dn = room("down"), rt = room("right"), lf = room("left"), tagH = 0.32 * u;
    const wSide = up >= need + (up < Infinity ? tagH : 0) ? 1 : dn >= need + tagH + (dn < Infinity ? need : 0) ? -1 : 0, dSide = rt >= need ? 1 : lf >= need ? -1 : 0;
    // outline, piles, column
    { const [a, b] = P(cx - B / 2, cy - D / 2), [e, g] = P(cx + B / 2, cy + D / 2); d.poly([[a, b], [e, b], [e, g], [a, g]], "C-CONC", true, red ? 0.04 * u : 0, red || 3); }
    for (const [px, py] of f.r.piles ?? []) { if (f.kind === "spread" || !f.n) break; const h = (PILES[f.pile]?.b ?? 0.2) / 2, q = [[-h, -h], [h, -h], [h, h], [-h, h]];
      for (let j = 0; j < 4; j++) { const [a, b] = q[j], [e, g] = q[(j + 1) % 4]; for (let s = 0; s < 1; s += 0.5) L(cx + px + a + (e - a) * s, cy + py + b + (g - b) * s, cx + px + a + (e - a) * (s + 0.3), cy + py + b + (g - b) * (s + 0.3), "C-PILE", 2); } }
    const col = colAt(f.p), cB = (col?.lv?.Bx ?? 20) / 100, cD = (col?.lv?.By ?? 20) / 100;
    { const [a, b] = P(cx - cB / 2, cy), [e] = P(cx + cB / 2, cy); d.poly([[a, b], [e, b]], "C-COL", false, cD, 3); }
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
  const rows = [heads, ...groups.map((g) => footingScheduleRow(g.f, g.mark, g.list.length))];
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
  const fx = foots.flatMap((f) => [f.p[0] - f.r.Bx / 2, f.p[0] + f.r.Bx / 2]), fy = foots.flatMap((f) => [f.p[1] - f.r.By / 2, f.p[1] + f.r.By / 2]);
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
  return footingDetailModel(f, { mark, count: mark ? count : 0, lv: c?.lv, colName: c ? frameData.colTypes?.[c.typeIdx]?.name : "", coverCol: mat.coverPier ?? mat.coverCol ?? mat.cover ?? 3 });
}
