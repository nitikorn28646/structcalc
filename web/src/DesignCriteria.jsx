// Step 0 "เกณฑ์การออกแบบ" (design criteria) — every value the design uses, in one place, like the criteria sheet of a calculation
// package: materials per member, covers and bar spacing, deflection limits, soil / footing limits, analysis choices; can be saved as
// the engineer's own standard (localStorage structcalc.standard) and is applied to every new project.
import { Building2, Save, RotateCcw, Download } from "lucide-react";
import { Card, Field, NumberInput, Select } from "./ui.jsx";
import { GRADES } from "../engine/tables.js";

const KEY = "structcalc.standard";
// what a standard carries: criteria + the type lists the engineer reuses on every job
const PART = ["mat", "soil", "footUtil", "colMethod", "analysis", "baseFixity", "freeTop", "wallTypes", "beamTypes", "colTypes", "footTypes", "pileLoads", "loadLib"];
export const loadStandard = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; } };
export const applyStandard = (frame, std = loadStandard()) => (std ? { ...frame, ...Object.fromEntries(PART.filter((k) => std[k] !== undefined).map((k) => [k, std[k]])), mat: { ...frame.mat, ...std.mat } } : frame);

const Sub = ({ children }) => <div className="col-span-2 mt-1 border-b border-gray-100 pb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">{children}</div>;

export function DesignCriteria({ frame, set, setMat, defaults, onNotice }) {
  const m = frame.mat, num = (k, label, unit, step, def, f = setMat) => <Field label={label} unit={unit}><NumberInput value={m[k] ?? def} step={step} onChange={(v) => f(k, v)} /></Field>;
  const fc = (k, label) => <Field label={label} unit="ksc"><NumberInput value={m[k] ?? ""} step="10" placeholder={`${m.fcPrime}`} onChange={(v) => setMat(k, v || undefined)} /></Field>;
  const grade = (k, label) => <Field label={label}><Select value={m[k]} onChange={(v) => setMat(k, Number(v))} options={Object.entries(GRADES).map(([g, t]) => [g, t])} /></Field>;
  const std = loadStandard();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PART.map((k) => [k, frame[k]])))); onNotice?.("บันทึกเป็นค่ามาตรฐานของคุณแล้ว — โครงการใหม่จะเริ่มด้วยค่าชุดนี้"); } catch { onNotice?.("บันทึกไม่ได้ (เบราว์เซอร์ไม่อนุญาตที่เก็บข้อมูล)"); } };
  const use = () => { if (!std) return; for (const k of PART) if (std[k] !== undefined) set(k, k === "mat" ? { ...frame.mat, ...std.mat } : std[k]); onNotice?.("ใช้ค่ามาตรฐานของคุณกับโครงการนี้แล้ว"); };
  const reset = () => { set("mat", { ...defaults.mat }); onNotice?.("กลับเป็นค่าเริ่มต้นของโปรแกรม (เฉพาะวัสดุและระยะหุ้ม)"); };
  const btn = "inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium ring-1";
  return (
    <Card title="เกณฑ์การออกแบบ (Design criteria)" icon={Building2}>
      <div className="grid grid-cols-2 gap-3">
        <Sub>คอนกรีต</Sub>
        <Field label="f'c ทั่วไป" unit="ksc"><NumberInput value={m.fcPrime} step="10" onChange={(v) => setMat("fcPrime", v)} /></Field>
        <Field label="หน่วยแรงยอมให้"><Select value={m.F ?? 0.45} onChange={(v) => setMat("F", Number(v))} options={[[0.45, "fc = 0.45 f'c"], [0.375, "fc = 0.375 f'c"]]} /></Field>
        {fc("fcBeam", "f'c คาน")}{fc("fcCol", "f'c เสา")}{fc("fcSlab", "f'c พื้น / บันได")}{fc("fcFoot", "f'c ฐานราก")}
        <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={m.capFc !== false} onChange={(e) => setMat("capFc", e.target.checked)} />
          จำกัด fc ≤ 65 ksc (กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร)</label>
        <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={m.compatTorsion !== false} onChange={(e) => setMat("compatTorsion", e.target.checked)} />
          แรงบิดจากความต่อเนื่อง (คานซอย/พื้นมาต่อ) ลดได้ถึงแรงบิดที่ทำให้แตกร้าว (ACI 318) — แรงบิดจากพื้นยื่นคิดเต็ม</label>
        <Sub>เหล็กเสริม</Sub>
        {grade("fy", "เหล็กยืน / เหล็กหลัก")}{grade("fys", "เหล็กปลอก")}
        {num("Es", "Es", "ksc", "10000", 2040000)}{num("barClear", "ช่องว่างเหล็กคานขั้นต่ำ", "cm", "0.5", 3.5)}
        <Sub>ระยะคอนกรีตหุ้มเหล็ก</Sub>
        {num("cover", "คาน", "cm", "0.5", 3)}{num("coverCol", "เสา", "cm", "0.5", m.cover ?? 3)}{num("coverPier", "ตอม่อ (ฝังดิน)", "cm", "0.5", m.coverCol ?? m.cover ?? 3)}{num("coverSlab", "พื้น / บันได", "cm", "0.5", 2)}{num("coverFoot", "ฐานราก", "cm", "0.5", 7.5)}
        <Sub>การแอ่นตัวของคาน</Sub>
        <Field label="รวม (3·δD + δL) ≤ L /"><NumberInput value={m.deflTotal ?? 240} step="10" onChange={(v) => setMat("deflTotal", v)} /></Field>
        <Field label="น้ำหนักจร δL ≤ L /"><NumberInput value={m.deflLive ?? 360} step="10" onChange={(v) => setMat("deflLive", v)} /></Field>
        <Sub>ดินและฐานราก</Sub>
        <Field label="qa ดิน (ฐานแผ่)" unit="t/m²"><NumberInput value={(frame.soil?.qa ?? 10000) / 1000} step="0.5" onChange={(v) => set("soil", { ...frame.soil, qa: Math.round(v * 1000) })} /></Field>
        <Field label="ใช้กำลังรับไม่เกิน" unit="%"><NumberInput value={Math.round((frame.footUtil ?? 1) * 100)} step="5" onChange={(v) => set("footUtil", Math.min(100, Math.max(50, v)) / 100)} /></Field>
        <Field label="ฐานเสา"><Select value={frame.baseFixity ?? "pinned"} onChange={(v) => set("baseFixity", v)} options={[["pinned", "หมุด (เข็ม 1–2 ต้น)"], ["fixed", "ยึดแน่น (ฐานแผ่ / เข็มกลุ่ม)"]]} /></Field>
        <Field label="น้ำหนักดินถม" unit="kg/m³"><NumberInput value={frame.soil?.gamma ?? 1800} step="100" onChange={(v) => set("soil", { ...frame.soil, gamma: v })} /></Field>
        <Sub>วิธีวิเคราะห์</Sub>
        <Field label="แรงออกแบบคาน"><Select value={frame.analysis ?? "envelope"} onChange={(v) => set("analysis", v)} options={[["envelope", "มากสุดของคานต่อเนื่อง / โครง 3 มิติ"], ["continuous", "คานต่อเนื่อง"]]} /></Field>
        <Field label="แรงออกแบบเสา"><Select value={frame.colMethod ?? "axial"} onChange={(v) => set("colMethod", v)} options={[["axial", "แรงอัด + เยื้องศูนย์ขั้นต่ำ"], ["frame", "รวมโมเมนต์โครง 3 มิติ"]]} /></Field>
        <Field label="แรงเฉือนออกแบบคาน"><Select value={m.shearAt ?? "d"} onChange={(v) => setMat("shearAt", v)} options={[["d", "ที่ระยะ d จากเสา (ACI / ว.ส.ท.)"], ["max", "ค่าสูงสุดของช่วง (เหมือน Excel)"]]} /></Field>
        <Field label="หัวเสาที่ไม่มีคานยึด"><Select value={frame.freeTop ?? "braced"} onChange={(v) => set("freeTop", v)} options={[["braced", "ยึดด้วยโครงหลังคา k = 1"], ["cantilever", "เสายื่น k = 2 (ไม่มีอะไรยึดหัวเสา)"]]} /></Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2 border-t border-gray-100 pt-3">
        <button onClick={save} className={`${btn} bg-brand-500 text-[#fff] ring-brand-500`}><Save className="h-3.5 w-3.5" />บันทึกเป็นค่ามาตรฐานของฉัน</button>
        <button onClick={use} disabled={!std} className={`${btn} text-brand-600 ring-brand-300 disabled:opacity-40`}><Download className="h-3.5 w-3.5" />ใช้ค่ามาตรฐานของฉัน</button>
        <button onClick={reset} className={`${btn} text-gray-600 ring-gray-300`}><RotateCcw className="h-3.5 w-3.5" />ค่าเริ่มต้นโปรแกรม</button>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">ค่ามาตรฐานเก็บ: วัสดุ ระยะหุ้ม เกณฑ์แอ่นตัว ดิน/ฐานราก วิธีวิเคราะห์ ชนิดผนัง type คาน / เสา / ฐานราก และน้ำหนักปลอดภัยเสาเข็ม · ช่อง f'c ที่ว่าง = ใช้ f'c ทั่วไป{std ? "" : " · ยังไม่มีค่ามาตรฐานที่บันทึกไว้"}</p>
    </Card>
  );
}
