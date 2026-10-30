// 3D view of a spread footing: footing block, pier, bottom mat with hooked ends, L-shaped dowels (units m).
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, OrbitControls } from "@react-three/drei";
import { SLAB_BARS } from "../engine/tables.js";
import Rebar from "./Rebar3D.jsx";

// Pile caps pass `piles` (centres in m), the pile width `pileB`, and `round` for bored piles; the mat sits 5 cm above the pile heads.
export default function Footing3D({ f, r, piles, pileB = 0.3, round = false, dark = false, className = "" }) {
  const geo = useMemo(() => {
    const bl = SLAB_BARS[f.longBar] ?? { d: 1.2 }, bs = SLAB_BARS[f.shortBar] ?? { d: 1.2 }, bd = SLAB_BARS[f.dowelBar] ?? { d: 1.2 };
    const c = f.cover / 100 + (piles ? 0.05 : 0), t = f.t, dl = bl.d / 100, ds = bs.d / 100, dd = bd.d / 100, hk = Math.min(t - 2 * c, 0.15);
    const bars = [];
    let shape = null;
    if (r.outline) {
      // 3-pile cap: prism from the cut-corner triangle; bars in three stacked bands over the pile lines
      shape = new THREE.Shape(r.outline.map(([x, y]) => new THREE.Vector2(x, -y)));
      const ext = (pileB * 1.3 + f.cover / 100) / Math.sqrt(3) - f.cover / 100; // cut corner lies e/√3 past the pile
      r.piles.forEach((a, i) => {
        const b = r.piles[(i + 1) % 3], L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L, y = c + i * dl;
        for (let k = 0; k < r.nTri; k++) {
          const o = (k - (r.nTri - 1) / 2) * r.sTri, ox = -uy * o, oz = ux * o;
          const s = [a[0] - ux * ext + ox, a[1] - uy * ext + oz], e = [b[0] + ux * ext + ox, b[1] + uy * ext + oz];
          bars.push({ d: dl, kind: i === 1 ? "dist" : "main", points: [[s[0], y + hk, s[1]], [s[0], y, s[1]], [e[0], y, e[1]], [e[0], y + hk, e[1]]] });
        }
      });
    }
    const ys = (n, B) => Array.from({ length: n }, (_, k) => -B / 2 + c + ((B - 2 * c) * k) / Math.max(n - 1, 1));
    if (!shape) for (const z of ys(r.nLong, f.By)) {
      bars.push({ d: dl, kind: "main", points: [[-f.Bx / 2 + c, c + hk, z], [-f.Bx / 2 + c, c, z], [f.Bx / 2 - c, c, z], [f.Bx / 2 - c, c + hk, z]] });
    }
    if (!shape) for (const x of ys(r.nShort, f.Bx)) {
      bars.push({ d: ds, kind: "dist", points: [[x, c + dl + hk, -f.By / 2 + c], [x, c + dl, -f.By / 2 + c], [x, c + dl, f.By / 2 - c], [x, c + dl + hk, f.By / 2 - c]] });
    }
    // dowels around the pier perimeter, each with a 90° foot resting on the mat
    const px = (f.pier === "circle" ? f.D : f.bx) / 2 - 0.05, pz = (f.pier === "circle" ? f.D : f.by) / 2 - 0.05;
    const n = Math.max(4, f.dowelN);
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n + Math.PI / 4;
      const x = f.pier === "circle" ? px * Math.cos(a) : Math.max(-px, Math.min(px, px * 1.6 * Math.cos(a)));
      const z = f.pier === "circle" ? pz * Math.sin(a) : Math.max(-pz, Math.min(pz, pz * 1.6 * Math.sin(a)));
      const rr = Math.hypot(x, z) || 1, foot = 0.2;
      bars.push({ d: dd, kind: "top", points: [[x + (x / rr) * foot, c + dl + ds + dd, z + (z / rr) * foot], [x, c + dl + ds + dd, z], [x, t + f.Df + 0.4, z]] });
    }
    return { bars, shape };
  }, [f, r, piles]);
  const pierH = f.Df + 0.25;
  const span = Math.max(f.Bx, f.By);
  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [span * 1.3, span * 1.1, span * 1.5], fov: 35, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 1]} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <Bounds fit clip observe margin={1.1}>
          <group>
            <mesh position={geo.shape ? [0, 0, 0] : [0, f.t / 2, 0]} rotation={geo.shape ? [-Math.PI / 2, 0, 0] : [0, 0, 0]}>
              {geo.shape ? <extrudeGeometry args={[geo.shape, { depth: f.t, bevelEnabled: false }]} /> : <boxGeometry args={[f.Bx, f.t, f.By]} />}
              <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.16 : 0.22} roughness={0.9} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            <mesh position={[0, f.t + pierH / 2, 0]}>
              {f.pier === "circle" ? <cylinderGeometry args={[f.D / 2, f.D / 2, pierH, 32]} /> : <boxGeometry args={[f.bx, pierH, f.by]} />}
              <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.16 : 0.22} roughness={0.9} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            {geo.bars.map((p, i) => <Rebar key={i} {...p} />)}
            {piles?.map(([x, z], i) => (
              <mesh key={`p${i}`} position={[x, -0.7 + 0.05, z]}>
                {round ? <cylinderGeometry args={[pileB / 2, pileB / 2, 1.5, 24]} /> : <boxGeometry args={[pileB, 1.5, pileB]} />}
                <meshStandardMaterial color={dark ? "#5b6380" : "#b4bcc8"} roughness={0.8} transparent opacity={0.85} />
              </mesh>
            ))}
          </group>
        </Bounds>
        <Grid position={[0, piles ? -1.46 : -0.01, 0]} args={[20, 20]} cellSize={0.25} sectionSize={1} fadeDistance={span * 5}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, piles ? -1.45 : 0, 0]} opacity={dark ? 0.6 : 0.3} scale={span * 3} blur={2.4} far={1.5} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-gray-500">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4a5bd4]" />เหล็กทางยาว</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f8f63]" />เหล็กทางสั้น</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#c2413a]" />เหล็กเดือย</span>
        <span>ลากเพื่อหมุน</span>
      </div>
    </div>
  );
}


