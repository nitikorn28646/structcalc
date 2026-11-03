// Bulk load editing (user: clicking every slab / beam then editing one by one is slow):
// PanelTable — every slab panel of the floor in one table, editable cells, tick rows and set kind / t / finish / live / extra at once.
// BeamLoadTable — every drawn beam with its walls and line loads; tick rows and put a wall type + height or a line load on all of them.
import { useState } from "react";
import { fmt } from "./beamModel.js";
import { SLAB_KINDS, wallsOf } from "../engine/floor.js";
import { Grid } from "./Grid.jsx";

const th = "px-1 py-1 text-left text-[11px] font-medium text-gray-500", td = "px-1 py-0.5 tabular-nums";
const box = "h-7 rounded border border-gray-300 bg-transparent px-1 text-[12px]";
const Num = ({ v, on, step = "10", w = "w-16", ph }) => <input type="number" step={step} value={v ?? ""} placeholder={ph} onChange={(e) => on(e.target.value === "" ? undefined : Number(e.target.value))} className={`${box} ${w}`} />;
const same = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.02;
const onBeam = (w, b) => (same(w.a, b.a) && same(w.b, b.b)) || (same(w.a, b.b) && same(w.b, b.a));

function Bar({ children, n, onApply, onClear }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-brand-100 bg-brand-50/50 px-2 py-1.5 text-[12px]">
      <span className="font-medium text-gray-700">ใส่ค่าให้แถวที่เลือก ({n})</span>{children}
      <button disabled={!n} onClick={onApply} className="rounded-md bg-brand-500 px-3 py-1 font-medium text-[#fff] disabled:opacity-40">ใส่ค่า</button>
      {onClear && <button disabled={!n} onClick={onClear} className="rounded-md px-2 py-1 font-medium text-red-600 ring-1 ring-red-200 disabled:opacity-40">{onClear.label ?? "ล้าง"}</button>}
    </div>);
}

export function PanelTable({ an, fl, setFloor, dark }) {
  const [pick, setPick] = useState({}), [bulk, setBulk] = useState({});
  const rows = an.panels ?? [], keys = rows.filter((p) => pick[p.key]).map((p) => p.key);
  const patch = (list, p) => setFloor({ panels: { ...(fl.panels ?? {}), ...Object.fromEntries(list.map((k) => [k, { ...fl.panels?.[k], ...p }])) } });
  const apply = () => { const p = Object.fromEntries(Object.entries(bulk).filter(([, v]) => v !== undefined && v !== "")); if (Object.keys(p).length) patch(keys, p); };
  const all = rows.length > 0 && keys.length === rows.length;
  return (<div>
    <Bar n={keys.length} onApply={apply} onClear={Object.assign(() => setFloor({ panels: Object.fromEntries(Object.entries(fl.panels ?? {}).filter(([k]) => !keys.includes(k))) }), { label: "กลับเป็นค่าของชั้น" })}>
      <select value={bulk.kind ?? ""} onChange={(e) => setBulk({ ...bulk, kind: e.target.value || undefined })} className={box}><option value="">ชนิด —</option>{Object.entries(SLAB_KINDS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select>
      <label className="flex items-center gap-1">หนา<Num v={bulk.t} on={(v) => setBulk({ ...bulk, t: v })} step="0.01" ph="ม." /></label>
      <label className="flex items-center gap-1">ปูผิว<Num v={bulk.finish} on={(v) => setBulk({ ...bulk, finish: v })} ph="กก./ม.²" /></label>
      <label className="flex items-center gap-1">จร<Num v={bulk.live} on={(v) => setBulk({ ...bulk, live: v })} step="50" ph="กก./ม.²" /></label>
      <label className="flex items-center gap-1">ฝ้า/ระบบ<Num v={bulk.extra} on={(v) => setBulk({ ...bulk, extra: v })} ph="กก./ม.²" /></label>
    </Bar>
    <div className="h-[calc(100vh-330px)] min-h-[280px]"><Grid dark={dark} rows={rows.map((p, i) => ({ id: p.key, name: `P${i + 1}${fl.panels?.[p.key] ? " *" : ""}`, st: p.st, dir: p.st === "PS" ? p.dir : "", area: p.area, t: p.t, finish: p.finish, live: p.live, extra: p.extraSDL ?? 0, open: !!p.open,
      total: p.open ? null : p.t * 2400 + p.finish + (p.extraSDL ?? 0) + p.live }))}
      columns={[{ field: "name", headerName: "แผ่น", width: 74 }, { field: "st", headerName: "ชนิด", width: 150, editable: true, type: "select", options: Object.entries(SLAB_KINDS) },
        { field: "dir", headerName: "ทิศ (PS)", width: 84, editable: (r) => r.st === "PS", type: "select", options: [["x", "X ↔"], ["y", "Y ↕"]] },
        { field: "area", headerName: "พื้นที่ ม.²", width: 90, type: "number", fmt: (v) => fmt(v, 2) }, { field: "t", headerName: "หนา ม.", width: 80, editable: true, type: "number" },
        { field: "finish", headerName: "ปูผิว", width: 80, editable: true, type: "number" }, { field: "live", headerName: "จร", width: 80, editable: true, type: "number" },
        { field: "extra", headerName: "ฝ้า/ระบบ", width: 90, editable: true, type: "number" }, { field: "open", headerName: "ช่องเปิด", width: 84, editable: true, type: "check" },
        { field: "total", headerName: "รวม กก./ม.²", width: 100, type: "number", fmt: (v) => (v == null ? "-" : fmt(v, 0)) }]}
      onSelect={(ids) => setPick(Object.fromEntries(ids.map((k) => [k, true])))}
      onChange={(ch) => { const by = {}; for (const c of ch) (by[c.id] ??= {})[c.field === "st" ? "kind" : c.field] = c.value; setFloor({ panels: { ...(fl.panels ?? {}), ...Object.fromEntries(Object.entries(by).map(([k, p]) => [k, { ...fl.panels?.[k], ...p }])) } }); }} /></div>
    <p className="mt-1 text-[11px] text-gray-400">* = แผ่นที่กำหนดเอง · คลิกช่องแล้วพิมพ์ (หรือดับเบิลคลิก) เพื่อแก้ · Ctrl+V วางค่าที่คัดลอกจาก Excel ลงตั้งแต่ช่องที่เลือก · ติ๊กหลายแถวแล้ว Ctrl+D = เติมค่าของแถวแรกลงแถวที่ติ๊ก · หรือกรอกแถบด้านบนแล้วกด "ใส่ค่า"</p>
  </div>);
}

export function BeamLoadTable({ fl, setFloor, wallTypes, resolveW = (w) => w, dark }) {
  const [pick, setPick] = useState({}), [bulk, setBulk] = useState({ kind: wallTypes[0]?.id, h: undefined, open: 0, q: undefined });
  const beams = fl.beams ?? [], walls = wallsOf(fl), lines = fl.lineLoads ?? [], ids = beams.map((_, i) => i).filter((i) => pick[i]);
  const wName = (k) => wallTypes.find((t) => t.id === k)?.name ?? k;
  const putWalls = () => setFloor({ walls: [...walls.filter((w) => !ids.some((i) => onBeam(w, beams[i]))), ...ids.map((i) => ({ a: [...beams[i].a], b: [...beams[i].b], kind: bulk.kind, h: bulk.h ?? 3, hAuto: !(bulk.h > 0), open: bulk.open ?? 0, layers: 1 }))] });
  const putLine = () => bulk.q > 0 && setFloor({ lineLoads: [...lines.filter((l) => !ids.some((i) => onBeam(l, beams[i]))), ...ids.map((i) => ({ a: [...beams[i].a], b: [...beams[i].b], q: bulk.q, name: "น้ำหนักแผ่บนคาน" }))] });
  const clear = () => setFloor({ walls: walls.filter((w) => !ids.some((i) => onBeam(w, beams[i]))), lineLoads: lines.filter((l) => !ids.some((i) => onBeam(l, beams[i]))) });
  const all = beams.length > 0 && ids.length === beams.length;
  return (<div>
    <Bar n={ids.length} onApply={() => { putWalls(); }} onClear={Object.assign(clear, { label: "ลบผนัง / น้ำหนักบนคานที่เลือก" })}>
      <select value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value })} className={box}>{wallTypes.map((t) => <option key={t.id} value={t.id}>{t.name} {t.w} กก./ม.²</option>)}</select>
      <label className="flex items-center gap-1">สูง<Num v={bulk.h} on={(v) => setBulk({ ...bulk, h: v })} step="0.1" w="w-20" ph="อัตโนมัติ" /></label>
      <label className="flex items-center gap-1">ช่องเปิด<Num v={bulk.open} on={(v) => setBulk({ ...bulk, open: v })} step="5" w="w-14" ph="%" />%</label>
      <span className="mx-1 text-gray-300">|</span>
      <label className="flex items-center gap-1">น้ำหนักแผ่<Num v={bulk.q} on={(v) => setBulk({ ...bulk, q: v })} w="w-16" ph="กก./ม." /></label>
      <button disabled={!ids.length || !(bulk.q > 0)} onClick={putLine} className="rounded-md px-2 py-1 font-medium text-brand-600 ring-1 ring-brand-300 disabled:opacity-40">ใส่น้ำหนักแผ่</button>
    </Bar>
    <div className="h-[calc(100vh-330px)] min-h-[280px]"><Grid dark={dark} rows={beams.map((b, i) => { const ws = walls.filter((w) => onBeam(w, b)), ls = lines.filter((l) => onBeam(l, b)), wt = (w0) => { const w = resolveW(w0); return (wallTypes.find((t) => t.id === w.kind)?.w ?? 0) * w.h * (1 - (w.open ?? 0) / 100) * (w.layers ?? 1); };
        return { id: String(i), n: i + 1, from: `(${fmt(b.a[0], 2)}, ${fmt(b.a[1], 2)}) → (${fmt(b.b[0], 2)}, ${fmt(b.b[1], 2)})`, L: Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]),
          wall: ws.map((w) => `${wName(w.kind)} สูง ${fmt(resolveW(w).h, 2)}${w.hAuto ? " (อัตโนมัติ)" : ""}${w.openings?.length ? ` ประตู/หน้าต่าง ${w.openings.length}` : w.open ? ` เปิด ${w.open}%` : ""}`).join(", ") || "-",
          qw: ws.length ? ws.reduce((a, w) => a + wt(w), 0) : null, ql: ls.length ? ls.reduce((a, l) => a + l.q, 0) : null }; })}
      columns={[{ field: "n", headerName: "คาน", width: 70 }, { field: "from", headerName: "จาก → ถึง", width: 210 }, { field: "L", headerName: "ยาว ม.", width: 80, type: "number", fmt: (v) => fmt(v, 2) },
        { field: "wall", headerName: "ผนังบนคาน" }, { field: "qw", headerName: "ผนัง กก./ม.", width: 100, type: "number", fmt: (v) => (v == null ? "-" : fmt(v, 0)) },
        { field: "ql", headerName: "แผ่อื่น กก./ม.", width: 100, type: "number", fmt: (v) => (v == null ? "-" : fmt(v, 0)) }]}
      onSelect={(ids) => setPick(Object.fromEntries(ids.map((k) => [k, true])))} onChange={() => {}} /></div>
    <p className="mt-1 text-[11px] text-gray-400">ติ๊กคานหลายเส้น → เลือกชนิดผนัง + ความสูง → "ใส่ค่า" (แทนผนังเดิมบนคานนั้น) · น้ำหนักแผ่ = ราวกันตก / งานระบบ ฯลฯ ทั้งเส้นคาน · ผนังที่วาดเองบางส่วนของคานยังอยู่ (แก้ในแปลน)</p>
  </div>);
}
