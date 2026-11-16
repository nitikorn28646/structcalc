// New-project wizard (plan A4, user 2026-11-16): five questions on one card → a starting model the engineer edits (src/starter.js).
import { useState } from "react";
import { STARTER_DEFAULT, parseSpans } from "./starter.js";

const Q = ({ n, title, children }) => (
  <div className="rounded-lg border border-gray-200 p-3">
    <p className="mb-2 text-[13px] font-semibold text-gray-800"><span className="mr-1.5 inline-grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-[11px] text-[#fff]">{n}</span>{title}</p>
    <div className="flex flex-wrap items-end gap-3 text-[13px]">{children}</div>
  </div>
);
const F = ({ label, children }) => <label className="flex flex-col gap-0.5 text-[12px] text-gray-600">{label}{children}</label>;
const box = "h-8 rounded-md border border-gray-300 bg-white px-2 text-[13px] text-gray-800";

export default function NewProjectWizard({ onBuild, onSkip }) {
  const [o, setO] = useState(STARTER_DEFAULT), [err, setErr] = useState(null), set = (k, v) => setO((x) => ({ ...x, [k]: v }));
  const nx = parseSpans(o.dx), ny = parseSpans(o.dy), W = nx.reduce((a, b) => a + b, 0), D = ny.reduce((a, b) => a + b, 0);
  const go = () => { const e = onBuild(o); if (e) setErr(e); };
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl">
        <h2 className="text-lg font-semibold text-gray-900">เริ่มโครงการใหม่ — ตอบ 5 ข้อ แล้วโปรแกรมวางโครงตั้งต้นให้</h2>
        <p className="mb-3 text-[12px] text-gray-500">สร้างกริด ระดับชั้น เสาทุกจุดตัดกริด คานทุกเส้นกริด ชนิดพื้น และหลังคา — แก้ทุกอย่างต่อได้ในขั้นถัดไป (ลบเสา/คานที่ไม่มี เพิ่มคานซอย พื้นยื่น ผนัง)</p>
        <div className="space-y-2.5">
          <Q n={1} title="โครงการและจำนวนชั้น">
            <F label="ชื่อโครงการ"><input value={o.name} onChange={(e) => set("name", e.target.value)} placeholder="เช่น บ้านพักอาศัย 2 ชั้น" className={`${box} w-64`} /></F>
            <F label="จำนวนชั้น"><select value={o.storeys} onChange={(e) => set("storeys", Number(e.target.value))} className={box}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n} ชั้น</option>)}</select></F>
          </Q>
          <Q n={2} title="ความสูง">
            <F label="ความสูงชั้น (ม.) พื้นถึงพื้น"><input type="number" step="0.1" value={o.h} onChange={(e) => set("h", Number(e.target.value))} className={`${box} w-24`} /></F>
            <F label="ฐานราก → คานคอดิน (ม.)"><input type="number" step="0.1" value={o.gbH} onChange={(e) => set("gbH", Number(e.target.value))} className={`${box} w-24`} /></F>
            <span className="pb-1.5 text-[12px] text-gray-500">ระดับ: คานคอดิน{Array.from({ length: o.storeys - 1 }, (_, i) => ` · ชั้น ${i + 2}`).join("")} · คานหลังคา</span>
          </Q>
          <Q n={3} title="ระยะกริด (ม.) — ใส่ทีละช่วงคั่นด้วยจุลภาค">
            <F label="แกน X (ซ้าย → ขวา)"><input value={o.dx} onChange={(e) => set("dx", e.target.value)} placeholder="4, 4, 3.5" className={`${box} w-48`} /></F>
            <F label="แกน Y (ล่าง → บน)"><input value={o.dy} onChange={(e) => set("dy", e.target.value)} placeholder="3.5, 4" className={`${box} w-48`} /></F>
            <span className="pb-1.5 text-[12px] text-gray-500">{nx.length && ny.length ? `อาคาร ${W.toFixed(2)} × ${D.toFixed(2)} ม. · เสา ${(nx.length + 1) * (ny.length + 1)} ต้น/ชั้น` : "ใส่ตัวเลขอย่างน้อย 1 ช่วง"}</span>
          </Q>
          <Q n={4} title="พื้น">
            <F label="พื้นชั้นบน"><select value={o.slab} onChange={(e) => set("slab", e.target.value)} className={box}><option value="S">หล่อในที่ (S)</option><option value="PS">พื้นสำเร็จรูป (PS)</option></select></F>
            <F label="หนา (ม.)"><input type="number" step="0.01" value={o.t} onChange={(e) => set("t", Number(e.target.value))} className={`${box} w-20`} /></F>
            <F label="พื้นชั้นล่าง"><select value={o.ground} onChange={(e) => set("ground", e.target.value)} className={box}><option value="GS">วางบนดิน (GS)</option><option value="S">หล่อในที่วางบนคาน (S)</option><option value="PS">สำเร็จรูปวางบนคาน (PS)</option></select></F>
          </Q>
          <Q n={5} title="หลังคา">
            <F label="รูปทรง"><select value={o.roof} onChange={(e) => set("roof", e.target.value)} className={box}><option value="hip">ปั้นหยา</option><option value="gable">จั่ว (หน้าจั่วด้านสั้น)</option><option value="none">ไม่มี / ทำทีหลัง</option></select></F>
            {o.roof !== "none" && <><F label="ความชัน (องศา)"><input type="number" step="1" value={o.slope} onChange={(e) => set("slope", Number(e.target.value))} className={`${box} w-20`} /></F>
              <F label="ชายคายื่น (ม.)"><input type="number" step="0.1" value={o.overhang} onChange={(e) => set("overhang", Number(e.target.value))} className={`${box} w-20`} /></F></>}
          </Q>
        </div>
        {err && <p className="mt-2 text-[13px] text-red-600">{err}</p>}
        <div className="mt-4 flex items-center gap-2">
          <button onClick={go} className="rounded-lg bg-brand-500 px-4 py-2 text-[13px] font-medium text-[#fff] hover:bg-brand-600">สร้างโครงตั้งต้น</button>
          <button onClick={onSkip} className="rounded-lg px-3 py-2 text-[13px] text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50">ข้าม — เริ่มจากกระดานว่าง</button>
          <span className="ml-auto text-[11px] text-gray-400">น้ำหนักปูพื้น 100 / จร 200 กก./ม.² (แก้ในขั้น 5) · วัสดุตามค่ามาตรฐานของคุณ (ขั้น 0)</span>
        </div>
      </div>
    </div>
  );
}
