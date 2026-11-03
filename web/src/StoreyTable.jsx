// Storey table (step 1), as in a frame-analysis program: every level by its elevation (ม. from ±0.00), storey heights computed
// from the levels, the base of the columns (top of the footings) as its own row, and an elevation figure of the building.
// Data stays frame.floors[k].h (column height under floor k) + frame.baseLevel (elevation of the column base, display only).
import { Layers, Plus, Trash2 } from "lucide-react";
import { Card } from "./ui.jsx";
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

const num = "h-7 w-[72px] rounded border border-gray-300 bg-transparent px-1 text-right text-[12px] tabular-nums";

export function StoreyTable({ frame, set, cur, goFloor }) {
  const base = baseLevel(frame), E = elevations(frame), n = frame.floors.length;
  const rename = (name, z) => (LEVEL_RE.test(name) ? name.replace(LEVEL_RE, levelText(z)) : name);
  // move level k: storey k and k+1 change, every other level stays where it is
  const setLevel = (k, z) => {
    const lo = k ? E[k - 1] : base, hi = k + 1 < n ? E[k + 1] : Infinity;
    if (!(z > lo + 0.1 && z < hi - 0.1)) return;
    set("floors", frame.floors.map((f, i) => (i === k ? { ...f, h: +(z - lo).toFixed(3), name: rename(f.name, z) } : i === k + 1 ? { ...f, h: +(E[k + 1] - z).toFixed(3) } : f)));
  };
  const setH = (k, h) => { if (h > 0.1) set("floors", frame.floors.map((f, i) => (i === k ? { ...f, h, name: rename(f.name, (k ? E[k - 1] : base) + h) } : f))); };
  const setBase = (z) => { if (z < E[0] - 0.1) { set("baseLevel", z); set("floors", frame.floors.map((f, i) => (i === 0 ? { ...f, h: +(E[0] - z).toFixed(3) } : f))); } };
  const add = () => { const top = frame.floors[cur], z = E[cur] + 3; set("floors", [...frame.floors.slice(0, cur + 1), { ...top, name: `ชั้นใหม่ ${levelText(z)}`, h: 3 }, ...frame.floors.slice(cur + 1)]); goFloor(cur + 1); };
  const del = () => { if (n < 2) return; set("floors", frame.floors.filter((_, i) => i !== cur).map((f, i) => (i === cur && cur ? { ...f, h: +(f.h + frame.floors[cur].h).toFixed(3) } : f))); goFloor(Math.max(0, cur - 1)); };
  // elevation figure: levels to scale, columns between them, storey heights on the right
  const zs = [base, ...E], zMin = Math.min(base, 0), zMax = E.at(-1), H = 240, W = 300, sy = (H - 24) / Math.max(zMax - zMin, 1), Y = (z) => 12 + (zMax - z) * sy;
  return (
    <Card title="ระดับชั้น (Story)" icon={Layers}>
      <table className="w-full text-[12px]">
        <thead><tr className="text-left text-[11px] text-gray-500"><th className="py-1 font-medium">ชั้น / ระดับคาน</th><th className="font-medium">ระดับ (ม.)</th><th className="font-medium">สูงชั้น (ม.)</th></tr></thead>
        <tbody>
          {[...frame.floors.keys()].reverse().map((k) => (
            <tr key={k} onClick={() => goFloor(k)} className={`cursor-pointer border-t border-gray-100 ${k === cur ? "bg-brand-50" : "hover:bg-gray-50"}`}>
              <td className="py-1 pr-1"><input value={frame.floors[k].name} onClick={(e) => e.stopPropagation()} onChange={(e) => set("floors", frame.floors.map((f, i) => (i === k ? { ...f, name: e.target.value } : f)))}
                className={`h-7 w-full rounded border border-transparent bg-transparent px-1 text-[12px] hover:border-gray-300 focus:border-brand-300 ${k === cur ? "font-semibold text-brand-600" : ""}`} /></td>
              <td><input key={`${k}:${E[k]}`} type="number" step="0.05" defaultValue={+E[k].toFixed(3)} onClick={(e) => e.stopPropagation()} onBlur={(e) => setLevel(k, Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={num} /></td>
              <td><input key={`h${k}:${frame.floors[k].h}`} type="number" step="0.05" defaultValue={frame.floors[k].h} onClick={(e) => e.stopPropagation()} onBlur={(e) => setH(k, Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={num} /></td>
            </tr>))}
          <tr className="border-t border-gray-200 text-gray-600">
            <td className="py-1 pl-1">โคนเสา (หลังฐานราก)</td>
            <td><input key={`b:${base}`} type="number" step="0.05" defaultValue={+base.toFixed(3)} onBlur={(e) => setBase(Number(e.target.value))} onKeyDown={(e) => e.key === "Enter" && e.target.blur()} className={num} /></td><td />
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex gap-2">
        <button onClick={add} className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-brand-500 ring-1 ring-brand-500/40 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่มชั้นเหนือ {frame.floors[cur]?.name}</button>
        {n > 1 && <button onClick={del} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium text-red-600 ring-1 ring-red-200 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />ลบชั้น</button>}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 w-full rounded-lg bg-gray-50">
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
      <p className="mt-1 text-[11px] text-gray-400">ใส่ระดับหลังคานของแต่ละชั้น (หรือความสูงชั้น) · ความสูงเสาใต้ชั้น = ระดับชั้นนั้น − ระดับชั้นล่าง · ชื่อที่มี +x.xx จะเปลี่ยนตามระดับ</p>
    </Card>
  );
}
