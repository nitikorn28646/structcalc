// Floor plan board, step by step: 1 frame (columns, beams, cantilever beams; grid optional) · 2 slabs (S / PS / GS, cantilever slabs)
// · 4 walls (on beams or slabs, double walls, stacked walls) · results. Free drawing snaps to columns, beam ends / mid-points / any point
// on a beam; typed lengths (digits + Enter) place exact points.
import { useEffect, useRef, useState } from "react";
import { arcPolyline } from "../engine/arc.js";
import { useDeclutter } from "./declutter.js";
import { CircleDot, Columns3, Download, Eraser, FileUp, Footprints, Grid3x3, Hand, Magnet, MousePointer2, PanelTop, Redo2, Ruler, Undo2, Wand2, Copy } from "lucide-react";
import { frame3dFromDxf, guessRole, parseDxf, toPlan } from "./dxfImport.js";
import { Tip } from "@/components/ui/tooltip";
import { useHighlight } from "./highlight.js";
import { TextSizeControl, useTextScale } from "./uiPrefs.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fmt } from "./beamModel.js";
import { dist, gridAxes, round3, segCross, segDist } from "./planKit.js";
import { GROUPS, STAIR_KINDS, wallLoad, wallThick, wallsOf } from "../engine/floor.js";

// type colours (user 2026-11-03: different types had the same colour — 8 colours repeated, two blues alike): 12 distinct hues,
// then more by the golden angle so a long type list does not repeat
const BASE_COLORS = ["#3e63dd", "#30a46c", "#f76b15", "#8e4ec6", "#0e9384", "#b54708", "#d6409f", "#65a30d", "#0284c7", "#dc2626", "#a16207", "#475467"];
export const TYPE_COLORS = [...BASE_COLORS, ...Array.from({ length: 36 }, (_, i) => `hsl(${Math.round((i * 137.5 + 20) % 360)}, 65%, 45%)`)];
const SEL = ["select", "เลือก/ย้าย", MousePointer2, "คลิกเพื่อเลือกและแก้ค่า · ลากเสาเพื่อย้าย (ปลายคานตามไป) · ลากกรอบที่ว่าง = เลือกหลายชิ้น (ซ้าย→ขวา เฉพาะที่อยู่ในกรอบ · ขวา→ซ้าย ที่แตะกรอบ) แล้วกด Delete เพื่อลบ · Shift+ลาก หรือปุ่มกลางเมาส์ = เลื่อนแปลน · ล้อเมาส์ซูม"];
const TOOLS = {
  frame: [SEL, ["column", "เสา", Columns3, "คลิกวางเสา · กรอบประ = เสาชั้นล่าง · ชี้บนคานแล้วพิมพ์ระยะ + Enter = วางห่างปลายคาน"],
    ["beam", "คาน", Ruler, "คลิกต้น → ปลาย ต่อเนื่องได้ · พิมพ์ความยาว + Enter · Esc จบ · ปลายบนคานอื่น = คานซอย · ปลายลอย = คานยื่น"],
    ["erase", "ลบ", Eraser, "คลิกเสาหรือคานที่จะลบ"]],
  slab: [SEL, ["cant", "พื้นยื่น", PanelTop, "คลิกบนคานด้านที่จะยื่น → สร้างพื้นยื่นตลอดคานเส้นนั้น (แก้ความยาวยื่นได้ทางซ้าย)"], ["erase", "ลบ", Eraser, "คลิกพื้นยื่นที่จะลบ"]],
  wall: [SEL, ["wall", "ผนัง", Ruler, "คลิกต้น → ปลาย ต่อเนื่องได้ · วางบนคาน = ลงคาน · วางกลางพื้น = กระจายลงแผ่นพื้น · วาดซ้อนได้"], ["erase", "ลบ", Eraser, "คลิกผนังที่จะลบ"]],
  stair: [SEL, ["stair", "บันได", Footprints, "คลิกมุมหนึ่ง → มุมตรงข้ามของช่องบันได (ดูดเข้าเสา/คาน) · เลือกแบบ ทิศขึ้น ที่แผงซ้าย"], ["erase", "ลบ", Eraser, "คลิกบันไดที่จะลบ"]],
  other: [SEL, ["line", "ราว/น้ำหนักเส้น", Ruler, "คลิกต้น → ปลาย เช่น ราวกันตกที่ปลายพื้นยื่น หรือผนังเตี้ย"], ["point", "น้ำหนักจุด", CircleDot, "คลิกวางน้ำหนักจุด เช่น แท็งก์น้ำ"], ["area", "เพิ่มบนพื้น", PanelTop, "คลิกแผ่นพื้นเพื่อเพิ่มน้ำหนักต่อพื้นที่จากคลัง เช่น ห้องน้ำ / ฝ้า"], ["erase", "ลบ", Eraser, "คลิกน้ำหนักที่จะลบ"]],
  result: [SEL], cols: [SEL], grid: [SEL],
};
const BOXABLE = { frame: ["column", "beam"], wall: ["wall"], other: ["lineLoad", "point"], stair: ["stair"], slab: ["cant"] };
const inside = (P, [x, y]) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const [xi, yi] = P[i], [xj, yj] = P[j]; if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c; } return c; };
const WALL_C = "#b54708", SP_C = "#d6409f", ST_C = "#0e9384";

export default function FloorBoard({ floor, setFloor, an, types, wallTypes, step, show, sel, setSel, modeBar, dark, ghost = [], colInfo = null, onDxf, onCopyBelow = null, compact = false, resolveW = (w) => w, libItem = null, onImportFrame = null, colSize = () => null }) {
  const tools = TOOLS[step] ?? [SEL], result = step === "result";
  const svg = useRef(null), [tool, setToolState] = useState(step === "slab" ? "select" : tools[1]?.[0] ?? "select"), [ortho, setOrtho] = useState(true), [snapOn, setSnapOn] = useState(true), [gridOn, setGridOn] = useState(floor.grid?.on !== false);
  // each step starts with its main tool (slabs: select a panel to set its kind); a tool of another step is never kept
  useEffect(() => { setToolState(step === "slab" ? "select" : tools[1]?.[0] ?? "select"); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const [start, setStart] = useState(null), [cur, setCur] = useState(null), [drag, setDrag] = useState(null), [hist, setHist] = useState({ undo: [], redo: [] });
  // box selection (select tool, drag on empty space): left → right = window (fully inside), right → left = crossing (touching);
  // Delete removes everything selected in one undo step; Shift / middle-drag pans
  const [box, setBox] = useState(null), [multi, setMulti] = useState([]), [menu, setMenu] = useState(null), hl = useHighlight(), [tScale] = useTextScale();
  const [typed, setTyped] = useState(""), lastRaw = useRef(null), [imp, setImp] = useState(null);
  useEffect(() => { setToolState(tools[1]?.[0] ?? "select"); setStart(null); }, [step]); // eslint-disable-line react-hooks/exhaustive-deps
  const setTool = (t) => { setToolState(t); setStart(null); setTyped(""); };
  const stairs = floor.stairs ?? [], lineLoads = floor.lineLoads ?? [], pointLoads = floor.pointLoads ?? [];
  const cols = floor.columns, beams = floor.beams, walls = wallsOf(floor), cants = floor.cants ?? [], G = floor.grid, { GX, GY, SX, SY, xName, yName } = gridAxes(G);
  const fitBox = () => {
    const P = [...cols, ...beams.flatMap((b) => [b.a, b.b]), ...(gridOn ? SX.flatMap((x) => SY.map((y) => [x, y])) : [])], pad = 2.5;
    if (!P.length) return { x: -2, y: -2, w: 14, h: 12 };
    const x0 = Math.min(...P.map((p) => p[0])) - pad, y0 = Math.min(...P.map((p) => p[1])) - pad;
    return { x: x0, y: y0, w: Math.max(...P.map((p) => p[0])) - x0 + pad, h: Math.max(...P.map((p) => p[1])) - y0 + pad };
  };
  const [vb, setVb] = useState(fitBox);
  const px = () => vb.w / (svg.current?.clientWidth || 1000), k = px();
  const toModel = (e) => { const p = svg.current.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; const q = p.matrixTransform(svg.current.getScreenCTM().inverse()); return [q.x, -q.y]; };

  const snapshot = () => ({ columns: floor.columns, beams: floor.beams, panels: floor.panels, walls: floor.walls, cants: floor.cants, stairs: floor.stairs, lineLoads: floor.lineLoads, pointLoads: floor.pointLoads });
  const commit = (patch) => setFloor(patch); // undo / redo is project-wide (app header, Ctrl+Z / Ctrl+Y)

  // ---- snapping: columns, beam ends / mid-points / crossings, wall ends, grid nodes (when on), any point on a beam, else free
  const crossings = [];
  for (let i = 0; i < beams.length; i++) for (let j = i + 1; j < beams.length; j++) { const c = segCross(beams[i].a, beams[i].b, beams[j].a, beams[j].b); if (c) crossings.push(c); }
  const nodeName = (p) => { const i = GX.findIndex((x) => Math.abs(x - p[0]) < 1e-6), j = GY.findIndex((y) => Math.abs(y - p[1]) < 1e-6); return i >= 0 && j >= 0 ? `โหนด ${xName(i)}-${yName(j)}` : "จุดกริด"; };
  const onBeamText = (b, q) => { const d0 = dist(b.a, q), d1 = dist(b.b, q); return `บนคาน · ห่างปลาย ${fmt(Math.min(d0, d1), 2)} ม.`; };
  const snap = (raw, from) => {
    let p = raw;
    if (ortho && from) p = Math.abs(raw[0] - from[0]) >= Math.abs(raw[1] - from[1]) ? [raw[0], from[1]] : [from[0], raw[1]];
    const free = { p: p.map((v) => Math.round(v * 20) / 20), kind: null };
    if (!snapOn) return free;
    const r = 18 * px(), axis = ortho && from ? (Math.abs(p[1] - from[1]) < 1e-9 ? 1 : 0) : -1, keep = (q) => (axis < 0 ? q : axis === 1 ? [q[0], from[1]] : [from[0], q[1]]);
    const cand = [...cols.map((c) => [c, "เสา"]), ...beams.flatMap((b) => [[b.a, "ปลายคาน"], [b.b, "ปลายคาน"], [[(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], "กึ่งกลางคาน"]]),
      ...crossings.map((c) => [c, "จุดตัดคาน"]), ...walls.flatMap((w) => [[w.a, "ปลายผนัง"], [w.b, "ปลายผนัง"]]), ...(gridOn ? SX.flatMap((x) => SY.map((y) => [[x, y], null])) : [])];
    let best = null;
    for (const [c, kind] of cand) { const q = keep(c), d = dist(q, p); if (d < r && dist(q, c) < r && (!best || d < best.d - 1e-9)) best = { d, p: axis < 0 ? c : q, kind: kind ?? nodeName(c) }; }
    if (best) return best;
    let hit = null; const take = (q, kind, beam) => { const d = dist(q, p); if (d < r && (!hit || d < hit.d)) hit = { d, p: round3(q), kind, beam }; };
    if (axis >= 0) { // locked axis meets a beam or a grid line
      for (const b of beams) { const den = axis === 1 ? b.b[1] - b.a[1] : b.b[0] - b.a[0]; if (Math.abs(den) < 1e-9) continue; const t = axis === 1 ? (from[1] - b.a[1]) / den : (from[0] - b.a[0]) / den; if (t >= -1e-6 && t <= 1 + 1e-6) { const q = [b.a[0] + (b.b[0] - b.a[0]) * t, b.a[1] + (b.b[1] - b.a[1]) * t]; take(q, onBeamText(b, q), b); } }
      if (gridOn) for (const v of axis === 1 ? SX : SY) take(axis === 1 ? [v, from[1]] : [from[0], v], "ชนเส้นกริด");
    } else for (const b of beams) { const s = segDist(p, b.a, b.b); if (s.d < r) take(s.q, onBeamText(b, s.q), b); } // any point on a beam
    if (hit) return hit;
    return gridOn ? { p: null, kind: "ไม่มีจุดยึด — ปิดกริดเพื่อวาดอิสระ" } : free;
  };

  const hitAt = (raw) => {
    const r = 12 * px();
    if (step === "wall") { const wi = walls.findIndex((w) => segDist(raw, w.a, w.b).d < r); if (wi >= 0) return { kind: "wall", i: wi }; }
    if (step === "stair") { const si = stairs.findIndex((st) => inside([st.a, [st.b[0], st.a[1]], st.b, [st.a[0], st.b[1]]], raw)); if (si >= 0) return { kind: "stair", i: si }; }
    if (step === "other") {
      const pi = pointLoads.findIndex((q) => dist(q.p, raw) < r); if (pi >= 0) return { kind: "point", i: pi };
      const li = lineLoads.findIndex((l) => segDist(raw, l.a, l.b).d < r); if (li >= 0) return { kind: "lineLoad", i: li };
    }
    if (step === "slab") { const ci = an?.cants.findIndex((c) => inside(c.P, raw)) ?? -1; if (ci >= 0) return { kind: "cant", i: ci }; }
    const ci = cols.findIndex((c) => dist(c, raw) < r);
    if (ci >= 0 && step !== "slab" && step !== "wall") return { kind: "column", i: ci };
    const bi = beams.findIndex((b) => segDist(raw, b.a, b.b).d < r);
    if (bi >= 0 && step !== "slab") return { kind: "beam", i: bi };
    const pn = an?.panels.find((p) => inside(p.P, raw));
    return pn ? { kind: "panel", key: pn.key } : null;
  };
  const lineTool = tool === "beam" || tool === "wall" || tool === "line" || tool === "stair";
  const place = (p) => {
    if (tool === "column") { if (!cols.some((c) => dist(c, p) < 0.05)) commit({ columns: [...cols, p] }); return; }
    if (tool === "point") { const it = libItem?.kind === "point" ? libItem : null; commit({ pointLoads: [...pointLoads, { p, P: it?.v ?? 500, name: it?.name ?? "" }] }); setSel({ kind: "point", i: pointLoads.length }); return; }
    if (tool === "area") { const pn = an?.panels.find((q) => inside(q.P, p)); const it = libItem?.kind === "area" ? libItem : null;
      if (pn && it) { const o = floor.panels?.[pn.key] ?? {}; commit({ panels: { ...floor.panels, [pn.key]: { ...o, extra: (o.extra ?? 0) + it.v, extraItems: [...(o.extraItems ?? []), { name: it.name, v: it.v }] } } }); }
      return; }
    if (!lineTool) return;
    if (!start) { setStart(p); return; }
    if (dist(start, p) < 0.1) return;
    if (tool === "stair") {
      if (Math.abs(p[0] - start[0]) < 0.3 || Math.abs(p[1] - start[1]) < 0.3) return;
      const up = Math.abs(p[0] - start[0]) >= Math.abs(p[1] - start[1]) ? "+x" : "+y";
      commit({ stairs: [...stairs, { a: start, b: p, up, kind: "long", t: 0.12, riser: 0.17, tread: 0.25, finish: 100, live: 300, landingL: 1.2, landingTo: "below", side: 1 }] });
      setSel({ kind: "stair", i: stairs.length }); setStart(null); return;
    }
    if (tool === "line") { const it = libItem?.kind === "line" ? libItem : null; commit({ lineLoads: [...lineLoads, { a: start, b: p, q: it?.v ?? 100, name: it?.name ?? "ราวกันตก" }] }); setStart(p); return; }
    if (tool === "beam") commit({ beams: [...beams, { a: start, b: p, type: null }] });
    else commit({ walls: [...walls, { a: start, b: p, kind: wallTypes[0]?.id ?? "brick", h: 3, hAuto: true, open: 0, layers: 1 }] }); // clear height under the beam above
    setStart(p);
  };
  const ITEM = { column: ["columns", (c) => [c]], beam: ["beams", (b) => [b.a, b.b]], wall: ["walls", (w) => [w.a, w.b]], lineLoad: ["lineLoads", (l) => [l.a, l.b]],
    point: ["pointLoads", (q) => [q.p]], stair: ["stairs", (st) => [st.a, st.b, [st.a[0], st.b[1]], [st.b[0], st.a[1]]]], cant: ["cants", (c) => [c.a, c.b]] };
  const listOf = (kind) => (kind === "wall" ? walls : floor[ITEM[kind][0]] ?? []);
  const endBox = () => {
    const b = box; setBox(null);
    if (!b || dist(b.p0, b.p1) < 3 * px()) return;
    const x0 = Math.min(b.p0[0], b.p1[0]), x1 = Math.max(b.p0[0], b.p1[0]), y0 = Math.min(b.p0[1], b.p1[1]), y1 = Math.max(b.p0[1], b.p1[1]), win = b.p1[0] >= b.p0[0];
    const inside = ([x, y]) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
    const hits = (P) => (win ? P.every(inside) : P.some(inside) || (P.length === 2 && [0.25, 0.5, 0.75].some((t) => inside([P[0][0] + (P[1][0] - P[0][0]) * t, P[0][1] + (P[1][1] - P[0][1]) * t]))));
    const got = BOXABLE[step].flatMap((kind) => listOf(kind).map((o, i) => (hits(ITEM[kind][1](o)) ? { kind, i } : null)).filter(Boolean));
    setMulti(got); setSel(got.length === 1 ? got[0] : null);
  };
  const delItems = (list) => {
    const patch = {};
    for (const kind of Object.keys(ITEM)) { const ids = new Set(list.filter((x) => x?.kind === kind).map((x) => x.i)); if (ids.size) patch[ITEM[kind][0]] = listOf(kind).filter((_, i) => !ids.has(i)); }
    if (Object.keys(patch).length) { commit(patch); setMulti([]); setSel(null); }
  };
  const onDown = (e) => {
    if (e.button === 2) { setStart(null); setTyped(""); if (tool === "select" && (multi.length || sel)) setMenu({ x: e.clientX, y: e.clientY }); return; }
    setMenu(null);
    const raw = toModel(e);
    lastRaw.current = raw;
    if (e.button === 1 || tool === "select") {
      if (e.button === 0) {
        const h = hitAt(raw);
        setSel(h);
        if (h?.kind === "column" && step === "frame") { setDrag({ col: h.i, from: cols[h.i] }); return; }
        if (h) return;
      }
      if (e.button === 0 && !e.shiftKey && BOXABLE[step]) { setMulti([]); setDrag({ box: true }); setBox({ p0: raw, p1: raw }); return; }
      setDrag({ pan: true, sx: e.clientX, sy: e.clientY, vb }); return;
    }
    if (tool === "erase") {
      const h = hitAt(raw);
      if (h?.kind === "column") commit({ columns: cols.filter((_, i) => i !== h.i) });
      else if (h?.kind === "beam") commit({ beams: beams.filter((_, i) => i !== h.i) });
      else if (h?.kind === "wall") commit({ walls: walls.filter((_, i) => i !== h.i) });
      else if (h?.kind === "cant") commit({ cants: cants.filter((_, i) => i !== h.i) });
      else if (h?.kind === "stair") commit({ stairs: stairs.filter((_, i) => i !== h.i) });
      else if (h?.kind === "point") commit({ pointLoads: pointLoads.filter((_, i) => i !== h.i) });
      else if (h?.kind === "lineLoad") commit({ lineLoads: lineLoads.filter((_, i) => i !== h.i) });
      setSel(null); return;
    }
    if (tool === "cant") { // cantilever slab along the clicked beam, on the clicked side
      const bi = beams.findIndex((b) => segDist(raw, b.a, b.b).d < 25 * px());
      if (bi < 0) return;
      const b = beams[bi], side = Math.sign((b.b[0] - b.a[0]) * (raw[1] - b.a[1]) - (b.b[1] - b.a[1]) * (raw[0] - b.a[0])) || 1;
      commit({ cants: [...cants, { a: b.a, b: b.b, L: 1.0, side }] }); setSel({ kind: "cant", i: cants.length }); return;
    }
    const s = snap(raw, lineTool && tool !== "stair" ? start : null).p;
    if (s) place(round3(s));
  };
  // typed distance: while drawing → length from the last point towards the mouse; otherwise, pointing at a beam → that far from its nearer end
  const typedPoint = () => {
    const L = parseFloat(typed), m = lastRaw.current;
    if (!(L >= 0) || !m) return null;
    if (lineTool && start) {
      let v = [m[0] - start[0], m[1] - start[1]];
      if (ortho) v = Math.abs(v[0]) >= Math.abs(v[1]) ? [Math.sign(v[0]) || 1, 0] : [0, Math.sign(v[1]) || 1];
      const n = Math.hypot(...v) || 1;
      return round3([start[0] + (v[0] / n) * L, start[1] + (v[1] / n) * L]);
    }
    const b = beams.find((x) => segDist(m, x.a, x.b).d < 25 * px());
    if (!b) return null;
    const [e0, e1] = dist(m, b.a) <= dist(m, b.b) ? [b.a, b.b] : [b.b, b.a], len = dist(e0, e1);
    return L <= len ? round3([e0[0] + ((e1[0] - e0[0]) * L) / len, e0[1] + ((e1[1] - e0[1]) * L) / len]) : null;
  };
  const onMove = (e) => {
    const raw = toModel(e);
    lastRaw.current = raw;
    if (drag?.box) { setBox((b) => b && { ...b, p1: raw }); return; }
    if (drag?.pan) { const kk = px(); setVb((v) => ({ ...v, x: drag.vb.x - (e.clientX - drag.sx) * kk, y: drag.vb.y + (e.clientY - drag.sy) * kk })); return; }
    if (drag?.col !== undefined) {
      const s = snap(raw).p; if (!s) return;
      const p = round3(s), o = drag.from, mv = (q) => (dist(q, o) < 1e-6 ? p : q);
      setFloor({ columns: cols.map((c, i) => (i === drag.col ? p : c)), beams: beams.map((b) => ({ ...b, a: mv(b.a), b: mv(b.b) })) });
      setDrag({ ...drag, from: p }); return;
    }
    setCur(tool === "column" || tool === "point" || lineTool ? snap(raw, lineTool && tool !== "stair" ? start : null) : null);
  };
  useEffect(() => {
    const h = (e) => {
      if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
      if (e.key === "Escape") { setStart(null); setTyped(""); setMulti([]); setMenu(null); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a" && BOXABLE[step]) { e.preventDefault(); setTool("select"); setMulti(BOXABLE[step].flatMap((kind) => listOf(kind).map((_, i) => ({ kind, i })))); }
      else if ((e.key === "Delete" || (e.key === "Backspace" && !typed)) && (multi.length || sel)) { e.preventDefault(); delItems(multi.length ? multi : [sel]); }
      else if ((tool === "column" || (lineTool && tool !== "stair")) && /^[0-9.]$/.test(e.key)) setTyped((t) => t + e.key);
      else if (typed && e.key === "Backspace") setTyped((t) => t.slice(0, -1));
      else if (e.key === "Enter" && typed) { const p = typedPoint(); setTyped(""); if (p) place(p); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });
  useDeclutter(svg); // overlapping plan labels hidden until zoomed in
  useEffect(() => { const el = svg.current, h = (e) => e.preventDefault(); el.addEventListener("wheel", h, { passive: false }); return () => el.removeEventListener("wheel", h); }, []);
  const onWheel = (e) => { const m = toModel(e), f = e.deltaY > 0 ? 1.15 : 1 / 1.15; setVb((v) => ({ x: m[0] - (m[0] - v.x) * f, y: m[1] - (m[1] - v.y) * f, w: v.w * f, h: v.h * f })); };

  const autoCols = () => commit({ columns: GX.flatMap((x) => GY.map((y) => [x, y])) });
  const autoBeams = () => commit({ beams: [...GY.flatMap((y) => GX.slice(1).map((x, i) => [[GX[i], y], [x, y]])), ...GX.flatMap((x) => GY.slice(1).map((y, i) => [[x, GY[i]], [x, y]]))].map(([a, b]) => ({ a, b, type: null })) });

  // labels grow with the plan when zoomed in past "fit" (like CAD); zoomed out they keep their screen size so they stay readable
  const kFit = fitBox().w / (svg.current?.clientWidth || 1000), kt = Math.max(k, kFit) * tScale;
  const txt = (p, s, color, size = 12, anchor = "middle", weight, keep) => <text x={p[0]} y={-p[1]} fontSize={size * kt} fill={color} textAnchor={anchor} dominantBaseline="middle" fontWeight={weight} stroke="none" data-keep={keep ? "" : undefined}>{s}</text>; // keep: never hidden by useDeclutter
  const ext = { x0: Math.min(...SX) - 1.2, x1: Math.max(...SX) + 1.2, y0: Math.min(...SY) - 1.2, y1: Math.max(...SY) + 1.2 };
  const ink = dark ? "#cdd1e2" : "#344054", muted = dark ? "#9097b1" : "#667085", btn = "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ring-1";
  const spanOf = (bi) => an?.spans.filter((s) => (s.members ?? [s.member]).includes(bi)) ?? [];
  const info = tools.find((t) => t[0] === tool) ?? SEL, labels = k < 0.045; // m per pixel: far out → no small labels
  const isSel = (kind, i) => sel?.kind === kind && sel.i === i;
  const from = lineTool ? start : null;
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {menu && <div className="fixed z-50 min-w-[170px] rounded-lg border border-gray-200 bg-white p-1 text-[13px] shadow-lg" style={{ left: menu.x, top: menu.y }} onPointerLeave={() => setMenu(null)}>
        <button onClick={() => { delItems(multi.length ? multi : [sel]); setMenu(null); }} className="block w-full rounded-md px-3 py-1.5 text-left text-red-600 hover:bg-red-50">ลบที่เลือก ({multi.length || 1})</button>
        <button onClick={() => { setMulti([]); setSel(null); setMenu(null); }} className="block w-full rounded-md px-3 py-1.5 text-left text-gray-700 hover:bg-gray-50">ยกเลิกการเลือก</button>
      </div>}
      <div className="flex flex-wrap items-center gap-1.5">
        {(step === "frame" || step === "grid") && <>
          <button onClick={() => { setGridOn(!gridOn); setFloor({ grid: { ...G, on: !gridOn } }); }} className={`${btn} ${gridOn ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}><Grid3x3 className="h-3.5 w-3.5" />กริด</button>
          <button onClick={() => setOrtho(!ortho)} className={`${btn} ${ortho ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}>ล็อคแกน</button>
          <button onClick={() => setSnapOn(!snapOn)} className={`${btn} ${snapOn ? "bg-brand-50 text-brand-500 ring-brand-500/40" : "text-gray-600 ring-gray-300"}`}><Magnet className="h-3.5 w-3.5" />จุดยึด</button>
        </>}
        <button onClick={() => setVb(fitBox())} className={`${btn} text-gray-600 ring-gray-300`}><Hand className="h-3.5 w-3.5" />พอดีจอ</button>
        {step === "frame" && gridOn && <>
          <button onClick={autoCols} className={`${btn} text-gray-600 ring-gray-300`}><Wand2 className="h-3.5 w-3.5" />เสาทุกโหนด</button>
          <button onClick={autoBeams} className={`${btn} text-gray-600 ring-gray-300`}><Wand2 className="h-3.5 w-3.5" />คานตามกริด</button>
        </>}
        {step === "frame" && <label className={`${btn} cursor-pointer text-gray-600 ring-gray-300`}><FileUp className="h-3.5 w-3.5" />นำเข้า DXF
          <input type="file" accept=".dxf" className="hidden" onChange={async (e) => {
            const f = e.target.files[0]; e.target.value = "";
            if (!f) return;
            const dxf = parseDxf(await f.text()), all = Object.values(dxf.layers).flat().flatMap((x) => x.pts);
            const span = all.length ? Math.max(...all.map((p) => p[0])) - Math.min(...all.map((p) => p[0])) : 0;
            const role = (l) => ({ columns: "columns", plates: "beams", inner: "beams" }[guessRole(l)] ?? (/beam|คาน|^b\d/i.test(l) ? "beams" : "skip"));
            const scale = dxf.unit ?? (span > 300 ? 0.001 : 1), f3 = onImportFrame ? frame3dFromDxf(dxf, scale) : null; // a 3D model: storeys / columns / beams from the geometry
            setImp({ name: f.name, dxf, scale, f3, use: f3 ? f3.floors.map(() => true) : null, names: f3 ? f3.floors.map((fl, k) => `${k === 0 && fl.h <= 2 ? "คานคอดิน" : fl.beams.length ? `ชั้น ${k + (f3.floors[0].h <= 2 ? 1 : 1)}` : "หัวเสา"} ${fl.z >= 0 ? "+" : "−"}${Math.abs(fl.z).toFixed(2)}`) : null,
              roles: Object.fromEntries(Object.keys(dxf.layers).map((l) => [l, role(l)])) });
          }} /></label>}
        {onCopyBelow && <><button onClick={() => onCopyBelow(true)} title="แทนเสาและคานชั้นนี้ด้วยของชั้นล่าง (ย้อนกลับได้ Ctrl+Z)" className={`${btn} text-gray-600 ring-gray-300`}><Copy className="h-3.5 w-3.5" />คัดลอกชั้นล่าง</button>
          <button onClick={() => onCopyBelow(false)} title="วางเสาตรงเสาชั้นล่างทุกต้น ลบคานชั้นนี้ (เช่น ชั้นอะเส / ชั้นที่มีแต่เสา)" className={`${btn} text-gray-600 ring-gray-300`}>เฉพาะเสา</button></>}
        <TextSizeControl />
        {onDxf && <button onClick={onDxf} className={`${btn} text-gray-600 ring-gray-300`}><Download className="h-3.5 w-3.5" />DXF</button>}
        {modeBar && <div className="ml-auto">{modeBar}</div>}
      </div>
      <div className="flex min-h-0 flex-1 gap-2">
      {tools.length > 1 && <div className="flex w-[64px] shrink-0 flex-col gap-1">
        {tools.map(([key, label, Icon, hint]) => (
          <Tip key={key} text={hint ? `${label} — ${hint}` : label}><button onClick={() => setTool(key)}
            className={`flex flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium ring-1 ${tool === key ? "bg-brand-500 text-[#fff] ring-brand-500" : "bg-white text-gray-600 ring-gray-200 hover:bg-gray-50"}`}><Icon className="h-4 w-4" /><span className="leading-tight">{label}</span></button></Tip>
        ))}
      </div>}
      <div className={`relative ${compact ? "min-h-[180px]" : "min-h-[420px]"} flex-1 overflow-hidden rounded-xl bg-gray-50`}>
        <svg ref={svg} viewBox={`${vb.x} ${-(vb.y + vb.h)} ${vb.w} ${vb.h}`} className={`h-full w-full select-none ${tool === "select" ? "cursor-default" : "cursor-crosshair"}`}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { if (drag?.box) endBox(); setDrag(null); }} onPointerLeave={() => { setDrag(null); setCur(null); }} onContextMenu={(e) => e.preventDefault()} onWheel={onWheel}>
          <defs><pattern id="gs-hatch" width={0.3} height={0.3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="0.3" stroke={muted} strokeWidth={0.02} /></pattern></defs>
          {gridOn && <>
            <g stroke={dark ? "#323a5c" : "#e4e7ec"}>
              {SX.filter((x) => !GX.includes(x)).map((x) => <line key={`sx${x}`} x1={x} x2={x} y1={-ext.y1} y2={-ext.y0} strokeWidth={0.6 * k} />)}
              {SY.filter((y) => !GY.includes(y)).map((y) => <line key={`sy${y}`} y1={-y} y2={-y} x1={ext.x0} x2={ext.x1} strokeWidth={0.6 * k} />)}
            </g>
            <g stroke={dark ? "#6e7591" : "#98a2b3"}>
              {GX.map((x, i) => <g key={`gx${i}`}><line x1={x} x2={x} y1={-ext.y1} y2={-ext.y0} strokeWidth={k} strokeDasharray={`${14 * k} ${4 * k} ${3 * k} ${4 * k}`} />
                <circle cx={x} cy={-(ext.y1 + 12 * kt)} r={11 * kt} fill={dark ? "#181c30" : "#fff"} strokeWidth={1.2 * k} />{txt([x, ext.y1 + 12 * kt], xName(i), ink, 11, "middle", undefined, true)}</g>)}
              {GY.map((y, i) => <g key={`gy${i}`}><line y1={-y} y2={-y} x1={ext.x0} x2={ext.x1} strokeWidth={k} strokeDasharray={`${14 * k} ${4 * k} ${3 * k} ${4 * k}`} />
                <circle cx={ext.x1 + 12 * kt} cy={-y} r={11 * kt} fill={dark ? "#181c30" : "#fff"} strokeWidth={1.2 * k} />{txt([ext.x1 + 12 * kt, y], yName(i), ink, 11, "middle", undefined, true)}</g>)}
              {GX.slice(1).map((x, i) => <g key={`dx${i}`}>{txt([(x + GX[i]) / 2, ext.y1 - 6 * k], fmt(x - GX[i], 2), muted, 10, "middle", undefined, true)}</g>)}
              {GY.slice(1).map((y, i) => <g key={`dy${i}`}>{txt([ext.x1 - 6 * k, (y + GY[i]) / 2], fmt(y - GY[i], 2), muted, 10, "end", undefined, true)}</g>)}
            </g>
          </>}
          {an?.panels.map((p, i) => { // slab panels: kind, thickness, loads of the shown groups
            const c = p.P.reduce((s, q) => [s[0] + q[0] / p.P.length, s[1] + q[1] / p.P.length], [0, 0]), on = sel?.kind === "panel" && sel.key === p.key;
            const loads = ["DL", "SDL", "WALL", "LL"].filter((g) => show[g] && p.g[g] > 0).map((g) => `${g === "WALL" ? "ผนัง" : g} ${fmt(p.g[g], 0)}`).join(" · ");
            return (
              <g key={p.key}>
                <polygon points={p.P.map((q) => `${q[0]},${-q[1]}`).join(" ")} fill={on ? "#f7900933" : p.st === "GS" ? "url(#gs-hatch)" : p.open ? "none" : p.st === "PS" ? (dark ? "#30a46c1a" : "#30a46c12") : dark ? "#465fff14" : "#465fff0d"} stroke="none" />
                {p.st === "PS" && (() => { const v = p.dir === "x" ? [1, 0] : [0, 1], L = 0.8; return <line x1={c[0] - v[0] * L} y1={-(c[1] - v[1] * L)} x2={c[0] + v[0] * L} y2={-(c[1] + v[1] * L)} stroke="#30a46c" strokeWidth={2 * k} markerEnd="url(#arr)" markerStart="url(#arr)" />; })()}
                {txt([c[0], c[1] + 20 * k], `P${i + 1} ${p.open ? "ช่องเปิด" : p.st === "GS" ? "GS บนดิน" : `${p.st} ${fmt(p.t * 100, 0)} ซม.${p.st === "PS" ? ` วาง${p.dir === "x" ? "แนว X" : "แนว Y"}` : p.kind === "twoway" ? " 2 ทาง" : p.kind === "oneway" ? " 1 ทาง" : ""}`}`, muted, 11, "middle", 600)}
                {labels && step === "slab" && !p.open && p.st !== "GS" && loads && txt([c[0], c[1] + 4 * k], `${loads} กก./ม.²`, muted, 10)}
              </g>
            );
          })}
          {an?.cants.map((c, i) => {
            const m = c.P.reduce((s, q) => [s[0] + q[0] / 4, s[1] + q[1] / 4], [0, 0]);
            return (
              <g key={`ct${i}`}>
                <polygon points={c.P.map((q) => `${q[0]},${-q[1]}`).join(" ")} fill={isSel("cant", i) ? "#f7900944" : dark ? "#8e4ec622" : "#8e4ec614"} stroke="#8e4ec6" strokeWidth={1.2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
                {txt(m, `พื้นยื่น ${fmt(c.L, 2)} ม. · ${fmt(c.w, 0)} กก./ม.²`, "#8e4ec6", 10, "middle", 600)}
              </g>
            );
          })}
          {beams.map((b, i) => { // beams: neutral while drawing, coloured by type in the results
            const sp = spanOf(i), ti = sp[0]?.typeIdx, bad = sp.some((s) => !s.ok);
            const color = result && ti !== undefined ? (bad ? "#f04438" : TYPE_COLORS[ti % TYPE_COLORS.length]) : dark ? "#7b8cff" : "#465fff";
            const m = [(b.a[0] + b.b[0]) / 2, (b.a[1] + b.b[1]) / 2], L = dist(b.a, b.b), n = [-(b.b[1] - b.a[1]) / L, (b.b[0] - b.a[0]) / L];
            return (
              <g key={`b${i}`}>
                {isSel("beam", i) && <polyline points={arcPolyline(b.a, b.b, b.arc?.s).map((p) => `${p[0]},${-p[1]}`).join(" ")} fill="none" stroke="#f79009" strokeOpacity={0.45} strokeWidth={14 * k} strokeLinecap="round" />}
                <polyline points={arcPolyline(b.a, b.b, b.arc?.s).map((p) => `${p[0]},${-p[1]}`).join(" ")} fill="none" stroke={color} strokeWidth={(result ? 5 : 4) * k} strokeLinecap="round" opacity={step === "wall" || step === "slab" ? 0.6 : 1} />
                {result && ti !== undefined && txt([m[0] - n[0] * 11 * k, m[1] - n[1] * 11 * k], `${types[ti]?.name}${sp.length && sp.every((x) => x.kind === "cantilever") ? "A" : ""}${bad ? " ✕" : ""}`, color, 11, "middle", 600)}
                {/* a cantilever part of a longer drawn beam gets its own tag (B1A = B1, top bars the whole cantilever) */}
                {result && sp.length > 1 && sp.filter((x) => x.kind === "cantilever").map((x) => { const q = [(x.a[0] + x.b[0]) / 2, (x.a[1] + x.b[1]) / 2]; return <g key={x.id}>{txt([q[0] + n[0] * 11 * k, q[1] + n[1] * 11 * k], `${x.typeName ?? ""}${x.ok ? "" : " ✕"}`, x.ok ? color : "#f04438", 10, "middle", 600)}</g>; })}
                {!result && step === "frame" && b.type != null && txt([m[0] - n[0] * 11 * k, m[1] - n[1] * 11 * k], types[b.type]?.name, color, 11)}
              </g>
            );
          })}
          {(step === "frame" || result) && (an?.lines ?? []).flatMap((ln) => ln.carriers.map((c) => { // △ = end of a secondary beam resting on a main beam
            // at an end the triangle points into the beam; at an interior support (a beam resting on a cantilever tip) it sits across it
            const end0 = c.t < 1e-6, end1 = c.t > ln.L - 1e-6, at = [ln.A[0] + ln.u[0] * c.t, ln.A[1] + ln.u[1] * c.t];
            const u = end0 ? ln.u : end1 ? [-ln.u[0], -ln.u[1]] : [ln.u[1], -ln.u[0]], s = 7 * k, tip = [at[0] + u[0] * 2 * k, at[1] + u[1] * 2 * k];
            const P = [[tip[0], tip[1]], [tip[0] + u[0] * 1.7 * s - u[1] * s, tip[1] + u[1] * 1.7 * s + u[0] * s], [tip[0] + u[0] * 1.7 * s + u[1] * s, tip[1] + u[1] * 1.7 * s - u[0] * s]];
            return <polygon key={`cr${ln.id}-${c.t}`} points={P.map((p) => `${p[0]},${-p[1]}`).join(" ")} fill={dark ? "#1d2939" : "#fff"} stroke={dark ? "#e3e6f0" : "#344054"} strokeWidth={1.2 * k}><title>{`แนว ${ln.id + 1} วางบนแนว ${c.host + 1} (คานซอยบนคานหลัก)`}</title></polygon>;
          }))}
          {show.WALL && walls.map((w0, i) => { // walls: true thickness of the type centred on the line, openings cut out, label = load per metre
            const w = resolveW(w0), L = dist(w.a, w.b) || 1, u = [(w.b[0] - w.a[0]) / L, (w.b[1] - w.a[1]) / L], n = [-u[1], u[0]], q = wallLoad(w, wallTypes), t = wallTypes.find((x) => x.id === w.kind) ?? wallTypes[0];
            const th = Math.max(0.06, (t?.core ? wallThick(t) : t?.id === "brick2" ? 0.2 : 0.1) * (w.layers ?? 1)), m = [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2], P = (x, o) => [w.a[0] + u[0] * x + n[0] * o, w.a[1] + u[1] * x + n[1] * o];
            const ops = [...(w0.openings ?? [])].sort((a, b) => (a.at ?? 0) - (b.at ?? 0)), solid = []; let x = 0;
            for (const o of ops) { if ((o.at ?? 0) > x) solid.push([x, o.at ?? 0]); x = Math.min(L, (o.at ?? 0) + o.w); }
            if (x < L) solid.push([x, L]);
            const rect = ([a, b]) => [P(a, -th / 2), P(b, -th / 2), P(b, th / 2), P(a, th / 2)].map((p) => `${p[0]},${-p[1]}`).join(" ");
            return (
              <g key={`w${i}`} opacity={step === "wall" || step === "result" ? 1 : 0.7}>
                {isSel("wall", i) && <line x1={w.a[0]} y1={-w.a[1]} x2={w.b[0]} y2={-w.b[1]} stroke="#f79009" strokeOpacity={0.45} strokeWidth={Math.max(th + 0.12, 16 * k)} strokeLinecap="round" />}
                {solid.map((sg, j) => <polygon key={j} points={rect(sg)} fill={WALL_C} fillOpacity={0.35} stroke={WALL_C} strokeWidth={1.2 * k} />)}
                {ops.map((o, j) => { const a = o.at ?? 0, b = a + o.w;
                  return o.type === "door" ? <g key={`o${j}`} stroke={WALL_C} strokeWidth={1 * k} fill="none"><line x1={P(a, th / 2)[0]} y1={-P(a, th / 2)[1]} x2={P(a, th / 2 + o.w)[0]} y2={-P(a, th / 2 + o.w)[1]} />
                    <path d={`M ${P(a, th / 2 + o.w)[0]} ${-P(a, th / 2 + o.w)[1]} A ${o.w} ${o.w} 0 0 ${u[0] * n[1] - u[1] * n[0] > 0 ? 0 : 1} ${P(b, th / 2)[0]} ${-P(b, th / 2)[1]}`} strokeDasharray={`${3 * k} ${2 * k}`} /></g>
                    : <g key={`o${j}`} stroke={WALL_C} strokeWidth={0.8 * k}>{[-th / 2, 0, th / 2].map((d) => <line key={d} x1={P(a, d)[0]} y1={-P(a, d)[1]} x2={P(b, d)[0]} y2={-P(b, d)[1]} />)}</g>; })}
                <title>{`ผนัง ${i + 1}: ${t?.name}${(w.layers ?? 1) > 1 ? " เบิ้ล" : ""} สูง ${fmt(w.h, 2)} ม.${w0.hAuto ? " (อัตโนมัติ)" : ""}${ops.length ? ` · ช่องเปิด ${ops.length}` : w.open ? ` ช่องเปิด ${w.open}%` : ""} = ${fmt(q, 0)} กก./ม.`}</title>
                {step === "wall" && labels && txt([m[0] + n[0] * (th / 2 + 14 * k), m[1] + n[1] * (th / 2 + 14 * k)], `W${i + 1}${(w.layers ?? 1) > 1 ? "×2" : ""} · ${fmt(q, 0)}`, WALL_C, 10, "middle", 600)}
              </g>
            );
          })}
          {stairs.map((st, i) => { // stair: outline, step lines across the run, arrow up, label
            const x0 = Math.min(st.a[0], st.b[0]), x1 = Math.max(st.a[0], st.b[0]), y0 = Math.min(st.a[1], st.b[1]), y1 = Math.max(st.a[1], st.b[1]), ax = st.up?.[1] ?? "x", sg = st.up?.[0] === "-" ? -1 : 1;
            const Lr = ax === "x" ? x1 - x0 : y1 - y0, n = Math.max(2, Math.round(Lr / (st.tread ?? 0.25))), c = [(x0 + x1) / 2, (y0 + y1) / 2], on = isSel("stair", i);
            return (
              <g key={`st${i}`}>
                <rect x={x0} y={-y1} width={x1 - x0} height={y1 - y0} fill={on ? "#f7900933" : dark ? "#0e938422" : "#0e938414"} stroke={ST_C} strokeWidth={1.5 * k} />
                {Array.from({ length: n - 1 }, (_, j) => { const t = (Lr * (j + 1)) / n; return ax === "x" ? <line key={j} x1={x0 + t} x2={x0 + t} y1={-y0} y2={-y1} stroke={ST_C} strokeWidth={0.6 * k} /> : <line key={j} y1={-(y0 + t)} y2={-(y0 + t)} x1={x0} x2={x1} stroke={ST_C} strokeWidth={0.6 * k} />; })}
                <line x1={ax === "x" ? c[0] - (sg * Lr) / 3 : c[0]} y1={-(ax === "y" ? c[1] - (sg * Lr) / 3 : c[1])} x2={ax === "x" ? c[0] + (sg * Lr) / 3 : c[0]} y2={-(ax === "y" ? c[1] + (sg * Lr) / 3 : c[1])} stroke={ST_C} strokeWidth={2.5 * k} markerEnd="url(#arrS)" />
                {txt([c[0], c[1] + 14 * k], `บันได ${i + 1} · ${STAIR_KINDS[st.kind ?? "long"]?.split(" ")[0] ?? ""} · ขึ้น`, ST_C, 11, "middle", 600)}
              </g>
            );
          })}
          {(show.SP || step === "other") && lineLoads.map((l, i) => {
            const m = [(l.a[0] + l.b[0]) / 2, (l.a[1] + l.b[1]) / 2], L = dist(l.a, l.b) || 1, n = [-(l.b[1] - l.a[1]) / L, (l.b[0] - l.a[0]) / L];
            return (
              <g key={`ll${i}`}>
                {isSel("lineLoad", i) && <line x1={l.a[0]} y1={-l.a[1]} x2={l.b[0]} y2={-l.b[1]} stroke="#f79009" strokeOpacity={0.45} strokeWidth={14 * k} strokeLinecap="round" />}
                <line x1={l.a[0]} y1={-l.a[1]} x2={l.b[0]} y2={-l.b[1]} stroke={SP_C} strokeWidth={2.5 * k} />
                {Array.from({ length: Math.max(2, Math.round(L / (28 * k))) + 1 }, (_, j, N = Math.max(2, Math.round(L / (28 * k)))) => { const t = j / N, p = [l.a[0] + (l.b[0] - l.a[0]) * t, l.a[1] + (l.b[1] - l.a[1]) * t], d = 12 * k;
                  return <line key={j} x1={p[0] - n[0] * d} y1={-(p[1] - n[1] * d)} x2={p[0] - n[0] * 2 * k} y2={-(p[1] - n[1] * 2 * k)} stroke={SP_C} strokeWidth={1.2 * k} markerEnd="url(#arrL)" />; })}
                <line x1={l.a[0] - n[0] * 12 * k} y1={-(l.a[1] - n[1] * 12 * k)} x2={l.b[0] - n[0] * 12 * k} y2={-(l.b[1] - n[1] * 12 * k)} stroke={SP_C} strokeWidth={1 * k} />
                {txt([m[0] - n[0] * 20 * k, m[1] - n[1] * 20 * k], `${l.name || "น้ำหนักเส้น"} ${fmt(l.q, 0)} กก./ม.`, SP_C, 10, "middle", 600)}
              </g>
            );
          })}
          {(show.SP || step === "other") && pointLoads.map((q, i) => (
            <g key={`pl${i}`}>
              <circle cx={q.p[0]} cy={-q.p[1]} r={(isSel("point", i) ? 11 : 8) * k} fill={SP_C} fillOpacity={0.25} stroke={isSel("point", i) ? "#f79009" : SP_C} strokeWidth={2 * k} />
              {txt([q.p[0] + 12 * k, q.p[1] + 10 * k], `${q.name ? `${q.name} ` : ""}${fmt(q.P, 0)} กก.`, SP_C, 10, "start", 600)}
            </g>
          ))}
          {multi.map((m, j) => { const P = ITEM[m.kind][1](listOf(m.kind)[m.i] ?? {}); if (!P[0]) return null;
            return P.length === 1 ? <circle key={`m${j}`} cx={P[0][0]} cy={-P[0][1]} r={14 * k} fill="#f79009" fillOpacity={0.3} />
              : <line key={`m${j}`} x1={P[0][0]} y1={-P[0][1]} x2={P[1][0]} y2={-P[1][1]} stroke="#f79009" strokeOpacity={0.5} strokeWidth={12 * k} strokeLinecap="round" />; })}
          {box && <rect x={Math.min(box.p0[0], box.p1[0])} y={-Math.max(box.p0[1], box.p1[1])} width={Math.abs(box.p1[0] - box.p0[0])} height={Math.abs(box.p1[1] - box.p0[1])}
            fill={box.p1[0] >= box.p0[0] ? "#465fff14" : "#12b76a14"} stroke={box.p1[0] >= box.p0[0] ? "#465fff" : "#12b76a"} strokeWidth={1.2 * k} strokeDasharray={box.p1[0] >= box.p0[0] ? "none" : `${5 * k} ${3 * k}`} />}
          {hl && <g pointerEvents="none">
            {hl.to && <line x1={hl.p[0]} y1={-hl.p[1]} x2={hl.to[0]} y2={-hl.to[1]} stroke="#d92d20" strokeWidth={2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />}
            <circle cx={hl.p[0]} cy={-hl.p[1]} r={16 * k} fill="#d92d2033" stroke={hl.bad ? "#d92d20" : "#12b76a"} strokeWidth={3 * k}><animate attributeName="r" values={`${12 * k};${24 * k};${12 * k}`} dur="1s" repeatCount="indefinite" /></circle>
            {hl.to && <circle cx={hl.to[0]} cy={-hl.to[1]} r={7 * k} fill="#d92d20" />}
          </g>}
          {ghost.map((c, i) => <rect key={`g${i}`} x={c[0] - 8 * k} y={-c[1] - 8 * k} width={16 * k} height={16 * k} fill="none" stroke="#98a2b3" strokeWidth={1.2 * k} strokeDasharray={`${3 * k} ${2 * k}`} />)}
          {cols.map((c, i) => {
            const R = an?.columns[i]?.R, ci = colInfo?.[i];
            return (
              <g key={`c${i}`}>
                {isSel("column", i) && <circle cx={c[0]} cy={-c[1]} r={15 * k} fill="none" stroke="#f79009" strokeWidth={3 * k} />}
                {(() => { const sz = colSize(i) ?? [0.2, 0.2], hx = Math.max(sz[0] / 2, 3 * k), hy = Math.max(sz[1] / 2, 3 * k); // true size (m), never under 6 px
                  return <rect x={c[0] - hx} y={-c[1] - hy} width={2 * hx} height={2 * hy} fill={ci ? (ci.ok ? ci.color : "#f04438") : dark ? "#f2f4fa" : "#1d2939"} stroke={dark ? "#0f1222" : "#fff"} strokeWidth={1.5 * k} />; })()}
                {ci && txt([c[0] + 9 * k, c[1] - 12 * k], ci.text, ci.ok ? ci.color : "#f04438", 10, "start", 600)}
                {result && R > 0 && txt([c[0] + 9 * k, c[1] - 12 * k], `${fmt(R / 1000, 1)} ตัน`, ink, 10, "start")}
              </g>
            );
          })}
          {from && cur?.p && (tool === "stair" ? <rect x={Math.min(from[0], cur.p[0])} y={-Math.max(from[1], cur.p[1])} width={Math.abs(cur.p[0] - from[0])} height={Math.abs(cur.p[1] - from[1])} fill="none" stroke={ST_C} strokeWidth={2 * k} strokeDasharray={`${5 * k} ${3 * k}`} />
            : <line x1={from[0]} y1={-from[1]} x2={cur.p[0]} y2={-cur.p[1]} stroke={tool === "wall" ? WALL_C : tool === "line" ? SP_C : "#465fff"} strokeWidth={4 * k} opacity={0.5} />)}
          {cur && (
            <g pointerEvents="none">
              {cur.p && <circle cx={cur.p[0]} cy={-cur.p[1]} r={5 * k} fill="none" stroke="#f04438" strokeWidth={2 * k} />}
              {(cur.p ?? lastRaw.current) && txt([(cur.p ?? lastRaw.current)[0] + 12 * k, (cur.p ?? lastRaw.current)[1] + 14 * k],
                `${cur.kind ?? ""}${from && cur.p ? ` · ${fmt(dist(from, cur.p), 2)} ม.` : ""}${typed ? ` · พิมพ์ ${typed} ม. ↵` : ""}`, "#f04438", 12, "start")}
            </g>
          )}
          <defs><marker id="arrL" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={SP_C} /></marker><marker id="arrS" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill={ST_C} /></marker><marker id="arr" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#30a46c" /></marker></defs>
        </svg>
        <div className="pointer-events-none absolute left-3 top-2 z-[1] rounded-lg bg-white/90 px-2 py-1 text-[12px] text-gray-600 shadow-theme-xs">{info[3]}</div>
        {cur?.p && <div className="pointer-events-none absolute right-3 top-2 rounded-lg bg-white/90 px-2 py-1 text-[12px] tabular-nums text-gray-600 shadow-theme-xs">X {fmt(cur.p[0], 2)} · Y {fmt(cur.p[1], 2)}</div>}
      </div>
      </div>
      {imp && (
        <Dialog open onOpenChange={(o) => !o && setImp(null)}>
          <DialogContent>
            <DialogTitle>นำเข้า {imp.name}</DialogTitle>
            {imp.f3 && <div className="mb-4 rounded-xl bg-brand-50/60 p-3 text-[13px] text-gray-700 ring-1 ring-brand-100">
              <p className="font-semibold text-brand-600">พบโครงสร้าง 3 มิติ — แยกจากรูปทรง (เส้นตั้ง = เสา · เส้นนอน = คานของระดับนั้น)</p>
              <p className="text-[12px] text-gray-500">โคนเสา (หลังฐานราก) ที่ระดับ {imp.f3.base.toFixed(2)} · เสา {imp.f3.counts.columns} ท่อน · คาน {imp.f3.counts.beams} เส้น{imp.f3.counts.sloped ? ` · เส้นเอียง ${imp.f3.counts.sloped} เส้น (ไม่ใช้)` : ""}</p>
              <table className="mt-2 w-full text-[12px] tabular-nums"><thead><tr className="text-left text-[11px] text-gray-500"><th>ใช้</th><th>ชื่อชั้น</th><th>ระดับ</th><th>สูงชั้น</th><th>เสา</th><th>คาน</th></tr></thead>
                <tbody>{[...imp.f3.floors.keys()].reverse().map((k) => { const fl = imp.f3.floors[k]; return <tr key={k} className="border-t border-brand-100">
                  <td><input type="checkbox" checked={imp.use[k]} onChange={() => setImp({ ...imp, use: imp.use.map((u, j) => (j === k ? !u : u)) })} /></td>
                  <td><input value={imp.names[k]} onChange={(e) => setImp({ ...imp, names: imp.names.map((n, j) => (j === k ? e.target.value : n)) })} className="h-7 w-full rounded border border-gray-300 bg-white px-1" /></td>
                  <td>{fl.z.toFixed(2)}</td><td>{fl.h.toFixed(2)}</td><td>{fl.columns.length}</td><td className={fl.beams.length ? "" : "text-[#b54708]"}>{fl.beams.length || "ไม่มีคาน"}</td></tr>; })}</tbody></table>
              <p className="mt-1 text-[11px] text-gray-500">ชั้นที่ไม่มีคาน = มีแต่หัวเสา (เช่นระดับหลังคา) วาดคานเพิ่มหรือเชื่อมหลังคาภายหลังได้ · ทุกคานเป็น type อัตโนมัติ · แทนชั้นทั้งหมดของโครงการ (ย้อนกลับได้ Ctrl+Z)</p>
              <button onClick={() => { onImportFrame(imp.f3, imp.use, imp.names); setImp(null); setTimeout(() => setVb(fit()), 80); }} className={`${btn} mt-2 bg-brand-500 text-[#fff] ring-brand-500`}>นำเข้าโครงสร้างทั้งหลัง ({imp.use.filter(Boolean).length} ชั้น)</button>
              <p className="mt-3 border-t border-brand-100 pt-2 text-[11px] text-gray-500">หรือนำเข้าเฉพาะชั้นนี้ตามเลเยอร์ด้านล่าง</p>
            </div>}
            <p className="mb-3 text-[12px] text-gray-500">เลือกว่าแต่ละเลเยอร์คืออะไร · เสา = วงกลม/บล็อก/สี่เหลี่ยมเล็ก (ใช้จุดกึ่งกลาง) · คาน = เส้น · แทนที่เสาและคานของชั้นนี้ (ย้อนกลับได้ Ctrl+Z) · กริดสร้างจากตำแหน่งเสา</p>
            <label className="mb-3 flex items-center gap-2 text-[13px] text-gray-600">หน่วยในแบบ CAD
              <select value={imp.scale} onChange={(e) => setImp({ ...imp, scale: Number(e.target.value) })} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
                {[[0.001, "มิลลิเมตร"], [0.01, "เซนติเมตร"], [1, "เมตร"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
              </select>
            </label>
            <div className="max-h-[50vh] space-y-1.5 overflow-auto">
              {Object.entries(imp.dxf.layers).map(([layer, ents]) => (
                <div key={layer} className="grid grid-cols-[1fr_80px_150px] items-center gap-2 text-[13px]">
                  <span className="truncate font-medium text-gray-800">{layer}</span><span className="text-gray-400">{ents.length} ชิ้น</span>
                  <select value={imp.roles[layer]} onChange={(e) => setImp({ ...imp, roles: { ...imp.roles, [layer]: e.target.value } })} className="h-8 rounded-lg border border-gray-300 bg-transparent px-2">
                    {[["skip", "— ไม่ใช้ —"], ["columns", "เสา"], ["beams", "คาน"]].map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setImp(null)} className={`${btn} text-gray-600 ring-gray-300`}>ยกเลิก</button>
              <button onClick={() => {
                const roles = Object.fromEntries(Object.entries(imp.roles).map(([l, r]) => [l, r === "beams" ? "plates" : r]));
                const r = toPlan(imp.dxf, roles, imp.scale);
                if (!r) return setImp(null);
                const u = (a) => [...new Set(a.map((v) => +v.toFixed(3)))].sort((p, q) => p - q), gaps = (v) => v.slice(1).map((x, i) => +(x - v[i]).toFixed(3));
                const xs = u(r.columns.map((p) => p[0])), ys = u(r.columns.map((p) => p[1]));
                commit({ columns: r.columns, beams: r.plates.map((b) => ({ a: round3(b.a), b: round3(b.b), type: null })) });
                if (xs.length > 1 && ys.length > 1) setFloor({ grid: { x0: xs[0], y0: ys[0], dx: gaps(xs), dy: gaps(ys), sub: G.sub ?? 1, on: G.on } });
                setImp(null);
              }} className={`${btn} bg-brand-500 text-[#fff] ring-brand-500`}>นำเข้า</button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export { GROUPS };
