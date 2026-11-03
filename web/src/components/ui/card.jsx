// shadcn/ui Card
import { cn } from "@/lib/utils";
export const Card = ({ className, ...p }) => <div className={cn("rounded-xl border border-gray-200 bg-white text-gray-800 shadow-[0_1px_2px_rgba(16,24,40,0.04)]", className)} {...p} />;
export const CardHeader = ({ className, ...p }) => <div className={cn("flex items-center gap-2 border-b border-gray-100 px-4 py-2.5", className)} {...p} />;
export const CardTitle = ({ className, ...p }) => <div className={cn("text-[13px] font-semibold leading-none tracking-tight", className)} {...p} />;
export const CardDescription = ({ className, ...p }) => <div className={cn("text-[12px] text-gray-500", className)} {...p} />;
export const CardContent = ({ className, ...p }) => <div className={cn("px-4 pt-3 pb-4", className)} {...p} />;
export const CardFooter = ({ className, ...p }) => <div className={cn("flex items-center border-t border-gray-100 px-4 py-2.5", className)} {...p} />;
