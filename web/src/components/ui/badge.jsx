// shadcn/ui Badge (+ ok / ng / warn variants for design checks)
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
export const badgeVariants = cva("inline-flex items-center gap-1 rounded-md border px-1.5 py-px text-[11px] font-semibold whitespace-nowrap", {
  variants: { variant: { default: "border-transparent bg-brand-500 text-[#fff]", secondary: "border-transparent bg-gray-100 text-gray-700", outline: "border-gray-200 text-gray-700",
    ok: "border-green-200 bg-green-50 text-green-700", ng: "border-red-200 bg-red-50 text-red-700", warn: "border-amber-200 bg-amber-50 text-amber-700" } },
  defaultVariants: { variant: "default" } });
export const Badge = ({ className, variant, ...p }) => <span className={cn(badgeVariants({ variant }), className)} {...p} />;
