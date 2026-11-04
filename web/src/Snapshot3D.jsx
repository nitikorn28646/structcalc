// One shared WebGL canvas that renders 3D figures one after another and keeps them as pictures (user 2026-11-04: realistic 3D
// figures in the report — a page full of canvases exceeded the browser's WebGL context limit and froze). <Still3D id node /> asks
// for a picture of `node` (a group, no canvas) and shows it once rendered; <SnapshotStation /> (mounted once in the app) renders the
// queue off-screen. Pictures are cached by id for the session.
import { useEffect, useState, useSyncExternalStore } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Bounds } from "@react-three/drei";

const cache = new Map(), queue = [], subs = new Set();
const notify = () => subs.forEach((f) => f());
const subscribe = (f) => { subs.add(f); return () => subs.delete(f); };
let version = 0;
const snap = () => version;
export function request(id, node) { if (cache.has(id) || queue.some((j) => j.id === id)) return; queue.push({ id, node }); version++; notify(); }

export function Still3D({ id, node, className = "", alt = "" }) {
  useSyncExternalStore(subscribe, snap);
  useEffect(() => { request(id, node); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const url = cache.get(id);
  return url ? <img src={url} alt={alt} className={className} style={{ objectFit: "contain" }} /> : <div className={`${className} grid place-items-center text-[10px] text-gray-400`}>กำลังสร้างภาพ 3D…</div>;
}

function Grab({ id, onDone }) {
  const { gl } = useThree(); let n = 0;
  useFrame(() => { if (++n === 24) { cache.set(id, gl.domElement.toDataURL("image/png")); onDone(); } });
  return null;
}
export function SnapshotStation() {
  useSyncExternalStore(subscribe, snap);
  const [, force] = useState(0), job = queue[0];
  if (!job) return null;
  const done = () => { queue.shift(); version++; notify(); force((x) => x + 1); };
  return (
    <div style={{ position: "fixed", left: -4000, top: 0, width: 640, height: 440, pointerEvents: "none" }} aria-hidden>
      <Canvas key={job.id} dpr={1.5} gl={{ preserveDrawingBuffer: true, antialias: true }} camera={{ position: [3, 2.4, 3.6], fov: 32, near: 0.01, far: 100 }}>
        <color attach="background" args={["#ffffff"]} />
        <hemisphereLight args={["#ffffff", "#d0d5dd", 0.95]} />
        <directionalLight position={[3, 6, 4]} intensity={1.6} />
        <directionalLight position={[-4, 2, -3]} intensity={0.5} />
        <Bounds fit clip margin={1.12}>{job.node}</Bounds>
        <Grab id={job.id} onDone={done} />
      </Canvas>
    </div>
  );
}
