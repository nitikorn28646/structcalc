// One look for the side panels (user 2026-11-19: "แต่ละหน้ารูปแบบหน้าต่างไม่เหมือนกันเลย"): every right-hand panel is built from these
// pieces so the tabs read the same — Panel (card: icon, title, one action at the right, a short hint), Section (small heading above a
// list), List + Row (left: marker, title 13 px, detail 11 px · right: number 14 px bold with its unit under it, then small actions; a row
// can open an editor under it), PField (label 11 px above an input 32 px high), Notice (ok / warn / bad line), Note (footnote 11 px).
import { ChevronDown, Trash2 } from "lucide-react";
import { Card } from "./ui.jsx";

export const inputCls = "mt-0.5 h-8 w-full min-w-0 rounded-md border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800";
export const numCls = `${inputCls} text-right tabular-nums`;
export const smallNum = "h-7 w-20 rounded-md border border-gray-300 bg-white px-1.5 text-right text-[12px] tabular-nums";
export const btnCls = "inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-brand-600 ring-1 ring-brand-300 hover:bg-brand-50 disabled:opacity-40";
export const btnMain = "inline-flex shrink-0 items-center gap-1 rounded-md bg-brand-500 px-2.5 py-1 text-[12px] font-medium text-white hover:bg-brand-600 disabled:opacity-40";

export function Panel({ title, icon, action = null, hint = null, children }) {
  return (
    <Card title={<span className="flex items-center justify-between gap-2"><span className="truncate">{title}</span>{action}</span>} icon={icon}>
      {hint && <p className="-mt-1 mb-2 text-[11px] text-gray-500">{hint}</p>}
      {children}
    </Card>
  );
}

export function Section({ title, action = null, children, className = "" }) {
  return (
    <div className={`mt-3 first:mt-0 ${className}`}>
      <div className="mb-1 flex items-center justify-between gap-2 px-0.5 text-[11px] font-semibold text-gray-500">{title}{action}</div>
      {children}
    </div>
  );
}

export const List = ({ children }) => <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">{children}</ul>;

// lead: marker on the left · value / unit: the number at the right · tail: small actions · open + children: editor under the row
export function Row({ lead = null, title, titleCls = "", badge = null, sub = null, value = null, unit = null, tail = null, active = false, open = null, onClick = null, onEnter, onLeave, children, rowTitle }) {
  return (
    <li className={open ? "bg-gray-50/70 dark:bg-white/[0.02]" : active ? "bg-brand-50/70 dark:bg-white/[0.04]" : ""} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <div role={onClick ? "button" : undefined} tabIndex={onClick ? 0 : undefined} title={rowTitle}
        onClick={onClick ? (e) => { if (!["INPUT", "BUTTON", "SELECT"].includes(e.target.tagName)) onClick(e); } : undefined}
        onKeyDown={onClick ? (e) => e.key === "Enter" && e.target === e.currentTarget && onClick(e) : undefined}
        className={`flex min-h-[44px] items-center gap-2 px-2.5 py-1.5 ${onClick ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-white/[0.03]" : ""} ${active ? "shadow-[inset_3px_0_0_#465fff]" : ""}`}>
        {lead}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5"><span className={`truncate text-[13px] font-medium text-gray-800 ${titleCls}`} title={typeof title === "string" ? title : undefined}>{title}</span>{badge}</div>
          {sub && <div className="truncate text-[11px] text-gray-500" title={typeof sub === "string" ? sub : undefined}>{sub}</div>}
        </div>
        {value != null && <div className="shrink-0 text-right tabular-nums">{typeof value === "object" ? value : <b className="text-[14px] text-gray-800">{value}</b>}{unit && <div className="text-[10px] text-gray-400">{unit}</div>}</div>}
        {tail}
        {open != null && <ChevronDown className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </div>
      {open && <div className="space-y-2 px-2.5 pb-3 pt-1">{children}</div>}
    </li>
  );
}

export const Badge = ({ children, title }) => <span className="shrink-0 rounded bg-gray-100 px-1 text-[10px] text-gray-500 dark:bg-white/10" title={title}>{children}</span>;

// round marker that picks "the one to draw with" (wall type, library item)
export const Pick = ({ on, onClick, title, color = "#b54708" }) => (
  <button onClick={(e) => { e.stopPropagation(); onClick(); }} title={title} className="h-3.5 w-3.5 shrink-0 rounded-full ring-2 ring-gray-300 hover:ring-[#fdb022]"
    style={on ? { background: color, boxShadow: `0 0 0 2px #fdb022` } : undefined} />
);

export function PField({ label, children, className = "" }) {
  return <label className={`block min-w-0 text-[11px] text-gray-500 ${className}`}>{label}{children}</label>;
}

export function Notice({ kind = "ok", children, onEnter, onLeave, action = null }) {
  const c = { ok: "bg-green-50 text-green-700 dark:bg-green-500/10", warn: "bg-amber-50 text-[#b54708] dark:bg-amber-500/10", bad: "bg-red-50 text-red-700 dark:bg-red-500/10" }[kind];
  return <div onMouseEnter={onEnter} onMouseLeave={onLeave} className={`flex items-start gap-1.5 rounded-md px-2 py-1 text-[12px] ${c}`}><span className="flex-1">{children}</span>{action}</div>;
}

export const Note = ({ children, className = "" }) => <p className={`mt-2 text-[11px] leading-relaxed text-gray-400 ${className}`}>{children}</p>;

// a computed result in words / numbers (wall load, slab load, cantilever line load …) — one box style everywhere
export const Result = ({ children, className = "" }) => <div className={`rounded-md bg-gray-50 px-2 py-1.5 text-[12px] tabular-nums text-gray-700 ring-1 ring-gray-200 dark:bg-white/[0.03] ${className}`}>{children}</div>;
export const btnGhost = "inline-flex shrink-0 items-center justify-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50";
// delete in the panel header (the same place in every panel)
export const DelButton = ({ onClick, children = "ลบ", title }) => <button onClick={onClick} title={title} className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" />{children}</button>;

// settings list row (criteria, roof settings …): label + hint left, the control right, unit after it — the same row as Row so a page of
// settings reads like the other panels. wide = control for a long select.
export function SetRow({ label, sub = null, unit = null, wide = false, children, title }) {
  return (
    <li className="flex min-h-[44px] items-center gap-2 px-2.5 py-1.5" title={title}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-gray-800">{label}</div>
        {sub && <div className="text-[11px] leading-snug text-gray-500">{sub}</div>}
      </div>
      <div className={`flex shrink-0 items-center gap-1.5 ${wide ? "w-[230px]" : "w-[132px]"}`}><div className="min-w-0 flex-1">{children}</div>{unit != null && <span className="w-9 shrink-0 text-[11px] text-gray-400">{unit}</span>}</div>
    </li>
  );
}
export function CheckRow({ checked, onChange, label, sub = null }) {
  return (
    <li><label className="flex min-h-[44px] cursor-pointer items-start gap-2.5 px-2.5 py-2 hover:bg-gray-50 dark:hover:bg-white/[0.03]">
      <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0 accent-[#465fff]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="min-w-0"><span className="block text-[13px] font-medium text-gray-800">{label}</span>{sub && <span className="block text-[11px] leading-snug text-gray-500">{sub}</span>}</span>
    </label></li>
  );
}
// input / select inside a SetRow (h-8, right-aligned numbers)
export const ctlCls = "h-8 w-full min-w-0 rounded-md border border-gray-300 bg-transparent px-2 text-[13px] text-gray-800";
export const ctlNum = `${ctlCls} text-right tabular-nums`;
