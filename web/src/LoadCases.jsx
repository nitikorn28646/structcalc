// Load Cases page (user 2026-11-04: "I like the STAAD.Pro way of putting loads"): one place for every load of the floor, as a tree
// of load cases → load items, and an Add / Assign panel. Floor loads (kg/m²) go on slab panels, member loads UNI (kg/m — walls are
// typed as a number, no wall build-up needed) and CON (kg at d1) on beams, nodal loads on columns. Assign to the members selected
// on the plan (click, Ctrl/Shift + click, box) or arm "use cursor to assign" and click members one by one.
// Data stays where the engine reads it: panels[key].finish / live, floor.lineLoads { g }, floor.pointLoads { g }; the tree is
// built from them (items = groups of equal value and name), so old projects show up here unchanged.
import { useState } from "react";
import { ChevronDown, ChevronRight, MousePointerClick, Trash2 } from "lucide-react";
import { Card } from "./ui.jsx";
import { fmt } from "./beamModel.js";
import { highlight } from "./highlight.js";
import { wallLoad, wallsOf } from "../engine/floor.js";

const KINDS = [["floor", "Floor Load — แผ่นพื้น", "kg/m²"], ["uni", "Member Load UNI — แผ่บนคาน", "kg/m"], ["con", "Member Load CON — จุดบนคาน", "kg"], ["node", "Nodal Load — หัวเสา", "kg"]];
const CASES = [["DL", "1 : DL น้ำหนักคงที่"], ["LL", "2 : LL น้ำหนักจร"]];
const inp = "h-7 w-full rounded-md border border-gray-200 bg-white px-2 text-[12px] tabular-nums dark:border-gray-700 dark:bg-gray-900";
const segsOf = (P) => P.map((p, i) => [p, P[(i + 1) % P.length]]);
const near = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.03;

export default function LoadCases({ frame, fl, an, cur, setFloor, multi, setPickSet, armed, setArmed, onLateral, pickRef }) {
  const [form, setForm] = useState({ kind: "uni", lc: "DL", g: "WALL", name: "ผนัง", v: 500, d1: 0 });
  const [open, setOpen] = useState({ DL: true, LL: true, C: true });
  const [msg, setMsg] = useState("");
  const panels = an?.panels ?? [], lines = fl.lineLoads ?? [], points = fl.pointLoads ?? [], beams = fl.beams ?? [], cols = fl.columns ?? [];
  const wt = frame.wallTypes ?? [];

  // ---- tree items (groups of equal value) ----
  const group = (list, keyOf) => { const m = new Map(); list.forEach((x) => { const k = keyOf(x); m.set(k, [...(m.get(k) ?? []), x]); }); return [...m.entries()]; };
  const floorItems = (field) => group(panels.filter((p) => !p.open && !p.stairWell && p.st !== "GS"), (p) => p[field]).map(([v, ps]) => ({
    id: `f-${field}-${v}`, text: `FLOOR −${fmt(Number(v), 0)} kg/m²`, note: `${field === "finish" ? "ปูผิว/ฝ้า" : "จร"} · ${ps.length} แผ่น (${ps.map((p) => p.key).slice(0, 6).join(", ")}${ps.length > 6 ? " …" : ""})`,
    v: Number(v), polys: ps.map((p) => p.P), form: { kind: "floor", lc: field === "live" ? "LL" : "DL", v: Number(v) }, pick: ps.map((p) => ({ kind: "panel", i: panels.indexOf(p) })),
    set: (nv) => setFloor({ panels: { ...fl.panels, ...Object.fromEntries(ps.map((p) => [p.key, { ...(fl.panels?.[p.key] ?? {}), [field]: nv }])) } }),
  }));
  const lineItems = (pred) => group(lines.map((l, i) => ({ ...l, i })).filter(pred), (l) => `${l.g ?? "SP"}|${l.q}|${l.name ?? ""}`).map(([k, ls]) => ({
    id: `l-${k}`, text: `UNI GY −${fmt(ls[0].q, 0)} kg/m`, note: `${ls[0].name || "น้ำหนักแผ่"}${ls[0].g === "WALL" ? " (ผนัง)" : ""} · ${ls.length} ช่วง`, v: ls[0].q, segs: ls.map((l) => [l.a, l.b]), form: { kind: "uni", lc: ls[0].g === "LL" ? "LL" : "DL", g: ls[0].g === "LL" ? "WALL" : ls[0].g ?? "SP", name: ls[0].name ?? "", v: ls[0].q },
    pick: ls.map((l) => { const bi = beams.findIndex((b) => near(b.a, l.a) && near(b.b, l.b)); return bi >= 0 ? { kind: "beam", i: bi } : null; }).filter(Boolean),
    set: (nv) => setFloor({ lineLoads: lines.map((l, i) => (ls.some((x) => x.i === i) ? { ...l, q: nv } : l)) }),
    del: () => setFloor({ lineLoads: lines.filter((_, i) => !ls.some((x) => x.i === i)) }),
  }));
  const pointItems = (pred) => group(points.map((q, i) => ({ ...q, i })).filter(pred), (q) => `${q.g ?? "SP"}|${q.P}|${q.name ?? ""}`).map(([k, qs]) => {
    const node = qs.every((q) => cols.some((c) => near(c, q.p)));
    return { id: `p-${k}`, text: `${node ? "NODE FY" : "CON GY"} −${fmt(qs[0].P, 0)} kg`, note: `${qs[0].name || "น้ำหนักจุด"} · ${qs.length} จุด${qs[0].g === "LL" ? " (คิดเต็มทุกช่วงเหมือนน้ำหนักคงที่)" : ""}`, v: qs[0].P, pts: qs.map((q) => q.p), form: { kind: node ? "node" : "con", lc: qs[0].g === "LL" ? "LL" : "DL", name: qs[0].name ?? "", v: qs[0].P },
      pick: qs.map((q) => { const ci = cols.findIndex((c) => near(c, q.p)); return ci >= 0 ? { kind: "column", i: ci } : null; }).filter(Boolean),
      set: (nv) => setFloor({ pointLoads: points.map((q, i) => (qs.some((x) => x.i === i) ? { ...q, P: nv } : q)) }),
      del: () => setFloor({ pointLoads: points.filter((_, i) => !qs.some((x) => x.i === i)) }) };
  });
  const walls = wallsOf(fl), wallItems = walls.length ? [{ id: "walls", text: `ผนังที่วาดไว้ ${walls.length} แนว`, note: `${fmt(walls.reduce((s, w) => s + wallLoad(w, wt), 0) / Math.max(1, walls.length), 0)} kg/m เฉลี่ย · แก้ที่แท็บ "ผนัง (แบบวาด)"`, segs: walls.map((w) => [w.a, w.b]), ro: true }] : [];
  const tree = {
    DL: [{ id: "sw", text: "SELFWEIGHT Y −1", note: `คาน พื้น เสา คิดอัตโนมัติ · ชั้นนี้ ${fmt((an?.groups?.DL ?? 0) / 1000, 1)} ตัน`, ro: true },
      ...floorItems("finish"), ...lineItems((l) => l.g !== "LL"), ...wallItems, ...pointItems((q) => q.g !== "LL")],
    LL: [...floorItems("live"), ...lineItems((l) => l.g === "LL"), ...pointItems((q) => q.g === "LL")],
  };

  // ---- check: slabs with no finish / no live load (user 2026-11-04: "which slab did I forget to load?") ----
  const live = panels.filter((p) => !p.open && !p.stairWell && p.st !== "GS");
  const noLive = live.filter((p) => !(p.live > 0)), noFin = live.filter((p) => !(p.finish > 0)), dflt = live.filter((p) => !fl.panels?.[p.key] || (fl.panels[p.key].finish === undefined && fl.panels[p.key].live === undefined));
  const name = (p) => `P${panels.indexOf(p) + 1}`;
  const checks = [
    noLive.length && { bad: true, text: `ไม่มีน้ำหนักจร ${noLive.length} แผ่น: ${noLive.map(name).join(", ")}`, ps: noLive },
    noFin.length && { bad: true, text: `ไม่มีปูผิว/ฝ้า ${noFin.length} แผ่น: ${noFin.map(name).join(", ")}`, ps: noFin },
    dflt.length && { bad: false, text: `ใช้ค่าเริ่มต้นของชั้น (ยังไม่ได้ Assign) ${dflt.length} แผ่น: ${dflt.map(name).slice(0, 12).join(", ")}${dflt.length > 12 ? " …" : ""}`, ps: dflt },
  ].filter(Boolean);

  // ---- assign ----
  const unit = KINDS.find((k) => k[0] === form.kind)[2];
  const assign = (targets) => {
    const v = Number(form.v) || 0, out = { panels: null, lineLoads: null, pointLoads: null }; let n = 0, skip = 0;
    for (const t of targets) {
      if (form.kind === "floor" && t.kind === "panel") { const p = panels[t.i]; if (!p) continue; out.panels = out.panels ?? { ...fl.panels }; out.panels[p.key] = { ...(out.panels[p.key] ?? {}), [form.lc === "LL" ? "live" : "finish"]: v }; n++; }
      else if (form.kind === "uni" && t.kind === "beam") { const b = beams[t.i]; if (!b) continue; if (b.arc?.s) { skip++; continue; } out.lineLoads = out.lineLoads ?? [...lines]; out.lineLoads.push({ a: [...b.a], b: [...b.b], q: v, name: form.name, g: form.lc === "LL" ? "LL" : form.g }); n++; }
      else if (form.kind === "con" && t.kind === "beam") { const b = beams[t.i]; if (!b) continue; const L = Math.hypot(b.b[0] - b.a[0], b.b[1] - b.a[1]), d = Math.min(L, Math.max(0, Number(form.d1) || 0)) / (L || 1);
        out.pointLoads = out.pointLoads ?? [...points]; out.pointLoads.push({ p: [b.a[0] + (b.b[0] - b.a[0]) * d, b.a[1] + (b.b[1] - b.a[1]) * d], P: v, name: form.name, g: form.lc }); n++; }
      else if (form.kind === "node" && t.kind === "column") { out.pointLoads = out.pointLoads ?? [...points]; out.pointLoads.push({ p: [...cols[t.i]], P: v, name: form.name, g: form.lc }); n++; }
    }
    const patch = Object.fromEntries(Object.entries(out).filter(([, x]) => x));
    if (n) setFloor(patch);
    const need = { floor: "แผ่นพื้น", uni: "คาน", con: "คาน", node: "เสา" }[form.kind];
    setMsg(n ? `ใส่แล้ว ${n} ${need}${skip ? ` · ข้ามคานโค้ง ${skip} ตัว (ใส่ด้วยแท็บน้ำหนักอื่น)` : ""}` : `ยังไม่ได้เลือก${need} — คลิก / Ctrl+คลิก / ลากกรอบบนแปลน`);
  };
  // the board calls this when "use cursor" is armed
  if (pickRef) pickRef.current = (t) => assign([t]);

  const Head = ({ k, label, tag = "L" }) => (
    <button onClick={() => setOpen({ ...open, [k]: !open[k] })} className="flex w-full items-center gap-1 py-0.5 text-left text-[12.5px] font-semibold text-gray-800 dark:text-gray-100">
      {open[k] ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
      <span className={`grid h-4 w-4 place-items-center rounded-sm text-[9px] font-bold text-white ${tag === "C" ? "bg-[#3e63dd]" : "bg-[#b42318]"}`}>{tag}</span>{label}</button>);
  const sel = { panel: multi.filter((m) => m.kind === "panel").length, beam: multi.filter((m) => m.kind === "beam").length, column: multi.filter((m) => m.kind === "column").length };

  return (<>
    <Card title={`Load Cases — ${fl.name}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5 text-[11.5px] text-gray-600 dark:bg-white/5 dark:text-gray-300">
        <span className="font-medium">ค่าเริ่มต้นทั้งชั้น</span>
        <label className="flex items-center gap-1">ปูผิว/ฝ้า<input type="number" step="10" defaultValue={fl.finish} key={`f${cur}-${fl.finish}`} onBlur={(e) => Number(e.target.value) !== fl.finish && setFloor({ finish: Number(e.target.value) || 0 })} className="h-6 w-16 rounded border border-gray-200 bg-white px-1 text-right tabular-nums dark:border-gray-700 dark:bg-gray-900" /></label>
        <label className="flex items-center gap-1">จร<input type="number" step="50" defaultValue={fl.live} key={`l${cur}-${fl.live}`} onBlur={(e) => Number(e.target.value) !== fl.live && setFloor({ live: Number(e.target.value) || 0 })} className="h-6 w-16 rounded border border-gray-200 bg-white px-1 text-right tabular-nums dark:border-gray-700 dark:bg-gray-900" /></label>
        <span className="text-gray-400">กก./ม.² · ใช้กับแผ่นที่ไม่ได้ Assign เอง</span>
      </div>
      <div className="mb-2 space-y-0.5 text-[11.5px]">
        {checks.length ? checks.map((c) => (
          <div key={c.text} onMouseEnter={() => highlight({ floor: cur, polys: c.ps.map((p) => p.P), bad: c.bad })} onMouseLeave={() => highlight(null)}
            className={`flex items-start gap-1.5 rounded px-1.5 py-0.5 ${c.bad ? "bg-red-50 text-red-700 dark:bg-red-500/10" : "bg-amber-50 text-[#b54708] dark:bg-amber-500/10"}`}>
            <span>{c.bad ? "⚠" : "ⓘ"}</span><span className="flex-1">{c.text}</span>
            <button onClick={() => setPickSet(c.ps.map((p) => ({ kind: "panel", i: panels.indexOf(p) })))} className="shrink-0 text-brand-500 hover:underline">เลือก</button></div>))
          : <p className="rounded bg-green-50 px-1.5 py-0.5 text-green-700 dark:bg-green-500/10">✓ ทุกแผ่นมีน้ำหนักปูผิวและน้ำหนักจร และ Assign ครบแล้ว</p>}
      </div>
      <div className="max-h-[46vh] space-y-0.5 overflow-auto pr-1">
        {CASES.map(([k, label]) => (<div key={k}><Head k={k} label={label} />
          {open[k] && <div className="ml-4 border-l border-gray-200 pl-1.5 dark:border-gray-700">{tree[k].length ? tree[k].map((it) => <Item key={it.id} it={it} cur={cur} setPickSet={setPickSet} active={it.form && JSON.stringify(it.form) === JSON.stringify({ ...it.form, ...Object.fromEntries(Object.keys(it.form).map((k) => [k, k === "v" ? Number(form.v) : form[k]])) })} onUse={it.form ? () => { setForm({ ...form, ...it.form }); setMsg(`รายการปัจจุบัน: ${it.text} — เลือกบนแปลนแล้วกด Assign`); } : null} />) : <p className="px-1 text-[11px] text-gray-400">ยังไม่มีรายการ</p>}</div>}</div>))}
        <Head k="C" label="3 : DL+LL (ชุดผสม)" tag="C" />
        {open.C && <div className="ml-4 border-l border-gray-200 pl-2 text-[11px] text-gray-500 dark:border-gray-700">1.0 DL + 1.0 LL (WSD) · น้ำหนักจรจัดเรียงทีละช่วงเพื่อหาค่ามากสุด · ลม / แผ่นดินไหว{onLateral ? <> ดูที่ <button onClick={onLateral} className="text-brand-500 hover:underline">แท็บลม / แผ่นดินไหว</button></> : null}</div>}
      </div>
      <p className="mt-1 text-[10.5px] text-gray-400">ชี้รายการ = ไฮไลต์บนแปลน / 3D (ยังไม่ใช่การเลือก) · คลิกรายการ = ใช้เป็นน้ำหนักในฟอร์ม Assign · "เลือก" = เลือกชิ้นของรายการนั้นบนแปลน · แก้ตัวเลขแล้ว Enter = แก้ทุกชิ้นในรายการ</p>
    </Card>
    <Card title="เพิ่มน้ำหนัก (Add) → Assign">
      <div className="grid grid-cols-2 gap-2 text-[12px]">
        <label className="col-span-2">ชนิด<select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value, ...(e.target.value === "floor" ? { name: "" } : {}) })} className={inp}>{KINDS.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        <label>Load case<select value={form.lc} onChange={(e) => setForm({ ...form, lc: e.target.value })} className={inp}>{CASES.map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
        {form.kind === "uni" && form.lc === "DL" ? <label>กลุ่ม<select value={form.g} onChange={(e) => setForm({ ...form, g: e.target.value })} className={inp}><option value="WALL">ผนัง</option><option value="SDL">งานระบบ/ปูผิว</option><option value="SP">อื่น ๆ</option></select></label> : <span />}
        {form.kind !== "floor" && <label className="col-span-2">ชื่อ<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inp} placeholder="เช่น ผนังอิฐมอญ, ราวกันตก, ถังน้ำ" /></label>}
        <label>{form.kind === "floor" ? (form.lc === "LL" ? "น้ำหนักจร" : "ปูผิว/ฝ้า") : "W1"} ({unit})<input type="number" value={form.v} onChange={(e) => setForm({ ...form, v: e.target.value })} className={inp} /></label>
        {form.kind === "con" ? <label>d1 จากต้นคาน (m)<input type="number" step="0.05" value={form.d1} onChange={(e) => setForm({ ...form, d1: e.target.value })} className={inp} /></label> : <span />}
      </div>
      <p className="mt-1.5 text-[11px] text-gray-500">เลือกบนแปลน: คาน {sel.beam} · เสา {sel.column} · แผ่นพื้น {sel.panel} — คลิก, Ctrl/Shift+คลิก เพิ่ม, ลากกรอบ (ซ้าย→ขวา ทั้งชิ้น / ขวา→ซ้าย แตะ), Ctrl+A ทั้งหมด</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <button onClick={() => assign(multi)} className="rounded-md bg-brand-500 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600">Assign ให้ที่เลือก</button>
        <button onClick={() => setArmed(!armed)} className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-[12px] font-medium ring-1 ${armed ? "bg-[#f79009] text-white ring-[#f79009]" : "text-gray-700 ring-gray-300 hover:bg-gray-50 dark:text-gray-200"}`}>
          <MousePointerClick className="h-3.5 w-3.5" />{armed ? "กำลังใช้เคอร์เซอร์ Assign (คลิกเพื่อหยุด)" : "ใช้เคอร์เซอร์ Assign"}</button>
      </div>
      {(() => { // the selection does not fit the load kind (user: assigned with UNI while slabs were picked)
        const want = { floor: "panel", uni: "beam", con: "beam", node: "column" }[form.kind], have = Object.entries(sel).filter(([, n]) => n > 0).map(([k]) => k);
        if (!have.length || have.includes(want)) return null;
        const to = have.includes("panel") ? "floor" : have.includes("beam") ? "uni" : "node";
        return <p className="mt-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] text-[#b54708]">ที่เลือกไว้เป็น{{ panel: "แผ่นพื้น", beam: "คาน", column: "เสา" }[have[0]]} แต่ชนิดน้ำหนักคือ {KINDS.find((k) => k[0] === form.kind)[1]} — <button onClick={() => setForm({ ...form, kind: to })} className="font-medium text-brand-600 underline">เปลี่ยนเป็น {KINDS.find((k) => k[0] === to)[1]}</button></p>;
      })()}
      {msg && <p className="mt-1 text-[11px] text-brand-600">{msg}</p>}
      <p className="mt-1 text-[10.5px] text-gray-400">UNI ใส่ตลอดความยาวคาน · ผนังกรอกเป็น kg/m ได้เลย · Floor Load แทนค่าเดิมของแผ่น · น้ำหนักจุด LL คิดเต็มทุกช่วง (ปลอดภัย)</p>
    </Card>
  </>);
}

function Item({ it, cur, setPickSet, active, onUse }) {
  const [v, setV] = useState(it.v);
  return (
    <div onMouseEnter={() => highlight({ floor: cur, segs: it.segs ?? [], polys: it.polys ?? [], pts: it.pts ?? [], p: it.pts?.[0] ?? null, bad: false })} onMouseLeave={() => highlight(null)}
      onClick={(e) => { if (onUse && !["INPUT", "BUTTON"].includes(e.target.tagName)) onUse(); }} title={onUse ? "คลิก = ใช้รายการนี้ในฟอร์ม Assign" : undefined}
      className={`group flex items-center gap-1.5 rounded px-1 py-0.5 ${onUse ? "cursor-pointer" : ""} ${active ? "bg-brand-50 ring-1 ring-brand-300 dark:bg-white/10" : "hover:bg-brand-50/60 dark:hover:bg-white/5"}`}>
      <span className="h-2 w-2 shrink-0 rounded-sm bg-[#12b76a]" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11.5px] text-gray-800 dark:text-gray-200">{it.text}</div>
        <div className="truncate text-[10.5px] text-gray-500" title={it.note}>{it.note}</div>
      </div>
      {!it.ro && <input type="number" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => Number(v) !== it.v && it.set(Number(v) || 0)} onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className="h-6 w-16 rounded border border-gray-200 bg-white px-1 text-right text-[11.5px] tabular-nums dark:border-gray-700 dark:bg-gray-900" title="แก้ค่า = แก้ทุกชิ้นในรายการนี้" />}
      {it.pick?.length > 0 && <button onClick={() => setPickSet([...it.pick])} className="rounded px-1 text-[10.5px] text-brand-500 hover:underline" title="เลือกชิ้นที่ได้รับรายการนี้บนแปลน">เลือก</button>}
      {it.del && <button onClick={it.del} className="text-gray-300 hover:text-red-500" title="ลบรายการนี้"><Trash2 className="h-3.5 w-3.5" /></button>}
    </div>);
}
