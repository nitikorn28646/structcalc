import { Component } from "react";
// Small UI primitives in the shadcn/ui visual language (neutral borders, 6–8 px radius, small type, focus rings), Tailwind only.
export function Card({ title, icon: Icon, children, className = "", bodyClass = "" }) {
  return (
    <section className={`rounded-xl border border-gray-200 bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] ${className}`}>
      {title && (
        <header className="flex items-center gap-2 border-b border-gray-100 px-4 py-2.5 text-[13px] font-semibold tracking-tight text-gray-800">
          {Icon && <Icon className="h-4 w-4 shrink-0 text-gray-400" />}
          {title}
        </header>
      )}
      <div className={`px-4 pt-3 pb-4 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export const inputCls =
  "h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors " +
  "placeholder:text-gray-400 hover:border-gray-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-500/15 tabular-nums";

export function Field({ label, unit, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-[11px] font-medium text-gray-500">
        <span>{label}</span>
        {unit && <span className="font-normal text-gray-400">{unit}</span>}
      </span>
      {children}
    </label>
  );
}

export function NumberInput({ value, onChange, step = "any", min, className = "", placeholder }) {
  return (
    <input type="number" className={`${inputCls} ${className}`} value={value} step={step} min={min} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />
  );
}

export function TextInput({ value, onChange }) {
  return <input className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} />;
}

export function Select({ value, onChange, options, className = "" }) {
  return (
    <select className={`${inputCls} ${className}`} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Badge({ ok, children }) {
  const cls = ok ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700";
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-px text-[11px] font-semibold ${cls}`}>{children ?? (ok ? "OK" : "NG")}</span>;
}

export function Button({ children, onClick, variant = "primary", icon: Icon, title }) {
  const cls = variant === "primary"
    ? "bg-brand-500 text-[#fff] shadow-theme-xs hover:bg-brand-600"
    : "bg-white text-gray-700 border border-gray-200 shadow-[0_1px_2px_rgba(16,24,40,0.04)] hover:bg-gray-50";
  return (
    <button onClick={onClick} title={title} className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-medium transition-colors ${cls}`}>
      {Icon && <Icon className="h-4 w-4" />}
      {children}
    </button>
  );
}


// Keeps one broken view from blanking the whole app: shows the error instead (reset when `resetKey` changes).
export class ErrorBoundary extends Component {
  state = { error: null, key: null };
  static getDerivedStateFromError(error) { return { error }; }
  static getDerivedStateFromProps(p, s) { return p.resetKey !== s.key ? { error: null, key: p.resetKey } : null; }
  render() {
    if (!this.state.error) return this.props.children;
    return this.props.quiet ? null : (
      <div className="m-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        เกิดข้อผิดพลาดในหน้านี้: {String(this.state.error.message ?? this.state.error)} — ข้อมูลยังอยู่ ลองบันทึกโครงการ แล้วแจ้งข้อความนี้
      </div>
    );
  }
}