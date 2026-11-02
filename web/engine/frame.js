// Multi-storey frame (WSD): floors analysed from the top down; column axial loads accumulate floor by floor (+ self weight);
// a column with nothing under it becomes a point load on the beams of the floor below. Columns are checked with engine/column.js.
// frame.floors run bottom up: floor k is a beam level, its columns (length h) stand below it; column type level k is used there.
import { CONC, DEFAULT_WALL_TYPES, analyzeFloor, faceBars } from "./floor.js";
import { tiedColumn } from "./column.js";
import { pileCap } from "./footing.js";

const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
export const stackKey = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

// one column level: P (kg) with the minimum eccentricity about its weaker axis, braced frame (case 2, k = 1)
export function checkColumn(lv, P, L, mat) {
  const [nx, ny] = faceBars(lv.n), e = Math.max(2.5, 0.1 * Math.min(lv.Bx, lv.By)); // cm
  const ST = { L: L * 100, bx: lv.Bx, by: lv.By }, BM = { L: 400, b: 20, t: 40 }; // stiffness data only enter frame cases 3–4
  const inp = { ...mat, L, Bx: lv.Bx, By: lv.By, nx, ny, mainBar: lv.mainBar, tieBar: lv.tieBar, tieSets: 1, P: Math.max(P, 1), Mx: (Math.max(P, 1) * e) / 100, My: 0,
    frameCase: 2, beamTL: BM, beamTR: BM, beamBL: BM, beamBR: BM, colTop: ST, colThis: ST, colThisB: ST, colBot: ST };
  try {
    const r = tiedColumn(inp), sOk = lv.s * 100 <= r.sTie + 1e-6;
    const util = r.mode === "I" ? r.axialRatio : r.ratio;
    return { r, e, sOk, util: Number.isFinite(util) ? util : 9, ok: r.ok && r.pgOk && Number.isFinite(r.R) && sOk };
  } catch (err) { return { error: err.message, ok: false, util: 9 }; }
}

// Pile caps under the base columns: lightest option (pile count, pile size) that passes, with the pile safe load from the drawings
export const DEFAULT_FOOTING = { t: 0.4, Df: 1.2, cover: 7.5, fy: 4000, fcPile: 350, pileL: 6, Psafe: 18000, bar: "DB 12", spacing: 3,
  options: [[1, "I-18"], [1, "I-22"], [1, "I-26"], [2, "I-18"], [2, "I-22"], [2, "I-26"], [3, "I-22"], [4, "I-22"]] };
const capOk = (r) => r.pileOk && r.dOk && r.vOk && r.vpOk && r.vppOk && r.AsOkL && r.AsOkS && r.perimOk && r.ancOk && r.bearingOk;
export function designFooting(P, pier, mat, fo = DEFAULT_FOOTING) {
  let best = null;
  // per option: bars @0.15 then @0.10; 1–2 pile caps may be widened (bar anchorage, minimum steel)
  const tries = fo.options.flatMap(([n, pile]) => [fo.bar, "DB 16"].flatMap((bar) => [0.15, 0.1].flatMap((bs) => (n <= 2 ? [0, 0.8, 0.9, 1.0] : [0]).map((w) => [n, pile, bs, w, bar]))));
  for (const [n, pile, bs, capWidth, bar] of tries) {
    const b = Number(pile.split("-")[1]) / 100, s = Math.max(0.6, fo.spacing * b);
    const inp = { fcPrime: mat.fcPrime, F: mat.F ?? 0.45, capFc: mat.capFc, Es: mat.Es, fy: fo.fy, cover: fo.cover, t: fo.t, Df: fo.Df, P, Mx: 0, My: 0, gamma: 1800, pier: "rect",
      bx: pier.Bx / 100, by: pier.By / 100, longBar: bar, shortBar: fo.bar, sLong: bs, sShort: bs, dowelBar: pier.mainBar ?? "DB 12", dowelN: pier.n ?? 4, n, pile, pileL: fo.pileL, fcPile: fo.fcPile, Ptest: fo.Psafe, sx: s, sy: s, capWidth };
    try {
      const r = pileCap(inp), ok = capOk(r), u = r.Ptmax / r.Pallow;
      if (ok) return { n, pile, r, ok, util: u };
      if (!best || u < best.util) best = { n, pile, r, ok, util: u };
    } catch (e) { best ??= { n, pile, error: e.message, ok: false, util: 9 }; }
  }
  return best;
}

export function analyzeFrame(frame) {
  const { floors, beamTypes, colTypes, mat } = frame, n = floors.length, an = new Array(n), cols = [], warnings = [];
  let above = []; // columns of the floor above: { p, Pbot, stack }
  let downLines = []; // stair bottoms handed to the floor below
  for (let k = n - 1; k >= 0; k--) {
    // roof module reactions linked to this floor (frame.roofPoints, recomputed by the app whenever the roof changes)
    const fl = frame.roofLink?.on && frame.roofLink.floor === k ? { ...floors[k], pointLoads: [...(floors[k].pointLoads ?? []), ...(frame.roofPoints ?? [])] } : floors[k];
    // columns of the floor above with no column right under them stand on this floor's beams
    const extra = above.filter((c) => !fl.columns.some((q) => near(q, c.p))).map((c) => ({ p: c.p, P: c.Pbot, from: `เสา ${c.stack} (${floors[k + 1].name})` }));
    an[k] = analyzeFloor(fl, beamTypes, mat, extra, frame.wallTypes ?? DEFAULT_WALL_TYPES, downLines);
    downLines = an[k].down;
    if (k === 0) for (const d of downLines) warnings.push(`${fl.name}: ${d.from} ปลายล่างลงฐานราก/พื้นดิน (ไม่เข้าคาน)`);
    an[k].warnings.forEach((w) => warnings.push(`${fl.name}: ${w}`));
    above = fl.columns.map((p, i) => {
      const up = above.find((c) => near(c.p, p)), R = an[k].columns[i]?.R ?? 0, Ptop = R + (up?.Pbot ?? 0);
      const c = { floor: k, i, p, stack: stackKey(p), R, Ptop, L: fl.h };
      cols.push(c);
      return c;
    });
    // self weight and type are set below once the type is known; Pbot = Ptop + weight (first guess: the chosen type's level section)
    for (const c of above) {
      const t = colTypes[frame.colPick?.[c.stack] ?? 0] ?? colTypes[0], lv = t.levels[Math.min(k, t.levels.length - 1)];
      c.W = (CONC * lv.Bx * lv.By * c.L) / 1e4; c.Pbot = c.Ptop + c.W;
    }
  }
  // column types per stack: fixed (frame.colPick) or the lightest type whose sections pass at every level
  const stacks = [...new Set(cols.map((c) => c.stack))].map((key) => ({ key, list: cols.filter((c) => c.stack === key).sort((a, b) => a.floor - b.floor) }));
  const weight = (t) => t.levels.reduce((s, lv) => s + lv.Bx * lv.By, 0);
  const order = colTypes.map((t, i) => ({ t, i })).sort((a, b) => weight(a.t) - weight(b.t));
  const run = (t, list) => list.map((c) => { const lv = t.levels[Math.min(c.floor, t.levels.length - 1)]; return { lv, chk: checkColumn(lv, c.Pbot, c.L, mat) }; });
  for (const st of stacks) {
    const fixed = frame.colPick?.[st.key];
    let pick = null;
    if (fixed != null && colTypes[fixed]) pick = { i: fixed, res: run(colTypes[fixed], st.list) };
    else for (const { t, i } of order) {
      const res = run(t, st.list), u = Math.max(...res.map((x) => x.chk.util));
      if (res.every((x) => x.chk.ok)) { pick = { i, res }; break; }
      if (!pick || u < pick.u) pick = { i, res, u };
    }
    st.typeIdx = pick.i; st.own = fixed != null;
    st.list.forEach((c, j) => Object.assign(c, { typeIdx: pick.i, lv: pick.res[j].lv, check: pick.res[j].chk, ok: pick.res[j].chk.ok }));
    st.ok = st.list.every((c) => c.ok);
  }
  const footings = cols.filter((c) => c.floor === 0).map((c) => ({ p: c.p, stack: c.stack, P: c.Pbot, ...designFooting(c.Pbot, c.lv, mat, frame.footing ?? DEFAULT_FOOTING) }));
  return { floors: an, columns: cols, stacks, footings, warnings: [...new Set(warnings)], ok: an.every((a) => a.ok) && stacks.every((s) => s.ok) && footings.every((f) => f.ok) };
}
