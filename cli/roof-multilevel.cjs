// Multi-level roofs (engine/roofParts.js + "wall" edges in engine/roof.js / roofMembers.js), browser test (dev server :5180):
// a lower roof abutting the higher wall of the main roof — geometry (planar, covers its own plan, nothing past the wall, no gable wall on
// the wall edge, "wall" line at the top), wall plate fixed to the wall at the roof top carrying the rafter top ends, load sent down per part
// ≈ independent total (roof load × area / cos + steel), floors per part in roofPoints, a one-part roof unchanged by the parts code.
// node cli/roof-multilevel.cjs
const { chromium } = require('playwright');
let n = 0, bad = 0;
const ok = (name, c, info = '') => { n++; if (!c) bad++; console.log(`${c ? 'ok  ' : 'FAIL'} ${name}${info ? ` — ${info}` : ''}`); };
(async () => {
  const b = await chromium.launch(), p = await b.newPage(), errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5180/'); await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => {
    const m = await import('/src/RoofPage.jsx'), L = await import('/src/roofLink.js'), sk = await m.loadSkeleton(), R = [];
    const rect = (x0, y0, w, h) => [[x0, y0], [x0 + w, y0], [x0 + w, y0 + h], [x0, y0 + h]];
    const base = { ...m.EMPTY_ROOF, slope: 30, overhang: 1, H: 6, design: { ...m.EMPTY_ROOF.design, autoSupports: false } };
    // main 8 × 6 hip roof with columns, part 2 = 3 × 6 lean-to on its right wall (x = 8), sides gable / hip
    const main = { ...base, pts: rect(0, 0, 8, 6), edges: [0, 0, 0, 0].map(() => ({ type: 'hip' })), columns: [[0, 0], [4, 0], [8, 0], [8, 6], [4, 6], [0, 6], [8, 3]] };
    const cases = [['ลาดเดียว จั่วข้าง', ['gable', 'hip', 'gable', 'wall']], ['ลาดเดียว ปั้นหยาข้าง', ['hip', 'hip', 'hip', 'wall']]];
    const A2 = (P) => Math.abs(P.reduce((a, q, i) => { const r2 = P[(i + 1) % P.length]; return a + q[0] * r2[1] - r2[0] * q[1]; }, 0) / 2);
    for (const [name, et] of cases) {
      const part = { name: 'ผืน 2', pts: rect(8, 0, 3, 6), edges: et.map((type) => ({ type })), slope: 20, overhang: 0.8, H: 3.2, columns: [[11, 0], [11, 3], [11, 6], [8, 0], [8, 6]], plates: [], innerPlates: [], dang: null, supports: null, linkFloor: 1 };
      const roof = { ...main, parts: [part] }, r = m.runRoof(roof, sk), one = m.runRoof(main, sk), x = { name };
      x.err = r.error ?? null;
      if (!r.g) { R.push(x); continue; }
      const g2 = r.g.parts[1], rf = g2.faces.filter((f) => !f.gable);
      x.planar = rf.every((f) => f.P.every((q) => Math.abs(f.plane.a * q[0] + f.plane.b * q[1] + f.plane.c - q[2]) < 1e-4));
      x.cover = [rf.reduce((a, f) => a + A2(f.P), 0), g2.planArea, A2(g2.eave)];
      x.eaveArea = (3 + 0.8) * (6 + (et[0] === 'wall' ? 0 : 0.8) + (et[2] === 'wall' ? 0 : 0.8));
      x.pastWall = g2.faces.some((f) => f.P.some((q) => q[0] < 8 - 1e-6));
      x.gableOnWall = g2.faces.some((f) => f.gable && f.P.every((q) => Math.abs(q[0] - 8) < 1e-6));
      x.wallLine = g2.lines.filter((l) => l.type === 'wall').length; x.ridge = g2.lines.filter((l) => l.type === 'ridge').length;
      x.zWall = Math.max(...g2.lines.filter((l) => l.type === 'wall').flatMap((l) => [l.p[2], l.q[2]]));
      x.zExp = 3.2 + 3 * Math.tan((20 * Math.PI) / 180);
      const pm = r.dz.members.filter((q) => q.part === 1 && q.group === 'plate');
      x.wallPlates = pm.filter((q) => q.wallTop).map((q) => ({ z: [q.p[2], q.q[2]], w: q.r.w, label: q.label, id: q.id, L: q.span }));
      x.nTop = r.fr.parts[1].rafters.filter((q) => !q.barge).filter((q) => Math.abs(Math.max(q.p[0], q.q[0]) - 8) < 0.05 || Math.abs(Math.min(q.p[0], q.q[0]) - 8) < 0.05).length;
      x.idsPrefixed = r.dz.members.filter((q) => q.part === 1).every((q) => q.id.startsWith('P2:'));
      x.rafterRidge = r.dz.parts[1].rows.find((q) => q.key === 'rafter').r.Rridge; x.D = roof.frame.rafterSp;
      // load sent down by part 2 = Σ bear of its plates + loose / direct points; independent = roof load × roof area / cos... (area is along the slope)
      const dz2 = r.dz.parts[1], down = dz2.members.filter((q) => q.group === 'plate').reduce((a, q) => a + (q.bear ?? []).reduce((s, b) => s + b.P, 0), 0) + [...dz2.bearLoose, ...dz2.bearDirect].reduce((a, b) => a + b.P, 0);
      const q = (roof.design.roofing === 'metal' ? 7 : 50) + roof.design.live + roof.design.extra;
      x.down = down; x.indep = q * g2.roofArea + dz2.weight;
      x.mainSame = JSON.stringify(r.dz.parts[0].members.map((q) => [q.id, q.r.section.name, +q.r.fb.toFixed(4)])) === JSON.stringify(one.dz.members.map((q) => [q.id, q.r.section.name, +q.r.fb.toFixed(4)]));
      x.weight = [r.dz.weight, one.dz.weight + dz2.weight];
      const rp = await L.roofPoints(roof, { columns: main.columns }, (k) => (k === 1 ? { columns: part.columns } : null));
      x.floors = [...new Set(rp.pts.map((q) => q.floor))];
      x.rpTotal = [rp.total, rp.pts.filter((q) => q.floor === 1).reduce((a, q) => a + q.P, 0), down];
      x.posts3d = r.fr.posts.filter((q) => q.part === 1 && !q.wallTop && Math.abs(q.x - 8) < 0.05).length;
      R.push(x);
    }
    // a one-part roof: parts code path not used, result object identical to runRoof without the key
    const y = await (await fetch('/projects/yasothon.json')).json(), r1 = m.runRoof(y.roof, sk), r2 = m.runRoof({ ...y.roof, parts: [] }, sk);
    R.push({ name: 'yasothon', same: JSON.stringify(r1.dz.rows.map((q) => [q.key, q.r.section.name, q.weight])) === JSON.stringify(r2.dz.rows.map((q) => [q.key, q.r.section.name, q.weight])), w: r1.dz.weight });
    return R;
  });
  for (const x of out) {
    if (x.name === 'yasothon') { ok('one-part roof (Yasothon) unchanged', x.same, `steel ${x.w.toFixed(1)} kg`); continue; }
    ok(`${x.name}: designed without error`, !x.err, x.err ?? '');
    if (x.err && !x.cover) continue;
    ok(`${x.name}: faces planar`, x.planar);
    ok(`${x.name}: faces cover the plan (no overhang at the wall)`, Math.abs(x.cover[0] - x.cover[1]) < 0.005 * x.cover[1] && Math.abs(x.cover[2] - x.eaveArea) < 1e-6, `faces ${x.cover[0].toFixed(3)} plan ${x.cover[1].toFixed(3)} expected ${x.eaveArea.toFixed(3)}`);
    ok(`${x.name}: nothing past the wall line`, !x.pastWall);
    ok(`${x.name}: no gable wall on the wall edge`, !x.gableOnWall);
    ok(`${x.name}: "wall" line at the top, no ridge`, x.wallLine >= 1 && x.ridge === 0, `wall ${x.wallLine} ridge ${x.ridge}`);
    ok(`${x.name}: roof top at the wall = H + run·tanθ`, Math.abs(x.zWall - x.zExp) < 1e-3, `${x.zWall.toFixed(3)} vs ${x.zExp.toFixed(3)}`);
    ok(`${x.name}: wall plates at the roof top on the wall, labelled`, x.wallPlates.length >= 1 && x.wallPlates.every((q) => q.z.every((z) => Math.abs(z - x.zExp) < 1e-3) && q.label.includes('อะเสยึดผนัง')), JSON.stringify(x.wallPlates.map((q) => q.z.map((z) => z.toFixed(2)))));
    const wallLoad = x.wallPlates.reduce((a, q) => a + q.w * q.L, 0), need = x.rafterRidge * x.nTop;
    ok(`${x.name}: wall plates carry every rafter ending on the wall (Σ w·L ≥ n × R top)`, x.nTop > 0 && wallLoad >= need - 1e-6, `${wallLoad.toFixed(0)} ≥ ${x.nTop} × ${x.rafterRidge.toFixed(1)} = ${need.toFixed(0)} (incl. plate weight)`);
    ok(`${x.name}: member ids of part 2 prefixed P2:`, x.idsPrefixed);
    ok(`${x.name}: no posts drawn on the wall line`, x.posts3d === 0);
    // never less than the independent total (the governing-rafter method and plates on gable edges load conservatively)
    ok(`${x.name}: load down ≥ independent total`, x.down >= 0.98 * x.indep, `${x.down.toFixed(0)} vs ${x.indep.toFixed(0)} (${((x.down / x.indep - 1) * 100).toFixed(1)} %)`);
    ok(`${x.name}: main part identical to the main roof alone`, x.mainSame);
    ok(`${x.name}: steel = main alone + part 2`, Math.abs(x.weight[0] - x.weight[1]) < 1e-6);
    ok(`${x.name}: roofPoints: part 2 on its own floor, totals kept`, x.floors.includes(1) && x.floors.includes(null) && Math.abs(x.rpTotal[1] - x.rpTotal[2]) < 5, `floors ${JSON.stringify(x.floors)} part2 ${x.rpTotal[1]} vs ${x.rpTotal[2].toFixed(0)}`);
  }
  if (errs.length) ok('no page errors', false, errs.join(' | '));
  console.log(`roof-multilevel: ${n - bad}/${n}${bad ? ` · ${bad} FAILED` : ' all ok'}`); await b.close(); process.exit(bad ? 1 : 0);
})();
