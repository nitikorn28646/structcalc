// Construction-drawing style details (user 2026-11-04: "รูปประกอบ … สวยสมจริงกว่านี้"): SVG in cm with drafting line weights,
// concrete / soil hatching, bars at true size, closed stirrups / ties with 135° hooks, leader-line bar marks, dimensions and levels.
// BeamDetail (section at the support or mid-span of a beam type), ColumnDetail (one level of a column type), FootingDetail
// (spread footing or pile cap: plan + section). Shared between the design step and the report.
import { barLayout } from "./drawings.js";
import { barLayers, faceBars, parseBars, stLabel } from "../engine/floor.js";
import { BARS, STIRRUPS, SLAB_BARS } from "../engine/tables.js";
import { PILES } from "../engine/footing.js";
import { fmt } from "./beamModel.js";

const INK = "#1d2939", BAR = "#c2413a", TIE = "#2f8f63", DIM = "#667085";
let uid = 0;
function Defs({ id }) {
  return (
    <defs>
      {/* concrete: light grey with sparse aggregate marks; soil: diagonal hatch */}
      <pattern id={`c${id}`} width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#eef0f4" /><circle cx="1.5" cy="1.5" r="0.35" fill="#98a2b3" /><path d="M4 4.4 l0.8 -1.2 l0.8 1.2 z" fill="none" stroke="#98a2b3" strokeWidth="0.2" /></pattern>
      <pattern id={`s${id}`} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="5" stroke="#a16207" strokeWidth="0.35" strokeOpacity="0.6" /></pattern>
      <marker id={`a${id}`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0,1 L10,5 L0,9 z" fill={INK} /></marker>
    </defs>
  );
}
const Txt = ({ x, y, s, a = "middle", size = 3.2, c = INK, w = 400, rot }) => <text x={x} y={y} fontSize={size} textAnchor={a} dominantBaseline="middle" fill={c} fontWeight={w} transform={rot ? `rotate(-90 ${x} ${y})` : undefined}>{s}</text>;
// dimension line between two points along x (vert = along y), offset already applied
function Dim({ x1, y1, x2, y2, label, size = 3 }) {
  const v = x1 === x2, t = size * 0.4;
  return (<g stroke={DIM} strokeWidth={size * 0.08}>
    <line x1={x1} y1={y1} x2={x2} y2={y2} />
    {[[x1, y1], [x2, y2]].map(([x, y], i) => <line key={i} x1={x - t} y1={y + t} x2={x + t} y2={y - t} strokeWidth="0.45" />)}
    <g stroke="none">{v ? <Txt x={x1 - size * 0.75} y={(y1 + y2) / 2} s={label} size={size} c={DIM} rot /> : <Txt x={(x1 + x2) / 2} y={y1 - size * 0.7} s={label} size={size} c={DIM} />}</g>
  </g>);
}
// leader: from a bar to a note
const Leader = ({ from, to, s, a = "start", id, size = 3 }) => (<g>
  <polyline points={`${from[0]},${from[1]} ${to[0]},${to[1]} ${to[0] + (a === "start" ? size : -size)},${to[1]}`} fill="none" stroke={INK} strokeWidth={size * 0.08} markerStart={`url(#a${id})`} />
  <Txt x={to[0] + (a === "start" ? size * 1.3 : -size * 1.3)} y={to[1]} s={s} a={a} size={size} />
</g>);
// closed stirrup / tie (centre line inset `ins`), radius r, 135° hooks at the top-left corner
function Hoop({ x0, y0, w, h, d, r = 2 }) {
  const k = Math.max(6 * d, 5) * 0.7;
  return (<g fill="none" stroke={TIE} strokeWidth={d} strokeLinejoin="round" strokeLinecap="round">
    <rect x={x0} y={y0} width={w} height={h} rx={r} />
    <polyline points={`${x0 + d},${y0 + d} ${x0 + d + k},${y0 + d + k}`} /><polyline points={`${x0 + d},${y0 + 0.5} ${x0 + d + k * 0.9},${y0 + d + k * 0.6}`} />
  </g>);
}
const barNote = (l) => [l?.main?.n ? `${l.main.n}-${l.main.bar.replace(" ", "")}` : "", l?.special?.n ? `${l.special.n}-${l.special.bar.replace(" ", "")}` : ""].filter(Boolean).join(" + ");

// ---------------------------------------------------------------- beam section
export function BeamDetail({ t, mat, at = "sup", className = "" }) {
  const id = ++uid, B = t.b * 100, H = t.h * 100, cover = mat.cover ?? 3, sd = STIRRUPS[t.st]?.d ?? (t.st === "RB 9" ? 0.9 : 0.6);
  const lay = (m, x) => barLayers(t.b, mat, t.st, parseBars(m), parseBars(x));
  const top = at === "sup" ? lay(t.top, t.topX) : lay(t.top), bot = at === "sup" ? lay(t.bot) : lay(t.bot, t.botX);
  // drawing y down: barLayout gives y up from the bottom face
  const bars = [...barLayout(B, H, cover, sd, top, true), ...barLayout(B, H, cover, sd, bot, false)];
  const fs = Math.max(3.4, Math.max(B, H) / 8.5), M = fs * 5, W = B + M + fs * 14, Hh = H + 2 * M, Y = (y) => M + H - y;
  const topBar = bars.filter((b) => b.y > H / 2), botBar = bars.filter((b) => b.y <= H / 2), s = at === "sup" ? t.sSup : t.sMid;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className={className}>
      <Defs id={id} />
      <rect x={M} y={M} width={B} height={H} fill={`url(#c${id})`} stroke={INK} strokeWidth="0.7" />
      <Hoop x0={M + cover + sd / 2} y0={M + cover + sd / 2} w={B - 2 * cover - sd} h={H - 2 * cover - sd} d={sd} />
      {(t.stSets ?? 1) > 1 && <Hoop x0={M + cover + sd * 1.6} y0={M + cover + sd * 1.6} w={B - 2 * cover - sd * 3.2} h={H - 2 * cover - sd * 3.2} d={sd} />}
      {bars.map((b, i) => <circle key={i} cx={M + b.x} cy={Y(b.y)} r={b.d / 2} fill={b.special ? "#7a2e0e" : BAR} stroke={INK} strokeWidth="0.15" />)}
      {topBar[0] && <Leader size={fs} id={id} from={[M + topBar.at(-1).x, Y(topBar.at(-1).y)]} to={[M + B + fs * 1.6, M - fs * 1.2]} s={`บน ${top.map(barNote).filter(Boolean).join(" / ")}`} />}
      {botBar[0] && <Leader size={fs} id={id} from={[M + botBar.at(-1).x, Y(botBar.at(-1).y)]} to={[M + B + fs * 1.6, M + H + fs * 1.6]} s={`ล่าง ${bot.map(barNote).filter(Boolean).join(" / ")}`} />}
      <Leader size={fs} id={id} from={[M + B - cover - sd / 2, M + H / 2]} to={[M + B + fs * 1.6, M + H / 2]} s={`ปลอก ${stLabel(t)} @${fmt(s, 2)}`} />
      <Dim size={fs} x1={M} y1={M + H + fs * 1.8} x2={M + B} y2={M + H + fs * 1.8} label={fmt(B, 0)} />
      <Dim size={fs} x1={M - fs * 1.5} y1={M} x2={M - fs * 1.5} y2={M + H} label={fmt(H, 0)} />
    </svg>
  );
}

// ---------------------------------------------------------------- column section (one level of a type)
export function ColumnDetail({ lv, cover = 3, className = "" }) {
  const id = ++uid, Bx = lv.Bx, By = lv.By, [nx, ny] = faceBars(lv.n), db = SLAB_BARS[lv.mainBar]?.d ?? BARS[lv.mainBar]?.d ?? 1.2, td = SLAB_BARS[lv.tieBar]?.d ?? 0.6;
  const fs = Math.max(3.4, Math.max(Bx, By) / 6.5), M = fs * 5, W = Bx + M + fs * 13, Hh = By + 2 * M, x0 = M + cover + td + db / 2, x1 = M + Bx - cover - td - db / 2, y0 = M + cover + td + db / 2, y1 = M + By - cover - td - db / 2;
  const pts = []; for (let i = 0; i < nx; i++) { const x = nx > 1 ? x0 + ((x1 - x0) * i) / (nx - 1) : (x0 + x1) / 2; pts.push([x, y0], [x, y1]); }
  for (let j = 1; j < ny - 1; j++) { const y = y0 + ((y1 - y0) * j) / (ny - 1); pts.push([x0, y], [x1, y]); }
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className={className}>
      <Defs id={id} />
      <rect x={M} y={M} width={Bx} height={By} fill={`url(#c${id})`} stroke={INK} strokeWidth="0.7" />
      <Hoop x0={M + cover + td / 2} y0={M + cover + td / 2} w={Bx - 2 * cover - td} h={By - 2 * cover - td} d={td} />
      {pts.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={db / 2} fill={BAR} stroke={INK} strokeWidth="0.15" />)}
      <Leader size={fs} id={id} from={[x1, y0]} to={[M + Bx + fs * 1.6, M - fs]} s={`${lv.n}-${lv.mainBar.replace(" ", "")}`} />
      <Leader size={fs} id={id} from={[M + Bx - cover - td / 2, M + By / 2]} to={[M + Bx + fs * 1.6, M + By / 2]} s={`ปลอก ${lv.tieBar.replace(" ", "")} @${fmt(lv.s, 2)}`} />
      <Dim size={fs} x1={M} y1={M + By + fs * 1.8} x2={M + Bx} y2={M + By + fs * 1.8} label={fmt(Bx, 0)} />
      <Dim size={fs} x1={M - fs * 1.5} y1={M} x2={M - fs * 1.5} y2={M + By} label={fmt(By, 0)} />
    </svg>
  );
}

// ---------------------------------------------------------------- footing: plan (top) + section A–A (bottom)
export function FootingDetail({ f, mark = "", className = "" }) {
  const r = f.r, inp = f.inp; if (!r || !inp) return null;
  const id = ++uid, Bx = r.Bx * 100, By = r.By * 100, T = (inp.t ?? 0.4) * 100, Df = (inp.Df ?? 1.2) * 100, c = inp.cover ?? 7.5;
  const bx = (inp.bx ?? 0.2) * 100, by = (inp.by ?? 0.2) * 100, pile = f.kind !== "spread" ? PILES[f.pile] : null, pb = (pile?.b ?? 0.2) * 100;
  const fs = Math.max(3.4, Math.max(Bx, By) / 14), sL = (inp.sLong ?? 0.15) * 100, sS = (inp.sShort ?? inp.sLong ?? 0.15) * 100, M = fs * 6, gap = fs * 8, W = Bx + M + fs * 20;
  const planH = By, secH = Df + fs * 8 + (pile ? 60 : 12), Hh = M + planH + gap + secH + M;
  const px0 = M, py0 = M, sy0 = M + planH + gap + fs * 4; // section: ground line at sy0, footing bottom at sy0 + Df
  const yb = sy0 + Df, yt = yb - T;
  const across = (n0, n1, s) => { const out = []; for (let v = n0; v <= n1 + 1e-6; v += s) out.push(v); return out; };
  const xs = across(px0 + c, px0 + Bx - c, sS), ys = across(py0 + c, py0 + By - c, sL);
  const longT = r.longText ?? `${inp.longBar} @${fmt(inp.sLong, 3)}`, shortT = r.shortText ?? `${inp.shortBar} @${fmt(inp.sShort, 3)}`;
  return (
    <svg viewBox={`0 0 ${W} ${Hh}`} className={className}>
      <Defs id={id} />
      {/* plan */}
      <Txt x={px0 + Bx / 2} y={py0 - 12} s={`แปลน ${mark}`} w={600} size={fs * 1.15} />
      <rect x={px0} y={py0} width={Bx} height={By} fill="#f8f9fb" stroke={INK} strokeWidth="0.7" />
      {xs.map((x, i) => <line key={`x${i}`} x1={x} y1={py0 + c} x2={x} y2={py0 + By - c} stroke={TIE} strokeWidth="0.45" />)}
      {ys.map((y, i) => <line key={`y${i}`} x1={px0 + c} y1={y} x2={px0 + Bx - c} y2={y} stroke={BAR} strokeWidth="0.45" />)}
      {(r.piles ?? []).map(([x, y], i) => <circle key={i} cx={px0 + Bx / 2 + x * 100} cy={py0 + By / 2 - y * 100} r={pb / 2} fill="none" stroke={INK} strokeWidth="0.35" strokeDasharray="1.5 1" />)}
      <rect x={px0 + Bx / 2 - bx / 2} y={py0 + By / 2 - by / 2} width={bx} height={by} fill={INK} />
      <Dim size={fs} x1={px0} y1={py0 - 4} x2={px0 + Bx} y2={py0 - 4} label={fmt(r.Bx, 2)} />
      <Dim size={fs} x1={px0 + Bx + 5} y1={py0} x2={px0 + Bx + 5} y2={py0 + By} label={fmt(r.By, 2)} />
      <Leader size={fs} id={id} from={[px0 + Bx - c - 4, ys[Math.floor(ys.length / 2)] ?? py0 + By / 2]} to={[px0 + Bx + 12, py0 + By * 0.3]} s={`ล่าง (ยาว) ${longT}`} />
      <Leader size={fs} id={id} from={[xs[Math.floor(xs.length * 0.75)] ?? px0 + Bx / 2, py0 + By - c - 3]} to={[px0 + Bx + 12, py0 + By * 0.75]} s={`ล่าง (สั้น) ${shortT}`} />
      {/* section */}
      <Txt x={px0 + Bx / 2} y={sy0 - 12} s="รูปตัด" w={600} size={fs * 1.15} />
      <rect x={px0 - 14} y={sy0} width={Bx + 28} height={Df + 8 + (pile ? 50 : 0)} fill={`url(#s${id})`} />
      <line x1={px0 - 16} y1={sy0} x2={px0 + Bx + 16} y2={sy0} stroke={INK} strokeWidth="0.5" />
      <Txt x={px0 + Bx + 14} y={sy0 - 3} s="ระดับดิน" a="end" size={fs * 0.85} c={DIM} />
      {pile && (r.piles ?? []).filter(([, y]) => Math.abs(y) < 1e-6 || r.piles.length <= 2).map(([x], i) => <rect key={i} x={px0 + Bx / 2 + x * 100 - pb / 2} y={yb} width={pb} height={48} fill={`url(#c${id})`} stroke={INK} strokeWidth="0.5" />)}
      <rect x={px0 - 5} y={yb} width={Bx + 10} height={5} fill="#d0d5dd" stroke={INK} strokeWidth="0.3" />
      <rect x={px0} y={yt} width={Bx} height={T} fill={`url(#c${id})`} stroke={INK} strokeWidth="0.7" />
      <rect x={px0 + Bx / 2 - bx / 2} y={sy0 - 14} width={bx} height={yt - sy0 + 14} fill={`url(#c${id})`} stroke={INK} strokeWidth="0.7" />
      {/* bottom mat: bar along the cut with 90° hooks, bars across as dots */}
      <polyline points={`${px0 + c},${yb - c - Math.min(T - 2 * c, 15)} ${px0 + c},${yb - c} ${px0 + Bx - c},${yb - c} ${px0 + Bx - c},${yb - c - Math.min(T - 2 * c, 15)}`} fill="none" stroke={BAR} strokeWidth="1.2" strokeLinejoin="round" />
      {xs.slice(0, 60).map((x, i) => <circle key={i} cx={x} cy={yb - c - 1.6} r="0.8" fill={TIE} />)}
      {/* dowels into the column, bent on the mat */}
      {[-1, 1].map((sg) => { const x = px0 + Bx / 2 + sg * (bx / 2 - 4); return <polyline key={sg} points={`${x - sg * 16},${yb - c - 3} ${x},${yb - c - 3} ${x},${sy0 - 12}`} fill="none" stroke="#7a2e0e" strokeWidth="1" strokeLinejoin="round" />; })}
      <Dim size={fs} x1={px0} y1={yb + (pile ? 54 : 10)} x2={px0 + Bx} y2={yb + (pile ? 54 : 10)} label={fmt(r.Bx, 2)} />
      <Dim size={fs} x1={px0 - 9} y1={yt} x2={px0 - 9} y2={yb} label={`t ${fmt(inp.t, 2)}`} />
      <Dim size={fs} x1={px0 + Bx + 9} y1={sy0} x2={px0 + Bx + 9} y2={yb} label={`Df ${fmt(inp.Df, 2)}`} />
      <Leader size={fs} id={id} from={[px0 + Bx / 2 + bx / 2 - 4, sy0 + 2]} to={[px0 + Bx + 18, sy0 + 10]} s={`เดือย ${inp.dowelN ?? 4}-${String(inp.dowelBar ?? "DB 12").replace(" ", "")}`} />
      <Txt x={px0 + Bx / 2} y={yb + (pile ? 62 : 17)} s={`คอนกรีตหยาบ 5 ซม. · หุ้ม ${fmt(c, 1)} ซม.${pile ? ` · เข็ม ${f.n} × ${f.pile}` : ""}`} size={fs * 0.85} c={DIM} />
    </svg>
  );
}
