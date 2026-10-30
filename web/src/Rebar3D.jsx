// A reinforcing bar as a tube along a polyline whose corners are bent with a realistic inner bend radius.
import { useMemo } from "react";
import * as THREE from "three";

export const STEEL = {
  main: { color: "#4a5bd4", metalness: 0.75, roughness: 0.38 },
  dist: { color: "#2f8f63", metalness: 0.75, roughness: 0.38 },
  top: { color: "#c2413a", metalness: 0.75, roughness: 0.38 },
  plain: { color: "#6b7280", metalness: 0.85, roughness: 0.32 },
  stirrup: { color: "#2f8f63", metalness: 0.75, roughness: 0.38 },
};

// Polyline → curve with each interior corner replaced by a quadratic bend of radius ≈ r.
export function bentPath(points, r) {
  const v = points.map((p) => new THREE.Vector3(...p));
  const path = new THREE.CurvePath();
  let start = v[0];
  for (let i = 1; i < v.length - 1; i++) {
    const a = v[i - 1], b = v[i], c = v[i + 1];
    const din = b.clone().sub(a), dout = c.clone().sub(b);
    const rr = Math.min(r, din.length() / 2, dout.length() / 2);
    const p1 = b.clone().sub(din.normalize().multiplyScalar(rr));
    const p2 = b.clone().add(dout.normalize().multiplyScalar(rr));
    if (start.distanceTo(p1) > 1e-6) path.add(new THREE.LineCurve3(start, p1));
    path.add(new THREE.QuadraticBezierCurve3(p1, b, p2));
    start = p2;
  }
  path.add(new THREE.LineCurve3(start, v.at(-1)));
  return path;
}

export default function Rebar({ points, d, kind = "plain" }) {
  const geom = useMemo(() => {
    const path = bentPath(points, d * 2.5);
    const segs = Math.max(8, Math.min(200, Math.round(path.getLength() / (d * 2))));
    return new THREE.TubeGeometry(path, segs, d / 2, 10, false);
  }, [points, d]);
  return (
    <mesh geometry={geom} castShadow>
      <meshStandardMaterial {...STEEL[kind]} />
    </mesh>
  );
}
