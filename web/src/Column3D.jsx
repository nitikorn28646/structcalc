// 3D view of a tied column: translucent concrete, vertical bars hooked into the footing, closed ties with 135° hooks.
// Units: metres, y up.
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, OrbitControls } from "@react-three/drei";
import { SLAB_BARS } from "../engine/tables.js";
import { columnBarLayout, spiralBarLayout } from "./drawings.js";
import Rebar from "./Rebar3D.jsx";

export default function Column3D({ c, r, dark = false, className = "" }) {
  const geo = useMemo(() => {
    if (c.shape === "spiral") {
      // circular column: bars on a circle, hooked radially outward at the bottom; continuous spiral at pitch s
      const bar = SLAB_BARS[c.mainBar] ?? { d: 1.6 }, sp = SLAB_BARS[c.spiralBar] ?? { d: 0.9 };
      const H = c.L, D = c.D / 100, sd = sp.d / 100;
      const bars = spiralBarLayout(c.D, c.cover, sp.d, bar.d, c.nBars).map((p) => {
        const x = p.x / 100, z = p.y / 100, d = p.d / 100, hk = 12 * d, rr = Math.hypot(x, z) || 1;
        return { d, kind: "plain", points: [[x + (x / rr) * hk, -H / 2 - 0.08, z + (z / rr) * hk], [x, -H / 2 - 0.08, z], [x, H / 2 + 0.4, z]] };
      });
      const rs = D / 2 - c.cover / 100 - sd / 2, pitch = Math.max(c.sSpiral, 2) / 100, pts = [];
      for (let y = -H / 2 + 0.05, a = 0; y <= H / 2 - 0.02; y += pitch / 24, a += (2 * Math.PI) / 24) pts.push([rs * Math.cos(a), y, rs * Math.sin(a)]);
      return { H, bx: D, by: D, round: true, bars, ties: [{ d: sd, kind: "stirrup", points: pts }] };
    }
    const bar = SLAB_BARS[c.mainBar] ?? { d: 1.6 }, tie = SLAB_BARS[c.tieBar] ?? { d: 0.6 };
    const H = c.L, bx = c.Bx / 100, by = c.By / 100;
    const bars = columnBarLayout(c.Bx, c.By, c.cover, tie.d, bar.d, c.nx, c.ny).map((p) => {
      const x = p.x / 100, z = p.y / 100, d = p.d / 100, hk = 12 * d;
      // 90° hook at the bottom turned outward into the footing, lap length left above the top
      const ox = Math.sign(x) || 1, oz = Math.sign(z) || 1;
      const out = Math.abs(x) / bx > Math.abs(z) / by ? [ox * hk, 0] : [0, oz * hk];
      return { d, kind: "plain", points: [[x + out[0], -H / 2 - 0.08, z + out[1]], [x, -H / 2 - 0.08, z], [x, H / 2 + 0.4, z]] };
    });
    const ins = (c.cover + tie.d / 2) / 100, hw = bx / 2 - ins, hd = by / 2 - ins, td = tie.d / 100;
    const k = Math.max(6 * td, 0.05) * 0.7;
    const s = (r?.sTie ?? 20) / 100;
    const ties = [];
    for (let y = -H / 2 + 0.05; y <= H / 2 - 0.02 && ties.length < 200; y += s > 0.03 ? s : 0.15) {
      ties.push({ d: td, kind: "stirrup", points: [
        [-hw + k, y, hd - k], [-hw, y, hd], [hw, y, hd], [hw, y, -hd], [-hw, y, -hd], [-hw, y + td, hd], [-hw + k, y + td, hd - k]] });
    }
    return { H, bx, by, bars, ties };
  }, [c, r]);
  const { H, bx, by } = geo;
  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [H * 0.9, H * 0.35, H * 1.1], fov: 35, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 1]} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <Bounds fit clip observe margin={1.1}>
          <group>
            <mesh>
              {geo.round ? <cylinderGeometry args={[bx / 2, bx / 2, H, 40]} /> : <boxGeometry args={[bx, H, by]} />}
              <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.14 : 0.18} roughness={0.9} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            <mesh position={[0, -H / 2 - 0.15, 0]}>
              <boxGeometry args={[bx * 3, 0.3, by * 3]} />
              <meshStandardMaterial color={dark ? "#3a4163" : "#d0d5dd"} roughness={0.9} transparent opacity={0.55} />
            </mesh>
            {geo.bars.map((p, i) => <Rebar key={`b${i}`} {...p} />)}
            {geo.ties.map((p, i) => <Rebar key={`t${i}`} {...p} />)}
          </group>
        </Bounds>
        <Grid position={[0, -H / 2 - 0.31, 0]} args={[10, 10]} cellSize={0.1} sectionSize={1} fadeDistance={H * 3}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, -H / 2 - 0.3, 0]} opacity={dark ? 0.6 : 0.3} scale={H} blur={2.4} far={1.5} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#6b7280]" />เหล็กยืน</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f8f63]" />เหล็กปลอก</span>
        <span>ลากเพื่อหมุน</span>
      </div>
    </div>
  );
}

