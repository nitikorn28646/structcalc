// Wall types (step 5, tab "ผนัง (แบบวาด)") — user 2026-11-19: the old panel (a tall form per type, everything open) was hard to read.
// One compact row per type: name, build-up in words, thickness, kg/m², how many walls use it, and which type the wall tool draws now.
// Click a row → its settings open under it (one at a time) with the weight worked out in a line. Weights: floor.js wallTypeW (unchanged).
import { useState } from "react";
import { ChevronDown, Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { Card } from "./ui.jsx";
import { PLASTER, WALL_MATERIALS, wallThick, wallTypeW } from "../engine/floor.js";
import { useWallDraw } from "./wallDraw.js";

const n0 = (v) => Math.round(v).toLocaleString("en-US");
const summary = (t) => (!t.core ? "กำหนดน้ำหนักเอง"
  : t.core === "gypsum" ? "ผนังเบา ยิปซัม"
  : `${WALL_MATERIALS[t.core]?.[0] ?? t.core} ${+((t.t ?? 0.1) * 100).toFixed(1)} ซม. · ${(t.sides ?? 2) ? `ฉาบ ${t.plaster ?? 1.5} ซม. ${t.sides ?? 2} ด้าน` : "ไม่ฉาบ"}`);
// the weight in one line, the same arithmetic as wallTypeW
const workLine = (t) => {
  if (!t.core) return `กำหนดเอง ${n0(t.w ?? 0)} กก./ม.²`;
  if (t.core === "gypsum") return `ผนังเบา ${n0(t.dry ?? 30)} กก./ม.² (ทั้งผนัง)`;
  const d = WALL_MATERIALS[t.core][1], th = t.t ?? 0.1, pl = (t.plaster ?? 1.5) / 100, s = t.sides ?? 2, core = d * th, pls = PLASTER * pl * s;
  return `${n0(d)} × ${th.toFixed(3)} = ${n0(core)}${s ? ` + ฉาบ ${n0(PLASTER)} × ${pl.toFixed(3)} × ${s} = ${n0(pls)}` : ""} → ${n0(core + pls)} กก./ม.²`;
};

export default function WallTypesPanel({ wallTypes, setWallTypes, frame }) {
  const [open, setOpen] = useState(null), [draw, setDraw] = useWallDraw();
  const drawId = wallTypes.some((t) => t.id === draw.kind) ? draw.kind : wallTypes[0]?.id;
  const uses = (id) => frame.floors.reduce((s, f) => s + (f.walls ?? []).filter((w) => w.kind === id).length, 0);
  const put = (i, p) => setWallTypes(wallTypes.map((x, j) => (j === i ? (() => { const n = { ...x, ...p }; return { ...n, w: Math.round(wallTypeW(n)) }; })() : x)));
  const add = () => {
    const t = { id: `w${Date.now()}`, name: "ผนังใหม่", core: "brick", t: 0.1, plaster: 1.5, sides: 2 };
    setWallTypes([...wallTypes, { ...t, w: Math.round(wallTypeW(t)) }]); setOpen(t.id);
  };
  const lab = "block min-w-0 text-[11px] text-gray-500", inp = "mt-0.5 h-8 w-full min-w-0 rounded-md border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800 dark:border-gray-700 dark:text-gray-200";
  return (
    <Card title="ชนิดผนัง" icon={Ruler}>
      <div className="-mt-1 mb-2 flex items-center justify-between gap-2 text-[11px] text-gray-500">
        <span>คลิกแถวเพื่อแก้ · <span className="text-[#b54708]">●</span> ชนิดที่จะลาก</span>
        <button onClick={add} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-brand-600 ring-1 ring-brand-300 hover:bg-brand-50"><Plus className="h-3.5 w-3.5" />เพิ่ม</button>
      </div>
      <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200 dark:divide-gray-800 dark:border-gray-800">
        {wallTypes.map((t, i) => {
          const isOpen = open === t.id, used = uses(t.id), isDraw = t.id === drawId;
          return (
            <li key={t.id} className={isOpen ? "bg-gray-50/70 dark:bg-white/[0.02]" : ""}>
              <div role="button" tabIndex={0} onClick={() => setOpen(isOpen ? null : t.id)} onKeyDown={(e) => e.key === "Enter" && setOpen(isOpen ? null : t.id)}
                className="flex cursor-pointer items-center gap-2 px-2.5 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
                <button onClick={(e) => { e.stopPropagation(); setDraw({ kind: t.id }); }} title={isDraw ? "เครื่องมือผนังลากชนิดนี้อยู่" : "ให้เครื่องมือผนังลากชนิดนี้"}
                  className={`h-3.5 w-3.5 shrink-0 rounded-full ring-2 ${isDraw ? "bg-[#b54708] ring-[#fdb022]" : "bg-transparent ring-gray-300 hover:ring-[#fdb022]"}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-1.5"><span className="truncate text-[13px] font-medium text-gray-800 dark:text-gray-100" title={t.name}>{t.name}</span>
                    {used > 0 && <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-white/10" title={`ผนังที่ใช้ชนิดนี้ทุกชั้น ${used} เส้น`}>{used} เส้น</span>}</div>
                  <div className="truncate text-[11px] text-gray-500" title={summary(t)}>{t.core ? `${summary(t)} · หนารวม ${Math.round(wallThick(t) * 100)} ซม.` : summary(t)}</div>
                </div>
                <div className="shrink-0 text-right tabular-nums"><b className="text-[14px] text-[#b54708]">{n0(t.w ?? wallTypeW(t))}</b><div className="text-[10px] text-gray-400">กก./ม.²</div></div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </div>
              {isOpen && (
                <div className="space-y-2 px-2.5 pb-3 pt-1">
                  <label className={lab}>ชื่อ<input defaultValue={t.name} key={t.name} onBlur={(e) => setWallTypes(wallTypes.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() || x.name } : x)))} className={inp} /></label>
                  <label className={lab}>เนื้อผนัง
                    <select value={t.core ?? ""} onChange={(e) => put(i, e.target.value ? { core: e.target.value, t: t.t ?? 0.1, plaster: t.plaster ?? 1.5, sides: t.sides ?? 2 } : { core: undefined })} className={inp}>
                      <option value="">กำหนดน้ำหนักเอง (กก./ม.²)</option>
                      {Object.entries(WALL_MATERIALS).map(([k, [nm, d]]) => <option key={k} value={k}>{nm}{d ? ` · ${n0(d)} กก./ม.³` : ""}</option>)}
                    </select></label>
                  {!t.core ? <label className={lab}>น้ำหนักผนัง (กก./ม.²)<input type="number" step="5" defaultValue={t.w} key={t.w} onBlur={(e) => setWallTypes(wallTypes.map((x, j) => (j === i ? { ...x, w: Number(e.target.value) || x.w } : x)))} className={`${inp} text-right tabular-nums`} /></label>
                    : t.core === "gypsum" ? <label className={lab}>น้ำหนักทั้งผนัง (กก./ม.²)<input type="number" step="5" value={t.dry ?? 30} onChange={(e) => put(i, { dry: Number(e.target.value) })} className={`${inp} text-right tabular-nums`} /></label>
                    : <div className="grid grid-cols-3 gap-2">
                        <label className={lab}>หนา (ซม.)<input type="number" step="0.5" value={+((t.t ?? 0.1) * 100).toFixed(1)} onChange={(e) => put(i, { t: Number(e.target.value) / 100 })} className={`${inp} text-right tabular-nums`} /></label>
                        <label className={lab}>ฉาบ (ซม.)<input type="number" step="0.5" value={t.plaster ?? 1.5} disabled={(t.sides ?? 2) === 0} onChange={(e) => put(i, { plaster: Number(e.target.value) })} className={`${inp} text-right tabular-nums disabled:opacity-40`} /></label>
                        <label className={lab}>ฉาบ<select value={t.sides ?? 2} onChange={(e) => put(i, { sides: Number(e.target.value) })} className={inp}><option value={2}>2 ด้าน</option><option value={1}>1 ด้าน</option><option value={0}>ไม่ฉาบ</option></select></label>
                      </div>}
                  {t.core && <p className="rounded-md bg-white px-2 py-1.5 text-[11px] tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-transparent dark:text-gray-400 dark:ring-gray-800">{workLine(t)}</p>}
                  <div className="flex items-center gap-2 text-[12px]">
                    {!isDraw && <button onClick={() => setDraw({ kind: t.id })} className="inline-flex items-center gap-1 rounded-md px-2 py-1 font-medium text-[#b54708] ring-1 ring-[#fdb022] hover:bg-[#fffaeb]"><Pencil className="h-3.5 w-3.5" />ใช้ลากผนัง</button>}
                    <button disabled={wallTypes.length < 2 || used > 0} onClick={() => { setWallTypes(wallTypes.filter((_, j) => j !== i)); setOpen(null); }}
                      title={used ? `มีผนัง ${used} เส้นใช้ชนิดนี้อยู่ — เปลี่ยนผนังเหล่านั้นเป็นชนิดอื่นก่อน` : "ลบชนิดนี้"}
                      className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-red-600 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent"><Trash2 className="h-3.5 w-3.5" />ลบ</button>
                  </div>
                </div>)}
            </li>);
        })}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-gray-400">น้ำหนักต่อเมตร = กก./ม.² × ความสูงผนัง (ใต้คาน) หักประตู / หน้าต่าง · ใส่ผนังให้หลายคานทีเดียว: ตาราง "ผนัง / น้ำหนักบนคาน" ที่แถบขวา</p>
    </Card>
  );
}
