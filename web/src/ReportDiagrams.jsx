// SVG diagrams for the printed reports: loads / shear / moment of a beam line (continuous result, live-load envelope and
// 3D-frame moments), column axial loads and moments, slab moment strips, and an isometric view of the 3D frame model. Pure drawing — every number comes from the engines.
import { solveBeam } from "../engine/contBeam.js";
import { fmt } from "./beamModel.js";

const W = 680, X0 = 58, X1 = W - 18, INK = "#344054", MUTE = "#98a2b3", LOAD = "#b54708", SHEAR = "#0e9384", MOM = "#1f3a5f", ENV = "#9cb9ff", F3 = "#d92d20";
const T = ({ x, y, a = "middle", c = INK, s = 10, w, children }) => <text x={x} y={y} textAnchor={a} fill={c} fontSize={s} fontWeight={w}>{children}</text>;
const path = (pts) => pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join("");
const wAt = (loads, t) => loads.reduce((s, l) => (l.P === undefined && t >= l.a - 1e-9 && t <= l.b + 1e-9 ? s + l.wa + ((l.wb - l.wa) * (t - l.a)) / (l.b - l.a || 1) : s), 0);

// one band: zero line at y0, values scaled to ±h, filled area; positive drawn downward when down = true (moment, tension side)
function Band({ y0, h, xs, ys, sx, color, down, fill = true, dash, peak = true, unit, extra = [] }) {
  const m = Math.max(1e-9, ...ys.map(Math.abs), ...extra.flat().map(Math.abs)), sy = (v) => y0 + ((down ? 1 : -1) * v * h) / m;
  const pts = xs.map((t, i) => [sx(t), sy(ys[i])]);
  const iMax = ys.indexOf(Math.max(...ys)), iMin = ys.indexOf(Math.min(...ys));
  return (
    <g>
      {fill && <path d={`${path([[sx(xs[0]), y0], ...pts, [sx(xs[xs.length - 1]), y0]])}Z`} fill={color} fillOpacity={0.14} />}
      <path d={path(pts)} fill="none" stroke={color} strokeWidth={1.3} strokeDasharray={dash} />
      {peak && [iMax, iMin].filter((i, k, a) => Math.abs(ys[i]) > m * 0.02 && a.indexOf(i) === k).map((i) => (
        <T key={i} x={Math.min(X1 - 30, Math.max(X0 + 30, pts[i][0]))} y={pts[i][1] + ((ys[i] > 0) === !!down ? 12 : -4)} c={color} s={9.5} w={600}>{fmt(ys[i], 0)}{unit ? ` ${unit}` : ""}</T>))}
    </g>
  );
}

// loads, shear and moment along a line. x/sup = nodes and supports, loads as contBeam; V, M = functions of t (full load);
// env = [{ x0, L, Mmax[41], Mmin[41] }] live-load envelope; alt = [{ x0, x1, M(t local) }] 3D-frame moments
export function BeamDiagram({ x, sup, loads, V, M, env, alt, carried = [], wide = false }) {
  const L = x[x.length - 1] - x[0], sx = (t) => X0 + ((t - x[0]) * (X1 - X0)) / (L || 1);
  const pts = loads.filter((l) => l.P !== undefined);
  const ts = [...new Set([...Array.from({ length: 241 }, (_, i) => x[0] + (L * i) / 240), ...pts.flatMap((p) => [p.at - 1e-6, p.at + 1e-6]), ...x.flatMap((v) => [v - 1e-6, v + 1e-6])])]
    .filter((t) => t >= x[0] && t <= x[x.length - 1]).sort((a, b) => a - b);
  const wv = ts.map((t) => wAt(loads, t)), wm = Math.max(1, ...wv), Pm = Math.max(1, ...pts.map((p) => p.P));
  const Vs = ts.map(V), Ms = ts.map(M);
  const eT = env?.flatMap((e) => e.Mmax.map((_, i) => e.x0 + (e.L * i) / 40)) ?? [], eMax = env?.flatMap((e) => e.Mmax) ?? [], eMin = env?.flatMap((e) => e.Mmin) ?? [];
  const aT = alt?.flatMap((m) => Array.from({ length: 21 }, (_, i) => m.x0 + ((m.x1 - m.x0) * i) / 20)) ?? [], aM = alt?.flatMap((m) => Array.from({ length: 21 }, (_, i) => m.M(((m.x1 - m.x0) * i) / 20))) ?? [];
  const yb = 62, yV = 128, yM = 232, H = 300;
  const mScale = Math.max(1e-9, ...Ms.map(Math.abs), ...eMax, ...eMin.map(Math.abs), ...aM.map(Math.abs));
  const sy = (v) => yM + (v * 46) / mScale;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={wide ? "mx-auto block h-auto max-h-[42vh] w-full" : "mx-auto w-full max-w-[170mm]"} fontFamily="inherit">
      {/* loads */}
      <T x={6} y={22} a="start" c={LOAD} w={600}>น้ำหนัก</T><T x={6} y={34} a="start" c={MUTE} s={8.5}>กก./ม.</T>
      <path d={`${path([[sx(ts[0]), yb], ...ts.map((t, i) => [sx(t), yb - (wv[i] * 34) / wm]), [sx(ts[ts.length - 1]), yb]])}Z`} fill={LOAD} fillOpacity={0.12} stroke={LOAD} strokeWidth={0.8} />
      <T x={sx(ts[wv.indexOf(wm)])} y={yb - 38} c={LOAD} s={9}>{fmt(wm, 0)}</T>
      {pts.map((p, i) => { const h = 14 + (p.P * 22) / Pm; return <g key={i}><line x1={sx(p.at)} x2={sx(p.at)} y1={yb - h - 6} y2={yb - 3} stroke={F3} strokeWidth={1.4} /><path d={`M${sx(p.at) - 3},${yb - 8}L${sx(p.at)},${yb - 2}L${sx(p.at) + 3},${yb - 8}Z`} fill={F3} /><T x={sx(p.at)} y={yb - h - 9} c={F3} s={8.5}>{fmt(p.P, 0)}</T></g>; })}
      <line x1={X0} x2={X1} y1={yb} y2={yb} stroke={INK} strokeWidth={3} />
      {x.map((v, k) => sup[k] && <path key={k} d={`M${sx(v)},${yb + 1}l-6,10h12Z`} fill={carried.some((c) => Math.abs(c - v) < 1e-3) ? "#fff" : INK} stroke={INK} strokeWidth={1} />)}
      {x.map((v, k) => k > 0 && <T key={`d${k}`} x={(sx(v) + sx(x[k - 1])) / 2} y={yb + 22} c={MUTE} s={8.5}>{fmt(v - x[k - 1], 2)}</T>)}
      {/* shear */}
      <T x={6} y={yV - 6} a="start" c={SHEAR} w={600}>แรงเฉือน</T><T x={6} y={yV + 6} a="start" c={MUTE} s={8.5}>V (กก.)</T>
      <line x1={X0} x2={X1} y1={yV} y2={yV} stroke={MUTE} strokeWidth={0.6} />
      <Band y0={yV} h={30} xs={ts} ys={Vs} sx={sx} color={SHEAR} />
      {/* moment: envelope (shaded), full load (solid), 3D (dashed); M+ (sagging) drawn below */}
      <T x={6} y={yM - 6} a="start" c={MOM} w={600}>โมเมนต์</T><T x={6} y={yM + 6} a="start" c={MUTE} s={8.5}>M (กก.-ม.)</T>
      <line x1={X0} x2={X1} y1={yM} y2={yM} stroke={MUTE} strokeWidth={0.6} />
      {eT.length > 0 && <path d={`${path(eT.map((t, i) => [sx(t), sy(eMax[i])]))}${path(eT.map((t, i) => [sx(t), sy(eMin[i])]).reverse()).replace("M", "L")}Z`} fill={ENV} fillOpacity={0.35} stroke="none" />}
      <Band y0={yM} h={46} xs={ts} ys={Ms} sx={sx} color={MOM} down extra={[eMax, eMin, aM]} />
      {aT.length > 0 && <path d={path(aT.map((t, i) => [sx(t), sy(aM[i])]))} fill="none" stroke={F3} strokeWidth={1.1} strokeDasharray="4 3" />}
      {/* legend */}
      <g transform={`translate(${X0},${H - 8})`} fontSize={8.5}>
        <rect x={0} y={-7} width={14} height={7} fill={ENV} fillOpacity={0.6} /><T x={18} y={0} a="start" s={8.5}>ขอบเขตจัดน้ำหนักจรหมากรุก</T>
        <line x1={150} x2={166} y1={-3} y2={-3} stroke={MOM} strokeWidth={1.4} /><T x={170} y={0} a="start" s={8.5}>คานต่อเนื่อง น้ำหนักเต็มทุกช่วง</T>
        {aT.length > 0 && <><line x1={325} x2={341} y1={-3} y2={-3} stroke={F3} strokeWidth={1.2} strokeDasharray="4 3" /><T x={345} y={0} a="start" s={8.5}>โครง 3 มิติ</T></>}
        <T x={X1 - X0} y={0} a="end" c={MUTE} s={8.5}>M+ (ท้องคานรับแรงดึง) แสดงด้านล่าง · △ ขาว = วางบนคาน</T>
      </g>
    </svg>
  );
}

// a beam line of a floor analysis (ln from analyzeFloor) with its 3D-frame members
export function LineDiagram({ ln, f3, wide = false }) {
  if (!ln.res || !ln.x) return null;
  const alt = f3?.filter((m) => m.kind === "beam" && m.line === ln.id).map((m) => ({ x0: m.x0, x1: m.x1, M: m.M }));
  return <BeamDiagram x={ln.x} sup={ln.sup} loads={ln.loads} V={ln.res.V} M={ln.res.M} env={ln.env?.env.map((e) => e.curve).filter(Boolean)} alt={alt?.length ? alt : null} carried={ln.carriers.map((c) => c.t)} wide={wide} />;
}

// any simple member solved here with the continuous-beam engine (roof members, stairs): x / sup / loads as contBeam
export function MemberDiagram({ x, sup, loads }) {
  const r = solveBeam({ x, sup, loads });
  if (r.error) return null;
  return <BeamDiagram x={x} sup={sup} loads={loads} V={r.V} M={r.M} />;
}

// column axial loads (bars per floor, accumulated) and 3D-frame moments for every column stack
export function ColumnChart({ stacks, floors }) {
  const n = stacks.length, bw = (X1 - X0) / Math.max(1, n), nf = floors.length, cols = ["#b7c4d6", "#5b7aa3", "#1f3a5f", "#0f1d30"];
  const P = stacks.map((st) => floors.map((_, k) => st.list.find((c) => c.floor === k))), Pm = Math.max(1, ...P.flat().filter(Boolean).map((c) => c.Pd ?? c.Pbot));
  const Mm = Math.max(1, ...P.flat().filter(Boolean).map((c) => Math.max(c.M3?.Mx ?? 0, c.M3?.My ?? 0)));
  const yP = 150, yMb = 290, H = 330;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-[170mm]">
      <T x={6} y={20} a="start" w={600}>แรงอัดเสา P (ตัน) — สะสมจากบนลงล่าง</T>
      <T x={6} y={yP - 118} a="start" c={MUTE} s={8.5}>{fmt(Pm / 1000, 1)}</T>
      <line x1={X0} x2={X1} y1={yP} y2={yP} stroke={MUTE} />
      {P.map((cs, i) => cs.map((c, k) => { if (!c) return null; const h = ((c.Pd ?? c.Pbot) * 110) / Pm, x = X0 + i * bw + 3 + (k * (bw - 6)) / nf;
        return <g key={`${i}${k}`}><rect x={x} y={yP - h} width={(bw - 6) / nf - 1} height={h} fill={cols[k % 4]} stroke={c.ok ? "none" : F3} strokeWidth={1.5} />
          {k === 0 && <T x={x + ((bw - 6) / nf) / 2} y={yP - h - 3} s={7.5}>{fmt((c.Pd ?? c.Pbot) / 1000, 1)}</T>}</g>; }))}
      {stacks.map((st, i) => <T key={i} x={X0 + i * bw + bw / 2} y={yP + 11} s={7.5} c={MUTE}>{st.key.replace(/\.00/g, "")}</T>)}
      <T x={6} y={yP + 40} a="start" w={600}>โมเมนต์จากโครง 3 มิติ max(Mx, My) (กก.-ม.)</T>
      <line x1={X0} x2={X1} y1={yMb} y2={yMb} stroke={MUTE} />
      {P.map((cs, i) => cs.map((c, k) => { if (!c) return null; const v = Math.max(c.M3?.Mx ?? 0, c.M3?.My ?? 0), h = (v * 90) / Mm, x = X0 + i * bw + 3 + (k * (bw - 6)) / nf;
        return <rect key={`m${i}${k}`} x={x} y={yMb - h} width={(bw - 6) / nf - 1} height={h} fill={cols[k % 4]} />; }))}
      <T x={X0 - 4} y={yMb - 86} a="end" c={MUTE} s={8.5}>{fmt(Mm, 0)}</T>
      <g transform={`translate(${X0},${H - 8})`}>{floors.map((f, k) => <g key={k} transform={`translate(${k * 150},0)`}><rect y={-7} width={10} height={7} fill={cols[k % 4]} /><T x={14} y={0} a="start" s={8.5}>ใต้ {f.name}</T></g>)}
        <T x={X1 - X0} y={0} a="end" s={8.5} c={F3}>กรอบแดง = ไม่ผ่าน</T></g>
    </svg>
  );
}

// slab moments per metre width: two-way short / long strips (discontinuous edge, mid, continuous edge), one-way, cantilever, stair
export function SlabStrip({ row }) {
  const r = row.r;
  if (!r) return null;
  const strip = (y, label, M, len, color) => {
    const sx = (t) => X0 + 60 + (t * 200) / len, pts = [[0, -M[0]], [len / 2, M[1]], [len, -M[2]]], m = Math.max(1, ...M.map(Math.abs));
    // quadratic through the three design values (edge, mid, edge) — the coefficient method gives only these three
    const curve = Array.from({ length: 41 }, (_, i) => { const u = i / 40; return [u * len, -M[0] * 2 * (u - 0.5) * (u - 1) + M[1] * -4 * u * (u - 1) - M[2] * 2 * u * (u - 0.5)]; });
    return <g key={label}>
      <T x={X0 + 50} y={y + 4} a="end" w={600}>{label}</T>
      <line x1={sx(0)} x2={sx(len)} y1={y} y2={y} stroke={INK} strokeWidth={2} />
      <path d={path(curve.map(([t, v]) => [sx(t), y + (v * 24) / m]))} fill="none" stroke={color} strokeWidth={1.3} />
      {pts.map(([t, v], i) => <T key={i} x={sx(t)} y={y + (v * 24) / m + (v > 0 ? 12 : -4)} c={color} s={9} w={600}>{fmt(v, 0)}</T>)}
      <T x={sx(len) + 16} y={y + 4} a="start" c={MUTE} s={8.5}>ยาว {fmt(len, 2)} ม.</T>
    </g>;
  };
  if (r.MS) return <svg viewBox={`0 0 ${W} 120`} className="mx-auto w-full max-w-[150mm]">
    <T x={6} y={14} a="start" c={MUTE} s={8.5}>{row.name} สองทาง กรณี {row.case} · M ต่อความกว้าง 1 ม. (กก.-ม./ม.) · ลบ = ที่ขอบ (ไม่ต่อเนื่อง / ต่อเนื่อง) บวก = กลางแผ่น</T>
    {strip(48, "แถบด้านสั้น", r.MS, row.S, MOM)}{strip(96, "แถบด้านยาว", r.ML, row.L, SHEAR)}</svg>;
  // one-way, cantilever and stair: the design moment on a 1 m strip as a simple diagram
  const len = row.L ?? 1, w = r.w ?? 0, cant = row.kind === "C";
  return <div className="mx-auto max-w-[150mm]"><MemberDiagram x={cant ? [0, len] : [0, len]} sup={cant ? [true, false] : [true, true]} loads={[{ a: 0, b: len, wa: w, wb: w }]} /></div>;
}

// isometric view of the 3D frame model (members by kind, supports)
export function FrameIso({ f3 }) {
  if (!f3?.input?.nodes?.length) return null; // empty project: nothing to draw
  const { nodes } = f3.input, mem = f3.members, c = Math.cos(Math.PI / 6), s = Math.sin(Math.PI / 6);
  const pr = (p) => [(p.x - p.y) * c, -(p.x + p.y) * s - p.z];
  const P = nodes.map(pr), xs = P.map((p) => p[0]), ys = P.map((p) => p[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)], k = Math.min((W - 40) / (x1 - x0 || 1), 400 / (y1 - y0 || 1));
  const tf = ([x, y]) => [20 + (x - x0) * k, 20 + (y - y0) * k];
  return (
    <svg viewBox={`0 0 ${W} ${(y1 - y0) * k + 60}`} className="mx-auto w-full max-w-[170mm]">
      {mem.map((m, i) => { const a = tf(P[m.i]), b = tf(P[m.j]); return <line key={i} x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={m.kind === "column" ? INK : m.release?.some(Boolean) ? MUTE : MOM} strokeWidth={m.kind === "column" ? 2.2 : 1.6} />; })}
      {nodes.map((n, i) => (n.fixed || n.pinned) && <path key={i} d={`M${tf(P[i])[0]},${tf(P[i])[1]}l-5,8h10Z`} fill={n.fixed ? INK : "#fff"} stroke={INK} />)}
      <g transform={`translate(20,${(y1 - y0) * k + 50})`}>
        <line x1={0} x2={16} y1={-3} y2={-3} stroke={INK} strokeWidth={2.2} /><T x={20} y={0} a="start" s={8.5}>เสา</T>
        <line x1={60} x2={76} y1={-3} y2={-3} stroke={MOM} strokeWidth={1.6} /><T x={80} y={0} a="start" s={8.5}>คาน (ต่อแข็ง)</T>
        <line x1={160} x2={176} y1={-3} y2={-3} stroke={MUTE} strokeWidth={1.6} /><T x={180} y={0} a="start" s={8.5}>คานปลายหมุด (คานซอย)</T>
        <path d="M300,-6l-5,8h10Z" fill="#fff" stroke={INK} /><T x={310} y={0} a="start" s={8.5}>ฐานเสาหมุด</T>
        <T x={W - 40} y={0} a="end" s={8.5} c={MUTE}>{nodes.length} จุดต่อ · {mem.length} ชิ้น</T>
      </g>
    </svg>
  );
}

// Cantilever beam reinforcement (elevation sketch, not to scale in depth): the top bars that take the root moment run the whole
// cantilever, hooked down at the tip, and continue into the back span by `ext` (max(cantilever length, ld)); bottom bars through.
// d = span.detail from floor.js; t = beam type; L = cantilever length (m)
export function CantileverDetail({ d, t, L, id }) {
  const w = 680, h = 150, x0 = 40, x1 = w - 40, back = d.noBack ? 0.35 : d.through ? Math.min(d.backLen, Math.max(d.ext, L) * 1.2) : Math.max(d.ext * 1.15, L * 0.5);
  const s = (x1 - x0) / (back + L), col = 0.2, yT = 45, yB = 105, xs = x0 + back * s; // xs = column centre
  const X = (m) => xs + m * s;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full">
      {/* beam outline: back span part + cantilever, column below */}
      <rect x={X(-back)} y={yT - 12} width={(back + L) * s} height={yB - yT + 24} fill="none" stroke={INK} strokeWidth={1} />
      <rect x={X(-col / 2)} y={yB + 12} width={col * s} height={28} fill="#f2f4f7" stroke={INK} strokeWidth={1} />
      {!d.noBack && <line x1={X(-back)} y1={yT - 18} x2={X(-back)} y2={yB + 18} stroke={MUTE} strokeDasharray="4 3" />}
      {/* top bars: full cantilever + hook at the tip + extension into the back span */}
      <path d={`M${X(-Math.min(d.ext, back))},${yT} L${X(L) - 6},${yT} L${X(L) - 6},${yT + 30}`} fill="none" stroke={F3} strokeWidth={2.4} />
      {d.noBack && <path d={`M${X(-col / 2) + 4},${yT} L${X(-col / 2) + 4},${yB + 34}`} fill="none" stroke={F3} strokeWidth={2.4} />}
      {/* bottom bars through */}
      <line x1={X(-back)} y1={yB} x2={X(L) - 6} y2={yB} stroke={MOM} strokeWidth={1.6} />
      {/* dimensions */}
      <line x1={X(0)} y1={20} x2={X(L)} y2={20} stroke={MUTE} /><T x={X(L / 2)} y={16} c={MUTE}>คานยื่น L = {fmt(L, 2)} ม.</T>
      {!d.noBack && <><line x1={X(-Math.min(d.ext, back))} y1={h - 8} x2={X(0)} y2={h - 8} stroke={MUTE} /><T x={X(-Math.min(d.ext, back) / 2)} y={h - 12} c={MUTE}>ฝาก {d.through ? `ตลอดช่วง ${d.back} (${fmt(d.backLen, 2)} ม.)` : `${fmt(d.ext, 2)} ม. ≥ max(L, ld ${fmt(d.ld, 2)})`}</T></>}
      <T x={X(L / 2)} y={yT - 4} c={F3} w={600}>เหล็กบน {d.bars} ยาวตลอด + งอขอที่ปลาย</T>
      <T x={X(L / 2)} y={yB + 14} c={MOM}>เหล็กล่าง {t.bot}</T>
      <T x={X(-col / 2) - 4} y={yB + 32} a="end" c={MUTE}>เสา</T>
      <T x={x0} y={16} a="start" w={600}>{id} · {t.name} {fmt(t.b * 100, 0)}×{fmt(t.h * 100, 0)}</T>
    </svg>
  );
}
