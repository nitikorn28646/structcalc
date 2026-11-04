// 20 generated houses, each checked independently of the program's own paths (user 2026-11-04: "we work with people's lives").
// Checks: (1) total applied load (slabs, walls, cantilever slabs, stairs, line / point loads, beam and column self weight) = Σ base
// reactions of the 3D frame; (2) every simple span: M+ by direct statics of its loads; (3) singly reinforced sections: As = M/(fs·j·d);
// (4) columns: Pbot = Ptop + own weight, Ptop ≥ beam reactions; (5) spread footings: q = (P + Wf + Ws)/A; (6) no NaN / ∞ in results.
// node cli/verify20.mjs [n]
import { analyzeFrame } from "../web/engine/frame.js";
import { designSlabs } from "../web/engine/slabDesign.js";
import { spanReasons, CONC, DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WALL_TYPES, wallLoad } from "../web/engine/floor.js";
let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647), pick = (a) => a[Math.floor(rnd() * a.length)], rr = (a, b, st = 0.5) => a + Math.round((rnd() * (b - a)) / st) * st;
const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
function house(n) {
  seed = 1000 + n * 7919;
  const nx = 1 + Math.floor(rnd() * 3), ny = 1 + Math.floor(rnd() * 3), dx = Array.from({ length: nx }, () => rr(2.5, 6)), dy = Array.from({ length: ny }, () => rr(2.5, 5.5));
  const X = dx.reduce((a, v) => [...a, a.at(-1) + v], [0]), Y = dy.reduce((a, v) => [...a, a.at(-1) + v], [0]);
  const storeys = 2 + (rnd() < 0.3 ? 1 : 0), live = pick([150, 200, 300]), t = pick([0.1, 0.12, 0.15]);
  const floor = (name, h, slab, k) => {
    const cols = X.flatMap((x) => Y.map((y) => [x, y])), beams = [];
    for (const y of Y) for (let i = 0; i < nx; i++) beams.push({ a: [X[i], y], b: [X[i + 1], y], type: null });
    for (const x of X) for (let j = 0; j < ny; j++) beams.push({ a: [x, Y[j]], b: [x, Y[j + 1]], type: null });
    const fl = { name, h, t: slab ? t : 0, finish: slab ? 100 : 0, live: slab ? live : 0, columns: cols, beams, panels: {}, walls: [], lineLoads: [], pointLoads: [], cants: [], stairs: [] };
    if (slab && dx[0] >= 4 && rnd() < 0.6) fl.beams.push({ a: [X[0] + dx[0] / 2, Y[0]], b: [X[0] + dx[0] / 2, Y[1]], type: null }); // secondary beam
    if (k < storeys) { // walls on the edge beams of the floor below the top (load on beams) and one on a slab
      fl.walls.push({ a: [X[0], Y[0]], b: [X[nx], Y[0]], kind: 0, h: 2.8, open: rnd() < 0.5 ? 20 : 0 });
      if (rnd() < 0.5) fl.walls.push({ a: [X[nx], Y[0]], b: [X[nx], Y[ny]], kind: 0, h: 2.8, open: 0 });
      if (slab && rnd() < 0.5) { const xm = X[nx - 1] + dx[nx - 1] / 2; fl.walls.push({ a: [xm, Y[ny - 1] + 0.5], b: [xm, Y[ny] - 0.5], kind: 0, h: 2.6, open: 0 }); } // on a slab
    }
    if (slab && rnd() < 0.5) fl.cants.push({ a: [X[0], Y[ny]], b: [X[nx], Y[ny]], L: rr(1, 1.5), side: 1, t: 0.12, finish: 100, live: 300 });
    if (slab && rnd() < 0.5) fl.lineLoads.push({ a: [X[0], Y[0]], b: [X[1], Y[0]], q: 150, name: "ราว" });
    if (slab && rnd() < 0.5) fl.pointLoads.push({ p: [X[1], Y[0]], P: 800, name: "แท็งก์" });
    return fl;
  };
  const floors = [floor("คานคอดิน", rr(0.8, 1.5), true, 0)];
  for (let k = 1; k <= storeys; k++) floors.push(floor(k === storeys ? "คานหลังคา" : `ชั้น ${k + 1}`, rr(2.8, 3.6), k < storeys, k));
  // a stair in the first bay of floor 2 (landing on a mid-level beam half the time)
  if (dx[0] >= 2.5 && dy[0] >= 3) { const kind = rnd() < 0.5 ? "landing" : "long"; floors[1].stairs.push({ a: [X[0], Y[0]], b: [X[1], Y[1]], up: "+y", kind, t: 0.15, riser: 0.17, tread: 0.25, finish: 100, live: 300, landingL: 1.2 });
    if (kind === "landing" && rnd() < 0.6) floors[1].beams.push({ a: [X[0], Y[1]], b: [X[1], Y[1]], type: null, lvl: +(floors[1].h / 2).toFixed(2) }); }
  const fr = { mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, floors, wallTypes: DEFAULT_WALL_TYPES, analysis: rnd() < 0.5 ? "envelope" : "continuous",
    baseFixity: rnd() < 0.3 ? "fixed" : "pinned", soil: { qa: 10000, gamma: 1800 } };
  if (n % 3 === 0) { fr.analysis = "envelope"; fr.lateral = { asked: true, wind: { on: true, V50: 25, terrain: "A", Iw: 1, Cg: 2, Cpw: 0.8, Cpl: null, roofH: 1.5 }, seismic: { on: n % 2 === 0, Ss: 0.3, S1: 0.1, site: "D", I: 1, R: 3, Cd: 2.5, Ct: 0.02 } }; }
  if (rnd() < 0.4) fr.footTypes = [{ name: "F1", kind: "spread", t: 0.3, Df: 1.2, bar: "DB 12", s: 0.15, barS: "DB 12", sS: 0.15 }];
  // harder variants (n > 20): L-shape, a column standing on a beam (no column under it), cantilever beams with an edge beam
  const tags = [];
  if (n > 20) {
    const same = (p, q) => Math.abs(p[0] - q[0]) < 1e-9 && Math.abs(p[1] - q[1]) < 1e-9, on = (p, ...pts) => pts.some((q) => same(p, q));
    if (nx >= 2 && ny >= 2 && n % 2 === 0) { const c = [X[nx], Y[ny]], c1 = [X[nx - 1], Y[ny]], c2 = [X[nx], Y[ny - 1]]; tags.push("รูป L");
      for (const fl of floors) { fl.columns = fl.columns.filter((p) => !same(p, c)); fl.beams = fl.beams.filter((b) => !((on(b.a, c) || on(b.b, c)))); fl.cants = []; fl.walls = fl.walls.filter((w) => !(w.a[0] > X[nx - 1] - 1e-9 && w.a[1] > Y[ny - 1] - 1e-9) && !(Math.abs(w.a[0] - X[nx]) < 1e-9 && Math.abs(w.b[0] - X[nx]) < 1e-9));
        fl.stairs = fl.stairs.filter(() => !(nx === 2 && ny === 2 && false)); void c1; void c2; } }
    if (nx >= 2 && n % 3 !== 1) { const c = [X[1], Y[0]]; tags.push("เสาลอย"); for (const fl of floors.slice(0, 2)) fl.columns = fl.columns.filter((p) => !same(p, c)); }
    if (n % 4 < 2) { const L = 1.2; tags.push("คานยื่น"); const fl = floors[1], yt = Y[ny] + L;
      fl.beams.push({ a: [X[0], Y[ny]], b: [X[0], yt], type: null }, { a: [X[nx], Y[ny]], b: [X[nx], yt], type: null }, { a: [X[0], yt], b: [X[nx], yt], type: null });
      fl.cants = []; if (nx >= 2 && n % 2 === 0) { fl.beams = fl.beams.filter((b) => !(b.a[0] === X[nx] && b.b[1] === yt)); fl.beams.find((b) => b.a[1] === yt && b.b[1] === yt).b = [X[nx - 1], yt]; fl.beams.push({ a: [X[nx - 1], Y[ny]], b: [X[nx - 1], yt], type: null }); } }
  }
  return { fr, desc: (tags.length ? `[${tags.join(", ")}] ` : "") + `${nx}×${ny} ช่อง ${dx.join("/")} × ${dy.join("/")} · ${storeys + 1} ระดับ · t ${t} · LL ${live} · ${fr.analysis} · ฐาน${fr.baseFixity === "fixed" ? "ยึดแน่น" : "หมุน"}${fr.footTypes ? " · ฐานแผ่" : ""}${fr.lateral ? (fr.lateral.seismic.on ? " · ลม+EQ" : " · ลม") : ""}` };
}
const scanNaN = (o, path = "", out = [], d = 0) => { if (d > 6 || out.length > 3) return out; if (typeof o === "number") { if (!Number.isFinite(o) && !/util|sMax|Infinity/i.test(path)) out.push(path); return out; }
  if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (typeof v === "function" || ["input", "beamIn", "res", "env", "Vx", "curve"].includes(k)) continue; scanNaN(v, `${path}.${k}`, out, d + 1); } return out; };
const N = Number(process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2] : 20), ONLY = process.argv[3] && !process.argv[3].startsWith('-') ? Number(process.argv[3]) : 0; let fails = 0, nWallSlab = 0, nCant = 0;
for (let n = 1; n <= N; n++) {
  if (ONLY && n !== ONLY) continue;
  const { fr, desc } = house(n), r = analyzeFrame(fr), issues = [];
  if (process.argv.includes("--write")) (await import("fs")).writeFileSync(`web/public/projects/_v${n}.json`, JSON.stringify({ app: "StructCalc", version: 1, project: { name: `ทดสอบ ${n}`, owner: "-", engineer: "-" }, frame: fr }));
  // (1) applied loads vs 3D base reactions
  let applied = 0;
  r.floors.forEach((an, k) => {
    applied += an.panels.reduce((s, p) => s + (p.st === "GS" ? 0 : p.w * p.area), 0);
    applied += an.walls.reduce((s, w) => s + (w.on.length ? w.on.reduce((t, o) => t + w.q * o.len, 0) : 0), 0); // walls on slabs are inside p.w
    applied += an.cants.reduce((s, c) => s + c.w * c.area, 0);
    applied += an.stairs.reduce((s, st) => s + st.total.DL + st.total.SDL + st.total.LL, 0);
    applied += (fr.floors[k].lineLoads ?? []).reduce((s, l) => s + l.q * Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 0);
    applied += (fr.floors[k].pointLoads ?? []).reduce((s, l) => s + l.P, 0);
    applied += an.spans.reduce((s, sp) => s + CONC * sp.type.b * sp.type.h * sp.len, 0);
  });
  applied += r.columns.reduce((s, c) => s + c.W, 0);
  const base = r.frame3d?.base?.reduce((s, b) => s + b.R[2], 0) ?? NaN, colBase = r.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0);
  if (r.frame3d && !(Math.abs(base - applied) < 0.002 * applied)) issues.push(`สมดุล: แรงกระทำ ${(applied / 1000).toFixed(2)} ≠ แรงที่ฐาน 3D ${(base / 1000).toFixed(2)} ตัน`);
  // accumulated column loads: max(continuous, simple) reactions → never less than the weight, a little more is expected
  if (!(colBase >= applied * 0.999) || colBase > applied * 1.25) issues.push(`เสาสะสม ΣP ${(colBase / 1000).toFixed(2)} เทียบน้ำหนักจริง ${(applied / 1000).toFixed(2)} ตัน`);
  // (2) simple spans by statics
  let nSimple = 0;
  for (const an of r.floors) for (const sp of an.spans.filter((s) => s.kind === "simple")) {
    const ln = an.lines.find((l) => l.id === sp.line); if (!ln?.loads || ln.lvl) continue;
    if (sp.x0 > 1e-6 || sp.x1 < ln.L - 1e-6) continue; // a cantilever past an end support: the span is not a free simple beam
    const L = sp.len, M = (x) => { let Mx = 0, R = 0; const ld = ln.loads;
      for (const l of ld) { if (l.P !== undefined) { if (l.at > sp.x0 - 1e-9 && l.at < sp.x1 + 1e-9) R += l.P * (sp.x1 - l.at) / L; continue; } const a = Math.max(l.a, sp.x0), b = Math.min(l.b, sp.x1); if (b <= a) continue; const w = (u) => l.wa + ((l.wb - l.wa) * (u - l.a)) / ((l.b - l.a) || 1);
        const W = ((w(a) + w(b)) / 2) * (b - a), xc = a + ((b - a) * (w(a) + 2 * w(b))) / (3 * (w(a) + w(b)) || 1); R += (W * (sp.x1 - xc)) / L; }
      Mx = R * (x - sp.x0);
      for (const l of ld) { if (l.P !== undefined) { if (l.at > sp.x0 - 1e-9 && l.at < x) Mx -= l.P * (x - l.at); continue; } const a = Math.max(l.a, sp.x0), b = Math.min(l.b, x); if (b <= a) continue; const w = (u) => l.wa + ((l.wb - l.wa) * (u - l.a)) / ((l.b - l.a) || 1);
        const W = ((w(a) + w(b)) / 2) * (b - a), xc = a + ((b - a) * (w(a) + 2 * w(b))) / (3 * (w(a) + w(b)) || 1); Mx -= W * (x - xc); }
      return Mx; };
    const Mmax = Math.max(...Array.from({ length: 201 }, (_, i) => M(sp.x0 + (L * i) / 200))), mine = sp.cont?.Mpos ?? sp.Mpos;
    // shear: the largest end reaction (full load) ≤ V of the envelope (shear at d may be smaller only in vAtD)
    const Rl = (M(sp.x0 + 1e-4) - 0) / 1e-4, Rr = -(M(sp.x1) - M(sp.x1 - 1e-4)) / 1e-4, Vmine = sp.cont?.V ?? sp.V;
    if (Math.abs(Math.max(Math.abs(Rl), Math.abs(Rr)) - Vmine) > Math.max(5, 0.01 * Vmine)) issues.push(`ช่วง ${sp.id}: V สถิตยศาสตร์ ${Math.max(Rl, Rr).toFixed(0)} ≠ โปรแกรม ${Vmine.toFixed(0)}`);
    // deflection by virtual work with the program's EI (dead ×3 + live, max over the span)
    if (sp.defl && ln.beamIn && sp.defl.method !== "branson") { // Branson deflections are checked independently in cli/audit-beam.mjs (37 cases) const EIat = (u) => { const k = ln.beamIn.x.findIndex((v, i) => i > 0 && u <= v + 1e-9); return ln.beamIn.EI[Math.max(0, k - 1)]; };
      const Mof = (pred) => { const keep = ln.loads; ln.loads = keep.filter(pred); const f = (u) => M(u); const out = Array.from({ length: 401 }, (_, i) => f(sp.x0 + (L * i) / 400)); ln.loads = keep; return out; };
      const MD = Mof((l) => l.g !== "LL"), ML = Mof((l) => l.g === "LL");
      const defl = (Ms) => Math.max(...Array.from({ length: 21 }, (_, j) => { const xi = (L * j) / 20; let d = 0; for (let i = 0; i < 400; i++) { const u = (L * (i + 0.5)) / 400, m = u < xi ? (1 - xi / L) * u : xi * (1 - u / L); d += (((Ms[i] + Ms[i + 1]) / 2) * m * (L / 400)) / EIat(sp.x0 + u); } return d; }));
      const dD = defl(MD), dL = defl(ML), dT = 3 * dD + dL;
      if (Math.abs(dT - sp.defl.dT) > Math.max(2e-4, 0.03 * dT) || Math.abs(dL - sp.defl.dL) > Math.max(2e-4, 0.03 * dL)) issues.push(`ช่วง ${sp.id}: ระยะแอ่น งานเสมือน ${(dT * 1000).toFixed(2)}/${(dL * 1000).toFixed(2)} ≠ โปรแกรม ${(sp.defl.dT * 1000).toFixed(2)}/${(sp.defl.dL * 1000).toFixed(2)} มม.`); }
    nSimple++;
    if (Math.abs(Mmax - mine) > Math.max(5, 0.01 * Mmax)) issues.push(`ช่วง ${sp.id}: M+ สถิตยศาสตร์ ${Mmax.toFixed(0)} ≠ โปรแกรม ${mine.toFixed(0)}`);
  }
  // (2b) cantilever spans: M at the support ≥ statics of the loads on the cantilever (all loads, full live), V ≥ their sum
  for (const an of r.floors) for (const sp of an.spans.filter((s) => s.kind === "cantilever")) { const ln = an.lines.find((l) => l.id === sp.line); if (!ln?.loads) continue;
    const root = sp.fixedAt === "start" ? sp.x0 : sp.x1; let M = 0, V = 0;
    for (const l of ln.loads) { if (l.P !== undefined) { if (l.at >= sp.x0 - 1e-9 && l.at <= sp.x1 + 1e-9 && Math.abs(l.at - root) > 1e-6) { M += l.P * Math.abs(l.at - root); V += l.P; } continue; }
      const a = Math.max(l.a, sp.x0), b = Math.min(l.b, sp.x1); if (b <= a) continue; const w = (u) => l.wa + ((l.wb - l.wa) * (u - l.a)) / ((l.b - l.a) || 1), n = 50;
      for (let i = 0; i < n; i++) { const u = a + ((b - a) * (i + 0.5)) / n, f = (w(u) * (b - a)) / n; M += f * Math.abs(u - root); V += f; } }
    nCant++;
    if ((sp.cont?.Mneg ?? sp.Mneg) < M * 0.995 - 5) issues.push(`คานยื่น ${sp.id}: M− ${(sp.cont?.Mneg ?? sp.Mneg).toFixed(0)} < สถิตยศาสตร์ ${M.toFixed(0)}`);
    if ((sp.cont?.V ?? sp.V) < V * 0.995 - 5) issues.push(`คานยื่น ${sp.id}: V ${(sp.cont?.V ?? sp.V).toFixed(0)} < ${V.toFixed(0)}`); }
  // (3) As = M/(fs j d) on singly reinforced sections
  let nAs = 0;
  for (const an of r.floors) for (const sp of an.spans) for (const [face, M] of [["mid", sp.Mpos], ["sup", sp.Mneg]]) {
    const c = sp.check?.[face]; if (!c || c.mode !== "singly" || !(M > 1)) continue;
    nAs++; const As = (M * 100) / (c.fs * c.j * c.d); if (Math.abs(As - c.As) > 0.005 * As + 0.01) issues.push(`ช่วง ${sp.id} ${face}: As ${c.As.toFixed(3)} ≠ M/(fs·j·d) ${As.toFixed(3)}`);
  }
  // (3b) lateral: every combination's base reactions balance its loads (ΣRx = −ΣFx, ΣRz = D·W_D + L·W_L)
  if (fr.lateral) { const lat = r.lateral; if (!lat) issues.push("เปิดแรงด้านข้างแต่ไม่มีผล"); else {
    const sumF = (key, d) => (lat.cases?.find((c) => c.key === key)?.F ?? []).reduce((s, f) => s + f[d], 0);
    const WL = r.frame3d.base.reduce((s, b) => s + b.R[2], 0), LL = applied - (r.frame3d.combos.find((c) => c.name === "D+L") ? 0 : 0);
    for (const cb of r.frame3d.combos ?? []) { const Rx = cb.base.reduce((s, b) => s + b.R[0], 0), Ry = cb.base.reduce((s, b) => s + b.R[1], 0);
      const Fx = (cb.Wx ?? 0) * sumF("Wx", 0) + (cb.Ex ?? 0) * sumF("Ex", 0), Fy = (cb.Wy ?? 0) * sumF("Wy", 1) + (cb.Ey ?? 0) * sumF("Ey", 1);
      if (Math.abs(Rx + Fx) > 1 + 1e-3 * Math.abs(Fx) || Math.abs(Ry + Fy) > 1 + 1e-3 * Math.abs(Fy)) issues.push(`${cb.name}: ΣRx ${Rx.toFixed(0)} / ΣRy ${Ry.toFixed(0)} ไม่สมดุลกับแรง ${Fx.toFixed(0)} / ${Fy.toFixed(0)}`); }
    // wind by hand: p = Iw·q·Cg·(Cpw·Ce(top of band) + |Cpl|·Ce(H/2)) for the top floor along X
    const w = lat.wind, top = w.x.floors.at(-1), q = (0.5 * 1.25 * 25 * 25) / 9.81, Ce = (z) => Math.max(0.9, (z / 10) ** 0.2);
    const H = top.hi - w.x.floors[0].lo, p = q * 2 * (0.8 * Ce(top.hi - w.x.floors[0].lo) + Math.abs(w.x.Cpl) * Ce(H / 2));
    if (Math.abs(p - top.p) > 0.01 * p) issues.push(`แรงลมชั้นบน p ${top.p.toFixed(1)} ≠ มือ ${p.toFixed(1)}`);
    if (lat.seismic) { const sm = lat.seismic; if (Math.abs(sm.floors.reduce((s, f) => s + f.F, 0) - sm.V) > 1) issues.push("ΣFx แผ่นดินไหว ≠ V");
      if (Math.abs(sm.V - sm.Cs * sm.W) > 1) issues.push("V ≠ Cs·W"); if (Math.abs(sm.W - lat.weights.reduce((a, b) => a + b, 0)) > 1) issues.push("W ≠ Σw");
      // seismic weight vs the real dead weight (3D D+L − live): within 15 %
      const Lw = r.floors.reduce((s, a) => s + (a.groups?.LL ?? 0), 0), Dw = WL - Lw; if (Math.abs(sm.W - Dw) > 0.15 * Dw) issues.push(`น้ำหนักแผ่นดินไหว W ${(sm.W / 1000).toFixed(1)} เทียบน้ำหนักตายตัว ${(Dw / 1000).toFixed(1)} ตัน`); }
  } }
  // (3c) slabs with a wall on them: designed with the equivalent load (wall weight / area × 2)
  for (const [k, an] of r.floors.entries()) for (const row of designSlabs(an, fr.floors[k], fr.mat)) { const pn = an.panels.find((p) => p.key === row.key);
    if (row.r && pn?.g.WALL > 0 && row.concF !== 2) issues.push(`${fr.floors[k].name} ${row.name}: ผนังบนพื้นไม่ได้คูณ 2`); if (pn?.g.WALL > 0) nWallSlab++; }
  // (4) columns
  for (const c of r.columns) { if (Math.abs(c.Pbot - c.Ptop - c.W) > 1) issues.push(`เสา ${c.stack} ชั้น ${c.floor}: Pbot ≠ Ptop + W`); if (c.Ptop < c.R - 1) issues.push(`เสา ${c.stack}: Ptop < แรงจากคาน`); }
  // (4b) stacks: Ptop of a column = beam reactions on its floor + Pbot of the column above (same stack)
  for (const c of r.columns) { const up = r.columns.find((u) => u.stack === c.stack && u.floor === c.floor + 1); const want = c.R + (up ? up.Pbot : 0);
    if (Math.abs(c.Ptop - want) > Math.max(2, 1e-4 * want) && !(c.Pd > c.Ptop)) issues.push(`เสา ${c.stack} ชั้น ${c.floor}: Ptop ${c.Ptop.toFixed(0)} ≠ R + เสาบน ${want.toFixed(0)}`); }
  // (4c) piles: n · safe load ≥ P (+ cap weight); spread: q ≤ qa when ok
  for (const f of r.footings) { if (!f.ok) continue;
    if (f.kind === "spread") { if (f.r.gross > fr.soil.qa * (fr.footUtil ?? 1) + 1) issues.push(`ฐาน ${f.stack}: ผ่าน แต่ q ${f.r.gross.toFixed(0)} > qa`); }
    else if (f.n > 0) { const safe = f.r?.Pallow; const per = f.r?.Ptmax; if (per != null && safe != null && per > safe + 1) issues.push(`ฐาน ${f.stack}: น้ำหนักต่อต้น ${per.toFixed(0)} > ${safe}`);
      if (per != null && per * f.n < f.P - 1) issues.push(`ฐาน ${f.stack}: ${f.n} × ${per.toFixed(0)} เทียบ P ${f.P.toFixed(0)}`); } }
  // (5) spread footings
  for (const f of r.footings.filter((x) => x.kind === "spread" && x.r?.gross != null)) { const A = f.r.Bx * f.r.By, q = (f.P + f.inp.t * A * 2400 + (f.inp.Df - f.inp.t) * f.inp.gamma * A) / A;
    if (Math.abs(q - f.r.gross) > 1) issues.push(`ฐาน ${f.stack}: q ${f.r.gross.toFixed(0)} ≠ ${q.toFixed(0)}`); if (f.r.qCorner < f.r.gross - 1e-6) issues.push(`ฐาน ${f.stack}: q มุม < q เฉลี่ย`); }
  // (6) NaN / infinite numbers
  const nan = scanNaN({ floors: r.floors.map((a) => ({ spans: a.spans.map((s) => ({ Mpos: s.Mpos, Mneg: s.Mneg, V: s.V, util: s.check?.util, d: s.defl })) })), columns: r.columns.map((c) => ({ P: c.Pbot, chk: c.check?.util })), footings: r.footings.map((f) => ({ P: f.P, Mx: f.Mx, My: f.My })) });
  if (nan.length) issues.push(`NaN/∞: ${nan.join(", ")}`);
  const sp = r.floors.flatMap((a) => a.spans);
  if (issues.length) fails++;
  console.log(`${issues.length ? "FAIL" : "ok  "} ${String(n).padStart(2)} ${desc} | คาน ${sp.filter((s) => s.ok).length}/${sp.length} เสา ${r.columns.filter((c) => c.ok).length}/${r.columns.length} ฐาน ${r.footings.filter((f) => f.ok).length}/${r.footings.length} · W ${(applied / 1000).toFixed(1)} ΣPเสา ${(colBase / 1000).toFixed(1)} ตัน · ช่วงเดี่ยวตรวจ ${nSimple}${issues.length ? "\n      " + issues.slice(0, 5).join("\n      ") : ""}`);
  if (ONLY) { for (const c of r.columns.filter((c) => !c.ok).slice(0, 6)) console.log("  เสา", c.stack, c.floor, c.lv?.level, "P", c.Pbot?.toFixed(0), "Pa", c.check?.r?.Pa?.toFixed(0), "util", c.check?.util?.toFixed(2), "ok", c.check?.r?.ok, "pg", c.check?.r?.pgOk, "s", c.check?.sOk, "sTie", c.check?.r?.sTie, "sl", c.check?.slenderOk, c.check?.error ?? "");
    for (const s of sp.filter((s) => !s.ok).slice(0, 6)) console.log("  คาน", s.id, s.typeName, s.len, spanReasons(s.check).join(" | "));
    console.log("  As checks", nAs); }
}
console.log(`${N - fails}/${N} ok · panels with a wall on them ${nWallSlab} · cantilever spans ${nCant}`);
process.exit(fails ? 1 : 0);
