// Section drawings under the step-8 type tables (same drawings as the report): beam types at the support and mid-span,
// column types per level. They redraw as the tables are edited.
import Drawing from "./Drawing.jsx";
import { beamSectionModel, columnSectionModel } from "./drawings.js";
import { barLayers, faceBars, parseBars, stLabel } from "../engine/floor.js";
import { SLAB_BARS } from "../engine/tables.js";
import { fmt } from "./beamModel.js";

const card = "rounded-xl bg-[#fff] p-2 ring-1 ring-gray-200", cap = "mt-1 text-center text-[11px] text-[#667085]";
// the same layers as the design (clear spacing, overflow to the next layer)
const Lay = (t, mat) => (main, special) => barLayers(t.b, mat, t.st, parseBars(main), parseBars(special));

export function BeamTypeFigures({ types, mat, count = () => null }) {
  return (
    <div className="mt-4"><p className="mb-1 text-sm font-semibold text-gray-800">รูปตัดเหล็กเสริม type คาน (หัวเสา · กลางคาน)</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5">{types.map((t, i) => (
        <div key={i} className={card}>
          <div className="grid grid-cols-2 gap-1">{(({ L = Lay(t, mat) }) => [["หัวเสา", L(t.top, t.topX), L(t.bot), t.sSup], ["กลางคาน", L(t.top), L(t.bot, t.botX), t.sMid]])({}).map(([w, top, bottom, s]) => (
            <div key={w}><Drawing model={beamSectionModel({ b: t.b, h: t.h, cover: mat.cover, stirrupBar: t.st, top, bottom })} className="mx-auto h-[34mm]" fontSize={8} width={120} />
              <p className={cap}>{w} · {stLabel(t)} @{fmt(s, 2)}</p></div>))}</div>
          <p className={`${cap} font-medium text-[#344054]`}>{t.name} {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)} ซม.{count(i) !== null ? ` · ใช้ ${count(i)} ช่วง` : ""}</p>
        </div>))}</div>
    </div>
  );
}

export function ColumnTypeFigures({ types, mat }) {
  return (
    <div className="mt-4"><p className="mb-1 text-sm font-semibold text-gray-800">รูปตัดเหล็กเสริม type เสา (แต่ละระดับ)</p>
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">{types.flatMap((t, i) => t.levels.map((lv, j) => { const [nx, ny] = faceBars(lv.n); return (
        <div key={`${i}-${j}`} className={card}>
          <Drawing model={columnSectionModel({ Bx: lv.Bx, By: lv.By, cover: mat.coverCol ?? mat.cover, tieD: SLAB_BARS[lv.tieBar]?.d ?? 0.6, barD: SLAB_BARS[lv.mainBar]?.d ?? 1.2, nx, ny })} className="mx-auto h-[34mm]" fontSize={8} width={120} />
          <p className={cap}>{t.name} {lv.level} · {lv.Bx}×{lv.By} · {lv.n}-{lv.mainBar} · {lv.tieBar} @{fmt(lv.s, 2)}</p>
        </div>); }))}</div>
    </div>
  );
}
