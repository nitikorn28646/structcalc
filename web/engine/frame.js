// Multi-storey frame (WSD): floors analysed from the top down; column axial loads accumulate floor by floor (+ self weight);
// a column with nothing under it becomes a point load on the beams of the floor below. Columns are checked with engine/column.js.
// frame.floors run bottom up: floor k is a beam level, its columns (length h) stand below it; column type level k is used there.
import { borePileRebar } from "./borePile.js";
import { CONC, DEFAULT_WALL_TYPES, analyzeFloor, checkSpan, cutoffs, robustSpan, faceBars, parseBars, resolveWall, vAtD } from "./floor.js";
import { BARS } from "./tables.js";
import { frame3dModel } from "./frame3d.js";
import { tiedColumn } from "./column.js";
import { PILES, pileCap, spreadFooting } from "./footing.js";
import { expandCombos, levels, seismicForces, windForces } from "./lateral.js";

const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
export const stackKey = (p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

// one column level: P (kg), clear height L (m), moments Mx / My (kg-m) from the 3D frame — at least the minimum eccentricity
// about the first axis; braced frame (case 2, k = 1)
export function checkColumn(lv, P, L, mat, mom = {}) {
  const [nx, ny] = faceBars(lv.n), e = Math.max(2.5, 0.1 * Math.min(lv.Bx, lv.By)); // cm
  const ST = { L: L * 100, bx: lv.Bx, by: lv.By }, BM = { L: 400, b: 20, t: 40 }; // stiffness data only enter frame cases 3–4
  const inp = { ...mat, fcPrime: mat.fcCol ?? mat.fcPrime, cover: mat.coverCol ?? mat.cover, L, Bx: lv.Bx, By: lv.By, nx, ny, mainBar: lv.mainBar, tieBar: lv.tieBar, tieSets: 1, P: Math.max(P, 1), Mx: Math.max((Math.max(P, 1) * e) / 100, mom.Mx ?? 0), My: mom.My ?? 0,
    frameCase: 2, beamTL: BM, beamTR: BM, beamBL: BM, beamBR: BM, colTop: ST, colThis: ST, colThisB: ST, colBot: ST };
  try {
    const r = tiedColumn(inp), sOk = lv.s * 100 <= r.sTie + 1e-6;
    // the slenderness reduction R = 1.07 − 0.008·klu/r is valid up to klu/r = 100; beyond it R ≤ 0.27 and falls below zero
    // (a negative R gave a negative utilisation that passed) — such a column needs a second-order analysis: NG here
    const slenderOk = Number.isFinite(r.R) && r.R > 0 && !(r.klr > 100 + 1e-9);
    const util = r.mode === "I" ? r.axialRatio : r.ratio;
    return { r, e, sOk, slenderOk, util: slenderOk && Number.isFinite(util) ? util : 9, ok: r.ok && r.pgOk && slenderOk && sOk };
  } catch (err) { return { error: err.message, ok: false, util: 9 }; }
}

// Pile caps under the base columns: lightest option (pile count, pile size) that passes, with the pile safe load from the drawings
export const DEFAULT_FOOTING = { t: 0.4, Df: 1.2, cover: 7.5, fy: 4000, fcPile: 350, pileL: 6, Psafe: 18000, bar: "DB 12", spacing: 3,
  options: [[1, "I-18"], [1, "I-22"], [1, "I-26"], [2, "I-18"], [2, "I-22"], [2, "I-26"], [3, "I-22"], [4, "I-22"]] };
// a cap on one pile carries the column straight into the pile (no bending, no bond / anchorage demand; the bars are minimum steel
// with standard hooks) — the reference sheet checks pile load + minimum steel only, so bond and anchorage are not counted there
const capOk = (r, n) => r.pileOk && r.dOk && r.vOk && r.vpOk && r.vppOk && r.AsOkL && r.AsOkS && (n === 1 || (r.perimOk && r.ancOk)) && r.bearingOk;
// typical safe loads per pile (kg) — the default of every project (user standard 2026-11-04: I-18 = 18 t, I-22 = 22 t, I-26 = 26 t; the
// rest are starting values); the engineer enters the values of the pile maker / load test (frame.pileLoads)
export const PILE_SAFE = { "I-18": 18000, "I-22": 22000, "I-26": 26000, "I-30": 45000, "I-35": 55000, "I-40": 70000, "S-16": 14000, "S-18": 18000,
  "S-22": 25000, "S-26": 35000, "S-30": 45000, "S-35": 60000, "S-40": 80000, "SO-40": 70000, "SO-525": 120000, "HP-15": 12000,
  "Ø0.35": 30000, "Ø0.40": 40000, "Ø0.50": 60000, "Ø0.60": 85000, "Ø0.80": 150000, "Ø1.00": 230000 };
// footing type (step 8, like the drawings' F1, F2…): { name, n piles, pile, t cap (m), Df (m), k pile spacing (× pile width), w cap width
// (m, 1–2 piles; 0 = smallest), bar / s long bars, barS / sS short bars }. fo.fixed = the type picked for this column; fo.types = auto
// among the types (lightest first: piles × pile area, then cap thickness); neither = the built-in options (as before 2026-11-03).
// spread footing on soil (footing type kind "spread"): every check of the diff-tested engine; Bx/By 0 = sized from qa in 0.10 m steps
const spreadOk = (r) => r.qOk && r.qminOk && r.dOk && r.vOk && r.vpOk && r.AsOkL && r.AsOkS && r.perimOkL && r.perimOkS && r.ancOkL && r.ancOkS && r.perimOkD && r.bearingOk;
function designSpread(tt, P, pier, mat, fo, Mx, My) {
  // soil: one value for the site (frame.soil → fo.soil); a per-type qa / gamma of older files is used only when no site value is set
  const t0 = tt.t ?? 0.4, qa = fo.soil?.qa ?? tt.qa ?? 10000, gamma = fo.soil?.gamma ?? tt.gamma ?? 1800, Df0 = Math.max(tt.Df ?? 1.2, t0), r10 = (x) => Math.ceil(x * 10 - 1e-9) / 10;
  // first size: soil pressure of P + footing + soil above on a square, then grow both sides until every check passes (or +1.5 m);
  // at each size the thickness may grow from the type's t in 0.05 m steps (+0.40 m) when depth / shear governs, and bars given by
  // spacing may close up to @0.125 / @0.10 (minimum steel grows with d) — auto size only
  const B0 = r10(Math.sqrt(P / Math.max(qa * (fo.utilMax ?? 1) - (t0 * 2400 + (Df0 - t0) * gamma), 1)));
  const fixed = tt.Bx > 0 && tt.By > 0, ts = Array.from({ length: 9 }, (_, i) => Math.round((t0 + i * 0.05) * 100) / 100);
  const sizes = fixed ? [[tt.Bx, tt.By, t0]] : Array.from({ length: 16 }, (_, i) => Math.round((Math.max(B0, 0.6) + i / 10) * 10) / 10).flatMap((b) => ts.flatMap((t) => [1, 0.125, 0.1].map((k) => [b, b, t, k])));
  let best = null;
  for (const [Bx, By, t, sk = 1] of sizes) {
    const Df = Math.max(tt.Df ?? 1.2, t);
    const bar = tt.bar ?? "DB 12", barS = tt.barS ?? bar;
    // bar count ("6-DB 12"): the engine counts floor(B/s + 1) bars over the full width
    const okS = (x) => (x > 0.03 ? x : 0.15); // a spacing typed as 0 / left empty (user 2026-11-04: page crashed) → 0.15
    const tight = (x) => (sk < 1 ? Math.min(okS(x), sk) : okS(x)); // sk 1 = the type's own spacing
    const sL = tt.nb > 1 ? (By / (tt.nb - 1)) * (1 - 1e-9) : tight(tt.s ?? 0.15), sS = tt.nbS > 1 ? (Bx / (tt.nbS - 1)) * (1 - 1e-9) : tight(tt.sS ?? tt.s ?? 0.15);
    const inp = { fcPrime: mat.fcFoot ?? mat.fcPrime, F: mat.F ?? 0.45, capFc: mat.capFc, Es: mat.Es, fy: tt.fy ?? fo.fy, cover: mat.coverFoot ?? fo.cover, t, Bx, By, Df, P, Mx, My, qa, gamma,
      pier: "rect", bx: pier.Bx / 100, by: pier.By / 100, D: 0.3, longBar: bar, shortBar: barS, sLong: sL, sShort: sS, dowelBar: pier.mainBar ?? "DB 12", dowelN: pier.n ?? 4 };
    try {
      // fo.utilMax: the engineer's limit on soil use (e.g. 0.9 = q ≤ 90 % of qa)
      const r = spreadFooting(inp);
      // soil pressure with BOTH base moments at once (review 2026-11-04): the frozen sheet checks each axis on its own; the corner
      // takes gross + 6Mx/(Bx·By²) + 6My/(By·Bx²). Kept outside spreadFooting (diff-tested); load parts kept for the report.
      const A = Bx * By, Wf = t * A * 2400, Ws = Math.max(0, Df - t) * gamma * A, gross = (P + Wf + Ws) / A, mY = (6 * Math.abs(Mx)) / (Bx * By ** 2), mX = (6 * Math.abs(My)) / (By * Bx ** 2);
      Object.assign(r, { Wf, Ws, A, gross, mX, mY, qCorner: gross + mX + mY, qCornerMin: gross - mX - mY, qCornerOk: gross + mX + mY <= qa + 1e-6 });
      const util = Math.max(r.qmaxX, r.qmaxY, r.qCorner) / qa;
      r.limOk = util <= (fo.utilMax ?? 1) + 1e-9;
      const ok = spreadOk(r) && r.qCornerOk && r.limOk;
      r.Bx = Bx; r.By = By; r.piles = [];
      if (tt.nb > 1) r.longText = `${r.nLong}-${bar} @ ${sL.toFixed(3)}`;
      if (tt.nbS > 1) r.shortText = `${r.nShort}-${barS} @ ${sS.toFixed(3)}`;
      const out = { n: 0, pile: "ฐานแผ่", kind: "spread", r, ok, util, inp, type: tt.name ?? null };
      if (ok) return out;
      best ??= out;
    } catch (e) { best ??= { n: 0, pile: "ฐานแผ่", kind: "spread", error: e.message, ok: false, util: 9, type: tt.name ?? null }; }
  }
  return best;
}

export function designFooting(P, pier, mat, fo = DEFAULT_FOOTING, Mx = 0, My = 0) {
  let best = null;
  const safe = (pile) => fo.pileLoads?.[pile] ?? PILE_SAFE[pile] ?? fo.Psafe;
  const T = (n, pile, s, w, bar, extra = {}) => ({ n, pile, s, w, bar, ...extra });
  // auto order: spread footings first (no piles, by concrete volume), then pile caps by pile count × pile area, then thickness
  const weight = (t) => (t.kind === "spread" ? (t.Bx > 0 ? t.Bx * t.By * (t.t ?? 0.4) : 50) : 1e4 + t.n * (PILES[t.pile]?.A ?? 1e9) * 1e3 + (t.t ?? fo.t));
  const tries = fo.fixed ? [T(fo.fixed.n, fo.fixed.pile, fo.fixed.s ?? 0.15, fo.fixed.w ?? 0, fo.fixed.bar ?? fo.bar, fo.fixed)]
    : fo.types?.length ? [...fo.types].sort((a, b) => weight(a) - weight(b)).map((t) => T(t.n, t.pile, t.s ?? 0.15, t.w ?? 0, t.bar ?? fo.bar, t))
      // per option: bars @0.15 then @0.10; 1–2 pile caps may be widened (bar anchorage, minimum steel)
      : fo.options.flatMap(([n, pile]) => [fo.bar, "DB 16"].flatMap((bar) => [0.15, 0.1].flatMap((bs) => (n <= 2 ? [0, 0.8, 0.9, 1.0] : [0]).map((w) => T(n, pile, bs, w, bar)))));
  for (const tt of tries) {
    if (tt.kind === "spread") {
      const f = designSpread(tt, P, pier, mat, fo, Mx, My);
      if (f.ok) return f;
      if (!best || f.util < best.util) best = f;
      continue;
    }
    const { n, pile, s: bs, w: capWidth, bar } = tt, b = PILES[pile]?.b ?? Number(String(pile).split("-")[1]) / 100, s = Math.max(0.6, (tt.k ?? fo.spacing) * b);
    const inp = { fcPrime: mat.fcFoot ?? mat.fcPrime, F: mat.F ?? 0.45, capFc: mat.capFc, Es: mat.Es, fy: fo.fy, cover: mat.coverFoot ?? fo.cover, t: tt.t ?? fo.t, Df: Math.max(tt.Df ?? fo.Df, tt.t ?? fo.t), P, Mx, My, gamma: 1800, pier: "rect",
      bx: pier.Bx / 100, by: pier.By / 100, longBar: bar, shortBar: tt.barS ?? fo.bar, sLong: bs > 0.03 ? bs : 0.15, sShort: tt.sS > 0.03 ? tt.sS : bs > 0.03 ? bs : 0.15, dowelBar: pier.mainBar ?? "DB 12", dowelN: pier.n ?? 4, n, pile,
      pileL: tt.L ?? fo.pileL, fcPile: fo.fcPile, Ptest: safe(pile), sx: s, sy: s, capWidth };
    try {
      // bars given as a count (schedule "5-DB 12"): spacing from the cap width — the engine counts floor((B − 2c)/s + 1) on 1–2 pile caps, floor(B/s + 1) otherwise
      if (tt.nb > 1 || tt.nbS > 1) {
        const r0 = pileCap(inp), c2 = n <= 2 ? (inp.cover * 2) / 100 : 0, sp = (B, k) => ((B - c2) / (k - 1)) * (1 - 1e-9);
        if (tt.nb > 1) inp.sLong = sp(r0.By, tt.nb);
        if (tt.nbS > 1) inp.sShort = sp(r0.Bx, tt.nbS);
      }
      const r = pileCap(inp), u = r.Ptmax / r.Pallow;
      r.limOk = u <= (fo.utilMax ?? 1) + 1e-9; // pile load ≤ the engineer's limit of the safe load
      const ok = capOk(r, n) && r.limOk;
      if (tt.nb > 1) r.longText = `${r.nLong}-${inp.longBar} @ ${inp.sLong.toFixed(3)}`;
      if (tt.nbS > 1) r.shortText = `${r.nShort}-${inp.shortBar} @ ${inp.sShort.toFixed(3)}`;
      // bored pile: reinforcement inside the pile for its largest load (engine/borePile.js; soil capacity = the safe load given)
      const bore = PILES[pile]?.bored ? borePileRebar({ D: PILES[pile].b, P: r.Ptmax, fc: fo.fcBore ?? 240, fy: fo.fy ?? 4000, L: tt.L ?? fo.pileL }) : null;
      if (bore) { r.bore = bore; r.boreOk = bore.ok; }
      const ok2 = ok && (!bore || bore.ok);
      if (ok2) return { n, pile, r, ok: ok2, util: u, inp, type: tt.name ?? null };
      if (!best || u < best.util) best = { n, pile, r, ok: ok2, util: u, inp, type: tt.name ?? null };
    } catch (e) { best ??= { n, pile, error: e.message, ok: false, util: 9, type: tt.name ?? null }; }
  }
  // auto with a type list and no type passes (user 2026-11-04: "F4 had one footing, after enlarging it many columns became F4"):
  // the closest type is shown, flagged noType, with the cap the program would design without the list as a suggestion
  if (best && !fo.fixed && fo.types?.length) {
    best = { ...best, noType: true };
    try {
      const alt = designFooting(P, pier, mat, { ...DEFAULT_FOOTING, ...fo, types: undefined, fixed: undefined }, Mx, My);
      if (alt?.ok && alt.r) best.suggest = `${alt.n} × ${alt.pile} ฐาน ${alt.r.Bx.toFixed(2)} × ${alt.r.By.toFixed(2)} × ${(alt.inp?.t ?? 0).toFixed(2)} ม. ${alt.inp?.longBar ?? ""} @${(alt.inp?.sLong ?? 0).toFixed(2)}`;
    } catch { /* no suggestion */ }
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
    const fl0 = floors[k].walls?.some((w) => w.hAuto || w.gable || w.openings?.length) ? { ...floors[k], walls: floors[k].walls.map((w) => resolveWall(w, frame, k)) } : floors[k]; // auto height / doors / windows
    const fl = frame.roofLink?.on && frame.roofLink.floor === k ? { ...fl0, pointLoads: [...(fl0.pointLoads ?? []), ...(frame.roofPoints ?? [])] } : fl0;
    if (frame.roofLink?.on && frame.roofLink.floor === k) for (const p of frame.roofPoints ?? []) if (String(p.name).includes("ย้าย")) warnings.push(`${floors[k].name}: แรง${p.name} ${Math.round(p.P)} กก. — แก้: ขั้น 4 / 5 การ์ด "หลังคา → เสา" → ตารางจุดถ่ายแรง กด "เพิ่มคานรับ" หรือ "เพิ่มเสา" (หรือวาดคาน / เสาผ่านจุดนั้นในขั้น 2)`);
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
      c.free = !an[k].spans.some((sp) => near(sp.a, c.p) || near(sp.b, c.p)); // no beam at its top: nothing holds the top sideways
    }
  }
  // a column whose top has no beam is a cantilever from the last level below that has one (user's Yasothon: posts above the last
  // beam level; a porch column with no beam at two levels): effective length 2·Lc, Lc = from that level up to the free tip.
  // tiedColumn (diff-tested) applies k = 1 in its axial mode whatever the frame case, so the effective length is passed as L
  // frame.freeTop (user 2026-11-03: default "braced" = the roof framing holds those tops, k = 1 on the clear height; selectable):
  // "cantilever" = checked as above (2·Lc)
  if (frame.freeTop === "cantilever") for (const key of new Set(cols.map((c) => c.stack))) {
    const st = cols.filter((c) => c.stack === key).sort((a, b) => a.floor - b.floor);
    st.forEach((c, i) => {
      if (!c.free) return;
      let lo = i, hi = i;
      while (lo > 0 && st[lo - 1].free && st[lo - 1].floor === st[lo].floor - 1) lo--;
      while (hi + 1 < st.length && st[hi + 1].free && st[hi + 1].floor === st[hi].floor + 1) hi++;
      c.Lc = st.slice(lo, hi + 1).reduce((s, x) => s + x.L, 0); c.Leff = 2 * c.Lc;
      if (i === hi) warnings.push(`เสา ${key} ไม่มีคานยึดปลายบน${hi > lo ? ` ${hi - lo + 1} ชั้นติดกัน` : ""} — ตรวจเป็นเสายื่นยาว ${c.Lc.toFixed(2)} ม. (ความยาวประสิทธิผล 2·L = ${c.Leff.toFixed(2)} ม.) · ถ้ามีคาน/โครงหลังคายึดหัวเสา ให้วาดคานที่หัวเสา หรือเลือก "ยึดด้วยโครงหลังคา k = 1" ในเกณฑ์การออกแบบ (ขั้น 0)`);
    });
  }
  return { an, cols, warnings };
}

// column types per stack: fixed (frame.colPick) or the lightest type whose sections pass at every level
// one column (a result of analyzeFrame) checked with a level section lv under every load combination: the governing check
export function columnLevelCheck(frame, lv, c) {
  const mat = frame.mat;
  let worst = null;
  for (const q of [{ name: "D+L", P: c.Pd ?? c.Pbot, M: c.M3 ?? {} }, ...(c.combos ?? []).map((x) => ({ name: x.name, P: x.N, M: { Mx: x.Mx, My: x.My } }))]) {
    const chk = { ...checkColumn(lv, q.P, c.Leff ?? c.Lu ?? c.L, c.floor === 0 && mat.coverPier > 0 ? { ...mat, coverCol: mat.coverPier } : mat, q.M), combo: q.name, tension: q.P < 0, ...(c.Leff ? { cantilever: true, Lc: c.Lc } : {}) };
    if (!worst || (worst.ok && !chk.ok) || (chk.ok === worst.ok && chk.util > worst.util)) worst = chk;
  }
  return worst;
}
function designColumns(frame, cols) {
  const { colTypes, mat } = frame;
  const stacks = [...new Set(cols.map((c) => c.stack))].map((key) => ({ key, list: cols.filter((c) => c.stack === key).sort((a, b) => a.floor - b.floor) }));
  const weight = (t) => t.levels.reduce((s, lv) => s + lv.Bx * lv.By, 0);
  const order = colTypes.map((t, i) => ({ t, i })).sort((a, b) => weight(a.t) - weight(b.t));
  // every load combination of the column (gravity design forces first); the governing check is kept with its combination name
  // ตอม่อ (columns under the lowest floor, in the ground) take their own cover mat.coverPier (user 2026-11-04) when given
  const check = (lv, c) => {
    let worst = null;
    for (const q of [{ name: "D+L", P: c.Pd ?? c.Pbot, M: c.M3 ?? {} }, ...(c.combos ?? []).map((x) => ({ name: x.name, P: x.N, M: { Mx: x.Mx, My: x.My } }))]) {
      const chk = { ...checkColumn(lv, q.P, c.Leff ?? c.Lu ?? c.L, c.floor === 0 && mat.coverPier > 0 ? { ...mat, coverCol: mat.coverPier } : mat, q.M), combo: q.name, tension: q.P < 0, ...(c.Leff ? { cantilever: true, Lc: c.Lc } : {}) };
      if (!worst || (worst.ok && !chk.ok) || (chk.ok === worst.ok && chk.util > worst.util)) worst = chk;
    }
    return worst;
  };
  const run = (t, list) => list.map((c) => { const lv = t.levels[Math.min(c.floor, t.levels.length - 1)]; return { lv, chk: check(lv, c) }; });
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
export function checkEnv(t, sp, mat) {
  const c = checkSpan(t, sp, mat), d = sp.defl, f = (sp.type.b * sp.type.h ** 3) / (t.b * t.h ** 3);
  const dd = d ? { ...d, dL: d.dL * f, dT: d.dT * f, ok: d.dL * f <= d.limL + 1e-9 && d.dT * f <= d.limT + 1e-9 } : { ok: true };
  return { ...c, defl: dd, ok: c.ok && dd.ok, util: Math.max(c.util, d ? Math.max(dd.dT / d.limT, dd.dL / d.limL) : 0) };
}

// wind / earthquake (frame.lateral, engine/lateral.js): floor forces as load cases of the 3D frame and the combinations.
// Seismic weight per floor = the floor's load groups except live load (beams, slabs, walls, point loads incl. those straight
// on its columns) without columns of the floor above standing on its beams (counted on their own floor) + half the columns
// below and above it. Needs the 3D frame (frame.analysis "envelope").
function lateralLoads(frame, g) {
  const L = frame.lateral, wOn = !!L?.wind?.on, eOn = !!L?.seismic?.on;
  if (!wOn && !eOn) return null;
  const n = frame.floors.length, colW = (k) => g.cols.filter((c) => c.floor === k).reduce((s, c) => s + (c.W ?? 0), 0);
  const weights = g.an.map((an, k) => Object.entries(an.groups ?? {}).reduce((s, [gk, v]) => s + (gk === "LL" ? 0 : v), 0)
    - an.lines.reduce((s, ln) => s + (ln.extra ?? []).filter((e) => String(e.from ?? "").startsWith("เสา")).reduce((t, e) => t + e.P, 0), 0)
    + colW(k) / 2 + (k + 1 < n ? colW(k + 1) / 2 : 0));
  const wind = wOn ? windForces(frame) : null, seismic = eOn ? seismicForces(frame, weights) : null, cases = [];
  if (wind) cases.push({ key: "Wx", F: wind.x.floors.map((f) => [f.F, 0]) }, { key: "Wy", F: wind.y.floors.map((f) => [0, f.F]) });
  if (seismic) cases.push({ key: "Ex", F: seismic.floors.map((f) => [f.F, 0]) }, { key: "Ey", F: seismic.floors.map((f) => [0, f.F]) });
  return { wind, seismic, weights, cases, combos: expandCombos(frame) };
}
// storey drift of the unfactored lateral cases: wind ≤ h/400, earthquake Cd·δ/I ≤ 0.02·h
function lateralChecks(frame, lat, f3) {
  const Z = levels(frame), rows = [];
  for (const [key, d] of Object.entries(f3.drifts ?? {})) d.forEach((r) => {
    const k = Z.findIndex((z) => Math.abs(z - r.z) < 1e-6), h = Z[k] - (k ? Z[k - 1] : 0), wind = key[0] === "W";
    const s = lat.seismic, dd = wind ? r.dd : (s.Cd * r.dd) / s.I, lim = wind ? h / 400 : 0.02 * h;
    rows.push({ key, floor: k, h, d: r.d, dd, lim, ok: dd <= lim + 1e-9 });
  });
  return { ...lat, drift: rows, ok: rows.every((r) => r.ok) };
}

// frame.analysis: "envelope" (default) = design forces are the larger of the continuous beams and the 3D rigid-joint frame
// (gravity, P-Delta); "continuous" = continuous beams only (as before 2026-11-02)
export function analyzeFrame(frame) {
  const { beamTypes, mat } = frame, envelope = (frame.analysis ?? "envelope") === "envelope";
  let g, stacks, f3 = null, minTypes = null, lat = null;
  for (let it = 0; it < 4; it++) {
    g = gravity(frame, minTypes);
    stacks = designColumns(frame, g.cols);
    if (!envelope) {
      if (frame.lateral?.wind?.on || frame.lateral?.seismic?.on) g.warnings.push("เปิดแรงลม / แผ่นดินไหวไว้ แต่วิธีวิเคราะห์เป็น \"คานต่อเนื่อง\" — แรงด้านข้างไม่ได้ถูกวิเคราะห์ ให้ตั้งแรงที่ใช้ออกแบบเป็นค่ามากสุดของสองวิธี (ขั้น 6)");
      break;
    }
    lat = lateralLoads(frame, g);
    f3 = frame3dModel(frame, { floors: g.an, columns: g.cols }, lat ? { lateral: { cases: lat.cases, combos: lat.combos } } : {});
    if (f3.error) { g.warnings.push(`โครง 3 มิติ: ${f3.error} — ใช้ผลคานต่อเนื่อง`); f3 = null; break; }
    // beam types: each drawn (auto) beam must pass with the envelope forces on all its spans
    const next = g.an.map(() => ({}));
    let changed = false;
    g.an.forEach((an, k) => {
      for (const sp of an.spans) {
        const fr = f3.spans.find((x) => x.floor === k && x.id === sp.id);
        sp.f3 = fr ?? null;
        // shear: at d from the supports where the rule allows it (vAtD / Vd), the largest of the methods
        sp.envF = { Mpos: Math.max(sp.Mpos, fr?.Mpos ?? 0), Mneg: Math.max(sp.Mneg, fr?.Mneg ?? 0), V: Math.max(vAtD(sp, sp.type.h, mat), fr?.Vd ?? fr?.V ?? 0), Mt: Math.max(sp.Mt ?? 0, fr?.T ?? 0), MtEq: sp.MtEq ?? sp.Mt ?? 0 }; // MtEq: equilibrium torsion (continuous model, cantilever slabs) — the rest may be compatibility torsion
        // load combinations with wind / earthquake: the largest of every combination, with the name of the one that governs
        sp.gov = {};
        for (const cb of f3.combos ?? []) {
          const c = cb.spans.find((x) => x.floor === k && x.id === sp.id);
          if (!c) continue;
          for (const [key, v] of [["Mpos", c.Mpos], ["Mneg", c.Mneg], ["V", c.Vd ?? c.V], ["Mt", c.T]]) if (v > sp.envF[key] + 1e-6) { sp.envF[key] = v; sp.gov[key] = cb.name; }
        }
      }
      const order = beamTypes.map((t, i) => ({ t, i })).sort((a, b) => tWeight(a.t) - tWeight(b.t));
      frame.floors[k].beams.forEach((b, m) => {
        if (b.type != null) return;
        const sps = an.spans.filter((sp) => (sp.members ?? [sp.member]).includes(m));
        if (!sps.length) return;
        const cur = sps[0].typeIdx, ok = (t) => sps.every((sp) => checkEnv(t, robustSpan({ ...sp, ...sp.envF, vDone: true }), mat).ok); // choice with the 1e-9 margin
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
      const F = sp.envF ?? { Mpos: sp.Mpos, Mneg: sp.Mneg, V: vAtD(sp, sp.type.h, mat), Mt: sp.Mt ?? 0, MtEq: sp.MtEq ?? sp.Mt ?? 0 };
      sp.cont = { Mpos: sp.Mpos, Mneg: sp.Mneg, V: sp.V, Mt: sp.Mt ?? 0 };
      sp.Vmax = Math.max(sp.V, sp.f3?.V ?? 0); // largest shear (the design value F.V may be the one at d)
      const vc = vAtD(sp, sp.type.h, mat), src = (k) => (sp.gov?.[k] ? "LAT" : F[k] > (k === "V" ? vc : sp[k]) + 1e-6 ? "3D" : "ต่อเนื่อง"); // LAT = a combination with wind / earthquake governs
      sp.src = { Mpos: src("Mpos"), Mneg: src("Mneg"), V: src("V") };
      Object.assign(sp, F, { vDone: true, vAtD: F.V < sp.Vmax - 1e-6 });
      sp.check = checkEnv(sp.type, sp, mat);
      // near a limit (user 2026-11-05): passes with the full-precision forces but not with them × (1 + 1e-6) → flagged, the result is not changed
      if (sp.check.ok && !checkEnv(sp.type, robustSpan(sp, 1 + 1e-6), mat).ok) { sp.nearLimit = true; sp.check.nearLimit = true; }
      // bar cut-offs and development (audit F4): lengths of the extra bars from the envelope, NG on the minimum continuous steel
      const cut = cutoffs(sp, an.lines.find((l) => l.id === sp.line), sp.type, mat, F, sp.check);
      if (cut) { sp.cut = cut; sp.check.cut = cut; if (!cut.ok) sp.check.ok = false; if (cut.topFull && !sp.topFull) sp.topFull = { bars: [sp.type.top, sp.type.topX].filter(Boolean).join(" + "), cut: true }; }
      sp.ok = sp.check.ok;
    }
    an.ok = an.spans.every((x) => x.ok) && !an.lines.some((l) => l.error);
    const near = an.spans.filter((x) => x.nearLimit); if (near.length) g.warnings.push(`${frame.floors[g.an.indexOf(an)]?.name ?? ""}: ช่วงคานผ่านแบบเฉียดขีดจำกัด (ห่างไม่ถึง 1 ส่วนในล้าน) ${near.length} ช่วง — ${near.slice(0, 6).map((x) => `${x.id} ${x.typeName ?? ""}`).join(", ")}${near.length > 6 ? " …" : ""}: ผลอาจพลิกได้จากการปัดเศษของเครื่องคำนวณ ควรใช้ type ที่ใหญ่ขึ้นหนึ่งขั้น`);
  }
  // columns, frame.colMethod:
  //   "axial" (default, as the reference sheets / usual practice): accumulated axial load + minimum eccentricity only;
  //           the 3D-frame forces are kept on c.f3 for information (lateral combinations, when on, are still checked)
  //   "frame": axial load = larger of the accumulated reactions and the frame; moments from the frame (both axes)
  const colFrame = frame.colMethod === "frame";
  if (f3) {
    for (const c of g.cols) {
      const fc = f3.columns.find((x) => x.floor === c.floor && x.ci === c.i);
      c.f3 = fc ?? null; c.Pd = colFrame ? Math.max(c.Pbot, fc?.N ?? 0) : c.Pbot; c.M3 = colFrame ? { Mx: fc?.Mx ?? 0, My: fc?.My ?? 0 } : {};
      if (fc && fc.N < -10) g.warnings.push(`เสา ${c.stack} (${frame.floors[c.floor].name}) รับแรงดึง ${Math.round(-fc.N).toLocaleString()} กก. ในโครง 3 มิติ (D+L) — ปลายคานยกหัวเสา: ต่อทาบเหล็กเสา/ยึดคานให้รับแรงดึง`);
      c.combos = (f3.combos ?? []).filter((cb) => cb.W || cb.E || cb.Wx || cb.Wy || cb.Ex || cb.Ey).map((cb) => ({ name: cb.name, ...cb.columns.find((x) => x.floor === c.floor && x.ci === c.i) }));
    }
    stacks = designColumns(frame, g.cols);
  }
  const base = (c, list = f3?.base) => list?.find((b) => near(b.p, c.p));
  let footings = g.cols.filter((c) => c.floor === 0).map((c) => {
    const b = base(c), P = Math.max(c.Pbot, b?.R[2] ?? 0), Mx = Math.abs(b?.R[3] ?? 0), My = Math.abs(b?.R[4] ?? 0);
    const ft = frame.footTypes?.[frame.footPick?.[c.stack]], fo = { ...(frame.footing ?? DEFAULT_FOOTING), soil: frame.soil, utilMax: frame.footUtil, ...(frame.pileLoads ? { pileLoads: frame.pileLoads } : {}), ...(ft ? { fixed: ft } : frame.footTypes?.length ? { types: frame.footTypes } : {}) }, grav = { p: c.p, stack: c.stack, P, Mx, My, combo: "D+L", ...designFooting(P, c.lv, mat, fo, Mx, My) };
    const lc = (f3?.combos ?? []).filter((cb) => cb.Wx || cb.Wy || cb.Ex || cb.Ey).map((cb) => ({ name: cb.name, R: base(c, cb.base)?.R })).filter((x) => x.R);
    if (!lc.length) return grav;
    // lateral combinations: the one with the largest axial load and the ones with the largest base moments are designed too
    const pick = [...new Set([lc.reduce((a, x) => (x.R[2] > a.R[2] ? x : a)), lc.reduce((a, x) => (Math.abs(x.R[3]) > Math.abs(a.R[3]) ? x : a)), lc.reduce((a, x) => (Math.abs(x.R[4]) > Math.abs(a.R[4]) ? x : a))])];
    const minP = Math.min(...lc.map((x) => x.R[2]));
    let worst = grav;
    for (const x of pick) {
      const r = { p: c.p, stack: c.stack, P: Math.max(x.R[2], 0), Mx: Math.abs(x.R[3]), My: Math.abs(x.R[4]), combo: x.name, ...designFooting(Math.max(x.R[2], 1), c.lv, mat, fo, Math.abs(x.R[3]), Math.abs(x.R[4])) };
      if ((worst.ok && !r.ok) || (r.ok === worst.ok && (r.util ?? 0) > (worst.util ?? 0))) worst = r;
    }
    if (minP < 0) g.warnings.push(`ฐานราก ${c.stack}: แรงถอน ${Math.round(-minP)} กก. (ชุด ${lc.find((x) => x.R[2] === minP).name}) — ตรวจแรงถอนเข็ม`);
    return { ...worst, minP };
  });
  // spread footings that overlap / sit too close (user 2026-11-04: "ออกแบบให้ฐานรากไม่ซ้อนกัน … อันเล็กเป็นสี่เหลี่ยมผืนผ้า"):
  // the lighter one (then the other) becomes a rectangle — short side across the clash, sized to keep 0.10 m clear, the long side
  // grown in 0.10 m steps until every check passes again (designSpread with a fixed size). Pile caps are left as they are.
  {
    const gapMin = 0.1, foS = { ...(frame.footing ?? DEFAULT_FOOTING), soil: frame.soil, utilMax: frame.footUtil };
    const gapOf = (a, b) => { const gx = Math.abs(a.p[0] - b.p[0]) - (a.r.Bx + b.r.Bx) / 2, gy = Math.abs(a.p[1] - b.p[1]) - (a.r.By + b.r.By) / 2; return { gap: Math.max(gx, gy), ax: gx >= gy ? 0 : 1 }; };
    const clear = (f, i) => footings.every((g, j) => j === i || !g.r?.Bx || gapOf(f, g).gap >= gapMin - 1e-9);
    const reshape = (i, j, ax) => {
      const f = footings[i], g = footings[j]; if (f.kind !== "spread" || !f.inp) return false;
      const half = ax ? g.r.By / 2 : g.r.Bx / 2, d = Math.abs(f.p[ax] - g.p[ax]), Lmax = Math.floor((2 * (d - half - gapMin)) * 10 + 1e-9) / 10;
      const pierDim = (ax ? f.inp.by : f.inp.bx) + 0.2; if (Lmax < pierDim) return false;
      const A = f.r.Bx * f.r.By, w0 = Math.ceil((A / Lmax) * 10 - 1e-9) / 10;
      for (let w = w0; w <= w0 + 1.5 + 1e-9; w = Math.round((w + 0.1) * 10) / 10) {
        const Bx = ax ? w : Lmax, By = ax ? Lmax : w;
        if (Math.max(Bx, By) / Math.min(Bx, By) > 3) break; // a strip, not a footing any more
        const tt = { name: f.type, t: f.inp.t, Df: f.inp.Df, bar: f.inp.longBar, barS: f.inp.shortBar, s: f.inp.sLong, sS: f.inp.sShort, Bx, By };
        const r = designSpread(tt, f.inp.P, { Bx: f.inp.bx * 100, By: f.inp.by * 100, mainBar: f.inp.dowelBar, n: f.inp.dowelN }, mat, foS, f.inp.Mx ?? 0, f.inp.My ?? 0);
        const cand = { ...f, ...r, p: f.p, stack: f.stack, P: f.P, Mx: f.Mx, My: f.My, combo: f.combo, minP: f.minP, reshaped: true, type: null, typeFrom: f.type ?? null }; // not the type's size any more → its own mark on the plan
        if (r.ok && clear(cand, i)) { footings[i] = cand; return true; }
      }
      return false;
    };
    for (let pass = 0; pass < 3; pass++) {
      let moved = false;
      for (let i = 0; i < footings.length; i++) for (let j = i + 1; j < footings.length; j++) {
        const a = footings[i], b = footings[j]; if (!a.r?.Bx || !b.r?.Bx) continue;
        const { gap, ax } = gapOf(a, b); if (gap >= gapMin - 1e-9) continue;
        const [lo, hi] = (a.P ?? 0) <= (b.P ?? 0) ? [i, j] : [j, i];
        if (reshape(lo, hi, ax) || reshape(hi, lo, ax)) moved = true;
      }
      if (!moved) break;
    }
    const nRe = footings.filter((f) => f.reshaped).length;
    if (nRe) g.warnings.push(`ฐานแผ่ ${nRe} ฐานปรับเป็นสี่เหลี่ยมผืนผ้าอัตโนมัติ เพราะชิด/ซ้อนกับฐานข้างเคียง (เว้นระยะ ≥ ${gapMin.toFixed(2)} ม.) — ดูแปลนฐานราก`);
  }
  // footings overlapping or too close (user 2026-11-04: "ฐานรากเดี่ยวไม่ค่อยติดหรือซ้อนกัน"): clear gap between plan rectangles
  // < 0.10 m (room for the formwork / excavation) → combined footing or resize; each pair flagged on the footing plan (f.clash)
  const gapMin = 0.1, clash = [];
  for (let i = 0; i < footings.length; i++) for (let j = i + 1; j < footings.length; j++) {
    const a = footings[i], b = footings[j]; if (!a.r?.Bx || !b.r?.Bx) continue;
    const gx = Math.abs(a.p[0] - b.p[0]) - (a.r.Bx + b.r.Bx) / 2, gy = Math.abs(a.p[1] - b.p[1]) - (a.r.By + b.r.By) / 2, gap = Math.max(gx, gy);
    if (gap < gapMin - 1e-6) { clash.push(`(${a.p[0].toFixed(2)}, ${a.p[1].toFixed(2)})–(${b.p[0].toFixed(2)}, ${b.p[1].toFixed(2)}) ${gap < 0 ? `ซ้อนกัน ${(-gap).toFixed(2)}` : `ห่าง ${gap.toFixed(2)}`} ม.`); (a.clash ??= []).push(j); (b.clash ??= []).push(i); }
  }
  if (clash.length) g.warnings.push(`ฐานรากซ้อน/ชิดกันเกินไป ${clash.length} คู่ (ระยะห่างน้อยกว่า ${gapMin.toFixed(2)} ม.): ${clash.slice(0, 3).join(" · ")}${clash.length > 3 ? " …" : ""} — ใช้ฐานรากร่วม หรือปรับขนาด / ตำแหน่งฐาน`);
  const lateral = lat && f3?.combos ? lateralChecks(frame, lat, f3) : null;
  // a type whose bars cannot be read would be checked with no steel at all: say so instead of a silent NG
  for (const t of beamTypes) for (const k of ["top", "bot", "topX", "botX"]) if (t[k] && !parseBars(t[k])) g.warnings.push(`Type คาน ${t.name}: อ่านเหล็ก "${t[k]}" ไม่ได้ (ใช้รูปแบบ เช่น 2-DB12, 3-RB9) — คิดเป็นไม่มีเหล็ก`);
  return { floors: g.an, columns: g.cols, stacks, footings, frame3d: f3, lateral, analysis: f3 ? "envelope" : "continuous", warnings: [...new Set(g.warnings)],
    ok: g.an.every((a) => a.ok) && stacks.every((s) => s.ok) && footings.every((f) => f.ok) && (!lateral || lateral.ok) };
}
