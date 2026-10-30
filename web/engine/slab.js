// RC slab design by WSD: one-way (moment coefficients), cantilever, two-way (ACI Method 2).
// Strip width 1 m. Units: kg, cm, ksc; t, L, S in metres; loads in kg/m².
import { SLAB_BARS, ONE_WAY_SUPPORTS, TWO_WAY_CASES, GRADES, allowableFs } from "./tables.js";
import { roundDown } from "./beam.js";

const Ec_DENSITY = 2.323;

function bar(name) {
  const b = SLAB_BARS[name];
  if (!b) throw new Error(`unknown bar ${name}`);
  return b;
}

function constants(inp) {
  const fcRaw = inp.F * inp.fcPrime;
  const c = { fc: inp.capFc !== false && fcRaw > 65 ? 65 : fcRaw, fs: allowableFs(inp.fy, inp.F) };
  c.Ec = Ec_DENSITY ** 1.5 * 4270 * Math.sqrt(inp.fcPrime);
  c.n = inp.Es / c.Ec;
  c.nOk = c.n >= 6;
  c.k = 1 / (1 + c.fs / (c.n * c.fc));
  c.j = 1 - c.k / 3;
  c.R = 0.5 * c.fc * c.k * c.j;
  return c;
}

// Temperature/shrinkage steel ratio by grade (SD-50 has none in the reference method).
const TEMP_RATIO = { "SR-24": 0.0025, "SD-30": 0.002, "SD-40": 0.0018 };

// Shared strip design for one-way and cantilever slabs.
function stripDesign(inp, r, mainBar, tempBar) {
  const mb = bar(mainBar), tb = bar(tempBar);
  r.d = inp.t * 100 - inp.cover - mb.d / 2;
  r.dReq = Math.sqrt((r.M * 100) / (r.R * 100));
  r.dOk = r.dReq <= r.d;
  r.As = (r.M * 100) / (r.fs * r.j * r.d);
  r.sMain = Math.min(roundDown(mb.A / r.As, 2), roundDown(3 * inp.t, 2), 0.45);
  r.Vc = 0.29 * 100 * r.d * Math.sqrt(inp.fcPrime);
  r.VcOk = r.Vc >= r.V;
  r.Mc = r.R * r.d ** 2;
  r.McOk = r.Mc >= r.M;
  const ratio = TEMP_RATIO[GRADES[inp.fy]];
  r.AsTemp = ratio === undefined ? NaN : ratio * 100 * inp.t * 100;
  r.sTemp = Math.min(roundDown(tb.A / r.AsTemp, 2), roundDown(5 * inp.t, 2), 0.45);
  r.barsPerM = 1 / r.sMain;
  r.u = r.Vbond / (mb.p * r.barsPerM * r.j * r.d);
  r.uLimit = inp.fy === 2400 ? 11 : 35;
  r.uOk = r.u <= r.uLimit;
  r.uAllow = ((inp.fy === 2400 ? 1.615 : 3.23) * Math.sqrt(inp.fcPrime)) / mb.d;
  r.mainText = `${mainBar} @ ${roundDown(r.sMain, 2)}`;
  r.tempText = `${tempBar} @ ${roundDown(r.sTemp, 2)}`;
  return r;
}

export function oneWay(inp) {
  const sup = ONE_WAY_SUPPORTS[inp.support];
  if (!sup) throw new Error(`unknown support ${inp.support}`);
  const r = constants(inp);
  r.selfWeight = inp.unitWeight * inp.t;
  r.w = r.selfWeight + inp.extra + inp.live;
  r.M = (r.w * inp.L ** 2) / sup.mDiv;
  r.minT = (inp.L / sup.tDiv) * (inp.fy >= 4000 ? 1 : 0.4 + inp.fy / 7000);
  r.minTOk = r.minT <= inp.t;
  const d = inp.t * 100 - inp.cover - bar(inp.mainBar).d / 2;
  r.V = (sup.vFactor * r.w * inp.L) / 2 - (r.w * d) / 100; // at d from the support face
  r.reaction = roundDown((sup.vFactor * r.w * inp.L) / 2, 2);
  r.Vbond = (sup.vFactor * r.w * inp.L) / 2;
  return stripDesign(inp, r, inp.mainBar, inp.tempBar);
}

// Stair flight as a simply supported inclined waist slab over the horizontal span L; tread b and riser h in m.
// Self weight per m² of plan = waist slab along the slope + average step concrete (h/2).
export function stair(inp) {
  const r = constants(inp);
  const slope = Math.hypot(inp.tread * 100, inp.riser * 100) / (inp.tread * 100);
  r.selfWeight = inp.unitWeight * inp.t * slope + 0.5 * inp.riser * inp.unitWeight;
  r.w = r.selfWeight + inp.extra + inp.live;
  r.M = (r.w * inp.L ** 2) / 8;
  r.minT = (inp.L / 20) * (inp.fy >= 4000 ? 1 : 0.4 + inp.fy / 7000);
  r.minTOk = r.minT <= inp.t;
  const d = inp.t * 100 - inp.cover - bar(inp.mainBar).d / 2;
  r.V = (r.w * inp.L) / 2 - (r.w * d) / 100;
  r.reaction = (r.w * inp.L) / 2;
  r.Vbond = r.reaction;
  r.steps = Math.max(1, Math.round(inp.L / inp.tread));
  r.angle = (Math.atan(inp.riser / inp.tread) * 180) / Math.PI;
  return stripDesign(inp, r, inp.mainBar, inp.tempBar);
}

export function cantilever(inp) {
  const r = constants(inp);
  r.selfWeight = inp.unitWeight * inp.t;
  r.w = r.selfWeight + inp.extra + inp.live;
  r.M = (inp.L ** 2 * r.w) / 2 + inp.P * inp.a;
  r.V = r.w * inp.L + inp.P;
  r.minT = (inp.L / 10) * (inp.fy >= 4000 ? 1 : 0.4 + inp.fy / 7000);
  r.minTOk = r.minT <= inp.t;
  r.reaction = r.V;
  r.Vbond = r.V;
  return stripDesign(inp, r, inp.mainBar, inp.tempBar);
}

// Linear interpolation in the Method 2 table, at m rounded down to 0.01 and not below 0.5.
function coef(row, m) {
  const x = (m - 0.5) * 10, i = Math.min(Math.floor(x + 1e-9), 4);
  return row[i] + (row[i + 1] - row[i]) * (x - i);
}

export function twoWay(inp) {
  const cs = TWO_WAY_CASES[inp.case];
  if (!cs) throw new Error(`unknown case ${inp.case}`);
  const r = constants(inp);
  const sb = bar(inp.shortBar), lb = bar(inp.longBar);
  r.selfWeight = inp.unitWeight * inp.t;
  r.w = r.selfWeight + inp.extra + inp.live;
  r.m = Math.max(0.5, roundDown(inp.S / inp.L, 2));
  r.minT = Math.min(0.08, (2 * inp.S + 2 * inp.L) / 180);
  r.minTOk = r.minT <= inp.t;
  r.dS = inp.t * 100 - inp.cover - sb.d / 2;
  r.dL = inp.t * 100 - inp.cover - sb.d - lb.d / 2;
  const wS2 = r.w * inp.S ** 2;
  const [cC, cD, cM] = cs.short.map((row) => coef(row, r.m));
  const [lC, lD, lM] = cs.long;
  // [M− discontinuous, M+ midspan, M− continuous] for each direction, kg-m/m
  r.coefS = [cD, cM, cC];
  r.coefL = [lD, lM, lC];
  r.MS = [roundDown(cD * wS2, 2), roundDown(cM * wS2, 0), roundDown(cC * wS2, 2)];
  r.ML = [roundDown(lD * wS2, 2), roundDown(lM * wS2, 2), roundDown(lC * wS2, 2)];
  const Mmax = Math.max(...r.MS, ...r.ML);
  r.dReq = Math.sqrt((Mmax * 100) / (r.R * 100));
  r.dOk = r.dReq <= r.dS;
  r.McS = roundDown(r.R * r.dS ** 2, 2);
  r.McL = roundDown(r.R * r.dL ** 2, 2);
  r.McSOk = r.McS >= Math.max(...r.MS);
  r.McLOk = r.McL >= Math.max(...r.ML);
  r.AsS = r.MS.map((M) => M / (r.fs * r.j * r.dS / 100));
  r.AsL = r.ML.map((M) => M / (r.fs * r.j * r.dL / 100));
  const spacing = (As, c, A) => As.map((x, i) => (c[i] === 0 ? null : roundDown(roundDown(A / x, 2), 2)));
  r.sS = spacing(r.AsS, r.coefS, sb.A);
  r.sL = spacing(r.AsL, r.coefL, lb.A);
  const s3t = roundDown(3 * inp.t, 2);
  r.sShort = Math.min(s3t, ...r.sS.filter((x) => x !== null));
  r.sLong = Math.min(s3t, ...r.sL.filter((x) => x !== null));
  r.loadShortSide = (r.w * inp.S) / 3;
  r.loadLongSide = ((r.w * inp.S) / 3) * (3 - r.m ** 2) / 2;
  r.shortText = `${inp.shortBar} @ ${r.sShort}`;
  r.longText = `${inp.longBar} @ ${r.sLong}`;
  return r;
}

export const ONE_WAY_KEYS = ["fc", "fs", "n", "nOk", "k", "j", "R", "selfWeight", "w", "M", "V", "minT", "minTOk",
  "d", "dReq", "dOk", "As", "sMain", "Vc", "VcOk", "Mc", "McOk", "AsTemp", "sTemp", "reaction", "Vbond", "barsPerM",
  "u", "uOk", "uAllow", "mainText", "tempText"];
export const CANTILEVER_KEYS = ONE_WAY_KEYS;
export const TWO_WAY_KEYS = ["fc", "fs", "n", "nOk", "k", "j", "R", "selfWeight", "w", "m", "minT", "minTOk", "dS", "dL",
  "MS", "ML", "dReq", "dOk", "McS", "McL", "McSOk", "McLOk", "AsS", "AsL", "sS", "sL", "sShort", "sLong",
  "loadShortSide", "loadLongSide", "shortText", "longText"];
