// The wall type / height the next drawn wall takes (user 2026-11-19), shared by the plan toolbar (FloorBoard) and the wall-type panel
// (WallTypesPanel): kept per browser in localStorage structcalc.wallDraw, kept in step across components with a window event.
import { useEffect, useState } from "react";

const KEY = "structcalc.wallDraw", EV = "structcalc:wallDraw";
const read = () => { try { return { auto: true, h: 3, ...JSON.parse(localStorage.getItem(KEY) || "{}") }; } catch { return { auto: true, h: 3 }; } };

export function useWallDraw() {
  const [w, setW] = useState(read);
  useEffect(() => { const f = () => setW(read()); window.addEventListener(EV, f); return () => window.removeEventListener(EV, f); }, []);
  const set = (p) => { const n = { ...read(), ...p }; try { localStorage.setItem(KEY, JSON.stringify(n)); } catch { /* ignore */ } setW(n); window.dispatchEvent(new Event(EV)); };
  return [w, set];
}
