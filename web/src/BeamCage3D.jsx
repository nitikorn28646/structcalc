// 3D view of a beam: translucent concrete, longitudinal bars and stirrups (units: metres, z along the span).
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, Html, OrbitControls } from "@react-three/drei";
import { STIRRUPS } from "../engine/tables.js";
import { barLayout, barRuns } from "./drawings.js";
import Rebar from "./Rebar3D.jsx";

// Longitudinal bar from z0 to z1 (m from the left end); 90° standard hooks (12d) only where it ends at a beam end.
function longBar({ x, y, d, special, z0, z1 }, L, h) {
  const e = 0.04, hk = Math.min(12 * d, h * 0.45) * (y > 0 ? -1 : 1);
  const a = Math.max(z0, e) - L / 2, b = Math.min(z1, L - e) - L / 2;
  return { d, kind: special ? "main" : "plain", points: [
    ...(z0 <= e ? [[x, y + hk, a]] : []), [x, y, a], [x, y, b], ...(z1 >= L - e ? [[x, y + hk, b]] : [])] };
}

// Closed stirrup with overlapping 135° hooks at the top-left corner (hook extension 6d, min 5 cm).
function stirrup(z, w, h, d) {
  const hw = w / 2, hh = h / 2, k = Math.max(6 * d, 0.05) * 0.7;
  return { d, kind: "stirrup", points: [
    [-hw + k, hh - k, z], [-hw, hh, z], [hw, hh, z], [hw, -hh, z], [-hw, -hh, z],
    [-hw, hh, z + d], [-hw + k, hh - k, z + d]] };
}

function useBeamParts({ b, h, L, cover, stirrupBar, type, mid, sup, sEnd, sMid }) {
  return useMemo(() => {
    const B = b * 100, H = h * 100, sd = STIRRUPS[stirrupBar]?.d ?? 0.9;
    const toM = (p) => ({ ...p, x: (p.x - B / 2) / 100, y: (p.y - H / 2) / 100, d: p.d / 100 });
    const lay = (sec, face) => barLayout(B, H, cover, sd, sec[face], face === "top").map(toM);
    // supports carrying negative moment: a cantilever uses its support section over the whole length
    let bars;
    if (type === "cantilever") bars = [...lay(sup, "top"), ...lay(sup, "bottom")].map((p) => ({ ...p, z0: 0, z1: L }));
    else {
      const ends = { L: type !== "one_end", R: true };
      bars = ["top", "bottom"].flatMap((f) => barRuns(lay(mid, f), lay(sup, f), L, ends));
    }
    const ins = (cover + sd / 2) / 100;
    const zs = [];
    const zone = L / 4;
    for (let z = 0.05; z <= L - 0.05 + 1e-9;) {
      zs.push(z - L / 2);
      z += z < zone || z > L - zone ? sEnd : sMid;
    }
    return { bars, zs, sw: b - 2 * ins, sh: h - 2 * ins, sd: sd / 100 };
  }, [b, h, L, cover, stirrupBar, type, mid, sup, sEnd, sMid]);
}

// the cage itself (concrete + bars + stirrups) without a canvas — also rendered by the snapshot station for the report
export function BeamCageParts(props) {
  const { b, h, L, dark = false } = props, parts = useBeamParts(props);
  return (<group>
    <mesh><boxGeometry args={[b, h, L]} /><meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.12 : 0.16} roughness={0.9} depthWrite={false} /><Edges color={dark ? "#6e7591" : "#98a2b3"} /></mesh>
    {parts.bars.map((p, i) => <Rebar key={`b${i}`} {...longBar(p, L, h)} />)}
    {parts.zs.map((z, i) => <Rebar key={`s${i}`} {...stirrup(z, parts.sw, parts.sh, parts.sd)} />)}
  </group>);
}

export default function BeamCage3D({ b, h, L, cover, stirrupBar, type, mid, sup, sEnd, sMid, className = "", dark = false }) {
  const parts = useBeamParts({ b, h, L, cover, stirrupBar, type, mid, sup, sEnd, sMid });
  const span = Math.max(L, 1);
  return (
    <div className={`relative ${className}`}>
      <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true }} camera={{ position: [span * 0.75, span * 0.22, span * 0.3], fov: 35, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 0.9]} />
        <directionalLight position={[3, 6, 4]} intensity={1.6} castShadow shadow-mapSize={[1024, 1024]} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Bounds fit clip observe margin={1.05}>
        <group>
          <mesh>
            <boxGeometry args={[b, h, L]} />
            <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.12 : 0.16} roughness={0.9} depthWrite={false} />
            <Edges color={dark ? "#6e7591" : "#98a2b3"} />
          </mesh>
          {parts.bars.map((p, i) => <Rebar key={`b${i}`} {...longBar(p, L, h)} />)}
          {parts.zs.map((z, i) => <Rebar key={`s${i}`} {...stirrup(z, parts.sw, parts.sh, parts.sd)} />)}
          <Html position={[0, h / 2 + 0.08, L / 2]} center className="pointer-events-none whitespace-nowrap rounded bg-white/90 px-1.5 text-[11px] text-gray-600 shadow-sm">
            {b * 100}×{h * 100} cm · L = {L} m
          </Html>
        </group>
        </Bounds>
        <Grid position={[0, -h / 2 - 0.16, 0]} args={[span * 3, span * 3]} cellSize={0.1} sectionSize={1} fadeDistance={span * 2.2}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, -h / 2 - 0.15, 0]} opacity={dark ? 0.6 : 0.35} scale={span * 2} blur={2.4} far={1.5} />
        <OrbitControls makeDefault enableDamping target={[0, 0, 0]} />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#6b7280]" />เหล็กหลัก</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4a5bd4]" />เหล็กเสริมพิเศษ</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f8f63]" />เหล็กปลอก</span>
        <span>ลากเพื่อหมุน · เลื่อนลูกกลิ้งเพื่อซูม</span>
      </div>
    </div>
  );
}




