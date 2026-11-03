// Step 8 tab "ฐานราก" — as an engineer sets up pile caps:
// 1 pile catalogue: every pile size of the engine (I, square, hollow, H, bored) with its safe load (maker / load test, editable)
// 2 footing types F1, F2… (piles, pile size, cap thickness, depth, pile spacing, cap width, long / short bars and spacings)
// 2b spread footings on soil (kind "spread"): Bx × By (0 = sized from qa), t, Df, qa, soil weight, bars by count or spacing
// 3 each column: a type or auto (= the lightest type that passes, like the roof wall-plate types; no types = built-in options)
// 4 drawings (plan + section) of the governing footing of every type in use, and of the selected column.
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { fmt } from "./beamModel.js";
import Drawing from "./Drawing.jsx";
import { footingModel, pileCapModel } from "./drawings.js";
import { PILES } from "../engine/footing.js";
import { DEFAULT_FOOTING, PILE_SAFE, designFooting } from "../engine/frame.js";
import { SLAB_BARS } from "../engine/tables.js";

const th = "px-1 py-1 text-left text-[11px] font-medium text-gray-500", td = "px-1 py-0.5 tabular-nums";
const box = "h-7 rounded border border-gray-300 bg-transparent px-1 text-[12px]";
const KIND = (p) => (p.startsWith("I-") ? "ไอ (I)" : p.startsWith("SO-") ? "สี่เหลี่ยมกลวง" : p.startsWith("S-") ? "สี่เหลี่ยมตัน" : p.startsWith("HP") ? "เหล็ก H" : "เข็มเจาะ");
const BARS = Object.keys(SLAB_BARS).filter((b) => b.startsWith("DB"));
// the pile-cap checks that failed, in words (engine/footing.js flags)
const WHY = { pileOk: "แรงต่อเข็มเกินค่าปลอดภัย", dOk: "ฐานบางไป (ความลึกประสิทธิผล)", vOk: "แรงเฉือนทางเดียว", vpOk: "แรงเฉือนทะลุรอบเสา", vppOk: "แรงเฉือนทะลุรอบเข็ม",
  AsOkL: "เหล็กแนวยาวไม่พอ", AsOkS: "เหล็กแนวสั้นไม่พอ", perimOk: "แรงยึดเหนี่ยวเหล็ก", ancOk: "ระยะฝังเหล็กไม่พอ (ขยายฐาน / ใช้เหล็กเล็กลง)", bearingOk: "แรงแบกทานใต้เสา" };
const WHY_S = { qOk: "แรงดันดินเกิน qa (ขยายฐาน)", qminOk: "แรงดันดินติดลบ — ฐานยก (ขยายฐาน)", dOk: "ฐานบางไป (ความลึกประสิทธิผล)", vOk: "แรงเฉือนทางเดียว", vpOk: "แรงเฉือนทะลุรอบเสา",
  AsOkL: "เหล็กแนวยาวไม่พอ", AsOkS: "เหล็กแนวสั้นไม่พอ", perimOkL: "แรงยึดเหนี่ยวเหล็กแนวยาว", perimOkS: "แรงยึดเหนี่ยวเหล็กแนวสั้น", ancOkL: "ระยะฝังเหล็กแนวยาวไม่พอ",
  ancOkS: "ระยะฝังเหล็กแนวสั้นไม่พอ", perimOkD: "เหล็กเดือยไม่พอ", bearingOk: "แรงแบกทานใต้เสา" };
const why = (f) => f.kind === "spread" ? (f.error ?? Object.keys(WHY_S).filter((k) => f.r?.[k] === false).map((k) => WHY_S[k]).join(" · ")) : (f.error ? f.error : f.r ? Object.keys(WHY).filter((k) => f.r[k] === false && !(f.n === 1 && (k === "ancOk" || k === "perimOk"))).map((k) => WHY[k]).join(" · ") : "");
const Num = ({ v, on, step = "0.05", w = "w-16" }) => <input type="number" step={step} value={v} onChange={(e) => on(Number(e.target.value))} className={`${box} ${w}`} />;

export function FootingTypes({ frame, set, res }) {
  const types = frame.footTypes ?? [], pick = frame.footPick ?? {}, fo = frame.footing ?? {}, loads = frame.pileLoads;
  const [selStack, setSelStack] = useState(null);
  const safe = (p) => (loads ? loads[p] ?? PILE_SAFE[p] : fo.Psafe ?? 18000);
  const setSafe = (p, t) => set("pileLoads", { ...Object.fromEntries(Object.keys(PILES).map((k) => [k, safe(k)])), [p]: Math.round(t * 1000) });
  const put = (i, k, v) => set("footTypes", types.map((t, j) => (j === i ? { ...t, [k]: v } : t)));
  const add = () => set("footTypes", [...types, (types.length ? { name: `F${types.length + 1}`, n: Math.min(9, types[types.length - 1].n + 1), pile: "I-18", t: 0.4, Df: 1.2, k: 3, w: 0, bar: "DB 12", s: 0.15, barS: "DB 12", sS: 0.15 }
    : { name: "F1", n: 1, pile: "I-18", t: 0.5, Df: 1.2, k: 3, w: 0.5, bar: "DB 12", nb: 5, s: 0.15, barS: "DB 12", nbS: 5, sS: 0.15 })]);
  // spread types filled from the real column loads: each column's smallest passing square size (engine auto size), then at most
  // 4 sizes (groups of the sorted sizes, each = its largest) with the bar counts of that size → editable like any type
  const spreadBase = () => { const t0 = types.find((t) => t.kind === "spread"); return { kind: "spread", t: t0?.t ?? 0.3, Df: t0?.Df ?? 1.2, qa: t0?.qa ?? 10000, gamma: t0?.gamma ?? 1800, bar: t0?.bar ?? "DB 12", s: 0.15, barS: t0?.barS ?? t0?.bar ?? "DB 12", sS: 0.15 }; };
  const sizeRun = (f, tt) => { const c = (res.columns ?? []).find((x) => x.floor === 0 && x.stack === f.stack); return c ? designFooting(f.P, c.lv, frame.mat, { ...(frame.footing ?? DEFAULT_FOOTING), fixed: tt }, f.Mx ?? 0, f.My ?? 0) : null; };
  const needed = (base) => foots.map((f) => ({ f, d: sizeRun(f, { ...base, Bx: 0, By: 0 }) })).filter((x) => x.d?.ok).map((x) => ({ ...x, B: x.d.r.Bx })).sort((a, b) => a.B - b.B);
  const typeAt = (base, x, name) => { const d = sizeRun(x.f, { ...base, Bx: x.B, By: x.B }); return { ...base, name, Bx: x.B, By: x.B, nb: d?.r?.nLong ?? 0, nbS: d?.r?.nShort ?? 0 }; };
  const nextName = (k = 0) => { let i = types.length + 1 + k; while (types.some((t) => t.name === `F${i}`)) i++; return `F${i}`; };
  const addSpread = () => { const base = spreadBase(), list = needed(base), big = list.at(-1);
    set("footTypes", [...types, big ? typeAt(base, big, nextName()) : { ...base, name: nextName(), Bx: 0, By: 0 }]); };
  const autoSpread = () => {
    const base = spreadBase(), list = needed(base), sizes = [...new Set(list.map((x) => x.B))];
    const k = Math.min(4, sizes.length), groups = Array.from({ length: k }, (_, g) => sizes.slice(Math.floor((g * sizes.length) / k), Math.floor(((g + 1) * sizes.length) / k)).at(-1));
    const keep = types.map((t, i) => [t, i]).filter(([t]) => t.kind !== "spread"), map = Object.fromEntries(keep.map(([, i], j) => [i, j]));
    const made = groups.map((B, g) => typeAt(base, list.filter((x) => x.B === B).at(-1), `F${keep.length + g + 1}`));
    set("footTypes", [...keep.map(([t]) => t), ...made]);
    set("footPick", Object.fromEntries(Object.entries(pick).filter(([, v]) => map[v] != null).map(([s, v]) => [s, map[v]])));
  };
  const pileRows = types.map((t, i) => [t, i]).filter(([t]) => t.kind !== "spread"), spreadRows = types.map((t, i) => [t, i]).filter(([t]) => t.kind === "spread");
  const barCells = (t, i) => <>
    <td className={td}><select value={t.bar ?? "DB 12"} onChange={(e) => put(i, "bar", e.target.value)} className={box}>{BARS.map((b) => <option key={b}>{b}</option>)}</select></td>
    <td className={td}><Num v={t.nb ?? 0} on={(v) => put(i, "nb", v)} step="1" w="w-12" /></td>
    <td className={td}>{t.nb > 1 ? <span className="text-gray-400">ตามจำนวน</span> : <Num v={t.s ?? 0.15} on={(v) => put(i, "s", v)} step="0.025" w="w-14" />}</td>
    <td className={td}><select value={t.barS ?? t.bar ?? "DB 12"} onChange={(e) => put(i, "barS", e.target.value)} className={box}>{BARS.map((b) => <option key={b}>{b}</option>)}</select></td>
    <td className={td}><Num v={t.nbS ?? 0} on={(v) => put(i, "nbS", v)} step="1" w="w-12" /></td>
    <td className={td}>{t.nbS > 1 ? <span className="text-gray-400">ตามจำนวน</span> : <Num v={t.sS ?? t.s ?? 0.15} on={(v) => put(i, "sS", v)} step="0.025" w="w-14" />}</td>
    <td className={td}>{foots.filter((f) => f.type === t.name).length} ฐาน</td>
    <td className={td}><button onClick={() => del(i)} title="ลบ type" className="text-gray-400 hover:text-red-500"><Trash2 className="h-3.5 w-3.5" /></button></td></>;
  const del = (i) => { set("footTypes", types.filter((_, j) => j !== i)); set("footPick", Object.fromEntries(Object.entries(pick).filter(([, v]) => v !== i).map(([k, v]) => [k, v > i ? v - 1 : v]))); };
  const foots = res.footings ?? [], shown = foots.find((f) => f.stack === selStack);
  const governing = [...new Set(foots.map((f) => f.type ?? null))].map((ty) => foots.filter((f) => (f.type ?? null) === ty).reduce((a, f) => ((f.util ?? 0) > (a.util ?? 0) ? f : a)));
  const draw = (f) => f?.inp && f.r ? <Drawing model={f.kind === "spread" ? footingModel(f.inp, f.r) : pileCapModel(f.inp, f.r, PILES[f.pile]?.b ?? 0.18)} className="mx-auto h-[70mm]" fontSize={9} width={300} /> : <p className="text-gray-400">ไม่มีรูป ({f?.error ?? "ยังไม่ได้ออกแบบ"})</p>;
  return (
    <div className="max-w-[1500px] space-y-5 text-[12px]">
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">1 · Type ฐานรากเสาเข็ม</p>
        <table className="w-full"><thead><tr>{["ชื่อ", "เข็ม (ต้น)", "ขนาดเข็ม", "หนาฐาน t (ม.)", "ลึก Df (ม.)", "ระยะเข็ม (× ขนาดเข็ม)", "กว้างฐาน (ม.) 1–2 ต้น", "เหล็กแนวยาว", "จำนวน (เส้น)", "@ (ม.)", "เหล็กแนวสั้น", "จำนวน (เส้น)", "@ (ม.)", "ใช้", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{pileRows.map(([t, i]) => <tr key={i} className="border-t border-gray-100">
            <td className={td}><input value={t.name} onChange={(e) => put(i, "name", e.target.value)} className={`${box} w-14`} /></td>
            <td className={td}><select value={t.n} onChange={(e) => put(i, "n", Number(e.target.value))} className={box}>{[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => <option key={n} value={n}>{n}</option>)}</select></td>
            <td className={td}><select value={t.pile} onChange={(e) => put(i, "pile", e.target.value)} className={box}>{Object.keys(PILES).map((p) => <option key={p} value={p}>{p} · {fmt(safe(p) / 1000, 0)} ตัน</option>)}</select></td>
            <td className={td}><Num v={t.t ?? 0.4} on={(v) => put(i, "t", v)} /></td>
            <td className={td}><Num v={t.Df ?? 1.2} on={(v) => put(i, "Df", v)} step="0.1" /></td>
            <td className={td}><Num v={t.k ?? 3} on={(v) => put(i, "k", v)} step="0.5" w="w-14" /></td>
            <td className={td}>{t.n <= 2 ? <Num v={t.w ?? 0} on={(v) => put(i, "w", v)} step="0.1" w="w-14" /> : <span className="text-gray-400">ตามระยะเข็ม</span>}</td>
            {barCells(t, i)}
          </tr>)}</tbody></table>
        <button onClick={add} className="mt-1 flex items-center gap-1 text-[12px] font-medium text-brand-500"><Plus className="h-3.5 w-3.5" />เพิ่ม type ฐานราก</button>
        <p className="mt-1 text-[11px] text-gray-400">ฐานเข็ม 1–2 ต้น: เหล็กนับในความกว้างหักระยะหุ้ม · ใส่ "จำนวน" (เช่น 5 = 5-DB 12) แทนระยะ @ ได้ · มี type แล้ว: ฐานที่เลือก "อัตโนมัติ" ใช้ type เบาที่สุดที่ผ่าน (เรียงตามจำนวนเข็ม × พื้นที่เข็ม แล้วความหนาฐาน) · ยังไม่มี type: โปรแกรมเลือกจากตัวเลือกมาตรฐาน · ขนาดฐาน 3 ต้นขึ้นไปคำนวณจากระยะเข็มและระยะขอบ 1.3 × ขนาดเข็ม + ระยะหุ้ม</p>
      </section>
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">1b · Type ฐานแผ่ (วางบนดิน)</p>
        {spreadRows.length > 0 && <table className="w-full"><thead><tr>{["ชื่อ", "กว้าง Bx (ม.)", "ยาว By (ม.)", "หนา t (ม.)", "ลึก Df (ม.)", "qa ดิน (ตัน/ม.²)", "น้ำหนักดิน (กก./ม.³)", "เหล็กแนวยาว", "จำนวน (เส้น)", "@ (ม.)", "เหล็กแนวสั้น", "จำนวน (เส้น)", "@ (ม.)", "ใช้", ""].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{spreadRows.map(([t, i]) => <tr key={i} className="border-t border-gray-100">
            <td className={td}><input value={t.name} onChange={(e) => put(i, "name", e.target.value)} className={`${box} w-14`} /></td>
            <td className={td}><Num v={t.Bx ?? 0} on={(v) => put(i, "Bx", v)} step="0.1" /></td>
            <td className={td}><Num v={t.By ?? 0} on={(v) => put(i, "By", v)} step="0.1" /></td>
            <td className={td}><Num v={t.t ?? 0.3} on={(v) => put(i, "t", v)} /></td>
            <td className={td}><Num v={t.Df ?? 1.2} on={(v) => put(i, "Df", v)} step="0.1" /></td>
            <td className={td}><Num v={(t.qa ?? 10000) / 1000} on={(v) => put(i, "qa", Math.round(v * 1000))} step="0.5" w="w-14" /></td>
            <td className={td}><Num v={t.gamma ?? 1800} on={(v) => put(i, "gamma", v)} step="100" w="w-16" /></td>
            {barCells(t, i)}
          </tr>)}</tbody></table>}
        <div className="mt-1 flex gap-4"><button onClick={addSpread} className="flex items-center gap-1 text-[12px] font-medium text-brand-500"><Plus className="h-3.5 w-3.5" />เพิ่ม type ฐานแผ่</button>
          <button onClick={autoSpread} title="แทน type ฐานแผ่เดิมด้วยขนาดที่คำนวณจากแรงที่ฐานเสาจริง (ไม่เกิน 4 ขนาด) แก้ต่อได้ทุกช่อง" className="flex items-center gap-1 text-[12px] font-medium text-brand-500"><Plus className="h-3.5 w-3.5" />สร้าง type ฐานแผ่อัตโนมัติจากแรงที่ฐาน</button></div>
        <p className="mt-1 text-[11px] text-gray-400">เพิ่ม type = ขนาดที่ฐานหนักสุดต้องการ · สร้างอัตโนมัติ = ไม่เกิน 4 ขนาดจากแรงจริง พร้อมจำนวนเหล็ก (แก้ต่อได้) · Bx / By = 0 → โปรแกรมหาขนาดจาก qa (รวมน้ำหนักฐาน + ดินถม) แล้วขยายทีละ 0.10 ม. จนผ่านทุกข้อ · ตรวจ แรงดันดิน (รวมโมเมนต์ 2 ทาง), ความลึก, เฉือนทางเดียว, เฉือนทะลุ, เหล็ก, แรงยึดเหนี่ยว, ระยะฝัง, เหล็กเดือย, แรงแบกทาน · อัตโนมัติจะลองฐานแผ่ก่อนฐานเข็ม</p>
      </section>
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">2 · ฐานรากแต่ละเสา <span className="font-normal text-gray-400">(คลิกแถวเพื่อดูรูป)</span></p>
        <table className="w-full"><thead><tr>{["เสา (X, Y)", "Type", "ใช้ type", "P (ตัน)", "M x / y (กก.-ม.)", "ชุดแรง", "เข็ม", "ฐาน Bx × By × t (ม.)", "แรงต่อเข็ม / ปลอดภัย (ตัน) · ดิน q / qa", "เหล็ก", "ผล", "เหตุผลที่ไม่ผ่าน"].map((h, i) => <th key={i} className={th}>{h}</th>)}</tr></thead>
          <tbody>{foots.map((f) => <tr key={f.stack} onClick={() => setSelStack(f.stack)} className={`cursor-pointer border-t border-gray-100 ${selStack === f.stack ? "bg-brand-50" : "hover:bg-gray-50"}`}>
            <td className={td}>{f.stack}</td>
            <td className={td} onClick={(e) => e.stopPropagation()}><select value={pick[f.stack] ?? ""} onChange={(e) => set("footPick", { ...pick, [f.stack]: e.target.value === "" ? undefined : Number(e.target.value) })} className={box}>
              <option value="">อัตโนมัติ</option>{types.map((t, i) => <option key={i} value={i}>{t.name}</option>)}</select></td>
            <td className={td}>{f.type ?? "-"}</td>
            <td className={td}>{fmt(f.P / 1000, 2)}</td><td className={td}>{fmt(f.Mx ?? 0, 0)} / {fmt(f.My ?? 0, 0)}</td><td className={td}>{f.combo ?? "D+L"}</td>
            <td className={td}>{f.kind === "spread" ? "ฐานแผ่" : `${f.n} × ${f.pile}`}</td><td className={td}>{f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)} × ${fmt(f.inp?.t ?? 0.4, 2)}` : "-"}</td>
            <td className={td}>{!f.r ? "-" : f.kind === "spread" ? `q ${fmt(Math.max(f.r.qmaxX, f.r.qmaxY) / 1000, 2)} / qa ${fmt(f.inp.qa / 1000, 2)} ตัน/ม.²` : `${fmt(f.r.Ptmax / 1000, 2)} / ${fmt(f.r.Pallow / 1000, 2)}`}</td>
            <td className={td}>{f.r ? [f.r.longText, f.r.shortText].filter(Boolean).join(" · ") : f.error}</td>
            <td className={`${td} ${f.ok ? "text-green-600" : "font-semibold text-red-600"}`}>{f.ok ? "ผ่าน" : "ไม่ผ่าน"}</td>
            <td className={`${td} text-red-600`}>{f.ok ? "" : why(f)}</td>
          </tr>)}</tbody></table>
      </section>
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">3 · รูปฐานราก {shown ? `— เสา ${shown.stack}` : "— ฐานวิกฤตของแต่ละ type"}</p>
        <div className="grid gap-3 xl:grid-cols-3 md:grid-cols-2">{(shown ? [shown] : governing).map((f) => (
          <figure key={f.stack} className="rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200">{draw(f)}
            <figcaption className="mt-1 text-center text-[11px] text-[#667085]">{f.type ?? "อัตโนมัติ"} · เสา {f.stack} · {f.kind === "spread" ? "ฐานแผ่" : `${f.n} × ${f.pile}`} · {f.r ? `${fmt(f.r.Bx, 2)} × ${fmt(f.r.By, 2)} ม.` : ""} · ใช้ {fmt((f.util ?? 0) * 100, 0)}%</figcaption></figure>))}</div>
      </section>
      <section>
        <p className="mb-1 text-sm font-semibold text-gray-800">4 · เสาเข็ม — น้ำหนักบรรทุกปลอดภัยต่อต้น <span className="font-normal text-gray-400">(ใส่ตามผู้ผลิต / ผลทดสอบ / ผลเจาะดิน)</span></p>
        <div className="grid grid-cols-2 gap-x-6 md:grid-cols-4 xl:grid-cols-6">{Object.entries(PILES).map(([p, d]) => (
          <label key={p} className="flex items-center justify-between gap-2 border-b border-gray-100 py-0.5"><span>{p} <span className="text-gray-400">{KIND(p)} {fmt(d.b * 100, 0)} ซม.</span></span>
            <span className="flex items-center gap-1"><Num v={safe(p) / 1000} on={(v) => setSafe(p, v)} step="1" w="w-14" />ตัน</span></label>))}</div>
        {!loads && <p className="mt-1 text-[11px] text-[#b54708]">ยังใช้ค่าเดิม {fmt((fo.Psafe ?? 18000) / 1000, 0)} ตัน ทุกขนาด — แก้ช่องใดช่องหนึ่งเพื่อใช้ค่าแยกตามขนาด (ค่าเริ่มต้นแต่ละขนาดเป็นค่าประมาณ ต้องตรวจกับผู้ผลิต)</p>}
      </section>
    </div>
  );
}
