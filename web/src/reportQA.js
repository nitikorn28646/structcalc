// Report quality control (user 2026-11-04, round 2): a stamp of the input data printed on every page (report integrity: the printed
// book belongs to exactly this data — any edit changes the code), calculation-ID anchors, and a check of the input for values that
// are probably wrong (zero, out of the usual range, a unit mix-up such as kN typed where kg is meant).

// FNV-1a 32-bit over the JSON of the model (stable key order is the save order) → 8 hex digits
export function dataStamp(obj) {
  const s = JSON.stringify(obj ?? {});
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).toUpperCase().padStart(8, "0");
}
// the stamp of a project: the model only (UI state such as the floor on screen or snapping left out)
export const projectStamp = (frame, roof, project) => { const { cur, ...fr } = frame ?? {}; const { snap, ...rf } = roof ?? {}; const { revisions, date, ...pj } = project ?? {}; return dataStamp({ frame: fr, roof: rf, project: pj }); };
// anchor of a calculation sheet: CALC ID → a safe element id (Thai letters kept)
export const calcAnchor = (id) => `calc-${String(id).replace(/[^\w฀-๿-]+/g, "_")}`;

// probable input mistakes: [{ lvl: "error" | "warn", where, text }]
export function validateInput(frame, roof) {
  const out = [], E = (where, text) => out.push({ lvl: "error", where, text }), W = (where, text) => out.push({ lvl: "warn", where, text });
  const m = frame?.mat ?? {};
  const fcs = [["f′c คาน", m.fcBeam ?? m.fcPrime], ["f′c เสา", m.fcCol ?? m.fcPrime], ["f′c พื้น", m.fcSlab ?? m.fcPrime], ["f′c ฐานราก", m.fcFoot ?? m.fcPrime]];
  for (const [k, v] of fcs) if (!(v >= 150 && v <= 500)) (v > 0 && v < 60 ? E : W)("วัสดุ", `${k} = ${v ?? "-"} กก./ซม.² — ปกติ 180–350${v > 0 && v < 60 ? " (กรอกเป็น MPa หรือไม่? 24 MPa ≈ 240 กก./ซม.²)" : ""}`);
  if (m.fy && ![2400, 3000, 4000, 5000].includes(+m.fy)) W("วัสดุ", `fy = ${m.fy} กก./ซม.² — ปกติ 2,400 (SR24) / 3,000 (SD30) / 4,000 (SD40)`);
  const qa = frame?.soil?.qa;
  if (qa != null && !(qa >= 2000 && qa <= 60000)) E("ดิน", `qa = ${qa} กก./ม.² — ปกติ 3,000–30,000${qa > 0 && qa < 100 ? " (กรอกเป็นตัน/ม.² หรือไม่? ต้องเป็น กก./ม.²)" : ""}`);
  for (const [k, v] of Object.entries(frame?.pileLoads ?? {})) if (!(v >= 3000 && v <= 200000)) E("เสาเข็ม", `น้ำหนักปลอดภัย ${k} = ${v} กก. — ${v < 300 ? "กรอกเป็นตันหรือไม่? ต้องเป็น กก." : "ผิดปกติ"}`);
  (frame?.floors ?? []).forEach((f, k) => {
    const at = f.name ?? `ชั้น ${k + 1}`;
    if (!(f.h > 0.3 && f.h <= 6)) E(at, `ความสูงเสาใต้ชั้น ${f.h ?? "-"} ม. — ปกติ 1.0–4.5 ม.`);
    if (f.t > 0 && (f.t < 0.08 || f.t > 0.3)) W(at, `พื้นหนาตั้งต้น ${f.t} ม. — ปกติ 0.10–0.20 ม.`);
    if (f.live > 1000) E(at, `น้ำหนักจร ${f.live} กก./ม.² — สูงผิดปกติ`);
    if (f.t > 0 && f.live > 0 && f.live < 10) E(at, `น้ำหนักจร ${f.live} กก./ม.² — กรอกเป็น kN/m² หรือไม่? (2 kN/m² ≈ 200 กก./ม.²)`);
    if (f.finish > 0 && f.finish < 10) E(at, `น้ำหนักปูผิว ${f.finish} กก./ม.² — กรอกเป็น kN/m² หรือไม่?`);
    for (const [key, p] of Object.entries(f.panels ?? {})) {
      if (p.open || p.kind === "GS" || p.kind === "PS") continue;
      if (p.t != null && (p.t < 0.08 || p.t > 0.3)) W(at, `แผ่นพื้น ${key}: หนา ${p.t} ม. ผิดปกติ`);
      if (p.live != null && p.live > 0 && p.live < 10) E(at, `แผ่นพื้น ${key}: น้ำหนักจร ${p.live} — หน่วยต้องเป็น กก./ม.²`);
    }
    (f.lineLoads ?? []).forEach((l, i) => { if (l.q > 3000) W(at, `น้ำหนักเส้น ${l.name ?? i + 1} = ${l.q} กก./ม. — สูงผิดปกติ`); if (l.q > 0 && l.q < 5) E(at, `น้ำหนักเส้น ${l.name ?? i + 1} = ${l.q} — หน่วยต้องเป็น กก./ม. (kN/m?)`); });
    (f.pointLoads ?? []).forEach((l, i) => { if (l.P > 50000) W(at, `น้ำหนักจุด ${l.name ?? i + 1} = ${l.P} กก. — สูงผิดปกติ`); if (l.P > 0 && l.P < 5) E(at, `น้ำหนักจุด ${l.name ?? i + 1} = ${l.P} — หน่วยต้องเป็น กก. (ตัน / kN?)`); });
    (f.stairs ?? []).forEach((s, i) => {
      if (!(s.riser > 0.1 && s.riser <= 0.2)) W(at, `บันได ${i + 1}: ลูกตั้ง ${s.riser ?? "-"} ม. — ควร 0.15–0.20 ม.`);
      if (!(s.tread >= 0.22 && s.tread <= 0.35)) W(at, `บันได ${i + 1}: ลูกนอน ${s.tread ?? "-"} ม. — ควร 0.22–0.30 ม.`);
      if (!(s.t >= 0.1)) W(at, `บันได ${i + 1}: ท้องบันไดหนา ${s.t ?? "-"} ม. — ไม่ควรน้อยกว่า 0.10 ม.`);
    });
    (f.beams ?? []).forEach((b, i) => { const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]); if (L > 12) W(at, `คาน ${i + 1} ยาว ${L.toFixed(2)} ม. — ยาวผิดปกติ (วาดผิดหน่วย?)`); if (L < 0.1) E(at, `คาน ${i + 1} ยาว ${L.toFixed(3)} ม. — สั้นผิดปกติ`); });
  });
  (frame?.beamTypes ?? []).forEach((t) => { if (!(t.b >= 0.12 && t.b <= 1) || !(t.h >= 0.2 && t.h <= 1.5)) W("Type คาน", `${t.name}: ${t.b} × ${t.h} ม. — ขนาดผิดปกติ (กรอกเป็น ซม. หรือไม่? ต้องเป็น ม.)`); });
  (frame?.colTypes ?? []).forEach((t) => t.levels.forEach((lv) => { if (!(lv.Bx >= 15 && lv.By >= 15 && lv.Bx <= 150 && lv.By <= 150)) W("Type เสา", `${t.name} ${lv.level}: ${lv.Bx} × ${lv.By} ซม. — ขนาดผิดปกติ (ต้องเป็น ซม.)`); if (!(lv.s > 0.05 && lv.s <= 0.3)) W("Type เสา", `${t.name} ${lv.level}: ระยะปลอก ${lv.s} ม. ผิดปกติ`); }));
  if (roof && (roof.pts?.length ?? 0) >= 3) {
    const d = roof.design ?? {}, fr = roof.frame ?? {};
    if (!(roof.slope >= 5 && roof.slope <= 60)) W("หลังคา", `ความชัน ${roof.slope ?? "-"}° — ปกติ 15–45°`);
    if (!(d.live > 0)) W("หลังคา", "น้ำหนักจรหลังคาเป็น 0");
    if (d.live > 0 && d.live < 5) E("หลังคา", `น้ำหนักจรหลังคา ${d.live} — หน่วยต้องเป็น กก./ม.²`);
    if (fr.rafterSp && !(fr.rafterSp >= 0.4 && fr.rafterSp <= 1.5)) W("หลังคา", `ระยะจันทัน ${fr.rafterSp} ม. — ปกติ 0.6–1.2 ม.`);
    if (!(roof.H > 1 && roof.H < 30)) W("หลังคา", `ระดับอะเส ${roof.H ?? "-"} ม. ผิดปกติ`);
  }
  return out;
}
