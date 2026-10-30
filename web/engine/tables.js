// Rebar data: nominal area (cm²) and diameter (cm), TIS 20/24 sizes.
export const BARS = {
  "RB 12": { A: 1.13, d: 1.2 }, "RB 15": { A: 1.77, d: 1.5 }, "RB 19": { A: 2.84, d: 1.9 },
  "RB 25": { A: 4.91, d: 2.5 }, "DB 12": { A: 1.13, d: 1.2 }, "DB 16": { A: 2.01, d: 1.6 },
  "DB 20": { A: 3.14, d: 2.0 }, "DB 25": { A: 4.91, d: 2.5 }, "DB 28": { A: 6.16, d: 2.8 },
  "DB 32": { A: 8.04, d: 3.2 },
};

export const STIRRUPS = {
  "RB 6": { A: 0.28, d: 0.6 }, "RB 9": { A: 0.64, d: 0.9 }, "RB 12": { A: 1.13, d: 1.2 },
  "RB 15": { A: 1.77, d: 1.5 }, "DB 10": { A: 0.76, d: 1.0 }, "DB 12": { A: 1.13, d: 1.2 },
  "DB 16": { A: 2.01, d: 1.6 },
};

// Slab bars: area (cm²), diameter (cm), perimeter (cm) for bond.
export const SLAB_BARS = {
  "RB 6": { A: 0.28, d: 0.6, p: 1.886 }, "RB 9": { A: 0.64, d: 0.9, p: 2.829 }, "RB 12": { A: 1.13, d: 1.2, p: 3.771 },
  "RB 15": { A: 1.77, d: 1.5, p: 4.714 }, "RB 19": { A: 2.84, d: 1.9, p: 5.971 }, "RB 25": { A: 4.91, d: 2.5, p: 7.857 },
  "DB 10": { A: 0.78, d: 1.0, p: 3.14 }, "DB 12": { A: 1.13, d: 1.2, p: 3.771 }, "DB 16": { A: 2.01, d: 1.6, p: 5.029 },
  "DB 20": { A: 3.14, d: 2.0, p: 6.29 }, "DB 25": { A: 4.91, d: 2.5, p: 7.857 }, "DB 28": { A: 6.16, d: 2.8, p: 8.8 },
  "DB 32": { A: 8.04, d: 3.2, p: 10.06 },
};

export const ONE_WAY_SUPPORTS = {
  simple: { label: "Simply supported", mDiv: 8, tDiv: 20, vFactor: 1 },
  one_end: { label: "One end continuous", mDiv: 9, tDiv: 24, vFactor: 1.15 },
  both_ends: { label: "Both ends continuous", mDiv: 10, tDiv: 28, vFactor: 1.15 },
};

// Two-way slab moment coefficients, ACI 318-63 Method 2 (ว.ส.ท.), at m = S/L = 0.5, 0.6 … 1.0.
// Short span: [M− continuous, M− discontinuous, M+ midspan]; long span coefficients do not vary with m.
export const TWO_WAY_CASES = {
  1: { label: "ต่อเนื่องทั้ง 4 ด้าน", short: [[.083, .063, .055, .048, .040, .033], [0, 0, 0, 0, 0, 0], [.062, .047, .041, .036, .030, .025]], long: [.033, 0, .025] },
  2: { label: "ไม่ต่อเนื่อง 1 ด้าน", short: [[.085, .069, .062, .055, .048, .041], [.042, .035, .031, .027, .024, .021], [.064, .052, .047, .041, .036, .031]], long: [.041, .021, .031] },
  3: { label: "ไม่ต่อเนื่อง 2 ด้าน", short: [[.090, .078, .071, .064, .057, .049], [.045, .039, .036, .032, .028, .025], [.068, .059, .054, .048, .043, .037]], long: [.049, .025, .037] },
  4: { label: "ไม่ต่อเนื่อง 3 ด้าน", short: [[.098, .090, .082, .074, .066, .058], [.049, .045, .041, .037, .033, .029], [.074, .068, .062, .056, .050, .044]], long: [.058, .029, .044] },
  5: { label: "ไม่ต่อเนื่อง 4 ด้าน", short: [[0, 0, 0, 0, 0, 0], [.055, .053, .047, .043, .038, .033], [.083, .080, .072, .064, .057, .050]], long: [0, .033, .050] },
};

export const BEAM_TYPES = {
  simple: { label: "Simple beam", minDepthDiv: 16, deepLimit: 0.8 },
  one_end: { label: "One end continuous", minDepthDiv: 18.5, deepLimit: 0.4 },
  both_ends: { label: "Both ends continuous", minDepthDiv: 21, deepLimit: 0.4 },
  cantilever: { label: "Cantilever", minDepthDiv: 8, deepLimit: 0.4 },
};

export const GRADES = { 2400: "SR-24", 3000: "SD-30", 4000: "SD-40", 5000: "SD-50" };

// Allowable tensile stress of rebar (ksc) per Thai ministerial regulation, by fy and fc/f'c factor.
export function allowableFs(fy, F) {
  if (fy === 2400) return 1200;
  if (fy === 3000) return 1500;
  if (fy === 4000) return F === 0.375 ? 1500 : 1700;
  if (fy === 5000) return 1700;
  return NaN;
}
