import { designSection } from "../engine/beam.js";

export const DEFAULT_STATE = {
  project: {
    name: "บ้านพักอาศัย คสล. 2 ชั้น", owner: "", location: "", engineer: "", license: "",
    beamNo: "B1", floor: "FL-2", date: new Date().toISOString().slice(0, 10),
  },
  mat: { fcPrime: 180, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 },
  geom: { type: "both_ends", b: 0.2, h: 0.5, L: 5 },
  loads: { useW: true, w: 2880, Mmid: 4500, Msup: 6000, V: 9000, Mt: 0 },
  stirrup: { bar: "RB 9", sets: 1, sMid: 0.1, sSup: 0.1 },
  mid: {
    top: [{ main: { n: 2, bar: "DB 16" } }, {}, {}],
    bottom: [{ main: { n: 2, bar: "DB 20" }, special: { n: 1, bar: "DB 16" } }, {}, {}],
  },
  sup: {
    top: [{ main: { n: 2, bar: "DB 20" }, special: { n: 2, bar: "DB 16" } }, {}, {}],
    bottom: [{ main: { n: 2, bar: "DB 20" }, special: { n: 1, bar: "DB 16" } }, {}, {}],
  },
};

// Single-span elastic results under uniform load w: support moments (left/right, hogging), max sagging, max shear.
const W_FORMULAS = {
  simple: (w, L) => ({ ML: 0, MR: 0, Mmid: (w * L * L) / 8, V: (w * L) / 2 }),
  one_end: (w, L) => ({ ML: 0, MR: (w * L * L) / 8, Mmid: (9 * w * L * L) / 128, V: (5 * w * L) / 8 }),
  both_ends: (w, L) => ({ ML: (w * L * L) / 12, MR: (w * L * L) / 12, Mmid: (w * L * L) / 24, V: (w * L) / 2 }),
  cantilever: (w, L) => ({ ML: (w * L * L) / 2, MR: 0, Mmid: 0, V: w * L }),
};

// Equivalent uniform load reproducing manually entered M+ / M− for the span type.
function impliedW(type, L, Mmid, Msup) {
  if (type === "simple") return (8 * Mmid) / L ** 2;
  if (type === "both_ends") return (8 * (Mmid + Msup)) / L ** 2;
  if (type === "cantilever") return (2 * Msup) / L ** 2;
  // one end fixed: Mmax = (wL/2 − Ms/L)² / 2w  → quadratic in w (larger root)
  const a = L / 2, b = Msup / L, p = 2 * a * b + 2 * Mmid;
  return (p + Math.sqrt(Math.max(0, p * p - 4 * a * a * b * b))) / (2 * a * a);
}

// Design forces plus the end moments / load used to draw the diagrams.
export function beamForces(st) {
  const { type, L } = st.geom;
  const { useW, w, Mt } = st.loads;
  if (useW) {
    const f = W_FORMULAS[type](w, L);
    return { ...f, w, Msup: Math.max(f.ML, f.MR), Mt, derived: true };
  }
  const { Mmid, Msup, V } = st.loads;
  const ends = { simple: [0, 0], one_end: [0, Msup], both_ends: [Msup, Msup], cantilever: [Msup, 0] }[type];
  return { w: impliedW(type, L, Mmid, Msup), ML: ends[0], MR: ends[1], Mmid, Msup, V, Mt, derived: false };
}

// V(x), M(x) for a span under uniform w with hogging end moments ML, MR (cantilever fixed at x = 0).
export function spanFunctions(type, L, w, ML, MR, point) {
  if (type === "cantilever") {
    const P = point?.P ?? 0, a = point?.a ?? 0;
    return {
      V: (x) => w * (L - x) + (x < a ? P : 0),
      M: (x) => -(w * (L - x) ** 2) / 2 - (x < a ? P * (a - x) : 0),
    };
  }
  const V0 = (w * L) / 2 + (ML - MR) / L;
  return { V: (x) => V0 - w * x, M: (x) => -ML + V0 * x - (w * x * x) / 2 };
}

function sectionInput(st, which) {
  const sec = st[which];
  const isSup = which === "sup";
  const negative = isSup || st.geom.type === "cantilever"; // tension at top?
  const f = beamForces(st);
  const M = isSup ? f.Msup : f.Mmid;
  return {
    ...st.mat, ...st.geom, M, V: f.V, Mt: st.loads.Mt,
    s: isSup ? st.stirrup.sSup : st.stirrup.sMid,
    stirrup: { bar: st.stirrup.bar, sets: st.stirrup.sets },
    // engine: "bottom" = tension face, "top" = compression face
    top: negative ? sec.bottom : sec.top,
    bottom: negative ? sec.top : sec.bottom,
    tensionAtTop: negative,
  };
}

export function runBeam(st) {
  const out = {};
  for (const w of ["mid", "sup"]) {
    const inp = sectionInput(st, w);
    try {
      out[w] = { inp, r: designSection(inp) };
    } catch (e) {
      out[w] = { inp, error: e.message };
    }
  }
  return out;
}

export function barText(layer) {
  const p = [];
  if (layer?.main?.n) p.push(`${layer.main.n}-${layer.main.bar}`);
  if (layer?.special?.n) p.push(`${layer.special.n}-${layer.special.bar}`);
  return p.join(" + ");
}

export function sectionOk(r) {
  return r.minDepthOk && r.deepOk && r.nOk && r.AsMinOk && r.doublyCheck === "OK" && r.VpOk && r.vtOk &&
    r.vOk && r.AminOk && r.stirrup !== "CHECK_SPACING" && r.topOk && r.botOk;
}

export const fmt = (x, dp = 2) =>
  typeof x === "number" && Number.isFinite(x) ? x.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp }) : x ?? "-";
