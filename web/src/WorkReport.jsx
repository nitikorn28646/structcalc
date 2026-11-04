// The whole-project calculation book (user 2026-11-04: headings on the wrong page, more plans, professional): formal cover,
// contents with page numbers, then structure front (summary, criteria, lateral, plans), the roof, structure back (loads and slabs per
// floor, beams, columns, footings, schedules, appendix). Every page is signed (ReportKit page footer).
import { Cover, Toc } from "./ReportKit.jsx";
import { FrameReport } from "./FrameReport.jsx";
import { RoofReport } from "./RoofReport.jsx";
import { analyzeFrame } from "../engine/frame.js";

const STANDARDS = [
  "พระราชบัญญัติควบคุมอาคาร พ.ศ. 2522 และที่แก้ไขเพิ่มเติม",
  "กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร และลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2566",
  "ประกาศกระทรวงมหาดไทย เรื่อง การกำหนดฐานรากของอาคารและพื้นดินที่รองรับอาคาร พ.ศ. 2567",
  "มาตรฐาน ว.ส.ท. วิธีหน่วยแรงใช้งาน (WSD) ประกอบ ACI 318 · โครงหลังคาเหล็ก ASD ตาม AISC / ว.ส.ท.",
];

export function WorkReport({ frame, roof, project }) {
  const res = analyzeFrame(frame), hasRoof = (roof?.pts?.length ?? 0) >= 3, lateral = !!res.lateral;
  const chapters = [
    ["c-criteria", "ข้อมูลการออกแบบและน้ำหนักบรรทุก"],
    ...(lateral ? [["c-lateral", "แรงด้านข้างและชุดผสมแรง"]] : []),
    ["c-plans", "แบบแปลนโครงสร้าง"],
    ...(hasRoof ? [["c-roof", "โครงหลังคาเหล็ก"]] : []),
    ...frame.floors.map((f, k) => [`c-floor-${k}`, `น้ำหนักบรรทุกและพื้น — ${f.name}`]),
    ["c-beams", "การตรวจสอบ type คาน (ช่วงวิกฤต)"],
    ["c-columns", "เสา"],
    ["c-footings", "ฐานราก"],
    ["c-schedules", "ตาราง type คาน เสา และฐานราก"],
    ["c-appendix", "ภาคผนวก — แรงภายในคานทุกช่วง"],
  ];
  const num = Object.fromEntries(chapters.map(([id], i) => [id, i + 1])), nOf = (id) => num[id] ?? "-";
  const floorsText = `${frame.floors.length} ระดับคาน (${frame.floors.map((f) => f.name).join(" · ")})`;
  return (
    <div className="report">
      <Cover project={project} title="รายการคำนวณออกแบบโครงสร้าง" subtitle="อาคารคอนกรีตเสริมเหล็ก และโครงหลังคาเหล็ก"
        items={[["ระดับอาคาร", floorsText], ["วิศวกรผู้คำนวณ", `${project.engineer || "-"}${project.license ? ` (ทะเบียน ${project.license})` : ""}`]]} standards={STANDARDS} />
      <Toc items={chapters.map(([id, th]) => ({ id, n: `${num[id]}.`, th }))} />
      <FrameReport frame={frame} project={project} part="front" nOf={nOf} res={res} />
      {hasRoof && <RoofReport roof={roof} project={project} bare nb={num["c-roof"]} />}
      <FrameReport frame={frame} project={project} part="back" nOf={nOf} res={res} />
    </div>
  );
}
