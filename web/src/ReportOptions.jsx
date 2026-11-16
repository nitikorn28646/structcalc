// Step 9 panel "เนื้อหารายการคำนวณ" (user 2026-11-16): presets, a tick tree of chapters / parts, and — for every check that does not pass —
// the engineer's decision (print as ไม่ผ่าน / accepted by the engineer with a reason / leave out of the summary). Printing choices only:
// the numbers come from the same analysis as the screen and never change here.
import { useMemo, useState } from "react";
import { REPORT_PRESETS, REPORT_TREE, reportOpt, reportPresetName } from "./reportOptions.js";
import { projectStatus } from "./StatusSummary.jsx";
import { runRoof, useSkeleton } from "./RoofPage.jsx";

const MODES = [["show", "พิมพ์ว่า ไม่ผ่าน"], ["accept", "วิศวกรยอมรับ (ระบุเหตุผล)"], ["hide", "ไม่ระบุในบทสรุป"]];

export default function ReportOptions({ frame, roof, res, report, onChange }) {
  const r = report ?? {}, o = reportOpt(r), [open, setOpen] = useState(true);
  const hasRoof = (roof?.pts?.length ?? 0) >= 3, sk = useSkeleton();
  const [st, roofGroups] = useMemo(() => { try { const rr = hasRoof && sk ? runRoof(roof, sk) : null;
    return [projectStatus(frame, res, rr?.dz ?? null, hasRoof ? roof : null), [...new Set((rr?.dz?.rows ?? []).map((x) => x.label))]]; } catch { return [null, []]; } }, [frame, roof, res, sk, hasRoof]);
  const marks = r.marks ?? {}, markOn = (k) => marks[k] !== false, setMark = (k, v) => { const m = { ...marks, [k]: v }; if (v) delete m[k]; onChange({ ...r, marks: m }); };
  const markKeys = [...["คาน", "เสา", "พื้น", "ฐานราก", "แรงด้านข้าง"].map((c) => [c, c]), ...roofGroups.map((g) => [`หลังคา|${g}`, `หลังคา: ${g}`])];
  const fails = st?.fails ?? [], dec = r.fails ?? {};
  const setSec = (k, v) => { const base = REPORT_PRESETS[r.preset ?? "full"]?.sec ?? {}; onChange({ ...r, preset: "custom", sec: { ...base, ...(r.sec ?? {}), [k]: v } }); };
  const setPreset = (p) => onChange({ ...r, preset: p, sec: {} });
  const setDec = (key, patch) => { const d = { ...(dec[key] ?? { mode: "show" }), ...patch }, all = { ...dec, [key]: d }; if (d.mode === "show" && !d.note) delete all[key]; onChange({ ...r, fails: all }); };
  const nHide = fails.filter((x) => dec[x.key]?.mode === "hide").length, nAcc = fails.filter((x) => dec[x.key]?.mode === "accept").length;
  const sheetOff = fails.length > 0 && (!o("status") || !o("status.fails"));
  const box = "h-7 rounded border border-gray-300 bg-white px-1 text-[12px]";
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-3 text-[13px]">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-gray-800">เนื้อหารายการคำนวณ</b><span className="text-gray-500">— ฉบับ: {reportPresetName(r)}</span>
        {Object.entries(REPORT_PRESETS).map(([k, p]) => <button key={k} onClick={() => setPreset(k)} className={`rounded-md px-2 py-1 text-[12px] ring-1 ${(r.preset ?? "full") === k ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-brand-600 ring-brand-300 hover:bg-brand-50"}`}>{p.name}</button>)}
        <button onClick={() => setOpen(!open)} className="ml-auto text-[12px] text-gray-500">{open ? "ซ่อนรายละเอียด ▴" : "เลือกทีละส่วน ▾"}</button>
      </div>
      <p className="mt-1 text-[11px] text-gray-500">เลือกได้แค่ว่าจะ "พิมพ์" ส่วนใด — ตัวเลขทุกตัวมาจากผลวิเคราะห์ชุดเดียวกับหน้าจอ ไม่มีการคำนวณใหม่หรือปรับค่า · เลขบท สารบัญ และเลขหน้าเรียงใหม่อัตโนมัติ · ฉบับยื่นขออนุญาต = แผ่นคำนวณเฉพาะชิ้นวิกฤตต่อ type (ไม่มีภาคผนวกทุกช่วง)</p>
      {open && <div className="mt-2 grid gap-x-6 gap-y-1 md:grid-cols-2 xl:grid-cols-3">
        {REPORT_TREE.map(([k, label, subs]) => (
          <div key={k} className="py-0.5">
            <label className="flex items-center gap-1.5 font-medium text-gray-800"><input type="checkbox" checked={o(k)} onChange={(e) => setSec(k, e.target.checked)} />{label}</label>
            {subs.length > 0 && <div className="ml-5">{subs.map(([s, l]) => (
              <label key={s} className={`flex items-center gap-1.5 text-[12px] ${o(k) ? "text-gray-600" : "text-gray-300"}`}><input type="checkbox" disabled={!o(k)} checked={o(s)} onChange={(e) => setSec(s, e.target.checked)} />{l}</label>))}</div>}
          </div>))}
      </div>}
      {open && <div className="mt-3 rounded-lg border border-gray-200 p-2">
        <p className="font-medium text-gray-800">แสดงคำว่า "ผ่าน / ไม่ผ่าน" ในคอลัมน์ผลของตาราง <span className="text-[11px] font-normal text-gray-500">— เอาติ๊กออก = คอลัมน์ผลของกลุ่มนั้นแสดง "-" (ตัวเลขในตารางเหมือนเดิม · บทสรุปผลใช้การตัดสินใจด้านล่าง)</span></p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">{markKeys.map(([k, l]) => <label key={k} className="flex items-center gap-1.5 text-[12px] text-gray-700"><input type="checkbox" checked={markOn(k)} onChange={(e) => setMark(k, e.target.checked)} />{l}</label>)}
          <button onClick={() => onChange({ ...r, marks: Object.fromEntries(markKeys.map(([k]) => [k, false])) })} className="text-[12px] text-brand-600">ซ่อนทั้งหมด</button>
          <button onClick={() => onChange({ ...r, marks: {} })} className="text-[12px] text-brand-600">แสดงทั้งหมด</button></div>
      </div>}
      {/* failing checks: the engineer is told first, then decides (and carries the responsibility) */}
      {fails.length > 0 && <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50 p-2">
        <p className="font-semibold text-amber-800">⚠ มี {fails.length} รายการที่ไม่ผ่านเกณฑ์ — วิศวกรเลือกวิธีระบุในรายการคำนวณได้ทีละรายการ</p>
        <p className="text-[11px] text-amber-800">เช่น ระยะแอ่นอะเสเกินเล็กน้อยแต่วิศวกรพิจารณาว่าใช้ได้ → "วิศวกรยอมรับ" พร้อมเหตุผล (พิมพ์ในบทสรุปเป็นรายการแยก) · ค่าคำนวณไม่เปลี่ยน ตารางและแผ่นคำนวณของชิ้นนั้นยังแสดงผลจริง · การยอมรับหรือไม่ระบุเป็นความรับผิดชอบของวิศวกรผู้คำนวณ</p>
        <div className="mt-1 max-h-72 overflow-y-auto"><table className="w-full text-[12px]"><thead><tr className="text-left text-gray-500"><th className="py-1 pr-2">หมวด</th><th className="pr-2">ชิ้นส่วน</th><th className="pr-2">สาเหตุ</th><th className="pr-2">ใช้</th><th className="pr-2">ในรายการคำนวณ</th><th>เหตุผลของวิศวกร</th></tr></thead>
          <tbody>{fails.map((x) => { const d = dec[x.key] ?? { mode: "show" }; return (
            <tr key={x.key} className="border-t border-amber-200 align-top">
              <td className="py-1 pr-2">{x.cat}</td><td className="pr-2">{x.id}</td><td className="pr-2 text-gray-600">{x.why}</td>
              <td className="pr-2 tabular-nums">{x.util != null && x.util < 8.99 ? `${Math.round(x.util * 100)}%` : "-"}</td>
              <td className="pr-2"><select value={d.mode} onChange={(e) => setDec(x.key, { mode: e.target.value })} className={box}>{MODES.map(([m, l]) => <option key={m} value={m}>{l}</option>)}</select></td>
              <td>{d.mode === "accept" ? <input value={d.note ?? ""} onChange={(e) => setDec(x.key, { note: e.target.value })} placeholder="เช่น ระยะแอ่นไม่กระทบความปลอดภัย / ค้ำยันเพิ่มหน้างาน" className={`${box} w-full min-w-[220px]`} /> : null}</td>
            </tr>); })}</tbody></table></div>
        {(nHide > 0 || nAcc > 0 || sheetOff) && <p className="mt-1 text-[12px] font-medium text-red-700">
          {nAcc > 0 && `วิศวกรยอมรับ ${nAcc} รายการ (พิมพ์ในบทสรุปพร้อมเหตุผล) · `}{nHide > 0 && `ไม่ระบุในบทสรุป ${nHide} รายการ — ผลรวมของบทสรุปจะไม่นับรายการเหล่านี้ · `}
          {sheetOff && "ปิดบทสรุป / รายการที่ไม่ผ่านไว้ — รายการที่ไม่ผ่านจะไม่ปรากฏในบทสรุปของเล่มนี้"}</p>}
      </div>}
      {st && !fails.length && <p className="mt-2 text-[12px] text-green-700">✓ ทุกรายการที่ตรวจผ่านเกณฑ์</p>}
    </div>
  );
}
