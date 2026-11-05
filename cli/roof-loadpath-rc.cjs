// Roof on RC roof beams — load-path check, 10 cases (2026-11-05). Dev server on :5180; user files (_roof2/_roof3) are git-ignored.
const { chromium } = require("playwright"); const fs = require("fs");
const P = (f) => JSON.parse(fs.readFileSync("public/projects/" + f + ".json"));
const cp = (o) => JSON.parse(JSON.stringify(o));
// RC beams under the wall plates: frame top floor beams + roof guide (same lines)
const withBeams = (pj, pick = () => true, roofMod = () => {}) => { const c = cp(pj), top = c.frame.floors.length - 1;
  if (pj === Y) { c.roof.guide = { beams: c.frame.floors[top].beams.filter(pick).map((b) => ({ a: b.a, b: b.b, w: 0.2 })) }; c.frame.floors[top].beams = c.frame.floors[top].beams; }
  else { const bs = c.roof.plates.filter(pick).map((p) => ({ a: p.a, b: p.b, type: null })); c.frame.floors[top].beams = [...(c.frame.floors[top].beams ?? []), ...bs]; c.roof.guide = { beams: bs.map((b) => ({ a: b.a, b: b.b, w: 0.2 })) }; }
  c.frame.roofLink = { on: true, floor: top }; roofMod(c.roof); return c; };
const Y = P("yasothon"), U = P("_roof2"), R3 = P("_roof3");
const isX = (b) => Math.abs(b.a[1] - b.b[1]) < 1e-6;
const cases = [["1 ยโสธร + คานหลังคาจริง", withBeams(Y)], ["2 ยโสธร + คาน, อะเสช่วงเดียว", withBeams(Y, undefined, (r) => { r.design.plateSupport = "span"; })],
  ["3 ยโสธร + คาน, L/240", withBeams(Y, undefined, (r) => { r.design.plateDefl = 240; })], ["4 ยโสธร + คาน, ไม่มีสะพาน", withBeams(Y, undefined, (r) => { r.design.autoSupports = false; })],
  ["5 ยโสธร + คานแนว X เท่านั้น", withBeams(Y, isX)], ["6 ยโสธร ไม่มีคาน (เดิม)", cp(Y)],
  ["7 คุณหนูเลียง + คานใต้อะเสทุกเส้น", withBeams(U)], ["8 คุณหนูเลียง + คานบางเส้น", withBeams(U, (p, i) => i % 2 === 0)],
  ["9 ไฟล์ล่าสุด + คานใต้อะเสทุกเส้น", withBeams(R3)], ["10 ไฟล์ล่าสุด ไม่วาดอะเสริม + คานรอบ", (() => { const c = withBeams(R3); c.roof.innerPlates = [...(c.roof.innerPlates ?? []), ...c.roof.plates.filter((pl) => !c.roof.pts.some((q, i) => { const r2 = c.roof.pts[(i + 1) % c.roof.pts.length]; const on = (pt) => Math.abs((pt[0] - q[0]) * (r2[1] - q[1]) - (pt[1] - q[1]) * (r2[0] - q[0])) < 1e-6; return on(pl.a) && on(pl.b); }))]; c.roof.plates = []; const P = c.roof.pts; const edges = P.map((a, i) => ({ a, b: P[(i + 1) % P.length], w: 0.2 })); c.roof.guide.beams = [...c.roof.guide.beams, ...edges]; const top = c.frame.floors.length - 1; c.frame.floors[top].beams.push(...edges.map((e) => ({ a: e.a, b: e.b, type: null }))); return c; })()]];
(async () => { const b = await chromium.launch(), p = await b.newPage(); await p.goto("http://localhost:5180/"); await p.waitForTimeout(3000);
  for (const [name, pj] of cases) { const o = await p.evaluate(async ({ name, pj }) => {
    const L = await import("/src/roofLink.js"), R = await import("/src/RoofPage.jsx"), F = await import("/engine/frame.js");
    const sk = await R.loadSkeleton(), { dz, error } = R.runRoof(pj.roof, sk); if (error) return { name, error };
    const sum = (a) => (a ?? []).reduce((s, x) => s + (x.P ?? 0), 0), pl = dz.members.filter((m) => m.group === "plate");
    const down = pl.reduce((s, m) => s + sum(m.bear), 0) + sum(dz.bearLoose) + sum(dz.bearDirect);
    const fl = pj.frame.roofLink?.floor ?? pj.frame.floors.length - 1, rp = await L.roofPoints(pj.roof, pj.frame.floors[fl]); if (rp.error) return { name, error: rp.error };
    const by = rp.pts.reduce((o, x) => ((o[x.to] = (o[x.to] ?? 0) + x.P), o), {});
    const run = (pts) => F.analyzeFrame({ ...pj.frame, roofPoints: pts }), r1 = run(rp.pts), r0 = run([]);
    const z = (r) => (r.frame3d ? r.frame3d.base.reduce((s, q) => s + q.R[2], 0) : null), acc = (r) => r.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0);
    // roof load seen on the top-floor beams (point loads named หลังคา) and in the top columns
    const onBeams = r1.floors[fl].lines.reduce((s, ln) => s + (ln.extra ?? []).filter((e) => String(e.from ?? "").includes("หลังคา")).reduce((t, e) => t + e.P, 0), 0);
    return { name, down, sp: sum(rp.pts), by, onBeams, nRC: pl.filter((m) => m.onRCBeam).length, nDirect: (dz.bearDirect ?? []).length, nPl: pl.length, d3: z(r1) != null ? z(r1) - z(r0) : null, dAcc: acc(r1) - acc(r0), maxPlate: pl.reduce((a, m) => (m.r.section.w * m.count > a.w ? { w: m.r.section.w * m.count, n: `${m.count}xC${m.r.section.name}` } : a), { w: 0 }).n, ngPlates: pl.filter((m) => !m.r.ok).length };
  }, { name, pj });
  const f = (v) => (v == null ? "-" : Math.round(v).toLocaleString("en-US"));
  console.log(o.error ? `${o.name}: ERROR ${o.error}` : `${o.name.padEnd(30)} ลง ${f(o.down)} = ส่ง ${f(o.sp)} [เสา ${f(o.by.col)} คาน ${f(o.by.beam)} ย้าย ${f(o.by.moved)}] คานรับจริง ${f(o.onBeams)} · ฐาน3D +${f(o.d3)} สะสม +${f(o.dAcc)} · อะเสบนคาน ${o.nRC}/${o.nPl} จันทันลงคานตรง ${o.nDirect} จุด ใหญ่สุด ${o.maxPlate} NG ${o.ngPlates}`); }
  await b.close(); })();
