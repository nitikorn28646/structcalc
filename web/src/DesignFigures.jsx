// Section drawings under the step-7 type tables (same details as the report): beam types at the support and mid-span, column
// types per level — construction-drawing style (Details.jsx) with a 3D cage on demand (one at a time: WebGL contexts are limited).
import { useState } from "react";
import { Columns3, Download, Rows3 } from "lucide-react";
import { Notice, Panel } from "./PanelKit.jsx";
import { BeamDetail, ColumnDetail } from "./Details.jsx";
import BeamCage3D from "./BeamCage3D.jsx";
import { ColumnCage3D } from "./Cage3D.jsx";
import { barLayers, parseBars, stLabel } from "../engine/floor.js";
import { fmt } from "./beamModel.js";
import { extraSpec, fixLoneBars, hasExtras, cantNote } from "../engine/beamDetail.js";
import { beamSheetsDxf, downloadText } from "./beamDetailDxf.js";
import { jointDetailModel } from "../engine/levelDetail.js";
import { widenDetailModel } from "../engine/widenDetail.js";
import { depthDetailModel } from "../engine/levelDetail.js";

const card = "rounded-lg bg-[#fff] p-2 ring-1 ring-gray-200", cap = "mt-1 text-center text-[11px] text-[#667085]";
const btn = (on) => `rounded-md px-2 py-0.5 text-[11px] ring-1 ${on ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-gray-600 ring-gray-300 hover:bg-gray-50"}`;
export const beamLayersOf = (t, mat) => { const L = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x));
  return { mid: { top: L(t.top), bottom: L(t.bot, t.botX) }, sup: { top: L(t.top, t.topX), bottom: L(t.bot) } }; };

export function BeamTypeFigures({ types, mat, spans = [], count = () => null, onTypes = null, project = {}, joints = null, widens = null }) {
  const fixes = types.map((t) => fixLoneBars(t, mat)), nFix = fixes.filter((f) => f?.type).length;
  const fixAll = () => onTypes?.(types.map((t, i) => fixes[i]?.type ?? t));
  const [cage, setCage] = useState(null);
  return (
    <Panel title="รูปตัดเหล็กเสริม type คาน" icon={Rows3} hint="หัวเสา · กลางคาน (type ที่ไม่มีเหล็กเสริมพิเศษ = รูปเดียวตลอดคาน) · DXF: กระดาษ A3 1:25 หน่วยเมตร กรอบแบบ + ตารางชื่อจากข้อมูลโครงการ · type ที่ใช้งานทั้งหมด + GB / GB-A มาตรฐาน (แผ่นแรก)"
      action={<button onClick={() => { const items = types.map((t, i) => ({ t, ext: extraSpec(i, spans), used: count(i) })).filter((x) => x.used !== 0);
        downloadText(beamSheetsDxf(items, mat, project, "แบบขยายคาน", { ...(joints?.rows?.length ? { joints: joints.rows, groups: joints.groups.map((g) => ({ ...g, model: jointDetailModel(g, mat, { sub: `${g.n} จุด · ` }) })) } : {}), ...(joints?.depth?.length ? { depth: joints.depth, depthGroups: joints.dgroups.map((g) => ({ ...g, model: depthDetailModel(g, mat, { sub: `${g.n} จุด · ` }) })) } : {}), ...(widens?.length ? { widens: widens.map((u) => ({ tag: u.wt.name, model: widenDetailModel(u.type, u.wt, mat, { sub: `บนคาน ${u.type?.name} · ${u.n} ส่วน` }) })) } : {}) }).dxf, "แบบขยายคาน.dxf"); }} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-brand-600 ring-1 ring-brand-300 hover:bg-brand-50"><Download className="h-3.5 w-3.5" />ส่งออก DXF แบบขยายคาน</button>}>
      {nFix > 0 && onTypes && <div className="mb-3"><Notice kind="bad" action={<button onClick={fixAll} className="whitespace-nowrap rounded-md bg-[#b42318] px-2 py-0.5 text-[12px] font-medium text-[#fff]">แก้ {nFix} type</button>}>มี {nFix} type ที่ชั้นเหล็กมีเส้นเดียวลอย — เพิ่มเหล็กเสริมให้ชั้นละ ≥ 2 เส้น</Notice></div>}
      <div className="grid gap-3 xl:grid-cols-2">{types.map((t, i) => { const L = beamLayersOf(t, mat), ext = extraSpec(i, spans), secs = [...(ext.spans > 0 || !ext.cant ? (hasExtras(t) ? [["หัวเสา", "sup"], ["กลางคาน", "mid"]] : [["ตลอดคาน", "all"]]) : []), ...(ext.cant > 0 ? [[`${t.name}A ตลอดคาน (คานยื่น ${ext.cant} ตัว) · ${cantNote(ext)}`, "cant"]] : [])]; return (
        <div key={i} className={card}>
          <div className="mb-1 flex items-center justify-between"><b className="text-[12px] text-[#344054]">{t.name} {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม.{count(i) !== null ? <span className="font-normal text-gray-500"> · ใช้ {count(i)} ช่วง</span> : null}</b>
            <span className="flex gap-1">{fixes[i]?.type && onTypes && <button onClick={() => onTypes(types.map((x, j) => (j === i ? fixes[i].type : x)))} className="whitespace-nowrap rounded-md bg-[#b42318] px-2 py-0.5 text-[11px] text-[#fff]" title={`ชั้นที่ 2 ห้ามมีเส้นเดียว: เสริมพิเศษ ${[fixes[i].type.topX !== t.topX && `บน → ${fixes[i].type.topX}`, fixes[i].type.botX !== t.botX && `ล่าง → ${fixes[i].type.botX}`].filter(Boolean).join(" · ")} แล้วตรวจกำลังใหม่`}>แก้ให้ชั้นละ ≥ 2 เส้น</button>}
              {fixes[i] && !fixes[i].type && <span className="text-[11px] text-[#b42318]">{fixes[i].why}</span>}
              <button onClick={() => setCage(cage === i ? null : i)} className={btn(cage === i)}>3D</button></span></div>
          {cage === i ? <BeamCage3D b={t.b} h={t.h} L={3} cover={mat.cover ?? 3} stirrupBar={t.st} type="both_ends" mid={L.mid} sup={L.sup} sEnd={t.sSup} sMid={t.sMid} className="h-[230px] overflow-hidden rounded-lg" />
            : <div className={`grid gap-2 ${secs.length >= 3 ? "sm:grid-cols-3" : secs.length === 2 ? "sm:grid-cols-2" : ""}`}>{secs.map(([w, at]) => (
              <div key={w}><BeamDetail t={t} mat={mat} at={at} ext={ext} className="mx-auto h-[46mm] w-full" /><p className={cap}>{w}</p></div>))}</div>}
        </div>); })}</div>
    </Panel>
  );
}

export function ColumnTypeFigures({ types, mat }) {
  const [cage, setCage] = useState(null);
  return (
    <Panel title="รูปตัดเหล็กเสริม type เสา" icon={Columns3} hint="แต่ละระดับ ล่าง → บน · กด 3D ดูโครงเหล็ก (ทีละรูป)">
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{types.flatMap((t, i) => t.levels.map((lv, j) => { const k = `${i}-${j}`, cover = j === 0 && mat.coverPier > 0 ? mat.coverPier : mat.coverCol ?? mat.cover ?? 3; return (
        <div key={k} className={card}>
          <div className="mb-1 flex items-center justify-between"><b className="text-[12px] text-[#344054]">{t.name} {lv.level}</b><button onClick={() => setCage(cage === k ? null : k)} className={btn(cage === k)}>3D</button></div>
          {cage === k ? <ColumnCage3D lv={lv} cover={cover} className="h-[200px] overflow-hidden rounded-lg" /> : <ColumnDetail lv={lv} cover={cover} className="mx-auto h-[40mm] w-full" />}
          <p className={cap}>{lv.Bx}×{lv.By} · {lv.n}-{lv.mainBar} · {lv.tieBar} @{fmt(lv.s, 2)}</p>
        </div>); }))}</div>
    </Panel>
  );
}
