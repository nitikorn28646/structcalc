// Steel roof members, Allowable Stress Design (AISC ASD / ว.ส.ท.). Units: kg, m (spans), cm (sections), ksc.
// Fb = 0.6 Fy for bending, deflection limit span/360, Es given by the user.
import { SECTIONS, findSection } from "./steelSections.js";

export const FY = { "Fe-24": 2400, "Fe-30": 3000 };
const rad = (d) => (d * Math.PI) / 180;

// Wind pressure normal to a roof plane per unit plan pressure (slope factor 2 sinθ / (1 + sin²θ)).
const windFactor = (t) => (2 * Math.sin(t)) / (1 + Math.sin(t) ** 2);
// Load normal to the roof: dead+live alone, or 75% of (dead+live + wind) when wind is given (ASD 1/3 stress increase).
const normalLoad = (Wg, q, t) => (q === 0 ? Wg * Math.cos(t) : 0.75 * (Wg * Math.cos(t) + q));

function sec(p) {
  const s = p.section ?? findSection(p.type, p.name);
  if (!s) throw new Error(`ไม่พบหน้าตัด ${p.type} ${p.name}`);
  return s;
}

// Simple span L with an overhang a beyond one support, full UDL w (kg/m): reactions, moments and deflections (cm).
export function overhangBeam(w, L, a, EI) {
  const Rfar = (w / (2 * L)) * (L * L - a * a), Rnear = (w / (2 * L)) * (L * L + a * a) + w * a;
  const Mspan = (w / (8 * L * L)) * (L + a) ** 2 * (L - a) ** 2, Mcant = (w * a * a) / 2;
  // deflection between supports taken at the zero-shear point x = Rfar/w (from the far support)
  const x = Rfar / w, Lc = L * 100, xc = x * 100, ac = a * 100, wc = w / 100;
  const dSpan = ((wc * xc) / (24 * EI * Lc)) * (Lc ** 4 - 2 * Lc * Lc * xc * xc + Lc * xc ** 3 - 2 * ac * ac * Lc * Lc + 2 * ac * ac * xc * xc);
  const dTip = ((wc * ac) / (24 * EI)) * (4 * ac * ac * Lc - Lc ** 3 + 3 * ac ** 3); // + = downward at the free end
  return { Rfar, Rnear, Mspan, Mcant, M: Math.max(Mspan, Mcant), x, dSpan, dTip, d: Math.max(dSpan, dTip) };
}

// แป: continuous over rafters (M = wL²/9), weak axis braced by sag rods in `sagRows` rows (0 = none).
export function purlin(p) {
  const s = sec(p), Fy = FY[p.grade] ?? p.Fy, Fb = 0.6 * Fy, E = p.E, t = Math.atan(p.rise / (p.width / 2));
  const Wg = (p.roofing + p.live + p.extra) * p.s + p.selfW, q = p.wind * windFactor(t) * p.s;
  const Wx = Wg * Math.sin(t), Wy = normalLoad(Wg, q, t), n = p.sagRows, Ly = p.D / (n + 1);
  const Mx = (Wy * p.D ** 2) / 9, My = (Wx * Ly ** 2) / 9, SxReq = (Math.max(Mx, My) * 100) / Fb;
  const dyAllow = (p.D * 100) / 360, dy = (5 * Wy * (p.D * 100) ** 4) / (384 * 100 * E * s.Ix);
  const dxAllow = (Ly * 100) / 360, dx = (5 * Wx * (Ly * 100) ** 4) / (384 * 100 * E * s.Iy);
  const fb = (Mx * 100) / s.Sx + (My * 100) / s.Sy;
  const r = { theta: (t * 180) / Math.PI, Wg, q, Wx, Wy, Mx, My, SxReq, Fb, dyAllow, dy, dxAllow, dx, fb, reaction: (Wg * p.D) / p.s, section: s };
  if (n > 0) {
    // sag rod: tension from the down-slope load of all purlins on one roof slope over one rod spacing
    const slopeLen = Math.hypot(p.rise, p.width / 2), bars = Math.ceil(slopeLen / p.s) + 1;
    const T = ((p.roofing + p.live + p.extra) * Ly * slopeLen + s.w * Ly * bars) * Math.sin(t);
    Object.assign(r, { slopeLen, T, AsReq: T / (0.6 * p.rodFy), rMin: (p.s * 100) / 300 });
  }
  r.ok = r.SxReq <= s.Sx && fb <= Fb && dy <= dyAllow && dx <= dxAllow;
  return r;
}

// จันทัน: supported at the wall plate and the ridge, with the eave overhang; purlin loads smeared as UDL.
export function rafter(p) {
  const s = sec(p), Fy = FY[p.grade] ?? p.Fy, Fb = 0.6 * Fy, t = Math.atan(p.rise / (p.overhang + p.run));
  const slopeLen = Math.hypot(p.rise, p.overhang + p.run), a = p.overhang / Math.cos(t), L = slopeLen - a;
  const Wg = (p.roofing + p.live + p.extra) * p.s + p.purlinW, q = p.wind * windFactor(t) * p.s;
  const w = (normalLoad(Wg, q, t) * p.D) / p.s + p.selfW * Math.cos(t), Wx = (Wg + p.selfW) * Math.sin(t);
  const b = overhangBeam(w, L, a, p.E * s.Ix), My = (Wx * p.s ** 2) / 9;
  const SxReq = (Math.max(b.M, My) * 100) / Fb, fb = (b.M * 100) / s.Sx + (My * 100) / s.Sy, dAllow = (L * 100) / 360;
  return {
    theta: (t * 180) / Math.PI, slopeLen, a, L, Wg, w, Wx, Mspan: b.Mspan, Mcant: b.Mcant, Mx: b.M, My, SxReq, Fb, fb,
    x1: b.x, dSpan: b.dSpan, dTip: b.dTip, dAllow, d: b.d, Rwall: b.Rnear, Rridge: b.Rfar, section: s,
    ok: SxReq <= s.Sx && fb <= Fb && b.d <= dAllow,
  };
}

// ตะเข้สัน / ตะเข้ราง: like a rafter, carrying the jack-rafter load `transfer` (kg/m), single or double section.
export function hip(p) {
  const s = sec(p), Fy = FY[p.grade] ?? p.Fy, Fb = 0.6 * Fy, k = p.count ?? 1, t = Math.atan(p.rise / (p.overhang + p.run));
  const slopeLen = Math.hypot(p.rise, p.overhang + p.run), a = p.overhang / Math.cos(t), L = slopeLen - a;
  const w = (p.transfer + p.selfW) * Math.cos(t), b = overhangBeam(w, L, a, p.E * s.Ix * k);
  const SxReq = (b.M * 100) / Fb, fb = (b.M * 100) / (k * s.Sx), dAllow = (L * 100) / 360;
  return {
    theta: (t * 180) / Math.PI, slopeLen, a, L, w, Mspan: b.Mspan, Mcant: b.Mcant, Mx: b.M, SxReq, Fb, fb,
    x1: b.x, dSpan: b.dSpan, dTip: b.dTip, dAllow, d: b.d, Rmax: b.Rnear, Rmin: b.Rfar, section: s,
    ok: fb <= Fb && b.d <= dAllow,
  };
}

// อกไก่ / อะเส / สะพาน: simple span with UDL, single or double section.
export function simpleBeam(p) {
  const s = sec(p), Fy = FY[p.grade] ?? p.Fy, Fb = 0.6 * Fy, k = p.count ?? 1, w = p.transfer + p.selfW;
  const M = (w * p.L ** 2) / 8, SxReq = (M * 100) / Fb, fb = (M * 100) / (k * s.Sx), dAllow = (p.L * 100) / 360;
  const d = (5 * (w / 100) * (p.L * 100) ** 4) / (384 * p.E * s.Ix * k);
  return { w, Mx: M, SxReq, Fb, fb, dAllow, d, R: (w * p.L) / 2, section: s, ok: fb <= Fb && d <= dAllow };
}

// Simple span carrying point loads [{ P (kg), a (m from left) }] plus its own weight: interior wall plate under posts.
export function pointBeam(p) {
  const s = sec(p), Fy = FY[p.grade] ?? p.Fy, Fb = 0.6 * Fy, k = p.count ?? 1, w = (p.transfer ?? 0) + p.selfW, L = p.L;
  const Mat = (x) => (w * x * (L - x)) / 2 + p.loads.reduce((m, { P, a }) => m + P * (x <= a ? (x * (L - a)) / L : (a * (L - x)) / L), 0);
  const M = Math.max(...[L / 2, ...p.loads.map((l) => l.a)].map((x) => Math.abs(Mat(x)))), EI = p.E * s.Ix * k, Lc = L * 100;
  // midspan deflection (close to the maximum): UDL + each point load at its shorter distance a' from a support
  const d = Math.abs((5 * (w / 100) * Lc ** 4) / (384 * EI)
    + p.loads.reduce((t, { P, a }) => { const ac = Math.min(a, L - a) * 100; return t + (P * ac * (3 * Lc ** 2 - 4 * ac ** 2)) / (48 * EI); }, 0));
  const Rl = (w * L) / 2 + p.loads.reduce((t, { P, a }) => t + (P * (L - a)) / L, 0), Rr = (w * L) / 2 + p.loads.reduce((t, { P, a }) => t + (P * a) / L, 0);
  const SxReq = (M * 100) / Fb, fb = (M * 100) / (k * s.Sx), dAllow = (L * 100) / 360;
  return { w, Mx: M, SxReq, Fb, fb, dAllow, d, R: Math.max(Rl, Rr), Rl, Rr, P: p.loads.reduce((t, l) => t + l.P, 0), section: s, ok: fb <= Fb && d <= dAllow };
}

// Lightest section of a type that passes `check`.
export function autoSelect(type, check) {
  const list = [...SECTIONS[type]].sort((x, y) => x.w - y.w);
  for (const section of list) { const r = check(section); if (r.ok) return r; }
  return check(list[list.length - 1]);
}

export const ROOF_KEYS = {
  purlin: ["theta", "Wg", "Wx", "Wy", "Mx", "My", "SxReq", "dyAllow", "dy", "dxAllow", "dx", "fb", "reaction", "T", "AsReq"],
  rafter: ["theta", "Wg", "w", "Wx", "Mspan", "Mcant", "Mx", "My", "SxReq", "fb", "x1", "dSpan", "dAllow", "Rwall", "Rridge"],
  hip: ["theta", "w", "Mspan", "Mcant", "Mx", "SxReq", "x1", "dSpan", "dAllow", "Rmax", "Rmin"],
  beam: ["w", "Mx", "SxReq", "dAllow", "d", "R"],
};
export { rad };
