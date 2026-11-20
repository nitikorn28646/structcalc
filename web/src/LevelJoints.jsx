// Beams at different levels (2026-11-20): table of every step joint + the typical detail per distinct case (step 7 Type คาน, report).
import { jointDetailModel } from "../engine/levelDetail.js";
import { stairSvgString } from "./stairSvg.js";
import { fmt } from "./beamModel.js";

export const LEVEL_REFS = "ACI 318-11 (ฐานของ ว.ส.ท. — เลขข้อของ ว.ส.ท. ยังไม่ได้ตรวจกับต้นฉบับ): 12.5 ขอมาตรฐาน ldh = 0.075·fy·db/√f′c ≥ 8db ≥ 15 ซม. (× 0.7 เมื่อระยะหุ้มด้านข้าง ≥ 6.5 ซม., 12.5.3a) · 12.12.1 เหล็กรับโมเมนต์ลบต้องยึดในหรือผ่านจุดรองรับ · 12.11.1 เหล็กล่างเข้าจุดรองรับ ≥ 15 ซม. · 7.1 ขอ 90° ปลายยาว 12db";

export function LevelJointTable({ rows, small = false }) {
  const c = small ? "px-1 py-0.5" : "px-2 py-1";
  return (
    <table className="w-full text-[12px] tabular-nums">
      <thead><tr className="border-b border-gray-200 text-left text-gray-500">{["ชั้น / แนว", "ตำแหน่ง", "ต่าง", "คานตัวสูง", "คานตัวต่ำ", "เสา", "ldh ต้อง / มี", "การตรวจ", "ผล"].map((h) => <th key={h} className={c}>{h}</th>)}</tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={i} className="border-b border-gray-100">
          <td className={c}>{r.floorName} / {r.line + 1}</td><td className={c}>({fmt(r.p[0], 2)}, {fmt(r.p[1], 2)})</td><td className={c}>{fmt(r.dz * 100, 0)} ซม.</td>
          <td className={c}>{r.hi?.name} {fmt((r.hi?.b ?? 0) * 100, 0)}×{fmt((r.hi?.h ?? 0) * 100, 0)}</td><td className={c}>{r.lo?.name} {fmt((r.lo?.b ?? 0) * 100, 0)}×{fmt((r.lo?.h ?? 0) * 100, 0)}</td>
          <td className={c}>{r.along ? `${fmt(r.along * 100, 0)} ซม.` : "-"}</td><td className={c}>{r.hook?.ldh ? `${fmt(r.hook.ldh, 1)} / ${fmt(r.hook.avail, 1)} ซม.` : "-"}</td>
          <td className={c}>{r.mode}</td><td className={`${c} font-semibold ${r.ok ? "text-green-600" : "text-red-600"}`}>{r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
        </tr>))}</tbody>
    </table>
  );
}

export const JointDetail = ({ g, mat, px = 220 }) => <div className="overflow-x-auto" dangerouslySetInnerHTML={{ __html: stairSvgString(jointDetailModel(g, mat, { sub: `${g.n} จุด · ` }), { px }) }} />;

export function LevelJointsCard({ rows, groups, mat }) {
  if (!rows?.length) return null;
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
