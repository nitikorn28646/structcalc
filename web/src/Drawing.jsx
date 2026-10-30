import { toSvg } from "./drawings.js";

// Renders a Maker.js model as responsive inline SVG.
export default function Drawing({ model, className = "", fontSize, width }) {
  return <div className={`drawing ${className}`} dangerouslySetInnerHTML={{ __html: toSvg(model, fontSize, width) }} />;
}
