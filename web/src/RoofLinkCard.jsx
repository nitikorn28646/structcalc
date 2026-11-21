// "Roof → columns" card (top of step 5 and step 6 "น้ำหนักอื่น"): one button builds the roof from the structure and links its loads;
// below it every roof bearing point is listed with where its load goes (column / beam / moved to the nearest column) and, for a
// point with nothing under it, the fixes in one click: a carrier beam through it (between the nearest beams) or a column under it.
import { roofLinkFloor } from "../engine/frame.js";
import { useState } from "react";
import { carrierBeam, snapRoofToFrame } from "./roofLink.js";
import { highlight } from "./highlight.js";
import { elevations, levelText } from "./StoreyTable.jsx";

const f2 = (v) => (+v).toFixed(2), near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05;
const TO = { col: ["ลงเสา", "text-[#067647]"], beam: ["ลงคาน", "text-[#067647]"], moved: ["ไม่มีที่รับ → ย้ายไปเสาใกล้สุด", "font-semibold text-[#d92d20]"] };

export function RoofLinkCard({ frame, roof, onFromFrame, set, setRoof = null }) {
  const link = frame.roofLink, pts = frame.roofPoints ?? [], total = pts.reduce((s, p) => s + p.P, 0);
  const moved = pts.filter((p) => p.to === "moved" || String(p.name).includes("ย้าย")), ready = roof?.fromFrame && link?.on;
  const [open, setOpen] = useState(null), k = roofLinkFloor(frame) ?? frame.floors.length - 1, fl = frame.floors[k];
  const setFloor = (patch) => set?.("floors", frame.floors.map((f, i) => (i === k ? { ...f, ...patch } : f)));
  const addBeams = (list) => { let beams = [...(fl.beams ?? [])], n = 0;
    for (const p of list) { const at = p.at ?? p.p, b = carrierBeam({ beams }, at); if (b) { beams = [...beams, b]; n++; } }
    if (n) setFloor({ beams }); return n; };
  const addCol = (p) => setFloor({ columns: [...fl.columns.filter((c) => !near(c, p.at ?? p.p)), (p.at ?? p.p).map((v) => +(+v).toFixed(3))] });
  const show = open ?? false; // closed until asked (the header line already counts the unsupported points)
  // level check (user 2026-11-04): the wall plate should sit on the floor the roof loads go to
  // plan offset (user 2026-11-19 "อะเสไม่วางบนเสา"): the roof drawn at the wall faces → its plates stand off the column centres in the 3D
  const offPlan = ready ? Math.max(0, ...pts.filter((p) => p.to !== "moved").map((p) => p.snap ?? 0)) : 0;
  const [snapMsg, setSnapMsg] = useState("");
  const snapPlan = () => { const { patch, n, max } = snapRoofToFrame(roof, fl);
    for (const [key, v] of Object.entries(patch)) setRoof(key, v);
    setSnapMsg(n ? `ย้าย ${n} จุดของแปลนหลังคาเข้าศูนย์เสา/คานแล้ว (ไกลสุด ${max.toFixed(2)} ม.) — ชายคายื่นนับจากแนวใหม่` : "ไม่มีจุดที่ต้องย้าย"); };
  const topZ = elevations(frame)[k], dH = roof?.H != null && (roof.pts?.length ?? 0) >= 3 ? roof.H - topZ : 0, offLevel = link?.on && Math.abs(dH) > 0.02;
  return (
    <div className={`rounded-xl px-3 py-2 text-[12px] ring-1 ${ready && !moved.length ? "bg-[#ecfdf3] text-[#067647] ring-[#abefc6]" : "bg-[#fffaeb] text-[#b54708] ring-[#fdb022]"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-semibold">หลังคา → โครงสร้าง</span>
        {ready && !(roof.columns?.length || roof.plates?.length || roof.innerPlates?.length) ? <span>ยังไม่มีเสา / อะเสบนแปลนหลังคา — วาดอะเส (เครื่องมือ 3) แล้วแรงหลังคาจะส่งลงโครงสร้างเอง</span>
          : ready ? <span>แรงหลังคา {(total / 1000).toFixed(2)} ตัน ลง {pts.length} จุด ที่ {fl?.name}{moved.length ? ` · ${moved.length} จุดไม่มีเสา/คานรับ (กด "ดูตารางจุดถ่ายแรง" แล้วชี้แถวเพื่อดูตำแหน่งบนแปลน)` : " · ทุกจุดมีเสาหรือคานรับ"}</span>
          : <span>{roof?.fromFrame ? "นำเข้าเสาแล้วแต่ยังไม่ได้ส่งแรงลงโครงสร้าง" : "หลังคายังไม่ได้เชื่อมกับโครงสร้าง — กดปุ่มเพื่อนำเข้าเสา + แปลนชั้นบนสุด (วาดหลังคาและอะเสเอง) แล้วแรงหลังคาจะลงเสา/คานอัตโนมัติ"}</span>}
        {ready && pts.length > 0 && <button onClick={() => setOpen(!show)} className="rounded-lg bg-[#fff] px-3 py-1 font-medium ring-1 ring-current hover:bg-[#fff8eb]">{show ? "▲ ซ่อนตารางจุดถ่ายแรง" : "▼ ดูตารางจุดถ่ายแรง"}</button>}
        {offLevel && <span className="w-full rounded-md bg-[#fff] px-2 py-1 text-[#b54708] ring-1 ring-[#fdb022]">ระดับอะเส {levelText(roof.H)} {dH > 0 ? "สูงกว่า" : "ต่ำกว่า"}ระดับ {fl?.name} ({levelText(topZ)}) {Math.abs(dH).toFixed(2)} ม. — อะเสลอย{dH > 0 ? "เหนือ" : "ต่ำกว่า"}หัวเสา/คานในภาพ 3D{dH > 0 ? " (ถ้าจริงมีเสาตอม่อหลังคา ให้วางเสาชั้นบนเพิ่ม)" : ""}
          {setRoof && <button onClick={() => setRoof("H", +topZ.toFixed(2))} className="ml-2 rounded bg-[#b54708] px-2 py-0.5 font-medium text-[#fff]">ตั้งระดับอะเส = {levelText(topZ)}</button>}</span>}
        {offPlan > 0.02 && <span className="w-full rounded-md bg-[#fff] px-2 py-1 text-[#b54708] ring-1 ring-[#fdb022]">แปลนหลังคาห่างศูนย์เสา/คานสูงสุด {offPlan.toFixed(2)} ม. (วาดที่ผิวผนัง) — แรงลงเสาถูกต้องแล้ว แต่ในภาพ 3D อะเสจะอยู่เยื้องหัวเสา
          {setRoof && <button onClick={snapPlan} title="ย้ายมุมผนัง เสา อะเส และดั้งที่อยู่ห่างเสา/คานไม่เกิน 0.30 ม. เข้าศูนย์กลาง — ชายคายื่นจะนับจากแนวศูนย์เสา" className="ml-2 rounded bg-[#b54708] px-2 py-0.5 font-medium text-[#fff]">ย้ายแปลนหลังคาเข้าศูนย์เสา</button>}</span>}
        {snapMsg && <span className="w-full text-[#067647]">{snapMsg}</span>}
        <button onClick={onFromFrame} className={`ml-auto rounded-lg px-3 py-1 font-medium ${ready ? "ring-1 ring-current" : "bg-brand-500 text-[#fff]"}`}>{ready ? "นำเข้าเสาใหม่จากโครงสร้าง" : "นำเข้าเสา + แปลนจากโครงสร้าง"}</button>
      </div>
      {ready && show && pts.length > 0 && <div className="mt-2 rounded-lg bg-[#fff] p-2 text-[#344054] ring-1 ring-[#eaecf0]">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="font-semibold">จุดถ่ายแรงหลังคา ({pts.length})</span>
          {moved.length > 0 && set && <button onClick={() => addBeams(moved)} className="rounded-md bg-brand-500 px-2.5 py-1 font-medium text-[#fff]">เพิ่มคานรับทุกจุดที่ไม่มีที่รับ ({moved.length})</button>}
          <span className="text-[11px] text-[#667085]">คานรับ = คานซอยแนว X หรือ Y (ที่สั้นกว่า) ผ่านจุดนั้น ระหว่างคานสองข้าง ที่ {fl?.name} · เพิ่มเสา = เสาใต้จุดนั้น · จุดที่ห่างเสา/คานไม่เกิน 0.30 ม. ถือเป็นจุดเดียวกัน (แปลนหลังคาวาดที่ผิวผนัง โครงสร้างที่ศูนย์กลาง)</span>
        </div>
        <div className="max-h-[220px] overflow-auto"><table className="w-full tabular-nums"><thead><tr className="text-left text-[11px] text-[#667085]"><th className="py-0.5">จุด (X, Y)</th><th>แรง (กก.)</th><th>ลงที่</th><th /></tr></thead>
          <tbody>{pts.map((p, i) => { const to = p.to ?? (String(p.name).includes("ย้าย") ? "moved" : "col"), at = p.at ?? p.p;
            return <tr key={i} onPointerEnter={() => highlight({ p: at, to: to === "moved" || p.snap > 0.005 ? p.p : null, bad: to === "moved" })} onPointerLeave={() => highlight(null)} className="cursor-crosshair border-t border-[#f2f4f7] hover:bg-[#fff8eb]">
              <td className="py-0.5">({f2(at[0])}, {f2(at[1])})</td><td>{Math.round(p.P).toLocaleString()}</td>
              <td className={TO[to][1]}>{TO[to][0]}{to === "moved" ? ` (${f2(p.p[0])}, ${f2(p.p[1])})` : p.snap > 0.005 ? ` ที่ (${f2(p.p[0])}, ${f2(p.p[1])}) · แปลนหลังคาห่างโครงสร้าง ${f2(p.snap)} ม.` : ""}</td>
              <td className="text-right">{to === "moved" && set && <><button onClick={() => addBeams([p])} className="mr-2 font-medium text-brand-600">เพิ่มคานรับ</button><button onClick={() => addCol(p)} className="font-medium text-brand-600">เพิ่มเสา</button></>}</td>
            </tr>; })}</tbody></table></div>
      </div>}
    </div>
  );
}
