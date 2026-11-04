// Footing plan like the construction drawings (user 2026-11-04): grid with bubbles and spacing chains, every footing at true size
// with its width / length dimensions and the tag "F2,C1" (footing mark, column type), one colour per footing mark, piles drawn,
// columns black at true size; footings that overlap or are closer than 0.10 m (res.footings[].clash) outlined red. SVG in metres.
import { fmt } from "./beamModel.js";
import { gridAxes } from "./planKit.js";
import { PILES } from "../engine/footing.js";

const COLORS = ["#3e63dd", "#e5484d", "#30a46c", "#f76b15", "#8e4ec6", "#0e9384", "#d6409f", "#a16207", "#0284c7", "#65a30d"];
// marks F1, F2 … — the largest footing is F1 (as on the drawings); same size / piles / bars = same mark
export function footingMarks(footings) {
  // one mark = one footing (size, piles, thickness, bars). A footing of a user type keeps the type's name only while it has that
  // type's size; a footing reshaped / resized away from it (e.g. a rectangle next to a neighbour) gets the next free F number
  // (user 2026-11-04: "ถ้าเป็น F1 เหมือนกัน ขนาดก็ควรจะเท่ากัน … ไม่ได้ก็ทำ F อื่น")
  const size = (f) => `${f.kind ?? "pile"}|${f.n}|${f.pile}|${fmt(f.r?.Bx ?? 0, 2)}x${fmt(f.r?.By ?? 0, 2)}|${fmt(f.inp?.t ?? 0, 2)}|${f.r?.longText ?? f.inp?.sLong ?? ""}`;
  const groups = [...new Map(footings.map((f) => [size(f), f])).entries()].sort((a, b) => (b[1].r?.Bx ?? 0) * (b[1].r?.By ?? 0) - (a[1].r?.Bx ?? 0) * (a[1].r?.By ?? 0));
  const names = new Map(), used = new Set();
  // a type name goes to the group of that type with the most footings (its own size); other groups of that type get new names
  const byType = new Map(); for (const [k, f] of groups) if (f.type && !f.reshaped) { const n = footings.filter((x) => size(x) === k).length; if (!byType.has(f.type) || n > byType.get(f.type).n) byType.set(f.type, { k, n }); }
  for (const [t, { k }] of byType) { names.set(k, t); used.add(t); }
  let next = 1; const free = () => { while (used.has(`F${next}`)) next++; used.add(`F${next}`); return `F${next}`; };
  for (const [k] of groups) if (!names.has(k)) names.set(k, free());
  return { mark: (f) => names.get(size(f)), list: [...new Set(names.values())], color: (f) => COLORS[[...names.keys()].indexOf(size(f)) % COLORS.length] };
}

export default function FootingPlan({ floor, footings, columns = [], colTypes = [], marks = null, dark = false, className = "", print = false }) {
  const M = marks ?? footingMarks(footings), G = floor.grid ?? { x0: 0, y0: 0, dx: [], dy: [] }, { GX, GY, xName, yName } = gridAxes(G);
  const pts = [...footings.flatMap((f) => [[f.p[0] - (f.r?.Bx ?? 0.6) / 2, f.p[1] - (f.r?.By ?? 0.6) / 2], [f.p[0] + (f.r?.Bx ?? 0.6) / 2, f.p[1] + (f.r?.By ?? 0.6) / 2]]),
    ...GX.map((x) => [x, GY[0] ?? 0]), ...GY.map((y) => [GX[0] ?? 0, y])];
  if (!pts.length) return null;
  const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0])), y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
  const span = Math.max(x1 - x0, y1 - y0, 4), u = span / 60; // u = text / tick unit (m)
  const pad = 9 * u, vb = [x0 - 4 * u, -(y1 + pad), x1 - x0 + pad + 4 * u, y1 - y0 + pad + 4 * u];
  const ink = print ? "#1d2939" : dark ? "#e3e6f0" : "#1d2939", grid = print ? "#98a2b3" : dark ? "#5b6280" : "#98a2b3";
  const T = (x, y, s, o = {}) => <text x={x} y={-y} fontSize={o.size ?? 1.25 * u} textAnchor={o.a ?? "middle"} dominantBaseline={o.b ?? "middle"} fill={o.c ?? ink} fontWeight={o.w ?? 400} transform={o.rot ? `rotate(-90 ${x} ${-y})` : undefined}>{s}</text>;
  const dimH = (xa, xb, y, label, col) => <g stroke={col ?? ink} strokeWidth={0.06 * u}>
    <line x1={xa} y1={-y} x2={xb} y2={-y} />{[xa, xb].map((x) => <g key={x}><line x1={x} y1={-(y - 0.6 * u)} x2={x} y2={-(y + 0.6 * u)} /><line x1={x - 0.4 * u} y1={-(y - 0.4 * u)} x2={x + 0.4 * u} y2={-(y + 0.4 * u)} /></g>)}
    <g stroke="none">{T((xa + xb) / 2, y + 0.9 * u, label, { c: col ?? ink })}</g></g>;
  const dimV = (ya, yb, x, label, col) => <g stroke={col ?? ink} strokeWidth={0.06 * u}>
    <line x1={x} y1={-ya} x2={x} y2={-yb} />{[ya, yb].map((y) => <g key={y}><line x1={x - 0.6 * u} y1={-y} x2={x + 0.6 * u} y2={-y} /><line x1={x - 0.4 * u} y1={-(y - 0.4 * u)} x2={x + 0.4 * u} y2={-(y + 0.4 * u)} /></g>)}
    <g stroke="none">{T(x + 0.9 * u, (ya + yb) / 2, label, { rot: true, c: col ?? ink })}</g></g>;
  const ex = { x0: x0 - 2 * u, x1: x1 + 2 * u, y0: y0 - 2 * u, y1: y1 + 2 * u }, bub = 1.3 * u;
  return (
    <svg viewBox={vb.join(" ")} className={className} style={{ background: print ? "#fff" : undefined }}>
      {/* grid: dash-dot lines, bubbles, spacing chains */}
      <g stroke={grid} strokeWidth={0.05 * u} strokeDasharray={`${1.6 * u} ${0.5 * u} ${0.2 * u} ${0.5 * u}`}>
        {GX.map((x) => <line key={`gx${x}`} x1={x} y1={-ex.y1 - 2 * u} x2={x} y2={-ex.y0} />)}{GY.map((y) => <line key={`gy${y}`} x1={ex.x0} y1={-y} x2={ex.x1 + 2 * u} y2={-y} />)}
      </g>
      {GX.map((x, i) => <g key={`bx${i}`}><circle cx={x} cy={-(ex.y1 + 2 * u + bub)} r={bub} fill="none" stroke={ink} strokeWidth={0.07 * u} />{T(x, ex.y1 + 2 * u + bub, xName(i), { size: 1.4 * u })}</g>)}
      {GY.map((y, i) => <g key={`by${i}`}><circle cx={ex.x1 + 2 * u + bub} cy={-y} r={bub} fill="none" stroke={ink} strokeWidth={0.07 * u} />{T(ex.x1 + 2 * u + bub, y, yName(i), { size: 1.4 * u })}</g>)}
      {GX.slice(1).map((x, i) => <g key={`dx${i}`}>{dimH(GX[i], x, ex.y1 + 0.5 * u, fmt(x - GX[i], 2), grid)}</g>)}
      {GY.slice(1).map((y, i) => <g key={`dy${i}`}>{dimV(GY[i], y, ex.x1 + 5 * u, fmt(y - GY[i], 2), grid)}</g>)}
      {GY.length > 1 && dimV(GY[0], GY[GY.length - 1], ex.x1 + 7 * u, fmt(GY[GY.length - 1] - GY[0], 2), grid)}
      {/* footings */}
      {footings.map((f, i) => {
        const B = f.r?.Bx ?? 0.6, D = f.r?.By ?? 0.6, [cx, cy] = f.p, col = f.clash?.length ? "#d92d20" : M.color(f), c = columns.find((x) => Math.hypot(x.p[0] - cx, x.p[1] - cy) < 0.05);
        const cB = (c?.lv?.Bx ?? 20) / 100, cD = (c?.lv?.By ?? 20) / 100, ct = c ? colTypes[c.typeIdx]?.name : "";
        // free room around this footing (to the next footing, m): the dimensions / tag go where there is room (user: text overlapped)
        const room = (dir) => Math.min(Infinity, ...footings.filter((g) => g !== f).map((g) => {
          const gB = g.r?.Bx ?? 0.6, gD = g.r?.By ?? 0.6, ox = Math.abs(g.p[0] - cx) < (B + gB) / 2 + 2 * u, oy = Math.abs(g.p[1] - cy) < (D + gD) / 2 + 2 * u;
          if (dir === "up" && ox && g.p[1] > cy) return g.p[1] - gD / 2 - (cy + D / 2);
          if (dir === "down" && ox && g.p[1] < cy) return cy - D / 2 - (g.p[1] + gD / 2);
          if (dir === "right" && oy && g.p[0] > cx) return g.p[0] - gB / 2 - (cx + B / 2);
          if (dir === "left" && oy && g.p[0] < cx) return cx - B / 2 - (g.p[0] + gB / 2);
          return Infinity;
        }));
        const up = room("up"), dn = room("down"), rt = room("right"), lf = room("left"), need = 2.6 * u, tag = 2 * u;
        // a neighbour keeps room for its own width dimension (above it) and tag (below it)
        const nUp = up < Infinity ? tag : 0, nDn = dn < Infinity ? need : 0;
        const wSide = up >= need + nUp ? 1 : dn >= need + tag + nDn ? -1 : 0, dSide = rt >= need ? 1 : lf >= need ? -1 : 0;
        const tagBelow = dn >= (wSide === -1 ? need : 0) + tag + nDn, tagAbove = !tagBelow && up >= (wSide === 1 ? need : 0) + tag + nUp;
        const sizeInTag = !wSide || !dSide, label = `${M.mark(f)}${ct ? `,${ct}` : ""}${sizeInTag ? ` ${fmt(B, 2)}×${fmt(D, 2)}` : ""}`;
        const ty = tagBelow ? cy - D / 2 - (wSide === -1 ? need : 0) - 1.0 * u : tagAbove ? cy + D / 2 + (wSide === 1 ? need : 0) + 1.0 * u : cy;
        const tx = tagBelow || tagAbove ? cx - B / 2 : dSide === -1 || rt < 6 * u ? cx - B / 2 - (dSide === -1 ? need : 0) - 0.4 * u : cx + B / 2 + (dSide === 1 ? need : 0) + 0.4 * u;
        const ta = tagBelow || tagAbove ? "start" : dSide === -1 || rt < 6 * u ? "end" : "start";
        return (
          <g key={i}>
            <rect x={cx - B / 2} y={-(cy + D / 2)} width={B} height={D} fill={col} fillOpacity={0.12} stroke={col} strokeWidth={(f.clash?.length ? 0.16 : 0.09) * u} />
            {(f.r?.piles ?? []).map(([px, py], k) => <circle key={k} cx={cx + px} cy={-(cy + py)} r={(PILES[f.pile]?.b ?? 0.2) / 2} fill="none" stroke={col} strokeWidth={0.07 * u} strokeDasharray={`${0.3 * u} ${0.2 * u}`} />)}
            <rect x={cx - cB / 2} y={-(cy + cD / 2)} width={cB} height={cD} fill={ink} />
            {wSide !== 0 && dimH(cx - B / 2, cx + B / 2, wSide === 1 ? cy + D / 2 + 1.2 * u : cy - D / 2 - 1.2 * u, fmt(B, 2), col)}
            {dSide !== 0 && dimV(cy - D / 2, cy + D / 2, dSide === 1 ? cx + B / 2 + 1.2 * u : cx - B / 2 - 1.2 * u, fmt(D, 2), col)}
            {T(tx, ty, label, { a: ta, c: col, w: 600, size: 1.15 * u })}
          </g>);
      })}
    </svg>
  );
}

// legend: mark → colour, size, piles / bars, count
export function FootingLegend({ footings, marks = null }) {
  const M = marks ?? footingMarks(footings), seen = new Map();
  for (const f of footings) { const m = M.mark(f); if (!seen.has(m)) seen.set(m, { f, n: 0 }); seen.get(m).n++; }
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-gray-600">{[...seen.entries()].sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true })).map(([m, { f, n }]) => (
      <span key={m} className="flex items-center gap-1.5"><i className="inline-block h-3 w-3 rounded-sm" style={{ background: M.color(f) }} />
        <b style={{ color: M.color(f) }}>{m}</b> {fmt(f.r?.Bx ?? 0, 2)}×{fmt(f.r?.By ?? 0, 2)}×{fmt(f.inp?.t ?? 0, 2)} ม. · {f.kind === "spread" ? "ฐานแผ่" : `${f.n} × ${f.pile}`} · {n} ฐาน</span>))}
      {footings.some((f) => f.clash?.length) && <span className="font-medium text-red-600">กรอบแดง = ฐานซ้อน/ชิดกันเกิน (ห่าง &lt; 0.10 ม.)</span>}
    </div>
  );
}
