// 3D roof: walls, roof planes, gable walls and coloured ridge/hip/valley lines (plan x,y → three x,-z; height → y).
import { useMemo } from "react";
import * as THREE from "three";
import { Canvas } from "@react-three/fiber";
import { Bounds, ContactShadows, Edges, Grid, Line, OrbitControls } from "@react-three/drei";

export const LINE_COLORS = { ridge: "#e5484d", hip: "#3e63dd", valley: "#30a46c", rake: "#f76b15", eave: "#8b8d98" };
const to3 = ([x, y, z]) => [x, z, -y];

function faceGeometry(f) {
  // triangulate in the face's own 2D frame: plan for sloped planes, (along-edge, height) for gable walls
  const a = f.P[0], b = f.P[1], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
  const flat = f.P.map((p) => (f.gable ? new THREE.Vector2((p[0] - a[0]) * u[0] + (p[1] - a[1]) * u[1], p[2]) : new THREE.Vector2(p[0], p[1])));
  const tris = THREE.ShapeUtils.triangulateShape(flat, []);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(f.P.flatMap(to3), 3));
  g.setIndex(tris.flat());
  g.computeVertexNormals();
  return g;
}

// steel member as a box between two plan-space points [x, y, z], with a vertical offset dz (m)
const Z = new THREE.Vector3(0, 0, 1);
function Member({ p, q, w, h, dz = 0, color, xray = false, onClick }) {
  const a = new THREE.Vector3(...to3([p[0], p[1], p[2] + dz])), b = new THREE.Vector3(...to3([q[0], q[1], q[2] + dz]));
  const d = b.clone().sub(a), L = d.length();
  if (L < 1e-3) return null;
  const quat = new THREE.Quaternion().setFromUnitVectors(Z, d.normalize());
  return (
    <mesh position={a.add(b).multiplyScalar(0.5)} quaternion={quat} renderOrder={xray ? 10 : 0} onClick={onClick ? (e) => { e.stopPropagation(); onClick(); } : undefined} onPointerOver={onClick ? (e) => { e.stopPropagation(); document.body.style.cursor = "pointer"; } : undefined} onPointerOut={onClick ? () => { document.body.style.cursor = ""; } : undefined}>
      <boxGeometry args={[w, h, L]} />
      {xray ? <meshBasicMaterial color={color} depthTest={false} transparent opacity={0.9} /> : <meshStandardMaterial color={color} metalness={0.5} roughness={0.45} />}
    </mesh>
  );
}
const FC = { purlin: "#98a2b3", rafter: "#b54708", support: "#7a5af8", post: "#0e9384", plate: "#475467" };


// steel roof framing (purlins, rafters, supports, ridge / hip / valley, wall plates, posts) — also drawn in the whole-building 3D
// (Frame3D, user 2026-11-04: "ดูภาพ 3D โครงสร้างและโครงหลังคาพร้อมกัน"); Z0 lifts it to the building's height datum
// posts (ดั้ง / ตุ๊กตา) stand on the plate top = H − 0.155 (the rafter soffit, user 2026-11-04: posts looked floating above the plates);
// a post with no plate under it (designRoof dz.loose) is red: it needs an interior plate (tab อะเส → "เพิ่มอะเสรับ")
export function RoofFrameMembers({ g, fr, plates, Z0 = 0, onPick = null, loose = [] }) {
  const isLoose = (p) => loose.some((q) => Math.hypot(q[0] - p.x, q[1] - p.y) < 0.05);
  return (<>
              {fr.purlins.map((m, i) => <Member key={`p${i}`} {...m} w={0.05} h={0.1} dz={Z0 + 0.04} color={FC.purlin} />)}
              {fr.rafters.map((m, i) => <Member key={`r${i}`} {...m} w={0.05} h={0.15} dz={Z0 - 0.08} color={FC.rafter} />)}
              {fr.supports.map((s, i) => <Member key={`s${i}`} p={[...s.a, s.za]} q={[...s.b, s.zb]} w={0.1} h={0.15} dz={Z0 - 0.24} color={FC.support} />)}
              {g.lines.filter((l) => l.type === "ridge" || l.type === "hip" || l.type === "valley").map((l, i) => <Member key={`l${i}`} p={l.p} q={l.q} w={0.1} h={0.2} dz={Z0 - 0.12} color={LINE_COLORS[l.type]} />)}
              {(plates ?? g.pts.map((p, i) => ({ p: [...p, g.H], q: [...g.pts[(i + 1) % g.pts.length], g.H] }))).map((m, i) => {
                // wall plate under the rafters, sized from the section name (depth x flange) when designed
                const [dmm, bmm] = m.r ? m.r.section.name.split("x").map(Number) : [150, 50], dep = dmm / 1000, wid = (bmm / 1000) * (m.count ?? 2);
                return <Member key={`w${i}`} p={m.p} q={m.q} w={wid} h={dep} dz={Z0 - 0.155 - dep / 2} color={m.color ?? FC.plate} onClick={onPick && m.tag ? () => onPick(m) : undefined} />;
              })}
              {fr.posts.map((p, i) => <Member key={`t${i}`} p={[p.x, p.y, g.H - 0.155]} q={[p.x, p.y, p.top - (p.kind === "ดั้ง" ? 0.22 : 0.32)]} w={0.1} h={0.1} dz={Z0} color={isLoose(p) ? "#f04438" : FC.post} />)}
  </>);
}

export default function Roof3D({ g, fr, hover, plates, dark = false, className = "", onPick = null, loose = [] }) {
  const geo = useMemo(() => {
    const walls = new THREE.Shape(g.pts.map(([x, y]) => new THREE.Vector2(x, y)));
    return { faces: g.faces.map((f) => ({ gable: f.gable, geom: faceGeometry(f) })), walls };
  }, [g]);
  const xs = g.eave.map((p) => p[0]), ys = g.eave.map((p) => p[1]);
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return (
    <div className={`relative ${className}`}>
      <Canvas dpr={[1, 2]} camera={{ position: [span, span * 0.8, span * 1.1], fov: 35, near: 0.1, far: 500 }}>
        <color attach="background" args={[dark ? "#0f1222" : "#f9fafb"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 1]} />
        <directionalLight position={[10, 20, 8]} intensity={1.5} />
        <Bounds fit clip observe margin={1.7}>
          <group position={[-cx, 0, cy]}>
            <mesh rotation={[-Math.PI / 2, 0, 0]}>
              <extrudeGeometry args={[geo.walls, { depth: g.H, bevelEnabled: false }]} />
              <meshStandardMaterial color={dark ? "#5b6380" : "#e4e7ec"} transparent opacity={0.35} depthWrite={false} />
              <Edges color={dark ? "#6e7591" : "#98a2b3"} />
            </mesh>
            {geo.faces.map((f, i) => (
              <mesh key={i} geometry={f.geom} position={[0, fr ? 0.12 : 0, 0]} visible={!fr || !f.gable}>
                <meshStandardMaterial side={THREE.DoubleSide} roughness={0.6} metalness={f.gable ? 0 : 0.35}
                  color={f.gable ? (dark ? "#8a93b8" : "#d0d5dd") : dark ? "#7b8cff" : "#8fa3ff"} transparent opacity={fr ? 0.14 : f.gable ? 0.55 : 0.8} depthWrite={!fr} />
              </mesh>
            ))}
            {fr && <RoofFrameMembers g={g} fr={fr} plates={plates} onPick={onPick} loose={loose} />}
            {hover && <Member p={hover.p} q={hover.q} w={0.4} h={0.4} dz={hover.group === "plate" ? -0.25 : -0.12} color="#f59e0b" xray />}
            {!fr && g.lines.map((l, i) => <Line key={i} points={[to3(l.p), to3(l.q)]} color={LINE_COLORS[l.type]} lineWidth={l.type === "eave" ? 1.5 : 3} />)}
          </group>
        </Bounds>
        <Grid position={[0, -0.01, 0]} args={[100, 100]} cellSize={1} sectionSize={5} fadeDistance={span * 4}
          cellColor={dark ? "#22273d" : "#e4e7ec"} sectionColor={dark ? "#3a4163" : "#d0d5dd"} infiniteGrid />
        <ContactShadows position={[0, 0, 0]} opacity={dark ? 0.6 : 0.3} scale={span * 3} blur={2.4} far={g.top + 1} />
        <OrbitControls makeDefault enableDamping />
      </Canvas>
      <div className="pointer-events-none absolute bottom-2 left-3 flex gap-3 text-[11px] text-gray-500">
        {fr && <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: FC.plate }} />อะเส</span>}
        {[["ridge", "อกไก่"], ["hip", "ตะเข้สัน"], ["valley", "ตะเข้ราง"], ["rake", "ปั้นลม"]].map(([k, t]) => (
          <span key={k} className="flex items-center gap-1"><i className="h-2 w-2 rounded-full" style={{ background: LINE_COLORS[k] }} />{t}</span>
        ))}
        <span>ลากเพื่อหมุน</span>
      </div>
    </div>
  );
}

