import { Download, Layers, Ruler, Weight, Wrench } from "lucide-react";
import Drawing from "./Drawing.jsx";
import { downloadDxf, slabSectionModel } from "./drawings.js";
import { GRADES, ONE_WAY_SUPPORTS, SLAB_BARS, TWO_WAY_CASES } from "../engine/tables.js";
import { oneWay, cantilever, twoWay } from "../engine/slab.js";
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";
import { fmt, spanFunctions } from "./beamModel.js";
import ForceCharts from "./ForceCharts.jsx";
import Slab3D from "./Slab3D.jsx";

export const DEFAULT_SLAB = {
  kind: "twoway", slabNo: "S1",
  fcPrime: 180, F: 0.45, capFc: true, fy: 2400, Es: 2040000, cover: 2, unitWeight: 2400,
  t: 0.1, S: 3, L: 4, extra: 100, live: 200, P: 0, a: 0,
  support: "one_end", case: 2, mainBar: "RB 9", tempBar: "RB 9", shortBar: "RB 9", longBar: "RB 9",
};

const KINDS = [["oneway", "พื้นทางเดียว (One-way)"], ["twoway", "พื้นสองทาง (Two-way)"], ["cantilever", "พื้นยื่น (Cantilever)"]];
const BAR_OPTS = Object.keys(SLAB_BARS);
const GRADE_OPTS = Object.entries(GRADES).map(([k, g]) => [k, `${g} (${k})`]);

export function runSlab(s) {
  try {
    if (s.kind === "oneway") return { r: oneWay(s) };
    if (s.kind === "cantilever") return { r: cantilever(s) };
    return { r: twoWay(s) };
  } catch (e) {
    return { error: e.message };
  }
}

// V(x), M(x) for a 1 m strip; continuous ends carry the design moment as hogging end moment.
const fnCache = new Map();
export function slabFns(s, r) {
  const key = [s.kind, s.support, s.case, s.L, s.S, r.w, r.M, r.MS, s.P, s.a].join("|");
  if (!fnCache.has(key)) {
    if (s.kind === "twoway") {
      // short-direction strip: hogging ends from the Method 2 moments (left = discontinuous, right = continuous
      // edge, as in the section drawing) and an equivalent load that reproduces the midspan M+
      const [mDis, mPos, mCont] = r.MS;
      const [ML, MR] = s.case === 1 ? [mCont, mCont] : s.case === 5 ? [mDis, mDis] : [mDis, mCont];
      const w = (8 * (mPos + (ML + MR) / 2)) / s.S ** 2;
      fnCache.set(key, spanFunctions("span", s.S, w, ML, MR));
    } else {
      const ends = { simple: [0, 0], one_end: [0, r.M], both_ends: [r.M, r.M] }[s.support] ?? [0, 0];
      fnCache.set(key, s.kind === "cantilever"
        ? spanFunctions("cantilever", s.L, r.w, 0, 0, { P: s.P, a: s.a })
        : spanFunctions("span", s.L, r.w, ends[0], ends[1]));
    }
  }
  return fnCache.get(key);
}

export function slabOk(s, r) {
  const base = r.nOk && r.minTOk && r.dOk;
  if (s.kind === "twoway") return base && r.McSOk && r.McLOk;
  return base && r.VcOk && r.McOk && r.uOk && Number.isFinite(r.sTemp);
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

export function SlabPage({ s, set, dark }) {
  const { r, error } = runSlab(s);
  const f = (key, label, unit, step) => (
    <Field label={label} unit={unit}><NumberInput value={s[key]} step={step} onChange={(v) => set(key, v)} /></Field>
  );
  const sel = (key, label, options, num) => (
    <Field label={label}><Select value={s[key]} onChange={(v) => set(key, num ? Number(v) : v)} options={options} /></Field>
  );
  const two = s.kind === "twoway";
  const ok = r && slabOk(s, r);
  return (
    <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[300px_1fr_1fr_1.15fr] xl:grid-rows-[auto_1fr]">
      <div className="space-y-4 xl:row-span-2 xl:overflow-y-auto">
        <Card title="ชนิดพื้นและวัสดุ" icon={Wrench}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{sel("kind", "ชนิดพื้น", KINDS)}</div>
            {f("fcPrime", "f'c", "ksc")}
            {sel("F", "fc = F·f'c", [[0.375, "0.375 f'c"], [0.45, "0.45 f'c"]], true)}
            {sel("fy", "เหล็กเสริม", GRADE_OPTS, true)}
            {f("cover", "ระยะหุ้ม", "cm")}
          </div>
        </Card>
        <Card title="ขนาดและน้ำหนัก" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            {two ? sel("case", "กรณีขอบ", Object.entries(TWO_WAY_CASES).map(([k, c]) => [k, `${k}. ${c.label}`]), true)
              : s.kind === "oneway" ? sel("support", "การรองรับ", Object.entries(ONE_WAY_SUPPORTS).map(([k, c]) => [k, c.label]))
                : f("P", "แรงจุดที่ปลาย P", "kg")}
            {s.kind === "cantilever" ? f("a", "ระยะแรงจุด a", "m", "0.1") : f("t", "หนา t", "m", "0.01")}
            {s.kind === "cantilever" && f("t", "หนา t", "m", "0.01")}
            {two ? <>{f("S", "ช่วงสั้น S", "m", "0.1")}{f("L", "ช่วงยาว L", "m", "0.1")}</> : f("L", s.kind === "cantilever" ? "ระยะยื่น L" : "ช่วงพื้น L", "m", "0.1")}
            {f("extra", "น้ำหนักวัสดุปู", "kg/m²")}{f("live", "น้ำหนักจร", "kg/m²")}
          </div>
        </Card>
        <Card title="เหล็กเสริม" icon={Weight}>
          <div className="grid grid-cols-2 gap-3">
            {two ? <>{sel("shortBar", "ทิศทางสั้น", BAR_OPTS)}{sel("longBar", "ทิศทางยาว", BAR_OPTS)}</>
              : <>{sel("mainBar", "เหล็กหลัก", BAR_OPTS)}{sel("tempBar", "เหล็กกันร้าว", BAR_OPTS)}</>}
          </div>
        </Card>
      </div>

      {r && (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8 xl:col-span-3">
          {[["w รวม (kg/m²)", fmt(r.w, 0)], ["n", fmt(r.n), r.nOk], ["k", fmt(r.k, 4)], ["j", fmt(r.j, 4)], ["R (ksc)", fmt(r.R)],
            [two ? "m = S/L" : "M (kg-m/m)", two ? fmt(r.m) : fmt(r.M)], ["หนาต่ำสุด (m)", fmt(r.minT, 3), r.minTOk],
            ["d ต้องการ (cm)", fmt(r.dReq), r.dOk]].map(([l, v, o]) => (
            <div key={l} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="text-[11px] text-gray-400">{l}</div>
              <div className="flex items-center justify-between text-base font-semibold tabular-nums">{v}{o !== undefined && <Badge ok={o} />}</div>
            </div>
          ))}
        </div>
      )}

      <Card title={<span className="flex w-full items-center justify-between">รูปตัดและเหล็กเสริม{r && <Badge ok={ok}>{ok ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"}</Badge>}</span>}
        icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {error ? <p className="text-sm text-red-600">{error}</p> : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-50 p-4">
            <Drawing model={slabSectionModel(s, r)} className="h-[380px] w-full" width={560} fontSize={14} />
            <button onClick={() => downloadDxf(slabSectionModel(s, r), `${s.slabNo}-plan`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลด DXF (AutoCAD)
            </button>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 text-center">
              {(two ? [["ทิศทางสั้น", r.shortText], ["ทิศทางยาว", r.longText]] : [["เหล็กหลัก", r.mainText], ["เหล็กกันร้าว", r.tempText]]).map(([l, t]) => (
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
        {r && (two ? (
          <div>
            <table className="mb-3 w-full text-[13px] tabular-nums">
              <thead className="text-[11px] text-gray-400">
                <tr><th className="text-left font-normal">โมเมนต์ (kg-m/m)</th><th className="font-normal">M− ไม่ต่อเนื่อง</th><th className="font-normal">M+ กลาง</th><th className="font-normal">M− ต่อเนื่อง</th></tr>
              </thead>
              <tbody>
                {[["ช่วงสั้น S", r.MS, r.sS], ["ช่วงยาว L", r.ML, r.sL]].map(([l, M, sp]) => (
                  <tr key={l} className="border-t border-gray-100">
                    <td className="py-1 text-gray-500">{l}</td>
                    {M.map((x, i) => <td key={i} className="text-center">{fmt(x)}<div className="text-[11px] text-gray-400">{sp[i] === null ? "—" : `@ ${sp[i]}`}</div></td>)}
                  </tr>
                ))}
              </tbody>
            </table>
            <Row label="Mc ช่วงสั้น = R·d²" value={fmt(r.McS)} unit="kg-m" ok={r.McSOk} />
            <Row label="Mc ช่วงยาว" value={fmt(r.McL)} unit="kg-m" ok={r.McLOk} />
            <Row label="d ช่วงสั้น / ยาว" value={`${fmt(r.dS)} / ${fmt(r.dL)}`} unit="cm" />
            <Row label="ความหนาต่ำสุด (เส้นรอบรูป/180)" value={fmt(r.minT, 3)} unit="m" ok={r.minTOk} />
            <Row label="ถ่ายน้ำหนักลงคานช่วงสั้น / ยาว" value={`${fmt(r.loadShortSide)} / ${fmt(r.loadLongSide)}`} unit="kg/m" />
          </div>
        ) : (
          <div>
            <Row label="โมเมนต์ M" value={fmt(r.M)} unit="kg-m/m" />
            <Row label="Mc = R·d²" value={fmt(r.Mc)} unit="kg-m" ok={r.McOk} />
            <Row label="แรงเฉือน V ≤ Vc" value={`${fmt(r.V)} / ${fmt(r.Vc)}`} unit="kg" ok={r.VcOk} />
            <Row label="As ต้องการ" value={fmt(r.As)} unit="cm²/m" />
            <Row label="As กันร้าว" value={fmt(r.AsTemp)} unit="cm²/m" ok={Number.isFinite(r.AsTemp)} />
            <Row label="แรงยึดเหนี่ยว u" value={fmt(r.u)} unit={`ksc ≤ ${r.uLimit}`} ok={r.uOk} />
            <Row label="ความหนาต่ำสุด" value={fmt(r.minT, 3)} unit="m" ok={r.minTOk} />
            <Row label="แรงปฏิกิริยาลงคาน" value={fmt(r.reaction)} unit="kg/m" />
          </div>
        ))}
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
            แผนภาพแรงเฉือน / โมเมนต์
            <span className="text-[11px] font-normal text-gray-500">{two ? "แถบกว้าง 1 ม. ทิศทางสั้น" : "แถบกว้าง 1 ม."}</span>
          </div>
          {r && <ForceCharts L={two ? s.S : s.L} fns={slabFns(s, r)} height={330} dark={dark} />}
        </section>
        {r && <Slab3D s={s} r={r} dark={dark} className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-gray-200" />}
      </div>
    </main>
  );
}


const SUPPORT_TH = { simple: "ปลายวางอิสระทั้งสองด้าน", one_end: "ต่อเนื่องด้านเดียว", both_ends: "ต่อเนื่องทั้งสองด้าน" };

export function SlabReport({ s, project }) {
  const { r } = runSlab(s);
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const two = s.kind === "twoway", cant = s.kind === "cantilever";
  const kindTh = { oneway: "พื้นทางเดียว", twoway: "พื้นสองทาง", cantilever: "พื้นยื่น" }[s.kind];
  const ok = slabOk(s, r);
  return (
    <div className="report">
      <Doc project={project} title={`รายการคำนวณออกแบบพื้นคอนกรีตเสริมเหล็ก — ${kindTh}`}
        subtitle="Reinforced concrete slab design — Working Stress Design (WSD)" memberLabel="พื้น" member={s.slabNo}
        summary={[
          ["ชนิดพื้น", two ? `${kindTh} กรณีที่ ${s.case}` : cant ? kindTh : `${kindTh} ${SUPPORT_TH[s.support]}`],
          ["ความหนา / ช่วง", two ? `${s.t * 100} ซม. · ${s.S}×${s.L} ม.` : `${s.t * 100} ซม. · L = ${s.L} ม.`],
          [two ? "เหล็กทิศทางสั้น" : "เหล็กหลัก", `${two ? r.shortText : r.mainText} ม.`],
          [two ? "เหล็กทิศทางยาว" : "เหล็กกันร้าว", `${two ? r.longText : r.tempText} ม.`],
          ["น้ำหนักบรรทุกรวม", `${fmt(r.w, 0)} กก./ม.²`],
          ["ผลการตรวจสอบรวม", ok ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", ok],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบและน้ำหนักบรรทุก" en="Design data & loads"
          intro="คิดพื้นเป็นแถบกว้าง 1 เมตร น้ำหนักบรรทุกรวมเท่ากับน้ำหนักพื้นเอง บวกน้ำหนักวัสดุปูผิว บวกน้ำหนักจรตามประเภทการใช้งานอาคาร">
          <Item th="ชนิดของพื้น" v={kindTh} />
          {two ? <Item th="สภาพขอบพื้น" v={`กรณีที่ ${s.case}: ${TWO_WAY_CASES[s.case].label}`} />
            : cant ? <Item th="แรงจุดที่ปลายพื้น / ระยะ" f="P , a" v={`${fmt(s.P, 0)} กก. @ ${s.a} ม.`} />
              : <Item th="สภาพการรองรับ" v={SUPPORT_TH[s.support]} />}
          {two ? <>
            <Item th="ช่วงสั้น / ช่วงยาว" f="S , L" v={`${fmt(s.S)} / ${fmt(s.L)}`} u="ม." />
            <Item th="อัตราส่วนช่วงพื้น" f="m = S / L (ไม่น้อยกว่า 0.5)" v={fmt(r.m)} />
          </> : <Item th={cant ? "ระยะยื่น" : "ความยาวช่วงพื้น"} f="L" v={fmt(s.L)} u="ม." />}
          <Item th="ความหนาพื้น" f="t" v={fmt(s.t)} u="ม." />
          <Item th="น้ำหนักพื้นเอง" f={`${s.unitWeight}·t`} v={fmt(r.selfWeight)} u="กก./ม.²" />
          <Item th="น้ำหนักวัสดุปูผิวและอื่น ๆ" v={fmt(s.extra)} u="กก./ม.²" />
          <Item th="น้ำหนักจร" v={fmt(s.live)} u="กก./ม.²" />
          <Item th="น้ำหนักบรรทุกรวม" f="w" v={fmt(r.w)} u="กก./ม.²" />
        </Sec>

        <Sec n={2} th="คุณสมบัติวัสดุและค่าคงที่" en="Materials & constants"
          intro="ค่าคงที่ของวิธีหน่วยแรงใช้งาน ใช้หาความลึกที่ต้องการและปริมาณเหล็กเสริม">
          <Item th="กำลังอัดคอนกรีต / หน่วยแรงที่ยอมให้" f={`fc = ${s.F}·f'c${s.capFc ? " ≤ 65" : ""}`} v={`${fmt(s.fcPrime, 0)} / ${fmt(r.fc)}`} u="กก./ซม.²" />
          <Item th={`เหล็ก ${GRADES[s.fy]}: fy / fs`} v={`${fmt(s.fy, 0)} / ${fmt(r.fs, 0)}`} u="กก./ซม.²" />
          <Item th="อัตราส่วนโมดูลัส" f="n = Es / Ec" v={fmt(r.n)} ok={r.nOk} />
          <Item th="ค่าคงที่ k / j" f="k = 1/(1 + fs/(n·fc)) , j = 1 − k/3" v={`${fmt(r.k, 4)} / ${fmt(r.j, 4)}`} />
          <Item th="ค่าต้านทานโมเมนต์" f="R = ½·fc·k·j" v={fmt(r.R, 3)} u="กก./ซม.²" />
          <Item th="ความหนาพื้นน้อยที่สุด" f={two ? "min(0.08, เส้นรอบรูป/180)" : cant ? "L/10" : `L/${ONE_WAY_SUPPORTS[s.support].tDiv}`}
            v={fmt(r.minT, 3)} u="ม." ok={r.minTOk} note="เพื่อไม่ต้องตรวจการแอ่นตัวเพิ่ม" />
        </Sec>

        {two ? (
          <Sec n={3} th="โมเมนต์และเหล็กเสริม (วิธีที่ 2 ของ ACI / ว.ส.ท.)" en="Moments & reinforcement"
            intro="โมเมนต์ในแต่ละทิศ = สัมประสิทธิ์ C (ขึ้นกับอัตราส่วน m และสภาพขอบพื้น) × w × S² แล้วหาเหล็กเสริมและระยะเรียงของแต่ละตำแหน่ง">
            <table className="mb-2 w-full break-inside-avoid border-collapse text-center text-[9pt] tabular-nums">
              <thead><tr className="bg-[#eef2ff]">{["ทิศทาง", "รายการ", "M− ขอบไม่ต่อเนื่อง", "M+ กลางช่วง", "M− ขอบต่อเนื่อง"].map((h) => <th key={h} className="border border-[#d0d5dd] px-1 py-0.5 font-semibold">{h}</th>)}</tr></thead>
              <tbody>
                {[["ช่วงสั้น S", r.coefS, r.MS, r.AsS, r.sS, r.dS], ["ช่วงยาว L", r.coefL, r.ML, r.AsL, r.sL, r.dL]].map(([l, C, M, As, sp, d]) => (
                  [["สัมประสิทธิ์ C", C.map((x) => fmt(x, 4))], ["M = C·w·S² (กก.-ม.)", M.map((x) => fmt(x))], ["As (ซม.²/ม.)", As.map((x) => fmt(x))],
                    ["ระยะเรียง (ม.)", sp.map((x) => (x === null ? "-" : fmt(x)))]].map(([rl, vals], ri) => (
                    <tr key={l + ri}>
                      {ri === 0 && <td rowSpan={4} className="border border-[#d0d5dd] px-1">{l}<br /><span className="text-[8pt] text-[#667085]">d = {fmt(d)} ซม.</span></td>}
                      <td className="border border-[#d0d5dd] px-1 text-left">{rl}</td>
                      {vals.map((x, i) => <td key={i} className="border border-[#d0d5dd] px-1">{x}</td>)}
                    </tr>
                  ))
                ))}
              </tbody>
            </table>
            <Item th="ความลึกประสิทธิผลที่ต้องการ" f="d = √(Mmax / R)" v={fmt(r.dReq)} u="ซม." ok={r.dOk} />
            <Item th="กำลังรับโมเมนต์ ช่วงสั้น" f="Mc = R·d²" v={fmt(r.McS)} u="กก.-ม." ok={r.McSOk} />
            <Item th="กำลังรับโมเมนต์ ช่วงยาว" f="Mc = R·d²" v={fmt(r.McL)} u="กก.-ม." ok={r.McLOk} />
            <Item th="ใช้เหล็กทิศทางสั้น" f="s ≤ 3t" v={`${r.shortText} ม.`} />
            <Item th="ใช้เหล็กทิศทางยาว" f="s ≤ 3t" v={`${r.longText} ม.`} />
            <Item th="น้ำหนักถ่ายลงคาน ด้านสั้น / ด้านยาว" f="wS/3 , wS/3·(3 − m²)/2" v={`${fmt(r.loadShortSide)} / ${fmt(r.loadLongSide)}`} u="กก./ม." />
          </Sec>
        ) : (
          <Sec n={3} th="โมเมนต์ แรงเฉือน และเหล็กเสริม (แถบกว้าง 1 ม.)" en="Moment, shear & reinforcement"
            intro={cant ? "พื้นยื่นรับโมเมนต์ลบสูงสุดที่โคน เหล็กหลักจึงอยู่ด้านบน และต้องยึดเข้าไปในพื้นหรือคานด้านใน"
              : "หาโมเมนต์ด้วยสัมประสิทธิ์ของพื้นทางเดียว ตรวจความลึก แรงเฉือน แล้วหาเหล็กหลักและเหล็กกันร้าว"}>
            <Item th="โมเมนต์ออกแบบ" f={cant ? "M = wL²/2 + P·a" : `M = wL²/${ONE_WAY_SUPPORTS[s.support].mDiv}`} v={fmt(r.M)} u="กก.-ม." />
            <Item th="แรงเฉือนออกแบบ" f={cant ? "V = wL + P" : "V ที่ระยะ d จากขอบ"} v={fmt(r.V)} u="กก." />
            <Item th="ความลึกประสิทธิผล" f="d = t − ระยะหุ้ม − db/2" v={fmt(r.d)} u="ซม." />
            <Item th="ความลึกที่ต้องการ" f="d = √(M / R)" v={fmt(r.dReq)} u="ซม." ok={r.dOk} />
            <Item th="กำลังรับโมเมนต์ของคอนกรีต" f="Mc = R·b·d²" v={fmt(r.Mc)} u="กก.-ม." ok={r.McOk} />
            <Item th="แรงเฉือนที่คอนกรีตรับได้" f="Vc = 0.29·√f'c·b·d" v={fmt(r.Vc)} u="กก." ok={r.VcOk} />
            <Item th="เหล็กหลักที่ต้องการ" f="As = M / (fs·j·d)" v={fmt(r.As)} u="ซม.²/ม." />
            <Item th="ใช้เหล็กหลัก" f="s ≤ 3t และ 0.45 ม." v={`${r.mainText} ม.`} />
            <Item th="เหล็กกันร้าว (ป้องกันการแตกร้าวจากอุณหภูมิ)" f="As = ρ·b·t" v={fmt(r.AsTemp)} u="ซม.²/ม." ok={Number.isFinite(r.AsTemp)} />
            <Item th="ใช้เหล็กกันร้าว" f="s ≤ 5t และ 0.45 ม." v={`${r.tempText} ม.`} />
            <Item th="หน่วยแรงยึดเหนี่ยว" f="u = V / (Σo·j·d)" v={fmt(r.u)} u="กก./ซม.²" ok={r.uOk} note={`ไม่เกิน ${r.uLimit} กก./ซม.²`} />
            <Item th="แรงปฏิกิริยาถ่ายลงคาน" v={fmt(r.reaction)} u="กก./ม." />
          </Sec>
        )}

        <Sec n={4} th="แผนภาพแรงและรายละเอียดการเสริมเหล็ก" en="Force diagrams & reinforcement detail"
          intro="รูปตัดแสดงตำแหน่งเหล็กบน–ล่าง ระยะยื่นของเหล็กบนเหนือจุดรองรับ และเหล็กกระจาย">
          <Figure caption={two ? "แผนภาพแรงเฉือน / โมเมนต์ ของแถบกว้าง 1 ม. ทิศทางสั้น" : "แผนภาพแรงเฉือน / โมเมนต์ ของแถบกว้าง 1 ม."}>
            <ForceCharts L={two ? s.S : s.L} fns={slabFns(s, r)} width={640} height={260} animate={false} />
          </Figure>
          <Figure caption="รูปตัดพื้นแสดงการเสริมเหล็ก">
            <Drawing model={slabSectionModel(s, r)} className="mx-auto h-[62mm]" fontSize={10} width={520} />
          </Figure>
        </Sec>
      </Doc>
    </div>
  );
}
