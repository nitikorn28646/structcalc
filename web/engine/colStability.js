// Column stability — the ONE place where the slenderness of a workflow column is decided (user approval 2026-11-05, column audit rounds 1–4).
// 1 storeyStability: stability index per storey Q = ΣPu·Δo/(Vus·lc) (ACI 318-11 10.10.5.2) from a first-order 3D solve with
//   0.70Ig columns / 0.35Ig beams (10.10.4.1) and rigid floors; ΣD, ΣL from the same solve (L-only case); Δo/Vus from one lateral case
//   (Δo ∝ Vus, so the size cancels): the real wind of the project when wind is on, else forces ∝ w·h; ΣPu = max(1.4D, 1.2D + 1.6L)
//   (ACI 318-11 9.2.1, the largest gravity combination — it is ≥ every combination with wind/earthquake). Q ≤ 0.05 → non-sway.
// 2 columnSlender: ψ at both ends per direction with the beam SPAN to the next column (not the 3D element), two methods
//   (a) the h′ formulas of column.js (form of ACI 318-63 §916, UNVERIFIED): both ends restrained h′ = (0.78 + 0.22·r′avg)h ≥ h,
//       one end hinged h′ = 2(0.78 + 0.22·r′)h ≥ 2h, r′ = ΣK columns / ΣK beams (gross I/L) — the ≥ h / ≥ 2h floors from mechanics
//       (a sway column has k ≥ 1, a sway column hinged at one end k ≥ 2: ACI 318-11 Fig. R10.10.1.1 b)
//   (b) the alignment chart (ACI 318-11 R10.10.1, AISC 360-10 Comm. C-A-7 equations; 0.70/0.35Ig; far end pinned ×0.5 sway / ×1.5 braced)
//   sway storey: k = max(a, b) per direction (conservative until the source texts are checked), R = 1.07 − 0.008·k·Lu/r ≤ 1;
//   non-sway storey: k = 1, R as column.js case 1 (klu/r < 60 → 1, else 1.32 − 0.006·klu/r); r = 0.25 × side in that direction
//   (the column.js value; ACI 318-11 10.10.1.2 gives 0.30 — not changed, UNVERIFIED). The R used is never larger than the R of the
//   previous rule (L/B > 15 → case 2, k = 1, r = 0.25·Bx), so no column gets less reduction than before (no safety requirement lowered).
// The R goes to tiedColumn once (inp.slenderR); frame.js does not reduce again. Free-top columns: frame.freeTop "braced" (user decision)
// = the top is held by the roof framing → non-sway member; leaning columns (no rotational restraint at either end) k = 1 themselves.
import { frame3dModel, solveFrame3D } from "./frame3d.js";
import { windForces } from "./lateral.js";

export const SLENDER_BASIS = "R / h′: รูปแบบ ACI 318-63 §915–916 (จาก Excel) + Q ACI 318-11 10.10.5.2 + k จาก alignment chart — UNVERIFIED (ยังไม่เทียบต้นฉบับ ว.ส.ท./ACI 318-63)";

export const kSway = (a, b) => { a = Math.min(a, 1e4); b = Math.min(b, 1e4); const f = (x) => (a * b * x * x - 36) / (6 * (a + b)) - x / Math.tan(x); let lo = 1e-6, hi = Math.PI - 1e-9;
  if (f(lo) > 0) return 1; for (let i = 0; i < 200; i++) { const m = (lo + hi) / 2; if (f(m) < 0) lo = m; else hi = m; } return Math.PI / ((lo + hi) / 2); };
const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < 0.035;

// one first-order solve: D + L (main), L alone, lateral X, lateral Y
export function storeyStability(frame, res) {
  const md = frame3dModel(frame, res, { buildOnly: true });
  const { nodes, members, nodeLoads, diaphragms: DI, Z, E } = md;
  if (!DI.length) return null;
  const wOn = !!frame.lateral?.wind?.on, W = wOn ? windForces(frame) : null;
  // level weights for the ∝ w·h pattern: loads hanging on each level (beam loads + half the columns, rough — only the shape matters)
  const lev = Z.map(() => 0);
  members.forEach((m) => { const k = Z.findIndex((z) => Math.abs(z - nodes[m.i].z) < 1e-6); if (k >= 0 && m.kind === "beam") lev[k] += (m.loads ?? []).reduce((s, l) => s + (l.P ?? ((l.wa + l.wb) / 2) * (l.b - l.a)), 0); });
  nodeLoads.forEach((l) => { const k = Z.findIndex((z) => Math.abs(z - nodes[l.n].z) < 1e-6); if (k >= 0) lev[k] += l.P; }); // roof loads / column self weight at the level
  const F = (ax) => Z.map((z, k) => (W ? W[ax ? "y" : "x"].floors[k]?.F ?? 0 : Math.max(lev[k], 1) * z));
  const lat = (ax) => ({ lateral: DI.map((d) => { const k = Z.findIndex((z) => Math.abs(z - d.z) < 1e-6), v = F(ax)[k] ?? 0; return { n: d.master, F: ax ? [0, v, 0] : [v, 0, 0] }; }) });
  const Lcase = { loads: members.map((m) => ({ loads: (m.loads ?? []).filter((l) => l.g === "LL"), torque: m.torqueL ?? [] })) };
  const sol = solveFrame3D({ nodes, members, nodeLoads, E, pDelta: false, factors: { beam: 0.35, column: 0.7, J: 0.2 }, diaphragms: DI, cases: [Lcase, lat(0), lat(1)] });
  if (!sol.members || !sol.cases) return null;
  // storey axial load: per column the largest piece (a column split by a landing beam), summed per storey (algebraic)
  const storeyN = (ms) => frame.floors.map((_, f) => { const per = new Map(); ms.forEach((m, i) => { if (m.kind !== "column" || members[i].floor !== f) return; const k = members[i].ci; per.set(k, Math.max(per.get(k) ?? -Infinity, m.f[0])); }); return [...per.values()].reduce((s, v) => s + v, 0); });
  const SDL = storeyN(sol.members), SL = storeyN(sol.cases[0].members);
  const storeys = frame.floors.map((fl, k) => {
    const d = DI.findIndex((x) => Math.abs(x.z - Z[k]) < 1e-6), db = k ? DI.findIndex((x) => Math.abs(x.z - Z[k - 1]) < 1e-6) : -1, lc = fl.h ?? 3;
    const D = SDL[k] - SL[k], L = SL[k], Pu = Math.max(1.4 * D, 1.2 * D + 1.6 * L), dir = [0, 1].map((ax) => {
      const u = sol.cases[1 + ax].u, Do = d < 0 ? 0 : Math.abs(u[DI[d].master * 6 + ax] - (db >= 0 ? u[DI[db].master * 6 + ax] : 0)), V = F(ax).slice(k).reduce((s, v) => s + v, 0);
      return { V, Do, Q: V > 0 ? (Pu * Do) / (V * lc) : 0 }; });
    const Q = Math.max(dir[0].Q, dir[1].Q);
    return { floor: k, name: fl.name, lc, D, L, Pu, combo: 1.4 * D >= 1.2 * D + 1.6 * L ? "1.4D" : "1.2D + 1.6L", x: dir[0], y: dir[1], Q, sway: Q > 0.05, pattern: W ? "ลม (มยผ. 1311-50)" : "∝ w·h" };
  });
  return { storeys, nodes, members, Z };
}

// ψ at node n bending about global x ("x": beams along y resist) / y; mode "aci-sway" | "aci-braced" | "63" (gross, no far-end factor)
function psiAt(st, res, n, ax, mode) {
  const { nodes: N, members: M, frameFloors } = st, nd = N[n];
  if (!nd) return Infinity;
  if (nd.pinned) return Infinity; if (nd.fixed) return mode === "63" ? 0 : 1;
  const cols = new Map(); for (const m of M) if (m.kind === "column" && (m.i === n || m.j === n)) cols.set(`${m.floor}|${m.ci}`, m);
  const C = [...cols.values()].reduce((s, m) => s + ((mode === "63" ? 1 : 0.7) * m.E * (ax === "x" ? m.b * m.h ** 3 : m.h * m.b ** 3)) / 12 / (frameFloors[m.floor].h ?? 3), 0);
  let B = 0;
  for (const m of M) {
    if (m.kind !== "beam" || (m.i !== n && m.j !== n)) continue; const end = m.i === n ? 0 : 1; if (m.release?.[end]) continue;
    const ln = res.floors[m.floor]?.lines?.find((l) => l.id === m.line); if (!ln) continue;
    const tj = end ? m.x1 : m.x0, dir = end ? -1 : 1, Le = Math.hypot(N[m.j].x - N[m.i].x, N[m.j].y - N[m.i].y);
    const w = (ax === "x" ? Math.abs(N[m.j].y - N[m.i].y) : Math.abs(N[m.j].x - N[m.i].x)) / (Le || 1);
    const ts = ln.cols.map((c) => c.t).filter((t) => dir * (t - tj) > 1e-6).sort((a, b) => dir * (a - b));
    let far = "col", Lb;
    if (ts.length) Lb = Math.abs(ts[0] - tj);
    else { const tE = dir > 0 ? ln.L : 0, pE = dir > 0 ? ln.B : ln.A; Lb = Math.abs(tE - tj);
      far = ln.carriers.some((c) => Math.abs(c.t - tE) < 1e-3) || res.floors[m.floor].lines.some((o) => o.id !== ln.id && [o.A, o.B].some((q) => Math.hypot(q[0] - pE[0], q[1] - pE[1]) < 0.035)) ? "pin" : "free"; }
    if (Lb < 1e-6 || w < 1e-6) continue;
    const fac = mode === "63" ? (far === "free" ? 0 : 1) : far === "col" ? 1 : far === "pin" ? (mode === "aci-sway" ? 0.5 : 1.5) : 0;
    B += (w * (mode === "63" ? 1 : 0.35) * m.E * (m.b * m.h ** 3) / 12 * fac) / Lb;
  }
  return B > 0 ? C / B : Infinity;
}

// per column: { R, klr, Rx, Ry, kx, ky, sway, Q, basis, … } for tiedColumn (inp.slenderR) — c = a column of analyzeFrame (floor, i, p, lv, Lu, L, Leff)
export function columnSlender(frame, res, stab, c) {
  const lv = c.lv; if (!lv) return null;
  const L = c.Leff ?? c.Lu ?? c.L, Lcm = L * 100;
  // previous rule (column.js with frameCase 2 as frame.js called it): slender only when L/B > 15, k = 1, r = 0.25·Bx
  const klrOld = Lcm / (0.25 * lv.Bx), Rold = L / (Math.min(lv.Bx, lv.By) / 100) > 15 ? Math.min(1, 1.07 - 0.008 * klrOld) : 1;
  const out = { Rold, klrOld, basis: SLENDER_BASIS };
  const st = stab?.storeys?.[c.floor];
  if (!st) return { ...out, R: Rold, klr: klrOld, source: "old" };
  const Z = stab.Z, zb = c.floor ? Z[c.floor - 1] : 0, zt = Z[c.floor], P = { x: c.p[0], y: c.p[1] };
  const find = (z) => stab.nodes.findIndex((q) => !q.master && Math.abs(q.z - z) < 1e-6 && near(q, P));
  const nb = find(zb), nt = find(zt), S = { ...stab, frameFloors: frame.floors };
  const heldTop = c.free && (frame.freeTop ?? "braced") === "braced"; // user decision 2026-11-03: the roof framing holds free tops
  const dirs = ["x", "y"].map((ax) => {
    const t = Math.min(ax === "x" ? lv.By : lv.Bx, ax === "x" ? lv.By : lv.Bx), r = 0.25 * (ax === "x" ? lv.By : lv.Bx); // bending about x → depth By
    const p63 = [psiAt(S, res, nb, ax, "63"), psiAt(S, res, nt, ax, "63")], pS = [psiAt(S, res, nb, ax, "aci-sway"), psiAt(S, res, nt, ax, "aci-sway")];
    const lean = p63[0] > 1e3 && p63[1] > 1e3, hinged = !lean && (p63[0] > 1e3 || p63[1] > 1e3);
    const rRest = p63[0] > 1e3 ? p63[1] : p63[0], k63 = lean ? 1 : hinged ? Math.max(2, 2 * (0.78 + 0.22 * Math.min(rRest, 1e4))) : Math.max(1, 0.78 + 0.22 * 0.5 * (p63[0] + p63[1]));
    const kCh = lean ? 1 : kSway(pS[0], pS[1]);
    const sway = st.sway && !heldTop, k = sway ? Math.max(k63, kCh) : 1, klr = (k * Lcm) / r;
    const R = sway ? Math.min(1, 1.07 - 0.008 * klr) : klr < 60 ? 1 : 1.32 - 0.006 * klr;
    return { ax, psi63: p63, psiAci: pS, k63, kCh, k, klr, R, sway, lean, hinged, t };
  });
  const Rnew = Math.min(dirs[0].R, dirs[1].R), klrNew = Math.max(dirs[0].klr, dirs[1].klr);
  return { ...out, R: Math.min(Rnew, Rold), klr: Math.max(klrNew, klrOld), Rnew, klrNew, dirs, Q: st.Q, sway: st.sway && !heldTop, heldTop, source: Rnew < Rold - 1e-12 ? "new" : "old" };
}
