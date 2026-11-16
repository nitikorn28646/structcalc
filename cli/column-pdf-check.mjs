// Column C1 sheets (user's Excel PDFs, 2026-11-16: ตอม่อ / ชั้น 1 / ชั้น 2) — printed values must be reproduced by tiedColumn.
import { tiedColumn } from "../web/engine/column.js";
const base = { fcPrime: 173, fy: 3000, fys: 2400, Es: 2040000, Bx: 20, By: 20, Mx: 100, My: 50, tieSets: 1, frameCase: 2, mainBar: "DB 12", tieBar: "RB 6",
  beamTL: { L: 450, b: 20, t: 40 }, beamTR: { L: 450, b: 20, t: 40 }, beamBL: { L: 450, b: 20, t: 45 }, beamBR: { L: 450, b: 20, t: 45 },
  colTop: { L: 700, bx: 45, by: 45 }, colThis: { L: 400, bx: 45, by: 45 }, colThisB: { L: 700, bx: 45, by: 45 }, colBot: { L: 150, bx: 45, by: 45 } };
const cases = [
  ["ตอม่อ", { cover: 7.5, L: 1, P: 20000, nx: 4, ny: 6 }, { Pa: 21620.6, Po: 31664, Fa: 79.16, Ix: 13556.97, eax: 1.55, ebx: 4.54, Msx: 105541.05, Mbx: 60854.15, Max: 33476.22, Pbx: 13406.78, Mox: 7051.2, Moy: 10576.8, fbx: 7.38, fby: 3.69, klr: 20, R: 0.91, rTop: 2.832, rBot: 4.098, sTie: 19.2 }],
  ["ชั้น 1", { cover: 2.5, L: 3, P: 18000, nx: 4, ny: 6 }, { Pa: 21620.6, Ix: 18585.6, eax: 2.12, ebx: 6.55, Msx: 144688.87, Mbx: 85216.26, Max: 45893.39, Pbx: 13015.1, Mox: 34171.2, Moy: 51256.8, fbx: 5.38, fby: 2.69, klr: 60, R: 0.59 }],
  ["ชั้น 2", { cover: 2.5, L: 3, P: 10000, nx: 4, ny: 4 }, { Pa: 19315.4, Po: 28952, Fa: 72.38, Ix: 15667.67, eax: 2.1, ebx: 5.29, Msx: 121972.83, Mbx: 67891.02, Max: 40598.35, Pbx: 12837.09, Mox: 34171.2, Moy: 34171.2, fbx: 6.38, fby: 3.19, klr: 60, R: 0.59 }],
];
let bad = 0, n = 0;
for (const [name, c, exp] of cases) {
  const r = tiedColumn({ ...base, ...c });
  for (const [k, v] of Object.entries(exp)) { n++; const dec = String(v).split(".")[1]?.length ?? 0, tol = 0.5 * 10 ** -Math.max(dec, 2) + 1e-9;
    if (Math.abs(r[k] - v) > Math.max(tol, 0.006)) { bad++; console.log(`FAIL ${name} ${k}: ${r[k]} vs ${v}`); } }
  if (r.mode !== "I") { bad++; console.log(`FAIL ${name} mode ${r.mode}`); }
}
console.log(`column-pdf-check ${n - bad}/${n}${bad ? " FAIL" : " OK"}`);
process.exit(bad ? 1 : 0);
