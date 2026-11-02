// Roof → structure link: wall-plate (and interior-plate / post) reactions of the roof module as point loads where they bear.
import { loadSkeleton, runRoof } from "./RoofPage.jsx";

export async function roofPoints(roof) {
    const sk = await loadSkeleton(), { dz, fr, error } = runRoof(roof, sk);
    if (error || !dz) return { error: error ?? "ไม่มีข้อมูลหลังคา" };
    const pts = [], plates = dz.members.filter((x) => x.group === "plate"), cols = roof.columns ?? [];
    const addAt = (p, P) => { const hit = pts.find((x) => Math.hypot(x.p[0] - p[0], x.p[1] - p[1]) < 0.05); if (hit) hit.P += P; else pts.push({ p: [+p[0].toFixed(3), +p[1].toFixed(3)], P, name: "หลังคา" }); };
    for (const m of plates) for (const [p, R] of [[m.p, m.inner ? m.r.Rl : m.r.R], [m.q, m.inner ? m.r.Rr : m.r.R]]) {
      // an interior plate ending on a wall plate between columns: split its reaction to that span's ends (lever rule)
      const onCol = cols.some((c) => Math.hypot(c[0] - p[0], c[1] - p[1]) < 0.05), host = m.inner && !onCol && plates.find((w) => !w.inner && (() => {
        const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((p[0] - w.p[0]) * (w.q[0] - w.p[0]) + (p[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > 0.01 && t < 0.99 && Math.abs((p[0] - w.p[0]) * (w.q[1] - w.p[1]) - (p[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.05; })());
      if (host) { const L = Math.hypot(host.q[0] - host.p[0], host.q[1] - host.p[1]), a = Math.hypot(p[0] - host.p[0], p[1] - host.p[1]); addAt(host.p, (R * (L - a)) / L); addAt(host.q, (R * a) / L); }
      else addAt(p, R);
    }
    // ดั้ง standing on a wall plate (not on an interior plate): ridge / hip reactions down that post
    const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05, innerLines = plates.filter((x) => x.inner);
    for (const post of fr.posts.filter((x) => x.kind === "ดั้ง")) {
      const q = [post.x, post.y];
      if (innerLines.some((w) => { const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((q[0] - w.p[0]) * (w.q[0] - w.p[0]) + (q[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > -0.01 && t < 1.01 && Math.abs((q[0] - w.p[0]) * (w.q[1] - w.p[1]) - (q[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.15; })) continue; // carried by an interior plate (already in its reactions)
      const P = dz.members.reduce((t, x) => t + ((x.group === "ridge" || x.group === "support") && (near(x.p, q) || near(x.q, q)) ? x.r.R : 0)
        + ((x.group === "hip" || x.group === "valley") && near(x.q, q) ? Math.max(0, x.r.Rmin) : 0), 0);
      if (!(P > 0)) continue;
      const host = plates.find((w) => !w.inner && (() => { const L = Math.hypot(w.q[0] - w.p[0], w.q[1] - w.p[1]), t = ((q[0] - w.p[0]) * (w.q[0] - w.p[0]) + (q[1] - w.p[1]) * (w.q[1] - w.p[1])) / (L * L);
        return t > -0.01 && t < 1.01 && Math.abs((q[0] - w.p[0]) * (w.q[1] - w.p[1]) - (q[1] - w.p[1]) * (w.q[0] - w.p[0])) / L < 0.05; })());
      if (host) { const L = Math.hypot(host.q[0] - host.p[0], host.q[1] - host.p[1]), a = Math.hypot(q[0] - host.p[0], q[1] - host.p[1]); addAt(host.p, (P * (L - a)) / L); addAt(host.q, (P * a) / L); }
      else addAt(q, P);
    }
    return { pts: pts.map((x) => ({ ...x, P: Math.round(x.P) })), total: pts.reduce((s, x) => s + x.P, 0) };
}
