// Wall types (step 5, tab "ผนัง (แบบวาด)") — user 2026-11-19: one compact row per type (PanelKit, the same look as the other panels):
// ● = the type the wall tool draws, name + walls using it, build-up in words, kg/m²; click a row → its settings open under it with
// the weight worked out in one line. Weights: floor.js wallTypeW (unchanged).
import { useState } from "react";
import { Pencil, Plus, Ruler, Trash2 } from "lucide-react";
import { PLASTER, WALL_MATERIALS, wallThick, wallTypeW } from "../engine/floor.js";
import { useWallDraw } from "./wallDraw.js";
import { Badge, List, Note, Panel, PField, Pick, Row, btnCls, inputCls, numCls } from "./PanelKit.jsx";

const n0 = (v) => Math.round(v).toLocaleString("en-US");
const summary = (t) => (!t.core ? "กำหนดน้ำหนักเอง"
  : t.core === "gypsum" ? "ผนังเบา ยิปซัม"
  : `${WALL_MATERIALS[t.core]?.[0] ?? t.core} ${+((t.t ?? 0.1) * 100).toFixed(1)} ซม. · ${(t.sides ?? 2) ? `ฉาบ ${t.plaster ?? 1.5} ซม. ${t.sides ?? 2} ด้าน` : "ไม่ฉาบ"} · หนารวม ${Math.round(wallThick(t) * 100)} ซม.`);
// the weight in one line, the same arithmetic as wallTypeW
const workLine = (t) => {
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
  return (
    <Panel title="ชนิดผนัง" icon={Ruler} action={<button onClick={add} className={btnCls}><Plus className="h-3.5 w-3.5" />เพิ่ม</button>}
      hint={<>คลิกแถวเพื่อแก้ · <span className="text-[#b54708]">●</span> = ชนิดที่เครื่องมือผนังจะลาก</>}>
      <List>
        {wallTypes.map((t, i) => {
          const isOpen = open === t.id, used = uses(t.id), isDraw = t.id === drawId;
          return (
            <Row key={t.id} open={isOpen} onClick={() => setOpen(isOpen ? null : t.id)}
              lead={<Pick on={isDraw} onClick={() => setDraw({ kind: t.id })} title={isDraw ? "เครื่องมือผนังลากชนิดนี้อยู่" : "ให้เครื่องมือผนังลากชนิดนี้"} />}
              title={t.name} badge={used > 0 && <Badge title={`ผนังที่ใช้ชนิดนี้ทุกชั้น ${used} เส้น`}>{used} เส้น</Badge>} sub={summary(t)}
              value={<b className="text-[14px] text-[#b54708]">{n0(t.w ?? wallTypeW(t))}</b>} unit="กก./ม.²">
              <PField label="ชื่อ"><input defaultValue={t.name} key={t.name} onBlur={(e) => setWallTypes(wallTypes.map((x, j) => (j === i ? { ...x, name: e.target.value.trim() || x.name } : x)))} className={inputCls} /></PField>
              <PField label="เนื้อผนัง">
                <select value={t.core ?? ""} onChange={(e) => put(i, e.target.value ? { core: e.target.value, t: t.t ?? 0.1, plaster: t.plaster ?? 1.5, sides: t.sides ?? 2 } : { core: undefined })} className={inputCls}>
                  <option value="">กำหนดน้ำหนักเอง (กก./ม.²)</option>
                  {Object.entries(WALL_MATERIALS).map(([k, [nm, d]]) => <option key={k} value={k}>{nm}{d ? ` · ${n0(d)} กก./ม.³` : ""}</option>)}
                </select></PField>
              {!t.core ? <PField label="น้ำหนักผนัง (กก./ม.²)"><input type="number" step="5" defaultValue={t.w} key={t.w} onBlur={(e) => setWallTypes(wallTypes.map((x, j) => (j === i ? { ...x, w: Number(e.target.value) || x.w } : x)))} className={numCls} /></PField>
                : t.core === "gypsum" ? <PField label="น้ำหนักทั้งผนัง (กก./ม.²)"><input type="number" step="5" value={t.dry ?? 30} onChange={(e) => put(i, { dry: Number(e.target.value) })} className={numCls} /></PField>
                : <div className="grid grid-cols-3 gap-2">
                    <PField label="หนา (ซม.)"><input type="number" step="0.5" value={+((t.t ?? 0.1) * 100).toFixed(1)} onChange={(e) => put(i, { t: Number(e.target.value) / 100 })} className={numCls} /></PField>
                    <PField label="ฉาบ (ซม.)"><input type="number" step="0.5" value={t.plaster ?? 1.5} disabled={(t.sides ?? 2) === 0} onChange={(e) => put(i, { plaster: Number(e.target.value) })} className={`${numCls} disabled:opacity-40`} /></PField>
                    <PField label="ฉาบ"><select value={t.sides ?? 2} onChange={(e) => put(i, { sides: Number(e.target.value) })} className={inputCls}><option value={2}>2 ด้าน</option><option value={1}>1 ด้าน</option><option value={0}>ไม่ฉาบ</option></select></PField>
                  </div>}
              {t.core && <p className="rounded-md bg-white px-2 py-1.5 text-[11px] tabular-nums text-gray-600 ring-1 ring-gray-200 dark:bg-transparent dark:text-gray-400 dark:ring-gray-800">{workLine(t)}</p>}
              <div className="flex items-center gap-2">
                {!isDraw && <button onClick={() => setDraw({ kind: t.id })} className={btnCls}><Pencil className="h-3.5 w-3.5" />ใช้ลากผนัง</button>}
                <button disabled={wallTypes.length < 2 || used > 0} onClick={() => { setWallTypes(wallTypes.filter((_, j) => j !== i)); setOpen(null); }}
                  title={used ? `มีผนัง ${used} เส้นใช้ชนิดนี้อยู่ — เปลี่ยนผนังเหล่านั้นเป็นชนิดอื่นก่อน` : "ลบชนิดนี้"}
                  className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] text-red-600 hover:bg-red-50 disabled:text-gray-300 disabled:hover:bg-transparent"><Trash2 className="h-3.5 w-3.5" />ลบ</button>
              </div>
            </Row>);
        })}
      </List>
      <Note>น้ำหนักต่อเมตร = กก./ม.² × ความสูงผนัง (ใต้คาน) หักประตู / หน้าต่าง · ใส่ผนังให้หลายคานทีเดียว: ตาราง "ผนัง / น้ำหนักบนคาน" ที่แถบขวา</Note>
    </Panel>
  );
}
