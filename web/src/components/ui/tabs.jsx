// shadcn/ui Tabs (Radix): keyboard arrows, roles and focus handled by Radix
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";
export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...p }) => <TabsPrimitive.List className={cn("inline-flex h-8 items-center rounded-lg bg-gray-100 p-0.5 text-gray-500", className)} {...p} />;
export const TabsTrigger = ({ className, ...p }) => (
  <TabsPrimitive.Trigger className={cn("inline-flex h-7 items-center justify-center whitespace-nowrap rounded-md px-3 text-xs font-medium transition-all outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 hover:text-gray-700 data-[state=active]:bg-white data-[state=active]:text-gray-800 data-[state=active]:shadow-xs", className)} {...p} />);
export const TabsContent = ({ className, ...p }) => <TabsPrimitive.Content className={cn("outline-none", className)} {...p} />;
