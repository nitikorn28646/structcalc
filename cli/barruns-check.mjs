// Quick check of the 3D bar-run logic against the default beam sections.
import { barLayout, barRuns } from "../web/src/drawings.js";
import { DEFAULT_STATE as st } from "../web/src/beamModel.js";


const lay = (sec, f) => barLayout(20, 50, 3, 0.9, st[sec][f], f === "top").map((p) => ({ x: p.x, y: p.y, d: p.d }));
for (const f of ["top", "bottom"]) {
  const runs = barRuns(lay("mid", f), lay("sup", f), 5, { L: true, R: true });
  console.log(f, runs.map((r) => `${r.d}@x${r.x.toFixed(1)} z${r.z0.toFixed(2)}-${r.z1.toFixed(2)}`).join(" | "));
}

