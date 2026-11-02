// Step 6 tab "ลม / แผ่นดินไหว / Combination" (frame.lateral) and the project-start choice of lateral loads.
// Inputs with defaults from engine/lateral.js; results (floor forces, drift) come from analyzeFrame (res.lateral).
import { Card, Field, NumberInput, Select } from "./ui.jsx";
import { Wind } from "lucide-react";
import { fmt } from "./beamModel.js";
import { DEFAULT_COMBOS, DEFAULT_LATERAL, SITES, TERRAINS } from "../engine/lateral.js";

const th = "px-1 py-1 text-left text-[11px] font-medium text-gray-500", td = "px-1 py-0.5 tabular-nums";

// on / off choice shown in step 0; `asked` records that the user has decided (no default is assumed for them)
export function LateralChoice({ frame, set }) {
  const L = { ...DEFAULT_LATERAL, ...frame.lateral }, put = (k, on) => set("lateral", { ...L, asked: true, [k]: { ...DEFAULT_LATERAL[k], ...L[k], on } });
  return (
    <Card title="แรงด้านข้าง — เลือกตอนเริ่มโครงการ" icon={Wind}>
      <div className={`space-y-2 text-[13px] ${L.asked ? "" : "rounded-lg bg-[#fffaeb] p-2 ring-1 ring-[#fdb022]"}`}>
        {!L.asked && <p className="font-medium text-[#b54708]">เลือกว่าจะคิดแรงลม / แผ่นดินไหวในการออกแบบหรือไม่</p>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!L.wind?.on} onChange={(e) => put("wind", e.target.checked)} /> คิดแรงลม (มยผ. 1311-50)</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={!!L.seismic?.on} onChange={(e) => put("seismic", e.target.checked)} /> คิดแรงแผ่นดินไหว (มยผ. 1301/1302-61)</label>
        {!L.asked && <button onClick={() => set("lateral", { ...L, asked: true })} className="rounded-lg px-3 py-1 text-[12px] font-medium ring-1 ring-gray-300 hover:bg-gray-50">ไม่คิดทั้งสองอย่าง (แรงในแนวดิ่งเท่านั้น)</button>}
        <p className="text-[12px] text-gray-500">ใส่ค่าละเอียดและดูผลที่ขั้น 6 แท็บ "ลม / แผ่นดินไหว / Combination" · แรงด้านข้างใช้โครง 3 มิติ โดยพื้นทุกชั้นแข็งในแนวราบ</p>
      </div>
    </Card>
  );
}

export function LateralPanel({ frame, set, res }) {
  const L = { ...DEFAULT_LATERAL, ...frame.lateral }, w = { ...DEFAULT_LATERAL.wind, ...L.wind }, s = { ...DEFAULT_LATERAL.seismic, ...L.seismic };
  const put = (k, key, v) => set("lateral", { ...L, asked: true, [k]: { ...(k === "wind" ? w : s), [key]: v } });
  const combos = L.combos ?? DEFAULT_COMBOS, setCombos = (c) => set("lateral", { ...L, combos: c });
  const R = res?.lateral, needs3D = (frame.analysis ?? "envelope") !== "envelope";
  const num = (k, key, label, unit, step = "0.1") => <Field label={label} unit={unit}><NumberInput value={(k === "wind" ? w : s)[key]} step={step} onChange={(v) => put(k, key, v)} /></Field>;
  return (
    <div className="grid max-w-6xl gap-4 xl:grid-cols-2">
      {needs3D && <p className="rounded-lg bg-[#fffaeb] p-2 text-[12px] text-[#b54708] xl:col-span-2">แรงด้านข้างต้องใช้โครง 3 มิติ — ตั้ง "แรงที่ใช้ออกแบบ" ที่ขั้น 7 เป็นค่ามากสุดของสองวิธี</p>}
      <Card title="แรงลม — มยผ. 1311-50 (วิธีอย่างง่าย)" icon={Wind}>
        <label className="mb-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!w.on} onChange={(e) => put("wind", "on", e.target.checked)} /> คิดแรงลม</label>
        {w.on && <>
          <div className="grid grid-cols-3 gap-2">
            {num("wind", "V50", "V50", "ม./วินาที", "1")}
            <Field label="ภูมิประเทศ"><Select value={w.terrain} onChange={(v) => put("wind", "terrain", v)} options={Object.entries(TERRAINS)} /></Field>
            {num("wind", "Iw", "Iw", "", "0.05")}{num("wind", "Cg", "Cg", "", "0.1")}{num("wind", "Cpw", "Cp ด้านต้นลม", "", "0.1")}
            <Field label="Cp ด้านท้ายลม" unit="ว่าง = อัตโนมัติ"><input type="number" step="0.1" value={w.Cpl ?? ""} placeholder={R?.wind ? fmt(R.wind.x.Cpl, 2) : "อัตโนมัติ"} className="h-9 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-sm"
              onChange={(e) => put("wind", "Cpl", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            {num("wind", "roofH", "ความสูงหลังคาเหนือคานบนสุด", "ม.", "0.1")}
          </div>
          {R?.wind && <>
            <p className="mt-2 text-[12px] text-gray-500">q = ½ρV50² = {fmt(R.wind.q, 1)} กก./ม.² · H = {fmt(R.wind.H, 2)} ม. · แรงเฉือนฐาน X {fmt(R.wind.x.V, 0)} กก. · Y {fmt(R.wind.y.V, 0)} กก.</p>
            <table className="mt-1 w-full text-[12px]"><thead><tr>{["ทิศ", "ชั้น", "แถบ (ม.)", "กว้าง B", "Ce", "p (กก./ม.²)", "F (กก.)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{["x", "y"].flatMap((d) => R.wind[d].floors.map((f) => <tr key={d + f.floor} className="border-t border-gray-100"><td className={td}>{d.toUpperCase()}</td><td className={td}>{frame.floors[f.floor]?.name}</td><td className={td}>{fmt(f.lo, 2)}–{fmt(f.hi, 2)}</td><td className={td}>{fmt(f.B, 2)}</td><td className={td}>{fmt(f.CeW, 2)}</td><td className={td}>{fmt(f.p, 1)}</td><td className={td}>{fmt(f.F, 0)}</td></tr>))}</tbody></table>
          </>}
        </>}
      </Card>
      <Card title="แผ่นดินไหว — มยผ. 1301/1302-61 (แรงสถิตเทียบเท่า)" icon={Wind}>
        <label className="mb-2 flex items-center gap-2 text-[13px]"><input type="checkbox" checked={!!s.on} onChange={(e) => put("seismic", "on", e.target.checked)} /> คิดแรงแผ่นดินไหว</label>
        {s.on && <>
          <div className="grid grid-cols-3 gap-2">
            {num("seismic", "Ss", "Ss", "g", "0.01")}{num("seismic", "S1", "S1", "g", "0.01")}
            <Field label="ชั้นดิน"><Select value={s.site} onChange={(v) => put("seismic", "site", v)} options={Object.entries(SITES).map(([k, v]) => [k, `${k} ${v}`])} /></Field>
            {num("seismic", "I", "I", "", "0.25")}{num("seismic", "R", "R", "", "0.5")}{num("seismic", "Cd", "Cd", "", "0.5")}{num("seismic", "Ct", "T = Ct·H", "", "0.005")}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Ss, S1 ตามอำเภอที่ตั้ง (มยผ. 1301/1302-61) · โครงต้านแรงดัดธรรมดา คสล. R = 3, Cd = 2.5</p>
          {R?.seismic && <>
            <p className="mt-2 text-[12px] text-gray-500">Fa {fmt(R.seismic.Fa, 2)} · Fv {fmt(R.seismic.Fv, 2)} · SDS {fmt(R.seismic.SDS, 3)} · SD1 {fmt(R.seismic.SD1, 3)} · T {fmt(R.seismic.T, 2)} วินาที · Sa {fmt(R.seismic.Sa, 3)} · Cs {fmt(R.seismic.Cs, 3)} · W {fmt(R.seismic.W / 1000, 1)} ตัน · V {fmt(R.seismic.V, 0)} กก.</p>
            <table className="mt-1 w-full text-[12px]"><thead><tr>{["ชั้น", "สูงจากฐาน (ม.)", "น้ำหนัก w (กก.)", "F (กก.)"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
              <tbody>{R.seismic.floors.map((f) => <tr key={f.floor} className="border-t border-gray-100"><td className={td}>{frame.floors[f.floor]?.name}</td><td className={td}>{fmt(f.h, 2)}</td><td className={td}>{fmt(f.w, 0)}</td><td className={td}>{fmt(f.F, 0)}</td></tr>)}</tbody></table>
          </>}
        </>}
      </Card>
      <Card title="Load combination (WSD)" icon={Wind}>
        <table className="w-full text-[12px]"><thead><tr>{["ใช้", "ชื่อ", "D", "L", "W", "E"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{combos.map((c, i) => <tr key={i} className="border-t border-gray-100">
            <td className={td}><input type="checkbox" checked={c.on !== false} onChange={(e) => setCombos(combos.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} /></td>
            <td className={td}>{c.name}</td>
            {["D", "L", "W", "E"].map((k) => <td key={k} className={td}><input type="number" step="0.05" value={c[k] ?? 0} className="w-14 rounded border border-gray-300 bg-transparent px-1"
              onChange={(e) => setCombos(combos.map((x, j) => (j === i ? { ...x, [k]: Number(e.target.value) } : x)))} /></td>)}
          </tr>)}</tbody></table>
        <p className="mt-1 text-[11px] text-gray-400">ชุดที่มี W / E คิดทั้ง ±X และ ±Y · ชุดที่มี W ใช้เมื่อเปิดแรงลม ชุดที่มี E ใช้เมื่อเปิดแผ่นดินไหว · ใช้ {R?.combos?.length ?? 1} ชุด</p>
        <button onClick={() => setCombos(null)} className="mt-1 text-[12px] text-brand-500">คืนค่าเริ่มต้น</button>
      </Card>
      {R?.drift?.length > 0 && <Card title="การเซตัวระหว่างชั้น (drift)" icon={Wind}>
        <table className="w-full text-[12px]"><thead><tr>{["กรณี", "ชั้น", "สูง h (ม.)", "เซสะสม (มม.)", "เซระหว่างชั้น (มม.)", "ยอมให้ (มม.)", "ผล"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{R.drift.map((d, i) => <tr key={i} className="border-t border-gray-100"><td className={td}>{d.key}</td><td className={td}>{frame.floors[d.floor]?.name}</td><td className={td}>{fmt(d.h, 2)}</td><td className={td}>{fmt(d.d * 1000, 2)}</td>
            <td className={td}>{fmt(d.dd * 1000, 2)}</td><td className={td}>{fmt(d.lim * 1000, 1)}</td><td className={`${td} ${d.ok ? "text-green-600" : "font-semibold text-red-600"}`}>{d.ok ? "ผ่าน" : "ไม่ผ่าน"}</td></tr>)}</tbody></table>
        <p className="mt-1 text-[11px] text-gray-400">ลม: เซระหว่างชั้น ≤ h/400 · แผ่นดินไหว: Cd·δ/I ≤ 0.02h · ค่าจากจุดต่อที่เคลื่อนมากที่สุดของชั้น</p>
      </Card>}
    </div>
  );
}
