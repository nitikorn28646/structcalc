// shadcn/ui Label
import * as LabelPrimitive from "@radix-ui/react-label";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";
export const Label = forwardRef(({ className, ...props }, ref) => <LabelPrimitive.Root ref={ref} className={cn("text-[11px] font-medium leading-none text-gray-500 select-none", className)} {...props} />);
Label.displayName = "Label";
