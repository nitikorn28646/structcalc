// 3D rigid-jointed frame (space frame, 6 DOF per node) for the whole building: columns + beams of every floor.
// Gravity loads come from the floor analysis (slab / wall / stair … line loads, beam self weight, point loads); column bases are
// fixed or pinned (default: 1–2 pile caps take no moment) at the footing top; a beam end carried by another beam (no column) is pinned (bending released); joints elsewhere are
// rigid. Cracked stiffness: beams 0.5·Ig, columns 0.7·Ig, torsion 0.2·J. Optional P-Delta (geometric stiffness, iterated).
// Units: m, kg, kg-m. Global axes: X, Y plan, Z up (base Z = 0 = top of the footings).
import { CONC, shearRange } from "./floor.js";
import { arcGeom, arcPoint } from "./arc.js";

const GP = [[-Math.sqrt(3 / 5), 5 / 9], [0, 8 / 9], [Math.sqrt(3 / 5), 5 / 9]];
const shape = (x, L) => { const s = x / L; return [1 - 3 * s * s + 2 * s ** 3, L * (s - 2 * s * s + s ** 3), 3 * s * s - 2 * s ** 3, L * (s ** 3 - s * s)]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a) => { const L = Math.hypot(...a); return a.map((v) => v / L); };
const EcOf = (mat, fc) => 2.323 ** 1.5 * 4270 * Math.sqrt(fc ?? mat.fcPrime) * 1e4; // kg/m², as the WSD engines (fc: f'c of that member kind)
// torsion constant of a b × h rectangle (b ≤ h)
const Jrect = (b, h) => { const a = Math.min(b, h), c = Math.max(b, h); return a ** 3 * c * (1 / 3 - 0.21 * (a / c) * (1 - a ** 4 / (12 * c ** 4))); };

// local 12×12 stiffness: DOF per end ux uy uz rx ry rz; bending about local y (x–z plane, Iy) and local z (x–y plane, Iz)
function localK(E, G, A, Iy, Iz, J, L, N = 0) {
  const k = Array.from({ length: 12 }, () => new Array(12).fill(0)), s = (i, j, v) => { k[i][j] += v; if (i !== j) k[j][i] += v; };
  const a = (E * A) / L, t = (G * J) / L;
  s(0, 0, a); s(0, 6, -a); s(6, 6, a); s(3, 3, t); s(3, 9, -t); s(9, 9, t);
  const z = (EI) => [12 * EI / L ** 3, 6 * EI / L ** 2, 4 * EI / L, 2 * EI / L];
  const [z1, z2, z3, z4] = z(E * Iz); // x–y plane: uy (1,7), rz (5,11)
  s(1, 1, z1); s(1, 5, z2); s(1, 7, -z1); s(1, 11, z2); s(5, 5, z3); s(5, 7, -z2); s(5, 11, z4); s(7, 7, z1); s(7, 11, -z2); s(11, 11, z3);
  const [y1, y2, y3, y4] = z(E * Iy); // x–z plane: uz (2,8), ry (4,10)
  s(2, 2, y1); s(2, 4, -y2); s(2, 8, -y1); s(2, 10, -y2); s(4, 4, y3); s(4, 8, y2); s(4, 10, y4); s(8, 8, y1); s(8, 10, y2); s(10, 10, y3);
  if (N) { // P-Delta: consistent geometric stiffness (N > 0 tension) in both bending planes
    const g = N / (30 * L), m = [[36, 3 * L, -36, 3 * L], [3 * L, 4 * L * L, -3 * L, -L * L], [-36, -3 * L, 36, -3 * L], [3 * L, -L * L, -3 * L, 4 * L * L]];
    const put = (d, sg) => { for (let a = 0; a < 4; a++) for (let b = a; b < 4; b++) s(d[a], d[b], g * m[a][b] * sg[a] * sg[b]); };
    put([1, 5, 7, 11], [1, 1, 1, 1]); put([2, 4, 8, 10], [1, -1, 1, -1]); // x–z plane: θy = −dw/dx
  }
  return k;
}
// static condensation of released DOFs r (rotations at a pinned end): k* = kaa − kar krr⁻¹ kra, f* = fa − kar krr⁻¹ fr
function condense(k, f, r) {
  if (!r.length) return { k, f };
  const n = r.length, krr = r.map((i) => r.map((j) => k[i][j])), inv = invert(krr);
  const kk = k.map((row) => [...row]), ff = [...f];
  for (let i = 0; i < 12; i++) {
    if (r.includes(i)) continue;
    const kir = r.map((q) => k[i][q]), w = kir.map((_, a) => kir.reduce((s, v, b) => s + v * inv[b][a], 0));
    for (let j = 0; j < 12; j++) if (!r.includes(j)) kk[i][j] -= w.reduce((s, v, a) => s + v * k[r[a]][j], 0);
    ff[i] -= w.reduce((s, v, a) => s + v * f[r[a]], 0);
  }
  for (const q of r) { for (let j = 0; j < 12; j++) { kk[q][j] = 0; kk[j][q] = 0; } ff[q] = 0; }
  return { k: kk, f: ff, inv, n };
}
function invert(M) {
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c] || 1e-30;
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map((r) => r.slice(n));
}
// K·x = F for several right-hand sides: unknowns renumbered by reverse Cuthill–McKee so that K is banded, then banded
// elimination without pivoting (a stiffness matrix of a stable frame is symmetric positive definite); a pivot that is tiny
// compared with its diagonal falls back to the dense solve with partial pivoting. (Review 2026-11-03: a 3-storey house of
// 215 joints took 5 s per analysis with the dense solve only.)
function solveMany(K, Fs) {
  const n = K.length;
  if (n < 60) return solveDense(K, Fs);
  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) { const r = K[i]; for (let j = i + 1; j < n; j++) if (r[j] !== 0) { adj[i].push(j); adj[j].push(i); } }
  const deg = adj.map((a) => a.length), seen = new Uint8Array(n), order = [];
  while (order.length < n) {
    let s = -1; for (let i = 0; i < n; i++) if (!seen[i] && (s < 0 || deg[i] < deg[s])) s = i;
    seen[s] = 1; const q = [s];
    for (let h = 0; h < q.length; h++) { order.push(q[h]); const nb = adj[q[h]].filter((j) => !seen[j]).sort((a, b) => deg[a] - deg[b]); for (const j of nb) { seen[j] = 1; q.push(j); } }
  }
  order.reverse();
  const pos = new Int32Array(n); order.forEach((o, k) => (pos[o] = k));
  let bw = 0; for (let i = 0; i < n; i++) for (const j of adj[i]) bw = Math.max(bw, Math.abs(pos[i] - pos[j]));
  if (bw > n / 3) return solveDense(K, Fs); // no gain
  const m = Fs.length, A = order.map((o) => { const row = new Float64Array(n + m), r = K[o]; for (const j of adj[o]) row[pos[j]] = r[j]; row[pos[o]] = r[o]; Fs.forEach((F, q) => (row[n + q] = F[o])); return row; });
  for (let c = 0; c < n; c++) {
    const rc = A[c], piv = rc[c], hi = Math.min(n - 1, c + bw);
    if (!(Math.abs(piv) > 1e-10 * Math.abs(K[order[c]][order[c]]) && Math.abs(piv) > 1e-9)) return solveDense(K, Fs);
    for (let r = c + 1; r <= hi; r++) { const f = A[r][c] / piv; if (f) { const rr = A[r]; for (let j = c; j <= hi; j++) rr[j] -= f * rc[j]; for (let q = 0; q < m; q++) rr[n + q] -= f * rc[n + q]; } }
  }
  return Fs.map((_, q) => {
    const y = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = A[i][n + q]; const hi = Math.min(n - 1, i + bw); for (let j = i + 1; j <= hi; j++) s -= A[i][j] * y[j]; y[i] = s / A[i][i]; }
    const x = new Float64Array(n); order.forEach((o, k) => (x[o] = y[k])); return x;
  });
}
// dense solve of K·x = F for several right-hand sides at once (Gaussian elimination, partial pivoting); null when singular
function solveDense(K, Fs) {
  const n = K.length, m = Fs.length, A = K.map((r, i) => Float64Array.from([...r, ...Fs.map((F) => F[i])]));
  for (let c = 0; c < n; c++) {
    let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-9) { solveDense.bad = c; return null; } // the unknown with no stiffness (reported by the caller)
    if (p !== c) [A[c], A[p]] = [A[p], A[c]];
    const rc = A[c];
    for (let r = c + 1; r < n; r++) { const f = A[r][c] / rc[c]; if (f) { const rr = A[r]; for (let j = c; j < n + m; j++) rr[j] -= f * rc[j]; } }
  }
  return Fs.map((_, q) => {
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) { let s = A[i][n + q]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j]; x[i] = s / A[i][i]; }
    return x;
  });
}

// members: { i, j (node ids), kind "beam"|"column", b, h (m; beam: width b, depth h vertical; column: Bx along X, By along Y),
//   release: [bool i, bool j] (pinned bending at that end), loads: [{a,b,wa,wb} | {at,P}] downward along the member (beams) }
// nodes: [{ x, y, z, fixed, pinned, master }] (pinned = translations held only; master = diaphragm node, only ux uy rz free);
// nodeLoads: [{ n, P }] downward (kg); lateral: [{ n, F: [Fx, Fy, Mz?] }] (kg, kg-m)
// diaphragms: [{ master, slaves: [node ids] }] rigid in-plane floors (penalty constraints on ux, uy, rz)
// cases (optional): extra load cases solved with the same stiffness (the P-Delta axial forces of the main loads):
//   [{ nodeLoads, lateral, loads: [per member { loads, torque }] }] → result.cases[k] = { u, R, members }

// equivalent nodal loads (local, 12) of a member's gravity loads and distributed torque
function nodalLoads(loads, torque, L) {
  const fe = [0, 0, 0, 0];
  for (const l of loads ?? []) {
    if (l.P !== undefined) { shape(l.at, L).forEach((N, k) => (fe[k] -= l.P * N)); continue; }
    const h = (l.b - l.a) / 2, mid = (l.a + l.b) / 2;
    for (const [g, wt] of GP) { const xs = mid + g * h, w = l.wa + ((l.wb - l.wa) * (xs - l.a)) / (l.b - l.a || 1); shape(xs, L).forEach((N, k) => (fe[k] -= wt * h * w * N)); }
  }
  let t = 0; for (const v of torque ?? []) t += v; // distributed torque total (kg-m), half to each end
  const fl = new Array(12).fill(0);
  fl[2] = fe[0]; fl[4] = -fe[1]; fl[8] = fe[2]; fl[10] = -fe[3]; // θ about +y = −dw/dx
  if (t) { fl[3] = t / 2; fl[9] = t / 2; }
  return fl;
}

export function solveFrame3D({ nodes, members, nodeLoads = [], lateral = [], E, pDelta = false, factors = { beam: 0.5, column: 0.7, J: 0.2 }, diaphragms = [], cases = [] }) {
  const G = E / 2.4, nd = nodes.length * 6;
  const prep = members.map((m) => {
    const p = nodes[m.i], q = nodes[m.j], d = [q.x - p.x, q.y - p.y, q.z - p.z], L = Math.hypot(...d), ex = unit(d);
    const vertical = Math.abs(ex[2]) > 0.99;
    // local z: vertical plane for beams (strong axis bending about local y), global X for columns
    const ez = vertical ? [1, 0, 0] : unit([-(ex[2]) * ex[0], -(ex[2]) * ex[1], 1 - ex[2] * ex[2]]), ey = cross(ez, ex);
    const T3 = [ex, ey, ez], f = m.kind === "column" ? factors.column : factors.beam;
    // column: bending about local y (ey = ez × ex = X × Z = −Y) has depth along X → I = By·Bx³/12; about local z (X) → Bx·By³/12
    const [Iy, Iz] = m.kind === "column" ? [(m.h * m.b ** 3) / 12, (m.b * m.h ** 3) / 12] : [(m.b * m.h ** 3) / 12, (m.h * m.b ** 3) / 12];
    // pinned end: bending released, and torsion too (a pinned secondary beam takes no compatibility torsion from the girder's
    // rotation); with both ends pinned torsion stays held at end i so the member cannot spin
    const rel = [...(m.release?.[0] ? [4, 5] : []), ...(m.release?.[1] ? [9, 10, 11] : []), ...(m.release?.[0] && !m.release?.[1] ? [3] : [])].sort((a, b) => a - b);
    const dofs = [...[0, 1, 2, 3, 4, 5].map((dd) => m.i * 6 + dd), ...[0, 1, 2, 3, 4, 5].map((dd) => m.j * 6 + dd)];
    return { m, L, T3, E: m.E ?? E, A: m.b * m.h, Iy: Iy * f, Iz: Iz * f, J: Jrect(m.b, m.h) * factors.J, fl: nodalLoads(m.loads, m.torque, L), rel, dofs };
  });
  // the joint where the elimination found no stiffness (a mechanism): position, direction and what meets there (user 2026-11-03:
  // "ไม่มีเสถียรภาพ" alone did not say where)
  let unstable = null;
  const DIRS = ["X", "Y", "Z (ดิ่ง)", "หมุนรอบ X", "หมุนรอบ Y", "หมุนรอบ Z"];
  const where = () => {
    if (unstable == null) return "";
    const n = Math.floor(unstable / 6), d = unstable % 6, nd0 = nodes[n];
    if (nd0.master) return ` ที่พื้นแข็งระดับ z = ${nd0.z.toFixed(2)} ม. ทิศ ${DIRS[d]}`;
    const at = members.filter((m) => m.i === n || m.j === n), what = [...new Set(at.map((m) => (m.kind === "column" ? "เสา" : `คานแนว ${m.line + 1}${m.release?.some(Boolean) ? " (ปลายหมุน)" : ""}`)))].join(", ");
    return ` ที่จุด (${nd0.x.toFixed(2)}, ${nd0.y.toFixed(2)}) ระดับ z = ${nd0.z.toFixed(2)} ม. ทิศ ${DIRS[d]}${what ? ` — มี ${what}` : ""}`;
  };
  const toG = (T3, v) => [0, 1, 2].map((c) => T3[0][c] * v[0] + T3[1][c] * v[1] + T3[2][c] * v[2]); // local → global (3-vector)
  const toL = (T3, v) => T3.map((r) => r[0] * v[0] + r[1] * v[1] + r[2] * v[2]);
  const held = (n) => nodes[n].fixed || nodes[n].pinned;
  // load vector of one case: node loads, lateral forces, member equivalent loads (condensed at released ends)
  const loadVector = (cs) => {
    const F = new Float64Array(nd);
    for (const { n, P } of cs.nodeLoads ?? []) F[n * 6 + 2] -= P;
    for (const { n, F: f } of cs.lateral ?? []) { F[n * 6] += f[0]; F[n * 6 + 1] += f[1]; F[n * 6 + 5] += f[2] ?? 0; }
    prep.forEach((e, k) => {
      const fc = condense(e.kl, cs.fls[k], e.rel).f;
      for (let blk = 0; blk < 4; blk++) { const g = toG(e.T3, fc.slice(blk * 3, blk * 3 + 3)); for (let c2 = 0; c2 < 3; c2++) F[e.dofs[blk * 3 + c2]] += g[c2]; }
    });
    return F;
  };
  // member end forces (local) of a displacement vector: f = k·u − fe; released DOFs recovered from the condensation
  const endForces = (u, fls) => prep.map((e, k) => {
    const ug = e.dofs.map((i) => u[i]), ul = [0, 1, 2, 3].flatMap((blk) => toL(e.T3, ug.slice(blk * 3, blk * 3 + 3))), fl = fls[k];
    if (e.rel.length) { // rotation of the released DOFs (end moment 0): u_r = krr⁻¹ (fr − kra·ua)
      const ua = ul.map((v, i) => (e.rel.includes(i) ? 0 : v)), rhs = e.rel.map((r) => fl[r] - ua.reduce((s, v, j) => s + e.kl[r][j] * v, 0));
      e.rel.forEach((r, a) => (ul[r] = e.rel.reduce((s, _, b) => s + e.cinv[a][b] * rhs[b], 0)));
    }
    return e.kl.map((row, i) => row.reduce((s, v, j) => s + v * ul[j], 0) - fl[i]);
  });
  // stiffness with the axial forces N (P-Delta), supports, diaphragm constraints → solve every right-hand side
  const solveK = (N, cs) => {
    const K = Array.from({ length: nd }, () => new Float64Array(nd));
    prep.forEach((e, k) => {
      const kl = localK(e.E, e.E / 2.4, e.A, e.Iy, e.Iz, e.J, e.L, pDelta ? N[k] : 0), c = condense(kl, e.fl, e.rel);
      e.kl = kl; e.cinv = c.inv;
      // transform: kg = Tᵀ k T with T = blockdiag(T3 ×4)
      const Tm = (r, c2) => (Math.floor(r / 3) === Math.floor(c2 / 3) ? e.T3[r % 3][c2 % 3] : 0);
      const KT = c.k.map((row) => Array.from({ length: 12 }, (_, j) => row.reduce((s, v, a) => s + v * Tm(a, j), 0)));
      for (let a = 0; a < 12; a++) for (let b = 0; b < 12; b++) {
        let v = 0; for (let r = 0; r < 12; r++) v += Tm(r, a) * KT[r][b];
        K[e.dofs[a]][e.dofs[b]] += v;
      }
    });
    // rigid floors: penalty on u_s − u_m + θ_m·dy, v_s − v_m − θ_m·dx, rz_s − θ_m (stiff compared with the members)
    if (diaphragms.length) {
      let kd = 0; for (let i = 0; i < nd; i += 6) kd = Math.max(kd, K[i][i], K[i + 1][i + 1]);
      const kp = 1e3 * kd, add = (c) => { for (const [i, a] of c) for (const [j, b] of c) K[i][j] += kp * a * b; };
      for (const { master: mm, slaves } of diaphragms) for (const s of slaves) {
        const dx = nodes[s].x - nodes[mm].x, dy = nodes[s].y - nodes[mm].y;
        add([[s * 6, 1], [mm * 6, -1], [mm * 6 + 5, dy]]); add([[s * 6 + 1, 1], [mm * 6 + 1, -1], [mm * 6 + 5, -dx]]); add([[s * 6 + 5, 1], [mm * 6 + 5, -1]]);
      }
    }
    // supports; a tiny rotational spring keeps a joint where only pinned ends meet from being singular
    const free = [];
    for (let n = 0; n < nodes.length; n++) for (let d = 0; d < 6; d++) {
      if (nodes[n].fixed || (nodes[n].pinned && d < 3) || (nodes[n].master && (d === 2 || d === 3 || d === 4))) continue;
      if (d >= 3) K[n * 6 + d][n * 6 + d] += 1e-3; free.push(n * 6 + d);
    }
    const Fv = cs.map(loadVector); // after the member matrices are set (condensation of the loads uses them)
    solveDense.bad = null;
    const sol = solveMany(free.map((i) => free.map((j) => K[i][j])), Fv.map((F) => free.map((i) => F[i])));
    if (!sol) { unstable = solveDense.bad != null ? free[solveDense.bad] : null; return null; }
    return sol.map((x) => { const u = new Float64Array(nd); free.forEach((i, k) => (u[i] = x[k])); return u; });
  };
  // reactions at the supports (global), including loads applied right at a support
  const reactions = (cs, res) => {
    const R = nodes.map(() => [0, 0, 0, 0, 0, 0]);
    for (const { n, P } of cs.nodeLoads ?? []) if (held(n)) R[n][2] += P;
    prep.forEach((e, k) => {
      const f = res[k];
      for (const [blk, node] of [[0, e.m.i], [1, e.m.i], [2, e.m.j], [3, e.m.j]]) {
        if (!held(node)) continue;
        const g = toG(e.T3, f.slice(blk * 3, blk * 3 + 3)); for (let c = 0; c < 3; c++) R[node][(blk % 2) * 3 + c] += g[c];
      }
    });
    return R;
  };
  // results per member: end forces and, for beams, M / V along the member (sagging +) from the end values and its loads
  const memberOut = (res, loadsOf) => prep.map((e, k) => {
    const f = res[k], L = e.L, loads = loadsOf(k);
    const left = (x) => loads.reduce(([W, Mw], l) => {
      if (l.P !== undefined) return l.at < x - 1e-9 ? [W + l.P, Mw + l.P * (x - l.at)] : [W, Mw];
      if (x <= l.a) return [W, Mw];
      const b = Math.min(x, l.b), wb = l.wa + ((l.wb - l.wa) * (b - l.a)) / (l.b - l.a || 1), len = b - l.a, Wp = ((l.wa + wb) / 2) * len;
      const cx = l.wa + wb > 0 ? l.a + (len * (l.wa + 2 * wb)) / (3 * (l.wa + wb)) : l.a + len / 2;
      return [W + Wp, Mw + Wp * (x - cx)];
    }, [0, 0]);
    const q0 = f[2], q1 = -f[4]; // end shear (up) and end moment (contBeam sense) at i in the vertical plane
    const V = (x) => q0 - left(x)[0], M = (x) => -q1 + q0 * x - left(x)[1];
    const xs = Array.from({ length: 21 }, (_, i) => (L * i) / 20), Ms = xs.map(M);
    return { ...e.m, L, f, N: -f[0], T: Math.max(Math.abs(f[3]), Math.abs(f[9])), V, M, Mmax: Math.max(0, ...Ms), Mmin: Math.min(0, ...Ms), ML: M(0), MR: M(L),
      Vmax: Math.max(...xs.map((x) => Math.abs(V(x)))), My: [f[4], f[10]], Mz: [f[5], f[11]], sec: { A: e.A, Iy: e.Iy, Iz: e.Iz, J: e.J, G: e.E / 2.4, E: e.E }, rel: e.rel, T3: e.T3 };
  });
  // main loads, P-Delta iterated on their own axial forces
  const main = { nodeLoads, lateral, fls: prep.map((e) => e.fl) };
  let N = prep.map(() => 0), u = null, res;
  for (let it = 0; it < (pDelta ? 4 : 1); it++) {
    const s = solveK(N, [main]);
    if (!s) return { error: `โครงสร้างไม่มีเสถียรภาพ${where()} (ตรวจจุดรองรับ / เสา)` };
    u = s[0]; res = endForces(u, main.fls);
    N = res.map((f) => -f[0]); // axial force (tension +) at end i: force on the member along −x
  }
  const out = { u, R: reactions(main, res), members: memberOut(res, (k) => prep[k].m.loads ?? []), disp: (n) => u.slice(n * 6, n * 6 + 3) };
  // extra load cases: same stiffness (geometric stiffness from the main loads' axial forces of the last pass), solved together
  if (cases.length) {
    const cs = cases.map((c) => ({ ...c, fls: prep.map((e, k) => nodalLoads(c.loads?.[k]?.loads, c.loads?.[k]?.torque, e.L)) }));
    const us = solveK(N, cs);
    if (!us) return { ...out, error: `โครงสร้างไม่มีเสถียรภาพภายใต้แรงด้านข้าง${where()}` };
    out.cases = cs.map((c, q) => { const r = endForces(us[q], c.fls); return { u: us[q], R: reactions(c, r), members: memberOut(r, (k) => c.loads?.[k]?.loads ?? []) }; });
  }
  return out;
}

// Build the whole-building model from the frame data and its floor analyses (analyzeFrame result) and solve it.
export function frame3dModel(frame, res, opt = {}) {
  const r3 = (v) => (Math.round(v * 1000) / 1000 + 0).toFixed(3); // + 0: no "-0.000" (an arc end at −2e-16 must meet the column)
  const nodes = [], key = (x, y, z) => `${r3(x)},${r3(y)},${r3(z)}`, idx = new Map();
  const pin = (frame.baseFixity ?? "pinned") === "pinned";
  // joints within 3 cm in plan at the same level are one joint — the floor analysis accepts a beam end that close to another beam
  // or a column (floor.js TOL); keyed by exact coordinates only, such an end stayed a loose joint → "unstable" (user 2026-11-03)
  const SNAP = 0.035; // a little more than floor.js TOL (0.03, accepted inclusive)
  const node = (x, y, z, base = false) => {
    const k = key(x, y, z);
    let i = idx.get(k);
    if (i === undefined) { i = nodes.findIndex((n) => !n.master && Math.abs(n.z - z) < 1e-6 && Math.hypot(n.x - x, n.y - y) < SNAP); if (i >= 0) idx.set(k, i); }
    if (i === undefined || i < 0) { i = nodes.length; idx.set(k, i); nodes.push({ x, y, z }); }
    if (base) nodes[i][pin ? "pinned" : "fixed"] = true;
    return i;
  };
  let z = 0; const Z = frame.floors.map((f) => (z += f.h ?? 3)); // levels (m above the footing top)
  const members = [], nodeLoads = [], warnings = [];
  frame.floors.forEach((fl, k) => {
    const an = res.floors[k], zk = Z[k], zb = k ? Z[k - 1] : 0;
    // columns (bottom on the footing at floor 0, else on whatever is at that point of the floor below)
    fl.columns.forEach((c, i) => {
      const col = res.columns.find((x) => x.floor === k && x.i === i), lv = col?.lv ?? { Bx: 20, By: 20 };
      const a = node(c[0], c[1], zb, k === 0), b = node(c[0], c[1], zk);
      members.push({ i: a, j: b, kind: "column", floor: k, ci: i, b: lv.Bx / 100, h: lv.By / 100, E: EcOf(frame.mat, frame.mat.fcCol) });
      const W = (CONC * lv.Bx * lv.By * (fl.h ?? 3)) / 1e4; nodeLoads.push({ n: a, P: W / 2 }, { n: b, P: W / 2 });
    });
    for (const pl of an.pointLoads ?? []) if (pl.on === "column") nodeLoads.push({ n: node(fl.columns[pl.ci][0], fl.columns[pl.ci][1], zk), P: pl.P });
    // beams: every line split at the points where something meets it
    for (const ln of an.lines) {
      // an arc beam: nodes on the true arc (12 pieces), positions along it by the chord parameter t
      const ag = ln.arc ? arcGeom(ln.A, ln.B, ln.arc.s) : null;
      const at = (t) => (!ag ? [ln.A[0] + ln.u[0] * t, ln.A[1] + ln.u[1] * t] : t < 1e-9 ? ln.A : t > ln.L - 1e-9 ? ln.B : arcPoint(ag, t));
      const ts = new Set([0, ln.L, ...ln.cols.map((c) => c.t), ...ln.parts.flatMap((p) => [p.t0, p.t1]), ...(ag ? Array.from({ length: 11 }, (_, i) => (ln.L * (i + 1)) / 12) : [])]);
      for (const o of an.lines) for (const c of o.carriers ?? []) if (c.host === ln.id && c.at > 1e-3 && c.at < ln.L - 1e-3) ts.add(c.at); // where the floor analysis put a beam on this one
      for (const o of an.lines) if (o !== ln) for (const p of [o.A, o.B]) { const d = [p[0] - ln.A[0], p[1] - ln.A[1]], t = d[0] * ln.u[0] + d[1] * ln.u[1]; if (t > 1e-3 && t < ln.L - 1e-3 && Math.abs(d[0] * ln.u[1] - d[1] * ln.u[0]) < 0.03) ts.add(t); }
      for (const c of res.columns.filter((x) => x.floor === k + 1)) { const p = c.p, d = [p[0] - ln.A[0], p[1] - ln.A[1]], t = d[0] * ln.u[0] + d[1] * ln.u[1]; if (t > 1e-3 && t < ln.L - 1e-3 && Math.abs(d[0] * ln.u[1] - d[1] * ln.u[0]) < 0.03) ts.add(t); }
      const xs = [...ts].map((t) => +t.toFixed(4)).sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] > 1e-3);
      // loads on the line: distributed (slab, walls, cantilevers, stairs, railings…) + self weight + point loads that are not columns above
      const typeAt = (t) => { const sp = an.spans.find((s) => s.line === ln.id && t >= s.x0 - 1e-6 && t <= s.x1 + 1e-6); return sp?.type ?? frame.beamTypes[0]; };
      const dist = [...ln.slab, ...ln.parts.map((p) => { const ty = typeAt((p.t0 + p.t1) / 2), w = CONC * ty.b * ty.h; return { a: p.t0, b: p.t1, wa: w, wb: w, g: "DL" }; })];
      const pts = (ln.extra ?? []).filter((e) => !String(e.from ?? "").startsWith("เสา"));
      // pinned only where the carrying beam passes through; two beams meeting end to end at a corner without a column
      // are one monolithic corner (rigid) — pinning both made a hinge nothing holds up (found by the PyNite diff test)
      const carried = new Set(ln.carriers.filter((c) => { const h = an.lines.find((o) => o.id === c.host); return h && c.at > 1e-3 && c.at < h.L - 1e-3; }).map((c) => +c.t.toFixed(4)));
      for (let s = 0; s + 1 < xs.length; s++) {
        const x0 = xs[s], x1 = xs[s + 1], L = x1 - x0, ty = typeAt((x0 + x1) / 2), p0 = at(x0), p1 = at(x1);
        const loads = [
          ...dist.flatMap((l) => { const a = Math.max(l.a, x0), b = Math.min(l.b, x1), w = (t) => l.wa + ((l.wb - l.wa) * (t - l.a)) / (l.b - l.a || 1); return b - a > 1e-9 ? [{ a: a - x0, b: b - x0, wa: w(a), wb: w(b), g: l.g }] : []; }),
          ...pts.filter((p) => p.at >= x0 - 1e-9 && (p.at < x1 - 1e-9 || s === xs.length - 2)).map((p) => ({ at: p.at - x0, P: p.P, g: "SP" })),
        ];
        const ov = (q) => Math.max(0, Math.min(q.b, x1) - Math.max(q.a, x0)), torque = (ln.torsion ?? []).map((q) => q.m * ov(q)).filter(Boolean), torqueL = (ln.torsion ?? []).map((q) => (q.mL ?? 0) * ov(q)).filter(Boolean);
        // arc piece: its real length differs from the chord-parameter length → stretch positions, keep each load's total
        const kL = ag ? Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / L : 1;
        if (kL !== 1) for (const l of loads) { if (l.P !== undefined) l.at = Math.min(l.at * kL, L * kL); else { l.a *= kL; l.b = Math.min(l.b * kL, L * kL); l.wa /= kL; l.wb /= kL; } }
        members.push({ i: node(p0[0], p0[1], zk), j: node(p1[0], p1[1], zk), kind: "beam", floor: k, line: ln.id, x0, x1, b: ty.b, h: ty.h, E: EcOf(frame.mat, frame.mat.fcBeam), loads, torque, torqueL,
          release: [s === 0 && carried.has(+x0.toFixed(4)), s === xs.length - 2 && carried.has(+x1.toFixed(4))] });
      }
    }
  });
  // lateral loads (opt.lateral = { cases: [{ key, F: [[Fx, Fy] per floor] }], combos }): every floor is a rigid diaphragm with a
  // master node at the centroid of its joints; the live load is solved as its own case so that D = (D + L) − L
  const latOn = !!opt.lateral?.cases?.length, diaphragms = [];
  if (latOn) Z.forEach((zk) => {
    const slaves = nodes.map((n, i) => (Math.abs(n.z - zk) < 1e-6 && !n.fixed && !n.pinned ? i : -1)).filter((i) => i >= 0);
    if (slaves.length < 2) return;
    const cx = slaves.reduce((s, i) => s + nodes[i].x, 0) / slaves.length, cy = slaves.reduce((s, i) => s + nodes[i].y, 0) / slaves.length;
    nodes.push({ x: cx, y: cy, z: zk, master: true }); diaphragms.push({ master: nodes.length - 1, slaves, z: zk });
  });
  const cases = latOn ? [
    { key: "L", loads: members.map((m) => ({ loads: (m.loads ?? []).filter((l) => l.g === "LL"), torque: m.torqueL ?? [] })) },
    ...opt.lateral.cases.map((c) => ({ key: c.key, lateral: diaphragms.map((d) => { const k = Z.findIndex((zk) => Math.abs(zk - d.z) < 1e-6); return { n: d.master, F: [c.F[k]?.[0] ?? 0, c.F[k]?.[1] ?? 0, 0] }; }) })),
  ] : [];
  const E = EcOf(frame.mat), sol = solveFrame3D({ nodes, members, nodeLoads, lateral: [], E, pDelta: opt.pDelta ?? true, diaphragms, cases });
  if (sol.error && !sol.members) return { error: sol.error, warnings };
  if (sol.error) warnings.push(sol.error);
  // spans of the floor analysis → frame results (max sagging, hogging at the supports, shear, torsion)
  const spansOf = (ms0) => res.floors.flatMap((an, k) => an.spans.map((sp) => {
    const ms = ms0.filter((m) => m.kind === "beam" && m.floor === k && m.line === sp.line && m.x0 >= sp.x0 - 1e-6 && m.x1 <= sp.x1 + 1e-6);
    if (!ms.length) return null;
    // shear at d from the supports (same rule as the continuous beams, floor.js shearRange) — Vd; V stays the largest
    const rg = shearRange(sp, sp.type?.h ?? 0.4, frame.mat), V = Math.max(...ms.map((m) => m.Vmax));
    const Vd = !rg ? V : Math.max(0, ...ms.flatMap((m) => Array.from({ length: 21 }, (_, i) => m.x0 - sp.x0 + ((m.x1 - m.x0) * i) / 20)
      .map((xl, i) => (xl >= rg[0] - 1e-9 && xl <= rg[1] + 1e-9 ? Math.abs(m.V((m.L * i) / 20)) : 0))));
    return { floor: k, id: sp.id, Mpos: Math.max(0, ...ms.map((m) => m.Mmax)), Mneg: Math.max(0, -ms[0].ML, -ms[ms.length - 1].MR),
      V, Vd, T: Math.max(...ms.map((m) => m.T)), cont: { Mpos: sp.Mpos, Mneg: sp.Mneg, V: sp.V } };
  }).filter(Boolean));
  const columnsOf = (ms) => ms.filter((m) => m.kind === "column").map((m) => ({ floor: m.floor, ci: m.ci, N: -m.N, Mx: Math.max(Math.abs(m.Mz[0]), Math.abs(m.Mz[1])), My: Math.max(Math.abs(m.My[0]), Math.abs(m.My[1])) }));
  const held = nodes.map((n, i) => (n.fixed || n.pinned ? i : -1)).filter((i) => i >= 0);
  const spans = spansOf(sol.members), columns = columnsOf(sol.members);
  const base = held.map((i) => ({ p: [nodes[i].x, nodes[i].y], R: sol.R[i] }));
  const load = nodeLoads.reduce((s, l) => s + l.P, 0) + members.reduce((s, m) => s + (m.loads ?? []).reduce((t, l) => t + (l.P ?? ((l.wa + l.wb) / 2) * (l.b - l.a)), 0), 0);
  const drift = Math.max(...nodes.map((n, i) => Math.hypot(sol.u[i * 6], sol.u[i * 6 + 1])));
  const out = { nodes, members: sol.members, spans, columns, base, load, drift, warnings, input: { nodes, members, nodeLoads, E } };
  if (!latOn || !sol.cases) return out;
  // load combinations by superposition: D = main − L; each combo = D·(main − L) + L·Lcase + Σ lateral cases
  const byKey = Object.fromEntries(cases.map((c, q) => [c.key, sol.cases[q]]));
  const combine = (parts) => sol.members.map((m0, k) => {
    const ps = parts.filter(([c, r]) => c && r).map(([c, r]) => [c, r.members[k]]);
    const f = m0.f.map((_, i) => ps.reduce((s, [c, m]) => s + c * m.f[i], 0)), M = (x) => ps.reduce((s, [c, m]) => s + c * m.M(x), 0), V = (x) => ps.reduce((s, [c, m]) => s + c * m.V(x), 0);
    const xs = Array.from({ length: 21 }, (_, i) => (m0.L * i) / 20), Ms = xs.map(M);
    return { ...m0, f, M, V, N: -f[0], T: Math.max(Math.abs(f[3]), Math.abs(f[9])), Mmax: Math.max(0, ...Ms), Mmin: Math.min(0, ...Ms), ML: M(0), MR: M(m0.L),
      Vmax: Math.max(...xs.map((x) => Math.abs(V(x)))), My: [f[4], f[10]], Mz: [f[5], f[11]] };
  });
  const mainR = { members: sol.members, R: sol.R };
  const combos = (opt.lateral.combos ?? []).map((cb) => {
    const parts = [[cb.D, mainR], [cb.L - cb.D, byKey.L], ...["Wx", "Wy", "Ex", "Ey"].map((key) => [cb[key] ?? 0, byKey[key]])];
    const ms = combine(parts), R = held.map((i) => [0, 1, 2, 3, 4, 5].map((d) => parts.filter(([c, r]) => c && r).reduce((s, [c, r]) => s + c * r.R[i][d], 0)));
    return { ...cb, spans: spansOf(ms), columns: columnsOf(ms), base: held.map((i, j) => ({ p: [nodes[i].x, nodes[i].y], R: R[j] })) };
  });
  // storey drift of each lateral case (unfactored): largest horizontal movement of a joint at the level minus the level below
  const driftOf = (r) => diaphragms.map((d, k) => {
    const mv = (ids) => Math.max(0, ...ids.map((i) => Math.hypot(r.u[i * 6], r.u[i * 6 + 1])));
    const below = k ? diaphragms[k - 1].slaves : [];
    return { z: d.z, d: mv(d.slaves), dd: mv(d.slaves) - (k ? mv(below) : 0) };
  });
  const drifts = Object.fromEntries(opt.lateral.cases.map((c) => [c.key, driftOf(byKey[c.key])]));
  return { ...out, combos, drifts, diaphragms };
}
