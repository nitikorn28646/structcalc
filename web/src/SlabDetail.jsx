// Slab / stair reinforcement by position and section drawings (user 2026-11-04: check the slab and stair bars in the design step).
// slabRebar(row) turns a designSlabs() row into the bars at each position; SlabSection draws a section with those bars (SVG).
import { fmt } from "./beamModel.js";

const sp = (s) => (s > 0 ? `@ ${fmt(s, 2)}` : "");
const bar = (t) => String(t ?? "").split("@")[0].trim();
// rows: [{ pos, text, need }] — need = required As cm²/m (from the engine) where it gives one
export function slabRebar(row) {
  const r = row.r; if (!r) return [];
  if (row.way === "สองทาง") {
    const b = bar(r.shortText), bL = bar(r.longText);
    const out = [
      { pos: "ล่าง แนวสั้น (กลางช่วง)", text: `${b} ${sp(r.sShort)}`, need: r.AsS?.[1] },
      { pos: "ล่าง แนวยาว (กลางช่วง)", text: `${bL} ${sp(r.sLong)}`, need: r.AsL?.[1] },
    ];
    if (row.cont > 0) out.push({ pos: `บน ขอบต่อเนื่อง (${row.cont} ด้าน) แนวสั้น / ยาว`, text: `${b} ${sp(r.sShort)} / ${bL} ${sp(r.sLong)}`, need: Math.max(r.AsS?.[2] ?? 0, r.AsL?.[2] ?? 0) });
    if (row.cont < 4) out.push({ pos: `บน ขอบไม่ต่อเนื่อง (${4 - row.cont} ด้าน)`, text: `${b} ${sp(r.sShort)} / ${bL} ${sp(r.sLong)}`, need: Math.max(r.AsS?.[0] ?? 0, r.AsL?.[0] ?? 0) });
    return out;
  }
  if (row.way === "ทางเดียว") return [
    { pos: "ล่าง แนวสั้น (เหล็กหลัก)", text: r.mainText, need: r.As },
    ...(row.cont > 0 ? [{ pos: `บน ขอบต่อเนื่อง (${row.cont} ด้าน)`, text: r.mainText, need: r.As }] : []),
    { pos: "แนวยาว (กันร้าว)", text: r.tempText, need: r.AsTemp },
  ];
  if (row.kind === "C") return [{ pos: "บน (เหล็กหลัก) ยื่นเข้าพื้นด้านใน", text: r.mainText, need: r.As }, { pos: "กันร้าว", text: r.tempText, need: r.AsTemp }];
  if (row.kind === "ST") return [{ pos: "ล่าง ตามความยาวบันได (เหล็กหลัก)", text: r.mainText, need: r.As }, { pos: "บน ที่ปลายบน-ล่าง (≈ L/4)", text: r.mainText, need: null }, { pos: "ขวาง (กันร้าว)", text: r.tempText, need: r.AsTemp }];
  return [];
}

// section along the main span. Slab: supports at both ends (beams), bottom bar full length, top bars ≈ S/4 at continuous ends
// (S/5 hooked at discontinuous). Cantilever: top bar over the support into the back span. Stair: inclined waist between landings.
export function SlabSection({ row, t, dark }) {
  const W = 360, H = 120, ink = dark ? "#e3e6f0" : "#344054", steel = "#d92d20", conc = dark ? "#2b3147" : "#eef0f5";
  const r = row.r; if (!r) return null;
  const th = Math.max(16, Math.min(34, (t ?? 0.12) * 220)), x0 = 30, x1 = W - 30, y0 = 40, c = 5;
  const lab = (x, y, s, a = "middle", col = ink) => <text x={x} y={y} fontSize="10" textAnchor={a} fill={col}>{s}</text>;
  if (row.kind === "ST") {
    const ya = 92, yb = 24, ang = Math.atan2(ya - yb, x1 - 80 - (x0 + 50)), n = [Math.sin(ang), Math.cos(ang)], T = th * 0.8;
    const P = (x, y, o) => `${x + n[0] * o},${y + n[1] * o}`;
    return (<svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px]">
      <polygon points={`${x0},${ya} ${x0 + 50},${ya} ${x1 - 80},${yb} ${x1},${yb} ${x1},${yb + T} ${x1 - 80 + 6},${yb + T} ${P(x0 + 50, ya, T)} ${x0},${ya + T}`} fill={conc} stroke={ink} strokeWidth="1" />
      <polyline points={`${x0 + 4},${ya + T - c} ${P(x0 + 50, ya, T - c)} ${P(x1 - 80, yb, T - c)} ${x1 - 4},${yb + T - c}`} fill="none" stroke={steel} strokeWidth="2" />
      <polyline points={`${x0 + 4},${ya + c} ${x0 + 70},${ya - 15 + c}`} fill="none" stroke={steel} strokeWidth="1.6" strokeDasharray="0" />
      <polyline points={`${x1 - 100},${yb + 15 + c} ${x1 - 4},${yb + c}`} fill="none" stroke={steel} strokeWidth="1.6" />
      {lab((x0 + x1) / 2 + 10, 74, `ล่าง ${r.mainText}`, "middle", steel)}{lab((x0 + x1) / 2, H - 6, `ท้องบันไดหนา ${fmt(t ?? 0.12, 2)} ม. · กันร้าว ${r.tempText} · ช่วง ${fmt(row.L, 2)} ม.`)}
    </svg>);
  }
  const yb = y0 + th, main = row.way === "สองทาง" ? `${bar(r.shortText)} ${sp(r.sShort)}` : r.mainText;
  const contL = row.cont > 0, contR = row.cont > 1 || row.way === "สองทาง" ? row.cont > 1 : false, q = (x1 - x0) / 4;
  const sup = (x) => <rect x={x - 10} y={yb} width="20" height="30" fill={conc} stroke={ink} strokeWidth="1" />;
  if (row.kind === "C") {
    const xs = x0 + 90;
    return (<svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px]">
      <rect x={x0} y={y0} width={x1 - x0} height={th} fill={conc} stroke={ink} strokeWidth="1" />{sup(xs)}
      <polyline points={`${x0 + 4},${y0 + c} ${x1 - 4},${y0 + c} ${x1 - 4},${y0 + c + 10}`} fill="none" stroke={steel} strokeWidth="2" />
      {lab(xs, yb + 44, "คานรับ")}{lab((xs + x1) / 2, y0 - 6, `บน ${r.mainText} ยาวตลอด + เข้าพื้นใน`, "middle", steel)}
      {lab((x0 + x1) / 2, H - 6, `หนา ${fmt(t ?? 0.12, 2)} ม. · ยื่น ${fmt(row.L, 2)} ม. · กันร้าว ${r.tempText}`)}
    </svg>);
  }
  return (<svg viewBox={`0 0 ${W} ${H}`} className="w-full max-w-[440px]">
    <rect x={x0} y={y0} width={x1 - x0} height={th} fill={conc} stroke={ink} strokeWidth="1" />{sup(x0 + 10)}{sup(x1 - 10)}
    <line x1={x0 + 4} y1={yb - c} x2={x1 - 4} y2={yb - c} stroke={steel} strokeWidth="2" />
    {[0, 1].map((e) => { const cont = e === 0 ? contL : contR, xa = e === 0 ? x0 + 4 : x1 - 4, xb = e === 0 ? x0 + (cont ? q : q * 0.8) : x1 - (cont ? q : q * 0.8);
      return <g key={e}><polyline points={`${xa},${y0 + c + (cont ? 0 : 10)} ${xa},${y0 + c} ${xb},${y0 + c}`} fill="none" stroke={steel} strokeWidth="1.8" />
        {lab((xa + xb) / 2, y0 - 6, cont ? "บน ≈ S/4 (ต่อเนื่อง)" : "บน ≈ S/5 งอขอ", "middle", steel)}</g>; })}
    {lab((x0 + x1) / 2, yb - c - 5, `ล่าง ${main}`, "middle", steel)}
    {lab((x0 + x1) / 2, H - 6, `${row.way} · หนา ${fmt(t ?? 0.12, 2)} ม. · ช่วงสั้น S = ${fmt(row.S ?? row.L, 2)} ม.${row.way === "สองทาง" ? ` · แนวยาว ${bar(r.longText)} ${sp(r.sLong)}` : ` · กันร้าว ${r.tempText}`}`)}
  </svg>);
}
