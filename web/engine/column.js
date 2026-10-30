// Rectangular tied column, working stress design (ACI 318-63 / ว.ส.ท.): axial load with biaxial bending,
// slenderness reduction factor R, compression/tension-controlled interaction checks.
// Units: kg, cm, ksc; L in metres, Bx/By in cm, moments in kg-m.
import { SLAB_BARS } from "./tables.js";
import { roundDown } from "./beam.js";

const Ec_DENSITY = 2.323;
const min1 = (x) => (x > 1 ? 1 : x); // R never exceeds 1

// Effective-length factor k and reduction factor R for one end-restraint case (frame cases 1–5).
// rT, rB: column-to-beam stiffness ratios at the top and bottom joints.
function slenderRows(lu, r, rT, rB) {
  const ratio = (k) => (k * lu) / r;
  const avgK = 0.78 + 0.22 * (0.5 * (rT + rB));
  const hingeK = 2 * (0.78 + 0.22 * (rT > 0 ? rT : rB));
  const lin = (k) => min1(1.07 - 0.008 * ratio(k)); // 1.07 − 0.008·klu/r
  return {
    axial: { k: 1, klr: ratio(1), R: min1(1.07 - 0.008 * ratio(1)) },
    bracedShort: { k: 1, klr: ratio(1), R: 1 },
    bracedLong: { k: 1, klr: ratio(1), R: min1(1.32 - 0.006 * ratio(1)) },
    case2: { k: 1, klr: ratio(1), R: lin(1) },
    case3: { k: avgK, klr: ratio(avgK), R: lin(avgK) },
    case4: { k: hingeK, klr: ratio(hingeK), R: lin(hingeK) },
    case5: { k: 2, klr: ratio(2), R: lin(2) },
  };
}

const stiffness = (b, t, L) => (b * t ** 3) / 12 / L;
const circStiffness = (D, L) => (Math.PI * D ** 4) / 64 / L;

// Reduction factor for the governing case; R' for tension control is defined through eb/e.
function reduction(mode, frameCase, rows, eb, e) {
  let row = null;
  if (mode === "I") row = rows.axial;
  else if (frameCase === 1) row = rows.bracedShort.klr < 60 ? rows.bracedShort : rows.bracedShort.klr <= 100 ? rows.bracedLong : null;
  else row = { 2: rows.case2, 3: rows.case3, 4: rows.case4, 5: rows.case5 }[frameCase] ?? null;
  if (!row) return { klr: NaN, R: NaN };
  if (mode === "III") return { klr: row.klr, R: e === 0 ? NaN : Math.max(row.R, 1 - ((1 - row.R) * eb) / e) };
  return { klr: row.klr, R: row.R };
}

// Circular spiral column, uniaxial design on the resultant moment Mp = √(Mx² + My²).
export function spiralColumn(inp) {
  const r = {};
  const bar = SLAB_BARS[inp.mainBar], sp = SLAB_BARS[inp.spiralBar];
  if (!bar || !sp) throw new Error("unknown bar size");
  const { D, fcPrime: fcp, fy } = inp;
  r.LdRatio = inp.L / (D / 100);
  r.slender = !(r.LdRatio < 15);
  r.Ag = (Math.PI * D ** 2) / 4;
  r.Ast = bar.A * inp.nBars;
  r.pg = (r.Ast * 100) / r.Ag;
  r.pgOk = r.pg > 1 && r.pg < 8;
  r.C = D / 2;
  r.dPrime = inp.cover + sp.d + bar.d / 2;
  r.Ds = D - 2 * r.dPrime;
  r.fs = 0.4 * fy;
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * Math.sqrt(fcp);
  r.n = inp.Es / r.Ec;
  r.m = fy / (0.85 * fcp);
  r.Fb = 0.45 * fcp;
  r.Fa = 0.34 * (1 + (r.pg * r.m) / 100) * fcp;
  r.Pac = r.Ag * 0.25 * fcp;
  r.Pas = r.fs * (r.pg / 100) * r.Ag;
  r.Pa = r.Ag * (0.25 * fcp + 0.4 * fy * (r.pg / 100));
  r.Po = r.Fa * r.Ag;
  r.I = (Math.PI * D ** 4) / 64 + r.Ast * (2 * r.n - 1) * (r.Ds ** 2 / 8);
  r.Ms = (r.Fb * r.I) / r.C;
  r.ea = r.Ms * (1 / r.Pa - 1 / r.Po);
  r.eb = 0.43 * (r.pg / 100) * r.m * r.Ds + 0.14 * D;
  r.Mp = Math.hypot(inp.Mx, inp.My);
  r.e = (r.Mp * 100) / inp.P;
  r.Pb = 1 / (1 / r.Po + (r.eb * r.C) / (r.I * r.Fb));
  r.Ma = r.Pa * r.ea;
  r.Mb = r.Pb * r.eb;
  r.Mo = 0.12 * r.Ast * fy * r.Ds;
  r.mode = r.e < r.ea ? "I" : r.ea < r.e && r.e < r.eb ? "II" : r.e > r.eb ? "III" : "NONE";

  const rT = (circStiffness(inp.colTop.D, inp.colTop.L) + circStiffness(inp.colThis.D, inp.colThis.L)) /
    (stiffness(inp.beamTL.b, inp.beamTL.t, inp.beamTL.L) + stiffness(inp.beamTR.b, inp.beamTR.t, inp.beamTR.L));
  const rB = (circStiffness(inp.colThisB.D, inp.colThisB.L) + circStiffness(inp.colBot.D, inp.colBot.L)) /
    (stiffness(inp.beamBL.b, inp.beamBL.t, inp.beamBL.L) + stiffness(inp.beamBR.b, inp.beamBR.t, inp.beamBR.L));
  r.rTop = rT;
  r.rBot = rB;
  Object.assign(r, reduction(r.mode, inp.frameCase, slenderRows(inp.L * 100, 0.25 * D, rT, rB), r.eb, r.e));

  const amp = r.slender ? 1 / r.R : 1;
  r.Pd = inp.P * amp;
  r.Mpd = r.Mp * amp;
  r.fa = r.Pd / r.Ag;
  r.fb = (r.Mpd * 100 * r.C) / r.I;
  r.axialRatio = r.Pd / r.Pa;
  if (r.mode === "I") { r.ratio = null; r.ok = r.Pa > r.Pd; }
  else if (r.mode === "II") { r.ratio = r.fa / r.Fa + r.fb / r.Fb; r.ok = r.ratio < 1.005; }
  else if (r.mode === "III") { r.ratio = (r.Mpd * 100) / r.Mo; r.ok = r.ratio < 1.005; }
  else { r.ratio = NaN; r.ok = false; }

  // spiral: ρs = 0.45((D/Dc)² − 1)f'c/fy ; s = 4·Asp/(ρs·Dc) ≤ Dc/6
  r.Dc = D - 2 * inp.cover;
  r.rhoS = (0.45 * ((D / r.Dc) ** 2 - 1) * fcp) / inp.fys;
  r.sReq = (4 * sp.A) / (r.rhoS * r.Dc);
  r.sMax = r.Dc / 6;
  r.sReqOk = r.sReq < r.sMax;
  r.sOk = inp.sSpiral <= Math.min(r.sReq, r.sMax);
  return r;
}

export const SPIRAL_KEYS = ["LdRatio", "slender", "Ag", "Ast", "pg", "pgOk", "C", "dPrime", "Ds", "fs", "Ec", "n", "m",
  "Fb", "Fa", "Pac", "Pas", "Pa", "Po", "I", "Ms", "ea", "eb", "e", "Pb", "Ma", "Mb", "Mo", "mode", "rTop",
  "rBot", "klr", "R", "Pd", "Mpd", "fa", "fb", "ratio", "Dc", "rhoS", "sReq", "sMax", "sReqOk"];

export function tiedColumn(inp) {
  const r = {};
  const bar = SLAB_BARS[inp.mainBar], tie = SLAB_BARS[inp.tieBar];
  if (!bar || !tie) throw new Error("unknown bar size");
  const { Bx, By, fcPrime: fcp, fy } = inp;
  const Ab = bar.A;

  // geometry & reinforcement
  r.LbRatio = roundDown(inp.L / (Math.min(Bx, By) / 100), 1);
  r.slender = r.LbRatio > 15;
  r.nBars = inp.nx + inp.ny - 4; // nx bars on the two x-faces, ny on the two y-faces, corners shared
  r.Ast = Ab * (inp.nx + (inp.ny / 2 - 2) * 2);
  r.Ag = Bx * By;
  r.pg = (r.Ast * 100) / r.Ag;
  r.pgOk = r.pg > 1 && r.pg < 8;
  r.dPrime = inp.cover + tie.d + bar.d / 2;
  r.gBx = Bx - 2 * r.dPrime;
  r.gBy = By - 2 * r.dPrime;
  const AsX = (inp.nx / 2) * Ab, AsY = (inp.ny / 2) * Ab;

  // materials
  r.fs = 0.4 * fy;
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * Math.sqrt(fcp);
  r.n = inp.Es / r.Ec;
  r.m = fy / (0.85 * fcp);
  r.Fb = 0.45 * fcp;
  r.Fa = 0.34 * (1 + (r.pg * r.m) / 100) * fcp;
  r.Pa = 0.85 * r.Ag * (0.25 * fcp + 0.4 * fy * (r.pg / 100));
  r.Pas = 0.85 * r.fs * (r.pg / 100) * r.Ag;
  r.Pac = r.Ag * 0.2125 * fcp;
  r.Po = r.Fa * r.Ag;

  // transformed moments of inertia (steel on the faces normal to bending)
  const sameFaces = inp.nx === inp.ny;
  r.Ix = (Bx * By ** 3) / 12 + ((2 * r.n - 1) * r.Ast * r.gBy ** 2) / (sameFaces ? 6 : 4);
  r.Iy = (By * Bx ** 3) / 12 + ((2 * r.n - 1) * r.Ast * r.gBx ** 2) / (sameFaces ? 6 : 4);
  r.Cx = Bx / 2;
  r.Cy = By / 2;

  // eccentricities (independent of R, which scales P and M alike)
  r.ex = (inp.My * 100) / inp.P;
  r.ey = (inp.Mx * 100) / inp.P;
  r.Msx = (r.Fb * r.Ix) / r.Cy;
  r.Msy = (r.Fb * r.Iy) / r.Cx;
  r.eax = r.Msx * (1 / r.Pa - 1 / r.Po);
  r.eay = r.Msy * (1 / r.Pa - 1 / r.Po);
  const ebf = 0.67 * (r.pg / 100) * r.m + 0.17;
  r.ebx = ebf * (By - r.dPrime);
  r.eby = ebf * (Bx - r.dPrime);
  r.Pbx = 1 / (1 / r.Po + (r.eby * r.Cy) / (r.Ix * r.Fb));
  r.Pby = 1 / (1 / r.Po + (r.ebx * r.Cx) / (r.Iy * r.Fb));
  r.Mbx = r.Pbx * r.eby;
  r.Mby = r.Pby * r.ebx;
  r.Max = r.Pa * r.eay;
  r.May = r.Pa * r.eax;
  r.Mox = 0.4 * AsX * fy * (By - 2 * r.dPrime);
  r.Moy = 0.4 * AsY * fy * (Bx - 2 * r.dPrime);

  // governing case from the larger eccentricity
  const [e, ea, eb] = r.ex >= r.ey ? [r.ex, r.eax, r.ebx] : [r.ey, r.eay, r.eby];
  r.mode = e < ea ? "I" : ea < e && e < eb ? "II" : e > eb ? "III" : "NONE";

  // slenderness reduction
  const lu = inp.L * 100, rad = 0.25 * Bx;
  const rT = (stiffness(inp.colTop.bx, inp.colTop.by, inp.colTop.L) + stiffness(inp.colThis.bx, inp.colThis.by, inp.colThis.L)) /
    (stiffness(inp.beamTL.b, inp.beamTL.t, inp.beamTL.L) + stiffness(inp.beamTR.b, inp.beamTR.t, inp.beamTR.L));
  const rB = (stiffness(inp.colThisB.bx, inp.colThisB.by, inp.colThisB.L) + stiffness(inp.colBot.bx, inp.colBot.by, inp.colBot.L)) /
    (stiffness(inp.beamBL.b, inp.beamBL.t, inp.beamBL.L) + stiffness(inp.beamBR.b, inp.beamBR.t, inp.beamBR.L));
  r.rTop = rT;
  r.rBot = rB;
  const rows = slenderRows(lu, rad, rT, rB);
  const c = inp.frameCase;
  let row = null;
  if (r.mode === "I") row = rows.axial;
  else if (c === 1) row = rows.bracedShort.klr < 60 ? rows.bracedShort : rows.bracedShort.klr <= 100 ? rows.bracedLong : null;
  else row = { 2: rows.case2, 3: rows.case3, 4: rows.case4, 5: rows.case5 }[c] ?? null;
  r.klr = row ? row.klr : NaN;
  r.R = row ? row.R : NaN;
  // R' for tension control (defined through ebx/ex, so undefined when ex = 0)
  if (r.mode === "III" && row) r.R = r.ex === 0 ? NaN : Math.max(row.R, 1 - ((1 - row.R) * r.ebx) / r.ex);

  // design actions (slender columns: magnified by 1/R)
  const amp = r.slender ? 1 / r.R : 1;
  r.Pd = inp.P * amp;
  r.Mxd = inp.Mx * amp;
  r.Myd = inp.My * amp;
  r.fa = r.Pd / r.Ag;
  r.fbx = (r.Mxd * 100 * r.Cy) / r.Ix;
  r.fby = (r.Myd * 100 * r.Cx) / r.Iy;

  // capacity check per case
  // (the reference sheet's pass cell tests ex < eax before the governing case; we judge by the governing case)
  r.axialRatio = r.Pd / r.Pa;
  if (r.mode === "I") { r.ratio = null; r.ok = r.Pa > r.Pd; }
  else if (r.mode === "II") { r.ratio = r.fa / r.Fa + r.fbx / r.Fb + r.fby / r.Fb; r.ok = r.ratio < 1.005; }
  else if (r.mode === "III") { r.ratio = (r.Mxd * 100) / r.Mox + (r.Myd * 100) / r.Moy; r.ok = r.ratio < 1.005; }
  else { r.ratio = NaN; r.ok = false; }

  // ties: least of 16 bar dia, 48 tie dia, least column dimension
  r.sTie = Math.min(16 * bar.d, 48 * tie.d, Math.min(Bx, By));
  r.tieText = `${inp.tieSets}-${inp.tieBar} @ ${roundDown(r.sTie / 100, 2)}`;
  return r;
}

export const COLUMN_KEYS = ["LbRatio", "slender", "fs", "Ec", "n", "m", "Fb", "Fa", "Ag", "Ast", "pg", "pgOk", "nBars",
  "dPrime", "gBx", "gBy", "Pa", "Pas", "Pac", "Po", "Ix", "Iy", "ex", "ey", "eax", "eay", "ebx", "eby", "Msx", "Msy",
  "Pbx", "Pby", "Mbx", "Mby", "Max", "May", "Mox", "Moy", "mode", "rTop", "rBot", "klr", "R", "Pd", "Mxd", "Myd",
  "fa", "fbx", "fby", "ratio", "sTie", "tieText"];
