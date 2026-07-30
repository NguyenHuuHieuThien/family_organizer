import * as React from "react";
import { cn } from "../../lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({ className, type, ...props }, ref) => (
  <input
    ref={ref}
    type={type}
    data-slot="input"
    className={cn(
      "flex h-9 w-full min-w-0 rounded-md border border-slate-850 bg-slate-900 px-3 py-1 text-sm text-slate-100 shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-slate-500 focus-visible:border-sky-500 focus-visible:ring-3 focus-visible:ring-sky-500/20 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));

Input.displayName = "Input";
