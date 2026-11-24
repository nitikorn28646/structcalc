// Footing type detail (user 2026-11-24, their sheet EN-11…13 "แบบขยายฐานราก" in new_block.dxf as the model, 1:25): PLAN on top
// (outline, bottom mat both ways drawn as bars, perimeter tie, pier with its bars, piles dashed, chains pier offsets / overall,
// cover, section cut ก–ก) and SECTION ก–ก under it (footing, pier, column broken above the ground, lean concrete + compacted sand
// layers hatched, ground line, bottom mat: X bars with 90° hooks up + Y bars as dots, perimeter tie near the top, pier bars / dowels
// down to the mat with a foot bent outwards, ties in the pier + 2 sets in the footing, piles with a break, dims t / Df / cover /
// layers / foot length, ▼ levels, leaders with the bar texts). Improvements over the sample (allowed by the user): the mat is drawn
// as bars in plan (the sample showed only hook ends as dots), section cut marks, level marks, pile data, every bar text from the
// design. Bar positions follow engine/footing.js: "long" bars run along X (spaced across By, bottom layer, d = t − c − db/2),
// "short" bars along Y above them. Units METRES, plan centre at x = 0; output = primitives (same as engine/stairDetail.js) for the
// SVG (src/stairSvg.js) and the DXF (src/beamDetailDxf.js emitModel). Drawing only — nothing here changes a check.
import { BARS } from "./tables.js";
import { PILES } from "./footing.js";
import { faceBars } from "./floor.js";
import { dimItem, dimBox } from "./dimParts.js";

const BD = (bar, def = 0.012) => (BARS[bar]?.d ?? def * 100) / 100;
const f2 = (v) => Number(v).toFixed(2);
const barTxt = (b) => String(b ?? "").replace(/^(RB|DB)\s*/, "$1 ");

// f = a footing result (res.footings[i]: r, inp, n, pile, kind), o = { mark, colName, lv (column level: Bx, By cm, n, mainBar, tieBar, s),
//   cover (cm, default inp.cover), lean 0.05, sand 0.05, ring "RB 9", count (footings of this mark) }
export function footingDetailModel(f, o = {}) {
  const r = f.r, inp = f.inp; if (!r || !inp) return null;
  const P = [], TH = o.th ?? 0.05, DH = 0.05;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const ext = (x, y) => { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); };
  const line = (xa, ya, xb, yb, layer = "C-CONC", dash = false) => { P.push({ t: "line", x1: xa, y1: ya, x2: xb, y2: yb, layer, dash }); ext(xa, ya); ext(xb, yb); };
  const poly = (pts, layer = "C-CONC", closed = false) => { P.push({ t: "poly", pts, layer, closed }); pts.forEach((p) => ext(p[0], p[1])); };
  const rect = (xa, ya, xb, yb, layer = "C-CONC") => poly([[xa, ya], [xb, ya], [xb, yb], [xa, yb]], layer, true);
  const bar = (pts, d, layer = "C-BAR") => { P.push({ t: "poly", pts, layer, closed: false, bar: d }); pts.forEach((p) => ext(p[0], p[1])); };
  const circle = (x, y, rr, layer = "C-BAR") => { P.push({ t: "circle", x, y, r: rr, layer }); ext(x - rr, y - rr); ext(x + rr, y + rr); };
  const disk = (x, y, rr, layer = "C-BAR") => { P.push({ t: "disk", x, y, r: Math.max(rr, 0.005), layer }); ext(x - rr, y - rr); ext(x + rr, y + rr); };
  const tw = (s, h) => String(s).length * h * 0.52;
  const text = (x, y, h, s, layer = "C-TEXT", ha = 0, va = 0, rot = 0) => {
    P.push({ t: "text", x, y, h, s, layer, ha, va, rot });
    const w = tw(s, h); if (rot) { ext(x - h, y - (ha === 1 ? w / 2 : ha === 2 ? w : 0)); ext(x + h, y + (ha === 1 ? w / 2 : ha === 0 ? w : 0)); }
    else { const xa = ha === 1 ? x - w / 2 : ha === 2 ? x - w : x; ext(xa, y - h * 0.3); ext(xa + w, y + h * 1.2); }
  };
  const tick = (x, y) => line(x - 0.014, y - 0.014, x + 0.014, y + 0.014, "C-DIM");
  // dimensions: extension lines from the object (gap g) to the dimension line, 45° ticks, text above / left of the line
  // real dimensions (engine/dimParts.js → DIMENSION entities in the DXF), user 2026-11-24
  const dimPush = (q) => { P.push(q); const [a, b, c2, e] = dimBox(q); ext(a, b); ext(c2, e); };
  const dimH = (xa, xb, yObj, y, label) => dimPush(dimItem(xa, yObj, xb, yObj, y - yObj, label, DH));
  const dimV = (ya, yb, xObj, x, label) => dimPush(dimItem(xObj, ya, xObj, yb, xObj - x, label, DH));
  // chain of dimensions along x at y (pts sorted), labels = widths
  const chainH = (xs, yObj, y) => { for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] > 1e-6) dimH(xs[i - 1], xs[i], yObj, y, f2(xs[i] - xs[i - 1])); };
  const chainV = (ys, xObj, x) => { for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 1e-6) dimV(ys[i - 1], ys[i], xObj, x, f2(ys[i] - ys[i - 1])); };
  // filled arrowhead with its tip at the object, pointing along (ux, uy)
  const arrow = (x, y, ux, uy) => { const L = Math.hypot(ux, uy) || 1; P.push({ t: "arrow", x, y, dx: -ux / L, dy: -uy / L, L: 0.045, w: 0.016, layer: "C-TEXT" }); };
  // leader: arrow at the object, line to the text row, underline the text sits on (ha 0 = text to the right)
  const leader = (bx, by, tx, ty, s, ha = 0) => { const w = tw(s, TH) + 0.04, ex = ha === 0 ? tx + w : tx - w;
    arrow(bx, by, bx - tx, by - ty); poly([[bx, by], [tx, ty], [ex, ty]], "C-TEXT"); text(ha === 0 ? tx + 0.02 : tx - 0.02, ty + 0.012, TH, s, "C-TEXT", ha, 1); };
  // as on the user's sheet: straight UP from the object to the text row, the text on an underline starting at the leader
  const upLeader = (bx, by, ty, s) => { const w = tw(s, TH) + 0.05; arrow(bx, by, 0, -1); poly([[bx, by], [bx, ty], [bx + w, ty]], "C-TEXT"); text(bx + 0.02, ty + 0.012, TH, s, "C-TEXT", 0, 1); };
  const bubble = (x, y, s) => { circle(x, y, 0.075, "C-TAG"); text(x, y, 0.065, s, "C-TAG", 1, 2); };

  // ---- data
  const Bx = r.Bx, By = r.By, t = inp.t ?? 0.4, Df = Math.max(inp.Df ?? 1.2, t), c = (o.cover ?? inp.cover ?? 7.5) / 100;
  const lv = o.lv, bx = inp.bx ?? (lv ? lv.Bx / 100 : 0.2), by = inp.by ?? (lv ? lv.By / 100 : 0.2), round = inp.pier === "circle";
  const dL = BD(inp.longBar), dS = BD(inp.shortBar), nL = r.nLong ?? Math.max(2, Math.floor((By - 2 * c) / (inp.sLong || 0.15)) + 1), nS = r.nShort ?? Math.max(2, Math.floor((Bx - 2 * c) / (inp.sShort || 0.15)) + 1);
  const ccol = (o.coverCol ?? 3) / 100, tieBar = lv?.tieBar ?? "RB 6", dt = BD(tieBar, 0.006), sTie = lv?.s ?? 0.15;
  const nDw = inp.dowelN ?? lv?.n ?? 4, dwBar = inp.dowelBar ?? lv?.mainBar ?? "DB 12", ddw = BD(dwBar), ring = o.ring ?? "RB 9", dr = BD(ring, 0.009);
  const pile = f.kind !== "spread" && (f.n ?? 0) > 0 ? { name: f.pile, b: PILES[f.pile]?.b ?? 0.2, round: /^(SO|BP|D)/.test(f.pile ?? "") } : null;
  const cTxt = String(+c.toFixed(3)), lean = o.lean ?? 0.05, sand = o.sand ?? 0.05;
  const longT = `${nL}-${barTxt(inp.longBar)} มม. @ ${f2(inp.sLong ?? 0)} ม.`, shortT = `${nS}-${barTxt(inp.shortBar)} มม. @ ${f2(inp.sShort ?? 0)} ม.`;
  const longText = r.longText ? `${barTxt(r.longText).replace(/@\s*([\d.]+)/, (_, v) => `@ ${f2(v)}`)} ม.` : longT, shortText = r.shortText ? `${barTxt(r.shortText).replace(/@\s*([\d.]+)/, (_, v) => `@ ${f2(v)}`)} ม.` : shortT;
  const across = (a, b, n) => (n <= 1 ? [(a + b) / 2] : Array.from({ length: n }, (_, i) => a + ((b - a) * i) / (n - 1)));

  // ================= PLAN (centre 0, 0)
  const X0 = -Bx / 2, X1 = Bx / 2, Y0 = -By / 2, Y1 = By / 2;
  rect(X0, Y0, X1, Y1);
  // bottom mat: long bars along X (y positions), short bars along Y (x positions), ends at the cover
  const yL = across(Y0 + c + dL / 2, Y1 - c - dL / 2, nL), xS = across(X0 + c + dS / 2, X1 - c - dS / 2, nS);
  for (const y of yL) bar([[X0 + c, y], [X1 - c, y]], dL);
  for (const x of xS) bar([[x, Y0 + c], [x, Y1 - c]], dS, "C-BAR-EXTRA");
  // perimeter tie (standard detail, not counted in the design)
  const ri = c * 0.6; rect(X0 + ri, Y0 + ri, X1 - ri, Y1 - ri, "C-STIRRUP");
  // piles (dashed)
  for (const [px, py] of r.piles ?? []) {
    if (!pile) break;
    // hidden outline = one entity with the HIDDEN2 line type (user 2026-11-24: one line, not dash pieces)
    if (pile.round) { circle(px, py, pile.b / 2, "C-PILE"); Object.assign(P.at(-1), { lt: "HIDDEN2", lts: 0.4 }); }
    else { const h = pile.b / 2; poly([[px - h, py - h], [px + h, py - h], [px + h, py + h], [px - h, py + h]], "C-PILE", true); Object.assign(P.at(-1), { lt: "HIDDEN2", lts: 0.4, dashed: true }); }
    line(px - 0.04, py, px + 0.04, py, "C-PILE"); line(px, py - 0.04, px, py + 0.04, "C-PILE");
  }
  // pier: outline, tie, bars (faceBars layout of the dowels)
  if (round) { circle(0, 0, bx / 0.886 / 2, "C-CONC"); } else rect(-bx / 2, -by / 2, bx / 2, by / 2);
  { const ix = bx / 2 - ccol - dt / 2, iy = by / 2 - ccol - dt / 2; rect(-ix, -iy, ix, iy, "C-STIRRUP");
    const [fx, fy] = faceBars(nDw).map((v) => Math.max(2, v / 2)), ax = ix - dt / 2 - ddw / 2, ay = iy - dt / 2 - ddw / 2, pts = new Set();
    for (const x of across(-ax, ax, fx)) for (const y of [-ay, ay]) pts.add(`${x.toFixed(4)},${y.toFixed(4)}`);
    for (const y of across(-ay, ay, fy)) for (const x of [-ax, ax]) pts.add(`${x.toFixed(4)},${y.toFixed(4)}`);
    for (const s of pts) { const [x, y] = s.split(",").map(Number); circle(x, y, ddw / 2, "C-BAR"); P.at(-1).c = 1; } }
  // dimensions: chains (pier offsets) + overall on top and on the left; cover at the top right
  chainH([X0, -bx / 2, bx / 2, X1], Y1, Y1 + 0.16); dimH(X0, X1, Y1, Y1 + 0.32, f2(Bx));
  chainV([Y0, -by / 2, by / 2, Y1], X0, X0 - 0.16); dimV(Y0, Y1, X0, X0 - 0.32, f2(By));
  dimH(X1 - c, X1, Y1 - c, Y1 + 0.06, cTxt);
  // pile positions from the centre
  if (pile && (r.piles?.length ?? 0) > 1) { const xs = [...new Set(r.piles.map((p) => +p[0].toFixed(3)))].sort((a, b) => a - b); if (xs.length > 1) chainH([X0, ...xs, X1], Y0, Y0 - 0.16); }
  // section cut ก–ก along X through the centre
  for (const [x, s] of [[X0 - 0.5, -1], [X1 + 0.08, 1]]) { line(x - s * 0.08, 0, x, 0, "C-TITLE"); line(x, 0, x, 0.06, "C-TITLE"); poly([[x, 0.11], [x - 0.02, 0.06], [x + 0.02, 0.06]], "C-TITLE", true); text(x - s * 0.01, -0.03, 0.065, "ก", "C-TITLE", 1, 3); }
  // leaders (right side)
  const LX = X1 + 0.3;
  // text rows spread evenly down the right side; each leader runs level from its object (ring / Y bars cut at the row height, X bar
  // nearest the row) to a knee just outside the footing, then along the text — no crossing leaders (user 2026-11-24)
  const labels = [["X", `ล่างแนว X ${longText}`], ["R", `1-${barTxt(ring)} มม. รัดรอบ`], ...(pile ? [["P", `เข็ม ${pile.name} ${f.n} ต้น (เส้นประ)`]] : []), ["Y", `ล่างแนว Y ${shortText}`]];
  const gapP = Math.max(0.14, (By - 0.1) / Math.max(1, labels.length - 1)), kx = X1 + 0.2, xYr = xS[xS.length - 1];
  const pR = pile ? (r.piles ?? []).reduce((a_, q) => (q[0] > a_[0] ? q : a_), [-Infinity, 0]) : null;
  labels.forEach(([k, s_], i) => {
    const ry = Y1 - 0.05 - i * gapP, yIn = Math.min(Y1 - c, Math.max(Y0 + c, ry));
    const [tx_, ty_] = k === "R" ? [X1 - ri, yIn] : k === "Y" ? [xYr, yIn] : k === "P" ? [pR[0] + pile.b / 2, pR[1]] : [X1 - c - 0.08, yL.reduce((a_, v) => (Math.abs(v - ry) < Math.abs(a_ - ry) ? v : a_), yL[0])];
    const w = tw(s_, TH) + 0.04; arrow(tx_, ty_, tx_ - kx, ty_ - ry || 0); if (Math.abs(ty_ - ry) < 1e-9) P.at(-1).dx = 1, P.at(-1).dy = 0;
    poly([[tx_, ty_], [kx, ry], [LX + w, ry]], "C-TEXT"); text(LX + 0.02, ry + 0.012, TH, s_, "C-TEXT", 0, 1);
  });
  const yTitle = Y0 - (pile && (r.piles?.length ?? 0) > 1 ? 0.42 : 0.24);
  bubble(-0.32, yTitle - 0.08, o.mark ?? "F"); text(-0.2, yTitle - 0.08, 0.075, `แปลนฐานราก ${o.mark ?? ""}${o.count ? ` (${o.count} ฐาน)` : ""}`, "C-TITLE", 0, 2);

  // ================= SECTION ก–ก (along X), ground at yg
  const gap = 0.75, yg = yTitle - 0.3 - gap - 0.45, yb = yg - Df, yt = yb + t, colTop = yg + 0.45;
  // concrete: footing, pier + column broken above the ground
  rect(X0, yb, X1, yt);
  poly([[-bx / 2, yt], [-bx / 2, colTop]]); poly([[bx / 2, yt], [bx / 2, colTop]]);
  poly([[-bx / 2 - 0.03, colTop], [-0.03, colTop], [0, colTop + 0.04], [0.02, colTop - 0.04], [0.05, colTop], [bx / 2 + 0.03, colTop]]);
  // lean concrete + compacted sand under the footing (hatched), ground line with soil marks
  const lx0 = X0 - 0.05, lx1 = X1 + 0.05, yl = yb - lean, ys = yl - sand;
  rect(lx0, yl, lx1, yb, "C-HATCH"); P.at(-1).c = 1; rect(lx0, ys, lx1, yl, "C-HATCH"); P.at(-1).c = 1;
  { let k = 0; for (let x = lx0 + 0.02; x < lx1 - 0.01; x += 0.045, k++) { const y = yl + 0.012 + ((k * 37) % 7) * 0.004; disk(x, y, 0.003, "C-HATCH"); if (k % 3 === 0) poly([[x + 0.012, yl + 0.03], [x + 0.022, yl + 0.012], [x + 0.002, yl + 0.012]], "C-HATCH", true); } }
  for (let x = lx0 + 0.04; x < lx1 - 0.02; x += 0.08) { line(x, ys + 0.008, x - 0.03, ys + 0.04, "C-HATCH"); line(x + 0.025, ys + 0.008, x - 0.005, ys + 0.04, "C-HATCH"); }
  for (const [xa, xb] of [[X0 - 0.45, -bx / 2], [bx / 2, X1 + 0.45]]) { line(xa, yg, xb, yg, "C-CONC"); for (let x = xa + 0.05; x < xb - 0.04; x += 0.1) line(x, yg, x - 0.05, yg - 0.05, "C-HATCH"); }
  // piles under the footing (one per distinct x of the cut), top 5 cm into the footing, broken below
  if (pile) { const xs = [...new Set((r.piles ?? []).map((p) => +p[0].toFixed(3)))]; const pb = pile.b, yp = ys - 0.55;
    for (const px of xs) { line(px - pb / 2, yb + 0.05, px - pb / 2, yp); line(px + pb / 2, yb + 0.05, px + pb / 2, yp); line(px - pb / 2, yb + 0.05, px + pb / 2, yb + 0.05, "C-CONC", true); Object.assign(P.at(-1), { lt: "HIDDEN2", lts: 0.4 });
      poly([[px - pb / 2 - 0.03, yp], [px - 0.02, yp], [px, yp + 0.035], [px + 0.02, yp - 0.035], [px + 0.04, yp], [px + pb / 2 + 0.03, yp]]); } }
  // bottom mat: X bar with 90° hooks up (12db, inside the footing), Y bars as dots on top of it
  const yBL = yb + c + dL / 2, hk = Math.min(Math.max(12 * dL, 0.15), t - c - 0.06), yBS = yb + c + dL + dS / 2;
  bar([[X0 + c, yBL + hk], [X0 + c, yBL], [X1 - c, yBL], [X1 - c, yBL + hk]], dL);
  for (const x of xS) disk(x, yBS, dS / 2, "C-BAR-EXTRA");
  // perimeter tie near the top (seen as a line, cut legs as dots)
  const yR = yt - 0.05; bar([[X0 + ri, yR], [X1 - ri, yR]], dr, "C-STIRRUP"); disk(X0 + ri, yR, dr / 2, "C-STIRRUP"); disk(X1 - ri, yR, dr / 2, "C-STIRRUP");
  // pier bars / dowels down to the mat with the foot bent outwards; ties in the pier and 2 sets in the footing
  const xb = bx / 2 - ccol - dt - ddw / 2, yFoot = yBS + dS / 2 + ddw / 2, foot = Math.max(0.05, Math.min(Math.max(12 * ddw, 0.25), Bx / 2 - c - 0.03 - xb));
  for (const s of [-1, 1]) { bar([[s * (xb + foot), yFoot], [s * xb, yFoot], [s * xb, colTop - 0.02]], ddw); P.at(-1).c = 1; }
  const tx = bx / 2 - ccol - dt / 2;
  for (let y = yt + Math.min(0.05, sTie / 2); y < colTop - 0.03; y += sTie) line(-tx, y, tx, y, "C-STIRRUP");
  const inF = [yt - 0.08, yFoot + 0.1].filter((y, i, a) => y > yFoot + 0.04 && y < yt - 0.03 && (i === 0 || Math.abs(y - a[0]) > 0.04));
  for (const y of inF) line(-tx, y, tx, y, "C-STIRRUP");
  // dims: bottom overall + pier chain; left t / Df − t / total; right cover / layers
  chainH([X0, -bx / 2, bx / 2, X1], ys, ys - 0.14 - (pile ? 0.6 : 0)); dimH(X0, X1, ys, ys - 0.28 - (pile ? 0.6 : 0), f2(Bx));
  chainV([yb, yt, yg], X0, X0 - 0.16); dimV(yb, yg, X0, X0 - 0.32, f2(Df));
  dimV(yb, yb + c, X1, X1 + 0.16, cTxt);
  // foot length of the pier bars (on the left foot)
  dimH(-xb - foot, -xb, yFoot, yFoot + 0.09, f2(foot));
  // levels
  const lvl = (y, s) => { const w = tw(s, DH) + 0.08, x = X0 - 0.45 - w; P.push({ t: "tri", x: x + 0.04, y, s: 0.04, layer: "C-DIM" }); line(x, y, X0 - 0.4, y, "C-DIM"); text(x + 0.09, y + 0.012, DH, s, "C-DIM", 0, 1); };
  lvl(yg, "±0.00 ระดับดิน"); lvl(yb, "VARY ท้องฐานราก");
  // leaders (right)
  // leaders straight up to rows above the footing (user 2026-11-24 "เยื้องขึ้นด้านบนเหมือนตัวอย่าง"): the top row has the leftmost leader,
  // each lower row starts further right → no leader crosses a text
  { const xa = Math.min(X1 - c - 0.06, bx / 2 + 0.07), xc = X1 - c - 0.035, xm = (xa + xc) / 2, near = (x) => xS.reduce((a, v) => (Math.abs(v - x) < Math.abs(a - x) ? v : a), xS[0]);
    const xY = Math.min(xc - 0.01, Math.max(xa + 0.01, near(xm))), row = (i) => yt + 0.1 + i * 0.13;
    upLeader(xa, yR, row(2), `1-${barTxt(ring)} มม. รัดรอบ`); upLeader(xY, yBS + dS / 2, row(1), `ล่างแนว Y ${shortText}`); upLeader(xc, yBL + dL / 2, row(0), `ล่างแนว X ${longText}`); }
  // lean concrete / sand named at the right of their layers (as on the sheet)
  for (const [y, ty, s] of [[yb - lean / 2, yb - lean / 2 + 0.035, `คอนกรีตหยาบ หนา ${f2(lean)} ม.`], [yl - sand / 2, yl - sand / 2 - 0.045, `ทรายอัดแน่น หนา ${f2(sand)} ม.`]]) {
    const w = tw(s, TH * 0.9) + 0.04; arrow(lx1, y, -1, 0); poly([[lx1, y], [X1 + 0.38, ty], [X1 + 0.42 + w, ty]], "C-TEXT"); text(X1 + 0.44, ty + 0.01, TH * 0.9, s, "C-TEXT", 0, 1); }
  if (pile) { const px = (r.piles?.[0]?.[0] ?? 0) + pile.b / 2, y = ys - 0.3; leader(Math.max(...(r.piles ?? [[0]]).map((q) => q[0])) + pile.b / 2, y, X1 + 0.42, y, `เข็ม ${pile.name} ${f.n} ต้น ฝังในฐาน 0.05 ม.`); void px; }
  const yST = ys - (pile ? 0.6 : 0) - 0.5;
  bubble(-0.32, yST, o.mark ?? "F"); text(-0.2, yST, 0.075, "รูปตัด ก–ก", "C-TITLE", 0, 2);
  text(-0.2, yST - 0.11, DH, `มาตราส่วน 1:25 · ระยะหุ้ม ${Math.round(c * 1000) / 10} ซม.${o.colName ? ` · เสา ${o.colName}` : ""}`, "C-DIM", 0, 2);

  const COL = { "C-CONC": 2, "C-STIRRUP": 2, "C-BAR": 3, "C-BAR-EXTRA": 3, "C-DIM": 1, "C-TEXT": 2, "C-TITLE": 3, "C-HATCH": 8, "C-PILE": 2, "C-TAG": 5 };
  for (const p of P) if (p.t === "dim") Object.assign(p, { cd: p.cd ?? 1, ce: p.ce ?? 8, ct: p.ct ?? 3 });
  for (const p of P) if (p.c == null && p.t !== "dim") p.c = p.t === "text" ? (p.layer === "C-TAG" ? 4 : 3) : p.t === "disk" && p.layer !== "C-TEXT" ? 8 : p.ext ? 8 : p.t === "tri" ? 3 : COL[p.layer] ?? 7;
  const pad = 0.05;
  return { items: P, box: [x0 - pad, y0 - pad, x1 + pad, y1 + pad] };
}

// one line per mark for the schedule (plan sheet / UI)
export function footingScheduleRow(f, mark, count) {
  const r = f.r ?? {}, inp = f.inp ?? {};
  const pile = f.kind !== "spread" && (f.n ?? 0) > 0 ? `${f.n} × ${f.pile}` : "ฐานแผ่";
  const bt = (s) => barTxt(s ?? "").replace(/@\s*([\d.]+)/, (_, v) => `@ ${f2(v)}`);
  return [mark, String(count), `${f2(r.Bx ?? 0)} × ${f2(r.By ?? 0)} × ${f2(inp.t ?? 0)}`, f2(Math.max(inp.Df ?? 0, inp.t ?? 0)), pile,
    bt(r.longText ?? `${inp.longBar} @${inp.sLong}`), bt(r.shortText ?? `${inp.shortBar} @${inp.sShort}`), `${f2(inp.bx ?? 0)} × ${f2(inp.by ?? 0)}`, `${inp.dowelN ?? "-"}-${barTxt(inp.dowelBar ?? "")}`];
}
