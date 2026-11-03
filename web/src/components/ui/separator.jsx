// shadcn/ui Separator
import * as SeparatorPrimitive from "@radix-ui/react-separator";
import { cn } from "@/lib/utils";
export const Separator = ({ className, orientation = "horizontal", decorative = true, ...p }) => (
  <SeparatorPrimitive.Root decorative={decorative} orientation={orientation} className={cn("shrink-0 bg-gray-200", orientation === "horizontal" ? "h-px w-full" : "h-full w-px", className)} {...p} />);
