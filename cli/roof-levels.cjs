// Roof level check (dev server :5180): 20 frames (storeys, base levels, names with / without +x.xx) → imported plate level = top floor elevation, 3D roof z = column tops. node cli/roof-levels.cjs
const { chromium } = require('playwright');
(async () => { const b = await chromium.launch(); const p = await b.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto('http://localhost:5180/'); await p.waitForTimeout(1500);
  const out = await p.evaluate(async () => {
    const { roofFromFrame } = await import('/src/roofLink.js'), { elevations, baseLevel } = await import('/src/StoreyTable.jsx');
    const { analyzeFrame } = await import('/engine/frame.js'), { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES } = await import('/engine/floor.js');
    const mat = { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 };
    const fl = (name, h) => ({ name, h, t: 0.12, finish: 100, live: 200, columns: [[0, 0], [4, 0], [4, 3], [0, 3]], panels: {}, beams: [[0, 0, 4, 0], [4, 0, 4, 3], [4, 3, 0, 3], [0, 3, 0, 0]].map(([a, b2, c, d]) => ({ a: [a, b2], b: [c, d], type: null })) });
    const cases = [], res = [];
    const hs = [[0.8, 3.6, 2.6], [1.5, 3, 3], [0.5, 3.2], [1.0, 3.0, 3.0, 3.0], [0.8, 3.0], [1.2, 3.5, 3.2], [0.6, 2.8, 2.8], [0.8, 4.0, 3.0], [1.5, 3.0], [0.4, 3.0, 3.0]];
    hs.forEach((h, i) => {
      const base = [-0.4, -1.5, -0.5, -1.0, -0.8, 0, -0.6, -0.8, -1.5, 0][i];
      // A: names carry the level of the first floor ("+x.xx"); B: baseLevel saved explicitly, names without levels
      let z = base; const namesA = h.map((v, k) => { z += v; return `ชั้น${k} ${z >= 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`; });
      cases.push([`${i + 1}A ${h.join('/')} ฐาน ${base}`, { floors: h.map((v, k) => fl(namesA[k], v)) }, base]);
      cases.push([`${i + 1}B ${h.join('/')} baseLevel ${base}`, { baseLevel: base, floors: h.map((v, k) => fl(`ชั้น ${k + 1}`, v)) }, base]);
    });
    for (const [name, fr, base] of cases) {
      const frame = { mat, beamTypes: DEFAULT_BEAM_TYPES, colTypes: DEFAULT_COLUMN_TYPES, ...fr }, r = analyzeFrame(frame), rf = roofFromFrame(frame, r);
      const top = elevations(frame).at(-1), sumH = frame.floors.reduce((t, f) => t + f.h, 0), z3 = rf.H - baseLevel(frame);
      const ok = !rf.error && Math.abs(rf.H - top) < 1e-6 && Math.abs(z3 - sumH) < 1e-6 && Math.abs(baseLevel(frame) - base) < 1e-6;
      res.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: อะเส ${rf.H} · ชั้นบน ${top.toFixed(2)} · 3D หัวเสา z ${sumH.toFixed(2)} / อะเส z ${z3.toFixed(2)} · base ${baseLevel(frame)}${rf.error ? ' ' + rf.error : ''}`);
    }
    return res;
  });
  console.log(out.join('\n')); console.log(errs.join('|') || ''); await b.close(); })();
