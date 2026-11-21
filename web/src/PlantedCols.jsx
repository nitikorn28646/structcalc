// Columns standing on beams (2026-11-21): table of every planted column with its checks + the typical detail per distinct case
// (step 7 Type คาน / Type เสา, report beams chapter). Checks: engine/plantedCol.js.
import { Building2 } from "lucide-react";
import { Note, Panel } from "./PanelKit.jsx";
import { plantedDetailModel } from "../engine/plantedCol.js";
import { stairSvgString } from "./stairSvg.js";
import { fmt } from "./beamModel.js";

export const PLANTED_REFS = "ACI 318-11 (ฐานของ ว.ส.ท. — เลขข้อของ ว.ส.ท. ยังไม่ได้ตรวจกับต้นฉบับ): 12.3.2 ระยะฝังรับแรงอัด ldc = 0.075·fy·db/√f′c ≥ 0.00427·fy·db ≥ 20 ซม. (ขอไม่ช่วยรับแรงอัด 12.5.5) · "
  + "12.5.2 / 12.5.3a ขอ 90° ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 ซม. (× 0.7 เมื่อระยะหุ้มข้าง ≥ 6.5 ซม.) ใช้เมื่อเสามีแรงดึง · 7.8.1 ดัดเยื้องเหล็กยืนความชัน ≤ 1:6 · 7.6.3 ช่องว่างเหล็กเสา ≥ max(1.5db, 4 ซม.) · "
  + "แรงกดบนคาน ≤ 0.25f′c (WSD ACI 318-63 1707) ส่วนเกินให้เหล็กเสารับที่ 0.4fy · 10.12 f′c เสา ≤ 1.4 f′c คาน · 7.10.5.4 ปลอกเสาตัวแรก ≤ s/2 เหนือคาน · "
  + "ปลอกคานใต้เสาใช้ระยะที่หัวเสาตลอดความกว้างเสา + d สองข้าง (แนวปฏิบัติ) · ปลอกเสาต่อเนื่องลงในคาน · "
  + "เหล็กคอม้า (ดัด 45° ใต้เสา) 11.4.7.4: n·Ab·fs·sin45° ≥ P·max(a, L − a)/L และ ≤ 0.795√f′c·b·d, ปลายบนยาว ≥ max(0.30 ม., ld) (12.13.4) — เป็นเหล็กเสริม ไม่นับในการออกแบบคาน (ปลอกคานรับแรงเฉือนได้เองแล้ว) · แรงจากเสาเป็นแรงจุดบนคานรับ — ตรวจโมเมนต์ แรงเฉือน ระยะแอ่น และแรงบิดจากโครง 3 มิติในการออกแบบคานแล้ว";

export function PlantedTable({ rows, small = false }) {
  const c = small ? "px-1 py-0.5" : "px-2 py-1";
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead><tr className="border-b border-gray-200 text-left text-gray-500">{["เสา (ชั้น)", "บนคาน", "แรง P", "เสา", "กว้าง / ในปลอก", "ฝังได้ / ldc", "แรงดึง · ldh", "แรงกด / 0.25f′c", "V ที่เสา", "คอม้า (เสริม)", "ผล"].map((h) => <th key={h} className={`${c} font-medium`}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-gray-100 align-top">
          <td className={c}>{r.stack} ({r.floorName})</td>
          <td className={c}>{r.hostName}{r.beamName ? ` · ${r.beamName} ${fmt((r.beam?.b ?? 0) * 100, 0)}×${fmt((r.beam?.h ?? 0) * 100, 0)}` : " · ไม่มีคานรับ"}</td>
          <td className={c}>{fmt(r.P, 0)} กก.</td>
          <td className={c}>{r.lv ? `${r.lv.Bx}×${r.lv.By} ${r.lv.n}-${r.lv.mainBar}` : "-"}</td>
          <td className={`${c} ${r.widthOk === false || r.barsIn === false ? "text-red-600" : ""}`}>{r.beam ? `${r.colPerp} / ${fmt(r.beam.b * 100, 0)} ซม. · ${r.barsIn ? (r.crank > 0.001 ? `ดัดเข้า ${fmt(r.crank, 1)} ซม.` : "อยู่ในปลอก") : "ไม่พอ"}` : "-"}</td>
          <td className={`${c} ${r.compOk === false ? "text-red-600" : ""}`}>{r.beam ? `${fmt(r.avail, 1)} / ${fmt(r.ldc, 1)} ซม.` : "-"}</td>
          <td className={`${c} ${r.tension && !r.hookOk ? "text-red-600" : ""}`}>{r.beam ? (r.tension ? `${r.T > 1 ? `${fmt(r.T, 0)} กก.` : "จากโมเมนต์"} · ${fmt(r.ldh, 1)} ซม.` : "ไม่มี") : "-"}</td>
          <td className={`${c} ${r.bearOk === false ? "text-red-600" : ""}`}>{r.beam ? `${fmt(r.fbr, 1)} / ${fmt(r.fAllow, 1)}` : "-"}</td>
          <td className={c}>{r.beam ? `${fmt(r.Vcol, 0)} กก.${r.nearSupport ? " (ใกล้ที่รองรับ)" : ""}` : "-"}</td>
          <td className={c}>{r.bent ? `${r.bent.n}-${r.bent.bar} · ${fmt(r.bent.cap, 0)} / ${fmt(r.bent.Pside, 0)} กก.` : "-"}</td>
          <td className={`${c} font-semibold ${r.ok ? "text-green-600" : "text-red-600"}`} title={r.why?.join(" · ")}>{r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
        </tr>))}</tbody>
    </table>
  );
}

export const PlantedDetail = ({ g, mat, px = 220 }) => <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: stairSvgString(plantedDetailModel(g, mat, { sub: `${g.n} จุด · ` }), { px }) }} />;

export function PlantedColsCard({ rows = [], groups = [], mat }) {
  if (!rows.length) return null;
  const bad = rows.filter((r) => !r.ok);
  return (
    <Panel title={`เสาตั้งบนคาน (${rows.length} ต้น)`} icon={Building2} hint="แรงจากเสาลงคานเป็นแรงจุด (ตรวจในคานแล้ว) · ตรวจเพิ่ม: เสากว้างไม่เกินคาน เหล็กเสาอยู่ในปลอกคาน ระยะฝังเหล็กเสาในคาน แรงกดบนคาน และช่วงคานที่รับ">
      <div className="overflow-x-auto rounded-lg border border-gray-200"><PlantedTable rows={rows} /></div>
      {bad.length > 0 && <div className="mt-2 space-y-1">{bad.map((r, i) => <p key={i} className="text-[12px] text-red-600">เสา {r.stack} ({r.floorName}): {r.why.join(" · ")}</p>)}</div>}
      <div className="mt-3 grid gap-3 xl:grid-cols-2">{groups.map((g, i) => <div key={i} className="rounded-lg p-1 ring-1 ring-gray-100"><PlantedDetail g={g} mat={mat} /></div>)}</div>
      <Note>{PLANTED_REFS}</Note>
    </Panel>
  );
}
