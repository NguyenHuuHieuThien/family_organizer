/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { createPortal } from "react-dom";
import { Calendar, Clock, ChevronLeft, ChevronRight, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";

/**
 * Browser-independent 24-hour time controls.
 *
 * To guarantee consistent styling and 24h behavior, we use custom dropdown/popover picker
 * elements that are theme-aware (dark slate theme) and render via portals.
 *
 * String formats:
 *   TimeSelect24    value = "HH:mm"
 *   DateTimePicker24 value = "YYYY-MM-DD HH:mm"
 */

const pad = (n: number) => String(n).padStart(2, "0");
const HOURS = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTES = Array.from({ length: 60 }, (_, i) => pad(i));

export function isoToDateVN(value?: string | null): string {
  const datePart = String(value || "").slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

export function dateVNToIso(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length !== 8) return "";
  const dd = digits.slice(0, 2);
  const mm = digits.slice(2, 4);
  const yyyy = digits.slice(4, 8);
  const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
  if (d.getFullYear() !== Number(yyyy) || d.getMonth() !== Number(mm) - 1 || d.getDate() !== Number(dd)) {
    return "";
  }
  return `${yyyy}-${mm}-${dd}`;
}

function maskDateVN(value: string): string {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function formatDateVN(value?: string | null): string {
  return isoToDateVN(value) || String(value || "");
}

export function formatDateTimeVN(value?: string | null): string {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const [datePart, timePart = ""] = raw.split(" ");
  const date = formatDateVN(datePart);
  return timePart ? `${date} ${timePart.slice(0, 5)}` : date;
}

// Generate calendar days grid (6 weeks = 42 days), Monday-first
function getCalendarGrid(year: number, month: number) {
  // getDay() returns 0=Sun,1=Mon,...,6=Sat
  // We want Mon=0 offset, so shift: (getDay()+6)%7 gives Mon=0,Tue=1,...,Sun=6
  const rawFirstDay = new Date(year, month, 1).getDay();
  const firstDayIndex = (rawFirstDay + 6) % 7; // Monday-based offset
  const totalDays = new Date(year, month + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  
  const grid = [];
  
  // Previous month padding days
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    grid.push({
      day: prevMonthTotalDays - i,
      month: month === 0 ? 11 : month - 1,
      year: month === 0 ? year - 1 : year,
      isCurrentMonth: false
    });
  }
  
  // Current month days
  for (let i = 1; i <= totalDays; i++) {
    grid.push({
      day: i,
      month,
      year,
      isCurrentMonth: true
    });
  }
  
  // Next month padding days to fill 42 cells
  const remainingCells = 42 - grid.length;
  for (let i = 1; i <= remainingCells; i++) {
    grid.push({
      day: i,
      month: month === 11 ? 0 : month + 1,
      year: month === 11 ? year + 1 : year,
      isCurrentMonth: false
    });
  }
  
  return grid;
}


export function DateInputDMY({
  value,
  onChange,
  required = false,
  className = "",
  placeholder = "dd/mm/yyyy",
  min,
  max,
  ariaLabel
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  className?: string;
  placeholder?: string;
  min?: string;
  max?: string;
  ariaLabel?: string;
}) {
  const { t } = useTranslation();
  const monthsShort = React.useMemo(() => t("datePicker.monthsShort", { returnObjects: true }) as string[], [t]);
  const weekdaysShort = React.useMemo(() => t("datePicker.weekdaysShort", { returnObjects: true }) as string[], [t]);
  const [draft, setDraft] = React.useState(() => isoToDateVN(value));
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number; openUp: boolean } | null>(null);
  const [showYearMonthPicker, setShowYearMonthPicker] = React.useState(false);

  const containerRef = React.useRef<HTMLDivElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const yearListRef = React.useRef<HTMLDivElement>(null);

  // Track the month and year currently viewed in the calendar popover
  const [viewDate, setViewDate] = React.useState(() => {
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  React.useEffect(() => {
    setDraft(isoToDateVN(value));
    if (value) {
      const d = new Date(value);
      if (!isNaN(d.getTime())) {
        setViewDate(d);
      }
    }
  }, [value]);

  const commit = (text: string) => {
    const next = dateVNToIso(text);
    if (!text.trim()) {
      onChange("");
      return;
    }
    if (!next) return;
    if (min && next < min) {
      onChange(min);
      return;
    }
    if (max && next > max) {
      onChange(max);
      return;
    }
    onChange(next);
  };

  const computePosition = React.useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const popoverWidth = 260;
    const popoverHeight = 340;
    // Use visualViewport height when available (accounts for iOS virtual keyboard)
    const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;
    
    let left = r.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - popoverWidth;
    }
    if (left < margin) left = margin;

    const spaceBelow = (vvOffsetTop + vvHeight) - r.bottom;
    const openUp = spaceBelow < popoverHeight && r.top > spaceBelow;
    
    setPos({
      left,
      top: openUp ? r.top - popoverHeight - 6 : r.bottom + 6,
      openUp
    });
  }, []);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
      setShowYearMonthPicker(false);
    } else {
      computePosition();
      setOpen(true);
      setShowYearMonthPicker(false);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (popoverRef.current && (popoverRef.current === t || popoverRef.current.contains(t))) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    // Recompute position when iOS virtual keyboard resizes the visual viewport
    const onVVResize = () => computePosition();

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onVVResize);
    window.visualViewport?.addEventListener("scroll", onVVResize);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onVVResize);
      window.visualViewport?.removeEventListener("scroll", onVVResize);
    };
  }, [open, computePosition]);

  const viewYear = viewDate.getFullYear();
  const viewMonth = viewDate.getMonth();

  const grid = React.useMemo(() => getCalendarGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const today = React.useMemo(() => new Date(), []);

  const handleSelectDay = (y: number, m: number, d: number) => {
    const formatted = `${y}-${pad(m + 1)}-${pad(d)}`;
    onChange(formatted);
    setOpen(false);
  };

  const prevMonth = () => {
    setViewDate(new Date(viewYear, viewMonth - 1, 1));
  };

  const nextMonth = () => {
    setViewDate(new Date(viewYear, viewMonth + 1, 1));
  };

  // Scroll selected year into center when year/month picker opens
  React.useEffect(() => {
    if (showYearMonthPicker) {
      const timer = setTimeout(() => {
        const sel = yearListRef.current?.querySelector('[data-selected-year="true"]');
        sel?.scrollIntoView({ block: "center", behavior: "instant" });
      }, 30);
      return () => clearTimeout(timer);
    }
  }, [showYearMonthPicker]);

  return (
    <div ref={containerRef} className="relative w-full">
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        required={required}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => {
          const next = maskDateVN(e.target.value);
          setDraft(next);
          if (next.length === 10) commit(next);
          if (!next) onChange("");
        }}
        onBlur={() => commit(draft)}
        className={`${className} pr-10`}
      />
      <button
        type="button"
        aria-label={t("datePicker.calendarAriaLabel")}
        title={t("datePicker.calendarAriaLabel")}
        onMouseDown={(e) => e.preventDefault()}
        onClick={toggleOpen}
        className="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded-md text-slate-500 hover:text-sky-400 hover:bg-slate-800 grid place-items-center cursor-pointer transition-colors"
      >
        <Calendar className="size-4" />
      </button>

      {open && pos && createPortal(
        <AnimatePresence>
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: 260,
            }}
            className="z-[70] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl shadow-sky-950/20 p-3 flex flex-col origin-top select-none font-sans"
          >
            {/* Calendar Header */}
            <div className="flex items-center justify-between mb-2 shrink-0">
              <button
                type="button"
                onClick={prevMonth}
                disabled={showYearMonthPicker}
                className="size-9 rounded-lg bg-slate-900 neu-btn hover:border-slate-700 text-slate-400 hover:text-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer transition-colors"
                title={t("datePicker.prevMonth")}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setShowYearMonthPicker(v => !v)}
                title={t("datePicker.pickMonthYear")}
                className="flex items-center gap-1 px-2 py-2 rounded-lg hover:bg-slate-800 text-xs font-bold text-slate-200 hover:text-sky-400 transition-colors cursor-pointer min-h-[44px]"
              >
                {monthsShort[viewMonth]} {viewYear}
                <ChevronDown className={`w-3 h-3 transition-transform duration-200 ${showYearMonthPicker ? "rotate-180" : ""}`} />
              </button>
              <button
                type="button"
                onClick={nextMonth}
                disabled={showYearMonthPicker}
                className="size-9 rounded-lg bg-slate-900 neu-btn hover:border-slate-700 text-slate-400 hover:text-slate-100 disabled:opacity-30 flex items-center justify-center cursor-pointer transition-colors"
                title={t("datePicker.nextMonth")}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* Year & Month Quick Picker Overlay */}
            <AnimatePresence>
              {showYearMonthPicker && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.15 }}
                  className="overflow-hidden mb-2"
                >
                  <div className="flex gap-2 h-[200px]">
                    {/* Year list */}
                    <div
                      ref={yearListRef}
                      className="flex-1 overflow-y-scroll overscroll-contain scrollbar-none flex flex-col gap-0.5 pr-1"
                      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
                    >
                      <div className="text-[9px] text-sky-400 font-extrabold uppercase tracking-wider text-center sticky top-0 bg-slate-950 py-1 border-b border-slate-800/60 z-10 mb-0.5">{t("datePicker.yearHeader")}</div>
                      {Array.from({ length: 201 }, (_, i) => 1950 + i).map(yr => {
                        const isSelYr = yr === viewYear;
                        return (
                          <button
                            key={yr}
                            type="button"
                            data-selected-year={isSelYr}
                            onClick={() => { setViewDate(new Date(yr, viewMonth, 1)); }}
                            className={`py-2 text-center rounded font-mono text-xs cursor-pointer transition-colors shrink-0 ${
                              isSelYr ? "bg-sky-500 text-slate-950 font-extrabold" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                            }`}
                          >
                            {yr}
                          </button>
                        );
                      })}
                    </div>

                    <div className="w-px bg-slate-800 self-stretch" />

                    {/* Month grid 3×4 */}
                    <div className="flex-1 flex flex-col gap-1 pt-1">
                      <div className="text-[9px] text-sky-400 font-extrabold uppercase tracking-wider text-center border-b border-slate-800/60 pb-1 mb-0.5">{t("datePicker.monthHeader")}</div>
                      <div className="grid grid-cols-3 gap-1">
                        {monthsShort.map((mn, mi) => {
                          const isSelMo = mi === viewMonth;
                          return (
                            <button
                              key={mi}
                              type="button"
                              onClick={() => { setViewDate(new Date(viewYear, mi, 1)); setShowYearMonthPicker(false); }}
                              className={`py-2.5 rounded text-[10px] font-bold cursor-pointer transition-colors min-h-[44px] flex items-center justify-center ${
                                isSelMo ? "bg-sky-500 text-slate-950" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"
                              }`}
                            >
                              {mn}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Weekdays — Monday first */}
            <div className="grid grid-cols-7 text-center text-[10px] text-slate-500 font-extrabold mb-1.5 uppercase">
              {weekdaysShort.map((d, i) => (
                <div key={d} className={i === 6 ? "text-rose-500/70" : ""}>{d}</div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-0.5">
              {grid.map((cell, idx) => {
                const cellDateStr = `${cell.year}-${pad(cell.month + 1)}-${pad(cell.day)}`;
                const isSelected = value === cellDateStr;
                const isToday = today.getDate() === cell.day && 
                  today.getMonth() === cell.month && 
                  today.getFullYear() === cell.year;

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectDay(cell.year, cell.month, cell.day)}
                    className={`h-9 w-full rounded-md text-xs font-mono font-bold flex items-center justify-center transition-colors cursor-pointer ${
                      isSelected 
                        ? "bg-sky-500 text-slate-950 font-extrabold" 
                        : cell.isCurrentMonth
                          ? isToday
                            ? "border border-sky-500 text-sky-400 bg-sky-500/10"
                            : "text-slate-200 hover:bg-slate-800"
                          : "text-slate-600 hover:bg-slate-800/40"
                    }`}
                  >
                    {cell.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-2 pt-2 border-t border-slate-800 flex justify-between gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  const todayStr = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
                  onChange(todayStr);
                  setOpen(false);
                }}
                className="flex-1 min-h-[44px] py-2 bg-sky-500 hover:bg-sky-400 text-[11px] font-bold text-slate-950 rounded-lg transition-colors cursor-pointer"
              >
                {t("datePicker.todayBtn")}
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex-1 min-h-[44px] py-2 bg-slate-900 hover:bg-slate-800 text-[11px] font-bold text-slate-300 neu-btn hover:border-slate-700 rounded-lg transition-colors cursor-pointer"
              >
                {t("datePicker.closeBtn")}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export function TimeSelect24({
  value,
  onChange,
  className = ""
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const [hh = "", mm = ""] = (value || "").split(":");
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ left: number; top: number; openUp: boolean } | null>(null);

  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const popoverRef = React.useRef<HTMLDivElement>(null);
  const hrContainerRef = React.useRef<HTMLDivElement>(null);
  const minContainerRef = React.useRef<HTMLDivElement>(null);

  const emit = (h: string, m: string) => onChange(`${h || "00"}:${m || "00"}`);

  const computePosition = React.useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    const popoverWidth = 148;
    const popoverHeight = 250;
    // Use visualViewport for iOS virtual keyboard awareness
    const vvHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const vvOffsetTop = window.visualViewport ? window.visualViewport.offsetTop : 0;

    let left = r.left;
    if (left + popoverWidth > window.innerWidth - margin) {
      left = window.innerWidth - margin - popoverWidth;
    }
    if (left < margin) left = margin;

    const spaceBelow = (vvOffsetTop + vvHeight) - r.bottom;
    const openUp = spaceBelow < popoverHeight && r.top > spaceBelow;

    setPos({
      left,
      top: openUp ? r.top - popoverHeight - 6 : r.bottom + 6,
      openUp
    });
  }, []);

  const toggleOpen = () => {
    if (open) {
      setOpen(false);
    } else {
      computePosition();
      setOpen(true);
    }
  };

  React.useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || popoverRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = (e: Event) => {
      const t = e.target as Node;
      if (popoverRef.current && (popoverRef.current === t || popoverRef.current.contains(t))) return;
      setOpen(false);
    };
    const onResize = () => setOpen(false);
    const onVVResize = () => computePosition();

    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onVVResize);
    window.visualViewport?.addEventListener("scroll", onVVResize);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onVVResize);
      window.visualViewport?.removeEventListener("scroll", onVVResize);
    };
  }, [open, computePosition]);

  // Scroll active elements into view when opening
  React.useEffect(() => {
    if (open) {
      const timer = setTimeout(() => {
        const hrEl = hrContainerRef.current?.querySelector('[data-selected="true"]');
        hrEl?.scrollIntoView({ block: "center" });

        const minEl = minContainerRef.current?.querySelector('[data-selected="true"]');
        minEl?.scrollIntoView({ block: "center" });
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [open]);

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        className="w-full flex items-center justify-between gap-1.5 bg-slate-950 neu-pressed-sm hover:border-slate-700 rounded-lg px-3 py-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs cursor-pointer select-none"
      >
        <span className={value ? "text-slate-200 font-bold" : "text-slate-500"}>
          {value || t("datePicker.timePlaceholder")}
        </span>
        <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
      </button>

      {open && pos && createPortal(
        <AnimatePresence>
          <motion.div
            ref={popoverRef}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.12 }}
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              width: 148,
              height: 250,
            }}
            className="z-[70] bg-slate-950 border border-slate-800 rounded-xl shadow-2xl shadow-sky-950/20 p-2 flex flex-col origin-top select-none font-sans"
          >
            <div className="flex-1 min-h-0 flex gap-2">
              {/* Hours Column */}
              <div 
                ref={hrContainerRef}
                className="flex-1 overflow-y-scroll overscroll-contain scrollbar-none flex flex-col gap-0.5"
                style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
              >
                <div className="text-[9px] text-sky-400 font-extrabold uppercase tracking-wider text-center sticky top-0 bg-slate-950 py-1 border-b border-slate-800/60 z-10">{t("datePicker.hourHeader")}</div>
                {HOURS.map(h => {
                  const isSel = h === hh;
                  return (
                    <button
                      key={h}
                      type="button"
                      data-selected={isSel}
                      onClick={() => emit(h, mm)}
                      className={`py-2 text-center rounded font-mono text-xs cursor-pointer transition-colors ${isSel ? "bg-sky-500 text-slate-950 font-extrabold" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"}`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>

              <div className="w-px bg-slate-800 self-stretch" />

              {/* Minutes Column */}
              <div 
                ref={minContainerRef}
                className="flex-1 overflow-y-scroll overscroll-contain scrollbar-none flex flex-col gap-0.5"
                style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
              >
                <div className="text-[9px] text-sky-400 font-extrabold uppercase tracking-wider text-center sticky top-0 bg-slate-950 py-1 border-b border-slate-800/60 z-10">{t("datePicker.minuteHeader")}</div>
                {MINUTES.map(m => {
                  const isSel = m === mm;
                  return (
                    <button
                      key={m}
                      type="button"
                      data-selected={isSel}
                      onClick={() => emit(hh, m)}
                      className={`py-2 text-center rounded font-mono text-xs cursor-pointer transition-colors ${isSel ? "bg-sky-500 text-slate-950 font-extrabold" : "text-slate-300 hover:bg-slate-800 hover:text-slate-100"}`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="mt-2 pt-2 border-t border-slate-800 shrink-0">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-full min-h-[44px] py-2 bg-sky-500 hover:bg-sky-400 text-xs font-bold text-slate-950 rounded-lg transition-colors cursor-pointer"
              >
                {t("datePicker.confirmBtn")}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

export function DateTimePicker24({
  value,
  onChange,
  required = false
}: {
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const [datePart = "", timePart = ""] = (value || "").trim().split(" ");
  const [hh = "", mm = ""] = timePart.split(":");

  const emit = (d: string, h: string, m: string) => {
    if (!d) { onChange(""); return; } // no date → treat as empty
    onChange(`${d} ${h || "00"}:${m || "00"}`);
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2 w-full">
      <div className="flex-1 min-w-0">
        <DateInputDMY
          required={required}
          value={datePart}
          onChange={(next) => emit(next, hh, mm)}
          className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono text-xs"
        />
      </div>
      <TimeSelect24
        value={hh || mm ? `${hh}:${mm}` : ""}
        onChange={(t) => { const [h, m] = t.split(":"); emit(datePart, h, m); }}
        className="w-full sm:w-[110px] shrink-0"
      />
    </div>
  );
}
