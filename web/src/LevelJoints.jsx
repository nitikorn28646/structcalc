// Beams at different levels (2026-11-20): table of every step joint + the typical detail per distinct case (step 7 Type คาน, report).
import { jointDetailModel, depthDetailModel } from "../engine/levelDetail.js";
import { stairSvgString } from "./stairSvg.js";
import { fmt } from "./beamModel.js";

export const LEVEL_REFS = "ACI 318-11 (ฐานของ ว.ส.ท. — เลขข้อของ ว.ส.ท. ยังไม่ได้ตรวจกับต้นฉบับ): 12.5 ขอมาตรฐาน ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 ซม. (× 0.7 เมื่อระยะหุ้มด้านข้าง ≥ 6.5 ซม., 12.5.3a) · 12.12.1 เหล็กรับโมเมนต์ลบต้องยึดในหรือผ่านจุดรองรับ · 12.11.1 เหล็กล่างเข้าจุดรองรับ ≥ 15 ซม. · 7.1 ขอ 90° ปลายยาว 12db · 12.15.1 ทาบ class B 1.3ld · 12.14.2.3 ทาบไม่สัมผัส ห่าง ≤ 15 ซม. และ ≤ ระยะทาบ/5 (เมื่อเสาสั้นกว่า ldh: เหล็กบนที่ระดับคานตัวต่ำทาบกับเหล็กบนคานตัวสูง)";

export function LevelJointTable({ rows, small = false }) {
  const c = small ? "px-1 py-0.5" : "px-2 py-1";
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead><tr className="border-b border-gray-200 text-left text-gray-500">{["ชั้น / แนว", "ตำแหน่ง", "ต่าง", "คานตัวสูง", "คานตัวต่ำ", "เสา", "ldh ต้อง / มี", "การตรวจ", "เหล็กบนผ่านรอยต่อ", "ผล"].map((h) => <th key={h} className={c}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className={c}>{r.floorName} / {r.line + 1}</td><td className={c}>({fmt(r.p[0], 2)}, {fmt(r.p[1], 2)})</td><td className={c}>{fmt(r.dz * 100, 0)} ซม.</td>
          <td className={c}>{r.hi?.name} {fmt((r.hi?.b ?? 0) * 100, 0)}×{fmt((r.hi?.h ?? 0) * 100, 0)}</td><td className={c}>{r.lo?.name} {fmt((r.lo?.b ?? 0) * 100, 0)}×{fmt((r.lo?.h ?? 0) * 100, 0)}</td>
          <td className={c}>{r.along ? `${fmt(r.along * 100, 0)} ซม.` : "-"}</td><td className={c}>{r.hook?.ldh ? `${fmt(r.hook.ldh, 1)} / ${fmt(r.hook.avail, 1)} ซม.` : "-"}</td>
          <td className={c}>{r.mode}</td>
          <td className={c}>{r.needCut ? `${r.lo?.name} ${r.lo?.top}${r.addBar ? ` + ${r.addBar}` : ""} · ${fmt(r.AsThrough, 2)} ≥ ${fmt(r.reqAs, 2)} ซม.²` : "-"}</td>
          <td className={`${c} font-semibold ${r.ok ? "text-green-600" : "text-red-600"}`}>{r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
        </tr>))}</tbody>
    </table>
  );
}

export const JointDetail = ({ g, mat, px = 220 }) => <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: stairSvgString(jointDetailModel(g, mat, { sub: `${g.n} จุด · ` }), { px }) }} />;

// beams of different depth, tops level, meeting at a column (engine/levelDetail.js depthJoints)
export const DEPTH_REFS = "ACI 318-11 (ฐานของ ว.ส.ท. — เลขข้อยังไม่ได้ตรวจกับต้นฉบับ): 12.12.1 เหล็กบนต่อเนื่องผ่านจุดรองรับ · 12.11.1 เหล็กล่างอย่างน้อย ⅓ (ช่วงเดี่ยว) / ¼ (ต่อเนื่อง) เข้าจุดรองรับ ≥ 15 ซม. · 12.11.2 คานที่เป็นส่วนของระบบต้านแรงด้านข้าง (เปิดแรงลม / แผ่นดินไหว) เหล็กล่างต้องยึดให้ได้กำลังครากที่ผิวจุดรองรับ → ขอ 90° ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 ซม. (12.5) ภายในความลึกเสา − 5 ซม.";
export function DepthJointTable({ rows, small = false }) {
  const c = small ? "px-1 py-0.5" : "px-2 py-1";
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead><tr className="border-b border-gray-200 text-left text-gray-500">{["ชั้น", "ตำแหน่ง", "คานลึก", "คานตื้น", "ท้องต่าง", "เสา", "ldh ต้อง / มี", "ld เหล็กล่างคานตื้น", "วิธี", "ผล"].map((h) => <th key={h} className={c}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className={c}>{r.floorName}</td><td className={c}>({fmt(r.p[0], 2)}, {fmt(r.p[1], 2)})</td>
          <td className={c}>{r.deep?.name} {fmt((r.deep?.b ?? 0) * 100, 0)}×{fmt((r.deep?.h ?? 0) * 100, 0)}</td><td className={c}>{r.sh?.name} {fmt((r.sh?.b ?? 0) * 100, 0)}×{fmt((r.sh?.h ?? 0) * 100, 0)}</td>
          <td className={c}>{fmt(r.dh * 100, 0)} ซม.</td><td className={c}>{r.along ? `${fmt(r.along * 100, 0)} ซม.` : "-"}</td>
          <td className={c}>{r.hook?.ldh ? `${fmt(r.hook.ldh, 1)} / ${fmt(r.hook.avail, 1)} ซม.` : "-"}</td><td className={c}>{fmt(r.ld * 100, 0)} ซม.</td>
          <td className={c}>{r.mode}</td><td className={`${c} font-semibold ${r.ok ? "text-green-600" : "text-red-600"}`}>{r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
        </tr>))}</tbody>
    </table>
  );
}
export const DepthDetail = ({ g, mat, px = 220 }) => <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: stairSvgString(depthDetailModel(g, mat, { sub: `${g.n} จุด · ` }), { px }) }} />;

export function LevelJointsCard({ rows = [], groups = [], depth = [], dgroups = [], mat }) {
  if (!rows?.length && !depth?.length) return null;
  return (<>{depth?.length > 0 && (
    <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">คานลึกต่างกันที่หัวเสา — หลังคานเท่ากัน ท้องคานต่างระดับ ({depth.length} จุด)</p>
      <p className="mb-2 text-[11px] text-gray-500">เหล็กบนต่อเนื่องผ่านเสา · เหล็กล่างคานตื้นวิ่งผ่านเสาเข้าคานลึก ≥ ld · เหล็กล่างคานลึกงอขอ 90° ขึ้นในเสา (เปิดแรงด้านข้าง: ต้องยึดเต็มกำลัง ldh ≤ เสา − 5 ซม.) · แต่ละช่วงตรวจด้วยความลึกของตัวเอง</p>
      <DepthJointTable rows={depth} />
      <div className="mt-3 grid gap-3 xl:grid-cols-2">{dgroups.map((g, i) => <div key={i} className="rounded-lg ring-1 ring-gray-100 p-1"><DepthDetail g={g} mat={mat} /></div>)}</div>
      <p className="mt-2 text-[11px] text-gray-400">{DEPTH_REFS}</p>
    </div>)}
    {rows?.length > 0 && <LevelStepCard rows={rows} groups={groups} mat={mat} />}</>);
}
function LevelStepCard({ rows, groups, mat }) {
  return (
    <div className="mt-4 rounded-xl bg-white p-3 ring-1 ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
      <p className="text-sm font-semibold text-gray-800 dark:text-gray-100">คานต่างระดับที่หัวเสา ({rows.length} จุด)</p>
      <p className="mb-2 text-[11px] text-gray-500">เหล็กบนของคานตัวสูงงอขอ 90° ฝังในเสา · เหล็กบนของคานตัวต่ำวิ่งผ่านเสาเข้าคานตัวสูง ≥ ld · ถ้าเสายาวไม่พอให้ขอยึด (ldh) ฝั่งคานตัวสูงที่หัวเสาตรวจด้วยความลึก h − ระยะต่าง · ออกใน DXF แบบขยายคานด้วย (แผ่นสุดท้าย)</p>
      <LevelJointTable rows={rows} />
      <div className="mt-3 grid gap-3 xl:grid-cols-2">{groups.map((g, i) => <div key={i} className="rounded-lg ring-1 ring-gray-100 p-1"><JointDetail g={g} mat={mat} /></div>)}</div>
      <p className="mt-2 text-[11px] text-gray-400">{LEVEL_REFS}</p>
    </div>
  );
}
