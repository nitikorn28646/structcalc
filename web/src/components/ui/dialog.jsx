// shadcn/ui Dialog (Radix): focus trap, Esc to close, scroll lock
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogContent = ({ className, children, wide, ...p }) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50" />
    <DialogPrimitive.Content aria-describedby={undefined} className={cn("fixed top-1/2 left-1/2 z-50 grid max-h-[90vh] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-3 overflow-y-auto rounded-xl border border-gray-200 bg-white p-5 shadow-lg", wide ? "max-w-3xl" : "max-w-lg", className)} {...p}>
      {children}
      <DialogPrimitive.Close className="absolute top-3 right-3 rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600" title="ปิด"><X className="h-4 w-4" /></DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>);
export const DialogHeader = ({ className, ...p }) => <div className={cn("flex flex-col gap-1 pr-6", className)} {...p} />;
export const DialogTitle = ({ className, ...p }) => <DialogPrimitive.Title className={cn("text-base font-semibold text-gray-800", className)} {...p} />;
export const DialogDescription = ({ className, ...p }) => <DialogPrimitive.Description className={cn("text-[12px] text-gray-500", className)} {...p} />;
export const DialogFooter = ({ className, ...p }) => <div className={cn("flex justify-end gap-2", className)} {...p} />;
