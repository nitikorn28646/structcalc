// Beam & column framing (P1: one floor): draw columns / beams on a grid, slab panels and loads, continuous beams, beam types.
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnChart, LineDiagram, SlabStrip } from "./ReportDiagrams.jsx";
import { StoreyTable, elevations } from "./StoreyTable.jsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tip } from "@/components/ui/tooltip";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { StairDetail, StairInputs, stairRiseOf } from "./StairPanel.jsx";
import { allStairSections, stairSections } from "./stairSection.js";
import { stairSheetsDxf, downloadText } from "./beamDetailDxf.js";
import { DesignCriteria, StandardPanel } from "./DesignCriteria.jsx";
import { BeamLoadTable, PanelTable } from "./BulkTables.jsx";
import { arcGeom, quarterSagitta } from "../engine/arc.js";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { BrickWall, Building2, Columns3, Grid3x3, Layers, Plus, Ruler, Table2, Trash2, TriangleAlert, Wand2 } from "lucide-react";
import { Card, Field, NumberInput, Select } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import { beamCost, generateBeamTypes, pruneUnusedTypes } from "../engine/beamTypes.js";
import { assignBeams, beamCounts, beamMode, deleteBeamType, finalizeGenerated, lockBeams, nextTypeName, renumberTypes, unlockBeams } from "../engine/beamAssign.js";
import { generateColumnTypes } from "../engine/columnTypes.js";
import { findOverlaps, mergeOverlaps } from "../engine/floor.js";
import { locateWarning } from "./warnLocate.js";
import { SlabSection, slabRebar } from "./SlabDetail.jsx";
import LoadCases from "./LoadCases.jsx";
import { highlight } from "./highlight.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WALL_TYPES, DEFAULT_LOAD_LIB, GROUPS, OPENINGS, SLAB_KINDS, WALL_MATERIALS, wallTypeW, STAIR_KINDS, parseBars, resolveWall, spanReasons, widensOf, stairLoads, wallLoad, wallsOf } from "../engine/floor.js";
import { loadSkeleton, runRoof } from "./RoofPage.jsx";
import { analyzeFrame, checkEnv, stackKey } from "../engine/frame.js";
import { designSlabs } from "../engine/slabDesign.js";
import { frame3dModel } from "../engine/frame3d.js";
import { GRADES, SLAB_BARS } from "../engine/tables.js";
import FloorBoard, { TYPE_COLORS } from "./FloorBoard.jsx";
import ForceCharts from "./ForceCharts.jsx";
import Frame3D from "./Frame3D.jsx";
import { downloadDxf, framePlanModel } from "./drawings.js";
import { LateralChoice, LateralPanel } from "./LateralPanel.jsx";
import { FootingTypes } from "./FootingTypes.jsx";
import { BeamTypeFigures, ColumnTypeFigures } from "./DesignFigures.jsx";
import { LevelJointsCard } from "./LevelJoints.jsx";
import { WidenTypesCard, widenTypesOf, WidenBeamSection, widenUses, widenSections } from "./WidenTypes.jsx";
import { levelJoints, jointGroups, depthGroups } from "../engine/levelDetail.js";
import { RoofLinkCard } from "./RoofLinkCard.jsx";
import WallTypesPanel from "./WallTypesPanel.jsx";
import LoadLibPanel from "./LoadLibPanel.jsx";
import { Badge as KBadge, DelButton, List, Note, Notice, Panel as SidePanel, Result, Row, Section, btnCls, btnGhost, btnMain, smallNum } from "./PanelKit.jsx";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

// example: 2 × 2 bays, columns at every node, beams on the grid lines, walls on the outside beams
// concrete cover per member kind (cm); coverCol falls back to the old single `cover` so saved projects keep their results
const COVERS = [["cover", "คาน", 3], ["coverCol", "เสา", 3], ["coverPier", "ตอม่อ (ฝังดิน)", 0], ["coverSlab", "พื้น / บันได", 2], ["coverFoot", "ฐานราก", 7.5]];
const XS = [0, 4, 8], YS = [0, 3.5, 7.5];
const exBeams = [...YS.flatMap((y) => XS.slice(1).map((x, i) => [[XS[i], y], [x, y]])), ...XS.flatMap((x) => YS.slice(1).map((y, i) => [[x, YS[i]], [x, y]]))]
  .map(([a, b]) => ({ a, b, type: null, wall: { h: (a[0] === b[0] && (a[0] === 0 || a[0] === 8)) || (a[1] === b[1] && (a[1] === 0 || a[1] === 7.5)) ? 2.8 : 0, kind: "brick" } }));
const exFloor = (name, h, t, finish, live, wallH) => ({ name, h, t, finish, live, grid: { x0: 0, y0: 0, dx: [4, 4], dy: [3.5, 4], sub: 2 },
  columns: XS.flatMap((x) => YS.map((y) => [x, y])), beams: exBeams.map(({ wall, ...b }) => b), panels: {}, cants: [],
  walls: wallH ? exBeams.filter((b) => b.wall.h).map((b) => ({ a: b.a, b: b.b, kind: "brick", h: wallH, open: 0, layers: 1 })) : [] });
// floors run bottom up; a floor's columns (height h) stand below its beams; column type level k is used under floor k
// heavier spare types (from the Yasothon job) so that a new project has a passing type for longer spans / tie spacing; the auto
// choice still takes the lightest type that passes, so B1–B6 / C1 are used wherever they are enough
const T = (name, b, h, top, bot, topX, botX, st, sSup, sMid) => ({ name, b, h, top, bot, topX, botX, st, sSup, sMid });
const CT = (level, B, n, bar, s) => ({ level, Bx: B, By: B, n, mainBar: bar, tieBar: "RB 6", s });
const SPARE_BEAM_TYPES = [T("B7", 0.2, 0.5, "3-DB16", "3-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15), T("B8", 0.2, 0.6, "2-DB16", "2-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15),
  T("B9", 0.2, 0.6, "3-DB16", "3-DB16", "3-DB16", "3-DB16", "RB 9", 0.1, 0.15), T("B10", 0.25, 0.7, "3-DB20", "3-DB20", "3-DB20", "3-DB20", "DB 10", 0.1, 0.15)];
const SPARE_COLUMN_TYPES = [{ name: "C2", levels: [CT("ตอม่อ", 30, 8, "DB 12", 0.15), CT("ชั้น 1", 20, 6, "DB 12", 0.15), CT("ชั้น 2", 20, 4, "DB 12", 0.15)] },
  { name: "C3", levels: [CT("ตอม่อ", 30, 8, "DB 20", 0.15), CT("ชั้น 1", 25, 8, "DB 16", 0.15), CT("ชั้น 2", 25, 8, "DB 16", 0.15)] }];
export const DEFAULT_FRAME = {
  frameNo: "F1", mat: { fcPrime: 240, F: 0.45, capFc: true, fy: 4000, fys: 2400, Es: 2040000, cover: 3 }, cur: 1,
  floors: [exFloor("คานคอดิน", 1.5, 0, 0, 0, 2.8), exFloor("ชั้น 2", 3, 0.12, 100, 200, 2.8), exFloor("คานหลังคา", 3, 0, 0, 0, 0)],
  beamTypes: [...DEFAULT_BEAM_TYPES, ...SPARE_BEAM_TYPES], colTypes: [...DEFAULT_COLUMN_TYPES, ...SPARE_COLUMN_TYPES], colPick: {}, wallTypes: DEFAULT_WALL_TYPES,
};

const KIND_TH = { simple: "ช่วงเดียว", one_end: "ช่วงริม", both_ends: "ช่วงใน", cantilever: "ยื่น" };

function UtilBars({ items: raw, dark, height, onPick }) {
  const ref = useRef(null), items = useMemo(() => [...raw].sort((a, b) => b.util - a.util), [raw]), h = Math.max(height, items.length * 18 + 40);
  useEffect(() => {
    const c = dark ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", lim: "#f87171" } : { axis: "#475467", label: "#667085", split: "#eaecf0", lim: "#f04438" };
    const chart = echarts.init(ref.current, null, { renderer: "svg", height: h });
    chart.setOption({
      textStyle: { fontFamily: "Sarabun, Leelawadee UI, sans-serif" },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      grid: { left: 92, right: 16, top: 6, bottom: 24 },
      yAxis: { type: "category", inverse: true, triggerEvent: true, data: items.map((s) => s.label), axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label, fontSize: 11, interval: 0 } },
      xAxis: { type: "value", max: (v) => Math.max(120, Math.ceil(v.max / 20) * 20), axisLabel: { color: c.label, formatter: "{value}%", hideOverlap: true }, splitNumber: 3, splitLine: { lineStyle: { color: c.split } } },
      series: [{ type: "bar", barMaxWidth: 10, data: items.map((s) => ({ value: +(Math.min(s.util, 3) * 100).toFixed(0), itemStyle: { color: s.ok ? s.color : c.lim, borderRadius: [0, 4, 4, 0] } })),
        markLine: { symbol: "none", silent: true, lineStyle: { color: c.lim, type: "dashed" }, label: { show: false }, data: [{ xAxis: 100 }] } }],
    });
    if (onPick) chart.on("click", (e) => onPick(e.componentType === "yAxis" ? items.find((s) => s.label === e.value) : items[e.dataIndex])); // the bar or its label
    const ro = new ResizeObserver(() => chart.resize()); ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [items, dark, h]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="max-h-[520px] overflow-y-auto"><div ref={ref} style={{ width: "100%", height: h }} /></div>;
}

const Handle = () => <PanelResizeHandle className="group relative w-1.5 bg-transparent outline-none"><div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:w-[3px] group-hover:bg-brand-400 group-data-[resize-handle-state=drag]:w-[3px] group-data-[resize-handle-state=drag]:bg-brand-500" /></PanelResizeHandle>;

// editable beam-type table (B1, B2, …)
// automatic beam types, one more per press (like the spread-footing types): engine/beamTypes.js generateBeamTypes
function AutoBeamTypes({ frame, set, res }) {
  // the count asked is a number of GROUPS of spans; groups that end with the same section merge and types no beam uses are dropped,
  // so the result can have fewer types (user 2026-11-04: "ยิ่งเพิ่มจำนวน type ยิ่งลด"). "+1" therefore starts from the types there are
  // now and is applied only when it really gives one type more at no higher cost; otherwise the current types stay and it says why.
  const nNow = (frame.beamTypes ?? []).length, k0 = frame.beamAutoK ?? 0;
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [want, setWant] = useState(Math.max(1, k0 || 3));
  const cost = res.floors.flatMap((a) => a.spans).reduce((s, x) => s + beamCost(x.type) * x.len, 0);
  const nOk = res.floors.flatMap((a) => a.spans).filter((x) => x.ok).length;
  const run = (k, plusOne = false) => { setBusy(true); setMsg(null); setTimeout(() => { // let "working…" paint first: a big house takes seconds
    try {
      const g = generateBeamTypes(frame, k);
      if (!g) { setMsg({ ok: false, text: "ยังไม่มีคานให้จัด type" }); return; }
      const n = g.beamTypes.length;
      if (plusOne && k0 > 0 && (n <= nNow || g.cost > cost + 1) && g.ok >= nOk) {
        setMsg({ ok: true, text: `เพิ่มเป็น ${nNow + 1} type แล้วไม่ได้ type ใหม่ที่ถูกกว่า — งานนี้ใช้หน้าตัดที่ต่างกันจริง ${nNow} แบบตามลำดับออกแบบ (20×40 → 20×50 …, DB12 → DB16) จึงคง ${nNow} type เดิมไว้` });
        return;
      }
      // then every beam is LOCKED to its type (user 2026-11-19: editing B5 must not move its beams to B6) and beams the user set by hand keep theirs
      const fz = finalizeGenerated(frame, g), nOkF = fz.res.floors.flatMap((a) => a.spans).filter((x) => x.ok).length;
      set("beamTypes", fz.beamTypes); set("floors", fz.floors); set("beamAutoK", n);
      const kept = beamCounts(frame).hand;
      if (kept) { setMsg({ ok: nOkF === g.n, text: `ได้ ${fz.beamTypes.length} type · คานที่กำหนดเอง ${kept} ตัวคงเดิม · คานผ่าน ${nOkF}/${g.n} · ทุกคานล็อค type แล้ว` }); return; }
      setMsg({ ok: g.ok === g.n, text: `ได้ ${n} type${n < k ? ` (ขอ ${k} กลุ่ม — กลุ่มที่ได้หน้าตัดเดียวกันรวมกัน และ type ที่ไม่มีคานใช้ถูกตัดออก)` : ""} · คานผ่าน ${g.ok}/${g.n} · ค่าคาน ≈ ${Math.round(g.cost).toLocaleString()} บาท (เดิม ${Math.round(cost).toLocaleString()}) · ทุกคานล็อค type แล้ว (แก้เหล็กได้โดยคานไม่ย้าย type)` });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }, 30); };
  // compare type counts (user 2026-11-05: "6 and 14 types both gave 4 types with different bars — how do I choose?"): the number asked is only
  // the number of groups at the start (merging, unused types, re-analysis, repair and trimming change it), so try 1…10 and show the
  // distinct results; one click applies a row. Runs one k per tick so the page stays responsive.
  const [scan, setScan] = useState(null);
  const compare = () => { setScan({ rows: [], k: 1, done: false }); const rows = [], seen = new Set();
    const step = (k) => setTimeout(() => { try {
      const g = generateBeamTypes(frame, k); if (g) { const key = JSON.stringify(g.beamTypes.map(({ name, ...t }) => t));
        const r2 = analyzeFrame({ ...frame, beamTypes: g.beamTypes, floors: g.floors }), sps = r2.floors.flatMap((a) => a.spans), n2040 = sps.filter((sp) => Math.abs(sp.type.b - 0.2) < 1e-9 && Math.abs(sp.type.h - 0.4) < 1e-9).length;
        if (!seen.has(key)) { seen.add(key); rows.push({ k, g, n: g.beamTypes.length, cost: g.cost, ok: g.ok, total: g.n, n2040, sizes: [...new Set(g.beamTypes.map((t) => `${Math.round(t.b * 100)}×${Math.round(t.h * 100)}`))].join(", ") }); }
        else { const r = rows.find((x) => JSON.stringify(x.g.beamTypes.map(({ name, ...t }) => t)) === key); if (r) r.ks = [...(r.ks ?? [r.k]), k]; } }
      } catch { /* a failed k is skipped */ }
      setScan({ rows: [...rows], k, done: k >= 10 }); if (k < 10) step(k + 1); }, 20);
    step(1); };
  const apply = (r) => { const pr0 = pruneUnusedTypes({ ...frame, beamTypes: r.g.beamTypes, floors: r.g.floors }), pr = finalizeGenerated(frame, { ...r.g, beamTypes: pr0.beamTypes, floors: pr0.floors }); set("beamTypes", pr.beamTypes); set("floors", pr.floors); set("beamAutoK", pr.beamTypes.length); setMsg({ ok: r.ok === r.total, text: `ใช้ ${pr.beamTypes.length} type (จากการขอ ${(r.ks ?? [r.k]).join(", ")}) · ค่าคาน ≈ ${Math.round(r.cost).toLocaleString()} บาท` }); };
  const okRows = (scan?.rows ?? []).filter((r) => r.ok === r.total), cheapest = okRows.reduce((a, r) => (!a || r.cost < a.cost ? r : a), null);
  const fewest = okRows.filter((r) => cheapest && r.cost <= cheapest.cost * 1.03).reduce((a, r) => (!a || r.n < a.n || (r.n === a.n && r.cost < a.cost) ? r : a), null); // within 3 % of the cheapest, fewest types
  const c = beamCounts(frame);
  return (
    <SidePanel title="จัด type คานอัตโนมัติ" icon={Wand2} action={<span className="text-[12px] font-normal text-gray-500">ค่าคานตอนนี้ ≈ <b className="tabular-nums text-gray-800">{Math.round(cost).toLocaleString()}</b> บาท</span>}
      hint="แต่ละช่วงหาหน้าตัดที่ผ่านตามวิธีเลือก แล้วแบ่งกลุ่ม type ของกลุ่ม = หน้าตัดที่ผ่านทุกช่วงในกลุ่ม · ตั้งชื่อ B1, B2 … ตามขนาด · คานยื่นใช้ชื่อ B1A (เหล็กบนยาวตลอด) · ทุกคานล็อค type หลังจัด · ย้อนกลับได้ Ctrl+Z">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => run(Math.max(nNow, k0) + 1, true)} className={`${btnMain} py-1.5`}><Wand2 className="h-3.5 w-3.5" />{busy ? "กำลังจัด type…" : `เพิ่ม type คานอัตโนมัติ (มี ${nNow} → ลอง ${nNow + 1})`}</button>
        <span className="flex items-center gap-1.5 text-[12px] text-gray-600">หรือกำหนด<input type="number" min={1} max={20} value={want} onChange={(e) => setWant(Math.max(1, Math.min(20, Math.round(Number(e.target.value) || 1))))} className={`${smallNum} !w-14`} />type
          <button disabled={busy} onClick={() => run(want)} className={`${btnCls} py-1.5`}>จัด {want} type</button></span>
        {k0 > 0 && <button disabled={busy} onClick={() => run(nNow)} className={`${btnGhost} py-1.5`}>↻ จัดใหม่ ({nNow} type)</button>}
        <button disabled={busy || (scan && !scan.done)} onClick={compare} className={`${btnCls} py-1.5`}>{scan && !scan.done ? `กำลังเทียบ… (ลอง ${scan.k}/10)` : "เทียบจำนวน type (1–10)"}</button>
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-gray-600" title="เพิ่มเหล็กก่อน (ค่าเริ่มต้น): เริ่ม 20×40 เสริมเหล็ก DB12 → DB16 → DB20 จนเต็ม 2 ชั้น (ระยะแอ่นก็แก้ด้วยเหล็ก) ไม่ผ่านจริงจึงขยับหน้าตัดถัดไปที่เล็กที่สุด · 20×40 ก่อน: ใช้ 20×40 ถ้าผ่าน ไม่ผ่าน → หน้าตัดที่ถูกที่สุดที่ผ่าน (ลึกขั้น 10 ซม., กว้าง 20/25/30; ขั้น 5 ซม. เมื่อไม่มีตัวผ่าน) · ตามลำดับเดิม: 20×40, 20×50, 20×60, 30×60… ตัวแรกที่ผ่าน">วิธีเลือก
          <select value={frame.beamAutoMode ?? "steel"} onChange={(e) => set("beamAutoMode", e.target.value)} className="h-8 rounded-md border border-gray-300 bg-transparent px-1.5 text-[12px]">
            <option value="steel">เพิ่มเหล็กก่อนขยายหน้าตัด</option><option value="cost">20×40 ก่อน แล้วถูกที่สุด</option><option value="habit">ตามลำดับเดิม (เริ่ม 20×40)</option></select></label>
      </div>
      {msg && <div className="mt-2"><Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice></div>}
      {scan?.rows.length > 0 && (<div className="mt-3 overflow-x-auto rounded-lg border border-gray-200"><table className="w-full text-[12px] tabular-nums"><thead><tr className="bg-gray-50 text-left text-[11px] text-gray-500 dark:bg-white/[0.03]">
        <th className="px-2 py-1.5">ขอ</th><th className="px-2">ได้ (type)</th><th className="px-2">ขนาด</th><th className="px-2 text-right">ช่วงบน 20×40</th><th className="px-2 text-right">ผ่าน</th><th className="px-2 text-right">ค่าคาน ≈ บาท</th><th></th></tr></thead>
        <tbody>{scan.rows.map((r) => (<tr key={r.k} className={`border-t border-gray-100 ${r === fewest ? "bg-brand-50 dark:bg-brand-500/10" : ""}`}>
          <td className="px-2 py-1">{(r.ks ?? [r.k]).join(", ")}</td><td className="px-2">{r.n}</td><td className="px-2">{r.sizes}</td><td className="px-2 text-right">{r.n2040}/{r.total}</td>
          <td className={`px-2 text-right ${r.ok === r.total ? "text-green-600" : "text-red-600"}`}>{r.ok}/{r.total}</td><td className="px-2 text-right">{Math.round(r.cost).toLocaleString()}</td>
          <td className="px-2 text-right">{r === fewest && <span className="mr-2 text-[11px] text-brand-600">แนะนำ</span>}{r === cheapest && r !== fewest && <span className="mr-2 text-[11px] text-gray-500">ถูกสุด</span>}<button onClick={() => apply(r)} className={btnCls}>ใช้ชุดนี้</button></td></tr>))}</tbody></table></div>)}
      {scan?.rows.length > 0 && <Note>"ขอ" = จำนวนกลุ่มตอนเริ่ม · ขอต่างกันแต่ได้ชุดเดียวกันรวมเป็นแถวเดียว · แนะนำ = ผ่านทุกช่วง จำนวน type น้อยที่สุดที่ราคาไม่เกินชุดถูกสุด 3 %</Note>}
      <Section title="คานในโครงการ" className="!mt-4"><List>
        <Row title={`ล็อค ${c.lock} · กำหนดเอง ${c.hand} · อัตโนมัติ ${c.auto}`} rowTitle="ล็อค = type ที่ได้จากการจัดอัตโนมัติ ตรึงไว้ แก้เหล็กของ type แล้วคานไม่ย้ายไป type อื่น · กำหนดเอง = เลือกเองที่คาน · อัตโนมัติ = โปรแกรมเลือกใหม่ทุกครั้งที่คำนวณ"
          sub={'กำหนด type ให้หลายคาน: ลากกรอบ / Ctrl + คลิกคานบนแปลน แล้วเลือก "ใช้ type กับคานที่เลือก"'}
          tail={<span className="flex flex-wrap justify-end gap-1.5">
            {c.auto > 0 && <button onClick={() => { const L = lockBeams(frame, res); set("floors", L.floors); setMsg({ ok: true, text: `ล็อค type คาน ${L.n} ตัวตามที่เป็นอยู่ — แก้เหล็กของ type ใดก็ได้ คานยังอยู่ type เดิม (ไม่ผ่านจะขึ้นแดงพร้อม type ที่ผ่าน)` }); }} className={btnCls}>ล็อค type ทุกคานตามที่เป็นอยู่</button>}
            {c.lock > 0 && <button onClick={() => { const U = unlockBeams(frame); set("floors", U.floors); setMsg({ ok: true, text: `ปลดล็อค ${U.n} คาน — โปรแกรมจะเลือก type ที่เบาที่สุดที่ผ่านให้ใหม่ทุกครั้ง (คานที่กำหนดเองคงเดิม)` }); }} className={btnGhost}>ปลดล็อค ให้โปรแกรมเลือกใหม่</button>}
            {c.hand > 0 && <button onClick={() => { const fl2 = frame.floors.map((fl) => ({ ...fl, beams: (fl.beams ?? []).map(({ autoLock, ...b }) => ({ ...b, type: null })) })); set("floors", fl2); setMsg({ ok: true, text: `ทุกคาน (${c.hand + c.lock + c.auto}) กลับเป็นอัตโนมัติ — กดจัด type อีกครั้งเพื่อจัดใหม่ทั้งหมด (ย้อนกลับได้ Ctrl+Z)` }); }} title="คานที่กำหนดเองจะถูกเก็บไว้ตอนจัด type อัตโนมัติ — กดปุ่มนี้ก่อนถ้าต้องการจัดใหม่ทั้งหมด" className={btnGhost}>ให้ทุกคานเป็นอัตโนมัติ</button>}
          </span>} />
      </List></Section>
      <details className="mt-2 text-[11px] text-gray-500"><summary className="cursor-pointer text-gray-400 hover:text-gray-600">วิธีที่โปรแกรมจัด type และราคาที่ใช้เทียบ</summary>
        <p className="mt-1 leading-relaxed">กดทีละครั้ง เพิ่มทีละ 1 type แล้วจัดทุก type ใหม่จากแรงจริง: แต่ละช่วงหาหน้าตัดที่ผ่านตามวิธีเลือก (กว้าง 0.20 / 0.25 / 0.30 ม. ลึก 0.30–0.80 ม. เหล็ก ≤ 2 ชั้น) เรียงแล้วแบ่งกลุ่มจำนวนใกล้กัน type ของกลุ่ม = หน้าตัดที่ผ่านทุกช่วงในกลุ่ม · ตัด type ที่ไม่มีคานใช้ · ราคาเทียบ: คอนกรีต 2,500 บ./ม³ เหล็ก 28 บ./กก. แบบ 350 บ./ม²</p></details>
    </SidePanel>
  );
}

// auto column types (user 2026-11-04, like the spread-footing types): "+1" adds one type and re-spreads every column, or a count
function AutoColTypes({ frame, set, res }) {
  const nNow = (frame.colTypes ?? []).length, k0 = frame.colAutoK ?? 0;
  const [busy, setBusy] = useState(false), [msg, setMsg] = useState(null), [want, setWant] = useState(Math.max(1, k0 || 2));
  const nOk = res.columns.filter((c) => c.ok).length;
  const run = (k) => { setBusy(true); setMsg(null); setTimeout(() => {
    try {
      const g = generateColumnTypes(frame, k);
      if (!g) { setMsg({ ok: false, text: "ยังไม่มีเสาให้จัด type" }); return; }
      set("colTypes", g.colTypes); set("colPick", g.colPick); set("colAutoK", g.colTypes.length);
      setMsg({ ok: g.ok === g.n, text: `ได้ ${g.colTypes.length} type${g.colTypes.length < k ? ` (ขอ ${k} — กลุ่มที่ได้หน้าตัดเดียวกันรวมกัน)` : ""} · เสาผ่าน ${g.ok}/${g.n} · ค่าเสา ≈ ${Math.round(g.cost).toLocaleString()} บาท` });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }, 30); };
  return (
    <SidePanel title="จัด type เสาอัตโนมัติ" icon={Wand2} action={<span className="text-[12px] font-normal text-gray-500">เสาผ่านตอนนี้ <b className={`tabular-nums ${nOk === res.columns.length ? "text-green-600" : "text-red-600"}`}>{nOk}/{res.columns.length}</b></span>}
      hint="แต่ละต้นหาหน้าตัดถูกสุดที่ผ่านทุกชั้น (เสาจัตุรัส 20–50 ซม. · 4/6/8/12 เส้น DB12 → DB16 → DB20 · ρ 1–2.5 % · ปลอก RB6/RB9 ระยะห่างสุดที่ผ่าน 16db/48dt) แล้วแบ่งกลุ่ม type = หน้าตัดที่ผ่านทุกต้นในกลุ่มของแต่ละชั้น · แทนที่ type เสาเดิมทั้งหมด (แก้ต่อในตารางได้)">
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} onClick={() => run((k0 || nNow) + (k0 ? 1 : 0) || 1)} className={`${btnMain} py-1.5`}><Wand2 className="h-3.5 w-3.5" />{busy ? "กำลังจัด…" : k0 ? `เพิ่ม type เสาอัตโนมัติ (+1 → ${k0 + 1})` : "สร้าง type เสาอัตโนมัติ"}</button>
        <span className="flex items-center gap-1.5 text-[12px] text-gray-600">หรือกำหนด<input type="number" min={1} max={12} value={want} onChange={(e) => setWant(Math.max(1, Math.min(12, Math.round(Number(e.target.value) || 1))))} className={`${smallNum} !w-14`} />type
          <button disabled={busy} onClick={() => run(want)} className={`${btnCls} py-1.5`}>จัด {want} type</button></span>
      </div>
      {msg && <div className="mt-2"><Notice kind={msg.ok ? "ok" : "bad"}>{msg.text}</Notice></div>}
    </SidePanel>
  );
}

// deleteBeamType: engine/beamAssign.js (names of the other types no longer shift)

function TypeTable({ types, setTypes, an, delType, res, cur = 0, frame = null, onRenumber = null, head = null }) {
  const set = (i, k, v) => setTypes(types.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const used = (i) => an?.spans.filter((s) => s.typeIdx === i) ?? [];
  const cell = "h-7 w-full rounded-md border border-gray-300 bg-transparent px-1.5 text-[12px] tabular-nums";
  const bars = (i, k) => <input defaultValue={types[i][k]} key={types[i][k]} onBlur={(e) => set(i, k, e.target.value.trim())}
    className={`${cell} ${types[i][k] && !parseBars(types[i][k]) ? "border-red-400 text-red-600" : ""}`} placeholder="—" />;
  const num = (i, k, step) => <input type="number" step={step} defaultValue={types[i][k]} key={types[i][k]} onBlur={(e) => set(i, k, Number(e.target.value))} className={`${cell} compact-num text-right`} />;
  const nAll = (i) => (res ? res.floors.reduce((a, f) => a + f.spans.filter((x) => x.typeIdx === i).length, 0) : used(i).length);
  return (
    <SidePanel title={`ตาราง Type คาน (${types.length})`} icon={Table2}
      action={<span className="flex gap-1.5">{onRenumber && <button onClick={onRenumber} title="เรียง type ตามขนาด (b × h) แล้วตั้งชื่อ B1, B2 … ใหม่ตามลำดับ — คานยังใช้หน้าตัดเดิมทุกตัว (ชื่อที่ตั้งเองไม่เปลี่ยน)" className={btnGhost}>เรียงชื่อใหม่ตามขนาด</button>}
        <button onClick={() => setTypes([...types, { ...types[types.length - 1], name: nextTypeName(types), manual: true, auto: undefined, big: undefined }])} className={btnCls}><Plus className="h-3.5 w-3.5" />เพิ่ม type</button></span>}>
      {head && <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">{head}</div>}
      <div className="overflow-auto rounded-lg border border-gray-200 text-[12px]">
      <table className="w-full border-collapse">
        <thead><tr className="bg-gray-50 text-left text-[11px] text-gray-500 dark:bg-white/[0.03]">
          {["Type", "เลือกอัตโนมัติ", "b (ม.)", "h (ม.)", "บน ตลอด", "บน เสริม L/4", "ล่าง ตลอด", "ล่าง เสริม 3L/5", "ปลอก", "ชุด", "@หัวเสา", "@กลาง", "ใช้ (ช่วง)", ""].map((h, j) => <th key={j} className="whitespace-nowrap px-1.5 py-1.5 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{types.map((t, i) => (
          <tr key={i} className="border-t border-gray-100">
            <td className="px-1.5 py-1"><div className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
              <input defaultValue={t.name} key={t.name} onBlur={(e) => set(i, "name", e.target.value.trim() || t.name)} className={`${cell} !w-14 font-semibold`} />{t.big && <span className="whitespace-nowrap rounded bg-amber-100 px-1 text-[10px] font-medium text-amber-700" title="คานใหญ่พิเศษ: เกินกรอบปกติ (กว้าง 0.30 / ลึก 0.80 ม.) ใช้เฉพาะช่วงที่หน้าตัดปกติรับไม่ได้">ใหญ่พิเศษ</span>}</div></td>
            <td className="px-1.5 text-center" title="ติ๊ก = โปรแกรมเลือก type นี้ให้คานอัตโนมัติได้ · ไม่ติ๊ก = ใช้เฉพาะคานที่คุณกำหนดเอง (type ที่สร้างเองเริ่มแบบไม่ติ๊ก)"><input type="checkbox" className="accent-[#465fff]" checked={!t.manual} onChange={(e) => set(i, "manual", !e.target.checked || undefined)} /></td>
            <td className="w-16 px-1.5">{num(i, "b", 0.05)}</td><td className="w-16 px-1.5">{num(i, "h", 0.05)}</td>
            <td className="px-1.5">{bars(i, "top")}</td><td className="px-1.5">{bars(i, "topX")}</td><td className="px-1.5">{bars(i, "bot")}</td><td className="px-1.5">{bars(i, "botX")}</td>
            <td className="w-20 px-1.5"><select value={t.st} onChange={(e) => set(i, "st", e.target.value)} className={cell}>{["RB 6", "RB 9", "DB 10", "DB 12"].map((s) => <option key={s}>{s}</option>)}</select></td>
            <td className="w-14 px-1.5"><select value={t.stSets ?? 1} onChange={(e) => set(i, "stSets", Number(e.target.value))} className={cell} title="จำนวนชุดปลอก (2 = ปลอก 2 ชุดซ้อน)"><option value={1}>1</option><option value={2}>2</option></select></td>
            <td className="w-16 px-1.5">{num(i, "sSup", 0.025)}</td><td className="w-16 px-1.5">{num(i, "sMid", 0.025)}</td>
            <td className="whitespace-nowrap px-1.5 tabular-nums" title="จำนวนช่วงทุกชั้น (ในวงเล็บ = ชั้นที่เลือกอยู่) · ชี้ = ดูคานชั้นนี้ที่ใช้ type นี้บนแปลน"
              onPointerEnter={() => frame && highlight({ floor: cur, segs: (frame.floors[cur]?.beams ?? []).filter((_, m) => (an?.beamTypeOf?.[m] ?? frame.floors[cur].beams[m].type) === i).map((b) => [b.a, b.b]) })} onPointerLeave={() => highlight(null)}>
              <b className={nAll(i) ? "text-gray-800" : "font-normal text-gray-400"}>{nAll(i)}</b>{res && <span className="text-gray-400"> ({used(i).length})</span>} <span className="cursor-help text-[11px] text-brand-600">ดูคาน</span></td>
            <td className="px-1.5"><button onClick={() => delType(i)} disabled={types.length < 2} className="text-gray-400 hover:text-red-500 disabled:opacity-30" title="ลบ type"><Trash2 className="h-3.5 w-3.5" /></button></td>
          </tr>))}</tbody>
      </table></div>
      <Note>ใส่เหล็กแบบ 2-DB16 · เว้นว่าง = ไม่มี · "ตลอด" = เหล็กวิ่งตลอดคาน, เสริม L/4 = เหล็กบนเพิ่มที่หัวเสา, เสริม 3L/5 = เหล็กล่างเพิ่มกลางคาน ·
        คาน "อัตโนมัติ" ได้ type ที่เบาที่สุดที่ผ่าน (เฉพาะ type ที่ติ๊ก "เลือกอัตโนมัติ") · คานที่ล็อค / กำหนดเอง ไม่ย้าย type เอง ไม่ผ่านจะขึ้นแดงพร้อม type ที่ผ่าน ·
        type ที่เพิ่มเองไม่ถูกเลือกอัตโนมัติ — ใช้กับคานที่เลือกบนแปลน · ลบ type แล้วชื่อ type อื่นไม่เปลี่ยน · คานที่วาดเป็นเส้นเดียวใช้ type เดียวทุกช่วง</Note>
    </SidePanel>
  );
}

// result text of one column level: utilisation or the reason it fails
const colWhy = (c) => (c.check.error ? c.check.error : c.check.tension && !c.check.tension.ok ? `แรงดึง ${fmt(c.check.tension.T, 0)} > As·fs ${fmt(c.check.tension.cap, 0)} กก.` : c.check.fit && !c.check.fit.ok ? `ช่องว่างเหล็กยืน ${fmt(c.check.fit.clear, 1)} < ${fmt(c.check.fit.clearReq, 1)} ซม.` : c.check.slenderOk === false ? `ชะลูดเกิน k·lu/r ${fmt(c.check.r?.klr, 0)} > 100${c.check.slender?.sway ? " (ชั้นเซได้)" : ""}` : !c.check.sOk ? `ปลอก @${fmt(c.lv.s, 2)} > ${fmt(c.check.r.sTie / 100, 3)} ม. (16db)` : !c.check.r.pgOk ? "pg นอก 1–8%"
  : !Number.isFinite(c.check.r.R) ? "ชะลูดเกิน" : `${fmt(c.check.util * 100, 0)}%${c.ok ? "" : " ไม่ผ่าน"}`);

// delete column type i: stacks picked to it go back to auto, later picks shift down, C<n> names renumbered in order
export function deleteColType(frame, i) {
  let n = 0; const colTypes = frame.colTypes.filter((_, j) => j !== i).map((t) => (/^C\d+$/.test(t.name ?? "") ? { ...t, name: `C${++n}` } : (n++, t)));
  const colPick = Object.fromEntries(Object.entries(frame.colPick ?? {}).filter(([, v]) => v !== i).map(([k, v]) => [k, v > i ? v - 1 : v]));
  return { colTypes, colPick };
}

// column types (C1, C2, …) with one section per level, bottom up
function ColTypeTable({ types, setTypes, res, floors, delType, head = null }) {
  const setLv = (i, j, k, v) => setTypes(types.map((t, a) => (a !== i ? t : { ...t, levels: t.levels.map((lv, b) => (b === j ? { ...lv, [k]: v } : lv)) })));
  const cell = "h-7 w-full rounded-md border border-gray-300 bg-transparent px-1.5 text-[12px] tabular-nums";
  const num = (i, j, k, step) => <input type="number" step={step} defaultValue={types[i].levels[j][k]} key={types[i].levels[j][k]} onBlur={(e) => setLv(i, j, k, Number(e.target.value))} className={`${cell} compact-num text-right`} />;
  const sel = (i, j, k, opts) => <select value={types[i].levels[j][k]} onChange={(e) => setLv(i, j, k, e.target.value)} className={cell}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  // levels follow the project floors (user 2026-11-04: the type had 3 levels, the project 4 floors → the top level was used twice, unseen)
  const short = types.filter((t) => t.levels.length < floors.length);
  const fit = () => setTypes(types.map((t) => (t.levels.length >= floors.length ? t : { ...t, levels: [...t.levels, ...floors.slice(t.levels.length).map((f) => ({ ...t.levels.at(-1), level: f.name }))] })));
  return (
    <SidePanel title={`ตาราง Type เสา (${types.length})`} icon={Table2}
      action={<button onClick={() => setTypes([...types, { ...types.at(-1), name: `C${types.length + 1}` }])} className={btnCls}><Plus className="h-3.5 w-3.5" />เพิ่ม type เสา</button>}>
      {head && <div className="mb-3 rounded-lg bg-gray-50 px-3 py-2 dark:bg-white/[0.03]">{head}</div>}
      {short.length > 0 && <div className="mb-3"><Notice kind="warn" action={<button onClick={fit} className="whitespace-nowrap rounded-md bg-[#b54708] px-2 py-0.5 text-[12px] font-medium text-white hover:opacity-90">เพิ่มระดับให้ครบทุกชั้น (คัดลอกระดับบน)</button>}>
        โครงการมี {floors.length} ชั้น ({floors.map((f) => f.name).join(" · ")}) แต่ type {short.map((t) => `${t.name} มี ${t.levels.length} ระดับ`).join(", ")} — ชั้นที่เกินใช้ระดับบนสุดของ type ซ้ำ</Notice></div>}
      <div className="grid gap-3">
      {types.map((t, i) => (
        <div key={i} className="overflow-hidden rounded-lg border border-gray-200 text-[12px]">
          <div className="flex items-center gap-2 bg-gray-50 px-2.5 py-1.5 dark:bg-white/[0.03]"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
            <input defaultValue={t.name} key={t.name} onBlur={(e) => setTypes(types.map((x, a) => (a === i ? { ...x, name: e.target.value.trim() || x.name } : x)))} className={`${cell} !w-14 font-semibold`} />
            <span className="text-gray-500">ใช้ <b className="text-gray-800">{res.stacks.filter((s) => s.typeIdx === i).length}</b> ต้น</span>
            <button onClick={() => setTypes(types.map((x, a) => (a === i ? { ...x, levels: [...x.levels, { ...x.levels.at(-1), level: floors[x.levels.length]?.name ?? `ชั้น ${x.levels.length}` }] } : x)))} className="ml-auto text-[12px] font-medium text-brand-600 hover:underline">+ เพิ่มระดับ</button>
            <button onClick={() => delType(i)} disabled={types.length < 2} className="text-gray-400 hover:text-red-500 disabled:opacity-30" title="ลบ type"><Trash2 className="h-3.5 w-3.5" /></button></div>
          <table className="w-full border-collapse">
            <thead><tr className="text-left text-[11px] text-gray-500">{["ระดับ (ล่าง → บน)", "ใช้ใต้ชั้น", "Bx (ซม.)", "By (ซม.)", "จำนวน", "เหล็กยืน", "ปลอก", "@ (ม.)", ""].map((h) => <th key={h} className="whitespace-nowrap px-1.5 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{t.levels.map((lv, j) => (
              <tr key={j} className="border-t border-gray-100">
                <td className="px-1.5 py-1"><input defaultValue={lv.level} key={lv.level} onBlur={(e) => setLv(i, j, "level", e.target.value)} className={cell} /></td>
                <td className={`whitespace-nowrap px-1.5 ${j >= floors.length ? "text-gray-300" : j === t.levels.length - 1 && floors.length > t.levels.length ? "font-medium text-[#b54708]" : "text-gray-500"}`}>{j >= floors.length ? "ไม่มีชั้นนี้ (ไม่ใช้)" : j === t.levels.length - 1 ? floors.slice(j).map((f) => f.name).join(", ") : floors[j].name}</td>
                <td className="w-16 px-1.5">{num(i, j, "Bx", 5)}</td><td className="w-16 px-1.5">{num(i, j, "By", 5)}</td><td className="w-14 px-1.5">{num(i, j, "n", 2)}</td>
                <td className="w-20 px-1.5">{sel(i, j, "mainBar", ["DB 12", "DB 16", "DB 20", "DB 25"])}</td><td className="w-20 px-1.5">{sel(i, j, "tieBar", ["RB 6", "RB 9", "DB 10"])}</td>
                <td className="w-16 px-1.5">{num(i, j, "s", 0.025)}</td>
                <td className="px-1.5"><button onClick={() => setTypes(types.map((x, a) => (a === i ? { ...x, levels: x.levels.filter((_, b) => b !== j) } : x)))} disabled={t.levels.length < 2} className="text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>))}</tbody>
          </table>
        </div>
      ))}
      </div>
      <Note>ระดับที่ k ใช้กับเสาใต้ชั้นที่ k (นับจากล่าง) · ชั้นที่เกินจำนวนระดับใช้ระดับบนสุด · ตรวจด้วยวิธีหน่วยแรงใช้งาน (โมดูลเสา) ที่ระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1·ด้านแคบ),
        โครงไม่เซ k = 1 · ระยะปลอกต้องไม่เกิน 16 เท่าเหล็กยืน / 48 เท่าเหล็กปลอก / ด้านแคบ · อัตโนมัติ = type เบาที่สุดที่ผ่านทุกชั้นของต้นนั้น</Note>
    </SidePanel>
  );
}

// working order on each floor (build bottom up; the analysis runs top down)
const STEPS = [["frame", "1 โครง", false, "ขั้น 1 โครง: เสา คาน คานซอย คานยื่น"], ["slab", "2 พื้น", false, "ขั้น 2 พื้น: ชนิดพื้น พื้นยื่น"], ["stair", "3 บันได", false, "ขั้น 3 บันได"],
  ["wall", "4 ผนัง", false, "ขั้น 4 ผนัง"], ["other", "5 น้ำหนักอื่น", false, "ขั้น 5 น้ำหนักอื่น: ราวกันตก น้ำหนักจุด แรงจากหลังคา"], ["result", "6 ผลคาน", false, "ผลออกแบบคาน (WSD)"], ["cols", "7 ผลเสา", false, "ผลออกแบบเสา (WSD)"],
  ["types", "Type คาน", false, "ตาราง Type คาน"], ["ctypes", "Type เสา", false, "ตาราง Type เสา"]];

export function FramePage({ frame, set, dark, roof, res: resIn, step = "frame", onProjectInfo, onRoofFromFrame, focus = false, project = {} }) {
  const [multiSel, setMultiSel] = useState([]), [pickSet, setPickSet] = useState(null), [armed, setArmed] = useState(false), pickRef = useRef(null); // Load Cases page
  // checklist bar (Help.jsx StepChecklist) → open the sub-tab where a task is done
  const setDrawerRef = useRef(null); // the side panel (warnings …) is declared further down
  useEffect(() => { const f = (e) => { if (e.detail?.sub) { setSubState(e.detail.sub); setSel(null); } if (e.detail?.panel) setDrawerRef.current?.(e.detail.panel); }; window.addEventListener("structcalc:go", f); return () => window.removeEventListener("structcalc:go", f); }, []);
  const [subState, setSubState] = useState(null), [view, setView] = useState("2d"), [sel, setSel] = useState(null), mode = step, setMode = () => {};
  const [show, setShow] = useState({ DL: true, SDL: true, WALL: true, LL: true, SP: true }), wallTypes = frame.wallTypes ?? DEFAULT_WALL_TYPES;
  const cur = Math.min(frame.cur ?? 0, frame.floors.length - 1), fl = frame.floors[cur], types = frame.beamTypes, cTypes = frame.colTypes;
  const res = useMemo(() => resIn ?? analyzeFrame(frame), [resIn, frame]), an = res.floors[cur];
  const lvJ = useMemo(() => { const rows = levelJoints(frame, res), depth = res?.depthJoints ?? []; return { rows, groups: jointGroups(rows), depth, dgroups: depthGroups(depth) }; }, [frame, res]);
  const setFloor = (patch) => set("floors", frame.floors.map((f, i) => (i === cur ? { ...f, ...patch } : f)));
  // move / copy what is selected on this floor to another floor (user 2026-11-19: "เขียนคานผิดชั้น อยากย้ายคานหรือพื้นไปชั้นอื่น").
  // items = [{ kind, i, obj }] from the board. Same plan position on the other floor; nothing that is already there is doubled
  // (columns / beams at the same place, ≤ 1 cm). A slab panel takes its settings (kind, direction, thickness, loads) along and gets the
  // beams of its edges on the other floor where they are missing; moved away, it is left as an opening on this floor (the beams stay
  // unless they were selected too). One step of the project undo (Ctrl+Z).
  const moveTo = (items, to, copy) => {
    if (to === cur || !frame.floors[to] || !items.length) return "";
    const src = frame.floors[cur], dst = frame.floors[to], E = 0.01, same = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= E;
    const onSeg = (p, a, b) => { const L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-9) return same(p, a); const t = ((p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1])) / (L * L); const d = Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) / L; return d <= E && t >= -E / L && t <= 1 + E / L; };
    const of = (k) => items.filter((x) => x.kind === k && x.obj);
    const cp = (o) => JSON.parse(JSON.stringify(o));
    const d = { columns: [...(dst.columns ?? [])], beams: [...(dst.beams ?? [])], walls: [...wallsOf(dst)], cants: [...(dst.cants ?? [])], stairs: [...(dst.stairs ?? [])], lineLoads: [...(dst.lineLoads ?? [])], pointLoads: [...(dst.pointLoads ?? [])], panels: { ...(dst.panels ?? {}) } };
    const n = {};
    const add = (k, label) => { n[label] = (n[label] ?? 0) + 1; return k; };
    for (const { obj } of of("column")) if (!d.columns.some((c) => same(c, obj))) { d.columns.push([...obj]); add(0, "เสา"); }
    const hasBeam = (a, b) => d.beams.some((x) => (same(x.a, a) && same(x.b, b)) || (same(x.a, b) && same(x.b, a)) || (!x.arc && onSeg(a, x.a, x.b) && onSeg(b, x.a, x.b)));
    for (const { obj } of of("beam")) {
      if (hasBeam(obj.a, obj.b)) continue;
      const { wall, ...b } = cp(obj); d.beams.push(b); add(0, "คาน");
      if (wall?.h > 0 && !src.walls) d.walls.push({ a: [...obj.a], b: [...obj.b], kind: wall.kind ?? "brick", h: wall.h, open: 0, layers: 1 }); // old files: the wall stored on the beam goes along
    }
    for (const { obj } of of("panel")) { // a slab panel: its edges as beams where missing + its settings
      const P = obj.P ?? []; P.forEach((a, k) => { const b = P[(k + 1) % P.length]; if (!hasBeam(a, b)) d.beams.push({ a: [...a], b: [...b], type: null }); });
      d.panels[obj.key] = { ...(src.panels?.[obj.key] ?? {}), kind: obj.st, ...(obj.dir ? { dir: obj.dir } : {}), t: obj.t, finish: obj.finish, live: obj.live, ...(obj.extraSDL ? { extra: obj.extraSDL } : {}), open: !!obj.open };
      add(0, "พื้น");
    }
    for (const [kind, key, label] of [["wall", "walls", "ผนัง"], ["cant", "cants", "พื้นยื่น"], ["stair", "stairs", "บันได"], ["lineLoad", "lineLoads", "น้ำหนักเส้น"], ["point", "pointLoads", "น้ำหนักจุด"]])
      for (const { obj } of of(kind)) { d[key].push(cp(obj)); add(0, label); }
    const floors = frame.floors.map((f, i) => {
      if (i === to) return { ...f, ...d };
      if (i !== cur || copy) return f;
      const gone = (kind) => new Set(of(kind).map((x) => x.i)), keep = (list, kind) => (list ?? []).filter((_, j) => !gone(kind).has(j));
      const beams = keep(f.beams, "beam"), panels = { ...(f.panels ?? {}) };
      for (const { obj } of of("panel")) { // the panel still closed by beams on this floor → an opening here; its beams gone too → no panel left, drop its settings
        const P = obj.P ?? [], closed = P.every((a, k) => { const b2 = P[(k + 1) % P.length]; return beams.some((x) => !x.arc && onSeg(a, x.a, x.b) && onSeg(b2, x.a, x.b)); });
        if (closed) panels[obj.key] = { ...(panels[obj.key] ?? {}), open: true }; else delete panels[obj.key];
      }
      return { ...f, columns: keep(f.columns, "column"), beams, walls: keep(wallsOf(f), "wall"), cants: keep(f.cants, "cant"), stairs: keep(f.stairs, "stair"), lineLoads: keep(f.lineLoads, "lineLoad"), pointLoads: keep(f.pointLoads, "point"), panels };
    });
    set("floors", floors);
    const what = Object.entries(n).map(([k, v]) => `${k} ${v}`).join(" · ");
    return what ? `${copy ? "คัดลอก" : "ย้าย"}ไป ${dst.name} แล้ว: ${what}${copy ? "" : " (กด Ctrl+Z เพื่อย้อน)"}` : `${dst.name} มีของตำแหน่งเดียวกันอยู่แล้ว — ไม่ได้เพิ่มอะไร`;
  };
  const moveFloors = frame.floors.map((f, i) => ({ i, name: f.name })).filter((x) => x.i !== cur);
  // one structural grid for the whole building (as on the drawings): a grid edit applies to every floor
  const setGrid = (g) => set("floors", frame.floors.map((f) => ({ ...f, grid: g })));
  // copy the floor below (columns and beams) — most floors repeat the one under them
  const copyBelow = cur > 0 ? (withBeams = true) => { const b = frame.floors[cur - 1]; setFloor({ columns: b.columns.map((c) => [...c]), beams: withBeams ? b.beams.map((x) => ({ ...x, a: [...x.a], b: [...x.b] })) : [] }); } : null;
  const goFloor = (i) => { set("cur", i); setSel(null); };
  const [pinW, setPinW] = useState(null), [slabAll, setSlabAll] = useState(false), [slabAllRows, setSlabAllRows] = useState(false); // warning clicked in the list: its place keeps flashing
  const colsHere = res.columns.filter((c) => c.floor === cur), colAt = (i) => colsHere.find((c) => c.i === i);
  const setMat = (k, v) => set("mat", { ...frame.mat, [k]: v });
  const [critMsg, setCritMsg] = useState(""), [libSel, setLibSel] = useState(null);
  const loadLib = frame.loadLib ?? DEFAULT_LOAD_LIB, libItem = loadLib.find((x) => x.id === libSel) ?? null;
  const resolveW = (w) => resolveWall(w, frame, cur);
  // whole structure from a 3D DXF (frame3dFromDxf): one floor per chosen level, slab / load defaults of the current floor,
  // grid from all column positions, column base level kept for the storey table; everything else of the old floors is replaced
  const importFrame = (f3, use, names) => {
    const tpl = fl, pick = f3.floors.map((f, k) => ({ ...f, name: names[k] })).filter((_, k) => use[k]);
    if (!pick.length) return;
    const u = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((p, q) => p - q), gaps = (v) => v.slice(1).map((x, i) => +(x - v[i]).toFixed(3));
    const all = pick.flatMap((f) => f.columns), xs = u(all.map((p) => p[0])), ys = u(all.map((p) => p[1]));
    const grid = xs.length > 1 && ys.length > 1 ? { x0: xs[0], y0: ys[0], dx: gaps(xs), dy: gaps(ys), sub: 1 } : tpl.grid;
    let prev = f3.base;
    set("floors", pick.map((f) => { const h = +(f.z - prev).toFixed(3); prev = f.z;
      return { name: f.name, h, t: tpl.t, finish: tpl.finish, live: tpl.live, grid, columns: f.columns, beams: f.beams, panels: {}, walls: [], cants: [], stairs: [], lineLoads: [], pointLoads: [] }; }));
    set("baseLevel", f3.base); set("colPick", {}); goFloor(0);
  }; // clear height / doors / windows as the analysis sees the wall
  const fv = (k, label, unit, step) => <Field label={label} unit={unit}><NumberInput value={fl[k]} step={step} onChange={(v) => setFloor({ [k]: v })} /></Field>;
  const beam = sel?.kind === "beam" ? fl.beams[sel.i] : null, col = sel?.kind === "column" ? fl.columns[sel.i] : null, panel = sel?.kind === "panel" ? an.panels.find((p) => p.key === sel.key) : null;
  const line = beam ? an.lines.find((l) => l.members.includes(sel.i)) : null;
  const [lineId, setLineId] = useState(null);
  const bigLine = an.lines.filter((l) => l.res).reduce((a, l) => { const m = Math.max(...an.spans.filter((s) => s.line === l.id).map((s) => Math.max(s.Mpos, s.Mneg)), 0); return !a || m > a.m ? { l, m } : a; }, null)?.l;
  const showLine = line ?? an.lines.find((l) => l.id === lineId && l.res) ?? bigLine;
  // type of one drawn beam: what it is now and how it got it (auto / locked / set by hand) + a type that passes when it fails
  const beamTypeNote = (i) => {
    const b = fl.beams[i], mode = beamMode(b), now = types[an.beamTypeOf?.[i] ?? b.type], sug = an.suggest?.[i];
    return { mode, now, sug, text: mode === "auto" ? `อัตโนมัติ — ตอนนี้ได้ ${now?.name ?? "-"} (เปลี่ยนเองได้ทุกครั้งที่คำนวณใหม่)` : mode === "lock" ? "ล็อคจากการจัด type อัตโนมัติ — แก้เหล็กของ type นี้ คานยังเป็น type นี้" : "กำหนดเอง" };
  };
  const setBeam = (patch) => setFloor({ beams: fl.beams.map((b, i) => (i === sel.i ? { ...b, ...patch } : b)) });
  const wall = sel?.kind === "wall" ? wallsOf(fl)[sel.i] : null, cant = sel?.kind === "cant" ? fl.cants?.[sel.i] : null;
  const setWall = (patch) => setFloor({ walls: wallsOf(fl).map((w, i) => (i === sel.i ? { ...w, ...patch } : w)) });
  const setCant = (patch) => setFloor({ cants: fl.cants.map((c, i) => (i === sel.i ? { ...c, ...patch } : c)) });
  const stair = sel?.kind === "stair" ? fl.stairs?.[sel.i] : null, lineL = sel?.kind === "lineLoad" ? fl.lineLoads?.[sel.i] : null, pointL = sel?.kind === "point" ? fl.pointLoads?.[sel.i] : null;
  const setList = (key, patch) => setFloor({ [key]: fl[key].map((x, i) => (i === sel.i ? { ...x, ...patch } : x)) });
  const delList = (key) => { setFloor({ [key]: fl[key].filter((_, i) => i !== sel.i) }); setSel(null); };
  // wall-plate reactions of the roof module → point loads named "หลังคา" on this floor (replacing earlier ones)
  const [roofMsg, setRoofMsg] = useState(null);
  // roof loads follow the roof module automatically once linked to a floor (the app recomputes them on every roof change)
  const roofLoads = () => {
    set("roofLink", { on: true, floor: cur });
    setFloor({ pointLoads: (fl.pointLoads ?? []).filter((x) => x.name !== "หลังคา") }); // the link replaces copied roof points
    setRoofMsg(`เชื่อมแรงจากหลังคาเข้ากับ ${fl.name} แล้ว — อัปเดตเองทุกครั้งที่แก้หลังคา (ตำแหน่งต้องตรงกับแปลนนี้)`);
  };
  const wallOpts = wallTypes.map((t) => [t.id, `${t.name} ${t.w} กก./ม.²`]);
  const setPanel = (patch) => setFloor({ panels: { ...fl.panels, [panel.key]: { ...fl.panels?.[panel.key], ...patch } } });
  const modeBar = (
    <span className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
      {STEPS.map(([k, t, later]) => (
        <button key={k} disabled={later} title={later ? "อยู่ในขั้น Q2" : undefined} onClick={() => setMode(k)}
          className={`rounded-md px-2.5 py-1 ${mode === k ? "bg-white text-gray-800 shadow-theme-xs" : later ? "text-gray-300" : "text-gray-500"}`}>{t}</button>
      ))}
    </span>
  );
  const G = fl.grid, gridInput = (k, label) => (
    <label key={k + G[k].join()} className="block text-[11px] text-gray-500">{label}
      <input defaultValue={G[k].join("  ")} onBlur={(e) => { const v = e.target.value.split(/[\s,]+/).map(Number).filter((x) => x > 0); if (v.length) setGrid({ ...G, [k]: v }); }}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="mt-0.5 h-8 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800 tabular-nums" />
    </label>
  );
  const nNG = an.spans.filter((s) => !s.ok).length, totalLoad = an.columns.reduce((s, c) => s + c.R, 0);
  const tiles = [["แผ่นพื้น", `${an.panels.length} แผ่น`], ["พื้นที่พื้น (ม²)", fmt(an.panels.reduce((s, p) => s + p.area, 0), 1)], ["แนวคาน", `${an.lines.length} แนว`],
    ["ช่วงคาน", `${an.spans.length} ช่วง`], ["Type ที่ใช้", [...new Set(an.spans.map((s) => types[s.typeIdx]?.name))].join(" ") || "-"], ["น้ำหนักลงเสารวม (ตัน)", fmt(totalLoad / 1000, 1)],
    ["เสาหนักสุด ชั้นนี้ (ตัน)", fmt(Math.max(0, ...colsHere.map((c) => c.Pbot)) / 1000, 2)],
    ["สรุปทั้งอาคาร", res.ok ? "ผ่านทั้งหมด" : `คานไม่ผ่าน ${res.floors.reduce((s, a) => s + a.spans.filter((x) => !x.ok).length, 0)} · เสาไม่ผ่าน ${res.columns.filter((c) => !c.ok).length}`]];

  // ---- workflow layout: sub-tabs + view switch, centre (2D / 3D / split or a table page), inspector on the right, drawer, status bar
  const SUBS = { analysis: [["cont", "แรงภายในคาน"], ["colf", "แรงในเสา"], ["frame3d", "เทียบ 2 วิธี / ตั้งค่า"]], loads: [["cases", "Load Cases (ใส่น้ำหนัก)"], ["wall", "ผนัง (แบบวาด)"], ["other", "น้ำหนักอื่น / หลังคา"], ["groups", "สรุปกลุ่มน้ำหนัก"], ["lateral", "ลม / แผ่นดินไหว / Combination"]],
    design: [["result", "คาน"], ["cols", "เสา"], ["slabs", "พื้น / บันได"], ["types", "Type คาน"], ["ctypes", "Type เสา"]] };
  const subs = SUBS[step], sub = subs ? (subs.some((x) => x[0] === subState) ? subState : subs[0][0]) : null;
  const boardStep = { frame: "frame", grid: "grid", slab: "slab", stair: "stair", analysis: "result", footing: "cols" }[step] ?? (step === "loads" ? (sub === "cases" ? "assign" : sub === "other" ? "other" : "wall") : step === "design" ? (sub === "cols" ? "cols" : "result") : "result");
  const tablePage = (step === "analysis" && ["frame3d", "colf"].includes(sub)) || step === "project" || (step === "design" && ["types", "ctypes", "slabs"].includes(sub)) || step === "footing" || (step === "loads" && ["groups", "lateral"].includes(sub));
  // bulk tables: slab panels (step 3) and beam walls / line loads (step 6 walls)
  const bulkTab = step === "slab" || step === "frame" ? ["panels", `แผ่นพื้นทั้งชั้น (${an.panels.length})`] : step === "loads" && sub === "cases" ? ["panelsL", `น้ำหนักแผ่นพื้นทั้งชั้น (${an.panels.length})`] : step === "loads" && sub === "wall" ? ["bwalls", `ผนัง / น้ำหนักบนคาน (${fl.beams.length})`] : null;
  const drawerTabs = [["spans", `ช่วงคาน (${an.spans.length})`], ["cols", `เสา (${res.stacks.length})`], ["groups", "น้ำหนักแยกกลุ่ม"], ["warn", `คำเตือน (${res.warnings.length})`]];
  const nBeamNG = res.floors.reduce((a, f) => a + f.spans.filter((x) => !x.ok).length, 0), nBeam = res.floors.reduce((a, f) => a + f.spans.length, 0), nColNG = res.columns.filter((c) => !c.ok).length;
  const tab = (on) => `rounded-md px-3 py-1 text-xs font-medium ${on ? "bg-white text-gray-800 shadow-theme-xs" : "text-gray-500 hover:text-gray-700"}`;
  // one toolbar row (user 2026-11-04: wasted space on top): sub-tabs + 2D/3D switch go into the board's own toolbar when the plan alone
  // fills the centre; otherwise they keep their row
  const pageNow = (step === "analysis" && ["frame3d", "colf"].includes(sub)) || step === "project" || (step === "design" && ["types", "ctypes", "slabs"].includes(sub)) || step === "footing" || (step === "loads" && ["groups", "lateral"].includes(sub));
  const boardOnly = !pageNow && view === "2d" && !(step === "stair" && sel?.kind === "stair") && !(step === "analysis" && sub === "cont");
  const tabsBar = (<div className="flex flex-wrap items-center gap-2">
    {subs && <Tabs value={sub} onValueChange={(k) => { setSubState(k); setSel(null); }}><TabsList>{subs.map(([k, t]) => <TabsTrigger key={k} value={k}>{t}</TabsTrigger>)}</TabsList></Tabs>}
    {!pageNow && step !== "footing" && <Tabs value={view} onValueChange={setView}><TabsList>{[["2d", "แปลน 2D"], ["3d", "3D"], ["split", "2D + 3D"]].map(([k, t]) => <TabsTrigger key={k} value={k}>{t}</TabsTrigger>)}</TabsList></Tabs>}
  </div>);
  const above = frame.floors[cur + 1], below = frame.floors[cur - 1];
  // stairs: drawn on the floor they start from, stored on the floor above (the floor they reach) — the board shows both
  const stairUp = above ? (ns) => { const n = (above.stairs ?? []).length; set("floors", frame.floors.map((f, i) => (i === cur + 1 ? { ...f, stairs: [...(f.stairs ?? []), ns] } : f))); set("cur", cur + 1); setSel({ kind: "stair", i: n }); } : null;
  const boardEl = (<FloorBoard widenTypes={widenTypesOf(frame)} onMoveTo={moveTo} moveFloors={moveFloors} onAssignType={boardStep === "frame" || boardStep === "result" ? (idx, ti) => setFloor({ beams: assignBeams({ floors: [fl] }, 0, idx, ti)[0].beams }) : null} stairsAbove={above?.stairs ?? []} aboveName={above?.name ?? ""} belowName={below?.name ?? (stairRiseOf(frame, 0, {}) < fl.h - 1e-6 ? "ดิน ±0.00" : "ฐานราก")} onStairUp={stairUp} onPickAbove={(i) => { set("cur", cur + 1); setSel({ kind: "stair", i }); }} floor={fl} setFloor={setFloor} an={an} types={types} wallTypes={wallTypes} step={boardStep} show={show} sel={sel} setSel={setSel} modeBar={boardOnly ? tabsBar : null} dark={dark} resolveW={resolveW} libItem={libItem} floorIdx={cur} onMulti={setMultiSel} pickSet={pickSet} onPick={boardStep === "assign" && armed ? (t) => pickRef.current?.(t) : null} colSize={(i) => { const c = colsHere.find((x) => x.i === i); return c?.lv ? [c.lv.Bx / 100, c.lv.By / 100, `${cTypes[c.typeIdx]?.name ?? ""} ${c.lv.Bx}×${c.lv.By}`] : null; }} onImportFrame={step === "frame" || step === "grid" ? importFrame : null}
            ghost={cur > 0 ? frame.floors[cur - 1].columns : []} onCopyBelow={step === "frame" ? copyBelow : null} compact={step === "analysis"} onDxf={() => downloadDxf(framePlanModel(fl, an, types, colsHere, { widenTypes: widenTypesOf(frame) }), `${frame.frameNo}-${fl.name}`)} colInfo={boardStep === "cols" ? fl.columns.map((_, i) => { const c = colAt(i); return c && { ok: c.ok, text: `${cTypes[c.typeIdx]?.name} ${fmt(c.Pbot / 1000, 1)}ต`, color: TYPE_COLORS[c.typeIdx % TYPE_COLORS.length] }; }) : null} />);
  // click a beam / column in 3D = select it (its floor becomes the current one) — user 2026-11-04
  const pick3d = (h) => { if (h.floor !== cur) set("cur", h.floor); setSel({ kind: h.kind, i: h.i }); };
  const view3d = <Frame3D loadsOn={step === "loads"} frame={frame} res={res} cur={cur} roof={roof} dark={dark} onPick={pick3d} selected={sel && (sel.kind === "beam" || sel.kind === "column") ? { floor: cur, ...sel } : null} className="h-full min-h-[300px] overflow-hidden rounded-xl border border-gray-200" />;
  // covers / bar spacing as one compact line (PanelKit look): label, small number, unit — inside the panel it belongs to
  const covVal = (k, def) => frame.mat[k] ?? (k === "coverCol" ? frame.mat.cover : k === "coverPier" ? frame.mat.coverCol ?? frame.mat.cover : def);
  const covIn = (k, label, def, title) => <label key={k} className="flex items-center gap-1.5 whitespace-nowrap" title={title}>{label}
    <input type="number" step="0.5" value={covVal(k, def) ?? ""} onChange={(e) => setMat(k, e.target.value === "" ? 0 : Number(e.target.value))} className={`${smallNum} !w-16`} /><span className="text-gray-400">ซม.</span></label>;
  const coverInline = (keys, extra = null) => <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-gray-600"><span className="text-[11px] font-semibold text-gray-500">คอนกรีตหุ้ม</span>
    {COVERS.filter(([k]) => keys.includes(k)).map(([k, label, def]) => covIn(k, label, def))}{extra}</div>;
  const coverBar = (keys, extra = null) => <div className="mb-3 rounded-lg border border-gray-200 bg-white px-3 py-2 dark:bg-white/[0.03]">{coverInline(keys, extra)}</div>;
  // minimum clear spacing between beam bars: bars that do not fit in a layer go to the next layer (design + drawings)
  const clearField = <><span className="h-4 w-px bg-gray-200" />{covIn("barClear", "ช่องว่างเหล็กคานขั้นต่ำ", 3.5, "ใช้ค่ามากกว่าระหว่างค่านี้กับขนาดเหล็ก · เกินความกว้างคาน → ขึ้นชั้นที่ 2 (ห่างชั้น 2.5 ซม.)")}</>;
  const slabRows = step === "design" && sub === "slabs" ? designSlabs(an, fl, frame.mat) : [];
  const page = step === "project" ? (
    <div className="grid max-w-[1500px] gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
      <DesignCriteria frame={frame} set={set} setMat={setMat} />
      <div className="space-y-4">
      <SidePanel title="ข้อมูลโครงการ" icon={Building2} action={<button onClick={onProjectInfo} className={btnCls}>แก้ข้อมูลโครงการ</button>}>
        <List>
          {[["ชื่อโครงการ", project.name], ["เจ้าของ", project.owner], ["ที่ตั้ง", project.location], ["วิศวกร", project.engineer]].map(([t, v]) =>
            <Row key={t} title={t} sub={v || "ยังไม่ได้กรอก"} />)}
        </List>
        <Note>มาตรฐาน: วิธีหน่วยแรงใช้งาน (WSD) ว.ส.ท. / ACI 318 · กฎกระทรวง พ.ศ. 2566 (fc ≤ 65 ksc) · โครงหลังคาเหล็ก ASD (AISC / ว.ส.ท.) · สร้างจากล่างขึ้นบน (ขั้น 1–5) คำนวณจากบนลงล่าง (ขั้น 6–8) · ย้อนกลับได้ด้วย ↶ ↷ หรือ Ctrl+Z / Ctrl+Y</Note>
      </SidePanel>
      <LateralChoice frame={frame} set={set} />
      {critMsg && <Notice>{critMsg}</Notice>}
      <StandardPanel frame={frame} set={set} defaults={DEFAULT_FRAME} onNotice={setCritMsg} />
      </div>
    </div>
  ) : step === "design" && sub === "types" ? <div className="space-y-4"><AutoBeamTypes frame={frame} set={set} res={res} />
      <TypeTable head={coverInline(["cover"], clearField)} res={res} types={types} setTypes={(v) => set("beamTypes", v)} an={an} cur={cur} frame={frame} onRenumber={() => { const r = renumberTypes(frame); set("beamTypes", r.beamTypes); set("floors", r.floors); }} delType={(i) => { const r = deleteBeamType(frame, i); set("beamTypes", r.beamTypes); set("floors", r.floors); }} />
      <BeamTypeFigures types={types} mat={frame.mat} spans={res.floors.flatMap((f) => f.spans)} onTypes={(v) => set("beamTypes", v)} project={project} joints={lvJ} widens={widenSections(widenUses(frame, res))} count={(i) => res.floors.reduce((a, f) => a + f.spans.filter((x) => x.typeIdx === i).length, 0)} />
      <LevelJointsCard rows={lvJ.rows} groups={lvJ.groups} depth={lvJ.depth} dgroups={lvJ.dgroups} mat={frame.mat} /><WidenTypesCard frame={frame} set={set} res={res} /></div>
    : step === "design" && sub === "ctypes" ? <div className="space-y-4"><AutoColTypes frame={frame} set={set} res={res} /><ColTypeTable head={coverInline(["coverCol", "coverPier"])} types={cTypes} setTypes={(v) => set("colTypes", v)} res={res} floors={frame.floors} delType={(i) => { const r = deleteColType(frame, i); set("colTypes", r.colTypes); set("colPick", r.colPick); }} /><ColumnTypeFigures types={cTypes} mat={frame.mat} /></div>
    : step === "footing" ? <div>{coverBar(["coverFoot"])}<FootingTypes frame={frame} set={set} res={res} /></div>
    : step === "design" && sub === "slabs" ? (() => {
      // every slab / cantilever slab / stair: this floor or all floors, bars by position, section drawing; row → flashes on the plan
      const ks = slabAll ? frame.floors.map((_, k) => k) : [cur];
      const rows = ks.flatMap((k) => (k === cur ? slabRows : designSlabs(res.floors[k], frame.floors[k], frame.mat)).map((x) => ({ ...x, k }))).filter((x) => slabAllRows || x.r || x.kind === "S" || x.kind === "ST"); // GS / PS rows (no design) hidden unless asked
      const setF = (k, patch) => set("floors", frame.floors.map((f, i) => (i === k ? { ...f, ...patch } : f)));
      const where = (x) => { const a = res.floors[x.k], f = frame.floors[x.k];
        const P = x.key ? a?.panels.find((p) => p.key === x.key)?.P : x.ci !== undefined ? a?.cants[x.ci]?.P : x.si !== undefined ? (() => { const st = f.stairs[x.si]; return [[st.a[0], st.a[1]], [st.b[0], st.a[1]], [st.b[0], st.b[1]], [st.a[0], st.b[1]]]; })() : null;
        return P ? { floor: x.k, polys: [P], bad: x.r ? !x.ok : false } : null; };
      const inp = "h-7 w-16 rounded border border-gray-300 bg-transparent px-1";
      return (
      <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3"><div className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 dark:bg-white/[0.03]">{coverInline(["coverSlab"])}</div>
        <div className="inline-flex rounded-lg p-0.5 text-[12px] ring-1 ring-gray-200">{[[false, `ชั้นนี้ (${fl.name})`], [true, "ทุกชั้น"]].map(([v, t]) => <button key={t} onClick={() => setSlabAll(v)} className={`rounded-md px-2.5 py-1 ${slabAll === v ? "bg-brand-500 text-[#fff]" : "text-gray-600 hover:bg-gray-50"}`}>{t}</button>)}</div>
        <label className="flex items-center gap-1 text-[12px] text-gray-600"><input type="checkbox" checked={slabAllRows} onChange={(e) => setSlabAllRows(e.target.checked)} />แสดง GS / PS ด้วย</label>
        <span className="text-[12px] text-gray-500">ผ่าน {rows.filter((x) => x.r && x.ok).length}/{rows.filter((x) => x.r).length} · ชี้แถว = กระพริบบนแปลน / 3D · คลิกแถว = ไปชั้นนั้น</span></div>
      <table className="w-full border-collapse text-[12px]"><thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{[...(slabAll ? ["ชั้น"] : []), "แผ่น", "ชนิด", "ช่วง (ม.)", "ขอบต่อเนื่อง", "หนา (ม.)", "ขนาดเหล็ก", "เหล็กแต่ละตำแหน่ง (ต้องการ As ซม.²/ม.)", "ผล"].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((x) => { const f = frame.floors[x.k], at = where(x); return (
          <tr key={`${x.k}-${x.name}`} onMouseEnter={() => at && highlight(at)} onMouseLeave={() => highlight(null)} onClick={(e) => { if (["INPUT", "SELECT"].includes(e.target.tagName)) return; if (x.k !== cur) goFloor(x.k); if (at) highlight(at); }}
            className={`cursor-pointer border-b border-gray-100 align-top tabular-nums hover:bg-brand-50/50 ${x.r && !x.ok ? "bg-red-50/40" : ""}`}>
          {slabAll && <td className="px-1 py-1 text-gray-500">{f.name}</td>}
          <td className="px-1 py-1 font-medium">{x.name}</td><td className="px-1">{x.way ?? ({ C: "พื้นยื่น", ST: "บันได", PS: "PS", GS: "GS" })[x.kind] ?? x.kind}</td><td className="px-1">{x.S ? `${fmt(x.S, 2)} × ${fmt(x.L, 2)}` : x.L ? fmt(x.L, 2) : "-"}</td>
          <td className="px-1">{x.cont ?? "-"}</td>
          <td className="px-1">{x.key ? <input type="number" step="0.01" value={f.panels?.[x.key]?.t ?? f.t} onChange={(e) => setF(x.k, { panels: { ...f.panels, [x.key]: { ...f.panels?.[x.key], t: Number(e.target.value) } } })} className={inp} />
            : x.si !== undefined ? <input type="number" step="0.01" value={f.stairs[x.si].t ?? 0.12} onChange={(e) => setF(x.k, { stairs: f.stairs.map((q, j) => (j === x.si ? { ...q, t: Number(e.target.value) } : q)) })} className={inp} />
            : x.ci !== undefined ? <input type="number" step="0.01" value={f.cants[x.ci].t ?? f.t} onChange={(e) => setF(x.k, { cants: f.cants.map((q, j) => (j === x.ci ? { ...q, t: Number(e.target.value) } : q)) })} className={inp} /> : "-"}</td>
          <td className="px-1">{x.key && x.r ? <select value={f.panels?.[x.key]?.bar ?? "RB 9"} onChange={(e) => setF(x.k, { panels: { ...f.panels, [x.key]: { ...f.panels?.[x.key], bar: e.target.value } } })} className="h-7 rounded border border-gray-300 bg-transparent px-1">{Object.keys(SLAB_BARS).map((b) => <option key={b}>{b}</option>)}</select>
            : x.si !== undefined && x.r ? <select value={f.stairs[x.si].mainBar ?? "DB 12"} onChange={(e) => setF(x.k, { stairs: f.stairs.map((q, j) => (j === x.si ? { ...q, mainBar: e.target.value } : q)) })} className="h-7 rounded border border-gray-300 bg-transparent px-1">{Object.keys(SLAB_BARS).map((b) => <option key={b}>{b}</option>)}</select> : x.r ? "RB 9" : "-"}</td>
          <td className="px-1 py-1">{x.r ? <div className="space-y-0.5">{slabRebar(x).map((b) => <div key={b.pos} className="flex gap-2"><span className="w-48 shrink-0 text-gray-500">{b.pos}</span><span className="font-medium text-gray-800">{b.text}</span>{b.need > 0 && <span className="text-gray-400">({fmt(b.need, 2)})</span>}</div>)}</div> : <span className="text-gray-500">{x.note}</span>}</td>
          <td className={`px-1 ${x.r ? (x.ok ? "text-green-600" : "font-semibold text-red-600") : "text-gray-400"}`}>{x.r ? (x.ok ? "ผ่าน" : "ไม่ผ่าน") : "-"}</td></tr>); })}</tbody></table>
      <p className="text-sm font-semibold text-gray-800">รูปตัดเสริมเหล็ก และโมเมนต์ต่อความกว้าง 1 ม.</p>
      <div className="grid gap-3 xl:grid-cols-2">{rows.filter((x) => x.r).map((x) => { const f = frame.floors[x.k], t = x.key ? f.panels?.[x.key]?.t ?? f.t : x.si !== undefined ? f.stairs[x.si].t ?? 0.12 : x.ci !== undefined ? f.cants[x.ci].t ?? f.t : f.t, at = where(x); return (
        <div key={`${x.k}-${x.name}`} onMouseEnter={() => at && highlight(at)} onMouseLeave={() => highlight(null)} className="rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200">
          <p className="text-[12px] font-medium text-[#344054]">{slabAll ? `${f.name} · ` : ""}{x.name} · {x.way ?? ({ C: "พื้นยื่น", ST: "บันได" })[x.kind]} · <span className={x.ok ? "text-green-600" : "text-red-600"}>{x.ok ? "ผ่าน" : "ไม่ผ่าน"}</span></p>
          <SlabSection row={x} t={t} dark={dark} /><SlabStrip row={x} /></div>); })}</div>
      </div>); })()
    : step === "loads" && sub === "groups" ? <div className="max-w-md"><Card title={`น้ำหนักแยกกลุ่ม — ${fl.name}`} icon={Layers}>
          <div className="space-y-1 text-[13px]">
            {Object.entries(GROUPS).map(([g, [name, color]]) => (
              <label key={g} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={show[g]} onChange={() => setShow({ ...show, [g]: !show[g] })} />
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{name}<span className="ml-auto tabular-nums text-gray-600">{fmt((an.groups?.[g] ?? 0) / 1000, 2)} ตัน</span>
              </label>
            ))}
            <div className="flex border-t border-gray-200 pt-1 font-semibold">รวมลงเสา<span className="ml-auto tabular-nums">{fmt(Object.values(an.groups ?? {}).reduce((a, b) => a + b, 0) / 1000, 2)} ตัน</span></div>
            <p className="text-[11px] text-gray-400">ติ๊กเพื่อแสดงค่าบนแปลน · วิเคราะห์ทุกกลุ่มรวมกัน (WSD) · สร้างจากล่างขึ้นบน คำนวณจากบนลงล่าง</p>
          </div>
        </Card></div>
    : step === "analysis" && sub === "colf" ? (
      <div className="max-w-6xl space-y-3">
        <div className="rounded-xl bg-[#fff] p-3 ring-1 ring-gray-200"><ColumnChart stacks={res.stacks} floors={frame.floors} /></div>
        <table className="w-full border-collapse text-[12px]"><thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["เสา (X, Y)", "ชั้น", "P ออกแบบ (กก.)", "Mx / My จากโครง 3 มิติ (กก.-ม.)", "ชุดแรงที่ควบคุม", "ใช้", "ผล"].map((h) => <th key={h} className="px-1 py-1">{h}</th>)}</tr></thead>
          <tbody>{res.columns.slice().sort((a, b) => a.stack.localeCompare(b.stack) || a.floor - b.floor).map((c) => <tr key={`${c.stack}-${c.floor}`} className="border-b border-gray-100 tabular-nums">
            <td className="px-1 py-0.5">{c.stack}</td><td className="px-1">ใต้ {frame.floors[c.floor]?.name}</td><td className="px-1">{fmt(c.Pd ?? c.Pbot, 0)}</td><td className="px-1">{fmt(c.M3?.Mx ?? 0, 0)} / {fmt(c.M3?.My ?? 0, 0)}</td>
            <td className="px-1">{c.check?.combo ?? "D+L"}</td><td className="px-1">{fmt((c.check?.util ?? 0) * 100, 0)}%</td><td className={`px-1 ${c.ok ? "text-green-600" : "font-semibold text-red-600"}`}>{c.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>)}</tbody></table>
      </div>)
    : step === "analysis" && sub === "frame3d" ? (() => {
      // whole-building rigid-joint frame (gravity, P-Delta) beside the continuous-beam results the design uses
      const m = res.frame3d ?? frame3dModel(frame, res);
      if (m.error) return <p className="text-sm text-red-600">{m.error}</p>;
      const pct = (a, b) => (b > 100 ? Math.round(((a - b) / b) * 100) : null), cell = (v) => (v === null ? "-" : `${v > 0 ? "+" : ""}${v}%`);
      const hi = (v) => (v !== null && Math.abs(v) > 15 ? "font-semibold text-[#d92d20]" : "");
      const rows = m.spans.filter((x) => x.floor === cur);
      return (
        <div className="space-y-3 text-[12px]">
          <div className="grid max-w-4xl grid-cols-4 gap-2">
            {[["น้ำหนักทั้งอาคาร", `${fmt(m.load / 1000, 2)} ตัน`], ["แรงที่ฐานรวม (ΣRz)", `${fmt(m.base.reduce((a, b) => a + b.R[2], 0) / 1000, 2)} ตัน`],
              ["การเคลื่อนตัวด้านข้างสูงสุด", `${fmt(m.drift * 1000, 1)} มม.`], ["แบบจำลอง", `${m.nodes.length} จุด · ${m.members.length} ชิ้น`]].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-gray-200 bg-white px-3 py-2"><div className="text-[11px] text-gray-400">{l}</div><div className="font-semibold tabular-nums">{v}</div></div>))}
          </div>
          <label className="flex max-w-4xl items-center gap-2 font-medium text-gray-700">แรงที่ใช้ออกแบบ
            <select value={frame.analysis ?? "envelope"} onChange={(e) => set("analysis", e.target.value)} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
              <option value="envelope">ค่ามากสุดของคานต่อเนื่องและโครง 3 มิติ (แนะนำ)</option><option value="continuous">คานต่อเนื่องอย่างเดียว</option>
            </select>
            <span className="ml-4">เสา</span>
            <select value={frame.colMethod ?? "axial"} onChange={(e) => set("colMethod", e.target.value)} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
              <option value="axial">แรงอัดสะสม + เยื้องศูนย์ขั้นต่ำ (แบบ Excel / ทั่วไป)</option><option value="frame">รวมโมเมนต์จากโครง 3 มิติ (ละเอียด)</option>
            </select>
            <span className="ml-4">ฐานเสา</span>
            <select value={frame.baseFixity ?? "pinned"} onChange={(e) => set("baseFixity", e.target.value)} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
              <option value="pinned">หมุด (ฐานเข็ม 1–2 ต้น รับโมเมนต์ไม่ได้)</option><option value="fixed">ยึดแน่น (ฐานรากแผ่ / เข็มกลุ่ม)</option>
            </select></label>
          <p className="max-w-4xl text-gray-500">โครง 3 มิติจุดต่อแข็ง: ฐานเสาตามที่เลือก (ที่หลังฐานราก) · ปลายคานซอยที่วางบนคานเป็นหมุด · stiffness แตกร้าว คาน 0.5Ig เสา 0.7Ig แรงบิด 0.2J · รวม P-Delta ·
            น้ำหนักแนวดิ่ง DL+LL เต็มทุกช่วง (คานต่อเนื่องใช้หมากรุก) · ปลายคานซอยที่เป็นหมุดไม่รับแรงบิด · แดง = ต่างเกิน 15%</p>
          <table className="w-full max-w-5xl border-collapse"><thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">
            {["ช่วง", "M+ ต่อเนื่อง / โครง (กก.-ม.)", "ต่าง", "M− ต่อเนื่อง / โครง", "ต่าง", "V ต่อเนื่อง / โครง (กก.)", "ต่าง", "T โครง (กก.-ม.)"].map((h, i) => <th key={i} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{rows.map((x) => { const a = pct(x.Mpos, x.cont.Mpos), b = pct(x.Mneg, x.cont.Mneg), c = pct(x.V, x.cont.V); return (
              <tr key={x.id} className="border-b border-gray-100 tabular-nums"><td className="px-1 py-0.5">{x.id}</td>
                <td className="px-1">{fmt(x.cont.Mpos, 0)} / {fmt(x.Mpos, 0)}</td><td className={`px-1 ${hi(a)}`}>{cell(a)}</td>
                <td className="px-1">{fmt(x.cont.Mneg, 0)} / {fmt(x.Mneg, 0)}</td><td className={`px-1 ${hi(b)}`}>{cell(b)}</td>
                <td className="px-1">{fmt(x.cont.V, 0)} / {fmt(x.V, 0)}</td><td className={`px-1 ${hi(c)}`}>{cell(c)}</td><td className="px-1">{fmt(x.T, 0)}</td></tr>); })}</tbody></table>
          <p className="font-semibold text-gray-700">เสา {fl.name} (โครง 3 มิติ) — แรงอัดและโมเมนต์จากโครงจริง เทียบกับแรงที่ใช้ออกแบบตอนนี้</p>
          <table className="w-full max-w-4xl border-collapse"><thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">
            {["เสา", "P ออกแบบตอนนี้ (ตัน)", "N โครง (ตัน)", "Mx โครง (กก.-ม.)", "My โครง (กก.-ม.)", "M ระยะเยื้องศูนย์ขั้นต่ำ (กก.-ม.)"].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{m.columns.filter((c) => c.floor === cur).map((c) => { const cd = res.columns.find((x) => x.floor === cur && x.i === c.ci); return (
              <tr key={c.ci} className="border-b border-gray-100 tabular-nums"><td className="px-1 py-0.5">{cd?.stack ?? c.ci}</td><td className="px-1">{fmt((cd?.Pbot ?? 0) / 1000, 2)}</td>
                <td className={`px-1 ${c.N < 0 ? "font-semibold text-[#d92d20]" : ""}`}>{fmt(c.N / 1000, 2)}{c.N < 0 ? " (ดึง)" : ""}</td><td className="px-1">{fmt(c.Mx, 0)}</td><td className="px-1">{fmt(c.My, 0)}</td>
                <td className="px-1">{cd?.check?.e ? fmt((cd.Pbot * cd.check.e) / 100, 0) : "-"}</td></tr>); })}</tbody></table>
        </div>
      );
    })()
    : step === "loads" && sub === "lateral" ? <LateralPanel frame={frame} set={set} res={res}
    /> : null;
  // a selection that no longer exists (new / opened project, deleted item, other floor) shows the floor cards, not an empty card
  const selOk = !!(beam || col || panel || wall || cant || stair || lineL || pointL);
  // one place for delete / reset in every selected-item panel: its header (PanelKit DelButton)
  const delAction = wall ? <DelButton onClick={() => { setFloor({ walls: wallsOf(fl).filter((_, i) => i !== sel.i) }); setSel(null); }} title="ลบผนังนี้" />
    : cant ? <DelButton onClick={() => { setFloor({ cants: fl.cants.filter((_, i) => i !== sel.i) }); setSel(null); }} title="ลบพื้นยื่นนี้" />
    : stair ? <DelButton onClick={() => delList("stairs")} title="ลบบันไดนี้" />
    : lineL ? <DelButton onClick={() => delList("lineLoads")} title="ลบน้ำหนักเส้นนี้" />
    : pointL ? <DelButton onClick={() => delList("pointLoads")} title="ลบน้ำหนักจุดนี้" />
    : panel && fl.panels?.[panel.key] ? <button onClick={() => setFloor({ panels: Object.fromEntries(Object.entries(fl.panels ?? {}).filter(([k]) => k !== panel.key)) })} className={btnGhost} title="ล้างค่าที่ตั้งเองของแผ่นนี้ กลับไปใช้ค่าของชั้น">ใช้ค่าของชั้น</button>
    : null;
  const inspector = sel && selOk ? (          <SidePanel action={delAction} title={beam ? `คาน (แนว ${line ? line.id + 1 : "-"})` : col ? `เสา #${sel.i + 1}` : panel ? `แผ่นพื้น P${an.panels.indexOf(panel) + 1}` : wall ? `ผนัง ${sel.i + 1}` : cant ? `พื้นยื่น ${sel.i + 1}` : stair ? `บันได ${sel.i + 1}` : lineL ? "น้ำหนักเส้น" : pointL ? "น้ำหนักจุด" : "เลือก"} icon={Ruler}>
            {wall && (() => { const r = an.walls[sel.i], rw = resolveWall(wall, frame, cur), L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), ops = wall.openings ?? [];
              const setOp = (k, p) => setWall({ openings: ops.map((o, j) => (j === k ? { ...o, ...p } : o)) }), oArea = ops.reduce((a, o) => a + o.w * o.h, 0);
              const addOp = ([type, name, w, h, sill]) => { const at = Math.max(0, Math.min(L - w, ops.reduce((a, o) => Math.max(a, (o.at ?? 0) + o.w + 0.3), 0.3))); setWall({ openings: [...ops, { type, name, w, h, sill, at: +at.toFixed(2) }], open: 0 }); };
              return (<div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="ชนิดผนัง"><Select value={wall.kind} onChange={(v) => setWall({ kind: v })} options={wallOpts} /></Field></div>
              <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={!!wall.hAuto} onChange={(e) => setWall({ hAuto: e.target.checked })} />
                สูงอัตโนมัติ = ความสูงชั้นบน − ความลึกคานบน {wall.hAuto ? `(${fmt(rw.hFull, 2)} ม.)` : ""} · พิมพ์ความสูงเองได้ในช่องด้านล่าง</label>
              <Field label={wall.gable ? "สูงยอดจั่ว (พิมพ์เอง)" : "สูงผนัง (พิมพ์เอง)"} unit="m"><NumberInput value={wall.hAuto ? +(rw.hFull ?? wall.h ?? 0).toFixed(2) : wall.h} step="0.1" onChange={(v) => setWall({ h: v, hAuto: false })} /></Field>
              <Field label="ผนัง"><Select value={wall.layers ?? 1} onChange={(v) => setWall({ layers: Number(v) })} options={[[1, "ชั้นเดียว"], [2, "เบิ้ล (2 ชั้น)"]]} /></Field>
              <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={!!wall.gable} onChange={(e) => setWall({ gable: e.target.checked })} />ผนังจั่ว (สามเหลี่ยม · เฉลี่ยครึ่งความสูง)</label>
              <div className="col-span-2 rounded-lg border border-gray-200 p-2">
                <div className="mb-1.5"><div className="text-[11px] font-semibold text-gray-500">ประตู / หน้าต่าง</div><div className="text-[11px] text-gray-400">ระยะจากปลาย A · กว้าง × สูง · ขอบล่าง (ม.)</div></div>
                {ops.map((o, k) => <div key={k} className="mb-1 grid grid-cols-[1fr_52px_52px_52px_52px_16px] items-center gap-1 text-[12px]">
                  <span className="truncate">{o.name ?? (o.type === "door" ? "ประตู" : "หน้าต่าง")}</span>
                  {["at", "w", "h", "sill"].map((f) => <input key={f} type="number" step="0.05" value={o[f] ?? 0} onChange={(e) => setOp(k, { [f]: Number(e.target.value) })} className="h-7 rounded border border-gray-300 bg-transparent px-1 text-right tabular-nums" title={{ at: "ห่างจากปลาย A", w: "กว้าง", h: "สูง", sill: "ขอบล่างจากพื้น" }[f]} />)}
                  <button onClick={() => setWall({ openings: ops.filter((_, j) => j !== k) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
                <div className="mt-1 flex flex-wrap gap-1">{OPENINGS.map((o) => <button key={o[1]} onClick={() => addOp(o)} className="rounded-md px-1.5 py-0.5 text-[11px] text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50">+ {o[1]}</button>)}</div>
                {!ops.length && <div className="mt-2 flex items-center gap-2 text-[12px] text-gray-500">หรือช่องเปิดเป็น %<input type="number" step="5" value={wall.open ?? 0} onChange={(e) => setWall({ open: Number(e.target.value) })} className="h-7 w-16 rounded border border-gray-300 bg-transparent px-1 text-right" /></div>}
              </div>
              <Result className="col-span-2">ยาว {fmt(L, 2)} × สูง {fmt(rw.h, 2)} ม.{wall.gable ? " (เฉลี่ย)" : ""} = {fmt(L * rw.h, 2)} ม.² − ช่องเปิด {fmt(oArea || (L * rw.h * (rw.open ?? 0)) / 100, 2)} ม.²
                <br /><b className="text-[14px] text-[#b54708]">{fmt(wallLoad(rw, wallTypes), 0)} กก./ม.</b> · {r?.on.length ? `ลงคาน ${r.on.map((o) => (typeof o === "object" ? `แนว ${o.line + 1}` : o)).join(", ")}` : r?.panel ? `กระจายลงแผ่นพื้น ${r.panel}` : "ยังไม่มีคาน/พื้นรับ"}</Result>
            </div>); })()}
            {stair && <><StairInputs st={stair} set={(p) => setList("stairs", p)} H={stairRiseOf(frame, cur, stair)} Hmax={fl.h} zTop={elevations(frame)[cur]}
              riseNote={stairRiseOf(frame, cur, {}) < fl.h - 1e-6 ? `จากดิน ±0.00 ถึงระดับชั้นนี้ (ไม่ใช่จากโคนเสา)` : "ความสูงชั้น"} r0={an.stairs?.[sel.i]} mat={frame.mat} onLandingBeam={() => {
              // landing edge (far end of the run) extended along its line to the nearest columns of this floor on each side
              const x0 = Math.min(stair.a[0], stair.b[0]), x1 = Math.max(stair.a[0], stair.b[0]), y0 = Math.min(stair.a[1], stair.b[1]), y1 = Math.max(stair.a[1], stair.b[1]);
              const ax = stair.up?.[1] ?? "x", pos = stair.up?.[0] !== "-", c = ax === "x" ? (pos ? x1 : x0) : (pos ? y1 : y0), lo = ax === "x" ? y0 : x0, hi = ax === "x" ? y1 : x1;
              const on = (fl.columns ?? []).filter((p) => Math.abs((ax === "x" ? p[0] : p[1]) - c) < 0.05).map((p) => (ax === "x" ? p[1] : p[0]));
              const s0 = Math.max(...on.filter((v) => v <= lo + 0.05), -Infinity), s1 = Math.min(...on.filter((v) => v >= hi - 0.05), Infinity);
              const A = Number.isFinite(s0) ? s0 : lo, B = Number.isFinite(s1) ? s1 : hi, P = (v) => (ax === "x" ? [c, v] : [v, c]);
              setFloor({ beams: [...fl.beams, { a: P(A), b: P(B), type: null, lvl: +(fl.h / 2).toFixed(2) }] });
            }} /></>}
            {lineL && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ"><input value={lineL.name ?? ""} onChange={(e) => setList("lineLoads", { name: e.target.value })} className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[13px]" /></Field>
              <Field label="น้ำหนัก" unit="kg/m"><NumberInput value={lineL.q} step="10" onChange={(v) => setList("lineLoads", { q: v })} /></Field>
              <Result className="col-span-2">{({ cant: "อยู่ปลายพื้นยื่น → ลงคานริม + แรงบิด", beam: "อยู่บนคาน → ลงคาน", panel: "อยู่บนพื้น → กระจายลงแผ่นพื้น" })[an.lineLoads?.[sel.i]?.on] ?? "ไม่มีอะไรรับ"}</Result>
            </div>)}
            {pointL && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ"><input value={pointL.name ?? ""} onChange={(e) => setList("pointLoads", { name: e.target.value })} className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[13px]" /></Field>
              <Field label="น้ำหนัก" unit="kg"><NumberInput value={pointL.P} step="50" onChange={(v) => setList("pointLoads", { P: v })} /></Field>
              <Field label="X" unit="m"><NumberInput value={pointL.p[0]} step="0.05" onChange={(v) => setList("pointLoads", { p: [v, pointL.p[1]] })} /></Field>
              <Field label="Y" unit="m"><NumberInput value={pointL.p[1]} step="0.05" onChange={(v) => setList("pointLoads", { p: [pointL.p[0], v] })} /></Field>
              <Result className="col-span-2">{({ beam: "อยู่บนคาน → แรงจุดบนคาน", panel: "อยู่บนพื้น → กระจายลงแผ่นพื้น" })[an.pointLoads?.[sel.i]?.on] ?? "ไม่มีอะไรรับ"}</Result>
            </div>)}
            {cant && (<div className="grid grid-cols-2 gap-3">
              <Field label="ยื่น" unit="m"><NumberInput value={cant.L} step="0.1" onChange={(v) => setCant({ L: v })} /></Field>
              <Field label="ด้าน"><button onClick={() => setCant({ side: -(cant.side ?? 1) })} className={`${btnGhost} h-8 w-full`}>สลับด้าน</button></Field>
              <Field label="หนา" unit="m"><NumberInput value={cant.t ?? fl.t} step="0.01" onChange={(v) => setCant({ t: v })} /></Field>
              <Field label="ปูผิว" unit="kg/m²"><NumberInput value={cant.finish ?? fl.finish} step="10" onChange={(v) => setCant({ finish: v })} /></Field>
              <Field label="จร" unit="kg/m²"><NumberInput value={cant.live ?? fl.live} step="50" onChange={(v) => setCant({ live: v })} /></Field>
              <Result className="col-span-2">คานริมรับ w·L = {fmt((an.cants[sel.i]?.w ?? 0) * cant.L, 0)} กก./ม. และแรงบิด wL²/2 = {fmt(((an.cants[sel.i]?.w ?? 0) * cant.L ** 2) / 2, 0)} กก.-ม./ม. (ตรวจในคาน)</Result>
            </div>)}
            {beam && (<div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="Type"><Select value={beam.type ?? ""} onChange={(v) => setBeam({ type: v === "" ? null : Number(v), autoLock: undefined })} options={[["", "อัตโนมัติ (โปรแกรมเลือก)"], ...types.map((t, i) => [i, `${t.name} · ${Math.round(t.b * 100)}×${Math.round(t.h * 100)}${t.manual ? " (สร้างเอง)" : ""}`])]} /></Field></div>
              {(() => { const n = beamTypeNote(sel.i); return <p className="col-span-2 -mt-2 text-[11px] text-gray-500">{n.text}{n.sug != null && types[n.sug] && <> · <span className="font-medium text-red-600">ไม่ผ่าน — {types[n.sug].name} ผ่าน (ประมาณจากแรงตอนนี้)</span> <button onClick={() => setBeam({ type: n.sug, autoLock: undefined })} className="ml-1 rounded bg-brand-500 px-1.5 py-0.5 font-medium text-[#fff]">ใช้ {types[n.sug].name}</button></>}</p>; })()}
              <Field label={beam.arc?.s ? "ยาวตามส่วนโค้ง" : "ยาว"} unit="m"><div className="flex h-8 items-center text-[13px] font-medium tabular-nums">{fmt(arcGeom(beam.a, beam.b, beam.arc?.s)?.L ?? Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1]), 2)}</div></Field>
              <Field label="ระดับคาน (ม. จากพื้นชั้นล่าง)">
                <NumberInput value={beam.lvl ?? ""} step="0.05" onChange={(v) => setBeam({ lvl: v > 0 ? v : undefined })} /></Field>
              <p className="col-span-2 -mt-2 text-[11px] text-gray-500">เว้นว่าง = คานระดับพื้นชั้นนี้ · ใส่ค่า = คานกลางชั้น เช่น คานรับชานพักบันได (วางบนเสาของชั้นนี้ ไม่รับพื้น)</p>
              {(() => { const lv = an.levels?.beams?.[sel.i]; if (!lv || beam.lvl > 0) return null; // levels (2026-11-20): from the slabs beside it, or set here
                const js = (an.levels?.steps ?? []).filter((j) => j.hi === sel.i || j.lo === sel.i), cm = (v) => fmt(v * 100, 0), tb = types[an.beamTypeOf?.[sel.i] ?? beam.type ?? 0];
                return (<>
                  <Field label="ระดับหลังคาน (เทียบระดับชั้น)" unit="m"><NumberInput value={lv.top} step="0.05" onChange={(v) => setBeam({ dz: Number.isFinite(v) ? v : undefined })} /></Field>
                  {!lv.auto ? <button onClick={() => setBeam({ dz: undefined })} className={`${btnGhost} self-end`}>ใช้ระดับตามพื้น</button> : <div />}
                  {(lv.top !== 0 || lv.up > 0 || js.length > 0 || !lv.auto) && <Result className="col-span-2">
                    {lv.auto ? "ระดับตามแผ่นพื้นสองข้าง" : "ระดับกำหนดเอง"} · หลังคาน {lv.top > 0 ? "+" : ""}{fmt(lv.top, 2)} ม.
                    {lv.up > 0 && <> · พื้นอีกข้างสูงกว่าหลังคาน {cm(lv.up)} ซม. (ขอบพื้นฝั่งนั้นวางสูงกว่าคาน — ทำคันคอนกรีตบนคานหรือให้พื้นฝั่งนั้นพาดทางอื่น)</>}
                    {js.map((j) => <span key={`${j.t}`} className="block">ต่างระดับ {cm(j.dz)} ซม. ที่ ({fmt(j.p[0], 2)}, {fmt(j.p[1], 2)}): {j.hi === sel.i ? `เป็นคานตัวสูง — เหล็กบนของคานนี้งอขอ 90° ลงใน${j.col ? "เสา (ถ้าเสายาวไม่พอให้ขอยึด ldh จะตรวจที่หัวเสาด้วย h − " + cm(j.dz) + " ซม. — ดูผลรายช่วง)" : "คาน · ตรวจทั้งช่วงด้วย h − " + cm(j.dz) + " ซม."}` : "เป็นคานตัวต่ำ — เหล็กบนวิ่งผ่านเสาเข้าไปในคานตัวสูงยาว ≥ ld"}{!j.ok ? " · ไม่ผ่าน: ความลึกเหลือไม่พอ" : ""}</span>)}
                  </Result>}</>); })()}
              {!(beam.lvl > 0) && (() => { const WT = widenTypesOf(frame), list = widensOf(beam), cs = an.widen?.[sel.i] ?? [], L = Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1]);
                // side widenings (พอกข้าง, user 2026-11-20): one or more per beam — e.g. both sides, or two parts of one side
                const put = (k, patch) => setBeam({ widen: list.map((x, q) => (q === k ? { ...x, ...patch } : x)) });
                const del = (k) => { const nl = list.filter((_, q) => q !== k); setBeam({ widen: nl.length ? nl : undefined }); };
                const add = () => setBeam({ widen: [...list, { type: 0, side: list.length ? -(list[0].side ?? 1) : 1 }] });
                return (<div className="col-span-2 space-y-2">
                  <div className="flex items-center justify-between gap-2"><span className="text-[12px] font-medium text-gray-700">พอกข้างคาน (รับผนังก่อ){list.length ? ` · ${list.length} ส่วน` : ""}</span>
                    <button onClick={add} className={btnGhost}>+ {list.length ? "เพิ่มพอกอีกด้าน / อีกช่วง" : "เพิ่มพอกข้าง"}</button></div>
                  {list.length > 0 && <WidenBeamSection frame={frame} an={an} i={sel.i} beam={beam} width={300} />}
                  {list.map((wd, k) => { const c = cs[k]; return (<div key={k} className="space-y-2 rounded-md p-2 ring-1 ring-gray-200">
                    <div className="grid grid-cols-2 gap-2">
                      <Field label={`พอกข้าง ${k + 1}`}><Select value={String(wd.type)} onChange={(v) => put(k, { type: +v })} options={WT.map((t, j) => [String(j), `${t.name} กว้าง ${fmt(t.w * 100, 0)} ซม.`])} /></Field>
                      <Field label="ด้าน (มองจากต้น → ปลายคาน)"><Select value={String(wd.side ?? 1)} onChange={(v) => put(k, { side: +v })} options={[["1", "ซ้าย"], ["-1", "ขวา"]]} /></Field>
                      <Field label="ตั้งแต่ (ม. จากต้นคาน)" unit="m"><NumberInput value={wd.from ?? 0} step="0.1" onChange={(v) => put(k, { from: v > 0 ? Math.min(v, L) : undefined })} /></Field>
                      <Field label={`ถึง (คานยาว ${fmt(L, 2)})`} unit="m"><NumberInput value={wd.to ?? +L.toFixed(3)} step="0.1" onChange={(v) => put(k, { to: Number.isFinite(v) && v < L - 1e-6 ? Math.max(v, wd.from ?? 0) : undefined })} /></Field>
                      <Field label="เยื้องผนัง e (ว่าง = ผิวนอกเสมอพอก)" unit="m"><NumberInput value={wd.e ?? ""} step="0.01" onChange={(v) => put(k, { e: Number.isFinite(v) && v > 0 ? v : undefined })} /></Field>
                      <div className="flex items-end justify-end gap-1">{(wd.from || wd.to != null) && <button onClick={() => put(k, { from: undefined, to: undefined })} className={btnGhost}>ทั้งเส้น</button>}
                        <button onClick={() => del(k)} className="rounded-md px-2 py-1 text-[12px] text-red-600 hover:bg-red-50">ลบ</button></div>
                    </div>
                    {c && <Result>พอกยาว {fmt(c.len, 2)} ม. · น้ำหนักส่วนพอก {fmt(c.qw, 0)} กก./ม. · ผนัง {fmt(c.qWall, 0)} กก./ม. เยื้อง e = {fmt(c.e, 3)} ม. → แรงบิด {fmt(c.m, 0)} กก.-ม./ม. (แรงบิดสมดุล รับเต็ม)
                    <span className="block">รอยต่อส่วนพอก–คาน: Vu = 1.4(พอก + ผนัง) = {fmt(c.Vu, 0)} ≤ φVn = 0.75·1.4·fy·Avf = {fmt(c.phiVn, 0)} กก./ม. <b className={c.ok ? "text-green-600" : "text-red-600"}>{c.ok ? "ผ่าน" : "ไม่ผ่าน"}</b></span>
                    <span className="block">ปลอกส่วนพอก ≤ {fmt(Math.min(c.sMax, c.sReq), 3)} ม. (d/2 ≤ 0.30 และแรงเฉือนผ่านรอยต่อ) · เหล็กยืน {fmt(c.AsL, 2)} ≥ {fmt(c.AsMinL, 2)} ซม.² ห่าง {fmt(c.gap, 2)} ≤ 0.30 ม.</span>
                    {c.why.map((w) => <span key={w} className="block text-red-600">• {w}</span>)}</Result>}
                  </div>); })}</div>); })()}
              <div className="col-span-2"><Field label="บทบาทที่จุดตัดคาน (ไม่มีเสา)"><Select value={beam.role ?? ""} onChange={(v) => setBeam({ role: v || undefined })} options={[["", "อัตโนมัติ (คานที่มีเสามากกว่า / ช่วงสั้นกว่า = คานหลัก)"], ["main", "คานหลัก — คานอื่นวางบนคานนี้"], ["secondary", "คานซอย — วางบนคานที่ตัดผ่าน"]]} /></Field></div>
              {(() => { const mine = an.lines.filter((l) => l.members.includes(sel.i)), rests = mine.flatMap((l) => l.carriers.map((c) => an.lines.find((o) => o.id === c.host)?.id + 1)).filter(Boolean), carries = an.lines.filter((o) => o.carriers.some((c) => mine.some((l) => l.id === c.host))).map((o) => o.id + 1);
                return <Result className="col-span-2">{rests.length ? `วางบนแนว ${[...new Set(rests)].join(", ")}` : "วางบนเสา"}{carries.length ? ` · รับแนว ${[...new Set(carries)].join(", ")}` : ""}</Result>; })()}
              {step === "frame" && (<>
              <div className="col-span-2"><Field label="คานโค้ง: ระยะป่องกลางช่วง" unit="m (+ ซ้าย / − ขวา)"><NumberInput value={beam.arc?.s ?? 0} step="0.05" onChange={(v) => setBeam({ arc: v ? { s: v } : undefined })} /></Field></div>
              <div className="col-span-2 -mt-1 flex flex-wrap items-end gap-1 text-[12px]">{[["¼ วงกลม ซ้าย", 1], ["¼ วงกลม ขวา", -1], ["ตรง", 0]].map(([lab, sg]) => (
                <button key={lab} onClick={() => setBeam({ arc: sg ? { s: sg * quarterSagitta(Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1])) } : undefined })} className={btnGhost}>{lab}</button>))}</div></>)}
              {beam.arc?.s ? <p className="col-span-2 text-[11px] text-gray-500">R = {fmt(arcGeom(beam.a, beam.b, beam.arc.s).R, 2)} ม. · มุม {fmt((arcGeom(beam.a, beam.b, beam.arc.s).th * 180) / Math.PI, 0)}° · โครง 3 มิติแบ่ง 12 ชิ้นตามส่วนโค้ง (มีแรงบิดจากความโค้ง) · คานต่อเนื่องใช้ช่วงตามคอร์ด</p> : null}
              {(() => { const on = line ? an.walls.filter((w) => w.on.some((o) => o.line === line.id)) : []; return (
                <p className="col-span-2 text-[11px] text-gray-500">ผนังบนแนวคานนี้: {on.length ? on.map((w) => `ผนัง ${w.i + 1} ${fmt(w.q, 0)}`).join(" · ") + ` กก./ม. (รวม ${fmt(on.reduce((s, w) => s + w.q, 0), 0)})` : "ไม่มี"} — แก้ที่ขั้น 5 น้ำหนักบรรทุก</p>); })()}
              {(step === "analysis" || step === "design") && (() => { const sps = an.spans.filter((s) => (s.members ?? [s.member]).includes(sel.i)); return sps.length ? (
                <div className="col-span-2 space-y-1.5 text-[12px]">{sps.map((s) => { const why = spanReasons(s.check); return (
                  <div key={s.id} className={`rounded-md px-2 py-1.5 ring-1 ${s.ok ? "ring-gray-200" : "bg-red-50 ring-red-200 dark:bg-red-500/10"}`}>
                    <div className="flex justify-between tabular-nums"><span className="font-medium">ช่วง {s.id} · {s.typeName ?? s.type.name} · {fmt(s.len, 2)} ม.</span><span className={s.ok ? "text-green-600" : "text-red-600"}>{s.ok ? "ผ่าน" : "ไม่ผ่าน"} · {s.check.util >= 8.99 ? "เกินกำลังหน้าตัด" : `ใช้ ${fmt(s.check.util * 100, 0)}%`}</span></div>
                    <div className="text-gray-500 tabular-nums">M+ {fmt(s.Mpos, 0)} · M− {fmt(s.Mneg, 0)} กก.-ม. · V {fmt(s.V, 0)} กก.{s.Mt ? ` · T ${fmt(s.Mt, 0)} กก.-ม.` : ""}</div>
                    {(s.hCut > 0 || s.stepSup) && <div className="text-gray-600">ต่างระดับ:{s.hCut > 0 ? ` ตรวจทั้งช่วงด้วยความลึก h − ${fmt(s.hCut * 100, 0)} ซม.` : ""}{(s.check?.stepHook ?? []).map((h, q) => <span key={q}> · หัวเสา{h.ok ? `: เหล็กบนงอขอในเสาได้ (ldh ${fmt(h.ldh, 1)} ≤ ${fmt(h.avail, 1)} ซม.) ใช้ความลึกเต็ม` : `: งอขอในเสาไม่พอ (ldh ${h.ldh == null ? "-" : fmt(h.ldh, 1)} > ${fmt(h.avail, 1)} ซม.) → ตรวจด้วย h − ${fmt((s.check.step?.cut ?? 0) * 100, 0)} ซม. (เหล็กบนที่วิ่งผ่านอยู่ระดับคานตัวต่ำ)`}</span>)}</div>}
                    {s.topFull && <div className="text-gray-600">เหล็กบน {s.topFull.bars} ยาวตลอดช่วง — {s.topFull.lifted ? "ปลายถูกยก" : "โมเมนต์ลบถึงกลางช่วง"} (M กลางช่วง {fmt(s.topFull.Mmid, 0)} กก.-ม.)</div>}
                    {s.detail && <div className="text-gray-600">คานยื่น: เหล็กบน {s.detail.bars} ยาวตลอด + งอขอที่ปลาย · {s.detail.noBack ? `ฝังในเสา ≥ ld ${fmt(s.detail.ld, 2)} ม.` : s.detail.through ? `ฝากตลอดช่วง ${s.detail.back}` : `ฝากเข้าช่วง ${s.detail.back} ${fmt(s.detail.ext, 2)} ม.`}</div>}
                    {why.map((t) => <div key={t} className="text-red-600">• {t}</div>)}
                    {s.ok && (() => { // why not a lighter type (user 2026-11-04: "คำนวณผิด?" — most spans looked under-used on the moment chart)
                      const lighter = types.map((t, i) => ({ t, i })).filter(({ t }) => t.b * t.h < s.type.b * s.type.h - 1e-9 || (t.b * t.h <= s.type.b * s.type.h + 1e-9 && t !== s.type && types.indexOf(t) < s.typeIdx)).slice(-2);
                      return lighter.map(({ t }) => { const c = checkEnv(t, s, frame.mat); return c.ok ? null : <div key={t.name} className="text-gray-500">ไม่ใช้ {t.name} ({Math.round(t.b * 100)}×{Math.round(t.h * 100)}) เพราะ: {spanReasons(c).slice(0, 2).join(" · ") || "ไม่ผ่าน"}</div>; });
                    })()}
                  </div>); })}</div>) : null; })()}
            </div>)}
            {col && (() => { const c = colAt(sel.i), st = res.stacks.find((s) => s.key === stackKey(col)); return (<div className="space-y-2 text-[13px]">
              <Field label="Type เสา (ทั้งต้นทุกชั้น)"><Select value={frame.colPick?.[stackKey(col)] ?? ""} onChange={(v) => set("colPick", { ...frame.colPick, [stackKey(col)]: v === "" ? null : Number(v) })} options={[["", "อัตโนมัติ"], ...cTypes.map((t, i) => [i, t.name])]} /></Field>
              <Result>X {fmt(col[0], 2)} · Y {fmt(col[1], 2)} · แรงจากคานชั้นนี้ <b>{fmt((c?.R ?? 0) / 1000, 2)} ตัน</b></Result>
              {st?.list.length > 0 && <List>{st.list.map((x) => <Row key={x.floor} title={`${frame.floors[x.floor].name} · ${x.lv.Bx}×${x.lv.By} ${x.lv.n}-${x.lv.mainBar}`} sub={`P ${fmt(x.Pbot / 1000, 2)} ตัน · ${colWhy(x)}`}
                value={<b className={`text-[13px] ${x.ok ? "text-green-600" : "text-red-600"}`}>{x.ok ? "ผ่าน" : "ไม่ผ่าน"}</b>} />)}</List>}
            </div>); })()}
            {panel && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชนิดพื้น"><Select value={panel.st} onChange={(v) => setPanel({ kind: v })} options={Object.entries(SLAB_KINDS)} /></Field>
              {panel.st === "PS" ? <Field label="ทิศวางแผ่น (ช่วงพาด)"><Select value={panel.dir} onChange={(v) => setPanel({ dir: v })} options={[["x", "แนว X ↔"], ["y", "แนว Y ↕"]]} /></Field> : <div />}
              <Field label="หนา" unit="m"><NumberInput value={panel.t} step="0.01" onChange={(v) => setPanel({ t: v })} /></Field>
              <Field label="ระดับพื้น (เทียบระดับชั้น)" unit="m"><NumberInput value={panel.dz ?? 0} step="0.05" onChange={(v) => setPanel({ dz: Math.abs(v) < 1e-9 ? undefined : v })} /></Field>
              <p className="col-span-2 -mt-2 text-[11px] text-gray-500">เช่น เฉลียงต่ำกว่าภายใน 10 ซม. = −0.10 · คานที่แผ่นนี้วางอยู่ลดระดับลงทั้งตัวตามนี้เอง (คานติดพื้นสองระดับ ใช้ระดับที่ต่ำกว่า)</p>
              {step === "loads" ? <>
              <Field label="ปูผิว" unit="kg/m²"><NumberInput value={panel.finish} step="10" onChange={(v) => setPanel({ finish: v })} /></Field>
              <Field label="จร" unit="kg/m²"><NumberInput value={panel.live} step="50" onChange={(v) => setPanel({ live: v })} /></Field>
              <Field label="ฝ้า/งานระบบเพิ่ม" unit="kg/m²"><NumberInput value={panel.extraSDL ?? 0} step="10" onChange={(v) => setPanel({ extra: v })} /></Field></>
              : <p className="col-span-2 self-end text-[11px] text-gray-500">น้ำหนักบนแผ่น (ปูผิว {fmt(panel.finish, 0)} · จร {fmt(panel.live, 0)} กก./ม.²) ใส่ที่ขั้น "น้ำหนักบรรทุก" → Load Cases</p>}
              <Field label="ช่องเปิด"><Select value={panel.open ? "1" : ""} onChange={(v) => setPanel({ open: !!v })} options={[["", "มีพื้น"], ["1", "ช่องเปิด (ไม่มีพื้น)"]]} /></Field>
              <Result className="col-span-2">{panel.st === "GS" ? "พื้นวางบนดิน — ไม่ส่งน้ำหนักลงคาน" : panel.st === "PS" ? `แผ่นพาด ${fmt(panel.span ?? 0, 2)} ม. → ลงคาน 2 ด้านที่รับปลายแผ่น` : panel.kind === "twoway" ? `พื้นสองทาง S/L = ${fmt(panel.m, 2)} → สามเหลี่ยม/คางหมู` : panel.kind === "oneway" ? "พื้นทางเดียว (L/S > 2) → ลงคานด้านยาว wS/2" : "รูปไม่ใช่สี่เหลี่ยม → แบ่งตามพื้นที่ (โดยประมาณ)"} · {fmt(panel.area, 2)} ม² · {["DL", "SDL", "WALL", "LL"].map((g) => `${g === "WALL" ? "ผนัง" : g} ${fmt(panel.g[g], 0)}`).join(" · ")} = <b>{fmt(panel.w, 0)} กก./ม²</b></Result>
            </div>)}
          </SidePanel>
  ) : step === "loads" && sub === "cases" ? (<LoadCases frame={frame} fl={fl} an={an} cur={cur} setFloor={setFloor} multi={multiSel} setPickSet={setPickSet} armed={armed} setArmed={setArmed} pickRef={pickRef} onLateral={() => setSubState("lateral")} />
  ) : step === "loads" && sub === "wall" ? (<WallTypesPanel wallTypes={wallTypes} setWallTypes={(v) => set("wallTypes", v)} frame={frame} />
  ) : step === "loads" && sub === "other" ? (<>
          <LoadLibPanel loadLib={loadLib} setLoadLib={(v) => set("loadLib", v)} libSel={libSel} setLibSel={setLibSel} />
          <SidePanel title="หลังคา และน้ำหนักอื่น" icon={Ruler}>
            <div className="space-y-2">
              {onRoofFromFrame && <RoofLinkCard frame={frame} roof={roof} onFromFrame={onRoofFromFrame} set={set} />}
              <button onClick={roofLoads} disabled={!roof?.pts} className={`${btnCls} w-full justify-center py-1.5`}>{frame.roofLink?.on ? `เชื่อมกับ ${frame.floors[frame.roofLink.floor]?.name ?? "-"} อยู่ · ย้ายมาชั้นนี้` : "เชื่อมแรงจากหลังคาลงชั้นนี้ (อัตโนมัติ)"}</button>
              {roofMsg && <Notice kind="warn">{roofMsg}</Notice>}
            </div>
            <Note>ราวกันตก / น้ำหนักเส้น: วาดที่ปลายพื้นยื่น (ลงคานริม + แรงบิด) บนคาน หรือบนพื้น · น้ำหนักจุด: คลิกวาง · ฝ้า / งานระบบ: แก้ที่แผ่นพื้น (ขั้น 2)</Note>
          </SidePanel></>
  ) : step === "stair" ? (          <SidePanel title="บันได" icon={Ruler}><p className="text-[12px] leading-relaxed text-gray-600">บันไดท้องเรียบ: เครื่องมือ "บันไดเส้น" บนแปลนชั้นที่มีคานรับหัวบันได — คลิกบนคานบน แล้วคลิกจุดเริ่มบันได · ความสูง ระดับต้นบันได กว้าง ลูกตั้ง ลูกนอน แก้ที่แผงนี้หลังคลิกบันได · แบบอื่น ใช้ "บันได (กรอบ)": วาดบันไดบนชั้นที่บันไดเริ่มขึ้น แล้วบันไดจะขึ้นไปชั้นบนถัดไป (เก็บไว้ที่ชั้นบน แสดงเป็นเส้นประบนชั้นนี้ คลิกเพื่อแก้) · วาดกรอบช่องบันได แล้วเลือกแบบ: {Object.values(STAIR_KINDS).join(" · ")} · ปลายล่างของแบบพาดตามยาว/มีชานพักลงคานชั้นล่างที่แนวเดียวกัน</p><Note>คลิกบันไดบนแปลนเพื่อแก้ขนาด ทิศ น้ำหนัก และเหล็กเสริม</Note></SidePanel>
  ) : step === "slab" ? (<>          <Card title="พื้น" icon={Ruler}><p className="text-[12px] text-gray-500">คลิกแผ่นพื้นเพื่อเลือกชนิด S หล่อในที่ / PS พื้นสำเร็จ (เลือกทิศวางแผ่น) / GS วางบนดิน หรือช่องเปิด · เครื่องมือ "พื้นยื่น" คลิกบนคานด้านที่จะยื่น · ค่าเริ่มต้นความหนา ปูผิว จร อยู่ในการ์ดชั้น</p></Card>
    <Card title={`ค่าเริ่มต้นแผ่นพื้น — ${fl.name}`} icon={Layers}>
          <div className="grid grid-cols-2 gap-3">
            {fv("t", "พื้นหนา", "m", "0.01")}{fv("finish", "วัสดุปูผิว", "kg/m²", "10")}{fv("live", "น้ำหนักจร", "kg/m²", "50")}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">ใช้กับทุกแผ่นที่ไม่ได้กำหนดเอง · แก้ทีละหลายแผ่นได้ในตาราง "แผ่นพื้นทั้งชั้น" ด้านล่าง</p>
        </Card></>
  ) : step === "grid" ? (<>
    <StoreyTable frame={frame} set={set} cur={cur} goFloor={goFloor} />
              <SidePanel title="กริด (ระยะแกน ม.)" icon={Ruler}>
            <div className="space-y-2">
              {gridInput("dx", "แกน X (A, B, …)")}{gridInput("dy", "แกน Y (ล่าง → บน)")}
              <Field label="แบ่งช่องกริด"><Select value={G.sub ?? 1} onChange={(v) => setGrid({ ...G, sub: Number(v) })} options={[1, 2, 3, 4].map((v) => [v, v === 1 ? "เฉพาะแกน" : `ช่องละ ${v}`])} /></Field>
            </div>
          </SidePanel></>
  ) : step === "analysis" || step === "design" ? (
    <SidePanel icon={Layers} title={line?.res ? `แรงเฉือน / โมเมนต์ แนวคาน ${line.id + 1}` : (boardStep === "cols" ? `อัตราใช้งานเสา ใต้${fl.name}` : `อัตราใช้งานคาน ${fl.name}`)}
          hint={line?.res ? `ยาว ${fmt(line.L, 2)} ม.` : "ค่ามากสุดของ เหล็กที่ต้องการ/ที่ใส่ · แรงเฉือน · ระยะแอ่น (ไม่รวมข้อกำหนดระยะปลอก d/2 — คลิกคานดูเหตุผล)"}>
          {line?.res ? <ForceCharts L={line.L} fns={{ V: line.res.V, M: line.res.M }} dark={dark} height={260} animate={false} /> : <UtilBars items={boardStep === "cols" ? colsHere.map((c) => ({ label: `${cTypes[c.typeIdx]?.name} ${stackKey(c.p)}`, util: c.check.util, ok: c.ok, color: TYPE_COLORS[c.typeIdx % TYPE_COLORS.length], sel: { kind: "column", i: c.i } }))
            : an.spans.map((s) => ({ label: `${s.id} ${s.typeName ?? types[s.typeIdx]?.name ?? ""}`, util: s.check.util, ok: s.ok, color: TYPE_COLORS[s.typeIdx % TYPE_COLORS.length], sel: { kind: "beam", i: s.member } }))} dark={dark} height={260} onPick={(x) => x?.sel && setSel(x.sel)} />}
        </SidePanel>
  ) : step === "footing" ? (<>
    <SidePanel title="สรุปฐานราก" icon={Layers}>
      <Notice kind={res.footings.every((f) => f.ok) ? "ok" : "bad"}>ผ่าน {res.footings.filter((f) => f.ok).length}/{res.footings.length} ฐาน · แรงรวม {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</Notice>
      <Section title="ชนิดฐานรากที่ใช้" className="mt-3"><List>
      {[...new Set(res.footings.map((f) => f.type ?? "อัตโนมัติ"))].map((ty) => { const fs = res.footings.filter((f) => (f.type ?? "อัตโนมัติ") === ty), g = fs[0], ng = fs.filter((f) => !f.ok).length;
        return <Row key={ty} title={ty} sub={g.kind === "spread" ? `ฐานแผ่ ${fmt(g.r?.Bx ?? 0, 2)} × ${fmt(g.r?.By ?? 0, 2)} ม.` : `${g.n} × ${g.pile}`} badge={ng > 0 && <span className="shrink-0 rounded bg-red-50 px-1 text-[10px] text-red-600">ไม่ผ่าน {ng}</span>} value={fs.length} unit="ฐาน" />; })}
      </List></Section>
    </SidePanel>
    <Frame3D frame={frame} res={res} cur={cur} roof={roof} dark={dark} className="h-[300px] overflow-hidden rounded-xl border border-gray-200" />
  </>  ) : step === "project" ? (
    <SidePanel title="ภาพรวมโครงการ" icon={Layers}>
      <List>{[...frame.floors.keys()].reverse().map((k) => <Row key={k} title={frame.floors[k].name} sub={`${frame.floors[k].columns.length} เสา · ${frame.floors[k].beams.length} คาน`} value={fmt(frame.floors[k].h ?? 0, 2)} unit="ม. (สูงชั้น)" />)}</List>
      <Note>ระดับและความสูงชั้นแก้ในขั้น 1 · น้ำหนักพื้นแก้ในขั้น 5 น้ำหนักบรรทุก / ตาราง "แผ่นพื้นทั้งชั้น"</Note>
    </SidePanel>
  ) : <SidePanel title={`ชั้น ${fl.name}`} icon={Layers}>
          <div className="grid grid-cols-2 gap-3">
            {fv("t", "พื้นหนา (ค่าเริ่มต้น)", "m", "0.01")}
          </div>
          {(() => { // floor summary (user: the empty right card): counts, loads, what fails — click selects it
            const ngS = an.spans.filter((x) => !x.ok), ngC = colsHere.filter((c) => !c.ok), tot = Object.values(an.groups ?? {}).reduce((a, b) => a + b, 0);
            return <Section title="สรุปชั้นนี้" className="mt-3">
              <List>
                <Row title="เสา · คาน · แผ่นพื้น" value={`${fl.columns.length} · ${fl.beams.length} · ${an.panels.length}`} unit="ชิ้น" />
                <Row title="น้ำหนักลงเสาทั้งชั้น" value={fmt(tot / 1000, 1)} unit="ตัน" />
                <Row title="ช่วงคานผ่าน" value={<b className={`text-[14px] ${ngS.length ? "text-red-600" : "text-green-600"}`}>{an.spans.length - ngS.length}/{an.spans.length}</b>} />
                <Row title="เสาใต้ชั้นนี้ผ่าน" value={<b className={`text-[14px] ${ngC.length ? "text-red-600" : "text-green-600"}`}>{colsHere.length - ngC.length}/{colsHere.length}</b>} />
              </List>
              {(ngS.length > 0 || ngC.length > 0) && <div className="mt-2 max-h-40 space-y-0.5 overflow-auto rounded-md bg-red-50 p-1.5 text-[12px] text-red-700 dark:bg-red-500/10">
                {ngS.map((x) => <button key={x.id} onClick={() => setSel({ kind: "beam", i: x.member })} className="block w-full truncate text-left hover:underline">✕ ช่วง {x.id} {x.typeName ?? x.type?.name} — {spanReasons(x.check)[0] ?? "ไม่ผ่าน"}</button>)}
                {ngC.map((c) => <button key={c.i} onClick={() => setSel({ kind: "column", i: c.i })} className="block w-full truncate text-left hover:underline">✕ เสา ({fmt(fl.columns[c.i]?.[0], 2)}, {fmt(fl.columns[c.i]?.[1], 2)}) {cTypes[c.typeIdx]?.name}</button>)}</div>}
            </Section>; })()}
          <Note>{step === "frame" ? "วาดเสา คาน แล้วคลิกแผ่นพื้นที่เกิดจากคานล้อมรอบเพื่อเลือกชนิด S / PS / GS ความหนา ช่องเปิด · เครื่องมือ \"พื้นยื่น\" คลิกบนคานด้านที่จะยื่น · ตารางแผ่นพื้นทั้งชั้นอยู่แถบขวา · " : ""}น้ำหนักปูผิว / จร ใส่ที่ขั้น "น้ำหนักบรรทุก" · ระดับ / ความสูงชั้นแก้ในขั้น 1</Note>
        </SidePanel>;
  const [drawer, setDrawer] = useState(null), resultStep = ["analysis", "design", "footing"].includes(step);
  setDrawerRef.current = setDrawer;
  // side panels (tables / warnings) on the right, opened on demand from the tab rail
  const tabsNow = resultStep ? drawerTabs : [...(bulkTab ? [bulkTab] : []), ...drawerTabs.filter(([k]) => k === "warn")];
  const dTab = tabsNow.some(([k]) => k === drawer) ? drawer : null;
  const lineDiagram = showLine && (
    <div className="min-h-0 overflow-auto rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-[#344054]">
        <span className="font-semibold">น้ำหนัก · แรงเฉือน · โมเมนต์ — {fl.name}</span>
        <select value={showLine.id} onChange={(e) => { setSel(null); setLineId(Number(e.target.value)); }} className="h-7 rounded-md border border-gray-300 bg-[#fff] px-1 text-[12px] text-[#344054]">
          {an.lines.filter((l) => l.res).map((l) => <option key={l.id} value={l.id}>แนว {l.id + 1}: ({fmt(l.A[0], 2)}, {fmt(l.A[1], 2)}) → ({fmt(l.B[0], 2)}, {fmt(l.B[1], 2)}){l.arc ? " โค้ง" : ""}</option>)}
        </select>
        <span className="ml-auto text-[11px] text-[#98a2b3]">คลิกคานบนแปลนเพื่อเลือกแนว</span>
      </div>
      <LineDiagram ln={showLine} f3={res.frame3d?.members.filter((m) => m.floor === cur)} wide />
      <table className="mt-1 w-full border-collapse text-[12px] tabular-nums text-[#344054]">
        <thead><tr className="border-b border-[#e4e7ec] text-left text-[11px] text-[#667085]">{["ช่วง", "Type", "ยาว (ม.)", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "T (กก.-ม.)", "ใช้", "ผล"].map((h) => <th key={h} className="px-1 py-0.5 font-medium">{h}</th>)}</tr></thead>
        <tbody>{an.spans.filter((x) => x.line === showLine.id).map((x) => <tr key={x.id} onClick={() => setSel({ kind: "beam", i: x.member })} className="cursor-pointer border-b border-[#f2f4f7] hover:bg-[#f9fafb]">
          <td className="px-1">{x.id}</td><td className="px-1 font-semibold" style={{ color: TYPE_COLORS[x.typeIdx % TYPE_COLORS.length] }}>{x.typeName ?? types[x.typeIdx]?.name}</td><td className="px-1">{fmt(x.len, 2)}</td>
          <td className="px-1">{fmt(x.Mpos, 0)}</td><td className="px-1">{fmt(x.Mneg, 0)}</td><td className="px-1">{fmt(x.V, 0)}</td><td className="px-1">{x.Mt ? fmt(x.Mt, 0) : "-"}</td>
          <td className="px-1">{fmt(x.check.util * 100, 0)}%</td><td className={`px-1 ${x.ok ? "text-[#12b76a]" : "font-semibold text-[#d92d20]"}`}>{x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>)}</tbody>
      </table>
    </div>);
  // overlapping beams on any floor (user 2026-11-04: beams drawn twice without noticing) — one bar above the centre, every step
  const ovAll = frame.floors.map((f) => findOverlaps(f.beams ?? [])), ovN = ovAll.reduce((s, o) => s + o.length, 0);
  const fixOverlaps = () => set("floors", frame.floors.map((f, k) => (ovAll[k].length ? { ...f, beams: mergeOverlaps(f.beams) } : f)));
  const overlapBar = ovN > 0 && (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[12px] text-red-700">
      <TriangleAlert className="h-4 w-4 shrink-0" />
      <span><b>คานซ้อนกัน {ovN} คู่</b> — {frame.floors.map((f, k) => ovAll[k].length ? `${f.name}: ${ovAll[k].map((o) => `คาน ${o.i + 1}/${o.j + 1} (${fmt(o.len, 2)} ม.)`).join(", ")}` : null).filter(Boolean).join(" · ")} · น้ำหนักคานคิดซ้ำ (เส้นแดงประบนแปลน)</span>
      {ovAll[cur].length > 0 && <button onClick={() => setSel({ kind: "beam", i: ovAll[cur][0].j })} className="rounded-md px-2 py-0.5 ring-1 ring-red-300 hover:bg-red-100">ดูคู่แรก</button>}
      <button onClick={() => { setSel(null); fixOverlaps(); }} className="rounded-md bg-red-600 px-2 py-0.5 font-medium text-white hover:bg-red-700">รวมคานซ้อนทุกชั้น</button>
    </div>);
  const center = page ? <div className="min-h-0 flex-1 overflow-auto p-1">{page}</div>
    : step === "stair" && stair && view === "2d" ? <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(340px,1fr)_1fr] max-xl:grid-rows-[minmax(260px,1fr)_auto]"><div className="flex min-h-0 flex-col overflow-hidden">{boardEl}</div>
      <StairDetail st={stair} i={sel.i} H={stairRiseOf(frame, cur, stair)} r0={an.stairs?.[sel.i]} row={designSlabs(an, fl, frame.mat).find((x) => x.kind === "ST" && x.si === sel.i)}
        secs={stairSections(frame, res, cur, sel.i)} onDxf={() => { const all = allStairSections(frame, res), { dxf } = stairSheetsDxf(all, project ?? {}); downloadText(dxf, `แบบขยายบันได.dxf`); }} /></div>
    : step === "analysis" && sub === "cont" && view === "2d" ? <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(340px,2fr)_3fr] max-xl:grid-rows-[minmax(260px,1fr)_auto]"><div className="flex min-h-0 flex-col overflow-hidden">{boardEl}</div>{lineDiagram}</div>
    : step === "footing" ? view3d
    : view === "3d" ? view3d : view === "split" ? <div className="grid min-h-0 flex-1 grid-cols-2 gap-3"><div className="min-h-0">{boardEl}</div>{view3d}</div> : boardEl;
  const warnList = res.warnings.length ? res.warnings.map((w) => { const at = locateWarning(w, frame, res); return (
                  <p key={w} onMouseEnter={() => at && highlight(at)} onMouseLeave={() => pinW !== w && highlight(pinW ? locateWarning(pinW, frame, res) : null)} onClick={() => { if (!at) return; const off = pinW === w; setPinW(off ? null : w); highlight(off ? null : at); if (!off && at.floor !== undefined && at.floor !== cur) goFloor(at.floor); }}
                    className={`rounded px-1 py-0.5 text-[12px] text-red-600 ${at ? "cursor-pointer hover:bg-red-50" : ""} ${pinW === w ? "bg-red-50 ring-1 ring-red-300" : ""}`} title={at ? "ชี้ = กระพริบบนแปลน / 3D · คลิก = ค้างไว้ (และไปชั้นนั้น) · คลิกซ้ำ = เลิก" : ""}>{at?.p || at?.segs?.length ? "⌖ " : ""}{w}</p>); }) : <p className="text-[12px] text-gray-400">ไม่มีคำเตือน</p>;
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId={`structcalc.panels.${dTab && dTab !== "warn" ? "3" : "2"}`} className="min-w-0 flex-1">
        <Panel id="centre" order={1} minSize={30} className="flex min-w-0 flex-col">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          {!(boardOnly && !page) && <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5">{tabsBar}</div>}
          <div className={`relative flex min-h-0 flex-1 flex-col ${focus ? "p-1.5" : "p-2"}`}>{overlapBar}{center}
            {dTab === "warn" && ( // warnings float over the plan (user 2026-11-04: the side panel made the plan smaller)
              <div className="absolute right-4 top-4 z-30 flex max-h-[60%] w-[min(460px,60%)] flex-col rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-1.5 text-[13px] font-semibold text-gray-800">⚠ คำเตือน ({res.warnings.length})
                  <span className="text-[11px] font-normal text-gray-400">ชี้ = กระพริบบนแปลน · คลิก = ค้างไว้</span>
                  <button onClick={() => { setDrawer(null); setPinW(null); highlight(null); }} className="ml-auto rounded-md px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">ปิด ✕</button></div>
                <div className="min-h-0 flex-1 overflow-auto p-2">{warnList}
                  {(res.notes ?? []).length > 0 && <div className="mt-2 border-t border-gray-200 pt-1.5"><p className="mb-0.5 text-[11px] font-semibold text-gray-500">หมายเหตุ ({res.notes.length}) — ตรวจแล้วไม่เป็นปัญหา แต่ต้องทำตามในแบบ</p>
                    {res.notes.map((w) => { const at = locateWarning(w, frame, res); return <p key={w} onMouseEnter={() => at && highlight(at)} onMouseLeave={() => highlight(pinW ? locateWarning(pinW, frame, res) : null)} className={`rounded px-1 py-0.5 text-[12px] text-gray-600 ${at ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/5" : ""}`}>{at?.p || at?.segs?.length ? "⌖ " : ""}{w}</p>; })}</div>}
                </div>
              </div>)}
          </div>
        </section>
        </Panel>
        {dTab && dTab !== "warn" && <><Handle /><Panel id="side" order={2} defaultSize={34} minSize={20} className="flex min-w-0 flex-col border-l border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800">{tabsNow.find(([x]) => x === dTab)?.[1]}
            <button onClick={() => setDrawer(null)} className="ml-auto rounded-md px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">ปิด ✕</button></div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
              {dTab === "panels" ? <PanelTable an={an} fl={fl} setFloor={setFloor} dark={dark} mode="struct" /> : dTab === "panelsL" ? <PanelTable an={an} fl={fl} setFloor={setFloor} dark={dark} mode="load" /> : dTab === "bwalls" ? <BeamLoadTable fl={fl} setFloor={setFloor} wallTypes={wallTypes} resolveW={resolveW} dark={dark} /> : dTab === "spans" ?             <div className="text-[12px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["ช่วง", "ยาว", "ชนิด", "Type", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "T (กก.-ม.)", "ใช้", "ผล"].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
                <tbody>{an.spans.map((s) => (
                  <tr key={s.id} onClick={() => setSel({ kind: "beam", i: s.member })} className={`cursor-pointer border-b border-gray-100 tabular-nums ${sel?.kind === "beam" && sel.i === s.member ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                    <td className="px-1 py-0.5">{s.id}</td><td className="px-1">{fmt(s.len, 2)}</td><td className="px-1">{KIND_TH[s.kind]}</td>
                    <td className="px-1 font-semibold" style={{ color: TYPE_COLORS[s.typeIdx % TYPE_COLORS.length] }}>{s.typeName ?? types[s.typeIdx]?.name}{s.own ? "" : " (อัตโนมัติ)"}</td>
                    <td className="px-1">{fmt(s.Mpos, 0)}{s.src?.Mpos && s.src.Mpos !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.Mpos ?? "โครง 3 มิติ"}> {s.src.Mpos === "LAT" ? "L" : "3D"}</sup>}</td><td className="px-1">{fmt(s.Mneg, 0)}{s.src?.Mneg && s.src.Mneg !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.Mneg ?? "โครง 3 มิติ"}> {s.src.Mneg === "LAT" ? "L" : "3D"}</sup>}</td><td className="px-1">{fmt(s.V, 0)}{s.src?.V && s.src.V !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.V ?? "โครง 3 มิติ"}> {s.src.V === "LAT" ? "L" : "3D"}</sup>}</td>
                    <td className="px-1" title={s.check.MtAll > s.check.MtUse + 1 ? `แรงบิดจากความต่อเนื่อง ลดจาก ${fmt(s.check.MtAll, 0)} เหลือ ${fmt(s.check.MtUse, 0)} (แรงบิดที่ทำให้แตกร้าว)` : ""}>{s.check.MtAll > 0.5 ? (s.check.MtAll > s.check.MtUse + 1 ? <>{fmt(s.check.MtUse, 0)}<sup className="text-[#0e9384]"> ↓{fmt(s.check.MtAll, 0)}</sup></> : fmt(s.check.MtAll, 0)) : "-"}</td>
                    <td className="px-1">{fmt(s.check.util * 100, 0)}%</td><td className={`px-1 ${s.ok ? "text-green-600" : "font-semibold text-red-600"}`}>{s.ok ? "ผ่าน" : s.check.error ?? "ไม่ผ่าน"}</td>
                  </tr>))}</tbody>
              </table>
            </div> : dTab === "cols" ?             <div className="text-[12px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["เสา (X, Y)", "Type", ...frame.floors.map((f) => `ใต้ ${f.name}`)].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
                <tbody>{res.stacks.map((st) => (
                  <tr key={st.key} className="border-b border-gray-100 tabular-nums">
                    <td className="px-1 py-0.5">{st.key}</td><td className="px-1 font-semibold" style={{ color: TYPE_COLORS[st.typeIdx % TYPE_COLORS.length] }}>{cTypes[st.typeIdx]?.name}{st.own ? "" : " (อัตโนมัติ)"}</td>
                    {frame.floors.map((f, k) => { const c = st.list.find((x) => x.floor === k); return <td key={k} className={`px-1 ${c && !c.ok ? "font-semibold text-red-600" : ""}`}>{c ? `${c.lv.Bx}×${c.lv.By} · ${fmt(c.Pbot / 1000, 2)} ต · ${colWhy(c)}` : "—"}</td>; })}
                  </tr>))}</tbody>
              </table>
            </div> : dTab === "groups" ? <div className="max-w-md"><Card title={`น้ำหนักแยกกลุ่ม — ${fl.name}`} icon={Layers}>
          <div className="space-y-1 text-[13px]">
            {Object.entries(GROUPS).map(([g, [name, color]]) => (
              <label key={g} className="flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={show[g]} onChange={() => setShow({ ...show, [g]: !show[g] })} />
                <i className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />{name}<span className="ml-auto tabular-nums text-gray-600">{fmt((an.groups?.[g] ?? 0) / 1000, 2)} ตัน</span>
              </label>
            ))}
            <div className="flex border-t border-gray-200 pt-1 font-semibold">รวมลงเสา<span className="ml-auto tabular-nums">{fmt(Object.values(an.groups ?? {}).reduce((a, b) => a + b, 0) / 1000, 2)} ตัน</span></div>
            <p className="text-[11px] text-gray-400">ติ๊กเพื่อแสดงค่าบนแปลน · วิเคราะห์ทุกกลุ่มรวมกัน (WSD) · สร้างจากล่างขึ้นบน คำนวณจากบนลงล่าง</p>
          </div>
        </Card></div>
                : warnList}
          </div>
        </Panel></>}
        {!focus && <><Handle />
        <Panel id="inspector" order={3} defaultSize={20} minSize={14} maxSize={40}><aside className="h-full space-y-3 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3">{inspector}</aside></Panel></>}
        </PanelGroup>
        <nav className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-white py-2">
          {tabsNow.map(([k, t]) => <Tip key={k} text={t} side="left"><button onClick={() => setDrawer(dTab === k ? null : k)}
            className={`flex w-[46px] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight ${dTab === k ? "bg-brand-500 text-[#fff]" : k === "warn" && res.warnings.length ? "text-red-600 hover:bg-red-50" : "text-gray-600 hover:bg-gray-50"}`}>
            {({ spans: <Ruler className="h-4 w-4" />, cols: <Columns3 className="h-4 w-4" />, groups: <Layers className="h-4 w-4" />, warn: <TriangleAlert className="h-4 w-4" />, panels: <Grid3x3 className="h-4 w-4" />, bwalls: <BrickWall className="h-4 w-4" /> })[k]}
            <span className="text-center">{t.replace(/\s*\(.*\)/, "")}</span>{/\((\d+)\)/.test(t) && <span className="opacity-70">{t.match(/\((\d+)\)/)[1]}</span>}</button></Tip>)}
        </nav>
      </div>
      <div className="flex items-center gap-4 border-t border-gray-200 bg-white px-4 py-1.5 text-[12px] tabular-nums text-gray-600">
        <span className={nBeamNG ? "font-semibold text-red-600" : "text-green-600"}>คาน {nBeam - nBeamNG}/{nBeam} ผ่าน</span>
        <span className={nColNG ? "font-semibold text-red-600" : "text-green-600"}>เสา {res.columns.length - nColNG}/{res.columns.length} ผ่าน</span>
        <span>ฐานราก {res.footings.filter((f) => f.ok).length}/{res.footings.length}</span>
        <span>แรงที่ฐานรวม {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</span>
        <button onClick={() => setDrawer("warn")} className={res.warnings.length ? "text-red-600" : "text-gray-400"}>⚠ {res.warnings.length} คำเตือน{(res.notes ?? []).length ? ` · ${res.notes.length} หมายเหตุ` : ""}</button>
        <span className="ml-auto text-gray-400">{fl.name} · {an.panels.length} แผ่นพื้น · {an.spans.length} ช่วงคาน</span>
      </div>
    </main>
  );
}
