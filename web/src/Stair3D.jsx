// 3D view of a stair flight: extruded steps on the waist slab, end beams, bars along the slope (units m).
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, OrbitControls } from "@react-three/drei";
import { SLAB_BARS } from "../engine/tables.js";
import { stairGeometry } from "./drawings.js";
import Rebar from "./Rebar3D.jsx";

export default function Stair3D({ s, r, dark = false, className = "" }) {
  const geo = useMemo(() => {
    const g = stairGeometry(s, r.steps);
    const m = (v) => v / 100;
    const W = m(g.W), H = m(g.H), tv = m(g.tv), Z = s.width, slope = g.slope;
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(W, H);
    shape.lineTo(W, H + tv);
    [...g.profile].reverse().forEach(([x, y]) => shape.lineTo(m(x), m(y)));
    shape.lineTo(0, 0);
    const mb = SLAB_BARS[s.mainBar] ?? { d: 1.2 }, tb = SLAB_BARS[s.tempBar] ?? { d: 0.9 };
    const dm = m(mb.d), dt = m(tb.d), cv = m(s.cover) * slope, hk = Math.min(tv * 0.6, 0.12);
    const y = (x) => (x * H) / W;
    const bars = [];
    const across = Math.max(r.sMain, 0.05);
    for (let z = -Z / 2 + 0.05; z <= Z / 2 - 0.05 + 1e-9; z += across) {
      bars.push({ d: dm, kind: "main", points: [[-0.21, y(-0.21) + cv + hk, z], [-0.21, y(-0.21) + cv, z], [W + 0.21, y(W + 0.21) + cv, z], [W + 0.21, y(W + 0.21) + cv + hk, z]] });
      for (const [xa, xb] of [[-0.21, W / 4], [W + 0.21, (3 * W) / 4]]) {
        bars.push({ d: dm, kind: "top", points: [[xa, y(xa) + tv - cv - hk, z], [xa, y(xa) + tv - cv, z], [xb, y(xb) + tv - cv, z], [xb, y(xb) + tv - cv - hk * 0.6, z]] });
      }
    }
    const along = Math.max(r.sTemp / slope, 0.05);
    for (let x = 0.05; x <= W - 0.05; x += along) {
      bars.push({ d: dt, kind: "dist", points: [[x, y(x) + cv + dm, -Z / 2 + 0.03], [x, y(x) + cv + dm, Z / 2 - 0.03]] });
    }
    return { shape, W, H, tv, Z, bars };
  }, [s, r]);
  const { W, H, tv, Z } = geo;
  const beam = (x, y0) => (
    <mesh position={[x, y0 - 0.2 + tv / 2, 0]}>
      <boxGeometry args={[0.25, 0.4 + tv, Z + 0.1]} />
      <meshStandardMaterial color={dark ? "#3a4163" : "#d0d5dd"} roughness={0.9} />
    </mesh>
  );
  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [W * 0.4, H * 1.6, Z * 3.2], fov: 35, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 1]} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <Bounds fit clip observe margin={1.15}>
          <group position={[-W / 2, -H / 2, 0]}>
            <mesh position={[0, 0, -Z / 2]}>
              <extrudeGeometry args={[geo.shape, { depth: Z, bevelEnabled: false }]} />
              <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.16 : 0.22} roughness={0.9} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            {beam(-0.125, 0)}
            {beam(W + 0.125, H)}
            {geo.bars.map((p, i) => <Rebar key={i} {...p} />)}
          </group>
        </Bounds>
        <Grid position={[0, -H / 2 - 0.45, 0]} args={[20, 20]} cellSize={0.25} sectionSize={1} fadeDistance={W * 4}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, -H / 2 - 0.44, 0]} opacity={dark ? 0.6 : 0.3} scale={W * 2} blur={2.4} far={2} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4a5bd4]" />เหล็กหลัก</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f8f63]" />เหล็กกันร้าว</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#c2413a]" />เหล็กบน</span>
        <span>ลากเพื่อหมุน</span>
      </div>
    </div>
  );
}
