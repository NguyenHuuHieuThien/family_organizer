/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";

export interface SelectOption {
  value: string;
  label: string;
}

interface FancySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: readonly SelectOption[];
  /** Lớp thêm cho nút trigger (vd width/màu chữ). */
  className?: string;
  placeholder?: string;
  id?: string;
  ariaLabel?: string;
  /** Node đặt trước nhãn trong nút trigger (vd avatar tài khoản). */
  leading?: ReactNode;
}

/**
 * Dropdown tùy biến, đẹp & theme-aware — thay cho <select> gốc (list bung ra của
 * <select> không thể tạo kiểu trên web, nhìn thô). Popup render qua portal +
 * position fixed nên không bị cắt bởi thẻ cha overflow-hidden. Có bàn phím
 * (mũi tên/Enter/Esc/Home/End), đóng khi bấm ngoài / cuộn / đổi cỡ, và tôn trọng
 * reduced-motion.
 */
export function FancySelect({
  value,
  onChange,
  options,
  className = "",
  placeholder = "Chọn...",
  id,
  ariaLabel,
  leading
}: FancySelectProps) {
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number; width: number; openUp: boolean } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const selected = options.find(o => o.value === value);

  const computePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8;
    // Đủ rộng để đọc (tối thiểu 200px) nhưng không vượt bề ngang màn hình
    const width = Math.min(Math.max(r.width, 200), window.innerWidth - margin * 2);
    let left = r.left;
    if (left + width > window.innerWidth - margin) left = window.innerWidth - margin - width;
    if (left < margin) left = margin;
    const spaceBelow = window.innerHeight - r.bottom;
    const estHeight = Math.min(options.length * 37 + 8, 288);
    const openUp = spaceBelow < estHeight && r.top > spaceBelow;
    setPos({ left, top: openUp ? r.top : r.bottom, width, openUp });
  }, [options.length]);

  const openMenu = useCallback(() => {
    computePosition();
    setActiveIdx(Math.max(0, options.findIndex(o => o.value === value)));
    setOpen(true);
  }, [computePosition, options, value]);

  const close = useCallback(() => setOpen(false), []);

  // Đóng khi bấm ngoài / cuộn nền / đổi cỡ màn
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || listRef.current?.contains(t)) return;
      close();
    };
    const onScroll = (e: Event) => {
      // Cuộn BÊN TRONG dropdown (con lăn/kéo thanh cuộn) → giữ nguyên;
      // chỉ đóng khi nền/trang phía sau cuộn khiến nút trigger trôi đi.
      const t = e.target as Node;
      if (listRef.current && (listRef.current === t || listRef.current.contains(t))) return;
      close();
    };
    const onResize = () => close();
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
    };
  }, [open, close]);

  // Cuộn mục đang chọn/di chuyển vào tầm nhìn
  useEffect(() => {
    if (open && listRef.current && activeIdx >= 0) {
      (listRef.current.children[activeIdx] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx, open]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (opt) onChange(opt.value);
    close();
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") { e.preventDefault(); openMenu(); }
      return;
    }
    switch (e.key) {
      case "Escape": e.preventDefault(); close(); triggerRef.current?.focus(); break;
      case "ArrowDown": e.preventDefault(); setActiveIdx(i => Math.min(options.length - 1, i + 1)); break;
      case "ArrowUp": e.preventDefault(); setActiveIdx(i => Math.max(0, i - 1)); break;
      case "Home": e.preventDefault(); setActiveIdx(0); break;
      case "End": e.preventDefault(); setActiveIdx(options.length - 1); break;
      case "Enter":
      case " ": e.preventDefault(); if (activeIdx >= 0) commit(activeIdx); break;
    }
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => (open ? close() : openMenu())}
        onKeyDown={onKeyDown}
        className={`w-full flex items-center justify-between gap-2 bg-slate-950 neu-pressed-sm ${open ? "border border-emerald-500" : ""} rounded-lg p-2 text-left outline-none cursor-pointer transition-colors ${className}`}
      >
        <span className="flex items-center gap-2 min-w-0">
          {leading}
          <span className={`truncate ${selected ? "text-slate-200" : "text-slate-500"}`}>
            {selected ? selected.label : placeholder}
          </span>
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-slate-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>

      {createPortal(
        <AnimatePresence>
          {open && pos && (
            <motion.div
              ref={listRef}
              role="listbox"
              onKeyDown={onKeyDown}
              initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: pos.openUp ? 6 : -6 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: pos.openUp ? 6 : -6 }}
              transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
              style={{
                position: "fixed",
                left: pos.left,
                width: pos.width,
                maxHeight: 288,
                ...(pos.openUp
                  ? { bottom: window.innerHeight - pos.top + 6 }
                  : { top: pos.top + 6 })
              }}
              className="z-[70] overflow-y-auto overscroll-contain scrollbar-thin bg-slate-900 border border-slate-800 rounded-xl shadow-2xl p-1 origin-top"
            >
              {options.map((o, i) => {
                const isSel = o.value === value;
                const isActive = i === activeIdx;
                return (
                  <button
                    key={o.value}
                    type="button"
                    role="option"
                    aria-selected={isSel}
                    onMouseEnter={() => setActiveIdx(i)}
                    onClick={() => commit(i)}
                    className={`w-full flex items-center justify-between gap-2 text-left px-3 py-2 rounded-lg text-xs transition-colors cursor-pointer ${
                      isSel
                        ? "bg-sky-500/10 text-sky-400 font-semibold"
                        : isActive
                          ? "bg-slate-800/70 text-slate-100"
                          : "text-slate-300"
                    }`}
                  >
                    <span className="truncate">{o.label}</span>
                    {isSel && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}
