// shadcn/ui Tooltip (Radix)
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";
export const TooltipProvider = ({ delayDuration = 250, ...p }) => <TooltipPrimitive.Provider delayDuration={delayDuration} {...p} />;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;
export const TooltipContent = ({ className, sideOffset = 6, ...p }) => (
  <TooltipPrimitive.Portal><TooltipPrimitive.Content sideOffset={sideOffset} className={cn("z-50 max-w-xs rounded-md bg-gray-900 px-2.5 py-1.5 text-[12px] leading-snug text-[#fff] shadow-md", className)} {...p} /></TooltipPrimitive.Portal>);
// one-liner: <Tip text="..."><button/></Tip>
export const Tip = ({ text, side = "right", children }) => (text ? <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent side={side}>{text}</TooltipContent></Tooltip> : children);
