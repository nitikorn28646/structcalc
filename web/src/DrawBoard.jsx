// Large drawing workspace: walls → columns → wall plates → interior plates, all by clicking on a snapped grid.
// Nothing is drawn automatically; each layer has an "auto" button that only runs when pressed.
import { useDeclutter } from "./declutter.js";
import { useEffect, useRef, useState } from "react";
import { CircleDot, Columns3, Eraser, FileUp, GitCommitHorizontal, Hand, Magnet, MousePointer2, Redo2, Ruler, Square, Undo2, Wand2 } from "lucide-react";
import { fmt } from "./beamModel.js";
import { autoInnerPlates } from "../engine/roofMembers.js";
import { LINE_COLORS } from "./Roof3D.jsx";
import { guessRole, parseDxf, roof3d, roof3dPatch, toPlan } from "./dxfImport.js";
import { splitPlates } from "./RoofPage.jsx";
import { useHighlight } from "./highlight.js";
import { TextSizeControl, useTextScale } from "./uiPrefs.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { findOverlaps, mergeOverlaps } from "../engine/floor.js";

const TOOLS = [
  ["select", "เลือก/ย้าย", MousePointer2, "คลิกเลือกเพื่อแก้ตัวเลข · ลากกรอบที่ว่าง = เลือกหลายชิ้น แล้วกด Delete ลบ (Shift+ลาก = เลื่อนแปลน) · ลากมุมผนัง เสา ดั้ง เพื่อย้าย · คลิกเส้นก่อนแล้วลากปลายเส้น · ลากพื้นที่ว่างเพื่อเลื่อนภาพ · หมุนล้อเมาส์เพื่อซูม"],
  ["wall", "1 ผนัง", Square, "คลิกทีละมุม · คลิกจุดแรกหรือดับเบิลคลิกเพื่อปิดรูป (ร่างใหม่ทับของเดิม) · คลิกป้ายกลางขอบเพื่อสลับ ปั้นหยา/จั่ว"],
  ["column", "2 เสา", Columns3, "คลิกวางเสา (ดูดเข้ามุมผนัง/แนวผนัง/กริด)"],
  ["plate", "3 อะเส", Ruler, "คลิกต้น → ปลาย ต่อเส้นได้ · Esc/คลิกขวา จบ · เส้นบนขอบหลังคา = อะเส · เส้นข้างใน = อะเสรับดั้ง (โปรแกรมแยกให้เอง ไม่ต้องเลือก)"],
  ["dang", "ดั้ง", CircleDot, "คลิกวางดั้ง (ดูดเข้าแนวอกไก่/โหนด) · ลบด้วยเครื่องมือลบ · ย้ายด้วยเครื่องมือเลือก"],
  ["support", "สะพาน", GitCommitHorizontal, "สะพานรับจันทัน: คลิกต้น → ปลาย (ล็อคแกน) · ต่อเส้นต่อได้ · Esc จบเส้น"],
  ["erase", "ลบ", Eraser, "คลิกเสา อะเส หรืออะเสรับดั้งที่ต้องการลบ"],
];
const PLATE = "#465fff", INNER = "#f79009", COL = "#1d2939", SUP = "#7a5af8";

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return { d: Math.hypot(a[0] + dx * t - p[0], a[1] + dy * t - p[1]), q: [a[0] + dx * t, a[1] + dy * t] };
}

// grid from the distinct wall-corner coordinates (each corner then sits on a grid node)
function autoGrid(pts) {
  const u = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((x, y) => x - y), xs = u(pts.map((p) => p[0])), ys = u(pts.map((p) => p[1]));
  const gaps = (v) => v.slice(1).map((x, i) => +(x - v[i]).toFixed(3));
  return { x0: xs[0], y0: ys[0], dx: gaps(xs), dy: gaps(ys), sub: 1 };
}

export default function DrawBoard({ roof, set, g, fr, loose = [], modeBar, dark, onFromFrame = null, plateMembers = [] }) {
  const svg = useRef(null), [tool, setTool] = useState("column"), [ortho, setOrtho] = useState(true), [snapOn, setSnapOn] = useState(true);
  useDeclutter(svg); // overlapping plan labels hidden until zoomed in
  const [start, setStart] = useState(null), [draft, setDraft] = useState([]), [cur, setCur] = useState(null), [drag, setDrag] = useState(null);
  // box selection like the structure board: drag on empty space with the select tool; Delete removes the selection
  const hl = useHighlight(), [tScale] = useTextScale();
  const [box, setBox] = useState(null), [multi, setMulti] = useState([]), [menu, setMenu] = useState(null), [askClear, setAskClear] = useState(false);
  const [pick, setPick] = useState(null), [dims, setDims] = useState(true); // selected item {key, i} for the number panel; column dimensions on plates
  const [hist, setHist] = useState({ undo: [], redo: [] }), [typed, setTyped] = useState(""), lastRaw = useRef(null), [imp, setImp] = useState(null);
  const cols = roof.columns ?? [], plates = roof.plates ?? [], inner = roof.innerPlates ?? [];
  // plates drawn with the one tool: shown as wall plate / interior plate by where they lie (same rule as the design)
  const innerSet = new Set(splitPlates(roof).innerPlates), autoWallPlates = roof.pts?.length > 2 && !splitPlates(roof).plates.length; // none drawn on the outline → the program puts them on every edge
  // guide from the structure (faint): outline + beams of the linked floor, to trace the roof; snapped to like any line
  const guide = roof.guide ?? null, guideSegs = guide ? [...(guide.beams ?? []).map((b) => [b.a, b.b, "แนวคาน (แปลนโครงสร้าง)"]), ...(guide.outline ?? []).map((a, i, P) => [a, P[(i + 1) % P.length], "ขอบอาคาร"])] : [];
  const sups = (roof.supports ?? fr?.supports ?? []).map((s) => ({ a: [+s.a[0].toFixed(3), +s.a[1].toFixed(3)], b: [+s.b[0].toFixed(3), +s.b[1].toFixed(3)] })), supAuto = !roof.supports;
  const posts = fr?.posts.filter((p) => p.kind === "ดั้ง") ?? [], dangList = roof.dang ?? posts.map((p) => [+p.x.toFixed(3), +p.y.toFixed(3)]);
  const ridgeSegs = (g?.lines ?? []).filter((l) => l.type === "ridge" || l.type === "hip" || l.type === "valley").map((l) => [[l.p[0], l.p[1]], [l.q[0], l.q[1]], "แนวอกไก่/ตะเข้"]);
  // view box in model metres (y up): fit the eave once, then free pan / zoom
  const fit = () => {
    const P = g?.eave ?? (roof.pts?.length ? roof.pts : [[0, 0], [12, 10]]), xs = P.map((p) => p[0]), ys = P.map((p) => p[1]), pad = 2;
    const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
    return { x: x0, y: y0, w: Math.max(...xs) - x0 + pad, h: Math.max(...ys) - y0 + pad };
  };
  const [vb, setVb] = useState(fit);
  // structural grid (STAAD-style): axis spacings → grid lines A, B, … / 1, 2, …, optional subdivision of every bay
  // an empty roof (new project) gets a 12 × 10 m working area until walls are drawn / imported
  const G = roof.grid ?? (roof.pts?.length >= 3 ? autoGrid(roof.pts) : { x0: 0, y0: 0, dx: [4, 4, 4], dy: [5, 5], sub: 1 }), nsub = G.sub || 1;
  const axis = (o, ds) => ds.reduce((a, d) => [...a, +(a[a.length - 1] + d).toFixed(4)], [o]);
  const GX = axis(G.x0, G.dx), GY = axis(G.y0, G.dy);
  const subdiv = (P) => P.flatMap((v, i) => (i ? Array.from({ length: nsub }, (_, k) => +(P[i - 1] + ((v - P[i - 1]) * (k + 1)) / nsub).toFixed(4)) : [v]));
  // extra grid lines at any coordinate (plates or columns off the main axes)
  const merge = (A, extra = []) => [...new Set([...A, ...extra.map((v) => +(+v).toFixed(4))])].sort((p, q) => p - q);
  // spare grid lines through every ดั้ง, X and Y (user 2026-11-04: drawing plates to the posts needed extra grid lines by hand)
  const [dangGrid, setDangGrid] = useState(true), dX = dangGrid ? dangList.map((p) => p[0]) : [], dY = dangGrid ? dangList.map((p) => p[1]) : [];
  const SX = merge(subdiv(GX), [...(G.ax ?? []), ...dX]), SY = merge(subdiv(GY), [...(G.ay ?? []), ...dY]);
  // overlapping plates (drawn twice / one inside another), like overlapping beams: wall plates and interior plates each
  const ovP = findOverlaps(plates), ovI = findOverlaps(inner), ovN = ovP.length + ovI.length;
  const xName = (i) => String.fromCharCode(65 + i), yName = (i) => String(GY.length - i); // 1 at the top, like the drawings
  const nodeName = (p) => { const i = GX.findIndex((x) => Math.abs(x - p[0]) < 1e-6), j = GY.findIndex((y) => Math.abs(y - p[1]) < 1e-6); return i >= 0 && j >= 0 ? `โหนด ${xName(i)}-${yName(j)}` : `โหนด (${fmt(p[0], 2)}, ${fmt(p[1], 2)})`; };
  const setGrid = (patch) => set("grid", { ...G, ...patch });
  const px = () => vb.w / (svg.current?.clientWidth || 1000); // metres per screen pixel
  const toModel = (e) => {
    const p = svg.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.current.getScreenCTM().inverse());
    return [q.x, -q.y];
  };

  // ---- state changes with undo
  const snapshot = () => ({ pts: roof.pts, edges: roof.edges, columns: roof.columns ?? null, plates: roof.plates ?? null, innerPlates: roof.innerPlates ?? null, dang: roof.dang ?? null, supports: roof.supports ?? null });
  const commit = (patch) => {
    setHist((h) => ({ undo: [...h.undo.slice(-50), snapshot()], redo: [] }));
    for (const [k, v] of Object.entries(patch)) set(k, v);
  };
  const restore = (from, to) => {
    if (!hist[from].length) return;
    const s = hist[from][hist[from].length - 1];
    setHist((h) => ({ [from]: h[from].slice(0, -1), [to]: [...h[to], snapshot()] }));
    for (const [k, v] of Object.entries(s)) set(k, v);
  };

  // ---- snapping: columns, plate ends, wall corners, posts, crossings of walls / plates, points on lines, then grid
  const wallSegs = roof.pts.map((a, i) => [a, roof.pts[(i + 1) % roof.pts.length], "แนวผนัง"]);
  const allSegs = [...wallSegs, ...plates.map((l) => [l.a, l.b]), ...inner.map((l) => [l.a, l.b]), ...sups.map((l) => [l.a, l.b]), ...ridgeSegs, ...guideSegs], crossings = [];
  for (let i = 0; i < allSegs.length; i++) for (let j = i + 1; j < allSegs.length; j++) {
    const [a, b] = allSegs[i], [c, e] = allSegs[j], rx = b[0] - a[0], ry = b[1] - a[1], sx = e[0] - c[0], sy = e[1] - c[1], den = rx * sy - ry * sx;
    if (Math.abs(den) < 1e-12) continue;
    const t = ((c[0] - a[0]) * sy - (c[1] - a[1]) * sx) / den, u = ((c[0] - a[0]) * ry - (c[1] - a[1]) * rx) / den;
    if (t > -1e-6 && t < 1 + 1e-6 && u > -1e-6 && u < 1 + 1e-6) crossings.push([a[0] + rx * t, a[1] + ry * t]);
  }
  // where grid lines cross walls, plates, beams and ridges (e.g. a ดั้ง on the ridge at grid line x = 8.75)
  for (const [a, b] of allSegs) {
    for (const x of SX) { const dx = b[0] - a[0]; if (Math.abs(dx) > 1e-9) { const t = (x - a[0]) / dx; if (t > 1e-6 && t < 1 - 1e-6) crossings.push([x, +(a[1] + (b[1] - a[1]) * t).toFixed(4)]); } }
    for (const y of SY) { const dy = b[1] - a[1]; if (Math.abs(dy) > 1e-9) { const t = (y - a[1]) / dy; if (t > 1e-6 && t < 1 - 1e-6) crossings.push([+(a[0] + (b[0] - a[0]) * t).toFixed(4), y]); } }
  }
  const snap = (raw, from, forceOrtho) => {
    let p = raw;
    if ((ortho || forceOrtho) && from) p = Math.abs(raw[0] - from[0]) >= Math.abs(raw[1] - from[1]) ? [raw[0], from[1]] : [from[0], raw[1]];
    if (!snapOn) return { p, kind: null };
    const r = 22 * px(), axis = (ortho || forceOrtho) && from ? (Math.abs(p[1] - from[1]) < 1e-9 ? 1 : 0) : -1; // -1 free, 1 horizontal, 0 vertical
    const keep = (q) => (axis < 0 ? q : axis === 1 ? [q[0], from[1]] : [from[0], q[1]]); // stay on the locked axis
    const pts = [...cols.map((c) => [c, "เสา"]), ...plates.flatMap((l) => [[l.a, "ปลายอะเส"], [l.b, "ปลายอะเส"]]), ...roof.pts.map((c) => [c, "มุมผนัง"]),
      ...inner.flatMap((l) => [[l.a, "ปลายอะเสรับดั้ง"], [l.b, "ปลายอะเสรับดั้ง"]]), ...posts.map((c) => [[c.x, c.y], "ดั้ง"]), ...crossings.map((c) => [c, "จุดตัด"]),
      ...ridgeSegs.flatMap(([a, b]) => [[a, "ปลายอกไก่/ตะเข้"], [b, "ปลายอกไก่/ตะเข้"]]), ...SX.flatMap((x) => SY.map((y) => [[x, y], null]))];
    let best = null;
    for (const [c, kind] of pts) { const q = keep(c), d = dist(q, p); if (d < r && dist(q, c) < r && (!best || d < best.d - 1e-9)) best = { d, p: axis < 0 ? c : q, kind: kind ?? nodeName(c) }; }
    if (best) return best;
    if (axis >= 0) { // locked axis: where it meets walls, plates, beams, ridges and grid lines
      let hit = null;
      const take = (q, kind) => { const dd = dist(q, p); if (dd < r && (!hit || dd < hit.d)) hit = { d: dd, p: q, kind }; };
      for (const [a, b, kind] of [...guideSegs, ...wallSegs, ...plates.map((l) => [l.a, l.b, "แนวอะเส"]), ...inner.map((l) => [l.a, l.b, "แนวอะเสรับดั้ง"]), ...sups.map((l) => [l.a, l.b, "แนวสะพาน"]), ...ridgeSegs]) {
        const den = axis === 1 ? b[1] - a[1] : b[0] - a[0];
        if (Math.abs(den) < 1e-9) continue;
        const t = axis === 1 ? (from[1] - a[1]) / den : (from[0] - a[0]) / den;
        if (t >= -1e-6 && t <= 1 + 1e-6) take([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], `ชน${kind ?? "แนวอกไก่/ตะเข้"}`);
      }
      for (const v of axis === 1 ? SX : SY) take(axis === 1 ? [v, from[1]] : [from[0], v], "ชนเส้นกริด");
      if (hit) return hit;
    }
    return { p: null, kind: "ไม่มีโหนด — ขยับใกล้จุดตัดกริด" }; // nodes only, like STAAD's snap grid
  };
  const round = (p) => p.map((v) => +v.toFixed(3));

  // ---- pointer handling
  const lineTool = tool === "plate" || tool === "inner" || tool === "support";
  const onMove = (e) => {
    if (drag?.box) { const raw0 = toModel(e); setBox((b) => b && { ...b, p1: raw0 }); return; }
    const raw = toModel(e);
    lastRaw.current = raw;
    if (drag?.pan) { const k = px(); setVb((v) => ({ ...v, x: drag.vb.x - (e.clientX - drag.sx) * k, y: drag.vb.y + (e.clientY - drag.sy) * k })); return; }
    if (drag?.what) {
      const s = snap(raw).p;
      if (!s) return;
      const p = round(s);
      if (drag.what === "dang") set("dang", drag.list.map((v, i) => (i === drag.i ? p : v)));
      else if (drag.what === "pt") set("pts", roof.pts.map((v, i) => (i === drag.i ? p : v)));
      else if (drag.what === "line") set(drag.key, drag.list.map((l, i) => (i === drag.i ? { ...l, [drag.end]: p } : l)));
      else set("columns", cols.map((v, i) => (i === drag.i ? p : v)));
      return;
    }
    const from = lineTool ? start : tool === "wall" ? draft[draft.length - 1] : null;
    setCur(snap(raw, from, tool === "inner"));
  };
  // what lies under the pointer in the select tool: points and line ends can be dragged, a line body is only selected
  const LINES = { plates, innerPlates: inner, supports: sups };
  const grabAt = (raw, r) => {
    // a selected line: its ends come first (they usually sit on a column)
    const sl = pick && LINES[pick.key]?.[pick.i];
    for (const end of sl ? ["a", "b"] : []) if (dist(sl[end], raw) < r) return { sel: pick, drag: { what: "line", key: pick.key, i: pick.i, end, list: LINES[pick.key] } };
    const di = dangList.findIndex((c) => dist(c, raw) < r);
    if (di >= 0) return { sel: { key: "dang", i: di }, drag: { what: "dang", i: di, list: dangList } };
    const ci = cols.findIndex((c) => dist(c, raw) < r);
    if (ci >= 0) return { sel: { key: "columns", i: ci }, drag: { what: "col", i: ci } };
    for (const [key, list] of Object.entries(LINES)) for (let i = 0; i < list.length; i++) for (const end of ["a", "b"])
      if (dist(list[i][end], raw) < r) return { sel: { key, i }, drag: { what: "line", key, i, end, list } };
    const pi = roof.pts.findIndex((c) => dist(c, raw) < r);
    if (pi >= 0) return { sel: { key: "pts", i: pi }, drag: { what: "pt", i: pi } };
    for (const [key, list] of Object.entries(LINES)) { const i = list.findIndex((l) => segDist(raw, l.a, l.b).d < r); if (i >= 0) return { sel: { key, i } }; }
    return null;
  };
  const BOXL = { columns: [cols, (c) => [c]], dang: [dangList, (c) => [c]], plates: [plates, (l) => [l.a, l.b]], innerPlates: [inner, (l) => [l.a, l.b]], supports: [sups, (l) => [l.a, l.b]] };
  const endBox = () => {
    const b = box; setBox(null);
    if (!b || dist(b.p0, b.p1) < 3 * px()) return;
    const x0 = Math.min(b.p0[0], b.p1[0]), x1 = Math.max(b.p0[0], b.p1[0]), y0 = Math.min(b.p0[1], b.p1[1]), y1 = Math.max(b.p0[1], b.p1[1]), win = b.p1[0] >= b.p0[0];
    const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const hits = (P) => (win ? P.every(inside) : P.some(inside) || (P.length === 2 && [0.25, 0.5, 0.75].some((t) => inside([P[0][0] + (P[1][0] - P[0][0]) * t, P[0][1] + (P[1][1] - P[0][1]) * t]))));
    setMulti(Object.entries(BOXL).flatMap(([key, [list, pts]]) => list.map((o, i) => (hits(pts(o)) ? { key, i } : null)).filter(Boolean)));
  };
  const delItems = (list) => {
    const patch = {};
    for (const [key, [arr]] of Object.entries(BOXL)) { const ids = new Set(list.filter((x) => x?.key === key).map((x) => x.i)); if (ids.size) patch[key] = arr.filter((_, i) => !ids.has(i)); }
    if (Object.keys(patch).length) { commit(patch); setMulti([]); setPick(null); }
  };
  const onDown = (e) => {
    if (e.button === 2) { setStart(null); setDraft([]); if (tool === "select" && (multi.length || pick)) setMenu({ x: e.clientX, y: e.clientY }); return; }
    setMenu(null);
    const raw = toModel(e), r = 12 * px();
    if (e.button === 1 || tool === "select") {
      if (tool === "select" && e.button === 0) {
        const h = grabAt(raw, r);
        setPick(h?.sel ?? null);
        if (h?.drag) { setHist((x) => ({ undo: [...x.undo.slice(-50), snapshot()], redo: [] })); setDrag(h.drag); return; }
        if (!h && !e.shiftKey) { setMulti([]); setDrag({ box: true }); setBox({ p0: raw, p1: raw }); return; }
      }
      setDrag({ pan: true, sx: e.clientX, sy: e.clientY, vb }); return;
    }
    // snap from the click position itself (a click may arrive without a preceding move)
    const sp = tool === "erase" ? raw : snap(raw, lineTool ? start : tool === "wall" ? draft[draft.length - 1] : null, tool === "inner").p;
    if (!sp) return;
    if (tool !== "erase") return place(round(sp), r);
    const di = dangList.findIndex((c) => dist(c, raw) < r);
    if (di >= 0) return commit({ dang: dangList.filter((_, i) => i !== di) });
    const ci = cols.findIndex((c) => dist(c, raw) < r);
    if (ci >= 0) return commit({ columns: cols.filter((_, i) => i !== ci) });
    const ii = inner.findIndex((l) => segDist(raw, l.a, l.b).d < r);
    if (ii >= 0) return commit({ innerPlates: inner.filter((_, i) => i !== ii) });
    const si = sups.findIndex((l) => segDist(raw, l.a, l.b).d < r);
    if (si >= 0) return commit({ supports: sups.filter((_, i) => i !== si) });
    const pi = plates.findIndex((l) => segDist(raw, l.a, l.b).d < r);
    if (pi >= 0) commit({ plates: plates.filter((_, i) => i !== pi) });
  };
  // put one point with the current tool (from a click or from a typed length)
  const place = (p, r = 0.05) => {
    if (tool === "column") { if (!cols.some((c) => dist(c, p) < 0.05)) commit({ columns: [...cols, p] }); return; }
    if (tool === "dang") { if (!dangList.some((c) => dist(c, p) < 0.05)) commit({ dang: [...dangList, p] }); return; }
    if (lineTool) {
      if (!start) { setStart(p); return; }
      if (dist(start, p) < 0.1) return;
      const key = { plate: "plates", inner: "innerPlates", support: "supports" }[tool], list = { plate: plates, inner, support: sups }[tool];
      commit({ [key]: [...list, { a: start, b: p }] });
      setStart(tool === "inner" ? null : p); // plates and supports chain on, interior plates are single lines
    } else if (tool === "wall") {
      if (draft.length >= 3 && dist(draft[0], p) < r) return closeWall();
      setDraft([...draft, p]);
    }
  };
  // typed length (CAD-style direct distance): after the first point type e.g. 2.35 then Enter;
  // the point goes that far from the last point towards the mouse, along the locked axis
  const typedPoint = () => {
    const from = lineTool ? start : tool === "wall" ? draft[draft.length - 1] : null, L = parseFloat(typed), m = lastRaw.current;
    if (!from || !(L > 0) || !m) return null;
    let v = [m[0] - from[0], m[1] - from[1]];
    if (ortho || tool === "inner") v = Math.abs(v[0]) >= Math.abs(v[1]) ? [Math.sign(v[0]) || 1, 0] : [0, Math.sign(v[1]) || 1];
    const n = Math.hypot(...v) || 1;
    return round([from[0] + (v[0] / n) * L, from[1] + (v[1] / n) * L]);
  };  const closeWall = () => {
    if (draft.length < 3) return;
    commit({ pts: draft, edges: draft.map(() => ({ type: "hip" })), supports: null });
    setDraft([]);
  };
  useEffect(() => {
    const k = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      const drawing = (lineTool && start) || (tool === "wall" && draft.length);
      if (e.key === "Escape") { if (!start && !draft.length && !typed && tool !== "select") setTool("select"); setStart(null); setDraft([]); setTyped(""); setMulti([]); setMenu(null); } // a second Esc = back to select
      else if ((e.ctrlKey || e.metaKey) && (e.code === "KeyA" || e.key.toLowerCase() === "a")) { e.preventDefault(); setTool("select"); setMulti(Object.entries(BOXL).flatMap(([key, [list]]) => list.map((_, i) => ({ key, i })))); }
      else if (!drawing && (e.key === "Delete" || e.key === "Backspace") && (multi.length || pick)) { e.preventDefault(); delItems(multi.length ? multi : [pick]); }
      else if (drawing && /^[0-9.]$/.test(e.key)) setTyped((t) => t + e.key);
      else if (drawing && e.key === "Backspace") setTyped((t) => t.slice(0, -1));
      else if (e.key === "Enter" && typed) { const p = typedPoint(); setTyped(""); if (p) place(p); }
      else if (e.key === "Enter" && tool === "wall") closeWall();
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  });
  const onWheel = (e) => {
    const m = toModel(e), f = e.deltaY > 0 ? 1.15 : 1 / 1.15;
    setVb((v) => ({ x: m[0] - (m[0] - v.x) * f, y: m[1] - (m[1] - v.y) * f, w: v.w * f, h: v.h * f }));
  };
  useEffect(() => { // wheel must be non-passive to stop the page from scrolling
    const el = svg.current, h = (e) => e.preventDefault();
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  // ---- automatic layouts (only on request)
  const autoColumns = () => {
    const out = [];
    roof.pts.forEach((a, i) => {
      const b = roof.pts[(i + 1) % roof.pts.length], n = Math.max(1, Math.ceil(dist(a, b) / (roof.design?.plateSpan || 4) - 1e-9));
      for (let k = 0; k < n; k++) { const p = round([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]); if (!out.some((c) => dist(c, p) < 0.05)) out.push(p); }
    });
    commit({ columns: out });
  };
  const autoPlates = () => commit({ plates: roof.pts.map((a, i) => ({ a, b: roof.pts[(i + 1) % roof.pts.length] })) });
  const autoInner = () => g && fr && commit({ innerPlates: autoInnerPlates(g, fr) });

  // ---- drawing helpers (svg y = −y)
  const k = px(), S = (p) => `${p[0]},${-p[1]}`, ring = (P) => P.map(S).join(" ");
  // structural grid: axis lines dash-dot with bubbles (A, B… along X, 1, 2… along Y), subdivision lines faint
  // text grows with the drawing once zoomed in past the fit view (never smaller than at fit), times the user's text size
  const kFit = fit().w / (svg.current?.clientWidth || 1000), kt = Math.max(k, kFit) * tScale;
  const ext = { x0: Math.min(...SX) - 1.5, x1: Math.max(...SX) + 1.5, y0: Math.min(...SY) - 1.5, y1: Math.max(...SY) + 1.5 };
  const grid = [
    ...SX.filter((x) => !GX.some((v) => Math.abs(v - x) < 1e-6)).map((x, i) => <line key={`sx${i}`} x1={x} x2={x} y1={-ext.y1} y2={-ext.y0} strokeWidth={0.6 * k} />),
    ...SY.filter((y) => !GY.some((v) => Math.abs(v - y) < 1e-6)).map((y, i) => <line key={`sy${i}`} y1={-y} y2={-y} x1={ext.x0} x2={ext.x1} strokeWidth={0.6 * k} />),
  ];
  grid.push(...(G.ax ?? []).map((x, i) => <g key={`ax${i}`}><line x1={x} x2={x} y1={-ext.y1} y2={-ext.y0} stroke="#f79009" strokeOpacity={0.55} strokeWidth={1 * k} strokeDasharray={`${6 * k} ${4 * k}`} />
    <text x={x} y={-(ext.y0 - 14 * kt)} fontSize={10 * kt} textAnchor="middle" fill="#f79009" stroke="none">{fmt(x, 2)}</text></g>));
  grid.push(...(G.ay ?? []).map((y, i) => <g key={`ay${i}`}><line y1={-y} y2={-y} x1={ext.x0} x2={ext.x1} stroke="#f79009" strokeOpacity={0.55} strokeWidth={1 * k} strokeDasharray={`${6 * k} ${4 * k}`} />
    <text x={ext.x0 - 4 * kt} y={-y} fontSize={10 * kt} textAnchor="end" dominantBaseline="middle" fill="#f79009" stroke="none">{fmt(y, 2)}</text></g>));
  const bubble = (key, p, t) => (
    <g key={key}><circle cx={p[0]} cy={-p[1]} r={11 * kt} fill={dark ? "#181c30" : "#fff"} stroke={dark ? "#9097b1" : "#667085"} strokeWidth={1.2 * k} />
      <text data-keep="" x={p[0]} y={-p[1]} fontSize={11 * kt} textAnchor="middle" dominantBaseline="central" stroke="none" fill={dark ? "#cdd1e2" : "#344054"}>{t}</text></g>
  );
  const axes = [
    ...GX.flatMap((x, i) => [<line key={`gx${i}`} x1={x} x2={x} y1={-ext.y1} y2={-ext.y0} strokeWidth={1.1 * k} strokeDasharray={`${14 * k} ${4 * k} ${3 * k} ${4 * k}`} />,
      bubble(`bx${i}`, [x, ext.y1 + 12 * kt], xName(i))]),
    ...GY.flatMap((y, i) => [<line key={`gy${i}`} y1={-y} y2={-y} x1={ext.x0} x2={ext.x1} strokeWidth={1.1 * k} strokeDasharray={`${14 * k} ${4 * k} ${3 * k} ${4 * k}`} />,
      bubble(`by${i}`, [ext.x1 + 12 * kt, y], yName(i))]),
    ...GX.slice(1).map((x, i) => <text data-keep="" key={`dx${i}`} x={(x + GX[i]) / 2} y={-(ext.y1 - 4 * kt)} fontSize={10 * kt} textAnchor="middle" fill={dark ? "#9097b1" : "#667085"} stroke="none">{fmt(x - GX[i], 2)}</text>),
    ...GY.slice(1).map((y, i) => <text data-keep="" key={`dy${i}`} x={ext.x1 - 4 * kt} y={-(y + GY[i]) / 2} fontSize={10 * kt} textAnchor="end" dominantBaseline="middle" fill={dark ? "#9097b1" : "#667085"} stroke="none">{fmt(y - GY[i], 2)}</text>),
  ];
  const from = lineTool ? start : tool === "wall" ? draft[draft.length - 1] : null, live = cur?.p && from ? dist(from, cur.p) : null;
  const txt = (p, s, color, size = 12, anchor = "middle") => <text x={p[0]} y={-p[1]} fontSize={size * kt} fill={color} textAnchor={anchor} dominantBaseline="middle">{s}</text>;
  const btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1";
  const info = TOOLS.find((t) => t[0] === tool);

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3 p-4 md:p-5">
      {menu && <div className="fixed z-50 min-w-[170px] rounded-lg border border-gray-200 bg-white p-1 text-[13px] shadow-lg" style={{ left: menu.x, top: menu.y }} onPointerLeave={() => setMenu(null)}>
        <button onClick={() => { delItems(multi.length ? multi : [pick]); setMenu(null); }} className="block w-full rounded-md px-3 py-1.5 text-left text-red-600 hover:bg-red-50">ลบที่เลือก ({multi.length || 1})</button>
        <button onClick={() => { setMulti([]); setPick(null); setMenu(null); }} className="block w-full rounded-md px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50">ยกเลิกการเลือก</button>
      </div>}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gray-200 bg-white px-3 py-2">
        {TOOLS.map(([key, label, Icon]) => (
          <button key={key} onClick={() => { setTool(key); setStart(null); setDraft([]); }}
            className={`${btn} ${tool === key ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-gray-700 ring-gray-300 hover:bg-gray-50"}`}><Icon className="h-3.5 w-3.5" />{label}</button>
        ))}
        <button onClick={() => { if (!askClear) { setAskClear(true); setTimeout(() => setAskClear(false), 4000); return; }
            commit({ pts: [], edges: [], columns: [], plates: [], innerPlates: [], dang: [], supports: null }); setAskClear(false); setMulti([]); setPick(null); }}
          title="ลบผนัง เสา อะเส ดั้ง และสะพานทั้งหมดของหลังคา (ย้อนกลับได้ Ctrl+Z)" className={`${btn} ${askClear ? "bg-red-600 text-[#fff] ring-red-600" : "text-red-600 ring-red-200 hover:bg-red-50"}`}>{askClear ? "กดอีกครั้งเพื่อลบทั้งหมด" : "ลบทั้งหมด"}</button>
        <span className="mx-1 h-6 w-px bg-gray-200" />
        <TextSizeControl />
        <button onClick={() => setOrtho(!ortho)} className={`${btn} ${ortho ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}>ล็อคแกน X/Y</button>
        <button onClick={() => setSnapOn(!snapOn)} className={`${btn} ${snapOn ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}><Magnet className="h-3.5 w-3.5" />ล็อคโหนด</button>
        <button onClick={() => setDims(!dims)} className={`${btn} ${dims ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}>ระยะเสา</button>
        <select value={nsub} onChange={(e) => setGrid({ sub: Number(e.target.value) })} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2 text-xs">
          {[1, 2, 3, 4, 5].map((v) => <option key={v} value={v}>{v === 1 ? "โหนดเฉพาะแกน" : `แบ่งช่องละ ${v}`}</option>)}
        </select>
        <button onClick={() => setVb(fit())} title="พอดีจอ" className={`${btn} text-gray-600 ring-gray-300`}><Hand className="h-3.5 w-3.5" />พอดีจอ</button>
        <div className="ml-auto">{modeBar}</div>
      </div>

      <div className="grid min-h-0 flex-1 gap-3 xl:grid-cols-[1fr_260px]">
        <div className="relative min-h-[480px] overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <div className="absolute left-2 top-2 z-10 flex flex-wrap items-center gap-2 text-[12px]">
            <label className="flex items-center gap-1 rounded-md bg-white/90 px-2 py-0.5 ring-1 ring-gray-200"><input type="checkbox" checked={dangGrid} onChange={(e) => setDangGrid(e.target.checked)} />กริดสำรองผ่านดั้ง</label>
            {ovN > 0 && <span className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-red-700">อะเสซ้อนกัน {ovN} คู่ (เส้นแดงประ)
              <button onClick={() => commit({ ...(ovP.length ? { plates: mergeOverlaps(plates) } : {}), ...(ovI.length ? { innerPlates: mergeOverlaps(inner) } : {}) })} className="rounded bg-red-600 px-1.5 py-0.5 font-medium text-white">รวมอะเสซ้อน</button></span>}
          </div>
          <svg ref={svg} viewBox={`${vb.x} ${-(vb.y + vb.h)} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet"
            className={`h-full w-full select-none ${tool === "select" ? "cursor-grab" : "cursor-crosshair"}`}
            onPointerMove={onMove} onPointerDown={onDown} onPointerUp={() => { if (drag?.box) endBox(); setDrag(null); }} onPointerLeave={() => { setDrag(null); setCur(null); }}
            onDoubleClick={() => tool === "wall" && closeWall()} onContextMenu={(e) => e.preventDefault()} onWheel={onWheel}>
            <g stroke={dark ? "#323a5c" : "#e4e7ec"}>{grid}</g>
            <g stroke={dark ? "#6e7591" : "#98a2b3"}>{axes}</g>
            {g && <polygon points={ring(g.eave)} fill={dark ? "#7b8cff0d" : "#465fff08"} stroke="#8b8d98" strokeWidth={1.2 * k} strokeDasharray={`${6 * k} ${4 * k}`} />}
            {g?.lines.filter((l) => l.type !== "eave").map((l, i) => <line key={`r${i}`} x1={l.p[0]} y1={-l.p[1]} x2={l.q[0]} y2={-l.q[1]} stroke={LINE_COLORS[l.type]} strokeWidth={1.5 * k} opacity={0.45} />)}
            <polygon points={ring(roof.pts)} fill="none" stroke={dark ? "#cdd1e2" : "#344054"} strokeWidth={2.5 * k} />
            {tool === "wall" && roof.pts.map((a, i) => {
              const b = roof.pts[(i + 1) % roof.pts.length], m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], gable = roof.edges[i]?.type === "gable";
              return (
                <g key={`e${i}`} className="cursor-pointer" onPointerDown={(e) => { e.stopPropagation(); commit({ edges: roof.edges.map((x, j) => (j === i ? { type: gable ? "hip" : "gable" } : x)) }); }}>
                  <rect x={m[0] - 26 * k} y={-m[1] - 9 * k} width={52 * k} height={18 * k} rx={4 * k} fill={gable ? LINE_COLORS.rake : dark ? "#3a4163" : "#fff"} stroke="#98a2b3" strokeWidth={k} />
                  {txt(m, gable ? "จั่ว" : "ปั้นหยา", gable ? "#fff" : dark ? "#e3e6f0" : "#344054", 11)}
                  {txt([m[0], m[1] - 18 * k], `${fmt(dist(a, b), 2)} ม.`, "#667085", 11)}
                </g>
              );
            })}
            {multi.map((m, j) => { const o = BOXL[m.key][0][m.i]; if (!o) return null; const P = BOXL[m.key][1](o);
              return P.length === 1 ? <circle key={`m${j}`} cx={P[0][0]} cy={-P[0][1]} r={14 * k} fill="#f79009" fillOpacity={0.3} />
                : <line key={`m${j}`} x1={P[0][0]} y1={-P[0][1]} x2={P[1][0]} y2={-P[1][1]} stroke="#f79009" strokeOpacity={0.5} strokeWidth={12 * k} strokeLinecap="round" />; })}
            {box && <rect x={Math.min(box.p0[0], box.p1[0])} y={-Math.max(box.p0[1], box.p1[1])} width={Math.abs(box.p1[0] - box.p0[0])} height={Math.abs(box.p1[1] - box.p0[1])}
              fill={box.p1[0] >= box.p0[0] ? "#465fff14" : "#12b76a14"} stroke={box.p1[0] >= box.p0[0] ? "#465fff" : "#12b76a"} strokeWidth={1.2 * k} strokeDasharray={box.p1[0] >= box.p0[0] ? "none" : `${5 * k} ${3 * k}`} />}
            {[...ovP, ...ovI].map((o, j) => <line key={`ovp${j}`} x1={o.a[0]} y1={-o.a[1]} x2={o.b[0]} y2={-o.b[1]} stroke="#d92d20" strokeOpacity={0.6} strokeWidth={9 * k} strokeDasharray={`${8 * k} ${5 * k}`} pointerEvents="none"><title>อะเสซ้อนกัน {o.len.toFixed(2)} ม.</title></line>)}
            {hl && <g pointerEvents="none">
            {hl.to && <line x1={hl.p[0]} y1={-hl.p[1]} x2={hl.to[0]} y2={-hl.to[1]} stroke="#d92d20" strokeWidth={2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />}
            <circle cx={hl.p[0]} cy={-hl.p[1]} r={16 * k} fill="#d92d2033" stroke={hl.bad ? "#d92d20" : "#12b76a"} strokeWidth={3 * k}><animate attributeName="r" values={`${12 * k};${24 * k};${12 * k}`} dur="1s" repeatCount="indefinite" /></circle>
            {hl.to && <circle cx={hl.to[0]} cy={-hl.to[1]} r={7 * k} fill="#d92d20" />}
          </g>}
            {guide && <g opacity={0.55} pointerEvents="none">
              {(guide.beams ?? []).map((b, i) => <line key={`gb${i}`} x1={b.a[0]} y1={-b.a[1]} x2={b.b[0]} y2={-b.b[1]} stroke="#98a2b3" strokeWidth={2 * k} />)}
              {guide.outline?.length > 2 && <polygon points={ring(guide.outline)} fill="none" stroke="#667085" strokeWidth={1.5 * k} strokeDasharray={`${6 * k} ${4 * k}`} />}
            </g>}
            {/* wall plates at their true width seen from above: flange width × count (2C back to back = twice), as designed */}
            {plateMembers.map((m, i) => { const flange = Number(String(m.r?.section?.name ?? "").split("x")[1]) || 50, w = Math.max((flange / 1000) * (m.count ?? 1), 2 * k), L = Math.hypot(m.q[0] - m.p[0], m.q[1] - m.p[1]) || 1, n = [-(m.q[1] - m.p[1]) / L * w / 2, (m.q[0] - m.p[0]) / L * w / 2];
              return <polygon key={`pm${i}`} points={[[m.p[0] + n[0], m.p[1] + n[1]], [m.q[0] + n[0], m.q[1] + n[1]], [m.q[0] - n[0], m.q[1] - n[1]], [m.p[0] - n[0], m.p[1] - n[1]]].map(S).join(" ")} fill={m.inner ? INNER : PLATE} fillOpacity={0.55} stroke={m.inner ? INNER : PLATE} strokeWidth={0.8 * k} pointerEvents="none"><title>{`${m.label}: ${m.count > 1 ? "2" : ""}C ${m.r?.section?.name ?? ""} กว้าง ${(w * 100).toFixed(0)} ซม.`}</title></polygon>; })}
            {autoWallPlates && !plateMembers.length && <g pointerEvents="none"><polygon points={ring(roof.pts)} fill="none" stroke={PLATE} strokeWidth={4 * k} strokeDasharray={`${10 * k} ${6 * k}`} opacity={0.75} />
              {txt([roof.pts[0][0] + 8 * k, roof.pts[0][1] - 16 * k], "อะเสรอบนอก: อัตโนมัติ (ตัดช่วงที่เสา) — วาดเองเฉพาะถ้าต้องการกำหนดช่วงเอง", PLATE, 11, "start")}</g>}
            {plates.map((l, i) => <line key={`p${i}`} x1={l.a[0]} y1={-l.a[1]} x2={l.b[0]} y2={-l.b[1]} stroke={innerSet.has(l) ? INNER : PLATE} strokeWidth={(plateMembers.length ? 1.2 : innerSet.has(l) ? 4 : 5) * k} strokeLinecap="round" />)}
            {inner.map((l, i) => (
              <g key={`i${i}`}>
                <line x1={l.a[0]} y1={-l.a[1]} x2={l.b[0]} y2={-l.b[1]} stroke={INNER} strokeWidth={4 * k} strokeLinecap="round" />
                {txt([(l.a[0] + l.b[0]) / 2 + 10 * k, (l.a[1] + l.b[1]) / 2 + 10 * k], `B${i + 1}`, INNER, 12, "start")}
              </g>
            ))}
            {sups.map((l, i) => <line key={`su${i}`} x1={l.a[0]} y1={-l.a[1]} x2={l.b[0]} y2={-l.b[1]} stroke={SUP} strokeWidth={4 * k} strokeLinecap="round" strokeDasharray={supAuto ? `${8 * k} ${5 * k}` : undefined} />)}
            {(fr?.posts ?? []).filter((p) => p.kind === "ตุ๊กตา").map((p, i) => ( // ตุ๊กตา under สะพาน: small purple diamond
              <rect key={`tk${i}`} x={p.x - 5 * k} y={-p.y - 5 * k} width={10 * k} height={10 * k} fill={SUP} transform={`rotate(45 ${p.x} ${-p.y})`} />
            ))}
            {posts.map((p, i) => {
              // red = no interior plate carries this ดั้ง (its load would be lost)
              const bad = loose.some((q) => Math.abs(q[0] - p.x) < 0.01 && Math.abs(q[1] - p.y) < 0.01);
              return (
                <g key={`d${i}`}>
                  {bad && <circle cx={p.x} cy={-p.y} r={20 * k} fill="#f0443833" stroke="#f04438" strokeWidth={1.5 * k} />}
                  {/* ดั้ง: ring with a cross, large enough to read over beams and grid */}
                  <circle cx={p.x} cy={-p.y} r={12 * k} fill={bad ? "#f04438" : dark ? "#0f1222" : "#fff"} stroke={bad ? "#f04438" : "#12b76a"} strokeWidth={3 * k} />
                  <path d={`M${p.x - 7 * k} ${-p.y}H${p.x + 7 * k}M${p.x} ${-p.y - 7 * k}V${-p.y + 7 * k}`} stroke={bad ? "#fff" : "#12b76a"} strokeWidth={2.5 * k} />
                  {bad && txt([p.x + 16 * k, p.y + 12 * k], "! ไม่มีอะเสรับ", "#f04438", 11, "start")}
                </g>
              );
            })}
            {dims && plates.map((l, i) => { // spans between the columns standing on each plate
              const L = dist(l.a, l.b);
              if (L < 0.1) return null;
              const ux = (l.b[0] - l.a[0]) / L, uy = (l.b[1] - l.a[1]) / L, off = 16 * k;
              const ts = [0, ...cols.map((c) => { const t = ((c[0] - l.a[0]) * ux + (c[1] - l.a[1]) * uy) / L, o = Math.abs((c[0] - l.a[0]) * uy - (c[1] - l.a[1]) * ux);
                return t > 0.01 && t < 0.99 && o < 0.05 ? t : null; }).filter((t) => t !== null).sort((x, y) => x - y), 1];
              return ts.slice(1).map((t, j) => {
                const m = (ts[j] + t) / 2, p = [l.a[0] + ux * L * m - uy * off, l.a[1] + uy * L * m + ux * off];
                return <g key={`dm${i}-${j}`} pointerEvents="none">{txt(p, fmt((t - ts[j]) * L, 2), PLATE, 11)}</g>;
              });
            })}
            {pick && (() => { // selected item: orange halo
              const it = { pts: roof.pts, columns: cols, dang: dangList }[pick.key]?.[pick.i], ln = LINES[pick.key]?.[pick.i];
              if (it) return <circle cx={it[0]} cy={-it[1]} r={16 * k} fill="none" stroke="#f79009" strokeWidth={3 * k} pointerEvents="none" />;
              if (ln) return <line x1={ln.a[0]} y1={-ln.a[1]} x2={ln.b[0]} y2={-ln.b[1]} stroke="#f79009" strokeOpacity={0.5} strokeWidth={12 * k} strokeLinecap="round" pointerEvents="none" />;
              return null;
            })()}
            {cols.map((c, i) => { const h = Math.max((roof.colSize ?? 0.2) / 2, 3 * k); return <rect key={`c${i}`} x={c[0] - h} y={-c[1] - h} width={2 * h} height={2 * h} fill={dark ? "#f2f4fa" : COL} stroke={dark ? "#0f1222" : "#fff"} strokeWidth={1.5 * k} />; })}
            {tool === "select" && roof.pts.map((c, i) => <circle key={`v${i}`} cx={c[0]} cy={-c[1]} r={6 * k} fill={dark ? "#0f1222" : "#fff"} stroke="#465fff" strokeWidth={2 * k} />)}
            {draft.length > 0 && <polyline points={[...draft, ...(cur?.p ? [cur.p] : [])].map(S).join(" ")} fill="none" stroke="#344054" strokeWidth={2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />}
            {from && cur?.p && lineTool && <line x1={from[0]} y1={-from[1]} x2={cur.p[0]} y2={-cur.p[1]} stroke={{ plate: PLATE, inner: INNER, support: SUP }[tool]} strokeWidth={4 * k} opacity={0.6} />}
            {cur?.p && tool !== "select" && (
              <g pointerEvents="none">
                <circle cx={cur.p[0]} cy={-cur.p[1]} r={5 * k} fill="none" stroke="#f04438" strokeWidth={2 * k} />
                {txt([cur.p[0] + 12 * k, cur.p[1] + 14 * k], `${cur.kind ?? ""}${live !== null ? ` · ${fmt(live, 2)} ม.` : ""}${typed ? ` · พิมพ์ระยะ ${typed} ม. ↵` : ""}`, "#f04438", 12, "start")}
              </g>
            )}
          </svg>
          <div className="pointer-events-none absolute bottom-2 left-3 rounded-lg bg-white/90 px-2 py-1 text-[12px] text-gray-600 shadow-theme-xs">{info[3]}</div>
          {cur && <div className={`pointer-events-none absolute right-3 top-2 rounded-lg bg-white/90 px-2 py-1 text-[12px] tabular-nums shadow-theme-xs ${cur.p ? "text-gray-600" : "text-red-600"}`}>
            {cur.p ? `${cur.kind ?? ""} · X ${fmt(cur.p[0], 2)} · Y ${fmt(cur.p[1], 2)}` : cur.kind}</div>}
        </div>

        <div className="space-y-3 overflow-y-auto">
          <section className="rounded-2xl border border-gray-200 bg-white p-3 text-[13px]">
            {onFromFrame && <button onClick={onFromFrame} title="นำเข้าเสา กริด และแปลนคานชั้นบนสุด (เส้นจาง) — ไม่สร้างหลังคาหรืออะเสให้ วาดเอง แรงหลังคาลงเสา/คานชั้นนั้นอัตโนมัติ"
              className={`${btn} mb-2 w-full justify-center bg-brand-500 text-[#fff] ring-brand-500`}>นำเข้าเสา + แปลนจากโครงสร้าง (ขั้น 2)</button>}
            {guide?.outline?.length > 2 && <button onClick={() => { commit({ pts: guide.outline, edges: guide.outline.map(() => ({ type: "hip" })), supports: null }); setTimeout(() => setVb(fit()), 50); }}
              title="วางผนัง/ขอบหลังคาตามขอบอาคารจากแปลนโครงสร้าง (แก้มุมต่อได้)" className={`${btn} mb-2 w-full justify-center text-gray-700 ring-gray-300`}>ใช้ขอบอาคารเป็นผนัง</button>}
            <label className={`${btn} w-full cursor-pointer justify-center ${onFromFrame ? "text-gray-700 ring-gray-300" : "bg-brand-500 text-[#fff] ring-brand-500"}`}><FileUp className="h-3.5 w-3.5" />นำเข้าจาก CAD (DXF)
              <input type="file" accept=".dxf" className="hidden" onChange={async (e) => {
                const f = e.target.files[0]; e.target.value = "";
                if (!f) return;
                const dxf = parseDxf(await f.text()), all = Object.values(dxf.layers).flat().flatMap((x) => x.pts);
                const span = all.length ? Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0])) : 0;
                const scale = dxf.unit ?? (span > 300 ? 0.001 : 1), r3 = roof3d(dxf, scale); // a 3D roof frame (e.g. SketchUp) is read by its levels, not its layers
                setImp({ name: f.name, dxf, scale, r3, useSlope: true, roles: Object.fromEntries(Object.keys(dxf.layers).map((l) => [l, guessRole(l)])) });
              }} />
            </label>
            <p className="mt-1 text-[11px] text-gray-400">วาดใน AutoCAD แยกเลเยอร์ ผนัง / เสา / อะเส / อะเสรับดั้ง แล้ว Save As DXF</p>
          </section>
          <section className="space-y-2 rounded-2xl border border-gray-200 bg-white p-3 text-[13px]">
            <div className="font-semibold text-gray-800">กริดโครงสร้าง (ระยะแกน ม.)</div>
            {[["dx", "แกน X (A, B, …)"], ["dy", "แกน Y (ล่าง → บน)"]].map(([key, label]) => (
              <label key={key + G[key].join()} className="block text-[11px] text-gray-500">{label}
                <input defaultValue={G[key].join("  ")} onBlur={(e) => { const v = e.target.value.split(/[\s,]+/).map(Number).filter((x) => x > 0); if (v.length) setGrid({ [key]: v }); }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="mt-0.5 h-8 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800 tabular-nums" />
              </label>
            ))}
            <div className="grid grid-cols-2 gap-2">
              {[["x0", "เริ่มแกน X"], ["y0", "เริ่มแกน Y"]].map(([key, label]) => (
                <label key={key + G[key]} className="block text-[11px] text-gray-500">{label}
                  <input type="number" step="0.1" defaultValue={G[key]} onBlur={(e) => setGrid({ [key]: Number(e.target.value) || 0 })}
                    className="compact-num mt-0.5 h-8 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800" />
                </label>
              ))}
            </div>
            {[["ax", "เส้นกริดเสริม X (พิกัด)"], ["ay", "เส้นกริดเสริม Y (พิกัด)"]].map(([key, label]) => (
              <label key={key + (G[key] ?? []).join()} className="block text-[11px] text-[#f79009]">{label}
                <input defaultValue={(G[key] ?? []).join("  ")} placeholder="เช่น 5.25  8.7" onBlur={(e) => setGrid({ [key]: e.target.value.split(/[\s,]+/).filter(Boolean).map(Number).filter(Number.isFinite) })}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="mt-0.5 h-8 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800 tabular-nums" />
              </label>
            ))}
            <button onClick={() => set("grid", null)} className={`${btn} w-full justify-center text-gray-700 ring-gray-300 hover:bg-gray-50`}><Wand2 className="h-3.5 w-3.5" />สร้างกริดจากมุมผนัง</button>
            <p className="text-[11px] text-gray-400">ใส่ระยะช่วงแกนตามแบบ เช่น 3.5 2.5 0.9 3.6 3.5 แล้วกด Enter · คลิกได้เฉพาะจุดตัดกริด (โหนด) · ระหว่างวาดพิมพ์ระยะแล้วกด Enter ได้</p>
          </section>
          {tool === "select" && pick && (() => { // number panel for the selected item
            const NAME = { pts: "มุมผนัง", columns: "เสา", dang: "ดั้ง", plates: "อะเส", innerPlates: "อะเสรับดั้ง", supports: "สะพาน" };
            const pointList = { pts: roof.pts, columns: cols, dang: dangList }[pick.key], lineList = LINES[pick.key];
            const item = (pointList ?? lineList)?.[pick.i];
            if (!item) return null;
            const list = pointList ?? lineList, save = (v) => commit({ [pick.key]: list.map((x, j) => (j === pick.i ? v : x)) });
            const num = (label, val, onSet) => (
              <label key={label + val} className="block text-[11px] text-gray-500">{label}
                <input type="number" step="0.05" defaultValue={+val.toFixed(3)} onBlur={(e) => { const v = Number(e.target.value); if (e.target.value !== "" && Number.isFinite(v) && Math.abs(v - val) > 1e-6) onSet(+v.toFixed(3)); }}
                  onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()} className="compact-num mt-0.5 h-8 w-full rounded-lg border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800" />
              </label>
            );
            const pt = (p, set1) => [num("X (ม.)", p[0], (v) => set1([v, p[1]])), num("Y (ม.)", p[1], (v) => set1([p[0], v]))];
            const tag = pick.key === "innerPlates" ? `B${pick.i + 1}` : pick.key === "supports" ? `S${pick.i + 1}` : `#${pick.i + 1}`;
            const canDel = pick.key !== "pts" || roof.pts.length > 3;
            return (
              <section className="space-y-2 rounded-2xl border border-[#f79009]/50 bg-white p-3 text-[13px]">
                <div className="flex items-center font-semibold text-gray-800">แก้ไข {NAME[pick.key]} {tag}
                  {lineList && <span className="ml-auto text-[12px] font-normal text-gray-500">ยาว {fmt(dist(item.a, item.b), 2)} ม.</span>}</div>
                {pointList ? <div className="grid grid-cols-2 gap-2">{pt(item, save)}</div> : (<>
                  <div className="text-[11px] text-gray-400">ต้น</div><div className="grid grid-cols-2 gap-2">{pt(item.a, (a) => save({ ...item, a }))}</div>
                  <div className="text-[11px] text-gray-400">ปลาย</div><div className="grid grid-cols-2 gap-2">{pt(item.b, (b) => save({ ...item, b }))}</div>
                </>)}
                {canDel && <button onClick={() => { commit(pick.key === "pts" ? { pts: roof.pts.filter((_, j) => j !== pick.i), edges: roof.edges.filter((_, j) => j !== pick.i), supports: null }
                  : { [pick.key]: list.filter((_, j) => j !== pick.i) }); setPick(null); }} className={`${btn} w-full justify-center text-red-600 ring-red-200 hover:bg-red-50`}><Eraser className="h-3.5 w-3.5" />ลบ</button>}
              </section>
            );
          })()}
          <section className="rounded-2xl border border-gray-200 bg-white p-3 text-[13px]">
            <div className="mb-2 font-semibold text-gray-800">ขั้นตอน</div>
            {[["1 ผนัง", `${roof.pts.length} มุม`, dark ? "#cdd1e2" : "#344054"], ["2 เสา", `${cols.length} ต้น`, dark ? "#f2f4fa" : COL], ["3 อะเส", `${plates.length} เส้น`, PLATE], ["4 อะเสรับดั้ง", `${inner.length} เส้น`, INNER], ["สะพาน", `${sups.length} เส้น${supAuto ? " (อัตโนมัติ)" : ""}`, SUP]].map(([t, n, c]) => (
              <div key={t} className="flex items-center gap-2 py-0.5"><i className="h-2 w-4 rounded-full" style={{ background: c }} />{t}<span className="ml-auto text-gray-500">{n}</span></div>
            ))}
            <div className="flex items-center gap-2 py-0.5"><i className="h-2.5 w-2.5 rounded-full border-2 border-[#12b76a]" />ดั้ง<span className="ml-auto text-gray-500">{posts.length} ต้น</span></div>
            <div className="flex items-center gap-2 py-0.5"><i className="h-2 w-2 rotate-45 bg-[#7a5af8]" />ตุ๊กตา (ใต้สะพาน)<span className="ml-auto text-gray-500">{(fr?.posts ?? []).filter((p) => p.kind === "ตุ๊กตา").length} ต้น</span></div>
          </section>
          <section className="space-y-1.5 rounded-2xl border border-gray-200 bg-white p-3">
            <div className="mb-1 text-[13px] font-semibold text-gray-800">วาดอัตโนมัติ (กดเมื่อต้องการ)</div>
            {[["ดั้งตามอกไก่ (ทุก ~ระยะดั้ง)", () => commit({ dang: null })], ["สะพานตามช่วงจันทันสูงสุด", () => commit({ supports: null })], ["เสาตามมุมผนัง + ทุก ~ระยะเสา", autoColumns], ["อะเสตามแนวผนังทั้งหมด", autoPlates], ["อะเสรับดั้งผ่านดั้งทุกต้น", autoInner]].map(([t, f]) => (
              <button key={t} onClick={f} className={`${btn} w-full justify-start text-gray-700 ring-gray-300 hover:bg-gray-50`}><Wand2 className="h-3.5 w-3.5" />{t}</button>
            ))}
            <div className="pt-2 text-[11px] text-gray-400">ล้างชั้น</div>
            <div className="flex gap-1.5">
              {[["ดั้ง", "dang"], ["สะพาน", "supports"], ["เสา", "columns"], ["อะเส", "plates"], ["รับดั้ง", "innerPlates"]].map(([t, key]) => (
                <button key={key} onClick={() => commit({ [key]: [] })} className={`${btn} flex-1 justify-center text-red-600 ring-red-200 hover:bg-red-50`}>{t}</button>
              ))}
            </div>
          </section>
          <p className="px-1 text-[11px] text-gray-400">ความชัน ชายคา ระดับอะเส ตั้งในแท็บ "รูปทรง" · ผลคำนวณอะเสดูในแท็บ "อะเส"</p>
        </div>
      </div>
      {imp && (
        <Dialog open onOpenChange={(o) => !o && setImp(null)}>
          <DialogContent>
            <DialogTitle>นำเข้า {imp.name}</DialogTitle>
            {imp.r3 && (() => { const p3 = roof3dPatch(imp.r3, roof), c = imp.r3.counts; return (
              <div className="mb-4 rounded-xl bg-brand-50/60 p-3 text-[13px] text-gray-700 ring-1 ring-brand-100">
                <p className="font-semibold text-brand-600">พบโครงหลังคา 3 มิติ (แยกจากระดับความสูง ไม่ต้องแยกเลเยอร์)</p>
                <ul className="mt-1 list-disc pl-5 text-[12px] tabular-nums">
                  <li>ระดับอะเส +{imp.r3.H.toFixed(2)} · อกไก่ +{imp.r3.ridgeZ.toFixed(2)} (สูง {p3?.rise} ม.){p3?.slope ? ` → ความชันประมาณ ${p3.slope}°` : ""}</li>
                  <li>อะเสรับดั้ง {p3?.innerPlates.length ?? 0} เส้น (เส้นที่ระดับอะเสซึ่งไม่อยู่บนขอบหลังคา) · ดั้ง {c.posts} ต้น (เส้นตั้ง) · อกไก่ {c.ridges} เส้น (ใช้หาความชัน)</li>
                  <li>{roof.pts?.length >= 3 ? "คงขอบหลังคา / เสา / อะเสรอบนอกเดิม (จากโครงสร้าง) · พิกัดตามแบบ ไม่เลื่อน" : "ยังไม่มีขอบหลังคา → ใช้วงนอกของเส้นระดับอะเสเป็นขอบ"}</li>
                  {c.sloped > 0 && <li>เส้นเอียง {c.sloped} เส้น (ตะเข้ / จันทัน) — โปรแกรมสร้างใหม่จากรูปทรง</li>}
                </ul>
                <label className="mt-2 flex items-center gap-2 text-[12px]"><input type="checkbox" checked={imp.useSlope} onChange={(e) => setImp({ ...imp, useSlope: e.target.checked })} />ใช้ความชันจากไฟล์{p3?.slope ? ` (${p3.slope}°)` : ""}</label>
                <button disabled={!p3} onClick={() => { const { rise, slope, ...patch } = p3; commit({ ...patch, ...(imp.useSlope && slope ? { slope } : {}) }); setImp(null); setTimeout(() => setVb(fit()), 50); }}
                  className={`${btn} mt-2 bg-brand-500 text-[#fff] ring-brand-500`}>นำเข้าโครงหลังคา 3 มิติ</button>
              </div>); })()}
            <p className="mb-3 text-[12px] text-gray-500">เลือกว่าแต่ละเลเยอร์คืออะไร · ข้อมูลชั้นที่เลือกจะแทนที่ของเดิม (ย้อนกลับได้ด้วย Ctrl+Z)</p>
            <label className="mb-3 flex items-center gap-2 text-[13px] text-gray-600">หน่วยในแบบ CAD
              <select value={imp.scale} onChange={(e) => setImp({ ...imp, scale: Number(e.target.value) })} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
                {[[0.001, "มิลลิเมตร"], [0.01, "เซนติเมตร"], [1, "เมตร"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <div className="max-h-[50vh] space-y-1.5 overflow-auto">
              {Object.entries(imp.dxf.layers).map(([layer, ents]) => (
                <div key={layer} className="grid grid-cols-[1fr_80px_150px] items-center gap-2 text-[13px]">
                  <span className="truncate font-medium text-gray-800">{layer}</span>
                  <span className="text-gray-400">{ents.length} ชิ้น</span>
                  <select value={imp.roles[layer]} onChange={(e) => setImp({ ...imp, roles: { ...imp.roles, [layer]: e.target.value } })} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
                    {[["skip", "— ไม่ใช้ —"], ["walls", "ผนัง (รูปปิด)"], ["columns", "เสา"], ["plates", "อะเส"], ["inner", "อะเสรับดั้ง"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setImp(null)} className={`${btn} text-gray-600 ring-gray-300`}>ยกเลิก</button>
              <button onClick={() => {
                const r = toPlan(imp.dxf, imp.roles, imp.scale), used = new Set(Object.values(imp.roles));
                if (!r) return setImp(null);
                const patch = {};
                if (used.has("walls") && r.walls) Object.assign(patch, { pts: r.walls, edges: r.walls.map(() => ({ type: "hip" })), supports: null, grid: null });
                if (used.has("columns")) patch.columns = r.columns;
                if (used.has("plates")) patch.plates = r.plates;
                if (used.has("inner")) patch.innerPlates = r.inner;
                commit(patch); setImp(null); setTimeout(() => setVb(fit()), 50);
              }} className={`${btn} bg-brand-500 text-[#fff] ring-brand-500`}>นำเข้า</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </main>
  );
}
