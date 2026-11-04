// One floor of an RC frame (WSD): drawn beams → continuous beam lines, slab panels from closed beam loops,
// slab / wall / self weight → beam loads, secondary beams onto the beams carrying them, beam types auto-selected.
// Units: m, kg. Section checks reuse engine/beam.js (diff-tested); analysis is engine/contBeam.js.
import { designSection } from "./beam.js";
import { solveBeam } from "./contBeam.js";
import { arcGeom } from "./arc.js";
import { BARS } from "./tables.js";

export const WALLS = { brick: ["อิฐมอญครึ่งแผ่น", 180], brick2: ["อิฐมอญเต็มแผ่น", 360], block: ["คอนกรีตบล็อก", 120], light: ["อิฐมวลเบา", 90] };
export const CONC = 2400; // kg/m³
// load groups, kept apart from input to report (all act together in the analysis: WSD, service loads)
export const GROUPS = { DL: ["โครงสร้าง (DL)", "#667085"], SDL: ["ปูผิว/ฝ้า/งานระบบ (SDL)", "#0e9384"], WALL: ["ผนัง", "#b54708"], LL: ["น้ำหนักจร (LL)", "#3e63dd"], SP: ["พิเศษ / จากชั้นบน", "#d6409f"] };
// riser / tread / waist of a stair, never 0 (user 2026-11-04: a cleared field became 0 → run ÷ 0 = endless step lines, the page crashed)
export const stairRT = (st) => ({ R: st.riser > 0.05 ? st.riser : 0.17, T: st.tread > 0.1 ? st.tread : 0.25, t: st.t > 0.05 ? st.t : 0.12 });
export const STAIR_KINDS = { long: "ท้องเรียบ พาดตามยาว", side: "พาดข้าง (คานแม่บันได/ผนัง)", cant: "บันไดยื่น (ยื่นจากด้านข้าง)", landing: "มีชานพัก (รูป U / L)" };
// stair load on plan (kg/m²): inclined waist t/cosθ + half the step + finish + live
export function stairLoads(st) {
  const { R, T, t } = stairRT(st), th = Math.atan(R / T);
  return { th, flight: { DL: CONC * (t / Math.cos(th) + R / 2), SDL: st.finish ?? 100, LL: st.live ?? 300 }, landing: { DL: CONC * t, SDL: st.finish ?? 100, LL: st.live ?? 300 } };
}
export const SLAB_KINDS = { S: "S พื้นหล่อในที่", PS: "PS พื้นสำเร็จ", GS: "GS พื้นวางบนดิน" };
export const DEFAULT_WALL_TYPES = [
  { id: "brick", name: "อิฐมอญครึ่งแผ่น", w: 180 }, { id: "brick2", name: "อิฐมอญเต็มแผ่น", w: 360 }, { id: "block", name: "คอนกรีตบล็อก", w: 120 },
  { id: "light", name: "อิฐมวลเบา", w: 90 }, { id: "gypsum", name: "ผนังเบา ยิปซัม", w: 30 },
];
// wall build-up (wall type editor): core material × thickness + plaster on 1–2 sides → kg/m²; a type keeps `w` (what the
// analysis uses) and, when built from layers, { core, t (m), plaster (cm per side), sides }
export const WALL_MATERIALS = { brick: ["อิฐมอญ", 1600], block: ["คอนกรีตบล็อก (กลวง)", 1200], aac: ["อิฐมวลเบา", 650], concrete: ["คอนกรีตหล่อ", 2400], gypsum: ["ผนังเบา ยิปซัม (กก./ม.² ทั้งผนัง)", 0] };
export const PLASTER = 2000; // kg/m³ cement plaster
export const wallTypeW = (t) => (t.core ? (t.core === "gypsum" ? t.dry ?? 30 : WALL_MATERIALS[t.core][1] * (t.t ?? 0.1)) + (t.core === "gypsum" ? 0 : PLASTER * ((t.plaster ?? 1.5) / 100) * (t.sides ?? 2)) : t.w);
export const wallThick = (t) => (t?.core ? (t.t ?? 0.1) + (t.core === "gypsum" ? 0 : ((t.plaster ?? 1.5) / 100) * (t.sides ?? 2)) : t?.id === "brick2" ? 0.2 : 0.1);
// openings of a wall: doors / windows by size (instead of a %); presets for the inspector
export const OPENINGS = [["door", "ประตู 0.80×2.00", 0.8, 2.0, 0], ["door", "ประตู 0.90×2.00", 0.9, 2.0, 0], ["door", "ประตูคู่ 1.60×2.00", 1.6, 2.0, 0],
  ["window", "หน้าต่าง 1.20×1.10", 1.2, 1.1, 1.0], ["window", "หน้าต่าง 0.60×1.10", 0.6, 1.1, 1.0], ["window", "ช่องแสง 0.60×0.40", 0.6, 0.4, 2.0]];
// a wall as the analysis sees it: height = clear height under the beam above (wall.hAuto), gable walls average h/2,
// doors / windows turned into the opening % of the wall face (the load stays uniform along the wall — stated in the report)
export function resolveWall(w, frame, k) {
  let h = w.h ?? 3;
  if (w.hAuto && frame) {
    const up = frame.floors[k + 1], same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 0.05;
    const L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]), on = (b) => { // a beam of the floor above along this wall
      const u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], off = (p) => Math.abs((p[0] - w.a[0]) * u[1] - (p[1] - w.a[1]) * u[0]);
      return off(b.a) < 0.05 && off(b.b) < 0.05 || same(b.a, w.a) && same(b.b, w.b); };
    const bt = up?.beams?.find(on), depth = bt?.type != null ? frame.beamTypes?.[bt.type]?.h ?? 0.4 : 0.4;
    if (up) h = Math.max(0.3, (up.h ?? 3) - depth);
  }
  const hEff = w.gable ? h / 2 : h, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1;
  const open = w.openings?.length ? Math.min(90, (100 * w.openings.reduce((s, o) => s + o.w * o.h, 0)) / (L * hEff)) : w.open ?? 0;
  return { ...w, h: hEff, hFull: h, open };
}
// load library (step 6 "น้ำหนักอื่น"): kind line kg/m · point kg · area kg/m² (added to the slab panel clicked)
export const DEFAULT_LOAD_LIB = [
  { id: "rail-rc", name: "ราวกันตก คสล. สูง 1.0 ม.", kind: "line", v: 240 }, { id: "rail-steel", name: "ราวเหล็ก / สแตนเลส", kind: "line", v: 30 },
  { id: "parapet", name: "ผนังกันตกอิฐ 1.0 ม.", kind: "line", v: 240 }, { id: "counter", name: "เคาน์เตอร์ครัว คสล.", kind: "line", v: 300 },
  { id: "tank1", name: "ถังน้ำ 1,000 ลิตร (เต็ม)", kind: "point", v: 1100 }, { id: "tank2", name: "ถังน้ำ 2,000 ลิตร (เต็ม)", kind: "point", v: 2200 },
  { id: "ac", name: "คอยล์ร้อนแอร์", kind: "point", v: 60 }, { id: "bath", name: "ห้องน้ำ (ปูผิว + กันซึม + ปรับระดับ)", kind: "area", v: 100 },
  { id: "ceiling", name: "ฝ้า + งานระบบ", kind: "area", v: 30 }, { id: "store", name: "ห้องเก็บของ (จรเพิ่ม)", kind: "area", v: 300 },
];
// kg/m of one wall line: unit weight × height × (1 − openings) × layers (2 = double wall)
export const wallLoad = (w, wt) => (wt.find((x) => x.id === w.kind) ?? wt[0]).w * w.h * (1 - (w.open ?? 0) / 100) * (w.layers ?? 1);
// walls of a floor; files from before the wall layer kept the wall on the beam (beam.wall)
export const wallsOf = (floor) => floor.walls ?? (floor.beams ?? []).filter((b) => b.wall?.h > 0).map((b) => ({ a: b.a, b: b.b, kind: b.wall.kind ?? "brick", h: b.wall.h, open: 0, layers: 1 }));

// top / bot = through bars; topX = extra top bars at the supports (L/4), botX = extra bottom bars at mid-span (3L/5);
// stirrup bar with spacing at the supports / mid-span (m)
const T = (name, b, h, top, bot, topX, botX, st, sSup, sMid) => ({ name, b, h, top, bot, topX, botX, st, sSup, sMid });
export const DEFAULT_BEAM_TYPES = [ // the user's standard beam schedule (drawing 26546466)
  T("B1", 0.2, 0.4, "2-DB12", "2-DB12", "1-DB12", "1-DB12", "RB 6", 0.15, 0.15),
  T("B2", 0.2, 0.4, "2-DB12", "2-DB12", "2-DB12", "2-DB12", "RB 6", 0.15, 0.15),
  T("B3", 0.2, 0.4, "2-DB12", "2-DB12", "3-DB12", "3-DB12", "RB 6", 0.1, 0.1),
  T("B4", 0.2, 0.4, "2-DB16", "2-DB16", "3-DB16", "3-DB16", "RB 6", 0.1, 0.15),
  T("B5", 0.2, 0.5, "2-DB16", "2-DB16", "3-DB16", "3-DB16", "RB 6", 0.15, 0.15),
  T("B6", 0.2, 0.5, "2-DB16", "2-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.1),
];

// Column types by level, bottom up (level k = the column under floor k): Bx/By cm, n bars, ties. The user's schedule C1.
const CT = (level, B, n, s) => ({ level, Bx: B, By: B, n, mainBar: "DB 12", tieBar: "RB 6", s });
export const DEFAULT_COLUMN_TYPES = [
  { name: "C1", levels: [CT("ตอม่อ", 30, 8, 0.15), CT("ชั้น 1", 20, 6, 0.2), CT("ชั้น 2", 20, 4, 0.2)] },
];
// n bars → bars on the x / y faces incl. corners as tiedColumn counts them (4 → 4/4, 6 → 6/4, 8 → 6/6, 10 → 8/6, 12 → 8/8)
export const faceBars = (n) => (n % 4 === 0 ? [(n + 4) / 2, (n + 4) / 2] : [(n + 6) / 2, (n + 2) / 2]);

// "2-DB16" → { n: 2, bar: "DB 16" } (null when empty / unknown)
export function parseBars(s) {
  const m = /^\s*(\d+)\s*-\s*([A-Za-z]+)\s*(\d+)\s*$/.exec(s ?? "");
  if (!m) return null;
  const bar = `${m[2].toUpperCase()} ${m[3]}`;
  return BARS[bar] ? { n: +m[1], bar } : null;
}

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const segDist = (p, a, b) => { const d = sub(b, a), L2 = d[0] ** 2 + d[1] ** 2 || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)); return dist(p, [a[0] + d[0] * t, a[1] + d[1] * t]); };
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const TOL = 0.03;

// position of p along a line (start A, unit u, length L): t, or null when off the line / outside it
const insidePoly = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
function along(ln, p, inside = false) {
  const d = sub(p, ln.A), t = d[0] * ln.u[0] + d[1] * ln.u[1];
  if (Math.abs(cross(ln.u, d)) > TOL || t < -TOL || t > ln.L + TOL) return null;
  if (inside && (t < TOL || t > ln.L - TOL)) return null;
  return Math.min(ln.L, Math.max(0, t));
}

// Overlapping beams (user 2026-11-04: beams drawn twice on top of each other without noticing — the 3D view showed two beams in one
// place). Two straight drawn beams overlap when they are collinear (within TOL) and share more than TOL of length. Returns
// [{ i, j, len, a, b }] (a–b = the shared piece); mergeOverlaps joins every overlapping group into one beam spanning their union,
// keeping the first beam's type / role (arc beams are left alone).
export function findOverlaps(beams = []) {
  const out = [];
  for (let i = 0; i < beams.length; i++) for (let j = i + 1; j < beams.length; j++) {
    const p = beams[i], q = beams[j]; if (p.arc?.s || q.arc?.s || (+p.lvl || 0) !== (+q.lvl || 0)) continue; // a beam inside the storey is not on top of a floor beam
    const L = dist(p.a, p.b); if (L < TOL) continue;
    const u = [(p.b[0] - p.a[0]) / L, (p.b[1] - p.a[1]) / L], off = (x) => Math.abs(cross(u, sub(x, p.a))), t = (x) => (x[0] - p.a[0]) * u[0] + (x[1] - p.a[1]) * u[1];
    if (off(q.a) > TOL || off(q.b) > TOL) continue;
    const s0 = Math.max(0, Math.min(t(q.a), t(q.b))), s1 = Math.min(L, Math.max(t(q.a), t(q.b)));
    if (s1 - s0 > TOL) out.push({ i, j, len: s1 - s0, a: [p.a[0] + u[0] * s0, p.a[1] + u[1] * s0], b: [p.a[0] + u[0] * s1, p.a[1] + u[1] * s1] });
  }
  return out;
}
export function mergeOverlaps(beams = []) {
  const ov = findOverlaps(beams); if (!ov.length) return beams;
  const root = beams.map((_, i) => i), find = (i) => (root[i] === i ? i : (root[i] = find(root[i])));
  for (const o of ov) { const a = find(o.i), b = find(o.j); if (a !== b) root[Math.max(a, b)] = Math.min(a, b); }
  const groups = new Map(); beams.forEach((_, i) => { const r = find(i); groups.set(r, [...(groups.get(r) ?? []), i]); });
  const out = [];
  beams.forEach((bm, i) => {
    const g = groups.get(find(i)); if (g[0] !== i) return; if (g.length === 1) { out.push(bm); return; }
    const L = dist(bm.a, bm.b), u = [(bm.b[0] - bm.a[0]) / L, (bm.b[1] - bm.a[1]) / L], t = (x) => (x[0] - bm.a[0]) * u[0] + (x[1] - bm.a[1]) * u[1];
    const ts = g.flatMap((k) => [t(beams[k].a), t(beams[k].b)]), t0 = Math.min(...ts), t1 = Math.max(...ts), P = (s) => [bm.a[0] + u[0] * s, bm.a[1] + u[1] * s].map((v) => Math.round(v * 1e4) / 1e4);
    const typed = g.map((k) => beams[k]).find((x) => x.type !== null && x.type !== undefined);
    out.push({ ...bm, a: P(t0), b: P(t1), type: bm.type ?? typed?.type ?? null });
  });
  return out;
}

// Beam lines and which beam carries which (user 2026-11-03: the result must not depend on how the beams were drawn).
// 1. drawn beams that are collinear and share an end become one straight run (arc beams stay lines of their own);
// 2. where two runs cross inside both with no column there, one is the main beam (คานหลัก) and the other (คานซอย) is cut at
//    the crossing and rests on it. Main = the run whose drawn beam there has role "main" (the other "secondary"), else the run
//    standing on more columns, else the shorter run (stiffer), else the one drawn first. The last two are a guess → listed in
//    `guess` so the floor warns and the engineer can set the role (beam.role) on the plan.
function buildLines(beams, cols = []) {
  let lines = beams.map((b, i) => ({ A: b.a, B: b.b, members: [i] })).filter((l) => dist(l.A, l.B) > 0.05);
  for (let changed = true; changed;) {
    changed = false;
    outer: for (let i = 0; i < lines.length; i++) for (let j = i + 1; j < lines.length; j++) {
      const p = lines[i], q = lines[j], d = sub(p.B, p.A), e = sub(q.B, q.A);
      if (Math.abs(cross(d, e)) > 1e-6 * Math.hypot(...d) * Math.hypot(...e) || Math.abs(cross(d, sub(q.A, p.A))) / Math.hypot(...d) > TOL) continue;
      const shared = [[p.A, q.A], [p.A, q.B], [p.B, q.A], [p.B, q.B]].find(([x, y]) => dist(x, y) < TOL);
      if (!shared) continue;
      if ([...p.members, ...q.members].some((k) => beams[k].arc?.s)) continue; // an arc beam is a line of its own
      const pts = [p.A, p.B, q.A, q.B], u = d.map((v) => v / Math.hypot(...d)), key = (x) => (x[0] - p.A[0]) * u[0] + (x[1] - p.A[1]) * u[1];
      pts.sort((x, y) => key(x) - key(y));
      lines[i] = { A: pts[0], B: pts[3], members: [...p.members, ...q.members] };
      lines.splice(j, 1); changed = true; break outer;
    }
  }
  const unitOf = (l) => { const L = dist(l.A, l.B); return [(l.B[0] - l.A[0]) / L, (l.B[1] - l.A[1]) / L]; };
  const tOf = (l, p) => { const u = unitOf(l); return (p[0] - l.A[0]) * u[0] + (p[1] - l.A[1]) * u[1]; };
  // drawn beam of a run covering position t (for its role)
  const memberAt = (l, t) => l.members.find((m) => { const a = tOf(l, beams[m].a), b = tOf(l, beams[m].b); return t >= Math.min(a, b) - TOL && t <= Math.max(a, b) + TOL; });
  const nCols = (l) => cols.filter((c) => Math.abs(cross(unitOf(l), sub(c, l.A))) < TOL && tOf(l, c) > -TOL && tOf(l, c) < dist(l.A, l.B) + TOL).length;
  const isArc = (l) => l.members.some((k) => beams[k].arc?.s);
  const guess = [];
  for (let changed = true, guard = 0; changed && guard < 500; guard++) {
    changed = false;
    outer2: for (let i = 0; i < lines.length; i++) for (let j = 0; j < lines.length; j++) {
      if (i >= j) continue;
      const p = lines[i], q = lines[j];
      if (isArc(p) || isArc(q)) continue;
      const d = sub(p.B, p.A), e = sub(q.B, q.A), den = cross(d, e);
      if (Math.abs(den) < 1e-9 * Math.hypot(...d) * Math.hypot(...e)) continue;
      const s = cross(sub(q.A, p.A), e) / den, r = cross(sub(q.A, p.A), d) / den, Lp = Math.hypot(...d), Lq = Math.hypot(...e);
      if (s * Lp < TOL || s * Lp > Lp - TOL || r * Lq < TOL || r * Lq > Lq - TOL) continue; // not inside both
      const J = [p.A[0] + d[0] * s, p.A[1] + d[1] * s];
      if (cols.some((c) => dist(c, J) < TOL)) continue; // a column there: both runs are supported by it
      if ([p, q].some((l) => l.through?.some((x) => dist(x, J) < TOL))) continue; // already a secondary resting there, kept whole
      const role = (l) => beams[memberAt(l, tOf(l, J))]?.role;
      let main;
      if (role(p) === "main" && role(q) !== "main" || role(q) === "secondary" && role(p) !== "secondary") main = p;
      else if (role(q) === "main" && role(p) !== "main" || role(p) === "secondary" && role(q) !== "secondary") main = q;
      else if (nCols(p) !== nCols(q)) main = nCols(p) > nCols(q) ? p : q;
      else { main = Lp < Lq - 1e-6 ? p : Lq < Lp - 1e-6 ? q : p; guess.push({ p: J, main: main === p ? i : j, sec: main === p ? j : i }); }
      const sec = main === p ? q : p, k = main === p ? j : i;
      const t = tOf(sec, J), Ls = dist(sec.A, sec.B);
      // a piece past the crossing whose far end stands on nothing (no column, no other beam) is a cantilever of the secondary
      // (user 2026-11-04: a stub drawn past the main beam had no forces — cut off it had one support and was unstable): keep the
      // secondary whole, resting on the main at J (interior support), so the stub is a cantilever with the back span behind it
      const onSome = (e) => cols.some((c) => dist(c, e) < TOL) || lines.some((o) => o !== sec && (() => { const L = dist(o.A, o.B), u = unitOf(o), dd = sub(e, o.A), tt = dd[0] * u[0] + dd[1] * u[1];
        return Math.abs(cross(u, dd)) < TOL && tt > -TOL && tt < L + TOL; })());
      if (!onSome(sec.A) || !onSome(sec.B)) {
        if (!(sec.through ??= []).some((x) => dist(x, J) < TOL)) { sec.through.push(J); changed = true; break outer2; }
        continue;
      }
      const keep = (a, b) => sec.members.filter((m) => { const x = tOf(sec, beams[m].a), y = tOf(sec, beams[m].b); return Math.min(Math.max(x, y), b) - Math.max(Math.min(x, y), a) > TOL; });
      const thr = (a, b) => (sec.through ?? []).filter((x) => { const v = tOf(sec, x); return v > a + TOL && v < b - TOL; });
      lines.splice(k, 1, { A: sec.A, B: J, members: keep(0, t), through: thr(0, t) }, { A: J, B: sec.B, members: keep(t, Ls), through: thr(t, Ls) });
      changed = true; break outer2;
    }
  }
  const out = lines.map((l, k) => {
    const L = dist(l.A, l.B), u = [(l.B[0] - l.A[0]) / L, (l.B[1] - l.A[1]) / L];
    const arc = l.members.length === 1 && beams[l.members[0]].arc?.s ? beams[l.members[0]].arc : null;
    return { id: k, A: l.A, B: l.B, L, u, members: l.members, through: l.through ?? [], ...(arc ? { arc } : {}) };
  });
  // guesses by index → by the final line objects (indices moved while splitting): report the point only
  out.guess = guess.map((g) => g.p);
  return out;
}

// closed beam loops (bounded faces of the plan graph); dangling beams (cantilevers) are ignored
function findPanels(lines) {
  const V = [], vid = (p) => { let i = V.findIndex((q) => dist(p, q) < TOL); if (i < 0) { V.push(p); i = V.length - 1; } return i; };
  const E = new Set();
  for (const ln of lines) {
    const ts = [0, ln.L];
    for (const o of lines) if (o !== ln) {
      for (const p of [o.A, o.B]) { const t = along(ln, p); if (t !== null) ts.push(t); }
      const den = cross(ln.u, o.u);
      if (Math.abs(den) > 1e-9) { const s = cross(sub(o.A, ln.A), o.u) / den, r = cross(sub(o.A, ln.A), ln.u) / den; if (s > -TOL && s < ln.L + TOL && r > -TOL && r < o.L + TOL) ts.push(s); }
    }
    const pts = [...new Set(ts.map((t) => +t.toFixed(4)))].sort((a, b) => a - b).map((t) => vid([ln.A[0] + ln.u[0] * t, ln.A[1] + ln.u[1] * t]));
    for (let i = 0; i + 1 < pts.length; i++) if (pts[i] !== pts[i + 1]) E.add(pts[i] < pts[i + 1] ? `${pts[i]}-${pts[i + 1]}` : `${pts[i + 1]}-${pts[i]}`);
  }
  let edges = [...E].map((k) => k.split("-").map(Number));
  for (let pruned = true; pruned;) { // drop dangling edges
    const deg = new Map(); edges.forEach(([a, b]) => { deg.set(a, (deg.get(a) ?? 0) + 1); deg.set(b, (deg.get(b) ?? 0) + 1); });
    const keep = edges.filter(([a, b]) => deg.get(a) > 1 && deg.get(b) > 1); pruned = keep.length < edges.length; edges = keep;
  }
  const out = new Map(); // vertex → neighbours sorted by angle
  for (const [a, b] of edges) { (out.get(a) ?? out.set(a, []).get(a)).push(b); (out.get(b) ?? out.set(b, []).get(b)).push(a); }
  const ang = (a, b) => Math.atan2(V[b][1] - V[a][1], V[b][0] - V[a][0]);
  for (const [a, list] of out) list.sort((p, q) => ang(a, p) - ang(a, q));
  const used = new Set(), panels = [];
  for (const [a0, b0] of edges.flatMap(([a, b]) => [[a, b], [b, a]])) {
    if (used.has(`${a0}>${b0}`)) continue;
    const loop = []; let a = a0, b = b0;
    while (!used.has(`${a}>${b}`)) {
      used.add(`${a}>${b}`); loop.push(a);
      const list = out.get(b), i = list.indexOf(a), c = list[(i - 1 + list.length) % list.length]; // next edge clockwise → face on the left
      a = b; b = c;
    }
    const P = loop.map((i) => V[i]), area = P.reduce((s, p, i) => s + cross(p, P[(i + 1) % P.length]), 0) / 2;
    if (area > 1e-6) panels.push(P);
  }
  // corners only (drop collinear vertices)
  return panels.map((P) => P.filter((p, i) => Math.abs(cross(sub(p, P[(i - 1 + P.length) % P.length]), sub(P[(i + 1) % P.length], p))) > 1e-6));
}

const panelKey = (P) => { const c = P.reduce((s, p) => [s[0] + p[0] / P.length, s[1] + p[1] / P.length], [0, 0]); return `${c[0].toFixed(2)},${c[1].toFixed(2)}`; };

// load on each panel edge as pieces { s0, s1, w0, w1 } (s from the edge start, kg/m)
function panelLoads(P, w, dir) {
  const n = P.length, sides = P.map((p, i) => dist(p, P[(i + 1) % n]));
  const rect = n === 4 && P.every((p, i) => Math.abs((P[(i + 1) % n][0] - p[0]) * (P[(i + 3) % n][0] - p[0]) + (P[(i + 1) % n][1] - p[1]) * (P[(i + 3) % n][1] - p[1])) < 1e-4);
  if (rect) {
    const S = Math.min(sides[0], sides[1]), Lg = Math.max(sides[0], sides[1]), m = S / Lg, peak = (w * S) / 2;
    if (dir) { // precast planks spanning along dir rest on the two edges across them
      const v = dir === "x" ? [1, 0] : [0, 1], along_ = (i) => Math.abs(sub(P[(i + 1) % n], P[i])[0] * v[0] + sub(P[(i + 1) % n], P[i])[1] * v[1]) / sides[i];
      const span = sides.find((_, i) => along_(i) > 0.7) ?? Lg;
      return { kind: "oneway", m, S, L: Lg, span, edges: sides.map((len, i) => (along_(i) < 0.3 ? [{ s0: 0, s1: len, w0: (w * span) / 2, w1: (w * span) / 2 }] : [])) };
    }
    if (Lg / S > 2) return { kind: "oneway", m, S, L: Lg, edges: sides.map((len) => (Math.abs(len - Lg) < 1e-6 ? [{ s0: 0, s1: len, w0: peak, w1: peak }] : [])) };
    return { kind: "twoway", m, S, L: Lg, edges: sides.map((len) => (len - S < 1e-6 ? [{ s0: 0, s1: len / 2, w0: 0, w1: peak }, { s0: len / 2, s1: len, w0: peak, w1: 0 }]
      : [{ s0: 0, s1: S / 2, w0: 0, w1: peak }, { s0: S / 2, s1: len - S / 2, w0: peak, w1: peak }, { s0: len - S / 2, s1: len, w0: peak, w1: 0 }])) };
  }
  // other shapes: each edge takes the triangle it forms with the centroid, spread evenly (approximate)
  const c = P.reduce((s, p) => [s[0] + p[0] / n, s[1] + p[1] / n], [0, 0]);
  return { kind: "other", edges: P.map((p, i) => { const q = P[(i + 1) % n], A = Math.abs(cross(sub(p, c), sub(q, c))) / 2; return [{ s0: 0, s1: sides[i], w0: (w * A) / sides[i], w1: (w * A) / sides[i] }]; }) };
}

// bars of one face in layers (user: keep the clear spacing between bars; what does not fit goes to the next layer):
// per layer n ≤ floor((b − 2·cover − 2·ds + s) / (db + s)) with clear spacing s = max(mat.barClear ?? DEFAULT_BAR_CLEAR (3.5) cm, db), at least the 2 corner
// bars; main bars first, then the extra bars; the 3rd layer takes whatever is left. b in m, cover / bar sizes in cm.
// stirrup text of a beam type: "RB 9" or "2×RB 9" (two sets)
export const stLabel = (t) => `${(t.stSets ?? 1) > 1 ? `${t.stSets}×` : ""}${t.st}`;
// clear spacing between bars of one layer (cm): user standard 3.5 (2026-11-03; was 2.5); per project mat.barClear
export const DEFAULT_BAR_CLEAR = 3.5;
export function barLayers(b, mat, st, main, special) {
  const ds = BARS[st]?.d ?? 0.6, L = [{}, {}, {}];
  const cap = (db) => { const s = Math.max(mat.barClear ?? DEFAULT_BAR_CLEAR, db); return Math.max(2, Math.floor((b * 100 - 2 * (mat.cover ?? 3) - 2 * ds + s) / (db + s) + 1e-9)); };
  const groups = [main, special].filter((g) => g?.n > 0), N = groups.reduce((t, g) => t + g.n, 0);
  if (!N) return L;
  // bars per layer: the first layer up to what fits across the width (clear spacing max(barClear, db), largest bar of the face);
  // a layer above never holds ONE bar alone (user 2026-11-04: it floats in the middle — nothing to tie it to): its bars start as a
  // pair against the stirrup legs (more bars between them tie to a spacer bar). 4 → 2 + 2, 5 → 3 + 2, 6 → 3 + 3, 7 → 3 + 2 + 2
  // (width for 3). The third layer takes the rest. A single bar that cannot be paired (narrow beam: 2 + 1) → L.odd (warning,
  // auto types avoid it).
  const C = cap(Math.max(...groups.map((g) => BARS[g.bar]?.d ?? 1.2))), cnt = [Math.min(N, C)];
  let r = N - cnt[0];
  while (r > 0) { const k = cnt.length === 2 ? r : Math.min(r, C); cnt.push(k); r -= k; }
  for (let k = cnt.length - 1; k >= 1; k--) if (cnt[k] === 1) {
    if (cnt[k - 1] - 1 >= 2) { cnt[k - 1]--; cnt[k]++; } else if (k >= 2 && cnt[0] - 1 >= 2) { cnt[0]--; cnt[k]++; } else L.odd = true;
  }
  // the bars, main group first, fill the layers in order (a layer holds at most two groups: main + special)
  let gi = 0, left = groups[0].n;
  cnt.forEach((c, k) => {
    while (c > 0 && gi < groups.length) {
      const g = groups[gi], take = Math.min(c, left), l = L[k];
      if (!l.main) l.main = { n: take, bar: g.bar }; else if (l.main.bar === g.bar && !l.special) l.main = { n: l.main.n + take, bar: g.bar }; else l.special = { n: (l.special?.n ?? 0) + take, bar: g.bar };
      c -= take; left -= take;
      if (!left) { gi++; left = groups[gi]?.n ?? 0; }
    }
  });
  return L;
}
// "lighter" type: smaller concrete section first, then less steel
const steel = (s) => { const x = parseBars(s); return x ? x.n * BARS[x.bar].A : 0; };
const typeWeight = (t) => t.b * t.h * 1e4 + (steel(t.top) + steel(t.bot) + steel(t.topX) + steel(t.botX)) / 100;

// Design shear (mat.shearAt, default "d"; "max" = the largest shear of the span, as the reference sheets): ACI 318 / ว.ส.ท. — a
// section closer than d to a support may be designed for the shear at d when the support puts the beam end in compression (a
// column), the load is on the top and no concentrated load acts within d. d ≈ h − cover − 1.5 cm, measured from the column centre
// line (the face is c/2 further: conservative). A carried end (beam on a girder) or a point load within d keeps the shear at the
// support; a span shorter than 2d (deep) keeps its largest shear. range(sp, h, mat) → [a0, a1] or null (use the largest shear)
export function shearRange(sp, h, mat) {
  if ((mat.shearAt ?? "d") !== "d" || !sp.endCol) return null;
  const d = h - ((mat.cover ?? 3) + 1.5) / 100, P = sp.Pat ?? [];
  const a0 = sp.endCol[0] && !P.some((x) => x > 1e-6 && x < d) ? d : 0, a1 = sp.endCol[1] && !P.some((x) => x < sp.len - 1e-6 && x > sp.len - d) ? d : 0;
  if (!(a0 || a1) || a0 + a1 >= sp.len - 1e-6) return null;
  return [a0, sp.len - a1];
}
export function vAtD(sp, h, mat) {
  const r = shearRange(sp, h, mat);
  if (!r || !sp.Vx?.length) return sp.V;
  const vs = sp.Vx.filter(([x]) => x >= r[0] - 1e-9 && x <= r[1] + 1e-9).map(([, v]) => v);
  return vs.length ? Math.min(sp.V, Math.max(...vs)) : sp.V;
}

// WSD checks of one span with one beam type (mid-span sagging + support hogging), like the beam module
export function checkSpan(t, sp, mat) {
  if (sp.Vx && !sp.vDone) sp = { ...sp, Vface: sp.V, V: vAtD(sp, t.h, mat) }; // the frame envelope passes vDone (already at d)
  const top = parseBars(t.top), bot = parseBars(t.bot), topX = parseBars(t.topX), botX = parseBars(t.botX);
  // compatibility torsion (user 2026-11-04, ACI 318 22.7.3): the part of the torsion that comes only from members framing in (3D frame,
  // secondary beams / slabs) is not needed for equilibrium — it may be reduced to the cracking torque. Equilibrium torsion (cantilever
  // slabs / loads hung on the beam = the continuous model's Mt, sp.MtEq) is kept in full. Cap (WSD, from φ·4√f'c·Acp²/pcp at an average
  // load factor 1.5): Tlim = 0.53·√f'c·(b·h)²/(2(b + h)) kg-cm.
  const fcB = mat.fcBeam ?? mat.fcPrime, Tlim = (0.53 * Math.sqrt(fcB) * (t.b * 100 * t.h * 100) ** 2 / (2 * (t.b * 100 + t.h * 100))) / 100;
  const MtAll = sp.Mt ?? 0, MtEq = Math.min(MtAll, sp.MtEq ?? MtAll), MtUse = mat.compatTorsion === false || sp.MtEq === undefined ? MtAll : MtEq + Math.min(MtAll - MtEq, Tlim);
  const base = { ...mat, fcPrime: mat.fcBeam ?? mat.fcPrime, type: sp.kind, b: t.b, h: t.h, L: sp.len, V: sp.V, Mt: MtUse, stirrup: { bar: t.st, sets: t.stSets ?? 1 } }; // stSets 2 = double stirrups (2 sets, user: RB9 is the largest)
  const out = {};
  try {
    const lay = (m, x) => barLayers(t.b, mat, t.st, m, x);
    if (sp.kind !== "cantilever") out.mid = designSection({ ...base, M: sp.Mpos, s: t.sMid, top: lay(top), bottom: lay(bot, botX) });
    out.sup = designSection({ ...base, M: sp.Mneg, s: t.sSup, top: lay(bot), bottom: lay(top, topX) }); // tension at the top
  } catch (e) { return { error: e.message, ok: false }; }
  // ACI 318 minimum-shear-reinforcement exemption (mat.stirrupExempt, user 2026-11-04, off by default): a shallow beam (h ≤ 25 cm)
  // or one with V ≤ Vc/2, without design torsion, needs no minimum stirrups — the spacing limit d/2 and Av,min do not govern
  // (stirrups of the type are still placed as detailing). Ole's house: grade beams 20×20 failed only on s ≤ d/2.
  if (mat.stirrupExempt) for (const r of [out.mid, out.sup]) {
    if (!r || !(t.h <= 0.25 + 1e-9 || base.V <= r.Vc / 2) || MtUse > (Tlim ?? 0) / 4 || r.Vp > 0) continue; // V > Vc needs stirrups by strength; torsion ≥ ¼ cracking (ACI threshold) too
    Object.assign(r, { stExempt: t.h <= 0.25 + 1e-9 ? "h ≤ 25 ซม." : "V ≤ Vc/2", AminOk: true, stirrup: r.stirrup === "CHECK_SPACING" ? `${t.stSets ?? 1}-${t.st} @ ${r === out.mid ? t.sMid : t.sSup}` : r.stirrup });
  }
  // a short segment (span < 4h, e.g. between close columns) is a deep beam: its h/L ratio is reported, the WSD checks still apply
  const deep = sp.len < 4 * t.h;
  const ok1 = (r) => r.minDepthOk && (r.deepOk || deep) && r.nOk && r.AsMinOk !== false && r.doublyCheck === "OK" && r.VpOk && r.vtOk && r.vOk && r.AminOk !== false && r.stirrup !== "CHECK_SPACING" && r.topOk && r.botOk;
  // tension steel, compression steel (doubly reinforced when M > Mc) and shear, as required / provided
  const util = (r) => Math.max(typeof r.reqBot === "number" ? r.reqBot / r.provBot : 9, typeof r.reqTop === "number" && r.reqTop > 0 ? r.reqTop / (r.provTop || 1e-9) : 0, r.Vp > 0 ? r.Vp / r.Vc2 : 0);
  // As,min applies to the sagging face; a support with no hogging moment only needs its shear checked
  const supOk = sp.Mneg < 1 ? out.sup.VpOk && out.sup.stirrup !== "CHECK_SPACING" && out.sup.AminOk !== false : ok1(out.sup);
  return { ...out, MtUse, MtAll, Tlim, deep: deep && !(out.mid ?? out.sup).deepOk, ok: (!out.mid || ok1(out.mid)) && supOk, util: Math.max(out.mid ? util(out.mid) : 0, sp.Mneg < 1 ? 0 : util(out.sup)) };
}

// why a span check fails, in plain Thai (inspector, tables): one line per failed criterion, mid-span first then support
export function spanReasons(c) {
  if (!c) return [];
  if (c.error) return [c.error];
  const out = [], at = { mid: "กลางช่วง", sup: "ที่รองรับ" };
  for (const k of ["mid", "sup"]) {
    const r = c[k];
    if (!r) continue;
    const w = at[k];
    if (r.minDepthOk === false) out.push(`${w}: คานลึกน้อยกว่าขั้นต่ำ ${(r.minDepth * 100).toFixed(0)} ซม.`);
    if (r.deepOk === false && !c.deep) out.push(`${w}: h/L ${r.deepRatio} > ${r.deepLimit} (คานลึก)`);
    if (r.doublyCheck && r.doublyCheck !== "OK") out.push(`${w}: โมเมนต์เกินกำลังหน้าตัด (${r.doublyCheck === "STEEL_BEAM" ? "ต้องใช้เหล็กรับแรงทั้งหมด" : "เหล็กรับแรงอัดไม่พอ"})`);
    if (r.botOk === false && typeof r.reqBot === "number") out.push(`${w}: เหล็กรับแรงดึงต้องการ ${r.reqBot.toFixed(2)} > ใส่ ${r.provBot.toFixed(2)} ซม.²`);
    if (r.topOk === false && typeof r.reqTop === "number") out.push(`${w}: เหล็กด้านอัด (+ เหล็กรับบิด) ต้องการ ${r.reqTop.toFixed(2)} > ใส่ ${r.provTop.toFixed(2)} ซม.²`);
    if (r.AsMinOk === false && k === "mid") out.push(`${w}: เหล็กน้อยกว่า As,min ${r.AsMin.toFixed(2)} ซม.²`);
    if (r.VpOk === false) out.push(`${w}: แรงเฉือนเกินขีดจำกัดหน้าตัด (V − Vc > 1.32√f'c·b·d)`);
    if (r.vtOk === false || r.vOk === false) out.push(`${w}: หน่วยแรงบิด/เฉือนรวมเกินกำหนด`);
    if (r.stirrup === "CHECK_SPACING") out.push(`${w}: ระยะเหล็กปลอกเกิน s ≤ ${typeof r.sMax === "number" ? r.sMax.toFixed(2) : "–"} ม.`);
    if (r.AminOk === false) out.push(`${w}: เหล็กปลอกน้อยกว่าขั้นต่ำ`);
  }
  if (c.defl && c.defl.ok === false) out.push(`ระยะแอ่น ${(c.defl.dT * 1000).toFixed(1)} มม. (ยอมให้ ${(c.defl.limT * 1000).toFixed(1)}) / จร ${(c.defl.dL * 1000).toFixed(1)} (ยอมให้ ${(c.defl.limL * 1000).toFixed(1)})`);
  return [...new Set(out)];
}

// floor: { columns: [[x,y]], beams: [{ a, b, type (index | null = auto), role ("main" | "secondary" | undefined = auto, at crossings), wall: { h, kind } }], t, finish, live, panels: { key: { t, finish, live, open } } }
// extra: point loads [{ p: [x,y], P, from }] from columns of the floor above that stand on a beam here
// floor.panels[key] = { kind: S | PS | GS, dir: x | y (PS), t, finish, live, open }; floor.walls = [{ a, b, kind, h, open %, layers }];
// floor.cants = [{ a, b (on a beam), L, side ±1, t, finish, live }] cantilever slabs
// floor.stairs = [{ a, b (plan rectangle corners), up: +x|-x|+y|-y, kind, t, riser, tread, finish, live, landingL, landingTo: this|below, side ±1 (cant) }]
// floor.lineLoads = [{ a, b, q kg/m, name, g: SDL | WALL | LL (Load Cases page; none = SP) }] railings, walls typed as kg/m etc.; floor.pointLoads = [{ p, P kg, name }]; panels[key].extra kg/m² (SDL)
// downLines: line loads handed down by the floor above (stair bottoms) → [{ a, b, q, g, from }]
// minTypes: { drawnBeamIndex: typeIdx } lightest type allowed (set by the 3D-frame envelope of analyzeFrame)
export function analyzeFloor(floor, types, mat, extra = [], wallTypes = DEFAULT_WALL_TYPES, downLines = [], minTypes = null) {
  const warnings = [], cols = floor.columns ?? [];
  // beams inside the storey (beam.lvl = height above the floor below, m — e.g. a stair landing beam at mid level, user 2026-11-04):
  // their own lines, never merged / crossed / resting with the floor beams, no slab panels; supported by this floor's columns
  const lvKey = (b) => (b.lvl > 0 ? +(+b.lvl).toFixed(3) : 0), lvGroups = new Map();
  (floor.beams ?? []).forEach((b, i) => { const k = lvKey(b); if (!lvGroups.has(k)) lvGroups.set(k, []); lvGroups.get(k).push(i); });
  const lines = []; let guessAll = [];
  for (const [k, idx] of [...lvGroups].sort((a, b) => a[0] - b[0])) {
    const sub = buildLines(idx.map((i) => floor.beams[i]), cols);
    for (const l of sub) lines.push({ ...l, id: lines.length, members: l.members.map((m) => idx[m]), lvl: k || null });
    guessAll = guessAll.concat(sub.guess ?? []);
  }
  lines.guess = guessAll;
  const flat = lines.filter((o) => !o.lvl), same = (o, ln) => (o.lvl ?? null) === (ln.lvl ?? null);
  const overlaps = findOverlaps(floor.beams ?? []);
  if (overlaps.length) warnings.push(`คานซ้อนกัน ${overlaps.length} คู่ (${overlaps.slice(0, 4).map((o) => `คาน ${o.i + 1}/${o.j + 1} ทับกัน ${o.len.toFixed(2)} ม.`).join(" · ")}${overlaps.length > 4 ? " …" : ""}) — น้ำหนักคานคิดซ้ำ · กด "รวมคานซ้อน" ที่ขั้น 2 โครง`);
  // members along each line (t range) and supports
  for (const ln of lines) {
    // a drawn beam may run past the end of this line (a secondary cut at a crossing): its part is clipped to the line
    const pr = (p) => Math.min(ln.L, Math.max(0, (p[0] - ln.A[0]) * ln.u[0] + (p[1] - ln.A[1]) * ln.u[1]));
    ln.parts = ln.members.map((i) => { const b = floor.beams[i], t0 = pr(b.a), t1 = pr(b.b); return { i, t0: Math.min(t0, t1), t1: Math.max(t0, t1) }; });
    ln.cols = cols.map((c, ci) => ({ ci, t: along(ln, c) })).filter((x) => x.t !== null);
  }
  // an end with no column resting on another line → carried by that line. Except (user 2026-11-03, cantilevers carrying an edge
  // beam): when that line stands on no column at all and this one does, it is the other way round — the line without columns
  // rests on this one there (e.g. an edge beam on the tips of cantilever beams; the cantilever tip stays free and takes its reaction).
  // The cantilever needs a back span (≥ 2 columns on its line) — supports are pins in this model, one column alone holds no tip
  for (const ln of lines) ln.carriers = [];
  const addCarrier = (ln, c) => { if (!ln.carriers.some((x) => Math.abs(x.t - c.t) < TOL && x.host === c.host)) ln.carriers.push(c); };
  for (const ln of lines) {
    for (const [t, p] of [[0, ln.A], [ln.L, ln.B]]) {
      if (ln.cols.some((c) => Math.abs(c.t - t) < TOL)) continue;
      const host = lines.find((o) => o !== ln && same(o, ln) && along(o, p) !== null && Math.abs(cross(ln.u, o.u)) > 1e-6);
      if (!host) continue;
      if (!host.cols.length && ln.cols.length >= 2) addCarrier(host, { t: along(host, p), host: ln.id, at: t, rev: true });
      else if (!host.carriers.some((x) => x.rev && x.host === ln.id && Math.abs(x.at - t) < TOL)) addCarrier(ln, { t, host: host.id, at: along(host, p) }); // not when that line already rests here on this one
    }
  }
  // corner without a column where two lines rest on each other (user 2026-11-04: the 0.60 m piece past the last column was not a
  // cantilever): the line whose end is a stub past a column, with a back span (≥ 2 columns), is a cantilever and carries the other
  // one at its tip; both such → the shorter stub carries; neither → left as before (warned below)
  const stub = (l, t) => (l.cols.length >= 2 ? Math.min(...l.cols.map((c) => Math.abs(c.t - t))) : Infinity);
  for (const ln of lines) for (const c of [...ln.carriers]) {
    const h = lines.find((o) => o.id === c.host); if (!h || c.rev) continue;
    const back = h.carriers.find((d) => d.host === ln.id && !d.rev && Math.abs(d.t - c.at) < TOL && Math.abs(d.at - c.t) < TOL);
    if (!back || !(c.t < TOL || c.t > ln.L - TOL) || !(back.t < TOL || back.t > h.L - TOL)) continue; // both must be line ends
    const sL = stub(ln, c.t), sH = stub(h, back.t);
    if (sL === Infinity && sH === Infinity) continue;
    const [cant, rest] = sL <= sH ? [ln, h] : [h, ln];
    cant.carriers = cant.carriers.filter((x) => x.host !== rest.id || Math.abs(x.t - (cant === ln ? c.t : back.t)) > TOL);
  }
  // secondaries kept whole over a main beam (a cantilever stub past it): interior support where they cross
  for (const ln of lines) for (const J of ln.through ?? []) {
    const host = lines.find((o) => o !== ln && same(o, ln) && along(o, J) !== null && Math.abs(cross(ln.u, o.u)) > 1e-6);
    const t = along(ln, J);
    if (host && t !== null) addCarrier(ln, { t, host: host.id, at: along(host, J) });
  }
  // crossings decided by length only (no role, same number of columns): say which one was taken as the main beam
  const guesses = lines.guess ?? [];
  if (guesses.length > 3) warnings.push(`คานตัดกัน ${guesses.length} จุดที่ไม่มีเสา — คิดว่าคานช่วงสั้นกว่า (หรือวาดก่อน) เป็นคานหลัก อีกตัววางบน · ตรวจบนแปลน (△ = ปลายคานซอย) แล้วเปลี่ยนได้ที่ "บทบาท" ของคาน`);
  else for (const J of guesses) {
    const main = lines.find((o) => along(o, J, true) !== null), secs = lines.filter((o) => o !== main && (dist(o.A, J) < TOL || dist(o.B, J) < TOL));
    if (main && secs.length) warnings.push(`คานตัดกันที่ (${J[0].toFixed(2)}, ${J[1].toFixed(2)}) ไม่มีเสา — คิดว่าแนว ${secs.map((o) => o.id + 1).join(", ")} (คานซอย) วางบนแนว ${main.id + 1} (คานหลัก: ช่วงสั้นกว่าหรือวาดก่อน) · เปลี่ยนได้ที่ "บทบาท" ของคาน`);
  }
  const corners = [];
  for (const ln of lines) for (const c of ln.carriers) { // two lines resting on each other (corner without a column): no real support there
    const h = lines.find((o) => o.id === c.host);
    if (ln.id < h.id && h.carriers.some((d) => d.host === ln.id && Math.hypot(...[0, 1].map((k) => (d.t ? h.B : h.A)[k] - (c.t ? ln.B : ln.A)[k])) < TOL)) corners.push(`${ln.id + 1}/${h.id + 1}`);
  }
  // one line for all of them (user 2026-11-03: too many warnings)
  if (corners.length) warnings.push(`มุมคานไม่มีเสา ${corners.length} จุด (แนว ${corners.join(", ")}) — คานต่อเนื่องคิดว่าวางบนกันเอง ใช้ผลโครง 3 มิติ (มุมยึดแน่น) ประกอบ · ใส่เสาที่มุม หรือให้คานด้านหนึ่งยื่นรับ`);
  // slab panels by kind: S cast in place (two-way / one-way), PS precast planks (one-way along dir), GS on ground (nothing to the beams)
  const panels = findPanels(flat).map((P) => {
    const key = panelKey(P), o = floor.panels?.[key] ?? {}, open = !!o.open, st = o.kind ?? "S", dir = st === "PS" ? o.dir ?? "x" : null;
    const t = o.t ?? floor.t, finish = o.finish ?? floor.finish, live = o.live ?? floor.live;
    const area = Math.abs(P.reduce((s, p, i) => s + cross(p, P[(i + 1) % P.length]), 0) / 2);
    const g = open ? { DL: 0, SDL: 0, LL: 0, WALL: 0 } : { DL: CONC * t, SDL: finish + (o.extra ?? 0), LL: live, WALL: 0 };
    return { key, P, st, dir, t, finish, live, extraSDL: o.extra ?? 0, open, area, g, ...panelLoads(P, 1, dir), ...(st === "GS" ? { kind: "ground" } : {}) };
  });
  const inPanel = (pt) => panels.find((pn) => { let c = false; for (let i = 0, j = pn.P.length - 1; i < pn.P.length; j = i++) { const [xi, yi] = pn.P[i], [xj, yj] = pn.P[j]; if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) c = !c; } return c; });
  for (const ln of lines) { ln.slab = []; ln.torsion = []; }
  // walls: on a beam → line load on that beam; on a slab → spread over that panel
  const walls = wallsOf(floor).map((w, i) => {
    const q = wallLoad(w, wallTypes), L = dist(w.a, w.b), u = sub(w.b, w.a).map((v) => v / (L || 1)), out = { i, q, len: L, on: [] };
    for (const ln of flat) {
      if (Math.abs(cross(ln.u, u)) > 1e-6 || Math.abs(cross(ln.u, sub(w.a, ln.A))) > TOL) continue;
      const proj = (p) => (p[0] - ln.A[0]) * ln.u[0] + (p[1] - ln.A[1]) * ln.u[1], a = Math.max(0, Math.min(proj(w.a), proj(w.b))), b = Math.min(ln.L, Math.max(proj(w.a), proj(w.b)));
      if (b - a > 0.05) { ln.slab.push({ a, b, wa: q, wb: q, g: "WALL", from: `ผนัง ${i + 1}` }); out.on.push({ line: ln.id, len: b - a }); }
    }
    if (!out.on.length && L > 0.05) {
      const pn = inPanel([(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2]);
      if (pn && pn.st !== "GS") { pn.g.WALL += (q * L) / pn.area; out.panel = pn.key; }
      else if (!pn) warnings.push(`ผนัง ${i + 1} ไม่อยู่บนคานหรือพื้น — ไม่ได้นำน้ำหนักไปใช้`);
      else out.ground = true;
    }
    return out;
  });
  panels.forEach((pn) => { pn.w = pn.st === "GS" ? 0 : pn.g.DL + pn.g.SDL + pn.g.LL + pn.g.WALL; });
  // cantilever slabs along a beam: line load w·L and torsion w·L²/2 per metre on that beam
  const cants = (floor.cants ?? []).map((c, i) => {
    const t = c.t ?? floor.t, g = { DL: CONC * t, SDL: c.finish ?? floor.finish, LL: c.live ?? floor.live }, L = c.L, ab = dist(c.a, c.b);
    const n = [(-(c.b[1] - c.a[1]) / ab) * (c.side ?? 1), ((c.b[0] - c.a[0]) / ab) * (c.side ?? 1)];
    const P = [c.a, c.b, [c.b[0] + n[0] * L, c.b[1] + n[1] * L], [c.a[0] + n[0] * L, c.a[1] + n[1] * L]];
    const ln = flat.find((o) => along(o, c.a) !== null && along(o, c.b) !== null);
    if (ln) {
      const a = Math.min(along(ln, c.a), along(ln, c.b)), b = Math.max(along(ln, c.a), along(ln, c.b));
      for (const [k, v] of Object.entries(g)) if (v > 0) ln.slab.push({ a, b, wa: v * L, wb: v * L, g: k, from: `พื้นยื่น ${i + 1}` });
      ln.torsion.push({ a, b, m: ((g.DL + g.SDL + g.LL) * L * L) / 2, mL: (g.LL * L * L) / 2 }); // mL = live part (load combinations)
    } else warnings.push(`พื้นยื่น ${i + 1} ไม่ได้วางบนคาน`);
    return { i, P, t, L, g, w: g.DL + g.SDL + g.LL, area: ab * L, line: ln?.id };
  });
  // a uniform load along segment a-b onto the beam line under it (false when no beam is there)
  const onBeam = (a, b, q, g, from, mid = false) => { // mid: onto a beam inside the storey (stair landing)
    const L = dist(a, b), u = sub(b, a).map((v) => v / (L || 1));
    const ln = (mid ? lines.filter((o) => o.lvl) : flat).find((o) => Math.abs(cross(o.u, u)) < 1e-6 && along(o, a) !== null && along(o, b) !== null);
    if (!ln || !(q > 0)) return !!ln;
    const t0 = along(ln, a), t1 = along(ln, b);
    ln.slab.push({ a: Math.min(t0, t1), b: Math.max(t0, t1), wa: q, wb: q, g, from });
    return true;
  };
  // stairs: rectangle on plan; reactions per metre of width onto the beams at its edges; bottom edge onto the floor below
  const down = [];
  const stairs = (floor.stairs ?? []).map((st, i) => {
    const x0 = Math.min(st.a[0], st.b[0]), x1 = Math.max(st.a[0], st.b[0]), y0 = Math.min(st.a[1], st.b[1]), y1 = Math.max(st.a[1], st.b[1]);
    const ax = st.up?.[1] ?? "x", sg = st.up?.[0] === "-" ? -1 : 1, from = `บันได ${i + 1}`, { th, flight, landing } = stairLoads(st);
    const Lr = ax === "x" ? x1 - x0 : y1 - y0, B = ax === "x" ? y1 - y0 : x1 - x0;
    // edges: start (bottom of the run), end (far), sideA / sideB (along the run)
    const E = ax === "x"
      ? { start: sg > 0 ? [[x0, y0], [x0, y1]] : [[x1, y0], [x1, y1]], end: sg > 0 ? [[x1, y0], [x1, y1]] : [[x0, y0], [x0, y1]], sideA: [[x0, y0], [x1, y0]], sideB: [[x0, y1], [x1, y1]] }
      : { start: sg > 0 ? [[x0, y0], [x1, y0]] : [[x0, y1], [x1, y1]], end: sg > 0 ? [[x0, y1], [x1, y1]] : [[x0, y0], [x1, y0]], sideA: [[x0, y0], [x0, y1]], sideB: [[x1, y0], [x1, y1]] };
    const half = (e, k) => { const [p, q] = e, m = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]; return k === 0 ? [p, m] : [m, q]; };
    const put = (edge, perM, where) => { // perM: { DL, SDL, LL } kg/m
      for (const [g, q] of Object.entries(perM)) {
        if (!(q > 0)) continue;
        if (where === "below") down.push({ a: edge[0], b: edge[1], q, g, from });
        else if (where === "mid" && !onBeam(edge[0], edge[1], q, g, from, true)) { warnings.push(`${from}: ชานพักไม่มีคานรับที่ระดับชานพัก (คานระดับกลางชั้นตามขอบ (${edge[0].map((v) => v.toFixed(2))})–(${edge[1].map((v) => v.toFixed(2))})) — วาดคานชานพักแล้วตั้ง "ระดับ" ของคาน`); break; }
        else if (where === "mid") continue;
        else if (!onBeam(edge[0], edge[1], q, g, from)) { warnings.push(`${from}: ขอบ (${edge[0].map((v) => v.toFixed(2))})–(${edge[1].map((v) => v.toFixed(2))}) ไม่มีคานรับ`); break; }
      }
    };
    const scale = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, v * f]));
    const add = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]));
    const total = scale(flight, Lr * B);
    if (st.kind === "side") { put(E.sideA, scale(flight, B / 2), "this"); put(E.sideB, scale(flight, B / 2), "this"); } // spans across the width: each side wB/2 per metre of run
    else if (st.kind === "cant") put(st.side === -1 ? E.sideA : E.sideB, scale(flight, B), "this");
    else if (st.kind === "landing") {
      // U / L: flight 1 up on one half, landing at the far end, flight 2 back on the other half (simple span start → far edge)
      const Ll = Math.min(st.landingL ?? 1.2, Lr), Lf = Lr - Ll, Rfar = add(scale(flight, (Lf * Lf) / 2 / Lr), scale(landing, (Ll * (Lf + Ll / 2)) / Lr)), Rst = add(scale(flight, Lf - (Lf * Lf) / 2 / Lr), scale(landing, Ll - (Ll * (Lf + Ll / 2)) / Lr));
      put(half(E.start, 0), Rst, "below"); put(half(E.start, 1), Rst, "this");
      // the landing edge: a landing beam inside the storey ("mid", default when one is drawn along it), this floor or the floor below
      const midThere = lines.some((o) => o.lvl && along(o, E.end[0]) !== null && along(o, E.end[1]) !== null);
      put(E.end, Rfar, st.landingTo === "this" ? "this" : st.landingTo === "below" ? "below" : st.landingTo === "mid" || midThere ? "mid" : "below");
      total.DL = flight.DL * Lf * B + landing.DL * Ll * B; total.SDL = flight.SDL * Lr * B; total.LL = flight.LL * Lr * B;
    } else { put(E.start, scale(flight, Lr / 2), "below"); put(E.end, scale(flight, Lr / 2), "this"); } // long: simple span along the run
    if (st.kind === "cant") { // the supporting beam also takes the torque wB²/2 per metre
      const e = st.side === -1 ? E.sideA : E.sideB, ln = flat.find((o) => along(o, e[0]) !== null && along(o, e[1]) !== null);
      if (ln) { const a = along(ln, e[0]), b = along(ln, e[1]); ln.torsion.push({ a: Math.min(a, b), b: Math.max(a, b), m: ((flight.DL + flight.SDL + flight.LL) * B * B) / 2, mL: (flight.LL * B * B) / 2 }); }
    }
    return { i, P: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], kind: st.kind ?? "long", up: st.up ?? "+x", th, Lr, B, total, w: flight.DL + flight.SDL + flight.LL };
  });
  // a panel under a stair is its stair well: the stair replaces that slab
  for (const pn of panels) {
    const c = pn.P.reduce((s, q) => [s[0] + q[0] / pn.P.length, s[1] + q[1] / pn.P.length], [0, 0]);
    if (stairs.some((st) => c[0] > st.P[0][0] && c[0] < st.P[2][0] && c[1] > st.P[0][1] && c[1] < st.P[2][1])) { pn.g = { DL: 0, SDL: 0, LL: 0, WALL: 0 }; pn.w = 0; pn.stairWell = true; continue; }
    // a stair covering only part of a panel (no beams around the stair well): that slab still carries its full load → warn
    if (pn.open) continue;
    const xs = pn.P.map((q) => q[0]), ys = pn.P.map((q) => q[1]), X0 = Math.min(...xs), X1 = Math.max(...xs), Y0 = Math.min(...ys), Y1 = Math.max(...ys), N = 24;
    for (const st of stairs) {
      let inP = 0, inS = 0;
      for (let a = 0; a < N; a++) for (let b = 0; b < N; b++) { const q = [X0 + ((a + 0.5) / N) * (X1 - X0), Y0 + ((b + 0.5) / N) * (Y1 - Y0)]; if (!insidePoly(pn.P, q)) continue; inP++; if (q[0] > st.P[0][0] && q[0] < st.P[2][0] && q[1] > st.P[0][1] && q[1] < st.P[2][1]) inS++; }
      if (inP && inS / inP > 0.1) warnings.push(`บันได ${st.i + 1} ทับแผ่นพื้น P${panels.indexOf(pn) + 1} ${Math.round((inS / inP) * 100)} % — แผ่นนี้ยังคิดน้ำหนักพื้นเต็มแผ่น (ซ้ำกับบันได) · วาดคานรอบช่องบันได ให้ช่องบันไดเป็นแผ่นของตัวเอง`);
    }
  }
  // railings / line loads: on a cantilever slab tip → that slab's beam (+ torsion), on a beam → the beam, else spread over the panel
  const lineLoads = (floor.lineLoads ?? []).map((l, i) => {
    const from = l.name || `น้ำหนักเส้น ${i + 1}`, L = dist(l.a, l.b), g = ["SDL", "WALL", "LL"].includes(l.g) ? l.g : "SP"; // load case (Load Cases page), old data = SP
    const tip = cants.find((c) => segDist(l.a, c.P[3], c.P[2]) < TOL && segDist(l.b, c.P[3], c.P[2]) < TOL);
    if (tip && tip.line !== undefined) {
      const ln = lines[tip.line], src = floor.cants[tip.i], a = along(ln, src.a), b = along(ln, src.b), f = L / dist(src.a, src.b);
      ln.slab.push({ a: Math.min(a, b), b: Math.max(a, b), wa: l.q * f, wb: l.q * f, g, from });
      ln.torsion.push({ a: Math.min(a, b), b: Math.max(a, b), m: l.q * f * tip.L, mL: g === "LL" ? l.q * f * tip.L : 0 });
      return { i, on: "cant" };
    }
    if (onBeam(l.a, l.b, l.q, g, from)) return { i, on: "beam" };
    const pn = inPanel([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]);
    if (pn && pn.st !== "GS") { pn.g[g] = (pn.g[g] ?? 0) + (l.q * L) / pn.area; pn.w += (l.q * L) / pn.area; return { i, on: "panel", panel: pn.key }; }
    warnings.push(`${from} ไม่มีคานหรือพื้นรับ`); return { i, on: null };
  });
  // point loads: on a beam → point load; else spread over the panel
  const pointLoads = (floor.pointLoads ?? []).map((pl, i) => {
    const from = pl.name || `น้ำหนักจุด ${i + 1}`, ci = cols.findIndex((c) => dist(c, pl.p) < 0.05);
    if (ci >= 0) return { i, on: "column", ci, P: pl.P }; // e.g. roof plates bearing on a column top
    const ln = flat.find((o) => along(o, pl.p) !== null);
    if (ln) { (ln.extra ??= []).push({ at: along(ln, pl.p), P: pl.P, from, g: "SP" }); return { i, on: "beam" }; }
    const pn = inPanel(pl.p);
    if (pn && pn.st !== "GS") { pn.g.SP = (pn.g.SP ?? 0) + pl.P / pn.area; pn.w += pl.P / pn.area; return { i, on: "panel", panel: pn.key }; }
    warnings.push(`${from} ไม่มีคานหรือพื้นรับ`); return { i, on: null };
  });
  for (const d of downLines) if (!onBeam(d.a, d.b, d.q, d.g, d.from)) warnings.push(`${d.from}: ปลายล่างไม่มีคานรับที่ชั้นนี้`);
  panels.forEach((pn, k) => pn.st !== "GS" && pn.edges.forEach((pieces, e) => {
    const p = pn.P[e], q = pn.P[(e + 1) % pn.P.length], L = dist(p, q), u = sub(q, p).map((v) => v / L);
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2], ln = flat.find((o) => along(o, mid) !== null && Math.abs(cross(o.u, u)) < 1e-6);
    if (!ln) return;
    const t0 = along(ln, p), dir = u[0] * ln.u[0] + u[1] * ln.u[1] > 0 ? 1 : -1;
    for (const pc of pieces) for (const [gk, gv] of Object.entries(pn.g)) {
      if (!(gv > 0)) continue;
      const a = t0 + dir * pc.s0, b = t0 + dir * pc.s1, w0 = pc.w0 * gv, w1 = pc.w1 * gv;
      ln.slab.push(a < b ? { a, b, wa: w0, wb: w1, g: gk, from: `P${k + 1}` } : { a: b, b: a, wa: w1, wb: w0, g: gk, from: `P${k + 1}` });
    }
  }));
  // arc beams: the slab reaches the arc, not the chord — a panel whose chord edge has the arc outside it gets the segment
  // between chord and arc as extra load, spread evenly on the beam (by load group)
  for (const ln of lines.filter((o) => o.arc)) {
    const g = arcGeom(ln.A, ln.B, ln.arc.s);
    panels.forEach((pn, k) => {
      if (pn.open || pn.stairWell || pn.st === "GS" || !pn.P.some((p, e) => { const q = pn.P[(e + 1) % pn.P.length]; return along(ln, p) !== null && along(ln, q) !== null && dist(p, q) > TOL; })) return;
      if (insidePoly(pn.P, g.mid)) return; // arc bulges into the panel: its area is smaller (ignored, conservative)
      for (const [gk, gv] of Object.entries(pn.g)) if (gv > 0) ln.slab.push({ a: 0, b: ln.L, wa: (gv * g.area) / ln.L, wb: (gv * g.area) / ln.L, g: gk, from: `P${k + 1} ส่วนโค้ง` });
    });
  }
  // columns from above standing on a beam: point load on the first line through that point
  for (const e of extra) {
    const ln = flat.find((o) => along(o, e.p) !== null);
    if (ln) (ln.extra ??= []).push({ at: along(ln, e.p), P: e.P, from: e.from });
    else warnings.push(`${e.from} ที่ (${e.p[0].toFixed(2)}, ${e.p[1].toFixed(2)}) ไม่มีเสาหรือคานรับที่ชั้นนี้ — แรงหายไป`);
  }
  // types: fixed per drawn beam, or auto (lightest passing); iterate because self weight and stiffness depend on the choice
  const order = types.map((t, i) => ({ t, i })).sort((x, y) => typeWeight(x.t) - typeWeight(y.t));
  const typeOf = new Map(); // drawn beam index → type index in use
  (floor.beams ?? []).forEach((b, i) => typeOf.set(i, b.type ?? minTypes?.[i] ?? order[0]?.i ?? 0));
  const allowed = (i, t) => minTypes?.[i] == null || typeWeight(t) >= typeWeight(types[minTypes[i]]) - 1e-9;
  const heaviest = (list) => list.reduce((a, b) => (typeWeight(types[b]) > typeWeight(types[a]) ? b : a));
  const spanType = (sp) => heaviest(sp.members.map((m) => typeOf.get(m)));
  let result, changed = false;
  for (let pass = 0; pass < 4; pass++) {
    result = solveFloor(floor, lines, types, mat, typeOf, warnings, pass === 3);
    changed = false;
    // deflection with another type: δ · I(current) / I(type)
    const deflWith = (sp, t) => { const cur = types[spanType(sp)] ?? types[0], f = (cur.b * cur.h ** 3) / (t.b * t.h ** 3), d = sp.defl;
      return { ...d, dL: d.dL * f, dT: d.dT * f, ok: d.dL * f <= d.limL + 1e-9 && d.dT * f <= d.limT + 1e-9 }; };
    const withDefl = (c, sp, t) => { const d = deflWith(sp, t); return { ...c, defl: d, ok: c.ok && d.ok, util: Math.max(c.util, d.dT / d.limT, d.dL / d.limL) }; };
    for (const sp of result.spans) {
      const fixed = sp.members.filter((m) => floor.beams[m].type != null).map((m) => floor.beams[m].type);
      if (fixed.length) { const ft = heaviest(fixed); sp.check = withDefl(checkSpan(types[ft], sp, mat), sp, types[ft]); sp.typeIdx = ft; sp.own = true; continue; }
      let best = null;
      for (const { t, i } of order) { if (!sp.members.every((m) => allowed(m, t))) continue; const c = withDefl(checkSpan(t, sp, mat), sp, t); if (c.ok) { best = { c, i }; break; } if (!best || c.util < best.c.util - 1e-9 || (Math.abs(c.util - best.c.util) < 1e-9 && typeWeight(t) > typeWeight(types[best.i]))) best = { c, i }; }
      sp.check = best.c; sp.typeIdx = best.i; // none passes: the lowest utilisation, ties (sections that fail outright) → the strongest
    }
    // a drawn beam uses one type over all its spans: the heaviest its spans need
    for (const [i] of typeOf) {
      const need = result.spans.filter((s) => s.members.includes(i)).map((s) => s.typeIdx);
      if (!need.length || floor.beams[i].type != null) continue;
      const pick = heaviest(need);
      if (pick !== typeOf.get(i)) { typeOf.set(i, pick); changed = true; }
    }
    if (!changed) break;
  }
  // types still moving after the last pass: solve once more so self weight / stiffness match the types reported
  if (changed) result = solveFloor(floor, lines, types, mat, typeOf, [], false);
  for (const sp of result.spans) {
    // the span is checked with the heaviest type of its drawn beams; sp.member = that beam (inspector, plan)
    const ti = spanType(sp), t = types[ti] ?? types[0];
    sp.member = sp.members.find((m) => typeOf.get(m) === ti) ?? sp.member;
    sp.typeIdx = ti; const c = checkSpan(t, sp, mat), d = sp.defl;
    sp.check = { ...c, defl: d, ok: c.ok && d.ok, util: Math.max(c.util, d.dT / d.limT, d.dL / d.limL) };
  }
  // a cantilever span is shown as its type + "A" (user 2026-11-03: B1A = B1's section and support bars, top bars the whole length)
  for (const sp of result.spans) Object.assign(sp, { type: types[sp.typeIdx], ok: sp.check.ok, typeName: `${types[sp.typeIdx]?.name ?? ""}${sp.kind === "cantilever" ? "A" : ""}` });
  // Cantilever detailing (user 2026-11-03: "คานยื่นต้องเน้นเหล็กบนยาวตลอด"): the top bars that take the root moment (through + extra)
  // run the whole cantilever, hooked down at the tip, and continue into the back span by max(cantilever length, ld) — not the L/4
  // cut-off of the extra top bars elsewhere. ld (WSD, ว.ส.ท. / ACI 318 working stress): 0.06·Ab·fy/√f'c ≥ 0.006·db·fy (cm), × 1.4
  // for top bars. A back span shorter than that: the bars run its whole length; no back span (one column): anchored in the column.
  const ldOf = (bar) => { const b = BARS[bar]; if (!b) return 0; const fc = mat.fcBeam ?? mat.fcPrime, fy = mat.fy ?? 4000;
    return (1.4 * Math.max((0.06 * b.A * fy) / Math.sqrt(fc), 0.006 * b.d * fy)) / 100; };
  for (const sp of result.spans.filter((x) => x.kind === "cantilever" && x.fixedAt)) {
    const t = sp.type, bars = [parseBars(t.top), parseBars(t.topX)].filter(Boolean), big = bars.reduce((a, b) => (!a || BARS[b.bar].d > BARS[a.bar].d ? b : a), null);
    const ld = big ? ldOf(big.bar) : 0, ext = Math.max(sp.len, ld);
    const back = result.spans.find((o) => o !== sp && o.line === sp.line && (sp.fixedAt === "start" ? Math.abs(o.x1 - sp.x0) < 1e-6 : Math.abs(o.x0 - sp.x1) < 1e-6));
    const through = !!back && back.len < ext - 1e-9;
    sp.detail = { ld, ext, bars: [t.top, t.topX].filter(Boolean).join(" + "), bar: big?.bar ?? null, back: back?.id ?? null, backLen: back?.len ?? 0, through, noBack: !back };
    if (!back) warnings.push(`คานยื่น ${sp.id} (${sp.len.toFixed(2)} ม.) ไม่มีช่วงคานด้านหลัง — เหล็กบน ${sp.detail.bars} ต้องฝังในเสาอย่างน้อย ld = ${ld.toFixed(2)} ม. พร้อมงอขอ (หรือต่อคานเข้าไปช่วงหลัง)`);
    else if (through) warnings.push(`คานยื่น ${sp.id}: ช่วงหลัง ${back.id} ยาว ${back.len.toFixed(2)} ม. < ระยะฝาก ${ext.toFixed(2)} ม. — เหล็กบน ${sp.detail.bars} ยาวตลอดช่วง ${back.id} แล้วฝังต่อในเสา/คานถัดไป`);
  }
  // a support that the continuous beam pulls down (negative reaction: a short end span next to a long one lifts its far end):
  // the column load is not reduced (envelope), but that end must be held down — beam bars anchored into the column, and the
  // column / footing able to take the pull. Said once per support (review 2026-11-03: −9.5 t on Yasothon with no warning)
  for (const ln of result.lines) {
    if (!ln.res) continue;
    ln.x.forEach((x, k) => {
      // small pulls are normal at a pinned end next to a long span: warn when it matters (> 300 kg and > 5 % of the line's load)
      const total = (ln.loads ?? []).reduce((t, l) => t + (l.P ?? ((l.wa + l.wb) / 2) * (l.b - l.a)), 0);
      if (!ln.sup[k] || !(-ln.res.R[k] > Math.max(300, 0.05 * total))) return;
      const p = [ln.A[0] + ln.u[0] * x, ln.A[1] + ln.u[1] * x], col = cols.some((c) => dist(c, p) < TOL);
      (ln.uplift ??= []).push({ x, p, R: ln.res.R[k] });
      warnings.push(`แนวคาน ${ln.id + 1} ที่ (${p[0].toFixed(2)}, ${p[1].toFixed(2)}): ปลายคานถูกยก ${Math.round(-ln.res.R[k]).toLocaleString()} กก. (คานต่อเนื่อง — ช่วงสั้นติดช่วงยาว) — ${col ? "ยึดเหล็กคานเข้าเสาให้รับแรงดึง และตรวจเสา/ฐานรากรับแรงถอน" : "จุดรองรับต้องรับแรงดึงได้"} หรือปรับช่วงคาน/ตำแหน่งเสา`);
    });
  }
  // short span hogging all along (user 2026-11-04, automatic): when the live-load envelope keeps a negative moment at mid-span
  // (a short span between long ones, or an end lifted by its neighbour) the extra top bars cut at L/4 would stop inside the
  // hogging zone — they run the whole span instead (sp.topFull, detailing only; the section check is unchanged)
  for (const sp of result.spans) {
    if (sp.kind === "cantilever") continue;
    const ln = result.lines.find((l) => l.id === sp.line); if (!ln?.env) continue;
    const xm = (sp.x0 + sp.x1) / 2, e = ln.env.env.find((v) => xm >= v.curve.x0 - 1e-9 && xm <= v.curve.x0 + v.curve.L + 1e-9); if (!e) continue;
    const i = Math.round(((xm - e.curve.x0) / (e.curve.L || 1)) * 40), Mm = e.curve.Mmin[Math.max(0, Math.min(40, i))];
    const lifted = (ln.uplift ?? []).some((u) => Math.abs(u.x - sp.x0) < 1e-3 || Math.abs(u.x - sp.x1) < 1e-3);
    if (Mm < -Math.max(10, 0.05 * sp.Mneg) || lifted) sp.topFull = { bars: [sp.type?.top, sp.type?.topX].filter(Boolean).join(" + "), Mmid: Mm, lifted };
  }
  for (const pl of pointLoads) if (pl.on === "column") { result.columns[pl.ci].R += pl.P; result.columns[pl.ci].from.push({ point: pl.i, R: pl.P }); }
  // a secondary beam deeper than the beam carrying it (user 2026-11-04: "why is a secondary sometimes deeper than the main?") — each
  // drawn beam takes the lightest type passing its own forces, so a long / loaded secondary can end up deeper than a short main beam
  const deeper = [];
  for (const ln of lines) for (const c of ln.carriers) {
    if (c.rev) continue;
    const host = lines.find((o) => o.id === c.host), at = (l, t) => result.spans.find((x) => x.line === l.id && t >= x.x0 - 1e-6 && t <= x.x1 + 1e-6);
    const sp = at(ln, c.t), hp = host && at(host, c.at);
    if (sp?.type && hp?.type && sp.type.h > hp.type.h + 1e-6) deeper.push(`แนว ${ln.id + 1} (${sp.typeName ?? sp.type.name} ลึก ${Math.round(sp.type.h * 100)}) บนแนว ${host.id + 1} (${hp.typeName ?? hp.type.name} ลึก ${Math.round(hp.type.h * 100)}) ที่ (${(ln.A[0] + ln.u[0] * c.t).toFixed(2)}, ${(ln.A[1] + ln.u[1] * c.t).toFixed(2)})`);
  }
  if (deeper.length) warnings.push(`คานซอยลึกกว่าคานหลักที่รับ ${deeper.length} จุด: ${deeper.slice(0, 3).join(" · ")}${deeper.length > 3 ? " …" : ""} — ตามหลักปฏิบัติคานหลักควรลึก ≥ คานซอย: เลือก type ของคานหลักให้ลึกเท่าหรือมากกว่า (ขั้น 7 / แผงคาน)`);
  // a type whose bars leave one bar alone in an upper layer (too narrow to make a pair): cannot be tied — say which (user 2026-11-04)
  for (const ti of new Set(result.spans.map((sp) => sp.typeIdx))) {
    const t = types[ti]; if (!t) continue;
    const L = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x)), bad = [["บน", L(t.top, t.topX)], ["ล่าง", L(t.bot, t.botX)]].filter(([, l]) => l.odd).map(([w]) => w);
    if (bad.length) warnings.push(`Type ${t.name}: เหล็ก${bad.join(" / ")}ชั้นบนเหลือเส้นเดียว (คานกว้าง ${Math.round(t.b * 100)} ซม. วางชั้นแรกได้แค่ 2 เส้น) — ผูกเหล็กลอยกลางคานไม่ได้: เพิ่มเป็นคู่ ใช้เหล็กเส้นใหญ่ขึ้น หรือขยายความกว้างคาน`);
  }
  const groups = { DL: 0, SDL: 0, WALL: 0, LL: 0, SP: pointLoads.reduce((s, pl) => s + (pl.on === "column" ? pl.P : 0), 0) };
  for (const ln of lines) {
    for (const l of ln.slab) groups[l.g ?? "DL"] += ((l.wa + l.wb) / 2) * (l.b - l.a);
    for (const e of ln.extra ?? []) groups[e.g ?? "SP"] += e.P;
  }
  for (const sp of result.spans) groups.DL += CONC * sp.type.b * sp.type.h * sp.len;
  return { ...result, overlaps, panels, walls, cants, stairs, lineLoads, pointLoads, down, groups, warnings: [...new Set(warnings)], ok: result.spans.every((s) => s.ok) && !result.lines.some((l) => l.error) };
}

// largest |deflection| (m) of each element: v'' = −M/EI integrated twice, matched to the nodal deflections
function elementDeflections(res, EI) {
  return res.el.map((el, e) => {
    const n = 40, h = el.L / n, I1 = [0], I2 = [0];
    for (let i = 1; i <= n; i++) {
      const k0 = -el.M((i - 1) * h) / EI[e], k1 = -el.M(i * h) / EI[e];
      I1.push(I1[i - 1] + ((k0 + k1) / 2) * h); I2.push(I2[i - 1] + ((I1[i - 1] + I1[i]) / 2) * h);
    }
    const [d0, d1] = el.d, c1 = (d1 - d0 - I2[n]) / el.L;
    return Math.max(...I2.map((v, i) => Math.abs(v + d0 + c1 * i * h)));
  });
}
// Ec (kg/m²) as in the beam module: 4270·w^1.5·√f'c ksc
const EcOf = (mat) => 2.323 ** 1.5 * 4270 * Math.sqrt(mat.fcBeam ?? mat.fcPrime) * 1e4;

function solveFloor(floor, lines, types, mat, typeOf, warnings, last) {
  const done = new Map(), cols = (floor.columns ?? []).map((p) => ({ p, R: 0, from: [] }));
  const spans = [];
  for (let pass = 0; pass <= lines.length && done.size < lines.length; pass++) {
    for (const ln of lines) {
      if (done.has(ln.id)) continue;
      const resting = lines.filter((o) => o.carriers.some((c) => c.host === ln.id));
      if (resting.some((o) => !done.has(o.id)) && pass < lines.length) continue; // wait for the beams resting on this one
      // loads: slab, wall, self weight per member, point loads from beams resting here
      const loads = [...ln.slab], pts = [];
      for (const pt of ln.parts) {
        const t = types[typeOf.get(pt.i)] ?? types[0];
        loads.push({ a: pt.t0, b: pt.t1, wa: CONC * t.b * t.h, wb: CONC * t.b * t.h, g: "DL", from: "self" });
      }
      for (const o of resting) for (const c of o.carriers.filter((c) => c.host === ln.id)) {
        const R = done.get(o.id)?.reaction?.(c.t) ?? 0;
        if (R > 0) { loads.push({ at: c.at, P: R, g: "SP" }); pts.push({ at: c.at, P: R, from: `แนว ${o.id + 1}` }); }
      }
      for (const e of ln.extra ?? []) { loads.push({ at: e.at, P: e.P, g: "SP" }); pts.push(e); }
      // nodes: ends, member joints, supports, point loads
      const sx = [...ln.cols.map((c) => c.t), ...ln.carriers.map((c) => c.t)];
      const x = [...new Set([0, ln.L, ...sx, ...ln.parts.flatMap((p) => [p.t0, p.t1])].map((v) => +v.toFixed(4)))].sort((a, b) => a - b);
      const sup = x.map((v) => sx.some((s) => Math.abs(s - v) < 1e-3));
      // EI = Ec · 0.5 Ig (cracked section, for deflections; the reactions only depend on the ratios)
      const Ec = EcOf(mat), EI = x.slice(1).map((v, k) => { const m = (v + x[k]) / 2, pt = ln.parts.find((p) => m >= p.t0 - 1e-6 && m <= p.t1 + 1e-6), t = types[typeOf.get(pt?.i)] ?? types[0]; return (Ec * 0.5 * t.b * t.h ** 3) / 12; });
      const res = solveBeam({ x, sup, EI, loads });
      ln.beamIn = { x, sup, EI, loads }; // kept for the PyNite differential test (cli/frame3d-export.mjs)
      if (res.error) {
        if (last) warnings.push(`แนวคาน ${ln.id + 1}: ${res.error} — วางเสาหรือให้ปลายคานวางบนคานอื่น`);
        done.set(ln.id, { reaction: () => 0 }); Object.assign(ln, { error: res.error, res: null, loads, pts }); continue;
      }
      const Rat = (t) => { const k = x.findIndex((v) => Math.abs(v - t) < 1e-3); return k >= 0 ? res.R[k] : 0; };
      done.set(ln.id, { reaction: Rat });
      // column loads: the larger of the continuous-beam reaction and the simple-span (tributary) reaction, so that a support
      // lifted by a long neighbouring span (pinned model, no frame action) never takes load away from its column
      const sk = sup.map((v, k) => (v ? k : -1)).filter((k) => k >= 0), Rs = new Array(x.length).fill(0);
      for (let k = 0; k + 1 < sk.length; k++) {
        const lo = k === 0 ? 0 : sk[k], hi = k === sk.length - 2 ? x.length - 1 : sk[k + 1], last = k === sk.length - 2;
        const segLoads = loads.filter((l) => l.P === undefined || last || l.at < x[sk[k + 1]] - 1e-6);
        const r = solveBeam({ x: x.slice(lo, hi + 1), sup: x.slice(lo, hi + 1).map((_, j) => lo + j === sk[k] || lo + j === sk[k + 1]), EI: EI.slice(lo, hi), loads: segLoads });
        if (!r.error) r.R.forEach((v, j) => (Rs[lo + j] += v));
      }
      const RsAt = (t) => { const k = x.findIndex((v) => Math.abs(v - t) < 1e-3); return k >= 0 ? Rs[k] : 0; };
      Object.assign(ln, { res, x, sup, loads, pts, error: null });
      // spans between supports (cantilevers past the end supports)
      const si = sup.map((s, k) => (s ? k : -1)).filter((k) => k >= 0), cut = [...new Set([0, ...si, x.length - 1])].sort((a, b) => a - b);
      // live-load patterns: the dead part once plus the live load of each span on its own → max / min envelopes by superposition
      const isLL = (l) => l.g === "LL", dead = solveBeam({ x, sup, EI, loads: loads.filter((l) => !isLL(l)) });
      const liveBy = cut.slice(1).map((i1, k) => {
        const x0 = x[cut[k]], x1 = x[i1], last = k === cut.length - 2;
        const part = loads.filter(isLL).flatMap((l) => {
          if (l.P !== undefined) return l.at >= x0 - 1e-9 && (l.at < x1 - 1e-9 || last) ? [l] : [];
          const a = Math.max(l.a, x0), b = Math.min(l.b, x1), w = (t) => l.wa + ((l.wb - l.wa) * (t - l.a)) / (l.b - l.a || 1);
          return b - a > 1e-9 ? [{ a, b, wa: w(a), wb: w(b), g: "LL" }] : [];
        });
        return part.length ? solveBeam({ x, sup, EI, loads: part }) : null;
      }).filter((r) => r && !r.error);
      const env = res.el.map((el, e) => {
        const pts = Array.from({ length: 41 }, (_, i) => (el.L * i) / 40), Md = pts.map(dead.el[e].M), Vd = pts.flatMap((t) => [dead.el[e].V(t), dead.el[e].V(Math.min(el.L, t + 1e-6))]);
        const Ms = liveBy.map((r) => pts.map(r.el[e].M)), Vs = liveBy.map((r) => pts.flatMap((t) => [r.el[e].V(t), r.el[e].V(Math.min(el.L, t + 1e-6))]));
        const up = (base, list, f) => base.map((v, i) => v + list.reduce((t, l) => t + f(0, l[i]), 0));
        const Mmax = up(Md, Ms, Math.max), Mmin = up(Md, Ms, Math.min), Vmax = up(Vd, Vs, Math.max), Vmin = up(Vd, Vs, Math.min);
        const Vabs = pts.flatMap((t, i) => [[x[e] + t, Math.max(Math.abs(Vmax[2 * i]), Math.abs(Vmin[2 * i]))], [x[e] + t, Math.max(Math.abs(Vmax[2 * i + 1]), Math.abs(Vmin[2 * i + 1]))]]);
        return { Mmax: Math.max(0, ...Mmax), Mmin: Math.min(0, ...Mmin), ML: Math.min(Mmin[0], 0), MR: Math.min(Mmin[40], 0), Vmax: Math.max(...Vmax.map(Math.abs), ...Vmin.map(Math.abs)),
          curve: { x0: x[e], L: el.L, Mmax, Mmin }, Vabs }; // 41 points along the element, for the report diagrams; |V| envelope with x on the line
      });
      const Renv = x.map((_, k) => dead.R[k] + liveBy.reduce((t, r) => t + Math.max(0, r.R[k]), 0));
      // deflections: dead (sustained, ×3 for creep and shrinkage) and full live load
      const live = solveBeam({ x, sup, EI, loads: loads.filter(isLL) }), dD = dead.error ? [] : elementDeflections(dead, EI), dL = live.error ? [] : elementDeflections(live, EI);
      ln.env = { env, Renv };
      const ReAt = (t) => { const k = x.findIndex((v) => Math.abs(v - t) < 1e-3); return k >= 0 ? Renv[k] : 0; };
      ln.cols.forEach((c) => { const Rc = Rat(c.t), R = Math.max(Rc, RsAt(c.t), ReAt(c.t)); cols[c.ci].R += R; cols[c.ci].from.push({ line: ln.id, R, Rc }); });
      const nIn = si.length - 1;
      for (let k = 0; k + 1 < cut.length; k++) {
        const i0 = cut[k], i1 = cut[k + 1], els = res.el.slice(i0, i1), cant = !sup[i0] || !sup[i1];
        const j = si.indexOf(i0), kind = cant ? "cantilever" : nIn === 1 ? "simple" : j === 0 || j === nIn - 1 ? "one_end" : "both_ends";
        const mid = (x[i0] + x[i1]) / 2, member = ln.parts.find((p) => mid >= p.t0 - 1e-6 && mid <= p.t1 + 1e-6)?.i ?? ln.members[0];
        // every drawn beam lying on this span (a span over a missing column covers two or more drawn beams; all get its type)
        const members = ln.parts.filter((p) => Math.min(p.t1, x[i1]) - Math.max(p.t0, x[i0]) > 1e-6).map((p) => p.i);
        spans.push({ id: `${ln.id + 1}-${spans.filter((s) => s.line === ln.id).length + 1}`, line: ln.id, member, members: members.length ? members : [member], x0: x[i0], x1: x[i1], len: x[i1] - x[i0], kind,
          ...(cant ? { fixedAt: sup[i0] ? "start" : sup[i1] ? "end" : null } : {}),
          a: [ln.A[0] + ln.u[0] * x[i0], ln.A[1] + ln.u[1] * x[i0]], b: [ln.A[0] + ln.u[0] * x[i1], ln.A[1] + ln.u[1] * x[i1]],
          Mpos: Math.max(0, ...env.slice(i0, i1).map((e) => e.Mmax)), Mneg: Math.max(0, -env[i0].ML, -env[i1 - 1].MR, ...(cant ? env.slice(i0, i1).map((e) => -e.Mmin) : [])),
          V: Math.max(...env.slice(i0, i1).map((e) => e.Vmax)),
          // shear at d (checkSpan): |V| envelope along the span, ends standing on a column, point loads on the span (local x, m)
          Vx: env.slice(i0, i1).flatMap((e) => e.Vabs).map(([xg, v]) => [xg - x[i0], v]),
          endCol: [i0, i1].map((i) => sup[i] && ln.cols.some((c) => Math.abs(c.t - x[i]) < 1e-3)),
          Pat: loads.filter((l) => l.P !== undefined && l.at > x[i0] - 1e-6 && l.at < x[i1] + 1e-6).map((l) => l.at - x[i0]),
          defl: (() => { const Le = (cant ? 2 : 1) * (x[i1] - x[i0]), dl = Math.max(0, ...dL.slice(i0, i1)), dt = 3 * Math.max(0, ...dD.slice(i0, i1)) + dl;
            // limits from the design criteria (mat.deflLive / mat.deflTotal, default L/360 and L/240)
            const lL = Le / (mat.deflLive ?? 360), lT = Le / (mat.deflTotal ?? 240);
            return { dL: dl, dT: dt, limL: lL, limT: lT, ok: dl <= lL + 1e-9 && dt <= lT + 1e-9, I: (els[0] && EI[i0]) || 0 }; })(),
          Mt: ln.torsion.reduce((s, q) => s + q.m * Math.max(0, Math.min(q.b, x[i1]) - Math.max(q.a, x[i0])), 0) / (cant ? 1 : 2) });
      }
    }
  }
  if (done.size < lines.length) warnings.push("มีคานวางพาดกันเป็นวง — ตรวจจุดรองรับ");
  return { lines, spans, columns: cols };
}
