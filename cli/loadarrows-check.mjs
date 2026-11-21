// The 3D load arrows (web/src/loadArrows.js) must show the loads exactly as the analysis took them: per wall the q put on the beam lines
// (or spread on the slab), every drawn line / point load, and the roof points of the linked floor. Run on the example + test projects.
import { readFileSync, existsSync } from "node:fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { wallsOf } from "../web/engine/floor.js";
import { loadArrowData } from "../web/src/loadArrows.js";

let bad = 0, n = 0;
const ok = (name, cond, info = "") => { n++; if (!cond) { bad++; console.log(`FAIL ${name} ${info}`); } };
const files = process.argv.slice(2).length ? process.argv.slice(2) : ["web/public/projects/yasothon.json", ...["_u3w", "_levels", "_big", "_roof3", "_stair2", "_user"].map((f) => `web/public/projects/${f}.json`).filter(existsSync)];
const near = (a, b, tol = 0.5) => Math.abs(a - b) <= tol;
for (const f of files) {
  const raw = JSON.parse(readFileSync(f, "utf8")), frame = raw.frame ?? raw;
  // a synthetic roof link on the top floor: two points, so the roof branch is always exercised
  const top = frame.floors.length - 1, c0 = frame.floors[top].columns?.[0];
  for (const fr of [frame, ...(c0 ? [{ ...frame, roofLink: { on: true, floor: top }, roofPoints: [{ p: c0, P: 1234, name: "หลังคา" }, { p: [c0[0] + 0.01, c0[1] + 9e9], P: 0, name: "หลังคา" }] }] : [])]) {
    const res = analyzeFrame(fr);
    fr.floors.forEach((fl, k) => {
      const an = res.floors[k], d = loadArrowData(fr, an, k, wallsOf(fl)), tag = `${f.split("/").pop()} ${fl.name}`;
      // walls: every wall with weight is drawn; its q = the q of each WALL item the engine put on the beam lines for it
      const walls = wallsOf(fl);
      walls.forEach((w, i) => {
        const r = an.walls[i], items = an.lines.flatMap((ln) => ln.slab.filter((s) => s.g === "WALL" && s.from === `ผนัง ${i + 1}`));
        const drawn = d.walls.find((x) => x.name === `ผนัง ${i + 1}`);
        ok(`${tag} wall ${i + 1} drawn`, !(r.q > 0) || !!drawn);
        for (const it of items) ok(`${tag} wall ${i + 1} q on beam`, near(it.wa, drawn?.q ?? NaN, 1e-6), `${it.wa} vs ${drawn?.q}`);
        if (items.length) ok(`${tag} wall ${i + 1} load on beams ≤ arrows`, items.reduce((s, it) => s + (it.b - it.a) * it.wa, 0) <= (drawn?.q ?? 0) * Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) + 1e-6);
      });
      // line / point loads: totals = what was drawn on the floor
      ok(`${tag} line loads`, near(d.totals.lines, (fl.lineLoads ?? []).reduce((s, l) => s + (l.q > 0 ? l.q * Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) : 0), 0), 1e-6));
      ok(`${tag} point loads`, near(d.totals.points, (fl.pointLoads ?? []).reduce((s, p) => s + Math.max(0, p.P), 0), 1e-6));
      // roof points: only on the linked floor, same values and order as the engine's appended point loads
      const linked = fr.roofLink?.on && fr.roofLink.floor === k, want = linked ? (fr.roofPoints ?? []).reduce((s, p) => s + Math.max(0, p.P), 0) : 0;
      ok(`${tag} roof total`, near(d.totals.roof, want, 1e-6), `${d.totals.roof} vs ${want}`);
      if (linked) ok(`${tag} engine took the roof points`, an.pointLoads.length === (fl.pointLoads ?? []).length + (fr.roofPoints ?? []).length);
    });
  }
}
console.log(`${n - bad}/${n} ok${bad ? ` · ${bad} FAILED` : ""} (${files.length} projects)`);
process.exit(bad ? 1 : 0);
