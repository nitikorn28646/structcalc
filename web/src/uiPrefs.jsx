// Display preferences kept per browser (not in the project): plan text size. useTextScale() → [scale, setScale]; every board
// listening updates at once. Scale 0.6 – 2.5, default 1.
import { useEffect, useState } from "react";
const KEY = "structcalc.textScale";
const read = () => { try { return Math.min(2.5, Math.max(0.6, Number(localStorage.getItem(KEY)) || 1)); } catch { return 1; } };
export function useTextScale() {
  const [v, setV] = useState(read);
  useEffect(() => { const f = () => setV(read()); window.addEventListener("sc-textscale", f); return () => window.removeEventListener("sc-textscale", f); }, []);
  const set = (x) => { try { localStorage.setItem(KEY, String(Math.min(2.5, Math.max(0.6, +x.toFixed(2))))); } catch { /* ignore */ } window.dispatchEvent(new Event("sc-textscale")); };
  return [v, set];
}
// small A− / A+ control for a toolbar
export function TextSizeControl({ className = "" }) {
  const [v, set] = useTextScale(), b = "h-7 rounded-md px-2 text-[12px] font-semibold text-gray-600 ring-1 ring-gray-200 hover:bg-gray-50";
  return (
    <span className={`inline-flex items-center gap-1 ${className}`} title="ขนาดตัวหนังสือบนแปลน (จำไว้ในเครื่องนี้)">
      <button onClick={() => set(v - 0.15)} className={b}>A−</button>
      <span className="w-10 text-center text-[11px] tabular-nums text-gray-500">{Math.round(v * 100)}%</span>
      <button onClick={() => set(v + 0.15)} className={b}>A+</button>
    </span>
  );
}
