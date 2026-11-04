// Program brand (user 2026-11-04: "เปลี่ยนชื่อโปรแกรมเป็นของผม … ใส่รูปผม"): name shown in the app, the browser tab and the reports.
// The owner's photo and signature are uploaded once in the app (logo → "เจ้าของโปรแกรม") and kept in this browser
// (localStorage structcalc.brand {photo, sig} as small data URLs); the signature also prints on the cover and every report page.
import { useEffect, useState } from "react";
export const BRAND = { name: "โครงสร้างไทย", by: "by นิธิกร", full: "โครงสร้างไทย by นิธิกร", en: "Khrongsang Thai by Nitikorn" };
const KEY = "structcalc.brand";
export const loadBrand = () => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}") ?? {}; } catch { return {}; } };
export const saveBrand = (b) => { try { localStorage.setItem(KEY, JSON.stringify(b)); } catch { /* storage full / blocked */ } window.dispatchEvent(new Event("sc-brand")); };
export function useBrand() {
  const [b, setB] = useState(loadBrand);
  useEffect(() => { const f = () => setB(loadBrand()); window.addEventListener("sc-brand", f); return () => window.removeEventListener("sc-brand", f); }, []);
  return b;
}
// picture file → data URL, longest side ≤ max px (photo JPEG; signature PNG keeps its transparent background)
export function imageToDataUrl(file, max = 320, type = "image/jpeg") {
  return new Promise((ok, bad) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const s = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement("canvas"); c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); ok(c.toDataURL(type, 0.85)); };
    img.onerror = () => { URL.revokeObjectURL(url); bad(new Error("อ่านรูปไม่ได้")); };
    img.src = url;
  });
}
