// The whole-project calculation book (user 2026-11-04: headings on the wrong page, more plans, professional): formal cover,
// contents with page numbers, then structure front (summary, criteria, lateral, plans), the roof, structure back (loads and slabs per
// floor, beams, columns, footings, schedules, appendix). Every page is signed (ReportKit page footer).
import { useLayoutEffect, useRef } from "react";
import { Cover, Toc, SigRun } from "./ReportKit.jsx";
import { FrameReport } from "./FrameReport.jsx";
import { RoofReport } from "./RoofReport.jsx";
import { analyzeFrame } from "../engine/frame.js";
import { runRoof, useSkeleton } from "./RoofPage.jsx";
import { StatusChapter, projectStatus, applyDecisions, effectiveFails } from "./StatusSummary.jsx";
import { reportOpt, reportPresetName } from "./reportOptions.js";
import { projectStamp } from "./reportQA.js";

const STANDARDS = [
  "พระราชบัญญัติควบคุมอาคาร พ.ศ. 2522 และที่แก้ไขเพิ่มเติม",
  "กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร และลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2566",
  "ประกาศกระทรวงมหาดไทย เรื่อง การกำหนดฐานรากของอาคารและพื้นดินที่รองรับอาคาร พ.ศ. 2567",
  "มาตรฐาน ว.ส.ท. วิธีหน่วยแรงใช้งาน (WSD) ประกอบ ACI 318 · โครงหลังคาเหล็ก ASD ตาม AISC / ว.ส.ท.",
];

const UNITS = [["แรง / น้ำหนัก", "กก. (kgf) · ตัน = 1,000 กก."], ["โมเมนต์", "กก.-ม. (kgf·m)"], ["หน่วยแรง / กำลังวัสดุ", "กก./ซม.² (ksc)"], ["แรงดันดิน", "กก./ม.² · ตัน/ม.²"],
  ["พื้นที่เหล็กเสริม", "ซม.²"], ["ระยะ ขนาดหน้าตัด", "ม. · ซม. (หน้าตัด) · มม. (เหล็กขึ้นรูปเย็น)"], ["ระยะแอ่น / การเสียรูป", "มม."], ["น้ำหนักแผ่", "กก./ม. (ตามแนวยาว) · กก./ม.² (ต่อพื้นที่)"]];

// chapter 1: project data, scope of this book, standards, the unit system, the overall result (details in chapter 10)
function ProjectInfo({ project, frame, res, st, hasRoof, n, statusN, stamp, made, revs, o = () => true }) {
  const spans = res.floors.reduce((t, a) => t + a.spans.length, 0);
  const rows = [["โครงการ", project.name], ["เจ้าของโครงการ", project.owner], ["สถานที่ก่อสร้าง", project.location], ["วิศวกรผู้คำนวณ", `${project.engineer || "-"}${project.license ? ` (${project.license})` : ""}`], ["วันที่", project.date]].filter(([, v]) => v);
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
      {o("project.revs") && <><p className="rp-sub mt-3 text-[12pt] font-semibold text-[#1f3a5f]">ประวัติการแก้ไขเอกสาร</p>
      <table className="w-full text-[9.5pt]"><thead><tr className="border-b border-[#d0d5dd] text-left text-[8.5pt] text-[#667085]"><th className="py-[2px] font-normal">ฉบับ</th><th className="font-normal">วันที่</th><th className="font-normal">รายละเอียด</th><th className="font-normal">โดย</th></tr></thead>
        <tbody>{revs.map((r, i) => <tr key={i} className="border-b border-[#eaecf0]"><td className="py-[3px] font-semibold">{r.rev}</td><td>{r.date || "-"}</td><td>{r.desc || "-"}</td><td>{r.by || project.engineer || "-"}</td></tr>)}</tbody></table>
      </>}{o("project.control") && <><p className="rp-sub mt-3 text-[12pt] font-semibold text-[#1f3a5f]">การควบคุมเอกสาร</p>
      <table className="w-full text-[9.5pt]"><tbody>
        {[["รหัสข้อมูลคำนวณ", `${stamp} — คำนวณจากข้อมูลโครงการชุดนี้ ถ้าแก้ข้อมูลใด ๆ รหัสจะเปลี่ยน (พิมพ์ไว้ท้ายทุกหน้า)`], ["สร้างรายงานเมื่อ", made], ["เลขที่เอกสาร", project.docNo || `SC-${stamp}`],
          ["การตรวจข้อมูลนำเข้า", st.inputs.length ? `พบ ${st.inputs.length} รายการที่ควรตรวจ — ดูบท ${statusN}` : "ไม่พบค่าที่ผิดปกติ"], ["รหัสอ้างอิงการคำนวณ", "ทุกหน้าคำนวณมี CALC ID (เช่น B-B1, C-C1-ชั้น 1, F-F1) ตารางสรุปลิงก์ไปยังหน้านั้นพร้อมเลขหน้า"]]
          .map(([k, v]) => <tr key={k} className="border-b border-[#eaecf0]"><td className="w-[32%] py-[3px] text-[#667085]">{k}</td><td>{v}</td></tr>)}</tbody></table></>}
      <div className="mt-4 border-l-[3pt] px-3 py-2 text-[11pt] font-semibold" style={{ borderColor: st.status === "PASS" ? "#067647" : "#b42318", color: st.status === "PASS" ? "#067647" : "#b42318" }}>
        ผลการตรวจสอบรวม: {st.text} <span className="text-[9pt] font-normal text-[#667085]">— รายละเอียดบท {statusN} สรุปผลการออกแบบ</span></div>
    </section>
  );
}

export function WorkReport({ frame, roof, project }) {
  const res = analyzeFrame(frame), hasRoof = (roof?.pts?.length ?? 0) >= 3, lateral = !!res.lateral;
  // one status for the whole book (roof + structure), the same numbers in the summary chapter and the criteria summary line
  // what is printed (project.report: chapters / parts, the engineer's decision on each failing check) — printing only, no value changes
  const o = reportOpt(project.report), edition = reportPresetName(project.report);
  // result words (ผ่าน / ไม่ผ่าน) per category / roof member group — project.report.marks { "คาน": false, "หลังคา|อะเส": false } (false = "-")
  const marks = project.report?.marks ?? {}, mark = (cat, label = null) => marks[cat] !== false && (label == null || marks[`${cat}|${label}`] !== false);
  const sk = useSkeleton(), rr = hasRoof && sk ? runRoof(roof, sk) : null, st0 = projectStatus(frame, res, rr?.dz ?? null, hasRoof ? roof : null), st = applyDecisions(st0, effectiveFails(st0, project.report));
  // report integrity: a code of the input data (any edit of structure / roof / project data changes it) + the time the book was made
  const stamp = projectStamp(frame, roof, project), made = new Date().toLocaleString("th-TH", { dateStyle: "short", timeStyle: "short" });
  const revs = project.revisions?.length ? project.revisions : [{ rev: "0", date: project.date, desc: "ออกครั้งแรก" }], rev = revs[revs.length - 1];
  // book order (user 2026-11-04): project → criteria → layout → analysis → roof → slabs → beams → columns → footings → summary → appendix;
  // chapters 1…, sub-chapters n.m (lateral loads, each floor, schedules)
  const num = {}, toc = []; let ch = 0;
  const add = (id, th) => { ch++; num[id] = ch; toc.push({ id, n: `${ch}`, th }); };
  const addSub = (id, th, k) => { num[id] = `${ch}.${k}`; toc.push({ id, n: num[id], th, sub: true }); };
  // chapters that are not printed take no number (the rest close up); a lateral / schedules sub-chapter with its parent chapter off
  // becomes a chapter of its own
  if (o("project")) add("c-project", "ข้อมูลโครงการ");
  if (o("criteria")) add("c-criteria", "เกณฑ์การออกแบบ วัสดุ และน้ำหนักบรรทุก");
  if (lateral && o("lateral")) { if (o("criteria")) addSub("c-lateral", "แรงด้านข้างและชุดผสมแรง", 1); else add("c-lateral", "แรงด้านข้างและชุดผสมแรง"); }
  if (o("plans")) add("c-plans", "ผังโครงสร้าง");
  if (o("analysis")) add("c-analysis", "การวิเคราะห์โครงสร้าง");
  if (hasRoof && o("roof")) add("c-roof", "โครงหลังคาเหล็ก");
  if (o("floors")) { ch++; toc.push({ id: "c-floor-0", n: `${ch}`, th: "พื้นและน้ำหนักบรรทุกรายชั้น" }); frame.floors.forEach((f, k) => addSub(`c-floor-${k}`, f.name, k + 1)); }
  if (o("beams")) add("c-beams", "คาน"); if (o("columns")) add("c-columns", "เสา"); if (o("footings")) add("c-footings", "ฐานราก");
  if (o("status")) add("c-status", "สรุปผลการออกแบบ");
  if (o("schedules")) { if (o("status")) addSub("c-schedules", "ตารางหน้าตัดและเหล็กเสริม", 1); else add("c-schedules", "ตารางหน้าตัดและเหล็กเสริม"); }
  if (o("appendix")) add("c-appendix", "ภาคผนวก — แรงภายในคานทุกช่วง");
  const parts = (keys) => keys.filter((k) => o(k) && (k !== "lateral" || lateral));
  const nOf = (id) => num[id] ?? "-";
  // a page reference to a part that is not printed in this edition says so (no wrong / empty page number)
  const root = useRef(null);
  useLayoutEffect(() => { const el = root.current; if (!el) return;
    for (const a of el.querySelectorAll("a.rp-pref")) { const id = decodeURIComponent((a.getAttribute("href") ?? "").slice(1)); a.classList.toggle("rp-missing", !!id && !el.querySelector(`[id="${CSS.escape(id)}"]`)); } });
  return (
    <div className="report" ref={root}>
      <Cover project={project} title="รายการคำนวณออกแบบโครงสร้าง" subtitle="อาคารคอนกรีตเสริมเหล็ก และโครงหลังคาเหล็ก"
        items={[["วิศวกรผู้คำนวณ", `${project.engineer || "-"}${project.license ? ` (${project.license})` : ""}`]]} standards={STANDARDS} docNo={project.docNo || `SC-${stamp}`} rev={`${rev.rev} · ${edition}`} />
      <SigRun project={project} />
      <span className="rp-str-project hidden">{project.name}</span><span className="rp-str-method hidden">WSD / ASD</span><span className="rp-str-stamp hidden">{`รหัสข้อมูล ${stamp} · ฉบับ ${rev.rev} (${edition}) · ${made}`}</span>
      <Toc items={toc} />
      {o("project") && <ProjectInfo project={project} frame={frame} res={res} st={st} hasRoof={hasRoof} n={num["c-project"]} statusN={num["c-status"] ?? "-"} stamp={stamp} made={made} revs={revs} o={o} />}
      {parts(["criteria", "lateral", "plans", "analysis"]).length > 0 && <FrameReport frame={frame} project={project} part={parts(["criteria", "lateral", "plans", "analysis"])} nOf={nOf} res={res} overall={st} o={o} mark={mark} />}
      {hasRoof && o("roof") && <RoofReport roof={roof} project={project} bare nb={num["c-roof"]} mark={mark} />}
      {parts(["floors", "beams", "columns", "footings"]).length > 0 && <FrameReport frame={frame} project={project} part={parts(["floors", "beams", "columns", "footings"])} nOf={nOf} res={res} overall={st} o={o} mark={mark} />}
      {o("status") && <StatusChapter st={st} n={num["c-status"]} o={o} />}
      {parts(["schedules", "appendix"]).length > 0 && <FrameReport frame={frame} project={project} part={parts(["schedules", "appendix"])} nOf={nOf} res={res} overall={st} o={o} mark={mark} />}
    </div>
  );
}
