// Design every member group of a framed roof (ASD), auto-selecting the lightest passing section of each group.
import { SECTIONS, findSection } from "./steelSections.js";
import { FY, hip, pointBeam, purlin, rafter, simpleBeam } from "./roofDesign.js";

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
  const lineLoad = (2 * ra.Rridge) / D; // load per metre delivered by rafters to the member at their upper end

  // Members designed span by span: each may carry its own section ("memberPick") and single/double ("memberCount").
  const members = [];
  const lerp = (p, q, t) => p.map((v, i) => v + (q[i] - v) * t);
  const addMember = (group, pk, ck, id, label, p, q, span, run) => {
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
      members.push({ id, group, label, p, q, span, count: o.t.count, len, r: { ...r, fixed: true }, own: !!fixed, typeName: o.t.name, typeIdx: o.i });
      return;
    }
    const count = d.memberCount?.[id] ?? d.counts[ck], choice = d.memberPick?.[id] ?? d.pick[pk];
    const r = choose(choice, (section) => run(section, count), d, true);
    members.push({ id, group, label, p, q, span, count, len: Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]), r, own: !!d.memberPick?.[id] });
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
  fr.supports.forEach((x, i) => spans("support", "support", "support", `support-${i + 1}`, `สะพาน S${i + 1}`, [...x.a, x.za], [...x.b, x.zb], roof.frame.postSp,
    (section, count, L) => simpleBeam({ ...base, section, selfW: section.w, transfer: (ra.w * span) / D, L, count })));

  // wall plate (อะเส): rafter reaction at the wall, spans between columns along each wall edge
  // (column count per edge from the column spacing, or set per edge in d.plateDiv)
  const plateRun = (section, count, L) => simpleBeam({ ...base, section, selfW: section.w, transfer: ra.Rwall / D, L, count });
  if (roof.plates?.length) {
    // plates drawn by the user: each line is split into spans at the drawn columns lying on it
    const cols = roof.columns ?? [];
    roof.plates.forEach((ln, i) => {
      const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]);
      if (L < 0.1) return;
      const cuts = [0, ...cols.map((c) => {
        const t = ((c[0] - ln.a[0]) * (ln.b[0] - ln.a[0]) + (c[1] - ln.a[1]) * (ln.b[1] - ln.a[1])) / (L * L);
        const off = Math.abs((c[0] - ln.a[0]) * (ln.b[1] - ln.a[1]) - (c[1] - ln.a[1]) * (ln.b[0] - ln.a[0])) / L;
        return t > 0.01 && t < 0.99 && off < 0.05 ? t : null;
      }).filter((t) => t !== null).sort((x, y) => x - y), 1];
      const P = (t) => [ln.a[0] + (ln.b[0] - ln.a[0]) * t, ln.a[1] + (ln.b[1] - ln.a[1]) * t, g.H];
      cuts.slice(1).forEach((t, j) => addMember("plate", "plate", "plate", `plate-${i + 1}-${j + 1}`,
        cuts.length > 2 ? `อะเส เส้น ${i + 1} ช่วง ${j + 1}/${cuts.length - 1}` : `อะเส เส้น ${i + 1}`, P(cuts[j]), P(t), (t - cuts[j]) * L,
        (section, count) => plateRun(section, count, (t - cuts[j]) * L)));
    });
  } else {
    g.pts.forEach((p, i) => { const q = g.pts[(i + 1) % g.pts.length];
      spans("plate", "plate", "plate", `plate-${i + 1}`, `อะเส ขอบ ${i + 1}`, [...p, g.H], [...q, g.H], d.plateSpan, plateRun, d.plateDiv?.[i + 1]); });
  }
  members.filter((x) => x.group === "plate").forEach((x, k) => { x.tag = `A${k + 1}`; x.edge = Number(x.id.split("-")[1]); });

  // interior wall plates (อะเสช่วงใน) carrying the ดั้ง: point loads = beam reactions meeting at each post
  const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
  const postLoad = (pt) => members.reduce((t, x) => t
    + ((x.group === "ridge" || x.group === "support") && (near(x.p, pt) || near(x.q, pt)) ? x.r.R : 0)
    + ((x.group === "hip" || x.group === "valley") && near(x.q, pt) ? Math.max(0, x.r.Rmin) : 0), 0); // an uplifting hip end adds nothing
  const lines = (roof.innerPlates ?? []).filter((ln) => Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]) >= 0.3);
  const along = (ln, pt) => { // position (m from a) of a point lying inside the plate, else null
    const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]), t = ((pt[0] - ln.a[0]) * (ln.b[0] - ln.a[0]) + (pt[1] - ln.a[1]) * (ln.b[1] - ln.a[1])) / (L * L);
    const off = Math.abs((pt[0] - ln.a[0]) * (ln.b[1] - ln.a[1]) - (pt[1] - ln.a[1]) * (ln.b[0] - ln.a[0])) / L;
    return t > 0.01 && t < 0.99 && off < 0.15 ? t * L : null;
  };
  const done = new Map();
  for (let pass = 0; pass < lines.length + 1 && done.size < lines.length; pass++) {
    lines.forEach((ln, k) => {
      if (done.has(k)) return;
      const resting = lines.map((o, j) => j !== k && [o.a, o.b].some((e) => along(ln, e) !== null) ? j : null).filter((j) => j !== null);
      if (resting.some((j) => !done.has(j)) && pass < lines.length) return; // wait for the plates that bear on this one
      const L = Math.hypot(ln.b[0] - ln.a[0], ln.b[1] - ln.a[1]);
      const loads = [
        ...fr.posts.filter((pt) => pt.kind === "ดั้ง" || pt.kind === "ตุ๊กตา").map((pt) => { const a = along(ln, [pt.x, pt.y]); return a === null ? null : { P: postLoad([pt.x, pt.y]), a, from: pt.kind }; }),
        ...resting.filter((j) => done.has(j)).flatMap((j) => { const o = lines[j], r = done.get(j).r;
          return [[o.a, r.Rl], [o.b, r.Rr]].map(([e, R]) => { const a = along(ln, e); return a === null ? null : { P: Math.max(0, R), a, from: `B${j + 1}` }; }); }),
      ].filter(Boolean);
      addMember("plate", "plate", "plate", `inner-${k + 1}`, `อะเสช่วงใน B${k + 1}`, [...ln.a, g.H], [...ln.b, g.H], L,
        (section, count) => pointBeam({ ...base, section, selfW: section.w, loads, L, count }));
      const mem = members[members.length - 1];
      Object.assign(mem, { tag: `B${k + 1}`, inner: true, loads });
      done.set(k, mem);
    });
  }
  // ดั้ง that no interior plate carries and that do not stand on a wall line: their load would be lost — report them
  const warnings = [], loose = [];
  const onLine = (pt, a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = ((pt[0] - a[0]) * (b[0] - a[0]) + (pt[1] - a[1]) * (b[1] - a[1])) / (L * L);
    return t > -0.01 && t < 1.01 && Math.abs((pt[0] - a[0]) * (b[1] - a[1]) - (pt[1] - a[1]) * (b[0] - a[0])) / L < 0.15; };
  for (const pt of fr.posts.filter((p) => p.kind === "ดั้ง")) {
    const P = [pt.x, pt.y];
    if (lines.some((ln) => along(ln, P) !== null)) continue;
    if (g.pts.some((a, i) => onLine(P, a, g.pts[(i + 1) % g.pts.length]))) continue;
    const ends = lines.map((ln, j) => (near(ln.a, P) || near(ln.b, P) ? `B${j + 1}` : null)).filter(Boolean);
    loose.push(P);
    warnings.push(`ดั้งที่ (${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}) ไม่มีอะเสรับ${ends.length ? ` — อยู่ที่ปลาย ${ends.join(", ")} ซึ่งไม่มีอะไรรองรับรอยต่อ ให้วาดอะเสรับดั้งยาวต่อเนื่องผ่านดั้ง` : " — วาดอะเสรับดั้งผ่านตำแหน่งนี้"}`);
  }
  // keep B1, B2, … in order in the member list
  const innerSorted = members.filter((x) => x.inner).sort((x, y) => +x.tag.slice(1) - +y.tag.slice(1));
  members.splice(members.length - innerSorted.length, innerSorted.length, ...innerSorted);

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
  return { rows, members, warnings, loose, weight: rows.reduce((a, x) => a + x.weight, 0), ok: rows.every((x) => x.ok) };
}