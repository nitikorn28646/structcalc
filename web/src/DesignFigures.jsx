// Section drawings under the step-7 type tables (same details as the report): beam types at the support and mid-span, column
// types per level — construction-drawing style (Details.jsx) with a 3D cage on demand (one at a time: WebGL contexts are limited).
import { useState } from "react";
import { BeamDetail, ColumnDetail } from "./Details.jsx";
import BeamCage3D from "./BeamCage3D.jsx";
import { ColumnCage3D } from "./Cage3D.jsx";
import { barLayers, parseBars, stLabel } from "../engine/floor.js";
import { fmt } from "./beamModel.js";

const card = "rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200", cap = "mt-1 text-center text-[11px] text-[#667085]";
const btn = (on) => `rounded-md px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-gray-600 ring-gray-300 hover:bg-gray-50"}`;
export const beamLayersOf = (t, mat) => { const L = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x));
  return { mid: { top: L(t.top), bottom: L(t.bot, t.botX) }, sup: { top: L(t.top, t.topX), bottom: L(t.bot) } }; };

export function BeamTypeFigures({ types, mat, count = () => null }) {
  const [cage, setCage] = useState(null);
  return (
    <div className="mt-4"><p className="mb-1 text-sm font-semibold text-gray-800">รูปตัดเหล็กเสริม type คาน (หัวเสา · กลางคาน)</p>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{types.map((t, i) => { const L = beamLayersOf(t, mat); return (
        <div key={i} className={card}>
          <div className="mb-1 flex items-center justify-between"><b className="text-[12px] text-[#344054]">{t.name} {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม.{count(i) !== null ? <span className="font-normal text-gray-500"> · ใช้ {count(i)} ช่วง</span> : null}</b>
            <button onClick={() => setCage(cage === i ? null : i)} className={btn(cage === i)}>3D</button></div>
          {cage === i ? <BeamCage3D b={t.b} h={t.h} L={3} cover={mat.cover ?? 3} stirrupBar={t.st} type="both_ends" mid={L.mid} sup={L.sup} sEnd={t.sSup} sMid={t.sMid} className="h-[230px] overflow-hidden rounded-lg" />
            : <div className="grid grid-cols-2 gap-1">{[["หัวเสา", "sup"], ["กลางคาน", "mid"]].map(([w, at]) => (
              <div key={w}><BeamDetail t={t} mat={mat} at={at} className="mx-auto h-[56mm] w-full" /><p className={cap}>{w} · {stLabel(t)} @{fmt(at === "sup" ? t.sSup : t.sMid, 2)}</p></div>))}</div>}
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
