/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { ReactNode } from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "../lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  leading?: ReactNode;
}

interface FancySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  className?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  leading?: ReactNode;
}

export function FancySelect({
  value,
  onChange,
  options,
  className,
  placeholder,
  id,
  ariaLabel,
  leading,
}: FancySelectProps) {
  const { t } = useTranslation();
  const selected = options.find((option) => option.value === value);

  return (
    <SelectPrimitive.Root value={value || undefined} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        id={id}
        aria-label={ariaLabel}
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-slate-850 bg-slate-900 px-3 py-2 text-left text-sm text-slate-200 shadow-xs outline-none transition-[color,box-shadow,border-color] hover:bg-slate-800 focus-visible:border-sky-500 focus-visible:ring-3 focus-visible:ring-sky-500/20 disabled:cursor-not-allowed disabled:opacity-50 data-[placeholder]:text-slate-500",
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-2">
          {leading ?? selected?.leading}
          <SelectPrimitive.Value placeholder={placeholder ?? t("common.select")} />
        </span>
        <SelectPrimitive.Icon asChild>
          <ChevronDown className="size-4 shrink-0 text-slate-500" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={6}
          className="z-[70] max-h-72 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-md border border-slate-850 bg-slate-900 text-slate-200 shadow-lg data-[state=closed]:animate-out data-[state=open]:animate-in"
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                className="relative flex w-full cursor-default select-none items-center gap-2 rounded-sm py-2 pr-8 pl-2 text-sm outline-none focus:bg-slate-800 focus:text-slate-100 data-[disabled]:pointer-events-none data-[disabled]:opacity-50"
              >
                {option.leading}
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <span className="absolute right-2 flex size-4 items-center justify-center">
                  <SelectPrimitive.ItemIndicator>
                    <Check className="size-4 text-sky-500" />
                  </SelectPrimitive.ItemIndicator>
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
