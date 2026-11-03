// Wall (strip) footing in the single-member footing tool: inputs per metre of wall, every WSD check with its value, a section
// drawing and the report (engine/wallFooting.js, diff-tested against the user's "Wall footings" sheet).
import { Badge, Card, Field, NumberInput, Select } from "./ui.jsx";
import { Doc, Figure, Item, Sec } from "./ReportKit.jsx";
import { fmt } from "./beamModel.js";
import { GRADES, SLAB_BARS } from "../engine/tables.js";
import { wallFooting } from "../engine/wallFooting.js";
import { Wrench, Ruler } from "lucide-react";

export const wallInput = (f) => ({ fcPrime: f.fcPrime, F: f.F, capFc: f.capFc, fy: f.fy, Es: f.Es, cover: f.cover, t: f.wt ?? 0.2, B: f.wB ?? 1.2, Df: f.Df,
  P: f.wP ?? 8000, M: f.wM ?? 0, qa: f.qa, gamma: f.gamma, bw: f.wbw ?? 0.2, longBar: f.longBar, shortBar: f.wShortBar ?? "DB 12",
  dowelBar: f.dowelBar, sLong: f.sLong, sShort: f.wsShort ?? 0.2, dowelN: f.dowelN });
export const runWall = (f) => { try { return { r: wallFooting(wallInput(f)) }; } catch (e) { return { error: e.message }; } };

// section across the wall: footing, wall, soil line, main bars (dots along the bottom), distribution bars
function Section({ i, r }) {
  const s = 220 / Math.max(i.B, 1), W = i.B * s, T = i.t * s, Df = i.Df * s, bw = i.bw * s, x0 = 30, y0 = 30 + Df;
  return (
    <svg viewBox={`0 0 ${W + 60} ${Df + 90}`} className="mx-auto h-[60mm] w-full">
      <line x1={0} x2={W + 60} y1={30} y2={30} stroke="#98a2b3" strokeDasharray="6 4" />
      <text x={4} y={24} fontSize={9} fill="#667085">ระดับดิน</text>
      <rect x={x0 + W / 2 - bw / 2} y={10} width={bw} height={y0 - T - 10} fill="#e8d8c3" stroke="#475467" />
      <rect x={x0} y={y0 - T} width={W} height={T} fill="#f2f4f7" stroke="#344054" strokeWidth={1.5} />
      {Array.from({ length: Math.max(2, r.nTemp) }, (_, k) => <circle key={k} cx={x0 + 8 + ((W - 16) * k) / Math.max(1, r.nTemp - 1)} cy={y0 - (i.cover / 100) * s - 6} r={2.2} fill="#465fff" />)}
      <line x1={x0 + 6} x2={x0 + W - 6} y1={y0 - (i.cover / 100) * s - 2} y2={y0 - (i.cover / 100) * s - 2} stroke="#d92d20" strokeWidth={2} />
      <text x={x0 + W / 2} y={y0 + 14} textAnchor="middle" fontSize={9} fill="#344054">B = {fmt(i.B, 2)} ม. · t = {fmt(i.t, 2)} ม. · Df = {fmt(i.Df, 2)} ม.</text>
      <text x={x0 + W / 2} y={y0 + 28} textAnchor="middle" fontSize={9} fill="#d92d20">หลัก {r.mainText} (ขวางผนัง)</text>
      <text x={x0 + W / 2} y={y0 + 42} textAnchor="middle" fontSize={9} fill="#465fff">กันร้าว {r.tempText} (ตามแนวผนัง)</text>
    </svg>
  );
}

const checks = (i, r) => [
  ["แรงดันดินสูงสุด", "q max ≤ qa", `${fmt(r.qmax, 0)} ≤ ${fmt(i.qa, 0)}`, "กก./ม.²", r.qOk], ["แรงดันดินต่ำสุด", "q min ≥ 0", fmt(r.qmin, 0), "กก./ม.²", r.qminOk],
  ["โมเมนต์ที่หน้าผนัง", "M", fmt(r.M, 0), "กก.-ม./ม."], ["ความลึกประสิทธิผล", "d ≥ √(M/Rb)", `${fmt(r.d, 2)} ≥ ${fmt(r.dReq, 2)}`, "ซม.", r.dOk],
  ["แรงเฉือนที่ระยะ d", "v ≤ 0.29√f'c", `${fmt(r.v, 2)} ≤ ${fmt(r.vc, 2)}`, "กก./ซม.²", r.vOk],
  ["เหล็กหลักขวางผนัง", "As ≥ M/(fs·j·d), 14/fy·b·d", `${fmt(r.AsProv, 2)} ≥ ${fmt(Math.max(r.AsReq, r.AsMin), 2)}`, "ซม.²/ม.", r.AsOk],
  ["แรงยึดเหนี่ยว", "Σo ≥ V/(u·j·d)", `${fmt(r.perim, 2)} ≥ ${fmt(r.perimReq, 2)}`, "ซม.", r.perimOk], ["ระยะฝังเหล็กหลัก", "ld ≤ ระยะที่มี", `${fmt(r.anc, 1)} ≤ ${fmt(r.ancAvail, 1)}`, "ซม.", r.ancOk],
  ["เหล็กกันร้าวตามแนวผนัง", "As ≥ 0.002·B·t", `${fmt(r.AsTemp, 2)} ≥ ${fmt(r.AsTempMin, 2)}`, "ซม.²", r.AsTempOk],
  ["เหล็กเดือย", "Σo ≥ ที่ต้องการ", `${fmt(r.perimD, 2)} ≥ ${fmt(r.perimReqD, 2)}`, "ซม.", r.perimDOk], ["ระยะฝังเหล็กเดือย", "", fmt(r.ancUseD, 2), "ม."],
  ["แรงแบกทานใต้ผนัง", "P / (bw·100)", fmt(r.bearing, 2), "กก./ซม.²"]];

export function WallFootingPage({ f, set }) {
  const i = wallInput(f), { r, error } = runWall(f);
  const n = (key, label, unit, step, def) => <Field label={label} unit={unit}><NumberInput value={f[key] ?? def} step={step} onChange={(v) => set(key, v)} /></Field>;
  const bars = Object.keys(SLAB_BARS).map((b) => [b, b]);
  return (
    <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[320px_1fr_1fr]">
      <div className="space-y-4 xl:overflow-y-auto">
        <Card title="ฐานรากแถบใต้ผนัง (ต่อความยาวผนัง 1 ม.)" icon={Wrench}>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Field label="ชนิดฐานราก"><Select value="wall" onChange={(v) => set("type", v)} options={[["spread", "ฐานแผ่ (วางบนดิน)"], ["pile", "ฐานรากบนเสาเข็ม"], ["wall", "ฐานรากแถบใต้ผนัง"]]} /></Field></div>
            {n("fcPrime", "f'c", "ksc", "10")}<Field label="เหล็ก"><Select value={f.fy} onChange={(v) => set("fy", Number(v))} options={Object.entries(GRADES).map(([k, g]) => [k, g])} /></Field>
            {n("qa", "แรงแบกทานดิน qa", "kg/m²", "500")}{n("gamma", "หน่วยน้ำหนักดิน", "kg/m³", "100")}
            {n("wP", "แรงจากผนัง P", "kg/m", "100", 8000)}{n("wM", "โมเมนต์ M", "kg-m/m", "10", 0)}
            {n("wbw", "ผนังหนา bw", "m", "0.05", 0.2)}{n("wB", "ฐานกว้าง B", "m", "0.05", 1.2)}
            {n("wt", "ฐานหนา t", "m", "0.05", 0.2)}{n("Df", "ลึก Df", "m", "0.1")}{n("cover", "ระยะหุ้ม", "cm", "0.5")}
          </div>
        </Card>
        <Card title="เหล็กเสริม" icon={Ruler}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="เหล็กหลัก (ขวางผนัง)"><Select value={f.longBar} onChange={(v) => set("longBar", v)} options={bars} /></Field>{n("sLong", "@", "m", "0.025")}
            <Field label="เหล็กกันร้าว (ตามผนัง)"><Select value={f.wShortBar ?? "DB 12"} onChange={(v) => set("wShortBar", v)} options={bars} /></Field>{n("wsShort", "@", "m", "0.025", 0.2)}
            <Field label="เหล็กเดือย"><Select value={f.dowelBar} onChange={(v) => set("dowelBar", v)} options={bars} /></Field>{n("dowelN", "จำนวน/ม.", "", "1")}
          </div>
        </Card>
      </div>
      <Card title="รูปตัดฐานราก" icon={Ruler}>{r ? <Section i={i} r={r} /> : <p className="text-red-600">{error}</p>}</Card>
      <Card title={`ผลตรวจ ${r ? (r.ok ? "— ผ่านทุกข้อ" : "— ไม่ผ่าน") : ""}`} icon={Wrench}>
        {r && <table className="w-full text-[12px]"><tbody>{checks(i, r).map(([th, fo, v, u, ok]) => <tr key={th} className="border-b border-gray-100">
          <td className="py-1 text-gray-600">{th}<div className="font-mono text-[10px] text-gray-400">{fo}</div></td><td className="text-right tabular-nums">{v} <span className="text-[10px] text-gray-400">{u}</span></td><td className="pl-2">{ok !== undefined && <Badge ok={ok} />}</td></tr>)}</tbody></table>}
      </Card>
    </main>
  );
}

export function WallFootingReport({ f, project }) {
  const i = wallInput(f), { r, error } = runWall(f);
  if (!r) return <div className="report">{error}</div>;
  return (
    <div className="report">
      <Doc project={project} title="รายการคำนวณฐานรากแถบใต้ผนัง" subtitle="Wall footing (WSD)" memberLabel="ฐานราก" member={f.footNo} summary={[["ขนาด", `B ${fmt(i.B, 2)} × t ${fmt(i.t, 2)} ม.`], ["เหล็ก", `${r.mainText} · ${r.tempText}`], ["ผล", r.ok ? "ผ่าน" : "ไม่ผ่าน"]]}>
        <Sec n={1} th="ข้อมูลและหน่วยแรงที่ยอมให้" en="Data & allowable stresses" intro="คิดต่อความยาวผนัง 1 ม. ฐานรากรับแรงทางเดียวขวางแนวผนัง">
          <Item th="แรงจากผนัง / โมเมนต์" f="P / M" v={`${fmt(i.P, 0)} / ${fmt(i.M, 0)}`} u="กก./ม. , กก.-ม./ม." />
          <Item th="หน่วยแรงคอนกรีต / เหล็ก" f="fc / fs" v={`${fmt(r.fc, 1)} / ${fmt(r.fs, 0)}`} u="กก./ซม.²" note={`n = ${fmt(r.n, 2)} · k = ${fmt(r.k, 3)} · j = ${fmt(r.j, 3)} · R = ${fmt(r.R, 2)}`} />
        </Sec>
        <Sec n={2} th="การตรวจสอบ" en="Checks">
          {checks(i, r).map(([th, fo, v, u, ok]) => <Item key={th} th={th} f={fo} v={v} u={u} ok={ok} />)}
          <Figure caption="รูปตัดฐานรากแถบ"><Section i={i} r={r} /></Figure>
        </Sec>
      </Doc>
    </div>
  );
}
