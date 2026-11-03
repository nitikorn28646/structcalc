// Point highlight shared by the tables and the views (user: pointing at a row must show where it is on the plan / in 3D):
// highlight({ p: [x, y], to?: [x, y] }) from a table row, useHighlight() in the plan boards and the 3D view.
import { useEffect, useState } from "react";
export const highlight = (h) => window.dispatchEvent(new CustomEvent("sc-highlight", { detail: h }));
export function useHighlight() {
  const [h, setH] = useState(null);
  useEffect(() => { const f = (e) => setH(e.detail); window.addEventListener("sc-highlight", f); return () => window.removeEventListener("sc-highlight", f); }, []);
  return h;
}
