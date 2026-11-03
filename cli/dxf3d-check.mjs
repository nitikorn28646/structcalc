// 3D roof-frame DXF import on a synthetic file: plates at +4.50 (one split at a node), a ridge at +5.50, two vertical ดั้ง,
// one hip — every line on layer 0. Expected: 2 interior plates (merged), 2 posts, 1 ridge, slope from rise / distance to the outline.
import { parseDxf, roof3d, roof3dPatch } from "../web/src/dxfImport.js";

const L = (a, b) => `0\nLINE\n8\n0\n10\n${a[0]}\n20\n${a[1]}\n30\n${a[2]}\n11\n${b[0]}\n21\n${b[1]}\n31\n${b[2]}\n`;
const dxf = `0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n6\n0\nENDSEC\n0\nSECTION\n2\nENTITIES\n` +
  L([0, 3, 4.5], [4, 3, 4.5]) + L([4, 3, 4.5], [8, 3, 4.5]) + // interior plate along y = 3, split at x = 4
  L([4, 0, 4.5], [4, 3, 4.5]) + // interior plate x = 4 from the outline to the first one
  L([2, 3, 4.5], [2, 3, 5.5]) + L([6, 3, 4.5], [6, 3, 5.5]) + // ดั้ง
  L([2, 3, 5.5], [6, 3, 5.5]) + // ridge
  L([0, 0, 4.5], [2, 3, 5.5]) + // hip (sloped)
  `0\nENDSEC\n0\nEOF\n`;
let bad = 0;
const eq = (name, got, want, tol = 1e-6) => { const ok = typeof want === "number" ? Math.abs(got - want) <= tol : JSON.stringify(got) === JSON.stringify(want); if (!ok) bad++; console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${JSON.stringify(got)} (want ${JSON.stringify(want)})`); };
const r = roof3d(parseDxf(dxf), 1);
eq("plate level", r.H, 4.5); eq("ridge level", r.ridgeZ, 5.5); eq("posts", r.posts, [[2, 3], [6, 3]]);
eq("plates merged", r.plates.length, 2); eq("sloped", r.counts.sloped, 1);
const p = roof3dPatch(r, { pts: [[0, 0], [8, 0], [8, 6], [0, 6]] });
eq("interior plates (none on the outline)", p.innerPlates.length, 2);
eq("slope = atan(1.0 / 3.0)", p.slope, +((Math.atan(1 / 3) * 180) / Math.PI).toFixed(1));
eq("flat drawing → null", roof3d(parseDxf(dxf.replace(/\n5\.5\n/g, "\n4.5\n")), 1), null);
console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
