import { Component } from "react";
// Small UI primitives in the TailAdmin visual style.
export function Card({ title, icon: Icon, children, className = "", bodyClass = "" }) {
  return (
    <section className={`rounded-2xl border border-gray-200 bg-white ${className}`}>
      {title && (
        <header className="flex items-center gap-3 px-5 pt-4 text-base font-semibold text-gray-800">
          {Icon && (
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gray-100">
              <Icon className="h-[18px] w-[18px] text-gray-700" />
            </span>
          )}
          {title}
        </header>
      )}
      <div className={`px-5 pt-3 pb-4 ${bodyClass}`}>{children}</div>
    </section>
  );
}

export const inputCls =
  "h-9 w-full rounded-lg border border-gray-300 bg-transparent px-3 text-sm text-gray-800 shadow-theme-xs outline-none " +
  "placeholder:text-gray-400 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/10";

export function Field({ label, unit, children }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-medium text-gray-600">
        <span>{label}</span>
        {unit && <span className="font-normal text-gray-400">{unit}</span>}
      </span>
      {children}
    </label>
  );
}

export function NumberInput({ value, onChange, step = "any", min, className = "" }) {
  return (
    <input type="number" className={`${inputCls} ${className}`} value={value} step={step} min={min}
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
  const cls = ok ? "bg-green-50 text-green-600" : "bg-red-50 text-red-600";
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>{children ?? (ok ? "OK" : "NG")}</span>;
}

export function Button({ children, onClick, variant = "primary", icon: Icon, title }) {
  const cls = variant === "primary"
    ? "bg-brand-500 text-[#fff] shadow-theme-xs hover:bg-brand-600"
    : "bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50";
  return (
    <button onClick={onClick} title={title} className={`inline-flex shrink-0 items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium ${cls}`}>
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