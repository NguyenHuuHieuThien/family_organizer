import type { HTMLAttributes } from "react";
import { cn } from "../../lib/utils";

interface PageShellProps extends HTMLAttributes<HTMLDivElement> {
  page: string;
}

export function PageShell({ page, className, ...props }: PageShellProps) {
  return (
    <div
      data-slot="page-shell"
      data-page={page}
      className={cn("app-page mx-auto min-h-full w-full max-w-[1440px]", className)}
      {...props}
    />
  );
}
