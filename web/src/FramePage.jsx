// Beam & column framing (P1: one floor): draw columns / beams on a grid, slab panels and loads, continuous beams, beam types.
import { useEffect, useMemo, useRef, useState } from "react";
import { ColumnChart, LineDiagram, SlabStrip } from "./ReportDiagrams.jsx";
import { StoreyTable } from "./StoreyTable.jsx";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tip } from "@/components/ui/tooltip";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { StairDetail, StairInputs } from "./StairPanel.jsx";
import { DesignCriteria } from "./DesignCriteria.jsx";
import { BeamLoadTable, PanelTable } from "./BulkTables.jsx";
import { arcGeom, quarterSagitta } from "../engine/arc.js";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { BrickWall, Building2, Columns3, Grid3x3, Layers, Plus, Ruler, Trash2, TriangleAlert } from "lucide-react";
import { Card, Field, NumberInput, Select } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import { DEFAULT_BEAM_TYPES, DEFAULT_COLUMN_TYPES, DEFAULT_WALL_TYPES, DEFAULT_LOAD_LIB, GROUPS, OPENINGS, SLAB_KINDS, WALL_MATERIALS, wallTypeW, STAIR_KINDS, parseBars, resolveWall, stairLoads, wallLoad, wallsOf } from "../engine/floor.js";
import { loadSkeleton, runRoof } from "./RoofPage.jsx";
import { analyzeFrame, stackKey } from "../engine/frame.js";
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
import { RoofLinkCard } from "./RoofLinkCard.jsx";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

// example: 2 × 2 bays, columns at every node, beams on the grid lines, walls on the outside beams
// concrete cover per member kind (cm); coverCol falls back to the old single `cover` so saved projects keep their results
const COVERS = [["cover", "คาน", 3], ["coverCol", "เสา", 3], ["coverSlab", "พื้น / บันได", 2], ["coverFoot", "ฐานราก", 7.5]];
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
      yAxis: { type: "category", inverse: true, data: items.map((s) => s.label), axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label, fontSize: 11, interval: 0 } },
      xAxis: { type: "value", max: (v) => Math.max(120, Math.ceil(v.max / 20) * 20), axisLabel: { color: c.label, formatter: "{value}%" }, splitLine: { lineStyle: { color: c.split } } },
      series: [{ type: "bar", barMaxWidth: 10, data: items.map((s) => ({ value: +(Math.min(s.util, 3) * 100).toFixed(0), itemStyle: { color: s.ok ? s.color : c.lim, borderRadius: [0, 4, 4, 0] } })),
        markLine: { symbol: "none", silent: true, lineStyle: { color: c.lim, type: "dashed" }, label: { show: false }, data: [{ xAxis: 100 }] } }],
    });
    if (onPick) chart.on("click", (e) => onPick(items[e.dataIndex]));
    const ro = new ResizeObserver(() => chart.resize()); ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [items, dark, h]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="max-h-[520px] overflow-y-auto"><div ref={ref} style={{ width: "100%", height: h }} /></div>;
}

const Handle = () => <PanelResizeHandle className="group relative w-1.5 bg-transparent outline-none"><div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-gray-200 transition-colors group-hover:w-[3px] group-hover:bg-brand-400 group-data-[resize-handle-state=drag]:w-[3px] group-data-[resize-handle-state=drag]:bg-brand-500" /></PanelResizeHandle>;

// editable beam-type table (B1, B2, …)
function TypeTable({ types, setTypes, an }) {
  const set = (i, k, v) => setTypes(types.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const used = (i) => an?.spans.filter((s) => s.typeIdx === i) ?? [];
  const cell = "h-7 w-full rounded border border-gray-300 bg-transparent px-1 text-[12px] tabular-nums";
  const bars = (i, k) => <input defaultValue={types[i][k]} key={types[i][k]} onBlur={(e) => set(i, k, e.target.value.trim())}
    className={`${cell} ${types[i][k] && !parseBars(types[i][k]) ? "border-red-400 text-red-600" : ""}`} placeholder="—" />;
  const num = (i, k, step) => <input type="number" step={step} defaultValue={types[i][k]} key={types[i][k]} onBlur={(e) => set(i, k, Number(e.target.value))} className={`${cell} compact-num`} />;
  return (
    <div className="overflow-auto text-[12px]">
      <table className="w-full border-collapse">
        <thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">
          {["Type", "b (ม.)", "h (ม.)", "บน ตลอด", "บน เสริม L/4", "ล่าง ตลอด", "ล่าง เสริม 3L/5", "ปลอก", "@หัวเสา", "@กลาง", "ใช้", ""].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{types.map((t, i) => (
          <tr key={i} className="border-b border-gray-100">
            <td className="px-1"><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
              <input defaultValue={t.name} key={t.name} onBlur={(e) => set(i, "name", e.target.value.trim() || t.name)} className={`${cell} !w-12 font-semibold`} /></td>
            <td className="px-1 w-16">{num(i, "b", 0.05)}</td><td className="px-1 w-16">{num(i, "h", 0.05)}</td>
            <td className="px-1">{bars(i, "top")}</td><td className="px-1">{bars(i, "topX")}</td><td className="px-1">{bars(i, "bot")}</td><td className="px-1">{bars(i, "botX")}</td>
            <td className="px-1 w-20"><select value={t.st} onChange={(e) => set(i, "st", e.target.value)} className={cell}>{["RB 6", "RB 9", "DB 10", "DB 12"].map((s) => <option key={s}>{s}</option>)}</select></td>
            <td className="px-1 w-16">{num(i, "sSup", 0.025)}</td><td className="px-1 w-16">{num(i, "sMid", 0.025)}</td>
            <td className="px-1 text-gray-500">{used(i).length} ช่วง</td>
            <td><button onClick={() => setTypes(types.filter((_, j) => j !== i))} disabled={types.length < 2} className="text-gray-400 hover:text-red-500 disabled:opacity-30" title="ลบ type"><Trash2 className="h-3.5 w-3.5" /></button></td>
          </tr>))}</tbody>
      </table>
      <button onClick={() => setTypes([...types, { ...types[types.length - 1], name: `B${types.length + 1}` }])} className="mt-2 inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่ม type</button>
      <p className="mt-2 text-[11px] text-gray-400">ใส่เหล็กแบบ 2-DB16 · เว้นว่าง = ไม่มี · "ตลอด" = เหล็กวิ่งตลอดคาน, เสริม L/4 = เหล็กบนเพิ่มที่หัวเสา, เสริม 3L/5 = เหล็กล่างเพิ่มกลางคาน ·
        type ที่ "อัตโนมัติ" เลือกตัวเบาที่สุดที่ผ่าน (หน้าตัดเล็กก่อน แล้วเหล็กน้อยก่อน) · คานที่วาดเป็นเส้นเดียวใช้ type เดียวทุกช่วง</p>
    </div>
  );
}

// result text of one column level: utilisation or the reason it fails
const colWhy = (c) => (c.check.error ? c.check.error : !c.check.sOk ? `ปลอก @${fmt(c.lv.s, 2)} > ${fmt(c.check.r.sTie / 100, 3)} ม. (16db)` : !c.check.r.pgOk ? "pg นอก 1–8%"
  : !Number.isFinite(c.check.r.R) ? "ชะลูดเกิน" : `${fmt(c.check.util * 100, 0)}%${c.ok ? "" : " ไม่ผ่าน"}`);

// column types (C1, C2, …) with one section per level, bottom up
function ColTypeTable({ types, setTypes, res, floors }) {
  const setLv = (i, j, k, v) => setTypes(types.map((t, a) => (a !== i ? t : { ...t, levels: t.levels.map((lv, b) => (b === j ? { ...lv, [k]: v } : lv)) })));
  const cell = "h-7 w-full rounded border border-gray-300 bg-transparent px-1 text-[12px] tabular-nums";
  const num = (i, j, k, step) => <input type="number" step={step} defaultValue={types[i].levels[j][k]} key={types[i].levels[j][k]} onBlur={(e) => setLv(i, j, k, Number(e.target.value))} className={`${cell} compact-num`} />;
  const sel = (i, j, k, opts) => <select value={types[i].levels[j][k]} onChange={(e) => setLv(i, j, k, e.target.value)} className={cell}>{opts.map((o) => <option key={o}>{o}</option>)}</select>;
  return (
    <div className="space-y-4 overflow-auto text-[12px]">
      {types.map((t, i) => (
        <div key={i}>
          <div className="mb-1 flex items-center gap-2 font-semibold"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: TYPE_COLORS[i % TYPE_COLORS.length] }} />
            <input defaultValue={t.name} key={t.name} onBlur={(e) => setTypes(types.map((x, a) => (a === i ? { ...x, name: e.target.value.trim() || x.name } : x)))} className={`${cell} !w-14 font-semibold`} />
            <span className="font-normal text-gray-500">ใช้ {res.stacks.filter((s) => s.typeIdx === i).length} ต้น</span>
            <button onClick={() => setTypes(types.filter((_, a) => a !== i))} disabled={types.length < 2} className="ml-auto text-gray-400 hover:text-red-500 disabled:opacity-30" title="ลบ type"><Trash2 className="h-3.5 w-3.5" /></button></div>
          <table className="w-full border-collapse">
            <thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["ระดับ (ล่าง → บน)", "ใช้ใต้ชั้น", "Bx (ซม.)", "By (ซม.)", "จำนวนเหล็ก", "เหล็กยืน", "ปลอก", "@ (ม.)", ""].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
            <tbody>{t.levels.map((lv, j) => (
              <tr key={j} className="border-b border-gray-100">
                <td className="px-1"><input defaultValue={lv.level} key={lv.level} onBlur={(e) => setLv(i, j, "level", e.target.value)} className={cell} /></td>
                <td className="px-1 text-gray-500">{floors[j]?.name ?? (j === t.levels.length - 1 ? "ชั้นที่สูงกว่า" : "—")}</td>
                <td className="px-1 w-16">{num(i, j, "Bx", 5)}</td><td className="px-1 w-16">{num(i, j, "By", 5)}</td><td className="px-1 w-16">{num(i, j, "n", 2)}</td>
                <td className="px-1 w-20">{sel(i, j, "mainBar", ["DB 12", "DB 16", "DB 20", "DB 25"])}</td><td className="px-1 w-20">{sel(i, j, "tieBar", ["RB 6", "RB 9", "DB 10"])}</td>
                <td className="px-1 w-16">{num(i, j, "s", 0.025)}</td>
                <td><button onClick={() => setTypes(types.map((x, a) => (a === i ? { ...x, levels: x.levels.filter((_, b) => b !== j) } : x)))} disabled={t.levels.length < 2} className="text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button></td>
              </tr>))}</tbody>
          </table>
          <button onClick={() => setTypes(types.map((x, a) => (a === i ? { ...x, levels: [...x.levels, { ...x.levels.at(-1), level: `ชั้น ${x.levels.length}` }] } : x)))} className="mt-1 text-[12px] text-brand-500">+ เพิ่มระดับ</button>
        </div>
      ))}
      <button onClick={() => setTypes([...types, { ...types.at(-1), name: `C${types.length + 1}` }])} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่ม type เสา</button>
      <p className="text-[11px] text-gray-400">ระดับที่ k ใช้กับเสาใต้ชั้นที่ k (นับจากล่าง) · ชั้นที่เกินจำนวนระดับใช้ระดับบนสุด · ตรวจด้วยวิธีหน่วยแรงใช้งาน (โมดูลเสา) ที่ระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1·ด้านแคบ),
        โครงไม่เซ k = 1 · ระยะปลอกต้องไม่เกิน 16 เท่าเหล็กยืน / 48 เท่าเหล็กปลอก / ด้านแคบ · อัตโนมัติ = type เบาที่สุดที่ผ่านทุกชั้นของต้นนั้น</p>
    </div>
  );
}

// working order on each floor (build bottom up; the analysis runs top down)
const STEPS = [["frame", "1 โครง", false, "ขั้น 1 โครง: เสา คาน คานซอย คานยื่น"], ["slab", "2 พื้น", false, "ขั้น 2 พื้น: ชนิดพื้น พื้นยื่น"], ["stair", "3 บันได", false, "ขั้น 3 บันได"],
  ["wall", "4 ผนัง", false, "ขั้น 4 ผนัง"], ["other", "5 น้ำหนักอื่น", false, "ขั้น 5 น้ำหนักอื่น: ราวกันตก น้ำหนักจุด แรงจากหลังคา"], ["result", "6 ผลคาน", false, "ผลออกแบบคาน (WSD)"], ["cols", "7 ผลเสา", false, "ผลออกแบบเสา (WSD)"],
  ["types", "Type คาน", false, "ตาราง Type คาน"], ["ctypes", "Type เสา", false, "ตาราง Type เสา"]];

export function FramePage({ frame, set, dark, roof, res: resIn, step = "frame", onProjectInfo, onRoofFromFrame }) {
  const [subState, setSubState] = useState(null), [view, setView] = useState("2d"), [sel, setSel] = useState(null), mode = step, setMode = () => {};
  const [show, setShow] = useState({ DL: true, SDL: true, WALL: true, LL: true, SP: true }), wallTypes = frame.wallTypes ?? DEFAULT_WALL_TYPES;
  const cur = Math.min(frame.cur ?? 0, frame.floors.length - 1), fl = frame.floors[cur], types = frame.beamTypes, cTypes = frame.colTypes;
  const res = useMemo(() => resIn ?? analyzeFrame(frame), [resIn, frame]), an = res.floors[cur];
  const setFloor = (patch) => set("floors", frame.floors.map((f, i) => (i === cur ? { ...f, ...patch } : f)));
  // one structural grid for the whole building (as on the drawings): a grid edit applies to every floor
  const setGrid = (g) => set("floors", frame.floors.map((f) => ({ ...f, grid: g })));
  // copy the floor below (columns and beams) — most floors repeat the one under them
  const copyBelow = cur > 0 ? (withBeams = true) => { const b = frame.floors[cur - 1]; setFloor({ columns: b.columns.map((c) => [...c]), beams: withBeams ? b.beams.map((x) => ({ ...x, a: [...x.a], b: [...x.b] })) : [] }); } : null;
  const goFloor = (i) => { set("cur", i); setSel(null); };
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
  const SUBS = { analysis: [["cont", "แรงภายในคาน"], ["colf", "แรงในเสา"], ["frame3d", "เทียบ 2 วิธี / ตั้งค่า"]], loads: [["wall", "ผนัง"], ["other", "น้ำหนักอื่น / หลังคา"], ["groups", "สรุปกลุ่มน้ำหนัก"], ["lateral", "ลม / แผ่นดินไหว / Combination"]],
    design: [["result", "คาน"], ["cols", "เสา"], ["slabs", "พื้น / บันได"], ["types", "Type คาน"], ["ctypes", "Type เสา"]] };
  const subs = SUBS[step], sub = subs ? (subs.some((x) => x[0] === subState) ? subState : subs[0][0]) : null;
  const boardStep = { frame: "frame", grid: "grid", slab: "slab", stair: "stair", analysis: "result", footing: "cols" }[step] ?? (step === "loads" ? (sub === "other" ? "other" : "wall") : step === "design" ? (sub === "cols" ? "cols" : "result") : "result");
  const tablePage = (step === "analysis" && ["frame3d", "colf"].includes(sub)) || step === "project" || (step === "design" && ["types", "ctypes", "slabs"].includes(sub)) || step === "footing" || (step === "loads" && ["groups", "lateral"].includes(sub));
  // bulk tables: slab panels (step 3) and beam walls / line loads (step 6 walls)
  const bulkTab = step === "slab" ? ["panels", `แผ่นพื้นทั้งชั้น (${an.panels.length})`] : step === "loads" && sub === "wall" ? ["bwalls", `ผนัง / น้ำหนักบนคาน (${fl.beams.length})`] : null;
  const drawerTabs = [["spans", `ช่วงคาน (${an.spans.length})`], ["cols", `เสา (${res.stacks.length})`], ["groups", "น้ำหนักแยกกลุ่ม"], ["warn", `คำเตือน (${res.warnings.length})`]];
  const nBeamNG = res.floors.reduce((a, f) => a + f.spans.filter((x) => !x.ok).length, 0), nBeam = res.floors.reduce((a, f) => a + f.spans.length, 0), nColNG = res.columns.filter((c) => !c.ok).length;
  const tab = (on) => `rounded-md px-3 py-1 text-xs font-medium ${on ? "bg-white text-gray-800 shadow-theme-xs" : "text-gray-500 hover:text-gray-700"}`;
  const boardEl = (<FloorBoard floor={fl} setFloor={setFloor} an={an} types={types} wallTypes={wallTypes} step={boardStep} show={show} sel={sel} setSel={setSel} modeBar={null} dark={dark} resolveW={resolveW} libItem={libItem} onImportFrame={step === "frame" || step === "grid" ? importFrame : null}
            ghost={cur > 0 ? frame.floors[cur - 1].columns : []} onCopyBelow={step === "frame" ? copyBelow : null} compact={step === "analysis"} onDxf={() => downloadDxf(framePlanModel(fl, an, types, colsHere), `${frame.frameNo}-${fl.name}`)} colInfo={boardStep === "cols" ? fl.columns.map((_, i) => { const c = colAt(i); return c && { ok: c.ok, text: `${cTypes[c.typeIdx]?.name} ${fmt(c.Pbot / 1000, 1)}ต`, color: TYPE_COLORS[c.typeIdx % TYPE_COLORS.length] }; }) : null} />);
  const view3d = <Frame3D frame={frame} res={res} cur={cur} roof={roof} dark={dark} className="h-full min-h-[300px] overflow-hidden rounded-xl border border-gray-200" />;
  const coverFields = COVERS.map(([k, label, def]) => <Field key={k} label={label} unit="cm"><NumberInput value={frame.mat[k] ?? (k === "coverCol" ? frame.mat.cover : def)} step="0.5" onChange={(v) => setMat(k, v)} /></Field>);
  const coverBar = (keys, extra = null) => <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 dark:border-gray-800 dark:bg-white/[0.03]"><span className="pb-2 text-xs font-medium text-gray-500">คอนกรีตหุ้ม</span>{coverFields.filter((_, i) => keys.includes(COVERS[i][0]))}{extra}</div>;
  // minimum clear spacing between beam bars: bars that do not fit in a layer go to the next layer (design + drawings)
  const clearField = <><Field label="ระยะห่างเหล็กคานขั้นต่ำ (ช่องว่าง)" unit="cm"><NumberInput value={frame.mat.barClear ?? 2.5} step="0.5" onChange={(v) => setMat("barClear", v)} /></Field>
    <span className="pb-2 text-[11px] text-gray-400">ใช้ค่ามากกว่าระหว่างค่านี้กับขนาดเหล็ก · เกินความกว้างคาน → ขึ้นชั้นที่ 2 (ห่างชั้น 2.5 ซม.)</span></>;
  const slabRows = step === "design" && sub === "slabs" ? designSlabs(an, fl, frame.mat) : [];
  const page = step === "project" ? (
    <div className="grid max-w-6xl gap-4 xl:grid-cols-[1.3fr_1fr]">
      <DesignCriteria frame={frame} set={set} setMat={setMat} defaults={DEFAULT_FRAME} onNotice={setCritMsg} />
      <div className="space-y-4">{critMsg && <p className="rounded-lg bg-green-50 px-3 py-2 text-[12px] text-green-700">{critMsg}</p>}
      <LateralChoice frame={frame} set={set} />
      <Card title="ข้อมูลโครงการและมาตรฐาน" icon={Building2}>
        <div className="space-y-2 text-[13px] text-gray-600">
          <p>ชื่อโครงการ เจ้าของ ที่ตั้ง วิศวกร — แก้ที่ <button onClick={onProjectInfo} className="font-medium text-brand-500">ข้อมูลโครงการ</button></p>
          <p>มาตรฐาน: วิธีหน่วยแรงใช้งาน (WSD) ว.ส.ท. / ACI 318 · กฎกระทรวง พ.ศ. 2566 (fc ≤ 65 ksc) · โครงหลังคาเหล็ก ASD (AISC / ว.ส.ท.)</p>
          <p>ลำดับงาน: สร้างจากล่างขึ้นบน (ขั้น 1–6) · คำนวณจากบนลงล่าง (ขั้น 7–9) · ทุกการแก้ไขย้อนกลับได้ด้วยปุ่ม ↶ ↷ หรือ Ctrl+Z / Ctrl+Y</p>
        </div>
      </Card>
      </div>
    </div>
  ) : step === "design" && sub === "types" ? <div>{coverBar(["cover"], clearField)}<TypeTable types={types} setTypes={(v) => set("beamTypes", v)} an={an} /><BeamTypeFigures types={types} mat={frame.mat} count={(i) => res.floors.reduce((a, f) => a + f.spans.filter((x) => x.typeIdx === i).length, 0)} /></div>
    : step === "design" && sub === "ctypes" ? <div>{coverBar(["coverCol"])}<ColTypeTable types={cTypes} setTypes={(v) => set("colTypes", v)} res={res} floors={frame.floors} /><ColumnTypeFigures types={cTypes} mat={frame.mat} /></div>
    : step === "footing" ? <div>{coverBar(["coverFoot"])}<FootingTypes frame={frame} set={set} res={res} /></div>
    : step === "design" && sub === "slabs" ? (
      <div className="space-y-3">
      {coverBar(["coverSlab"])}
      <table className="w-full border-collapse text-[12px]"><thead><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["แผ่น", "ชนิด", "ช่วง (ม.)", "ขอบต่อเนื่อง", "หนา (ม.)", "ขนาดเหล็ก", "เหล็กเสริม", "ผล"].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
        <tbody>{slabRows.map((x) => <tr key={x.name} className="border-b border-gray-100 tabular-nums"><td className="px-1 py-1">{x.name}</td><td className="px-1">{x.way ?? x.kind}</td><td className="px-1">{x.S ? `${fmt(x.S, 2)} × ${fmt(x.L, 2)}` : x.L ? fmt(x.L, 2) : "-"}</td>
          <td className="px-1">{x.cont ?? "-"}</td>
          <td className="px-1">{x.key ? <input type="number" step="0.01" value={fl.panels?.[x.key]?.t ?? fl.t} onChange={(e) => setFloor({ panels: { ...fl.panels, [x.key]: { ...fl.panels?.[x.key], t: Number(e.target.value) } } })} className="h-7 w-16 rounded border border-gray-300 bg-transparent px-1" />
            : x.si !== undefined ? <input type="number" step="0.01" value={fl.stairs[x.si].t ?? 0.12} onChange={(e) => setFloor({ stairs: fl.stairs.map((q, j) => (j === x.si ? { ...q, t: Number(e.target.value) } : q)) })} className="h-7 w-16 rounded border border-gray-300 bg-transparent px-1" /> : "-"}</td>
          <td className="px-1">{x.key && x.r ? <select value={fl.panels?.[x.key]?.bar ?? "RB 9"} onChange={(e) => setFloor({ panels: { ...fl.panels, [x.key]: { ...fl.panels?.[x.key], bar: e.target.value } } })} className="h-7 rounded border border-gray-300 bg-transparent px-1">{Object.keys(SLAB_BARS).map((b) => <option key={b}>{b}</option>)}</select>
            : x.si !== undefined && x.r ? <select value={fl.stairs[x.si].mainBar ?? "DB 12"} onChange={(e) => setFloor({ stairs: fl.stairs.map((q, j) => (j === x.si ? { ...q, mainBar: e.target.value } : q)) })} className="h-7 rounded border border-gray-300 bg-transparent px-1">{Object.keys(SLAB_BARS).map((b) => <option key={b}>{b}</option>)}</select> : "-"}</td>
          <td className="px-1">{x.text ?? x.note}</td><td className={`px-1 ${x.r ? (x.ok ? "text-green-600" : "font-semibold text-red-600") : "text-gray-400"}`}>{x.r ? (x.ok ? "ผ่าน" : "ไม่ผ่าน") : "-"}</td></tr>)}</tbody></table>
      <p className="text-sm font-semibold text-gray-800">โมเมนต์ในพื้นและบันได (ต่อความกว้าง 1 ม.) — {fl.name}</p>
      <div className="grid gap-3 xl:grid-cols-2">{slabRows.filter((x) => x.r).map((x) => <div key={x.name} className="rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200"><p className="text-[12px] font-medium text-[#344054]">{x.name} · {x.way ?? ({ C: "พื้นยื่น", ST: "บันได" })[x.kind]} · {x.text}</p><SlabStrip row={x} /></div>)}</div>
      </div>
    ) : step === "loads" && sub === "groups" ? <div className="max-w-md"><Card title={`น้ำหนักแยกกลุ่ม — ${fl.name}`} icon={Layers}>
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
  const inspector = sel && selOk ? (          <Card title={beam ? `คาน (แนว ${line ? line.id + 1 : "-"})` : col ? `เสา #${sel.i + 1}` : panel ? `แผ่นพื้น P${an.panels.indexOf(panel) + 1}` : wall ? `ผนัง ${sel.i + 1}` : cant ? `พื้นยื่น ${sel.i + 1}` : stair ? `บันได ${sel.i + 1}` : lineL ? "น้ำหนักเส้น" : pointL ? "น้ำหนักจุด" : "เลือก"} icon={Ruler}>
            {wall && (() => { const r = an.walls[sel.i], rw = resolveWall(wall, frame, cur), L = Math.hypot(wall.b[0] - wall.a[0], wall.b[1] - wall.a[1]), ops = wall.openings ?? [];
              const setOp = (k, p) => setWall({ openings: ops.map((o, j) => (j === k ? { ...o, ...p } : o)) }), oArea = ops.reduce((a, o) => a + o.w * o.h, 0);
              const addOp = ([type, name, w, h, sill]) => { const at = Math.max(0, Math.min(L - w, ops.reduce((a, o) => Math.max(a, (o.at ?? 0) + o.w + 0.3), 0.3))); setWall({ openings: [...ops, { type, name, w, h, sill, at: +at.toFixed(2) }], open: 0 }); };
              return (<div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><Field label="ชนิดผนัง"><Select value={wall.kind} onChange={(v) => setWall({ kind: v })} options={wallOpts} /></Field></div>
              <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={!!wall.hAuto} onChange={(e) => setWall({ hAuto: e.target.checked })} />
                สูงอัตโนมัติ = ความสูงชั้นบน − ความลึกคานบน {wall.hAuto ? `(${fmt(rw.hFull, 2)} ม.)` : ""}</label>
              {!wall.hAuto ? <Field label={wall.gable ? "สูงยอดจั่ว" : "สูง"} unit="m"><NumberInput value={wall.h} step="0.1" onChange={(v) => setWall({ h: v })} /></Field> : <div />}
              <Field label="ผนัง"><Select value={wall.layers ?? 1} onChange={(v) => setWall({ layers: Number(v) })} options={[[1, "ชั้นเดียว"], [2, "เบิ้ล (2 ชั้น)"]]} /></Field>
              <label className="col-span-2 flex items-center gap-2 text-[13px] text-gray-700"><input type="checkbox" checked={!!wall.gable} onChange={(e) => setWall({ gable: e.target.checked })} />ผนังจั่ว (สามเหลี่ยม · เฉลี่ยครึ่งความสูง)</label>
              <div className="col-span-2 rounded-lg border border-gray-200 p-2">
                <div className="mb-1 flex items-center justify-between text-[12px] font-medium text-gray-700">ประตู / หน้าต่าง <span className="text-[11px] font-normal text-gray-400">ระยะจากปลาย A · กว้าง × สูง · ขอบล่าง (ม.)</span></div>
                {ops.map((o, k) => <div key={k} className="mb-1 grid grid-cols-[1fr_52px_52px_52px_52px_16px] items-center gap-1 text-[12px]">
                  <span className="truncate">{o.name ?? (o.type === "door" ? "ประตู" : "หน้าต่าง")}</span>
                  {["at", "w", "h", "sill"].map((f) => <input key={f} type="number" step="0.05" value={o[f] ?? 0} onChange={(e) => setOp(k, { [f]: Number(e.target.value) })} className="h-7 rounded border border-gray-300 bg-transparent px-1 text-right tabular-nums" title={{ at: "ห่างจากปลาย A", w: "กว้าง", h: "สูง", sill: "ขอบล่างจากพื้น" }[f]} />)}
                  <button onClick={() => setWall({ openings: ops.filter((_, j) => j !== k) })} className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></div>)}
                <div className="mt-1 flex flex-wrap gap-1">{OPENINGS.map((o) => <button key={o[1]} onClick={() => addOp(o)} className="rounded-md px-1.5 py-0.5 text-[11px] text-brand-600 ring-1 ring-brand-200 hover:bg-brand-50">+ {o[1]}</button>)}</div>
                {!ops.length && <div className="mt-2 flex items-center gap-2 text-[12px] text-gray-500">หรือช่องเปิดเป็น %<input type="number" step="5" value={wall.open ?? 0} onChange={(e) => setWall({ open: Number(e.target.value) })} className="h-7 w-16 rounded border border-gray-300 bg-transparent px-1 text-right" /></div>}
              </div>
              <p className="col-span-2 rounded-lg bg-[#b54708]/10 px-2 py-1.5 text-[12px] tabular-nums text-[#b54708]">ยาว {fmt(L, 2)} × สูง {fmt(rw.h, 2)} ม.{wall.gable ? " (เฉลี่ย)" : ""} = {fmt(L * rw.h, 2)} ม.² − ช่องเปิด {fmt(oArea || (L * rw.h * (rw.open ?? 0)) / 100, 2)} ม.²
                <br /><b className="text-[13px]">{fmt(wallLoad(rw, wallTypes), 0)} กก./ม.</b> · {r?.on.length ? `ลงคาน ${r.on.join(", ")}` : r?.panel ? `กระจายลงแผ่นพื้น ${r.panel}` : "ยังไม่มีคาน/พื้นรับ"}</p>
              <button onClick={() => { setFloor({ walls: wallsOf(fl).filter((_, i) => i !== sel.i) }); setSel(null); }} className="col-span-2 text-left text-[12px] text-red-600">ลบผนัง</button>
            </div>); })()}
            {stair && <><StairInputs st={stair} set={(p) => setList("stairs", p)} H={fl.h} r0={an.stairs?.[sel.i]} />
              <button onClick={() => delList("stairs")} className="mt-2 text-left text-[12px] text-red-600">ลบบันไดนี้</button></>}
            {lineL && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ"><input value={lineL.name ?? ""} onChange={(e) => setList("lineLoads", { name: e.target.value })} className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[13px]" /></Field>
              <Field label="น้ำหนัก" unit="kg/m"><NumberInput value={lineL.q} step="10" onChange={(v) => setList("lineLoads", { q: v })} /></Field>
              <p className="col-span-2 text-[12px] text-gray-500">{({ cant: "อยู่ปลายพื้นยื่น → ลงคานริม + แรงบิด", beam: "อยู่บนคาน → ลงคาน", panel: "อยู่บนพื้น → กระจายลงแผ่นพื้น" })[an.lineLoads?.[sel.i]?.on] ?? "ไม่มีอะไรรับ"}</p>
              <button onClick={() => delList("lineLoads")} className="col-span-2 text-left text-[12px] text-red-600">ลบ</button>
            </div>)}
            {pointL && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชื่อ"><input value={pointL.name ?? ""} onChange={(e) => setList("pointLoads", { name: e.target.value })} className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[13px]" /></Field>
              <Field label="น้ำหนัก" unit="kg"><NumberInput value={pointL.P} step="50" onChange={(v) => setList("pointLoads", { P: v })} /></Field>
              <Field label="X" unit="m"><NumberInput value={pointL.p[0]} step="0.05" onChange={(v) => setList("pointLoads", { p: [v, pointL.p[1]] })} /></Field>
              <Field label="Y" unit="m"><NumberInput value={pointL.p[1]} step="0.05" onChange={(v) => setList("pointLoads", { p: [pointL.p[0], v] })} /></Field>
              <p className="col-span-2 text-[12px] text-gray-500">{({ beam: "อยู่บนคาน → แรงจุดบนคาน", panel: "อยู่บนพื้น → กระจายลงแผ่นพื้น" })[an.pointLoads?.[sel.i]?.on] ?? "ไม่มีอะไรรับ"}</p>
              <button onClick={() => delList("pointLoads")} className="col-span-2 text-left text-[12px] text-red-600">ลบ</button>
            </div>)}
            {cant && (<div className="grid grid-cols-2 gap-3">
              <Field label="ยื่น" unit="m"><NumberInput value={cant.L} step="0.1" onChange={(v) => setCant({ L: v })} /></Field>
              <Field label="ด้าน"><button onClick={() => setCant({ side: -(cant.side ?? 1) })} className="h-11 w-full rounded-lg text-sm ring-1 ring-gray-300">สลับด้าน</button></Field>
              <Field label="หนา" unit="m"><NumberInput value={cant.t ?? fl.t} step="0.01" onChange={(v) => setCant({ t: v })} /></Field>
              <Field label="ปูผิว" unit="kg/m²"><NumberInput value={cant.finish ?? fl.finish} step="10" onChange={(v) => setCant({ finish: v })} /></Field>
              <Field label="จร" unit="kg/m²"><NumberInput value={cant.live ?? fl.live} step="50" onChange={(v) => setCant({ live: v })} /></Field>
              <p className="col-span-2 text-[12px] text-gray-500">คานริมรับ w·L = {fmt((an.cants[sel.i]?.w ?? 0) * cant.L, 0)} กก./ม. และแรงบิด wL²/2 = {fmt(((an.cants[sel.i]?.w ?? 0) * cant.L ** 2) / 2, 0)} กก.-ม./ม. (ตรวจในคาน)</p>
              <button onClick={() => { setFloor({ cants: fl.cants.filter((_, i) => i !== sel.i) }); setSel(null); }} className="col-span-2 text-left text-[12px] text-red-600">ลบพื้นยื่นนี้</button>
            </div>)}
            {beam && (<div className="grid grid-cols-2 gap-3">
              <Field label="Type"><Select value={beam.type ?? ""} onChange={(v) => setBeam({ type: v === "" ? null : Number(v) })} options={[["", "อัตโนมัติ"], ...types.map((t, i) => [i, t.name])]} /></Field>
              <Field label={beam.arc?.s ? "ยาวตามส่วนโค้ง" : "ยาว"} unit="m"><div className="flex h-11 items-center text-sm tabular-nums">{fmt(arcGeom(beam.a, beam.b, beam.arc?.s)?.L ?? Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1]), 2)}</div></Field>
              <Field label="คานโค้ง: ระยะป่องกลางช่วง" unit="m (+ ซ้าย / − ขวา)"><NumberInput value={beam.arc?.s ?? 0} step="0.05" onChange={(v) => setBeam({ arc: v ? { s: v } : undefined })} /></Field>
              <div className="flex flex-wrap items-end gap-1 text-[12px]">{[["¼ วงกลม ซ้าย", 1], ["¼ วงกลม ขวา", -1], ["ตรง", 0]].map(([lab, sg]) => (
                <button key={lab} onClick={() => setBeam({ arc: sg ? { s: sg * quarterSagitta(Math.hypot(beam.b[0] - beam.a[0], beam.b[1] - beam.a[1])) } : undefined })} className="rounded-md px-2 py-1 ring-1 ring-gray-300 hover:bg-gray-50">{lab}</button>))}</div>
              {beam.arc?.s ? <p className="col-span-2 text-[11px] text-gray-500">R = {fmt(arcGeom(beam.a, beam.b, beam.arc.s).R, 2)} ม. · มุม {fmt((arcGeom(beam.a, beam.b, beam.arc.s).th * 180) / Math.PI, 0)}° · โครง 3 มิติแบ่ง 12 ชิ้นตามส่วนโค้ง (มีแรงบิดจากความโค้ง) · คานต่อเนื่องใช้ช่วงตามคอร์ด</p> : null}
              {(() => { const on = line ? an.walls.filter((w) => w.on.some((o) => o.line === line.id)) : []; return (
                <div className="col-span-2 text-[12px] text-gray-600">ผนังบนแนวคานนี้: {on.length ? on.map((w) => `ผนัง ${w.i + 1} ${fmt(w.q, 0)}`).join(" · ") + ` กก./ม. (รวม ${fmt(on.reduce((s, w) => s + w.q, 0), 0)})` : "ไม่มี"} — แก้ที่ขั้น 4 ผนัง</div>); })()}
            </div>)}
            {col && (() => { const c = colAt(sel.i), st = res.stacks.find((s) => s.key === stackKey(col)); return (<div className="space-y-2 text-[13px]">
              <Field label="Type เสา (ทั้งต้นทุกชั้น)"><Select value={frame.colPick?.[stackKey(col)] ?? ""} onChange={(v) => set("colPick", { ...frame.colPick, [stackKey(col)]: v === "" ? null : Number(v) })} options={[["", "อัตโนมัติ"], ...cTypes.map((t, i) => [i, t.name])]} /></Field>
              <p className="tabular-nums">X {fmt(col[0], 2)} · Y {fmt(col[1], 2)} · แรงจากคานชั้นนี้ {fmt((c?.R ?? 0) / 1000, 2)} ตัน</p>
              {st?.list.map((x) => <p key={x.floor} className={`tabular-nums ${x.ok ? "" : "text-red-600"}`}>{frame.floors[x.floor].name}: {x.lv.Bx}×{x.lv.By} {x.lv.n}-{x.lv.mainBar} · P {fmt(x.Pbot / 1000, 2)} ตัน · {colWhy(x)}</p>)}
            </div>); })()}
            {panel && (<div className="grid grid-cols-2 gap-3">
              <Field label="ชนิดพื้น"><Select value={panel.st} onChange={(v) => setPanel({ kind: v })} options={Object.entries(SLAB_KINDS)} /></Field>
              {panel.st === "PS" ? <Field label="ทิศวางแผ่น (ช่วงพาด)"><Select value={panel.dir} onChange={(v) => setPanel({ dir: v })} options={[["x", "แนว X ↔"], ["y", "แนว Y ↕"]]} /></Field> : <div />}
              <Field label="หนา" unit="m"><NumberInput value={panel.t} step="0.01" onChange={(v) => setPanel({ t: v })} /></Field>
              <Field label="ปูผิว" unit="kg/m²"><NumberInput value={panel.finish} step="10" onChange={(v) => setPanel({ finish: v })} /></Field>
              <Field label="จร" unit="kg/m²"><NumberInput value={panel.live} step="50" onChange={(v) => setPanel({ live: v })} /></Field>
              <Field label="ฝ้า/งานระบบเพิ่ม" unit="kg/m²"><NumberInput value={panel.extraSDL ?? 0} step="10" onChange={(v) => setPanel({ extra: v })} /></Field>
              <Field label="ช่องเปิด"><Select value={panel.open ? "1" : ""} onChange={(v) => setPanel({ open: !!v })} options={[["", "มีพื้น"], ["1", "ช่องเปิด (ไม่มีพื้น)"]]} /></Field>
              <p className="col-span-2 text-[12px] text-gray-500">{panel.st === "GS" ? "พื้นวางบนดิน — ไม่ส่งน้ำหนักลงคาน" : panel.st === "PS" ? `แผ่นพาด ${fmt(panel.span ?? 0, 2)} ม. → ลงคาน 2 ด้านที่รับปลายแผ่น` : panel.kind === "twoway" ? `พื้นสองทาง S/L = ${fmt(panel.m, 2)} → สามเหลี่ยม/คางหมู` : panel.kind === "oneway" ? "พื้นทางเดียว (L/S > 2) → ลงคานด้านยาว wS/2" : "รูปไม่ใช่สี่เหลี่ยม → แบ่งตามพื้นที่ (โดยประมาณ)"} · {fmt(panel.area, 2)} ม² · {["DL", "SDL", "WALL", "LL"].map((g) => `${g === "WALL" ? "ผนัง" : g} ${fmt(panel.g[g], 0)}`).join(" · ")} = {fmt(panel.w, 0)} กก./ม²</p>
              <button onClick={() => setFloor({ panels: Object.fromEntries(Object.entries(fl.panels ?? {}).filter(([k]) => k !== panel.key)) })} className="col-span-2 text-left text-[12px] text-brand-500">ใช้ค่าของชั้น</button>
            </div>)}
          </Card>
  ) : step === "loads" && sub === "wall" ? (          <Card title="ชนิดผนัง (วัสดุ + ฉาบ)" icon={Ruler}>
            <div className="space-y-2 text-[12px]">
              {wallTypes.map((t, i) => { const put = (p) => set("wallTypes", wallTypes.map((x, j) => (j === i ? (() => { const n = { ...x, ...p }; return { ...n, w: Math.round(wallTypeW(n)) }; })() : x)));
                const cell = "h-7 w-full rounded border border-gray-300 bg-transparent px-1 text-right tabular-nums";
                return (
                <div key={t.id} className="rounded-lg border border-gray-200 p-2">
                  <div className="mb-1 flex items-center gap-1.5">
                    <input defaultValue={t.name} key={t.name} onBlur={(e) => set("wallTypes", wallTypes.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() || x.name } : x)))} className="h-7 flex-1 rounded border border-gray-300 bg-transparent px-2 font-medium" />
                    <b className="w-20 text-right tabular-nums text-[#b54708]">{fmt(t.w, 0)} กก./ม.²</b>
                    <button disabled={wallTypes.length < 2} onClick={() => set("wallTypes", wallTypes.filter((_, j) => j !== i))} className="text-gray-400 hover:text-red-500 disabled:opacity-30"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] gap-1 text-[11px] text-gray-500">
                    <span>เนื้อผนัง</span><span>หนา (ซม.)</span><span>ฉาบ (ซม.)</span><span>ฉาบกี่ด้าน</span>
                    <select value={t.core ?? ""} onChange={(e) => put(e.target.value ? { core: e.target.value, t: t.t ?? 0.1, plaster: t.plaster ?? 1.5, sides: t.sides ?? 2 } : { core: undefined })} className="h-7 rounded border border-gray-300 bg-transparent px-1 text-[12px]">
                      <option value="">กำหนดเอง (กก./ม.²)</option>{Object.entries(WALL_MATERIALS).map(([k, [n, d]]) => <option key={k} value={k}>{n}{d ? ` ${d}` : ""}</option>)}</select>
                    {t.core ? (t.core === "gypsum" ? <><input type="number" step="5" value={t.dry ?? 30} onChange={(e) => put({ dry: Number(e.target.value) })} className={cell} title="กก./ม.² ทั้งผนัง" /><span /><span /></>
                      : <><input type="number" step="0.5" value={+((t.t ?? 0.1) * 100).toFixed(1)} onChange={(e) => put({ t: Number(e.target.value) / 100 })} className={cell} />
                        <input type="number" step="0.5" value={t.plaster ?? 1.5} onChange={(e) => put({ plaster: Number(e.target.value) })} className={cell} />
                        <select value={t.sides ?? 2} onChange={(e) => put({ sides: Number(e.target.value) })} className="h-7 rounded border border-gray-300 bg-transparent px-1 text-[12px]"><option value={2}>2 ด้าน</option><option value={1}>1 ด้าน</option><option value={0}>ไม่ฉาบ</option></select></>)
                      : <><input type="number" defaultValue={t.w} key={t.w} onBlur={(e) => set("wallTypes", wallTypes.map((x, j) => (j === i ? { ...x, w: Number(e.target.value) || x.w } : x)))} className={cell} title="กก./ม.²" /><span /><span /></>}
                  </div>
                </div>); })}
              <button onClick={() => set("wallTypes", [...wallTypes, { id: `w${Date.now()}`, name: "อิฐมอญครึ่งแผ่น ฉาบ 2 ด้าน", core: "brick", t: 0.1, plaster: 1.5, sides: 2, w: Math.round(wallTypeW({ core: "brick", t: 0.1, plaster: 1.5, sides: 2 })) }])} className="text-brand-500">+ เพิ่มชนิดผนัง</button>
              <p className="text-gray-400">กก./ม.² = ความหนาแน่นเนื้อผนัง × หนา + ฉาบ 2,000 กก./ม.³ × หนา × ด้าน · น้ำหนักต่อเมตร = กก./ม.² × สูง (สุทธิใต้คาน) − ประตู/หน้าต่าง · ติ๊กหลายคานในตาราง "ผนัง / น้ำหนักบนคาน" ด้านล่างเพื่อใส่ทีเดียว</p>
            </div>
          </Card>
  ) : step === "loads" && sub === "other" ? (<>
          <Card title="คลังน้ำหนัก (เลือกแล้ววาดบนแปลน)" icon={Ruler}>
            <div className="space-y-1 text-[12px]">
              {[["line", "แผ่ตามแนว (กก./ม.) · เครื่องมือ ราว/น้ำหนักเส้น"], ["point", "แรงจุด (กก.) · เครื่องมือ น้ำหนักจุด"], ["area", "ต่อพื้นที่ (กก./ม.²) · เครื่องมือ เพิ่มบนพื้น"]].map(([kind, title]) => (
                <div key={kind}><p className="mt-1 text-[11px] font-semibold text-gray-500">{title}</p>
                  {loadLib.map((it, i) => it.kind === kind && <label key={it.id} className={`flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-0.5 ${libSel === it.id ? "bg-brand-50 text-brand-600" : "hover:bg-gray-50"}`}>
                    <input type="radio" checked={libSel === it.id} onChange={() => setLibSel(it.id)} />
                    <input defaultValue={it.name} key={it.name} onBlur={(e) => set("loadLib", loadLib.map((x, j) => (j === i ? { ...x, name: e.target.value || x.name } : x)))} className="h-6 flex-1 rounded border border-transparent bg-transparent px-1 hover:border-gray-300" />
                    <input type="number" value={it.v} onChange={(e) => set("loadLib", loadLib.map((x, j) => (j === i ? { ...x, v: Number(e.target.value) } : x)))} className="h-6 w-16 rounded border border-gray-300 bg-transparent px-1 text-right tabular-nums" />
                    <button onClick={() => set("loadLib", loadLib.filter((_, j) => j !== i))} className="text-gray-300 hover:text-red-500"><Trash2 className="h-3 w-3" /></button></label>)}
                  <button onClick={() => set("loadLib", [...loadLib, { id: `u${Date.now()}`, name: "รายการใหม่", kind, v: kind === "point" ? 500 : 100 }])} className="ml-1 text-[11px] text-brand-500">+ เพิ่ม</button></div>))}
              <p className="pt-1 text-[11px] text-gray-400">เลือกรายการ → เลือกเครื่องมือทางซ้าย → คลิกบนแปลน · แก้ชื่อ/ค่าได้ · บันทึกเป็นค่ามาตรฐานของคุณได้ในขั้น 0</p>
            </div>
          </Card>
          <Card title="น้ำหนักอื่น" icon={Ruler}>
            <div className="space-y-2 text-[12px] text-gray-500">
              {onRoofFromFrame && <RoofLinkCard frame={frame} roof={roof} onFromFrame={onRoofFromFrame} set={set} />}
              <p>ราวกันตก/น้ำหนักเส้น: วาดที่ปลายพื้นยื่น (ลงคานริม + แรงบิด) บนคาน หรือบนพื้น · น้ำหนักจุด: คลิกวาง · ฝ้า/งานระบบ: แก้ที่แผ่นพื้น (ขั้น 2)</p>
              <button onClick={roofLoads} disabled={!roof?.pts} className="w-full rounded-lg px-3 py-2 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50 disabled:opacity-40">{frame.roofLink?.on ? `เชื่อมกับ ${frame.floors[frame.roofLink.floor]?.name ?? "-"} อยู่ · ย้ายมาชั้นนี้` : "เชื่อมแรงจากหลังคาลงชั้นนี้ (อัตโนมัติ)"}</button>
              {roofMsg && <p className="text-[#d6409f]">{roofMsg}</p>}
            </div>
          </Card></>
  ) : step === "stair" ? (          <Card title="บันได" icon={Ruler}><p className="text-[12px] text-gray-500">วางบันไดที่ชั้นที่ปลายบนไปถึง · วาดกรอบช่องบันได แล้วเลือกแบบ: {Object.values(STAIR_KINDS).join(" · ")} · ปลายล่างของแบบพาดตามยาว/มีชานพักลงคานชั้นล่างที่แนวเดียวกัน</p></Card>
  ) : step === "slab" ? (<>          <Card title="พื้น" icon={Ruler}><p className="text-[12px] text-gray-500">คลิกแผ่นพื้นเพื่อเลือกชนิด S หล่อในที่ / PS พื้นสำเร็จ (เลือกทิศวางแผ่น) / GS วางบนดิน หรือช่องเปิด · เครื่องมือ "พื้นยื่น" คลิกบนคานด้านที่จะยื่น · ค่าเริ่มต้นความหนา ปูผิว จร อยู่ในการ์ดชั้น</p></Card>
    <Card title={`ค่าเริ่มต้นแผ่นพื้น — ${fl.name}`} icon={Layers}>
          <div className="grid grid-cols-2 gap-3">
            {fv("t", "พื้นหนา", "m", "0.01")}{fv("finish", "วัสดุปูผิว", "kg/m²", "10")}{fv("live", "น้ำหนักจร", "kg/m²", "50")}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">ใช้กับทุกแผ่นที่ไม่ได้กำหนดเอง · แก้ทีละหลายแผ่นได้ในตาราง "แผ่นพื้นทั้งชั้น" ด้านล่าง</p>
        </Card></>
  ) : step === "grid" ? (<>
    <StoreyTable frame={frame} set={set} cur={cur} goFloor={goFloor} />
              <Card title="กริด (ระยะแกน ม.)" icon={Ruler}>
            <div className="space-y-2">
              {gridInput("dx", "แกน X (A, B, …)")}{gridInput("dy", "แกน Y (ล่าง → บน)")}
              <Field label="แบ่งช่องกริด"><Select value={G.sub ?? 1} onChange={(v) => setGrid({ ...G, sub: Number(v) })} options={[1, 2, 3, 4].map((v) => [v, v === 1 ? "เฉพาะแกน" : `ช่องละ ${v}`])} /></Field>
            </div>
          </Card></>
  ) : step === "analysis" || step === "design" ? (
    <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">        
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">{line?.res ? `แรงเฉือน / โมเมนต์ แนวคาน ${line.id + 1}` : (boardStep === "cols" ? `อัตราใช้งานเสา ใต้${fl.name}` : `อัตราใช้งานคาน ${fl.name}`)}
            <span className="text-[11px] font-normal text-gray-500">{line?.res ? `ยาว ${fmt(line.L, 2)} ม.` : "เหล็กที่ต้องการ / ที่ใส่"}</span></div>
          {line?.res ? <ForceCharts L={line.L} fns={{ V: line.res.V, M: line.res.M }} dark={dark} height={260} animate={false} /> : <UtilBars items={boardStep === "cols" ? colsHere.map((c) => ({ label: `${cTypes[c.typeIdx]?.name} ${stackKey(c.p)}`, util: c.check.util, ok: c.ok, color: TYPE_COLORS[c.typeIdx % TYPE_COLORS.length], sel: { kind: "column", i: c.i } }))
            : an.spans.map((s) => ({ label: `${s.id} ${types[s.typeIdx]?.name ?? ""}`, util: s.check.util, ok: s.ok, color: TYPE_COLORS[s.typeIdx % TYPE_COLORS.length], sel: { kind: "beam", i: s.member } }))} dark={dark} height={260} onPick={(x) => x?.sel && setSel(x.sel)} />}
        </section>
  ) : step === "footing" ? (<>
    <Card title="สรุปฐานราก" icon={Layers}><div className="space-y-1 text-[12px] tabular-nums">
      <p className={res.footings.every((f) => f.ok) ? "font-semibold text-green-600" : "font-semibold text-red-600"}>ผ่าน {res.footings.filter((f) => f.ok).length}/{res.footings.length} ฐาน · แรงรวม {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</p>
      {[...new Set(res.footings.map((f) => f.type ?? "อัตโนมัติ"))].map((ty) => { const fs = res.footings.filter((f) => (f.type ?? "อัตโนมัติ") === ty), g = fs[0];
        return <p key={ty} className="flex justify-between border-b border-gray-100 py-0.5"><span className="font-medium">{ty}</span><span>{g.kind === "spread" ? `ฐานแผ่ ${fmt(g.r?.Bx ?? 0, 2)}×${fmt(g.r?.By ?? 0, 2)}` : `${g.n} × ${g.pile}`}</span><span>{fs.length} ฐาน</span></p>; })}
    </div></Card>
    <Frame3D frame={frame} res={res} cur={cur} roof={roof} dark={dark} className="h-[300px] overflow-hidden rounded-xl border border-gray-200" />
  </>  ) : step === "project" ? (
    <Card title="ภาพรวมโครงการ" icon={Layers}><div className="space-y-1 text-[12px] tabular-nums text-gray-600">
      {[...frame.floors.keys()].reverse().map((k) => <p key={k} className="flex justify-between border-b border-gray-100 py-0.5"><span>{frame.floors[k].name}</span><span>{frame.floors[k].columns.length} เสา · {frame.floors[k].beams.length} คาน</span></p>)}
      <p className="pt-1 text-[11px] text-gray-400">ระดับและความสูงชั้นแก้ในขั้น 1 · น้ำหนักพื้นแก้ในขั้น 3 / ตาราง "แผ่นพื้นทั้งชั้น"</p>
    </div></Card>
  ) : <Card title={`ชั้น ${fl.name}`} icon={Layers}>
          <div className="grid grid-cols-2 gap-3">
            {fv("t", "พื้นหนา", "m", "0.01")}{fv("finish", "วัสดุปูผิว", "kg/m²", "10")}{fv("live", "น้ำหนักจร", "kg/m²", "50")}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">ค่าเริ่มต้นของแผ่นพื้นในชั้นนี้ · ระดับ / ความสูงชั้นแก้ในขั้น 1</p>
        </Card>;
  const [drawer, setDrawer] = useState(null), resultStep = ["analysis", "design", "footing"].includes(step);
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
          <td className="px-1">{x.id}</td><td className="px-1 font-semibold" style={{ color: TYPE_COLORS[x.typeIdx % TYPE_COLORS.length] }}>{types[x.typeIdx]?.name}</td><td className="px-1">{fmt(x.len, 2)}</td>
          <td className="px-1">{fmt(x.Mpos, 0)}</td><td className="px-1">{fmt(x.Mneg, 0)}</td><td className="px-1">{fmt(x.V, 0)}</td><td className="px-1">{x.Mt ? fmt(x.Mt, 0) : "-"}</td>
          <td className="px-1">{fmt(x.check.util * 100, 0)}%</td><td className={`px-1 ${x.ok ? "text-[#12b76a]" : "font-semibold text-[#d92d20]"}`}>{x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>)}</tbody>
      </table>
    </div>);
  const center = page ? <div className="min-h-0 flex-1 overflow-auto p-1">{page}</div>
    : step === "stair" && stair && view === "2d" ? <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(340px,1fr)_1fr] max-xl:grid-rows-[minmax(260px,1fr)_auto]"><div className="flex min-h-0 flex-col overflow-hidden">{boardEl}</div>
      <StairDetail st={stair} i={sel.i} H={fl.h} r0={an.stairs?.[sel.i]} row={designSlabs(an, fl, frame.mat).find((x) => x.kind === "ST" && x.si === sel.i)} /></div>
    : step === "analysis" && sub === "cont" && view === "2d" ? <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[minmax(340px,2fr)_3fr] max-xl:grid-rows-[minmax(260px,1fr)_auto]"><div className="flex min-h-0 flex-col overflow-hidden">{boardEl}</div>{lineDiagram}</div>
    : step === "footing" ? view3d
    : view === "3d" ? view3d : view === "split" ? <div className="grid min-h-0 flex-1 grid-cols-2 gap-3"><div className="min-h-0">{boardEl}</div>{view3d}</div> : boardEl;
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <PanelGroup direction="horizontal" autoSaveId={`structcalc.panels.${dTab ? "3" : "2"}`} className="min-w-0 flex-1">
        <Panel id="centre" order={1} minSize={30} className="flex min-w-0 flex-col">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-2">
            {subs && <Tabs value={sub} onValueChange={(k) => { setSubState(k); setSel(null); }}><TabsList>{subs.map(([k, t]) => <TabsTrigger key={k} value={k}>{t}</TabsTrigger>)}</TabsList></Tabs>}
            {!page && step !== "footing" && <Tabs value={view} onValueChange={setView} className="ml-auto"><TabsList>{[["2d", "แปลน 2D"], ["3d", "3D"], ["split", "2D + 3D"]].map(([k, t]) => <TabsTrigger key={k} value={k}>{t}</TabsTrigger>)}</TabsList></Tabs>}
          </div>
          <div className="flex min-h-0 flex-1 flex-col p-3">{center}</div>
        </section>
        </Panel>
        {dTab && <><Handle /><Panel id="side" order={2} defaultSize={34} minSize={20} className="flex min-w-0 flex-col border-l border-gray-200 bg-white">
          <div className="flex items-center gap-2 border-b border-gray-200 px-3 py-2 text-sm font-semibold text-gray-800">{tabsNow.find(([x]) => x === dTab)?.[1]}
            <button onClick={() => setDrawer(null)} className="ml-auto rounded-md px-2 py-0.5 text-xs font-medium text-gray-500 ring-1 ring-gray-200 hover:bg-gray-50">ปิด ✕</button></div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
              {dTab === "panels" ? <PanelTable an={an} fl={fl} setFloor={setFloor} dark={dark} /> : dTab === "bwalls" ? <BeamLoadTable fl={fl} setFloor={setFloor} wallTypes={wallTypes} resolveW={resolveW} dark={dark} /> : dTab === "spans" ?             <div className="text-[12px]">
              <table className="w-full border-collapse">
                <thead className="sticky top-0 bg-white"><tr className="border-b border-gray-200 text-left text-[11px] text-gray-500">{["ช่วง", "ยาว", "ชนิด", "Type", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "ใช้", "ผล"].map((h) => <th key={h} className="px-1 py-1 font-medium">{h}</th>)}</tr></thead>
                <tbody>{an.spans.map((s) => (
                  <tr key={s.id} onClick={() => setSel({ kind: "beam", i: s.member })} className={`cursor-pointer border-b border-gray-100 tabular-nums ${sel?.kind === "beam" && sel.i === s.member ? "bg-brand-50" : "hover:bg-gray-50"}`}>
                    <td className="px-1 py-0.5">{s.id}</td><td className="px-1">{fmt(s.len, 2)}</td><td className="px-1">{KIND_TH[s.kind]}</td>
                    <td className="px-1 font-semibold" style={{ color: TYPE_COLORS[s.typeIdx % TYPE_COLORS.length] }}>{types[s.typeIdx]?.name}{s.own ? "" : " (อัตโนมัติ)"}</td>
                    <td className="px-1">{fmt(s.Mpos, 0)}{s.src?.Mpos && s.src.Mpos !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.Mpos ?? "โครง 3 มิติ"}> {s.src.Mpos === "LAT" ? "L" : "3D"}</sup>}</td><td className="px-1">{fmt(s.Mneg, 0)}{s.src?.Mneg && s.src.Mneg !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.Mneg ?? "โครง 3 มิติ"}> {s.src.Mneg === "LAT" ? "L" : "3D"}</sup>}</td><td className="px-1">{fmt(s.V, 0)}{s.src?.V && s.src.V !== "ต่อเนื่อง" && <sup className="text-brand-500" title={s.gov?.V ?? "โครง 3 มิติ"}> {s.src.V === "LAT" ? "L" : "3D"}</sup>}</td>
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
                : res.warnings.length ? res.warnings.map((w) => <p key={w} className="py-0.5 text-[12px] text-red-600">{w}</p>) : <p className="text-[12px] text-gray-400">ไม่มีคำเตือน</p>}
          </div>
        </Panel></>}
        <Handle />
        <Panel id="inspector" order={3} defaultSize={20} minSize={14} maxSize={40}><aside className="h-full space-y-3 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3">{inspector}</aside></Panel>
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
        <button onClick={() => setDrawer("warn")} className={res.warnings.length ? "text-red-600" : "text-gray-400"}>⚠ {res.warnings.length} คำเตือน</button>
        <span className="ml-auto text-gray-400">{fl.name} · {an.panels.length} แผ่นพื้น · {an.spans.length} ช่วงคาน</span>
      </div>
    </main>
  );
}
