/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Tìm kiếm toàn cục (⌘K / Ctrl+K hoặc nút kính lúp trên header):
// một ô nhập gõ-tới-đâu-tìm-tới-đó, gọi /api/search gộp Công việc + Lịch +
// Ghi chú + Thu chi + Giấy tờ. Bấm kết quả → nhảy sang tab tương ứng.
// So khớp phía server đã bỏ dấu tiếng Việt ("giay to" khớp "Giấy tờ").

import { Button, Input } from "./ui";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Search, X, CheckSquare, Calendar, FileText, Wallet, FolderLock, CornerDownLeft } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { useTranslation } from "react-i18next";
import type { Task, FamilyPlan, Note, FinancialTransaction, FamilyDocument } from "../types.js";
import { DOCUMENT_TYPE_LABELS } from "../types.js";
import { normalizeSearchText, matchesQuery, excerptAround } from "../utils/searchText.js";

interface SearchResultItem {
  kind: "task" | "plan" | "note" | "transaction" | "document";
  id: string;
  title: string;
  snippet: string;
  date: string;
  tab: string;
}

type SearchResultWithScore = SearchResultItem & { score: number };

const KIND_ORDER: SearchResultItem["kind"][] = ["task", "plan", "note", "transaction", "document"];

// "2026-07-18 09:30" / "2026-07-18T..." → "18/07/2026"
function fmtDate(raw: string): string {
  const m = String(raw || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

interface GlobalSearchProps {
  getAuthHeader: () => Record<string, string>;
  onNavigate: (tab: string) => void;
  tasks: Task[];
  plans: FamilyPlan[];
  notes: Note[];
  transactions: FinancialTransaction[];
  documents: FamilyDocument[];
  canViewDocument: (doc: FamilyDocument) => boolean;
}

export const GlobalSearch: React.FC<GlobalSearchProps> = ({ getAuthHeader, onNavigate, tasks, plans, notes, transactions, documents, canViewDocument }) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchedFor, setSearchedFor] = useState(""); // query đã trả kết quả (phân biệt "chưa tìm" vs "không thấy")
  const [activeIndex, setActiveIndex] = useState(0);
  const dialogRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<number | null>(null);
  const reducedMotion = useReducedMotion();

  const rankText = (text: string, needle: string) => {
    const norm = normalizeSearchText(text);
    if (!needle || !norm.includes(needle)) return 0;
    if (norm === needle) return 100;
    if (norm.startsWith(needle)) return 90;
    const idx = norm.indexOf(needle);
    return Math.max(10, 80 - Math.min(idx, 60));
  };

  const dedupeAndSort = (items: SearchResultWithScore[]) => {
    const byKey = new Map<string, SearchResultWithScore>();
    for (const item of items) {
      const key = `${item.kind}:${item.id}`;
      const prev = byKey.get(key);
      if (!prev || item.score > prev.score) byKey.set(key, item);
    }
    return [...byKey.values()].sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
  };

  const localResultsFor = useCallback((q: string): SearchResultItem[] => {
    const nq = normalizeSearchText(q);
    const results: SearchResultWithScore[] = [];
    const push = (item: SearchResultItem, score: number) => {
      if (score > 0) results.push({ ...item, score });
    };
    tasks.forEach(task => {
      const score = Math.max(
        rankText(task.title, nq) + 50,
        rankText(`${task.title} ${task.description} ${(task.tags || []).join(" ")}`, nq)
      );
      if (score > 0) push({
        kind: "task", id: task.id, title: task.title,
        snippet: excerptAround(task.description, nq) || "Công việc",
        date: task.dueDate || task.createdAt, tab: "tasks"
      }, score);
    });
    plans.forEach(plan => {
      const score = rankText(`${plan.title} ${plan.description}`, nq);
      if (score > 0) push({
        kind: "plan", id: plan.id, title: plan.title,
        snippet: excerptAround(plan.description, nq) || "Sự kiện",
        date: plan.startDate, tab: "plans"
      }, score);
    });
    notes.forEach(note => {
      const score = rankText(`${note.title} ${note.content} ${(note.tags || []).join(" ")}`, nq);
      if (score > 0) push({
        kind: "note", id: note.id, title: note.title,
        snippet: excerptAround(note.content, nq) || "Ghi chú",
        date: note.updatedAt || note.createdAt, tab: "notes"
      }, score);
    });
    transactions.forEach(tx => {
      const score = rankText(`${tx.description} ${tx.category} ${tx.amount} ${tx.type === "income" ? "thu" : "chi"}`, nq);
      if (score > 0) push({
        kind: "transaction", id: tx.id, title: tx.description || "(không có mô tả)",
        snippet: `${tx.type === "income" ? "Thu" : "Chi"} ${Number(tx.amount).toLocaleString("vi-VN")} đ`,
        date: tx.date, tab: "finance"
      }, score);
    });
    documents.forEach(doc => {
      if (!canViewDocument(doc)) return;
      const score = rankText(`${DOCUMENT_TYPE_LABELS[doc.type] || doc.type} ${doc.title} ${doc.documentNumber} ${doc.issuer} ${doc.notes}`, nq);
      if (score > 0) push({
        kind: "document", id: doc.id, title: doc.title,
        snippet: [DOCUMENT_TYPE_LABELS[doc.type] || "Giấy tờ", doc.documentNumber].filter(Boolean).join(" • "),
        date: doc.expiryDate || doc.updatedAt || doc.createdAt, tab: "documents"
      }, score);
    });
    return dedupeAndSort(results).slice(0, 24);
  }, [tasks, plans, notes, transactions, documents, canViewDocument]);

  // Nhóm hiển thị: icon + nhãn + accent theo ngữ nghĩa màu của DESIGN.md
  const KIND_META = useMemo(() => ({
    task:        { label: t("globalSearch.kindTask"),        icon: CheckSquare, accent: "text-sky-400" },
    plan:        { label: t("globalSearch.kindPlan"),        icon: Calendar,    accent: "text-amber-400" },
    note:        { label: t("globalSearch.kindNote"),        icon: FileText,    accent: "text-indigo-400" },
    transaction: { label: t("globalSearch.kindTransaction"), icon: Wallet,      accent: "text-emerald-400" },
    document:    { label: t("globalSearch.kindDocument"),    icon: FolderLock,  accent: "text-rose-400" }
  } as Record<SearchResultItem["kind"], { label: string; icon: React.ElementType; accent: string }>), [t]);

  // App tạo lại getAuthHeader mỗi render — giữ qua ref để effect debounce
  // không re-run (tự tìm lại) mỗi khi App re-render vì SSE/polling.
  const getAuthHeaderRef = useRef(getAuthHeader);
  getAuthHeaderRef.current = getAuthHeader;

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setSearchedFor("");
    setActiveIndex(0);
    abortRef.current?.abort();
  }, []);

  useModalA11y(open, close, dialogRef);

  // Phím tắt toàn cục: ⌘K (macOS/iPadOS bàn phím rời) / Ctrl+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(prev => !prev);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Gõ tới đâu tìm tới đó (debounce 250ms, hủy request cũ khi gõ tiếp)
  useEffect(() => {
    if (!open) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearchedFor("");
      setLoading(false);
      setActiveIndex(0);
      return;
    }
    setResults(localResultsFor(q));
    setActiveIndex(0);
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
          headers: getAuthHeaderRef.current(),
          signal: controller.signal
        });
        let data: any = null;
        try {
          data = await res.json();
        } catch {
          data = null;
        }
        const apiResults: SearchResultItem[] = Array.isArray(data?.results) ? data.results : [];
        const merged = dedupeAndSort([
          ...localResultsFor(q).map((item, idx) => ({ ...item, score: 80 - idx })),
          ...apiResults.map((item, idx) => ({ ...item, score: 70 - idx }))
        ]).slice(0, 24);
        setResults(merged);
        setSearchedFor(q);
      } catch (err: any) {
        if (err?.name !== "AbortError") {
          setResults(localResultsFor(q));
          setSearchedFor(q);
        }
      } finally {
        if (abortRef.current === controller) setLoading(false);
      }
    }, 250);
    return () => { if (debounceRef.current) window.clearTimeout(debounceRef.current); };
  }, [query, open, localResultsFor]);

  const pick = (item: SearchResultItem) => {
    onNavigate(item.tab);
    close();
  };

  useEffect(() => {
    if (!open) return;
    setActiveIndex(prev => results.length === 0 ? 0 : Math.min(prev, results.length - 1));
  }, [open, results.length]);

  const activeItem = results[activeIndex] || null;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex(prev => results.length === 0 ? 0 : (prev + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex(prev => results.length === 0 ? 0 : (prev - 1 + results.length) % results.length);
    } else if (e.key === "Enter" && activeItem) {
      e.preventDefault();
      pick(activeItem);
    } else if (e.key === "Escape") {
      e.preventDefault();
      close();
    }
  };

  const grouped = KIND_ORDER
    .map(kind => ({ kind, items: results.filter(r => r.kind === kind) }))
    .filter(g => g.items.length > 0);

  return (
    <>
      {/* Nút kính lúp trên header — style đồng bộ nút đổi theme */}
      <Button
        onClick={() => setOpen(true)}
        className="p-2.5 text-slate-400 hover:text-slate-100 bg-slate-950 neu-btn rounded-xl outline-none leading-none cursor-pointer flex items-center justify-center"
        title={t("globalSearch.btnTitle")}
        aria-label={t("globalSearch.btnAria")}
      >
        <Search className="w-4.5 h-4.5" />
      </Button>

      <AnimatePresence>
        {open && (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs z-50 p-4 flex items-start justify-center pt-[calc(env(safe-area-inset-top)_+_3.5rem)]"
            onClick={close}
          >
            <motion.div
              ref={dialogRef}
              role="dialog"
              aria-modal="true"
              aria-label={t("globalSearch.dialogAria")}
              initial={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.95, y: -8 }}
              animate={reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
              exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 380, damping: 30 }}
              className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden"
              onClick={e => e.stopPropagation()}
              onKeyDown={handleKeyDown}
            >
              {/* Ô nhập */}
              <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-800">
                <Search className="w-4.5 h-4.5 text-sky-400 shrink-0" />
                <Input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder={t("globalSearch.placeholder")}
                  className="flex-1 bg-transparent text-slate-200 placeholder:text-slate-500 outline-none min-w-0"
                />
                {loading && (
                  <span className="w-4 h-4 border-2 border-slate-800 border-t-sky-500 rounded-full animate-spin shrink-0" aria-label={t("globalSearch.searching")} />
                )}
                <Button
                  onClick={close}
                  className="p-1.5 bg-slate-950 neu-btn rounded-lg text-slate-500 hover:text-slate-200 cursor-pointer shrink-0"
                  aria-label={t("globalSearch.closeAria")}
                >
                  <X className="w-3.5 h-3.5" />
                </Button>
              </div>

              {/* Kết quả */}
              <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain">
                {query.trim().length < 2 ? (
                  <p className="text-center text-xs text-slate-500 py-10 px-4">
                    {t("globalSearch.hintText")}
                  </p>
                ) : grouped.length === 0 && !loading && searchedFor ? (
                  <p className="text-center text-xs text-slate-500 py-10 px-4">
                    {t("globalSearch.noResults", { q: searchedFor })}
                  </p>
                ) : (
                  <div className="py-2">
                    {grouped.map(group => {
                      const meta = KIND_META[group.kind];
                      const Icon = meta.icon;
                      return (
                        <div key={group.kind} className="px-2 pb-1.5">
                          <div className={`flex items-center gap-1.5 px-2 pt-2 pb-1 text-[10px] font-mono font-bold uppercase tracking-widest ${meta.accent}`}>
                            <Icon className="w-3 h-3" /> {meta.label}
                            <span className="text-slate-500">({group.items.length})</span>
                          </div>
                          {group.items.map(item => {
                            const itemIndex = results.findIndex(r => r.kind === item.kind && r.id === item.id);
                            const isActive = itemIndex === activeIndex;
                            return (
                              <Button
                                key={`${item.kind}_${item.id}`}
                                onClick={() => pick(item)}
                                onMouseEnter={() => setActiveIndex(itemIndex)}
                                className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-left hover:bg-slate-800/40 focus:outline-none focus:ring-2 focus:ring-sky-500/40 cursor-pointer group ${isActive ? "bg-slate-800/60 ring-1 ring-sky-500/40" : ""}`}
                              >
                                <div className="flex-1 min-w-0">
                                  <span className="text-xs font-bold text-slate-200 block truncate">{item.title}</span>
                                  {item.snippet && (
                                    <span className="text-[11px] text-slate-500 block truncate">{item.snippet}</span>
                                  )}
                                </div>
                                {item.date && (
                                  <span className="text-[10px] font-mono text-slate-500 shrink-0">{fmtDate(item.date)}</span>
                                )}
                                <CornerDownLeft className={`w-3 h-3 text-slate-500 shrink-0 ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`} />
                              </Button>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Chân modal: gợi ý phím tắt (ẩn trên mobile) */}
              <div className="hidden sm:flex items-center justify-end gap-3 px-4 py-2 border-t border-slate-800 text-[10px] text-slate-500 font-mono">
                <span><kbd className="px-1 py-0.5 bg-slate-950 neu-pressed-sm rounded">Esc</kbd> {t("globalSearch.kbdClose")}</span>
                <span><kbd className="px-1 py-0.5 bg-slate-950 neu-pressed-sm rounded">Ctrl K</kbd> {t("globalSearch.kbdToggle")}</span>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
