// shadcn/ui helper: join class names and let later Tailwind classes win
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs) => twMerge(clsx(inputs));
