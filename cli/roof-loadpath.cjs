// Roof → structure load-path check (2026-11-05): 10 roof cases (user files are git-ignored; missing ones are skipped would need the files).
// Needs the dev server on :5180. node cli/roof-loadpath.cjs — prints per case: load off the roof = points sent = increase at the base.
const { chromium } = require("playwright"); const fs = require("fs");
const P = (f) => JSON.parse(fs.readFileSync("public/projects/" + f + ".json"));
const y = P("yasothon"), u = P("_roof2"), r3 = P("_roof3"), r1 = P("_roof1");
const mod = (pj, fn) => { const c = JSON.parse(JSON.stringify(pj)); fn(c.roof); return c; };
const rcCase = mod(r3, (r) => { r.plates = r.plates.filter((pl) => !(Math.abs(pl.a[1] - pl.b[1]) < 1e-6 && [6.25, 3.25, 4.75].some((v) => Math.abs(pl.a[1] - v) < 1e-6))); r.guide = { beams: [{ a: [0.7, 6.25], b: [12.4, 6.25], w: 0.2 }, { a: [0.7, 3.25], b: [12.4, 3.25], w: 0.2 }, { a: [6.7, 4.75], b: [8.9, 4.75], w: 0.2 }] }; });
const cases = [["1 ยโสธร (สะพานอัตโนมัติ)", y], ["2 ยโสธร ไม่มีสะพาน", mod(y, (r) => { r.design.autoSupports = false; })], ["3 คุณหนูเลียง", u], ["4 ไฟล์ล่าสุด", r3], ["5 ไฟล์เก่า", r1],
  ["6 ดั้งบนคาน คสล.", rcCase], ["7 อะเสบนคาน RC (rc)", mod(r3, (r) => { r.design.plateSupport = "rc"; })], ["8 อะเสช่วงเดียว (span)", mod(u, (r) => { r.design.plateSupport = "span"; })],
  ["9 อะเสบนคาน (beam)", mod(u, (r) => { r.design.plateSupport = "beam"; })], ["10 ยโสธร L/240", mod(y, (r) => { r.design.plateDefl = 240; })]];
(async () => { const b = await chromium.launch(), p = await b.newPage(); await p.goto("http://localhost:5180/"); await p.waitForTimeout(3000);
  const out = [];
  for (const [name, pj] of cases) out.push(await p.evaluate(async ({ name, pj }) => {
    const L = await import("/src/roofLink.js"), R = await import("/src/RoofPage.jsx"), F = await import("/engine/frame.js");
    const sk = await R.loadSkeleton(), { g, dz, error } = R.runRoof(pj.roof, sk); if (error) return { name, error };
    const sum = (a) => (a ?? []).reduce((s, x) => s + (x.P ?? 0), 0);
    const down = dz.members.filter((m) => m.group === "plate").reduce((s, m) => s + sum(m.bear), 0) + sum(dz.bearLoose) + sum(dz.bearDirect);
    const fl = pj.frame.roofLink?.floor ?? pj.frame.floors.length - 1, rp = await L.roofPoints(pj.roof, pj.frame.floors[fl]);
    if (rp.error) return { name, error: rp.error };
    const sp = sum(rp.pts), by = rp.pts.reduce((o, x) => ((o[x.to] = (o[x.to] ?? 0) + 1), o), {});
    const base = (pts) => { const r = F.analyzeFrame({ ...pj.frame, roofLink: { on: true, floor: fl }, roofPoints: pts }); return { z: r.frame3d ? r.frame3d.base.reduce((s, q) => s + q.R[2], 0) : null, acc: r.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) }; };
    const b1 = base(rp.pts), b0 = base([]);
    let A = 0; const E = g.eave; for (let i = 0; i < E.length; i++) { const a = E[i], c = E[(i + 1) % E.length]; A += a[0] * c[1] - c[0] * a[1]; } A = Math.abs(A) / 2;
    const cos = 1 / Math.sqrt(1 + g.tan ** 2), q = (pj.roof.design.roofing === "metal" ? 7 : 50) + pj.roof.design.live + pj.roof.design.extra;
    return { name, down, sp, by, d3: b1.z - b0.z, dAcc: b1.acc - b0.acc, indep: (q * A) / cos + dz.weight, steel: dz.weight, warn: dz.warnings.length };
  }, { name, pj }));
  fs.writeFileSync("/dev/null", JSON.stringify(out)); await b.close();
  for (const o of out) console.log(o.error ? `${o.name}: ERROR ${o.error}` : `${o.name.padEnd(24)} หลังคาลง ${o.down.toFixed(0)} · จุดที่ส่งโครงสร้าง ${o.sp.toFixed(0)} (${JSON.stringify(o.by)}) · ฐาน 3D +${o.d3?.toFixed(0)} · สะสม +${o.dAcc.toFixed(0)} · อิสระ ${o.indep.toFixed(0)} (${((o.down / o.indep - 1) * 100).toFixed(1)}%)`); })();
