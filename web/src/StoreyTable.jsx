// Storey table (step 1), as in a frame-analysis program: every level by its elevation (ม. from ±0.00), storey heights computed
// from the levels, the base of the columns (top of the footings) as its own row, and an elevation figure of the building.
// Data stays frame.floors[k].h (column height under floor k) + frame.baseLevel (elevation of the column base, display only).
import { Layers, Plus } from "lucide-react";
import { DelButton, List, Note, Panel, PField, Section, btnCls, numCls } from "./PanelKit.jsx";
import { fmt } from "./beamModel.js";

const LEVEL_RE = /[+\-−±]\s?\d+(\.\d+)?/;
export const levelText = (z) => (Math.abs(z) < 0.0005 ? "±0.00" : `${z > 0 ? "+" : "−"}${Math.abs(z).toFixed(2)}`);
// column base elevation: saved value, else from the first floor's name ("คานคอดิน +0.40" with h 0.8 → −0.40), else −h0
export function baseLevel(frame) {
  if (frame.baseLevel != null) return frame.baseLevel;
  const f0 = frame.floors[0], m = f0?.name.match(LEVEL_RE);
  return m ? +(Number(m[0].replace(/[−]/, "-").replace(/[±\s]/g, "")) - (f0.h ?? 0)).toFixed(3) : -(f0?.h ?? 0);
}
export const elevations = (frame) => frame.floors.reduce((a, f) => [...a, (a.at(-1) ?? baseLevel(frame)) + (f.h ?? 0)], []);


export function StoreyTable({ frame, set, cur, goFloor }) {
  const base = baseLevel(frame), E = elevations(frame), n = frame.floors.length;
  const rename = (name, z) => (LEVEL_RE.test(name) ? name.replace(LEVEL_RE, levelText(z)) : name);
  // move level k: storey k and k+1 change, every other level stays where it is
  const setLevel = (k, z) => {
    const lo = k ? E[k - 1] : base, hi = k + 1 < n ? E[k + 1] : Infinity;
    if (!(z > lo + 0.1 && z < hi - 0.1)) return;
    set("floors", frame.floors.map((f, i) => (i === k ? { ...f, h: +(z - lo).toFixed(3), name: rename(f.name, z) } : i === k + 1 ? { ...f, h: +(E[k + 1] - z).toFixed(3) } : f)));
  };
  // a storey height moves every level above it: names with "+x.xx" follow their new level (they kept the old one before)
  const setH = (k, h) => { if (!(h > 0.1)) return; const d = h - frame.floors[k].h;
    set("floors", frame.floors.map((f, i) => (i === k ? { ...f, h, name: rename(f.name, E[k] + d) } : i > k ? { ...f, name: rename(f.name, E[i] + d) } : f))); };
  const setBase = (z) => { if (z < E[0] - 0.1) { set("baseLevel", z); set("floors", frame.floors.map((f, i) => (i === 0 ? { ...f, h: +(E[0] - z).toFixed(3) } : f))); } };
  const add = () => { const top = frame.floors[cur], z = E[cur] + 3; set("floors", [...frame.floors.slice(0, cur + 1), { ...top, name: `ชั้นใหม่ ${levelText(z)}`, h: 3 }, ...frame.floors.slice(cur + 1)]); goFloor(cur + 1); };
  const del = () => { if (n < 2) return; set("floors", frame.floors.filter((_, i) => i !== cur).map((f, i) => (i === cur && cur ? { ...f, h: +(f.h + frame.floors[cur].h).toFixed(3) } : f))); goFloor(Math.max(0, cur - 1)); };
  // elevation figure: levels to scale, columns between them, storey heights on the right
  const zs = [base, ...E], zMin = Math.min(base, 0), zMax = E.at(-1), H = 240, W = 300, sy = (H - 24) / Math.max(zMax - zMin, 1), Y = (z) => 12 + (zMax - z) * sy;
  return (
    <Panel title="ระดับชั้น (Story)" icon={Layers} hint="คลิกชั้นเพื่อเลือก · แก้ชื่อ ระดับ หรือความสูงชั้นได้ในแถว"
      action={<button onClick={add} className={btnCls} title={`เพิ่มชั้นเหนือ ${frame.floors[cur].name}`}><Plus className="h-3.5 w-3.5" />เพิ่มชั้น</button>}>
      {/* one block per level: the name on its own line, level and storey height under it (user 2026-11-03: in the narrow side
          panel a 3-column table cut the names and squeezed the numbers) */}
      <List>
        {[...frame.floors.keys()].reverse().map((k) => (
          <li key={k} onClick={() => goFloor(k)} className={`cursor-pointer px-2.5 py-2 ${k === cur ? "bg-brand-50/70 shadow-[inset_3px_0_0_#465fff] dark:bg-white/[0.04]" : "hover:bg-gray-50 dark:hover:bg-white/[0.03]"}`}>
            <input value={frame.floors[k].name} title={frame.floors[k].name} onClick={(e) => e.stopPropagation()} onChange={(e) => set("floors", frame.floors.map((f, i) => (i === k ? { ...f, name: e.target.value } : f)))}
              className={`h-7 w-full rounded-md border border-transparent bg-transparent px-1 text-[13px] font-medium hover:border-gray-300 focus:border-brand-300 ${k === cur ? "text-brand-600" : "text-gray-800 dark:text-gray-100"}`} />
            <div className="mt-1 grid grid-cols-2 gap-2">
              <PField label="ระดับ (ม.)"><input key={`${k}:${E[k]}`} type="number" step="0.05" defaultValue={+E[k].toFixed(3)} onClick={(e) => e.stopPropagation()} onBlur={(e) => setLevel(k, Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={numCls} /></PField>
              <PField label="สูงชั้น (ม.)"><input key={`h${k}:${frame.floors[k].h}`} type="number" step="0.05" defaultValue={frame.floors[k].h} onClick={(e) => e.stopPropagation()} onBlur={(e) => setH(k, Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={numCls} /></PField>
            </div>
          </li>))}
      </List>
      <Section title="โคนเสา (หลังฐานราก)" className="mt-3">
        <div className="grid grid-cols-2 gap-2"><PField label="ระดับ (ม.)"><input key={`b:${base}`} type="number" step="0.05" defaultValue={+base.toFixed(3)} onBlur={(e) => setBase(Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={numCls} /></PField></div>
      </Section>
      {n > 1 && <div className="mt-2 flex justify-end"><DelButton onClick={del} title={`ลบ ${frame.floors[cur].name}`}>ลบชั้นที่เลือก</DelButton></div>}
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full rounded-lg bg-gray-50 ring-1 ring-gray-200 dark:bg-white/[0.03] dark:ring-gray-800">
        {zMin < 0 && <><line x1={8} x2={W - 8} y1={Y(0)} y2={Y(0)} stroke="#98a2b3" strokeDasharray="5 3" /><text x={W - 4} y={Y(0) + 10} textAnchor="end" fontSize={8.5} fill="#667085">ดิน ±0.00</text></>}
        {[60, 150].map((x) => <line key={x} x1={x} x2={x} y1={Y(E.at(-1))} y2={Y(base)} stroke="#475467" strokeWidth={3} />)}
        {zs.map((z, i) => (
          <g key={i}>
            <line x1={i ? 40 : 52} x2={i ? 170 : 68} y1={Y(z)} y2={Y(z)} stroke={i ? (i - 1 === cur ? "#465fff" : "#344054") : "#98a2b3"} strokeWidth={i ? 4 : 2} />
            {!i && <line x1={142} x2={158} y1={Y(z)} y2={Y(z)} stroke="#98a2b3" strokeWidth={2} />}
            <text x={176} y={Y(z) + 3} fontSize={9} fill={i - 1 === cur ? "#465fff" : "#344054"}>{levelText(z)} {i ? frame.floors[i - 1].name.replace(LEVEL_RE, "").trim() : "โคนเสา"}</text>
            {i > 0 && <><line x1={30} x2={30} y1={Y(z)} y2={Y(zs[i - 1])} stroke="#98a2b3" /><text x={27} y={(Y(z) + Y(zs[i - 1])) / 2 + 3} textAnchor="end" fontSize={8.5} fill="#667085">{fmt(z - zs[i - 1], 2)}</text></>}
          </g>))}
      </svg>
      <Note>ใส่ระดับหลังคานของแต่ละชั้น (หรือความสูงชั้น) · ความสูงเสาใต้ชั้น = ระดับชั้นนั้น − ระดับชั้นล่าง · ชื่อที่มี +x.xx จะเปลี่ยนตามระดับ</Note>
    </Panel>
  );
}
