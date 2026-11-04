// Wall-plate (อะเส) tab: plan with every span coloured by its section, span table with own sizes, per-wall column count.
import { useEffect, useRef, useState } from "react";
import { Columns3, Plus, Ruler, Trash2, Wand2 } from "lucide-react";
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import { plateSizes, plateText } from "./drawings.js";
import { SectionSelect } from "./RoofPage.jsx";
import { SECTIONS, SECTION_TYPES, SYM } from "../engine/steelSections.js";
import { inputCls } from "./ui.jsx";

const sizeOf = (sizes, m) => sizes.find((s) => s.k === `${m.count}|${m.r.section.type}|${m.r.section.name}`);
// plate members with their size colour, for the plan, the legend and the 3D view
export const platesOf = (dz) => {
  const plates = dz?.members.filter((x) => x.group === "plate") ?? [], sizes = plateSizes(plates);
  return { plates: plates.map((m) => ({ ...m, color: sizeOf(sizes, m).color })), sizes };
};

export function PlateInputs({ d, setD, g, plates, sizes, setInner, onAutoInner, drawn }) {
  const div = (i) => d.plateDiv?.[i];
  const setDiv = (i, v) => { const p = { ...d.plateDiv }; if (v) p[i] = Math.max(1, Math.round(v)); else delete p[i]; setD("plateDiv", p); };
  return (<>
    <Card title="อะเส — ค่าตั้งต้น" icon={Ruler}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="ระยะเสาอัตโนมัติ" unit="m"><NumberInput value={d.plateSpan} step="0.1" onChange={(v) => setD("plateSpan", v)} /></Field>
        <Field label="เดี่ยว / คู่"><Select value={d.counts.plate} onChange={(v) => setD("counts", { ...d.counts, plate: Number(v) })} options={[[1, "เดี่ยว"], [2, "คู่"]]} /></Field>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3">
        <div className="col-span-2"><Field label="การรองรับอะเส"><Select value={d.plateSupport ?? "span"} onChange={(v) => setD("plateSupport", v)}
          options={[["span", "ช่วงเดี่ยวระหว่างเสา (wL²/8)"], ["cont", "ต่อเนื่องผ่านเสา (wL²/10)"], ["beam", "วางบนคาน คสล. ตลอดแนว (ช่วง = ระยะพุก)"]]} /></Field></div>
        {d.plateSupport === "beam" && <Field label="ระยะพุกยึด" unit="m"><NumberInput value={d.plateAnchor ?? 1.0} step="0.1" onChange={(v) => setD("plateAnchor", v)} /></Field>}
        <Field label="ระยะแอ่นตัวยอมให้"><Select value={d.plateDefl ?? 360} onChange={(v) => setD("plateDefl", Number(v))} options={[[360, "L/360"], [240, "L/240 (ไม่มีฝ้าแขวน)"]]} /></Field>
      </div>
      <p className="mt-1 text-[11px] text-gray-400">อะเสส่วนใหญ่ถูกบังคับด้วยระยะแอ่นตัว · ต่อเนื่อง = ต่อเชื่อมทะลุเสา (M ลด ~20 %, แอ่นลด ~47 %) · วางบนคาน คสล. = รับแรงข้ามแค่ระยะพุก</p>
      <div className="mt-3"><Field label="หน้าตัดตั้งต้นทุกช่วง"><SectionSelect value={d.pick.plate} onChange={(v) => setD("pick", { ...d.pick, plate: v })} /></Field></div>
      <div className="mt-3 space-y-1">
        <div className="text-[11px] text-gray-400">ขนาดที่ใช้ในแปลน</div>
        {sizes.map((s) => (
          <div key={s.k} className="flex items-center gap-2 text-[13px]">
            <i className="h-1.5 w-6 rounded-full" style={{ background: s.color }} />
            <span className="font-medium">{plateText(s)}</span>
            <span className="ml-auto text-gray-400">{plates.filter((m) => sizeOf(sizes, m) === s).map((m) => m.tag).join(", ")}</span>
          </div>
        ))}
      </div>
    </Card>
    <Card title="ไทป์อะเส" icon={Ruler}>
      <div className="space-y-1.5 text-[13px]">
        {(d.plateTypes ?? []).map((t, i) => {
          const upd = (patch) => setD("plateTypes", d.plateTypes.map((x, j) => (j === i ? { ...x, ...patch } : x)));
          return (
            <div key={i} className="grid grid-cols-[52px_1fr_58px_18px] items-center gap-1">
              <input value={t.name} onChange={(e) => upd({ name: e.target.value })} className={`${inputCls} !h-8 !px-1.5 text-center font-semibold`} />
              <select value={t.pick} onChange={(e) => upd({ pick: e.target.value })} className={`${inputCls} !h-8 !px-1.5 text-[12px]`}>
                {Object.entries(SECTION_TYPES).map(([ty, label]) => (
                  <optgroup key={ty} label={label}>{SECTIONS[ty].map((s) => <option key={s.name} value={`${ty}:${s.name}`}>{SYM[ty]} {s.name}</option>)}</optgroup>
                ))}
              </select>
              <select value={t.count} onChange={(e) => upd({ count: Number(e.target.value) })} className={`${inputCls} !h-8 !px-1 text-[12px]`}><option value={1}>เดี่ยว</option><option value={2}>คู่</option></select>
              <button title="ลบไทป์" className="text-gray-400 hover:text-red-500" onClick={() => {
                const left = d.plateTypes.filter((_, j) => j !== i), mt = {};
                for (const [id, v] of Object.entries(d.memberType ?? {})) if (v !== i) mt[id] = v > i ? v - 1 : v; // keep assignments pointing at the right type
                setD({ plateTypes: left, memberType: mt });
              }}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          );
        })}
        <button onClick={() => { const n = (d.plateTypes ?? []).length; setD("plateTypes", [...(d.plateTypes ?? []), { name: `AS${n + 1}`, pick: n ? "C:125x50x20x2.3" : "C:150x50x20x2.3", count: 2 }]); }}
          className="inline-flex w-full items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่มไทป์</button>
        <p className="text-[11px] text-gray-400">{d.plateTypes?.length ? "แต่ละช่วงเลือกไทป์ในตาราง · อัตโนมัติ = ไทป์ที่เบาที่สุดที่ผ่าน" : "ยังไม่มีไทป์: แต่ละช่วงเลือกหน้าตัดเองได้ทุกขนาด"}</p>
      </div>
    </Card>    <Card title="อะเสช่วงใน (รับดั้ง)" icon={Columns3}>
      <div className="space-y-1.5 text-[13px]">
        {plates.filter((m) => m.inner).map((m, k) => {
          const ln = { a: [m.p[0], m.p[1]], b: [m.q[0], m.q[1]] };
          const edit = (end, i, v) => setInner(plates.filter((x) => x.inner).map((x, j) => {
            const o = { a: [x.p[0], x.p[1]], b: [x.q[0], x.q[1]] };
            if (j === k) o[end] = end === "a" ? (i ? [o.a[0], v] : [v, o.a[1]]) : (i ? [o.b[0], v] : [v, o.b[1]]);
            return o;
          }));
          return (
            <div key={m.id} className="grid grid-cols-[26px_1fr_1fr_1fr_1fr_18px] items-center gap-1">
              <span className="font-semibold" style={{ color: m.color }}>{m.tag}</span>
              {[["a", 0], ["a", 1], ["b", 0], ["b", 1]].map(([e, i]) => (
                <NumberInput key={e + i} className="compact-num !h-8 text-[12px]" value={+ln[e][i].toFixed(2)} step="0.1" onChange={(v) => edit(e, i, v)} />
              ))}
              <button title="ลบ" className="text-gray-400 hover:text-red-500"
                onClick={() => setInner(plates.filter((x) => x.inner && x.id !== m.id).map((x) => ({ a: [x.p[0], x.p[1]], b: [x.q[0], x.q[1]] })))}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          );
        })}
        <div className="grid grid-cols-[26px_1fr_1fr_1fr_1fr_18px] gap-1 text-[10px] text-gray-400"><span /><span>X1</span><span>Y1</span><span>X2</span><span>Y2</span><span /></div>
        <div className="flex gap-2 pt-1">
          <button onClick={() => { const c = g.pts.reduce((s, p) => [s[0] + p[0] / g.pts.length, s[1] + p[1] / g.pts.length], [0, 0]);
            setInner([...plates.filter((x) => x.inner).map((x) => ({ a: [x.p[0], x.p[1]], b: [x.q[0], x.q[1]] })), { a: [+(c[0] - 1).toFixed(2), +c[1].toFixed(2)], b: [+(c[0] + 1).toFixed(2), +c[1].toFixed(2)] }]); }}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่ม</button>
          <button onClick={onAutoInner}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"><Wand2 className="h-3.5 w-3.5" />วางตามดั้งอัตโนมัติ</button>
        </div>
        <p className="text-[11px] text-gray-400">วาด/แก้ง่ายกว่าในแท็บ "วาดแปลน" · รับน้ำหนักดั้งเป็นแรงจุด</p>
      </div>
    </Card>
    {drawn ? <p className="px-1 text-[12px] text-gray-500">อะเสแบ่งช่วงตามเสาที่วาดในแท็บ "วาดแปลน"</p> : <Card title="จำนวนช่วงต่อแนวผนัง" icon={Columns3}>
      <div className="space-y-1.5 text-[13px]">
        {g.pts.map((p, k) => {
          const q = g.pts[(k + 1) % g.pts.length], L = Math.hypot(q[0] - p[0], q[1] - p[1]), n = plates.filter((m) => m.edge === k + 1).length;
          return (
            <div key={k} className="grid grid-cols-[52px_1fr_64px] items-center gap-2">
              <span className="text-gray-500">ขอบ {k + 1}</span>
              <span className="tabular-nums text-gray-600">{fmt(L, 2)} ม. · {n}×{fmt(L / n, 2)}</span>
              <NumberInput className="compact-num !h-8" value={div(k + 1) ?? n} step="1" min="1" onChange={(v) => setDiv(k + 1, v)} />
            </div>
          );
        })}
        <p className="pt-1 text-[11px] text-gray-400">ใส่จำนวนช่วงตามตำแหน่งเสาจริง · ลบค่า (0) เพื่อกลับไปแบ่งตามระยะเสา</p>
      </div>
    </Card>}
  </>);
}

// Plan of the wall plates: each span drawn in its size colour with its tag and size, columns at span ends.
export function PlatePlan({ g, plates, posts = [], loose = [], columns, hover, setHover, dark }) {
  const xs = g.eave.map((p) => p[0]), ys = g.eave.map((p) => p[1]), pad = 1.2;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad, w = Math.max(...xs) - x0 + pad, h = Math.max(...ys) - y0 + pad;
  // zoom (wheel, about the pointer) and pan (drag); double-click = fit (user 2026-11-04: the plan was too small to read)
  const [vb, setVb] = useState(null), [drag, setDrag] = useState(null), ref = useRef(null), V = vb ?? [x0, y0, w, h];
  const Y = (y) => y0 + h - (y - y0), sc = (Math.max(w, h) / 48) * Math.max(0.35, Math.min(1, V[2] / w)), ring = (P) => P.map(([x, y]) => `${x},${Y(y)}`).join(" ");
  const toSvg = (e) => { const r = ref.current.getBoundingClientRect(), k = Math.max(V[2] / r.width, V[3] / r.height); return [V[0] + (e.clientX - r.left - (r.width - V[2] / k) / 2) * k, V[1] + (e.clientY - r.top - (r.height - V[3] / k) / 2) * k, k]; };
  useEffect(() => { const el = ref.current; if (!el) return; const f = (e) => { e.preventDefault(); const [mx, my] = toSvg(e), z = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setVb([mx - (mx - V[0]) * z, my - (my - V[1]) * z, V[2] * z, V[3] * z]); }; el.addEventListener("wheel", f, { passive: false }); return () => el.removeEventListener("wheel", f); });
  return (
    <svg ref={ref} viewBox={V.join(" ")} className={`h-full w-full select-none ${drag ? "cursor-grabbing" : ""}`}
      onPointerDown={(e) => { if (e.button === 0 || e.button === 1) setDrag({ x: e.clientX, y: e.clientY, V, k: toSvg(e)[2] }); }}
      onPointerMove={(e) => { if (drag) setVb([drag.V[0] - (e.clientX - drag.x) * drag.k, drag.V[1] - (e.clientY - drag.y) * drag.k, drag.V[2], drag.V[3]]); }}
      onPointerUp={() => setDrag(null)} onPointerLeave={() => setDrag(null)} onDoubleClick={() => setVb(null)}>
      <polygon points={ring(g.eave)} fill={dark ? "#7b8cff10" : "#465fff08"} stroke="#8b8d98" strokeWidth={sc * 0.08} strokeDasharray={`${sc * 0.5} ${sc * 0.3}`} />
      {plates.map((m) => {
        const L = Math.hypot(m.q[0] - m.p[0], m.q[1] - m.p[1]), nx = (m.q[1] - m.p[1]) / L, ny = -(m.q[0] - m.p[0]) / L;
        const mx = (m.p[0] + m.q[0]) / 2 - nx * sc * 1.9, my = (m.p[1] + m.q[1]) / 2 - ny * sc * 1.9, vert = Math.abs(nx) > 0.7, on = hover?.id === m.id;
        return (
          <g key={m.id} onMouseEnter={() => setHover(m)} onMouseLeave={() => setHover(null)} className="cursor-pointer">
            <line x1={m.p[0]} y1={Y(m.p[1])} x2={m.q[0]} y2={Y(m.q[1])} stroke="transparent" strokeWidth={sc * 2} />
            <line x1={m.p[0]} y1={Y(m.p[1])} x2={m.q[0]} y2={Y(m.q[1])} stroke={m.color} strokeWidth={sc * (on ? 0.75 : 0.45)} strokeLinecap="butt" />
            <text x={mx} y={Y(my)} fontSize={sc * 0.72} textAnchor="middle" fill={m.r.ok ? (dark ? "#e3e6f0" : "#344054") : "#f04438"}
              transform={vert ? `rotate(-90 ${mx} ${Y(my)})` : undefined} fontWeight={on ? 700 : 500} stroke={dark ? "#0f1222" : "#f9fafb"} strokeWidth={sc * 0.22} paintOrder="stroke" strokeLinejoin="round">
              <tspan x={mx} dy={-sc * 0.15} fontWeight={700} fill={m.color}>{m.tag}{m.typeName ? ` · ${m.typeName}` : ""}</tspan>
              <tspan x={mx} dy={sc * 0.85}>{plateText({ count: m.count, type: m.r.section.type, name: m.r.section.name })}</tspan>
            </text>
          </g>
        );
      })}
      {posts.filter((p) => p.kind === "ตุ๊กตา").map((p, i) => ( // short posts under rafter supports: small purple diamond
        <rect key={`t${i}`} x={p.x - sc * 0.45} y={Y(p.y) - sc * 0.45} width={sc * 0.9} height={sc * 0.9} fill="#7a5af8" transform={`rotate(45 ${p.x} ${Y(p.y)})`} />
      ))}
      {posts.filter((p) => p.kind === "ดั้ง").map((p, i) => {
        const bad = loose.some((q) => Math.abs(q[0] - p.x) < 0.01 && Math.abs(q[1] - p.y) < 0.01), c = bad ? "#f04438" : "#12b76a";
        return (
          <g key={`d${i}`}>
            {bad && <circle cx={p.x} cy={Y(p.y)} r={sc * 1.3} fill="#f0443833" stroke={c} strokeWidth={sc * 0.08} />}
            <circle cx={p.x} cy={Y(p.y)} r={sc * 1.1} fill={bad ? c : dark ? "#0f1222" : "#fff"} stroke={c} strokeWidth={sc * 0.25} />
            <path d={`M${p.x - sc * 0.65} ${Y(p.y)}H${p.x + sc * 0.65}M${p.x} ${Y(p.y) - sc * 0.65}V${Y(p.y) + sc * 0.65}`} stroke={bad ? "#fff" : c} strokeWidth={sc * 0.2} />
            <text x={p.x + sc * 0.9} y={Y(p.y) + sc * 1.2} fontSize={sc * 0.6} fill={c}>{bad ? "ดั้ง ! ไม่มีอะเสรับ" : ""}</text>
          </g>
        );
      })}
      {(columns ?? plates.filter((m) => !m.inner).flatMap((m) => [m.p, m.q])).map((p, i) => (
        <rect key={i} x={p[0] - sc * 0.4} y={Y(p[1]) - sc * 0.4} width={sc * 0.8} height={sc * 0.8} fill={dark ? "#cdd1e2" : "#1d2939"} />
      ))}
    </svg>
  );
}

export function PlateTable({ plates, d, setD, setHover, warnings = [], looseN = 0, onCarriers = null }) {
  const th = "sticky top-0 bg-white px-2 py-1.5 text-left text-[11px] font-medium text-gray-400";
  const pct = (v) => <span className={v > 1 ? "font-semibold text-red-600" : ""}>{fmt(v * 100, 0)}%</span>;
  const setPick = (id, v) => { const p = { ...d.memberPick }; if (v) p[id] = v; else delete p[id]; setD("memberPick", p); };
  return (<>
    {warnings.map((w) => <p key={w} className="mb-1 rounded-lg bg-red-50 px-2 py-1 text-[12px] font-medium text-red-600">⚠ {w}</p>)}
    {looseN > 0 && onCarriers && <button onClick={onCarriers} className="mb-2 rounded-md bg-brand-500 px-3 py-1.5 text-[12px] font-medium text-[#fff] hover:bg-brand-600">เพิ่มอะเสรับ ({looseN} จุดที่ไม่มีอะเสรับ) — ผ่านแต่ละจุดตามแนว X / Y ที่สั้นกว่า ระหว่างอะเส/ผนัง</button>}
    <table className="w-full text-[13px] tabular-nums">
      <thead className="border-b border-gray-200"><tr>
        {["", "ช่วง", "ยาว (ม.)", "หน้าตัด", "เดี่ยว/คู่", "M (กก.-ม.)", "หน่วยแรง", "ระยะแอ่น", ""].map((t, i) => <th key={i} className={th}>{t}</th>)}
      </tr></thead>
      <tbody>
        {plates.map((x) => (
          <tr key={x.id} className="border-b border-gray-100" onMouseEnter={() => setHover(x)} onMouseLeave={() => setHover(null)}>
            <td className="pl-2"><i className="block h-3 w-1.5 rounded-full" style={{ background: x.color }} /></td>
            <td className="px-2 py-1"><span className="font-semibold">{x.tag}</span> <span className="text-gray-500">{x.label.replace("อะเส ", "")}</span></td>
            <td className="px-2">{fmt(x.span, 2)}</td>
            {d.plateTypes?.length ? <td className="px-2 py-1"><select className={`${inputCls} !h-8 !w-[190px] !px-2 text-[12px]`} value={d.memberType?.[x.id] ?? ""}
              onChange={(e) => { const m = { ...d.memberType }; if (e.target.value === "") delete m[x.id]; else m[x.id] = Number(e.target.value); setD("memberType", m); }}>
              <option value="">อัตโนมัติ → {x.own ? "" : x.typeName}</option>{d.plateTypes.map((t, i) => <option key={i} value={i}>{t.name} · {plateText({ count: t.count, type: t.pick.split(":")[0], name: t.pick.split(":")[1] })}</option>)}</select></td> :
            <td className="px-2 py-1"><SectionSelect className="h-8 w-[190px] text-[12px]" value={d.memberPick?.[x.id] ?? ""} onChange={(v) => setPick(x.id, v)}
              inherit={x.own ? "ตามค่าตั้งต้น" : `ตามค่าตั้งต้น → ${plateText({ count: 1, type: x.r.section.type, name: x.r.section.name })}`} /></td>}
            <td className="px-2"><Select className="!h-8 !w-[70px] !px-2 text-[12px]" value={x.count} onChange={(v) => setD("memberCount", { ...d.memberCount, [x.id]: Number(v) })} options={[[1, "เดี่ยว"], [2, "คู่"]]} /></td>
            <td className="px-2">{fmt(x.r.Mx, 1)}</td>
            <td className="px-2">{pct(x.stress)}</td>
            <td className="px-2">{pct(x.defl)}</td>
            <td className="px-2"><Badge ok={x.r.ok} /></td>
          </tr>
        ))}
      </tbody>
    </table></>
  );
}
