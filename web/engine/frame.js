// Multi-storey frame (WSD): floors analysed from the top down; column axial loads accumulate floor by floor (+ self weight);
// a column with nothing under it becomes a point load on the beams of the floor below. Columns are checked with engine/column.js.
// frame.floors run bottom up: floor k is a beam level, its columns (length h) stand below it; column type level k is used there.
import { CONC, DEFAULT_WALL_TYPES, analyzeFloor, checkSpan, faceBars, parseBars } from "./floor.js";
import { BARS } from "./tables.js";
import { frame3dModel } from "./frame3d.js";
import { tiedColumn } from "./column.js";
import { pileCap } from "./footing.js";

const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
export const stackKey = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

// one column level: P (kg), clear height L (m), moments Mx / My (kg-m) from the 3D frame — at least the minimum eccentricity
// about the first axis; braced frame (case 2, k = 1)
export function checkColumn(lv, P, L, mat, mom = {}) {
  const [nx, ny] = faceBars(lv.n), e = Math.max(2.5, 0.1 * Math.min(lv.Bx, lv.By)); // cm
  const ST = { L: L * 100, bx: lv.Bx, by: lv.By }, BM = { L: 400, b: 20, t: 40 }; // stiffness data only enter frame cases 3–4
  const inp = { ...mat, L, Bx: lv.Bx, By: lv.By, nx, ny, mainBar: lv.mainBar, tieBar: lv.tieBar, tieSets: 1, P: Math.max(P, 1), Mx: Math.max((Math.max(P, 1) * e) / 100, mom.Mx ?? 0), My: mom.My ?? 0,
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
export function designFooting(P, pier, mat, fo = DEFAULT_FOOTING, Mx = 0, My = 0) {
  let best = null;
  // per option: bars @0.15 then @0.10; 1–2 pile caps may be widened (bar anchorage, minimum steel)
  const tries = fo.options.flatMap(([n, pile]) => [fo.bar, "DB 16"].flatMap((bar) => [0.15, 0.1].flatMap((bs) => (n <= 2 ? [0, 0.8, 0.9, 1.0] : [0]).map((w) => [n, pile, bs, w, bar]))));
  for (const [n, pile, bs, capWidth, bar] of tries) {
    const b = Number(pile.split("-")[1]) / 100, s = Math.max(0.6, fo.spacing * b);
    const inp = { fcPrime: mat.fcPrime, F: mat.F ?? 0.45, capFc: mat.capFc, Es: mat.Es, fy: fo.fy, cover: fo.cover, t: fo.t, Df: fo.Df, P, Mx, My, gamma: 1800, pier: "rect",
      bx: pier.Bx / 100, by: pier.By / 100, longBar: bar, shortBar: fo.bar, sLong: bs, sShort: bs, dowelBar: pier.mainBar ?? "DB 12", dowelN: pier.n ?? 4, n, pile, pileL: fo.pileL, fcPile: fo.fcPile, Ptest: fo.Psafe, sx: s, sy: s, capWidth };
    try {
      const r = pileCap(inp), ok = capOk(r), u = r.Ptmax / r.Pallow;
      if (ok) return { n, pile, r, ok, util: u };
      if (!best || u < best.util) best = { n, pile, r, ok, util: u };
    } catch (e) { best ??= { n, pile, error: e.message, ok: false, util: 9 }; }
  }
  return best;
}

// gravity analysis of every floor (continuous beams, top down) with column loads accumulated floor by floor
function gravity(frame, minTypes) {
  const { floors, beamTypes, colTypes, mat } = frame, n = floors.length, an = new Array(n), cols = [], warnings = [];
  let above = []; // columns of the floor above: { p, Pbot, stack }
  let downLines = []; // stair bottoms handed to the floor below
  for (let k = n - 1; k >= 0; k--) {
    // roof module reactions linked to this floor (frame.roofPoints, recomputed by the app whenever the roof changes)
    const fl = frame.roofLink?.on && frame.roofLink.floor === k ? { ...floors[k], pointLoads: [...(floors[k].pointLoads ?? []), ...(frame.roofPoints ?? [])] } : floors[k];
    // columns of the floor above with no column right under them stand on this floor's beams
    const extra = above.filter((c) => !fl.columns.some((q) => near(q, c.p))).map((c) => ({ p: c.p, P: c.Pbot, from: `เสา ${c.stack} (${floors[k + 1].name})` }));
    an[k] = analyzeFloor(fl, beamTypes, mat, extra, frame.wallTypes ?? DEFAULT_WALL_TYPES, downLines, minTypes?.[k]);
    downLines = an[k].down;
    if (k === 0) for (const d of downLines) warnings.push(`${fl.name}: ${d.from} ปลายล่างลงฐานราก/พื้นดิน (ไม่เข้าคาน)`);
    an[k].warnings.forEach((w) => warnings.push(`${fl.name}: ${w}`));
    above = fl.columns.map((p, i) => {
      const up = above.find((c) => near(c.p, p)), R = an[k].columns[i]?.R ?? 0, Ptop = R + (up?.Pbot ?? 0);
      // clear height (drawings: top of the beam below to the soffit of the beam above) = storey height − deepest beam at the top
      const dTop = Math.max(0, ...an[k].spans.filter((sp) => near(sp.a, p) || near(sp.b, p)).map((sp) => sp.type.h));
      const c = { floor: k, i, p, stack: stackKey(p), R, Ptop, L: fl.h, Lu: Math.max(0.3, fl.h - dTop), dTop };
      cols.push(c);
      return c;
    });
    // self weight and type are set below once the type is known; Pbot = Ptop + weight (first guess: the chosen type's level section)
    for (const c of above) {
      const t = colTypes[frame.colPick?.[c.stack] ?? 0] ?? colTypes[0], lv = t.levels[Math.min(k, t.levels.length - 1)];
      c.W = (CONC * lv.Bx * lv.By * c.L) / 1e4; c.Pbot = c.Ptop + c.W;
    }
  }
  return { an, cols, warnings };
}

// column types per stack: fixed (frame.colPick) or the lightest type whose sections pass at every level
function designColumns(frame, cols) {
  const { colTypes, mat } = frame;
  const stacks = [...new Set(cols.map((c) => c.stack))].map((key) => ({ key, list: cols.filter((c) => c.stack === key).sort((a, b) => a.floor - b.floor) }));
  const weight = (t) => t.levels.reduce((s, lv) => s + lv.Bx * lv.By, 0);
  const order = colTypes.map((t, i) => ({ t, i })).sort((a, b) => weight(a.t) - weight(b.t));
  const run = (t, list) => list.map((c) => { const lv = t.levels[Math.min(c.floor, t.levels.length - 1)]; return { lv, chk: checkColumn(lv, c.Pd ?? c.Pbot, c.Lu ?? c.L, mat, c.M3 ?? {}) }; });
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
  return stacks;
}

const steelA = (s) => { const x = parseBars(s); return x ? x.n * BARS[x.bar].A : 0; };
const tWeight = (t) => t.b * t.h * 1e4 + (steelA(t.top) + steelA(t.bot) + steelA(t.topX) + steelA(t.botX)) / 100;
// a span checked with its design forces and its deflection scaled to another type: δ · I(span type) / I(t)
function checkEnv(t, sp, mat) {
  const c = checkSpan(t, sp, mat), d = sp.defl, f = (sp.type.b * sp.type.h ** 3) / (t.b * t.h ** 3);
  const dd = d ? { ...d, dL: d.dL * f, dT: d.dT * f, ok: d.dL * f <= d.limL + 1e-9 && d.dT * f <= d.limT + 1e-9 } : { ok: true };
  return { ...c, defl: dd, ok: c.ok && dd.ok, util: Math.max(c.util, d ? Math.max(dd.dT / d.limT, dd.dL / d.limL) : 0) };
}

// frame.analysis: "envelope" (default) = design forces are the larger of the continuous beams and the 3D rigid-joint frame
// (gravity, P-Delta); "continuous" = continuous beams only (as before 2026-11-02)
export function analyzeFrame(frame) {
  const { beamTypes, mat } = frame, envelope = (frame.analysis ?? "envelope") === "envelope";
  let g, stacks, f3 = null, minTypes = null;
  for (let it = 0; it < 4; it++) {
    g = gravity(frame, minTypes);
    stacks = designColumns(frame, g.cols);
    if (!envelope) break;
    f3 = frame3dModel(frame, { floors: g.an, columns: g.cols });
    if (f3.error) { g.warnings.push(`โครง 3 มิติ: ${f3.error} — ใช้ผลคานต่อเนื่อง`); f3 = null; break; }
    // beam types: each drawn (auto) beam must pass with the envelope forces on all its spans
    const next = g.an.map(() => ({}));
    let changed = false;
    g.an.forEach((an, k) => {
      for (const sp of an.spans) {
        const fr = f3.spans.find((x) => x.floor === k && x.id === sp.id);
        sp.f3 = fr ?? null;
        sp.envF = { Mpos: Math.max(sp.Mpos, fr?.Mpos ?? 0), Mneg: Math.max(sp.Mneg, fr?.Mneg ?? 0), V: Math.max(sp.V, fr?.V ?? 0), Mt: Math.max(sp.Mt ?? 0, fr?.T ?? 0) };
      }
      const order = beamTypes.map((t, i) => ({ t, i })).sort((a, b) => tWeight(a.t) - tWeight(b.t));
      frame.floors[k].beams.forEach((b, m) => {
        if (b.type != null) return;
        const sps = an.spans.filter((sp) => sp.member === m);
        if (!sps.length) return;
        const cur = sps[0].typeIdx, ok = (t) => sps.every((sp) => checkEnv(t, { ...sp, ...sp.envF }, mat).ok);
        if (ok(beamTypes[cur])) { if (minTypes?.[k]?.[m] != null) next[k][m] = minTypes[k][m]; return; }
        const pick = order.find((o) => tWeight(o.t) > tWeight(beamTypes[cur]) && ok(o.t));
        if (!pick) return; // nothing heavier passes: keep the type, the span shows NG with its reason
        next[k][m] = pick.i; changed = true;
      });
    });
    minTypes = next;
    if (!changed) break;
  }
  // final checks of every span with its design forces (envelope when the frame ran)
  for (const an of g.an) {
    for (const sp of an.spans) {
      const F = sp.envF ?? { Mpos: sp.Mpos, Mneg: sp.Mneg, V: sp.V, Mt: sp.Mt ?? 0 };
      sp.cont = { Mpos: sp.Mpos, Mneg: sp.Mneg, V: sp.V, Mt: sp.Mt ?? 0 };
      sp.src = { Mpos: F.Mpos > sp.Mpos + 1e-6 ? "3D" : "ต่อเนื่อง", Mneg: F.Mneg > sp.Mneg + 1e-6 ? "3D" : "ต่อเนื่อง", V: F.V > sp.V + 1e-6 ? "3D" : "ต่อเนื่อง" };
      Object.assign(sp, F);
      sp.check = checkEnv(sp.type, sp, mat); sp.ok = sp.check.ok;
    }
    an.ok = an.spans.every((x) => x.ok) && !an.lines.some((l) => l.error);
  }
  // columns: axial load = larger of the accumulated reactions and the frame; moments from the frame (both axes)
  if (f3) {
    for (const c of g.cols) {
      const fc = f3.columns.find((x) => x.floor === c.floor && x.ci === c.i);
      c.f3 = fc ?? null; c.Pd = Math.max(c.Pbot, fc?.N ?? 0); c.M3 = { Mx: fc?.Mx ?? 0, My: fc?.My ?? 0 };
    }
    stacks = designColumns(frame, g.cols);
  }
  const base = (c) => f3?.base.find((b) => near(b.p, c.p));
  const footings = g.cols.filter((c) => c.floor === 0).map((c) => {
    const b = base(c), P = Math.max(c.Pbot, b?.R[2] ?? 0), Mx = Math.abs(b?.R[3] ?? 0), My = Math.abs(b?.R[4] ?? 0);
    return { p: c.p, stack: c.stack, P, Mx, My, ...designFooting(P, c.lv, mat, frame.footing ?? DEFAULT_FOOTING, Mx, My) };
  });
  return { floors: g.an, columns: g.cols, stacks, footings, frame3d: f3, analysis: f3 ? "envelope" : "continuous", warnings: [...new Set(g.warnings)],
    ok: g.an.every((a) => a.ok) && stacks.every((s) => s.ok) && footings.every((f) => f.ok) };
}
