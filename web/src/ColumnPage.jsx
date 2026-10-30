import { Download, Layers, Ruler, Weight, Wrench } from "lucide-react";
import { GRADES, SLAB_BARS } from "../engine/tables.js";
import { spiralColumn, tiedColumn } from "../engine/column.js";
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { Doc, Figure, Item, Note, Sec } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { columnSectionModel, downloadDxf, spiralSectionModel } from "./drawings.js";
import InteractionChart from "./InteractionChart.jsx";
import Column3D from "./Column3D.jsx";

const ST = (L, d) => ({ L, bx: d, by: d, D: d });
const BM = (L, b, t) => ({ L, b, t });
export const DEFAULT_COLUMN = {
  colNo: "C1", shape: "tied", fcPrime: 180, fy: 4000, fys: 2400, Es: 2040000, cover: 3, L: 3,
  Bx: 25, By: 25, nx: 6, ny: 6, tieBar: "RB 9", tieSets: 1,
  D: 40, nBars: 8, spiralBar: "RB 9", sSpiral: 5,
  P: 30000, Mx: 800, My: 400, mainBar: "DB 16", frameCase: 2,
  beamTL: BM(450, 20, 40), beamTR: BM(450, 20, 40), beamBL: BM(450, 20, 45), beamBR: BM(450, 20, 45),
  colTop: ST(300, 25), colThis: ST(300, 25), colThisB: ST(300, 25), colBot: ST(150, 25),
};

const FRAME_CASES = [[1, "1. โครงไม่เซ (มีสิ่งยึดทางข้าง)"], [2, "2. โครงไม่เซ k = 1"], [3, "3. โครงเซ ยึดแน่นสองปลาย"],
  [4, "4. โครงเซ ปลายหนึ่งเป็นหมุด"], [5, "5. โครงเซ ปลายอิสระ (k = 2)"]];
const MODE_TEXT = { I: "แรงอัดควบคุม (e < ea)", II: "แรงอัดร่วมแรงดัด (ea ≤ e ≤ eb)", III: "แรงดึงควบคุม (e > eb)", NONE: "-" };
const GRADE_OPTS = Object.entries(GRADES).map(([k, g]) => [k, `${g} (${k})`]);
const BAR_OPTS = Object.keys(SLAB_BARS);

export function runColumn(c) {
  try {
    if (c.shape === "spiral") {
      const r = spiralColumn(c);
      // common view fields shared with the tied column UI
      return { r: { ...r, slenderRatio: r.LdRatio, nBarsUsed: c.nBars, barsText: `${c.nBars}-${c.mainBar}`,
        tieText: `${c.spiralBar} ระยะเกลียว ${c.sSpiral} ซม.`, okAll: r.ok && r.pgOk && Number.isFinite(r.R) && r.sOk } };
    }
    const r = tiedColumn(c);
    return { r: { ...r, slenderRatio: r.LbRatio, barsText: `${r.nBars}-${c.mainBar}`, okAll: r.ok && r.pgOk && Number.isFinite(r.R) } };
  } catch (e) {
    return { error: e.message };
  }
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

const sectionModel = (c, label) => c.shape === "spiral"
  ? spiralSectionModel({ D: c.D, cover: c.cover, spD: SLAB_BARS[c.spiralBar]?.d ?? 0.9, barD: SLAB_BARS[c.mainBar]?.d ?? 1.6, n: c.nBars, label })
  : columnSectionModel({ Bx: c.Bx, By: c.By, cover: c.cover, tieD: SLAB_BARS[c.tieBar]?.d ?? 0.9, barD: SLAB_BARS[c.mainBar]?.d ?? 1.6,
    nx: c.nx, ny: c.ny, label });

export function ColumnPage({ c, set, dark }) {
  const { r, error } = runColumn(c);
  const sp = c.shape === "spiral";
  const f = (key, label, unit, step) => (
    <Field label={label} unit={unit}><NumberInput value={c[key]} step={step} onChange={(v) => set(key, v)} /></Field>
  );
  const sel = (key, label, options, num) => (
    <Field label={label}><Select value={c[key]} onChange={(v) => set(key, num ? Number(v) : v)} options={options} /></Field>
  );
  return (
    <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[300px_1fr_1fr_1.15fr] xl:grid-rows-[auto_1fr]">
      <div className="space-y-4 xl:row-span-2 xl:overflow-y-auto">
        <Card title="ชนิดเสาและวัสดุ" icon={Wrench}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">{sel("shape", "ชนิดเสา", [["tied", "เสาปลอกเดี่ยว (สี่เหลี่ยม)"], ["spiral", "เสาปลอกเกลียว (กลม)"]])}</div>
            {f("fcPrime", "f'c", "ksc")}{f("cover", "ระยะหุ้ม", "cm")}
            {sel("fy", "เหล็กยืน", GRADE_OPTS, true)}{sel("fys", "เหล็กปลอก", GRADE_OPTS, true)}
          </div>
        </Card>
        <Card title="ขนาดเสาและแรง" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            {sp ? <>{f("D", "เส้นผ่าศูนย์กลาง D", "cm")}<div /></> : <>{f("Bx", "กว้าง Bx", "cm")}{f("By", "ลึก By", "cm")}</>}
            {f("L", "ความสูงเสา L", "m", "0.1")}{f("P", "แรงอัด P", "kg", "1000")}
            {f("Mx", "โมเมนต์ Mx", "kg-m", "100")}{f("My", "โมเมนต์ My", "kg-m", "100")}
            <div className="col-span-2">{sel("frameCase", "สภาพโครงข้อแข็ง", FRAME_CASES, true)}</div>
          </div>
        </Card>
        <Card title="เหล็กเสริม" icon={Weight}>
          <div className="grid grid-cols-2 gap-3">
            {sp ? <>{f("nBars", "จำนวนเหล็กยืน", "เส้น", "1")}{sel("mainBar", "เหล็กยืน", BAR_OPTS)}
              {sel("spiralBar", "เหล็กปลอกเกลียว", BAR_OPTS)}{f("sSpiral", "ระยะเกลียว", "cm", "0.5")}</>
              : <>{f("nx", "เหล็กด้าน x (2 ด้าน)", "เส้น", "2")}{f("ny", "เหล็กด้าน y (2 ด้าน)", "เส้น", "2")}
                {sel("mainBar", "เหล็กยืน", BAR_OPTS)}
                <Field label="เหล็กปลอก">
                  <div className="flex gap-1.5">
                    <div className="w-14 shrink-0"><NumberInput value={c.tieSets} step="1" min="1" onChange={(v) => set("tieSets", v)} /></div>
                    <Select value={c.tieBar} onChange={(v) => set("tieBar", v)} options={BAR_OPTS} />
                  </div>
                </Field></>}
          </div>
        </Card>
      </div>

      {r && (
        <div className="grid grid-cols-4 gap-3 md:grid-cols-8 xl:col-span-3">
          {[["Ag (cm²)", fmt(r.Ag, 0)], ["Ast (cm²)", fmt(r.Ast)], ["pg (%)", fmt(r.pg), r.pgOk],
            [sp ? "L/D" : "L/B", fmt(r.slenderRatio, 1), !r.slender], ["R", fmt(r.R, 3), Number.isFinite(r.R)],
            ["klu/r", fmt(r.klr, 1)], ["Pa (t)", fmt(r.Pa / 1000)], ["อัตราส่วน", fmt(r.mode === "I" ? r.axialRatio : r.ratio, 3), r.ok]].map(([l, v, o]) => (
            <div key={l} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
              <div className="text-[11px] text-gray-400">{l}</div>
              <div className="flex items-center justify-between text-base font-semibold tabular-nums">{v}{o !== undefined && <Badge ok={o} />}</div>
            </div>
          ))}
        </div>
      )}

      <Card title={<span className="flex w-full items-center justify-between">หน้าตัดเสา{r && <Badge ok={r.okAll}>{r.okAll ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"}</Badge>}</span>}
        icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {error ? <p className="text-sm text-red-600">{error}</p> : (
          <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-gray-50 p-4">
            <Drawing model={sectionModel(c)} className="h-[380px] w-full" width={320} fontSize={14} />
            <button onClick={() => downloadDxf(sectionModel(c, c.colNo), `${c.colNo}-section`)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50">
              <Download className="h-3.5 w-3.5" /> ดาวน์โหลด DXF (AutoCAD)
            </button>
            <div className="grid w-full max-w-md grid-cols-2 gap-3 text-center">
              {[["เหล็กยืน", r.barsText], [sp ? "เหล็กปลอกเกลียว" : "เหล็กปลอก", sp ? r.tieText : `${r.tieText} m.`]].map(([l, t]) => (
                <div key={l} className="rounded-xl bg-white px-3 py-2 shadow-theme-xs">
                  <div className="text-[11px] text-gray-400">{l}</div>
                  <div className="font-semibold text-gray-800">{t}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="ผลการตรวจสอบ" icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
        {r && (
          <div>
            <Row label="ชนิดเสา" value={r.slender ? `เสายาว (${sp ? "L/D ≥ 15" : "L/B > 15"})` : "เสาสั้น"} />
            <Row label="กรณีวิเคราะห์" value={MODE_TEXT[r.mode]} />
            <Row label="แรงอัดออกแบบ P / R" value={fmt(r.Pd, 0)} unit="kg" />
            <Row label="กำลังรับแรงอัดตามแนวแกน Pa" value={fmt(r.Pa, 0)} unit="kg" ok={r.mode === "I" ? r.ok : undefined} />
            {sp ? <>
              <Row label="โมเมนต์ลัพธ์ Mp = √(Mx² + My²)" value={fmt(r.Mpd, 0)} unit="kg-m" />
              <Row label="e / ea / eb" value={`${fmt(r.e)} / ${fmt(r.ea)} / ${fmt(r.eb)}`} unit="cm" />
              {r.mode === "II" && <Row label="fa/Fa + fb/Fb ≤ 1" value={fmt(r.ratio, 3)} ok={r.ok} />}
              {r.mode === "III" && <Row label="M/Mo ≤ 1" value={fmt(r.ratio, 3)} ok={r.ok} />}
              <Row label="อัตราส่วนเหล็กเกลียว ρs" value={fmt(r.rhoS, 4)} />
              <Row label="ระยะเกลียวที่ต้องการ / ใช้" value={`${fmt(r.sReq)} / ${fmt(c.sSpiral)}`} unit="cm" ok={r.sOk} />
            </> : <>
              <Row label="ex / ey" value={`${fmt(r.ex)} / ${fmt(r.ey)}`} unit="cm" />
              <Row label="eax / eay · ebx / eby" value={`${fmt(r.eax)} / ${fmt(r.eay)} · ${fmt(r.ebx)} / ${fmt(r.eby)}`} unit="cm" />
              {r.mode === "II" && <Row label="fa/Fa + fbx/Fb + fby/Fb ≤ 1" value={fmt(r.ratio, 3)} ok={r.ok} />}
              {r.mode === "III" && <Row label="Mx/Mox + My/Moy ≤ 1" value={fmt(r.ratio, 3)} ok={r.ok} />}
              <Row label="ระยะเหล็กปลอก ≤ 16db, 48dt, B" value={fmt(r.sTie, 1)} unit="cm" />
            </>}
            <Row label="Fa / Fb" value={`${fmt(r.Fa)} / ${fmt(r.Fb)}`} unit="ksc" />
            <Row label="ตัวคูณลดกำลัง R" value={fmt(r.R, 3)} ok={Number.isFinite(r.R)} />
            <Row label="pg (1% – 8%)" value={fmt(r.pg)} unit="%" ok={r.pgOk} />
          </div>
        )}
      </Card>

      <div className="flex min-h-0 flex-col gap-4">
        <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">
          <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
            แผนภาพปฏิสัมพันธ์ P–M
            <span className="text-[11px] font-normal text-gray-500">{sp ? "WSD · โมเมนต์ลัพธ์" : "WSD · แกน x และ y"}</span>
          </div>
          {r && <InteractionChart r={r} height={330} dark={dark} />}
        </section>
        {r && <Column3D c={c} r={r} dark={dark} className="min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-gray-200" />}
      </div>
    </main>
  );
}

export function ColumnReport({ c, project }) {
  const { r } = runColumn(c);
  if (!r) return <div className="report">ข้อมูลไม่ถูกต้อง</div>;
  const sp = c.shape === "spiral";
  const ksc = "กก./ซม.²";
  return (
    <div className="report">
      <Doc project={project} title={`รายการคำนวณออกแบบเสาคอนกรีตเสริมเหล็ก — ${sp ? "เสาปลอกเกลียว" : "เสาปลอกเดี่ยว"}`}
        subtitle={`Reinforced concrete ${sp ? "spiral" : "tied"} column design — Working Stress Design (WSD)`} memberLabel="เสา" member={c.colNo}
        summary={[
          ["ขนาดเสา", sp ? `กลม D = ${c.D} ซม.` : `${c.Bx} × ${c.By} ซม.`],
          ["ความสูง / ชนิด", `${c.L} ม. · ${r.slender ? "เสายาว" : "เสาสั้น"}`],
          ["เหล็กยืน", `${r.barsText} (pg = ${fmt(r.pg)}%)`, r.pgOk],
          [sp ? "เหล็กปลอกเกลียว" : "เหล็กปลอก", sp ? r.tieText : `${r.tieText} ม.`, sp ? r.sOk : undefined],
          ["แรงกระทำ", `P = ${fmt(c.P / 1000, 1)} ตัน · Mx/My = ${fmt(c.Mx, 0)}/${fmt(c.My, 0)} กก.-ม.`],
          ["ผลการตรวจสอบรวม", r.okAll ? "ผ่านทุกข้อ" : "มีรายการไม่ผ่าน", r.okAll],
        ]}>
        <Sec n={1} th="ข้อมูลออกแบบและแรงที่กระทำ" en="Design data & loads"
          intro={sp ? "เสากลมรับแรงอัดและโมเมนต์ดัดสองทิศ รวมโมเมนต์เป็นโมเมนต์ลัพธ์ Mp แล้วออกแบบแบบแกนเดียว"
            : "เสาสี่เหลี่ยมรับแรงอัดตามแนวแกนร่วมกับโมเมนต์ดัดรอบแกน x และแกน y"}>
          <Item th="ขนาดหน้าตัด" f={sp ? "D" : "Bx × By"} v={sp ? `${c.D}` : `${c.Bx} × ${c.By}`} u="ซม." />
          <Item th="ความสูงเสา (ระหว่างจุดยึด)" f="L" v={fmt(c.L)} u="ม." />
          <Item th="แรงอัดตามแนวแกน" f="P" v={fmt(c.P, 0)} u="กก." />
          <Item th="โมเมนต์ดัด" f="Mx / My" v={`${fmt(c.Mx, 0)} / ${fmt(c.My, 0)}`} u="กก.-ม." />
          {sp && <Item th="โมเมนต์ลัพธ์" f="Mp = √(Mx² + My²)" v={fmt(Math.hypot(c.Mx, c.My))} u="กก.-ม." />}
          <Item th="พื้นที่หน้าตัด" f={sp ? "Ag = πD²/4" : "Ag = Bx·By"} v={fmt(r.Ag)} u="ซม.²" />
          <Item th="เหล็กยืน" v={`${r.barsText} → Ast = ${fmt(r.Ast)} ซม.²`} />
          <Item th="อัตราส่วนเหล็กยืน" f="pg = Ast / Ag" v={fmt(r.pg)} u="%" ok={r.pgOk} note="ต้องอยู่ระหว่าง 1% ถึง 8%" />
        </Sec>

        <Sec n={2} th="หน่วยแรงที่ยอมให้และกำลังรับแรงอัด" en="Allowable stresses"
          intro="กำลังรับแรงอัดของเสาเกิดจากคอนกรีตร่วมกับเหล็กยืน ค่าที่ยอมให้คำนวณตามวิธีหน่วยแรงใช้งาน">
          <Item th={`f'c / เหล็ก ${GRADES[c.fy]}`} v={`${fmt(c.fcPrime, 0)} / ${fmt(c.fy, 0)}`} u={ksc} />
          <Item th="หน่วยแรงที่ยอมให้ในเหล็ก" f="fs = 0.4 fy" v={fmt(r.fs, 0)} u={ksc} />
          <Item th="อัตราส่วนโมดูลัส" f="n = Es / Ec" v={fmt(r.n)} />
          <Item th="ค่า m" f="m = fy / (0.85 f'c)" v={fmt(r.m)} />
          <Item th="หน่วยแรงอัดเฉลี่ยที่ยอมให้" f="Fa = 0.34(1 + pg·m)f'c" v={fmt(r.Fa)} u={ksc} />
          <Item th="หน่วยแรงดัดที่ยอมให้" f="Fb = 0.45 f'c" v={fmt(r.Fb)} u={ksc} />
          <Item th="กำลังรับแรงอัดตามแนวแกน" f={sp ? "Pa = Ag(0.25f'c + fs·pg)" : "Pa = 0.85Ag(0.25f'c + fs·pg)"} v={fmt(r.Pa, 0)} u="กก." />
        </Sec>

        <Sec n={3} th="ตรวจสอบความชะลูดของเสา" en="Slenderness"
          intro="เสาที่สูงมากเมื่อเทียบกับขนาดหน้าตัดจะโก่งเดาะได้ง่าย ต้องลดกำลังด้วยตัวคูณ R หรือเพิ่มแรงออกแบบเป็น P/R และ M/R">
          <Item th={sp ? "อัตราส่วนความสูงต่อเส้นผ่าศูนย์กลาง" : "อัตราส่วนความสูงต่อด้านแคบ"} f={sp ? "L/D < 15 = เสาสั้น" : "L/B ≤ 15 = เสาสั้น"}
            v={fmt(r.slenderRatio, 1)} note={r.slender ? "เป็นเสายาว ต้องลดกำลังด้วยค่า R" : "เป็นเสาสั้น ไม่ต้องขยายแรงออกแบบ"} />
          <Item th="สภาพโครงข้อแข็ง" v={FRAME_CASES.find(([k]) => k === c.frameCase)[1]} />
          <Item th="อัตราส่วนความแข็งเสาต่อคาน (บน / ล่าง)" f="r' = Σ(I/L)เสา / Σ(I/L)คาน" v={`${fmt(r.rTop, 3)} / ${fmt(r.rBot, 3)}`} />
          <Item th="อัตราส่วนความชะลูด" f="k·lu / r" v={fmt(r.klr, 1)} />
          <Item th="ตัวคูณลดกำลัง" f="R = 1.07 − 0.008·klu/r ≤ 1" v={fmt(r.R, 3)} ok={Number.isFinite(r.R)} />
          {r.slender && <Item th="แรงออกแบบหลังขยาย" f="P/R" v={fmt(r.Pd, 0)} u="กก." />}
        </Sec>

        <Sec n={4} th="ตรวจสอบกำลังรับแรงอัดร่วมแรงดัด" en="Combined axial load & bending"
          intro="เทียบระยะเยื้องศูนย์ e = M/P กับค่าขอบเขต ea และ eb: ถ้า e น้อยมาก แรงอัดควบคุม ตรวจ P ≤ Pa ถ้าอยู่ระหว่างกลาง ตรวจผลรวมสัดส่วนหน่วยแรง ถ้ามาก เหล็กรับแรงดึงควบคุม ตรวจสัดส่วนโมเมนต์">
          {sp ? <>
            <Item th="ระยะเยื้องศูนย์" f="e = Mp / P" v={fmt(r.e)} u="ซม." />
            <Item th="ขอบเขตแรงอัดควบคุม / จุดสมดุล" f="ea , eb" v={`${fmt(r.ea)} / ${fmt(r.eb)}`} u="ซม." />
          </> : <>
            <Item th="ระยะเยื้องศูนย์" f="ex = My/P , ey = Mx/P" v={`${fmt(r.ex)} / ${fmt(r.ey)}`} u="ซม." />
            <Item th="ขอบเขตแรงอัดควบคุม" f="eax / eay" v={`${fmt(r.eax)} / ${fmt(r.eay)}`} u="ซม." />
            <Item th="ระยะเยื้องศูนย์ที่จุดสมดุล" f="ebx / eby" v={`${fmt(r.ebx)} / ${fmt(r.eby)}`} u="ซม." />
          </>}
          <Item th="กรณีที่ควบคุมการออกแบบ" v={MODE_TEXT[r.mode]} />
          {r.mode === "I" && <Item th="ตรวจแรงอัด" f="P ≤ Pa" v={`${fmt(r.Pd, 0)} ≤ ${fmt(r.Pa, 0)}`} u="กก." ok={r.ok} />}
          {r.mode === "II" && <Item th="ตรวจสัดส่วนหน่วยแรง" f={sp ? "fa/Fa + fb/Fb ≤ 1" : "fa/Fa + fbx/Fb + fby/Fb ≤ 1"} v={fmt(r.ratio, 3)} ok={r.ok} />}
          {r.mode === "III" && <Item th="ตรวจสัดส่วนโมเมนต์" f={sp ? "Mp/Mo ≤ 1" : "Mx/Mox + My/Moy ≤ 1"} v={fmt(r.ratio, 3)} ok={r.ok} />}
          <Figure caption="แผนภาพปฏิสัมพันธ์แรงอัด–โมเมนต์ (เส้นขีดจำกัด) และจุดแรงออกแบบ">
            <div className="flex items-center justify-center gap-4">
              <InteractionChart r={r} width={430} height={240} animate={false} />
              <Drawing model={sectionModel(c, c.colNo)} className="h-[50mm] w-[50mm]" fontSize={12} width={200} />
            </div>
          </Figure>
        </Sec>

        <Sec n={5} th={sp ? "ออกแบบเหล็กปลอกเกลียว" : "ออกแบบเหล็กปลอก"} en={sp ? "Spiral" : "Ties"}
          intro={sp ? "เหล็กปลอกเกลียวโอบรัดแกนคอนกรีต ปริมาณต้องเพียงพอชดเชยกำลังของคอนกรีตส่วนที่หุ้มอยู่นอกเกลียว"
            : "เหล็กปลอกยึดเหล็กยืนไม่ให้โก่งเดาะออกด้านข้าง ระยะเรียงต้องไม่เกินค่าน้อยที่สุดจากสามเงื่อนไข"}>
          {sp ? <>
            <Item th="เส้นผ่าศูนย์กลางแกนคอนกรีต" f="Dc = D − 2·ระยะหุ้ม" v={fmt(r.Dc)} u="ซม." />
            <Item th="อัตราส่วนเหล็กเกลียวที่ต้องการ" f="ρs = 0.45((D/Dc)² − 1)·f'c/fy" v={fmt(r.rhoS, 4)} />
            <Item th="ระยะเกลียวที่ต้องการ" f="s = 4·Asp / (ρs·Dc)" v={fmt(r.sReq)} u="ซม." />
            <Item th="ระยะเกลียวสูงสุด" f="s ≤ Dc / 6" v={fmt(r.sMax)} u="ซม." />
            <Item th="ระยะเกลียวที่ใช้" v={`${c.spiralBar} @ ${c.sSpiral} ซม.`} ok={r.sOk} />
          </> : <>
            <Item th="ระยะเรียงไม่เกิน 16 เท่าเหล็กยืน" f="16·db" v={fmt(16 * SLAB_BARS[c.mainBar].d, 1)} u="ซม." />
            <Item th="ระยะเรียงไม่เกิน 48 เท่าเหล็กปลอก" f="48·dt" v={fmt(48 * SLAB_BARS[c.tieBar].d, 1)} u="ซม." />
            <Item th="ระยะเรียงไม่เกินด้านแคบของเสา" f="min(Bx, By)" v={fmt(Math.min(c.Bx, c.By), 1)} u="ซม." />
            <Item th="ใช้เหล็กปลอก" v={`${r.tieText} ม.`} />
          </>}
          {!r.ok && <Note>หน้าตัดไม่ผ่านการตรวจกำลัง ควรเพิ่มขนาดเสา เพิ่มปริมาณเหล็กยืน หรือใช้คอนกรีตกำลังสูงขึ้น</Note>}
        </Sec>
      </Doc>
    </div>
  );
}
