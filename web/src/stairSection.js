// Stair sections for one drawn stair (app panel, report, DXF sheet): the data of the project → engine/stairDetail.js models.
// A straight stair = one section; a stair with a landing = two ("ช่วงที่ 1" foot → landing, "ช่วงที่ 2" landing → floor), as on the
// user's sheet ST-1. The supports are the beams really drawn there (type size / bars from the analysis), else a typical 0.20 × 0.40.
import { stairDetailModel } from "../engine/stairDetail.js";
import { parseBars } from "../engine/floor.js";
import { designSlabs } from "../engine/slabDesign.js";
import { elevations } from "./StoreyTable.jsx";
import { stairGeom, stairRiseOf } from "./StairPanel.jsx";

const segDist = (p, a, b) => { const d = [b[0] - a[0], b[1] - a[1]], L2 = d[0] ** 2 + d[1] ** 2 || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * d[0] + (p[1] - a[1]) * d[1]) / L2)); return Math.hypot(p[0] - a[0] - d[0] * t, p[1] - a[1] - d[1] * t); };
const BAR_D = { "DB 10": 0.01, "DB 12": 0.012, "DB 16": 0.016, "DB 20": 0.02, "DB 25": 0.025, "RB 6": 0.006, "RB 9": 0.009 };

// the head / foot edges of the stair rectangle (as engine/floor.js analyzeFloor)
export function stairEdges(st) {
  const x0 = Math.min(st.a[0], st.b[0]), x1 = Math.max(st.a[0], st.b[0]), y0 = Math.min(st.a[1], st.b[1]), y1 = Math.max(st.a[1], st.b[1]);
  const ax = st.up?.[1] ?? "x", pos = st.up?.[0] !== "-";
  return ax === "x" ? { start: pos ? [[x0, y0], [x0, y1]] : [[x1, y0], [x1, y1]], end: pos ? [[x1, y0], [x1, y1]] : [[x0, y0], [x0, y1]] }
    : { start: pos ? [[x0, y0], [x1, y0]] : [[x0, y1], [x1, y1]], end: pos ? [[x0, y1], [x1, y1]] : [[x0, y0], [x1, y0]] };
}
// the beam of a floor under an edge (its middle within half the beam width + 5 cm), with its analysed type
function beamUnder(frame, res, k, edge, mid = false) {
  const fl = frame.floors[k], an = res?.floors?.[k]; if (!fl) return null;
  const m = [(edge[0][0] + edge[1][0]) / 2, (edge[0][1] + edge[1][1]) / 2];
  const types = frame.beamTypes ?? [];
  let best = null;
  (fl.beams ?? []).forEach((b, i) => {
    if (!!b.lvl !== mid) return;
    const t = types[an?.beamTypeOf?.[i] ?? b.type], w = t?.b ?? 0.2, d = segDist(m, b.a, b.b);
    if (d <= w / 2 + 0.05 && (!best || d < best.d)) best = { d, t };
  });
  if (!best) return null;
  const t = best.t ?? { name: "", b: 0.2, h: 0.4 }, top = parseBars(t.top), bot = parseBars(t.bot);
  return { name: t.name ?? "", b: t.b ?? 0.2, h: t.h ?? 0.4, bars: { d: BAR_D[(bot ?? top)?.bar] ?? 0.012, top: top?.n ?? 2, bot: bot?.n ?? 2 } };
}

// [{ title, model }] for stair si of floor k
export function stairSections(frame, res, k, si, opt = {}) {
  const fl = frame.floors[k], st = fl?.stairs?.[si]; if (!st || st.kind === "side" || st.kind === "cant") return []; // spanning across the width: another bar layout (not drawn yet)
  const an = res?.floors?.[k], r0 = an?.stairs?.[si], H = stairRiseOf(frame, k, st), g = stairGeom(st, H, r0);
  const row = an ? designSlabs(an, fl, frame.mat ?? {}).find((x) => x.kind === "ST" && x.si === si) : null;
  const mat = frame.mat ?? {}, cover = (mat.coverSlab ?? 2) / 100;
  const main = row?.r?.mainText ?? `${st.mainBar ?? "DB 12"} @ 0.15`, temp = row?.r?.tempText ?? "RB 9 @ 0.20";
  const lvName = (n) => String(n ?? "").replace(/\s*[+−-]?\d+\.\d+\s*$/, ""), E = stairEdges(st), zTop = elevations(frame)[k], zFoot = zTop - H;
  const head = beamUnder(frame, res, k, E.end) ?? { name: "", b: 0.2, h: 0.4, bars: { d: 0.012, top: 2, bot: 2 } };
  const footB = r0?.foot === "beam" && k > 0 ? beamUnder(frame, res, k - 1, E.start) : null;
  const foot = r0?.foot === "beam" ? "beam" : r0?.foot === "panel" ? "panel" : r0?.foot === "none" ? "none" : "ground";
  const t = st.t ?? 0.12, tag = opt.tag ?? stairTag(frame, k, si), below = k > 0 ? lvName(frame.floors[k - 1].name) : "ดิน";
  const base = { R: g.Ra, T: g.T, t, cover, main, temp, stepBar: temp, slabT: fl.t > 0 ? fl.t : 0.1, footBeam: footB ?? { b: 0.2, h: 0.4, name: "" } };
  if (st.kind === "landing") {
    const n1 = Math.ceil(g.n / 2), n2 = g.n - n1, zL = zFoot + n1 * g.Ra;
    // U-stair: flight 2 comes back and arrives over the START edge on this floor (engine/floor.js: half of the start edge → this floor)
    const landF = beamUnder(frame, res, k, E.end, true), landB = landF ?? { name: "ชานพัก", b: 0.15, h: 0.35, bars: { d: 0.012, top: 2, bot: 2 } };
    const headF = beamUnder(frame, res, k, E.start), head2 = headF ?? head;
    const note = [!landF && "ยังไม่ได้วาดคานชานพักในโครงสร้าง — รูปใช้ขนาดสมมติ 15×35 (น้ำหนักชานพักฝากตามที่ตั้งไว้ในแผงบันได)", !headF && !beamUnder(frame, res, k, E.end) && "ไม่พบคานหัวบันได — รูปใช้ขนาดสมมติ 20×40"].filter(Boolean).join(" · ");
    return [
      { title: `รูปตัดบันได ${tag} ช่วงที่ 1`, note, model: stairDetailModel({ ...base, n: n1, Lt: Math.max(0.6, g.land || 1.0), tl: Math.max(t, 0.12), head: landB, foot: footB ? "beam" : foot,
        zFoot, zTop: zL, footLevelName: `ระดับต้นบันได (${below})`, topLevelName: "ระดับพื้นชานพักบันได", title: `รูปตัดบันได ${tag} ช่วงที่ 1` }) },
      { title: `รูปตัดบันได ${tag} ช่วงที่ 2`, note, model: stairDetailModel({ ...base, n: Math.max(2, n2), Lt: 0, head: head2, foot: "beam", footBeam: landB,
        zFoot: zL, zTop, footLevelName: "ระดับพื้นชานพักบันได", topLevelName: `ระดับ${lvName(fl.name)}`, title: `รูปตัดบันได ${tag} ช่วงที่ 2` }) },
    ];
  }
  return [{ title: `รูปตัดบันได ${tag}`, note: beamUnder(frame, res, k, E.end) ? "" : "ไม่พบคานหัวบันได — รูปใช้ขนาดสมมติ 20×40", model: stairDetailModel({ ...base, n: g.n, Lt: 0, head, foot: footB ? "beam" : foot === "beam" ? "panel" : foot,
    zFoot, zTop, footLevelName: `ระดับต้นบันได (${below})`, topLevelName: `ระดับ${lvName(fl.name)}`, title: `รูปตัดบันได ${tag}` }) }];
}

// ST-n numbered over the whole project, bottom floor first
export const stairTag = (frame, k, si) => `ST-${frame.floors.slice(0, k).reduce((a, f) => a + (f.stairs?.length ?? 0), 0) + si + 1}`;
export const allStairSections = (frame, res) => frame.floors.flatMap((f, k) => (f.stairs ?? []).flatMap((_, si) => stairSections(frame, res, k, si)));
