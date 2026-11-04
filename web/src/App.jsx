import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Building2, Calculator, Moon, Sun, Columns3, Download, FileDown, FilePlus2, FolderOpen, Footprints, House, Landmark, Layers, Menu, RectangleHorizontal, Save,
  Ruler, Square, Wrench, X } from "lucide-react";
import { BARS, STIRRUPS, BEAM_TYPES, GRADES } from "../engine/tables.js";
import { Badge, Button, Card, ErrorBoundary, Field, NumberInput, Select, TextInput } from "./ui.jsx";
import Drawing from "./Drawing.jsx";
import { beamSectionModel, downloadDxf } from "./drawings.js";

export const sectionModel = (st, sec, showText) => beamSectionModel({
  b: st.geom.b, h: st.geom.h, cover: st.mat.cover, stirrupBar: st.stirrup.bar,
  top: st[sec].top, bottom: st[sec].bottom, showText,
});
import Report from "./Report.jsx";
import { DEFAULT_STATE, beamForces, fmt, runBeam, sectionOk, spanFunctions } from "./beamModel.js";
import ForceCharts from "./ForceCharts.jsx";
import { printReport } from "./ReportKit.jsx";
import BeamCage3D from "./BeamCage3D.jsx";
import { DEFAULT_SLAB, SlabPage, SlabReport } from "./SlabPage.jsx";
import { ColumnPage, ColumnReport, DEFAULT_COLUMN } from "./ColumnPage.jsx";
import { DEFAULT_STAIR, StairPage, StairReport } from "./StairPage.jsx";
import { DEFAULT_ROOF, EMPTY_ROOF, RoofPage } from "./RoofPage.jsx";
import { RoofReport } from "./RoofReport.jsx";
import { DEFAULT_FOOTING, FootingPage, FootingReport } from "./FootingPage.jsx";
import { DEFAULT_FRAME, FramePage } from "./FramePage.jsx";
import { applyStandard } from "./DesignCriteria.jsx";
import { FrameReport } from "./FrameReport.jsx";
import { WorkReport } from "./WorkReport.jsx";
import { analyzeFrame } from "../engine/frame.js";
import { roofFromFrame, roofPoints } from "./roofLink.js";
import { RoofLinkCard } from "./RoofLinkCard.jsx";
import { loadSkeleton, runRoof } from "./RoofPage.jsx";
import { autoInnerPlates } from "../engine/roofMembers.js";
import { HelpCircle, Redo2, Undo2 } from "lucide-react";
import { StepGuide, Tour, markTourSeen, tourSeen } from "./Help.jsx";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { BRAND, imageToDataUrl, saveBrand, useBrand } from "./brand.js";
import { SnapshotStation } from "./Snapshot3D.jsx";

const BAR_OPTS = [["", "—"], ...Object.keys(BARS).map((k) => [k, k])];
// single-member calculators (tools); the building itself is designed in the workflow
const MODULES = [["beam", "คานเดี่ยว", RectangleHorizontal], ["slab", "พื้นเดี่ยว", Square], ["column", "เสาเดี่ยว", Columns3], ["stair", "บันไดเดี่ยว", Footprints], ["footing", "ฐานรากเดี่ยว", Landmark]];
// one project = one workflow: model bottom up, analyse top down, design, report
export const WORKFLOW = [["project", "ข้อมูลโครงการ"], ["grid", "กริด / ระดับชั้น"], ["frame", "เสา คาน พื้น"], ["stair", "บันได"], ["roof", "หลังคา"],
  ["loads", "น้ำหนักบรรทุก"], ["analysis", "วิเคราะห์"], ["design", "ออกแบบสมาชิก"], ["footing", "ฐานราก"], ["report", "รายการคำนวณ"]];
const TITLES = { beam: ["ออกแบบคาน คสล.", "beamNo"], slab: ["ออกแบบพื้น คสล.", null], column: ["ออกแบบเสา คสล.", null], stair: ["ออกแบบบันได คสล.", null], footing: ["ออกแบบฐานรากแผ่", null], roof: ["ออกแบบโครงหลังคาเหล็ก", null], frame: ["ออกแบบคาน-เสาจากแปลน", null], work: ["โครงการ", null] };
const GRADE_OPTS = Object.entries(GRADES).map(([k, g]) => [k, `${g} (${k})`]);

// Light/dark theme: remembered per browser, first visit follows the OS setting.
function useTheme() {
  const [dark, setDark] = useState(() => {
    try {
      const saved = localStorage.getItem("theme");
      if (saved) return saved === "dark";
    } catch { /* storage unavailable */ }
    return matchMedia("(prefers-color-scheme: dark)").matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch { /* ignore */ }
  }, [dark]);
  return [dark, setDark];
}

function useStore() {
  const [st, setSt] = useState(() => { // the project part (name, owner, engineer…) survives a page reload
    try { const p = JSON.parse(localStorage.getItem("structcalc.project")); if (p) return { ...DEFAULT_STATE, project: { ...DEFAULT_STATE.project, ...p } }; } catch { /* first visit */ }
    return DEFAULT_STATE;
  });
  useEffect(() => { try { localStorage.setItem("structcalc.project", JSON.stringify(st.project)); } catch { /* ignore */ } }, [st.project]);
  const set = (path, v) =>
    setSt((s) => {
      const n = structuredClone(s);
      const keys = path.split(".");
      let o = n;
      keys.slice(0, -1).forEach((k) => (o = o[k] ??= {}));
      o[keys.at(-1)] = v;
      return n;
    });
  return [st, set, setSt]; // setSt replaces the whole beam state (project open)
}

const sel = "h-8 rounded-md border border-gray-300 bg-white px-1.5 text-xs outline-none focus:border-brand-500";

function BarsEditor({ st, set, sec, face, label }) {
  return (
    <div>
      <div className="mb-1 grid grid-cols-[2.5rem_1fr_1fr] gap-1.5 text-[11px] text-gray-400">
        <span className="font-semibold text-gray-600">{label}</span><span>เหล็กหลัก</span><span>เหล็กเสริมพิเศษ</span>
      </div>
      <div className="space-y-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="grid grid-cols-[2.5rem_1fr_1fr] items-center gap-1.5 text-xs">
            <span className="text-gray-400">ชั้น {i + 1}</span>
            {["main", "special"].map((g) => {
              const p = `${sec}.${face}.${i}.${g}`;
              const v = st[sec][face][i]?.[g] ?? {};
              return (
                <div key={g} className="flex gap-1">
                  <input type="number" min="0" className={`${sel} w-11`} value={v.n ?? 0}
                    onChange={(e) => set(p, { bar: v.bar || "DB 16", n: Number(e.target.value) })} />
                  <select className={`${sel} w-full`} value={v.n ? v.bar : ""}
                    onChange={(e) => set(p, e.target.value ? { n: v.n || 2, bar: e.target.value } : { n: 0 })}>
                    {BAR_OPTS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Row({ label, value, unit, ok }) {
  return (
    <div className="flex items-center justify-between border-b border-gray-100 py-[5px] text-[13px] last:border-0">
      <span className="text-gray-500">{label}</span>
      <span className="flex items-center gap-1.5 font-medium tabular-nums">
        {value} <span className="text-[11px] text-gray-400">{unit}</span>
        {ok !== undefined && <Badge ok={ok} />}
      </span>
    </div>
  );
}

function SectionCard({ title, sec, st, set, res }) {
  const { r, inp, error } = res;
  const s = sec === "mid" ? "sMid" : "sSup";
  const pass = r && sectionOk(r);
  return (
    <Card title={<span className="flex w-full items-center justify-between">{title}{r && <Badge ok={pass}>{pass ? "ผ่านทุกข้อ" : "ยังไม่ผ่าน"}</Badge>}</span>}
      icon={Layers} className="flex min-h-0 flex-col" bodyClass="flex-1">
      {error ? <p className="text-sm text-red-600">{error}</p> : (
        <div className="flex h-full flex-col justify-between gap-3">
          <div className="grid grid-cols-[120px_1fr] gap-3">
            <div className="flex flex-col items-center justify-center gap-1 rounded-xl bg-gray-50 p-1.5">
              <Drawing model={sectionModel(st, sec, false)} className="h-[190px] w-full" fontSize={14} width={200} />
              <button onClick={() => downloadDxf(sectionModel(st, sec, true), `${st.project.beamNo}-${sec}`)}
                className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-500 hover:underline">
                <Download className="h-3 w-3" /> DXF
              </button>
            </div>
            <div>
              <Row label={`M (${inp.tensionAtTop ? "−" : "+"})`} value={fmt(inp.M, 0)} unit="kg-m" />
              <Row label={`Mc · ${r.mode === "singly" ? "singly" : "doubly"}`} value={fmt(r.Mc, 0)} unit="kg-m" />
              <Row label="As ดึง ต้องการ/ใส่" value={`${fmt(r.reqBot)}/${fmt(r.provBot)}`} ok={r.botOk} />
              <Row label="As' อัด ต้องการ/ใส่" value={`${fmt(r.reqTop)}/${fmt(r.provTop)}`} ok={r.topOk} />
              <Row label="As min" value={fmt(r.AsMin)} ok={r.AsMinOk} />
              <Row label="V' ≤ Vc2" value={fmt(r.Vp, 0)} unit="kg" ok={r.VpOk} />
              <Row label="vt ≤ 1.32√f'c" value={fmt(r.vt, 2)} ok={r.vtOk} />
              <Row label="s max" value={typeof r.sMax === "number" ? fmt(r.sMax) : "เกิน"} unit="m" ok={r.stirrup !== "CHECK_SPACING"} />
            </div>
          </div>
          <div className="space-y-2.5">
            <BarsEditor st={st} set={set} sec={sec} face="top" label="บน" />
            <BarsEditor st={st} set={set} sec={sec} face="bottom" label="ล่าง" />
            <div className="flex items-center gap-2 text-xs text-gray-500">
              ปลอก {st.stirrup.sets}-{st.stirrup.bar} @
              <input type="number" step="0.025" className={`${sel} w-20`} value={st.stirrup[s]}
                onChange={(e) => set(`stirrup.${s}`, Number(e.target.value))} /> ม.
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function ProjectDialog({ st, set, onClose }) {
  return (
    <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">ข้อมูลโครงการ</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {[["name", "โครงการ"], ["owner", "เจ้าของ"], ["location", "สถานที่"], ["engineer", "วิศวกร"],
            ["license", "เลขทะเบียน"], ["beamNo", "หมายเลขคาน"], ["floor", "ชั้น"], ["date", "วันที่"]].map(([k, l]) => (
            <div key={k} className={["name", "location"].includes(k) ? "col-span-2" : ""}>
              <Field label={l}><TextInput value={st.project[k]} onChange={(v) => set(`project.${k}`, v)} /></Field>
            </div>
          ))}
        </div>
        <div className="mt-5 text-right"><Button onClick={onClose}>เสร็จ</Button></div>
      </div>
    </div>
  );
}

// saved roof data on top of the current defaults (older files lack newer fields)
// saved frame on top of the defaults; a P1 file (one `floor`) becomes a one-floor `floors` list
const mergeFrame = (s) => {
  const floors = s.floors ?? (s.floor ? [s.floor] : DEFAULT_FRAME.floors);
  return { ...DEFAULT_FRAME, ...s, floor: undefined, floors, cur: Math.min(s.cur ?? 0, floors.length - 1), mat: { ...DEFAULT_FRAME.mat, ...s.mat },
    colTypes: s.colTypes?.[0]?.levels?.[0]?.n ? s.colTypes : DEFAULT_FRAME.colTypes,
    beamTypes: s.beamTypes?.length ? s.beamTypes : DEFAULT_FRAME.beamTypes, wallTypes: s.wallTypes?.length ? s.wallTypes : DEFAULT_FRAME.wallTypes };
};
const mergeRoof = (s) => ({ ...DEFAULT_ROOF, ...s, frame: { ...DEFAULT_ROOF.frame, ...s.frame }, design: { ...DEFAULT_ROOF.design, ...s.design, types: undefined } });

export default function App() {
  const [st, set, replaceSt] = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [mod, setModState] = useState(() => { const h = location.hash.slice(1); return h === "frame" || h === "roof" || h === "work" ? "work" : h in TITLES ? h : "work"; });
  const setMod = (m) => { setModState(m); history.replaceState(null, "", `${location.search}#${m}`); };
  const [step, setStepState] = useState(() => { const q = new URLSearchParams(location.search).get("step"), h = location.hash.slice(1);
    return WORKFLOW.some((w) => w[0] === q) ? q : h === "roof" ? "roof" : h === "frame" ? "design" : "frame"; });
  const setStep = (k) => { setStepState(k); setMod("work"); try { const q = new URLSearchParams(location.search); q.set("step", k); history.replaceState(null, "", `${location.pathname}?${q}#work`); } catch { /* ignore */ } }; // a reload stays on this step
  const [toolsOpen, setToolsOpen] = useState(false);
  // roof plan from the structure: outline, columns, plates, grid, plate level; the roof loads then go to the top floor's columns
  // an interior plate passing over columns rests on them: split it there (one simple span per column-to-column piece)
  const splitAtColumns = (plates, cols) => plates.flatMap(({ a, b }) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]), u = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
    const ts = cols.map((c) => { const d = [c[0] - a[0], c[1] - a[1]], t = d[0] * u[0] + d[1] * u[1]; return Math.abs(d[0] * u[1] - d[1] * u[0]) < 0.05 && t > 0.05 && t < L - 0.05 ? t : null; }).filter((t) => t !== null).sort((x, y) => x - y);
    const pts = [a, ...ts.map((t) => [+(a[0] + u[0] * t).toFixed(3), +(a[1] + u[1] * t).toFixed(3)]), b];
    return pts.slice(1).map((q, i) => ({ a: pts[i], b: q }));
  });
  // roof from the structure (user: import only the columns and the plan, I draw the roof shape and the wall plates myself):
  // columns + grid + plate level + a faint guide of the top floor (outline + beams) to trace; the roof loads are linked to that floor
  const roofFromStructure = () => {
    const r = roofFromFrame(frame, fres);
    if (r.error) { setNotice({ ok: false, text: r.error }); return; }
    const { linkFloor, pts, columns, grid, H } = r, beams = (frame.floors[linkFloor]?.beams ?? []).map((b) => ({ a: b.a, b: b.b }));
    const patch = { columns, grid, H, fromFrame: true, guide: { outline: pts, beams } };
    remember(); setRoofState((x) => { const next = { ...x, ...patch }; try { localStorage.setItem("structcalc.roof", JSON.stringify(next)); } catch { /* ignore */ } return next; });
    setFrame("roofLink", { on: true, floor: linkFloor });
    setNotice({ ok: true, text: `นำเข้าเสา ${columns.length} ต้น + กริด + แปลน ${frame.floors[linkFloor].name} (เส้นจาง) แล้ว — วาดผนัง/ขอบหลังคา (หรือกด "ใช้ขอบอาคารเป็นผนัง") และวาดอะเสเอง แรงหลังคาจะลงเสา/คานชั้นนั้นอัตโนมัติ` });
  };
  const [tour, setTour] = useState(() => !tourSeen() && !new URLSearchParams(location.search).has("print"));
  const closeTour = () => { markTourSeen(); setTour(false); };
  const [slab, setSlabState] = useState(DEFAULT_SLAB);
  const [column, setColumnState] = useState(DEFAULT_COLUMN);
  const setColumn = (k, v) => setColumnState((c) => ({ ...c, [k]: v }));
  const [stairSt, setStairState] = useState(DEFAULT_STAIR);
  const setStair = (k, v) => setStairState((x) => ({ ...x, [k]: v }));
  // roof input is kept in this browser so a reload does not lose a traced outline
  const [roof, setRoofState] = useState(() => {
    try {
      const s = JSON.parse(localStorage.getItem("structcalc.roof"));
      if (s?.pts) return mergeRoof(s);
    } catch { /* unavailable or corrupt: start empty */ }
    return EMPTY_ROOF;
  });
  // saved on edits only (an effect would also re-save a stale copy whenever another tab hot-reloads)
  // beam & column framing: kept in this browser like the roof
  const [frame, setFrameState] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem("structcalc.frame")); if (s?.floors || s?.floor) return mergeFrame(s); } catch { /* start from the example */ }
    return DEFAULT_FRAME;
  });
  const hist = useRef({ undo: [], redo: [], t: 0 }), [, bump] = useState(0), live = useRef({ frame: null, roof: null });
  const [dirty, setDirty] = useState(false);
  const remember = () => {
    setDirty(true);
    const h = hist.current, now = Date.now();
    if (now - h.t > 600) { h.undo = [...h.undo.slice(-99), { frame: live.current.frame, roof: live.current.roof }]; h.redo = []; bump((x) => x + 1); }
    h.t = now;
  };
  const restore = (from, to) => {
    const h = hist.current, s = h[from].at(-1);
    if (!s) return;
    h[from] = h[from].slice(0, -1); h[to] = [...h[to], { frame: live.current.frame, roof: live.current.roof }]; h.t = 0;
    setFrameState(s.frame); setRoofState(s.roof);
    try { localStorage.setItem("structcalc.frame", JSON.stringify(s.frame)); localStorage.setItem("structcalc.roof", JSON.stringify(s.roof)); } catch { /* ignore */ }
    bump((x) => x + 1);
  };
  const setFrame = (k, v) => { remember(); setFrameState((x) => {
    const next = { ...x, [k]: v };
    try { localStorage.setItem("structcalc.frame", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }); };
  const setRoof = (k, v) => { remember(); setRoofState((x) => {
    const next = { ...x, [k]: v };
    try { localStorage.setItem("structcalc.roof", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
  }); };
  live.current = { frame, roof };
  const fres = useMemo(() => {
    try { return analyzeFrame(frame); } catch (e) { // never take the whole app down: show the reason as a warning
      const empty = { spans: [], panels: [], lines: [], columns: [], cants: [], walls: [], stairs: [], lineLoads: [], pointLoads: [], down: [], groups: {}, warnings: [] };
      return { floors: frame.floors.map(() => empty), columns: [], stacks: [], footings: [], warnings: [`วิเคราะห์ไม่ได้: ${e.message}`], ok: false };
    }
  }, [frame]);
  useEffect(() => { // roof → structure link: refresh the roof reactions (not an undo step) when the roof or the link changes
    if (!frame.roofLink?.on || !roof?.pts) return;
    // nothing drawn to carry the roof yet (no columns / plates — e.g. the user cleared them): no load points, nothing to ask about
    if (!(roof.columns?.length || roof.plates?.length || roof.innerPlates?.length)) { setFrameState((x) => (x.roofPoints?.length ? { ...x, roofPoints: [] } : x)); return; }
    let alive = true;
    roofPoints(roof, frame.floors[frame.roofLink.floor ?? frame.floors.length - 1] ?? {}).then((r) => { if (!alive || r.error) return; setFrameState((x) => { const next = { ...x, roofPoints: r.pts }; try { localStorage.setItem("structcalc.frame", JSON.stringify(next)); } catch { /* ignore */ } return next; }); });
    return () => { alive = false; };
  }, [roof, frame.roofLink?.on, frame.roofLink?.floor, frame.floors[frame.roofLink?.floor ?? frame.floors.length - 1]?.beams, frame.floors[frame.roofLink?.floor ?? frame.floors.length - 1]?.columns]); // eslint-disable-line react-hooks/exhaustive-deps // the whole building, shared by every workflow step
  useEffect(() => {
    const k = (e) => {
      // physical keys (e.code): with the Thai keyboard layout Ctrl+Z sends e.key "ผ" (user 2026-11-04: Ctrl+Z did nothing)
      const key = /^Key[A-Z]$/.test(e.code ?? "") ? e.code.slice(3).toLowerCase() : e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === "s") { e.preventDefault(); (e.shiftKey ? saveAs : saveProject)(); return; } // also while typing
      if (mod !== "work") return;
      // text being typed keeps the browser's own undo; number fields / selects commit on change → project undo (field left first)
      const t = e.target, typing = t.tagName === "TEXTAREA" || (t.tagName === "INPUT" && !["number", "checkbox", "radio", "range"].includes(t.type));
      if (typing || !(e.ctrlKey || e.metaKey) || !["z", "y"].includes(key)) return;
      e.preventDefault(); if (t.tagName === "INPUT" || t.tagName === "SELECT") t.blur();
      if (key === "z") restore(e.shiftKey ? "redo" : "undo", e.shiftKey ? "undo" : "redo"); else restore("redo", "undo");
    };
    window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k);
  });
  const [footing, setFootingState] = useState(() => { // deep link: ?foot=pile or ?foot=pile3 (pile count)
    const m = /^pile(\d)?$/.exec(new URLSearchParams(location.search).get("foot") ?? "");
    return m ? { ...DEFAULT_FOOTING, type: "pile", n: Number(m[1] ?? DEFAULT_FOOTING.n) } : DEFAULT_FOOTING;
  });
  const setFooting = (k, v) => setFootingState((x) => ({ ...x, [k]: v }));
  const SPAN_DEFAULT = { oneway: { L: 2.5 }, cantilever: { L: 1, P: 0, a: 1 }, twoway: { S: 3, L: 4 } };
  const setSlab = (k, v) => setSlabState((s) => ({ ...s, [k]: v, ...(k === "kind" ? SPAN_DEFAULT[v] : {}) }));
  const res = useMemo(() => runBeam(st), [st]);
  const forces = useMemo(() => beamForces(st), [st]);
  const fns = useMemo(() => spanFunctions(st.geom.type, st.geom.L, forces.w, forces.ML, forces.MR),
    [st.geom.type, st.geom.L, forces.w, forces.ML, forces.MR]);
  const [viewOpen, setViewOpen] = useState(false);
  const openRef = useRef(null), [notice, setNotice] = useState(null), [saveBox, setSaveBox] = useState(null);
  const brand = useBrand(), [brandOpen, setBrandOpen] = useState(false);
  useEffect(() => { document.title = `${BRAND.full} — ออกแบบโครงสร้าง คสล. และหลังคาเหล็ก`; }, []);
  // screen space (user 2026-11-04): left steps folded to icons, focus = plan only (no side bars / guide), remembered per browser
  const [mini, setMiniState] = useState(() => { try { return localStorage.getItem("structcalc.side") === "mini"; } catch { return false; } });
  const setMini = (v) => { setMiniState(v); try { localStorage.setItem("structcalc.side", v ? "mini" : "full"); } catch { /* ignore */ } };
  const [focus, setFocus] = useState(false), side = focus ? 0 : mini ? 60 : 230;
  useEffect(() => { const k = (e) => { if (e.key === "Escape" && focus && !["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName)) setFocus(false); }; window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [focus]);
  // project file: every module's inputs in one .json, to keep per job and reopen on any computer
  // project file: Chrome / Edge write the same .json again (File System Access API: Save = overwrite, Save As = choose);
  // other browsers download a copy. A new project starts empty (floors kept, no columns / beams).
  const fileRef = useRef(null), [fileName, setFileName] = useState(null), [askNew, setAskNew] = useState(false);
  const projectJson = () => JSON.stringify({ app: "StructCalc", version: 1, savedAt: new Date().toISOString(), beam: st, slab, column, stair: stairSt, footing, roof, frame }, null, 1);
  const baseName = () => `${(st.project.name || "project").replace(/[\\/:*?"<>|]/g, "_").trim()}.json`;
  const writeHandle = async (h) => { const w = await h.createWritable(); await w.write(projectJson()); await w.close(); fileRef.current = h; setFileName(h.name); setDirty(false); setNotice({ ok: true, text: `บันทึก ${h.name} แล้ว` }); };
  // the native pickers are refused inside a cross-origin frame (the claude.ai web copy runs in one): fall back to the file input /
  // a download there, and whenever a picker throws a SecurityError (user 2026-11-03: "เปิดไฟล์ไม่ได้: … Cross origin sub frames")
  const framed = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const download = () => {
    const url = URL.createObjectURL(new Blob([projectJson()], { type: "application/json" }));
    Object.assign(document.createElement("a"), { href: url, download: fileName ?? baseName() }).click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    setDirty(false); setNotice({ ok: true, text: "ดาวน์โหลดไฟล์โครงการแล้ว" });
    // inside the claude.ai frame downloads can be blocked silently (user 2026-11-04: "บันทึกไม่ได้เลย") → offer copy / new tab too
    if (framed) setSaveBox({ name: fileName ?? baseName(), url });
  };
  const saveAs = async () => {
    if (window.showSaveFilePicker && !framed) {
      try { await writeHandle(await window.showSaveFilePicker({ suggestedName: fileName ?? baseName(), types: [{ description: "โครงการ StructCalc", accept: { "application/json": [".json"] } }] })); }
      catch (e) { if (e.name === "SecurityError") download(); else if (e.name !== "AbortError") setNotice({ ok: false, text: `บันทึกไม่ได้: ${e.message}` }); }
      return;
    }
    download();
  };
  const saveProject = async () => {
    if (fileRef.current) { try { await writeHandle(fileRef.current); return; } catch (e) { setNotice({ ok: false, text: `บันทึกทับไม่ได้ (${e.message}) — เลือกที่บันทึกใหม่` }); } }
    await saveAs();
  };
  const openFile = async () => {
    if (!window.showOpenFilePicker || framed) { openRef.current.click(); return; }
    try { const [h] = await window.showOpenFilePicker({ types: [{ description: "โครงการ StructCalc", accept: { "application/json": [".json"] } }] }); const f = await h.getFile(); fileRef.current = h; setFileName(h.name); await openProject(f); }
    catch (e) { if (e.name === "SecurityError") openRef.current.click(); else if (e.name !== "AbortError") setNotice({ ok: false, text: `เปิดไฟล์ไม่ได้: ${e.message}` }); }
  };
  // safety net: the work in the browser is kept (5 latest) before "ใหม่" / "เปิด" replace it; "กู้คืน" brings the latest back
  const SNAP = "structcalc.snapshots", readSnaps = () => { try { return JSON.parse(localStorage.getItem(SNAP)) ?? []; } catch { return []; } };
  const [snaps, setSnaps] = useState(readSnaps);
  const snapshot = () => {
    if (!frame.floors.some((f) => f.columns.length || f.beams.length)) return; // nothing worth keeping
    const list = [{ at: new Date().toISOString(), name: st.project.name, frame, roof, project: st.project }, ...readSnaps()].slice(0, 5);
    try { localStorage.setItem(SNAP, JSON.stringify(list)); } catch { /* storage full: keep going */ }
    setSnaps(list);
  };
  const restoreSnap = () => {
    const [s0, ...rest] = readSnaps(); if (!s0) return;
    snapshot(); // the current work becomes a snapshot too, so restoring is never a loss
    const after = readSnaps().filter((x) => x.at !== s0.at);
    setFrameState(mergeFrame(s0.frame)); setRoofState(mergeRoof(s0.roof)); replaceSt({ ...DEFAULT_STATE, project: { ...DEFAULT_STATE.project, ...s0.project } });
    try { localStorage.setItem("structcalc.frame", JSON.stringify(s0.frame)); localStorage.setItem("structcalc.roof", JSON.stringify(s0.roof)); localStorage.setItem(SNAP, JSON.stringify(after)); } catch { /* ignore */ }
    setSnaps(after); setNotice({ ok: true, text: `กู้คืนงานเมื่อ ${new Date(s0.at).toLocaleString("th-TH")} แล้ว` }); void rest;
  };
  const newProject = () => {
    snapshot();
    const empty = applyStandard({ ...DEFAULT_FRAME, cur: 0, colPick: {}, lateral: undefined, roofLink: undefined, roofPoints: [],
      floors: DEFAULT_FRAME.floors.map((f) => ({ ...f, columns: [], beams: [], walls: [], panels: {}, cants: [], stairs: [], lineLoads: [], pointLoads: [] })) }); // the engineer's saved standard, if any
    hist.current = { undo: [], redo: [], t: 0 };
    replaceSt({ ...DEFAULT_STATE }); setFrameState(empty); setRoofState(EMPTY_ROOF);
    try { localStorage.setItem("structcalc.frame", JSON.stringify(empty)); localStorage.setItem("structcalc.roof", JSON.stringify(EMPTY_ROOF)); } catch { /* ignore */ }
    fileRef.current = null; setFileName(null); setDirty(false); setAskNew(false); setStep("project");
    setNotice({ ok: true, text: "เริ่มโครงการใหม่แล้ว — ใส่ข้อมูลโครงการ แล้วไปขั้น 1 กริด / ระดับชั้น" });
  };
  const openProject = async (file) => {
    try {
      if (!window.__projectLoading) snapshot();
      const d = JSON.parse(await file.text());
      if (d.app !== "StructCalc") throw new Error("ไม่ใช่ไฟล์โครงการ StructCalc");
      if (d.beam) replaceSt({ ...DEFAULT_STATE, ...d.beam, project: { ...DEFAULT_STATE.project, ...d.beam.project } });
      if (d.slab) setSlabState(d.slab);
      if (d.column) setColumnState(d.column);
      if (d.stair) setStairState(d.stair);
      if (d.footing) setFootingState(d.footing);
      if (d.frame?.floors || d.frame?.floor) { const f = mergeFrame(d.frame); setFrameState(f); try { localStorage.setItem("structcalc.frame", JSON.stringify(f)); } catch { /* ignore */ } }
      if (d.roof?.pts) { const r = mergeRoof(d.roof); setRoofState(r); try { localStorage.setItem("structcalc.roof", JSON.stringify(r)); } catch { /* ignore */ } }
      setNotice({ ok: true, text: `เปิด ${file.name} แล้ว` }); setDirty(false);
    } catch (e) { setNotice({ ok: false, text: `เปิดไฟล์ไม่ได้: ${e.message}` }); }
    setTimeout(() => setNotice(null), 4000);
  };
  const [dark, setDark] = useTheme();
  useEffect(() => { // ?project=/projects/x.json opens a project file served with the app (examples, headless PDF export)
    const url = new URLSearchParams(location.search).get("project");
    if (url) { window.__projectLoading = true; fetch(url).then((r) => r.text()).then((t) => openProject({ name: url.split("/").pop(), text: async () => t }))
      .then(() => { if (!new URLSearchParams(location.search).has("print")) { const q = new URLSearchParams(location.search); q.delete("project"); history.replaceState(null, "", `${location.pathname}${q.toString() ? `?${q}` : ""}${location.hash}`); } }) /* a reload must not reopen the example over the user's work */
     .finally(() => setTimeout(() => { window.__projectLoading = false; }, 300)); }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (new URLSearchParams(location.search).has("print")) { const go = () => (document.querySelector("[data-report-loading]") || window.__projectLoading ? setTimeout(go, 200) : printReport({ dialog: false })); setTimeout(go, 800); }
  }, []);
  const r0 = res.mid.r;
  const n = (path, label, unit, step) => (
    <Field label={label} unit={unit}>
      <NumberInput value={path.split(".").reduce((o, k) => o[k], st)} step={step} onChange={(v) => set(path, v)} />
    </Field>
  );

  return (
    <>
      <div className="app flex min-h-screen xl:h-screen xl:overflow-hidden">
        {!focus && <aside style={{ width: mini ? 60 : 230 }} className={`fixed inset-y-0 left-0 z-20 overflow-y-auto border-r border-gray-200 bg-white ${mini ? "px-2" : "px-4"} transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className={`flex items-center gap-2.5 text-xl font-semibold text-gray-900 ${mini ? "flex-col py-3" : "py-4"}`}>
            <button onClick={() => setBrandOpen(true)} title={`${BRAND.full} — เจ้าของโปรแกรม (รูป / ลายเซ็น)`} className="shrink-0">
              {brand.photo ? <img src={brand.photo} alt="" className="h-10 w-10 rounded-full object-cover ring-2 ring-brand-500" /> : <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-[#fff]"><Calculator className="h-5 w-5" /></span>}</button>
            {!mini && <span className="leading-tight"><span className="block text-[17px]">{BRAND.name}</span><span className="block text-[11px] font-medium text-brand-500">{BRAND.by}</span></span>}
            <button onClick={() => setMini(!mini)} title={mini ? "ขยายแถบขั้นตอน" : "พับแถบขั้นตอน (เหลือไอคอน)"} className={`${mini ? "" : "ml-auto"} grid h-7 w-7 place-items-center rounded-md text-[13px] text-gray-400 ring-1 ring-gray-200 hover:bg-gray-50`}>{mini ? "»" : "«"}</button>
          </div>
          {!mini && <p className="mb-1.5 text-xs uppercase tracking-wider text-gray-400">ขั้นตอนออกแบบ</p>}
          <nav className="space-y-0.5">
            {WORKFLOW.map(([key, label], i) => {
              const nBeam = fres.floors.reduce((a, f) => a + f.spans.filter((x) => !x.ok).length, 0), nCol = fres.columns.filter((c) => !c.ok).length, nFoot = fres.footings.filter((f) => !f.ok).length;
              const warn = (key === "design" && nBeam + nCol > 0) || (key === "footing" && nFoot > 0) || (key === "frame" && fres.warnings.length > 0);
              const on = mod === "work" && step === key;
              return (
                <button key={key} onClick={() => { setStep(key); setMenuOpen(false); }} title={mini ? `${i}. ${label}` : undefined}
                  className={`flex w-full items-center ${mini ? "justify-center" : ""} gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13px] font-medium ${on ? "bg-brand-50 text-brand-500" : "text-gray-700 hover:bg-gray-100"}`}>
                  <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[10px] font-semibold ${on ? "bg-brand-500 text-[#fff]" : warn ? "bg-[#fef3f2] text-[#d92d20]" : "bg-gray-100 text-gray-500"}`}>{warn ? "!" : i}</span>{!mini && label}
                </button>
              );
            })}
          </nav>
          {!mini && <><button onClick={() => setToolsOpen(!toolsOpen)} className="mb-1.5 mt-4 flex w-full items-center text-left text-xs uppercase tracking-wider text-gray-400 hover:text-gray-600">
            เครื่องมือคำนวณเดี่ยว <span className="ml-auto">{toolsOpen || mod !== "work" ? "▾" : "▸"}</span></button>
          {(toolsOpen || mod !== "work") && <nav className="space-y-0.5">
            <p className="px-3 pb-1 text-[11px] text-gray-400">คำนวณทีละชิ้น ไม่เกี่ยวกับโครงการทั้งหลัง</p>
            {MODULES.map(([key, m, Icon]) => (
              <button key={m} disabled={!key} onClick={() => { setMod(key); setMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-left text-[13px] font-medium ${mod === key ? "bg-brand-50 text-brand-500" : key ? "text-gray-700 hover:bg-gray-100" : "text-gray-400"}`}>
                <Icon className="h-5 w-5" />{m}
                {!key && <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">เร็วๆ นี้</span>}
              </button>
            ))}
          </nav>}</>}
        </aside>}
        {menuOpen && <div className="fixed inset-0 z-10 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col lg:ml-[var(--side)]" style={{ "--side": `${side}px` }}>
          <header className="border-b border-gray-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-2.5 md:px-5">
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 text-gray-500 lg:hidden" onClick={() => setMenuOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-800">{mod === "work" ? `${WORKFLOW.findIndex((w) => w[0] === step)}. ${WORKFLOW.find((w) => w[0] === step)?.[1]}` : TITLES[mod][0]}</h1>
                <p className="truncate text-xs text-gray-500">{st.project.name} · {mod === "beam" ? st.project.beamNo : mod === "column" ? column.colNo : mod === "stair" ? stairSt.stairNo : mod === "footing" ? footing.footNo : mod === "roof" ? roof.roofNo : mod === "frame" || mod === "work" ? frame.frameNo : slab.slabNo} · {st.project.floor}</p>
              </div>
              {mod === "work" && !["project", "roof", "report"].includes(step) && (
                <label className="ml-4 flex items-center gap-2 text-xs text-gray-500">ชั้น
                  <select value={Math.min(frame.cur ?? 0, frame.floors.length - 1)} onChange={(e) => setFrame("cur", Number(e.target.value))}
                    className="h-9 rounded-lg border border-gray-300 bg-transparent px-2 text-sm font-medium text-gray-800">
                    {frame.floors.map((f, i) => <option key={i} value={i}>{f.name}</option>)}
                  </select>
                </label>
              )}
              <div className="ml-auto flex gap-2">
                {mod === "work" && <>
                  <button onClick={() => restore("undo", "redo")} disabled={!hist.current.undo.length} title="ย้อนกลับ (Ctrl+Z)" className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 ring-1 ring-gray-300 hover:bg-gray-100 disabled:opacity-40"><Undo2 className="h-4 w-4" /></button>
                  <button onClick={() => restore("redo", "undo")} disabled={!hist.current.redo.length} title="ทำซ้ำ (Ctrl+Y)" className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 ring-1 ring-gray-300 hover:bg-gray-100 disabled:opacity-40"><Redo2 className="h-4 w-4" /></button>
                </>}
                {mod === "work" && <button onClick={() => { const on = !focus; setFocus(on); try { if (on) document.documentElement.requestFullscreen?.().catch(() => {}); else if (document.fullscreenElement) document.exitFullscreen?.(); } catch { /* frame may refuse */ } }}
                  title={focus ? "ออกจากโหมดเต็มจอ (Esc)" : "เต็มจอ: ซ่อนแถบซ้าย แผงขวา และแถบวิธีใช้"} className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ${focus ? "bg-brand-500 text-[#fff] ring-brand-500" : "text-gray-500 ring-gray-300 hover:bg-gray-100"}`}>{focus ? "⤡" : "⤢"}</button>}
                <button onClick={() => setTour(true)} title="วิธีใช้โปรแกรม"
                  className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 ring-1 ring-gray-300 hover:bg-gray-100"><HelpCircle className="h-4 w-4" /></button>
                <button onClick={() => setDark(!dark)} title={dark ? "ธีมสว่าง" : "ธีมมืด"}
                  className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 ring-1 ring-gray-300 hover:bg-gray-100">
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {notice && <span className={`self-center text-xs ${notice.ok ? "text-green-600" : "text-red-600"}`}>{notice.text}</span>}
                <span className="flex items-center gap-1 rounded-lg bg-gray-100 p-0.5">
                  <button onClick={() => (dirty ? setAskNew(true) : newProject())} title="โครงการใหม่ (เริ่มจากว่าง)" className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-gray-700 hover:bg-white"><FilePlus2 className="h-4 w-4" />ใหม่</button>
                  {snaps.length > 0 && <button onClick={restoreSnap} title={`กู้คืนงานที่ถูกแทนที่ล่าสุด (${snaps[0].name || "ไม่มีชื่อ"} · ${new Date(snaps[0].at).toLocaleString("th-TH")}) — เก็บไว้ ${snaps.length} ชุด`} className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-gray-700 hover:bg-white">กู้คืน</button>}
                  <button onClick={openFile} title="เปิดไฟล์โครงการ (.json)" className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-gray-700 hover:bg-white"><FolderOpen className="h-4 w-4" />เปิด</button>
                  <button onClick={saveProject} title={fileName ? `บันทึกทับ ${fileName} (Ctrl+S)` : "บันทึกเป็นไฟล์ .json (Ctrl+S)"} className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-gray-700 hover:bg-white"><Save className="h-4 w-4" />บันทึก{dirty && <span className="text-[#b54708]" title="ยังไม่ได้บันทึกเป็นไฟล์ (งานถูกเก็บในเบราว์เซอร์นี้อัตโนมัติแล้ว)">●</span>}</button>
                  <button onClick={saveAs} title="บันทึกเป็นไฟล์ใหม่ (Ctrl+Shift+S)" className="flex h-9 items-center gap-1 rounded-md px-2 text-[13px] font-medium text-gray-700 hover:bg-white">บันทึกเป็น…</button>
                </span>
                {fileName && <span className="self-center text-[11px] text-gray-500" title="ไฟล์ที่เปิดอยู่">{fileName}</span>}
                <input ref={openRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) { setFileName(f.name); openProject(f); } }} />
                {askNew && <span className="flex items-center gap-1 rounded-lg bg-[#fffaeb] px-2 py-1 text-[12px] text-[#b54708] ring-1 ring-[#fdb022]">งานนี้ยังไม่ได้บันทึกเป็นไฟล์
                  <button onClick={async () => { await saveProject(); }} className="rounded px-1.5 font-medium underline">บันทึกก่อน</button>
                  <button onClick={newProject} className="rounded px-1.5 font-medium text-[#d92d20] underline">ทิ้งและเริ่มใหม่</button>
                  <button onClick={() => setAskNew(false)} className="rounded px-1.5">ยกเลิก</button></span>}
                {mod !== "work" && <Button variant="secondary" icon={Building2} title="ข้อมูลโครงการ" onClick={() => setProjOpen(true)}><span className="hidden 2xl:inline">ข้อมูลโครงการ</span></Button>}
                <Button icon={FileDown} onClick={printReport}>พิมพ์ / บันทึก PDF</Button>
              </div>
            </div>
          </header>
          {mod === "work" && !focus && <StepGuide key={step} step={step} index={WORKFLOW.findIndex((w) => w[0] === step)} />}
          <SnapshotStation />
          {brandOpen && <Dialog open onOpenChange={(o) => !o && setBrandOpen(false)}><DialogContent className="max-w-md">
            <DialogTitle>{BRAND.full}</DialogTitle>
            <p className="text-[13px] text-gray-600">รูปเจ้าของโปรแกรม (โลโก้มุมซ้ายบน หน้าแนะนำ) และลายเซ็นวิศวกร (ปกและท้ายกระดาษรายการคำนวณทุกแผ่น) — เก็บไว้ในเบราว์เซอร์นี้</p>
            <div className="grid grid-cols-2 gap-3 text-[12px]">
              {[["photo", "รูปถ่าย", 320, "image/jpeg"], ["sig", "ลายเซ็น (พื้นขาว/โปร่ง)", 480, "image/png"]].map(([k, t, mx, ty]) => (
                <label key={k} className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed border-gray-300 p-2 hover:bg-gray-50">
                  {brand[k] ? <img src={brand[k]} alt="" className={k === "photo" ? "h-24 w-24 rounded-full object-cover" : "h-16 object-contain"} /> : <span className="grid h-20 w-full place-items-center text-gray-400">ยังไม่มี</span>}
                  <span className="font-medium text-brand-600">{brand[k] ? `เปลี่ยน${t}` : `อัปโหลด${t}`}</span>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; try { saveBrand({ ...brand, [k]: await imageToDataUrl(f, mx, ty) }); } catch (er) { setNotice({ ok: false, text: er.message }); } }} />
                </label>))}
            </div>
            <div className="flex justify-between text-[12px]"><button onClick={() => saveBrand({})} className="text-red-600">ลบรูปและลายเซ็น</button><button onClick={() => setBrandOpen(false)} className="rounded-md bg-brand-500 px-3 py-1 font-medium text-white">เสร็จ</button></div>
          </DialogContent></Dialog>}
          {saveBox && <Dialog open onOpenChange={(o) => !o && setSaveBox(null)}><DialogContent className="max-w-lg">
            <DialogTitle>บันทึกโครงการ</DialogTitle>
            <p className="text-[13px] text-gray-600">หน้าเว็บนี้เปิดอยู่ในกรอบของ claude.ai ซึ่งอาจบล็อกการดาวน์โหลด ถ้าไม่มีไฟล์ <b>{saveBox.name}</b> ลงเครื่อง ใช้ทางใดทางหนึ่ง:</p>
            <div className="flex flex-wrap gap-2 text-[13px]">
              <a href={saveBox.url} download={saveBox.name} className="rounded-md bg-brand-500 px-3 py-1.5 font-medium text-white">ดาวน์โหลดอีกครั้ง</a>
              <button onClick={() => { const w = window.open(saveBox.url, "_blank"); if (!w) setNotice({ ok: false, text: "เปิดแท็บใหม่ไม่ได้ (ถูกบล็อก) — ใช้ปุ่มคัดลอก" }); }} className="rounded-md px-3 py-1.5 ring-1 ring-gray-300">เปิดในแท็บใหม่ (แล้วกด Ctrl+S)</button>
              <button onClick={async () => { const t = projectJson(); let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch { const a = document.getElementById("sc-savetext"); a.select(); try { ok = document.execCommand("copy"); } catch { /* blocked */ } } setNotice({ ok, text: ok ? "คัดลอกแล้ว — วางลง Notepad แล้วบันทึกเป็น .json" : "คัดลอกอัตโนมัติไม่ได้ — คลิกในกล่องแล้ว Ctrl+A, Ctrl+C" }); }} className="rounded-md px-3 py-1.5 ring-1 ring-gray-300">คัดลอกข้อความโครงการ</button>
            </div>
            <textarea id="sc-savetext" readOnly value={projectJson()} className="h-28 w-full rounded border border-gray-200 p-1 font-mono text-[10px]" onFocus={(e) => e.target.select()} />
            <p className="text-[11px] text-gray-500">คัดลอกแล้ววางใน Notepad บันทึกชื่อ {saveBox.name} — เปิดกลับด้วยปุ่ม "เปิด" ได้ตามปกติ · งานล่าสุดยังเก็บในเบราว์เซอร์นี้ด้วย (ปุ่ม "กู้คืน") · ถ้ารันโปรแกรมบนเครื่องตัวเอง ปุ่มบันทึกจะเขียนไฟล์ได้ตรง</p>
          </DialogContent></Dialog>}
          {tour && <Tour steps={WORKFLOW} onClose={closeTour} onGo={(k) => { closeTour(); setStep(k); }} onNew={frame === DEFAULT_FRAME ? () => { closeTour(); newProject(); } : null} />}

          <ErrorBoundary resetKey={mod}>
          {mod === "work" ? (step === "roof" ? <div className="flex min-h-0 flex-1 flex-col"><div className="px-4 pt-3"><RoofLinkCard frame={frame} roof={roof} onFromFrame={roofFromStructure} set={setFrame} /></div><RoofPage roof={roof} set={setRoof} dark={dark} onFromFrame={roofFromStructure} frame={frame} res={fres} focus={focus} /></div> : step === "report" ? (
            <main className="min-h-0 flex-1 overflow-y-auto bg-gray-100 p-4"><div className="report-preview mx-auto max-w-[220mm] space-y-6 bg-white p-6 shadow-theme-xs">
              <p className="text-sm text-gray-500">ตัวอย่างรายการคำนวณทั้งหลัง (หลังคา → โครงสร้าง → ฐานราก) · ปุ่ม "พิมพ์ / บันทึก PDF" ด้านบนเพื่อส่งออก</p>
              <WorkReport frame={frame} roof={roof} project={st.project} />
            </div></main>
          ) : <FramePage frame={frame} set={setFrame} dark={dark} roof={roof} setRoof={setRoof} res={fres} step={step} focus={focus} onProjectInfo={() => setProjOpen(true)}  onRoofFromFrame={roofFromStructure} />) : mod === "footing" ? <FootingPage f={footing} set={setFooting} dark={dark} /> : mod === "stair" ? <StairPage s={stairSt} set={setStair} dark={dark} /> : mod === "column" ? <ColumnPage c={column} set={setColumn} dark={dark} /> : mod === "slab" ? <SlabPage s={slab} set={setSlab} dark={dark} /> : (
          <main className="grid min-h-0 flex-1 gap-4 p-4 md:p-5 xl:grid-cols-[300px_1fr_1fr_1.15fr] xl:grid-rows-[auto_1fr]">
            {/* inputs */}
            <div className="space-y-4 xl:row-span-2 xl:overflow-y-auto">
              <Card title="วัสดุ" icon={Wrench}>
                <div className="grid grid-cols-2 gap-3">
                  {n("mat.fcPrime", "f'c", "ksc")}
                  <Field label="fc = F·f'c"><Select value={st.mat.F} onChange={(v) => set("mat.F", Number(v))} options={[[0.375, "0.375 f'c"], [0.45, "0.45 f'c"]]} /></Field>
                  <Field label="เหล็กยืน"><Select value={st.mat.fy} onChange={(v) => set("mat.fy", Number(v))} options={GRADE_OPTS} /></Field>
                  <Field label="เหล็กปลอก"><Select value={st.mat.fys} onChange={(v) => set("mat.fys", Number(v))} options={GRADE_OPTS} /></Field>
                  {n("mat.cover", "ระยะหุ้ม", "cm")}
                  <Field label="fc ≤ 65 ksc"><Select value={st.mat.capFc ? "1" : "0"} onChange={(v) => set("mat.capFc", v === "1")} options={[["1", "จำกัด"], ["0", "ไม่จำกัด"]]} /></Field>
                </div>
              </Card>
              <Card title="ขนาดคานและแรง" icon={Ruler}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2"><Field label="ชนิดคาน"><Select value={st.geom.type} onChange={(v) => set("geom.type", v)} options={Object.entries(BEAM_TYPES).map(([k, t]) => [k, t.label])} /></Field></div>
                  {n("geom.b", "กว้าง b", "m", "0.05")}{n("geom.h", "ลึก h", "m", "0.05")}
                  {n("geom.L", "ช่วงคาน L", "m", "0.5")}{n("loads.Mt", "โมเมนต์บิด Mt", "kg-m")}
                  <Field label="แรงออกแบบ">
                    <Select value={st.loads.useW ? "w" : "m"} onChange={(v) => set("loads.useW", v === "w")}
                      options={[["w", "คำนวณจาก w"], ["m", "กรอก M, V เอง"]]} />
                  </Field>
                  {st.loads.useW ? n("loads.w", "น้ำหนักแผ่ w", "kg/m", "100") : n("loads.V", "แรงเฉือน V", "kg")}
                  {st.loads.useW ? (
                    <p className="col-span-2 -mt-1 text-xs text-gray-500">
                      M+ = {fmt(forces.Mmid, 0)} · M− = {fmt(forces.Msup, 0)} kg-m · V = {fmt(forces.V, 0)} kg
                    </p>
                  ) : <>{n("loads.Mmid", "M กลางช่วง", "kg-m")}{n("loads.Msup", "M จุดรองรับ", "kg-m")}</>}
                  <Field label="เหล็กปลอก">
                    <div className="flex gap-1.5">
                      <div className="w-20 shrink-0"><NumberInput value={st.stirrup.sets} step="1" min="1" onChange={(v) => set("stirrup.sets", v)} /></div>
                      <Select value={st.stirrup.bar} onChange={(v) => set("stirrup.bar", v)} options={Object.keys(STIRRUPS)} />
                    </div>
                  </Field>
                </div>
              </Card>
              <div className="flex items-center justify-around rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm">
                {[["กลางช่วง", res.mid], ["จุดรองรับ", res.sup]].map(([l, x]) => (
                  <span key={l} className="flex items-center gap-2 text-gray-500">
                    {l} {x.r ? <Badge ok={sectionOk(x.r)}>{sectionOk(x.r) ? "ผ่าน" : "ไม่ผ่าน"}</Badge> : <Badge ok={false}>ข้อมูลผิด</Badge>}
                  </span>
                ))}
              </div>
            </div>

            {/* KPI strip */}
            {r0 && (
              <div className="grid grid-cols-4 gap-3 md:grid-cols-8 xl:col-span-3">
                {[["n = Es/Ec", fmt(r0.n), r0.nOk], ["k", fmt(r0.k, 4)], ["j", fmt(r0.j, 4)], ["R (ksc)", fmt(r0.R)],
                  ["d (cm)", fmt(r0.d)], ["ลึกต่ำสุด (m)", fmt(r0.minDepth, 3), r0.minDepthOk],
                  ["h/L", fmt(r0.deepRatio), r0.deepOk], ["L/b", fmt(r0.LbRatio, 1), !r0.narrow]].map(([l, v, ok]) => (
                  <div key={l} className="rounded-2xl border border-gray-200 bg-white px-4 py-2.5">
                    <div className="text-[11px] text-gray-400">{l}</div>
                    <div className="flex items-center justify-between text-base font-semibold tabular-nums">{v}{ok !== undefined && <Badge ok={ok} />}</div>
                  </div>
                ))}
              </div>
            )}

            <SectionCard title="หน้าตัดกลางช่วง" sec="mid" st={st} set={set} res={res.mid} />
            <SectionCard title="หน้าตัดที่จุดรองรับ" sec="sup" st={st} set={set} res={res.sup} />
            <div className="flex min-h-0 flex-col gap-4">
              <section className="rounded-2xl border border-gray-200 bg-white px-3 pt-2">
                <div className="flex items-center justify-between px-1 text-sm font-semibold text-gray-800">
                  แผนภาพแรงเฉือน / โมเมนต์
                  <span className="text-[11px] font-normal text-gray-500">w = {fmt(forces.w, 0)} kg/m{forces.derived ? "" : " (เทียบเท่า)"}</span>
                </div>
                <ForceCharts L={st.geom.L} fns={fns} height={330} dark={dark} />
              </section>
              <section className="relative min-h-[260px] flex-1 overflow-hidden rounded-2xl border border-gray-200">
                <BeamCage3D b={st.geom.b} h={st.geom.h} L={st.geom.L} cover={st.mat.cover} stirrupBar={st.stirrup.bar}
                  type={st.geom.type} mid={st.mid} sup={st.sup} sEnd={st.stirrup.sSup} sMid={st.stirrup.sMid}
                  className="h-full w-full" dark={dark} />
                <button onClick={() => setViewOpen(true)} title="ขยาย"
                  className="absolute right-2 top-2 rounded-lg bg-white/90 px-2 py-1 text-[11px] font-medium text-gray-700 ring-1 ring-gray-300">ขยาย</button>
              </section>
            </div>
          </main>
          )}
          </ErrorBoundary>
        </div>
      </div>
      {projOpen && <ProjectDialog st={st} set={set} onClose={() => setProjOpen(false)} />}
      {viewOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-6" onClick={() => setViewOpen(false)}>
          <div className="flex h-full max-h-[860px] w-full max-w-[1500px] flex-col rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold">คาน {st.project.beamNo} — มุมมอง 3D และแผนภาพแรง</h2>
                <p className="text-xs text-gray-500">
                  {BEAM_TYPES[st.geom.type].label} · w = {fmt(forces.w, 0)} kg/m{forces.derived ? "" : " (น้ำหนักแผ่เทียบเท่าจาก M ที่กรอก)"}
                </p>
              </div>
              <button onClick={() => setViewOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[1.2fr_1fr]">
              <BeamCage3D b={st.geom.b} h={st.geom.h} L={st.geom.L} cover={st.mat.cover} stirrupBar={st.stirrup.bar}
                type={st.geom.type} mid={st.mid} sup={st.sup} sEnd={st.stirrup.sSup} sMid={st.stirrup.sMid}
                className="h-full min-h-[360px] overflow-hidden rounded-xl border border-gray-200" dark={dark} />
              <div className="rounded-xl border border-gray-200 p-3">
                <ForceCharts L={st.geom.L} fns={fns} height={560} dark={dark} />
              </div>
            </div>
          </div>
        </div>
      )}
      <ErrorBoundary resetKey={mod} quiet>{mod === "work" ? <WorkReport frame={frame} roof={roof} project={st.project} /> : mod === "footing" ? <FootingReport f={footing} project={st.project} /> : mod === "stair" ? <StairReport s={stairSt} project={st.project} /> : mod === "column" ? <ColumnReport c={column} project={st.project} /> : mod === "slab" ? <SlabReport s={slab} project={st.project} /> : <Report st={st} res={res} forces={forces} fns={fns} />}</ErrorBoundary>
    </>
  );
}








