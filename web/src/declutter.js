// Plan labels that would overlap (user 2026-11-03: "มันซ้อน … แก้ให้หมด ไม่ว่าจะอยู่หน้าไหน"): after each render, the SVG <text>
// labels are placed greedily — larger / bolder first, then in drawing order — and a label that would cover one already placed
// is hidden until the user zooms in (every render measures again). Labels marked data-keep (grid bubbles) are always shown.
import { useLayoutEffect } from "react";

export function declutter(svg) {
  if (!svg) return;
  const all = [...svg.querySelectorAll("text")];
  for (const t of all) t.style.visibility = "";
  const pri = (t) => (t.hasAttribute("data-keep") ? 1e6 : 0) + (parseFloat(t.getAttribute("font-size")) || 10) * (Number(t.getAttribute("font-weight")) >= 600 ? 1.3 : 1);
  const items = all.map((t, i) => ({ t, i, p: pri(t), r: t.getBoundingClientRect() })).filter((x) => x.r.width > 0 && x.r.height > 0)
    .sort((a, b) => b.p - a.p || a.i - b.i);
  const placed = [];
  for (const x of items) {
    const r = { l: x.r.left + 1, t: x.r.top + 1, r: x.r.right - 1, b: x.r.bottom - 1 };
    if (!x.t.hasAttribute("data-keep") && placed.some((q) => r.l < q.r && r.r > q.l && r.t < q.b && r.b > q.t)) { x.t.style.visibility = "hidden"; continue; }
    placed.push(r);
  }
}

// run after every render of the board that owns `ref` (cheap: a few hundred labels)
export function useDeclutter(ref) {
  useLayoutEffect(() => { declutter(ref.current); });
}
