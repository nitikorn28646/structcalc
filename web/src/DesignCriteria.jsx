// Step 0 "เกณฑ์การออกแบบ" (design criteria) — every value the design uses, in one place, like the criteria sheet of a calculation
// package: materials per member, covers and bar spacing, deflection limits, soil / footing limits, analysis choices; can be saved as
// the engineer's own standard (localStorage structcalc.standard) and is applied to every new project.
import { Building2, Save, RotateCcw, Download } from "lucide-react";
import { CheckRow, List, Note, Panel, Section, SetRow, btnCls, btnGhost, btnMain, ctlCls, ctlNum } from "./PanelKit.jsx";
import { GRADES } from "../engine/tables.js";

const KEY = "structcalc.standard";
// what a standard carries: criteria + the type lists the engineer reuses on every job
const PART = ["mat", "soil", "footUtil", "colMethod", "analysis", "baseFixity", "freeTop", "wallTypes", "beamTypes", "colTypes", "footTypes", "pileLoads", "loadLib"];
export const loadStandard = () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? null; } catch { return null; } };
export const applyStandard = (frame, std = loadStandard()) => (std ? { ...frame, ...Object.fromEntries(PART.filter((k) => std[k] !== undefined).map((k) => [k, std[k]])), mat: { ...frame.mat, ...std.mat } } : frame);

// one look with the other steps (PanelKit): a panel per subject, each value one row (label + hint left, input right)
const N = ({ value, onChange, step, placeholder }) => <input type="number" step={step} value={value ?? ""} placeholder={placeholder}
  onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} className={ctlNum} />;
const S = ({ value, onChange, options }) => <select value={value} onChange={(e) => onChange(e.target.value)} className={ctlCls}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;

export function DesignCriteria({ frame, set, setMat }) {
  const m = frame.mat;
  const num = (k, label, unit, step, def, sub) => <SetRow key={k} label={label} sub={sub} unit={unit}><N value={m[k] ?? def} step={step} onChange={(v) => setMat(k, v)} /></SetRow>;
  const fc = (k, label) => <SetRow key={k} label={label} sub={m[k] ? null : `ว่าง = ใช้ f'c ทั่วไป ${m.fcPrime}`} unit="ksc"><N value={m[k] || ""} step="10" placeholder={`${m.fcPrime}`} onChange={(v) => setMat(k, v || undefined)} /></SetRow>;
  const grade = (k, label) => <SetRow key={k} label={label} unit=""><S value={m[k]} onChange={(v) => setMat(k, Number(v))} options={Object.entries(GRADES)} /></SetRow>;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel title="คอนกรีต" icon={Building2} hint="หน่วยแรงยอมให้ fc = F·f'c · ช่อง f'c ของแต่ละส่วนว่าง = ใช้ f'c ทั่วไป">
        <List>
          <SetRow label="f'c ทั่วไป" unit="ksc"><N value={m.fcPrime} step="10" onChange={(v) => setMat("fcPrime", v)} /></SetRow>
          <SetRow label="หน่วยแรงยอมให้" wide unit=""><S value={m.F ?? 0.45} onChange={(v) => setMat("F", Number(v))} options={[[0.45, "fc = 0.45 f'c"], [0.375, "fc = 0.375 f'c"]]} /></SetRow>
          {fc("fcBeam", "f'c คาน")}{fc("fcCol", "f'c เสา")}{fc("fcSlab", "f'c พื้น / บันได")}{fc("fcFoot", "f'c ฐานราก")}
          <CheckRow checked={m.capFc !== false} onChange={(v) => setMat("capFc", v)} label="จำกัด fc ≤ 65 ksc" sub="กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร" />
        </List>
      </Panel>
      <Panel title="เหล็กเสริมและระยะหุ้ม" icon={Building2}>
        <Section title="เหล็กเสริม"><List>
          {grade("fy", "เหล็กยืน / เหล็กหลัก")}{grade("fys", "เหล็กปลอก")}
          {num("Es", "Es", "ksc", "10000", 2040000)}
          {num("barClear", "ช่องว่างเหล็กคานขั้นต่ำ", "cm", "0.5", 3.5, "ใช้ค่ามากกว่าระหว่างค่านี้กับขนาดเหล็ก")}
        </List></Section>
        <Section title="ระยะคอนกรีตหุ้มเหล็ก"><List>
          {num("cover", "คาน", "cm", "0.5", 3)}{num("coverCol", "เสา", "cm", "0.5", m.cover ?? 3)}{num("coverPier", "ตอม่อ (ฝังดิน)", "cm", "0.5", m.coverCol ?? m.cover ?? 3)}
          {num("coverSlab", "พื้น / บันได", "cm", "0.5", 2)}{num("coverFoot", "ฐานราก", "cm", "0.5", 7.5)}
        </List></Section>
      </Panel>
      <Panel title="การตรวจคาน" icon={Building2}>
        <List>
          <SetRow label="ระยะแอ่นรวม" sub="3·δD + δL ≤ L / ค่านี้" unit=""><N value={m.deflTotal ?? 240} step="10" onChange={(v) => setMat("deflTotal", v)} /></SetRow>
          <SetRow label="ระยะแอ่นจากน้ำหนักจร" sub="δL ≤ L / ค่านี้" unit=""><N value={m.deflLive ?? 360} step="10" onChange={(v) => setMat("deflLive", v)} /></SetRow>
          <SetRow label="แรงเฉือนออกแบบ" wide unit=""><S value={m.shearAt ?? "d"} onChange={(v) => setMat("shearAt", v)} options={[["d", "ที่ระยะ d จากเสา (ACI / ว.ส.ท.)"], ["max", "ค่าสูงสุดของช่วง (เหมือน Excel)"]]} /></SetRow>
          <CheckRow checked={m.compatTorsion !== false} onChange={(v) => setMat("compatTorsion", v)} label="ลดแรงบิดจากความต่อเนื่อง (ACI 318)"
            sub="คานซอย / พื้นมาต่อ ลดได้ถึงแรงบิดที่ทำให้แตกร้าว · แรงบิดจากพื้นยื่นคิดเต็ม" />
          <CheckRow checked={!!m.stirrupExempt} onChange={(v) => setMat("stirrupExempt", v)} label="ยกเว้นเหล็กปลอกขั้นต่ำ (ACI 318)"
            sub="คานตื้น h ≤ 25 ซม. หรือ V ≤ Vc/2 ที่ไม่มีแรงบิด — ไม่ตรวจระยะปลอก ≤ d/2 (ยังใส่ปลอกตาม type)" />
        </List>
      </Panel>
      <Panel title="ดินและฐานราก" icon={Building2}>
        <List>
          <SetRow label="qa ดิน (ฐานแผ่)" unit="t/m²"><N value={(frame.soil?.qa ?? 10000) / 1000} step="0.5" onChange={(v) => set("soil", { ...frame.soil, qa: Math.round(v * 1000) })} /></SetRow>
          <SetRow label="น้ำหนักดินถม" unit="kg/m³"><N value={frame.soil?.gamma ?? 1800} step="100" onChange={(v) => set("soil", { ...frame.soil, gamma: v })} /></SetRow>
          <SetRow label="ใช้กำลังรับไม่เกิน" sub="หน่วยแรงดิน / น้ำหนักเข็ม เทียบค่ายอมให้" unit="%"><N value={Math.round((frame.footUtil ?? 1) * 100)} step="5" onChange={(v) => set("footUtil", Math.min(100, Math.max(50, v)) / 100)} /></SetRow>
          <SetRow label="ฐานเสา" wide unit=""><S value={frame.baseFixity ?? "pinned"} onChange={(v) => set("baseFixity", v)} options={[["pinned", "หมุด (เข็ม 1–2 ต้น)"], ["fixed", "ยึดแน่น (ฐานแผ่ / เข็มกลุ่ม)"]]} /></SetRow>
        </List>
      </Panel>
      <Panel title="วิธีวิเคราะห์" icon={Building2} hint="เปลี่ยนได้อีกที่ขั้น 6 วิเคราะห์">
        <List>
          <SetRow label="แรงออกแบบคาน" wide unit=""><S value={frame.analysis ?? "envelope"} onChange={(v) => set("analysis", v)} options={[["envelope", "มากสุดของคานต่อเนื่อง / โครง 3 มิติ"], ["continuous", "คานต่อเนื่อง"]]} /></SetRow>
          <SetRow label="แรงออกแบบเสา" wide unit=""><S value={frame.colMethod ?? "axial"} onChange={(v) => set("colMethod", v)} options={[["axial", "แรงอัด + เยื้องศูนย์ขั้นต่ำ"], ["frame", "รวมโมเมนต์โครง 3 มิติ"]]} /></SetRow>
          <SetRow label="หัวเสาที่ไม่มีคานยึด" wide unit=""><S value={frame.freeTop ?? "braced"} onChange={(v) => set("freeTop", v)} options={[["braced", "ยึดด้วยโครงหลังคา k = 1"], ["cantilever", "เสายื่น k = 2 (ไม่มีอะไรยึดหัวเสา)"]]} /></SetRow>
        </List>
      </Panel>
    </div>
  );
}

// the engineer's own standard: save / use / back to the program defaults
export function StandardPanel({ frame, set, defaults, onNotice }) {
  const std = loadStandard();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(PART.map((k) => [k, frame[k]])))); onNotice?.("บันทึกเป็นค่ามาตรฐานของคุณแล้ว — โครงการใหม่จะเริ่มด้วยค่าชุดนี้"); } catch { onNotice?.("บันทึกไม่ได้ (เบราว์เซอร์ไม่อนุญาตที่เก็บข้อมูล)"); } };
  const use = () => { if (!std) return; for (const k of PART) if (std[k] !== undefined) set(k, k === "mat" ? { ...frame.mat, ...std.mat } : std[k]); onNotice?.("ใช้ค่ามาตรฐานของคุณกับโครงการนี้แล้ว"); };
  const reset = () => { set("mat", { ...defaults.mat }); onNotice?.("กลับเป็นค่าเริ่มต้นของโปรแกรม (เฉพาะวัสดุและระยะหุ้ม)"); };
  return (
    <Panel title="ค่ามาตรฐานของฉัน" icon={Save} hint="ใช้กับทุกโครงการใหม่โดยอัตโนมัติ">
      <div className="flex flex-col gap-2">
        <button onClick={save} className={`${btnMain} justify-center py-1.5`}><Save className="h-3.5 w-3.5" />บันทึกค่าในหน้านี้เป็นค่ามาตรฐานของฉัน</button>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={use} disabled={!std} className={`${btnCls} justify-center py-1.5`}><Download className="h-3.5 w-3.5" />ใช้ค่ามาตรฐานของฉัน</button>
          <button onClick={reset} className={`${btnGhost} py-1.5`}><RotateCcw className="h-3.5 w-3.5" />ค่าเริ่มต้นโปรแกรม</button>
        </div>
      </div>
      <Note>เก็บ: วัสดุ ระยะหุ้ม เกณฑ์แอ่นตัว ดิน/ฐานราก วิธีวิเคราะห์ ชนิดผนัง type คาน / เสา / ฐานราก น้ำหนักปลอดภัยเสาเข็ม และคลังน้ำหนัก{std ? "" : " · ยังไม่มีค่ามาตรฐานที่บันทึกไว้"}</Note>
    </Panel>
  );
}
