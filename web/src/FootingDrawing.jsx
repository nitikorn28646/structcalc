// Footing detail figure (plan + section ก–ก) = the same drawing as the DXF sheet (engine/footingDetail.js via src/footingDxf.js)
import { useMemo } from "react";
import { footingDetailFor } from "./footingDxf.js";
import { stairSvgString } from "./stairSvg.js";

export function FootingDrawing({ frame, res, f, mark = "", px = 200, className = "" }) {
  const html = useMemo(() => { const m = f?.r && f.inp ? footingDetailFor(frame, res, f, mark) : null; return m ? stairSvgString(m, { px }) : ""; }, [frame, res, f, mark, px]);
  if (!html) return null;
  return <div className={`[&_svg]:mx-auto [&_svg]:h-full [&_svg]:w-auto [&_svg]:max-w-full ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
