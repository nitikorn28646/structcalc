// Thai calculation report for the steel roof: geometry, loads, member-by-member ASD checks, framing plan and schedule.
import { Doc, Sub, Figure, Item, Note, Sec, SummaryBox } from "./ReportKit.jsx";
import { MemberDiagram } from "./ReportDiagrams.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { plateModel, plateText, roofPlanModel } from "./drawings.js";
import { platesOf } from "./PlateView.jsx";
import { ROOFINGS } from "../engine/roofMembers.js";
import { SECTION_TYPES, SYM } from "../engine/steelSections.js";
import { runRoof, useSkeleton } from "./RoofPage.jsx";

const ksc = "กก./ซม.²";
const secText = (x) => (x.r.section.type === "BAT" ? `${x.r.section.name} @${fmt(x.r.s, 2)} ม.` : `${x.count > 1 ? "2-" : ""}${SYM[x.r.section.type] ?? ""} ${x.r.section.name} มม.`);

// Schedule lines: one per group, split by section where spans of a group use different sizes.
function schedule(dz) {
  return dz.rows.flatMap((x) => {
    if (!x.members || !x.mixed) return [{ ...x, key: x.key }];
    const by = new Map();
    for (const m of x.members) {
      const k = `${m.count}|${m.r.section.type}|${m.r.section.name}`, e = by.get(k) ?? { key: `${x.key}-${k}`, label: x.label, count: m.count, r: m.r, len: 0, weight: 0, ok: true };
      e.len += m.len; e.weight += m.weight; e.ok &&= m.r.ok; by.set(k, e);
    }
    return [...by.values()];
  });
}

// stress and deflection items shared by all bending members
function Bending({ x, f }) {
  const r = x.r, k = x.count > 1 ? "2·" : "";
  return (<>
    <Item th="หน้าตัดที่ใช้" v={secText(x)} note={`${SECTION_TYPES[r.section.type]} · Ix ${fmt(r.section.Ix, 1)} ซม.⁴ · Sx ${fmt(r.section.Sx, 2)} ซม.³ · ${fmt(r.section.w, 2)} กก./ม.`} />
    <Item th="โมดูลัสหน้าตัดที่ต้องการ" f="Sx = M / Fb" v={fmt(r.SxReq, 2)} u="ซม.³" ok={r.SxReq <= (x.count || 1) * r.section.Sx} />
    <Item th="หน่วยแรงดัดที่เกิดขึ้น" f={f ?? `fb = M / ${k}Sx`} v={`${fmt(r.fb, 0)} ≤ ${fmt(r.Fb, 0)}`} u={ksc} ok={r.fb <= r.Fb} />
    <Item th="ระยะแอ่นตัว" f={r.mode ? `Δ ≤ L/${Math.round((r.Ld * 100) / r.dAllow)}` : "Δ ≤ L/360"} v={`${fmt(r.d ?? r.dy, 3)} ≤ ${fmt(r.dAllow ?? r.dyAllow, 3)}`} u="ซม." ok={(r.d ?? r.dy) <= (r.dAllow ?? r.dyAllow)} />
  </>);
}

export function RoofReport({ roof, project , bare = false, nb = null }) {
  const sk = useSkeleton(), { g, fr, dz } = runRoof(roof, sk);
  if (!sk) return bare ? <div data-report-loading="1" /> : <div className="report" data-report-loading="1" />;
  if (!dz) return bare ? null : <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const d = roof.design, row = (k) => dz.rows.find((x) => x.key === k), pu = row("purlin"), ra = row("rafter");
  const roofing = ROOFINGS[d.roofing];
  // inside the whole-project book: one chapter (nb), sections nb.1, nb.2 … on from its first page
  const Wrap = bare ? ({ children }) => <>{children}</> : ({ children }) => <div className="report">{children}</div>;
  const roofSummary = [
          ["รูปทรง / ความชัน", `${roof.edges.some((e) => e.type === "gable") ? "ปั้นหยาผสมจั่ว" : "ปั้นหยา"} · ${roof.slope}°`],
          ["พื้นที่มุงจริง", `${fmt(g.roofArea, 2)} ม.²`],
          ["วัสดุมุง", `${roofing[0]} (${roofing[1]} กก./ม.²)`],
          ["แป / จันทัน", `${pu.r.section.name} / ${ra.r.section.name}`],
          ["น้ำหนักโครงเหล็กรวม", `${fmt(dz.weight, 0)} กก. (${fmt(dz.weight / g.roofArea, 2)} กก./ม.²)`],
          ["ผลการตรวจสอบรวม", dz.ok ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", dz.ok],
        ];
  const sn = (i) => (nb ? `${nb}.${i}` : i);
  return (
    <Wrap>
      <Doc bare={bare} project={project} title="รายการคำนวณออกแบบโครงหลังคาเหล็ก" subtitle="Steel roof framing design — Allowable Stress Design (ASD)"
        memberLabel="หลังคา" member={roof.roofNo} method="ASD" standard="วิธีหน่วยแรงที่ยอมให้ (ASD) ตาม AISC / ว.ส.ท. มาตรฐานโครงสร้างเหล็ก"
        summary={bare ? null : roofSummary}>
        <Sec n={sn(1)} id="c-roof" th="รูปทรงหลังคาและน้ำหนักบรรทุก" en="Geometry & loads"
          intro="รูปทรงหลังคาสร้างจากแนวผนัง (อะเส) และระยะชายคา โดยทุกด้านของหลังคามีความชันเท่ากัน ด้านที่เป็นจั่วจะตั้งเป็นผนังหน้าจั่ว น้ำหนักบรรทุกคิดต่อพื้นที่ตามแนวเอียงของหลังคา">
          {bare && <SummaryBox summary={roofSummary} />}
          <Item th="ความชันหลังคา" f="θ" v={fmt(roof.slope, 1)} u="องศา" />
          <Item th="ระยะชายคายื่น / ระดับอะเส" v={`${fmt(roof.overhang)} / ${fmt(roof.H)}`} u="ม." />
          <Item th="พื้นที่ใต้หลังคา / พื้นที่มุงจริง" f="A / cosθ" v={`${fmt(g.planArea, 2)} / ${fmt(g.roofArea, 2)}`} u="ม.²" />
          <Item th="ความยาวอกไก่ / ตะเข้สัน / ตะเข้ราง" v={`${fmt(g.ridge, 2)} / ${fmt(g.hip, 2)} / ${fmt(g.valley, 2)}`} u="ม." />
          <Item th="น้ำหนักวัสดุมุง" v={fmt(roofing[1], 0)} u="กก./ม.²" note={roofing[0]} />
          <Item th="น้ำหนักจร / น้ำหนักอื่นๆ" v={`${fmt(d.live, 0)} / ${fmt(d.extra, 0)}`} u="กก./ม.²" />
          <Item th="แรงลม" f="q = p·2sinθ/(1+sin²θ)" v={fmt(d.wind, 0)} u="กก./ม.²"
            note="แรงลมตั้งฉากกับผิวหลังคา เมื่อรวมแรงลมใช้ 75% ของผลรวม (เทียบเท่าเพิ่มหน่วยแรงยอมให้ 1/3)" />
          <Item th={`เหล็ก ${d.grade}: Fy / Fb = 0.6Fy`} v={`${fmt(row("purlin").r.Fb / 0.6, 0)} / ${fmt(row("purlin").r.Fb, 0)}`} u={ksc} />
        </Sec>

        <Sec n={sn(2)} chapter={!bare} th="แปลนโครงหลังคา" en="Roof framing plan"
          intro="แปวางขนานชายคาตามระยะตามแนวเอียง จันทันวางตั้งฉากกับชายคาไปชนอกไก่หรือตะเข้ สะพานรับจันทันวางให้ช่วงจันทันไม่เกินค่าที่กำหนด และมีดั้ง/ตุ๊กตารับ">
          <Figure caption={`แปลนโครงหลังคา — แป @${fmt(roof.frame.purlinSp)} ม. · จันทัน @${fmt(roof.frame.rafterSp)} ม. · สะพาน ${fr.supports.length} เส้น · ดั้ง/ตุ๊กตา ${fr.posts.length} ต้น`}>
            <Drawing model={roofPlanModel(g, fr)} className="mx-auto h-[120mm]" fontSize={9} width={640} />
          </Figure>
        </Sec>

        {pu.r.batten ? (
          <Sec n={sn(3)} chapter={!bare} th="แปสำเร็จรูป" en="Roof battens"
            intro="หลังคากระเบื้องคอนกรีต/เซรามิกใช้แปสำเร็จรูป (เหล็กรีดขึ้นรูปเคลือบกันสนิม) วางตามระยะซ้อนทับของกระเบื้อง ขนาดและความหนาเลือกตามตารางของผู้ผลิตกระเบื้องและแป">
            <Item th="ระยะแป (ตามแนวเอียง)" f="0.30 – 0.33 ม." v={fmt(pu.r.s, 2)} u="ม." ok={pu.r.ok} />
            <Item th="ช่วงแป (ระยะจันทัน)" v={fmt(roof.frame.rafterSp, 2)} u="ม." note="ตรวจกับช่วงสูงสุดที่ผู้ผลิตแปกำหนด" />
            <Item th="น้ำหนักแปที่ใช้คำนวณจันทัน" v={fmt(pu.r.section.w, 2)} u="กก./ม." />
          </Sec>
        ) : (        <Sec n={sn(3)} chapter={!bare} th="แป" en="Purlin"
          intro={`แปเป็นคานต่อเนื่องพาดบนจันทัน ช่วง ${fmt(roof.frame.rafterSp)} ม. ใช้โมเมนต์ wL²/9 รับน้ำหนักตั้งฉากกับหลังคา (แกนแข็ง) และน้ำหนักตามแนวลาด (แกนอ่อน) ${d.sagRows ? `โดยมีเหล็กยึดแป ${d.sagRows} แถวช่วยลดช่วงแกนอ่อน` : ""}`}>
          <Item th="น้ำหนักแผ่ต่อแป" f="Wg = (มุง + จร + อื่นๆ)·s + น้ำหนักแป" v={fmt(pu.r.Wg)} u="กก./ม." />
          <Item th="น้ำหนักตั้งฉากหลังคา / ตามแนวลาด" f="Wy / Wx = Wg·sinθ" v={`${fmt(pu.r.Wy)} / ${fmt(pu.r.Wx)}`} u="กก./ม." />
          <Item th="โมเมนต์แกนแข็ง / แกนอ่อน" f="Mx = Wy·L²/9 , My = Wx·Ly²/9" v={`${fmt(pu.r.Mx)} / ${fmt(pu.r.My)}`} u="กก.-ม." />
          <Bending x={pu} f="fb = Mx/Sx + My/Sy" />
          <Figure caption={`แปต่อเนื่อง 3 ช่วง ช่วงละ ${fmt(roof.frame.rafterSp)} ม. รับ Wy = ${fmt(pu.r.Wy)} กก./ม. — รูปประกอบ (ออกแบบใช้ wL²/9 ซึ่งมากกว่า wL²/10 ของรูป)`}>
            <MemberDiagram x={[0, 1, 2, 3].map((k) => k * roof.frame.rafterSp)} sup={[true, true, true, true]} loads={[{ a: 0, b: 3 * roof.frame.rafterSp, wa: pu.r.Wy, wb: pu.r.Wy }]} />
          </Figure>
          <Item th="ระยะแอ่นแกนอ่อน" f="Δx ≤ Ly/360" v={`${fmt(pu.r.dx, 3)} ≤ ${fmt(pu.r.dxAllow, 3)}`} u="ซม." ok={pu.r.dx <= pu.r.dxAllow} />
          {pu.r.T !== undefined && <Item th="แรงดึงในเหล็กยึดแป" f="T = (น้ำหนักแผ่ + น้ำหนักแป)·sinθ" v={fmt(pu.r.T, 0)} u="กก."
            note={`As ต้องการ ${fmt(pu.r.AsReq, 3)} ซม.² → ใช้ RB 9 (0.636 ซม.²)`} ok={pu.r.AsReq <= 0.636} />}
        </Sec>
        )}

        <Sec n={sn(4)} chapter={!bare} th="จันทัน" en="Rafter"
          intro="จันทันคิดเป็นคานช่วงเดี่ยวมีปลายยื่น รับน้ำหนักจากแปเป็นน้ำหนักแผ่ ใช้ช่วงระหว่างจุดรองรับที่ยาวที่สุดร่วมกับระยะยื่นชายคาที่ยาวที่สุด">
          <Item th="ช่วงจันทัน / ระยะยื่น (ตามแนวเอียง)" f="L / a" v={`${fmt(ra.r.L)} / ${fmt(ra.r.a)}`} u="ม." />
          <Item th="น้ำหนักแผ่บนจันทัน" f="w = Wy·D/s + น้ำหนักจันทัน·cosθ" v={fmt(ra.r.w)} u="กก./ม." />
          <Item th="โมเมนต์ในช่วง / ที่ปลายยื่น" f="w(L+a)²(L−a)²/8L² , wa²/2" v={`${fmt(ra.r.Mspan)} / ${fmt(ra.r.Mcant)}`} u="กก.-ม." />
          <Bending x={ra} f="fb = Mx/Sx + My/Sy" />
          <Item th="แรงปฏิกิริยาที่อะเส / ที่ปลายบน" v={`${fmt(ra.r.Rwall)} / ${fmt(ra.r.Rridge)}`} u="กก." />
          <Figure caption={`จันทัน: ยื่น ${fmt(ra.r.a)} ม. + ช่วง ${fmt(ra.r.L)} ม. (ตามแนวเอียง) รับ w = ${fmt(ra.r.w)} กก./ม.`}>
            <MemberDiagram x={ra.r.a > 0.01 ? [0, ra.r.a, ra.r.a + ra.r.L] : [0, ra.r.L]} sup={ra.r.a > 0.01 ? [false, true, true] : [true, true]} loads={[{ a: 0, b: ra.r.a + ra.r.L, wa: ra.r.w, wb: ra.r.w }]} />
          </Figure>
        </Sec>

        <Sec n={sn(5)} chapter={!bare} th="ตะเข้ อกไก่ และสะพานรับจันทัน" en="Hips, ridge & rafter supports"
          intro="ชิ้นส่วนเหล่านี้รับแรงปฏิกิริยาจากจันทันเป็นน้ำหนักแผ่ต่อเมตร ตะเข้คิดเป็นคานมีปลายยื่น ส่วนอกไก่ สะพาน และอะเส คิดเป็นคานช่วงเดี่ยว wL²/8 ระหว่างดั้ง/ตุ๊กตา/เสา">
          {dz.rows.filter((x) => ["hip", "valley", "ridge", "support"].includes(x.key)).map((x) => (
            <div key={x.key} className="mb-2">
              <Sub>{x.label} — ช่วง {fmt(x.span)} ม.</Sub>
              <Item th="น้ำหนักแผ่ (รวมน้ำหนักตัวเอง)" f="w" v={fmt(x.r.w)} u="กก./ม." />
              <Item th="โมเมนต์สูงสุด" f={x.key === "hip" || x.key === "valley" ? "max(Mช่วง, Mยื่น)" : "M = wL²/8"} v={fmt(x.r.Mx)} u="กก.-ม." />
              <Bending x={x} />
              {x.members.length > 1 && (
                <table className="mt-1 w-full border-collapse text-[9pt]">
                  <thead><tr className="border-b border-gray-300 text-left">{["ช่วง", "ยาว (ม.)", "หน้าตัด", "M (กก.-ม.)", "fb/Fb", "Δ/Δall", "ผล"].map((h) => <th key={h} className="py-0.5 pr-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{x.members.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100">
                      <td className="py-0.5 pr-2">{m.label}</td><td className="pr-2 tabular-nums">{fmt(m.span, 2)}</td><td className="pr-2">{secText(m)}</td>
                      <td className="pr-2 tabular-nums">{fmt(m.r.Mx, 1)}</td><td className="pr-2 tabular-nums">{fmt(m.stress * 100, 0)}%</td>
                      <td className="pr-2 tabular-nums">{fmt(m.defl * 100, 0)}%</td><td>{m.r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                    </tr>))}</tbody>
                </table>
              )}
            </div>
          ))}
        </Sec>

        {(() => {
          const { plates, sizes } = platesOf(dz), wall = plates.find((m) => !m.inner), inner = plates.filter((m) => m.inner);
          return (
            <Sec n={sn(6)} chapter={!bare} th="อะเส" en="Wall plate"
              intro={`อะเสวางบนหัวผนังรับแรงปฏิกิริยาจากจันทัน ${fmt(wall?.r.w ?? 0)} กก./ม. (รวมน้ำหนักตัวเอง) ${{ beam: `วางบนคาน คสล. ตลอดแนว รับแรงข้ามช่วงระยะพุก ${fmt(roof.design?.plateAnchor ?? 1, 2)} ม. (wL²/8)` }[roof.design?.plateSupport] ?? ((roof.design?.plateSupport ?? "cont") === "cont" ? "คิดเป็นคานต่อเนื่องผ่านเสา วิเคราะห์ด้วยวิธีสติฟเนส (EI คงที่ตลอดแนว) ตรวจโมเมนต์บวกกลางช่วง โมเมนต์ลบที่หัวเสา และระยะแอ่นจริงของแต่ละช่วง แรงปฏิกิริยาลงเสาจากคานต่อเนื่อง (ต้องต่อเชื่อมเหล็กเต็มหน้าตัดและยึดหัวเสาทุกต้น) · แนวที่มีช่วงเดียวคิดเป็นช่วงเดี่ยว wL²/8" : "คิดเป็นคานช่วงเดี่ยว wL²/8 ระหว่างเสา")} ระยะแอ่นตัวไม่เกิน L/${roof.design?.plateDefl === 240 ? 240 : 360} ส่วนอะเสช่วงใน (B…) รับดั้งเป็นแรงจุดจากอกไก่/ตะเข้ แต่ละช่วงเลือกขนาดเหล็กได้เอง แปลนแสดงรหัสช่วง (A1, A2, …) และสีตามขนาดเหล็ก`}>
              <Figure caption={`แปลนอะเส — ${plates.length} ช่วง · ${sizes.map((x) => plateText(x)).join(" / ")}`}>
                <Drawing model={plateModel(g, plates, fr.posts)} className="mx-auto h-[105mm]" fontSize={10} width={640} />
              </Figure>
              <table className="mt-1 w-full border-collapse text-[9pt]">
                <thead><tr className="border-b border-gray-300 text-left">{["ช่วง", "แนวผนัง", "ยาว (ม.)", "หน้าตัด", "M (กก.-ม.)", "fb / Fb (ksc)", "Δ / Δall (ซม.)", "ผล"].map((h) => <th key={h} className="py-0.5 pr-2 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{plates.map((m) => (
                  <tr key={m.id} className="border-b border-gray-100">
                    <td className="py-0.5 pr-2 font-semibold" style={{ color: m.color }}>{m.tag}{m.typeName ? ` (${m.typeName})` : ""}</td><td className="pr-2">{m.inner ? "ช่วงใน (รับดั้ง)" : m.label.replace("อะเส ", "")}</td>
                    <td className="pr-2 tabular-nums">{fmt(m.span, 2)}</td><td className="pr-2">{secText(m)}</td>
                    <td className="pr-2 tabular-nums">{m.r.cont ? `+${fmt(m.r.Mpos, 0)} / −${fmt(m.r.Mneg, 0)}` : fmt(m.r.Mx, 1)}</td><td className="pr-2 tabular-nums">{fmt(m.r.fb, 0)} / {fmt(m.r.Fb, 0)}</td>
                    <td className="pr-2 tabular-nums">{fmt(m.r.d, 2)} / {fmt(m.r.dAllow, 2)}</td><td>{m.r.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                  </tr>))}</tbody>
              </table>
              {(dz.plateLines ?? []).length > 0 && (<>
                <Sub>อะเสต่อเนื่อง — น้ำหนัก แรงเฉือน และโมเมนต์ของแต่ละแนว</Sub>
                <p className="text-[9pt] text-gray-600">น้ำหนักแผ่ = แรงปฏิกิริยาจันทัน + น้ำหนักเหล็กของแต่ละช่วง · แรงจุด = ดั้ง / ตุ๊กตา / อะเสช่วงในที่วางบนแนว · ▲ = เสา · โมเมนต์ลบที่หัวเสาให้ต่อเหล็กเต็มหน้าตัด หรือวางรอยต่อห่างจากเสาประมาณ 0.2 L</p>
                {dz.plateLines.map((ln, i) => (
                  <Figure key={i} caption={`${ln.label} — ช่วง ${ln.tags.join(", ")} · ยาวรวม ${fmt(ln.x[ln.x.length - 1], 2)} ม.`}>
                    <MemberDiagram x={ln.x} sup={ln.sup} loads={ln.loads} />
                  </Figure>))}
              </>)}
              {inner.length > 0 && (<>
                <Sub>อะเสช่วงใน — แรงจุดที่รับและแรงปฏิกิริยา</Sub>
                <p className="text-[9pt] text-gray-600">แรงจุดคือแรงปฏิกิริยาของอกไก่/ตะเข้/สะพานที่ลงดั้งหรือตุ๊กตา และแรงปลายของอะเสช่วงในตัวอื่นที่วางพาด (B…) ระยะวัดจากปลายต้น ·
                  แรงปฏิกิริยาปลายส่งต่อลงเสาหรืออะเสที่รองรับ</p>
                <table className="mt-1 w-full border-collapse text-[9pt]">
                  <thead><tr className="border-b border-gray-300 text-left">{["ช่วง", "ยาว (ม.)", "แรงจุด P @ ระยะ (กก. @ ม.)", "ΣP (กก.)", "R ต้น / ปลาย (กก.)"].map((h) => <th key={h} className="py-0.5 pr-2 font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{inner.map((m) => (
                    <tr key={m.id} className="border-b border-gray-100 align-top">
                      <td className="py-0.5 pr-2 font-semibold" style={{ color: m.color }}>{m.tag}</td><td className="pr-2 tabular-nums">{fmt(m.span, 2)}</td>
                      <td className="pr-2">{m.loads.length ? m.loads.map((l) => `${l.from} ${fmt(l.P, 0)} @ ${fmt(l.a, 2)}`).join(" · ") : "— (น้ำหนักตัวเองเท่านั้น)"}</td>
                      <td className="pr-2 tabular-nums">{fmt(m.r.P, 0)}</td><td className="pr-2 tabular-nums">{fmt(m.r.Rl, 0)} / {fmt(m.r.Rr, 0)}</td>
                    </tr>))}</tbody>
                </table>
              </>)}
            </Sec>
          );
        })()}
        {row("post") && (
          <Sec n={sn(7)} chapter={!bare} th="ดั้งและตุ๊กตา" en="Posts" intro="ดั้ง/ตุ๊กตารับแรงอัดจากอกไก่และสะพาน ตรวจหน่วยแรงอัดยอมให้ตามสูตรเสาของ AISC (K = 1) และอัตราส่วนความชะลูดไม่เกิน 200">
            <Item th="หน้าตัดที่ใช้" v={secText(row("post"))} />
            <Item th="ความสูงมากที่สุด / แรงอัด" v={`${fmt(row("post").span)} ม. / ${fmt(row("post").r.P, 0)} กก.`} />
            <Item th="อัตราส่วนความชะลูด" f="KL/r ≤ 200" v={fmt(row("post").r.KLr, 1)} ok={row("post").r.KLr <= 200} />
            <Item th="หน่วยแรงอัด" f="fa = P/A ≤ Fa" v={`${fmt(row("post").r.fa, 1)} ≤ ${fmt(row("post").r.Fa, 0)}`} u={ksc} ok={row("post").r.fa <= row("post").r.Fa} />
          </Sec>
        )}

        <Sec n={sn(8)} chapter={!bare} th="รายการวัสดุโครงหลังคา" en="Member schedule"
          intro="ความยาวรวมวัดตามแนวเอียงจริงจากแบบจำลอง ยังไม่รวมเศษเหลือจากการตัดต่อ ควรเผื่อเพิ่มประมาณ 5–10%">
          <table className="mt-2 w-full border-collapse text-[10pt]">
            <thead><tr className="border-b border-gray-400 text-left">
              {["ชิ้นส่วน", "หน้าตัด", "ความยาวรวม (ม.)", "น้ำหนัก (กก./ม.)", "น้ำหนักรวม (กก.)", "ผล"].map((h) => <th key={h} className="py-1 pr-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {schedule(dz).map((x) => (
                <tr key={x.key} className="border-b border-gray-200">
                  <td className="py-1 pr-2">{x.label}</td><td className="pr-2">{secText(x)}</td>
                  <td className="pr-2 tabular-nums">{fmt(x.len * x.count, 2)}</td><td className="pr-2 tabular-nums">{fmt(x.r.section.w, 2)}</td>
                  <td className="pr-2 tabular-nums">{fmt(x.weight, 1)}</td><td>{x.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
                </tr>
              ))}
              <tr className="font-semibold"><td className="py-1" colSpan={4}>รวม</td><td className="tabular-nums">{fmt(dz.weight, 1)}</td><td /></tr>
            </tbody>
          </table>
          <Note>น้ำหนักจากชิ้นส่วนเดี่ยว/คู่ตามที่ระบุ · จำนวนจันทัน {fr.rafters.length} ตัว · ดั้ง {fr.posts.filter((p) => p.kind === "ดั้ง").length} ต้น · ตุ๊กตา {fr.posts.filter((p) => p.kind === "ตุ๊กตา").length} ต้น</Note>
        </Sec>
      </Doc>
    </Wrap>
  );
}
