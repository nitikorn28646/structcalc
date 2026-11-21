// The 3D load arrows (web/src/loadArrows.js) must show the loads exactly as the analysis took them: per wall the q put on the beam lines
// (or spread on the slab), every drawn line / point load, and the roof points of the linked floor. Run on the example + test projects.
import { readFileSync, existsSync } from "node:fs";
import { analyzeFrame, roofLinkFloor } from "../web/engine/frame.js";
import { wallsOf } from "../web/engine/floor.js";
import { loadArrowData, roofStatus } from "../web/src/loadArrows.js";

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
    // roof status: what the analysis says the roof points landed on; totals must add up
    const rs = roofStatus(fr, res, raw.roof);
    if (roofLinkFloor(fr) !== null && (fr.roofPoints ?? []).some((p) => p.P > 0)) {
      const want = (fr.roofPoints ?? []).reduce((s, p) => s + Math.max(0, p.P), 0);
      ok(`${f} roof status total`, near(rs.total, want, 1e-6) && near(rs.col + rs.beam + rs.panel + rs.lost, want, 1e-6), JSON.stringify(rs));
      ok(`${f} roof status state`, rs.state === (rs.nLost || rs.moved ? "partial" : "ok"));
    } else ok(`${f} roof status not linked`, ["unlinked", "none", "empty"].includes(rs.state), rs.state);
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
      const linked = roofLinkFloor(fr) === k, want = linked ? (fr.roofPoints ?? []).reduce((s, p) => s + Math.max(0, p.P), 0) : 0;
      ok(`${tag} roof total`, near(d.totals.roof, want, 1e-6), `${d.totals.roof} vs ${want}`);
      if (linked) ok(`${tag} engine took the roof points`, an.pointLoads.length === (fl.pointLoads ?? []).length + (fr.roofPoints ?? []).length);
    });
  }
}
{ // a link to a deleted floor (index past the end) must not drop the roof load: it goes to the top floor + a warning
  const raw = JSON.parse(readFileSync("web/public/projects/yasothon.json", "utf8")), fr = raw.frame ?? raw, top = fr.floors.length - 1, c = fr.floors[top].columns[0];
  const pts = [{ p: c, P: 5000, name: "หลังคา" }], base = (r) => r.footings.reduce((s, x) => s + (x.P ?? 0), 0);
  const r0 = analyzeFrame({ ...fr, roofLink: undefined }), rOk = analyzeFrame({ ...fr, roofLink: { on: true, floor: top }, roofPoints: pts }), rStale = analyzeFrame({ ...fr, roofLink: { on: true, floor: top + 5 }, roofPoints: pts });
  const sum = (r) => r.columns.filter((x) => x.floor === top).reduce((s, x) => s + (x.Ptop ?? 0), 0);
  ok("stale link → same column loads as the right link", near(sum(rStale), sum(rOk), 1e-6) && sum(rOk) > sum(r0) + 4999, `${sum(r0)} ${sum(rOk)} ${sum(rStale)}`);
  ok("stale link warned", rStale.warnings.some((w) => w.includes("หลังคาเชื่อมกับชั้นที่ไม่มี")));
  ok("roofLinkFloor clamps", roofLinkFloor({ floors: [{}, {}], roofLink: { on: true, floor: 7 } }) === 1 && roofLinkFloor({ floors: [{}, {}], roofLink: { on: true } }) === 1 && roofLinkFloor({ floors: [{}], roofLink: { on: false, floor: 0 } }) === null);
}
console.log(`${n - bad}/${n} ok${bad ? ` · ${bad} FAILED` : ""} (${files.length} projects)`);
process.exit(bad ? 1 : 0);
