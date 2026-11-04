// Thai calculation report for the RC frame drawn on plan: loads, slab panels, continuous beams, beam / column types, schedules.
import { PILE_SAFE } from "../engine/frame.js";
import FootingPlan, { FootingLegend, footingMarks } from "./FootingPlan.jsx";
import { BeamDetail, ColumnDetail, FootingDetail } from "./Details.jsx";
import { FootingCageParts } from "./Cage3D.jsx";
import { BeamCageParts } from "./BeamCage3D.jsx";
import { Still3D } from "./Snapshot3D.jsx";
import { beamLayersOf } from "./DesignFigures.jsx";
import { CalcLink, Doc, Figure, Item, Note, Sec, Sub, SummaryBox } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { beamSectionModel, columnSectionModel, footingModel, framePlanModel, pileCapModel } from "./drawings.js";
import { PILES } from "../engine/footing.js";
import { SLAB_BARS } from "../engine/tables.js";
import { CONC, DEFAULT_WALL_TYPES, GROUPS, STAIR_KINDS, barLayers, faceBars, parseBars, stLabel, wallsOf } from "../engine/floor.js";
import { designSlabs } from "../engine/slabDesign.js";
import { analyzeFrame } from "../engine/frame.js";
import { arcGeom } from "../engine/arc.js";
import { CantileverDetail, ColumnChart, FrameIso, LineDiagram, SlabStrip } from "./ReportDiagrams.jsx";
import { BeamTypeSheet, ColumnLevelSheet, FootingSheet } from "./CheckSheets.jsx";

const ksc = "กก./ซม.²";
const KIND_TH = { simple: "ช่วงเดียว", one_end: "ช่วงริม", both_ends: "ช่วงใน", cantilever: "คานยื่น" };
const th = "py-0.5 pr-2 font-semibold", td = "py-0.5 pr-2 tabular-nums";
const Table = ({ head, rows }) => (
  <table className="mt-1 w-full border-collapse text-[9pt]">
    <thead><tr className="border-b border-gray-300 text-left">{head.map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
    <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-gray-100">{r.map((v, j) => <td key={j} className={td}>{v}</td>)}</tr>)}</tbody>
  </table>
);
const pass = (ok) => (ok ? "ผ่าน" : "ไม่ผ่าน");
const bars = (t) => [t.top, t.topX && `+ ${t.topX} (L/4)`].filter(Boolean).join(" ");

// one beam section check (mid-span or support) in steps
function BeamSection({ title, r, M, V, tensionTop, atD = false }) {
  return (<>
    <Sub>{title}</Sub>
    <Item th="โมเมนต์ออกแบบ" f="M" v={fmt(M, 0)} u="กก.-ม." />
    <Item th="ความลึกประสิทธิผล" f="d" v={fmt(r.d, 2)} u="ซม." />
    <Item th="โมเมนต์ต้านทานของคอนกรีต" f="Mc = R·b·d²" v={fmt(r.Mc, 0)} u="กก.-ม." note={r.mode === "singly" ? "M < Mc → เสริมเหล็กรับแรงดึงอย่างเดียว" : "M > Mc → ต้องมีเหล็กรับแรงอัดด้วย"} />
    {/* required steel per face = flexure + torsion longitudinal steel 2·Ast (beam.js reqBot / reqTop) — shown as such */}
    <Item th={`เหล็กรับแรงดึง (${tensionTop ? "บน" : "ล่าง"})`} f={r.Ast > 0 ? "As + 2·Ast (บิด)" : "As = M / (fs·j·d)"} v={`${fmt(r.reqBot, 2)} ≤ ${fmt(r.provBot, 2)}`} u="ซม.²" ok={r.botOk} note={r.Ast > 0 ? `As = ${fmt(r.As, 2)} · เหล็กยืนรับแรงบิด 2·Ast = ${fmt(2 * r.Ast, 2)}` : undefined} />
    {r.reqTop > 0 && <Item th={r.AsPrime > 0 ? `เหล็กรับแรงอัด (${tensionTop ? "ล่าง" : "บน"})` : `เหล็กด้าน${tensionTop ? "ล่าง" : "บน"} (รับแรงบิด)`} f={r.AsPrime > 0 ? (r.Ast > 0 ? "As' + 2·Ast (บิด)" : "As' = M₂ / (fs'·(d − d'))") : "2·Ast (บิด)"} v={`${fmt(r.reqTop, 2)} ≤ ${fmt(r.provTop, 2)}`} u="ซม.²" ok={r.topOk} note={r.AsPrime > 0 && r.Ast > 0 ? `As' = ${fmt(r.AsPrime, 2)} · 2·Ast = ${fmt(2 * r.Ast, 2)}` : undefined} />}
    <Item th={atD ? "แรงเฉือนที่ระยะ d จากเสา / กำลังคอนกรีต" : "แรงเฉือน / กำลังคอนกรีต"} f="Vc = 0.29·√f'c·b·d" v={`${fmt(V, 0)} / ${fmt(r.Vc, 0)}`} u="กก." note={r.Vp > 0 ? `ส่วนเกิน V' = ${fmt(r.Vp, 0)} กก. ให้เหล็กปลอกรับ` : "คอนกรีตรับแรงเฉือนได้ ใช้เหล็กปลอกขั้นต่ำ"} ok={r.VpOk} />
    <Item th="เหล็กปลอก" f={r.AtotS === 0 ? "V ≤ Vc ใช้ระยะตามแบบ" : `s ≤ ${typeof r.sMax === "number" ? fmt(r.sMax, 2) : r.sMax} ม.`} v={r.stirrup === "CHECK_SPACING" ? "ระยะเกิน" : r.stirrup} ok={r.stirrup !== "CHECK_SPACING"} />
  </>);
}

// part: "all" (the frame report alone) | "front" (summary, criteria, lateral, plans) | "back" (floor loads + slabs, beams, columns,
// footings, schedules, appendix) — the whole-project book (WorkReport) puts the roof between them; nOf(id) gives its chapter numbers

// footing chapter intro from the systems really used (review 2026-11-04: the text named driven piles on a job of spread footings only)
function footIntro(res, frame) {
  const sp = res.footings.filter((f) => f.kind === "spread"), pl = res.footings.filter((f) => f.kind !== "spread" && f.n > 0), out = ["แรงที่ฐานเสา (รวมน้ำหนักเสาทุกชั้น)"];
  if (sp.length) out.push(`ฐานแผ่ ${sp.length} ฐาน บนดิน qa = ${fmt((frame.soil?.qa ?? sp[0].inp?.qa ?? 10000) / 1000, 1)} ตัน/ม.² (γ ดิน ${fmt(frame.soil?.gamma ?? 1800, 0)} กก./ม.³): แรงดันดินคิดรวมน้ำหนักฐานและดินถมเหนือฐาน ตรวจทั้งแต่ละแกนและที่มุมฐานเมื่อมีโมเมนต์สองแกน ตรวจแรงเฉือนทางเดียว แรงเฉือนทะลุ โมเมนต์ และระยะฝังเหล็ก`);
  if (pl.length) { const used = [...new Set(pl.map((f) => f.pile))];
    out.push(`ฐานรากเสาเข็ม ${pl.length} ฐาน (${used.join(", ")}) ยาว ${frame.footing?.pileL ?? 6} ม. รับน้ำหนักปลอดภัย ${used.map((k) => `${k} ${fmt((frame.pileLoads?.[k] ?? PILE_SAFE[k] ?? 0) / 1000, 0)} ตัน`).join(" · ")}/ต้น (ค่าที่กำหนด — กำลังจากข้อมูลดินไม่ได้คำนวณในเล่มนี้) เลือกจำนวนเข็มและขนาดฐานที่แรงต่อเข็มไม่เกินค่าปลอดภัย`); }
  out.push("แรงลงเสาใช้ค่ามากกว่าระหว่างคานต่อเนื่องกับคานช่วงเดี่ยว (ไม่ให้เสาที่ถูกยกรับแรงน้อยเกินจริง)");
  return out.join(" · ");
}

export function FrameReport({ frame, project, part = "all", nOf = null, res: resIn = null, overall = null }) {
  const res = resIn ?? analyzeFrame(frame), { floors, beamTypes: types, colTypes, mat } = frame;
  const show = (x, key) => part === "all" || part === x || (Array.isArray(part) && part.includes(key)); // part: "all" | "front" | "back" | [section keys]
  const spans = res.floors.flatMap((a, k) => a.spans.map((s) => ({ ...s, floor: k })));
  const fc = Math.min(mat.F * mat.fcPrime, mat.capFc !== false ? 65 : Infinity);
  let n = 0;
  const N = (id) => (nOf ? nOf(id) : ++n);
  const summary = [
          ["จำนวนชั้น (ระดับคาน)", `${floors.length} ระดับ`],
          ["คาน", `${spans.length} ช่วง · type ${[...new Set(spans.map((s) => s.typeIdx))].sort((a, b) => a - b).map((i) => types[i]?.name).join(", ")}`],
          ["เสา", `${res.stacks.length} ต้น · type ${[...new Set(res.stacks.map((s) => colTypes[s.typeIdx]?.name))].join(", ")}`],
          ["แรงอัดเสาที่ฐานรวม", `${fmt(res.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) / 1000, 2)} ตัน`],
          ["ผลการตรวจสอบรวม", overall ? `${overall.text} (ดูบท สรุปผลการออกแบบ)` : res.ok ? "ผ่านทุกข้อ (โครงสร้าง คสล.)" : `คานไม่ผ่าน ${spans.filter((s) => !s.ok).length} ช่วง · เสาไม่ผ่าน ${res.columns.filter((c) => !c.ok).length} ต้น/ชั้น`, overall ? overall.status === "PASS" : res.ok],
        ];
  // footing marks F1, F2 … : one per distinct footing (its type name when footing types are used)
  // footing marks F1… (largest = F1) shared with the footing plan (FootingPlan.jsx footingMarks)
  const FM = footingMarks(res.footings), fKey = (f) => FM.mark(f), fNames = new Map(FM.list.map((n) => [n, n])), fName = (f) => FM.mark(f);
  const Wrap = part === "all" ? ({ children }) => <div className="report">{children}</div> : ({ children }) => <>{children}</>;
  return (
    <Wrap>
      <Doc bare={part !== "all"} project={project} title="รายการคำนวณออกแบบคานและเสา คอนกรีตเสริมเหล็ก" subtitle="RC beams & columns from the framing plan — Working Stress Design (WSD)"
        memberLabel="โครงสร้าง" member={frame.frameNo}
        summary={part === "all" ? summary : null}>
        {show("front", "criteria") && <Sec id="c-criteria" n={N("c-criteria")} th="เกณฑ์การออกแบบ วัสดุ และน้ำหนักบรรทุก" en="Design data & loads"
          intro={`ใช้วิธีหน่วยแรงใช้งาน น้ำหนักบรรทุกคงที่รวมน้ำหนักบรรทุกจรโดยไม่คูณตัวคูณ ${res.analysis === "envelope"
            ? `แรงออกแบบ = ค่ามากสุดของ (ก) คานต่อเนื่องบนจุดรองรับแบบหมุน จัดน้ำหนักจรแบบหมากรุก และ (ข) โครง 3 มิติจุดต่อแข็งทั้งอาคาร (ฐานเสา${frame.baseFixity === "fixed" ? "ยึดแน่น" : "เป็นหมุด เพราะฐานเข็ม 1–2 ต้นรับโมเมนต์ไม่ได้"} ปลายคานซอยเป็นหมุด stiffness แตกร้าว คาน 0.5Ig เสา 0.7Ig รวม P-Delta) — ${frame.colMethod === "frame" ? "เสาใช้แรงอัดและโมเมนต์จากโครง 3 มิติทั้งสองแกนแต่ไม่น้อยกว่าระยะเยื้องศูนย์ขั้นต่ำ" : "เสาออกแบบด้วยแรงอัดสะสมกับระยะเยื้องศูนย์ขั้นต่ำ (โมเมนต์จากโครง 3 มิติแสดงไว้ประกอบ)"} ความยาวเสาใช้ความสูงสุทธิ (หลังคานล่างถึงท้องคานบน)`
            : "คานคิดเป็นคานต่อเนื่องวางบนจุดรองรับแบบหมุน (เสาหรือคานที่รับ) จัดน้ำหนักจรแบบหมากรุก"}`}>
          {part !== "all" && <SummaryBox summary={summary} />}
          <div className="mb-2 break-inside-avoid text-[9pt] leading-relaxed text-[#344054]">
            <p className="font-semibold">เกณฑ์และกฎหมายที่ใช้ในการออกแบบ</p>
            <ol className="list-decimal pl-5">
              <li>พระราชบัญญัติควบคุมอาคาร พ.ศ. 2522 และที่แก้ไขเพิ่มเติม (ฉบับที่ 2) พ.ศ. 2535 และ (ฉบับที่ 3) พ.ศ. 2543</li>
              <li>กฎกระทรวงกำหนดการออกแบบโครงสร้างอาคาร และลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2566</li>
              <li>ประกาศกระทรวงมหาดไทย เรื่อง การกำหนดฐานรากของอาคารและพื้นดินที่รองรับอาคาร พ.ศ. 2567</li>
              <li>ประกาศกระทรวงมหาดไทย เรื่อง การออกแบบอาคารและลักษณะและคุณสมบัติของวัสดุที่ใช้ในงานโครงสร้างอาคาร พ.ศ. 2567</li>
              <li>มาตรฐานการออกแบบอาคารคอนกรีตเสริมเหล็กของกรมโยธาธิการและผังเมือง และมาตรฐาน ว.ส.ท. (วิธีหน่วยแรงใช้งาน) พ.ศ. 2517 ประกอบ ACI 318 (WSD)</li>
              <li>หน่วยแรงที่ยอมให้: คอนกรีต fc = F·f'c (F = {fmt(mat.F ?? 0.45, 3)}){mat.capFc !== false ? " ไม่เกิน 65 กก./ซม.²" : ""} · เหล็กเสริม fs ตามชั้นคุณภาพ (SR24 1,200 · SD30 1,500 · SD40 {(mat.F ?? 0.45) === 0.45 ? "1,700" : "1,500"} กก./ซม.²) · คอนกรีตหุ้มเหล็กตามมาตรฐาน</li>
            </ol>
          </div>
          <Item th="กำลังอัดคอนกรีต" f="f'c" v={fmt(mat.fcPrime, 0)} u={ksc} note={`fc = ${fmt(fc, 1)} ${ksc}${mat.capFc !== false && mat.F * mat.fcPrime > 65 ? " (ไม่เกิน 65 ตามกฎกระทรวง)" : ""}`} />
          <Item th="เหล็กเสริม" f="fy" v={fmt(mat.fy, 0)} u={ksc} note={`เหล็กปลอก fy = ${fmt(mat.fys, 0)} ${ksc} · คอนกรีตหุ้ม คาน ${fmt(mat.cover, 1)} · เสา ${fmt(mat.coverCol ?? mat.cover, 1)} · พื้น-บันได ${fmt(mat.coverSlab ?? 2, 1)} · ฐานราก ${fmt(mat.coverFoot ?? 7.5, 1)} ซม.`} />
          <Item th="หน่วยน้ำหนักคอนกรีต" v={fmt(CONC, 0)} u="กก./ม.³" note={`ผนัง: ${(frame.wallTypes ?? DEFAULT_WALL_TYPES).map((t) => `${t.name} ${t.w}`).join(" · ")} กก./ม.²`} />
          <Item th="กลุ่มน้ำหนัก" v={Object.values(GROUPS).map((g) => g[0]).join(" · ")} note="แยกแสดงทุกชั้น · วิเคราะห์ทุกกลุ่มรวมกัน (น้ำหนักใช้งาน) · คำนวณจากชั้นบนลงล่าง" />
          <Table head={["ระดับ (ล่าง → บน)", "เสาใต้ชั้นสูง (ม.)", "พื้นหนา (ม.)", "ปูผิว", "จร", "รวม w (กก./ม.²)"]}
            rows={floors.map((f) => [f.name, fmt(f.h, 2), f.t ? fmt(f.t, 2) : "ไม่มีพื้น", fmt(f.finish, 0), fmt(f.live, 0), f.t ? fmt(CONC * f.t + f.finish + f.live, 0) : "-"])} />
        </Sec>}

        {show("front", "lateral") && res.lateral && (() => { const L = res.lateral, W = L.wind, E = L.seismic; return (
          <Sec id="c-lateral" n={N("c-lateral")} th="แรงด้านข้างและชุดผสมแรง" en="Wind, earthquake & load combinations"
            intro="แรงด้านข้างกระทำที่ระดับพื้นแต่ละชั้น พื้นทุกชั้นถือว่าแข็งในแนวราบ (rigid diaphragm) แรงกระทำที่จุดศูนย์กลางของจุดต่อในชั้นนั้น วิเคราะห์ด้วยโครง 3 มิติ แล้วรวมกับน้ำหนักคงที่ (D) และน้ำหนักจร (L) ตามชุดผสมแรงแบบหน่วยแรงใช้งาน คานและเสาออกแบบจากชุดที่วิกฤตที่สุด">
            {W && <>
              <Sub>แรงลม — มยผ. 1311-50 วิธีอย่างง่าย</Sub>
              <Item th="ความเร็วลมอ้างอิง" f="V50" v={fmt(W.V50, 0)} u="ม./วินาที" note={`ภูมิประเทศ ${W.terrain === "B" ? "ขรุขระ" : "โล่ง"}`} />
              <Item th="หน่วยแรงลมอ้างอิง" f="q = ½ρV50² (ρ = 1.25 กก./ม.³)" v={fmt(W.q, 1)} u="กก./ม.²" />
              <Item th="หน่วยแรงลมออกแบบ" f="p = Iw·q·Cg·(Cp,ต้นลม·Ce(z) + |Cp,ท้ายลม|·Ce(H/2))" v={`Iw ${fmt(W.Iw, 2)} · Cg ${fmt(W.Cg, 1)} · Cp ${fmt(W.Cpw, 1)} / ${fmt(W.x.Cpl, 2)} (X), ${fmt(W.y.Cpl, 2)} (Y)`} note={`Ce = (z/10)^0.2 ≥ 0.9 (โล่ง) · 0.7(z/12)^0.3 ≥ 0.7 (ขรุขระ) · H = ${fmt(W.H, 2)} ม.`} />
              <Table head={["ทิศลม", "ชั้น", "แถบความสูง (ม.)", "กว้างรับลม B (ม.)", "Ce", "p (กก./ม.²)", "F (กก.)"]}
                rows={["x", "y"].flatMap((d) => W[d].floors.map((f) => [d.toUpperCase(), floors[f.floor]?.name, `${fmt(f.lo, 2)}–${fmt(f.hi, 2)}`, fmt(f.B, 2), fmt(f.CeW, 2), fmt(f.p, 1), fmt(f.F, 0)]))} />
              <Note>แรงเฉือนที่ฐานจากลม: แนว X {fmt(W.x.V, 0)} กก. · แนว Y {fmt(W.y.V, 0)} กก.</Note>
            </>}
            {E && <>
              <Sub>แรงแผ่นดินไหว — มยผ. 1301/1302-61 วิธีแรงสถิตเทียบเท่า</Sub>
              <Item th="ค่าสเปกตรัมจากแผนที่" f="Ss / S1" v={`${fmt(E.Ss, 3)} / ${fmt(E.S1, 3)}`} u="g" note={`ชั้นดิน ${E.site} → Fa ${fmt(E.Fa, 2)} · Fv ${fmt(E.Fv, 2)}`} />
              <Item th="ค่าสเปกตรัมออกแบบ" f="SDS = ⅔Fa·Ss , SD1 = ⅔Fv·S1" v={`${fmt(E.SDS, 3)} / ${fmt(E.SD1, 3)}`} u="g" />
              <Item th="คาบการสั่น" f="T = Ct·H" v={fmt(E.T, 3)} u="วินาที" note={`Ct ${fmt(E.Ct, 3)} · H ${fmt(E.H, 2)} ม. → Sa ${fmt(E.Sa, 3)} g`} />
              <Item th="สัมประสิทธิ์แรงเฉือนฐาน" f="Cs = Sa·I/R ≥ 0.01" v={fmt(E.Cs, 4)} note={`I ${fmt(E.I, 2)} · R ${fmt(E.R, 1)}`} />
              <Item th="แรงเฉือนที่ฐาน" f="V = Cs·W" v={fmt(E.V, 0)} u="กก." note={`W = ${fmt(E.W, 0)} กก. (น้ำหนักคงที่ทั้งอาคาร ไม่รวมน้ำหนักจร)`} />
              <Table head={["ชั้น", "สูงจากฐาน h (ม.)", "น้ำหนัก w (กก.)", "Fx = V·w·h^k / Σw·h^k (กก.)"]} rows={E.floors.map((f) => [floors[f.floor]?.name, fmt(f.h, 2), fmt(f.w, 0), fmt(f.F, 0)])} />
            </>}
            <Sub>ชุดผสมแรง (หน่วยแรงใช้งาน) — {L.combos.length} ชุด</Sub>
            <Table head={["ชุด", "D", "L", "ลม X", "ลม Y", "แผ่นดินไหว X", "แผ่นดินไหว Y"]} rows={L.combos.map((c) => [c.name, fmt(c.D, 2), fmt(c.L, 2), fmt(c.Wx, 3), fmt(c.Wy, 3), fmt(c.Ex, 3), fmt(c.Ey, 3)])} />
            {L.drift.length > 0 && <>
              <Sub>การเซตัวระหว่างชั้น</Sub>
              <Table head={["กรณี", "ชั้น", "h (ม.)", "เซระหว่างชั้น (มม.)", "ยอมให้ (มม.)", "ผล"]} rows={L.drift.map((d) => [d.key, floors[d.floor]?.name, fmt(d.h, 2), fmt(d.dd * 1000, 2), fmt(d.lim * 1000, 1), pass(d.ok)])} />
              <Note>ลม: ≤ h/400 (แรงลมไม่คูณตัวคูณ) · แผ่นดินไหว: Cd·δ/I ≤ 0.02h · δ = การเคลื่อนตัวมากที่สุดของจุดต่อในชั้น ลบชั้นล่าง</Note>
            </>}
          </Sec>); })()}

        {show("front", "plans") && <Sec id="c-plans" n={N("c-plans")} th="ผังโครงสร้าง" en="Structural plans"
          intro="แปลนทุกชั้นวาดตามขนาดจริงของคานและเสา เส้นกริดและระยะตามแบบ · แปลนคานแสดง type คาน (ชื่อลงท้าย A = คานยื่น เหล็กบนยาวตลอด) · แปลนเสาแสดง type และขนาดเสาใต้ระดับนั้น · แปลนฐานรากแสดงขนาดฐานรากตามจริงและชื่อ F · แปลนพื้นแสดงแผ่นพื้น ชนิด ความหนา (ซม.) และทิศทางวางแผ่นพื้นสำเร็จ">
          {(() => { const base = floors[0], cols0 = res.columns.filter((c) => c.floor === 0);
            const fts = res.footings.map((f) => ({ p: f.p, name: fName(f), Bx: f.r?.Bx, By: f.r?.By, text: f.kind === "spread" ? `${fmt(f.r?.Bx ?? 0, 2)}x${fmt(f.r?.By ?? 0, 2)}` : `เข็ม ${f.n}x${f.pile}` }));
            return <Figure caption={`แปลนฐานราก (ใต้ ${base.name}) — ${fNames.size} แบบ: ${[...fNames.values()].join(", ")}`}>
              <FootingPlan floor={base} footings={res.footings} columns={cols0} colTypes={colTypes} marks={FM} print className="mx-auto h-[118mm] w-full" /><FootingLegend footings={res.footings} marks={FM} /></Figure>; })()}
          {floors.map((f, k) => (f.columns ?? []).length > 0 && (
            <Figure key={`c${k}`} caption={`แปลนเสา — เสาใต้ ${f.name} (สีตาม type · ขนาด ซม. · ✕ = ไม่ผ่าน)`}>
              <Drawing model={framePlanModel(f, res.floors[k], types, res.columns.filter((c) => c.floor === k), { mode: "columns", colTypes })} className="mx-auto h-[112mm]" fontSize={9} width={680} /></Figure>))}
          {floors.map((f, k) => (f.beams ?? []).length > 0 && (
            <Figure key={`b${k}`} caption={`แปลนคาน ${f.name} — สีตาม type คาน`}>
              <Drawing model={framePlanModel(f, res.floors[k], types, res.columns.filter((c) => c.floor === k))} className="mx-auto h-[112mm]" fontSize={9} width={680} /></Figure>))}
          {floors.map((f, k) => res.floors[k].panels.length > 0 && (
            <Figure key={`s${k}`} caption={`แปลนพื้น ${f.name} — P = แผ่นพื้น · S หล่อในที่ · PS พื้นสำเร็จ (ลูกศร = ทิศวางแผ่น) · GS บนดิน · t = หนา (ซม.)`}>
              <Drawing model={framePlanModel(f, res.floors[k], types, res.columns.filter((c) => c.floor === k), { mode: "slabs" })} className="mx-auto h-[112mm]" fontSize={9} width={680} /></Figure>))}
        </Sec>}

        {(part === "all" || (Array.isArray(part) && part.includes("analysis"))) && (() => {
          const base = res.columns.filter((c) => c.floor === 0), dl = spans.filter((sp) => sp.defl?.limT > 0).map((sp) => ({ sp, u: Math.max(sp.defl.dT / sp.defl.limT, sp.defl.dL / sp.defl.limL) })).sort((a, b) => b.u - a.u).slice(0, 10);
          return (
          <Sec id="c-analysis" n={N("c-analysis")} th="การวิเคราะห์โครงสร้าง" en="Structural analysis"
            intro={`แบบจำลอง: (1) คานต่อเนื่องแต่ละแนวด้วยวิธีสติฟเนส (จุดรองรับแบบหมุนได้ ขอบเขตน้ำหนักจรแบบหมากรุก) และ (2) โครงข้อแข็ง 3 มิติทั้งอาคาร 6 องศาอิสระต่อจุด หน้าตัดแตกร้าว คาน 0.5Ig · เสา 0.7Ig · 0.2J ${frame.baseFixity === "fixed" ? "ฐานเสายึดแน่น" : "ฐานเสาแบบหมุนได้"} รวมผล P-Delta · ${frame.analysis === "continuous" ? "ออกแบบด้วยคานต่อเนื่อง" : "ออกแบบด้วยค่ามากกว่าของสองวิธี (envelope)"} · ผลวิเคราะห์ทั้งสองวิธีเทียบกับโปรแกรมไฟไนต์เอลิเมนต์อิสระ (PyNite) ทุกครั้งที่แก้โปรแกรม`}>
            {res.frame3d && <Figure caption="แบบจำลองโครง 3 มิติทั้งอาคาร (ไอโซเมตริก) — คาน เสา ตามตำแหน่งและระดับจริงของแบบจำลองที่ใช้คำนวณ"><FrameIso f3={res.frame3d} /></Figure>}
            <Sub>แรงปฏิกิริยาที่ฐานเสา</Sub>
            <Table head={["เสา (X, Y)", "P สะสม (ตัน)", "N โครง 3 มิติ (ตัน)", "Mx / My ฐาน (กก.-ม.)", "ฐานราก"]}
              rows={base.map((c) => { const fo = res.footings.find((f) => f.stack === c.stack); return [c.stack, fmt(c.Pbot / 1000, 2), c.f3?.N != null ? fmt(c.f3.N / 1000, 2) : "-", `${fmt(fo?.Mx ?? 0, 0)} / ${fmt(fo?.My ?? 0, 0)}`, fo ? fName(fo) : "-"]; })} />
            <Note>รวมแรงที่ฐาน {fmt(base.reduce((t, c) => t + c.Pbot, 0) / 1000, 2)} ตัน</Note>
            {dl.length > 0 && (<><Sub>การเสียรูป — ระยะแอ่นของคาน 10 ช่วงที่ใกล้ค่าที่ยอมให้มากที่สุด</Sub>
              <Table head={["ชั้น / ช่วง", "ยาว (ม.)", "3·δD + δL (มม.)", "ยอมให้รวม (มม.)", "δL (มม.)", "ยอมให้จร (มม.)", "ผล"]}
                rows={dl.map(({ sp }) => [`${floors[sp.floor].name} ${sp.id}`, fmt(sp.len, 2), fmt(sp.defl.dT * 1000, 1), fmt(sp.defl.limT * 1000, 1), fmt(sp.defl.dL * 1000, 1), fmt(sp.defl.limL * 1000, 1), pass(sp.defl.ok)])} /></>)}
            <Note>แรงภายในคาน (น้ำหนัก แรงเฉือน โมเมนต์) ทุกแนวอยู่ในภาคผนวก · ระยะเซระหว่างชั้นจากแรงด้านข้างอยู่ในบทเกณฑ์การออกแบบ (ถ้าคิดแรงด้านข้าง)</Note>
          </Sec>); })()}

        {show("back", "floors") && floors.map((f, k) => {
          const an = res.floors[k], wt = frame.wallTypes ?? DEFAULT_WALL_TYPES, walls = wallsOf(f), slabs = designSlabs(an, f, mat);
          return (
            <Sec key={k} id={`c-floor-${k}`} n={N(`c-floor-${k}`)} pre={nOf && k === 0 && /\.1$/.test(String(N(`c-floor-${k}`))) ? { n: String(N(`c-floor-${k}`)).split(".")[0], th: "พื้นและน้ำหนักบรรทุกรายชั้น", en: "Slab design" } : null} th={`น้ำหนักบรรทุกและพื้น — ${f.name}`} en={`Floor ${k + 1}: loads, slabs`}
              intro="แผ่นพื้นหาจากช่องที่คานล้อมรอบ พื้นสองทาง (L/S ≤ 2) ถ่ายน้ำหนักลงคานเป็นรูปสามเหลี่ยม/คางหมูตามเส้น 45° ค่าสูงสุด wS/2 พื้นทางเดียวลงคานด้านยาว wS/2 รวมน้ำหนักผนังบนคานและน้ำหนักคานเอง คานซอยวิเคราะห์ก่อนแล้วส่งแรงปฏิกิริยาเป็นน้ำหนักจุดให้คานที่รับ">
              <Sub>น้ำหนักแยกกลุ่มที่ลงคานชั้นนี้</Sub>
              <Table head={["กลุ่ม", ...Object.values(GROUPS).map((g) => g[0]), "รวม"]} rows={[["ตัน", ...Object.keys(GROUPS).map((g) => fmt((an.groups[g] ?? 0) / 1000, 2)), fmt(Object.values(an.groups).reduce((a, b) => a + b, 0) / 1000, 2)]]} />
              {an.panels.length > 0 && <Table head={["แผ่น", "ชนิด", "S × L (ม.)", "หนา (ม.)", "DL", "SDL", "ผนัง", "LL", "พิเศษ", "รวม (กก./ม.²)"]}
                rows={an.panels.map((p, i) => [`P${i + 1}`, p.open ? "ช่องเปิด" : p.stairWell ? "ช่องบันได" : p.st === "GS" ? "GS บนดิน" : p.st === "PS" ? `PS วางแนว ${p.dir === "x" ? "X" : "Y"}` : p.kind === "twoway" ? "S สองทาง" : p.kind === "oneway" ? "S ทางเดียว" : "S อื่นๆ",
                  p.S ? `${fmt(p.S, 2)} × ${fmt(p.L, 2)}` : "-", fmt(p.t, 2), ...["DL", "SDL", "WALL", "LL", "SP"].map((g) => fmt(p.g[g] ?? 0, 0)), fmt(p.w, 0)])} />}
              {walls.length > 0 && (<><Sub>ผนัง</Sub>
                <Table head={["ผนัง", "ชนิด", "สูง (ม.)", "ช่องเปิด", "ชั้น", "ยาว (ม.)", "กก./ม.", "ลงที่"]}
                  rows={walls.map((w, i) => { const r = an.walls[i]; return [i + 1, (wt.find((x) => x.id === w.kind) ?? wt[0]).name, fmt(w.h, 2), `${w.open ?? 0}%`, (w.layers ?? 1) > 1 ? "เบิ้ล" : "เดี่ยว", fmt(r.len, 2), fmt(r.q, 0), r.on.length ? `คานแนว ${r.on.map((o) => o.line + 1).join(", ")}` : r.panel ? "แผ่นพื้น (กระจาย)" : r.ground ? "พื้นบนดิน" : "-"]; })} /></>)}
              {(an.cants.length > 0 || an.stairs.length > 0 || (f.lineLoads ?? []).length > 0 || (f.pointLoads ?? []).length > 0) && (<><Sub>พื้นยื่น บันได และน้ำหนักอื่น</Sub>
                <Table head={["รายการ", "รายละเอียด", "น้ำหนัก", "ลงที่"]} rows={[
                  ...an.cants.map((c, i) => [`พื้นยื่น ${i + 1}`, `ยื่น ${fmt(c.L, 2)} ม. หนา ${fmt(c.t, 2)} ม.`, `${fmt(c.w, 0)} กก./ม.²`, "คานริม (+ แรงบิด wL²/2)"]),
                  ...an.stairs.map((st, i) => [`บันได ${i + 1}`, `${STAIR_KINDS[st.kind]} · ช่วง ${fmt(st.Lr, 2)} × กว้าง ${fmt(st.B, 2)} ม. · ${fmt((st.th * 180) / Math.PI, 1)}°`, `${fmt(st.w, 0)} กก./ม.² (${fmt((st.total.DL + st.total.SDL + st.total.LL) / 1000, 2)} ตัน)`,
                    st.kind === "long" ? "คานปลายบน (ชั้นนี้) / ปลายล่าง (ชั้นล่าง)" : st.kind === "landing" ? "คานต้น/ปลายบันได + คานชานพัก" : st.kind === "cant" ? "คานด้านข้าง (+ แรงบิด)" : "คาน/ผนังสองข้าง"]),
                  ...(f.lineLoads ?? []).map((l, i) => [l.name || `น้ำหนักเส้น ${i + 1}`, `ยาว ${fmt(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 2)} ม.`, `${fmt(l.q, 0)} กก./ม.`, ({ cant: "ปลายพื้นยื่น → คานริม", beam: "คาน", panel: "แผ่นพื้น" })[an.lineLoads[i]?.on] ?? "-"]),
                  ...(f.pointLoads ?? []).map((q, i) => [q.name || `น้ำหนักจุด ${i + 1}`, `(${fmt(q.p[0], 2)}, ${fmt(q.p[1], 2)})`, `${fmt(q.P, 0)} กก.`, ({ beam: "คาน", panel: "แผ่นพื้น" })[an.pointLoads[i]?.on] ?? "-"]),
                ]} /></>)}
              {slabs.length > 0 && (<><Sub>ออกแบบพื้นและบันได (โมดูลพื้น WSD)</Sub>
                <Table head={["แผ่น", "ชนิด", "ช่วง (ม.)", "ขอบต่อเนื่อง", "M สูงสุด (กก.-ม./ม.)", "เหล็กเสริม", "ผล"]}
                  rows={slabs.map((x) => [x.name, x.way ?? ({ C: "พื้นยื่น", ST: "บันได", PS: "PS", GS: "GS" })[x.kind] ?? x.kind, x.S ? `${fmt(x.S, 2)} × ${fmt(x.L, 2)}` : x.L ? fmt(x.L, 2) : "-",
                    x.cont !== undefined ? `${x.cont} ด้าน${x.case ? ` (กรณี ${x.case})` : ""}` : "-", x.r ? fmt(x.r.M ?? Math.max(...x.r.MS), 0) : "-", x.text ?? x.note, x.r ? pass(x.ok) : "-"])} />
                {slabs.filter((x) => x.r).map((x) => <Figure key={x.name} caption={`${x.name} — ${x.way ?? ({ C: "พื้นยื่น", ST: "บันได" })[x.kind]} · โมเมนต์ต่อความกว้าง 1 ม.${x.kind === "C" && x.note ? ` (ไม่รวมราว)` : ""}`}><SlabStrip row={x} /></Figure>)}</>)}
            </Sec>
          );
        })}

        {show("back", "beams") && <Sec id="c-beams" n={N("c-beams")} th="คาน" en="Beam design"
          intro="แต่ละ type แสดงการคำนวณของช่วงที่ใช้งานสูงสุด ตรวจหน้าตัดกลางคาน (โมเมนต์บวก) และหัวเสา (โมเมนต์ลบ เหล็กบนรับแรงดึง) ตามโมดูลออกแบบคาน">
          {types.map((t, i) => {
            const list = spans.filter((s) => s.typeIdx === i);
            if (!list.length) return null;
            const g = list.reduce((a, s) => (s.check.util > a.check.util ? s : a));
            return (
              <BeamTypeSheet key={i} t={t} g={g} count={list.length} floorName={floors[g.floor].name} mat={mat} />
            );
          })}
        </Sec>}

        {show("back", "columns") && <Sec id="c-columns" n={N("c-columns")} th="เสา" en="Column design"
          intro="แรงอัดเสาสะสมจากชั้นบนลงล่าง: แรงปฏิกิริยาคานทุกชั้นเหนือขึ้นไปรวมน้ำหนักเสาเอง เสาที่ไม่มีเสารองรับถ่ายแรงเป็นน้ำหนักจุดลงคานชั้นล่าง ตรวจตามโมดูลออกแบบเสา (WSD) ที่ระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1 × ด้านแคบ) โครงไม่เซ k = 1 และระยะปลอกไม่เกิน 16 เท่าเหล็กยืน / 48 เท่าเหล็กปลอก / ด้านแคบ">
          <Figure caption="แรงอัดและโมเมนต์ของเสาทุกต้น แยกตามชั้น"><ColumnChart stacks={res.stacks} floors={floors} /></Figure>
          <Table head={["เสา (X, Y)", "Type", ...floors.map((f) => `ใต้ ${f.name} P (ตัน)`)]}
            rows={res.stacks.map((st) => [st.key, colTypes[st.typeIdx]?.name, ...floors.map((f, k) => { const c = st.list.find((x) => x.floor === k); return c ? `${fmt(c.Pbot / 1000, 2)} · ${c.lv.Bx}×${c.lv.By} · ${c.ok ? "ผ่าน" : "ไม่ผ่าน"}` : "—"; })])} />
          {/* forces of every column (review 2026-11-04: P, Mx, My of the 3D model per column) */}
          <Sub>แรงในเสาทุกต้น — P, Mx, My</Sub>
          <Table head={["เสา (X, Y)", "ชั้น", "Type", "P สะสม (ตัน)", "N โครง 3 มิติ (ตัน)", "Mx / My โครง 3 มิติ (กก.-ม.)", "e ขั้นต่ำ (ซม.)", "ใช้ออกแบบ", "อัตราใช้", "ผล"]}
            rows={res.columns.map((c) => { const f3 = c.f3 ?? {}, fr = frame.colMethod === "frame";
              return [c.stack, floors[c.floor]?.name, `${colTypes[c.typeIdx]?.name ?? "-"} ${c.lv.Bx}×${c.lv.By}`, fmt(c.Pbot / 1000, 2), f3.N != null ? fmt(f3.N / 1000, 2) : "-",
                f3.Mx != null ? `${fmt(f3.Mx, 0)} / ${fmt(f3.My, 0)}` : "-", fmt(c.check?.e ?? 0, 1),
                fr ? `P ${fmt((c.Pd ?? c.Pbot) / 1000, 2)} ตัน + Mx/My โครง 3 มิติ (≥ e ขั้นต่ำ)` : `P ${fmt(c.Pbot / 1000, 2)} ตัน + e ขั้นต่ำ แกนเดียว${c.check?.combo ? ` · ${c.check.combo}` : ""}`,
                c.check?.util != null && c.check.util < 8.99 ? `${fmt(c.check.util * 100, 0)} %` : "-", pass(c.ok)]; })} />
          <Note>วิธีออกแบบเสา: {frame.colMethod === "frame" ? "แรงอัด P = max(แรงสะสม, N จากโครง 3 มิติ) ร่วมกับโมเมนต์จากโครง 3 มิติทั้งสองแกน ไม่น้อยกว่าโมเมนต์จากระยะเยื้องศูนย์ขั้นต่ำ" : "แรงอัดสะสมร่วมกับระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1·ด้านแคบ) (แบบเดียวกับตารางอ้างอิง) — Mx/My จากโครง 3 มิติแสดงเพื่อตรวจสอบเท่านั้น เลือก “ใช้แรงจากโครง 3 มิติ” ที่ขั้น 6 เพื่อออกแบบด้วยโมเมนต์สองแกน"} · ความชะลูดตรวจด้วย klu/r (k = 1) ไม่เกิน 100</Note>
          {colTypes.map((t, i) => t.levels.map((lv, j) => {
            const list = res.columns.filter((c) => c.typeIdx === i && c.lv === lv);
            if (!list.length) return null;
            const c = list.reduce((a, x) => (x.Pbot > a.Pbot ? x : a)), r = c.check.r;
            return (
              c.check.r ? <ColumnLevelSheet key={`${i}-${j}`} t={t} lv={lv} c={c} floorName={floors[c.floor].name} mat={mat} method={frame.colMethod} /> : <Note key={`${i}-${j}`}>{t.name} {lv.level}: {c.check.error}</Note>
            );
          }))}
        </Sec>}

        {show("back", "footings") && <Sec id="c-footings" n={N("c-footings")} th="ฐานราก" en="Foundation design"
          intro={footIntro(res, frame)}>
          <Table head={["เสา (X, Y)", "ชุดแรง", "P ฐานเสา (ตัน)", "M ฐานเสา x / y (กก.-ม.)", "เข็ม", "ฐานราก Bx × By (ม.)", "แรงต่อเข็ม / ปลอดภัย (ตัน) · ดิน q / qa", "เหล็กเสริม", "ผล"]}
            rows={res.footings.map((f) => [`${f.stack} (${fName(f)})`, f.combo ?? "D+L", fmt(f.P / 1000, 2), `${fmt(f.Mx ?? 0, 0)} / ${fmt(f.My ?? 0, 0)}`, f.kind === "spread" ? `ฐานแผ่ t ${fmt(f.inp.t, 2)}` : `${f.n} × ${f.pile}`, f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)}` : "-",
              !f.r ? "-" : f.kind === "spread" ? `ดิน ${fmt(Math.max(f.r.qmaxX, f.r.qmaxY) / 1000, 2)} / qa ${fmt(f.inp.qa / 1000, 2)} ตัน/ม.²` : `${fmt(f.r.Ptmax / 1000, 2)} / ${fmt(f.r.Pallow / 1000, 2)}`, f.r ? [f.r.longText, f.r.shortText].filter(Boolean).join(" · ") : f.error, pass(f.ok)])} />
          {res.footings.some((f) => f.kind === "spread" && f.r?.gross != null) && (<><Sub>ฐานแผ่ — แรงดันดิน (แจกแจงน้ำหนัก)</Sub>
            <Table head={["ฐาน", "P (ตัน)", "น้ำหนักฐาน Wf (ตัน)", "ดินถม Ws (ตัน)", "A (ม.²)", "q = ΣW/A", "6My/(By·Bx²)", "6Mx/(Bx·By²)", "q มุม (สองแกน)", "qa", "ผล"]}
              rows={res.footings.filter((f) => f.kind === "spread" && f.r?.gross != null).map((f) => [`${f.stack} (${fName(f)})`, fmt(f.P / 1000, 2), fmt(f.r.Wf / 1000, 2), fmt(f.r.Ws / 1000, 2), fmt(f.r.A, 2),
                fmt(f.r.gross / 1000, 2), fmt(f.r.mX / 1000, 2), fmt(f.r.mY / 1000, 2), fmt(f.r.qCorner / 1000, 2), fmt(f.inp.qa / 1000, 2), pass(f.r.qCornerOk && f.ok)])} />
            <Note>แรงดันดิน (ตัน/ม.²): q = (P + Wf + Ws) / A, Wf = t·A·2,400 กก./ม.³, Ws = (Df − t)·γ·A · q แต่ละแกน = q + 6M/(B·L²) และที่มุมฐาน q + 6Mx/(Bx·By²) + 6My/(By·Bx²) ≤ qa · q ต่ำสุดต้องไม่ติดลบ (ไม่มีแรงดึงใต้ฐาน)</Note></>)}
          {res.footings.some((f) => f.r?.bore) && (<><Sub>เหล็กเสริมในเสาเข็มเจาะ</Sub>
            <p className="text-[12px]">ตรวจเข็มเจาะเป็นองค์อาคารรับแรงอัดสั้น (WSD): P<sub>a</sub> = 0.85·A<sub>g</sub>·(0.25·f′c + f<sub>s</sub>·ρ<sub>g</sub>), f<sub>s</sub> = 0.40·f<sub>y</sub> ≤ 2,100 กก./ซม.² · ρ<sub>g</sub> ≥ 0.5 % อย่างน้อย 6 เส้น · ระยะช่องว่างเหล็ก ≥ 10 ซม. (Ø ≤ 0.40 ม. ใช้ 5 ซม.) · ปลอก RB 9 ≤ 16d<sub>b</sub> / 48d<sub>t</sub> / 0.20 ม. · ฝังในฐานราก ≥ 40d<sub>b</sub> · กำลังรับน้ำหนักของเข็มจากดินใช้ค่าน้ำหนักปลอดภัยที่กำหนด (ไม่ได้คำนวณจากผลเจาะสำรวจดิน)</p>
            <Table head={["เสา (X, Y)", "เข็ม", "แรงต่อเข็ม P (ตัน)", "Pa ตัวเข็ม (ตัน)", "เหล็กเสริม", "ผล"]}
              rows={res.footings.filter((f) => f.r?.bore).map((f) => [f.stack, `${f.n} × ${f.pile}`, fmt(f.r.bore.P / 1000, 2), f.r.bore.ok ? fmt(f.r.bore.Pa / 1000, 1) : "-", f.r.bore.text, f.r.bore.ok ? "ผ่าน" : "ไม่ผ่าน"])} /></>)}
          <Note>สรุป: ฐานแผ่ {res.footings.filter((f) => f.kind === "spread").length} ฐาน · ฐานเข็ม 1 ต้น {res.footings.filter((f) => f.n === 1).length} ฐาน · 2 ต้น {res.footings.filter((f) => f.n === 2).length} ฐาน · 3 ต้นขึ้นไป {res.footings.filter((f) => f.n >= 3).length} ฐาน · แรงรวมที่ฐาน {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</Note>
          <Sub>การตรวจสอบฐานรากแต่ละแบบ (ฐานที่รับแรงมากที่สุดของแบบ)</Sub>
          {[...fNames.keys()].map((key) => { const l = res.footings.filter((x) => fKey(x) === key), f = l.reduce((a, x) => ((x.P ?? 0) > (a.P ?? 0) ? x : a));
            return f.r && f.inp ? <FootingSheet key={key} f={f} mark={key} count={l.length} /> : null; })}
          <Sub>รูปฐานราก — แต่ละแบบ (ฐานที่รับแรงมากที่สุดของแบบนั้น)</Sub>
          <div className="grid grid-cols-2 gap-2">{[...fNames.entries()].map(([key, name]) => {
            const f = res.footings.filter((x) => fKey(x) === key).reduce((a, x) => ((x.P ?? 0) > (a.P ?? 0) ? x : a));
            return f.inp && f.r ? <Figure key={key} caption={`${name} · ${f.kind === "spread" ? `ฐานแผ่ ${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)} × ${fmt(f.inp.t, 2)} ม.` : `เข็ม ${f.n} × ${f.pile} ฐาน ${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)} × ${fmt(f.inp.t, 2)} ม.`} · ${res.footings.filter((x) => fKey(x) === key).length} ฐาน`}>
              <div className="grid grid-cols-[3fr_2fr] items-center gap-1"><FootingDetail f={f} mark={name} className="mx-auto h-[72mm] w-full overflow-visible" /><Still3D id={`ft-${name}-${fmt(f.r.Bx, 2)}x${fmt(f.r.By, 2)}-${f.n}-${f.inp?.sLong}`} node={<FootingCageParts f={f} />} className="h-[60mm] w-full" /></div></Figure> : null; })}</div>
        </Sec>}

        {show("back", "schedules") && <Sec id="c-schedules" n={N("c-schedules")} th="ตารางหน้าตัดและเหล็กเสริม" en="Schedules" intro="ขนาดและเหล็กเสริมที่ใช้ ความยาวคานรวมวัดตามแนวศูนย์กลาง ยังไม่รวมระยะทาบและเศษเหล็ก">
          <Table head={["Type", "b × h (ซม.)", "เหล็กบน (+ เสริมหัวเสา L/4 · คานยื่น: ยาวตลอด)", "เหล็กล่าง (+ เสริมกลางคาน 3L/5)", "ปลอก หัวเสา / กลาง", "จำนวน", "ยาวรวม (ม.)"]}
            rows={types.map((t, i) => { const l = spans.filter((s) => s.typeIdx === i && s.kind !== "cantilever"); return [spans.some((s) => s.typeIdx === i) ? <CalcLink id={`B-${t.name}`}>{t.name}</CalcLink> : t.name, `${fmt(t.b * 100, 0)} × ${fmt(t.h * 100, 0)}`, bars(t), [t.bot, t.botX && `+ ${t.botX}`].filter(Boolean).join(" "),
              `${stLabel(t)} @${fmt(t.sSup, 2)} / @${fmt(t.sMid, 2)}`, `${l.length} ช่วง`, fmt(l.reduce((s, x) => s + x.len, 0), 2)]; }).flatMap((row, i) => {
                // cantilever variant: same section and support bars, the top bars run the whole cantilever (B1A …)
                const c = spans.filter((s) => s.typeIdx === i && s.kind === "cantilever"), t = types[i];
                return c.length ? [row, [`${t.name}A`, row[1], `${[t.top, t.topX].filter(Boolean).join(" + ")} ยาวตลอดคานยื่น + งอขอ`, t.bot, row[4], `${c.length} ช่วง (คานยื่น)`, fmt(c.reduce((s, x) => s + x.len, 0), 2)]] : [row]; })} />
          <Table head={["Type", "ระดับ", "ขนาด (ซม.)", "เหล็กยืน", "ปลอก", "จำนวน"]}
            rows={colTypes.flatMap((t, i) => t.levels.map((lv) => [res.columns.some((c) => c.typeIdx === i && c.lv === lv) ? <CalcLink id={`C-${t.name}-${lv.level}`}>{t.name}</CalcLink> : t.name, lv.level, `${lv.Bx} × ${lv.By}`, `${lv.n}-${lv.mainBar}`, `${lv.tieBar} @${fmt(lv.s, 2)}`, `${res.columns.filter((c) => c.typeIdx === i && c.lv === lv).length} ต้น`]))} />
          <Table head={["ฐานราก", "ชนิด", "ขนาด Bx × By × t (ม.)", "เหล็กแนวยาว", "เหล็กแนวสั้น", "จำนวน"]}
            rows={[...fNames.entries()].map(([key, name]) => { const l = res.footings.filter((x) => fKey(x) === key), f = l[0];
              return [f.r && f.inp ? <CalcLink id={`F-${name}`}>{name}</CalcLink> : name, f.kind === "spread" ? "ฐานแผ่" : `เข็ม ${f.n} × ${f.pile}`, f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)} × ${fmt(f.inp?.t ?? 0, 2)}` : "-", f.r?.longText ?? `${f.inp?.longBar ?? "-"} @${fmt(f.inp?.sLong ?? 0, 2)}`, f.r?.shortText ?? `${f.inp?.shortBar ?? "-"} @${fmt(f.inp?.sShort ?? 0, 2)}`, `${l.length} ฐาน`]; })} />
          {/* cantilevers: their own bar run (not the L/4 cut-off of the schedule) — user 2026-11-03 */}
          {(() => { const cs = res.floors.flatMap((an, k) => an.spans.filter((sp) => sp.detail).map((sp) => ({ sp, k }))); return cs.length ? (<>
            <Sub>คานยื่น — เหล็กบนยาวตลอดคานยื่น งอขอที่ปลาย และฝากเข้าช่วงหลัง (แทนเหล็กเสริม L/4 ในตาราง)</Sub>
            <Table head={["ชั้น / ช่วง", "Type", "ยื่น (ม.)", "เหล็กบน", "ld (ม.)", "ฝากเข้าช่วงหลัง", "หมายเหตุ"]}
              rows={cs.map(({ sp, k }) => [`${floors[k].name} ${sp.id}`, sp.typeName, fmt(sp.len, 2), `${sp.detail.bars} ยาวตลอด`, fmt(sp.detail.ld, 2),
                sp.detail.noBack ? "ฝังในเสา ≥ ld + งอขอ" : sp.detail.through ? `ตลอดช่วง ${sp.detail.back}` : `${fmt(sp.detail.ext, 2)} ม. (ช่วง ${sp.detail.back})`,
                sp.detail.noBack ? "ไม่มีช่วงหลัง" : sp.detail.through ? "ช่วงหลังสั้นกว่าระยะฝาก" : ""])} />
            <Note>ld = 1.4 × max(0.06·Ab·fy/√f'c, 0.006·db·fy) (เหล็กบน, วิธีหน่วยแรงใช้งาน ว.ส.ท. / ACI 318) · ระยะฝาก = max(ความยาวคานยื่น, ld)</Note>
            <div className="grid grid-cols-2 gap-2">{[...new Map(cs.map(({ sp }) => [`${sp.type.name}|${fmt(sp.len, 2)}|${sp.detail.through}|${sp.detail.noBack}`, sp])).values()].map((sp) => (
              <Figure key={sp.id} caption={`คานยื่น ${sp.id} (${sp.typeName})`}><CantileverDetail d={sp.detail} t={sp.type} L={sp.len} id={sp.id} /></Figure>))}</div>
          </>) : null; })()}
          {/* short spans hogging all along: extra top bars the whole span (floor.js sp.topFull, user 2026-11-04) */}
          {(() => { const cs = res.floors.flatMap((an, k) => an.spans.filter((sp) => sp.topFull).map((sp) => ({ sp, k }))); return cs.length ? (<>
            <Sub>ช่วงคานที่มีโมเมนต์ลบตลอดช่วง — เหล็กบน (รวมเหล็กเสริมพิเศษ) ยาวตลอดช่วง แทนการตัดที่ L/4</Sub>
            <Table head={["ชั้น / ช่วง", "Type", "ยาว (ม.)", "เหล็กบน", "M กลางช่วง (กก.-ม.)", "เหตุผล"]}
              rows={cs.map(({ sp, k }) => [`${floors[k].name} ${sp.id}`, sp.typeName, fmt(sp.len, 2), `${sp.topFull.bars} ยาวตลอดช่วง`, fmt(sp.topFull.Mmid, 0),
                sp.topFull.lifted ? "ปลายช่วงถูกยก (ช่วงสั้นติดช่วงยาว) — ยึดเหล็กเข้าเสา" : "โมเมนต์ลบถึงกลางช่วง (ขอบเขตน้ำหนักจรแบบหมากรุก)"])} />
          </>) : null; })()}
          {/* reinforcement sections of every beam type (support / mid-span) and column level in use */}
          <Sub>รูปตัดเหล็กเสริมคาน (ซ้าย: ช่วงหัวเสา · ขวา: ช่วงกลางคาน)</Sub>
          <div className="grid grid-cols-2 gap-2">
            {types.filter((_, i) => spans.some((sp) => sp.typeIdx === i)).map((t, k) => { const LL = beamLayersOf(t, mat);
              return (
                <Figure key={t.name} caption={`${t.name} ${fmt(t.b * 100, 0)}×${fmt(t.h * 100, 0)} ซม. · หัวเสา ${stLabel(t)} @${fmt(t.sSup, 2)} · กลางคาน @${fmt(t.sMid, 2)}`}>
                  <div className="grid grid-cols-3 items-center gap-1"><BeamDetail t={t} mat={mat} at="sup" className="h-[40mm] w-full" /><BeamDetail t={t} mat={mat} at="mid" className="h-[40mm] w-full" />
                    <Still3D id={`bt-${JSON.stringify([t.b, t.h, t.top, t.topX, t.bot, t.botX, t.st, t.sSup, t.sMid, mat.cover])}`} node={<BeamCageParts b={t.b} h={t.h} L={2.4} cover={mat.cover ?? 3} stirrupBar={t.st} type="both_ends" mid={LL.mid} sup={LL.sup} sEnd={t.sSup} sMid={t.sMid} />} className="h-[40mm] w-full" /></div>
                </Figure>);
            })}
          </div>
          <Sub>รูปตัดเหล็กเสริมเสา</Sub>
          <div className="grid grid-cols-4 gap-2">
            {colTypes.flatMap((t, i) => t.levels.filter((lv) => res.columns.some((c) => c.typeIdx === i && c.lv === lv)).map((lv) => { const [nx, ny] = faceBars(lv.n), j = t.levels.indexOf(lv);
              return (
                <Figure key={`${t.name}${lv.level}`} caption={`${t.name} ${lv.level} · ${lv.n}-${lv.mainBar} · ${lv.tieBar} @${fmt(lv.s, 2)}`}>
                  <ColumnDetail lv={lv} cover={j === 0 && mat.coverPier > 0 ? mat.coverPier : mat.coverCol ?? mat.cover ?? 3} className="mx-auto h-[36mm] w-full" />
                </Figure>
              ); }))}
          </div>
        </Sec>}

        {show("back", "appendix") && <Sec id="c-appendix" n={N("c-appendix")} th="ภาคผนวก — แรงภายในคานทุกช่วง" en="Appendix: beam forces"
          intro="ตารางแรงออกแบบของคานทุกช่วงและรูปน้ำหนัก แรงเฉือน โมเมนต์ ของคานทุกแนว แยกตามชั้น">
          {floors.map((f, k) => { const an = res.floors[k]; return (
            <div key={k} className={k ? "rp-chapter" : ""}>
              <Sub>{f.name}</Sub>
              <Table head={["ช่วง", "ยาว (ม.)", "ชนิด", "Type", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "T (กก.-ม.)", "ใช้", "ผล"]}
                rows={an.spans.map((s) => { const m = (k) => (s.src?.[k] === "LAT" ? " ᴸ" : s.src?.[k] === "3D" ? " ³ᴰ" : ""); return [s.id, fmt(s.len, 2), KIND_TH[s.kind], s.typeName ?? types[s.typeIdx]?.name, fmt(s.Mpos, 0) + m("Mpos"), fmt(s.Mneg, 0) + m("Mneg"), fmt(s.V, 0) + m("V"), fmt(s.Mt ?? 0, 0), `${fmt(s.check.util * 100, 0)}%`, pass(s.ok)]; })} />
              {res.analysis === "envelope" && <Note>³ᴰ = ค่าจากโครง 3 มิติมากกว่าคานต่อเนื่อง (ใช้ค่านี้ออกแบบ){res.lateral ? " · ᴸ = ค่าจากชุดผสมแรงที่มีแรงลม / แผ่นดินไหว" : ""}</Note>}
              {an.lines.filter((ln) => ln.arc).map((ln) => { const g = arcGeom(ln.A, ln.B, ln.arc.s); return <Note key={`arc${ln.id}`}>คานโค้ง แนว {ln.id + 1}: รัศมี {fmt(g.R, 2)} ม. มุม {fmt((g.th * 180) / Math.PI, 0)}° ยาวตามส่วนโค้ง {fmt(g.L, 2)} ม. (คอร์ด {fmt(g.c, 2)} ม.) — โครง 3 มิติแบ่ง 12 ชิ้นตามส่วนโค้ง ได้โมเมนต์และแรงบิดจากความโค้ง (ใช้ออกแบบ) · คานต่อเนื่องคิดตามคอร์ด · พื้นระหว่างคอร์ดกับส่วนโค้ง {fmt(g.area, 2)} ม.² เพิ่มเป็นน้ำหนักบนคาน</Note>; })}
              {an.warnings.map((w) => <Note key={w}>{w}</Note>)}
              <Sub>รูปน้ำหนัก แรงเฉือน และโมเมนต์ของคานแต่ละแนว — {f.name}</Sub>
              {an.lines.filter((ln) => ln.res).map((ln) => (
                <Figure key={ln.id} caption={`แนว ${ln.id + 1}: (${fmt(ln.A[0], 2)}, ${fmt(ln.A[1], 2)}) → (${fmt(ln.B[0], 2)}, ${fmt(ln.B[1], 2)}) ยาว ${fmt(ln.L, 2)} ม. · ช่วง ${an.spans.filter((s) => s.line === ln.id).map((s) => `${s.id} ${types[s.typeIdx]?.name ?? ""}`).join(", ")}`}>
                  <LineDiagram ln={ln} f3={res.frame3d?.members.filter((m) => m.floor === k)} />
                </Figure>))}
            </div>); })}
        </Sec>}
      </Doc>
    </Wrap>
  );
}
