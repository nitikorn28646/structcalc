// shadcn/ui Button (colours mapped to the app palette so the dark theme follows)
import { Slot } from "@radix-ui/react-slot";
import { cva } from "class-variance-authority";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

export const buttonVariants = cva(
  "inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[13px] font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30 disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0",
  { variants: {
      variant: {
        default: "bg-brand-500 text-[#fff] shadow-xs hover:bg-brand-600",
        outline: "border border-gray-200 bg-white text-gray-700 shadow-xs hover:bg-gray-50",
        secondary: "bg-gray-100 text-gray-800 hover:bg-gray-200",
        ghost: "text-gray-600 hover:bg-gray-100 hover:text-gray-800",
        destructive: "bg-red-600 text-[#fff] hover:bg-red-700",
        link: "text-brand-500 underline-offset-4 hover:underline",
      },
      size: { default: "h-8 px-3", sm: "h-7 rounded-md px-2.5 text-[12px]", lg: "h-9 px-4", icon: "size-8" },
    },
    defaultVariants: { variant: "default", size: "default" } });

export const Button = forwardRef(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";
