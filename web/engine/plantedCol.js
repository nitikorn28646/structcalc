// Columns standing on a beam (เสาตั้งบนคาน, user 2026-11-21: "เสาตั้งบนคาน เรามีการคำนวณ และรู้แบบการเสริมเหล็กหรือยัง").
// The LOAD path already exists: frame.js hands the column's accumulated load to the floor below as a point load (analyzeFloor `extra`) and
// the carrying beam is designed with it (M, V, deflection; the 3D frame joins the column to the beam, so its base moments reach the beam as
// bending / torsion in the envelope mode). This module checks what the point load alone does not cover, one row per planted column:
//   1 width     — the column is not wider than the beam across it, and its bars come down INSIDE the beam stirrups
//   2 anchorage — column bars extend into the beam to sit on its bottom bars: straight length available ≥ ldc (compression,
//                 ACI 318-11 12.3.2: ldc = 0.075·fy·db/√f′c ≥ 0.0043·fy·db ≥ 20 cm in kg/cm² units; a hook does not count in
//                 compression, 12.5.5); with tension in the column (3D N < 0, or a base moment outside the kern) the 90° hook must
//                 develop the bar: ldh = 0.075·fy·db/√f′c (× 0.7 with side cover ≥ 6.5 cm) ≥ 8db ≥ 15 cm (12.5.2 / 12.5.3a)
//   3 bearing   — column stress on the beam P / (Bx·By) ≤ 0.25·f′c of the beam (WSD bearing, ACI 318-63 1707), else the column bars carry
//                 the excess as dowels at 0.4·fy (15.8.1.2 idea); f′c column ≤ 1.4·f′c beam (10.12)
//   4 the carrying span passes with the column load (shear incl. the point load, torsion from the 3D frame), shear at the column reported
//   bent bars   — "คอม้า" (user's own detail 2026-11-21): bars bent up at 45° under the column, flat under it (column width + 2 × 0.20 m),
//                 up to the top and on along the top ≥ max(0.30 m, ld of a top bar) each side. Sized to carry the column load share of the more
//                 loaded side alone: n·Ab·fs·sin45° ≥ P·max(a, L − a)/L (WSD, fs as for the main bars), ≤ 0.795√f′c·b·d (ACI 318-11 11.4.7.4,
//                 bent bars as shear reinforcement; 12.13.4 anchorage beyond mid-depth by ld). SUPPLEMENTARY: the beam's own check does not
//                 count them (its stirrups already carry the shear) — they give the load a direct path to the bottom of the beam.
//   detail      — beam stirrups at the support spacing over the column width + d each side; column ties continue through the beam at the
//                 column spacing (user's detail); first tie above the beam at s/2 (7.10.5.4)
// Clause numbers are ACI 318-11 (base of ว.ส.ท.); the ว.ส.ท. text itself has not been checked → UNVERIFIED, as the other ACI items.
import { dimItem } from "./dimParts.js";
import { BARS, allowableFs } from "./tables.js";
import { devLength, faceBars, parseBars } from "./floor.js";

const TOL = 0.03, near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < TOL;
const barD = (name) => BARS[name]?.d ?? 0; // cm
const biggest = (t, keys) => keys.map((k) => parseBars(t?.[k])).filter(Boolean).reduce((a, b) => (!a || barD(b.bar) > barD(a.bar) ? b : a), null);

export const ldcOf = (db, fy, fc) => Math.max((0.075 * fy * db) / Math.sqrt(fc), 0.00427 * fy * db, 20); // cm (0.0003·fy·db in psi)
export const ldhOf = (db, fy, fc, side) => Math.max(((0.075 * fy * db) / Math.sqrt(fc)) * (side ? 0.7 : 1), 8 * db, 15); // cm

export function plantedColumns(frame, res) {
  const out = [], mat = frame.mat ?? {}, types = frame.beamTypes ?? [];
  const fy = mat.fy ?? 4000, fcB = mat.fcBeam ?? mat.fcPrime ?? 240, fcC = mat.fcCol ?? mat.fcPrime ?? 240;
  const cover = mat.cover ?? 3, coverCol = mat.coverCol ?? mat.cover ?? 3;
  for (let k = 1; k < (frame.floors?.length ?? 0); k++) {
    const below = frame.floors[k - 1], an = res?.floors?.[k - 1];
    frame.floors[k].columns.forEach((p, i) => {
      if ((below.columns ?? []).some((q) => near(q, p))) return; // a column under it: not planted
      const col = res?.columns?.find((c) => c.floor === k && c.i === i), lv = col?.lv;
      const from = `เสา ${col?.stack} (${frame.floors[k].name})`;
      const ln = an?.lines?.find((l) => (l.extra ?? []).some((e) => e.from === from));
      const ex = ln?.extra.find((e) => e.from === from);
      const row = { floor: k, floorName: frame.floors[k].name, hostName: below.name, i, p, stack: col?.stack, P: col?.Pbot ?? 0, lv, colType: frame.colTypes?.[col?.typeIdx]?.name };
      if (!lv) { out.push({ ...row, ok: false, why: ["ไม่มีขนาดเสา (type เสา)"] }); return; }
      if (!ln || !ex) { out.push({ ...row, ok: false, noBeam: true, why: [`ไม่มีคานรับที่${below.name} — แรงเสาไม่ได้ลงโครงสร้าง`] }); return; }
      const at = ex.at, cand = an.spans.filter((s) => s.line === ln.id && at >= s.x0 - 1e-6 && at <= s.x1 + 1e-6);
      const sp = cand.find((s) => at > s.x0 + 1e-6 && at < s.x1 - 1e-6) ?? cand[0];
      const t = sp?.type ?? types[sp?.typeIdx] ?? types[0];
      const alongX = Math.abs(ln.u[0]) >= Math.abs(ln.u[1]), colAlong = alongX ? lv.Bx : lv.By, colPerp = alongX ? lv.By : lv.Bx; // cm
      const db = barD(lv.mainBar), dt = barD(lv.tieBar), Ab = BARS[lv.mainBar]?.A ?? 0, nB = lv.n ?? 4;
      const dst = barD(t?.st), bot = biggest(t, ["bot", "botX"]), dbBot = bot ? barD(bot.bar) : 1.2;
      // 1 width: concrete of the column on the beam, and the bars inside the beam stirrups
      const bcm = (t?.b ?? 0.2) * 100, spread = colPerp - 2 * (coverCol + dt), inner = bcm - 2 * (cover + dst);
      // bars a little outside the cage are cranked in (offset bars, ACI 318-11 7.8.1: slope ≤ 1 in 6, a tie at the bend) — the hard limit
      // is that the bars across the beam fit inside its stirrups with the column clear spacing max(1.5db, 4 cm) (7.6.3)
      const nAcross = Math.max(...faceBars(lv.n ?? 4)) / 2, needIn = nAcross * db + (nAcross - 1) * Math.max(1.5 * db, 4);
      const crank = Math.max(0, (spread - inner) / 2), widthOk = colPerp <= bcm + 0.1, barsIn = needIn <= inner + 0.1;
      // 2 anchorage: straight length from the beam top down to the top of its bottom bars
      const hcm = (t?.h ?? 0.4) * 100, avail = hcm - cover - dst - dbBot, ldc = ldcOf(db, fy, fcB), compOk = ldc <= avail + 1e-9;
      const N3 = col.f3?.N, T = Math.max(0, -(N3 ?? 0), ...(col.combos ?? []).map((c) => -(c.N ?? c.P ?? 0)).filter(Number.isFinite));
      const Mx = Math.max(Math.abs(col.f3?.Mx ?? 0), ...(col.combos ?? []).map((c) => Math.abs(c.Mx ?? 0))), My = Math.max(Math.abs(col.f3?.My ?? 0), ...(col.combos ?? []).map((c) => Math.abs(c.My ?? 0))); // kg-m, 3D frame (+ lateral combinations)
      const eX = row.P > 0 ? (My * 100) / row.P : 0, eY = row.P > 0 ? (Mx * 100) / row.P : 0; // cm — outside B/6 = the far bars in tension
      const momTension = eX > lv.Bx / 6 + 1e-9 || eY > lv.By / 6 + 1e-9, tension = T > 1 || momTension;
      const sideCover = (bcm - spread) / 2, side = sideCover >= 6.5; // beam side face to the column bar (12.5.3a: ≥ 6.5 cm)
      const ldh = ldhOf(db, fy, fcB, side), hookOk = ldh <= avail + 1e-9;
      // 3 bearing on the beam, column bars as dowels for any excess
      const A1 = lv.Bx * lv.By, fbr = row.P / A1, fAllow = 0.25 * fcB, Ast = nB * Ab;
      const AsDowel = fbr > fAllow ? (row.P - fAllow * A1) / (0.4 * fy) : 0, bearOk = Ast >= AsDowel - 1e-9, fcOk = fcC <= 1.4 * fcB + 1e-9;
      // 4 the carrying span at the column: |V| either side (span envelope samples within the column width + 5 cm), torsion used, distance to the ends
      const xc = at - sp.x0, w = colAlong / 200 + 0.05, vs = (sp.Vx ?? []).filter(([x]) => Math.abs(x - xc) <= w).map(([, v]) => Math.abs(v));
      const Vcol = vs.length ? Math.max(...vs) : sp.V, aEnd = Math.min(xc, sp.len - xc), d = (t?.h ?? 0.4) - (cover + 1.5) / 100;
      const zone = colAlong / 100 + 2 * d, sZone = Math.min(t?.sSup ?? 0.15, Math.floor((d / 2) * 40) / 40);
      // bent-up bars (คอม้า): the fewest bars of the smallest size that fit across the beam and carry the share of P alone
      const fsB = allowableFs(fy, mat.F ?? 0.45) || 1700, s45 = Math.SQRT1_2, L = sp.len || 1, share = Math.max(xc, L - xc) / L, Pside = row.P * share;
      const Vlim = 0.795 * Math.sqrt(fcB) * bcm * d * 100, gap = mat.barClear ?? 3.5;
      let bent = null, best = null;
      const mk = (bar, n) => { const A = BARS[bar].A, dbb = BARS[bar].d; return { bar, n, A, db: dbb, cap: Math.min(n * A * fsB * s45, Vlim), Pside, share, Vlim, fs: fsB, ltop: Math.max(0.3, devLength(dbb, mat, true)), flat: colAlong / 100 + 0.4 }; };
      for (const bar of ["DB 12", "DB 16", "DB 20"]) {
        const dbb = BARS[bar].d, fit = Math.floor((inner + Math.max(dbb, gap)) / (dbb + Math.max(dbb, gap)) + 1e-9); // bars that fit across the cage
        const n = Math.max(2, Math.ceil(Pside / (BARS[bar].A * fsB * s45) - 1e-9));
        if (n <= fit) { bent = mk(bar, n); break; }
        if (fit >= 2) { const c = mk(bar, fit); if (!best || c.cap > best.cap) best = c; } // too few fit: keep the strongest arrangement that does
      }
      bent = bent ?? best; // the stirrups of the beam carry the rest (the beam check does not count the bent bars at all)
      if (bent) bent.ok = bent.cap >= Pside - 1e-6;
      const why = [];
      if (!widthOk) why.push(`เสากว้าง ${colPerp} ซม. เกินคาน ${bcm.toFixed(0)} ซม. — ขยายคาน / พอกข้างคาน หรือลดขนาดเสา`);
      if (widthOk && !barsIn) why.push(`เหล็กเสา ${nAcross} เส้นต่อด้านใส่ในปลอกคานไม่ได้ (ต้องการ ${needIn.toFixed(1)} ซม. ช่องในปลอก ${inner.toFixed(1)} ซม.) — ขยายคาน`);
      if (!compOk) why.push(`เหล็กเสาฝังในคานได้ ${avail.toFixed(1)} ซม. < ldc ${ldc.toFixed(1)} ซม. (รับแรงอัด, ขอไม่ช่วย) — คานลึก ≥ ${Math.ceil(ldc + cover + dst + dbBot)} ซม. หรือใช้เหล็กเสาเส้นเล็กลง`);
      if (tension && !hookOk) why.push(`เสามีแรงดึง${T > 1 ? ` ${Math.round(T)} กก.` : " (โมเมนต์โคนเสา)"} — ขอ 90° ต้องการ ldh ${ldh.toFixed(1)} ซม. > ${avail.toFixed(1)} ซม. — คานลึกขึ้น`);
      if (!bearOk) why.push(`แรงกด ${fbr.toFixed(1)} > 0.25f′c ${fAllow.toFixed(1)} กก./ซม.² — เหล็กเสาต้องรับส่วนเกิน ${AsDowel.toFixed(2)} ซม.² > ${Ast.toFixed(2)}`);
      if (!fcOk) why.push(`f′c เสา ${fcC} > 1.4 × f′c คาน ${fcB} (ACI 318-11 10.12)`);
      if (sp && !sp.ok) why.push(`คานรับ ${sp.typeName ?? t?.name} ช่วง ${sp.id} ไม่ผ่าน (ดูเหตุผลของช่วง)`);
      out.push({ ...row, line: ln.id, at, span: sp?.id, beam: t, beamName: sp?.typeName ?? t?.name, alongX, colAlong, colPerp, db, dt, nB, Ast, dst, dbBot,
        widthOk, barsIn, spread, inner, avail, ldc, compOk, tension, T, momTension, Mx, My, ldh, hookOk, side, A1, fbr, fAllow, AsDowel, bearOk, fcOk, fcB, fcC,
        Vcol, Mt: sp?.Mt ?? 0, sideCover, nAcross, needIn, crank, bent, spOk: !!sp?.ok, aEnd, d, nearSupport: aEnd < 2 * (t?.h ?? 0.4), zone, sZone,
        ok: widthOk && barsIn && compOk && (!tension || hookOk) && bearOk && fcOk && !!sp?.ok, why });
    });
  }
  return out;
}

// distinct details: same column level, same beam type
export const plantedGroups = (rows) => { const m = new Map();
  for (const r of rows.filter((x) => x.beam)) { const key = `${r.lv.Bx}x${r.lv.By}|${r.lv.n}|${r.lv.mainBar}|${r.lv.tieBar}|${r.beamName}|${r.colAlong}`;
    if (!m.has(key)) m.set(key, { ...r, n: 0, at: [] }); const g = m.get(key); g.n++; g.at.push(r); if (!r.ok) g.ok = false; }
  return [...m.values()]; };

// Elevation of one column standing on a beam (primitives as engine/stairDetail.js / levelDetail.js: metres, y up; beam top = 0, column
// face at x = 0 … c): beam with its bars and stirrups (closer under the column: support spacing over the column width + d each side),
// column bars down to the beam's bottom bars with a 90° hook along the beam, cranked 1:6 above the beam when they sit outside the cage,
// column ties (first at s/2 above the beam, two inside the beam), dimensions of the embedment against ldc, labels.
const cmS = (v) => `${Math.round(v * 1000) / 10}`.replace(/\.0$/, "");
export function plantedDetailModel(r, mat = {}, o = {}) {
  const P = [], TH = 0.05;
  const line = (x1, y1, x2, y2, layer = "C-CONC", dash = false) => P.push({ t: "line", x1, y1, x2, y2, layer, dash });
  const poly = (pts, layer = "C-CONC", closed = false, fill = null) => P.push({ t: "poly", pts, layer, closed, fill });
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
  const bar = (pts, d, layer = "C-BAR") => P.push({ t: "poly", pts, layer, closed: false, bar: d });
  // real dimensions (engine/dimParts.js → DIMENSION in the DXF); the dimension line runs through y (x), short extension lines
  const dimH = (x1, x2, y, label, above = true) => P.push(dimItem(Math.min(x1, x2), y - 0.03, Math.max(x1, x2), y - 0.03, 0.03, label, TH * 0.9, { below: !above }));
  const dimV = (x, y1, y2, label) => P.push(dimItem(x + 0.03, Math.min(y1, y2), x + 0.03, Math.max(y1, y2), 0.03, label, TH * 0.9));
  let maxX = -Infinity, minX = Infinity;
  const leader = (bx, by, ty, s, ha = 0, s2 = "") => { const w = Math.max(String(s).length, String(s2).length * 0.9) * TH * 0.6 + 0.03, ex = ha === 0 ? bx + w : bx - w; maxX = Math.max(maxX, ex); minX = Math.min(minX, ex);
    P.push({ t: "disk", x: bx, y: by, r: 0.008, layer: "C-TEXT" }); poly([[bx, by], [bx, ty], [ex, ty]], "C-TEXT");
    text(ha === 0 ? bx + 0.015 : bx - 0.015, ty + 0.012, TH, s, "C-TEXT", ha, 1); if (s2) text(ha === 0 ? bx + 0.015 : bx - 0.015, ty - 0.015, TH * 0.82, s2, "C-DIM", ha, 3); };

  const t = r.beam ?? {}, h = t.h ?? 0.5, c = (r.colAlong ?? 20) / 100, cv = (mat.cover ?? 3) / 100, cvc = (mat.coverCol ?? mat.cover ?? 3) / 100;
  const db = (r.db ?? 1.2) / 100, dt = (r.dt ?? 0.6) / 100, dst = (r.dst ?? 0.9) / 100, dbBot = (r.dbBot ?? 1.2) / 100, d = r.d ?? h - 0.045;
  const B = r.bent, dbB = (B?.db ?? 1.2) / 100, yBt = -cv - dst - 0.016 - dbB / 2 - 0.01, yBb = -h + cv + dst + dbBot + dbB / 2, rise = Math.max(0.05, yBt - yBb);
  const reach = B ? B.flat / 2 + rise + B.ltop + 0.1 : 0;
  const Lb = Math.max(1.0, c / 2 + (r.zone ?? 0.8) / 2 + 0.45, reach), xc = c / 2, yHi = 0.95, yLo = -h;
  // concrete: beam (broken both ends), column above (broken at the top)
  poly([[xc - Lb, 0], [0, 0]]); poly([[c, 0], [xc + Lb, 0]]); poly([[xc - Lb, yLo], [xc + Lb, yLo]]);
  for (const x of [xc - Lb, xc + Lb]) poly([[x, yLo - 0.03], [x, yLo / 2 - 0.02], [x + 0.025, yLo / 2], [x - 0.025, yLo / 2 + 0.02], [x, 0.03]]);
  poly([[0, 0], [0, yHi]]); poly([[c, 0], [c, yHi]]);
  poly([[-0.02, yHi], [c * 0.4, yHi], [c * 0.5, yHi + 0.03], [c * 0.55, yHi - 0.03], [c * 0.65, yHi], [c + 0.02, yHi]]);
  // beam bars: top + bottom through
  bar([[xc - Lb + 0.05, -cv - dst - 0.006], [xc + Lb - 0.05, -cv - dst - 0.006]], 0.016);
  bar([[xc - Lb + 0.05, yLo + cv + dst + dbBot / 2], [xc + Lb - 0.05, yLo + cv + dst + dbBot / 2]], dbBot);
  // beam stirrups: the zone under the column at sZone, the rest at the type's mid-span spacing
  const z0 = xc - (r.zone ?? 0.8) / 2, z1 = xc + (r.zone ?? 0.8) / 2, sz = Math.max(0.05, r.sZone ?? 0.1), sm = Math.max(0.08, t.sMid ?? 0.15);
  for (let x = z0; x <= z1 + 1e-6; x += sz) line(x, yLo + cv, x, -cv, "C-STIRRUP");
  for (let x = z0 - sm; x > xc - Lb + 0.05; x -= sm) line(x, yLo + cv, x, -cv, "C-STIRRUP", true);
  for (let x = z1 + sm; x < xc + Lb - 0.05; x += sm) line(x, yLo + cv, x, -cv, "C-STIRRUP", true);
  // column bars: from the top down to the beam's bottom bars, 90° hook along the beam (tail 12db ≥ 10 cm); cranked 1:6 when outside the cage
  const off = (r.crank ?? 0) / 100, xb = cvc + dt + db / 2, yEnd = yLo + cv + dst + dbBot + db / 2, tail = Math.max(12 * db, 0.1);
  for (const [x0, sg] of [[xb, 1], [c - xb, -1]]) {
    // hook turned outward along the beam (room in the beam length; inward the two tails of a narrow column would cross)
    const xi = x0 + sg * off, pts = off > 0.001 ? [[x0, yHi - 0.02], [x0, 0.05 + 6 * off], [xi, 0.05], [xi, yEnd], [xi - sg * tail, yEnd]] : [[x0, yHi - 0.02], [x0, yEnd], [x0 - sg * tail, yEnd]];
    bar(pts, db);
  }
  // column ties: first at s/2 above the beam, then @s; through the beam at the same spacing down to the hooks (user's detail)
  const s = r.lv?.s ?? 0.15;
  for (let y = s / 2; y < yHi - 0.04; y += s) line(cvc, y, c - cvc, y, "C-STIRRUP", true);
  for (let y = -s / 2; y > yEnd + 0.04; y -= s) line(cvc + off, y, c - cvc - off, y, "C-STIRRUP", true);
  // bent-up bars (คอม้า): flat under the column, 45° up to the top, on along the top ≥ ltop each side
  if (B) {
    const f0 = xc - B.flat / 2, f1 = xc + B.flat / 2;
    bar([[f0 - rise - B.ltop, yBt], [f0 - rise, yBt], [f0, yBb], [f1, yBb], [f1 + rise, yBt], [f1 + rise + B.ltop, yBt]], dbB, "C-BAR-EXTRA");
    dimH(f0 - rise - B.ltop, f0 - rise, 0.1, `${B.ltop.toFixed(2)}`); dimH(f1 + rise, f1 + rise + B.ltop, 0.1, `${B.ltop.toFixed(2)}`);
    dimH(f0, f1, yLo - 0.26, `${B.flat.toFixed(2)}`, false);
    leader(f1 + rise / 2, (yBt + yBb) / 2, yHi + 0.05, `เหล็กคอม้า ${B.n}-${B.bar} มม. ดัด 45°`, 0, `รับ ${Math.round(B.cap).toLocaleString()} ${B.ok ? "≥" : "<"} ${Math.round(B.Pside).toLocaleString()} กก. (เสริม — ไม่นับในการออกแบบคาน)`);
  }
  // dimensions
  dimH(0, c, yHi + 0.1, `เสา ${cmS(c)} ซม.`);
  dimV(xc - Lb - 0.15, yLo, 0, `${cmS(h)}`);
  dimV(c + 0.16, yEnd, 0, `${(r.avail ?? 0).toFixed(1)} ซม.`);
  dimH(z0, z1, yLo - 0.12, `ปลอกคาน @${(sz).toFixed(2)} ม. ช่วง ${(z1 - z0).toFixed(2)} ม. (เสา + d สองข้าง)`, false);
  // labels
  leader(c - xb - off, 0.3, yHi + 0.32, `เหล็กเสา ${r.lv?.n ?? ""}-${r.lv?.mainBar ?? ""} มม. ลงถึงเหล็กล่างคาน`, 0,
    `ฝังในคาน ${(r.avail ?? 0).toFixed(1)} ${r.compOk ? "≥" : "<"} ldc ${(r.ldc ?? 0).toFixed(1)} ซม. (12.3.2)`);
  leader(xb + off - tail, yEnd, yLo - 0.62, `งอขอ 90° ตามแนวคาน ปลาย ${cmS(tail)} ซม. (12db)`, 2, r.tension ? `เสามีแรงดึง: ขอยาว ≥ ldh ${(r.ldh ?? 0).toFixed(1)} ซม. (12.5)` : "วางบนเหล็กล่างคาน");
  if (off > 0.001) leader(xb, 0.05 + 3 * off, yHi + 0.6, `ดัดเยื้องเข้า ${cmS(off)} ซม. ความชัน 1:6 (7.8.1) ให้อยู่ในปลอกคาน`, 2);
  leader(cvc, s / 2, yHi + 0.6 + (off > 0.001 ? 0.22 : 0), `ปลอกเสา ${r.lv?.tieBar ?? ""} @${s.toFixed(2)} ม. — ตัวแรก ${cmS(s / 2)} ซม. เหนือคาน · ต่อเนื่องลงในคาน`, 2);
  leader(xc + Lb - 0.25, yLo + cv + dst + dbBot / 2, yLo - 0.44, `${r.beamName ?? t.name ?? ""} ${cmS(t.b ?? 0.2)}×${cmS(h)} — เหล็กบน ${t.top ?? ""} · ล่าง ${t.bot ?? ""}`, 2);
  text(xc - Lb + 0.05, yLo - 0.035, TH, `แรงจากเสา ${Math.round(r.P ?? 0).toLocaleString()} กก.`, "C-TEXT", 0, 3);
  const title = o.title ?? "รายละเอียดเสาตั้งบนคาน", yT = yLo - 1.02;
  text(xc, yT, TH * 1.4, title, "C-TITLE", 1, 0);
  text(xc, yT - 0.12, TH * 0.9, `${o.sub ?? ""}มาตราส่วน ${o.scale ?? "1:25"}`, "C-TEXT", 1, 0);
  return { items: P, box: [Math.min(xc - Lb - 0.45, minX - 0.05), yT - 0.2, Math.max(xc + Lb + 0.2, maxX + 0.05), yHi + 0.95] };
}
