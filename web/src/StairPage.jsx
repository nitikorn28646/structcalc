import { Download, Layers, Ruler, Weight, Wrench } from "lucide-react";
import { GRADES, SLAB_BARS } from "../engine/tables.js";
import { stair } from "../engine/slab.js";
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { Doc, Figure, Item, Sec } from "./ReportKit.jsx";
import { fmt, spanFunctions } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import ForceCharts from "./ForceCharts.jsx";
import Stair3D from "./Stair3D.jsx";
import { downloadDxf, stairSectionModel } from "./drawings.js";

export const DEFAULT_STAIR = {
  stairNo: "ST1", fcPrime: 180, F: 0.45, capFc: true, fy: 2400, Es: 2040000, cover: 2, unitWeight: 2400,
  t: 0.15, L: 3, tread: 0.25, riser: 0.18, width: 1.2, extra: 100, live: 300, mainBar: "DB 12", tempBar: "RB 9",
};

const GRADE_OPTS = Object.entries(GRADES).map(([k, g]) => [k, `${g} (${k})`]);
const BAR_OPTS = Object.keys(SLAB_BARS);

export function runStair(s) {
  try { return { r: stair(s) }; } catch (e) { return { error: e.message }; }
}
export const stairOk = (r) => r.nOk && r.minTOk && r.dOk && r.VcOk && r.McOk && r.uOk && Number.isFinite(r.sTemp);
const fnsCache = new Map();
export function stairFns(s, r) {
  const key = `${s.L}|${r.w}`;
  if (!fnsCache.has(key)) fnsCache.set(key, spanFunctions("span", s.L, r.w, 0, 0));
  return fnsCache.get(key);
}

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

export function StairPage({ s, set, dark }) {
  const { r, error } = runStair(s);
  const f = (key, label, unit, step) => (
    <Field label={label} unit={unit}><NumberInput value={s[key]} step={step} onChange={(v) => set(key, v)} /></Field>
  );
  const sel = (key, label, options, num) => (
    <Field label={label}><Select value={s[key]} onChange={(v) => set(key, num ? Number(v) : v)} options={options} /></Field>
  );
  const ok = r && stairOk(r);
  return (
    <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[300px_1fr_1fr_1.15fr] xl:grid-rows-[auto_1fr]">
      <div className="space-y-4 xl:row-span-2 xl:overflow-y-auto">
        <Card title="วัสดุ" icon={Wrench}>
          <div className="grid grid-cols-2 gap-3">
            {f("fcPrime", "f'c", "ksc")}
            {sel("F", "fc = F·f'c", [[0.375, "0.375 f'c"], [0.45, "0.45 f'c"]], true)}
            {sel("fy", "เหล็กเสริม", GRADE_OPTS, true)}{f("cover", "ระยะหุ้ม", "cm")}
          </div>
        </Card>
        <Card title="ขนาดบันไดและน้ำหนัก" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            {f("L", "ช่วงราบ L", "m", "0.1")}{f("t", "หนาท้องบันได t", "m", "0.01")}
            {f("tread", "ลูกนอน", "m", "0.01")}{f("riser", "ลูกตั้ง", "m", "0.01")}
            {f("width", "ความกว้างบันได", "m", "0.1")}{f("extra", "น้ำหนักวัสดุปู", "kg/m²")}
            {f("live", "น้ำหนักจร", "kg/m²")}
          </div>
        </Card>
        <Card title="เหล็กเสริม" icon={Weight}>
          <div className="grid grid-cols-2 gap-3">
            {sel("mainBar", "เหล็กหลัก", BAR_OPTS)}{sel("tempBar", "เหล็กกันร้าว", BAR_OPTS)}
          </div>
        </Card>
      </div>

      {r && (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8 xl:col-span-3">
          {[["w รวม (kg/m²)", fmt(r.w, 0)], ["จำนวนขั้น", r.steps], ["มุมเอียง (°)", fmt(r.angle, 1)], ["R (ksc)", fmt(r.R)],
            ["M (kg-m/m)", fmt(r.M)], ["V (kg/m)", fmt(r.V)], ["หนาต่ำสุด (m)", fmt(r.minT, 3), r.minTOk],
            ["d ต้องการ (cm)", fmt(r.dReq), r.dOk]].map(([l, v, o]) => (
            <div key={l} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="text-[11px] text-gray-400">{l}</div>
              <div className="flex items-center justify-between text-base font-semibold tabular-nums">{v}{o !== undefined && <Badge ok={o} />}</div>
            </div>
          ))}
        </div>
      )}

      <Card title={<span className="flex w-full items-center justify-between">รูปตัดบันไดและเหล็กเสริม{r && <Badge ok={ok}>{ok ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"}</Badge>}</span>}
        icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {error ? <p className="text-sm text-red-600">{error}</p> : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-50 p-4">
            <Drawing model={stairSectionModel(s, r)} className="h-[380px] w-full" width={560} fontSize={14} />
            <button onClick={() => downloadDxf(stairSectionModel(s, r), `${s.stairNo}-section`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลด DXF (AutoCAD)
            </button>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 text-center">
              {[["เหล็กหลัก", r.mainText], ["เหล็กกันร้าว", r.tempText]].map(([l, t]) => (
                <div key={l} className="rounded-xl bg-white px-3 py-2 shadow-theme-xs">
                  <div className="text-[11px] text-gray-400">{l}</div>
                  <div className="font-semibold text-gray-800">{t} m.</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="ผลการตรวจสอบ" icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {r && (
          <div>
            <Row label="น้ำหนักท้องบันไดและขั้นบันได" value={fmt(r.selfWeight)} unit="kg/m²" />
            <Row label="โมเมนต์ M = wL²/8" value={fmt(r.M)} unit="kg-m/m" />
            <Row label="Mc = R·d²" value={fmt(r.Mc)} unit="kg-m" ok={r.McOk} />
            <Row label="แรงเฉือน V ≤ Vc" value={`${fmt(r.V)} / ${fmt(r.Vc)}`} unit="kg" ok={r.VcOk} />
            <Row label="As ต้องการ" value={fmt(r.As)} unit="cm²/m" />
            <Row label="As กันร้าว" value={fmt(r.AsTemp)} unit="cm²/m" ok={Number.isFinite(r.AsTemp)} />
            <Row label="แรงยึดเหนี่ยว u" value={fmt(r.u)} unit={`ksc ≤ ${r.uLimit}`} ok={r.uOk} />
            <Row label="ความหนาต่ำสุด L/20" value={fmt(r.minT, 3)} unit="m" ok={r.minTOk} />
            <Row label="แรงปฏิกิริยาลงคาน" value={fmt(r.reaction)} unit="kg/m" />
          </div>
        )}
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
            แผนภาพแรงเฉือน / โมเมนต์
            <span className="text-[11px] font-normal text-gray-500">แถบกว้าง 1 ม. ตามช่วงราบ</span>
          </div>
          {r && <ForceCharts L={s.L} fns={stairFns(s, r)} height={330} dark={dark} />}
        </section>
        {r && <Stair3D s={s} r={r} dark={dark} className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-gray-200" />}
      </div>
    </main>
  );
}

export function StairReport({ s, project }) {
  const { r } = runStair(s);
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const ok = stairOk(r);
  const ksc = "กก./ซม.²";
  return (
    <div className="report">
      <Doc project={project} title="รายการคำนวณออกแบบบันไดคอนกรีตเสริมเหล็ก" subtitle="Reinforced concrete stair design — Working Stress Design (WSD)"
        memberLabel="บันได" member={s.stairNo}
        summary={[
          ["ช่วงราบ / ความหนาท้องบันได", `${s.L} ม. / ${s.t * 100} ซม.`],
          ["ขั้นบันได", `${r.steps} ขั้น · ลูกนอน ${s.tread} · ลูกตั้ง ${s.riser} ม.`],
          ["เหล็กหลัก", `${r.mainText} ม.`, r.McOk && r.dOk],
          ["เหล็กกันร้าว", `${r.tempText} ม.`],
          ["น้ำหนักบรรทุกรวม", `${fmt(r.w, 0)} กก./ม.²`],
          ["ผลการตรวจสอบรวม", ok ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", ok],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบและน้ำหนักบรรทุก" en="Design data & loads"
          intro="ออกแบบบันไดแบบท้องเรียบพาดระหว่างคานสองตัว คิดเป็นแถบกว้าง 1 เมตร ตามช่วงราบ น้ำหนักตัวเองรวมแผ่นท้องบันไดที่เอียง (ยาวกว่าช่วงราบ) และเนื้อคอนกรีตของขั้นบันได">
          <Item th="ช่วงราบของบันได" f="L" v={fmt(s.L)} u="ม." />
          <Item th="ลูกนอน / ลูกตั้ง" f="b / h" v={`${fmt(s.tread)} / ${fmt(s.riser)}`} u="ม." />
          <Item th="จำนวนขั้น / มุมเอียง" v={`${r.steps} ขั้น / ${fmt(r.angle, 1)}°`} />
          <Item th="ความหนาท้องบันได" f="t" v={fmt(s.t)} u="ม." />
          <Item th="น้ำหนักท้องบันไดและขั้นบันได" f="γ·t·√(b²+h²)/b + γ·h/2" v={fmt(r.selfWeight)} u="กก./ม.²"
            note="ท้องบันไดยาวตามแนวเอียง จึงคูณด้วยอัตราส่วนความยาวเอียงต่อช่วงราบ ส่วนขั้นบันไดคิดความหนาเฉลี่ยครึ่งหนึ่งของลูกตั้ง" />
          <Item th="น้ำหนักวัสดุปูผิว" v={fmt(s.extra)} u="กก./ม.²" />
          <Item th="น้ำหนักจร" v={fmt(s.live)} u="กก./ม.²" />
          <Item th="น้ำหนักบรรทุกรวม" f="w" v={fmt(r.w)} u="กก./ม.²" />
        </Sec>

        <Sec n={2} th="คุณสมบัติวัสดุและค่าคงที่" en="Materials & constants"
          intro="ค่าคงที่ของวิธีหน่วยแรงใช้งาน ใช้หาความลึกที่ต้องการและปริมาณเหล็กเสริม">
          <Item th="กำลังอัดคอนกรีต / หน่วยแรงที่ยอมให้" f={`fc = ${s.F}·f'c${s.capFc ? " ≤ 65" : ""}`} v={`${fmt(s.fcPrime, 0)} / ${fmt(r.fc)}`} u={ksc} />
          <Item th={`เหล็ก ${GRADES[s.fy]}: fy / fs`} v={`${fmt(s.fy, 0)} / ${fmt(r.fs, 0)}`} u={ksc} />
          <Item th="อัตราส่วนโมดูลัส" f="n = Es / Ec" v={fmt(r.n)} ok={r.nOk} />
          <Item th="ค่าคงที่ k / j" v={`${fmt(r.k, 4)} / ${fmt(r.j, 4)}`} />
          <Item th="ค่าต้านทานโมเมนต์" f="R = ½·fc·k·j" v={fmt(r.R, 3)} u={ksc} />
          <Item th="ความหนาน้อยที่สุด" f={`L/20${s.fy < 4000 ? "·(0.4 + fy/7,000)" : ""}`} v={fmt(r.minT, 3)} u="ม." ok={r.minTOk} />
        </Sec>

        <Sec n={3} th="โมเมนต์ แรงเฉือน และเหล็กเสริม" en="Moment, shear & reinforcement"
          intro="บันไดพาดช่วงเดียวปลายหมุน โมเมนต์สูงสุดกลางช่วง wL²/8 ตรวจความลึก แรงเฉือน แล้วหาเหล็กหลัก (วางตามแนวลาดของบันได) และเหล็กกันร้าว (วางขวาง)">
          <Item th="โมเมนต์ออกแบบ" f="M = wL²/8" v={fmt(r.M)} u="กก.-ม." />
          <Item th="แรงเฉือนออกแบบ (ที่ระยะ d จากขอบ)" f="V = wL/2 − w·d" v={fmt(r.V)} u="กก." />
          <Item th="ความลึกประสิทธิผล" f="d = t − ระยะหุ้ม − db/2" v={fmt(r.d)} u="ซม." />
          <Item th="ความลึกที่ต้องการ" f="d = √(M / R)" v={fmt(r.dReq)} u="ซม." ok={r.dOk} />
          <Item th="กำลังรับโมเมนต์ของคอนกรีต" f="Mc = R·b·d²" v={fmt(r.Mc)} u="กก.-ม." ok={r.McOk} />
          <Item th="แรงเฉือนที่คอนกรีตรับได้" f="Vc = 0.29·√f'c·b·d" v={fmt(r.Vc)} u="กก." ok={r.VcOk} />
          <Item th="เหล็กหลักที่ต้องการ" f="As = M / (fs·j·d)" v={fmt(r.As)} u="ซม.²/ม." />
          <Item th="ใช้เหล็กหลัก" f="s ≤ 3t และ 0.45 ม." v={`${r.mainText} ม.`} />
          <Item th="เหล็กกันร้าว" f="As = ρ·b·t" v={fmt(r.AsTemp)} u="ซม.²/ม." ok={Number.isFinite(r.AsTemp)} />
          <Item th="ใช้เหล็กกันร้าว" f="s ≤ 5t และ 0.45 ม." v={`${r.tempText} ม.`} />
          <Item th="หน่วยแรงยึดเหนี่ยว" f="u = V / (Σo·j·d)" v={fmt(r.u)} u={ksc} ok={r.uOk} note={`ไม่เกิน ${r.uLimit} ${ksc}`} />
          <Item th="แรงปฏิกิริยาถ่ายลงคาน" f="wL/2" v={fmt(r.reaction)} u="กก./ม." />
        </Sec>

        <Sec n={4} th="แผนภาพแรงและรายละเอียดการเสริมเหล็ก" en="Force diagrams & reinforcement detail"
          intro="รูปตัดตามความยาวบันไดแสดงเหล็กล่างงอปลายเข้าคาน เหล็กบนเหนือจุดรองรับยาว L/4 และเหล็กกันร้าว">
          <Figure caption="แผนภาพแรงเฉือน / โมเมนต์ ของแถบกว้าง 1 ม.">
            <ForceCharts L={s.L} fns={stairFns(s, r)} width={640} height={250} animate={false} />
          </Figure>
          <Figure caption="รูปตัดบันไดแสดงการเสริมเหล็ก">
            <Drawing model={stairSectionModel(s, r)} className="mx-auto h-[75mm]" fontSize={10} width={520} />
          </Figure>
        </Sec>
      </Doc>
    </div>
  );
}
