import * as React from "react";
import { cn } from "../../lib/utils";

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    data-slot="textarea"
    className={cn(
      "flex min-h-20 w-full rounded-md border border-slate-850 bg-slate-900 px-3 py-2 text-sm text-slate-100 shadow-xs outline-none transition-[color,box-shadow,border-color] placeholder:text-slate-500 focus-visible:border-sky-500 focus-visible:ring-3 focus-visible:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  />
));

Textarea.displayName = "Textarea";
