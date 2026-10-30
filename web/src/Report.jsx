import { BEAM_TYPES, GRADES } from "../engine/tables.js";
import Drawing from "./Drawing.jsx";
import ForceCharts from "./ForceCharts.jsx";
import { beamSectionModel } from "./drawings.js";
import { barText, fmt, sectionOk } from "./beamModel.js";
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";

const TYPE_TH = { simple: "คานช่วงเดียวปลายหมุน", one_end: "คานต่อเนื่องปลายเดียว", both_ends: "คานต่อเนื่องสองปลาย", cantilever: "คานยื่น" };
const FORMULA = {
  simple: ["wL²/8", "0", "wL/2"], one_end: ["9wL²/128", "wL²/8", "5wL/8"],
  both_ends: ["wL²/24", "wL²/12", "wL/2"], cantilever: ["0", "wL²/2", "wL"],
};
const bars = (layers) => layers.map(barText).filter(Boolean).join(" / ") || "-";

function SectionSec({ n, th, st, res, sec }) {
  const { r, inp } = res;
  if (!r) return null;
  const b = st[sec];
  const neg = inp.tensionAtTop;
  return (
    <Sec n={n} th={th} en={sec === "mid" ? "Middle section" : "Support section"}
      intro={`ตรวจกำลังรับโมเมนต์${neg ? "ลบ (ผิวบนรับแรงดึง)" : "บวก (ผิวล่างรับแรงดึง)"} ของหน้าตัด: ถ้ากำลังของคอนกรีต Mc มากกว่าโมเมนต์ที่กระทำ ใช้เหล็กรับแรงดึงอย่างเดียว ถ้าน้อยกว่าต้องเสริมเหล็กรับแรงอัดเพิ่ม (หน้าตัดเสริมเหล็กสองชั้น)`}>
      <div className="grid grid-cols-[1fr_44mm] gap-3">
        <div>
          <Item th="โมเมนต์ออกแบบ" f={`M${neg ? "−" : "+"}`} v={fmt(inp.M)} u="กก.-ม." />
          <Item th="ความลึกประสิทธิผล" f="d = h − ระยะถึงศูนย์กลางเหล็กดึง" v={fmt(r.d)} u="ซม." />
          <Item th="กำลังรับโมเมนต์ของคอนกรีต" f={`Mc = R·b·d²${r.narrow ? " × (1.75 − L/40b)" : ""}`} v={fmt(r.Mc)} u="กก.-ม."
            note={r.mode === "singly" ? "Mc > M → ใช้เหล็กรับแรงดึงอย่างเดียว" : "Mc < M → ต้องใช้เหล็กรับแรงอัดช่วย"} />
          {r.mode === "singly" ? (
            <Item th="เหล็กรับแรงดึงที่ต้องการ" f="As = M / (fs·j·d)" v={fmt(r.As)} u="ซม.²" />
          ) : (
            <>
              <Item th="เหล็กส่วนที่ 1 (คู่กับ Mc)" f="As1 = Mc / (fs·j·d)" v={fmt(r.As1)} u="ซม.²" />
              <Item th="เหล็กส่วนที่ 2 (ส่วนที่เกิน Mc)" f="As2 = (M − Mc) / (fs·(d − d'))" v={fmt(r.As2)} u="ซม.²" />
              <Item th="หน่วยแรงในเหล็กรับแรงอัด" f="fs' = 2fs(k − d'/d)/(1 − k) ≤ fs" v={fmt(r.fsPrime)} u="กก./ซม.²" />
              <Item th="เหล็กรับแรงอัดที่ต้องการ" f="As' = (M − Mc) / (fs'·(d − d'))" v={fmt(r.AsPrime)} u="ซม.²"
                ok={r.doublyCheck === "OK"} note={r.doublyCheck === "STEEL_BEAM" ? "As − As' < 0.25 ซม.² ควรออกแบบเป็นคานเหล็ก" : undefined} />
            </>
          )}
          <Item th="เหล็กเสริมน้อยที่สุด" f="As,min = (14/fy)·b·d" v={fmt(r.AsMin)} u="ซม.²" ok={r.AsMinOk} />
          {r.Ast > 0 && <Item th="เหล็กรับแรงบิดตามยาว (ต่อด้าน)" f="2·Ast" v={fmt(2 * r.Ast)} u="ซม.²" />}
          <Item th={`เหล็กรับแรงดึง (${neg ? "บน" : "ล่าง"}) ต้องการ / ใส่จริง`} v={`${fmt(r.reqBot)} / ${fmt(r.provBot)}`} u="ซม.²" ok={r.botOk} />
          <Item th={`เหล็กรับแรงอัด (${neg ? "ล่าง" : "บน"}) ต้องการ / ใส่จริง`} v={`${fmt(r.reqTop)} / ${fmt(r.provTop)}`} u="ซม.²" ok={r.topOk} />
          <Item th="เหล็กที่ใช้ — บน" v={bars(b.top)} />
          <Item th="เหล็กที่ใช้ — ล่าง" v={bars(b.bottom)} />
        </div>
        <Figure caption={`หน้าตัด ${st.geom.b * 100} × ${st.geom.h * 100} ซม. — ${sectionOk(r) ? "ผ่าน" : "ไม่ผ่าน"}`}>
          <Drawing model={beamSectionModel({ b: st.geom.b, h: st.geom.h, cover: st.mat.cover, stirrupBar: st.stirrup.bar,
            top: b.top, bottom: b.bottom, showText: false })} className="h-[56mm]" fontSize={13} width={200} />
        </Figure>
      </div>
    </Sec>
  );
}

export default function Report({ st, res, forces, fns }) {
  const r = res.mid.r ?? res.sup.r;
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const { mat, geom, loads, stirrup } = st;
  const s = res.sup.r ?? r;
  const both = res.mid.r && res.sup.r && sectionOk(res.mid.r) && sectionOk(res.sup.r);
  return (
    <div className="report">
      <Doc project={st.project} title="รายการคำนวณออกแบบคานคอนกรีตเสริมเหล็ก" subtitle="Reinforced concrete beam design — Working Stress Design (WSD)"
        memberLabel="คาน" member={st.project.beamNo}
        summary={[
          ["ชนิดคาน / ขนาด", `${TYPE_TH[geom.type]} ${geom.b * 100}×${geom.h * 100} ซม.`],
          ["ช่วงคาน", `${geom.L} ม.`],
          ["เหล็กกลางช่วง (ล่าง)", bars(st.mid.bottom), res.mid.r && sectionOk(res.mid.r)],
          ["เหล็กที่จุดรองรับ (บน)", bars(st.sup.top), res.sup.r && sectionOk(res.sup.r)],
          ["เหล็กปลอก", `${stirrup.sets}-${stirrup.bar} @ ${stirrup.sSup} / ${stirrup.sMid} ม.`],
          ["ผลการตรวจสอบรวม", both ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", both],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบและแรงที่กระทำ" en="Design data & forces"
          intro={forces.derived
            ? `คานรับน้ำหนักแผ่สม่ำเสมอ w (รวมน้ำหนักพื้น ผนัง และน้ำหนักจรที่ถ่ายลงคาน) หาโมเมนต์และแรงเฉือนสูงสุดด้วยสูตรมาตรฐานของ${TYPE_TH[geom.type]}`
            : "ใช้ค่าโมเมนต์และแรงเฉือนที่ผู้ออกแบบกำหนดจากการวิเคราะห์โครงสร้าง แผนภาพด้านล่างคำนวณจากน้ำหนักแผ่เทียบเท่า"}>
          <Item th="ชนิดของคาน" v={TYPE_TH[geom.type]} />
          <Item th="ขนาดหน้าตัด (กว้าง × ลึก)" f="b × h" v={`${geom.b * 100} × ${geom.h * 100}`} u="ซม." />
          <Item th="ความยาวช่วงคาน" f="L" v={fmt(geom.L)} u="ม." />
          <Item th="น้ำหนักคานเอง" f="b·h·2,400" v={fmt(geom.b * geom.h * 2400)} u="กก./ม." />
          {forces.derived && <Item th="น้ำหนักแผ่สม่ำเสมอ" f="w" v={fmt(forces.w)} u="กก./ม." />}
          <Item th="โมเมนต์บวกกลางช่วง" f={forces.derived ? `M+ = ${FORMULA[geom.type][0]}` : "M+"} v={fmt(forces.Mmid)} u="กก.-ม." />
          <Item th="โมเมนต์ลบที่จุดรองรับ" f={forces.derived ? `M− = ${FORMULA[geom.type][1]}` : "M−"} v={fmt(forces.Msup)} u="กก.-ม." />
          <Item th="แรงเฉือนสูงสุด" f={forces.derived ? `V = ${FORMULA[geom.type][2]}` : "V"} v={fmt(forces.V)} u="กก." />
          <Item th="โมเมนต์บิด" f="Mt" v={fmt(loads.Mt)} u="กก.-ม." />
          <Figure caption={`แผนภาพแรงเฉือน V (บน) และโมเมนต์ดัด M (ล่าง)${forces.derived ? "" : ` — น้ำหนักแผ่เทียบเท่า ${fmt(forces.w)} กก./ม.`}`}>
            <ForceCharts L={geom.L} fns={fns} width={640} height={280} animate={false} />
          </Figure>
        </Sec>

        <Sec n={2} th="คุณสมบัติวัสดุและค่าคงที่ในการออกแบบ" en="Materials & design constants"
          intro="วิธีหน่วยแรงใช้งาน (WSD) จำกัดหน่วยแรงในคอนกรีตและเหล็กไม่ให้เกินค่าที่ยอมให้ แล้วใช้ค่าคงที่ n, k, j, R หาเหล็กเสริมที่ต้องการ">
          <Item th="กำลังอัดประลัยคอนกรีต (ทรงกระบอก 28 วัน)" f="f'c" v={fmt(mat.fcPrime, 0)} u="กก./ซม.²" />
          <Item th="หน่วยแรงอัดที่ยอมให้ของคอนกรีต" f={`fc = ${mat.F}·f'c${mat.capFc ? " ≤ 65" : ""}`} v={fmt(r.fc)} u="กก./ซม.²"
            note={mat.capFc ? "ไม่เกิน 65 กก./ซม.² ตามกฎกระทรวงฯ" : undefined} />
          <Item th={`เหล็กยืน ${GRADES[mat.fy]}: fy / หน่วยแรงที่ยอมให้`} f="fs" v={`${fmt(mat.fy, 0)} / ${fmt(r.fs, 0)}`} u="กก./ซม.²" />
          <Item th={`เหล็กปลอก ${GRADES[mat.fys]}: fy / หน่วยแรงที่ยอมให้`} f="fv" v={`${fmt(mat.fys, 0)} / ${fmt(r.fsv, 0)}`} u="กก./ซม.²" />
          <Item th="โมดูลัสยืดหยุ่นคอนกรีต" f="Ec = 4,270·w^1.5·√f'c" v={fmt(r.Ec, 0)} u="กก./ซม.²" />
          <Item th="อัตราส่วนโมดูลัส" f="n = Es / Ec" v={fmt(r.n)} ok={r.nOk} note="ต้องไม่น้อยกว่า 6" />
          <Item th="ตำแหน่งแกนสะเทิน (สัดส่วน)" f="k = 1 / (1 + fs/(n·fc))" v={fmt(r.k, 4)} />
          <Item th="แขนของโมเมนต์ (สัดส่วน)" f="j = 1 − k/3" v={fmt(r.j, 4)} />
          <Item th="ค่าต้านทานโมเมนต์" f="R = ½·fc·k·j" v={fmt(r.R, 3)} u="กก./ซม.²" />
          <Item th="ระยะคอนกรีตหุ้มเหล็ก" v={fmt(mat.cover, 1)} u="ซม." />
        </Sec>

        <Sec n={3} th="ตรวจสอบขนาดหน้าตัด" en="Section checks"
          intro="ตรวจว่าคานลึกพอไม่ให้แอ่นตัวมากเกินไป ไม่เป็นคานลึก และไม่แคบเกินไปจนอาจบิดเสียรูปทางข้าง">
          <Item th="ความลึกน้อยที่สุดที่ไม่ต้องตรวจการแอ่นตัว" f={`L/${BEAM_TYPES[geom.type].minDepthDiv}${mat.fy < 4000 ? "·(0.4 + fy/7,000)" : ""}`}
            v={fmt(r.minDepth, 3)} u="ม." ok={r.minDepthOk} />
          <Item th="ตรวจคานลึก" f={`h/L ≤ ${r.deepLimit}`} v={fmt(r.deepRatio)} ok={r.deepOk} />
          <Item th="ตรวจคานแคบ (การยึดทางข้าง)" f="L/b ≤ 30" v={fmt(r.LbRatio, 1)} ok={!r.narrow}
            note={r.narrow ? "เกิน 30 → ลดกำลังรับโมเมนต์ด้วยตัวคูณ (1.75 − L/40b)" : undefined} />
        </Sec>

        <SectionSec n={4} th="ออกแบบเหล็กเสริมหน้าตัดกลางช่วง" st={st} res={res.mid} sec="mid" />
        <SectionSec n={5} th="ออกแบบเหล็กเสริมหน้าตัดที่จุดรองรับ" st={st} res={res.sup} sec="sup" />

        <Sec n={6} th="ตรวจสอบแรงเฉือน แรงบิด และเหล็กปลอก" en="Shear, torsion & stirrups"
          intro="คอนกรีตรับแรงเฉือนได้ส่วนหนึ่ง (Vc) ส่วนที่เกินให้เหล็กปลอกรับ แรงบิดต้องการเหล็กปลอกเพิ่มและเหล็กตามยาวที่มุมหน้าตัด">
          <Item th="แรงเฉือนที่คอนกรีตรับได้" f="Vc = 0.29·√f'c·b·d" v={fmt(s.Vc)} u="กก." />
          <Item th="แรงเฉือนส่วนที่เหล็กปลอกต้องรับ" f="V' = V − Vc ≤ 1.32√f'c·b·d" v={fmt(s.Vp)} u="กก." ok={s.VpOk}
            note={s.VpOk ? undefined : "เกินขีดจำกัด ต้องขยายหน้าตัดคาน"} />
          <Item th="เหล็กปลอกรับแรงเฉือนต่อระยะ" f="Av/s = V' / (fv·d)" v={fmt(s.AvS, 4)} u="ซม.²/ซม." />
          {loads.Mt > 0 && <>
            <Item th="หน่วยแรงบิด" f="vt = 3.5·Mt / (h·b²) ≤ 1.32√f'c" v={fmt(s.vt, 3)} u="กก./ซม.²" ok={s.vtOk} />
            <Item th="หน่วยแรงรวม (เฉือน + บิด)" f="v = vt + V/(b·h) ≤ 1.65√f'c" v={fmt(s.v, 3)} u="กก./ซม.²" ok={s.vOk} />
            <Item th="เหล็กปลอกรับแรงบิดต่อระยะ" f="At/s = Mt / (Ac·fv)" v={fmt(s.AtS, 4)} u="ซม.²/ซม." />
          </>}
          <Item th="เหล็กปลอกที่ต้องการรวม" f="A/s = Av/s + At/s" v={fmt(s.AtotS, 4)} u="ซม.²/ซม." />
          <Item th="พื้นที่เหล็กปลอกที่ใส่ (2 ขา × จำนวนชุด)" v={fmt(s.Aact)} u="ซม.²" />
          <Item th="พื้นที่เหล็กปลอกน้อยที่สุด" f="Av,min = 0.0015·b·s" v={fmt(s.Amin)} u="ซม.²" ok={s.AminOk} />
          <Item th="ระยะเรียงเหล็กปลอกสูงสุด" f="≤ d/2 หรือ d/4 ตามแรงเฉือน" v={typeof s.sMax === "number" ? fmt(s.sMax) : "-"} u="ม." />
          <Item th="เหล็กปลอกที่ใช้ (ช่วงริม / ช่วงกลาง)" v={`${stirrup.sets}-${stirrup.bar} @ ${stirrup.sSup} / ${stirrup.sMid}`} u="ม."
            ok={res.mid.r?.stirrup !== "CHECK_SPACING" && s.stirrup !== "CHECK_SPACING"} />
          {s.sideBarsAdvised && <Note>คานลึกตั้งแต่ 80 ซม. ควรเสริมเหล็กข้างคาน (skin reinforcement) ที่ช่วงกลางความลึก</Note>}
        </Sec>
      </Doc>
    </div>
  );
}
