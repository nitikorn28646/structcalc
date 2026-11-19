// Beam type assignment (engine/beamAssign.js): locking reproduces the auto result exactly, editing a type never moves beams to another
// type, hand-made types are not picked automatically, assignment by hand, delete keeps names, generator + finalize keeps hand-set beams.
import fs from "node:fs";
import { analyzeFrame } from "../web/engine/frame.js";
import { generateBeamTypes } from "../web/engine/beamTypes.js";
import { lockBeams, unlockBeams, assignBeams, deleteBeamType, renumberTypes, finalizeGenerated, beamCounts, nextTypeName } from "../web/engine/beamAssign.js";
let pass = 0, fail = 0;
const ok = (name, c, info = "") => { if (c) pass++; else { fail++; console.log("FAIL", name, info); } };
const proj = JSON.parse(fs.readFileSync(new URL("../web/public/projects/yasothon.json", import.meta.url)));
const base = proj.frame;
const spans = (r) => r.floors.flatMap((a, k) => a.spans.map((s) => ({ k, id: s.id, t: s.typeIdx, ok: s.ok, u: +s.check.util.toFixed(9) })));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// 1. all beams auto → lock → identical result
let f = { ...base, floors: base.floors.map((fl) => ({ ...fl, beams: fl.beams.map((b) => ({ ...b, type: null })) })) };
const r0 = analyzeFrame(f), L = lockBeams(f, r0);
const fL = { ...f, floors: L.floors }, r1 = analyzeFrame(fL);
ok("lock count = all beams", L.n === f.floors.reduce((s, fl) => s + fl.beams.length, 0), L.n);
ok("lock: same types / checks", same(spans(r0), spans(r1)));
ok("counts", beamCounts(fL).lock === L.n && beamCounts(fL).auto === 0);

// 2. edit one type (fewer bottom bars) → beams on it keep it (auto would move them)
const used = r1.floors.flatMap((a) => a.spans).map((s) => s.typeIdx), ti = used[0];
const weak = fL.beamTypes.map((t, i) => (i === ti ? { ...t, bot: "2-DB12", botX: "", top: "2-DB12", topX: "" } : t));
const r2 = analyzeFrame({ ...fL, beamTypes: weak });
const before = r1.floors.flatMap((a) => a.spans).filter((s) => s.typeIdx === ti).length, after = r2.floors.flatMap((a) => a.spans).filter((s) => s.typeIdx === ti).length;
ok("locked: spans stay on the edited type", before === after && before > 0, `${before} → ${after}`);
const r2auto = analyzeFrame({ ...f, beamTypes: weak }), afterAuto = r2auto.floors.flatMap((a) => a.spans).filter((s) => s.typeIdx === ti).length;
console.log(`  edited type ${fL.beamTypes[ti].name}: locked ${before} → ${after} spans · auto would give ${afterAuto}`);
const failing = r2.floors.flatMap((a) => a.spans).filter((s) => !s.ok).length, sug = r2.floors.reduce((s, a) => s + Object.keys(a.suggest ?? {}).length, 0);
ok("failing locked beams get a suggestion", failing === 0 || sug > 0, `${failing} NG, ${sug} suggestions`);
// suggestion applied → passes
{ let ff = { ...fL, beamTypes: weak }; for (const [k, a] of r2.floors.entries()) for (const [m, t] of Object.entries(a.suggest ?? {})) ff = { ...ff, floors: assignBeams(ff, k, [+m], t) };
  const r3 = analyzeFrame(ff), ng3 = r3.floors.flatMap((a) => a.spans).filter((s) => !s.ok).length;
  console.log(`  NG after edit ${failing} → after applying ${sug} suggestions ${ng3}`); ok("suggestions reduce NG", ng3 <= failing); }

// 3. unlock → back to auto, same as r0
const U = unlockBeams(fL); ok("unlock", U.n === L.n && same(spans(analyzeFrame({ ...fL, floors: U.floors })), spans(r0)));

// 4. hand-made type lighter than all: auto never picks it; assigned by hand it is used
const tiny = { ...fL.beamTypes[0], name: nextTypeName(fL.beamTypes), b: 0.15, h: 0.25, manual: true };
const fm = { ...f, beamTypes: [...f.beamTypes, tiny] }, rm = analyzeFrame(fm), mi = fm.beamTypes.length - 1;
ok("manual type not auto-picked", !rm.floors.some((a) => a.spans.some((s) => s.typeIdx === mi)));
ok("other spans unchanged by a manual type", same(spans(rm), spans(r0)));
const fa = { ...fm, floors: assignBeams(fm, 1, [0], mi) }, ra = analyzeFrame(fa);
ok("assigned by hand → used", ra.floors[1].spans.some((s) => s.members.includes(0) && s.typeIdx === mi) && fa.floors[1].beams[0].autoLock === undefined);

// 5. delete keeps names
const names = fL.beamTypes.map((t) => t.name), D = deleteBeamType(fL, 1);
ok("delete keeps other names", same(D.beamTypes.map((t) => t.name), names.filter((_, i) => i !== 1)));
ok("delete: beams on it → auto, others shift", D.floors.every((fl, k) => fl.beams.every((b, m) => { const o = fL.floors[k].beams[m].type; return o === 1 ? b.type == null : o > 1 ? b.type === o - 1 : b.type === o; })));
// renumber on request keeps every beam on the same section
{ const R = renumberTypes(D); ok("renumber: same section per beam", R.floors.every((fl, k) => fl.beams.every((b, m) => { const o = D.floors[k].beams[m].type; return o == null ? b.type == null : R.beamTypes[b.type] === D.beamTypes[o] || JSON.stringify({ ...R.beamTypes[b.type], name: 0 }) === JSON.stringify({ ...D.beamTypes[o], name: 0 }); }))); }

// 6. generator + finalize: everything locked, result = generator's, hand-set beam keeps its type
const g = generateBeamTypes(f, 3), F = finalizeGenerated(f, g);
const rF = analyzeFrame({ ...f, beamTypes: F.beamTypes, floors: F.floors });
ok("finalize: all locked", beamCounts({ floors: F.floors }).auto === 0);
ok("finalize: pass count = generator", rF.floors.flatMap((a) => a.spans).filter((s) => s.ok).length === g.ok, `${rF.floors.flatMap((a) => a.spans).filter((s) => s.ok).length} vs ${g.ok}`);
const fh = { ...fm, floors: assignBeams(fm, 1, [0], mi) }, gh = generateBeamTypes(fh, 3), Fh = finalizeGenerated(fh, gh);
const kt = Fh.floors[1].beams[0];
ok("finalize: hand-set beam keeps its type", kt.type != null && !kt.autoLock && Fh.beamTypes[kt.type].b === 0.15 && Fh.beamTypes[kt.type].manual, JSON.stringify(Fh.beamTypes[kt.type]));
ok("finalize: names unique", new Set(Fh.beamTypes.map((t) => t.name)).size === Fh.beamTypes.length, Fh.beamTypes.map((t) => t.name).join(","));
console.log(`beamassign-check: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
