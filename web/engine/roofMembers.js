// Design every member group of a framed roof (ASD), auto-selecting the lightest passing section of each group.
import { SECTIONS, findSection } from "./steelSections.js";
import { FY, hip, pointBeam, purlin, rafter, simpleBeam } from "./roofDesign.js";
import { solveBeam } from "./contBeam.js";

export const ROOFINGS = { metal: ["เมทัลชีท", 7], cpac: ["กระเบื้องคอนกรีต", 50], ceramic: ["กระเบื้องเซรามิก", 60], fiber: ["ไฟเบอร์ซีเมนต์ลอนคู่", 17] };

export const DEFAULT_DESIGN = {
  roofing: "metal", battenW: 0.6, minT: 2.3, minSec: "100x50x20x2.3", live: 30, wind: 50, extra: 15, grade: "Fe-24", E: 2100000, sagRows: 1, rodFy: 2400, plateSpan: 4,
  // per group: "auto:<type>" picks the lightest passing section of that type, "<type>:<name>" fixes the section
  pick: { purlin: "auto:C", rafter: "auto:C", hip: "auto:C", ridge: "auto:C", support: "auto:C", plate: "auto:C", post: "auto:C" },
  counts: { hip: 2, ridge: 2, support: 2, plate: 2, post: 2 },
};

// Plan intersections (parameter 0..1 along p→q) of a segment with polygon edges and support lines.
function hits(p, q, segs) {
  const out = [];
  for (const [a, b] of segs) {
    const rx = q[0] - p[0], ry = q[1] - p[1], sx = b[0] - a[0], sy = b[1] - a[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - p[0]) * sy - (a[1] - p[1]) * sx) / den, s = ((a[0] - p[0]) * ry - (a[1] - p[1]) * rx) / den;
    if (t > 1e-6 && t < 1 - 1e-6 && s >= -1e-6 && s <= 1 + 1e-6) out.push(t);
  }
  return out;
}

// wall thickness (mm) is the last figure of the section name, e.g. 100x50x20x2.3
export const thickness = (s) => parseFloat(s.name.split("x").pop());

// Section for one member group: a fixed choice, or the lightest passing section of the type that is at least
// `minT` mm thick and (for C sections, when `useMin`) no smaller than the minimum section in Sx and Ix.
const choose = (pick, run, d, useMin) => {
  const [a, b] = pick.split(":");
  if (a !== "auto") return { ...run(findSection(a, b)), fixed: true };
  const min = useMin && b === "C" ? findSection("C", d.minSec) : null;
  const all = [...SECTIONS[b]].sort((x, y) => x.w - y.w);
  const ok = all.filter((s) => thickness(s) >= (d.minT ?? 0) - 1e-9 && (!min || (s.Sx >= min.Sx - 1e-9 && s.Ix >= min.Ix - 1e-9)));
  // lightest that passes; if none does, the least-utilised one (the heaviest is not always the stiffest)
  const util = (x) => (x.fa !== undefined ? Math.max(x.fa / x.Fa, x.KLr / 200)
    : Math.max(Math.abs((x.fb ?? 0) / (x.Fb ?? 1)), (x.d ?? x.dy ?? 0) / (x.dAllow ?? x.dyAllow ?? 1)));
  let best = null;
  for (const section of ok.length ? ok : all) { const r = run(section); if (r.ok) return r; if (!best || util(r) < util(best)) best = r; }
  return best;
};

// Roof batten for concrete / ceramic tiles: spacing must suit the tile lap (0.30–0.33 m); strength per maker's table.
export const BATTEN_RANGE = [0.3, 0.33];
function batten(s, w) {
  const ok = s >= BATTEN_RANGE[0] - 1e-9 && s <= BATTEN_RANGE[1] + 1e-9;
  return { batten: true, section: { type: "BAT", name: "แปสำเร็จรูป", w }, Mx: 0, fb: 0, Fb: 1, dy: 0, dyAllow: 1, dx: 0, dxAllow: 1, s, ok };
}

// first hit (t > 0) of the ray P + t·u with a set of segments
function rayHit(P, u, segs) {
  let best = Infinity;
  for (const [a, b] of segs) {
    const ex = b[0] - a[0], ey = b[1] - a[1], den = u[0] * ey - u[1] * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((a[0] - P[0]) * ey - (a[1] - P[1]) * ex) / den, s = ((a[0] - P[0]) * u[1] - (a[1] - P[1]) * u[0]) / den;
    if (t > 1e-6 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.min(best, t);
  }
  return best;
}
const r3 = (p) => p.map((v) => +v.toFixed(3));
const sameLine = (o, a, b) => [a, b].every((p) => Math.abs((o.b[0] - o.a[0]) * (p[1] - o.a[1]) - (o.b[1] - o.a[1]) * (p[0] - o.a[0])) < 1e-3)
  && Math.min(Math.hypot(a[0] - o.a[0], a[1] - o.a[1]) + Math.hypot(b[0] - o.b[0], b[1] - o.b[1]), Math.hypot(a[0] - o.b[0], a[1] - o.b[1]) + Math.hypot(b[0] - o.a[0], b[1] - o.a[1])) < 0.05;

// Default interior plates:
// 1) at every inner (re-entrant) wall corner, the wall line continued across the house — the original wall line between
//    wings (e.g. grid B), preferring the extension that lands on another corner, else the shorter one;
// 2) through every ดั้ง, square to its ridge, stopping at the first wall or plate of (1) on each side.
// interior plates to carry posts that stand on nothing (button "เพิ่มอะเสรับ"): through each point along X or Y, whichever is
// shorter, between the nearest plate / wall lines on both sides; duplicates (same line) are dropped. pts: [[x, y]] → [{ a, b }]
export function carrierPlates(roof, g, pts) {
  const segs = [...(roof.plates?.length ? roof.plates.map((l) => [l.a, l.b]) : []), ...(g?.pts ?? []).map((p, i, P) => [p, P[(i + 1) % P.length]]), ...(roof.innerPlates ?? []).map((l) => [l.a, l.b])];
  const hit = (p, d) => segs.reduce((best, [a, b]) => {
    const e = [b[0] - a[0], b[1] - a[1]], den = d[0] * e[1] - d[1] * e[0];
    if (Math.abs(den) < 1e-9) return best;
    const w = [a[0] - p[0], a[1] - p[1]], t = (w[0] * e[1] - w[1] * e[0]) / den, u = (w[0] * d[1] - w[1] * d[0]) / den;
    return t > 0.05 && u >= -1e-6 && u <= 1 + 1e-6 ? Math.min(best, t) : best;
  }, Infinity);
  const out = [], r3 = (v) => +v.toFixed(3);
  for (const p of pts) {
    const opts = [[[1, 0], [-1, 0]], [[0, 1], [0, -1]]].map(([d1, d2]) => { const t1 = hit(p, d1), t2 = hit(p, d2);
      return { L: t1 + t2, a: [r3(p[0] + d2[0] * t2), r3(p[1] + d2[1] * t2)], b: [r3(p[0] + d1[0] * t1), r3(p[1] + d1[1] * t1)] }; }).filter((o) => Number.isFinite(o.L)).sort((x, y) => x.L - y.L);
    const c = opts[0];
    if (c && !out.some((o) => Math.hypot(o.a[0] - c.a[0], o.a[1] - c.a[1]) < 0.02 && Math.hypot(o.b[0] - c.b[0], o.b[1] - c.b[1]) < 0.02)) out.push({ a: c.a, b: c.b });
  }
  return out;
}

export function autoInnerPlates(g, fr) {
  const P = g.pts, n = P.length, walls = P.map((p, i) => [p, P[(i + 1) % n]]), out = [];
  for (let i = 0; i < n; i++) {
    const v = P[i], pv = P[(i - 1 + n) % n], nx = P[(i + 1) % n];
    const din = [v[0] - pv[0], v[1] - pv[1]], dout = [nx[0] - v[0], nx[1] - v[1]];
    if (din[0] * dout[1] - din[1] * dout[0] >= -1e-9) continue; // convex corner (outline is counter-clockwise)
    const cands = [din, [-dout[0], -dout[1]]].map((d) => {
      const L = Math.hypot(...d), u = [d[0] / L, d[1] / L], t = rayHit(v, u, walls), e = [v[0] + u[0] * t, v[1] + u[1] * t];
      return Number.isFinite(t) ? { a: r3(v), b: r3(e), L: t, onCorner: P.some((p) => Math.hypot(p[0] - e[0], p[1] - e[1]) < 0.02) } : null;
    }).filter(Boolean).sort((x, y) => (y.onCorner - x.onCorner) || x.L - y.L);
    const c = cands[0];
    if (c && !out.some((o) => sameLine(o, c.a, c.b))) out.push({ a: c.a, b: c.b });
  }
  const stops = [...walls, ...out.map((o) => [o.a, o.b])], ridges = g.lines.filter((l) => l.type === "ridge");
  for (const pt of fr.posts.filter((p) => p.kind === "ดั้ง")) {
    const Q = [pt.x, pt.y];
    let best = null, bd = Infinity;
    for (const l of ridges) {
      const dx = l.q[0] - l.p[0], dy = l.q[1] - l.p[1], L2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((Q[0] - l.p[0]) * dx + (Q[1] - l.p[1]) * dy) / L2)), d = Math.hypot(l.p[0] + dx * t - Q[0], l.p[1] + dy * t - Q[1]);
      if (d < bd) { bd = d; best = [dx, dy]; }
    }
    if (!best) continue;
    const L = Math.hypot(...best), u = [-best[1] / L, best[0] / L];
    // a post already standing on a plate of (1) needs no cross plate
    if (out.some((o) => {
      const dx = o.b[0] - o.a[0], dy = o.b[1] - o.a[1], L2 = dx * dx + dy * dy, t = ((Q[0] - o.a[0]) * dx + (Q[1] - o.a[1]) * dy) / L2;
      return t > -0.01 && t < 1.01 && Math.abs(dx * (Q[1] - o.a[1]) - dy * (Q[0] - o.a[0])) / Math.sqrt(L2) < 0.05;
    })) continue;
    const hi = rayHit(Q, u, stops), lo = rayHit(Q, [-u[0], -u[1]], stops);
    if (!Number.isFinite(hi) || !Number.isFinite(lo)) continue;
    const a = r3([Q[0] - u[0] * lo, Q[1] - u[1] * lo]), b = r3([Q[0] + u[0] * hi, Q[1] + u[1] * hi]);
    if (!out.some((o) => sameLine(o, a, b))) out.push({ a, b });
  }
  return out;
}
// Simple ASD compression check for a post (AISC 1989 column formula, K = 1).
export function post(p) {
  const s = p.section, Fy = FY[p.grade], r = Math.min(s.rx, s.ry), KLr = (p.L * 100) / r, Cc = Math.sqrt((2 * Math.PI ** 2 * p.E) / Fy);
  const Fa = KLr <= Cc
    ? ((1 - KLr ** 2 / (2 * Cc ** 2)) * Fy) / (5 / 3 + (3 * KLr) / (8 * Cc) - KLr ** 3 / (8 * Cc ** 3))
    : (12 * Math.PI ** 2 * p.E) / (23 * KLr ** 2);
  const fa = p.P / (s.A * (p.count ?? 1));
  return { KLr, Fa, fa, P: p.P, section: s, ok: fa <= Fa && KLr <= 200 };
}

export function designRoof(g, fr, roof, d) {
  const tan = g.tan, cos = 1 / Math.sqrt(1 + tan * tan), roofing = ROOFINGS[d.roofing][1];
  const base = { grade: d.grade, E: d.E }, loads = { roofing, live: d.live, wind: d.wind, extra: d.extra };
  const { rafterSp: D, purlinSp: s } = roof.frame, rows = [];
  const pick = (k, run) => choose(d.pick[k], run, d, k !== "purlin");

  // purlins: span = rafter spacing
  // tile roofs: roll-formed roof battens (แปสำเร็จรูป) chosen from the maker's table, only the spacing is checked here
  const pu = d.pick.purlin === "batten" ? batten(s, d.battenW ?? 0.6) : pick("purlin", (section) => purlin({ ...base, ...loads, section, selfW: section.w, rise: tan, width: 2, s, D, sagRows: d.sagRows, rodFy: d.rodFy }));
  rows.push({ key: "purlin", label: pu.batten ? "แปสำเร็จรูป" : "แป", span: D, r: pu, count: 1, len: fr.totals.purlin });

  // rafters: the longest clear span between supports together with the longest overhang
  const span = Math.max(fr.maxSpan, 0.3), cant = Math.max(fr.maxCant, 0);
  const ra = pick("rafter", (section) => rafter({ ...base, ...loads, section, selfW: section.w, purlinW: pu.section.w,
    rise: (span + cant) * cos * tan, run: span * cos, overhang: cant * cos, D, s }));
  rows.push({ key: "rafter", label: "จันทัน", span: ra.L, r: ra, count: 1, len: fr.totals.rafter });
  const lineLoad = Math.max(0, 2 * ra.Rridge) / D; // load per metre delivered by rafters to their upper end (an uplifting end adds nothing)

  // Members designed span by span: each may carry its own section ("memberPick") and single/double ("memberCount").
  const members = [];
  const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const addMember = (group, pk, ck, id, label, p, q, span, run, extra = {}) => {
    const len = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), types = group === "plate" ? (d.plateTypes ?? []).filter((t) => findSection(...t.pick.split(":"))) : [];
    if (types.length) {
      // wall-plate types (AS1, AS2, …): the span's own type, or the lightest type that passes
      const order = types.map((t) => ({ t, i: d.plateTypes.indexOf(t), sec: findSection(...t.pick.split(":")) })).sort((a, b) => a.sec.w * a.t.count - b.sec.w * b.t.count);
      const want = d.memberType?.[id], fixed = order.find((o) => o.i === want);
      let o = fixed, r;
      if (o) r = run(o.sec, o.t.count);
      else {
        // lightest type that passes; if none passes, the one with the lowest utilisation (not simply the heaviest)
        const util = (x) => Math.max(Math.abs(x.fb / x.Fb), x.d / x.dAllow);
        let best = null;
        for (const c of order) { const rc = run(c.sec, c.t.count); if (rc.ok) { o = c; r = rc; break; } if (!best || util(rc) < util(best.r)) best = { o: c, r: rc }; }
        if (!r) ({ o, r } = best);
      }
      members.push({ id, group, label, p, q, span, count: o.t.count, len, r: { ...r, fixed: true }, own: !!fixed, typeName: o.t.name, typeIdx: o.i, ...extra });
      return;
    }
    const count = d.memberCount?.[id] ?? d.counts[ck], choice = d.memberPick?.[id] ?? d.pick[pk];
    const r = choose(choice, (section) => run(section, count), d, true);
    members.push({ id, group, label, p, q, span, count, len: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), r, own: !!d.memberPick?.[id], ...extra });
  };
  // split a straight line into n equal spans between posts / columns
  const spans = (group, pk, ck, id, label, p, q, maxL, run, nFix) => {
    const L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(nFix ?? Math.ceil(L / maxL - 1e-9)));
    for (let k = 0; k < n; k++) addMember(group, pk, ck, `${id}-${k + 1}`, n > 1 ? `${label} ช่วง ${k + 1}/${n}` : label,
      lerp(p, q, k / n), lerp(p, q, (k + 1) / n), L / n, (section, count) => run(section, count, L / n));
  };

  // hips / valleys: jack rafters shorten linearly → half the ridge line load; each line is a beam with its eave overhang
  const supSegs = fr.supports.map((x) => [x.a, x.b]), wallSegs = g.pts.map((p, i) => [p, g.pts[(i + 1) % g.pts.length]]);
  for (const kind of ["hip", "valley"]) {
    g.lines.filter((l) => l.type === kind).forEach((l, i) => {
      const low = l.p[2] <= l.q[2] ? l.p : l.q, high = low === l.p ? l.q : l.p, plan = Math.hypot(high[0] - low[0], high[1] - low[1]);
      const wallT = hits(low, high, wallSegs)[0] ?? 0, ts = [wallT, ...hits(low, high, supSegs).filter((t) => t > wallT), 1].sort((x, y) => x - y);
      const L = Math.max(...ts.slice(1).map((t, k) => (t - ts[k]) * plan)), a = wallT * plan, rise = (L + a) * ((high[2] - low[2]) / plan);
      addMember(kind, "hip", "hip", `${kind}-${i + 1}`, `${kind === "hip" ? "ตะเข้สัน" : "ตะเข้ราง"} เส้น ${i + 1}`, low, high, L,
        (section, count) => hip({ ...base, section, selfW: section.w, transfer: lineLoad / 2, rise, overhang: a, run: L, count }));
    });
  }

  // ridge: rafters from both sides, spans between posts
  const ridgeRun = (section, count, L) => simpleBeam({ ...base, section, selfW: section.w, transfer: lineLoad, L, count });
  g.lines.filter((l) => l.type === "ridge").forEach((l, i) => {
    if (!roof.dang) return spans("ridge", "ridge", "ridge", `ridge-${i + 1}`, `อกไก่ เส้น ${i + 1}`, l.p, l.q, roof.frame.postSp, ridgeRun);
    // ดั้ง placed by the user: the ridge spans between the ดั้ง standing on it
    const L = Math.hypot(l.q[0] - l.p[0], l.q[1] - l.p[1]);
    const cuts = [0, ...roof.dang.map(([x, y]) => {
      const t = ((x - l.p[0]) * (l.q[0] - l.p[0]) + (y - l.p[1]) * (l.q[1] - l.p[1])) / (L * L);
      const off = Math.abs((x - l.p[0]) * (l.q[1] - l.p[1]) - (y - l.p[1]) * (l.q[0] - l.p[0])) / L;
      return t > 0.01 && t < 0.99 && off < 0.05 ? t : null;
    }).filter((t) => t !== null).sort((a, b) => a - b), 1];
    const P = (t) => l.p.map((v, k) => v + (l.q[k] - v) * t);
    cuts.slice(1).forEach((t, j) => addMember("ridge", "ridge", "ridge", `ridge-${i + 1}-${j + 1}`, cuts.length > 2 ? `อกไก่ เส้น ${i + 1} ช่วง ${j + 1}/${cuts.length - 1}` : `อกไก่ เส้น ${i + 1}`,
      P(cuts[j]), P(t), (t - cuts[j]) * L, (section, count) => ridgeRun(section, count, (t - cuts[j]) * L)));
  });

  // supports (สะพาน): interior rafter reaction ≈ w × span per rafter, spread over the rafter spacing; spans between ตุ๊กตา
  const supWarn = []; // (the warnings list starts further down)
  const supRun = (section, count, L) => simpleBeam({ ...base, section, selfW: section.w, transfer: (ra.w * span) / D, L, count });
  fr.supports.forEach((x, i) => {
    if (!roof.dang) return spans("support", "support", "support", `support-${i + 1}`, `สะพาน S${i + 1}`, [...x.a, x.za], [...x.b, x.zb], roof.frame.postSp, supRun);
    // posts placed by the engineer: the support spans between the ดั้ง / ตุ๊กตา on its line (its ends need one each)
    const a = [...x.a, x.za], b = [...x.b, x.zb], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ts = roof.dang.map(([px, py]) => { const t = ((px - a[0]) * (b[0] - a[0]) + (py - a[1]) * (b[1] - a[1])) / (L * L), off = Math.abs((px - a[0]) * (b[1] - a[1]) - (py - a[1]) * (b[0] - a[0])) / L; return off < 0.05 && t > -0.01 && t < 1.01 ? Math.min(1, Math.max(0, t)) : null; }).filter((t) => t !== null);
    const ends = [ts.some((t) => t < 0.01), ts.some((t) => t > 0.99)];
    if (!ends[0] || !ends[1]) supWarn.push(`สะพาน S${i + 1}: ปลาย${!ends[0] && !ends[1] ? "ทั้งสองข้าง" : !ends[0] ? "ต้น" : "ท้าย"}ไม่มีดั้ง/ตุ๊กตารับ — วางดั้งที่ปลายสะพาน (เครื่องมือ "ดั้ง")`);
    const cuts = [...new Set([0, ...ts.filter((t) => t > 0.01 && t < 0.99), 1])].sort((p, q) => p - q), P = (t) => a.map((v, k) => v + (b[k] - v) * t);
    cuts.slice(1).forEach((t, j) => addMember("support", "support", "support", `support-${i + 1}-${j + 1}`, cuts.length > 2 ? `สะพาน S${i + 1} ช่วง ${j + 1}/${cuts.length - 1}` : `สะพาน S${i + 1}`,
      P(cuts[j]), P(t), (t - cuts[j]) * L, (section, count) => supRun(section, count, (t - cuts[j]) * L)));
  });

  // Plates bearing on plates (user 2026-11-03: "ทั้งคานทั้งอะเส"): every post (ดั้ง / ตุ๊กตา) and every end of an interior plate
  // that lands inside another plate is a point load on that plate; the wall plates (A) are designed with those loads too.
  // Each plate member carries `bear`: the loads it hands down to the structure [{ p: [x, y], P }] (roofLink sums them).
  const warnings = [...supWarn], near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  const postLoad = (pt) => members.reduce((t, x) => t
    + ((x.group === "ridge" || x.group === "support") && (near(x.p, pt) || near(x.q, pt)) ? x.r.R : 0)
    + ((x.group === "hip" || x.group === "valley") && near(x.q, pt) ? Math.max(0, x.r.Rmin) : 0), 0); // an uplifting hip end adds nothing
  const alongSeg = (a, b, pt, tol = 0.15) => { // position (m from a) of a point lying inside segment a-b, else null
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = ((pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1])) / (L * L);
    const off = Math.abs((pt[0] - a[0]) * (b[1] - a[1]) - (pt[1] - a[1]) * (b[0] - a[0])) / L;
    return t > 0.01 && t < 0.99 && off < tol ? t * L : null;
  };
  const cols = roof.columns ?? [];
  // wall-plate spans (A): drawn plates split at the columns on them, or the outline edges
  const platesIn = roof.plates?.length ? roof.plates : (roof.columns?.length ? g.pts.map((a, i) => ({ a, b: g.pts[(i + 1) % g.pts.length] })) : []);
  const aSpans = [];
  if (platesIn.length) {
    platesIn.forEach((ln, i) => {
      const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]);
      if (L < 0.1) return;
      const cuts = [0, ...cols.map((c) => {
        const t = ((c[0] - ln.a[0]) * (ln.b[0] - ln.a[0]) + (c[1] - ln.a[1]) * (ln.b[1] - ln.a[1])) / (L * L);
        const off = Math.abs((c[0] - ln.a[0]) * (ln.b[1] - ln.a[1]) - (c[1] - ln.a[1]) * (ln.b[0] - ln.a[0])) / L;
        return t > 0.01 && t < 0.99 && off < 0.05 ? t : null;
      }).filter((t) => t !== null).sort((x, y) => x - y), 1];
      const P = (t) => [ln.a[0] + (ln.b[0] - ln.a[0]) * t, ln.a[1] + (ln.b[1] - ln.a[1]) * t, g.H];
      // an end piece beyond the last column on a line with columns = cantilever plate (อะเสยื่น) — its free end carries nothing
      const hasCol = (t) => cols.some((c) => Math.hypot(c[0] - (ln.a[0] + (ln.b[0] - ln.a[0]) * t), c[1] - (ln.a[1] + (ln.b[1] - ln.a[1]) * t)) < 0.05);
      const nCol = cuts.filter((t) => hasCol(t)).length;
      cuts.slice(1).forEach((t, j) => {
        const t0 = cuts[j], free = nCol > 0 ? (t0 === 0 && !hasCol(0) ? "p" : t === 1 && !hasCol(1) ? "q" : null) : null;
        aSpans.push({ line: i, id: `plate-${i + 1}-${j + 1}`, label: `${free ? "อะเสยื่น" : "อะเส"} เส้น ${i + 1}${cuts.length > 2 ? ` ช่วง ${j + 1}/${cuts.length - 1}` : ""}`, p: P(t0), q: P(t), L: (t - t0) * L, free, loads: [] });
      });
    });
  } else {
    g.pts.forEach((p, i) => { const q = g.pts[(i + 1) % g.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = Math.max(1, Math.round(d.plateDiv?.[i + 1] ?? Math.ceil(L / d.plateSpan - 1e-9)));
      for (let k = 0; k < n; k++) aSpans.push({ line: i, id: n > 1 ? `plate-${i + 1}-${k + 1}` : `plate-${i + 1}`, label: n > 1 ? `อะเส ขอบ ${i + 1} ช่วง ${k + 1}/${n}` : `อะเส ขอบ ${i + 1}`, p: [...lerp(p, q, k / n), g.H], q: [...lerp(p, q, (k + 1) / n), g.H], L: L / n, free: null, loads: [] }); });
  }
  // interior plates (B): two crossing inside both are not two simple spans side by side — the shorter one (stiffer) is the main
  // plate, the other is cut at the crossing and rests on it (same rule as the RC beams; ties: the one drawn first)
  const raw = (roof.innerPlates ?? []).map((ln, k) => ({ a: ln.a, b: ln.b, k })).filter((ln) => Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]) >= 0.3);
  const crossings = [];
  for (let changed = true, guard = 0; changed && guard < 200; guard++) {
    changed = false;
    outer: for (let i = 0; i < raw.length; i++) for (let j = i + 1; j < raw.length; j++) {
      const P = raw[i], Q = raw[j], dP = [P.b[0] - P.a[0], P.b[1] - P.a[1]], dQ = [Q.b[0] - Q.a[0], Q.b[1] - Q.a[1]], den = dP[0] * dQ[1] - dP[1] * dQ[0];
      if (Math.abs(den) < 1e-9) continue;
      const w = [Q.a[0] - P.a[0], Q.a[1] - P.a[1]], s1 = (w[0] * dQ[1] - w[1] * dQ[0]) / den, s2 = (w[0] * dP[1] - w[1] * dP[0]) / den, LP = Math.hypot(...dP), LQ = Math.hypot(...dQ);
      if (s1 * LP < 0.05 || s1 * LP > LP - 0.05 || s2 * LQ < 0.05 || s2 * LQ > LQ - 0.05) continue;
      const J = [P.a[0] + dP[0] * s1, P.a[1] + dP[1] * s1];
      if (cols.some((c) => near(c, J))) continue;
      const sec = LQ < LP - 1e-6 ? P : Q, si = sec === P ? i : j, main = sec === P ? Q : P;
      crossings.push({ p: J, main: main.k, sec: sec.k });
      raw.splice(si, 1, { a: sec.a, b: J, k: sec.k, piece: 1 }, { a: J, b: sec.b, k: sec.k, piece: 2 });
      changed = true; break outer;
    }
  }
  const nPieces = {}; raw.forEach((r) => { nPieces[r.k] = (nPieces[r.k] ?? 0) + 1; });
  const lines = raw.map((r) => ({ ...r, id: nPieces[r.k] > 1 ? `inner-${r.k + 1}-${r.piece}` : `inner-${r.k + 1}`, tag: nPieces[r.k] > 1 ? `B${r.k + 1}${r.piece === 1 ? "a" : "b"}` : `B${r.k + 1}`, L: Math.hypot(r.b[0] - r.a[0], r.b[1] - r.a[1]) }));
  for (const c of crossings) warnings.push(`อะเสช่วงใน B${c.main + 1} กับ B${c.sec + 1} ตัดกันที่ (${c.p[0].toFixed(2)}, ${c.p[1].toFixed(2)}) ไม่มีเสา — คิด B${c.sec + 1} (ช่วงยาวกว่า) วางบน B${c.main + 1}`);
  // posts with their loads, each on the first plate found under it: interior plate → wall-plate span → column / wall line
  const posts = fr.posts.filter((pt) => pt.kind === "ดั้ง" || pt.kind === "ตุ๊กตา").map((pt) => ({ ...pt, pp: [pt.x, pt.y], P: postLoad([pt.x, pt.y]) }));
  for (const po of posts) {
    const li = lines.findIndex((ln) => alongSeg(ln.a, ln.b, po.pp) !== null);
    if (li >= 0) { po.on = { inner: li, a: alongSeg(lines[li].a, lines[li].b, po.pp) }; continue; }
    const ai = aSpans.findIndex((sp) => alongSeg(sp.p, sp.q, po.pp, 0.05) !== null);
    if (ai >= 0) { po.on = { wall: ai, a: alongSeg(aSpans[ai].p, aSpans[ai].q, po.pp, 0.05) }; continue; }
    if (cols.some((c) => near(c, po.pp))) { po.on = { column: true }; continue; }
    const onLine = (a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = ((po.x - a[0]) * (b[0] - a[0]) + (po.y - a[1]) * (b[1] - a[1])) / (L * L);
      return t > -0.01 && t < 1.01 && Math.abs((po.x - a[0]) * (b[1] - a[1]) - (po.y - a[1]) * (b[0] - a[0])) / L < 0.05; };
    if (aSpans.some((sp) => onLine(sp.p, sp.q)) || g.pts.some((a, i) => onLine(a, g.pts[(i + 1) % g.pts.length]))) { po.on = { wallLine: true }; continue; }
    po.on = null;
  }
  // interior plates, the ones resting on others first; ends inside another interior plate are point loads on it
  const done = new Map();
  for (let pass = 0; pass < lines.length + 1 && done.size < lines.length; pass++) {
    lines.forEach((ln, k) => {
      if (done.has(k)) return;
      const resting = lines.map((o, j) => j !== k && [o.a, o.b].some((e) => alongSeg(ln.a, ln.b, e) !== null) ? j : null).filter((j) => j !== null);
      if (resting.some((j) => !done.has(j)) && pass < lines.length) return; // wait for the plates that bear on this one
      const loads = [
        ...posts.filter((po) => po.on?.inner === k && po.P > 0).map((po) => ({ P: po.P, a: po.on.a, from: po.kind })),
        ...resting.filter((j) => done.has(j)).flatMap((j) => { const o = lines[j], r = done.get(j).r;
          return [[o.a, r.Rl], [o.b, r.Rr]].map(([e, R]) => { const a = alongSeg(ln.a, ln.b, e); return a === null ? null : { P: Math.max(0, R), a, from: o.tag }; }); }),
      ].filter(Boolean);
      addMember("plate", "plate", "plate", ln.id, `อะเสช่วงใน ${ln.tag}`, [...ln.a, g.H], [...ln.b, g.H], ln.L,
        (section, count) => pointBeam({ ...base, section, selfW: section.w, loads, L: ln.L, count }));
      const mem = members.pop();
      Object.assign(mem, { tag: ln.tag, inner: true, loads, k: ln.k });
      done.set(k, mem);
    });
  }
  const inner = lines.map((_, k) => done.get(k)).filter(Boolean);
  // where an interior-plate end goes: another interior plate (already a load on it), a wall-plate span (point load on it), else down
  const endHost = (e, self) => {
    if (lines.some((o, j) => done.get(j) !== self && alongSeg(o.a, o.b, e) !== null)) return { inner: true };
    const ai = aSpans.findIndex((sp) => alongSeg(sp.p, sp.q, e, 0.05) !== null);
    return ai >= 0 ? { wall: ai, a: alongSeg(aSpans[ai].p, aSpans[ai].q, e, 0.05) } : null;
  };
  for (const m of inner) {
    m.bear = [];
    for (const [e, R] of [[m.p, m.r.Rl], [m.q, m.r.Rr]]) {
      const h = endHost(e, m);
      if (h?.wall !== undefined) aSpans[h.wall].loads.push({ P: Math.max(0, R), a: h.a, from: m.tag });
      else if (!h) m.bear.push({ p: [e[0], e[1]], P: Math.max(0, R) });
    }
  }
  for (const po of posts) if (po.on?.wall !== undefined && po.P > 0) aSpans[po.on.wall].loads.push({ P: po.P, a: po.on.a, from: po.kind });

  // wall plate (อะเส): rafter reaction at the wall (uniform) + point loads from posts / interior plates standing on the span.
  // d.plateSupport: "span" (default) simple span between columns · "cont" continuous over the columns (M × 0.8, deflection × 0.53,
  // applied to the whole span result — an approximation) · "beam" on an RC ring beam all along: the plate only spans between
  // anchor bolts d.plateAnchor (m, default 1.0); its load and the point loads go straight down into the RC beam.
  // d.plateDefl: deflection limit L/360 (default) or L/240 (roof without a hung ceiling); stress check unchanged (Fb = 0.6Fy)
  const plateRun = (section, count, L, pl = []) => {
    const mode = d.plateSupport ?? "cont", Ld = mode === "beam" ? Math.min(L, d.plateAnchor ?? 1.0) : L, onBeam = mode === "beam";
    const r = !onBeam && pl.length ? pointBeam({ ...base, section, selfW: section.w, transfer: ra.Rwall / D, L: Ld, count, loads: pl })
      : simpleBeam({ ...base, section, selfW: section.w, transfer: ra.Rwall / D, L: Ld, count });
    const km = 1, kd = 1, lim = d.plateDefl === 240 ? 240 : 360; // "cont" lines are solved as continuous beams (contRun); a lone span stays simple
    const fb = r.fb * km, dd = r.d * kd, dAllow = (Ld * 100) / lim;
    return { ...r, Mx: r.Mx * km, SxReq: r.SxReq * km, fb, d: dd, dAllow, Ld, mode, Rl: r.Rl ?? r.R, Rr: r.Rr ?? r.R, ok: fb <= r.Fb && dd <= dAllow };
  };
  // cantilever plate (อะเสยื่น, fixed at its column): UDL M ×4 / δ ×9.6 of the simple span; point loads P at x from the column add
  // P·x to the moment and P·x²(3L − x)/(6EI) to the tip deflection
  const cantRun = (section, count, L, pl = [], fixedAt = "p") => {
    const r = plateRun(section, count, L), EI = d.E * section.Ix * count, xs = pl.map((l) => ({ P: l.P, x: fixedAt === "p" ? l.a : L - l.a }));
    const Mx = r.Mx * 4 + xs.reduce((t, l) => t + l.P * l.x, 0), fb = (r.fb * Mx) / (r.Mx || 1), dd = r.d * 9.6 + xs.reduce((t, l) => t + (l.P * (l.x * 100) ** 2 * (3 * L * 100 - l.x * 100)) / (6 * EI), 0), dAllow = r.dAllow * 2;
    return { ...r, Mx, SxReq: (r.SxReq * Mx) / (r.Mx || 1), fb, d: dd, dAllow, R: r.w * (r.Ld ?? L) + xs.reduce((t, l) => t + l.P, 0), cant: true, ok: fb <= r.Fb && dd <= dAllow };
  };
  // "cont" (default, user 2026-11-04): each wall-plate line (one drawn plate / outline edge) is a real continuous beam over its columns,
  // solved with contBeam (as the RC beams): rafter load w + point loads (posts, interior plates) and, by superposition, a unit UDL for
  // the plate's own weight (w × section weight). Uniform EI along the line (the moments depend on the EI ratios only; exact when one
  // section is used). Each span is checked with its own M+ (mid) / M− (over the columns), the true deflection (L/360 or L/240,
  // cantilever end 2L) and gives its end shears as the loads on the columns. Lines with fewer than 2 supports fall back to plateRun.
  const lim = d.plateDefl === 240 ? 240 : 360, wR = ra.Rwall / D;
  const prof = (res) => res.el.map((el) => { // deflection along each element ×EI (EI = 1 in the solve): v'' = −M, matched to the node values
    const n = 40, h = el.L / n, I1 = [0], I2 = [0];
    for (let i = 1; i <= n; i++) { const k0 = -el.M((i - 1) * h), k1 = -el.M(i * h); I1.push(I1[i - 1] + ((k0 + k1) / 2) * h); I2.push(I2[i - 1] + ((I1[i - 1] + I1[i]) / 2) * h); }
    const [d0, d1] = el.d, c1 = (d1 - d0 - I2[n]) / el.L;
    return { M: Array.from({ length: n + 1 }, (_, i) => el.M(i * h)), v: I2.map((v, i) => v + d0 + c1 * i * h), V0: el.V(0), V1: el.V(el.L - 1e-9) };
  });
  const contLines = new Map();
  if ((d.plateSupport ?? "cont") === "cont") {
    // lines = chains of collinear spans sharing an end (plates drawn column to column are one continuous plate)
    const par = aSpans.map((_, k) => k), root = (k) => (par[k] === k ? k : (par[k] = root(par[k])));
    const dir = (sp) => { const L = Math.hypot(sp.q[0] - sp.p[0], sp.q[1] - sp.p[1]); return [(sp.q[0] - sp.p[0]) / L, (sp.q[1] - sp.p[1]) / L]; };
    const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02;
    aSpans.forEach((a, i) => aSpans.forEach((b, j) => {
      if (j <= i) return;
      const u = dir(a), v = dir(b);
      if (Math.abs(u[0] * v[1] - u[1] * v[0]) > 1e-3) return;
      if ([[a.p, b.p], [a.p, b.q], [a.q, b.p], [a.q, b.q]].some(([x, y]) => same(x, y))) par[root(j)] = root(i);
    }));
    const byLine = new Map(); aSpans.forEach((sp, k) => { const r = root(k); if (!byLine.has(r)) byLine.set(r, []); byLine.get(r).push(k); });
    for (const [line, ks0] of byLine) {
      // order along the line; spans drawn the other way round are flipped (their point loads a measured from p)
      const u = dir(aSpans[ks0[0]]), o = aSpans[ks0[0]].p, tt = (pt) => (pt[0] - o[0]) * u[0] + (pt[1] - o[1]) * u[1];
      const ks = [...ks0].sort((a, b) => Math.min(tt(aSpans[a].p), tt(aSpans[a].q)) - Math.min(tt(aSpans[b].p), tt(aSpans[b].q)));
      const flip = ks.map((k) => tt(aSpans[k].q) < tt(aSpans[k].p));
      const sps = ks.map((k) => aSpans[k]), x = [0];
      sps.forEach((sp) => x.push(x[x.length - 1] + sp.L));
      const freeAt = (j, end) => { const f = sps[j].free; return f && (f === (flip[j] ? (end === "start" ? "q" : "p") : (end === "start" ? "p" : "q"))); };
      const sup = x.map((_, i) => !((i === 0 && freeAt(0, "start")) || (i === x.length - 1 && freeAt(sps.length - 1, "end"))));
      if (sup.filter(Boolean).length < 2 || sps.length < 2) continue;
      const pts = sps.flatMap((sp, j) => sp.loads.filter((l) => l.P > 0).map((l) => ({ at: x[j] + (flip[j] ? sp.L - l.a : l.a), P: l.P, from: l.from })));
      const L = x[x.length - 1], lo = solveBeam({ x, sup, loads: [{ a: 0, b: L, wa: wR, wb: wR }, ...pts] }), un = solveBeam({ x, sup, loads: [{ a: 0, b: L, wa: 1, wb: 1 }] });
      if (lo.error || un.error) continue;
      const line0 = { x, sup, pts, w: wR, label: sps[0].label.replace(/ ช่วง .*$/, ""), lo: prof(lo), un: prof(un) };
      ks.forEach((k, j) => contLines.set(k, { ...line0, ks, j, flip: flip[j] }));
    }
  }
  const contRun = (cl, section, count) => {
    const j = cl.j, sw = section.w * count, a = cl.lo[j], u = cl.un[j], Ls = cl.x[j + 1] - cl.x[j], cant = !cl.sup[j] || !cl.sup[j + 1];
    const s0 = simpleBeam({ ...base, section, selfW: section.w, transfer: cl.w, L: Ls, count }); // Fb and the section as the frozen sheet gives them
    const Ms = a.M.map((m, i) => m + sw * u.M[i]), Mpos = Math.max(0, ...Ms), Mneg = Math.max(0, ...Ms.map((m) => -m)), Mx = Math.max(Mpos, Mneg);
    const EI = (d.E * s0.section.Ix * count) / 1e4, dd = (Math.max(...a.v.map((v, i) => Math.abs(v + sw * u.v[i]))) / EI) * 100;
    const dAllow = ((cant ? 2 : 1) * Ls * 100) / lim, fb = (Mx * 100) / (count * s0.section.Sx);
    const R0 = a.V0 + sw * u.V0, R1 = -(a.V1 + sw * u.V1), [Rl, Rr] = cl.flip ? [R1, R0] : [R0, R1]; // Rl at the span's p, Rr at its q
    return { ...s0, w: cl.w + sw, Mx, Mpos, Mneg, SxReq: (Mx * 100) / s0.Fb, fb, d: dd, dAllow, Ld: Ls, mode: "cont", Rl, Rr, R: cant ? (cl.sup[j] ? R0 : R1) : Math.max(Rl, Rr),
      cont: true, cant, fixedEnd: cant ? ((cl.sup[j] !== cl.flip) ? "p" : "q") : null, P: cl.pts.filter((p) => p.at > cl.x[j] - 1e-6 && p.at < cl.x[j + 1] + 1e-6).reduce((t, p) => t + p.P, 0), ok: fb <= s0.Fb && dd <= dAllow };
  };
  for (const [k, sp] of aSpans.entries()) {
    const pl = sp.loads.filter((l) => l.P > 0), cl = contLines.get(k);
    addMember("plate", "plate", "plate", sp.id, sp.label, sp.p, sp.q, sp.L,
      (section, count) => (cl ? contRun(cl, section, count) : sp.free ? cantRun(section, count, sp.L, pl, sp.free === "p" ? "q" : "p") : plateRun(section, count, sp.L, pl)), { ...(sp.free ? { free: sp.free } : {}), loads: pl, ...(cl ? { contLine: sp.line } : {}) });
    const m = members[members.length - 1], mode = d.plateSupport ?? "cont";
    if (mode === "beam" && !sp.free) { // straight down along the RC beam: the plate load at the anchors + each point load where it stands
      const n = Math.max(1, Math.round(sp.L / (d.plateAnchor ?? 1.0))), W = m.r.w * sp.L;
      m.bear = Array.from({ length: n + 1 }, (_, i) => ({ p: lerp(sp.p, sp.q, i / n).slice(0, 2), P: (W / n) * (i === 0 || i === n ? 0.5 : 1) }))
        .concat(pl.map((l) => ({ p: lerp(sp.p, sp.q, l.a / sp.L).slice(0, 2), P: l.P })));
    } else if (m.r.cont) m.bear = m.r.cant ? [{ p: (m.r.fixedEnd === "p" ? sp.p : sp.q).slice(0, 2), P: m.r.R }] : [{ p: sp.p.slice(0, 2), P: m.r.Rl }, { p: sp.q.slice(0, 2), P: m.r.Rr }];
    else if (sp.free) m.bear = [{ p: (sp.free === "p" ? sp.q : sp.p).slice(0, 2), P: m.r.R }];
    else m.bear = [{ p: sp.p.slice(0, 2), P: m.r.Rl ?? m.r.R }, { p: sp.q.slice(0, 2), P: m.r.Rr ?? m.r.R }];
  }
  members.filter((x) => x.group === "plate" && !x.inner).forEach((x, k) => { x.tag = `A${k + 1}`; x.edge = Number(x.id.split("-")[1]); });
  members.push(...inner); // interior plates listed after the wall plates (B1, B2, …)

  // posts with nothing under them: their load goes straight down where they stand (roofLink → column / beam) — say so
  const loose = [];
  const bearLoose = [];
  const lost = [];
  for (const po of posts) {
    if (po.on?.column || po.on?.wallLine) { if (po.P > 0) bearLoose.push({ p: po.pp, P: po.P, kind: po.kind, under: po.on.column ? "column" : "wall" }); continue; }
    if (po.on) continue;
    loose.push(po.pp);
    if (po.P > 0) bearLoose.push({ p: po.pp, P: po.P, kind: po.kind, under: null });
    lost.push(po);
  }
  // one line per post when there are few, else one summary line (the plan marks every post in red)
  if (lost.length <= 3) for (const po of lost) {
    const ends = lines.filter((ln) => near(ln.a, po.pp) || near(ln.b, po.pp)).map((ln) => ln.tag);
    warnings.push(`${po.kind}ที่ (${po.x.toFixed(2)}, ${po.y.toFixed(2)}) ไม่มีอะเสรับ (${Math.round(po.P)} กก. ลงโครงสร้างตรงจุดนั้น)${ends.length ? ` — อยู่ที่ปลาย ${ends.join(", ")} ซึ่งไม่มีอะไรรองรับรอยต่อ ให้วาดอะเสรับยาวต่อเนื่องผ่านจุดนี้` : " — กด \"เพิ่มอะเสรับ\" หรือวาดอะเสรับผ่านจุดนี้"}`);
  } else {
    const by = (k) => lost.filter((po) => po.kind === k);
    warnings.push(`${["ดั้ง", "ตุ๊กตา"].filter((k) => by(k).length).map((k) => `${k} ${by(k).length} ต้น`).join(" · ")} ไม่มีอะเสรับ (รวม ${Math.round(lost.reduce((t, po) => t + po.P, 0)).toLocaleString()} กก. ลงโครงสร้างตรงจุดที่ยืน — จุดสีแดงบนแปลน) — กด "เพิ่มอะเสรับ" หรือวาดอะเสรับผ่านจุดเหล่านั้น`);
  }


  const ratio = (key, r) => ({
    stress: key === "post" ? r.fa / r.Fa : r.fb / r.Fb,
    defl: key === "post" ? r.KLr / 200 : r.dyAllow ? Math.max(r.dy / r.dyAllow, r.dx / r.dxAllow) : r.d / r.dAllow,
  });
  for (const x of members) Object.assign(x, ratio(x.group, x.r), { weight: x.r.section.w * x.count * x.len });
  // one summary row per group: the governing span, total length and weight
  const LABEL = { hip: "ตะเข้สัน", valley: "ตะเข้ราง", ridge: "อกไก่", support: "สะพานรับจันทัน", plate: "อะเส" };
  for (const key of ["hip", "valley", "ridge", "support", "plate"]) {
    const list = members.filter((x) => x.group === key);
    if (!list.length) continue;
    const gov = list.reduce((a, x) => (Math.max(x.stress, x.defl) > Math.max(a.stress, a.defl) ? x : a));
    rows.push({ key, label: LABEL[key], span: gov.span, r: gov.r, count: gov.count, len: list.reduce((a, x) => a + x.len, 0),
      members: list, weight: list.reduce((a, x) => a + x.weight, 0), ok: list.every((x) => x.r.ok), mixed: new Set(list.map((x) => `${x.count}${x.r.section.name}`)).size > 1 });
  }

  // posts: the tallest post with the largest beam reaction above it
  if (fr.posts.length) {
    const Pmax = Math.max(...members.filter((x) => x.group === "ridge" || x.group === "support").map((x) => 2 * x.r.R), 0);
    const L = Math.max(...fr.posts.map((p) => p.len));
    const po = pick("post", (section) => post({ ...base, section, P: Pmax, L, count: d.counts.post }));
    rows.push({ key: "post", label: "ดั้ง / ตุ๊กตา", span: L, r: po, count: d.counts.post, len: fr.totals.post });
  }

  for (const x of rows) {
    Object.assign(x, ratio(x.key, x.r));
    x.weight ??= x.r.section.w * x.count * (x.len ?? 0);
    x.ok ??= x.r.ok;
  }
  // continuous wall-plate lines for the report diagrams: rafter load + each span's own weight (its chosen section) + point loads
  const plateLines = [];
  for (const [k, cl] of contLines) {
    if (cl.j !== 0) continue;
    const ms = cl.ks.map((kk) => members.find((m) => m.id === aSpans[kk].id));
    plateLines.push({ label: cl.label, tags: ms.map((m) => m?.tag), x: cl.x, sup: cl.sup,
      loads: [...ms.map((m, j) => ({ a: cl.x[j], b: cl.x[j + 1], wa: m?.r.w ?? cl.w, wb: m?.r.w ?? cl.w })), ...cl.pts.map((p) => ({ at: p.at, P: p.P }))] });
  }
  return { rows, members, warnings, loose, bearLoose, plateLines, weight: rows.reduce((a, x) => a + x.weight, 0), ok: rows.every((x) => x.ok) };
}