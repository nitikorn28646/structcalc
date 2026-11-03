// Wall (strip) footing, WSD, per metre of wall — behaviour learnt from the user's "Wall footings" sheet and diff-tested against it
// (difftest/wallfooting.scenario.json). One-way: bending and one-way shear across the width at the wall face / d from it, no punching;
// main bars across the width (spacing along the wall), distribution bars along the wall = 0.002·B·t.
// inp: fcPrime, F (0.375 | 0.45), capFc, fy, Es, cover (cm), t, B (width), Df (m), P (kg/m), M (kg-m/m about the wall axis),
//      qa (kg/m²), gamma (kg/m³), bw (wall thickness, m), longBar / sLong (main), shortBar / sShort (distribution), dowelBar, dowelN
import { SLAB_BARS, allowableFs } from "./tables.js";

const Ec_DENSITY = 2.323;
const rd = (x) => Math.floor(x + 1e-9); // ROUNDDOWN(x, 0)
const rd2 = (x) => Math.floor(x * 100 + 1e-9) / 100;

export function wallFooting(inp) {
  const r = {}, bl = SLAB_BARS[inp.longBar], bs = SLAB_BARS[inp.shortBar], bd = SLAB_BARS[inp.dowelBar];
  if (!bl || !bs || !bd) throw new Error("unknown bar size");
  const { fcPrime: fcp, fy, t, B, Df, P, M, bw } = inp, L = 1, sq = Math.sqrt(fcp);
  const fcRaw = inp.F * fcp;
  r.fc = inp.capFc !== false && fcRaw > 65 ? 65 : fcRaw;
  r.fs = allowableFs(fy, inp.F);
  r.Ec = Ec_DENSITY ** 1.5 * 4270 * sq;
  r.n = inp.Es / r.Ec;
  r.k = 1 / (1 + r.fs / (r.n * r.fc));
  r.j = 1 - r.k / 3;
  r.R = 0.5 * r.fc * r.k * r.j;
  // soil pressure: gross (footing + soil above) and net, trapezoid across the width from the moment
  const gross = (P + t * B * L * 2400 + (Df - t) * inp.gamma * B * L) / (B * L);
  r.qmax = gross + (6 * M) / (L * B * B);
  r.qmin = gross - (6 * M) / (L * B * B);
  r.qOk = r.qmax <= inp.qa;
  r.qminOk = r.qmin >= 0;
  r.qnMax = P / (B * L) + (6 * M) / (L * B * B);
  r.qnMin = P / (B * L) - (6 * M) / (L * B * B);
  // depths: main bars at the bottom, distribution bars above them
  r.d = t * 100 - inp.cover - bl.d / 2;
  r.d2 = t * 100 - inp.cover - bl.d - bs.d / 2;
  const a = (B - bw) / 2, qAt = (x) => ((r.qnMax - r.qnMin) * x) / B + r.qnMin; // net pressure at x from the low edge
  r.qFace = qAt(B / 2 + bw / 2);
  // moment at the wall face per metre: rectangle at the face pressure + triangle up to the edge
  r.M = qAt(a + bw) * L * a ** 2 / 2 + ((r.qnMax - qAt(a + bw)) * L * a * (a * (2 / 3))) / 2;
  // one-way shear at d from the face
  const xd = B / 2 + bw / 2 + r.d / 100;
  r.V = ((qAt(xd) + r.qnMax) * (B - xd) * L) / 2;
  r.dReq = Math.sqrt((r.M * 100) / (r.R * L * 100));
  r.dOk = r.d >= r.dReq;
  r.vc = 0.29 * sq;
  r.v = r.V / (L * 100 * r.d);
  r.vOk = r.v <= r.vc;
  // main steel across the width
  r.nMain = rd(L / inp.sLong + 1);
  r.AsMin = (14 / fy) * L * 100 * r.d;
  r.AsReq = (r.M * 100) / (r.fs * r.j * r.d);
  r.AsProv = bl.A * r.nMain;
  r.AsOk = r.AsProv >= r.AsReq && r.AsProv >= r.AsMin;
  // bond (u allowable by bar size and grade, limit uMax) and anchorage of the main bars
  const deep = r.d > 30;
  r.uMax = fy === 2400 ? 11 : deep ? 25 : 35;
  r.u = fy === 2400 ? ((deep ? 1.145 : 1.615) * sq) / bl.d : ((deep ? 2.29 : 3.23) * sq) / bl.d;
  r.perimReq = (((r.qnMax + r.qFace) / 2) * a * L) / (r.u * r.j * r.d);
  r.perim = r.nMain * bl.p;
  r.perimOk = r.perim >= r.perimReq;
  r.anc = r.u <= r.uMax ? (bl.d * r.fs) / (4 * r.u) : (bl.d * r.fs) / (4 * r.uMax);
  r.ancAvail = a * 100 - inp.cover;
  r.ancOk = r.ancAvail >= r.anc;
  // distribution steel along the wall
  r.nTemp = rd(B / inp.sShort + 1);
  r.AsTempMin = 0.002 * B * 100 * t * 100;
  r.AsTemp = bs.A * r.nTemp;
  r.AsTempOk = r.AsTemp >= r.AsTempMin;
  // dowels from the wall
  r.uaD = fy === 2400 ? 11 : 28;
  r.uD = fy === 2400 ? 0.86 * sq : 1.72 * sq;
  r.perimReqD = (((r.qnMax + r.qFace) / 2) * a * L) / (r.uD * r.j * r.d);
  r.perimD = inp.dowelN * bd.p;
  r.perimDOk = r.perimD >= r.perimReqD;
  r.ancD = (r.uD <= r.uaD ? (bd.d * r.fs) / (4 * r.uD) : (bd.d * r.fs) / (4 * r.uaD)) / 100;
  r.ancUseD = rd2(r.ancD + r.ancD / 4);
  r.bearing = P / (bw * 100 * L * 100);
  r.mainText = `${r.nMain}-${inp.longBar} @ ${inp.sLong}`;
  r.tempText = `${r.nTemp}-${inp.shortBar} @ ${inp.sShort}`;
  r.ok = r.qOk && r.qminOk && r.dOk && r.vOk && r.AsOk && r.perimOk && r.ancOk && r.AsTempOk && r.perimDOk;
  return r;
}

export const WALLFOOTING_KEYS = ["fc", "fs", "n", "k", "j", "R", "qmax", "qmin", "qnMax", "qnMin", "qFace", "M", "V", "d", "d2", "dReq", "vc", "v",
  "nMain", "AsMin", "AsReq", "AsProv", "uMax", "u", "perimReq", "perim", "anc", "ancAvail", "nTemp", "AsTempMin", "AsTemp",
  "uaD", "uD", "perimReqD", "perimD", "ancD", "ancUseD", "bearing"];
