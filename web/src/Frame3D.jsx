// 3D model of the whole building at true sizes: footings + piles, columns, beams, slabs (S / PS / GS), cantilever slabs, walls,
// stairs and the steel roof. Every layer can be switched off; floors can be shown all / up to the current one / current only.
// Plan x,y → three x,-z; height → y. Base (y = 0) = top of the footings.
import { useEffect, useMemo, useState } from "react";
import { arcPolyline } from "../engine/arc.js";
import { Canvas } from "@react-three/fiber";
import { Bounds, Edges, Grid, OrbitControls } from "@react-three/drei";
import { Maximize2, Minimize2 } from "lucide-react";
import * as THREE from "three";
import { TYPE_COLORS } from "./FloorBoard.jsx";
import { DEFAULT_WALL_TYPES, wallsOf } from "../engine/floor.js";

const LAYERS = [["footing", "ฐานราก"], ["column", "เสา"], ["beam", "คาน"], ["slab", "พื้น"], ["cant", "พื้นยื่น"], ["wall", "ผนัง"], ["stair", "บันได"], ["roof", "หลังคา"]];
const WALL_T = { brick: 0.1, brick2: 0.2, block: 0.1, light: 0.1, gypsum: 0.1 }; // wall thickness (m) incl. plaster
const CONC = "#b8bcc6", SLAB = { S: "#c9ccd4", PS: "#a9c4b0", GS: "#b5a58f" };

// box from plan point p to q, width w (across), bottom z0, height h
function Box({ p, q, w, z0, h, color, opacity = 1, edges }) {
  const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy);
  if (L < 1e-3 || h <= 0) return null;
  return (
    <mesh position={[(p[0] + q[0]) / 2, z0 + h / 2, -(p[1] + q[1]) / 2]} rotation={[0, Math.atan2(dy, dx), 0]}>
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
      <meshStandardMaterial color={color} transparent={opacity < 1} opacity={opacity} depthWrite={opacity >= 1} side={THREE.DoubleSide} />
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

// stair flights and landing from the plan rectangle, bottom level zb, top level zt
function Stair({ st, zb, zt, color }) {
  const [x0, y0] = st.P[0], [x1, y1] = st.P[2], ax = st.up?.[1] ?? "x", sg = st.up?.[0] === "-" ? -1 : 1;
  // local frame: s along the run (0 at the start edge), r across (0..B)
  const pt = (s, r, z) => (ax === "x" ? [sg > 0 ? x0 + s : x1 - s, y0 + r, z] : [x0 + r, sg > 0 ? y0 + s : y1 - s, z]);
  const L = st.Lr, B = st.B, t = 0.15;
  if (st.kind === "landing") {
    const Ll = Math.min(st.landingL ?? 1.2, L), Lf = L - Ll, zm = (zb + zt) / 2;
    return (<>
      <Sloped C={[pt(0, 0, zb), pt(Lf, 0, zm), pt(Lf, B / 2, zm), pt(0, B / 2, zb)]} t={t} color={color} />
      <Sloped C={[pt(Lf, 0, zm), pt(L, 0, zm), pt(L, B, zm), pt(Lf, B, zm)]} t={t} color={color} />
      <Sloped C={[pt(Lf, B / 2, zm), pt(0, B / 2, zt), pt(0, B, zt), pt(Lf, B, zm)]} t={t} color={color} />
    </>);
  }
  return <Sloped C={[pt(0, 0, zb), pt(L, 0, zt), pt(L, B, zt), pt(0, B, zb)]} t={t} color={color} />;
}

// steel roof planes from the roof module (loaded on demand: the skeleton is a wasm module)
function useRoofFaces(roof, on) {
  const [faces, setFaces] = useState(null);
  useEffect(() => {
    if (!on || !roof?.pts) return;
    let live = true;
    import("./RoofPage.jsx").then(async (m) => { const sk = await m.loadSkeleton(), { g } = m.runRoof(roof, sk); if (live && g) setFaces(g.faces.filter((f) => !f.gable)); });
    return () => { live = false; };
  }, [roof, on]);
  return on ? faces : null;
}
function RoofFace({ f, dz }) {
  const geo = useMemo(() => {
    const flat = f.P.map((p) => new THREE.Vector2(p[0], p[1])), tris = THREE.ShapeUtils.triangulateShape(flat, []), g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(f.P.flatMap(([x, y, z]) => [x, z + dz, -y]), 3));
    g.setIndex(tris.flat()); g.computeVertexNormals();
    return g;
  }, [f, dz]);
  return <mesh geometry={geo}><meshStandardMaterial color="#b54708" transparent opacity={0.45} side={THREE.DoubleSide} depthWrite={false} /><Edges color="#7a2e0e" /></mesh>;
}

export default function Frame3D({ frame, res, cur, roof, dark = false, className = "" }) {
  const [on, setOn] = useState({ footing: true, column: true, beam: true, slab: true, cant: true, wall: true, stair: true, roof: false });
  const [floorsShown, setFloorsShown] = useState("all"), [byType, setByType] = useState(true), [big, setBig] = useState(false);
  const roofFaces = useRoofFaces(roof, on.roof);
  const pts = frame.floors.flatMap((f) => [...f.columns, ...f.beams.flatMap((b) => [b.a, b.b])]);
  if (!pts.length) return <div className={`grid place-items-center text-sm text-gray-400 ${className}`}>ยังไม่มีเสาหรือคาน</div>;
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]), cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  let z = 0;
  const Z = frame.floors.map((f) => (z += f.h ?? 3)), top = z, span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), top, 4);
  const shown = (k) => floorsShown === "all" || (floorsShown === "upto" ? k <= cur : k === cur);
  const wt = frame.wallTypes ?? DEFAULT_WALL_TYPES, base0 = (frame.floors[0]?.name ?? "").includes("+0.40") ? 0.4 : 0.4; // footing top at −0.40 in the drawings
  const fo = frame.footing ?? { t: 0.4 };
  const scene = (
    <Canvas dpr={[1, 2]} camera={{ position: [span, span * 0.8, span * 1.1], fov: 35, near: 0.1, far: 500 }}>
      <color attach="background" args={[dark ? "#0f1222" : "#f4f5f7"]} />
      <hemisphereLight args={["#ffffff", "#9aa1b1", 1.1]} />
      <directionalLight position={[12, 25, 10]} intensity={1.5} />
      <Bounds fit clip observe margin={1.25}>
        <group position={[-cx, -top / 2, cy]}>
          {on.footing && res.footings.map((f, i) => f.r && (
            <group key={`f${i}`}>
              <Box p={[f.p[0] - f.r.Bx / 2, f.p[1]]} q={[f.p[0] + f.r.Bx / 2, f.p[1]]} w={f.r.By} z0={-(fo.t ?? 0.4)} h={fo.t ?? 0.4} color="#9aa1b1" edges="#667085" />
              {f.r.piles.map(([px, py], j) => <Box key={j} p={[f.p[0] + px - 0.09, f.p[1] + py]} q={[f.p[0] + px + 0.09, f.p[1] + py]} w={0.18} z0={-(fo.t ?? 0.4) - 1.5} h={1.5} color="#7c828f" />)}
            </group>
          ))}
          {frame.floors.map((fl, k) => {
            if (!shown(k)) return null;
            const an = res.floors[k], Zk = Z[k], H = fl.h ?? 3, zb = k ? Z[k - 1] : 0;
            return (
              <group key={k}>
                {on.column && fl.columns.map((c, i) => {
                  const col = res.columns.find((x) => x.floor === k && x.i === i), B = (col?.lv?.Bx ?? 20) / 100, D = (col?.lv?.By ?? 20) / 100;
                  return <Box key={`c${i}`} p={[c[0] - B / 2, c[1]]} q={[c[0] + B / 2, c[1]]} w={D} z0={Zk - H} h={H} color={col && !col.ok ? "#f97066" : CONC} edges="#667085" />;
                })}
                {on.beam && fl.beams.map((b, i) => {
                  const sp = an?.spans.find((s) => s.member === i), ti = sp?.typeIdx ?? b.type ?? 0, t = frame.beamTypes[ti] ?? frame.beamTypes[0];
                  const pts = arcPolyline(b.a, b.b, b.arc?.s, 12), color = sp && !sp.ok ? "#f04438" : byType ? TYPE_COLORS[ti % TYPE_COLORS.length] : CONC;
                  return pts.slice(1).map((q, j) => <Box key={`b${i}-${j}`} p={pts[j]} q={q} w={t.b} z0={Zk - t.h} h={t.h} color={color} edges={pts.length > 2 ? undefined : "#475467"} />);
                })}
                {on.slab && an?.panels.filter((p) => !p.open && !p.stairWell).map((p) => (
                  <Prism key={p.key} P={p.P} z0={p.st === "GS" ? zb + 0.05 - p.t : Zk - p.t} t={p.t} color={SLAB[p.st] ?? SLAB.S} edges="#98a2b3" />
                ))}
                {on.cant && an?.cants.map((c, i) => <Prism key={`ct${i}`} P={c.P} z0={Zk - c.t} t={c.t} color="#c3b5e0" edges="#8e4ec6" />)}
                {on.wall && wallsOf(fl).map((w, i) => {
                  const th = (WALL_T[w.kind] ?? 0.1) * (w.layers ?? 1) + ((w.layers ?? 1) > 1 ? 0.03 : 0), tp = wt.find((x) => x.id === w.kind);
                  return <Box key={`w${i}`} p={w.a} q={w.b} w={th} z0={Zk} h={w.h} color={tp?.w >= 150 ? "#d9a38a" : "#e8d8c3"} opacity={0.55} />;
                })}
                {on.stair && an?.stairs.map((st, i) => <Stair key={`s${i}`} st={st} zb={zb} zt={Zk} color="#7fc8c0" />)}
              </group>
            );
          })}
          {on.roof && roofFaces?.map((f, i) => <RoofFace key={i} f={f} dz={base0} />)}
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
  if (big) return (
    <div className="fixed inset-0 z-50 bg-black/60 p-4" onClick={() => setBig(false)}>
      <div className="relative h-full w-full overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>{scene}{bar}</div>
    </div>
  );
  return <div className={`relative ${className}`}>{scene}{bar}</div>;
}
