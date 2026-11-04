// Step 4 stair editor, laid out like a design sheet: type and direction, geometry from the storey height (number of risers,
// actual riser, run needed vs the drawn opening, building-code checks), loads with occupancy presets, the design of the waist
// slab (diff-tested slab engine via slabDesign) and a dimensioned side section of the stair.
import { useState } from "react";
import { autoStair } from "../engine/slabDesign.js";
import { Field, NumberInput, Select } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import { STAIR_KINDS, stairLoads, stairRT } from "../engine/floor.js";
import { SLAB_BARS } from "../engine/tables.js";

const LIVE = [[300, "บ้านพักอาศัย 300"], [400, "อาคารชุด / หอพัก 400"], [500, "สำนักงาน / อาคารสาธารณะ 500"]];
const Ok = ({ ok }) => <span className={`ml-1 rounded px-1 text-[10px] font-semibold ${ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>{ok ? "OK" : "NG"}</span>;
const Sub = ({ children }) => <div className="col-span-2 mt-1 border-b border-gray-100 pb-1 text-[11px] font-semibold text-gray-500">{children}</div>;

// geometry from the storey height H the stair climbs and the drawn opening
export function stairGeom(st, H, r0) {
  const { R, T } = stairRT(st), n = Math.max(2, Math.min(200, Math.round(H / R))), Ra = H / n;
  const Lr = r0?.Lr ?? 0, B = r0?.B ?? 0, land = st.kind === "landing" ? Math.min(st.landingL ?? 1.2, Lr) : 0;
  const flights = st.kind === "landing" ? 2 : 1, perFlight = Math.ceil(n / flights), runNeed = (perFlight - 1) * T;
  return { n, Ra, T, Lr, B, land, flights, perFlight, runNeed, runAvail: Lr - land, comfort: 2 * Ra + T,
    checks: [["ลูกตั้ง ≤ 0.20 ม.", Ra <= 0.2 + 1e-9, fmt(Ra, 3)], ["ลูกนอน ≥ 0.22 ม.", T >= 0.22 - 1e-9, fmt(T, 3)], ["กว้าง ≥ 0.80 ม.", (st.kind === "landing" ? B / 2 : B) >= 0.8 - 1e-9, fmt(st.kind === "landing" ? B / 2 : B, 2)],
      ["2R + T = 0.60–0.65 ม.", 2 * Ra + T >= 0.6 - 1e-9 && 2 * Ra + T <= 0.65 + 1e-9, fmt(2 * Ra + T, 3)], ["ช่องบันไดยาวพอ", Lr - land >= runNeed - 0.01, `${fmt(runNeed, 2)} / ${fmt(Lr - land, 2)}`]] };
}

export function StairInputs({ st, set, H, r0, mat, onLandingBeam }) {
  const [auto, setAuto] = useState(null);
  const n = (k, label, unit, step, def) => <Field label={label} unit={unit}><NumberInput value={st[k] ?? def} step={step} onChange={(v) => set({ [k]: v })} /></Field>;
  const g = stairGeom(st, H, r0);
  return (
    <div className="grid grid-cols-2 gap-3">
      <Sub>แบบและทิศ</Sub>
      <div className="col-span-2"><Field label="แบบบันได"><Select value={st.kind ?? "long"} onChange={(v) => set({ kind: v })} options={Object.entries(STAIR_KINDS)} /></Field></div>
      <Field label="ทิศขึ้น"><Select value={st.up ?? "+x"} onChange={(v) => set({ up: v })} options={[["+x", "→ +X"], ["-x", "← −X"], ["+y", "↑ +Y"], ["-y", "↓ −Y"]]} /></Field>
      {st.kind === "cant" ? <Field label="ยื่นจากด้าน"><Select value={st.side ?? 1} onChange={(v) => set({ side: Number(v) })} options={[[1, "ด้าน B"], [-1, "ด้าน A"]]} /></Field> : <div />}
      <div className="col-span-2">
        <button disabled={!r0 || !mat} onClick={() => { const a = autoStair(st, H, r0.Lr, mat); set(a.patch); setAuto(a.notes); }} className="rounded-md bg-brand-500 px-3 py-1 text-[12px] font-medium text-[#fff] disabled:opacity-40">จัดขนาดบันไดอัตโนมัติ</button>
        <span className="ml-2 text-[11px] text-gray-500">ลูกตั้ง / ลูกนอนจากความสูงชั้นและช่องบันได แล้วหาท้องบันไดบางสุดที่ผ่าน</span>
        {auto && <ul className="mt-1 list-disc pl-5 text-[11px] text-gray-600">{auto.map((t) => <li key={t}>{t}</li>)}</ul>}
      </div>
      <Sub>รูปทรง (ขึ้นสูง {fmt(H, 2)} ม. ตามระดับชั้น)</Sub>
      {n("riser", "ลูกตั้ง (ออกแบบ)", "m", "0.005", 0.17)}{n("tread", "ลูกนอน", "m", "0.005", 0.25)}
      {n("t", "ท้องบันไดหนา", "m", "0.01", 0.12)}
      {st.kind === "landing" ? n("landingL", "ชานพักยาว", "m", "0.1", 1.2) : <div />}
      {st.kind === "landing" && onLandingBeam && <div className="col-span-2"><button onClick={onLandingBeam} className="rounded-md px-3 py-1 text-[12px] text-brand-600 ring-1 ring-brand-300 hover:bg-brand-50">+ สร้างคานชานพักที่ระดับ {fmt(H / 2, 2)} ม. (ขอบชานพัก ต่อถึงเสาที่ใกล้สุด)</button></div>}
      {st.kind === "landing" && <div className="col-span-2"><Field label="คานรับชานพัก"><Select value={st.landingTo ?? ""} onChange={(v) => set({ landingTo: v || undefined })} options={[["", "อัตโนมัติ — คานชานพัก (ระดับกลางชั้น) ถ้าวาดไว้ ไม่มีก็ฝากคานชั้นล่าง"], ["mid", "คานชานพักระดับกลางชั้น"], ["below", "ฝากคานชั้นล่าง"], ["this", "ฝากคานชั้นนี้"]]} /></Field></div>}
      <p className="col-span-2 rounded-lg bg-gray-50 px-2 py-1.5 text-[12px] tabular-nums text-gray-600">{g.n} ลูกตั้ง × {fmt(g.Ra, 3)} ม. · {g.flights} ช่วงบันได ช่วงละ {g.perFlight} ขั้น · ต้องการยาว {fmt(g.runNeed, 2)} ม. (ช่องที่วาด {fmt(g.runAvail, 2)} ม.)</p>
      <Sub>น้ำหนักบรรทุก</Sub>
      <Field label="ประเภทการใช้งาน"><Select value={LIVE.some(([v]) => v === (st.live ?? 300)) ? st.live ?? 300 : ""} onChange={(v) => v && set({ live: Number(v) })} options={[...LIVE, ["", "กำหนดเอง"]]} /></Field>
      {n("live", "น้ำหนักจร", "kg/m²", "50", 300)}{n("finish", "ปูผิว + ราวจับ", "kg/m²", "10", 100)}
      <Field label="เหล็กหลัก"><Select value={st.mainBar ?? "DB 12"} onChange={(v) => set({ mainBar: v })} options={Object.keys(SLAB_BARS).map((b) => [b, b])} /></Field>
    </div>
  );
}

// dimensioned side section: steps, waist slab, landing, supports, main bar line
function Section({ st, g }) {
  const run = Math.max(g.runNeed, 0.5), land = g.land, W = 360, Hs = 170, H = g.Ra * g.perFlight, sx = (W - 70) / Math.max(run + land, 0.5), sy = (Hs - 50) / Math.max(H, 0.5), s = Math.min(sx, sy);
  const X = (x) => 30 + x * s, Y = (y) => Hs - 20 - y * s + 0, t = (st.t ?? 0.12), k = g.perFlight;
  const pts = []; for (let i = 0; i < k; i++) { pts.push([i * g.T, i * g.Ra], [i * g.T, (i + 1) * g.Ra]); if (i < k - 1) pts.push([(i + 1) * g.T, (i + 1) * g.Ra]); }
  const topEnd = [(k - 1) * g.T + land, k * g.Ra], cosT = g.T / Math.hypot(g.T, g.Ra), tv = t / cosT;
  const soffit = [[0, -tv], [(k - 1) * g.T, (k - 1) * g.Ra - tv + g.Ra], ...(land ? [[topEnd[0], topEnd[1] - t]] : [])];
  return (
    <svg viewBox={`0 0 ${W} ${Hs}`} className="mx-auto max-h-[230px] w-full">
      <polygon points={[...pts, ...(land ? [[topEnd[0], topEnd[1]]] : []), ...soffit.slice().reverse()].map(([x, y]) => `${X(x)},${Y(y)}`).join(" ")} fill="#eef0f4" stroke="#344054" strokeWidth={1.2} />
      <polyline points={soffit.map(([x, y]) => `${X(x)},${Y(y + 0.03)}`).join(" ")} fill="none" stroke="#d92d20" strokeWidth={1.6} />
      <rect x={X(0) - 10} y={Y(0)} width={20} height={14} fill="#98a2b3" /><rect x={X(topEnd[0]) - 10} y={Y(topEnd[1])} width={20} height={14} fill="#98a2b3" />
      <line x1={X(topEnd[0]) + 18} x2={X(topEnd[0]) + 18} y1={Y(0)} y2={Y(topEnd[1])} stroke="#98a2b3" /><text x={X(topEnd[0]) + 22} y={(Y(0) + Y(topEnd[1])) / 2} fontSize={9} fill="#475467">{fmt(H, 2)} ม.</text>
      <line x1={X(0)} x2={X((k - 1) * g.T)} y1={Hs - 6} y2={Hs - 6} stroke="#98a2b3" /><text x={(X(0) + X((k - 1) * g.T)) / 2} y={Hs - 9} textAnchor="middle" fontSize={9} fill="#475467">{k - 1} × {fmt(g.T, 2)} = {fmt((k - 1) * g.T, 2)} ม.</text>
      {land > 0 && <text x={(X((k - 1) * g.T) + X(topEnd[0])) / 2} y={Y(topEnd[1]) - 4} textAnchor="middle" fontSize={9} fill="#475467">ชานพัก {fmt(land, 2)}</text>}
      <text x={4} y={12} fontSize={9} fill="#344054">ลูกตั้ง {fmt(g.Ra * 100, 1)} · ลูกนอน {fmt(g.T * 100, 0)} · ท้องหนา {fmt(t * 100, 0)} ซม. · <tspan fill="#d92d20">เส้นแดง = เหล็กล่าง</tspan></text>
    </svg>
  );
}

export function StairDetail({ st, i, H, r0, row }) {
  const g = stairGeom(st, H, r0), L = stairLoads(st), r = row?.r;
  const loads = [["ท้องบันได + ขั้น (DL)", L.flight.DL], ["ปูผิว + ราว (SDL)", L.flight.SDL], ["น้ำหนักจร (LL)", L.flight.LL]];
  return (
    <div className="grid min-h-0 gap-3 overflow-auto rounded-xl bg-[#fff] p-3 text-[12px] text-[#344054] ring-1 ring-gray-200 lg:grid-cols-2">
      <div className="lg:col-span-2 flex items-center gap-2"><span className="text-sm font-semibold">บันได {i + 1} — {STAIR_KINDS[st.kind ?? "long"]}</span><span className="text-[#667085]">ช่องบันได {fmt(g.Lr, 2)} × {fmt(g.B, 2)} ม.</span></div>
      <div className="lg:col-span-2"><Section st={st} g={g} /></div>
      <div>
        <p className="mb-1 font-semibold">ตรวจขนาดตามกฎหมาย / ความสะดวก</p>
        <table className="w-full tabular-nums"><tbody>{g.checks.map(([t, ok, v]) => <tr key={t} className="border-b border-[#f2f4f7]"><td className="py-0.5">{t}</td><td className="text-right">{v}<Ok ok={ok} /></td></tr>)}</tbody></table>
        <p className="mb-1 mt-3 font-semibold">น้ำหนักบนช่วงบันได (ต่อ ม.² ตามแนวราบ)</p>
        <table className="w-full tabular-nums"><tbody>{loads.map(([t, v]) => <tr key={t} className="border-b border-[#f2f4f7]"><td className="py-0.5">{t}</td><td className="text-right">{fmt(v, 0)} กก./ม.²</td></tr>)}
          <tr className="font-semibold"><td className="py-0.5">รวม</td><td className="text-right">{fmt(L.flight.DL + L.flight.SDL + L.flight.LL, 0)} กก./ม.²</td></tr></tbody></table>
      </div>
      <div>
        <p className="mb-1 font-semibold">ออกแบบท้องบันได (WSD)</p>
        {r ? <table className="w-full tabular-nums"><tbody>
          {[["ช่วงคำนวณ L", `${fmt(row.L, 2)} ม.`], ["น้ำหนักรวม w", `${fmt(r.w, 0)} กก./ม.²`], ["โมเมนต์ M = wL²/8", `${fmt(r.M, 0)} กก.-ม./ม.`],
            ["ความหนาต่ำสุด L/20", `${fmt(r.minT * 100, 1)} ≤ ${fmt((st.t ?? 0.12) * 100, 0)} ซม.`, r.minTOk], ["ความลึกที่ต้องการ", `${fmt(r.dReq, 2)} ≤ ${fmt(r.d, 2)} ซม.`, r.dOk],
            ["เหล็กเสริมที่ต้องการ As", `${fmt(r.As, 2)} ซม.²/ม.`], ["เหล็กหลัก", r.mainText], ["เหล็กกันร้าว", r.tempText], ["แรงเฉือน", `${fmt(r.V, 0)} ≤ ${fmt(r.Vc, 0)} กก.`, r.VcOk], ["แรงยึดเหนี่ยว", "", r.uOk]]
            .map(([t, v, ok]) => <tr key={t} className="border-b border-[#f2f4f7]"><td className="py-0.5">{t}</td><td className="text-right">{v}{ok !== undefined && <Ok ok={ok} />}</td></tr>)}
        </tbody></table> : <p className="text-[#667085]">{row?.note ?? "ยังไม่มีผล (วาดช่องบันไดให้มีคานรับ)"}</p>}
      </div>
    </div>
  );
}
