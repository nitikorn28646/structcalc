// Isolated spread footing by WSD: soil pressure with biaxial moments, flexure at the pier face, one-way and
// punching shear, bond / anchorage of the mat bars and pier dowels. Units: kg, cm, ksc; plan sizes in m.
import { SLAB_BARS, allowableFs } from "./tables.js";
import { roundDown } from "./beam.js";

const Ec_DENSITY = 2.323;

export function spreadFooting(inp) {
  const r = {};
  const bl = SLAB_BARS[inp.longBar], bs = SLAB_BARS[inp.shortBar], bd = SLAB_BARS[inp.dowelBar];
  if (!bl || !bs || !bd) throw new Error("unknown bar size");
  const { fcPrime: fcp, fy, Bx, By, t, P, Mx, My } = inp;
  const sq = Math.sqrt(fcp);

  // WSD constants
  const fcRaw = inp.F * fcp;
  r.fc = inp.capFc !== false && fcRaw > 65 ? 65 : fcRaw;
  r.fs = allowableFs(fy, inp.F);
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * sq;
  r.n = inp.Es / r.Ec;
  r.nOk = r.n >= 6;
  r.k = 1 / (1 + r.fs / (r.n * r.fc));
  r.j = 1 - r.k / 3;
  r.R = 0.5 * r.fc * r.k * r.j;

  // pier (circle → equivalent square side 0.886D)
  r.bx = inp.pier === "circle" ? 0.886 * inp.D : inp.bx;
  r.by = inp.pier === "circle" ? 0.886 * inp.D : inp.by;

  // soil pressure: gross (footing + soil above) and net (column load only)
  const A = Bx * By;
  const gross = (P + t * A * 2400 + (inp.Df - t) * inp.gamma * A) / A;
  const mY = (6 * Mx) / (Bx * By ** 2), mX = (6 * My) / (By * Bx ** 2);
  r.qmaxY = gross + mY; r.qminY = gross - mY;
  r.qmaxX = gross + mX; r.qminX = gross - mX;
  r.qOk = r.qmaxY <= inp.qa && r.qmaxX <= inp.qa;
  r.qminOk = r.qminY >= 0 && r.qminX >= 0;
  r.qnMaxY = P / A + mY; r.qnMinY = P / A - mY; // varies along y (from Mx)
  r.qnMaxX = P / A + mX; r.qnMinX = P / A - mX; // varies along x (from My)

  // effective depths: long bars in the bottom layer, short bars on top of them
  r.dLong = t * 100 - inp.cover - bl.d / 2;
  r.dShort = t * 100 - inp.cover - bl.d - bs.d / 2;

  // pressure at a distance x (m) from the low-pressure edge along a side of length B
  const qAt = (x, B, qmax, qmin) => ((qmax - qmin) * x) / B + qmin;
  // cantilever moment at the pier face for a trapezoidal pressure block
  const faceMoment = (B, b, W, qmax, qmin) => {
    const a = (B - b) / 2, qf = qAt(a + b, B, qmax, qmin);
    return qf * W * a ** 2 / 2 + ((qmax - qf) * W * a * (a * 2 / 3)) / 2;
  };
  const beamShear = (B, b, W, d, qmax, qmin) => {
    const x1 = B / 2 + b / 2 + d / 100;
    return ((qAt(x1, B, qmax, qmin) + qmax) * (B - x1) * W) / 2;
  };
  r.Myy = faceMoment(Bx, r.bx, By, r.qnMaxX, r.qnMinX);
  r.Mxx = faceMoment(By, r.by, Bx, r.qnMaxY, r.qnMinY);
  r.V1yy = beamShear(Bx, r.bx, By, r.dLong, r.qnMaxX, r.qnMinX);
  r.V1xx = beamShear(By, r.by, Bx, r.dShort, r.qnMaxY, r.qnMinY);

  // punching: half-footing between the centre line and the high-pressure edge, minus the area inside d/2
  const dHalf = r.dLong / 2;
  const qcX = (r.qnMaxX + r.qnMinX) / 2, qcY = (r.qnMaxY + r.qnMinY) / 2;
  const q12X = qAt(Bx / 2 + r.bx / 2 + r.dLong / 200, Bx, r.qnMaxX, r.qnMinX);
  const q12Y = qAt(By / 2 + r.by / 2 + r.dLong / 200, By, r.qnMaxY, r.qnMinY);
  r.V2yy = 0.5 * (qcY + r.qnMaxY) * (By / 2) * Bx - 0.5 * (qcY + q12Y) * (r.by / 2 + dHalf / 100) * (r.bx + r.dLong / 100);
  r.V2xx = 0.5 * (qcX + r.qnMaxX) * (Bx / 2) * By - 0.5 * (qcX + q12X) * (r.bx / 2 + dHalf / 100) * (r.by + r.dShort / 100);
  r.perimeter = (r.bx * 100 + 2 * dHalf) * 2 + (r.by * 100 + 2 * dHalf) * 2;

  // checks
  r.dReqX = Math.sqrt((r.Mxx * 100) / (r.R * Bx * 100));
  r.dReqY = Math.sqrt((r.Myy * 100) / (r.R * By * 100));
  r.dOk = r.dShort >= r.dReqX && r.dLong >= r.dReqY;
  r.vc = 0.29 * sq;
  r.vX = r.V1xx / (Bx * 100 * r.dShort);
  r.vY = r.V1yy / (By * 100 * r.dLong);
  r.vOk = r.vX < r.vc && r.vY < r.vc;
  r.vcp = 0.53 * sq;
  r.vpX = r.V2xx / (r.perimeter * r.dLong);
  r.vpY = r.V2yy / (r.perimeter * r.dShort);
  r.vpOk = r.vpX < r.vcp && r.vpY < r.vcp;

  // bars: count across the footing at the chosen spacing
  r.nLong = Math.floor(By / inp.sLong + 1);
  r.nShort = Math.floor(Bx / inp.sShort + 1);
  const bond = (d, db) => {
    const ua = fy === 2400 ? 11 : d <= 30 ? 35 : 25;
    const u = (fy === 2400 ? (d <= 30 ? 1.615 : 1.145) : (d <= 30 ? 3.23 : 2.29)) * sq / db;
    return [ua, u];
  };
  [r.uaL, r.uL] = bond(r.dLong, bl.d);
  [r.uaS, r.uS] = bond(r.dShort, bs.d);
  r.uaS = fy === 2400 ? 11 : r.dLong <= 30 ? 35 : 25; // the reference applies the long-bar depth to this limit
  // bar perimeter needed for bond: average pressure over the cantilever × its area / (u·j·d)
  const shearOnCantilever = (B, b, W, qmax, qmin) => ((qmax + qAt(B / 2 + b / 2, B, qmax, qmin)) / 2) * ((B - b) / 2) * W;
  const Vx = shearOnCantilever(Bx, r.bx, By, r.qnMaxX, r.qnMinX), Vy = shearOnCantilever(By, r.by, Bx, r.qnMaxY, r.qnMinY);
  r.perimReqL = Vx / (r.uL * r.j * r.dLong);
  r.perimReqS = Vy / (r.uS * r.j * r.dShort);
  r.perimL = r.nLong * bl.p;
  r.perimS = r.nShort * bs.p;
  r.perimOkL = r.perimL >= r.perimReqL;
  r.perimOkS = r.perimS >= r.perimReqS;
  r.AsMinL = (14 / fy) * By * 100 * r.dLong;
  r.AsMinS = (14 / fy) * Bx * 100 * r.dShort;
  r.AsReqL = (r.Myy * 100) / (r.fs * r.j * r.dLong);
  r.AsReqS = (r.Mxx * 100) / (r.fs * r.j * r.dShort);
  r.AsProvL = bl.A * r.nLong;
  r.AsProvS = bs.A * r.nShort;
  r.AsOkL = r.AsProvL >= r.AsReqL && r.AsProvL >= r.AsMinL;
  r.AsOkS = r.AsProvS >= r.AsReqS && r.AsProvS >= r.AsMinS;
  r.ancL = (bl.d * r.fs) / (4 * Math.min(r.uL, r.uaL));
  r.ancS = (bs.d * r.fs) / (4 * Math.min(r.uS, r.uaS));
  r.ancAvailL = ((Bx - r.bx) * 100) / 2 - inp.cover;
  r.ancAvailS = ((By - r.by) * 100) / 2 - inp.cover;
  r.ancOkL = r.ancAvailL >= r.ancL;
  r.ancOkS = r.ancAvailS >= r.ancS;

  // pier dowels
  r.uaD = fy === 2400 ? 11 : 28;
  r.uD = (fy === 2400 ? 0.86 : 1.72) * sq;
  r.perimReqD = Vx / (r.uD * r.j * r.dLong);
  r.perimD = inp.dowelN * bd.p;
  r.perimOkD = r.perimD >= r.perimReqD;
  r.ancD = (bd.d * r.fs) / (4 * Math.min(r.uD, r.uaD)) / 100;
  r.ancUseD = roundDown(r.ancD + r.ancD / 4, 2);

  // bearing on the footing under the pier
  r.bearing = P / (r.bx * 100 * (r.by * 100));
  r.fnb1 = 0.25 * fcp;
  r.fnb2 = 0.375 * fcp;
  r.bearingOk = r.bearing <= r.fnb1;
  r.longText = `${r.nLong}-${inp.longBar} @ ${inp.sLong}`;
  r.shortText = `${r.nShort}-${inp.shortBar} @ ${inp.sShort}`;
  return r;
}

// Pile sections (TIS driven piles and bored piles): area cm², perimeter cm, width/diameter m.
export const PILES = {
  "I-18": { A: 235, p: 83, b: 0.18 }, "I-22": { A: 332, p: 105, b: 0.22 }, "I-26": { A: 460, p: 126, b: 0.26 },
  "I-30": { A: 570, p: 154, b: 0.3 }, "I-35": { A: 880, p: 165, b: 0.35 }, "I-40": { A: 1235, p: 180, b: 0.4 },
  "S-16": { A: 256, p: 64, b: 0.16 }, "S-18": { A: 324, p: 72, b: 0.18 }, "S-22": { A: 484, p: 88, b: 0.22 },
  "S-26": { A: 676, p: 104, b: 0.26 }, "S-30": { A: 900, p: 120, b: 0.3 }, "S-35": { A: 1225, p: 140, b: 0.35 },
  "S-40": { A: 1600, p: 160, b: 0.4 }, "SO-40": { A: 1286, p: 160, b: 0.4 }, "SO-525": { A: 2650, p: 210, b: 0.525 },
  "HP-15": { A: 138, p: 50, b: 0.15 },
  "Ø0.35": { A: 960, p: 110, b: 0.35, bored: true }, "Ø0.40": { A: 1260, p: 125.7, b: 0.4, bored: true },
  "Ø0.50": { A: 1960, p: 157.1, b: 0.5, bored: true }, "Ø0.60": { A: 2830, p: 188.5, b: 0.6, bored: true },
  "Ø0.80": { A: 5030, p: 251.3, b: 0.8, bored: true }, "Ø1.00": { A: 7850, p: 314.2, b: 1, bored: true },
};

// Standard pile groups: centres (m) for n piles at spacings sx, sy.
export function pileLayout(n, sx, sy) {
  const h = Math.sqrt(3) / 2;
  const grid = (xs, ys) => xs.flatMap((x) => ys.map((y) => [x, y]));
  switch (n) {
    case 1: return [[0, 0]];
    case 2: return [[-sx / 2, 0], [sx / 2, 0]];
    case 3: return [[-sx / 2, -sy * h / 3], [sx / 2, -sy * h / 3], [0, (2 * sy * h) / 3]];
    case 4: return grid([-sx / 2, sx / 2], [-sy / 2, sy / 2]);
    case 5: return [...grid([-sx, sx], [-sy, sy]), [0, 0]]; // corners at ±s from the centre pile
    case 6: return grid([-sx, 0, sx], [-sy / 2, sy / 2]);
    case 7: return [...grid([-sx, sx], [-sy, 0, sy]), [0, 0]]; // two columns of three plus the centre pile
    case 8: return grid([-sx, 0, sx], [-sy, 0, sy]).filter(([x, y]) => x || y);
    case 9: return grid([-sx, 0, sx], [-sy, 0, sy]);
    default: throw new Error("1–9 piles only");
  }
}

// Pile cap on n piles: every pile is designed for the largest net pile load (as in the reference sheets);
// piles straddling a critical section count by the fraction (distance + 15)/30 of a 30 cm pile.
export function pileCap(inp) {
  const r = {};
  const pile = PILES[inp.pile], bl = SLAB_BARS[inp.longBar], bs = SLAB_BARS[inp.shortBar], bd = SLAB_BARS[inp.dowelBar];
  if (!pile || !bl || !bs || !bd) throw new Error("unknown pile or bar size");
  const { fcPrime: fcp, fy, t, P, Mx, My, n } = inp;
  const sq = Math.sqrt(fcp);
  const fcRaw = inp.F * fcp;
  r.fc = inp.capFc !== false && fcRaw > 65 ? 65 : fcRaw;
  r.fs = allowableFs(fy, inp.F);
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * sq;
  r.n = inp.Es / r.Ec;
  r.k = 1 / (1 + r.fs / (r.n * r.fc));
  r.j = 1 - r.k / 3;
  r.R = 0.5 * r.fc * r.k * r.j;
  r.bx = inp.pier === "circle" ? 0.886 * inp.D : inp.bx;
  r.by = inp.pier === "circle" ? 0.886 * inp.D : inp.by;

  // cap plan from the pile group: edge distance 1.3 pile widths + cover, rounded up to 0.1 m
  const piles = pileLayout(n, inp.sx, inp.sy);
  r.piles = piles;
  const xs = piles.map((p) => p[0]), ys = piles.map((p) => p[1]);
  const roundUp1 = (v) => Math.ceil(Number((v * 10).toFixed(9))) / 10;
  r.Bx = roundUp1(Math.max(...xs) - Math.min(...xs) + pile.b * 1.3 * 2 + (inp.cover * 2) / 100);
  r.By = roundUp1(Math.max(...ys) - Math.min(...ys) + pile.b * 1.3 * 2 + (inp.cover * 2) / 100);
  // 3 piles: triangular cap with cut corners — the pile triangle offset outward by the edge distance e
  if (n === 3) {
    const e = pile.b * 1.3 + inp.cover / 100;
    const out = [];
    piles.forEach((v, i) => {
      for (const w of [piles[(i + 2) % 3], piles[(i + 1) % 3]]) {
        const [ex, ey] = [w[0] - v[0], w[1] - v[1]], L = Math.hypot(ex, ey);
        let [nx, ny] = [ey / L, -ex / L]; // edge normal, pointed away from the pile-group centre
        if (nx * v[0] + ny * v[1] < 0) [nx, ny] = [-nx, -ny];
        out.push([v[0] + e * nx, v[1] + e * ny]);
      }
    });
    r.outline = out;
    r.capArea = Math.abs(out.reduce((a, p, i) => { const q = out[(i + 1) % out.length]; return a + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    r.Bx = roundUp1(Math.max(...out.map((p) => p[0])) - Math.min(...out.map((p) => p[0])));
    r.By = roundUp1(Math.max(...out.map((p) => p[1])) - Math.min(...out.map((p) => p[1])));
  }
  // single-row caps take the width across the row as given (1-pile caps both sides)
  if (n <= 2 && inp.capWidth > 0) r.By = inp.capWidth;
  if (n === 1 && inp.capWidth > 0) r.Bx = inp.capWidth;

  // pile loads
  const sx2 = xs.reduce((a, x) => a + x * x, 0), sy2 = ys.reduce((a, y) => a + y * y, 0);
  const mTerm = (sx2 ? (My * Math.max(...xs.map(Math.abs))) / sx2 : 0) + (sy2 ? (Mx * Math.max(...ys.map(Math.abs))) / sy2 : 0);
  const area = r.capArea ?? r.Bx * r.By;
  const capW = (inp.Df - t) * area * inp.gamma + t * area * 2400;
  r.Ptmax = (P + capW) / n + mTerm;
  r.Ptnet = P / n + mTerm;
  r.P1 = 0.375 * fcp * pile.A;
  r.P2 = 0.375 * inp.fcPile * pile.A;
  const L = inp.pileL, per = pile.p / 100;
  r.Pf = L <= 7 ? 600 * per * L : ((800 + (800 + 200 * (L - 7))) * 0.5) * per * (L - 7) + 600 * per * 7;
  r.Pallow = inp.Ptest > 0 ? Math.min(inp.Ptest, r.P1, r.P2) : Math.min(r.P1, r.P2, r.Pf);
  r.pileOk = r.Pallow >= r.Ptmax;

  r.dLong = t * 100 - inp.cover - bl.d / 2;
  r.dShort = t * 100 - inp.cover - bl.d - bs.d / 2;

  // pile share across a section line at distance c (cm) from the pier face
  const frac = (dist) => Math.min(1, Math.max(0, (dist + 15) / 30));
  const side = (axis) => piles.filter((p) => p[axis] > 1e-9);
  const face = { 0: r.bx / 2, 1: r.by / 2 };
  r.Myy = side(0).reduce((a, p) => a + r.Ptnet * (p[0] - face[0]), 0); // bending about y, steel along x (long)
  r.Mxx = side(1).reduce((a, p) => a + r.Ptnet * (p[1] - face[1]), 0);
  r.V1x = side(0).reduce((a, p) => a + frac((p[0] - face[0]) * 100 - r.dLong) * r.Ptnet, 0);
  r.V1y = side(1).reduce((a, p) => a + frac((p[1] - face[1]) * 100 - r.dShort) * r.Ptnet, 0);
  // punching: pile distance beyond the d/2 line measured along each axis separately (as in the reference)
  // the whole column load P scaled by the share of the outermost pile row beyond the line
  const beyond = (axis, dHalf) => (Math.max(...piles.map((p) => Math.abs(p[axis]))) - face[axis]) * 100 - dHalf;
  r.V2x = n === 1 ? 0 : frac(beyond(0, r.dLong / 2)) * P;
  r.V2y = n === 1 ? 0 : frac(beyond(1, r.dShort / 2)) * P;
  const oneRow = n <= 2; // single-row caps use one depth (the long bars) throughout
  r.perimeter = (r.bx * 100 + r.dLong) * 2 + (r.by * 100 + (oneRow ? r.dLong : r.dShort)) * 2;
  r.pilePerim = pile.bored ? (pile.b * 100 + r.dLong / 2) * Math.PI : (pile.b * 100 + r.dLong) * 4;

  // checks (pairings follow the reference sheet)
  r.dReqX = Math.sqrt((r.Mxx * 100) / (r.R * r.Bx * 100));
  r.dReqY = Math.sqrt((r.Myy * 100) / (r.R * r.By * 100));
  r.dOk = r.dShort >= r.dReqX && r.dLong >= r.dReqY;
  r.vc = 0.29 * sq;
  // the 4- and 6-pile reference sheets divide by the short-bar depth here, the larger groups by the long-bar depth
  r.vX = r.V1y / (r.Bx * 100 * (n === 4 || n === 6 ? r.dShort : r.dLong));
  r.vY = r.V1x / (r.By * 100 * r.dLong);
  r.vOk = r.vX < r.vc && r.vY < r.vc;
  r.vcp = 0.53 * sq;
  r.vpX = r.V2y / (r.perimeter * r.dShort);
  r.vpY = r.V2x / (r.perimeter * r.dLong);
  r.vpOk = r.vpX < r.vcp && r.vpY < r.vcp;
  r.vppX = r.Ptnet / (r.pilePerim * (oneRow ? r.dLong : r.dShort));
  r.vppY = r.Ptnet / (r.pilePerim * r.dLong);
  r.vppOk = r.vppX < r.vcp && r.vppY < r.vcp;

  // reinforcement
  // single-row caps count bars inside the cover; their cross bars are minimum steel 0.002·b·d
  const c2 = oneRow ? (inp.cover * 2) / 100 : 0;
  r.nLong = Math.floor((r.By - c2) / inp.sLong + 1);
  r.nShort = Math.floor((r.Bx - c2) / inp.sShort + 1);
  r.AsMinL = (14 / fy) * r.By * 100 * r.dLong;
  r.AsReqL = (r.Myy * 100) / (r.fs * r.j * r.dLong);
  r.AsProvL = bl.A * r.nLong;
  r.AsOkL = r.AsProvL >= r.AsReqL && r.AsProvL >= r.AsMinL;
  r.AsMinS = oneRow ? 0.002 * r.Bx * 100 * r.dLong : (14 / fy) * r.Bx * 100 * r.dShort;
  r.AsReqS = oneRow ? r.AsMinS : (r.Mxx * 100) / (r.fs * r.j * r.dShort);
  if (n === 1) { // a cap on one pile only needs minimum steel each way: 0.002·B·t
    r.AsMinL = r.AsReqL = 0.002 * r.Bx * 100 * t * 100;
    r.AsOkL = r.AsProvL >= r.AsReqL;
  }
  r.AsProvS = bs.A * r.nShort;
  r.AsOkS = r.AsProvS >= r.AsReqS && r.AsProvS >= r.AsMinS;
  const ua = fy === 2400 ? 11 : r.dLong <= 30 ? 35 : 25;
  const u = (d, db) => ((fy === 2400 ? (d <= 30 ? 1.615 : 1.145) : (d <= 30 ? 3.23 : 2.29)) * sq) / db;
  r.uaL = ua; r.uL = u(r.dLong, bl.d); r.uS = u(r.dShort, bs.d);
  const Vface = side(0).length * r.Ptnet; // pile reactions on one side of the pier
  r.perimReqL = Vface / (r.uL * r.j * r.dLong);
  r.perimReqS = (side(1).length * r.Ptnet) / (r.uS * r.j * r.dShort);
  r.perimL = r.nLong * bl.p;
  r.perimS = r.nShort * bs.p;
  r.perimOk = r.perimL >= r.perimReqL && r.perimS >= r.perimReqS;
  r.ancL = (bl.d * r.fs) / (4 * Math.min(r.uL, ua));
  r.ancS = (bs.d * r.fs) / (4 * Math.min(r.uS, ua));
  r.ancAvailL = ((r.Bx - r.bx) * 100) / 2 - inp.cover;
  r.ancAvailS = ((r.By - r.by) * 100) / 2 - inp.cover;
  r.ancOk = r.ancAvailL >= r.ancL && r.ancAvailS >= r.ancS;
  r.uaD = fy === 2400 ? 11 : 28;
  r.uD = (fy === 2400 ? 0.86 : 1.72) * sq;
  r.perimReqD = Vface / (r.uD * r.j * r.dLong);
  r.perimD = inp.dowelN * bd.p;
  r.perimOkD = r.perimD >= r.perimReqD;
  r.ancD = (bd.d * r.fs) / (4 * Math.min(r.uD, r.uaD)) / 100;
  r.ancUseD = roundDown(r.ancD + r.ancD / 4, 2);
  // 3 piles: bars are bundled in three bands over the pile-to-pile lines, each designed for the larger moment
  if (n === 3) {
    r.bandW = pile.b + r.dLong / 100; // band centred on the pile line: pile width plus d
    r.AsReqTri = (Math.max(r.Myy, r.Mxx) * 100) / (r.fs * r.j * r.dLong);
    r.AsMinTri = (14 / fy) * r.bandW * 100 * r.dLong;
    r.nTri = Math.max(3, Math.ceil(Math.max(r.AsReqTri, r.AsMinTri) / bl.A - 1e-9));
    r.AsProvTri = r.nTri * bl.A;
    r.sTri = Math.min(r.bandW / Math.max(r.nTri - 1, 1), 0.15);
    r.AsOkL = r.AsOkS = true;
    r.nLong = r.nShort = r.nTri;
    r.AsReqL = r.AsReqS = r.AsReqTri; r.AsMinL = r.AsMinS = r.AsMinTri; r.AsProvL = r.AsProvS = r.AsProvTri;
    r.perimL = r.perimS = r.nTri * bl.p;
    r.perimOk = r.perimL >= Math.max(r.perimReqL, r.perimReqS);
  }
  r.bearing = P / (r.bx * 100 * (r.by * 100));
  r.fnb1 = 0.25 * fcp;
  r.bearingOk = r.bearing <= r.fnb1;
  r.longText = `${r.nLong}-${inp.longBar} @ ${inp.sLong}`;
  r.shortText = `${r.nShort}-${inp.shortBar} @ ${inp.sShort}`;
  if (n === 3) r.longText = r.shortText = `${r.nTri}-${inp.longBar} ต่อแถบ × 3 แถบ`;
  return r;
}

export const PILECAP_KEYS = ["Bx", "By", "Ptmax", "Ptnet", "P1", "P2", "Pf", "Pallow", "Myy", "Mxx", "V1x", "V1y", "V2x",
  "V2y", "dLong", "dShort", "dReqX", "dReqY", "vX", "vY", "vpX", "vpY", "vppX", "vppY", "perimeter", "pilePerim",
  "AsMinL", "AsReqL", "AsProvL", "AsMinS", "AsReqS", "AsProvS", "uaL", "uL", "perimReqL", "perimL", "uS", "perimReqS",
  "perimS", "ancL", "ancAvailL", "ancS", "ancAvailS", "nLong", "nShort", "uD", "perimReqD", "perimD", "ancD",
  "ancUseD", "bearing"];

export const FOOTING_KEYS = ["fc", "fs", "n", "k", "j", "R", "qmaxY", "qminY", "qmaxX", "qminX", "qnMaxY", "qnMinY",
  "qnMaxX", "qnMinX", "dLong", "dShort", "Myy", "V1yy", "V2yy", "Mxx", "V1xx", "V2xx", "perimeter", "dReqX", "dReqY",
  "dOk", "vc", "vX", "vY", "vcp", "vpX", "vpY", "uaL", "uL", "perimReqL", "perimL", "AsMinL", "AsReqL", "AsProvL",
  "AsOkL", "uaS", "uS", "perimReqS", "perimS", "AsMinS", "AsReqS", "AsProvS", "AsOkS", "ancL", "ancAvailL", "ancS",
  "ancAvailS", "nLong", "nShort", "uaD", "uD", "perimReqD", "perimD", "ancD", "ancUseD", "bearing"];
