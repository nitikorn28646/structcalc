// Bulk load editing (user: clicking every slab / beam then editing one by one is slow):
// PanelTable — every slab panel of the floor in one table, editable cells, tick rows and set kind / t / finish / live / extra at once.
// BeamLoadTable — every drawn beam with its walls and line loads; tick rows and put a wall type + height or a line load on all of them.
import { useState } from "react";
import { fmt } from "./beamModel.js";
import { SLAB_KINDS, wallsOf } from "../engine/floor.js";

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

export function PanelTable({ an, fl, setFloor }) {
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
    <table className="w-full text-[12px]"><thead className="sticky top-0 bg-white"><tr>
      <th className={th}><input type="checkbox" checked={all} onChange={() => setPick(all ? {} : Object.fromEntries(rows.map((p) => [p.key, true])))} /></th>
      {["แผ่น", "ชนิด", "ทิศ", "พื้นที่ (ม.²)", "หนา (ม.)", "ปูผิว", "จร", "ฝ้า/ระบบ", "ช่องเปิด", "รวม (กก./ม.²)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((p, i) => { const own = fl.panels?.[p.key], set1 = (x) => patch([p.key], x);
        return <tr key={p.key} className={`border-t border-gray-100 ${pick[p.key] ? "bg-brand-50/60" : ""}`}>
          <td className={td}><input type="checkbox" checked={!!pick[p.key]} onChange={() => setPick({ ...pick, [p.key]: !pick[p.key] })} /></td>
          <td className={`${td} ${own ? "font-semibold" : ""}`}>P{i + 1}</td>
          <td className={td}><select value={p.st} onChange={(e) => set1({ kind: e.target.value })} className={box}>{Object.entries(SLAB_KINDS).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></td>
          <td className={td}>{p.st === "PS" ? <select value={p.dir} onChange={(e) => set1({ dir: e.target.value })} className={box}><option value="x">X ↔</option><option value="y">Y ↕</option></select> : "-"}</td>
          <td className={td}>{fmt(p.area, 2)}</td>
          <td className={td}><Num v={p.t} on={(v) => set1({ t: v })} step="0.01" w="w-16" /></td>
          <td className={td}><Num v={p.finish} on={(v) => set1({ finish: v })} w="w-16" /></td>
          <td className={td}><Num v={p.live} on={(v) => set1({ live: v })} step="50" w="w-16" /></td>
          <td className={td}><Num v={p.extraSDL} on={(v) => set1({ extra: v })} w="w-14" /></td>
          <td className={td}><input type="checkbox" checked={!!p.open} onChange={() => set1({ open: !p.open })} /></td>
          <td className={td}>{p.open ? "-" : fmt(p.t * 2400 + p.finish + (p.extraSDL ?? 0) + p.live, 0)}</td>
        </tr>; })}</tbody></table>
    <p className="mt-1 text-[11px] text-gray-400">ตัวหนา = แผ่นที่กำหนดเอง (ไม่ใช้ค่าของชั้น) · ติ๊กหลายแถวแล้วกรอกเฉพาะช่องที่จะเปลี่ยน (ช่องว่าง = ไม่เปลี่ยน)</p>
  </div>);
}

export function BeamLoadTable({ fl, setFloor, wallTypes }) {
  const [pick, setPick] = useState({}), [bulk, setBulk] = useState({ kind: wallTypes[0]?.id, h: 3.0, open: 0, q: undefined });
  const beams = fl.beams ?? [], walls = wallsOf(fl), lines = fl.lineLoads ?? [], ids = beams.map((_, i) => i).filter((i) => pick[i]);
  const wName = (k) => wallTypes.find((t) => t.id === k)?.name ?? k;
  const putWalls = () => setFloor({ walls: [...walls.filter((w) => !ids.some((i) => onBeam(w, beams[i]))), ...ids.map((i) => ({ a: [...beams[i].a], b: [...beams[i].b], kind: bulk.kind, h: bulk.h, open: bulk.open ?? 0, layers: 1 }))] });
  const putLine = () => bulk.q > 0 && setFloor({ lineLoads: [...lines.filter((l) => !ids.some((i) => onBeam(l, beams[i]))), ...ids.map((i) => ({ a: [...beams[i].a], b: [...beams[i].b], q: bulk.q, name: "น้ำหนักแผ่บนคาน" }))] });
  const clear = () => setFloor({ walls: walls.filter((w) => !ids.some((i) => onBeam(w, beams[i]))), lineLoads: lines.filter((l) => !ids.some((i) => onBeam(l, beams[i]))) });
  const all = beams.length > 0 && ids.length === beams.length;
  return (<div>
    <Bar n={ids.length} onApply={() => { putWalls(); }} onClear={Object.assign(clear, { label: "ลบผนัง / น้ำหนักบนคานที่เลือก" })}>
      <select value={bulk.kind} onChange={(e) => setBulk({ ...bulk, kind: e.target.value })} className={box}>{wallTypes.map((t) => <option key={t.id} value={t.id}>{t.name} {t.w} กก./ม.²</option>)}</select>
      <label className="flex items-center gap-1">สูง<Num v={bulk.h} on={(v) => setBulk({ ...bulk, h: v })} step="0.1" w="w-14" ph="ม." /></label>
      <label className="flex items-center gap-1">ช่องเปิด<Num v={bulk.open} on={(v) => setBulk({ ...bulk, open: v })} step="5" w="w-14" ph="%" />%</label>
      <span className="mx-1 text-gray-300">|</span>
      <label className="flex items-center gap-1">น้ำหนักแผ่<Num v={bulk.q} on={(v) => setBulk({ ...bulk, q: v })} w="w-16" ph="กก./ม." /></label>
      <button disabled={!ids.length || !(bulk.q > 0)} onClick={putLine} className="rounded-md px-2 py-1 font-medium text-brand-600 ring-1 ring-brand-300 disabled:opacity-40">ใส่น้ำหนักแผ่</button>
    </Bar>
    <table className="w-full text-[12px]"><thead className="sticky top-0 bg-white"><tr>
      <th className={th}><input type="checkbox" checked={all} onChange={() => setPick(all ? {} : Object.fromEntries(beams.map((_, i) => [i, true])))} /></th>
      {["คาน", "จาก → ถึง", "ยาว (ม.)", "ผนังบนคาน", "น้ำหนักผนัง (กก./ม.)", "น้ำหนักแผ่อื่น (กก./ม.)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
      <tbody>{beams.map((b, i) => { const ws = walls.filter((w) => onBeam(w, b)), ls = lines.filter((l) => onBeam(l, b)), wt = (w) => (wallTypes.find((t) => t.id === w.kind)?.w ?? 0) * w.h * (1 - (w.open ?? 0) / 100);
        return <tr key={i} className={`border-t border-gray-100 ${pick[i] ? "bg-brand-50/60" : ""}`}>
          <td className={td}><input type="checkbox" checked={!!pick[i]} onChange={() => setPick({ ...pick, [i]: !pick[i] })} /></td>
          <td className={td}>{i + 1}</td><td className={td}>({fmt(b.a[0], 2)}, {fmt(b.a[1], 2)}) → ({fmt(b.b[0], 2)}, {fmt(b.b[1], 2)})</td>
          <td className={td}>{fmt(Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), 2)}</td>
          <td className={td}>{ws.map((w) => `${wName(w.kind)} สูง ${fmt(w.h, 2)}${w.open ? ` เปิด ${w.open}%` : ""}`).join(", ") || "-"}</td>
          <td className={td}>{ws.length ? fmt(ws.reduce((a, w) => a + wt(w), 0), 0) : "-"}</td>
          <td className={td}>{ls.length ? fmt(ls.reduce((a, l) => a + l.q, 0), 0) : "-"}</td>
        </tr>; })}</tbody></table>
    <p className="mt-1 text-[11px] text-gray-400">ติ๊กคานหลายเส้น → เลือกชนิดผนัง + ความสูง → "ใส่ค่า" (แทนผนังเดิมบนคานนั้น) · น้ำหนักแผ่ = ราวกันตก / งานระบบ ฯลฯ ทั้งเส้นคาน · ผนังที่วาดเองบางส่วนของคานยังอยู่ (แก้ในแปลน)</p>
  </div>);
}
