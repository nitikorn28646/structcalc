// 3D reinforcement cages (user 2026-11-04: realistic figures): a column level (bars + ties with 135° hooks, a storey stub) and a
// footing (spread footing or pile cap: bottom mat both ways with hooks, column dowels bent on the mat, piles). Bars are real tubes
// (Rebar3D) at true diameter in translucent concrete. preserveDrawingBuffer lets printReport turn the canvas into a picture.
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, OrbitControls } from "@react-three/drei";
import Rebar from "./Rebar3D.jsx";
import { faceBars } from "../engine/floor.js";
import { BARS, SLAB_BARS } from "../engine/tables.js";
import { PILES } from "../engine/footing.js";

const dOf = (bar, def = 1.2) => (SLAB_BARS[bar]?.d ?? BARS[bar]?.d ?? def) / 100;
function Scene({ children, span, dark, className }) {
  return (
    <div className={`relative ${className}`}>
      <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }} camera={{ position: [span * 1.1, span * 0.9, span * 1.3], fov: 32, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 0.9]} />
        <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Bounds fit clip observe margin={1.15}><group>{children}</group></Bounds>
        <ContactShadows position={[0, -0.01, 0]} opacity={dark ? 0.6 : 0.3} scale={span * 3} blur={2.4} far={span * 2} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
    </div>
  );
}
const Concrete = ({ size, pos, dark }) => (
  <mesh position={pos}><boxGeometry args={size} /><meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.12 : 0.17} roughness={0.9} depthWrite={false} /><Edges color={dark ? "#6e7591" : "#98a2b3"} /></mesh>
);
// closed tie in a horizontal plane at height y, hooks 135° at one corner
const tie = (y, w, h, d) => { const hw = w / 2, hh = h / 2, k = Math.max(6 * d, 0.05) * 0.7; return { d, kind: "stirrup", points: [[-hw + k, y, -hh + k], [-hw, y, -hh], [hw, y, -hh], [hw, y, hh], [-hw, y, hh], [-hw, y + d, -hh], [-hw + k, y + d, -hh + k]] }; };

export function ColumnCage3D({ lv, cover = 3, H = 1.6, dark = false, className = "" }) {
  const parts = useMemo(() => {
    const Bx = lv.Bx / 100, By = lv.By / 100, db = dOf(lv.mainBar), td = dOf(lv.tieBar, 0.6), c = cover / 100, [nx, ny] = faceBars(lv.n);
    const ix = Bx / 2 - c - td - db / 2, iy = By / 2 - c - td - db / 2, pts = [];
    for (let i = 0; i < nx; i++) { const x = nx > 1 ? -ix + (2 * ix * i) / (nx - 1) : 0; pts.push([x, -iy], [x, iy]); }
    for (let j = 1; j < ny - 1; j++) { const z = -iy + (2 * iy * j) / (ny - 1); pts.push([-ix, z], [ix, z]); }
    const ties = []; for (let y = 0.05; y < H - 0.02; y += lv.s ?? 0.15) ties.push(tie(y, Bx - 2 * c - td, By - 2 * c - td, td));
    return { Bx, By, db, pts, ties };
  }, [lv, cover, H]);
  return (
    <Scene span={Math.max(H, 1)} dark={dark} className={className}>
      <Concrete size={[parts.Bx, H, parts.By]} pos={[0, H / 2, 0]} dark={dark} />
      {parts.pts.map(([x, z], i) => <Rebar key={i} d={parts.db} kind="main" points={[[x, 0, z], [x, H, z]]} />)}
      {parts.ties.map((t, i) => <Rebar key={`t${i}`} {...t} />)}
    </Scene>
  );
}

// spread footing / pile cap: f = a footing result (r.Bx, r.By, r.piles, inp t, cover, sLong, sShort, bars, pier bx/by, dowels)
export function FootingCage3D({ f, dark = false, className = "" }) {
  const parts = useMemo(() => {
    const r = f.r, inp = f.inp, Bx = r.Bx, By = r.By, T = inp.t ?? 0.4, c = (inp.cover ?? 7.5) / 100, dl = dOf(inp.longBar), ds = dOf(inp.shortBar ?? inp.longBar);
    const sL = inp.sLong ?? 0.15, sS = inp.sShort ?? sL, hk = Math.min(T - 2 * c, 0.15), bars = [];
    for (let z = -By / 2 + c; z <= By / 2 - c + 1e-6; z += sL) bars.push({ d: dl, kind: "main", points: [[-Bx / 2 + c, c + hk, z], [-Bx / 2 + c, c, z], [Bx / 2 - c, c, z], [Bx / 2 - c, c + hk, z]] });
    for (let x = -Bx / 2 + c; x <= Bx / 2 - c + 1e-6; x += sS) bars.push({ d: ds, kind: "dist", points: [[x, c + dl + hk, -By / 2 + c], [x, c + dl, -By / 2 + c], [x, c + dl, By / 2 - c], [x, c + dl + hk, By / 2 - c]] });
    const bx = inp.bx ?? 0.2, by = inp.by ?? 0.2, dd = dOf(inp.dowelBar), n = Math.max(4, inp.dowelN ?? 4), ex = bx / 2 - 0.05, ey = by / 2 - 0.05, Hs = T + 0.6;
    const corners = [[-ex, -ey], [ex, -ey], [ex, ey], [-ex, ey]], dow = corners.concat(n > 4 ? [[0, -ey], [0, ey], [-ex, 0], [ex, 0]].slice(0, n - 4) : []);
    dow.forEach(([x, z]) => { const sx = Math.sign(x) || 1; bars.push({ d: dd, kind: "top", points: [[x + sx * 0.2, c + dl * 2.5, z], [x, c + dl * 2.5, z], [x, Hs, z]] }); });
    const pb = PILES[f.pile]?.b ?? 0.2, piles = (r.piles ?? []).map(([x, y]) => [x, -y]);
    return { Bx, By, T, bars, bx, by, Hs, pb, piles, bored: PILES[f.pile]?.bored };
  }, [f]);
  return (
    <Scene span={Math.max(parts.Bx, parts.By, 1)} dark={dark} className={className}>
      <Concrete size={[parts.Bx, parts.T, parts.By]} pos={[0, parts.T / 2, 0]} dark={dark} />
      <Concrete size={[parts.bx, parts.Hs - parts.T, parts.by]} pos={[0, parts.T + (parts.Hs - parts.T) / 2, 0]} dark={dark} />
      {parts.piles.map(([x, z], i) => <mesh key={i} position={[x, -0.6, z]}>{parts.bored ? <cylinderGeometry args={[parts.pb / 2, parts.pb / 2, 1.2, 24]} /> : <boxGeometry args={[parts.pb, 1.2, parts.pb]} />}<meshStandardMaterial color="#9aa1b1" transparent opacity={0.55} /></mesh>)}
      {parts.bars.map((b, i) => <Rebar key={i} {...b} />)}
    </Scene>
  );
}
