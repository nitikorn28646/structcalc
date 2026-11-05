import { Download, Layers, Ruler, Weight, Wrench } from "lucide-react";
import { GRADES, SLAB_BARS } from "../engine/tables.js";
import { PILES, pileCap, spreadFooting } from "../engine/footing.js";
import { punchingFull } from "../engine/footingExtra.js";
import PileChart, { pileLoads } from "./PileChart.jsx";
import { pileCapModel } from "./drawings.js";
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import PressureChart from "./PressureChart.jsx";
import Footing3D from "./Footing3D.jsx";
import { WallFootingPage, WallFootingReport } from "./WallFooting.jsx";
import { downloadDxf, footingModel } from "./drawings.js";

export const DEFAULT_FOOTING = {
  footNo: "F1", fcPrime: 240, F: 0.45, capFc: true, fy: 3000, Es: 2040000, cover: 5, t: 0.35, Bx: 1.8, By: 1.8, Df: 1.2,
  P: 25000, Mx: 300, My: 300, qa: 12000, gamma: 1800, pier: "rect", bx: 0.25, by: 0.25, D: 0.3,
  longBar: "DB 16", shortBar: "DB 16", dowelBar: "DB 16", sLong: 0.15, sShort: 0.15, dowelN: 6,
  type: "spread", n: 4, pile: "S-30", pileL: 21, fcPile: 350, Ptest: 0, sx: 0.9, sy: 0.9, capWidth: 0,
};

const GRADE_OPTS = Object.entries(GRADES).map(([k, g]) => [k, `${g} (${k})`]);
const BAR_OPTS = Object.keys(SLAB_BARS);

export function runFooting(f) {
  try { if (f.type === "pile") return { r: pileCap(f) }; const r = spreadFooting(f); Object.assign(r, punchingFull(r, f.P, f.Bx * f.By)); return { r }; } catch (e) { return { error: e.message }; }
}
export const footingOk = (r) => (r.piles
  ? r.pileOk && r.dOk && r.vOk && r.vpOk && r.vppOk && r.AsOkL && r.AsOkS && r.perimOk && r.ancOk && r.bearingOk
  : r.qOk && r.qminOk && r.dOk && r.vOk && r.vpOk && r.vpFullOk !== false && r.AsOkL && r.AsOkS && r.perimOkL && r.perimOkS && r.ancOkL && r.ancOkS && r.bearingOk);
const PILE_OPTS = Object.keys(PILES).map((k) => [k, PILES[k].bored ? `เข็มเจาะ ${k} ม.` : `เข็มตอก ${k}`]);

function Row({ label, value, unit, ok }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-[5px] text-[13px] last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5 font-medium tabular-nums">
        {value} <span className="text-[11px] text-gray-400">{unit}</span>
        {ok !== undefined && <Badge ok={ok} />}
      </span>
    </div>
  );
}

export function FootingPage({ f, set, dark }) {
  if (f.type === "wall") return <WallFootingPage f={f} set={set} />;
  const { r, error } = runFooting(f);
  const n = (key, label, unit, step) => (
    <Field label={label} unit={unit}><NumberInput value={f[key]} step={step} onChange={(v) => set(key, v)} /></Field>
  );
  const sel = (key, label, options, num) => (
    <Field label={label}><Select value={f[key]} onChange={(v) => set(key, num ? Number(v) : v)} options={options} /></Field>
  );
  const ok = r && footingOk(r);
  const pc = f.type === "pile";
  const pileB = PILES[f.pile]?.b ?? 0.3;
  const model = r && (pc ? pileCapModel(f, r, pileB) : footingModel(f, r));
  return (
    <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[300px_1fr_1fr_1.15fr] xl:grid-rows-[auto_1fr]">
      <div className="space-y-4 xl:row-span-2 xl:overflow-y-auto">
        <Card title="ชนิดฐานราก วัสดุ ดิน" icon={Wrench}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{sel("type", "ชนิดฐานราก", [["spread", "ฐานแผ่ (วางบนดิน)"], ["pile", "ฐานรากบนเสาเข็ม"], ["wall", "ฐานรากแถบใต้ผนัง"]])}</div>
            {n("fcPrime", "f'c", "ksc")}{sel("fy", "เหล็กเสริม", GRADE_OPTS, true)}
            {pc ? <>{sel("n", "จำนวนเข็ม", [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => [k, `${k} ต้น`]), true)}{sel("pile", "ชนิดเข็ม", PILE_OPTS)}
              {n("pileL", "ความยาวเข็ม", "m", "1")}{n("fcPile", "f'c เข็ม", "ksc")}
              {n("Ptest", "น้ำหนักปลอดภัยจากผลทดสอบ (0 = คำนวณ)", "kg", "1000")}{n("gamma", "หน่วยน้ำหนักดิน", "kg/m³", "100")}</>
              : <>{n("qa", "กำลังรับน้ำหนักดิน qa", "kg/m²", "500")}{n("gamma", "หน่วยน้ำหนักดิน", "kg/m³", "100")}</>}
          </div>
        </Card>
        <Card title="ขนาดฐานรากและแรง" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            {pc ? <>
              {f.n > 1 && n("sx", "ระยะเข็ม sx", "m", "0.05")}
              {f.n > 2 && f.n !== 3 && n("sy", "ระยะเข็ม sy", "m", "0.05")}
              {f.n <= 2 && n("capWidth", f.n === 1 ? "ขนาดฐาน (0 = อัตโนมัติ)" : "ความกว้างฐาน By (0 = อัตโนมัติ)", "m", "0.05")}
            </>
              : <>{n("Bx", "กว้าง Bx", "m", "0.05")}{n("By", "ยาว By", "m", "0.05")}</>}
            {n("t", "หนา t", "m", "0.05")}{n("Df", "ความลึกฐาน Df", "m", "0.1")}
            {sel("pier", "ตอม่อ", [["rect", "สี่เหลี่ยม"], ["circle", "กลม"]])}
            {f.pier === "circle" ? n("D", "เส้นผ่าศูนย์กลาง", "m", "0.05") : <div className="grid grid-cols-2 gap-1.5">{n("bx", "bx", "m", "0.05")}{n("by", "by", "m", "0.05")}</div>}
            {n("P", "แรงอัด P", "kg", "1000")}{n("cover", "ระยะหุ้ม", "cm")}
            {n("Mx", "โมเมนต์ Mx", "kg-m", "100")}{n("My", "โมเมนต์ My", "kg-m", "100")}
          </div>
        </Card>
        <Card title="เหล็กเสริม" icon={Weight}>
          <div className="grid grid-cols-2 gap-3">
            {sel("longBar", "เหล็กทางยาว", BAR_OPTS)}{n("sLong", "ระยะห่าง", "m", "0.025")}
            {sel("shortBar", "เหล็กทางสั้น", BAR_OPTS)}{n("sShort", "ระยะห่าง", "m", "0.025")}
            {sel("dowelBar", "เหล็กเดือย", BAR_OPTS)}{n("dowelN", "จำนวนเดือย", "เส้น", "1")}
          </div>
        </Card>
      </div>

      {r && (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8 xl:col-span-3">
          {(pc ? [["ฐาน Bx × By (m)", `${r.Bx} × ${r.By}`], ["แรงเข็มสูงสุด (t)", fmt(r.Ptmax / 1000), r.pileOk], ["รับได้ต่อต้น (t)", fmt(r.Pallow / 1000)]]
            : [["q max (t/m²)", fmt(Math.max(r.qmaxX, r.qmaxY) / 1000), r.qOk], ["q min (t/m²)", fmt(Math.min(r.qminX, r.qminY) / 1000), r.qminOk]]).concat([
            ["d (cm)", fmt(r.dShort), r.dOk], ["M (kg-m)", fmt(Math.max(r.Mxx, r.Myy), 0)], ["v / vc", fmt(Math.max(r.vX, r.vY) / r.vc, 2), r.vOk],
            ["เฉือนทะลุ / vc", fmt(Math.max(r.vpX, r.vpY) / r.vcp, 2), r.vpOk], ["เหล็กทางยาว", `${r.nLong} เส้น`, r.AsOkL], ["เหล็กทางสั้น", `${r.nShort} เส้น`, r.AsOkS]]).slice(0, 8).map(([l, v, o]) => (
            <div key={l} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="text-[11px] text-gray-400">{l}</div>
              <div className="flex items-center justify-between text-base font-semibold tabular-nums">{v}{o !== undefined && <Badge ok={o} />}</div>
            </div>
          ))}
        </div>
      )}

      <Card title={<span className="flex w-full items-center justify-between">แปลนและรูปตัดฐานราก{r && <Badge ok={ok}>{ok ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"}</Badge>}</span>}
        icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {error ? <p className="text-sm text-red-600">{error}</p> : (
          <div className="flex h-full flex-col items-center justify-center gap-3 rounded-xl bg-gray-50 p-3">
            <Drawing model={model} className="h-[440px] w-full" width={420} fontSize={13} />
            <button onClick={() => downloadDxf(model, `${f.footNo}-footing`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลด DXF (AutoCAD)
            </button>
          </div>
        )}
      </Card>

      <Card title="ผลการตรวจสอบ" icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {r && (
          <div>
            {pc ? <>
              <Row label="แรงต่อเข็มสูงสุด ≤ ที่ยอมให้" value={`${fmt(r.Ptmax, 0)} / ${fmt(r.Pallow, 0)}`} unit="kg" ok={r.pileOk} />
              <Row label="เฉือนทะลุรอบเข็ม ≤ 0.53√f'c" value={`${fmt(Math.max(r.vppX, r.vppY))} / ${fmt(r.vcp)}`} unit="ksc" ok={r.vppOk} />
            </> : <>
              <Row label="แรงดันดินสูงสุด ≤ qa" value={fmt(Math.max(r.qmaxX, r.qmaxY), 0)} unit="kg/m²" ok={r.qOk} />
              <Row label="แรงดันดินต่ำสุด ≥ 0 (ไม่ยกตัว)" value={fmt(Math.min(r.qminX, r.qminY), 0)} unit="kg/m²" ok={r.qminOk} />
            </>}
            <Row label="ความลึก d ต้องการ / มี" value={`${fmt(Math.max(r.dReqX, r.dReqY))} / ${fmt(r.dShort)}`} unit="cm" ok={r.dOk} />
            <Row label="เฉือนแบบคาน v ≤ 0.29√f'c" value={`${fmt(Math.max(r.vX, r.vY))} / ${fmt(r.vc)}`} unit="ksc" ok={r.vOk} />
            <Row label="เฉือนทะลุ v ≤ 0.53√f'c" value={`${fmt(Math.max(r.vpX, r.vpY))} / ${fmt(r.vcp)}`} unit="ksc" ok={r.vpOk} />
            {r.vpFull != null && <Row label="เฉือนทะลุ (แรงเต็ม V/(b₀·d))" value={`${fmt(r.vpFull)} / ${fmt(r.vcp)}`} unit="ksc" ok={r.vpFullOk} />}
            <Row label={r.nTri ? "As ต่อแถบ ต้องการ / ใส่ (3 แถบ)" : "As ทางยาว ต้องการ / ใส่"} value={`${fmt(Math.max(r.AsReqL, r.AsMinL))} / ${fmt(r.AsProvL)}`} unit="cm²" ok={r.AsOkL} />
            {!r.nTri && <Row label="As ทางสั้น ต้องการ / ใส่" value={`${fmt(Math.max(r.AsReqS, r.AsMinS))} / ${fmt(r.AsProvS)}`} unit="cm²" ok={r.AsOkS} />}
            <Row label="แรงยึดเหนี่ยว (เส้นรอบรูป)" value={`${fmt(r.perimReqL)} / ${fmt(r.perimL)}`} unit="cm" ok={pc ? r.perimOk : r.perimOkL && r.perimOkS} />
            <Row label="ระยะฝังเหล็ก ต้องการ / มี" value={`${fmt(r.ancL)} / ${fmt(r.ancAvailL)}`} unit="cm" ok={pc ? r.ancOk : r.ancOkL && r.ancOkS} />
            <Row label="แรงแบกทานใต้ตอม่อ ≤ 0.25f'c" value={fmt(r.bearing)} unit="ksc" ok={r.bearingOk} />
            <Row label="เหล็กเดือย ระยะฝัง" value={`${f.dowelN}-${f.dowelBar} · ${r.ancUseD}`} unit="m" ok={r.perimOkD} />
          </div>
        )}
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
            {pc ? "แรงที่เสาเข็มแต่ละต้น" : "การกระจายแรงดันดินใต้ฐานราก"}
            <span className="text-[11px] font-normal text-gray-500">{pc ? "เทียบกับกำลังรับที่ยอมให้ต่อต้น" : "เทียบกับกำลังรับน้ำหนักดิน qa"}</span>
          </div>
          {r && (pc ? <PileChart f={f} r={r} height={330} dark={dark} /> : <PressureChart f={f} r={r} height={330} dark={dark} />)}
        </section>
        {r && <Footing3D f={pc ? { ...f, Bx: r.Bx, By: r.By } : f} r={r} piles={pc ? r.piles : undefined} pileB={pileB} round={PILES[f.pile]?.bored} dark={dark} className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-gray-200" />}
      </div>
    </main>
  );
}

export function FootingReport({ f, project }) {
  if (f.type === "pile") return <PileCapReport f={f} project={project} />;
  if (f.type === "wall") return <WallFootingReport f={f} project={project} />;
  const { r } = runFooting(f);
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const ok = footingOk(r);
  const ksc = "กก./ซม.²";
  const pierTxt = f.pier === "circle" ? `กลม D = ${f.D} ม. (เทียบเท่าสี่เหลี่ยม ${fmt(r.bx, 3)} ม.)` : `${f.bx} × ${f.by} ม.`;
  return (
    <div className="report">
      <Doc project={project} title="รายการคำนวณออกแบบฐานรากแผ่ (ฐานรากตื้น)" subtitle="Isolated spread footing design — Working Stress Design (WSD)"
        memberLabel="ฐานราก" member={f.footNo}
        summary={[
          ["ขนาดฐานราก", `${f.Bx} × ${f.By} × ${f.t} ม. ลึก ${f.Df} ม.`],
          ["แรงดันดินสูงสุด / qa", `${fmt(Math.max(r.qmaxX, r.qmaxY) / 1000)} / ${fmt(f.qa / 1000)} ตัน/ม.²`, r.qOk],
          ["เหล็กทางยาว", `${r.longText} ม.`, r.AsOkL],
          ["เหล็กทางสั้น", `${r.shortText} ม.`, r.AsOkS],
          ["เหล็กเดือย", `${f.dowelN}-${f.dowelBar} ฝัง ${r.ancUseD} ม.`, r.perimOkD],
          ["ผลการตรวจสอบรวม", ok ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", ok],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบ" en="Design data"
          intro="ฐานรากแผ่รับน้ำหนักจากเสาตอม่อแล้วกระจายลงดิน ขนาดฐานต้องใหญ่พอให้แรงดันดินไม่เกินกำลังรับน้ำหนักที่ยอมให้ของดิน (qa) จากผลเจาะสำรวจดินหรือค่าที่กฎหมายกำหนด">
          <Item th="ขนาดฐานราก" f="Bx × By × t" v={`${f.Bx} × ${f.By} × ${f.t}`} u="ม." />
          <Item th="ความลึกฐานรากจากผิวดิน" f="Df" v={fmt(f.Df)} u="ม." />
          <Item th="ขนาดตอม่อ" v={pierTxt} />
          <Item th="แรงอัดจากเสา" f="P" v={fmt(f.P, 0)} u="กก." />
          <Item th="โมเมนต์ดัด" f="Mx / My" v={`${fmt(f.Mx, 0)} / ${fmt(f.My, 0)}`} u="กก.-ม." />
          <Item th="กำลังรับน้ำหนักที่ยอมให้ของดิน" f="qa" v={fmt(f.qa, 0)} u="กก./ม.²" />
          <Item th="หน่วยน้ำหนักดินถม" f="γ" v={fmt(f.gamma, 0)} u="กก./ม.³" />
          <Item th={`คอนกรีต f'c / เหล็ก ${GRADES[f.fy]}`} v={`${fmt(f.fcPrime, 0)} / ${fmt(f.fy, 0)}`} u={ksc} />
          <Item th="ค่าคงที่ k / j / R" v={`${fmt(r.k, 4)} / ${fmt(r.j, 4)} / ${fmt(r.R, 3)}`} />
        </Sec>

        <Sec n={2} th="ตรวจสอบแรงดันดินใต้ฐานราก" en="Soil pressure"
          intro="แรงดันดินรวม = (น้ำหนักเสา + น้ำหนักฐานราก + ดินถมด้านบน) / พื้นที่ฐาน บวกลบผลจากโมเมนต์ 6M/(B·L²) ด้านแรงดันมากต้องไม่เกิน qa และด้านแรงดันน้อยต้องไม่ติดลบ (ฐานไม่ยกตัว)">
          <Item th="แรงดันดินสูงสุด / ต่ำสุด (แนว x)" f="q = ΣP/A ± 6My/(By·Bx²)" v={`${fmt(r.qmaxX, 0)} / ${fmt(r.qminX, 0)}`} u="กก./ม.²" ok={r.qmaxX <= f.qa && r.qminX >= 0} />
          <Item th="แรงดันดินสูงสุด / ต่ำสุด (แนว y)" f="q = ΣP/A ± 6Mx/(Bx·By²)" v={`${fmt(r.qmaxY, 0)} / ${fmt(r.qminY, 0)}`} u="กก./ม.²" ok={r.qmaxY <= f.qa && r.qminY >= 0} />
          <Item th="แรงดันดินสุทธิสำหรับออกแบบคอนกรีต (แนว x)" f="qnet = P/A ± 6My/(By·Bx²)" v={`${fmt(r.qnMaxX, 0)} / ${fmt(r.qnMinX, 0)}`} u="กก./ม.²"
            note="ใช้แรงดันสุทธิ (ไม่รวมน้ำหนักฐานและดิน) เพราะน้ำหนักทั้งสองกดและรองรับกันเอง ไม่ทำให้ฐานดัด" />
          <Item th="แรงดันดินสุทธิ (แนว y)" f="qnet = P/A ± 6Mx/(Bx·By²)" v={`${fmt(r.qnMaxY, 0)} / ${fmt(r.qnMinY, 0)}`} u="กก./ม.²" />
          <Figure caption="การกระจายแรงดันดินรวมใต้ฐานราก เทียบกับ qa">
            <PressureChart f={f} r={r} width={600} height={230} animate={false} />
          </Figure>
        </Sec>

        <Sec n={3} th="ตรวจสอบความหนาและแรงเฉือน" en="Depth & shear"
          intro="ฐานรากทำงานเหมือนแผ่นยื่นออกจากขอบตอม่อ ต้องหนาพอรับโมเมนต์ แรงเฉือนแบบคาน (ที่ระยะ d จากขอบตอม่อ) และแรงเฉือนทะลุ (ตอม่อเจาะทะลุฐาน ที่ระยะ d/2 รอบตอม่อ)">
          <Item th="ความลึกประสิทธิผล ทางยาว / ทางสั้น" f="d = t − ระยะหุ้ม − db/2" v={`${fmt(r.dLong)} / ${fmt(r.dShort)}`} u="ซม." />
          <Item th="โมเมนต์ที่ขอบตอม่อ (รอบแกน y / x)" f="แรงดันรูปสี่เหลี่ยมคางหมู" v={`${fmt(r.Myy)} / ${fmt(r.Mxx)}`} u="กก.-ม." />
          <Item th="ความลึกที่ต้องการ" f="d = √(M / (R·B))" v={fmt(Math.max(r.dReqX, r.dReqY))} u="ซม." ok={r.dOk} />
          <Item th="หน่วยแรงเฉือนแบบคาน (x / y)" f={`v = V/(B·d) ≤ ${fmt(r.vc)}`} v={`${fmt(r.vX)} / ${fmt(r.vY)}`} u={ksc} ok={r.vOk} />
          <Item th="เส้นรอบรูปวิกฤตเฉือนทะลุ" f="bo ที่ d/2 รอบตอม่อ" v={fmt(r.perimeter)} u="ซม." />
          <Item th="หน่วยแรงเฉือนทะลุ (x / y)" f={`v = V/(bo·d) ≤ ${fmt(r.vcp)}`} v={`${fmt(r.vpX)} / ${fmt(r.vpY)}`} u={ksc} ok={r.vpOk} />
          <Item th="หน่วยแรงแบกทานใต้ตอม่อ" f={`P/(bx·by) ≤ 0.25f'c = ${fmt(r.fnb1)}`} v={fmt(r.bearing)} u={ksc} ok={r.bearingOk} />
        </Sec>

        <Sec n={4} th="ออกแบบเหล็กเสริม" en="Reinforcement"
          intro="เหล็กเสริมวางเป็นตะแกรงที่ผิวล่างของฐานราก ต้องมีพื้นที่พอรับโมเมนต์ ไม่น้อยกว่าเหล็กขั้นต่ำ มีเส้นรอบรูปพอสำหรับแรงยึดเหนี่ยว และยาวพอฝังยึดจากขอบตอม่อ">
          <Item th="เหล็กทางยาว ต้องการ" f="As = M/(fs·j·d) , As,min = 14/fy·b·d" v={`${fmt(r.AsReqL)} , ${fmt(r.AsMinL)}`} u="ซม.²" />
          <Item th="เหล็กทางยาว ที่ใช้" v={`${r.longText} ม. (${fmt(r.AsProvL)} ซม.²)`} ok={r.AsOkL} />
          <Item th="เหล็กทางสั้น ต้องการ" v={`${fmt(r.AsReqS)} , ${fmt(r.AsMinS)}`} u="ซม.²" />
          <Item th="เหล็กทางสั้น ที่ใช้" v={`${r.shortText} ม. (${fmt(r.AsProvS)} ซม.²)`} ok={r.AsOkS} />
          <Item th="เส้นรอบรูปเหล็กที่ต้องการ (ยาว / สั้น)" f="Σo = V/(u·j·d)" v={`${fmt(r.perimReqL)} / ${fmt(r.perimReqS)}`} u="ซม." ok={r.perimOkL && r.perimOkS}
            note={`มีจริง ${fmt(r.perimL)} / ${fmt(r.perimS)} ซม.`} />
          <Item th="ระยะฝังยึดที่ต้องการ (ยาว / สั้น)" f="ld = db·fs/(4u)" v={`${fmt(r.ancL)} / ${fmt(r.ancS)}`} u="ซม." ok={r.ancOkL && r.ancOkS}
            note={`ระยะที่มีจากขอบตอม่อถึงปลายเหล็ก ${fmt(r.ancAvailL)} / ${fmt(r.ancAvailS)} ซม.`} />
          <Item th="เหล็กเดือยตอม่อ" v={`${f.dowelN}-${f.dowelBar}`} ok={r.perimOkD} note={`เส้นรอบรูปต้องการ ${fmt(r.perimReqD)} ซม. / มี ${fmt(r.perimD)} ซม.`} />
          <Item th="ระยะฝังเหล็กเดือย" f="1.25·db·fs/(4u)" v={fmt(r.ancUseD)} u="ม." />
          <Figure caption="แปลนและรูปตัดฐานรากแสดงการเสริมเหล็ก">
            <Drawing model={footingModel(f, r)} className="mx-auto h-[95mm]" fontSize={10} width={420} />
          </Figure>
          {!ok && <Note>มีรายการไม่ผ่าน ควรเพิ่มขนาดฐาน เพิ่มความหนา หรือเพิ่มปริมาณเหล็กตามรายการที่ไม่ผ่าน</Note>}
        </Sec>
      </Doc>
    </div>
  );
}



function PileCapReport({ f, project }) {
  const { r } = runFooting(f);
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const ok = footingOk(r);
  const ksc = "กก./ซม.²";
  const pile = PILES[f.pile];
  const loads = pileLoads(f, r);
  return (
    <div className="report">
      <Doc project={project} title={`รายการคำนวณออกแบบฐานรากบนเสาเข็ม ${f.n} ต้น`} subtitle="Pile cap design — Working Stress Design (WSD)"
        memberLabel="ฐานราก" member={f.footNo}
        summary={[
          ["ขนาดฐานราก", `${r.Bx} × ${r.By} × ${f.t} ม.`],
          ["เสาเข็ม", `${f.n} ต้น ${pile.bored ? "เข็มเจาะ" : "เข็มตอก"} ${f.pile} ยาว ${f.pileL} ม.`],
          ["แรงต่อต้นสูงสุด / ที่ยอมให้", `${fmt(r.Ptmax / 1000)} / ${fmt(r.Pallow / 1000)} ตัน`, r.pileOk],
          ["เหล็กทางยาว / ทางสั้น", `${r.longText} / ${r.shortText} ม.`, r.AsOkL && r.AsOkS],
          ["เหล็กเดือย", `${f.dowelN}-${f.dowelBar} ฝัง ${r.ancUseD} ม.`, r.perimOkD],
          ["ผลการตรวจสอบรวม", ok ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", ok],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบและเสาเข็ม" en="Design data & piles"
          intro="ฐานรากบนเสาเข็มรับน้ำหนักจากเสาตอม่อแล้วถ่ายลงเสาเข็ม ขนาดฐานรากกำหนดจากระยะห่างเสาเข็ม บวกระยะจากขอบเข็มถึงขอบฐาน 1.3 เท่าของขนาดเข็มและระยะหุ้ม">
          <Item th="จำนวนและชนิดเสาเข็ม" v={`${f.n} ต้น · ${f.pile} (A = ${pile.A} ซม.² , เส้นรอบรูป ${pile.p} ซม.)`} />
          <Item th="ความยาวเสาเข็ม / f'c เข็ม" v={`${f.pileL} ม. / ${f.fcPile} ${ksc}`} />
          <Item th="ระยะห่างเสาเข็ม" f="sx × sy" v={`${f.sx} × ${f.sy}`} u="ม." />
          <Item th="ขนาดฐานราก (คำนวณ)" f="ระยะเข็ม + 2·1.3·b + 2·ระยะหุ้ม" v={`${r.Bx} × ${r.By} × ${f.t}`} u="ม." />
          <Item th="ตอม่อ" v={f.pier === "circle" ? `กลม D = ${f.D} ม.` : `${f.bx} × ${f.by} ม.`} />
          <Item th="แรงจากเสา P / Mx / My" v={`${fmt(f.P, 0)} กก. / ${fmt(f.Mx, 0)} / ${fmt(f.My, 0)} กก.-ม.`} />
          <Item th={`คอนกรีต f'c / เหล็ก ${GRADES[f.fy]}`} v={`${fmt(f.fcPrime, 0)} / ${fmt(f.fy, 0)}`} u={ksc} />
          <Item th="ค่าคงที่ k / j / R" v={`${fmt(r.k, 4)} / ${fmt(r.j, 4)} / ${fmt(r.R, 3)}`} />
        </Sec>

        <Sec n={2} th="ตรวจสอบกำลังรับน้ำหนักของเสาเข็ม" en="Pile capacity"
          intro="แรงในเสาเข็มแต่ละต้น = (น้ำหนักเสา + น้ำหนักฐานรากและดินถม)/จำนวนเข็ม บวกผลจากโมเมนต์ M·x/Σx² ต้องไม่เกินกำลังรับที่ยอมให้ต่อต้น ซึ่งเลือกค่าน้อยที่สุดจากกำลังของคอนกรีตฐาน กำลังของตัวเข็ม และแรงเสียดทานผิวเข็ม (หรือค่าจากผลทดสอบเข็ม)">
          <Item th="แรงต่อต้นสูงสุด" f="ΣP/n + My·x/Σx² + Mx·y/Σy²" v={fmt(r.Ptmax, 0)} u="กก." />
          <Item th="กำลังจากคอนกรีตฐานราก" f="0.375·f'c·Ap" v={fmt(r.P1, 0)} u="กก." />
          <Item th="กำลังจากตัวเสาเข็ม" f="0.375·f'c(เข็ม)·Ap" v={fmt(r.P2, 0)} u="กก." />
          <Item th="กำลังจากแรงเสียดทานผิวเข็ม" f="600–800+200(L−7) กก./ม.² × เส้นรอบรูป" v={fmt(r.Pf, 0)} u="กก." />
          {f.Ptest > 0 && <Item th="น้ำหนักปลอดภัยจากผลทดสอบเข็ม" v={fmt(f.Ptest, 0)} u="กก." />}
          <Item th="กำลังรับที่ยอมให้ต่อต้น" f="ค่าน้อยที่สุด" v={fmt(r.Pallow, 0)} u="กก." ok={r.pileOk} />
          <Figure caption="แรงที่เสาเข็มแต่ละต้นเทียบกับกำลังรับที่ยอมให้">
            <PileChart f={f} r={r} width={600} height={220} animate={false} />
          </Figure>
          <Note>แรงในเข็มแต่ละต้น: {loads.map((v, i) => `เข็ม ${i + 1} = ${fmt(v / 1000)} ตัน`).join(" · ")}</Note>
        </Sec>

        <Sec n={3} th="ตรวจสอบความหนาและแรงเฉือนของฐานราก" en="Depth & shear"
          intro="ฐานรากรับแรงปฏิกิริยาจากเสาเข็มเหมือนคานยื่นจากขอบตอม่อ ตรวจโมเมนต์ แรงเฉือนแบบคานที่ระยะ d แรงเฉือนทะลุรอบตอม่อที่ระยะ d/2 และแรงเฉือนทะลุรอบหัวเสาเข็ม เสาเข็มที่คร่อมแนววิกฤตคิดแรงตามสัดส่วนที่อยู่นอกแนว">
          <Item th="ความลึกประสิทธิผล ทางยาว / ทางสั้น" v={`${fmt(r.dLong)} / ${fmt(r.dShort)}`} u="ซม." />
          <Item th="โมเมนต์ที่ขอบตอม่อ (รอบแกน y / x)" f="ΣPt·(ระยะเข็มถึงขอบตอม่อ)" v={`${fmt(r.Myy)} / ${fmt(r.Mxx)}`} u="กก.-ม." />
          <Item th="ความลึกที่ต้องการ" f="d = √(M / (R·B))" v={fmt(Math.max(r.dReqX, r.dReqY))} u="ซม." ok={r.dOk} />
          <Item th="หน่วยแรงเฉือนแบบคาน (x / y)" f={`≤ 0.29√f'c = ${fmt(r.vc)}`} v={`${fmt(r.vX)} / ${fmt(r.vY)}`} u={ksc} ok={r.vOk} />
          <Item th="หน่วยแรงเฉือนทะลุรอบตอม่อ (x / y)" f={`≤ 0.53√f'c = ${fmt(r.vcp)}`} v={`${fmt(r.vpX)} / ${fmt(r.vpY)}`} u={ksc} ok={r.vpOk} />
          <Item th="หน่วยแรงเฉือนทะลุรอบหัวเสาเข็ม" f="Pt / (bo·d)" v={`${fmt(r.vppX)} / ${fmt(r.vppY)}`} u={ksc} ok={r.vppOk} />
          <Item th="หน่วยแรงแบกทานใต้ตอม่อ" f={`≤ 0.25f'c = ${fmt(r.fnb1)}`} v={fmt(r.bearing)} u={ksc} ok={r.bearingOk} />
        </Sec>

        <Sec n={4} th="ออกแบบเหล็กเสริม" en="Reinforcement"
          intro="เหล็กเสริมวางเป็นตะแกรงที่ผิวล่างของฐาน เหนือหัวเสาเข็ม ต้องพอรับโมเมนต์ ไม่น้อยกว่าเหล็กขั้นต่ำ มีแรงยึดเหนี่ยวและระยะฝังเพียงพอ">
          <Item th="เหล็กทางยาว ต้องการ / ขั้นต่ำ" v={`${fmt(r.AsReqL)} / ${fmt(r.AsMinL)}`} u="ซม.²" />
          <Item th="เหล็กทางยาว ที่ใช้" v={`${r.longText} ม. (${fmt(r.AsProvL)} ซม.²)`} ok={r.AsOkL} />
          <Item th="เหล็กทางสั้น ต้องการ / ขั้นต่ำ" v={`${fmt(r.AsReqS)} / ${fmt(r.AsMinS)}`} u="ซม.²" />
          <Item th="เหล็กทางสั้น ที่ใช้" v={`${r.shortText} ม. (${fmt(r.AsProvS)} ซม.²)`} ok={r.AsOkS} />
          <Item th="เส้นรอบรูปเหล็กที่ต้องการ (ยาว / สั้น)" f="Σo = V/(u·j·d)" v={`${fmt(r.perimReqL)} / ${fmt(r.perimReqS)}`} u="ซม." ok={r.perimOk} />
          <Item th="ระยะฝังยึด ต้องการ / มี" f="ld = db·fs/(4u)" v={`${fmt(r.ancL)} / ${fmt(r.ancAvailL)}`} u="ซม." ok={r.ancOk} />
          <Item th="เหล็กเดือยตอม่อ / ระยะฝัง" v={`${f.dowelN}-${f.dowelBar} / ${r.ancUseD} ม.`} ok={r.perimOkD} />
          <Figure caption="แปลนฐานรากและตำแหน่งเสาเข็ม พร้อมรูปตัดแสดงการเสริมเหล็ก">
            <Drawing model={pileCapModel(f, r, pile.b)} className="mx-auto h-[100mm]" fontSize={10} width={420} />
          </Figure>
          {f.n === 3 && <Note>ฐาน 3 เข็มเป็นฐานสามเหลี่ยมตัดมุม เสริมเหล็กล่างเป็น 3 แถบวางผ่านหัวเข็มทุกคู่ (แถบละ {r.nTri}-{f.longBar} กว้าง {fmt(r.bandW)} ม.) แต่ละแถบออกแบบรับโมเมนต์สูงสุด เหล็กยาวเลยหัวเข็มถึงขอบฐานแล้วงอขึ้น</Note>}
        </Sec>
      </Doc>
    </div>
  );
}

