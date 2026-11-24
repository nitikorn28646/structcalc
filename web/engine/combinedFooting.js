// Combined footing for two columns whose spread footings cannot be separated (user 2026-11-24, after "ทำไมฐานรากยังซ้อนกัน": the pairs a
// rectangle cannot clear → "ฐานรากร่วม"). One rectangular footing on soil under both columns, WSD like the diff-tested spread footing
// (same allowable stresses: fc = 0.45 f′c ≤ 65 ksc, fs = allowableFs, n = Es/Ec, k, j; one-way shear 0.29√f′c, punching 0.53√f′c on the
// full load (conventional, as engine/footingExtra.js), bearing 0.25 f′c). Checks outside the Excel sheets (not diff-tested) — ACI 318-11
// as the base of ว.ส.ท., clause numbers UNVERIFIED against the ว.ส.ท. text:
//   plan: centred on the resultant of the two column loads where the neighbours allow it (uniform pressure), else shifted (linear pressure,
//     e ≤ L/6) · width from the gross pressure ≤ qa × footUtil (footing + soil above included)
//   longitudinal = an inverted beam: net soil line load up, column loads down → M(u), V(u) along the footing; hogging between the columns →
//     TOP bars, cantilevers past the columns → BOTTOM bars; As = M/(fs·j·d) ≥ min(14/fy·b·d, 4/3·As req) (10.5.3) and ≥ shrinkage ρ·b·h
//     (7.12.2.1: SR24 0.0025 · SD30 0.0020 · SD40 0.0018) · one-way shear at d from every column face · punching per column (3-sided when the
//     end is closer than d/2) · bar spacing ≤ min(3h, 45 cm) · development: ld (top bars × 1.3) from the peak moment to the bar end, else a
//     90° hook (ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 cm, 12.5.2) — bars run full length with hooks at both ends
//   transverse: a band under each column, width c + d (15.4.4 practice), cantilever M = (P/B)·((B − c)/2)²/2 → bottom bars in the band;
//     elsewhere shrinkage steel · depth above the bottom bars ≥ 15 cm (15.7)
// Units: kg, m for geometry, cm and ksc inside the stress checks. Returns null when the two columns are not on one line (offset > 0.15 m).
import { BARS, allowableFs } from "./tables.js";

const r05 = (x) => Math.ceil(x * 20 - 1e-9) / 20;
const rhoT = (bar, fy) => (String(bar).startsWith("RB") ? 0.0025 : fy >= 4000 ? 0.0018 : 0.002);

// cols: [{ p:[x,y], P, Mx, My, bx, by (m), stack, dowelBar, dowelN }] (2 columns); o: { mat, qa, gamma, Df, utilMax, lo, hi (allowed
// extent along the line, global), bars: ["DB 12", "DB 16", "DB 20"] }
export function combinedFooting(cols, o) {
  const [c1, c2] = cols, dx = c2.p[0] - c1.p[0], dy = c2.p[1] - c1.p[1];
  const ax = Math.abs(dx) >= Math.abs(dy) ? 0 : 1, ay = 1 - ax, off = Math.abs(ax ? dx : dy);
  if (off > 0.15 + 1e-9) return null; // not on one line: a skewed combined footing is not handled
  const [A, B2] = (ax ? dy : dx) >= 0 ? [c1, c2] : [c2, c1]; // A at the low end of the line
  const s = Math.abs(ax ? dy : dx), uA = A.p[ax];
  const mat = o.mat ?? {}, fcp = mat.fcFoot ?? mat.fcPrime ?? 240, fy = mat.fy ?? 4000, F = mat.F ?? 0.45, Es = mat.Es ?? 2040000;
  const cover = (mat.coverFoot ?? 7.5) / 100, coverTop = 0.05, qa = (o.qa ?? 10000) * (o.utilMax ?? 1), gamma = o.gamma ?? 1800, sq = Math.sqrt(fcp);
  const fc = mat.capFc !== false && F * fcp > 65 ? 65 : F * fcp, fs = allowableFs(fy, F), Ec = 2.323 ** 1.5 * 4270 * sq, n = Es / Ec;
  const k = 1 / (1 + fs / (n * fc)), j = 1 - k / 3, vc = 0.29 * sq, vcp = 0.53 * sq, fbr = 0.25 * fcp;
  const cu = (c) => (ax ? c.by : c.bx), cv = (c) => (ax ? c.bx : c.by); // column size along / across the line
  const R = A.P + B2.P, Macross = Math.abs(ax ? A.Mx ?? 0 : A.My ?? 0) + Math.abs(ax ? B2.Mx ?? 0 : B2.My ?? 0) + R * off / 2;
  const Malong = Math.abs(ax ? A.My ?? 0 : A.Mx ?? 0) + Math.abs(ax ? B2.My ?? 0 : B2.Mx ?? 0);
  // ---- plan along the line (u from column A): centred on the resultant, ends ≥ column face + 0.15 m, within [lo, hi]
  const xr = (B2.P * s) / R, e0 = 0.15;
  const L0 = r05(2 * Math.max(xr + cu(A) / 2 + e0, s - xr + cu(B2) / 2 + e0));
  const lo = o.lo != null ? o.lo - uA : -Infinity, hi = o.hi != null ? o.hi - uA : Infinity;
  // place a footing of length Lc: centred on the resultant, else pushed inside [lo, hi] (pressure linear), null when it no longer fits
  const place = (Lc) => {
    let uL = xr - Lc / 2;
    if (uL < lo) uL = lo; if (uL + Lc > hi) uL = hi - Lc;
    if (uL < lo - 1e-9 || uL > -cu(A) / 2 - 0.05 || uL + Lc < s + cu(B2) / 2 + 0.05) return null;
    return uL;
  };
  const Ls = []; for (let Lc = L0; Lc <= L0 + 5 + 1e-9; Lc = Math.round((Lc + 0.1) * 100) / 100) if (place(Lc) != null) Ls.push(Lc);
  if (!Ls.length) { // no room for a centred footing: the shortest that passes both column faces + 0.15, pressure linear
    const uLx = Math.max(lo, -cu(A) / 2 - e0), uR = Math.min(hi, s + cu(B2) / 2 + e0);
    if (uR - uLx < s + (cu(A) + cu(B2)) / 2 + 0.1) return { kind: "combined", ok: false, error: "ฐานข้างเคียงไม่เหลือที่พอให้ฐานรากร่วม", cols, ax };
    Ls.push(-(uR - uLx)); // negative = fixed placement at uLx
    place.fixed = uLx;
  }
  const best = { pass: null, fail: null }, why = {};
  let since = 0;
  for (const Lraw of Ls) {
  const L = Math.abs(Lraw), uL = Lraw < 0 ? place.fixed : place(L);
  const uc = uL + L / 2, e = xr - uc; // resultant offset from the footing centre (+ = towards B)
  const local = { pass: null, fail: null };
  const Bmin = r05(Math.max(cv(A), cv(B2)) + 0.3), Bmax = (Lc) => Math.min(o.wMax ?? Infinity, Math.max(Bmin, Lc * 1.5)); // not wider than 1.5 L, nor than the room beside (o.wMax)
  const bars = o.bars ?? ["DB 12", "DB 16", "DB 20"], SP = [0.25, 0.2, 0.175, 0.15, 0.125, 0.1];
  for (let Bw = Bmin; Bw <= Bmax(L) + 1e-9; Bw = Math.round((Bw + 0.05) * 100) / 100) {
    for (let it = 0; it < 14; it++) {
      const t = Math.round((Math.max(0.3, o.tMin ?? 0.25) + it * 0.05) * 100) / 100, Df = Math.max(o.Df ?? 1.2, t);
      const Wf = 2400 * t * Bw * L, Ws = gamma * Math.max(0, Df - t) * Bw * L, area = Bw * L;
      const qg = (R + Wf + Ws) / area, qMax = qg + (6 * Math.abs(R * e)) / (Bw * L * L) + (6 * Malong) / (Bw * L * L) + (6 * Macross) / (L * Bw * Bw);
      const qMin = qg - (6 * Math.abs(R * e)) / (Bw * L * L) - (6 * Malong) / (Bw * L * L) - (6 * Macross) / (L * Bw * Bw);
      if (qMax > qa + 1e-6 || qMin < -1e-6) { if (!local.fail || Bw > local.fail.B) local.fail = { kind: "combined", ok: false, B: Bw, L, t, uL, qMax, qMin, qa, error: qMin < 0 ? "แรงดันดินติดลบ (ผลลัพธ์เยื้องเกิน L/6)" : "แรงดันดินเกิน qa" }; break; } // wider
      // net line load (column loads only), linear when e ≠ 0
      const w0 = R / L, w = (u) => w0 * (1 + (12 * e * (u - uc)) / (L * L));
      // exact M, V of the linear line load + the two column loads (closed form), on a 600-step grid plus every column face
      const kk = (12 * e) / (L * L), a0 = 1 + kk * (uL - uc);
      const Mx = (x) => { const h = x - uL; let m = w0 * ((a0 * h * h) / 2 + (kk * h * h * h) / 6); for (const [ul, P] of loads) if (ul < x) m -= P * (x - ul); return m; };
      const Vx = (x) => { const h = x - uL; let v = w0 * (a0 * h + (kk * h * h) / 2); for (const [ul, P] of loads) if (ul < x) v -= P; return v; };
      const N = 600, du = L / N, loads = [[0, A.P], [s, B2.P]];
      const U = [...Array.from({ length: N + 1 }, (_, i) => uL + i * du), ...[[0, cu(A)], [s, cu(B2)]].flatMap(([ul, c]) => [ul - c / 2, ul + c / 2])].sort((p1, p2) => p1 - p2);
      const M = U.map(Mx), V = U.map(Vx); void w;
      const at = (u, arr) => (arr === V ? Vx(u) : Mx(u));
      // moments: positive = tension at the bottom; evaluated at the faces and between them (inside a column the section is the column)
      const inCol = (u) => loads.some(([ul], k2) => Math.abs(u - ul) < [cu(A), cu(B2)][k2] / 2 - 1e-6);
      let Mbot = 0, Mtop = 0, uTop = s / 2;
      U.forEach((u, i) => { if (inCol(u)) return; if (M[i] > Mbot) Mbot = M[i]; if (-M[i] > Mtop) { Mtop = -M[i]; uTop = u; } });
      let cand = null;
      for (const barL of bars) for (const barT of bars) {
        const dbL = (BARS[barL]?.d ?? 1.2) / 100, dbT = (BARS[barT]?.d ?? 1.2) / 100, AbL = BARS[barL]?.A ?? 1.13, AbT = BARS[barT]?.A ?? 1.13;
        const dB = t - cover - dbL / 2, dTr = t - cover - dbL - dbT / 2, dTop = t - coverTop - dbL / 2;
        if ((dB - dbL / 2) * 100 < 15 - 1e-9) { why.d15 = (why.d15 ?? 0) + 1; continue; } // 15.7
        // one-way shear at d from every column face (both sides), punching per column
        let vMax = 0;
        loads.forEach(([ul], k2) => { const h = [cu(A), cu(B2)][k2] / 2 + dB; for (const u of [ul - h, ul + h]) if (u > uL && u < uL + L) vMax = Math.max(vMax, Math.abs(at(u, V))); });
        const v = vMax / (Bw * 100 * dB * 100);
        const qn = R / area, punch = [A, B2].map((c, k2) => {
          const ul = k2 ? s : 0, ov = k2 ? uL + L - (s + cu(c) / 2) : -cu(c) / 2 - uL, three = ov < dB / 2;
          const a1 = cu(c) + (three ? dB / 2 + ov : dB), a2 = cv(c) + dB, b0 = three ? 2 * a1 + a2 : 2 * (a1 + a2);
          const Vp = Math.max(0, c.P - qn * a1 * a2); void ul; return { Vp, b0, v: Vp / (b0 * 100 * dB * 100), three };
        });
        const vp = Math.max(...punch.map((x) => x.v));
        if (v > vc + 1e-9 || vp > vcp + 1e-9) { why[v > vc ? "shear" : "punch"] = (why[v > vc ? "shear" : "punch"] ?? 0) + 1; continue; }
        const rho = rhoT(barL, fy), AsMinT = rho * Bw * 100 * t * 100;
        const need = (Mreq, d) => { const req = (Mreq * 100) / (fs * j * d * 100); return Math.max(Math.min((14 / fy) * Bw * 100 * d * 100, (4 / 3) * req), req, AsMinT); };
        const AsBotReq = need(Mbot, dB), AsTopReq = need(Mtop, dTop);
        const sMax = Math.min(3 * t, 0.45);
        const layout = (As, Ab, width) => { // fewest bars over the width at a spacing ≤ sMax
          for (const sp of SP) { if (sp > sMax + 1e-9) continue; const nb = Math.floor((width - 2 * cover) / sp + 1e-9) + 1; if (nb * Ab >= As - 1e-9) return { n: nb, s: sp, As: nb * Ab }; }
          return null; };
        const bot = layout(AsBotReq, AbL, Bw), top = layout(AsTopReq, AbL, Bw);
        if (!bot || !top) { why.flex = (why.flex ?? 0) + 1; continue; }
        // transverse bands
        // band under each column: c + 0.75d each side (Wight & MacGregor practice for 15.4.4), cut at the footing ends; two bands that
        // touch become one band carrying both columns
        const band = (c, ul) => [Math.max(uL, ul - cu(c) / 2 - 0.75 * dTr), Math.min(uL + L, ul + cu(c) / 2 + 0.75 * dTr)];
        let bands = [{ cs: [A], r: band(A, 0) }, { cs: [B2], r: band(B2, s) }];
        if (bands[0].r[1] >= bands[1].r[0] - 1e-9) bands = [{ cs: [A, B2], r: [bands[0].r[0], bands[1].r[1]] }];
        const trans = bands.map(({ cs, r: [b0, b1] }) => {
          const wb = b1 - b0, Mt = cs.reduce((m, c) => m + ((c.P / Bw) * ((Bw - cv(c)) / 2) ** 2) / 2, 0), req = Math.max((Mt * 100) / (fs * j * dTr * 100), rhoT(barT, fy) * wb * 100 * t * 100);
          const nb = Math.max(2, Math.ceil(req / AbT - 1e-9)), sp = wb / nb;
          return { w: wb, u0: b0 - uL, M: Mt, AsReq: req, n: nb, s: sp, As: nb * AbT, ok: sp >= 0.06 - 1e-9, cols: cs.map((c) => c.stack) };
        });
        if (trans.some((x) => !x.ok)) { why.trans = (why.trans ?? 0) + 1; continue; }
        const AsDist = rhoT(barT, fy) * 100 * t * 100; // per m outside the bands
        const sDist = SP.find((sp) => sp <= sMax + 1e-9 && (AbT * 100) / (sp * 100) >= AsDist - 1e-9);
        if (!sDist) { why.dist = (why.dist ?? 0) + 1; continue; }
        // development: bottom bars from the column faces to the ends, top bars from the peak to both ends (hooked if short)
        const ld = (db, isTop) => Math.max(0.3, (((db * 100 <= 1.9 ? 0.15 : 0.19) * (isTop ? 1.3 : 1) * fy) / sq) * db), ldh = (db) => Math.max((0.075 * fy * db * 100) / sq / 100, 8 * db, 0.15);
        const availB = Math.min(-cu(A) / 2 - uL, uL + L - s - cu(B2) / 2) - cover, availT = Math.min(uTop - uL, uL + L - uTop) - cover;
        const devB = availB >= ld(dbL, false) - 1e-9 ? "straight" : availB >= ldh(dbL) - 1e-9 ? "hook" : null;
        const devT = Mtop < 1 ? "straight" /* no hogging: top bars are shrinkage steel */ : availT >= ld(dbL, true) - 1e-9 ? "straight" : availT >= ldh(dbL) - 1e-9 ? "hook" : null;
        if (!devB || !devT) { why.dev = (why.dev ?? 0) + 1; continue; }
        const bearing = Math.max(...[A, B2].map((c) => c.P / (c.bx * 100 * c.by * 100)));
        if (bearing > fbr + 1e-9) { why.bearing = (why.bearing ?? 0) + 1; continue; }
        const kgBar = (Ab, len, nb) => (Ab * len * 100 * nb * 7850) / 1e6;
        const steel = kgBar(AbL, L, bot.n) + kgBar(AbL, L, top.n) + trans.reduce((a, x) => a + kgBar(AbT, Bw, x.n), 0) + kgBar(AbT, Bw, Math.ceil(Math.max(0, L - trans.reduce((q, x) => q + x.w, 0)) / sDist));
        const cost = area * t * 2500 + steel * 28;
        if (!cand || cost < cand.cost) cand = { barL, barT, dB, dTr, dTop, v, vMax, punch, vp, bot, top, trans, sDist, AsBotReq, AsTopReq, AsMinT, devB, devT, availB, availT, ldB: ld(dbL, false), ldT: ld(dbL, true), ldhL: ldh(dbL), bearing, steel, cost, sMax };
      }
      if (cand) {
        const util = Math.max(qMax / qa, cand.v / vc, cand.vp / vcp, cand.bearing / fbr);
        const out = { kind: "combined", ok: true, util, cols: [A, B2], ax, s, L, B: Bw, uL, t, Df, uL, e, xr, R, Mbot, Mtop, uTop, qMax, qMin, qg, Wf, Ws, qa, fc, fs, j, k, vc, vcp, fbr, Macross, Malong,
          diag: { u: U.map((u) => u - uL), M, V }, ...cand };
        if (!local.pass || out.cost < local.pass.cost - 1e-6) local.pass = out;
        break; // thicker only costs more at this width
      }
    }
    if (local.pass) break; // the narrowest passing width
  }
  if (local.pass && (!best.pass || local.pass.cost < best.pass.cost - 1e-6)) { best.pass = local.pass; since = 0; } else if (best.pass && ++since >= 6) break; // longer only costs more now
  if (!best.pass && local.fail && (!best.fail || local.fail.qMax < best.fail.qMax)) best.fail = local.fail;
  }
  const WHY = { trans: "เหล็กตามขวางใต้เสาแน่นเกิน", dev: "ระยะฝังเหล็กไม่พอ", flex: "เหล็กรับโมเมนต์ไม่พอ", dist: "เหล็กกันร้าว", bearing: "แรงกดใต้เสาเกิน 0.25f′c (ต้องขยายเสา/ตอม่อ)", shear: "แรงเฉือน", punch: "แรงเฉือนทะลุ", d15: "ความลึก < 15 ซม." };
  const top = Object.entries(why).filter(([k]) => k === "bearing" || k === "punch" || k === "shear").sort((a2, b2) => b2[1] - a2[1])[0];
  if (!best.pass && best.fail && top) best.fail = { ...best.fail, error: `${best.fail.error} · ${WHY[top[0]]}` };
  const r = best.pass ?? (best.fail ? { ...best.fail, why } : null) ?? { kind: "combined", ok: false, error: "ไม่พบขนาดที่ผ่าน", cols, ax };
  if (r.L != null && r.B != null) { // global rectangle
    const c0 = uA + r.uL + r.L / 2, cOther = (A.p[ay] + B2.p[ay]) / 2;
    r.center = ax ? [cOther, c0] : [c0, cOther]; r.Bx = ax ? r.B : r.L; r.By = ax ? r.L : r.B;
  }
  return r;
}

// bar texts
export const cfBarText = (x, bar) => (x ? `${x.n}-${bar} @ ${x.s.toFixed(2)}` : "-");
