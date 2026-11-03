// shadcn/ui Input
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
export const inputClass = "h-8 w-full min-w-0 rounded-md border border-gray-200 bg-white px-2.5 text-[13px] text-gray-800 tabular-nums shadow-[0_1px_2px_rgba(16,24,40,0.04)] outline-none transition-colors placeholder:text-gray-400 hover:border-gray-300 focus-visible:border-brand-400 focus-visible:ring-2 focus-visible:ring-brand-500/15 disabled:cursor-not-allowed disabled:opacity-50";
export const Input = forwardRef(({ className, type, ...props }, ref) => <input ref={ref} type={type} className={cn(inputClass, className)} {...props} />);
Input.displayName = "Input";
