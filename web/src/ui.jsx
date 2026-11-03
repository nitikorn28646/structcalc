import { Component } from "react";
import { Card as UiCard, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, inputClass } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge as UiBadge } from "@/components/ui/badge";
import { Button as UiButton } from "@/components/ui/button";
import { cn } from "@/lib/utils";
// App primitives built on the shadcn/ui components (src/components/ui): same props as before, so every page uses shadcn.
export function Card({ title, icon: Icon, children, className = "", bodyClass = "" }) {
  return (
    <UiCard className={className}>
      {title && <CardHeader>{Icon && <Icon className="h-4 w-4 shrink-0 text-gray-400" />}<CardTitle className="flex-1">{title}</CardTitle></CardHeader>}
      <CardContent className={bodyClass}>{children}</CardContent>
    </UiCard>
  );
}

export const inputCls = inputClass;

export function Field({ label, unit, children }) {
  return (
    <Label className="block">
      <span className="mb-1 flex justify-between"><span>{label}</span>{unit && <span className="font-normal text-gray-400">{unit}</span>}</span>
      {children}
    </Label>
  );
}

export function NumberInput({ value, onChange, step = "any", min, className = "", placeholder }) {
  return <Input type="number" className={className} value={value} step={step} min={min} placeholder={placeholder} onChange={(e) => onChange(e.target.value === "" ? 0 : Number(e.target.value))} />;
}

export function TextInput({ value, onChange }) {
  return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
}

// native select (keyboard / mobile friendly, testable) in the shadcn input style
export function Select({ value, onChange, options, className = "" }) {
  return (
    <select className={cn(inputClass, "pr-7", className)} value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map((o) => {
        const [v, l] = Array.isArray(o) ? o : [o, o];
        return <option key={v} value={v}>{l}</option>;
      })}
    </select>
  );
}

export function Badge({ ok, children }) {
  return <UiBadge variant={ok ? "ok" : "ng"}>{children ?? (ok ? "OK" : "NG")}</UiBadge>;
}

export function Button({ children, onClick, variant = "primary", icon: Icon, title }) {
  return <UiButton onClick={onClick} title={title} variant={variant === "primary" ? "default" : "outline"}>{Icon && <Icon />}{children}</UiButton>;
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