// 3D view of a slab panel: translucent concrete on supporting beams, bottom bars both ways, top bars at supports.
// Units: metres; x along the main (short) span, z across it.
import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, OrbitControls } from "@react-three/drei";
import { SLAB_BARS } from "../engine/tables.js";
import Rebar from "./Rebar3D.jsx";

const TOP_DIV = { simple: [4, 4], one_end: [4, 3], both_ends: [3, 3] };
const TWO_TOP_DIV = { 1: [3, 3], 2: [4, 3], 3: [4, 3], 4: [4, 3], 5: [4, 4] };

const steps = (len, s) => {
  if (!(s > 0)) return [];
  const n = Math.floor(len / s);
  const off = (len - n * s) / 2;
  return Array.from({ length: n + 1 }, (_, k) => off + k * s - len / 2);
};

export default function Slab3D({ s, r, dark = false, className = "" }) {
  const geo = useMemo(() => {
    const two = s.kind === "twoway", cant = s.kind === "cantilever";
    const X = two ? s.S : s.L;                       // main span
    const Z = two ? s.L : Math.min(Math.max(X * 0.8, 1.2), 2.5); // panel width shown
    const t = s.t, cv = s.cover / 100;
    const mb = SLAB_BARS[two ? s.shortBar : s.mainBar] ?? { d: 0.9 };
    const db = SLAB_BARS[two ? s.longBar : s.tempBar] ?? { d: 0.9 };
    const sMain = two ? r.sShort : r.sMain, sDist = two ? r.sLong : r.sTemp;
    const yb = -t / 2 + cv, yt = t / 2 - cv;
    const dm = mb.d / 100, dd = db.d / 100;
    const hD = t - 2 * cv - dm; // hook leg that fits inside the slab depth
    const yb2 = yb + dm, yt2 = yt - dm; // second layer sits on / under the first
    const bars = [];
    // bar along x (or z) between a and b at height y, with 90° hooks: +1 up, −1 down, 0 none at each end
    const alongX = (z, a, b, y, d, kind, hookA = 0, hookB = 0) => bars.push({ d, kind, points: [
      ...(hookA ? [[a, y + hookA * hD, z]] : []), [a, y, z], [b, y, z], ...(hookB ? [[b, y + hookB * hD, z]] : [])] });
    const alongZ = (x, a, b, y, d, kind, hookA = 0, hookB = 0) => bars.push({ d, kind, points: [
      ...(hookA ? [[x, y + hookA * hD, a]] : []), [x, y, a], [x, y, b], ...(hookB ? [[x, y + hookB * hD, b]] : [])] });

    if (cant) {
      // main bars at the top, anchored back over the support and hooked down at both ends
      for (const z of steps(Z - 0.1, sMain)) alongX(z, -X / 2 - 0.3, X / 2 - 0.03, yt, dm, "top", -1, -1);
      for (const x of steps(X - 0.06, sDist)) alongZ(x, -Z / 2 + 0.05, Z / 2 - 0.05, yt2, dd, "dist");
    } else {
      // bottom bars run into the supporting beams and are hooked up
      for (const z of steps(Z - 0.1, sMain)) alongX(z, -X / 2 - 0.12, X / 2 + 0.12, yb, dm, "main", 1, 1);
      for (const x of steps(X - 0.1, sDist)) {
        if (two) alongZ(x, -Z / 2 - 0.12, Z / 2 + 0.12, yb2, dd, "dist", 1, 1);
        else alongZ(x, -Z / 2 + 0.05, Z / 2 - 0.05, yb2, dd, "dist");
      }
      const [dl, dr] = two ? TWO_TOP_DIV[s.case] : TOP_DIV[s.support];
      // top bars over the supports at x = ±X/2: hooked down into the beam and at the inner end
      for (const [x0, x1] of [[-X / 2 - 0.12, -X / 2 + X / dl], [X / 2 - X / dr, X / 2 + 0.12]]) {
        for (const z of steps(Z - 0.1, sMain)) alongX(z, x0, x1, yt, dm, "top", -1, -1);
        const zone = Math.abs(x1 - x0) - 0.12, mid = (x0 + x1) / 2;
        for (const x of steps(zone, sDist)) alongZ(mid + x, -Z / 2 + 0.05, Z / 2 - 0.05, yt2, dd, "dist");
      }
      // two-way: top bars over the supports at z = ±Z/2 as well
      if (two) {
        for (const [z0, z1] of [[-Z / 2 - 0.12, -Z / 2 + Z / dl], [Z / 2 - Z / dr, Z / 2 + 0.12]]) {
          for (const x of steps(X - 0.1, sDist)) alongZ(x, z0, z1, yt2, dd, "top", -1, -1);
          const zone = Math.abs(z1 - z0) - 0.12, mid = (z0 + z1) / 2;
          for (const z of steps(zone, sMain)) alongX(mid + z, -X / 2 + 0.05, X / 2 - 0.05, yt, dm, "dist");
        }
      }
    }
    return { X, Z, t, bars, cant, two };
  }, [s, r]);
  const { X, Z, t } = geo;
  const bw = 0.2, bd = Math.max(0.3, X / 10);
  const beam = (x, z, w, d) => (
    <mesh position={[x, -t / 2 - bd / 2, z]}>
      <boxGeometry args={[w, bd, d]} />
      <meshStandardMaterial color={dark ? "#3a4163" : "#d0d5dd"} roughness={0.9} />
    </mesh>
  );
  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [X * 0.9, X * 0.8, Z * 1.3], fov: 35, near: 0.01, far: 100 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 1]} />
        <directionalLight position={[3, 6, 4]} intensity={1.4} />
        <Bounds fit clip observe margin={1.1}>
          <group>
            <mesh position={geo.cant ? [-0.2, 0, 0] : [0, 0, 0]}>
              <boxGeometry args={[geo.cant ? X + 0.4 : X + 2 * bw, t, Z + (geo.two ? 2 * bw : 0)]} />
              <meshPhysicalMaterial color={dark ? "#8a93b8" : "#c9ced6"} transparent opacity={dark ? 0.14 : 0.2} roughness={0.9} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            {geo.cant ? beam(-X / 2 - bw / 2, 0, bw, Z) : <>{beam(-X / 2 - bw / 2, 0, bw, Z)}{beam(X / 2 + bw / 2, 0, bw, Z)}</>}
            {geo.two && <>{beam(0, -Z / 2 - bw / 2, X + 2 * bw, bw)}{beam(0, Z / 2 + bw / 2, X + 2 * bw, bw)}</>}
            {geo.bars.map((p, i) => <Rebar key={i} {...p} />)}
          </group>
        </Bounds>
        <Grid position={[0, -t / 2 - bd - 0.03, 0]} args={[20, 20]} cellSize={0.25} sectionSize={1} fadeDistance={Math.max(X, Z) * 3}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, -t / 2 - bd - 0.02, 0]} opacity={dark ? 0.6 : 0.3} scale={Math.max(X, Z) * 2} blur={2.4} far={1.5} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex flex-wrap gap-3 text-[11px] text-gray-500">
        {!geo.cant && <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#4a5bd4]" />เหล็กล่าง{geo.two ? "ทิศสั้น" : "หลัก"}</span>}
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#2f8f63]" />{geo.two ? "เหล็กล่างทิศยาว" : "เหล็กกันร้าว"}</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-[#c2413a]" />เหล็กบน</span>
        <span>ลากเพื่อหมุน</span>
      </div>
    </div>
  );
}


