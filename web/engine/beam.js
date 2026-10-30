// RC beam section design by working stress design (WSD), ว.ส.ท. / ACI 318 (WSD) / กฎกระทรวง 2566.
// Units: kg, cm, ksc; inputs b, h, L, s in metres and moments in kg-m.
import { BARS, STIRRUPS, BEAM_TYPES, allowableFs } from "./tables.js";

const SPACING_BETWEEN_LAYERS = 2.5; // cm clear between bar layers
const Ec_DENSITY = 2.323;           // t/m³ used in Ec = 4270 w^1.5 √f'c

// Truncate toward zero to `dp` decimals, tolerant of binary noise (0.29*100 = 28.999…).
export function roundDown(x, dp) {
  const f = 10 ** dp;
  return Math.trunc(Number((x * f).toPrecision(12))) / f;
}

function bar(name) {
  return name && BARS[name] ? BARS[name] : { A: 0, d: 0 };
}

// Bar groups of one face: 3 layers × (main, special). Returns areas, centroid from that face, layer spacings.
function faceGeometry(layers, cover, stirDia, bWidth) {
  const L = [0, 1, 2].map((i) => layers?.[i] ?? {});
  const g = L.map((l) => ({
    nm: l.main?.n ?? 0, m: bar(l.main?.n ? l.main.bar : null),
    ns: l.special?.n ?? 0, s: bar(l.special?.n ? l.special.bar : null),
  }));
  const base = cover + stirDia;
  // Layer offsets follow the main bar of the layers below.
  const off = [base, base + g[0].m.d + SPACING_BETWEEN_LAYERS,
    base + g[0].m.d + SPACING_BETWEEN_LAYERS + g[1].m.d + SPACING_BETWEEN_LAYERS];
  let sumA = 0, sumAy = 0;
  g.forEach((x, i) => {
    const Am = x.nm * x.m.A, As = x.ns * x.s.A;
    sumA += Am + As;
    sumAy += Am * (off[i] + x.m.d / 2) + As * (off[i] + x.s.d / 2);
  });
  const spacing = g.map((x) => {
    const n = x.nm + x.ns;
    if (n === 0) return null;
    return (bWidth - 2 * cover - 2 * stirDia - x.m.d * x.nm - x.s.d * x.ns) / (n - 1);
  });
  return { area: sumA, centroid: sumAy / sumA, spacing, groups: g };
}

export function designSection(inp) {
  const t = BEAM_TYPES[inp.type];
  if (!t) throw new Error(`unknown beam type ${inp.type}`);
  const r = {};
  const fcp = inp.fcPrime, sq = Math.sqrt(fcp);
  const b = inp.b * 100, h = inp.h * 100; // cm
  const st = STIRRUPS[inp.stirrup.bar];
  if (!st) throw new Error(`unknown stirrup ${inp.stirrup.bar}`);

  // Materials
  const fcRaw = inp.F * fcp;
  r.fc = inp.capFc !== false && fcRaw > 65 ? 65 : fcRaw;
  r.fs = allowableFs(inp.fy, inp.F);
  r.fsv = allowableFs(inp.fys, inp.F);
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * sq;
  r.n = inp.Es / r.Ec;
  r.nOk = r.n >= 6;
  r.k = 1 / (1 + r.fs / (r.n * r.fc));
  r.j = 1 - r.k / 3;
  r.R = 0.5 * r.fc * r.k * r.j;

  // Geometry checks
  r.minDepth = (inp.L / t.minDepthDiv) * (inp.fy >= 4000 ? 1 : 0.4 + inp.fy / 7000);
  r.minDepthOk = inp.h >= r.minDepth;
  r.deepRatio = roundDown(inp.h / inp.L, 2);
  r.deepLimit = t.deepLimit;
  r.deepOk = r.deepRatio <= r.deepLimit;
  r.LbRatio = inp.L / inp.b;
  r.narrow = r.LbRatio > 30;

  // Bar layout: compression face = top bars, tension face = bottom bars (as entered).
  const comp = faceGeometry(inp.top, inp.cover, st.d, b);
  const tens = faceGeometry(inp.bottom, inp.cover, st.d, b);
  r.dPrime = comp.centroid;
  r.d = h - tens.centroid;
  r.provTop = comp.area;
  r.provBot = tens.area;
  r.spacingTop = comp.spacing;
  r.spacingBot = tens.spacing;

  // Flexure
  const Mb = inp.M, d = r.d;
  r.Mc = (r.narrow ? 1.75 - r.LbRatio / 40 : 1) * r.R * inp.b * d ** 2;
  r.mode = r.Mc > Mb ? "singly" : "doubly";
  const fsp = (2 * r.fs * (r.k - r.dPrime / d)) / (1 - r.k);
  r.fsPrime = fsp > r.fs ? r.fs : fsp;
  r.M1 = Mb < r.Mc ? 0 : r.Mc;
  r.M2 = Mb < r.Mc ? 0 : Mb - r.M1;
  const arm = (d - r.dPrime) / 100;
  r.As1 = r.M1 / (r.fs * r.j * d / 100);
  r.As2 = Mb > r.Mc ? r.M2 / (r.fs * arm) : 0;
  r.As = Mb < r.Mc ? Mb / (r.fs * r.j * d / 100) : Mb > r.Mc ? r.As1 + r.As2 : NaN;
  r.AsPrime = r.M2 === 0 ? 0 : Mb > r.Mc ? r.M2 / (r.fsPrime * arm) : NaN;
  r.AsMin = (14 / inp.fy) * b * d;
  r.AsMinOk = r.provBot >= r.AsMin;
  if (Mb < r.Mc) r.doublyCheck = "OK";
  else if (Mb > r.Mc && r.As > r.AsPrime) r.doublyCheck = r.As - r.AsPrime >= 0.25 ? "OK" : "STEEL_BEAM";
  else if (Mb > r.Mc && r.As < r.AsPrime) r.doublyCheck = "NG";
  else r.doublyCheck = "NG";

  // Shear
  r.Vc = 0.29 * b * d * sq;
  r.Vc1 = 0.795 * b * d * sq;
  r.Vc2 = 1.32 * b * d * sq;
  r.Vp = inp.V > r.Vc ? inp.V - r.Vc : 0;
  r.VpOk = r.Vp <= r.Vc2;
  r.AvS = (r.narrow || r.doublyCheck === "STEEL_BEAM" ? inp.V : r.Vp) / (r.fsv * d);

  // Torsion
  r.vc = 0.29 * sq;
  r.vc1 = 1.32 * sq;
  r.vc2 = 1.65 * sq;
  r.vb = inp.V / (b * h);
  const x1 = b - 2 * (inp.cover + st.d), y1 = h - 2 * (inp.cover + st.d);
  r.Ac = x1 * y1;
  r.AtS = (inp.Mt * 100) / (r.Ac * r.fsv);
  r.vt = (3.5 * inp.Mt) / (inp.h * b ** 2);
  r.vtOk = r.vt <= r.vc1;
  r.v = r.vt + r.vb;
  r.vOk = r.v <= r.vc2;
  r.Ast = (inp.Mt * 100 * (x1 + y1) / 2) / (2 * r.Ac * r.fsv);

  // Stirrups
  r.AtotS = r.AvS + r.AtS;
  r.Aact = st.A * inp.stirrup.sets * 2;
  const sCal = r.AtotS === 0 ? 0 : roundDown(r.Aact / r.AtotS / 100, 2);
  const cap = (limD, limAbs, capAbs) =>
    sCal > d / limD / 100 || sCal > limAbs ? Math.min(roundDown(d / limD / 100, 2), capAbs) : sCal;
  r.sCal = sCal;
  if (r.Vp === 0) r.sMax = cap(2, 0.6, 0.6);
  else if (r.Vp <= r.Vc1) r.sMax = cap(2, 0.6, 0.3);
  else if (r.Vp <= r.Vc2) r.sMax = cap(4, 0.3, 0.3);
  else r.sMax = "FAIL";
  r.Amin = typeof r.sMax === "number" ? 0.0015 * b * (r.sMax * 100) : NaN;
  r.AminOk = Number.isNaN(r.Amin) ? NaN : r.Aact >= r.Amin; // undefined when shear exceeds Vc2
  const label = `${inp.stirrup.sets}-${inp.stirrup.bar} @ ${inp.s}`;
  r.stirrup = r.AtotS === 0 ? label : inp.s > r.sMax || inp.s < 0.1 ? "CHECK_SPACING" : label;

  // Required steel per face incl. torsion longitudinal steel at two corners
  const steelBeam = Mb / (r.fs * arm) + 2 * r.Ast;
  r.reqTop = r.doublyCheck === "OK" ? r.AsPrime + 2 * r.Ast : r.doublyCheck === "STEEL_BEAM" ? steelBeam : "FAIL";
  r.reqBot = r.doublyCheck === "OK" ? r.As + 2 * r.Ast : r.doublyCheck === "STEEL_BEAM" ? steelBeam : "FAIL";
  r.topOk = typeof r.reqTop === "number" && r.provTop >= r.reqTop;
  r.botOk = typeof r.reqBot === "number" && r.provBot >= r.reqBot;
  r.sideBarsAdvised = h >= 80;
  return r;
}

// Keys compared against the reference spreadsheet (one section design).
export const COMPARED_KEYS = [
  "fc", "fs", "fsv", "n", "nOk", "k", "j", "R", "minDepth", "minDepthOk", "deepRatio", "deepLimit", "deepOk",
  "LbRatio", "dPrime", "d", "Mc", "mode", "fsPrime", "M1", "M2", "As1", "As2", "As", "AsPrime", "AsMin",
  "AsMinOk", "doublyCheck", "Vc", "Vc1", "Vc2", "Vp", "VpOk", "AvS", "vb", "Ac", "AtS", "vt", "vtOk", "v", "vOk",
  "Ast", "AtotS", "sMax", "Amin", "Aact", "AminOk", "stirrup", "reqTop", "provTop", "reqBot", "provBot",
  "spacingTop", "spacingBot",
];

export function formatValue(v) {
  if (Array.isArray(v)) return v.map(formatValue).join(",");
  if (v === null || v === undefined) return "-";
  if (typeof v === "boolean") return v ? "OK" : "NG";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return "ERR";
    const s = v.toFixed(4);
    return s === "-0.0000" ? "0.0000" : s;
  }
  return String(v);
}
