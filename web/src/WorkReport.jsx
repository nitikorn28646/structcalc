// The whole-project calculation book (user 2026-11-04: headings on the wrong page, more plans, professional): formal cover,
// contents with page numbers, then structure front (summary, criteria, lateral, plans), the roof, structure back (loads and slabs per
// floor, beams, columns, footings, schedules, appendix). Every page is signed (ReportKit page footer).
import { Cover, Toc } from "./ReportKit.jsx";
import { FrameReport } from "./FrameReport.jsx";
import { RoofReport } from "./RoofReport.jsx";
import { analyzeFrame } from "../engine/frame.js";
import { runRoof, useSkeleton } from "./RoofPage.jsx";
import { StatusChapter, projectStatus } from "./StatusSummary.jsx";

const STANDARDS = [
  "พระราชบัญญัติควบคุมอาคาร พ.ศ. 2522 และที่แก้ไขเพิ่มเติม",
  "กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร และลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2566",
  "ประกาศกระทรวงมหาดไทย เรื่อง การกำหนดฐานรากของอาคารและพื้นดินที่รองรับอาคาร พ.ศ. 2567",
  "มาตรฐาน ว.ส.ท. วิธีหน่วยแรงใช้งาน (WSD) ประกอบ ACI 318 · โครงหลังคาเหล็ก ASD ตาม AISC / ว.ส.ท.",
];

const UNITS = [["แรง / น้ำหนัก", "กก. (kgf) · ตัน = 1,000 กก."], ["โมเมนต์", "กก.-ม. (kgf·m)"], ["หน่วยแรง / กำลังวัสดุ", "กก./ซม.² (ksc)"], ["แรงดันดิน", "กก./ม.² · ตัน/ม.²"],
  ["พื้นที่เหล็กเสริม", "ซม.²"], ["ระยะ ขนาดหน้าตัด", "ม. · ซม. (หน้าตัด) · มม. (เหล็กขึ้นรูปเย็น)"], ["ระยะแอ่น / การเสียรูป", "มม."], ["น้ำหนักแผ่", "กก./ม. (ตามแนวยาว) · กก./ม.² (ต่อพื้นที่)"]];

// chapter 1: project data, scope of this book, standards, the unit system, the overall result (details in chapter 10)
function ProjectInfo({ project, frame, res, st, hasRoof, n, statusN }) {
  const spans = res.floors.reduce((t, a) => t + a.spans.length, 0);
  const rows = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner], ["สถานที่ก่อสร้าง", project.location], ["วิศวกรผู้คำนวณ", `${project.engineer || "-"}${project.license ? ` (ทะเบียน ${project.license})` : ""}`], ["วันที่", project.date],
    ["ระดับอาคาร", `${frame.floors.length} ระดับคาน (${frame.floors.map((f) => f.name).join(" · ")})`]].filter(([, v]) => v);
  return (
    <section id="c-project" className="rp-chapter mb-4">
      <h2 className="mb-1.5 flex items-baseline gap-3 border-b-[1pt] border-[#1f3a5f] pb-1 text-[#1f3a5f]"><span className="text-[18pt] font-semibold">{n}</span><span className="rp-sec-name text-[16pt] font-semibold">ข้อมูลโครงการ</span><span className="ml-auto text-[8.5pt] uppercase tracking-wide text-[#98a2b3]">Project information</span></h2>
      <table className="w-full text-[10pt]"><tbody>{rows.map(([k, v]) => <tr key={k} className="border-b border-[#eaecf0]"><td className="w-[32%] py-1 text-[#667085]">{k}</td><td className="py-1 font-semibold">{v}</td></tr>)}</tbody></table>
      <p className="rp-sub mt-3 text-[12pt] font-semibold text-[#1f3a5f]">ขอบเขตงานในเล่มนี้</p>
      <ul className="list-disc pl-5 text-[10pt]">
        {hasRoof && <li>โครงหลังคาเหล็ก: แป จันทัน ตะเข้ อกไก่ อะเส ดั้ง/ตุ๊กตา (ASD)</li>}
        <li>พื้น คสล. และบันได ทุกชั้น · คาน {spans} ช่วง · เสา {res.columns.length} ต้น/ชั้น · ฐานราก {res.footings.length} ฐาน (WSD)</li>
        <li>การวิเคราะห์: คานต่อเนื่องและโครงข้อแข็ง 3 มิติ{res.lateral ? " · แรงลม / แผ่นดินไหว และชุดผสมแรง" : " · น้ำหนักบรรทุกแนวดิ่ง (ไม่ได้คิดแรงด้านข้างในเล่มนี้)"}</li>
        <li>สิ่งที่ไม่อยู่ในขอบเขต: ดูบท {statusN} หัวข้อ “ขอบเขตการตรวจสอบ”</li>
      </ul>
      <p className="rp-sub mt-3 text-[12pt] font-semibold text-[#1f3a5f]">มาตรฐานที่ใช้</p>
      <ol className="list-decimal pl-5 text-[10pt]">{STANDARDS.map((x) => <li key={x}>{x}</li>)}</ol>
      <p className="rp-sub mt-3 text-[12pt] font-semibold text-[#1f3a5f]">ระบบหน่วยในเล่ม</p>
      <table className="w-full text-[9.5pt]"><tbody>{UNITS.map(([k, v]) => <tr key={k} className="border-b border-[#eaecf0]"><td className="w-[32%] py-[3px] text-[#667085]">{k}</td><td>{v}</td></tr>)}</tbody></table>
      <p className="mt-1 text-[8.5pt] text-[#667085]">ตัวเลขแสดง 0–3 ตำแหน่งตามขนาดค่า (คำนวณภายในด้วยความละเอียดเต็ม) · ทุกสมการแสดงรูปสมการก่อนแทนค่า · เครื่องหมาย × ÷ ² ใช้แบบเดียวกันทั้งเล่ม</p>
      <div className="mt-4 border-l-[3pt] px-3 py-2 text-[11pt] font-semibold" style={{ borderColor: st.status === "PASS" ? "#067647" : "#b42318", color: st.status === "PASS" ? "#067647" : "#b42318" }}>
        ผลการตรวจสอบรวม: {st.text} <span className="text-[9pt] font-normal text-[#667085]">— รายละเอียดบท {statusN} สรุปผลการออกแบบ</span></div>
    </section>
  );
}

export function WorkReport({ frame, roof, project }) {
  const res = analyzeFrame(frame), hasRoof = (roof?.pts?.length ?? 0) >= 3, lateral = !!res.lateral;
  // one status for the whole book (roof + structure), the same numbers in the summary chapter and the criteria summary line
  const sk = useSkeleton(), rr = hasRoof && sk ? runRoof(roof, sk) : null, st = projectStatus(frame, res, rr?.dz ?? null);
  // book order (user 2026-11-04): project → criteria → layout → analysis → roof → slabs → beams → columns → footings → summary → appendix;
  // chapters 1…, sub-chapters n.m (lateral loads, each floor, schedules)
  const num = {}, toc = []; let ch = 0;
  const add = (id, th) => { ch++; num[id] = ch; toc.push({ id, n: `${ch}`, th }); };
  const addSub = (id, th, k) => { num[id] = `${ch}.${k}`; toc.push({ id, n: num[id], th, sub: true }); };
  add("c-project", "ข้อมูลโครงการ");
  add("c-criteria", "เกณฑ์การออกแบบ วัสดุ และน้ำหนักบรรทุก"); if (lateral) addSub("c-lateral", "แรงด้านข้างและชุดผสมแรง", 1);
  add("c-plans", "ผังโครงสร้าง");
  add("c-analysis", "การวิเคราะห์โครงสร้าง");
  if (hasRoof) add("c-roof", "โครงหลังคาเหล็ก");
  ch++; toc.push({ id: "c-floor-0", n: `${ch}`, th: "พื้นและน้ำหนักบรรทุกรายชั้น" }); frame.floors.forEach((f, k) => addSub(`c-floor-${k}`, f.name, k + 1));
  add("c-beams", "คาน"); add("c-columns", "เสา"); add("c-footings", "ฐานราก");
  add("c-status", "สรุปผลการออกแบบ"); addSub("c-schedules", "ตารางหน้าตัดและเหล็กเสริม", 1);
  add("c-appendix", "ภาคผนวก — แรงภายในคานทุกช่วง");
  const nOf = (id) => num[id] ?? "-";
  const floorsText = `${frame.floors.length} ระดับคาน (${frame.floors.map((f) => f.name).join(" · ")})`;
  return (
    <div className="report">
      <span className="rp-str-project hidden">{project.name}</span><span className="rp-str-method hidden">WSD / ASD</span>
      <Cover project={project} title="รายการคำนวณออกแบบโครงสร้าง" subtitle="อาคารคอนกรีตเสริมเหล็ก และโครงหลังคาเหล็ก"
        items={[["ระดับอาคาร", floorsText], ["วิศวกรผู้คำนวณ", `${project.engineer || "-"}${project.license ? ` (ทะเบียน ${project.license})` : ""}`]]} standards={STANDARDS} />
      <Toc items={toc} />
      <ProjectInfo project={project} frame={frame} res={res} st={st} hasRoof={hasRoof} n={num["c-project"]} statusN={num["c-status"]} />
      <FrameReport frame={frame} project={project} part={["criteria", "lateral", "plans", "analysis"]} nOf={nOf} res={res} overall={st} />
      {hasRoof && <RoofReport roof={roof} project={project} bare nb={num["c-roof"]} />}
      <FrameReport frame={frame} project={project} part={["floors", "beams", "columns", "footings"]} nOf={nOf} res={res} overall={st} />
      <StatusChapter st={st} n={num["c-status"]} />
      <FrameReport frame={frame} project={project} part={["schedules", "appendix"]} nOf={nOf} res={res} overall={st} />
    </div>
  );
}
