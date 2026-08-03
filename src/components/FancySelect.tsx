/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";
import { Check } from "lucide-react";
import { cn } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  leading?: ReactNode;
}

interface FancySelectProps {
  value: string;
  onChange?: (value: string) => void;
  values?: string[];
  onValuesChange?: (values: string[]) => void;
  options: readonly SelectOption[];
  className?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  leading?: ReactNode;
  disabled?: boolean;
  mode?: "radio" | "checkbox";
  exclusiveValues?: string[];
  wrapLabels?: boolean;
  inlineGrid?: boolean;
}

export function FancySelect({
  value,
  onChange,
  values,
  onValuesChange,
  options,
  className,
  id,
  ariaLabel,
  leading,
  disabled = false,
  mode = "radio",
  exclusiveValues = [],
  wrapLabels = false,
  inlineGrid = false,
}: FancySelectProps) {
  const selectedValue = value || options[0]?.value || "";
  const selectedValues = values || [];
  return (
    <div
      id={id}
      role={mode === "radio" ? "radiogroup" : "group"}
      data-inline-grid={inlineGrid ? "true" : undefined}
      aria-label={ariaLabel}
      className={cn(
        "grid max-h-56 w-full gap-1.5 overflow-y-auto rounded-xl border border-slate-850 bg-slate-950/55 p-1.5 shadow-xs",
        className?.includes("grid-cols-") ? "" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
        className,
      )}
    >
      {options.map((option) => {
        const active = mode === "checkbox" && values !== undefined
          ? selectedValues.includes(option.value)
          : option.value === selectedValue;
        const handleClick = () => {
          if (mode === "checkbox" && onValuesChange && values !== undefined) {
            const isExclusive = exclusiveValues.includes(option.value);
            const next = active
              ? selectedValues.filter((v) => v !== option.value)
              : isExclusive
                ? [option.value]
                : [...selectedValues.filter((v) => !exclusiveValues.includes(v)), option.value];
            onValuesChange(next);
            return;
          }
          onChange?.(option.value);
        };
        return (
          <button
            key={option.value}
            type="button"
            role={mode === "radio" ? "radio" : "checkbox"}
            aria-checked={active}
            disabled={disabled}
            onClick={handleClick}
            className={cn(
              "flex min-h-9 min-w-0 items-center justify-between gap-2 rounded-lg border px-2.5 py-2 text-left text-xs font-semibold outline-none transition-all focus-visible:ring-3 focus-visible:ring-sky-500/20",
              active
                ? "border-teal-400/70 bg-teal-500 text-slate-950 shadow-[inset_0_0_0_1px_rgba(45,212,191,0.2)]"
                : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:bg-slate-800 hover:text-slate-200",
              disabled && "cursor-not-allowed opacity-50 hover:border-slate-800 hover:bg-slate-900 hover:text-slate-400",
            )}
          >
            <span className={cn("flex min-w-0 items-center gap-2", wrapLabels && "items-start") }>
              {option.leading ?? (active ? leading : null)}
              <span className={cn("min-w-0", wrapLabels ? "whitespace-normal leading-tight break-words" : "truncate")}>{option.label}</span>
            </span>
            <span className={cn("flex size-4 shrink-0 items-center justify-center border", mode === "radio" ? "rounded-full" : "rounded", active ? "border-teal-200 bg-teal-100 text-teal-700" : "border-slate-700 text-transparent")}>
              <Check className="size-3" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
