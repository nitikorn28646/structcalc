// Step 8 tab "ฐานราก": footing types (piles, pile size, bars, spacing, cap width) like the drawings' F1, F2…, and the type of
// each column's footing (auto = the smallest option that passes). Results come from analyzeFrame (res.footings).
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "./beamModel.js";

const PILES = ["I-18", "I-22", "I-26"], BARS = ["DB 12", "DB 16"], th = "px-1 py-1 text-left text-[11px] font-medium text-gray-500", td = "px-1 py-0.5 tabular-nums";
const sel = "h-7 rounded border border-gray-300 bg-transparent px-1 text-[12px]";

export function FootingTypes({ frame, set, res }) {
  const types = frame.footTypes ?? [], pick = frame.footPick ?? {};
  const put = (i, k, v) => set("footTypes", types.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const add = () => set("footTypes", [...types, { name: `F${types.length + 1}`, n: 1, pile: "I-18", bar: "DB 12", s: 0.15, w: 0 }]);
  const del = (i) => { set("footTypes", types.filter((_, j) => j !== i)); set("footPick", Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== i).map(([k, v]) => [k, v > i ? v - 1 : v]))); };
  return (
    <div className="max-w-6xl space-y-4 text-[12px]">
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">Type ฐานราก (เหมือนตารางฐานรากในแบบ)</p>
        <table className="w-full max-w-3xl"><thead><tr>{["ชื่อ", "จำนวนเข็ม", "เข็ม", "เหล็กฐาน", "ระยะเหล็ก (ม.)", "กว้างฐาน (ม.)", "ใช้", ""].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{types.map((t, i) => <tr key={i} className="border-t border-gray-100">
            <td className={td}><input value={t.name} onChange={(e) => put(i, "name", e.target.value)} className={`${sel} w-14`} /></td>
            <td className={td}><select value={t.n} onChange={(e) => put(i, "n", Number(e.target.value))} className={sel}>{[1, 2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
            <td className={td}><select value={t.pile} onChange={(e) => put(i, "pile", e.target.value)} className={sel}>{PILES.map((p) => <option key={p}>{p}</option>)}</select></td>
            <td className={td}><select value={t.bar} onChange={(e) => put(i, "bar", e.target.value)} className={sel}>{BARS.map((b) => <option key={b}>{b}</option>)}</select></td>
            <td className={td}><select value={t.s} onChange={(e) => put(i, "s", Number(e.target.value))} className={sel}>{[0.1, 0.15, 0.2].map((s) => <option key={s} value={s}>{s.toFixed(2)}</option>)}</select></td>
            <td className={td}><select value={t.w ?? 0} onChange={(e) => put(i, "w", Number(e.target.value))} className={sel}>{[[0, "เล็กสุดที่ได้"], [0.8, "0.80"], [0.9, "0.90"], [1.0, "1.00"], [1.2, "1.20"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></td>
            <td className={td}>{(res.footings ?? []).filter((f) => f.type === t.name).length} ฐาน</td>
            <td className={td}><button onClick={() => del(i)} title="ลบ type" className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td>
          </tr>)}</tbody></table>
        <button onClick={add} className="mt-1 flex items-center gap-1 text-[12px] font-medium text-brand-500"><Plus className="h-3.5 w-3.5" />เพิ่ม type ฐานราก</button>
        <p className="mt-1 text-[11px] text-gray-400">กว้างฐาน "เล็กสุดที่ได้" = ฐานเล็กที่สุดตามระยะเข็ม / ระยะหุ้ม · ฐานที่ไม่ได้เลือก type ใช้ "อัตโนมัติ" = ตัวเลือกเล็กสุดที่ผ่าน</p>
      </section>
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">ฐานรากแต่ละเสา</p>
        <table className="w-full"><thead><tr>{["เสา (X, Y)", "Type", "P (ตัน)", "M x / y (กก.-ม.)", "ชุดแรง", "เข็ม", "ฐาน Bx × By (ม.)", "แรงต่อเข็ม / ปลอดภัย (ตัน)", "เหล็ก", "ผล"].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
          <tbody>{(res.footings ?? []).map((f) => <tr key={f.stack} className="border-t border-gray-100">
            <td className={td}>{f.stack}</td>
            <td className={td}><select value={pick[f.stack] ?? ""} onChange={(e) => set("footPick", { ...pick, [f.stack]: e.target.value === "" ? undefined : Number(e.target.value) })} className={sel}>
              <option value="">อัตโนมัติ</option>{types.map((t, i) => <option key={i} value={i}>{t.name}</option>)}</select></td>
            <td className={td}>{fmt(f.P / 1000, 2)}</td><td className={td}>{fmt(f.Mx ?? 0, 0)} / {fmt(f.My ?? 0, 0)}</td><td className={td}>{f.combo ?? "D+L"}</td>
            <td className={td}>{f.n} × {f.pile}</td><td className={td}>{f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)}` : "-"}</td>
            <td className={td}>{f.r ? `${fmt(f.r.Ptmax / 1000, 2)} / ${fmt(f.r.Pallow / 1000, 2)}` : "-"}</td>
            <td className={td}>{f.r ? [f.r.longText, f.r.shortText].filter(Boolean).join(" · ") : f.error}</td>
            <td className={`${td} ${f.ok ? "text-green-600" : "font-semibold text-red-600"}`}>{f.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
          </tr>)}</tbody></table>
      </section>
    </div>
  );
}
