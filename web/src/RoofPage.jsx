import { useEffect, useRef, useState } from "react";
import * as echarts from "echarts/core";
import { BarChart } from "echarts/charts";
import { GridComponent, TooltipComponent } from "echarts/components";
import { SVGRenderer } from "echarts/renderers";
import { BarChart3, Download, GitCommitHorizontal, Home, Plus, Ruler, Trash2, Triangle, Wand2 } from "lucide-react";
import Frame3D from "./Frame3D.jsx";
import { roofGeometry } from "../engine/roof.js";
import { frameRoof } from "../engine/roofFrame.js";
import { DEFAULT_DESIGN, ROOFINGS, autoInnerPlates, carrierPlates, designRoof, BATTEN_RANGE } from "../engine/roofMembers.js";
import { SECTIONS, SECTION_TYPES, SYM } from "../engine/steelSections.js";
import { Badge } from "./ui.jsx";
import { Card, Field, NumberInput, Select, inputCls as SEL } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import Roof3D, { LINE_COLORS } from "./Roof3D.jsx";
import { downloadDxf, plateModel, roofPlanModel } from "./drawings.js";
import { PlateInputs, PlatePick, PlatePlan, PlateTable, platesOf } from "./PlateView.jsx";
import DrawBoard from "./DrawBoard.jsx";

echarts.use([BarChart, GridComponent, TooltipComponent, SVGRenderer]);

// L-shaped house: hip roof with one gable end
export const DEFAULT_ROOF = {
  roofNo: "R1", slope: 30, overhang: 0.6, H: 3, snap: 0.5, supports: null,
  frame: { rafterSp: 1.0, purlinSp: 1.0, maxSpan: 2.5, postSp: 2.5 }, design: DEFAULT_DESIGN,
  pts: [[0, 0], [12, 0], [12, 8], [6, 8], [6, 14], [0, 14]],
  edges: [{ type: "hip" }, { type: "hip" }, { type: "hip" }, { type: "hip" }, { type: "gable" }, { type: "hip" }],
};

// CGAL straight skeleton (wasm, ~1 MB) loaded on first use
let skPromise = null, skFn = null;
export function loadSkeleton() {
  return (skPromise ??= import("straight-skeleton").then(async (m) => {
    const { SkeletonBuilder } = m.default ?? m;
    await SkeletonBuilder.init();
    return (skFn = (rings) => SkeletonBuilder.buildFromPolygon(rings));
  }));
}
export function useSkeleton() {
  const [fn, setFn] = useState(() => skFn);
  useEffect(() => { loadSkeleton().then((f) => setFn(() => f)); }, []);
  return fn;
}

// a new project starts with no roof (user: a sample roof appeared from nowhere) — outline from the structure, DXF or drawing
export const EMPTY_ROOF = { ...DEFAULT_ROOF, pts: [], edges: [], columns: [], plates: [], innerPlates: [], dang: null, supports: null, grid: null };

// one kind of wall plate for the user (no separate อะเส / อะเสรับดั้ง tools): a plate lying on an outline edge is a wall plate,
// any other plate is an interior plate (carries ดั้ง / plates resting on it) — decided here from the geometry every time
export function splitPlates(roof) {
  const P = roof.pts ?? [], all = [...(roof.plates ?? []), ...(roof.innerPlates ?? [])];
  const onEdge = (p) => P.some((q, i) => { const r = P[(i + 1) % P.length], L = Math.hypot(r[0] - q[0], r[1] - q[1]); if (L < 1e-9) return false;
    const t = ((p[0] - q[0]) * (r[0] - q[0]) + (p[1] - q[1]) * (r[1] - q[1])) / (L * L);
    return t > -0.001 && t < 1.001 && Math.abs((p[0] - q[0]) * (r[1] - q[1]) - (p[1] - q[1]) * (r[0] - q[0])) / L < 0.05; });
  const out = (l) => onEdge(l.a) && onEdge(l.b) && onEdge([(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2]);
  return { plates: all.filter(out), innerPlates: all.filter((l) => !out(l)) };
}

export function runRoof(roof0, sk) {
  if (!sk) return {};
  if (!(roof0?.pts?.length >= 3)) return { empty: true };
  const roof = { ...roof0, ...splitPlates(roof0) };
  try { const g = roofGeometry(roof, sk); const fr = frameRoof(g, roof, roof.supports); return { g, fr, dz: designRoof(g, fr, roof, roof.design) }; } catch (e) { return { error: e.message }; }
}

export const FRAME_COLORS = { purlin: "#98a2b3", rafter: "#b54708", support: "#7a5af8", post: "#0e9384" };

function PlanEditor({ roof, set, g, fr, mode, sel, setSel, dark }) {
  const svg = useRef(null), [drag, setDrag] = useState(null);
  const all = [...roof.pts, ...(g?.eave ?? [])], xs = all.map((p) => p[0]), ys = all.map((p) => p[1]);
  const pad = 1.5, x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  const Y = (y) => y0 + h - (y - y0); // plan y up
  const sc = Math.max(w, h) / 60; // ~1/60 of the view for handles/text
  const toPlan = (e) => {
    const p = svg.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse()), s = roof.snap || 0.01;
    return [Math.round(q.x / s) * s, Math.round(Y(q.y) / s) * s];
  };
  const move = (e) => {
    if (drag === null) return;
    const p = toPlan(e);
    if (typeof drag === "number") return set("pts", roof.pts.map((v, i) => (i === drag ? p : v)));
    // support: drag one end, or the whole line by its body
    const list = fr.supports.map(({ a, b }) => ({ a, b }));
    const s = list[drag.s], dx = p[0] - drag.from[0], dy = p[1] - drag.from[1];
    list[drag.s] = drag.end === "a" ? { a: p, b: s.b } : drag.end === "b" ? { a: s.a, b: p }
      : { a: [drag.orig.a[0] + dx, drag.orig.a[1] + dy], b: [drag.orig.b[0] + dx, drag.orig.b[1] + dy] };
    set("supports", list);
  };
  const grab = (e, d) => { e.stopPropagation(); e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId); setDrag(d); };
  const insert = (i) => {
    const a = roof.pts[i], b = roof.pts[(i + 1) % roof.pts.length], s = roof.snap || 0.01, m = [Math.round((a[0] + b[0]) / 2 / s) * s, Math.round((a[1] + b[1]) / 2 / s) * s];
    set("pts", [...roof.pts.slice(0, i + 1), m, ...roof.pts.slice(i + 1)]);
    set("edges", [...roof.edges.slice(0, i + 1), { ...roof.edges[i] }, ...roof.edges.slice(i + 1)]);
  };
  const toggle = (i) => set("edges", roof.edges.map((e, k) => (k === i ? { type: e.type === "gable" ? "hip" : "gable" } : e)));
  const grid = [];
  for (let x = Math.ceil(x0); x <= x0 + w; x++) grid.push(<line key={`x${x}`} x1={x} x2={x} y1={y0} y2={y0 + h} strokeWidth={x % 5 ? sc * 0.04 : sc * 0.09} />);
  for (let y = Math.ceil(y0); y <= y0 + h; y++) grid.push(<line key={`y${y}`} y1={Y(y)} y2={Y(y)} x1={x0} x2={x0 + w} strokeWidth={y % 5 ? sc * 0.04 : sc * 0.09} />);
  const ring = (P) => P.map(([x, y]) => `${x},${Y(y)}`).join(" ");
  return (
    <svg ref={svg} viewBox={`${x0} ${y0} ${w} ${h}`} className="h-full w-full touch-none select-none"
      onPointerMove={move} onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)}>
      <g stroke={dark ? "#22273d" : "#eaecf0"}>{grid}</g>
      {g?.faces.filter((f) => !f.gable).map((f, i) => <polygon key={i} points={ring(f.P)} fill={dark ? "#7b8cff22" : "#465fff14"} />)}
      {g && <polygon points={ring(g.eave)} fill="none" stroke={LINE_COLORS.eave} strokeWidth={sc * 0.12} strokeDasharray={`${sc * 0.5} ${sc * 0.3}`} />}
      <polygon points={ring(roof.pts)} fill="none" stroke={dark ? "#cdd1e2" : "#344054"} strokeWidth={sc * 0.18} />
      {g?.lines.filter((l) => l.type !== "eave").map((l, i) => (
        <line key={i} x1={l.p[0]} y1={Y(l.p[1])} x2={l.q[0]} y2={Y(l.q[1])} stroke={LINE_COLORS[l.type]} strokeWidth={sc * 0.22} strokeLinecap="round" />
      ))}
      {mode === "frame" && fr && (
        <g strokeLinecap="round">
          {fr.purlins.map((m, i) => <line key={`p${i}`} x1={m.p[0]} y1={Y(m.p[1])} x2={m.q[0]} y2={Y(m.q[1])} stroke={FRAME_COLORS.purlin} strokeWidth={sc * 0.07} />)}
          {fr.rafters.map((m, i) => <line key={`r${i}`} x1={m.p[0]} y1={Y(m.p[1])} x2={m.q[0]} y2={Y(m.q[1])} stroke={FRAME_COLORS.rafter} strokeWidth={sc * 0.12} />)}
          {fr.supports.map((s, i) => {
            const on = sel === i;
            return (
              <g key={`s${i}`}>
                <line x1={s.a[0]} y1={Y(s.a[1])} x2={s.b[0]} y2={Y(s.b[1])} stroke={FRAME_COLORS.support} strokeWidth={sc * (on ? 0.55 : 0.38)} opacity={on ? 1 : 0.85}
                  className="cursor-grab" onPointerDown={(e) => { setSel(i); grab(e, { s: i, end: "ab", from: toPlan(e), orig: { a: s.a, b: s.b } }); }} />
                {["a", "b"].map((k) => (
                  <circle key={k} cx={s[k][0]} cy={Y(s[k][1])} r={sc * 0.55} fill={dark ? "#0f1222" : "#fff"} stroke={FRAME_COLORS.support} strokeWidth={sc * 0.18}
                    className="cursor-move" onPointerDown={(e) => { setSel(i); grab(e, { s: i, end: k }); }} />
                ))}
              </g>
            );
          })}
          {fr.posts.map((p, i) => <rect key={`t${i}`} x={p.x - sc * 0.4} y={Y(p.y) - sc * 0.4} width={sc * 0.8} height={sc * 0.8} fill={FRAME_COLORS.post} />)}
        </g>
      )}
      {mode !== "frame" && roof.pts.map((a, i) => {
        const b = roof.pts[(i + 1) % roof.pts.length], mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, gable = roof.edges[i]?.type === "gable";
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = (b[1] - a[1]) / L, ny = -(b[0] - a[0]) / L, o = roof.overhang + sc * 2;
        return (
          <g key={`e${i}`} fontSize={sc * 1.1} textAnchor="middle" dominantBaseline="middle">
            <text x={mx + nx * o} y={Y(my + ny * o)} fill={dark ? "#9097b1" : "#667085"}>{fmt(L, 2)}</text>
            <g className="cursor-pointer" onClick={() => toggle(i)}>
              <rect x={mx - sc * 1.9} y={Y(my) - sc * 0.8} width={sc * 3.8} height={sc * 1.6} rx={sc * 0.4} fill={gable ? LINE_COLORS.rake : dark ? "#3a4163" : "#fff"} stroke={dark ? "#6e7591" : "#d0d5dd"} strokeWidth={sc * 0.06} />
              <text x={mx} y={Y(my)} fill={gable ? "#fff" : dark ? "#cdd1e2" : "#344054"} fontSize={sc * 0.9}>{gable ? "จั่ว" : "ปั้นหยา"}</text>
            </g>
            <g className="cursor-copy" onClick={() => insert(i)}>
              <circle cx={mx + (b[0] - a[0]) / L * sc * 3} cy={Y(my + (b[1] - a[1]) / L * sc * 3)} r={sc * 0.65} fill={dark ? "#2c3250" : "#f2f4f7"} />
              <text x={mx + (b[0] - a[0]) / L * sc * 3} y={Y(my + (b[1] - a[1]) / L * sc * 3)} fill="#465fff" fontSize={sc}>+</text>
            </g>
          </g>
        );
      })}
      {mode !== "frame" && roof.pts.map(([x, y], i) => (
        <g key={`v${i}`} className="cursor-move" onPointerDown={(e) => { e.currentTarget.ownerSVGElement.setPointerCapture?.(e.pointerId); setDrag(i); }}>
          <circle cx={x} cy={Y(y)} r={sc * 0.75} fill={drag === i ? "#465fff" : dark ? "#0f1222" : "#fff"} stroke="#465fff" strokeWidth={sc * 0.2} />
          <text x={x + sc} y={Y(y) - sc} fontSize={sc * 0.95} fill={dark ? "#9097b1" : "#667085"}>{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

function LengthChart({ g, fr, dark, height }) {
  const ref = useRef(null);
  useEffect(() => {
    const c = dark ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", text: "#cdd1e2" } : { axis: "#475467", label: "#667085", split: "#eaecf0", text: "#344054" };
    const t = fr?.totals, rows = t ? [["purlin", "แป", t.purlin], ["rafter", "จันทัน", t.rafter], ["support", "สะพาน", t.support], ["ridge", "อกไก่", t.ridge], ["hip", "ตะเข้สัน", t.hip], ["valley", "ตะเข้ราง", t.valley], ["post", "ดั้ง/ตุ๊กตา", t.post]] : [["ridge", "อกไก่", g.ridge], ["hip", "ตะเข้สัน", g.hip], ["valley", "ตะเข้ราง", g.valley], ["rake", "ปั้นลม", g.rake], ["eave", "ชายคา", g.eaveLen]];
    const chart = echarts.init(ref.current, null, { renderer: "svg", height });
    chart.setOption({
      textStyle: { fontFamily: "Sarabun, Leelawadee UI, sans-serif" },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v.toFixed(2)} ม.` },
      grid: { left: 64, right: 46, top: 12, bottom: 28 },
      yAxis: { type: "category", inverse: true, data: rows.map((r) => r[1]), axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label } },
      xAxis: { type: "value", name: "ความยาว (ม.)", nameLocation: "middle", nameGap: 20, axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label }, splitLine: { lineStyle: { color: c.split } } },
      series: [{ type: "bar", barMaxWidth: 22, data: rows.map(([k, , v]) => ({ value: v, itemStyle: { color: LINE_COLORS[k] ?? FRAME_COLORS[k], borderRadius: [0, 6, 6, 0] } })),
        label: { show: true, position: "right", color: c.text, fontSize: 11, formatter: (p) => p.value.toFixed(2) } }],
    });
    const ro = new ResizeObserver(() => chart.resize()); ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [g, fr, dark, height]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export function UtilChart({ dz, items, dark, height }) {
  const ref = useRef(null), list = items ?? dz.rows;
  useEffect(() => {
    const c = dark ? { axis: "#6e7591", label: "#9097b1", split: "#2c3250", text: "#cdd1e2", lim: "#f87171" } : { axis: "#475467", label: "#667085", split: "#eaecf0", text: "#344054", lim: "#f04438" };
    const chart = echarts.init(ref.current, null, { renderer: "svg", height });
    const bar = (name, key, color) => ({ name, type: "bar", barMaxWidth: 10, data: list.map((x) => +(x[key] * 100).toFixed(1)),
      itemStyle: { color: (p) => (p.value > 100 ? c.lim : color), borderRadius: [0, 4, 4, 0] } });
    chart.setOption({
      textStyle: { fontFamily: "Sarabun, Leelawadee UI, sans-serif" },
      tooltip: { trigger: "axis", valueFormatter: (v) => `${v}%` },
      legend: { top: 0, right: 0, textStyle: { color: c.label, fontSize: 11 }, itemWidth: 10, itemHeight: 8 },
      grid: { left: 84, right: 24, top: 24, bottom: 26 },
      yAxis: { type: "category", inverse: true, data: list.map((x) => x.label), axisLine: { lineStyle: { color: c.axis } }, axisLabel: { color: c.label, interval: 0, fontSize: list.length > 9 ? 10 : 12 } },
      xAxis: { type: "value", interval: 20, max: (v) => Math.max(120, Math.ceil(v.max / 20) * 20), axisLabel: { color: c.label, formatter: "{value}%" }, splitLine: { lineStyle: { color: c.split } } },
      series: [{ ...bar("หน่วยแรงดัด", "stress", "#465fff"),
        markLine: { symbol: "none", silent: true, lineStyle: { color: c.lim, type: "dashed" }, label: { show: false }, data: [{ xAxis: 100 }] } },
      bar("ระยะแอ่น", "defl", "#12b76a")],
    });
    const ro = new ResizeObserver(() => chart.resize()); ro.observe(ref.current);
    return () => { ro.disconnect(); chart.dispose(); };
  }, [list, dark, height]);
  return <div ref={ref} style={{ width: "100%", height }} />;
}

export const secLabel = (s) => (s.type === "BAT" ? s.name : `${SYM[s.type] ?? ""} ${s.name}`);

// Section dropdown: optional "follow group" entry, automatic per type, or any listed section.
export function SectionSelect({ value, onChange, inherit, batten, className = "" }) {
  const types = Object.entries(SECTION_TYPES);
  return (
    <select className={`${SEL} !px-2 ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {inherit && <option value="">{inherit}</option>}
      {batten && <option value="batten">แปสำเร็จรูป (กระเบื้อง)</option>}
      {types.map(([ty, label]) => <option key={ty} value={`auto:${ty}`}>อัตโนมัติ · {label.split(" (")[0]}</option>)}
      {types.map(([ty, label]) => (
        <optgroup key={ty} label={label}>{SECTIONS[ty].map((s) => <option key={s.name} value={`${ty}:${s.name}`}>{secLabel(s)}</option>)}</optgroup>
      ))}
    </select>
  );
}

function MemberTable({ dz, d, setD, setHover }) {
  const th = "sticky top-0 bg-white px-2 py-2 text-left text-[11px] font-medium text-gray-400";
  const pct = (v) => <span className={v > 1 ? "font-semibold text-red-600" : ""}>{fmt(v * 100, 0)}%</span>;
  const setPick = (id, v) => { const p = { ...d.memberPick }; if (v) p[id] = v; else delete p[id]; setD("memberPick", p); };
  const setCount = (id, v) => setD("memberCount", { ...d.memberCount, [id]: Number(v) });
  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-[13px] tabular-nums">
        <thead className="border-b border-gray-200"><tr>
          {["ชิ้นส่วน", "หน้าตัด (ช่วงวิกฤต)", "ช่วง (ม.)", "M (กก.-ม.)", "หน่วยแรง", "ระยะแอ่น", "น้ำหนัก (กก.)", ""].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {dz.rows.map((x) => {
            const r = x.r, post = x.key === "post";
            return (
              <tr key={x.key} className="border-b border-gray-100">
                <td className="px-2 py-2 font-medium text-gray-800">{x.label}</td>
                <td className="px-2">{x.count > 1 ? "2×" : ""}{secLabel(r.section)}
                  {x.mixed && <span className="ml-1 rounded bg-brand-50 px-1 text-[10px] text-brand-500">หลายขนาด</span>}
                  {r.fixed && !x.members && <span className="ml-1 text-[10px] text-gray-400">(กำหนดเอง)</span>}</td>
                <td className="px-2">{fmt(x.span, 2)}</td>
                <td className="px-2">{post ? `P ${fmt(r.P, 0)} กก.` : fmt(r.Mx, 1)}</td>
                <td className="px-2">{pct(x.stress)}</td>
                <td className="px-2">{post ? `KL/r ${fmt(r.KLr, 0)}` : pct(x.defl)}</td>
                <td className="px-2">{fmt(x.weight, 0)}</td>
                <td className="px-2"><Badge ok={x.ok} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="mt-4 flex items-baseline justify-between px-2">
        <span className="text-sm font-semibold text-gray-800">รายช่วง — เลือกขนาดเหล็กแต่ละช่วงได้</span>
        <span className="text-[11px] text-gray-400">ชี้ที่แถวเพื่อดูตำแหน่งในภาพ 3D</span>
      </div>
      <table className="mt-1 w-full text-[13px] tabular-nums">
        <thead className="border-b border-gray-200"><tr>
          {["ช่วง", "ยาว (ม.)", "หน้าตัด", "เดี่ยว/คู่", "M (กก.-ม.)", "หน่วยแรง", "ระยะแอ่น", ""].map((h) => <th key={h} className={th}>{h}</th>)}
        </tr></thead>
        <tbody>
          {dz.members.filter((x) => x.group !== "plate").map((x) => (
            <tr key={x.id} className={`border-b border-gray-100 ${x.own ? "bg-brand-50/40" : ""}`} onMouseEnter={() => setHover(x)} onMouseLeave={() => setHover(null)}>
              <td className="px-2 py-1 text-gray-700">{x.label}</td>
              <td className="px-2">{fmt(x.span, 2)}</td>
              <td className="px-2 py-1"><SectionSelect className="h-8 w-[190px] text-[12px]" value={d.memberPick?.[x.id] ?? ""} onChange={(v) => setPick(x.id, v)}
                inherit={x.own ? "ตามกลุ่ม" : `ตามกลุ่ม → ${secLabel(x.r.section)}`} /></td>
              <td className="px-2"><Select className="!h-8 !w-[70px] !px-2 text-[12px]" value={x.count} onChange={(v) => setCount(x.id, v)} options={[[1, "เดี่ยว"], [2, "คู่"]]} /></td>
              <td className="px-2">{fmt(x.r.Mx, 1)}</td>
              <td className="px-2">{pct(x.stress)}</td>
              <td className="px-2">{pct(x.defl)}</td>
              <td className="px-2"><Badge ok={x.r.ok} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {dz.rows[0].r.batten && <p className={`px-2 pt-3 text-[12px] ${dz.rows[0].r.ok ? "text-gray-500" : "font-medium text-red-600"}`}>แปสำเร็จรูปสำหรับกระเบื้อง: ระยะแป {fmt(dz.rows[0].r.s, 2)} ม. {dz.rows[0].r.ok ? "อยู่ในช่วง" : "ไม่อยู่ในช่วง"} 0.30–0.33 ม. (ตั้งที่โหมดโครงหลังคา) · ขนาด/ความหนาเลือกตามตารางผู้ผลิตกระเบื้อง</p>}
      {dz.rows[0].r.T !== undefined && <p className="px-2 pt-3 text-[12px] text-gray-500">เหล็กยึดแป (sag rod): แรงดึง {fmt(dz.rows[0].r.T, 0)} กก. · As ต้องการ {fmt(dz.rows[0].r.AsReq, 3)} ซม.² → ใช้ RB 9 (0.636 ซม.²)</p>}
      <p className="px-2 pt-2 text-[11px] text-gray-400">ASD: Fb = 0.6 Fy · ระยะแอ่นยอมให้ L/360 · "ตามกลุ่ม" ใช้ค่าที่ตั้งในการ์ดหน้าตัดเหล็ก (อัตโนมัติ = เบาที่สุดที่ผ่านและไม่เล็กกว่าขั้นต่ำ)</p>
    </div>
  );
}
const TILES = ["cpac", "ceramic"];

function LoadInputs({ d, set, g, onRoofing = () => {} }) {
  const n = (key, label, unit, step) => <Field label={label} unit={unit}><NumberInput value={d[key]} step={step} onChange={(v) => set(key, v)} /></Field>;
  const roofing = ROOFINGS[d.roofing]?.[1] ?? 0, cos = g ? 1 / Math.sqrt(1 + g.tan * g.tan) : 1;
  return (<>
    <Card title="น้ำหนักบรรทุกและวัสดุ" icon={Triangle}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="วัสดุมุง"><Select value={d.roofing} onChange={(v) => { onRoofing(v); set({ roofing: v, pick: { ...d.pick, purlin: TILES.includes(v) ? "batten" : d.pick.purlin === "batten" ? "auto:C" : d.pick.purlin } }); }} options={Object.entries(ROOFINGS).map(([k, [t, w]]) => [k, `${t} (${w})`])} /></Field>
        {n("live", "น้ำหนักจร", "kg/m²")}{n("wind", "แรงลม", "kg/m²")}{n("extra", "น้ำหนักอื่นๆ", "kg/m²")}
        <Field label="เกรดเหล็ก"><Select value={d.grade} onChange={(v) => set("grade", v)} options={[["Fe-24", "Fe-24 (2400)"], ["Fe-30", "Fe-30 (3000)"]]} /></Field>
        <Field label="เหล็กยึดแป"><Select value={d.sagRows} onChange={(v) => set("sagRows", Number(v))} options={[[0, "ไม่ใช้"], [1, "1 แถว"], [2, "2 แถว"], [3, "3 แถว"]]} /></Field>
        {d.pick.purlin === "batten" && n("battenW", "น้ำหนักแปสำเร็จรูป", "kg/m", "0.05")}
        <Field label="ความหนาเหล็กขั้นต่ำ"><Select value={d.minT ?? 0} onChange={(v) => set("minT", Number(v))} options={[[0, "ไม่จำกัด"], [1.6, "1.6 มม."], [2, "2.0 มม."], [2.3, "2.3 มม."], [3.2, "3.2 มม."]]} /></Field>
      </div>
    </Card>
    <Card title="สรุปน้ำหนักบนหลังคา (ต่อ ม.² ตามแนวราบ)" icon={Ruler}>
      <table className="w-full text-[13px] tabular-nums"><tbody>
        {[["วัสดุมุง " + (ROOFINGS[d.roofing]?.[0] ?? ""), roofing / cos], ["น้ำหนักอื่น (ฝ้า / ฉนวน)", (d.extra ?? 0) / cos], ["น้ำหนักจร", d.live ?? 0], ["แรงลม (ตั้งฉากหลังคา)", d.wind ?? 0]].map(([t, v]) =>
          <tr key={t} className="border-b border-gray-100"><td className="py-1 text-gray-600">{t}</td><td className="text-right">{fmt(v, 1)} กก./ม.²</td></tr>)}
        {g && <tr><td className="py-1 font-medium">พื้นที่หลังคา (ราบ / ตามแนวเอียง)</td><td className="text-right font-medium">{fmt(g.planArea, 1)} / {fmt(g.roofArea, 1)} ม.²</td></tr>}
      </tbody></table>
      <p className="pt-1 text-[11px] text-gray-400">ค่าในแท็บนี้ใช้กับแป จันทัน ตะเข้ อกไก่ สะพาน และอะเส — ตั้งก่อนออกแบบเหล็ก · น้ำหนักเหล็กโครงคิดจากหน้าตัดจริงในขั้นออกแบบ</p>
    </Card>
  </>);
}

function DesignInputs({ d, set }) {
  return (<>
    <Card title="หน้าตัดเหล็ก" icon={Ruler}>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[64px_1fr] items-center gap-1.5 text-[13px]">
          <span className="text-gray-500">ขั้นต่ำ</span>
          <Select className="!px-2" value={d.minSec ?? ""} onChange={(v) => set("minSec", v || null)}
            options={[["", "ไม่กำหนด"], ...SECTIONS.C.map((s) => [s.name, `C ${s.name}`])]} />
        </div>
        {[["purlin", "แป"], ["rafter", "จันทัน"], ["hip", "ตะเข้"], ["ridge", "อกไก่"], ["support", "สะพาน"], ["plate", "อะเส"], ["post", "ดั้ง/ตุ๊กตา"]].map(([k, t]) => (
          <div key={k} className="grid grid-cols-[64px_1fr_64px] items-center gap-1.5 text-[13px]">
            <span className="text-gray-500">{t}</span>
            <SectionSelect value={d.pick[k]} batten={k === "purlin"} onChange={(v) => set("pick", { ...d.pick, [k]: v })} />
            {k in d.counts ? <Select className="!px-2" value={d.counts[k]} onChange={(v) => set("counts", { ...d.counts, [k]: Number(v) })} options={[[1, "เดี่ยว"], [2, "คู่"]]} /> : <span />}
          </div>
        ))}
        <p className="pt-1 text-[11px] text-gray-400">อัตโนมัติ = เลือกหน้าตัดเบาที่สุดที่ผ่าน และไม่เล็กกว่าขั้นต่ำ (ยกเว้นแป) · เลือกขนาดเองได้จากรายการ</p>
      </div>
    </Card>
  </>);
}

// Slope read off the section drawing: the ridge level, or rise : run (e.g. 1:2 or 0.5). Either one sets the angle.
function SlopeFrom({ roof, g, set }) {
  const tan = g.tan, run = (g.top - roof.H) / tan; // plan distance from the wall plate to the highest point
  const toDeg = (t) => +((Math.atan(t) * 180) / Math.PI).toFixed(2);
  const box = (label, unit, shown, parse) => (
    <Field label={label} unit={unit}>
      <input key={shown} defaultValue={shown} className={SEL} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        onBlur={(e) => { const t = parse(e.target.value.trim()); if (t > 0 && t < 20 && Math.abs(toDeg(t) - roof.slope) > 1e-3) set("slope", toDeg(t)); }} />
    </Field>
  );
  // hip / gable roofs are set by the slope alone (the ridge level follows); the ridge level or rise : run is an optional
  // second way in, folded away (user: only needed when a drawing gives heights, e.g. a lean-to)
  return (
    <details className="col-span-2 rounded-md border border-gray-200 px-2 py-1 text-[12px]">
      <summary className="cursor-pointer text-gray-500">อกไก่สูง +{g.top.toFixed(2)} ม. (จากความชัน) · กำหนดจากความสูงแทน (ไม่บังคับ)</summary>
      <div className="mt-2 grid grid-cols-2 gap-3">
        {box("ระดับยอดอกไก่", "m", g.top.toFixed(3), (v) => (Number(v) - roof.H) / run)}
        {box("สูง : ราบ", "", `1:${(1 / tan).toFixed(3).replace(/\.?0+$/, "")}`, (v) => {
          const m = /^([\d.]+)\s*[:/]\s*([\d.]+)$/.exec(v);
          return m ? Number(m[1]) / Number(m[2]) : Number(v);
        })}
      </div>
    </details>
  );
}

export function RoofPage({ roof, set, dark, onFromFrame = null, frame = null, res = null, focus = false }) {
  const sk = useSkeleton(), { g, fr, dz, error, empty } = runRoof(roof, sk), [mode, setMode] = useState(() => location.search.match(/roof=(draw|shape|loads|frame|design|plate)/)?.[1] ?? "draw"), [sel, setSel] = useState(null), [hover, setHover] = useState(null);
  const [view, setView] = useState("2d"), [side, setSide] = useState("table"), [pickP, setPickP] = useState(null);
  const setD = (k, v) => set("design", { ...roof.design, ...(typeof k === "object" ? k : { [k]: v }) }), pl = platesOf(dz);
  const modeBar = (
    <span className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">
      {[["draw", "1 วาดแปลน"], ["shape", "2 รูปทรง"], ["loads", "3 น้ำหนัก / วัสดุมุง"], ["frame", "4 โครงหลังคา"], ["design", "5 ออกแบบเหล็ก"], ["plate", "6 อะเส"]].map(([k, t]) => (
        <button key={k} onClick={() => setMode(k)} className={`rounded-md px-3 py-1 ${mode === k ? "bg-white text-gray-800 shadow-theme-xs" : "text-gray-500"}`}>{t}</button>
      ))}
    </span>
  );
  const fv = (key, label, unit, step) => <Field label={label} unit={unit}><NumberInput value={roof.frame[key]} step={step} onChange={(v) => set("frame", { ...roof.frame, [key]: v })} /></Field>;
  const supList = () => fr.supports.map(({ a, b }) => ({ a, b }));
  const cx = g ? (Math.min(...roof.pts.map((p) => p[0])) + Math.max(...roof.pts.map((p) => p[0]))) / 2 : 0, cy = g ? (Math.min(...roof.pts.map((p) => p[1])) + Math.max(...roof.pts.map((p) => p[1]))) / 2 : 0;
  const f = (key, label, unit, step) => <Field label={label} unit={unit}><NumberInput value={roof[key]} step={step} onChange={(v) => set(key, v)} /></Field>;
  const setPt = (i, k, v) => set("pts", roof.pts.map((p, j) => (j === i ? (k ? [p[0], v] : [v, p[1]]) : p)));
  const del = (i) => { if (roof.pts.length <= 3) return; set("pts", roof.pts.filter((_, j) => j !== i)); set("edges", roof.edges.filter((_, j) => j !== i)); };
  if (mode === "draw") return <DrawBoard roof={roof} set={set} g={g} fr={fr} loose={dz?.loose} plateMembers={dz?.members.filter((m) => m.group === "plate")} modeBar={modeBar} dark={dark} onFromFrame={onFromFrame} />;
  const settings = (
      <div className="space-y-3">
        {mode !== "design" && mode !== "plate" && mode !== "loads" && <Card title="รูปทรงหลังคา" icon={Triangle}>
          <div className="grid grid-cols-2 gap-3">
            {f("slope", "ความชัน", "องศา", "1")}{f("overhang", "ชายคายื่น", "m", "0.1")}
            {g && <SlopeFrom roof={roof} g={g} set={set} />}
            {f("H", "ระดับอะเส", "m", "0.1")}
            <Field label="กริดจับจุด"><Select value={roof.snap} onChange={(v) => set("snap", Number(v))} options={[[0.1, "0.10 ม."], [0.25, "0.25 ม."], [0.5, "0.50 ม."], [1, "1.00 ม."]]} /></Field>
          </div>
        </Card>}
        {mode === "plate" && g ? <PlateInputs d={roof.design} setD={setD} g={g} plates={pl.plates} sizes={pl.sizes} setInner={(v) => set("innerPlates", v)} onAutoInner={() => set("innerPlates", autoInnerPlates(g, fr))} drawn={!!roof.plates?.length} cols={!!roof.columns?.length} /> : mode === "loads" ? <LoadInputs d={roof.design} set={setD} g={g} onRoofing={(v) => TILES.includes(v) && (roof.frame.purlinSp < BATTEN_RANGE[0] || roof.frame.purlinSp > BATTEN_RANGE[1]) && set("frame", { ...roof.frame, purlinSp: 0.32 })} /> : mode === "design" ? <DesignInputs d={roof.design} set={setD} /> : mode === "frame" ? (<>
        <Card title="ระยะโครงหลังคา" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            {fv("rafterSp", "ระยะจันทัน", "m", "0.1")}{fv("purlinSp", "ระยะแป (ตามแนวเอียง)", "m", "0.05")}
            {fv("maxSpan", "ช่วงจันทันสูงสุด", "m", "0.1")}{fv("postSp", "ระยะดั้ง/ตุ๊กตา", "m", "0.1")}
          </div>
        </Card>
        <Card title="สะพานรับจันทัน" icon={GitCommitHorizontal}>
          <div className="space-y-1.5 text-[13px]">
            {fr?.supports.map((s, i) => (
              <div key={i} onClick={() => setSel(i)} className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 ${sel === i ? "bg-brand-50 text-brand-500" : "hover:bg-gray-50"}`}>
                <span className="w-6 text-gray-400">S{i + 1}</span>
                <span className="flex-1 tabular-nums">({fmt(s.a[0], 1)}, {fmt(s.a[1], 1)}) → ({fmt(s.b[0], 1)}, {fmt(s.b[1], 1)})</span>
                <span className="tabular-nums text-gray-500">{fmt(Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]), 2)} ม.</span>
                <button onClick={(e) => { e.stopPropagation(); set("supports", supList().filter((_, j) => j !== i)); setSel(null); }} className="text-gray-400 hover:text-red-500" title="ลบสะพาน"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <div className="flex gap-2 pt-1">
              <button onClick={() => { set("supports", [...supList(), { a: [cx - 2, cy], b: [cx + 2, cy] }]); setSel(fr.supports.length); }}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่มสะพาน</button>
              <button onClick={() => { set("supports", null); setSel(null); }}
                className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"><Wand2 className="h-3.5 w-3.5" />จัดวางอัตโนมัติ</button>
            </div>
            <p className="pt-1 text-[11px] text-gray-400">ลากปลายเพื่อปรับ · ลากกลางเส้นเพื่อย้ายทั้งเส้น · {roof.supports ? "แก้ไขเองแล้ว" : "วางอัตโนมัติตามช่วงจันทันสูงสุด"}</p>
          </div>
        </Card>
        </>) : (
        <Card title="พิกัดมุมผนัง / แนวอะเส" icon={Ruler}>
          <div className="space-y-1.5">
            <div className="grid grid-cols-[14px_1fr_1fr_84px_18px] gap-1.5 text-[11px] text-gray-400"><span>#</span><span>X (m)</span><span>Y (m)</span><span>ขอบถัดไป</span><span /></div>
            {roof.pts.map((p, i) => (
              <div key={i} className="grid grid-cols-[14px_1fr_1fr_84px_18px] items-center gap-1.5 text-[13px]">
                <span className="text-gray-500">{i + 1}</span>
                <NumberInput className="compact-num" value={p[0]} step="0.1" onChange={(v) => setPt(i, 0, v)} />
                <NumberInput className="compact-num" value={p[1]} step="0.1" onChange={(v) => setPt(i, 1, v)} />
                <Select className="!px-2" value={roof.edges[i]?.type ?? "hip"} onChange={(v) => set("edges", roof.edges.map((e, k) => (k === i ? { type: v } : e)))} options={[["hip", "ปั้นหยา"], ["gable", "จั่ว"]]} />
                <button onClick={() => del(i)} className="grid h-7 w-6 place-items-center text-gray-400 hover:text-red-500" title="ลบจุด"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <p className="flex items-center gap-1 pt-1 text-[11px] text-gray-400"><Plus className="h-3 w-3" />ลากจุดในแปลนเพื่อย้าย · กด + กลางขอบเพื่อเพิ่มจุด · กดป้ายเพื่อสลับ จั่ว/ปั้นหยา</p>
          </div>
        </Card>
        )}
      </div>);
  const kpis = g ? (mode === "plate" && dz ? [["จำนวนช่วง", pl.plates.length], ["ความยาวรวม (ม.)", fmt(pl.plates.reduce((a, x) => a + x.len, 0), 2)],
            ["น้ำหนักอะเส (กก.)", fmt(pl.plates.reduce((a, x) => a + x.weight, 0), 0)], ["ช่วงยาวสุด (ม.)", fmt(Math.max(...pl.plates.map((x) => x.span)), 2)],
            ["หน่วยแรงสูงสุด", `${fmt(Math.max(...pl.plates.map((x) => x.stress)) * 100, 0)}%`], ["ระยะแอ่นสูงสุด", `${fmt(Math.max(...pl.plates.map((x) => x.defl)) * 100, 0)}%`],
            ["ขนาดเหล็กที่ใช้", `${pl.sizes.length} ขนาด`], ["สรุป", pl.plates.every((x) => x.r.ok) ? "ผ่านทุกช่วง" : `ไม่ผ่าน ${pl.plates.filter((x) => !x.r.ok).length} ช่วง`]]
            : mode === "design" && dz ? [["น้ำหนักเหล็กรวม (กก.)", fmt(dz.weight, 0)], ["เหล็กต่อพื้นที่ (กก./ม²)", fmt(dz.weight / g.roofArea, 2)],
            ["แป", dz.rows[0].r.section.name], ["จันทัน", dz.rows[1].r.section.name], ["หน่วยแรงสูงสุด", `${fmt(Math.max(...dz.rows.map((x) => x.stress)) * 100, 0)}%`],
            ["ระยะแอ่นสูงสุด", `${fmt(Math.max(...dz.rows.map((x) => x.defl)) * 100, 0)}%`], ["ผ่าน (กลุ่ม)", `${dz.rows.filter((x) => x.r.ok).length}/${dz.rows.length}`], ["สรุป", dz.ok ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"]]
            : mode === "frame" && fr ? [["พื้นที่มุงจริง (ม²)", fmt(g.roofArea, 2)], ["จันทัน (ตัว)", fr.rafters.length], ["ช่วงจันทันยาวสุด (ม.)", fmt(fr.maxSpan, 2)],
            ["ยื่นชายคา (ม.)", fmt(fr.maxCant, 2)], ["แป (ม.)", fmt(fr.totals.purlin, 1)], ["สะพาน (เส้น)", fr.supports.length],
            ["ดั้ง (ต้น)", fr.posts.filter((p) => p.kind === "ดั้ง").length], ["ตุ๊กตา (ต้น)", fr.posts.filter((p) => p.kind === "ตุ๊กตา").length]]
            : [["พื้นที่ใต้หลังคา (ม²)", fmt(g.planArea, 2)], ["พื้นที่มุงจริง (ม²)", fmt(g.roofArea, 2)], ["ความสูงยอด (ม.)", fmt(g.top, 2)],
            ["อกไก่ (ม.)", fmt(g.ridge, 2)], ["ตะเข้สัน (ม.)", fmt(g.hip, 2)], ["ตะเข้ราง (ม.)", fmt(g.valley, 2)], ["ปั้นลม (ม.)", fmt(g.rake, 2)],
            ["หน้าจั่ว (ม²)", fmt(g.gableArea, 2)]]) : [];
  const dxf = () => (mode === "plate" ? downloadDxf(plateModel(g, pl.plates, fr.posts), `${roof.roofNo}-wall-plate`) : downloadDxf(roofPlanModel(g, fr), `${roof.roofNo}-roof-framing`));
  // layout like the structure steps (user 2026-11-04): one toolbar row (sub-tabs, view, summary chips), the plan / table large in the
  // centre, settings in a right panel, tables / charts on demand from the right rail, 3D of the roof alone or of the whole building
  const plan = (<div className="flex h-full min-h-0 flex-col rounded-xl border border-gray-200 bg-white p-2 dark:border-gray-800 dark:bg-gray-900">
        {error ? <p className="text-sm text-red-600">{error}</p> : empty ? <p className="text-sm text-gray-500">ยังไม่มีหลังคา — ไปแท็บ "1 วาดแปลน" แล้วกด "ใช้แปลนจากโครงสร้าง" (แนะนำ), นำเข้า DXF หรือวาดผนังเอง</p> : !g ? <p className="text-sm text-gray-400">กำลังโหลดตัวคำนวณรูปทรงหลังคา…</p> : (
          mode === "plate" ? (
            <div className="flex h-full min-h-0 flex-col gap-2">
              <div className="relative min-h-[300px] flex-[3] rounded-xl bg-gray-50 p-1"><span className="pointer-events-none absolute left-2 top-1 text-[10px] text-gray-400">ล้อเมาส์ = ซูม · ลาก = เลื่อน · ดับเบิลคลิก = พอดีจอ</span><button onClick={() => setSide(side === "table" ? null : "table")} className="absolute right-2 top-1 z-10 rounded-md bg-white px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50">{side === "table" ? "ซ่อนตาราง ▾" : "แสดงตาราง ▴"}</button><PlatePlan g={g} plates={pl.plates} posts={fr?.posts} loose={dz?.loose}columns={roof.columns?.length ? roof.columns : null} hover={hover} setHover={setHover} dark={dark} picked={pickP} onPick={(m) => setPickP(pickP?.id === m.id ? null : m)} /><PlatePick m={pickP && pl.plates.find((x) => x.id === pickP.id)} d={roof.design} setD={setD} onClose={() => setPickP(null)} /></div>
              <div className={side === "table" ? "min-h-0 flex-[1.3] overflow-auto" : "hidden"}><PlateTable plates={pl.plates} d={roof.design} setD={setD} setHover={setHover} warnings={dz?.warnings} looseN={dz?.loose?.length ?? 0} onCarriers={() => set("innerPlates", [...(roof.innerPlates ?? []), ...carrierPlates(roof, g, dz?.loose ?? [])])} /></div>
            </div>
          ) : mode === "design" ? <MemberTable dz={dz} d={roof.design} setD={setD} setHover={setHover} /> : <div className="h-full rounded-xl bg-gray-50 p-2"><PlanEditor roof={roof} set={set} g={g} fr={fr} mode={mode} sel={sel} setSel={setSel} dark={dark} /></div>
        )}
  </div>);
  const roof3d = g && <Roof3D loose={dz?.loose ?? []} onPick={mode === "plate" || mode === "design" ? (m) => setHover(m) : null} g={g} fr={mode !== "shape" ? fr : null} hover={mode === "design" || mode === "plate" ? hover : null} plates={mode === "design" || mode === "plate" ? pl.plates : null} dark={dark} className="h-full min-h-[300px] overflow-hidden rounded-xl border border-gray-200" />;
  const all3d = frame && res ? <Frame3D frame={frame} res={res} cur={frame.floors.length - 1} roof={roof} dark={dark} roofOn className="h-full min-h-[300px] overflow-hidden rounded-xl border border-gray-200" /> : roof3d;
  const views = [["2d", mode === "design" ? "ตาราง" : "แปลน 2D"], ["3d", "3D หลังคา"], ["all", "3D ทั้งหลัง"], ["split", "2D + 3D"]];
  const centre = view === "3d" ? roof3d : view === "all" ? all3d : view === "split" ? <div className="grid h-full min-h-0 grid-cols-2 gap-2"><div className="min-h-0">{plan}</div><div className="min-h-0">{all3d}</div></div> : plan;
  return (
    <main className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-200 bg-white px-3 py-1.5 dark:border-gray-800 dark:bg-gray-900">
        {modeBar}
        <span className="flex rounded-lg bg-gray-100 p-0.5 text-xs font-medium">{views.map(([k, t]) => <button key={k} onClick={() => setView(k)} className={`rounded-md px-2.5 py-1 ${view === k ? "bg-white text-gray-800 shadow-theme-xs" : "text-gray-500"}`}>{t}</button>)}</span>
        <button disabled={!fr} onClick={dxf} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 ring-1 ring-gray-300 hover:bg-gray-50"><Download className="h-3.5 w-3.5" />DXF</button>
        <div className="ml-auto flex flex-wrap gap-1.5 text-[11px]">{kpis.map(([l, v]) => <span key={l} className="rounded-md bg-gray-50 px-2 py-0.5 text-gray-500 ring-1 ring-gray-200 dark:bg-white/5">{l} <b className="tabular-nums text-gray-800 dark:text-gray-100">{v}</b></span>)}</div>
      </div>
      <div className="flex min-h-0 flex-1">
        <section className="flex min-h-0 min-w-0 flex-1 flex-col p-2">{centre}</section>
        {side === "chart" && <section className="flex w-[380px] shrink-0 flex-col border-l border-gray-200 bg-white p-3 dark:border-gray-800 dark:bg-gray-900"><div>
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
            {mode === "design" || mode === "plate" ? "อัตราส่วนการใช้งาน" : mode === "frame" ? "ปริมาณโครงเหล็กรวม" : "ความยาวแนวโครงหลังคา"}
            <span className="text-[11px] font-normal text-gray-500">{mode === "design" || mode === "plate" ? "หน่วยแรง / ระยะแอ่น เทียบค่ายอมให้" : "ความยาวจริงตามแนวเอียง"}</span>
          </div>
          {g && mode === "plate" ? <UtilChart items={pl.plates.map((x) => ({ ...x, label: x.tag }))} dark={dark} height={230} /> : g && mode === "design" ? <UtilChart dz={dz} dark={dark} height={230} /> : g && <LengthChart g={g} fr={mode === "frame" ? fr : null} dark={dark} height={230} />}
        </div></section>}
        {!focus && <aside className="w-[330px] shrink-0 overflow-y-auto border-l border-gray-200 bg-gray-50 p-3 dark:border-gray-800 dark:bg-gray-900/40">{settings}</aside>}
        <nav className="flex w-[52px] shrink-0 flex-col items-center gap-1 border-l border-gray-200 bg-white py-2 dark:border-gray-800 dark:bg-gray-900">
          {[...(mode === "plate" ? [["table", "ตารางช่วง", Ruler]] : []), ["chart", mode === "design" || mode === "plate" ? "อัตราใช้งาน" : "ความยาว", BarChart3]].map(([k, t, I]) => (
            <button key={k} onClick={() => setSide(side === k ? null : k)} title={t} className={`flex w-[46px] flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] font-medium leading-tight ${side === k ? "bg-brand-500 text-[#fff]" : "text-gray-600 hover:bg-gray-50"}`}><I className="h-4 w-4" /><span className="text-center">{t}</span></button>))}
        </nav>
      </div>
    </main>
  );
}
