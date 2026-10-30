import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Building2, Calculator, Moon, Sun, Columns3, Download, FileDown, FolderOpen, Footprints, House, Landmark, Layers, Menu, RectangleHorizontal, Save,
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
import { DEFAULT_ROOF, RoofPage } from "./RoofPage.jsx";
import { RoofReport } from "./RoofReport.jsx";
import { DEFAULT_FOOTING, FootingPage, FootingReport } from "./FootingPage.jsx";

const BAR_OPTS = [["", "—"], ...Object.keys(BARS).map((k) => [k, k])];
const MODULES = [["beam", "คาน", RectangleHorizontal], ["slab", "พื้น", Square], ["column", "เสา", Columns3],
  ["stair", "บันได", Footprints], ["footing", "ฐานราก", Landmark], ["roof", "โครงหลังคาเหล็ก", House]];
const TITLES = { beam: ["ออกแบบคาน คสล.", "beamNo"], slab: ["ออกแบบพื้น คสล.", null], column: ["ออกแบบเสา คสล.", null], stair: ["ออกแบบบันได คสล.", null], footing: ["ออกแบบฐานรากแผ่", null], roof: ["ออกแบบโครงหลังคาเหล็ก", null] };
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
  const [st, setSt] = useState(DEFAULT_STATE);
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
const mergeRoof = (s) => ({ ...DEFAULT_ROOF, ...s, frame: { ...DEFAULT_ROOF.frame, ...s.frame }, design: { ...DEFAULT_ROOF.design, ...s.design, types: undefined } });

export default function App() {
  const [st, set, replaceSt] = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [projOpen, setProjOpen] = useState(false);
  const [mod, setModState] = useState(() => (location.hash.slice(1) in TITLES ? location.hash.slice(1) : "beam"));
  const setMod = (m) => { setModState(m); history.replaceState(null, "", `#${m}`); };
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
    } catch { /* unavailable or corrupt: start from the example */ }
    return DEFAULT_ROOF;
  });
  // saved on edits only (an effect would also re-save a stale copy whenever another tab hot-reloads)
  const setRoof = (k, v) => setRoofState((x) => {
    const next = { ...x, [k]: v };
    try { localStorage.setItem("structcalc.roof", JSON.stringify(next)); } catch { /* ignore */ }
    return next;
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
  const openRef = useRef(null), [notice, setNotice] = useState(null);
  // project file: every module's inputs in one .json, to keep per job and reopen on any computer
  const saveProject = () => {
    const data = { app: "StructCalc", version: 1, savedAt: new Date().toISOString(), beam: st, slab, column, stair: stairSt, footing, roof };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
    const name = `${(st.project.name || "project").replace(/[\\/:*?"<>|]/g, "_").trim()}.json`;
    Object.assign(document.createElement("a"), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const openProject = async (file) => {
    try {
      const d = JSON.parse(await file.text());
      if (d.app !== "StructCalc") throw new Error("ไม่ใช่ไฟล์โครงการ StructCalc");
      if (d.beam) replaceSt({ ...DEFAULT_STATE, ...d.beam, project: { ...DEFAULT_STATE.project, ...d.beam.project } });
      if (d.slab) setSlabState(d.slab);
      if (d.column) setColumnState(d.column);
      if (d.stair) setStairState(d.stair);
      if (d.footing) setFootingState(d.footing);
      if (d.roof?.pts) { const r = mergeRoof(d.roof); setRoofState(r); try { localStorage.setItem("structcalc.roof", JSON.stringify(r)); } catch { /* ignore */ } }
      setNotice({ ok: true, text: `เปิด ${file.name} แล้ว` });
    } catch (e) { setNotice({ ok: false, text: `เปิดไฟล์ไม่ได้: ${e.message}` }); }
    setTimeout(() => setNotice(null), 4000);
  };
  const [dark, setDark] = useTheme();
  useEffect(() => {
    if (new URLSearchParams(location.search).has("print")) { const go = () => (document.querySelector("[data-report-loading]") ? setTimeout(go, 200) : printReport({ dialog: false })); setTimeout(go, 800); }
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
        <aside className={`fixed inset-y-0 left-0 z-20 w-[230px] border-r border-gray-200 bg-white px-4 transition-transform lg:translate-x-0 ${menuOpen ? "translate-x-0" : "-translate-x-full"}`}>
          <div className="flex items-center gap-2.5 py-5 text-xl font-semibold text-gray-900">
            <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-500 text-[#fff]"><Calculator className="h-5 w-5" /></span>
            StructCalc
          </div>
          <p className="mb-2 text-xs uppercase tracking-wider text-gray-400">เมนู</p>
          <nav className="space-y-1">
            {MODULES.map(([key, m, Icon]) => (
              <button key={m} disabled={!key} onClick={() => { setMod(key); setMenuOpen(false); }}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-medium ${mod === key ? "bg-brand-50 text-brand-500" : key ? "text-gray-700 hover:bg-gray-100" : "text-gray-400"}`}>
                <Icon className="h-5 w-5" />{m}
                {!key && <span className="ml-auto rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400">เร็วๆ นี้</span>}
              </button>
            ))}
          </nav>
        </aside>
        {menuOpen && <div className="fixed inset-0 z-10 bg-black/50 lg:hidden" onClick={() => setMenuOpen(false)} />}

        <div className="flex min-w-0 flex-1 flex-col lg:ml-[230px]">
          <header className="border-b border-gray-200 bg-white">
            <div className="flex items-center gap-3 px-4 py-2.5 md:px-5">
              <button className="grid h-10 w-10 place-items-center rounded-lg border border-gray-200 text-gray-500 lg:hidden" onClick={() => setMenuOpen(true)}>
                <Menu className="h-5 w-5" />
              </button>
              <div className="min-w-0">
                <h1 className="text-lg font-semibold text-gray-800">{TITLES[mod][0]}</h1>
                <p className="truncate text-xs text-gray-500">{st.project.name} · {mod === "beam" ? st.project.beamNo : mod === "column" ? column.colNo : mod === "stair" ? stairSt.stairNo : mod === "footing" ? footing.footNo : mod === "roof" ? roof.roofNo : slab.slabNo} · {st.project.floor}</p>
              </div>
              <div className="ml-auto flex gap-2">
                <button onClick={() => setDark(!dark)} title={dark ? "ธีมสว่าง" : "ธีมมืด"}
                  className="grid h-10 w-10 place-items-center rounded-lg text-gray-500 ring-1 ring-gray-300 hover:bg-gray-100">
                  {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
                </button>
                {notice && <span className={`self-center text-xs ${notice.ok ? "text-green-600" : "text-red-600"}`}>{notice.text}</span>}
                <Button variant="secondary" icon={FolderOpen} title="เปิดโครงการ (.json)" onClick={() => openRef.current.click()}><span className="hidden 2xl:inline">เปิดโครงการ</span></Button>
                <input ref={openRef} type="file" accept=".json,application/json" className="hidden" onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) openProject(f); }} />
                <Button variant="secondary" icon={Save} title="บันทึกโครงการ (.json)" onClick={saveProject}><span className="hidden 2xl:inline">บันทึกโครงการ</span></Button>
                <Button variant="secondary" icon={Building2} title="ข้อมูลโครงการ" onClick={() => setProjOpen(true)}><span className="hidden 2xl:inline">ข้อมูลโครงการ</span></Button>
                <Button icon={FileDown} onClick={printReport}>พิมพ์ / บันทึก PDF</Button>
              </div>
            </div>
          </header>

          <ErrorBoundary resetKey={mod}>
          {mod === "roof" ? <RoofPage roof={roof} set={setRoof} dark={dark} /> : mod === "footing" ? <FootingPage f={footing} set={setFooting} dark={dark} /> : mod === "stair" ? <StairPage s={stairSt} set={setStair} dark={dark} /> : mod === "column" ? <ColumnPage c={column} set={setColumn} dark={dark} /> : mod === "slab" ? <SlabPage s={slab} set={setSlab} dark={dark} /> : (
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
      <ErrorBoundary resetKey={mod} quiet>{mod === "roof" ? <RoofReport roof={roof} project={st.project} /> : mod === "footing" ? <FootingReport f={footing} project={st.project} /> : mod === "stair" ? <StairReport s={stairSt} project={st.project} /> : mod === "column" ? <ColumnReport c={column} project={st.project} /> : mod === "slab" ? <SlabReport s={slab} project={st.project} /> : <Report st={st} res={res} forces={forces} fns={fns} />}</ErrorBoundary>
    </>
  );
}








