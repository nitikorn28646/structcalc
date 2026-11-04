// Slab panels, cantilever slabs and stairs of a floor designed with the diff-tested slab engine (engine/slab.js, WSD).
// Edge continuity: an edge shared with another slab panel is continuous. PS (precast) and GS (on ground) are not designed here.
import { cantilever, oneWay, stair, twoWay } from "./slab.js";

const close = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.03;
// share of edge p-q that lies on an edge of another slab panel
function continuous(pn, e, panels) {
  const p = pn.P[e], q = pn.P[(e + 1) % pn.P.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), u = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
  for (const o of panels) {
    if (o === pn || o.open || o.st === "GS" || o.stairWell) continue;
    for (let j = 0; j < o.P.length; j++) {
      const a = o.P[j], b = o.P[(j + 1) % o.P.length], off = (r) => Math.abs((r[0] - p[0]) * u[1] - (r[1] - p[1]) * u[0]);
      if (off(a) > 0.03 || off(b) > 0.03) continue;
      const ta = (a[0] - p[0]) * u[0] + (a[1] - p[1]) * u[1], tb = (b[0] - p[0]) * u[0] + (b[1] - p[1]) * u[1];
      if (Math.min(L, Math.max(ta, tb)) - Math.max(0, Math.min(ta, tb)) > 0.5 * L) return true;
    }
  }
  return false;
}

export function designSlabs(an, floor, mat, sm = {}) {
  const base = { fcPrime: mat.fcSlab ?? mat.fcPrime, F: mat.F ?? 0.45, capFc: mat.capFc, Es: mat.Es, fy: sm.fy ?? 2400, cover: sm.cover ?? mat.coverSlab ?? 2, unitWeight: 2400 };
  const bar = sm.bar ?? "RB 9", out = [], pbar = (pn) => floor.panels?.[pn.key]?.bar ?? bar; // bar size chosen per panel in step 8
  an.panels.forEach((pn, k) => {
    const name = `P${k + 1}`;
    if (pn.open || pn.stairWell || !(pn.t > 0)) return; // no slab here (a floor of ground / roof beams has thickness 0)
    if (pn.st !== "S") { out.push({ name, key: pn.key, kind: pn.st, note: pn.st === "PS" ? "พื้นสำเร็จ — ใช้ตามตารางผู้ผลิต (ช่วงพาด / น้ำหนักบรรทุก)" : "พื้นวางบนดิน — เสริมเหล็กกันร้าวตามแบบ" }); return; }
    const cont = pn.P.map((_, e) => continuous(pn, e, an.panels)), extra = pn.g.SDL + pn.g.WALL + (pn.g.SP ?? 0), inp = { ...base, t: pn.t, extra, live: pn.g.LL };
    try {
      if (pn.kind === "twoway") {
        const r = twoWay({ ...inp, S: pn.S, L: pn.L, case: 5 - cont.filter(Boolean).length, shortBar: pbar(pn), longBar: pbar(pn) });
        out.push({ name, key: pn.key, kind: "S", way: "สองทาง", S: pn.S, L: pn.L, cont: cont.filter(Boolean).length, case: 5 - cont.filter(Boolean).length, r,
          text: `${r.shortText} (สั้น) · ${r.longText} (ยาว)`, ok: r.nOk && r.minTOk && r.dOk && r.McSOk && r.McLOk });
      } else if (pn.kind === "oneway") {
        // spans across the short way: its ends are the two long edges
        const longEdges = pn.P.map((p, e) => [e, Math.hypot(pn.P[(e + 1) % 4][0] - p[0], pn.P[(e + 1) % 4][1] - p[1])]).filter(([, l]) => Math.abs(l - pn.L) < 1e-6).map(([e]) => cont[e]);
        const nC = longEdges.filter(Boolean).length, r = oneWay({ ...inp, L: pn.S, support: ["simple", "one_end", "both_ends"][nC], mainBar: pbar(pn), tempBar: pbar(pn) });
        out.push({ name, key: pn.key, kind: "S", way: "ทางเดียว", S: pn.S, L: pn.L, cont: nC, r, text: `${r.mainText} (หลัก) · ${r.tempText} (กันร้าว)`, ok: r.nOk && r.minTOk && r.dOk && r.VcOk && r.McOk && r.uOk });
      } else out.push({ name, key: pn.key, kind: "S", note: "รูปไม่ใช่สี่เหลี่ยม — ออกแบบด้วยโมดูลพื้นแยก" });
    } catch (e) { out.push({ name, key: pn.key, kind: "S", note: e.message, ok: false }); }
  });
  an.cants.forEach((c, i) => {
    const rail = (an.lineLoads ?? []).filter((l) => l.on === "cant").length ? (floor.lineLoads ?? []).filter((_, j) => an.lineLoads[j].on === "cant").reduce((s, l) => s + l.q, 0) : 0;
    try {
      const r = cantilever({ ...base, t: c.t, extra: c.g.SDL, live: c.g.LL, L: c.L, P: rail, a: c.L, mainBar: bar, tempBar: bar });
      out.push({ name: `พื้นยื่น ${i + 1}`, ci: i, kind: "C", L: c.L, r, text: `${r.mainText} (บน) · ${r.tempText} (กันร้าว)`, ok: r.nOk && r.minTOk && r.dOk && r.VcOk && r.McOk && r.uOk, note: rail ? `รวมราว ${rail} กก./ม. ที่ปลาย` : "" });
    } catch (e) { out.push({ name: `พื้นยื่น ${i + 1}`, kind: "C", note: e.message, ok: false }); }
  });
  (floor.stairs ?? []).forEach((st, i) => {
    const r0 = an.stairs[i];
    if (st.kind === "side" || st.kind === "cant") { out.push({ name: `บันได ${i + 1}`, si: i, kind: "ST", note: st.kind === "side" ? `พาดข้าง ช่วง ${r0.B.toFixed(2)} ม. — ออกแบบเป็นพื้นทางเดียวช่วงสั้น` : "บันไดยื่น — ออกแบบขั้นบันไดยื่นแยก" }); return; }
    try {
      const r = stair({ ...base, t: st.t ?? 0.12, riser: st.riser ?? 0.17, tread: st.tread ?? 0.25, extra: st.finish ?? 100, live: st.live ?? 300, L: r0.Lr, mainBar: st.mainBar ?? sm.stairBar ?? "DB 12", tempBar: bar, fy: sm.stairFy ?? 4000 });
      out.push({ name: `บันได ${i + 1}`, si: i, kind: "ST", L: r0.Lr, r, text: `${r.mainText} (หลัก) · ${r.tempText}`, ok: r.nOk && r.minTOk && r.dOk && r.VcOk && r.McOk && r.uOk });
    } catch (e) { out.push({ name: `บันได ${i + 1}`, si: i, kind: "ST", note: e.message, ok: false }); }
  });
  return out;
}
