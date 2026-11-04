// Roof shape test (dev server on :5180): 36 outlines × hip / gable / shed / manila mixes, angled walls → planar faces, faces tile the plan, area = plan / cos θ, rafters inside / on the roof, ridge posts. node cli/roof-shapes.cjs
const { chromium } = require('playwright');
const H = 'hip', G = 'gable', M = 'manila';
const R = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
const L = [[0, 0], [10, 0], [10, 4], [4, 4], [4, 10], [0, 10]];
const Lw = [[0, 0], [12, 0], [12, 8], [4, 8], [4, 14], [0, 14]];
const T = [[0, 0], [12, 0], [12, 4], [8, 4], [8, 10], [4, 10], [4, 4], [0, 4]];
const U = [[0, 0], [12, 0], [12, 10], [8, 10], [8, 4], [4, 4], [4, 10], [0, 10]];
const X = [[4, 0], [8, 0], [8, 4], [12, 4], [12, 8], [8, 8], [8, 12], [4, 12], [4, 8], [0, 8], [0, 4], [4, 4]];
const Z = [[0, 0], [8, 0], [8, 4], [12, 4], [12, 8], [4, 8], [4, 4], [0, 4]];
const E = [[0, 0], [12, 0], [12, 3], [4, 3], [4, 6], [12, 6], [12, 9], [4, 9], [4, 12], [12, 12], [12, 15], [0, 15]];
const Y = [[0, 2.4], [3.5, 2.4], [3.5, 3.4], [14, 3.4], [14, 7.9], [3.5, 7.9], [3.5, 6.9], [0, 6.9]];
const ed = (pts, f) => pts.map((_, i) => ({ type: f(i) }));
const models = [
  ['1 สี่เหลี่ยม ปั้นหยา', R(10, 6), ed(R(10, 6), () => H)],
  ['2 จั่วสองด้าน', R(10, 6), ed(R(10, 6), (i) => (i % 2 ? G : H))],
  ['3 หมาแหงน (ลาดเดียว)', R(8, 4), ed(R(8, 4), (i) => (i === 0 ? H : G))],
  ['4 จั่วหน้า ปั้นหยาหลัง', R(10, 6), ed(R(10, 6), (i) => (i === 1 ? G : H))],
  ['5 L ปั้นหยา', L, ed(L, () => H)],
  ['6 L จั่วปลายปีก', L, ed(L, (i) => (i === 1 || i === 4 ? G : H))],
  ['7 L จั่ว+ปั้นหยา', L, ed(L, (i) => (i === 1 ? G : H))],
  ['8 T จั่ว 3 ปลาย', T, ed(T, (i) => ([1, 4, 7].includes(i) ? G : H))],
  ['9 U จั่วปลายขา', U, ed(U, (i) => ([2, 6].includes(i) ? G : H))],
  ['10 กากบาท จั่ว 4 ปลาย', X, ed(X, (i) => ([0, 3, 6, 9].includes(i) ? G : H))],
  ['11 L กว้างไม่เท่า ปั้นหยา', Lw, ed(Lw, () => H)],
  ['12 L กว้างไม่เท่า จั่ว (สันสูงต่างกัน)', Lw, ed(Lw, (i) => (i === 1 || i === 4 ? G : H))],
  ['13 ปิรามิด', R(8, 8), ed(R(8, 8), () => H)],
  ['14 คางหมู', [[0, 0], [12, 0], [9, 6], [3, 6]], ed([0, 0, 0, 0], () => H)],
  ['15 Z ปั้นหยา', Z, ed(Z, () => H)],
  ['16 Z จั่วสองปลาย', Z, ed(Z, (i) => (i === 3 || i === 7 ? G : H))],
  ['17 E ปั้นหยา', E, ed(E, () => H)],
  ['18 E จั่ว 3 ขา', E, ed(E, (i) => ([1, 5, 9].includes(i) ? G : H))],
  ['19 ยโสธร ปั้นหยา', Y, ed(Y, () => H)],
  ['20 ยโสธร จั่วหัวท้าย', Y, ed(Y, (i) => ([4, 7].includes(i) ? G : H))],
  ['21 L หมาแหงน', L, ed(L, (i) => (i === 0 || i === 5 ? H : G))],
  ['22 มนิลา สองด้าน', R(10, 6), ed(R(10, 6), (i) => (i % 2 ? M : H))],
  ['23 มนิลา + จั่ว', R(10, 6), ed(R(10, 6), (i) => (i === 1 ? M : i === 3 ? G : H))],
  ['24 L มนิลาปลายปีก', L, ed(L, (i) => (i === 1 || i === 4 ? M : H))],
  ['25 T มนิลา 3 ปลาย', T, ed(T, (i) => ([1, 4, 7].includes(i) ? M : H))],
  ['26 ยโสธร มนิลา หัวท้าย', Y, ed(Y, (i) => ([3, 7].includes(i) ? M : H))], ['28 ยโสธร มนิลา ด้านยาว+ปลาย', Y, ed(Y, (i) => ([4, 7].includes(i) ? M : H))],
  ['27 หมาแหงน ยาว', R(14, 5), ed(R(14, 5), (i) => (i === 2 ? H : G))],
  ['29 ผนังเอียง ปั้นหยา', [[0, 0], [10, 0], [12, 5], [2, 7]], ed([0, 0, 0, 0], () => H)],
  ['30 ผนังเอียง จั่ว', [[0, 0], [10, 0], [12, 5], [2, 7]], ed([0, 0, 0, 0], (i) => (i % 2 ? G : H))],
  ['31 หกเหลี่ยม', [[3, 0], [9, 0], [12, 5], [9, 10], [3, 10], [0, 5]], ed([0, 0, 0, 0, 0, 0], () => H)],
  ['32 ยาวแคบ 3x20 จั่ว', R(20, 3), ed(R(20, 3), (i) => (i % 2 ? G : H))],
  ['33 เล็ก 3x3', R(3, 3), ed(R(3, 3), () => H)],
  ['34 มุมตัด (bay)', [[0, 0], [10, 0], [12, 2], [12, 6], [10, 8], [0, 8]], ed([0, 0, 0, 0, 0, 0], () => H)],
  ['35 L มนิลา+จั่ว', L, ed(L, (i) => (i === 1 ? M : i === 4 ? G : H))],
  ['36 U ปั้นหยา', U, ed(U, () => H)],
];
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5180/'); await p.waitForTimeout(1500);
  const out = await p.evaluate(async (models) => {
    const m = await import('/src/RoofPage.jsx'), sk = await m.loadSkeleton(), res = [];
    for (const [name, pts, edges] of models) {
      const roof = { ...m.EMPTY_ROOF, pts, edges, slope: 30, overhang: 1, H: 3 };
      try {
        const r = m.runRoof(roof, sk), g = r.g, cos = Math.cos(Math.PI / 6), bad = [];
        if (!g) { res.push([name, 'NO GEOMETRY ' + JSON.stringify(Object.keys(r))]); continue; }
        const rf = g.faces.filter((f) => !f.gable);
        for (const f of rf) for (const q of f.P) { const z = f.plane.a * q[0] + f.plane.b * q[1] + f.plane.c; if (Math.abs(z - q[2]) > 1e-4) { bad.push('non-planar face ' + f.edge); break; } }
        const A2 = (P) => Math.abs(P.reduce((a, q, i) => { const r2 = P[(i + 1) % P.length]; return a + q[0] * r2[1] - r2[0] * q[1]; }, 0) / 2);
        const proj = rf.reduce((a, f) => a + A2(f.P), 0);
        if (Math.abs(proj - g.planArea) > 0.005 * g.planArea) bad.push(`cover ${proj.toFixed(2)} vs plan ${g.planArea.toFixed(2)}`);
        if (Math.abs(g.roofArea - g.planArea / cos) > 0.005 * g.roofArea) bad.push(`area ${g.roofArea.toFixed(2)} vs ${(g.planArea / cos).toFixed(2)}`);
        const zE = 3 - Math.tan(Math.PI / 6);
        if (g.faces.some((f) => f.P.some((q) => q[2] < zE - 1e-6))) bad.push('below eave');
        const fr = r.fr, nanR = (fr?.rafters ?? []).some((x) => [...x.p, ...x.q].some((v) => !Number.isFinite(v)));
        if (!fr?.rafters?.length) bad.push('no rafters'); if (nanR) bad.push('NaN rafter');
        const inside = (x, y) => { let c = false; const P = g.eave; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
        const outR = (fr?.rafters ?? []).filter((x) => !inside((x.p[0] + x.q[0]) / 2 + 1e-6, (x.p[1] + x.q[1]) / 2 + 1e-6)).length;
        if (outR) bad.push(`${outR} rafters outside`);
        const zBad = (fr?.rafters ?? []).filter((x) => x.p[2] < zE - 0.05 || x.q[2] > g.top + 0.05).length; if (zBad) bad.push(`${zBad} rafters off the roof`);
        if (g.lines.some((l) => l.type === 'ridge') && !(fr?.posts ?? []).length) bad.push('no posts under ridge');
        const cnt = (t) => g.lines.filter((l) => l.type === t).length;
        res.push([name, bad.length ? 'FAIL ' + bad.join('; ') : 'ok', `faces ${rf.length}+${g.faces.length - rf.length}g ridge ${cnt('ridge')} hip ${cnt('hip')} valley ${cnt('valley')} rake ${cnt('rake')} top ${g.top.toFixed(2)} rafters ${fr?.rafters?.length ?? 0} design ${r.dz ? (r.dz.ok ? 'ok' : 'NG') : '-'} posts ${(fr?.posts ?? []).length}${g.warnings?.length ? ' W:' + g.warnings.length : ''}`]);
      } catch (e) { res.push([name, 'ERROR ' + e.message]); }
    }
    return res;
  }, models);
  for (const r of out) console.log(r.join(' | ')); console.log(errs.join('|') || ''); await b.close(); })();
