// Section drawings under the step-7 type tables (same details as the report): beam types at the support and mid-span, column
// types per level — construction-drawing style (Details.jsx) with a 3D cage on demand (one at a time: WebGL contexts are limited).
import { useState } from "react";
import { BeamDetail, ColumnDetail } from "./Details.jsx";
import BeamCage3D from "./BeamCage3D.jsx";
import { ColumnCage3D } from "./Cage3D.jsx";
import { barLayers, parseBars, stLabel } from "../engine/floor.js";
import { fmt } from "./beamModel.js";
import { extraSpec, fixLoneBars } from "../engine/beamDetail.js";
import { beamDetailsDxf, downloadText } from "./beamDetailDxf.js";

const card = "rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200", cap = "mt-1 text-center text-[11px] text-[#667085]";
const btn = (on) => `rounded-md px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-gray-600 ring-gray-300 hover:bg-gray-50"}`;
export const beamLayersOf = (t, mat) => { const L = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x));
  return { mid: { top: L(t.top), bottom: L(t.bot, t.botX) }, sup: { top: L(t.top, t.topX), bottom: L(t.bot) } }; };

export function BeamTypeFigures({ types, mat, spans = [], count = () => null, onTypes = null }) {
  const fixes = types.map((t) => fixLoneBars(t, mat)), nFix = fixes.filter((f) => f?.type).length;
  const fixAll = () => onTypes?.(types.map((t, i) => fixes[i]?.type ?? t));
  const [cage, setCage] = useState(null);
  return (
    <div className="mt-4"><div className="mb-1 flex flex-wrap items-center gap-2"><p className="text-sm font-semibold text-gray-800">รูปตัดเหล็กเสริม type คาน (หัวเสา · กลางคาน)</p>
      <button onClick={() => { const items = types.map((t, i) => ({ t, ext: extraSpec(i, spans), used: count(i) })).filter((x) => x.used !== 0);
        downloadText(beamDetailsDxf(items, mat, "แบบขยายคาน"), "แบบขยายคาน.dxf"); }} className={btn(false)}>ส่งออก DXF แบบขยายคาน</button>
      <span className="text-[11px] text-gray-500">หน่วยเมตร · type ที่ใช้งานทั้งหมด · ความยาวเสริมพิเศษตามผลตรวจระยะตัดเหล็ก</span>
      {nFix > 0 && onTypes && <button onClick={fixAll} className="rounded-md bg-[#b42318] px-2 py-0.5 text-[11px] font-medium text-[#fff]">แก้ {nFix} type ที่มีเหล็กเส้นเดียวลอย (เพิ่มเหล็กเสริมให้ชั้นละ ≥ 2 เส้น)</button>}</div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{types.map((t, i) => { const L = beamLayersOf(t, mat); return (
        <div key={i} className={card}>
          <div className="mb-1 flex items-center justify-between"><b className="text-[12px] text-[#344054]">{t.name} {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม.{count(i) !== null ? <span className="font-normal text-gray-500"> · ใช้ {count(i)} ช่วง</span> : null}</b>
            <span className="flex gap-1">{fixes[i]?.type && onTypes && <button onClick={() => onTypes(types.map((x, j) => (j === i ? fixes[i].type : x)))} className="whitespace-nowrap rounded-md bg-[#b42318] px-2 py-0.5 text-[11px] text-[#fff]" title={`ชั้นที่ 2 ห้ามมีเส้นเดียว: เสริมพิเศษ ${[fixes[i].type.topX !== t.topX && `บน → ${fixes[i].type.topX}`, fixes[i].type.botX !== t.botX && `ล่าง → ${fixes[i].type.botX}`].filter(Boolean).join(" · ")} แล้วตรวจกำลังใหม่`}>แก้ให้ชั้นละ ≥ 2 เส้น</button>}
              {fixes[i] && !fixes[i].type && <span className="text-[11px] text-[#b42318]">{fixes[i].why}</span>}
              <button onClick={() => setCage(cage === i ? null : i)} className={btn(cage === i)}>3D</button></span></div>
          {cage === i ? <BeamCage3D b={t.b} h={t.h} L={3} cover={mat.cover ?? 3} stirrupBar={t.st} type="both_ends" mid={L.mid} sup={L.sup} sEnd={t.sSup} sMid={t.sMid} className="h-[230px] overflow-hidden rounded-lg" />
            : <div className="grid grid-cols-1 gap-1">{[["หัวเสา", "sup"], ["กลางคาน", "mid"], ...(extraSpec(i, spans).cant > 0 ? [[`คานยื่น ${t.name}A · โคนคานยื่น (${extraSpec(i, spans).cant} ตัว)`, "cant"]] : [])].map(([w, at]) => (
              <div key={w}><BeamDetail t={t} mat={mat} at={at} ext={extraSpec(i, spans)} className="mx-auto h-[46mm] w-full" /><p className={cap}>{w} · {stLabel(t)} @{fmt(at === "mid" ? t.sMid : t.sSup, 2)}</p></div>))}</div>}
        </div>); })}</div>
    </div>
  );
}

export function ColumnTypeFigures({ types, mat }) {
  const [cage, setCage] = useState(null);
  return (
    <div className="mt-4"><p className="mb-1 text-sm font-semibold text-gray-800">รูปตัดเหล็กเสริม type เสา (แต่ละระดับ)</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{types.flatMap((t, i) => t.levels.map((lv, j) => { const k = `${i}-${j}`, cover = j === 0 && mat.coverPier > 0 ? mat.coverPier : mat.coverCol ?? mat.cover ?? 3; return (
        <div key={k} className={card}>
          <div className="mb-1 flex items-center justify-between"><b className="text-[12px] text-[#344054]">{t.name} {lv.level}</b><button onClick={() => setCage(cage === k ? null : k)} className={btn(cage === k)}>3D</button></div>
          {cage === k ? <ColumnCage3D lv={lv} cover={cover} className="h-[200px] overflow-hidden rounded-lg" /> : <ColumnDetail lv={lv} cover={cover} className="mx-auto h-[40mm] w-full" />}
          <p className={cap}>{lv.Bx}×{lv.By} · {lv.n}-{lv.mainBar} · {lv.tieBar} @{fmt(lv.s, 2)}</p>
        </div>); }))}</div>
    </div>
  );
}
