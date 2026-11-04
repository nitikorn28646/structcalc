// Continuous wall plates (roofMembers contRun) checked on their own (user 2026-11-04, point 5): the plate lines of a project are
// re-solved with the independent force-method solver, EI = E·Ix·count of EACH span's own section (the program assumes one EI per line).
// input: JSON dumped from the browser (dz.plateLines + plate members) — node cli/audit-plates.mjs plates.json
import fs from "fs";
import { forceMethod, doubleInt } from "./indep-beam.mjs";
const [run] = JSON.parse(fs.readFileSync(process.argv[2]));
for (const ln of run.lines) {
  const ms = ln.tags.map((t) => run.members.find((m) => m.tag === t)), xs = ln.x.filter((_, i) => ln.sup[i]), L = ln.x.at(-1);
  const EIs = ms.map((m) => (run.E * m.Ix * m.count) / 1e4), EIat = (x) => EIs[Math.max(0, ln.x.findIndex((v, i) => i > 0 && x <= v + 1e-9) - 1)];
  const loads = ln.loads.map((l) => (l.P !== undefined ? { at: l.at, P: l.P } : { a: l.a, b: l.b, w: l.wa }));
  const fm = forceMethod(L, xs, EIat, loads), v = doubleInt(fm, xs), h = fm.h;
  const EIu = forceMethod(L, xs, () => EIs[0], loads), vu = doubleInt(EIu, xs); // one EI (the program's assumption)
  ms.forEach((m, j) => { const k0 = Math.round(ln.x[j] / h), k1 = Math.round(ln.x[j + 1] / h), seg = (a) => a.slice(k0, k1 + 1);
    const dmax = Math.max(...seg(v).map(Math.abs)) * 100, du = Math.max(...seg(vu).map(Math.abs)) * 100, Mp = Math.max(0, ...seg(fm.M)), Mn = Math.max(0, ...seg(fm.M).map((x) => -x));
    console.log(`${ln.label} ${m.tag} ${m.name}×${m.count} L ${(ln.x[j + 1] - ln.x[j]).toFixed(2)} | δ prog ${m.d.toFixed(3)} · indep own-EI ${dmax.toFixed(3)} · indep one-EI ${du.toFixed(3)} cm (allow ${m.dAllow.toFixed(3)}) | M+ ${m.Mpos?.toFixed(0)}/${Mp.toFixed(0)} M− ${m.Mneg?.toFixed(0)}/${Mn.toFixed(0)} kg-m${Math.abs(m.d - dmax) > 0.03 * dmax + 0.005 ? "  ← δ differs" : ""}`); });
}
