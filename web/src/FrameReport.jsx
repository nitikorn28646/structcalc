// Thai calculation report for the RC frame drawn on plan: loads, slab panels, continuous beams, beam / column types, schedules.
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { beamSectionModel, columnSectionModel, framePlanModel } from "./drawings.js";
import { SLAB_BARS } from "../engine/tables.js";
import { CONC, DEFAULT_WALL_TYPES, GROUPS, STAIR_KINDS, barLayers, faceBars, parseBars, stLabel, wallsOf } from "../engine/floor.js";
import { designSlabs } from "../engine/slabDesign.js";
import { analyzeFrame } from "../engine/frame.js";
import { arcGeom } from "../engine/arc.js";
import { CantileverDetail, ColumnChart, FrameIso, LineDiagram, SlabStrip } from "./ReportDiagrams.jsx";

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
    <p className="mt-2 font-semibold text-gray-800">{title}</p>
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

export function FrameReport({ frame, project }) {
  const res = analyzeFrame(frame), { floors, beamTypes: types, colTypes, mat } = frame;
  const spans = res.floors.flatMap((a, k) => a.spans.map((s) => ({ ...s, floor: k })));
  const fc = Math.min(mat.F * mat.fcPrime, mat.capFc !== false ? 65 : Infinity);
  let n = 0;
  return (
    <div className="report">
      <Doc project={project} title="รายการคำนวณออกแบบคานและเสา คอนกรีตเสริมเหล็ก" subtitle="RC beams & columns from the framing plan — Working Stress Design (WSD)"
        memberLabel="โครงสร้าง" member={frame.frameNo}
        summary={[
          ["จำนวนชั้น (ระดับคาน)", `${floors.length} ระดับ`],
          ["คาน", `${spans.length} ช่วง · type ${[...new Set(spans.map((s) => s.typeIdx))].sort((a, b) => a - b).map((i) => types[i]?.name).join(", ")}`],
          ["เสา", `${res.stacks.length} ต้น · type ${[...new Set(res.stacks.map((s) => colTypes[s.typeIdx]?.name))].join(", ")}`],
          ["แรงอัดเสาที่ฐานรวม", `${fmt(res.columns.filter((c) => c.floor === 0).reduce((s, c) => s + c.Pbot, 0) / 1000, 2)} ตัน`],
          ["ผลการตรวจสอบรวม", res.ok ? "ผ่านทุกข้อ" : `คานไม่ผ่าน ${spans.filter((s) => !s.ok).length} ช่วง · เสาไม่ผ่าน ${res.columns.filter((c) => !c.ok).length} ต้น/ชั้น`, res.ok],
        ]}>
        <Sec n={++n} th="ข้อมูลการออกแบบและน้ำหนักบรรทุก" en="Design data & loads"
          intro={`ใช้วิธีหน่วยแรงใช้งาน น้ำหนักบรรทุกคงที่รวมน้ำหนักบรรทุกจรโดยไม่คูณตัวคูณ ${res.analysis === "envelope"
            ? `แรงออกแบบ = ค่ามากสุดของ (ก) คานต่อเนื่องบนจุดรองรับแบบหมุน จัดน้ำหนักจรแบบหมากรุก และ (ข) โครง 3 มิติจุดต่อแข็งทั้งอาคาร (ฐานเสา${frame.baseFixity === "fixed" ? "ยึดแน่น" : "เป็นหมุด เพราะฐานเข็ม 1–2 ต้นรับโมเมนต์ไม่ได้"} ปลายคานซอยเป็นหมุด stiffness แตกร้าว คาน 0.5Ig เสา 0.7Ig รวม P-Delta) — ${frame.colMethod === "frame" ? "เสาใช้แรงอัดและโมเมนต์จากโครง 3 มิติทั้งสองแกนแต่ไม่น้อยกว่าระยะเยื้องศูนย์ขั้นต่ำ" : "เสาออกแบบด้วยแรงอัดสะสมกับระยะเยื้องศูนย์ขั้นต่ำ (โมเมนต์จากโครง 3 มิติแสดงไว้ประกอบ)"} ความยาวเสาใช้ความสูงสุทธิ (หลังคานล่างถึงท้องคานบน)`
            : "คานคิดเป็นคานต่อเนื่องวางบนจุดรองรับแบบหมุน (เสาหรือคานที่รับ) จัดน้ำหนักจรแบบหมากรุก"}`}>
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
          {res.frame3d && <Figure caption={`แบบจำลองโครง 3 มิติทั้งอาคาร (มุมมองไอโซเมตริก) — ใช้หาแรงร่วมกับคานต่อเนื่อง`}><FrameIso f3={res.frame3d} /></Figure>}
        </Sec>

        {res.lateral && (() => { const L = res.lateral, W = L.wind, E = L.seismic; return (
          <Sec n={++n} th="แรงด้านข้างและชุดผสมแรง" en="Wind, earthquake & load combinations"
            intro="แรงด้านข้างกระทำที่ระดับพื้นแต่ละชั้น พื้นทุกชั้นถือว่าแข็งในแนวราบ (rigid diaphragm) แรงกระทำที่จุดศูนย์กลางของจุดต่อในชั้นนั้น วิเคราะห์ด้วยโครง 3 มิติ แล้วรวมกับน้ำหนักคงที่ (D) และน้ำหนักจร (L) ตามชุดผสมแรงแบบหน่วยแรงใช้งาน คานและเสาออกแบบจากชุดที่วิกฤตที่สุด">
            {W && <>
              <p className="mt-1 font-semibold text-gray-800">แรงลม — มยผ. 1311-50 วิธีอย่างง่าย</p>
              <Item th="ความเร็วลมอ้างอิง" f="V50" v={fmt(W.V50, 0)} u="ม./วินาที" note={`ภูมิประเทศ ${W.terrain === "B" ? "ขรุขระ" : "โล่ง"}`} />
              <Item th="หน่วยแรงลมอ้างอิง" f="q = ½ρV50² (ρ = 1.25 กก./ม.³)" v={fmt(W.q, 1)} u="กก./ม.²" />
              <Item th="หน่วยแรงลมออกแบบ" f="p = Iw·q·Cg·(Cp,ต้นลม·Ce(z) + |Cp,ท้ายลม|·Ce(H/2))" v={`Iw ${fmt(W.Iw, 2)} · Cg ${fmt(W.Cg, 1)} · Cp ${fmt(W.Cpw, 1)} / ${fmt(W.x.Cpl, 2)} (X), ${fmt(W.y.Cpl, 2)} (Y)`} note={`Ce = (z/10)^0.2 ≥ 0.9 (โล่ง) · 0.7(z/12)^0.3 ≥ 0.7 (ขรุขระ) · H = ${fmt(W.H, 2)} ม.`} />
              <Table head={["ทิศลม", "ชั้น", "แถบความสูง (ม.)", "กว้างรับลม B (ม.)", "Ce", "p (กก./ม.²)", "F (กก.)"]}
                rows={["x", "y"].flatMap((d) => W[d].floors.map((f) => [d.toUpperCase(), floors[f.floor]?.name, `${fmt(f.lo, 2)}–${fmt(f.hi, 2)}`, fmt(f.B, 2), fmt(f.CeW, 2), fmt(f.p, 1), fmt(f.F, 0)]))} />
              <Note>แรงเฉือนที่ฐานจากลม: แนว X {fmt(W.x.V, 0)} กก. · แนว Y {fmt(W.y.V, 0)} กก.</Note>
            </>}
            {E && <>
              <p className="mt-2 font-semibold text-gray-800">แรงแผ่นดินไหว — มยผ. 1301/1302-61 วิธีแรงสถิตเทียบเท่า</p>
              <Item th="ค่าสเปกตรัมจากแผนที่" f="Ss / S1" v={`${fmt(E.Ss, 3)} / ${fmt(E.S1, 3)}`} u="g" note={`ชั้นดิน ${E.site} → Fa ${fmt(E.Fa, 2)} · Fv ${fmt(E.Fv, 2)}`} />
              <Item th="ค่าสเปกตรัมออกแบบ" f="SDS = ⅔Fa·Ss , SD1 = ⅔Fv·S1" v={`${fmt(E.SDS, 3)} / ${fmt(E.SD1, 3)}`} u="g" />
              <Item th="คาบการสั่น" f="T = Ct·H" v={fmt(E.T, 3)} u="วินาที" note={`Ct ${fmt(E.Ct, 3)} · H ${fmt(E.H, 2)} ม. → Sa ${fmt(E.Sa, 3)} g`} />
              <Item th="สัมประสิทธิ์แรงเฉือนฐาน" f="Cs = Sa·I/R ≥ 0.01" v={fmt(E.Cs, 4)} note={`I ${fmt(E.I, 2)} · R ${fmt(E.R, 1)}`} />
              <Item th="แรงเฉือนที่ฐาน" f="V = Cs·W" v={fmt(E.V, 0)} u="กก." note={`W = ${fmt(E.W, 0)} กก. (น้ำหนักคงที่ทั้งอาคาร ไม่รวมน้ำหนักจร)`} />
              <Table head={["ชั้น", "สูงจากฐาน h (ม.)", "น้ำหนัก w (กก.)", "Fx = V·w·h^k / Σw·h^k (กก.)"]} rows={E.floors.map((f) => [floors[f.floor]?.name, fmt(f.h, 2), fmt(f.w, 0), fmt(f.F, 0)])} />
            </>}
            <p className="mt-2 font-semibold text-gray-800">ชุดผสมแรง (หน่วยแรงใช้งาน) — {L.combos.length} ชุด</p>
            <Table head={["ชุด", "D", "L", "ลม X", "ลม Y", "แผ่นดินไหว X", "แผ่นดินไหว Y"]} rows={L.combos.map((c) => [c.name, fmt(c.D, 2), fmt(c.L, 2), fmt(c.Wx, 3), fmt(c.Wy, 3), fmt(c.Ex, 3), fmt(c.Ey, 3)])} />
            {L.drift.length > 0 && <>
              <p className="mt-2 font-semibold text-gray-800">การเซตัวระหว่างชั้น</p>
              <Table head={["กรณี", "ชั้น", "h (ม.)", "เซระหว่างชั้น (มม.)", "ยอมให้ (มม.)", "ผล"]} rows={L.drift.map((d) => [d.key, floors[d.floor]?.name, fmt(d.h, 2), fmt(d.dd * 1000, 2), fmt(d.lim * 1000, 1), pass(d.ok)])} />
              <Note>ลม: ≤ h/400 (แรงลมไม่คูณตัวคูณ) · แผ่นดินไหว: Cd·δ/I ≤ 0.02h · δ = การเคลื่อนตัวมากที่สุดของจุดต่อในชั้น ลบชั้นล่าง</Note>
            </>}
          </Sec>); })()}

        {floors.map((f, k) => {
          const an = res.floors[k], wt = frame.wallTypes ?? DEFAULT_WALL_TYPES, walls = wallsOf(f), slabs = designSlabs(an, f, mat);
          return (
            <Sec key={k} n={++n} th={`แปลนและผลคาน — ${f.name}`} en={`Floor ${k + 1}: plan, slab panels, continuous beams`}
              intro="แผ่นพื้นหาจากช่องที่คานล้อมรอบ พื้นสองทาง (L/S ≤ 2) ถ่ายน้ำหนักลงคานเป็นรูปสามเหลี่ยม/คางหมูตามเส้น 45° ค่าสูงสุด wS/2 พื้นทางเดียวลงคานด้านยาว wS/2 รวมน้ำหนักผนังบนคานและน้ำหนักคานเอง คานซอยวิเคราะห์ก่อนแล้วส่งแรงปฏิกิริยาเป็นน้ำหนักจุดให้คานที่รับ">
              <Figure caption={`แปลนคาน-เสา ${f.name} — สีตาม type คาน`}>
                <Drawing model={framePlanModel(f, an, types, res.columns.filter((c) => c.floor === k))} className="mx-auto h-[110mm]" fontSize={9} width={640} />
              </Figure>
              <p className="mt-2 font-semibold text-gray-800">น้ำหนักแยกกลุ่มที่ลงคานชั้นนี้</p>
              <Table head={["กลุ่ม", ...Object.values(GROUPS).map((g) => g[0]), "รวม"]} rows={[["ตัน", ...Object.keys(GROUPS).map((g) => fmt((an.groups[g] ?? 0) / 1000, 2)), fmt(Object.values(an.groups).reduce((a, b) => a + b, 0) / 1000, 2)]]} />
              {an.panels.length > 0 && <Table head={["แผ่น", "ชนิด", "S × L (ม.)", "หนา (ม.)", "DL", "SDL", "ผนัง", "LL", "พิเศษ", "รวม (กก./ม.²)"]}
                rows={an.panels.map((p, i) => [`P${i + 1}`, p.open ? "ช่องเปิด" : p.stairWell ? "ช่องบันได" : p.st === "GS" ? "GS บนดิน" : p.st === "PS" ? `PS วางแนว ${p.dir === "x" ? "X" : "Y"}` : p.kind === "twoway" ? "S สองทาง" : p.kind === "oneway" ? "S ทางเดียว" : "S อื่นๆ",
                  p.S ? `${fmt(p.S, 2)} × ${fmt(p.L, 2)}` : "-", fmt(p.t, 2), ...["DL", "SDL", "WALL", "LL", "SP"].map((g) => fmt(p.g[g] ?? 0, 0)), fmt(p.w, 0)])} />}
              {walls.length > 0 && (<><p className="mt-2 font-semibold text-gray-800">ผนัง</p>
                <Table head={["ผนัง", "ชนิด", "สูง (ม.)", "ช่องเปิด", "ชั้น", "ยาว (ม.)", "กก./ม.", "ลงที่"]}
                  rows={walls.map((w, i) => { const r = an.walls[i]; return [i + 1, (wt.find((x) => x.id === w.kind) ?? wt[0]).name, fmt(w.h, 2), `${w.open ?? 0}%`, (w.layers ?? 1) > 1 ? "เบิ้ล" : "เดี่ยว", fmt(r.len, 2), fmt(r.q, 0), r.on.length ? `คานแนว ${r.on.map((o) => o.line + 1).join(", ")}` : r.panel ? "แผ่นพื้น (กระจาย)" : r.ground ? "พื้นบนดิน" : "-"]; })} /></>)}
              {(an.cants.length > 0 || an.stairs.length > 0 || (f.lineLoads ?? []).length > 0 || (f.pointLoads ?? []).length > 0) && (<><p className="mt-2 font-semibold text-gray-800">พื้นยื่น บันได และน้ำหนักอื่น</p>
                <Table head={["รายการ", "รายละเอียด", "น้ำหนัก", "ลงที่"]} rows={[
                  ...an.cants.map((c, i) => [`พื้นยื่น ${i + 1}`, `ยื่น ${fmt(c.L, 2)} ม. หนา ${fmt(c.t, 2)} ม.`, `${fmt(c.w, 0)} กก./ม.²`, "คานริม (+ แรงบิด wL²/2)"]),
                  ...an.stairs.map((st, i) => [`บันได ${i + 1}`, `${STAIR_KINDS[st.kind]} · ช่วง ${fmt(st.Lr, 2)} × กว้าง ${fmt(st.B, 2)} ม. · ${fmt((st.th * 180) / Math.PI, 1)}°`, `${fmt(st.w, 0)} กก./ม.² (${fmt((st.total.DL + st.total.SDL + st.total.LL) / 1000, 2)} ตัน)`,
                    st.kind === "long" ? "คานปลายบน (ชั้นนี้) / ปลายล่าง (ชั้นล่าง)" : st.kind === "landing" ? "คานต้น/ปลายบันได + คานชานพัก" : st.kind === "cant" ? "คานด้านข้าง (+ แรงบิด)" : "คาน/ผนังสองข้าง"]),
                  ...(f.lineLoads ?? []).map((l, i) => [l.name || `น้ำหนักเส้น ${i + 1}`, `ยาว ${fmt(Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]), 2)} ม.`, `${fmt(l.q, 0)} กก./ม.`, ({ cant: "ปลายพื้นยื่น → คานริม", beam: "คาน", panel: "แผ่นพื้น" })[an.lineLoads[i]?.on] ?? "-"]),
                  ...(f.pointLoads ?? []).map((q, i) => [q.name || `น้ำหนักจุด ${i + 1}`, `(${fmt(q.p[0], 2)}, ${fmt(q.p[1], 2)})`, `${fmt(q.P, 0)} กก.`, ({ beam: "คาน", panel: "แผ่นพื้น" })[an.pointLoads[i]?.on] ?? "-"]),
                ]} /></>)}
              {slabs.length > 0 && (<><p className="mt-2 font-semibold text-gray-800">ออกแบบพื้นและบันได (โมดูลพื้น WSD)</p>
                <Table head={["แผ่น", "ชนิด", "ช่วง (ม.)", "ขอบต่อเนื่อง", "M สูงสุด (กก.-ม./ม.)", "เหล็กเสริม", "ผล"]}
                  rows={slabs.map((x) => [x.name, x.way ?? ({ C: "พื้นยื่น", ST: "บันได", PS: "PS", GS: "GS" })[x.kind] ?? x.kind, x.S ? `${fmt(x.S, 2)} × ${fmt(x.L, 2)}` : x.L ? fmt(x.L, 2) : "-",
                    x.cont !== undefined ? `${x.cont} ด้าน${x.case ? ` (กรณี ${x.case})` : ""}` : "-", x.r ? fmt(x.r.M ?? Math.max(...x.r.MS), 0) : "-", x.text ?? x.note, x.r ? pass(x.ok) : "-"])} />
                {slabs.filter((x) => x.r).map((x) => <Figure key={x.name} caption={`${x.name} — ${x.way ?? ({ C: "พื้นยื่น", ST: "บันได" })[x.kind]} · โมเมนต์ต่อความกว้าง 1 ม.${x.kind === "C" && x.note ? ` (ไม่รวมราว)` : ""}`}><SlabStrip row={x} /></Figure>)}</>)}
              <Table head={["ช่วง", "ยาว (ม.)", "ชนิด", "Type", "M+ (กก.-ม.)", "M− (กก.-ม.)", "V (กก.)", "T (กก.-ม.)", "ใช้", "ผล"]}
                rows={an.spans.map((s) => { const m = (k) => (s.src?.[k] === "LAT" ? " ᴸ" : s.src?.[k] === "3D" ? " ³ᴰ" : ""); return [s.id, fmt(s.len, 2), KIND_TH[s.kind], s.typeName ?? types[s.typeIdx]?.name, fmt(s.Mpos, 0) + m("Mpos"), fmt(s.Mneg, 0) + m("Mneg"), fmt(s.V, 0) + m("V"), fmt(s.Mt ?? 0, 0), `${fmt(s.check.util * 100, 0)}%`, pass(s.ok)]; })} />
              {res.analysis === "envelope" && <Note>³ᴰ = ค่าจากโครง 3 มิติมากกว่าคานต่อเนื่อง (ใช้ค่านี้ออกแบบ){res.lateral ? " · ᴸ = ค่าจากชุดผสมแรงที่มีแรงลม / แผ่นดินไหว" : ""}</Note>}
              {an.lines.filter((ln) => ln.arc).map((ln) => { const g = arcGeom(ln.A, ln.B, ln.arc.s); return <Note key={`arc${ln.id}`}>คานโค้ง แนว {ln.id + 1}: รัศมี {fmt(g.R, 2)} ม. มุม {fmt((g.th * 180) / Math.PI, 0)}° ยาวตามส่วนโค้ง {fmt(g.L, 2)} ม. (คอร์ด {fmt(g.c, 2)} ม.) — โครง 3 มิติแบ่ง 12 ชิ้นตามส่วนโค้ง ได้โมเมนต์และแรงบิดจากความโค้ง (ใช้ออกแบบ) · คานต่อเนื่องคิดตามคอร์ด · พื้นระหว่างคอร์ดกับส่วนโค้ง {fmt(g.area, 2)} ม.² เพิ่มเป็นน้ำหนักบนคาน</Note>; })}
              {an.warnings.map((w) => <Note key={w}>{w}</Note>)}
              <p className="mt-3 font-semibold text-gray-800">รูปน้ำหนัก แรงเฉือน และโมเมนต์ของคานแต่ละแนว — {f.name}</p>
              {an.lines.filter((ln) => ln.res).map((ln) => (
                <Figure key={ln.id} caption={`แนว ${ln.id + 1}: (${fmt(ln.A[0], 2)}, ${fmt(ln.A[1], 2)}) → (${fmt(ln.B[0], 2)}, ${fmt(ln.B[1], 2)}) ยาว ${fmt(ln.L, 2)} ม. · ช่วง ${an.spans.filter((s) => s.line === ln.id).map((s) => `${s.id} ${types[s.typeIdx]?.name ?? ""}`).join(", ")}`}>
                  <LineDiagram ln={ln} f3={res.frame3d?.members.filter((m) => m.floor === k)} />
                </Figure>))}
            </Sec>
          );
        })}

        <Sec n={++n} th="การตรวจสอบ type คาน (ช่วงวิกฤต)" en="Beam types — governing span"
          intro="แต่ละ type แสดงการคำนวณของช่วงที่ใช้งานสูงสุด ตรวจหน้าตัดกลางคาน (โมเมนต์บวก) และหัวเสา (โมเมนต์ลบ เหล็กบนรับแรงดึง) ตามโมดูลออกแบบคาน">
          {types.map((t, i) => {
            const list = spans.filter((s) => s.typeIdx === i);
            if (!list.length) return null;
            const g = list.reduce((a, s) => (s.check.util > a.check.util ? s : a));
            return (
              <div key={i} className="mb-3">
                <p className="mt-2 font-semibold text-gray-800">{t.name} — {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม. · ช่วงวิกฤต {floors[g.floor].name} {g.id} ยาว {fmt(g.len, 2)} ม. ({KIND_TH[g.kind]}) · ใช้ {list.length} ช่วง</p>
                {g.check.mid && <BeamSection title="กลางคาน (เหล็กล่างรับแรงดึง)" r={g.check.mid} M={g.Mpos} V={g.V} atD={g.vAtD} />}
                {g.check.sup && <BeamSection title="หัวเสา (เหล็กบนรับแรงดึง)" r={g.check.sup} M={g.Mneg} V={g.V} tensionTop atD={g.vAtD} />}
                {g.check.error && <Note>{g.check.error}</Note>}
              </div>
            );
          })}
        </Sec>

        <Sec n={++n} th="เสา" en="Columns"
          intro="แรงอัดเสาสะสมจากชั้นบนลงล่าง: แรงปฏิกิริยาคานทุกชั้นเหนือขึ้นไปรวมน้ำหนักเสาเอง เสาที่ไม่มีเสารองรับถ่ายแรงเป็นน้ำหนักจุดลงคานชั้นล่าง ตรวจตามโมดูลออกแบบเสา (WSD) ที่ระยะเยื้องศูนย์ขั้นต่ำ max(2.5 ซม., 0.1 × ด้านแคบ) โครงไม่เซ k = 1 และระยะปลอกไม่เกิน 16 เท่าเหล็กยืน / 48 เท่าเหล็กปลอก / ด้านแคบ">
          <Figure caption="แรงอัดและโมเมนต์ของเสาทุกต้น แยกตามชั้น"><ColumnChart stacks={res.stacks} floors={floors} /></Figure>
          <Table head={["เสา (X, Y)", "Type", ...floors.map((f) => `ใต้ ${f.name} P (ตัน)`)]}
            rows={res.stacks.map((st) => [st.key, colTypes[st.typeIdx]?.name, ...floors.map((f, k) => { const c = st.list.find((x) => x.floor === k); return c ? `${fmt(c.Pbot / 1000, 2)} · ${c.lv.Bx}×${c.lv.By} · ${c.ok ? "ผ่าน" : "ไม่ผ่าน"}` : "—"; })])} />
          {colTypes.map((t, i) => t.levels.map((lv, j) => {
            const list = res.columns.filter((c) => c.typeIdx === i && c.lv === lv);
            if (!list.length) return null;
            const c = list.reduce((a, x) => (x.Pbot > a.Pbot ? x : a)), r = c.check.r;
            return (
              <div key={`${i}-${j}`} className="mb-2">
                <p className="mt-2 font-semibold text-gray-800">{t.name} {lv.level} — {lv.Bx}×{lv.By} ซม. {lv.n}-{lv.mainBar} ปลอก {lv.tieBar} @{fmt(lv.s, 2)} ม. · ต้นวิกฤต {c.stack} ใต้ {floors[c.floor].name}</p>
                {r ? (<>
                  <Item th="แรงอัด (รวมน้ำหนักเสา)" f="P" v={fmt(c.Pd ?? c.Pbot, 0)} u="กก." note={`ความสูงชั้น ${fmt(c.L, 2)} ม. · สูงสุทธิ lu ${fmt(c.Lu ?? c.L, 2)} ม. (หักคานลึก ${fmt(c.dTop ?? 0, 2)} ม.) · น้ำหนักเสา ${fmt(c.W, 0)} กก.`} />
                  {frame.colMethod === "frame" && c.M3 && <Item th="โมเมนต์จากโครง 3 มิติ" f="Mx / My" v={`${fmt(c.M3.Mx, 0)} / ${fmt(c.M3.My, 0)}`} u="กก.-ม." note="ใช้ไม่น้อยกว่าโมเมนต์จากระยะเยื้องศูนย์ขั้นต่ำ" />}
                  <Item th="อัตราส่วนเหล็ก" f="pg = Ast/Ag" v={`${fmt(r.pg, 2)}%`} ok={r.pgOk} note={`Ast ${fmt(r.Ast, 2)} ซม.² · Ag ${fmt(r.Ag, 0)} ซม.²`} />
                  <Item th="ระยะเยื้องศูนย์ขั้นต่ำ" f="e = max(2.5, 0.1t)" v={fmt(c.check.e, 2)} u="ซม." note={`M = ${fmt(((c.Pd ?? c.Pbot) * c.check.e) / 100, 0)} กก.-ม.`} />
                  {c.check.combo && c.check.combo !== "D+L" && <Item th="ชุดผสมแรงที่ควบคุม" v={c.check.combo} note="ตรวจทุกชุด ใช้ชุดที่อัตราส่วนสูงสุด" />}
                  <Item th="กรณีควบคุม" v={r.mode === "I" ? "แรงอัดควบคุม" : r.mode === "II" ? "แรงอัดร่วมแรงดัด" : "แรงดึงควบคุม"} note={r.slender ? `เสาชะลูด R = ${fmt(r.R, 3)}` : "เสาสั้น"} />
                  <Item th={r.mode === "I" ? "แรงอัด / กำลังรับแรงอัด" : "อัตราส่วนหน่วยแรง"} f={r.mode === "I" ? "P ≤ Pa" : "fa/Fa + fb/Fb ≤ 1"} v={r.mode === "I" ? `${fmt(r.Pd, 0)} ≤ ${fmt(r.Pa, 0)}` : fmt(r.ratio, 3)} ok={r.ok} />
                  <Item th="ระยะเหล็กปลอก" f="s ≤ min(16db, 48dt, t)" v={`${fmt(lv.s * 100, 1)} ≤ ${fmt(r.sTie, 1)}`} u="ซม." ok={c.check.sOk} />
                </>) : <Note>{c.check.error}</Note>}
              </div>
            );
          }))}
        </Sec>

        <Sec n={++n} th="ฐานราก" en="Pile caps"
          intro={`แรงที่ฐานเสา (รวมน้ำหนักเสาทุกชั้น) ลงฐานรากเสาเข็มตอก ยาว ${(frame.footing?.pileL ?? 6)} ม. รับน้ำหนักปลอดภัย ${fmt((frame.footing?.Psafe ?? 18000) / 1000, 0)} ตัน/ต้น ตามแบบ ตรวจด้วยโมดูลฐานราก (เสาเข็ม ฐานหนา ${fmt(frame.footing?.t ?? 0.4, 2)} ม.) เลือกจำนวนและขนาดเข็มที่น้อยที่สุดที่ผ่านทุกข้อ แรงลงเสาใช้ค่ามากกว่าระหว่างคานต่อเนื่องกับคานช่วงเดี่ยว (ไม่ให้เสาที่ถูกยกรับแรงน้อยเกินจริง)`}>
          <Table head={["เสา (X, Y)", "ชุดแรง", "P ฐานเสา (ตัน)", "M ฐานเสา x / y (กก.-ม.)", "เข็ม", "ฐานราก Bx × By (ม.)", "แรงต่อเข็ม / ปลอดภัย (ตัน) · ดิน q / qa", "เหล็กเสริม", "ผล"]}
            rows={res.footings.map((f) => [f.type ? `${f.stack} (${f.type})` : f.stack, f.combo ?? "D+L", fmt(f.P / 1000, 2), `${fmt(f.Mx ?? 0, 0)} / ${fmt(f.My ?? 0, 0)}`, f.kind === "spread" ? `ฐานแผ่ t ${fmt(f.inp.t, 2)}` : `${f.n} × ${f.pile}`, f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)}` : "-",
              !f.r ? "-" : f.kind === "spread" ? `ดิน ${fmt(Math.max(f.r.qmaxX, f.r.qmaxY) / 1000, 2)} / qa ${fmt(f.inp.qa / 1000, 2)} ตัน/ม.²` : `${fmt(f.r.Ptmax / 1000, 2)} / ${fmt(f.r.Pallow / 1000, 2)}`, f.r ? [f.r.longText, f.r.shortText].filter(Boolean).join(" · ") : f.error, pass(f.ok)])} />
          <Note>สรุป: ฐานแผ่ {res.footings.filter((f) => f.kind === "spread").length} ฐาน · ฐานเข็ม 1 ต้น {res.footings.filter((f) => f.n === 1).length} ฐาน · 2 ต้น {res.footings.filter((f) => f.n === 2).length} ฐาน · 3 ต้นขึ้นไป {res.footings.filter((f) => f.n >= 3).length} ฐาน · แรงรวมที่ฐาน {fmt(res.footings.reduce((a, f) => a + f.P, 0) / 1000, 1)} ตัน</Note>
        </Sec>

        <Sec n={++n} th="ตาราง type คานและเสา" en="Beam & column schedules" intro="ขนาดและเหล็กเสริมที่ใช้ ความยาวคานรวมวัดตามแนวศูนย์กลาง ยังไม่รวมระยะทาบและเศษเหล็ก">
          <Table head={["Type", "b × h (ซม.)", "เหล็กบน (+ เสริมหัวเสา L/4 · คานยื่น: ยาวตลอด)", "เหล็กล่าง (+ เสริมกลางคาน 3L/5)", "ปลอก หัวเสา / กลาง", "จำนวน", "ยาวรวม (ม.)"]}
            rows={types.map((t, i) => { const l = spans.filter((s) => s.typeIdx === i && s.kind !== "cantilever"); return [t.name, `${fmt(t.b * 100, 0)} × ${fmt(t.h * 100, 0)}`, bars(t), [t.bot, t.botX && `+ ${t.botX}`].filter(Boolean).join(" "),
              `${stLabel(t)} @${fmt(t.sSup, 2)} / @${fmt(t.sMid, 2)}`, `${l.length} ช่วง`, fmt(l.reduce((s, x) => s + x.len, 0), 2)]; }).flatMap((row, i) => {
                // cantilever variant: same section and support bars, the top bars run the whole cantilever (B1A …)
                const c = spans.filter((s) => s.typeIdx === i && s.kind === "cantilever"), t = types[i];
                return c.length ? [row, [`${t.name}A`, row[1], `${[t.top, t.topX].filter(Boolean).join(" + ")} ยาวตลอดคานยื่น + งอขอ`, t.bot, row[4], `${c.length} ช่วง (คานยื่น)`, fmt(c.reduce((s, x) => s + x.len, 0), 2)]] : [row]; })} />
          <Table head={["Type", "ระดับ", "ขนาด (ซม.)", "เหล็กยืน", "ปลอก", "จำนวน"]}
            rows={colTypes.flatMap((t, i) => t.levels.map((lv) => [t.name, lv.level, `${lv.Bx} × ${lv.By}`, `${lv.n}-${lv.mainBar}`, `${lv.tieBar} @${fmt(lv.s, 2)}`, `${res.columns.filter((c) => c.typeIdx === i && c.lv === lv).length} ต้น`]))} />
          {/* cantilevers: their own bar run (not the L/4 cut-off of the schedule) — user 2026-11-03 */}
          {(() => { const cs = res.floors.flatMap((an, k) => an.spans.filter((sp) => sp.detail).map((sp) => ({ sp, k }))); return cs.length ? (<>
            <p className="mt-3 font-semibold text-gray-800">คานยื่น — เหล็กบนยาวตลอดคานยื่น งอขอที่ปลาย และฝากเข้าช่วงหลัง (แทนเหล็กเสริม L/4 ในตาราง)</p>
            <Table head={["ชั้น / ช่วง", "Type", "ยื่น (ม.)", "เหล็กบน", "ld (ม.)", "ฝากเข้าช่วงหลัง", "หมายเหตุ"]}
              rows={cs.map(({ sp, k }) => [`${floors[k].name} ${sp.id}`, sp.typeName, fmt(sp.len, 2), `${sp.detail.bars} ยาวตลอด`, fmt(sp.detail.ld, 2),
                sp.detail.noBack ? "ฝังในเสา ≥ ld + งอขอ" : sp.detail.through ? `ตลอดช่วง ${sp.detail.back}` : `${fmt(sp.detail.ext, 2)} ม. (ช่วง ${sp.detail.back})`,
                sp.detail.noBack ? "ไม่มีช่วงหลัง" : sp.detail.through ? "ช่วงหลังสั้นกว่าระยะฝาก" : ""])} />
            <Note>ld = 1.4 × max(0.06·Ab·fy/√f'c, 0.006·db·fy) (เหล็กบน, วิธีหน่วยแรงใช้งาน ว.ส.ท. / ACI 318) · ระยะฝาก = max(ความยาวคานยื่น, ld)</Note>
            <div className="grid grid-cols-2 gap-2">{[...new Map(cs.map(({ sp }) => [`${sp.type.name}|${fmt(sp.len, 2)}|${sp.detail.through}|${sp.detail.noBack}`, sp])).values()].map((sp) => (
              <Figure key={sp.id} caption={`คานยื่น ${sp.id} (${sp.typeName})`}><CantileverDetail d={sp.detail} t={sp.type} L={sp.len} id={sp.id} /></Figure>))}</div>
          </>) : null; })()}
          {/* reinforcement sections of every beam type (support / mid-span) and column level in use */}
          <p className="mt-3 font-semibold text-gray-800">รูปตัดเหล็กเสริมคาน (ซ้าย: ช่วงหัวเสา · ขวา: ช่วงกลางคาน)</p>
          <div className="grid grid-cols-4 gap-2">
            {types.filter((_, i) => spans.some((sp) => sp.typeIdx === i)).flatMap((t) => {
              const L = (main, special) => barLayers(t.b, mat, t.st, parseBars(main), parseBars(special));
              return [["หัวเสา", L(t.top, t.topX), L(t.bot)], ["กลางคาน", L(t.top), L(t.bot, t.botX)]].map(([where, top, bottom]) => (
                <Figure key={`${t.name}${where}`} caption={`${t.name} ${where} · ${stLabel(t)} @${fmt(where === "หัวเสา" ? t.sSup : t.sMid, 2)}`}>
                  <Drawing model={beamSectionModel({ b: t.b, h: t.h, cover: mat.cover, stirrupBar: t.st, top, bottom })} className="mx-auto h-[38mm]" fontSize={8} width={150} />
                </Figure>
              ));
            })}
          </div>
          <p className="mt-3 font-semibold text-gray-800">รูปตัดเหล็กเสริมเสา</p>
          <div className="grid grid-cols-4 gap-2">
            {colTypes.flatMap((t, i) => t.levels.filter((lv) => res.columns.some((c) => c.typeIdx === i && c.lv === lv)).map((lv) => { const [nx, ny] = faceBars(lv.n);
              return (
                <Figure key={`${t.name}${lv.level}`} caption={`${t.name} ${lv.level} · ${lv.n}-${lv.mainBar} · ${lv.tieBar} @${fmt(lv.s, 2)}`}>
                  <Drawing model={columnSectionModel({ Bx: lv.Bx, By: lv.By, cover: mat.coverCol ?? mat.cover, tieD: SLAB_BARS[lv.tieBar]?.d ?? 0.6, barD: SLAB_BARS[lv.mainBar]?.d ?? 1.2, nx, ny })} className="mx-auto h-[38mm]" fontSize={8} width={150} />
                </Figure>
              ); }))}
          </div>
        </Sec>
      </Doc>
    </div>
  );
}
