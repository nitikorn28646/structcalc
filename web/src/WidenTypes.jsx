// Side widening types (พอกข้างคาน, user 2026-11-20): table of types + the section of each type in use (step 7 Type คาน, report, DXF).
import { DEFAULT_WIDEN_TYPES } from "../engine/floor.js";
import { widenDetailModel } from "../engine/widenDetail.js";
import { stairSvgString } from "./stairSvg.js";
import { fmt } from "./beamModel.js";

export const widenTypesOf = (frame) => frame.widenTypes ?? DEFAULT_WIDEN_TYPES;
// every widened beam of the project: { floor, i, beam, wt, type (beam type), check (floor.js an.widen[i]) }
export function widenUses(frame, res) {
  const WT = widenTypesOf(frame), out = [];
  frame.floors.forEach((fl, k) => (fl.beams ?? []).forEach((b, i) => {
    const wt = b.widen ? WT[b.widen.type] : null; if (!wt) return;
    const an = res?.floors?.[k], t = frame.beamTypes?.[an?.beamTypeOf?.[i] ?? b.type ?? 0] ?? frame.beamTypes?.[0];
    out.push({ floor: k, floorName: fl.name, i, beam: b, wt, ti: b.widen.type, type: t, check: an?.widen?.[i] ?? null });
  }));
  return out;
}
// distinct sections: widening type × beam type
export const widenSections = (uses) => { const m = new Map(); for (const u of uses) { const k = `${u.ti}|${u.type?.name}`; if (!m.has(k)) m.set(k, { ...u, n: 0 }); m.get(k).n++; } return [...m.values()]; };
export const WIDEN_REFS = "ACI 318-11 (ฐานของ ว.ส.ท. — เลขข้อ ว.ส.ท. ยังไม่ได้ตรวจกับต้นฉบับ): 11.6.4 แรงเฉือนผ่านรอยต่อ Avf = Vu/(φ·μ·fy), μ = 1.4 หล่อพร้อมกัน, φ = 0.75 · 11.6.5 Vn ≤ min(0.2f′c, 3.3 + 0.08f′c, 11 MPa)·Ac · 11.6.8 / 12.13.3 ปลอกยึดทั้งสองฝั่งรอยต่อ โอบเหล็กมุมคาน · 11.4.5.1 ระยะปลอก ≤ d/2 ≤ 30 ซม. · 11.5.6.2 เหล็กยืนห่าง ≤ 30 ซม. · 7.12.2.1 เหล็กยืน ≥ ρ·w·h · 11.5.2.1 แรงบิดสมดุล (รับเต็ม) · น้ำหนักประลัย 1.4D + 1.7L";

export const WidenSection = ({ t, wt, mat, px = 300, sub }) => <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: stairSvgString(widenDetailModel(t, wt, mat, { sub }), { px }) }} />;

const inp = "h-7 w-full rounded border border-gray-300 bg-transparent px-1.5 text-[12px] dark:border-gray-700";
export function WidenTypesCard({ frame, set, res }) {
  const WT = widenTypesOf(frame), uses = widenUses(frame, res), count = (j) => uses.filter((u) => u.ti === j).length;
  const put = (j, patch) => set("widenTypes", WT.map((x, k) => (k === j ? { ...x, ...patch } : x)));
  const del = (j) => { if (count(j)) return; set("widenTypes", WT.filter((_, k) => k !== j)); // keep the beams pointing at the right type
    set("floors", frame.floors.map((f) => ({ ...f, beams: (f.beams ?? []).map((b) => (b.widen && b.widen.type > j ? { ...b, widen: { ...b.widen, type: b.widen.type - 1 } } : b)) }))); };
  const secs = widenSections(uses);
  return (
    <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
      <div className="mb-1 flex items-center gap-2"><p className="text-sm font-semibold text-gray-800 dark:text-gray-100">Type พอกข้างคาน (รับผนังก่อ)</p>
        <button onClick={() => set("widenTypes", [...WT, { name: `W${WT.length + 1}`, w: 0.1, top: "1-DB12", bot: "1-DB12", st: "RB 6", s: 0.15, sets: 1 }])} className="rounded-md px-2 py-0.5 text-[12px] font-medium text-brand-600 ring-1 ring-brand-300 hover:bg-brand-50">+ เพิ่ม type</button></div>
      <p className="mb-2 text-[11px] text-gray-500">กำหนดที่คาน: คลิกคาน → "พอกข้าง" ในแผงขวา · ส่วนพอกหล่อพร้อมคานเต็มความลึก · คานเดิมรับทั้งหมด (น้ำหนักส่วนพอก + ผนัง + แรงบิดจากที่เยื้องศูนย์) · ตรวจรอยต่อด้วยแรงเฉือนผ่านรอยต่อ</p>
      <table className="w-full text-[12px] tabular-nums"><thead><tr className="text-left text-gray-500">{["ชื่อ", "กว้าง (ม.)", "เหล็กบน", "เหล็กล่าง", "ปลอก", "@ (ม.)", "ชุด", "ใช้", ""].map((h) => <th key={h} className="px-1 py-1">{h}</th>)}</tr></thead>
        <tbody>{WT.map((x, j) => (<tr key={j} className="border-t border-gray-100">
          <td className="px-1 py-1"><input className={inp} value={x.name} onChange={(e) => put(j, { name: e.target.value })} /></td>
          <td className="px-1"><input type="number" step="0.05" className={inp} value={x.w} onChange={(e) => put(j, { w: +e.target.value })} /></td>
          <td className="px-1"><input className={inp} value={x.top} onChange={(e) => put(j, { top: e.target.value })} /></td>
          <td className="px-1"><input className={inp} value={x.bot} onChange={(e) => put(j, { bot: e.target.value })} /></td>
          <td className="px-1"><select className={inp} value={x.st} onChange={(e) => put(j, { st: e.target.value })}>{["RB 6", "RB 9", "DB 10", "DB 12"].map((b) => <option key={b}>{b}</option>)}</select></td>
          <td className="px-1"><input type="number" step="0.025" className={inp} value={x.s} onChange={(e) => put(j, { s: +e.target.value })} /></td>
          <td className="px-1"><select className={inp} value={x.sets ?? 1} onChange={(e) => put(j, { sets: +e.target.value })}>{[1, 2].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
          <td className="px-1 text-gray-500">{count(j)} คาน</td>
          <td className="px-1"><button disabled={count(j) > 0} onClick={() => del(j)} className="text-[11px] text-red-600 disabled:opacity-30" title={count(j) ? "มีคานใช้ type นี้อยู่" : "ลบ"}>ลบ</button></td>
        </tr>))}</tbody></table>
      {uses.length > 0 && <>
        <table className="mt-3 w-full text-[12px] tabular-nums"><thead><tr className="text-left text-gray-500">{["ชั้น / คาน", "พอก", "คาน", "น้ำหนักพอก", "ผนัง", "เยื้อง e", "แรงบิด m", "Vu ≤ φVn (กก./ม.)", "ผล"].map((h) => <th key={h} className="px-1 py-1">{h}</th>)}</tr></thead>
          <tbody>{uses.map((u, q) => { const c = u.check; return (<tr key={q} className="border-t border-gray-100">
            <td className="px-1 py-0.5">{u.floorName} / {u.i + 1}</td><td className="px-1">{u.wt.name} {fmt(u.wt.w * 100, 0)} ซม.</td><td className="px-1">{u.type?.name} {fmt((u.type?.b ?? 0) * 100, 0)}×{fmt((u.type?.h ?? 0) * 100, 0)}</td>
            <td className="px-1">{c ? `${fmt(c.qw, 0)} กก./ม.` : "-"}</td><td className="px-1">{c ? `${fmt(c.qWall, 0)} กก./ม.` : "-"}</td><td className="px-1">{c ? `${fmt(c.e, 3)} ม.` : "-"}</td>
            <td className="px-1">{c ? `${fmt(c.m, 0)} กก.-ม./ม.` : "-"}</td><td className="px-1">{c ? `${fmt(c.Vu, 0)} ≤ ${fmt(c.phiVn, 0)}` : "-"}</td>
            <td className={`px-1 font-semibold ${c?.ok ? "text-green-600" : "text-red-600"}`} title={c?.why?.join(" · ")}>{c ? (c.ok ? "ผ่าน" : "ไม่ผ่าน") : "-"}</td></tr>); })}</tbody></table>
        <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{secs.map((u, q) => <div key={q} className="rounded-lg p-1 ring-1 ring-gray-100"><WidenSection t={u.type} wt={u.wt} mat={frame.mat} sub={`บนคาน ${u.type?.name} · ${u.n} คาน`} /></div>)}</div>
      </>}
      <p className="mt-2 text-[11px] text-gray-400">{WIDEN_REFS}</p>
    </div>
  );
}
