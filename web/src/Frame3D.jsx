// 3D model of the whole building at true sizes: footings + piles, columns, beams, slabs (S / PS / GS), cantilever slabs, walls,
// stairs and the steel roof. Every layer can be switched off; floors can be shown all / up to the current one / current only.
// Plan x,y → three x,-z; height → y. Base (y = 0) = top of the footings.
import { useEffect, useMemo, useRef, useState } from "react";
import { arcPolyline } from "../engine/arc.js";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bounds, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
import { Maximize2, Minimize2 } from "lucide-react";
import * as THREE from "three";
import { TYPE_COLORS } from "./FloorBoard.jsx";
import { DEFAULT_WALL_TYPES, DEFAULT_WIDEN_TYPES, resolveWall, wallThick, wallsOf, widensOf } from "../engine/floor.js";
import { useHighlight } from "./highlight.js";
import { RoofFrameMembers, roofSeat } from "./Roof3D.jsx";
import { baseLevel } from "./StoreyTable.jsx";
import { stairRiseOf } from "./StairPanel.jsx";
import { beamPieces, edgeWidth, insetPolygon } from "./joints3d.js";
import { alongPoints, loadArrowData, roofStatus } from "./loadArrows.js";
import { roofLinkFloor } from "../engine/frame.js";

const LAYERS = [["footing", "ฐานราก"], ["column", "เสา"], ["beam", "คาน"], ["slab", "พื้น"], ["cant", "พื้นยื่น"], ["wall", "ผนัง"], ["stair", "บันได"], ["roof", "หลังคา"], ["roofFrame", "โครงหลังคา"], ["load", "ลูกศรน้ำหนัก"]];
// load arrow colours: walls, line loads, point loads, roof points
export const LOAD_COL = { walls: "#b54708", lines: "#7a5af8", points: "#d92d20", roof: "#0e9384" };
const kg = (v) => Math.round(v).toLocaleString();
const WALL_T = { brick: 0.1, brick2: 0.2, block: 0.1, light: 0.1, gypsum: 0.1 }; // wall thickness (m) incl. plaster
const CONC = "#b8bcc6", SLAB = { S: "#c9ccd4", PS: "#a9c4b0", GS: "#b5a58f" };

// flashing marker for a highlighted warning: red emissive, opacity pulsing
function Blink({ children }) {
  const m = useRef();
  useFrame(({ clock }) => { if (m.current) m.current.opacity = 0.35 + 0.5 * Math.abs(Math.sin(clock.elapsedTime * 3)); });
  return <mesh>{children}<meshStandardMaterial ref={m} color="#d92d20" emissive="#d92d20" emissiveIntensity={0.5} transparent depthWrite={false} /></mesh>;
}
// flashing slab outline area (a highlighted floor load): a thin plate on top of the slab
function BlinkPoly({ P, z }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y))), { depth: 0.03, bevelEnabled: false }), [P]);
  return <group rotation={[-Math.PI / 2, 0, 0]} position={[0, z, 0]}><Blink><primitive object={geo} attach="geometry" /></Blink></group>;
}
// box from plan point p to q, width w (across), bottom z0, height h
function Box({ p, q, w, z0, h, color, opacity = 1, edges, onClick }) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
  if (L < 1e-3 || h <= 0) return null;
  return (
    <mesh position={[(p[0] + q[0]) / 2, z0 + h / 2, -(p[1] + q[1]) / 2]} rotation={[0, Math.atan2(dy, dx), 0]}
      onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined} onPointerOut={onClick ? () => { document.body.style.cursor = ""; } : undefined}>
      <boxGeometry args={[L, h, w]} />
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} />
      {edges && <Edges color={edges} />}
    </mesh>
  );
}
// prism: plan polygon, bottom z0, thickness t
function Prism({ P, z0, t, color, opacity = 1, edges }) {
  const geo = useMemo(() => new THREE.ExtrudeGeometry(new THREE.Shape(P.map(([x, y]) => new THREE.Vector2(x, y))), { depth: t, bevelEnabled: false }), [P, t]);
  return (
    <mesh geometry={geo} rotation={[-Math.PI / 2, 0, 0]} position={[0, z0, 0]}>
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} side={THREE.DoubleSide} polygonOffset polygonOffsetFactor={1} polygonOffsetUnits={1} />
      {edges && <Edges color={edges} />}
    </mesh>
  );
}
// sloped plate through 4 corners [x, y, z] (z up), thickness t below
function Sloped({ C, t, color }) {
  const geo = useMemo(() => {
    const top = C.map(([x, y, z]) => [x, z, -y]), bot = C.map(([x, y, z]) => [x, z - t, -y]), v = [...top, ...bot].flat();
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    g.setIndex([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6, 0, 4, 5, 0, 5, 1, 1, 5, 6, 1, 6, 2, 2, 6, 7, 2, 7, 3, 3, 7, 4, 3, 4, 0]);
    g.computeVertexNormals();
    return g;
  }, [C, t]);
  return <mesh geometry={geo}><meshStandardMaterial color={color} side={THREE.DoubleSide} /><Edges color="#667085" /></mesh>;
}

// stair flights and landing from the plan rectangle, bottom level zb, top level zt (user 2026-11-18: "3D บันได ทำให้สมจริง"):
// real steps — risers / treads from the stair's own riser, tread and waist thickness (raw = floor.stairs[i]), a waist slab under
// them (thickness t square to the pitch), the landing slab for "landing" (U: first flight up one half of the width, landing across the
// far end, second flight back up the other half)
// one flight: stepped profile in its own plane (s along the run 0…run, height 0…rise), extruded across the width w
function flightGeo(run, rise, n, t) {
  const T = run / n, R = rise / n, th = Math.atan2(rise, run), off = t / Math.cos(th), sh = new THREE.Shape();
  sh.moveTo(0, -off); sh.lineTo(0, R);
  for (let k = 1; k < n; k++) { sh.lineTo(k * T, k * R); sh.lineTo(k * T, (k + 1) * R); }
  sh.lineTo(run, rise); sh.lineTo(run, rise - off); sh.closePath(); // soffit parallel to the pitch line
  return sh;
}
function Flight({ origin, u, v, run, rise, n, t, w, color }) {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(flightGeo(run, rise, n, t), { depth: w, bevelEnabled: false });
    const m = new THREE.Matrix4().makeBasis(new THREE.Vector3(...u), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...v)).setPosition(...origin);
    g.applyMatrix4(m); g.computeVertexNormals(); return g;
  }, [origin, u, v, run, rise, n, t, w]);
  return <mesh geometry={geo}><meshStandardMaterial color={color} side={THREE.DoubleSide} /><Edges color="#667085" threshold={20} /></mesh>;
}
export function Stair({ st, raw = {}, zb, zt, color }) {
  const [x0, y0] = st.P[0], [x1, y1] = st.P[2], ax = st.up?.[1] ?? "x", sg = st.up?.[0] === "-" ? -1 : 1;
  const R0 = raw.riser > 0.05 ? raw.riser : 0.17, t = raw.t > 0.05 ? raw.t : 0.12, L = st.Lr, B = st.B, H = zt - zb;
  // world vectors (three.js: x, height, −y): u = up the run, v = across (r grows with plan y for runs along x, with plan x for runs along y)
  const U = ax === "x" ? [sg, 0, 0] : [0, 0, -sg], V = ax === "x" ? [0, 0, -1] : [1, 0, 0];
  const at = (s, r, z) => { const px = ax === "x" ? (sg > 0 ? x0 + s : x1 - s) : x0 + r, py = ax === "x" ? y0 + r : sg > 0 ? y0 + s : y1 - s; return [px, z, -py]; };
  const steps = (rise) => Math.max(2, Math.round(rise / R0));
  if (st.kind === "landing") {
    const Ll = Math.min(raw.landingL ?? st.landingL ?? 1.2, L * 0.6), Lf = L - Ll, zm = zb + H / 2, n1 = steps(H / 2);
    // landing slab across the far end (top at zm), first flight on r 0…B/2, second flight back on r B/2…B (its run points back)
    const lc = at(Lf + Ll / 2, B / 2, zm - t / 2);
    return (<group>
      <Flight origin={at(0, 0, zb)} u={U} v={V} run={Lf} rise={H / 2} n={n1} t={t} w={B / 2} color={color} />
      <Flight origin={at(Lf, B, zm)} u={U.map((x) => -x)} v={V.map((x) => -x)} run={Lf} rise={H / 2} n={n1} t={t} w={B / 2} color={color} />
      <mesh position={lc}><boxGeometry args={ax === "x" ? [Ll, t, B] : [B, t, Ll]} /><meshStandardMaterial color={color} /><Edges color="#667085" /></mesh>
    </group>);
  }
  // straight flight: its real run (risers − 1) × tread, ending at the head edge (s = L); a longer opening leaves floor in front of the foot
  const n = steps(H), T0 = raw.tread > 0.1 ? raw.tread : 0.25, run = Math.min(L, Math.max(0.3, (n - 1) * T0));
  return <Flight origin={at(L - run, 0, zb)} u={U} v={V} run={run} rise={H} n={n} t={t} w={B} color={color} />;
}

// steel roof planes from the roof module (loaded on demand: the skeleton is a wasm module)
function useRoofFaces(roof, on) {
  const [faces, setFaces] = useState(null);
  useEffect(() => {
    if (!on || !roof?.pts) return;
    let live = true;
    import("./RoofPage.jsx").then(async (m) => { const sk = await m.loadSkeleton(), { g, fr, dz } = m.runRoof(roof, sk); if (live && g) setFaces(Object.assign(g.faces.filter((f) => !f.gable), { g, fr, loose: dz?.loose ?? [], plates: dz ? (await import("./PlateView.jsx")).platesOf(dz).plates : null })); });
    return () => { live = false; };
  }, [roof, on]);
  return on ? faces : null;
}
function RoofFace({ f, dz, faint = false }) {
  const geo = useMemo(() => {
    const flat = f.P.map((p) => new THREE.Vector2(p[0], p[1])), tris = THREE.ShapeUtils.triangulateShape(flat, []), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(f.P.flatMap(([x, y, z]) => [x, z + dz, -y]), 3));
    g.setIndex(tris.flat()); g.computeVertexNormals();
    return g;
  }, [f, dz]);
  return <mesh geometry={geo} position={[0, faint ? 0.12 : 0, 0]}><meshStandardMaterial color="#b54708" transparent opacity={faint ? 0.12 : 0.45} side={THREE.DoubleSide} depthWrite={false} />{!faint && <Edges color="#7a2e0e" />}</mesh>;
}

// downward arrows drawn over everything (depthTest off) so loads behind walls / slabs stay visible: shafts + tail lines in one
// LineSegments, heads as one instanced cone. tips = [[x, y, z, len]] (plan x, y; z = tip height; len = shaft length), tails = [[a, b, z]]
function Arrows({ tips, tails = [], color }) {
  const { lines, heads } = useMemo(() => {
    const v = [];
    for (const [x, y, z, L] of tips) v.push(x, z + L, -y, x, z + 0.13, -y);
    for (const [a, b, z] of tails) v.push(a[0], z, -a[1], b[0], z, -b[1]);
    const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3));
    const cone = new THREE.ConeGeometry(0.05, 0.14, 10); cone.rotateX(Math.PI); cone.translate(0, 0.07, 0); // tip at y = 0, pointing down
    const m = new THREE.InstancedMesh(cone, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }), Math.max(1, tips.length));
    const o = new THREE.Object3D();
    tips.forEach(([x, y, z], i) => { o.position.set(x, z, -y); o.updateMatrix(); m.setMatrixAt(i, o.matrix); });
    m.count = tips.length; m.renderOrder = 20; m.instanceMatrix.needsUpdate = true;
    return { lines: g, heads: m };
  }, [tips, tails, color]);
  if (!tips.length) return null;
  return (<group>
    <lineSegments geometry={lines} renderOrder={20}><lineBasicMaterial color={color} depthTest={false} transparent /></lineSegments>
    <primitive object={heads} />
  </group>);
}
function LoadLabel({ at, color, children, title }) {
  return <Html position={at} center zIndexRange={[20, 0]} style={{ pointerEvents: "none" }}>
    <div title={title} style={{ color, borderColor: color, pointerEvents: "auto", cursor: "help" }} className="select-none whitespace-nowrap rounded border bg-white/90 px-1 py-px text-[10px] font-semibold leading-tight tabular-nums shadow-sm">{children}</div></Html>;
}
// the loads of one floor (loadArrowData = the engine's own values), at that floor's level Zk; sizes scaled by the largest of each kind
function FloorLoads({ d, Zk, qMax, pMax, labels = true }) {
  const dest = (x) => (x.on === "column" ? "→ เสา" : x.on === "beam" ? "→ คาน" : x.on === "panel" ? "→ พื้น" : "→ ไม่มีที่รับ!");
  const lenQ = (q) => 0.35 + (0.65 * q) / (qMax || 1), lenP = (P) => 0.5 + (0.9 * P) / (pMax || 1);
  const dist = (kind) => {
    const tips = [], tails = [];
    for (const x of d[kind]) { const L = lenQ(x.q), z = Zk + x.z; for (const p of alongPoints(x.a, x.b)) tips.push([p[0], p[1], z, L]); tails.push([x.a, x.b, z + L]); }
    return <Arrows tips={tips} tails={tails} color={LOAD_COL[kind]} />;
  };
  const pts = (kind) => <Arrows tips={d[kind].map((x) => [x.p[0], x.p[1], Zk + x.z, lenP(x.P)])} color={LOAD_COL[kind]} />;
  const mid = (x) => [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2];
  return (<group>
    {dist("walls")}{dist("lines")}{pts("points")}{pts("roof")}
    {d.roof.map((x, j) => ( // where a roof point lands: a ring around the column / beam point (red = landed on nothing)
      <mesh key={`rr${j}`} position={[x.p[0], Zk + x.z + 0.02, -x.p[1]]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={21}>
        <ringGeometry args={[0.16, 0.24, 24]} /><meshBasicMaterial color={x.on === "column" || x.on === "beam" ? LOAD_COL.roof : "#d92d20"} depthTest={false} transparent side={THREE.DoubleSide} /></mesh>))}
    {d.roof.map((x, j) => <LoadLabel key={`rl${j}`} at={[x.p[0], Zk + x.z + lenP(x.P) + 0.12, -x.p[1]]} color={x.on === "column" || x.on === "beam" ? LOAD_COL.roof : "#d92d20"} title={`${x.name} → ${x.to}`}>{`${kg(x.P)} กก. ${dest(x)}`}</LoadLabel>)}
    {labels && [...d.walls.map((x) => ["walls", x, mid(x), Zk + x.z + lenQ(x.q), `${kg(x.q)} กก./ม.`]), ...d.lines.map((x) => ["lines", x, mid(x), Zk + x.z + lenQ(x.q), `${kg(x.q)} กก./ม.`]),
      ...d.points.map((x) => ["points", x, x.p, Zk + x.z + lenP(x.P), `${kg(x.P)} กก.`])].map(([kind, x, p, z, t], j) =>
      <LoadLabel key={j} at={[p[0], z + 0.12, -p[1]]} color={LOAD_COL[kind]} title={`${x.name} → ${x.to}`}>{t}</LoadLabel>)}
  </group>);
}

export default function Frame3D({ frame, res, cur, roof, dark = false, className = "", roofOn = false, onPick = null, selected = null, loadsOn = false }) {
  const [on, setOn] = useState({ footing: true, column: true, beam: true, slab: true, cant: true, wall: true, stair: true, roof: roofOn, roofFrame: roofOn, load: loadsOn });
  const [floorsShown, setFloorsShown] = useState("all"), [byType, setByType] = useState(true), [big, setBig] = useState(false);
  useEffect(() => { setOn((o) => (o.load === loadsOn ? o : { ...o, load: loadsOn })); }, [loadsOn]); // step 5 (loads) opens with the arrows on
  const roofFaces = useRoofFaces(roof, on.roof || on.roofFrame);
  const pts = frame.floors.flatMap((f) => [...f.columns, ...f.beams.flatMap((b) => [b.a, b.b])]);
  if (!pts.length) return <div className={`grid place-items-center text-sm text-gray-400 ${className}`}>ยังไม่มีเสาหรือคาน</div>;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let z = 0;
  const Z = frame.floors.map((f) => (z += f.h ?? 3)), top = z, span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), top, 4);
  const shown = (k) => floorsShown === "all" || (floorsShown === "upto" ? k <= cur : k === cur);
  // load arrows: data per floor from the analysis; one size scale for all floors shown
  const loads = on.load ? frame.floors.map((fl, k) => (shown(k) ? loadArrowData(frame, res.floors?.[k], k, wallsOf(fl)) : null)) : [];
  const qMax = Math.max(1, ...loads.flatMap((d) => (d ? [...d.walls, ...d.lines].map((x) => x.q) : []))), pMax = Math.max(1, ...loads.flatMap((d) => (d ? [...d.points, ...d.roof].map((x) => x.P) : [])));
  const tot = loads.reduce((t, d) => (d ? { walls: t.walls + d.totals.walls, lines: t.lines + d.totals.lines, points: t.points + d.totals.points, roof: t.roof + d.totals.roof } : t), { walls: 0, lines: 0, points: 0, roof: 0 });
  const wt = frame.wallTypes ?? DEFAULT_WALL_TYPES, base0 = -baseLevel(frame); // model z = 0 at the column base: a roof at elevation H sits at H − base level (was fixed at 0.40)
  const fo = frame.footing ?? { t: 0.4 }, hl = useHighlight(), hz = hl?.floor !== undefined ? Z[hl.floor] ?? top : Z[roofLinkFloor(frame) ?? frame.floors.length - 1] ?? top; // highlighted point: at the linked (roof) floor
  // size (b, h) of the largest beam of the highlighted floor lying along a segment (default 0.20 × 0.40)
  const segSize = (a, b) => {
    const fl = frame.floors[hl?.floor], an = res.floors?.[hl?.floor]; let w = 0, h = 0;
    for (const [i, bm] of (fl?.beams ?? []).entries()) {
      const d = [b[0] - a[0], b[1] - a[1]], L = Math.hypot(...d) || 1, u = [d[0] / L, d[1] / L], off = (p) => Math.abs(u[0] * (p[1] - a[1]) - u[1] * (p[0] - a[0]));
      if (off(bm.a) > 0.05 || off(bm.b) > 0.05) continue;
      const sp = an?.spans.find((x) => (x.members ?? [x.member]).includes(i)), t = frame.beamTypes[sp?.typeIdx ?? bm.type ?? 0] ?? frame.beamTypes[0];
      w = Math.max(w, t?.b ?? 0); h = Math.max(h, t?.h ?? 0);
    }
    return [w || 0.2, h || 0.4];
  };
  const scene = (
    <Canvas dpr={[1, 2]} camera={{ position: [span, span * 0.8, span * 1.1], fov: 35, near: 0.1, far: 500 }}>
      <color attach="background" args={[dark ? "#0f1222" : "#f4f5f7"]} />
      <hemisphereLight args={["#ffffff", "#9aa1b1", 1.1]} />
      <directionalLight position={[12, 25, 10]} intensity={1.5} />
      <Bounds fit clip observe margin={1.25}>
        <group position={[-cx, -top / 2, cy]}>
          {on.footing && res.footings.map((f, i) => f.r && (
            <group key={`f${i}`}>
              <Box p={[f.p[0] - f.r.Bx / 2, f.p[1]]} q={[f.p[0] + f.r.Bx / 2, f.p[1]]} w={f.r.By} z0={-(f.inp?.t ?? fo.t ?? 0.4)} h={f.inp?.t ?? fo.t ?? 0.4} color="#9aa1b1" edges="#667085" />
              {(f.r.piles ?? []).map(([px, py], j) => <Box key={j} p={[f.p[0] + px - 0.09, f.p[1] + py]} q={[f.p[0] + px + 0.09, f.p[1] + py]} w={0.18} z0={-(f.inp?.t ?? fo.t ?? 0.4) - 1.5} h={1.5} color="#7c828f" />)}
            </group>
          ))}
          {hl && <group>
            {(hl.segs ?? []).map(([a, b], j) => { // a warning on a beam line: a red sleeve just around the beam itself, pulsing
              const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 0.01, [bw, bh] = segSize(a, b);
              return (<group key={`hs${j}`} position={[(a[0] + b[0]) / 2, hz - bh / 2, -(a[1] + b[1]) / 2]} rotation={[0, Math.atan2(b[1] - a[1], b[0] - a[0]), 0]}>
                <Blink><boxGeometry args={[L, bh + 0.03, bw + 0.03]} /></Blink></group>); })}
            {(hl.polys ?? []).map((P, j) => <BlinkPoly key={`hpg${j}`} P={P} z={hz + 0.02} />)}
            {(hl.pts ?? []).slice(1).map((q, j) => <group key={`hp${j}`} position={[q[0], hz - 0.2, -q[1]]}><Blink><sphereGeometry args={[0.16, 20, 14]} /></Blink></group>)}
            {hl.p && (hl.floor !== undefined
              ? <group position={[hl.p[0], hz - 0.2, -hl.p[1]]}><Blink><sphereGeometry args={[0.18, 24, 16]} /></Blink></group>
              : <mesh position={[hl.p[0], hz + 0.35, -hl.p[1]]}><sphereGeometry args={[0.28, 24, 16]} /><meshStandardMaterial color={hl.bad ? "#d92d20" : "#12b76a"} emissive={hl.bad ? "#d92d20" : "#12b76a"} emissiveIntensity={0.6} /></mesh>)}
            {hl.to && <mesh position={[hl.to[0], hz + 0.35, -hl.to[1]]}><sphereGeometry args={[0.16, 16, 12]} /><meshStandardMaterial color="#d92d20" /></mesh>}
          </group>}
          {frame.floors.map((fl, k) => {
            if (!shown(k)) return null;
            const an = res.floors[k], Zk = Z[k], H = fl.h ?? 3, zb = k ? Z[k - 1] : 0;
            // beam sizes and clean joints: columns of this floor (under the beams) and of the floor above (standing on them)
            const bt = fl.beams.map((b, i) => { const sp = an?.spans.find((s) => (s.members ?? [s.member]).includes(i)), ti = sp?.typeIdx ?? b.type ?? 0; return { sp, t: frame.beamTypes[ti] ?? frame.beamTypes[0] }; });
            const bw = fl.beams.map((b, i) => ({ ...b, w: bt[i].t.b, h: bt[i].t.h }));
            const csz = (kk, i) => { const col = res.columns.find((x) => x.floor === kk && x.i === i); return [(col?.lv?.Bx ?? 20) / 100, (col?.lv?.By ?? 20) / 100]; };
            const jc = [...fl.columns.map((p, i) => { const [B, D] = csz(k, i); return { p, B, D }; }), ...(frame.floors[k + 1]?.columns ?? []).map((p, i) => { const [B, D] = csz(k + 1, i); return { p, B, D }; })];
            const pieces = beamPieces(bw.map((b) => (b.lvl > 0 ? { ...b, a: [1e6, 1e6], b: [1e6 + 1, 1e6] } : b)), jc.reduce((a, c) => { const o = a.find((x) => Math.hypot(x.p[0] - c.p[0], x.p[1] - c.p[1]) < 0.03); if (o) { o.B = Math.max(o.B, c.B); o.D = Math.max(o.D, c.D); } else a.push({ ...c }); return a; }, []));
            return (
              <group key={k}>
                {on.column && fl.columns.map((c, i) => {
                  const col = res.columns.find((x) => x.floor === k && x.i === i), B = (col?.lv?.Bx ?? 20) / 100, D = (col?.lv?.By ?? 20) / 100;
                  return <Box key={`c${i}`} p={[c[0] - B / 2, c[1]]} q={[c[0] + B / 2, c[1]]} w={D} z0={Zk - H} h={H} color={selected?.floor === k && selected?.kind === "column" && selected?.i === i ? "#f79009" : col && !col.ok ? "#f97066" : CONC} edges="#667085" onClick={onPick ? () => onPick({ floor: k, kind: "column", i }) : undefined} />;
                })}
                {on.beam && fl.beams.map((b, i) => {
                  const { sp, t } = bt[i], ti = sp?.typeIdx ?? b.type ?? 0;
                  const color = sp && !sp.ok ? "#f04438" : byType ? TYPE_COLORS[ti % TYPE_COLORS.length] : CONC;
                  const pick = onPick ? () => onPick({ floor: k, kind: "beam", i }) : undefined, isSel = selected?.floor === k && selected?.kind === "beam" && selected?.i === i;
                  const zt = b.lvl > 0 ? zb + b.lvl : Zk; // a beam inside the storey (stair landing beam) at its own level
                  // levels (2026-11-20): a lowered beam sits at its top level; a step beam (คานบ่า) = full width up to the low slab + the upstand on the high side
                  const lv = b.lvl > 0 ? null : an?.levels?.beams?.[i], dzT = lv?.top ?? 0, st = lv?.step ?? 0;
                  if (pieces[i] && !(b.lvl > 0)) return pieces[i].flatMap(([p, q], j) => {
                    const c = isSel ? "#f79009" : color;
                    if (!(st > 0)) return [<Box key={`b${i}-${j}`} p={p} q={q} w={t.b} z0={Zk + dzT - t.h} h={t.h} color={c} edges="#475467" onClick={pick} />];
                    const wl = Math.min(lv.notchW ?? t.b / 2, t.b - 0.02), sg = lv.sides?.[0]?.dz === dzT ? 1 : -1, n = [-lv.u[1] * sg * (wl / 2), lv.u[0] * sg * (wl / 2)]; // high side = the side sampled at +(−u_y, u_x) when it is the top
                    return [<Box key={`b${i}-${j}`} p={p} q={q} w={t.b} z0={Zk + dzT - t.h} h={t.h - st} color={c} edges="#475467" onClick={pick} />,
                      <Box key={`u${i}-${j}`} p={[p[0] + n[0], p[1] + n[1]]} q={[q[0] + n[0], q[1] + n[1]]} w={t.b - wl} z0={Zk + dzT - st} h={st} color={c} edges="#475467" onClick={pick} />];
                  });
                  const pts = arcPolyline(b.a, b.b, b.arc?.s, 12);
                  return pts.slice(1).map((q, j) => <Box key={`b${i}-${j}`} p={pts[j]} q={q} w={t.b} z0={zt - t.h} h={t.h} color={isSel ? "#f79009" : color} edges="#475467" onClick={pick} />);
                })}
                {on.beam && fl.beams.flatMap((b, i) => b.lvl > 0 || b.arc?.s ? [] : widensOf(b).map((wd, j) => { // side widening (พอกข้าง): a strip w wide beside the beam, full depth
                  const wt = (frame.widenTypes ?? DEFAULT_WIDEN_TYPES)[wd.type]; if (!wt) return null;
                  const t = bt[i].t, L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]) || 1, sg = wd.side ?? 1, o = sg * (t.b + wt.w) / 2, n = [(-(b.b[1] - b.a[1]) / L) * o, ((b.b[0] - b.a[0]) / L) * o], dzT = an?.levels?.beams?.[i]?.top ?? 0;
                  const f0 = Math.max(0, Math.min(L, wd.from ?? 0)), f1 = Math.max(f0, Math.min(L, wd.to ?? L)), at = (tt) => [b.a[0] + ((b.b[0] - b.a[0]) * tt) / L + n[0], b.a[1] + ((b.b[1] - b.a[1]) * tt) / L + n[1]];
                  return f1 - f0 > 0.01 ? <Box key={`wd${i}-${j}`} p={at(f0)} q={at(f1)} w={wt.w} z0={Zk + dzT - t.h} h={t.h} color="#a6f4c5" edges="#039855" /> : null; }))}
                {on.slab && an?.panels.filter((p) => !p.open && !p.stairWell).map((p) => (
                  <Prism key={p.key} P={insetPolygon(p.P, p.P.map((q, j) => edgeWidth(bw, q, p.P[(j + 1) % p.P.length]) / 2))} z0={p.st === "GS" ? zb + 0.05 - p.t : Zk + (p.dz ?? 0) - p.t} t={p.t} color={SLAB[p.st] ?? SLAB.S} edges="#98a2b3" />
                ))}
                {on.cant && an?.cants.map((c, i) => { // starts at the face of its beam
                  const w = edgeWidth(bw, c.P[0], c.P[1]) / 2, d = [c.P[3][0] - c.P[0][0], c.P[3][1] - c.P[0][1]], L = Math.hypot(...d) || 1, s0 = [(d[0] / L) * w, (d[1] / L) * w];
                  const P = [[c.P[0][0] + s0[0], c.P[0][1] + s0[1]], [c.P[1][0] + s0[0], c.P[1][1] + s0[1]], c.P[2], c.P[3]];
                  return <Prism key={`ct${i}`} P={L > w ? P : c.P} z0={Zk - c.t} t={c.t} color="#c3b5e0" edges="#8e4ec6" />; })}
                {on.wall && wallsOf(fl).map((w0, i) => {
                  // true thickness of the type, clear height, doors / windows cut out (pieces between, under and over each opening)
                  const w = resolveWall(w0, frame, k), tp = wt.find((x) => x.id === w.kind), th = (tp?.core ? wallThick(tp) : WALL_T[w.kind] ?? 0.1) * (w.layers ?? 1) + ((w.layers ?? 1) > 1 ? 0.03 : 0);
                  const H = w.hFull ?? w.h, L = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) || 1, P = (t) => [w.a[0] + ((w.b[0] - w.a[0]) * t) / L, w.a[1] + ((w.b[1] - w.a[1]) * t) / L];
                  const col = tp?.w >= 150 ? "#d9a38a" : "#e8d8c3", ops = [...(w0.openings ?? [])].sort((x, y) => x.at - y.at), parts = [];
                  let x = 0;
                  for (const o of ops) { const a = Math.max(x, o.at ?? 0), b = Math.min(L, a + o.w), sill = o.sill ?? 0;
                    if (a > x + 0.01) parts.push([x, a, 0, H]);
                    if (sill > 0.01) parts.push([a, b, 0, sill]);
                    if (sill + o.h < H - 0.01) parts.push([a, b, sill + o.h, H - sill - o.h]);
                    x = b; }
                  if (x < L - 0.01) parts.push([x, L, 0, H]);
                  // base = top of what the wall stands on (user 2026-11-20 "ผนังลอยจากคาน"): a lowered beam / slab (levels) puts the wall lower
                  const r = an?.walls?.[i], lns = (r?.on ?? []).map((o) => an?.lines?.find((l) => l.id === o.line)).filter(Boolean);
                  const tops = lns.flatMap((ln) => (ln.parts ?? []).map((pt) => an?.levels?.beams?.[pt.i]?.top).filter(Number.isFinite));
                  const zb = tops.length ? Math.min(...tops) : r?.panel ? an?.panels?.find((p) => p.key === r.panel)?.dz ?? 0 : 0;
                  return <group key={`w${i}`}>{(w0.gable ? [[0, L, 0, w.h]] : parts).map(([a, b, z, h], j) => <Box key={j} p={P(a)} q={P(b)} w={th} z0={Zk + (z === 0 ? zb : z)} h={z === 0 ? h - zb : h} color={col} opacity={0.6} />)}</group>;
                })}
                {on.stair && an?.stairs.map((st, i) => <Stair key={`s${i}`} st={st} raw={fl.stairs?.[st.i] ?? {}} zb={Zk - stairRiseOf(frame, k, fl.stairs?.[st.i] ?? {})} zt={Zk} color="#cfd4dc" />)}
                {on.load && loads[k] && <FloorLoads d={loads[k]} Zk={Zk} qMax={qMax} pMax={pMax} labels={k === cur} />}
              </group>
            );
          })}
          {on.roof && roofFaces?.map((f, i) => <RoofFace key={i} f={f} dz={base0 + roofSeat(roofFaces.plates ?? roofFaces.g.pts)} faint={on.roofFrame && !!roofFaces.fr} />)}
          {on.roofFrame && roofFaces?.fr && <RoofFrameMembers g={roofFaces.g} fr={roofFaces.fr} plates={roofFaces.plates} loose={roofFaces.loose} Z0={base0} />}
        </group>
      </Bounds>
      <Grid args={[80, 80]} position={[0, -top / 2 - (fo.t ?? 0.4) - 1.51, 0]} cellColor={dark ? "#252a44" : "#e4e7ec"} sectionColor={dark ? "#323a5c" : "#d0d5dd"} fadeDistance={70} infiniteGrid />
      <OrbitControls makeDefault />
    </Canvas>
  );
  const chip = (active) => `rounded-md px-2 py-0.5 text-[11px] font-medium ring-1 ${active ? "bg-brand-500 text-[#fff] ring-brand-500" : "bg-white/90 text-gray-600 ring-gray-300"}`;
  const bar = (
    <div className="pointer-events-auto absolute left-2 right-2 top-2 flex flex-wrap items-center gap-1">
      {LAYERS.map(([k, t]) => <button key={k} onClick={() => setOn((o) => ({ ...o, [k]: !o[k] }))} className={chip(on[k])}>{t}</button>)}
      <span className="mx-0.5 h-4 w-px bg-gray-300" />
      {[["all", "ทุกชั้น"], ["upto", "ถึงชั้นนี้"], ["one", "ชั้นนี้"]].map(([k, t]) => <button key={k} onClick={() => setFloorsShown(k)} className={chip(floorsShown === k)}>{t}</button>)}
      <button onClick={() => setByType((v) => !v)} className={chip(byType)}>สีตาม type</button>
      <button onClick={() => setBig((v) => !v)} title={big ? "ย่อ" : "ขยายเต็มจอ"} className={`${chip(false)} ml-auto`}>{big ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}</button>
    </div>
  );
  const rs = on.load ? roofStatus(frame, res, roof) : null;
  const roofLine = rs && ({
    none: <div className="text-gray-500">ยังไม่มีหลังคาในโครงการ</div>,
    unlinked: <div className="font-semibold text-[#d92d20]">หลังคายังไม่ส่งน้ำหนักลงโครงสร้าง (0 กก.)<div className="font-normal">ไปขั้น 4 หลังคา → กด "นำเข้าเสา + แปลนจากโครงสร้าง"</div></div>,
    empty: <div className="font-semibold text-[#d92d20]">เชื่อมกับ {rs.floor} แล้ว แต่ยังไม่มีจุดรับ<div className="font-normal">ขั้น 4: วาดอะเส / เสาบนแปลนหลังคา</div></div>,
    ok: <div className="text-[#067647]">✓ หลังคา {kg(rs.total)} กก. เข้าโครงสร้างที่ {rs.floor} ครบ<div className="text-gray-500">ลงเสา {rs.nCol} จุด ({kg(rs.col)} กก.){rs.nBeam ? ` · ลงคาน ${rs.nBeam} จุด (${kg(rs.beam)} กก.)` : ""}{rs.nPanel ? ` · ลงพื้น ${rs.nPanel} จุด` : ""}</div></div>,
    partial: <div className="font-semibold text-[#d92d20]">หลังคา {kg(rs.total)} กก. — {rs.nLost ? `${rs.nLost} จุด (${kg(rs.lost)} กก.) ไม่มีที่รับ` : ""}{rs.nLost && rs.moved ? " · " : ""}{rs.moved ? `${rs.moved} จุดไม่มีเสา/คานใต้ → ย้ายไปเสาใกล้สุด` : ""}<div className="font-normal">ขั้น 4: ตารางจุดถ่ายแรง → "เพิ่มคานรับ" / "เพิ่มเสา"</div></div>,
  })[rs.state];
  const legend = on.load && (
    <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[11px] leading-snug text-gray-700 shadow-sm ring-1 ring-gray-200">
      <div className="font-semibold text-gray-500">น้ำหนักที่ลงโครงสร้าง (ชั้นที่แสดง)</div>
      {[["walls", "ผนัง (กก./ม. × ยาว)"], ["lines", "น้ำหนักเส้น"], ["points", "น้ำหนักจุด"], ["roof", "จากหลังคา"]].map(([k, t]) => (
        <div key={k} className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-full" style={{ background: LOAD_COL[k] }} />{t}<b className="ml-auto pl-3 tabular-nums">{kg(tot[k])} กก.</b></div>))}
      <div className="mt-1 max-w-[300px] border-t border-gray-200 pt-1 text-[11px] leading-snug">{roofLine}{rs?.fallback && <div className="text-[#b54708]">ชั้นที่เชื่อมไว้ไม่มีแล้ว → ลงชั้นบนสุดแทน (ตรวจที่ขั้น 4)</div>}</div>
      <div className="text-[10px] text-gray-400">ตัวเลขแสดงเฉพาะชั้นที่เลือก (หลังคาแสดงเสมอ) · ชี้ป้ายเพื่อดูว่าลงคาน / พื้น / เสา</div>
    </div>);
  if (big) return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setBig(false)}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>{scene}{bar}{legend}</div>
    </div>
  );
  return <div className={`relative ${className}`}>{scene}{bar}{legend}</div>;
}
