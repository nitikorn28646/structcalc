// Stair section detail (user 2026-11-19: "เขียนรูปตัดบันไดและเหล็กบันไดให้สวยกว่านี้" + their beam detail sheet as the model).
// One model in METRES (x along the run from the foot, y up from the foot level) used by the app / report (SVG) and by the DXF sheet:
// steps (n risers × R, treads T), waist slab t square to the pitch, the head support (beam at the head edge, or the landing + its beam),
// the foot support (beam / slab / ground), bars (bottom main bars along the soffit bent into the supports with 90° hooks, top bars at the
// supports, distribution bars as dots), dimensions, levels and labelled leaders. Drawing only — every number comes from the analysis /
// design (stairGeom, an.stairs, slabDesign); the top bars at the supports are a detailing rule (stated on the drawing), not a calculation.

const BAR_D = { "RB 6": 0.006, "RB 9": 0.009, "DB 10": 0.01, "DB 12": 0.012, "DB 16": 0.016, "DB 20": 0.02, "DB 25": 0.025 };
// "DB 12 @ 0.15" → { bar, d, s }
export function parseBarText(s, fallback = "DB 12 @ 0.20") {
  const m = /^\s*((?:RB|DB)\s*\d+)\s*@\s*([\d.]+)/i.exec(s ?? "") ?? /^\s*((?:RB|DB)\s*\d+)\s*@\s*([\d.]+)/i.exec(fallback);
  const bar = m[1].replace(/\s+/, " ").toUpperCase().replace("RB", "RB").replace(/(RB|DB)\s*/, "$1 ");
  return { bar, d: BAR_D[bar] ?? (parseInt(bar.replace(/\D/g, ""), 10) / 1000 || 0.012), s: Number(m[2]) || 0.2 };
}

const lv = (z) => (Math.abs(z) < 0.005 ? "±0.00" : `${z > 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`);
const fx = (v, n = 2) => Number(v).toFixed(n);

// o: { kind "long"|"landing", n (risers in the drawn flight), R, T, t, L (plan length, head support centre at x = L), Hf (rise of the
//      drawn flight), landingL, head {b, h, name}, foot "beam"|"panel"|"ground"|"none"|null, footBeam {b, h, name}, cover (m),
//      main "DB 12 @ 0.15", temp "RB 9 @ 0.20", zFoot, zTop (levels), title, side (true = the side / cantilever kinds: profile only) }
export function stairDetailModel(o) {
  const it = [], add = (x) => it.push(x);
  const n = Math.max(2, o.n | 0), R = o.R, T = o.T, t = o.t, th = Math.atan2(R, T), cs = Math.cos(th), tn = Math.tan(th);
  const Hf = o.Hf ?? n * R, run = (n - 1) * T, c = o.cover ?? 0.02, H = o.head ?? { b: 0.2, h: 0.4 }, hb = H.b, hh = H.h;
  const land = o.kind === "landing" ? Math.max(0.6, o.landingL ?? 1.2) : 0;
  const L = Math.max(o.L ?? 0, run + land + hb / 2), xHead = L, xTopRiser = L - hb / 2 - land, xs = xTopRiser - run; // first riser
  const main = parseBarText(o.main), temp = parseBarText(o.temp, "RB 9 @ 0.20"), cm = c + main.d / 2;
  const nose = (x) => R + (x - xs) * tn, soff = (x) => nose(x) - t / cs; // nosing line / soffit of the flight

  // ---- concrete: flight (+ landing) and the head support
  const prof = [[xs, 0]];
  for (let i = 0; i < n; i++) { prof.push([xs + i * T, (i + 1) * R]); if (i < n - 1) prof.push([xs + (i + 1) * T, (i + 1) * R]); }
  const xIn = xHead - hb / 2; // head beam inner face
  let soffitPts;
  if (land) { // landing slab from the last riser to the head beam, thickness t; knee where the flight soffit meets the landing soffit
    const xk = xs + (Hf - t - R + t / cs) / tn;
    prof.push([xIn, Hf]); soffitPts = [[xIn, Hf - t], [xk, Hf - t]];
  } else { prof.push([xIn, Hf]); soffitPts = [[xIn, Math.max(Hf - hh + 0.02, soff(xIn))]]; }
  const xf0 = xs + Math.max(0, (t / cs - R) / tn); // soffit meets the foot level
  soffitPts.push([xf0, 0]);
  add({ t: "poly", pts: [...prof, ...soffitPts], layer: "C-CONC", closed: true, fill: "stair" });
  // head beam (or landing beam) cut in section, hatched
  const beamRect = (xc, ytop, b, h) => [[xc - b / 2, ytop - h], [xc + b / 2, ytop - h], [xc + b / 2, ytop], [xc - b / 2, ytop]];
  add({ t: "poly", pts: beamRect(xHead, Hf, hb, hh), layer: "C-CONC", closed: true, fill: "beam", hatch: true });
  add({ t: "line", x1: xHead + hb / 2, y1: Hf, x2: xHead + hb / 2 + 0.45, y2: Hf, layer: "C-CONC" }); // floor slab beyond (break)
  add({ t: "line", x1: xHead + hb / 2, y1: Hf - 0.1, x2: xHead + hb / 2 + 0.45, y2: Hf - 0.1, layer: "C-CONC" });
  add({ t: "brk", x: xHead + hb / 2 + 0.45, y0: Hf - 0.16, y1: Hf + 0.06, layer: "C-CONC" });
  // foot support
  const FB = o.footBeam ?? { b: 0.2, h: 0.4 }, xfc = xs + FB.b / 2;
  if (o.foot === "beam") add({ t: "poly", pts: beamRect(xfc, 0, FB.b, FB.h), layer: "C-CONC", closed: true, fill: "beam", hatch: true });
  if (o.foot === "beam" || o.foot === "panel") { // floor slab at the foot level, broken off
    add({ t: "line", x1: xs - 0.6, y1: 0, x2: xs, y2: 0, layer: "C-CONC" }); add({ t: "line", x1: xs - 0.6, y1: -0.1, x2: o.foot === "beam" ? xs : xf0 + 0.3, y2: -0.1, layer: "C-CONC" });
    add({ t: "brk", x: xs - 0.6, y0: -0.16, y1: 0.06, layer: "C-CONC" });
    if (o.foot === "panel") add({ t: "line", x1: xs, y1: 0, x2: xf0 + 0.3, y2: 0, layer: "C-CONC" });
  }
  if (o.foot === "ground" || o.foot === "none" || !o.foot) { // natural ground / floor on ground at the foot
    add({ t: "line", x1: xs - 0.6, y1: 0, x2: xf0 + 0.4, y2: 0, layer: "C-CONC" });
    for (let x = xs - 0.55; x < xf0 + 0.4; x += 0.08) add({ t: "line", x1: x, y1: 0, x2: x - 0.06, y2: -0.06, layer: "C-ELEV" });
  }

  // ---- bars
  const off = (x, d) => soff(x) + d / cs; // a line parallel to the soffit, d above it (measured square to the pitch)
  if (!o.side) {
    const yb = (x) => off(x, cm), hook = Math.max(12 * main.d, 0.1), hookT = Math.max(12 * main.d, 0.1);
    // bottom main bars: from the foot (hooked into the support) along the soffit, into the head support (horizontal, 90° hook down)
    const xbS = xs + c + 0.02, yHeadBar = land ? Hf - t + cm : yb(xIn);
    const bottom = [];
    if (o.foot === "beam") bottom.push([xfc - FB.b / 2 + cm, -FB.h + cm + hook], [xfc - FB.b / 2 + cm, cm]);
    else bottom.push([xbS, cm]);
    const xFootBend = xs + Math.max(0, (cm + t / cs - R) / tn - 0) ; // where the bottom-bar line reaches the foot bottom cover
    bottom.push([Math.max(xFootBend, bottom.at(-1)[0] + 0.02), cm]);
    if (land) { const xk = xs + (Hf - t - R + t / cs) / tn, xkb = xs + (Hf - t + cm - R + t / cs - cm / cs) / tn; bottom.push([xkb, Hf - t + cm]); bottom.push([xHead + hb / 2 - cm, Hf - t + cm]); void xk; }
    else { bottom.push([xIn, yb(xIn)]); bottom.push([xHead + hb / 2 - cm, yb(xIn)]); }
    bottom.push([xHead + hb / 2 - cm, (land ? Hf - t + cm : yb(xIn)) - hook]);
    add({ t: "bar", pts: bottom, d: main.d, layer: "C-BAR" });
    // top bars at the supports (detailing): parallel to the soffit, t − cover from it, L/4 from each support, hooked into the supports
    const L4 = Math.max(0.6, L / 4), dTop = t - cm;
    const xTop0 = xIn - L4; // head end: along the waist, then horizontal into the head beam / slab top
    const top = [[Math.max(xs + 0.1, xTop0), off(Math.max(xs + 0.1, xTop0), dTop)]];
    if (land) top.splice(0, 1, [xIn - L4, Hf - c - main.d / 2]);
    top.push([xIn, land ? Hf - c - main.d / 2 : Math.min(Hf - cm, off(xIn, dTop))]);
    top.push([xHead + hb / 2 - cm, Hf - cm]); top.push([xHead + hb / 2 - cm, Hf - cm - hookT]);
    add({ t: "bar", pts: top, d: main.d, layer: "C-BAR-EXTRA" });
    if (o.foot === "beam") { // foot end: down into the foot beam
      const x1 = xs + Math.min(L4, run * 0.6), pts = [[xfc + FB.b / 2 - cm, -hookT], [xfc + FB.b / 2 - cm, Math.min(off(xfc + FB.b / 2, dTop), R - cm)], [x1, off(x1, dTop)]];
      add({ t: "bar", pts, d: main.d, layer: "C-BAR-EXTRA" });
    }
    // distribution bars: dots on the inner side of the bottom bars (and under the top bars), every s along the bar
    const dot = (x, y) => add({ t: "dot", x, y, r: temp.d / 2, layer: "C-BAR" });
    const nx = -Math.sin(th), ny = cs; // unit normal into the waist
    const along = (x0, x1, dN) => { const Ls = (x1 - x0) / cs, k = Math.max(1, Math.floor(Ls / temp.s)); for (let i = 0; i <= k; i++) { const x = x0 + ((x1 - x0) * i) / k, y = off(x, dN); dot(x, y); } };
    const dIn = cm + main.d / 2 + temp.d / 2;
    along(Math.max(xFootBend, xs + 0.05), land ? xs + (Hf - t - R + t / cs) / tn - 0.05 : xIn - 0.05, dIn);
    if (land) for (let x = xs + (Hf - t - R + t / cs) / tn + 0.05; x < xIn - 0.02; x += temp.s) dot(x, Hf - t + dIn);
    void nx; void ny;
    // leaders
    const xm = xs + run * 0.42, ym = yb(xm);
    add({ t: "lead", from: [xm, ym], to: [xm + 0.25, ym - 0.55], s: `${main.bar} มม. @ ${fx(main.s)} ม. (เหล็กหลักล่าง)`, layer: "C-TEXT" });
    const xd = xs + run * 0.62; add({ t: "lead", from: [xd, off(xd, dIn)], to: [xd + 0.3, off(xd, dIn) - 0.42], s: `${temp.bar} มม. @ ${fx(temp.s)} ม. (เหล็กกันร้าว)`, layer: "C-TEXT" });
    const xt = (xIn - L4 + xIn) / 2; add({ t: "lead", from: [xt, land ? Hf - c : off(xt, dTop)], to: [xt - 0.55, (land ? Hf : off(xt, dTop)) + 0.45], s: `${main.bar} มม. @ ${fx(Math.min(2 * main.s, 0.3))} ม. (เหล็กบน ยาว L/4 ≥ ${fx(L4)} ม.)`, layer: "C-TEXT", ha: 2 });
  }

  // ---- dimensions, levels, names
  const dh = 0.035;
  add({ t: "dim", x1: xs, y1: 0, x2: xs + run, y2: 0, off: -0.32 - (o.foot === "beam" ? FB.h : 0), label: `${n - 1} × ${fx(T)} = ${fx(run)} ม.`, h: dh });
  add({ t: "dim", x1: xHead + hb / 2 + 0.6, y1: 0, x2: xHead + hb / 2 + 0.6, y2: Hf, off: 0.15, label: `${n} × ${fx(R, 3)} = ${fx(Hf)} ม.`, h: dh });
  const xw = xs + run * 0.25, yw = soff(xw); // waist thickness square to the pitch
  add({ t: "lead", from: [xw - Math.sin(th) * t * 0.5, yw + cs * t * 0.5], to: [xw - 0.55, yw - 0.25], s: `ท้องบันไดหนา ${fx(t)} ม.`, layer: "C-DIM", ha: 2 });
  if (land) add({ t: "dim", x1: xTopRiser, y1: Hf, x2: xIn, y2: Hf, off: 0.22, label: `ชานพัก ${fx(land)} ม.`, h: dh });
  add({ t: "level", x: xs - 0.45, y: 0, s: lv(o.zFoot ?? 0) });
  add({ t: "level", x: xHead + hb / 2 + 0.2, y: Hf, s: lv(o.zTop ?? Hf) });
  add({ t: "text", x: xHead, y: Hf - hh - 0.1, h: 0.032, s: H.name ? `${H.name} ${Math.round(hb * 100)}×${Math.round(hh * 100)}` : `คาน ${Math.round(hb * 100)}×${Math.round(hh * 100)}`, layer: "C-TEXT", ha: 1, va: 3 });
  const footTxt = { beam: FB.name ? `${FB.name} ${Math.round(FB.b * 100)}×${Math.round(FB.h * 100)}` : `คาน ${Math.round(FB.b * 100)}×${Math.round(FB.h * 100)}`, panel: "วางบนแผ่นพื้นชั้นล่าง", ground: "ลงดิน / พื้นบนดิน", none: "⚠ ไม่มีที่รับปลายล่าง" }[o.foot] ?? "";
  if (footTxt) add({ t: "text", x: o.foot === "beam" ? xfc : xs, y: o.foot === "beam" ? -FB.h - 0.1 : -0.12, h: 0.032, s: footTxt, layer: o.foot === "none" ? "C-TITLE" : "C-TEXT", ha: 1, va: 3 });
  if (o.side) add({ t: "text", x: xs + run / 2, y: -0.2, h: 0.032, s: o.side, layer: "C-TEXT", ha: 1, va: 3 });

  // bounds (dimensions and notes included)
  const xs0 = Math.min(xs - 1.0, xIn - Math.max(0.6, L / 4) - 1.3), xs1 = xHead + hb / 2 + 1.0, ys0 = -(o.foot === "beam" ? FB.h : 0) - 0.8, ys1 = Hf + 0.75;
  return { items: it, box: [xs0, ys0, xs1, ys1], title: o.title ?? "รูปตัดบันได", sub: o.sub ?? "" };
}
