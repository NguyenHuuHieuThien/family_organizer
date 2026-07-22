/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { 
  Calendar as CalendarIcon, 
  Plus, 
  Trash2, 
  Clock, 
  Pencil,
  Repeat, 
  Lock, 
  Eye, 
  Tag, 
  LayoutList,
  LayoutGrid,
  CalendarPlus,
  Cake,
  ChevronLeft,
  ChevronRight,
  Download,
  Users,
  Trees,
  Star,
  BookOpen,
  X
} from "lucide-react";
import { FamilyPlan, User, UserRole, isLimitedViewer, FAMILY_RELATION_LABELS } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { useConfirm } from "./ConfirmDialog.js";
import { DateTimePicker24, formatDateTimeVN } from "./DateTimePicker24.js";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { useTabFab } from "./FabHost.js";
import { Avatar } from "./Avatar.js";
import { ShimmerLine, Reveal, staggerDelay } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";
import { getVietnamHolidaysForMonth, getVietnamLunarDateForSolarDate, type VietnamHoliday, type VietnamLunarDate } from "../utils/vietnamHolidays.js";
import { expandRecurringOccurrences } from "../utils/recurrence.js";

interface SchedulesProps {
  currentUser: User;
  users: User[];
  plans: FamilyPlan[];
  onSavePlan: (plan: Partial<FamilyPlan>) => Promise<any>;
  onDeletePlan: (id: string) => Promise<any>;
  requestedViewPlanId?: string;
  requestedViewPlanSeq?: number;
  onConsumeViewPlan?: () => void;
}

// Loại sự kiện — nguồn chân lý chung cho form chọn loại, nhãn thẻ và chú thích lịch.
// `value` giữ trùng tên màu cũ để không phá dữ liệu plan.color đã lưu.
const PLAN_TYPES: { value: string; label: string; icon: React.ComponentType<{ className?: string }>; dotHex: string }[] = [
  { value: "sky", label: "Họp hành / Gặp mặt", icon: Users, dotHex: "#38bdf8" },
  { value: "emerald", label: "Dã ngoại / Ăn chơi", icon: Trees, dotHex: "#10b981" },
  { value: "rose", label: "Quan trọng", icon: Star, dotHex: "#f43f5e" },
  { value: "amber", label: "Bài học / Công việc", icon: BookOpen, dotHex: "#f59e0b" },
];
const planTypeMeta = (color: string) => PLAN_TYPES.find(t => t.value === color) || PLAN_TYPES[0];

export function Schedules({
  currentUser,
  users,
  plans,
  onSavePlan,
  onDeletePlan,
  requestedViewPlanId,
  requestedViewPlanSeq,
  onConsumeViewPlan
}: SchedulesProps) {
  const [viewMode, setViewMode] = useState<"list" | "board">("board"); // 'list' = agenda, 'board' = monthly style grid
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [viewingPlan, setViewingPlan] = useState<FamilyPlan | null>(null);
  const [viewingBirthday, setViewingBirthday] = useState<{ user: User; day: number } | null>(null);
  const [viewingHoliday, setViewingHoliday] = useState<{ holiday: VietnamHoliday; day: number } | null>(null);
  const [editingPlan, setEditingPlan] = useState<FamilyPlan | null>(null);
  const [formError, setFormError] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  // Filters
  const [filterSharedOnly, setFilterSharedOnly] = useState<"all" | "shared" | "personal">("all");

  // Form Fields
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newStartDate, setNewStartDate] = useState("");
  const [newEndDate, setNewEndDate] = useState("");
  const [newIsRecurring, setNewIsRecurring] = useState(false);
  const [newRecurrenceType, setNewRecurrenceType] = useState<"none" | "daily" | "weekly" | "monthly">("none");
  const [newRecurrenceWeekdays, setNewRecurrenceWeekdays] = useState<number[]>([]);
  const [newIsShared, setNewIsShared] = useState(true);
  const [newColor, setNewColor] = useState("sky");

  const canManagePlan = (plan: FamilyPlan) => {
    return currentUser.role === UserRole.ADMIN ||
      (currentUser.role === UserRole.MEMBER && plan.creatorId === currentUser.id);
  };

  const resetPlanForm = () => {
    setNewTitle("");
    setNewDesc("");
    setNewStartDate("");
    setNewEndDate("");
    setNewIsRecurring(false);
    setNewRecurrenceType("none");
    setNewRecurrenceWeekdays([]);
    setNewIsShared(true);
    setNewColor("sky");
  };

  const handleOpenCreatePlan = () => {
    resetPlanForm();
    setEditingPlan(null);
    setFormError("");
    setIsFormOpen(true);
  };

  // Xuất các sự kiện ra file .ics để nhập vào Google/Apple Calendar (giờ địa phương, floating time).
  const exportPlansIcs = () => {
    const dt = (s: string) => {
      const [d, t] = String(s).split(" ");
      const [y, mo, da] = (d || "").split("-");
      const [hh, mm] = (t || "00:00").split(":");
      if (!y || !mo || !da) return "";
      return `${y}${mo.padStart(2, "0")}${da.padStart(2, "0")}T${(hh || "00").padStart(2, "0")}${(mm || "00").padStart(2, "0")}00`;
    };
    const esc = (v = "") => String(v).replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Family Organizer//VI//", "CALSCALE:GREGORIAN"];
    filteredPlans.forEach(p => {
      const start = dt(p.startDate);
      if (!start) return;
      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${p.id}@family-organizer`);
      lines.push(`DTSTART:${start}`);
      lines.push(`DTEND:${dt(p.endDate || p.startDate) || start}`);
      lines.push(`SUMMARY:${esc(p.title)}`);
      if (p.description) lines.push(`DESCRIPTION:${esc(p.description)}`);
      lines.push("END:VEVENT");
    });
    lines.push("END:VCALENDAR");
    const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lich-gia-dinh_${new Date().toISOString().slice(0, 10)}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Nút nổi lên lịch nhanh — ẩn khi đang mở form/chi tiết hoặc tài khoản khách
  useTabFab(
    currentUser.role !== UserRole.GUEST && !isFormOpen && !viewingPlan && !viewingBirthday && !viewingHoliday
      ? { id: "plans", color: "sky", title: "Lên lịch sự kiện mới", icon: CalendarIcon, onClick: handleOpenCreatePlan }
      : null
  );

  const handleOpenEditPlan = (plan: FamilyPlan) => {
    if (!canManagePlan(plan)) return;

    setNewTitle(plan.title);
    setNewDesc(plan.description || "");
    setNewStartDate(plan.startDate || "");
    setNewEndDate(plan.endDate || plan.startDate || "");
    setNewIsRecurring(plan.isRecurring);
    setNewRecurrenceType(plan.recurrenceType || "none");
    setNewRecurrenceWeekdays(plan.recurrenceWeekdays || []);
    setNewIsShared(plan.isShared);
    setNewColor(plan.color || "sky");
    setEditingPlan(plan);
    setFormError("");
    setViewingPlan(null);
    setIsFormOpen(true);
  };

  const handleClosePlanForm = () => {
    setIsFormOpen(false);
    setEditingPlan(null);
    setFormError("");
  };

  // Escape-to-close + scroll lock + focus trap for the detail & form modals
  const viewingRef = React.useRef<HTMLDivElement | null>(null);
  const formRef = React.useRef<HTMLDivElement | null>(null);
  const birthdayRef = React.useRef<HTMLDivElement | null>(null);
  const holidayRef = React.useRef<HTMLDivElement | null>(null);
  const closeViewing = useCallback(() => setViewingPlan(null), []);
  const closeForm = useCallback(() => { setIsFormOpen(false); setEditingPlan(null); setFormError(""); }, []);
  const closeBirthday = useCallback(() => setViewingBirthday(null), []);
  const closeHoliday = useCallback(() => setViewingHoliday(null), []);
  useModalA11y(!!viewingPlan, closeViewing, viewingRef);
  useModalA11y(isFormOpen, closeForm, formRef);
  useModalA11y(!!viewingBirthday, closeBirthday, birthdayRef);
  useModalA11y(!!viewingHoliday, closeHoliday, holidayRef);

  // Deep-link: khi bấm một sự kiện ở "Sự kiện sắp diễn ra" (Tổng quan) → mở đúng
  // popup chi tiết của sự kiện đó. seq đổi mỗi lần bấm để mở lại kể cả cùng 1 sự kiện.
  useEffect(() => {
    if (!requestedViewPlanSeq || !requestedViewPlanId) return;
    const plan = plans.find(p => p.id === requestedViewPlanId);
    if (plan) {
      setIsFormOpen(false);
      setViewingPlan(plan);
    }
    onConsumeViewPlan?.();
  }, [requestedViewPlanSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter plans according to user permission and filters
  const filteredPlans = useMemo(() => {
    return plans.filter(p => {
      // Shared scope filters
      if (filterSharedOnly === "shared" && !p.isShared) return false;
      if (filterSharedOnly === "personal" && p.isShared) return false;

      // Limited viewers (Child & Guest) only see shared events + their own
      if (isLimitedViewer(currentUser.role) && !p.isShared && p.creatorId !== currentUser.id) {
        return false;
      }

      // Personal plan protection: only see if created by me or shared with everyone
      if (!p.isShared && p.creatorId !== currentUser.id && currentUser.role !== UserRole.ADMIN) {
        return false;
      }

      return true;
    }).sort((a, b) => a.startDate.localeCompare(b.startDate));
  }, [plans, filterSharedOnly, currentUser]);

  // Calendar cursor — user can browse to any month/year (e.g. plans half a year / a year ahead)
  const today = new Date();
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth()); // 0-indexed
  const calMonthName = new Date(calYear, calMonth, 1).toLocaleDateString("vi-VN", { month: "long", year: "numeric" });
  const isViewingToday = calYear === today.getFullYear() && calMonth === today.getMonth();

  const goToPrevMonth = () => {
    if (calMonth === 0) { setCalMonth(11); setCalYear(calYear - 1); }
    else setCalMonth(calMonth - 1);
  };
  const goToNextMonth = () => {
    if (calMonth === 11) { setCalMonth(0); setCalYear(calYear + 1); }
    else setCalMonth(calMonth + 1);
  };
  const goToToday = () => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth()); };

  // Year options span a few years back and several ahead for forward planning
  const yearOptions = Array.from({ length: 10 }, (_, i) => today.getFullYear() - 3 + i);

  const calendarDays = useMemo(() => {
    const firstWeekday = new Date(calYear, calMonth, 1).getDay(); // 0=Sunday
    const firstWeekdayMon = (firstWeekday + 6) % 7; // Mon=0 … Sun=6
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const days: { blank: boolean; dayNum: number }[] = [];
    for (let b = 0; b < firstWeekdayMon; b++) {
      days.push({ blank: true, dayNum: 0 });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push({ blank: false, dayNum: d });
    }
    return days;
  }, [calYear, calMonth]);

  // Map plans to EVERY day in their range (start..end) that falls in the current month
  const plansByDayNum = useMemo(() => {
    const mapping: Record<number, FamilyPlan[]> = {};
    const monthStart = new Date(calYear, calMonth, 1);
    const monthEnd = new Date(calYear, calMonth + 1, 0);
    const addPlanForDate = (date: Date, plan: FamilyPlan) => {
      if (date.getFullYear() !== calYear || date.getMonth() !== calMonth) return;
      const dayNum = date.getDate();
      if (!mapping[dayNum]) mapping[dayNum] = [];
      mapping[dayNum].push(plan);
    };
    filteredPlans.forEach(plan => {
      const startStr = plan.startDate.slice(0, 10);
      const endStr = (plan.endDate || plan.startDate).slice(0, 10);
      const start = new Date(`${startStr}T00:00:00`);
      const endParsed = new Date(`${endStr}T00:00:00`);
      if (isNaN(start.getTime())) return;
      const last = isNaN(endParsed.getTime()) || endParsed < start ? start : endParsed;

      if (plan.isRecurring && plan.recurrenceType && plan.recurrenceType !== "none") {
        // Logic mở rộng lặp lại dùng chung ở utils/recurrence (có test)
        expandRecurringOccurrences(plan, monthStart, monthEnd).forEach(day => addPlanForDate(day, plan));
        return;
      }

      const cur = new Date(start);
      let guard = 0;
      while (cur <= last && guard < 370) {
        addPlanForDate(cur, plan);
        cur.setDate(cur.getDate() + 1);
        guard++;
      }
    });
    return mapping;
  }, [filteredPlans, calYear, calMonth]);

  const monthHolidays = useMemo(() => getVietnamHolidaysForMonth(calYear, calMonth), [calYear, calMonth]);

  const holidaysByDayNum = useMemo(() => {
    const map: Record<number, VietnamHoliday[]> = {};
    monthHolidays.forEach(holiday => {
      const day = Number(holiday.date.slice(8, 10));
      if (!map[day]) map[day] = [];
      map[day].push(holiday);
    });
    return map;
  }, [monthHolidays]);

  const lunarByDayNum = useMemo(() => {
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const map: Record<number, VietnamLunarDate> = {};
    for (let day = 1; day <= daysInMonth; day += 1) {
      map[day] = getVietnamLunarDateForSolarDate(calYear, calMonth + 1, day);
    }
    return map;
  }, [calYear, calMonth]);

  // Birthdays falling in the current calendar month
  const birthdaysByDayNum = useMemo(() => {
    const map: Record<number, { id: string; name: string }[]> = {};
    users.forEach(u => {
      if (!u.dateOfBirth) return;
      const dob = new Date(u.dateOfBirth);
      if (isNaN(dob.getTime()) || dob.getMonth() !== calMonth) return;
      const day = dob.getDate();
      if (!map[day]) map[day] = [];
      map[day].push({ id: u.id, name: u.fullName });
    });
    return map;
  }, [users, calMonth]);

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!newTitle.trim()) {
      setFormError("Vui lòng điền tên kế hoạch sinh hoạt!");
      return;
    }
    if (!newStartDate.trim()) {
      setFormError("Vui lòng điền mốc ngày bắt đầu!");
      return;
    }

    const payload: Partial<FamilyPlan> = {
      id: editingPlan?.id,
      title: newTitle.trim(),
      description: newDesc.trim(),
      startDate: newStartDate.trim(),
      endDate: newEndDate.trim() || newStartDate.trim(),
      isRecurring: newIsRecurring,
      recurrenceType: newIsRecurring ? newRecurrenceType : "none",
      recurrenceWeekdays: newIsRecurring && newRecurrenceType === "weekly"
        ? (newRecurrenceWeekdays.length > 0 ? newRecurrenceWeekdays : [new Date(`${newStartDate.slice(0, 10)}T00:00:00`).getDay()])
        : undefined,
      isShared: newIsShared,
      color: newColor
    };

    try {
      await onSavePlan(payload);
      resetPlanForm();
      setEditingPlan(null);
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || (editingPlan ? "Cập nhật sự kiện thất bại" : "Tạo kế hoạch thất bại"));
    }
  };

  const handleDeleteClick = async (planId: string) => {
    const ok = await confirm({
      title: "Xóa sự kiện khỏi lịch?",
      message: "Sự kiện này sẽ bị xóa khỏi lịch gia đình. Bạn có chắc chắn muốn tiếp tục không?",
      confirmLabel: "Xóa sự kiện",
      cancelLabel: "Đóng lại",
      tone: "danger"
    });
    if (!ok) return;

    await onDeletePlan(planId);
    if (viewingPlan?.id === planId) setViewingPlan(null);
  };

  // --- Add to phone calendar (.ics export) ---
  // Works on iOS (opens Apple Calendar) and Android (offers Google Calendar)
  // by downloading a standard iCalendar file. Times are "floating" local time
  // so the event lands at the same wall-clock time the user entered.
  const pad2 = (n: number) => String(n).padStart(2, "0");

  const parsePlanDate = (s: string) => {
    const [datePart, timePart] = (s || "").trim().split(" ");
    const [y, m, d] = datePart.split("-").map(Number);
    if (!y || !m || !d) return null;
    if (!timePart) return { date: new Date(y, m - 1, d), allDay: true };
    const [hh, mm] = timePart.split(":").map(Number);
    return { date: new Date(y, m - 1, d, hh || 0, mm || 0), allDay: false };
  };

  const fmtICSLocal = (dt: Date) =>
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}T${pad2(dt.getHours())}${pad2(dt.getMinutes())}00`;
  const fmtICSDate = (dt: Date) =>
    `${dt.getFullYear()}${pad2(dt.getMonth() + 1)}${pad2(dt.getDate())}`;

  const escapeICS = (str: string) =>
    (str || "")
      .replace(/\\/g, "\\\\")
      .replace(/;/g, "\\;")
      .replace(/,/g, "\\,")
      .replace(/\r?\n/g, "\\n");

  const buildICS = (plan: FamilyPlan) => {
    const start = parsePlanDate(plan.startDate);
    if (!start) return null;
    const endRaw = plan.endDate && plan.endDate.trim() ? plan.endDate : plan.startDate;
    const end = parsePlanDate(endRaw) || start;

    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Family Organizer//Schedules//VI",
      "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${plan.id}@family-organizer`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z")}`,
    ];

    if (start.allDay) {
      // All-day event: DTEND is exclusive, so add one day to the last day.
      const endBase = end.date >= start.date ? new Date(end.date) : new Date(start.date);
      endBase.setDate(endBase.getDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${fmtICSDate(start.date)}`);
      lines.push(`DTEND;VALUE=DATE:${fmtICSDate(endBase)}`);
    } else {
      let endDt: Date;
      if (!end.allDay && end.date > start.date) {
        endDt = end.date;
      } else {
        endDt = new Date(start.date);
        endDt.setHours(endDt.getHours() + 1); // default 1h duration
      }
      lines.push(`DTSTART:${fmtICSLocal(start.date)}`);
      lines.push(`DTEND:${fmtICSLocal(endDt)}`);
    }

    lines.push(`SUMMARY:${escapeICS(plan.title)}`);
    if (plan.description) lines.push(`DESCRIPTION:${escapeICS(plan.description)}`);
    if (plan.isRecurring && plan.recurrenceType && plan.recurrenceType !== "none") {
      const freq = plan.recurrenceType === "daily" ? "DAILY" : plan.recurrenceType === "weekly" ? "WEEKLY" : "MONTHLY";
      const byDay = plan.recurrenceType === "weekly" && plan.recurrenceWeekdays?.length
        ? `;BYDAY=${plan.recurrenceWeekdays.map(d => ["SU", "MO", "TU", "WE", "TH", "FR", "SA"][d]).join(",")}`
        : "";
      lines.push(`RRULE:FREQ=${freq}${byDay}`);
    }
    lines.push("END:VEVENT", "END:VCALENDAR");
    return lines.join("\r\n");
  };

  const handleAddToCalendar = (plan: FamilyPlan) => {
    const ics = buildICS(plan);
    if (!ics) return;
    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(plan.title || "su-kien").replace(/[^a-z0-9]/gi, "_").slice(0, 40) || "su-kien"}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  // Color schemas
  const badgeColorClass = (color: string) => {
    switch (color) {
      case "emerald": return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
      case "rose": return "bg-rose-500/10 text-rose-400 border border-rose-500/20";
      case "amber": return "bg-amber-500/10 text-amber-400 border border-amber-500/20";
      default: return "bg-sky-500/10 text-sky-400 border border-sky-500/20";
    }
  };

  const borderLeftColor = (color: string) => {
    switch (color) {
      case "emerald": return "border-l-4 border-emerald-500";
      case "rose": return "border-l-4 border-rose-500";
      case "amber": return "border-l-4 border-amber-500";
      default: return "border-l-4 border-sky-500";
    }
  };

  const colorBulletClass = (color: string) => {
    switch (color) {
      case "emerald": return "bg-emerald-500";
      case "rose": return "bg-rose-500";
      case "amber": return "bg-amber-500";
      default: return "bg-sky-500";
    }
  };

  const holidayBadgeClass = (tone: VietnamHoliday["tone"]) => {
    switch (tone) {
      case "official": return "bg-amber-500/15 text-amber-500 border border-amber-500/30";
      case "family": return "bg-pink-500/10 text-pink-400 border border-pink-500/20";
      default: return "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20";
    }
  };

  const holidayBorderClass = (tone: VietnamHoliday["tone"]) => {
    switch (tone) {
      case "official": return "border-l-4 border-l-amber-500";
      case "family": return "border-l-4 border-l-pink-500";
      default: return "border-l-4 border-l-emerald-500";
    }
  };

  const holidayToneLabel = (tone: VietnamHoliday["tone"]) => {
    switch (tone) {
      case "official": return "Ngày lễ chính thức";
      case "family": return "Dịp gia đình";
      default: return "Lễ truyền thống";
    }
  };

  const lunarCellLabel = (lunar?: VietnamLunarDate) => {
    if (!lunar) return "";
    return lunar.day === 1 ? `${lunar.day}/${lunar.month}${lunar.isLeapMonth ? "N" : ""}` : String(lunar.day);
  };

  const lunarCellTitle = (lunar?: VietnamLunarDate) => {
    if (!lunar) return "";
    return `Âm lịch: ngày ${lunar.day}/${lunar.month}${lunar.isLeapMonth ? " nhuận" : ""}/${lunar.year}`;
  };

  const WEEKDAY_OPTIONS = [
    { value: 1, label: "T2" },
    { value: 2, label: "T3" },
    { value: 3, label: "T4" },
    { value: 4, label: "T5" },
    { value: 5, label: "T6" },
    { value: 6, label: "T7" },
    { value: 0, label: "CN" }
  ];

  const recurrenceText = (plan: FamilyPlan) => {
    if (!plan.isRecurring) return "";
    if (plan.recurrenceType === "daily") return "Hằng ngày";
    if (plan.recurrenceType === "weekly") {
      const days = (plan.recurrenceWeekdays || []).map(d => WEEKDAY_OPTIONS.find(o => o.value === d)?.label).filter(Boolean);
      return days.length ? `Hằng tuần: ${days.join(", ")}` : "Hằng tuần";
    }
    return "Hằng tháng";
  };

  // Decide how a plan should render in ONE calendar cell.
  // For multi-day events: start time hugs the opening edge (first day), end time
  // hugs the closing edge (last day), and chevrons (‹ tiếp tục ›) bridge the days
  // in between — instead of wrongly repeating the first day's start time everywhere.
  const getDayBadgeMeta = (plan: FamilyPlan, dayNum: number) => {
    const startTime = (plan.startDate.split(" ")[1] || "").slice(0, 5);
    const endTime = ((plan.endDate || "").split(" ")[1] || "").slice(0, 5);
    const toDate = (s: string) => {
      const d = new Date(`${(s || "").slice(0, 10)}T00:00:00`);
      return isNaN(d.getTime()) ? null : d;
    };
    const start = toDate(plan.startDate);
    if (!start) return { startTime, endTime: "", contFrom: false, contTo: false };
    const endParsed = toDate(plan.endDate || plan.startDate);
    const end = endParsed && endParsed >= start ? endParsed : start;
    const isMultiDay = end.getTime() !== start.getTime();
    if (!isMultiDay) return { startTime, endTime: "", contFrom: false, contTo: false };

    const isCell = (d: Date) =>
      d.getFullYear() === calYear && d.getMonth() === calMonth && d.getDate() === dayNum;
    if (isCell(start)) return { startTime, endTime: "", contFrom: false, contTo: true };  // first day → start time
    if (isCell(end)) return { startTime: "", endTime, contFrom: true, contTo: false };    // last day → end time
    return { startTime: "", endTime: "", contFrom: true, contTo: true };                  // a day in between
  };

  return (
    <div className="space-y-6" id="schedules-module">
      
      {/* Filters and mode change panel */}
      <Reveal className="relative overflow-hidden bg-slate-900 neu-raised p-4.5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4" id="plans-control-header">
        <ShimmerLine accent="sky" />
        
        {/* Toggle shared scopes buttons */}
        <div className="flex bg-slate-950 p-1.5 rounded-xl neu-pressed-sm self-start md:self-auto gap-1 text-xs">
          <button
            onClick={() => setFilterSharedOnly("all")}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all whitespace-nowrap ${filterSharedOnly === "all" ? "bg-slate-900 neu-flat text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
          >
            <span className="sm:hidden">Tất cả</span><span className="hidden sm:inline">Tất cả kế hoạch</span>
          </button>
          <button
            onClick={() => setFilterSharedOnly("shared")}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all whitespace-nowrap ${filterSharedOnly === "shared" ? "bg-slate-900 neu-flat text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
          >
            <span className="sm:hidden">Chung nhà</span><span className="hidden sm:inline">Chung cả nhà</span>
          </button>
          <button
            onClick={() => setFilterSharedOnly("personal")}
            className={`px-3 py-1.5 rounded-lg font-semibold cursor-pointer transition-all whitespace-nowrap ${filterSharedOnly === "personal" ? "bg-slate-900 neu-flat text-slate-100" : "text-slate-400 hover:text-slate-200"}`}
          >
            <span className="sm:hidden">Cá nhân</span><span className="hidden sm:inline">Việc riêng cá nhân</span>
          </button>
        </div>

        {/* Layout Mode selection & add button */}
        <div className="flex items-center gap-3 self-end md:self-auto shrink-0">
          {/* View toggle */}
          <div className="flex bg-slate-950 p-1.5 rounded-xl neu-pressed-sm gap-1">
            <button 
              onClick={() => setViewMode("board")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "board" ? "bg-slate-900 neu-flat text-sky-400" : "text-slate-500 hover:text-slate-300"}`}
              title="Xem dạng Lịch tháng"
            >
              <LayoutGrid className="w-4.5 h-4.5" />
            </button>
            <button 
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${viewMode === "list" ? "bg-slate-900 neu-flat text-sky-400" : "text-slate-500 hover:text-slate-300"}`}
              title="Xem dạng Danh sách thời gian"
            >
              <LayoutList className="w-4.5 h-4.5" />
            </button>
          </div>

          {/* Xuất .ics */}
          <button
            type="button"
            onClick={exportPlansIcs}
            disabled={filteredPlans.length === 0}
            className="bg-slate-900 hover:bg-slate-800 neu-btn disabled:opacity-50 disabled:cursor-not-allowed text-sky-400 px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
            title="Xuất sự kiện ra file .ics để nhập vào Google/Apple Calendar"
          >
            <Download className="w-3.5 h-3.5" /> .ics
          </button>

          {/* New register event button */}
          <button
            disabled={currentUser.role === UserRole.GUEST}
            onClick={handleOpenCreatePlan}
            className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all shadow-md shadow-sky-500/5 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Lên lịch sự kiện
          </button>
        </div>
      </Reveal>

      {/* Main View Display AREA */}
      {viewMode === "board" ? (
        /* Monthly style responsive Grid */
        <Reveal delay={0.08} className="relative bg-slate-900 neu-raised rounded-2xl overflow-hidden" id="calendar-monthly-grid-view">
          <ShimmerLine accent="amber" />
          
          <div className="bg-slate-950 p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base font-extrabold text-slate-200 flex items-center gap-2 capitalize">
                <CalendarIcon className="w-5 h-5 text-amber-400 shrink-0" />
                {calMonthName}
              </h3>
              {monthHolidays.length > 0 && (
                <span className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-500/10 text-amber-500 border border-amber-500/20">
                  {monthHolidays.length} ngày lễ VN
                </span>
              )}
              {!isViewingToday && (
                <button
                  type="button"
                  onClick={goToToday}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg text-[11px] font-bold cursor-pointer transition-colors"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> Hôm nay
                </button>
              )}
            </div>

            {/* Month / year navigation */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={goToPrevMonth}
                aria-label="Tháng trước"
                className="p-1.5 bg-slate-900 hover:bg-slate-800 neu-btn text-slate-400 hover:text-sky-400 rounded-lg cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="w-[104px] text-xs">
                <FancySelect
                  value={String(calMonth)}
                  onChange={(v) => setCalMonth(Number(v))}
                  ariaLabel="Chọn tháng"
                  className="bg-slate-900"
                  options={Array.from({ length: 12 }, (_, m) => ({ value: String(m), label: `Tháng ${m + 1}` }))}
                />
              </div>

              <div className="w-[88px] text-xs">
                <FancySelect
                  value={String(calYear)}
                  onChange={(v) => setCalYear(Number(v))}
                  ariaLabel="Chọn năm"
                  className="bg-slate-900 font-mono"
                  options={yearOptions.map(y => ({ value: String(y), label: String(y) }))}
                />
              </div>

              <button
                type="button"
                onClick={goToNextMonth}
                aria-label="Tháng sau"
                className="p-1.5 bg-slate-900 hover:bg-slate-800 neu-btn text-slate-400 hover:text-sky-400 rounded-lg cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Weekday labels — tuần bắt đầu Thứ 2 */}
          <div className="grid grid-cols-7 border-b border-slate-800 text-center bg-slate-950/40 text-[10px] sm:text-[11px] font-bold py-2.5">
            <div className="text-slate-500"><span className="hidden sm:inline">Thứ Hai</span><span className="sm:hidden">T2</span></div>
            <div className="text-slate-500"><span className="hidden sm:inline">Thứ Ba</span><span className="sm:hidden">T3</span></div>
            <div className="text-slate-500"><span className="hidden sm:inline">Thứ Tư</span><span className="sm:hidden">T4</span></div>
            <div className="text-slate-500"><span className="hidden sm:inline">Thứ Năm</span><span className="sm:hidden">T5</span></div>
            <div className="text-slate-500"><span className="hidden sm:inline">Thứ Sáu</span><span className="sm:hidden">T6</span></div>
            <div className="text-amber-600 dark:text-amber-400"><span className="hidden sm:inline">Thứ Bảy</span><span className="sm:hidden">T7</span></div>
            <div className="text-red-600 dark:text-red-400"><span className="hidden sm:inline">Chủ Nhật</span><span className="sm:hidden">CN</span></div>
          </div>

          {/* 30 block spaces */}
          <div className="grid grid-cols-7 auto-rows-[112px] sm:auto-rows-[118px] lg:auto-rows-[132px] bg-slate-900">
            {calendarDays.map((day, i) => {
              if (day.blank) {
                return <div key={`blank-${i}`} className="bg-slate-950/25 border-r border-b border-slate-800/60" />;
              }

              const dayPlans = plansByDayNum[day.dayNum] || [];
              const dayBirthdays = birthdaysByDayNum[day.dayNum] || [];
              const dayHolidays = holidaysByDayNum[day.dayNum] || [];
              const lunarDate = lunarByDayNum[day.dayNum];
              const hasEvents = dayPlans.length > 0 || dayBirthdays.length > 0 || dayHolidays.length > 0;
              const isToday = isViewingToday && day.dayNum === today.getDate();
              const isSaturday = i % 7 === 5;
              const isSunday = i % 7 === 6;
              const isWeekend = isSaturday || isSunday;

              return (
                <div
                  key={`day-${day.dayNum}`}
                  className={`p-1.5 sm:p-2 border-r border-b border-slate-800/80 hover:bg-slate-800/10 transition-colors flex flex-col overflow-hidden ${isSaturday ? "bg-amber-50 dark:bg-amber-950/20" : ""} ${isSunday ? "bg-red-50 dark:bg-red-950/20" : ""} ${dayHolidays.length > 0 ? "bg-amber-500/5" : ""} ${isToday ? "bg-gradient-to-b from-sky-500/12 to-transparent" : ""}`}
                >
                  <div className="flex justify-between items-start gap-1.5 min-h-9">
                    <div className="min-w-0">
                      <span className={`inline-flex h-7 min-w-7 sm:h-8 sm:min-w-8 items-center justify-center rounded-lg border px-1 sm:px-1.5 text-sm sm:text-lg font-extrabold font-mono leading-none ${isToday ? "bg-sky-500 text-slate-950 border-sky-300 shadow-lg shadow-sky-500/40 ring-2 ring-sky-500/30" : dayHolidays.length > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/25" : isSaturday ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50" : isSunday ? "bg-red-100 text-red-700 border-red-300 dark:bg-red-950/40 dark:text-red-300 dark:border-red-800/50" : "bg-slate-950/60 text-slate-200 border-slate-800"}`}>
                        {day.dayNum}
                      </span>

                      {lunarDate && (
                        <div
                          className={`mt-1 text-[8px] sm:text-[9px] leading-none font-mono font-semibold ${lunarDate.day === 1 ? "text-emerald-400" : "text-slate-500"}`}
                          title={lunarCellTitle(lunarDate)}
                        >
                          âm {lunarCellLabel(lunarDate)}
                        </div>
                      )}
                      {dayHolidays.length > 0 && (
                        <div className="mt-1 text-[9px] leading-none font-bold text-amber-500 truncate">Lễ</div>
                      )}
                    </div>
                    {(isToday || hasEvents) && (
                      <div className="hidden sm:flex items-center gap-1.5 h-8 shrink-0">
                        {isToday && (
                          <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wide text-sky-400 leading-none">
                            <span className="w-1 h-1 rounded-full bg-sky-400 animate-pulse" /> Hôm nay
                          </span>
                        )}
                        {hasEvents && (
                          <div className="flex items-center gap-1">
                            {dayHolidays.length > 0 && <span className="w-2 h-2 rounded-full bg-amber-400" title="Ngày lễ Việt Nam" />}
                            {dayBirthdays.length > 0 && <span className="w-2 h-2 rounded-full bg-pink-400" title="Sinh nhật" />}
                            {dayPlans.length > 0 && <span className="w-2 h-2 rounded-full bg-sky-400 animate-pulse" title="Sự kiện" />}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Holiday, event and birthday badges */}
                  <div className="mt-2 space-y-1.5 overflow-y-auto flex-1 min-h-0 pr-0.5 scrollbar-none">
                    {dayHolidays.map(holiday => (
                      <button
                        key={`holiday-${holiday.date}-${holiday.shortTitle}`}
                        type="button"
                        onClick={() => setViewingHoliday({ holiday, day: day.dayNum })}
                        title={`${holiday.title}${holiday.lunarDate ? ` (${holiday.lunarDate})` : ""}`}
                        aria-label={`Xem ý nghĩa ${holiday.title}`}
                        className={`w-full text-left text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-md font-semibold flex items-center gap-1 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity ${holidayBadgeClass(holiday.tone)}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-current opacity-75 shrink-0" />
                        <span className="truncate min-w-0 flex-1">{holiday.shortTitle}</span>
                      </button>
                    ))}
                    {dayBirthdays.map(b => {
                      const bUser = users.find(u => u.id === b.id);
                      return (
                        <button
                          key={`bd-${b.id}`}
                          type="button"
                          onClick={() => bUser && setViewingBirthday({ user: bUser, day: day.dayNum })}
                          title={`🎂 Sinh nhật ${b.name} — bấm để xem chi tiết`}
                          className="w-full text-left text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-md font-medium flex items-center gap-1 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity bg-pink-500/10 text-pink-400 border border-pink-500/20"
                        >
                          <span className="shrink-0">🎂</span>
                          <span className="truncate min-w-0 flex-1">{b.name}</span>
                        </button>
                      );
                    })}
                    {dayPlans.map(plan => {
                      const meta = getDayBadgeMeta(plan, day.dayNum);
                      return (
                        <button
                          key={plan.id}
                          type="button"
                          onClick={() => setViewingPlan(plan)}
                          title={`${plan.title}\n(${formatDateTimeVN(plan.startDate)} → ${formatDateTimeVN(plan.endDate || plan.startDate)})`}
                          className={`w-full text-left text-[9px] sm:text-[10px] px-1 sm:px-1.5 py-0.5 sm:py-1 rounded-md font-medium flex items-center gap-0.5 overflow-hidden cursor-pointer hover:opacity-80 transition-opacity ${badgeColorClass(plan.color)}`}
                        >
                          {meta.contFrom && <ChevronLeft className="w-2.5 h-2.5 shrink-0 opacity-60" />}
                          {meta.startTime && <span className="hidden sm:inline shrink-0 text-[8px] font-mono opacity-80">{meta.startTime}</span>}
                          <span className="truncate min-w-0 flex-1">{plan.title}</span>
                          {meta.endTime && <span className="hidden sm:inline shrink-0 text-[8px] font-mono opacity-80">{meta.endTime}</span>}
                          {meta.contTo && <ChevronRight className="w-2.5 h-2.5 shrink-0 opacity-60" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Chú thích loại sự kiện — giải thích ý nghĩa màu trên lịch */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 border-t border-slate-800 bg-slate-950/30">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wide shrink-0">Chú thích</span>
            {PLAN_TYPES.map(t => {
              const Icon = t.icon;
              return (
                <span key={t.value} className="inline-flex items-center gap-1.5 text-[10px] sm:text-[11px] text-slate-400 font-medium">
                  <span className="w-4 h-4 rounded-md flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.dotHex}22`, color: t.dotHex }}>
                    <Icon className="w-2.5 h-2.5" />
                  </span>
                  {t.label}
                </span>
              );
            })}
          </div>
        </Reveal>
      ) : (
        /* Agenda List View Details list */
        <div className="space-y-3" id="calendar-agenda-list-view">
          {filteredPlans.length === 0 ? (
            <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center">
              <p className="text-sm text-slate-500">Chưa ghi nhận kế hoạch sinh hoạt gia đình nào phù hợp.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {filteredPlans.map((plan, planIndex) => {
                const creator = users.find(u => u.id === plan.creatorId);
                const canManage = canManagePlan(plan);
                const sDate = formatDateTimeVN(plan.startDate).split(" ");
                const eDate = formatDateTimeVN(plan.endDate).split(" ");
                const typeMeta = planTypeMeta(plan.color);
                const TypeIcon = typeMeta.icon;
                return (
                  <Reveal
                    key={plan.id}
                    delay={0.06 + staggerDelay(planIndex)}
                    hoverLift
                    className={`bg-slate-900 neu-raised ${borderLeftColor(plan.color)} rounded-2xl p-4 flex flex-col justify-between space-y-3 shadow-md relative group hover:shadow-xl transition-[box-shadow] duration-300`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className={`text-[10px] px-2 py-0.5 rounded-lg ${badgeColorClass(plan.color)} font-semibold inline-flex items-center gap-1`}>
                          <TypeIcon className="w-3 h-3 shrink-0" />
                          {typeMeta.label}
                        </span>
                        
                        <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                          {plan.isShared ? <Eye className="w-3.5 h-3.5 text-sky-400" /> : <Lock className="w-3.5 h-3.5 text-indigo-400" />}
                          <span>{plan.isShared ? "Công khai" : "Bản thân"}</span>
                        </div>
                      </div>

                      <h4 className="text-sm font-bold text-slate-200">{plan.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed font-sans">{plan.description || "Không có ghi chú thêm."}</p>
                    </div>

                    {/* Timeline line details */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400 font-mono">
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-amber-500/80" />
                        <div className="flex flex-col">
                          <span>Bắt đầu: {sDate[0]} <span className="text-amber-400/90 text-[10px]">{sDate[1]}</span></span>
                          {plan.endDate && <span>Kết thúc: {eDate[0]} <span className="text-indigo-400/90 text-[10px]">{eDate[1]}</span></span>}
                        </div>
                      </div>

                      {/* Recurrence Indicator */}
                      {plan.isRecurring && (
                        <span className="flex items-center gap-1 bg-indigo-500/10 text-indigo-400 text-[10px] px-1.5 py-0.5 border border-indigo-500/20 rounded-md">
                          <Repeat className="w-3 h-3 animate-spin" /> {recurrenceText(plan)}
                        </span>
                      )}
                    </div>

                    {/* Add to phone calendar (.ics — works on iOS & Android) */}
                    <button
                      type="button"
                      onClick={() => handleAddToCalendar(plan)}
                      className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-lg font-semibold text-[11px] transition-all cursor-pointer"
                    >
                      <CalendarPlus className="w-3.5 h-3.5" /> Thêm vào lịch điện thoại
                    </button>

                    {/* Creator mark */}
                    <div className="text-[10px] text-slate-500 pt-1 text-right flex items-center justify-end gap-1 font-sans">
                      <span>Lập bởi: {creator ? creator.fullName : "Thành viên"}</span>
                    </div>

                    {/* Owner/Admin actions */}
                    {canManage && (
                      <div className="absolute right-3.5 top-3.5 flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          aria-label={`Sửa sự kiện ${plan.title}`}
                          onClick={() => handleOpenEditPlan(plan)}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 neu-btn hover:text-amber-400 text-slate-500 rounded-lg cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          aria-label={`Xóa sự kiện ${plan.title}`}
                          onClick={() => handleDeleteClick(plan.id)}
                          className="p-1.5 bg-slate-950 hover:bg-slate-800 neu-btn hover:text-rose-400 text-slate-500 rounded-lg cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </Reveal>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Creation Modal */}
      {/* Event detail viewer (click an event on the calendar) */}
      {viewingPlan && (() => {
        const creator = users.find(u => u.id === viewingPlan.creatorId);
        const canManage = canManagePlan(viewingPlan);
        return (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={viewingRef}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              className={`bg-slate-900 border border-slate-800 ${borderLeftColor(viewingPlan.color)} rounded-2xl w-full max-w-md p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none`}
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="space-y-1 min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg ${badgeColorClass(viewingPlan.color)} font-semibold`}>
                    {viewingPlan.color === "emerald" ? "Dã ngoại / Ăn chơi" : viewingPlan.color === "rose" ? "Quan trọng" : viewingPlan.color === "amber" ? "Bài học / Công việc" : "Họp hành / Gặp mặt"}
                  </span>
                  <h3 className="text-md font-bold text-slate-100">{viewingPlan.title}</h3>
                </div>
                <button
                  type="button"
                  aria-label="Đóng chi tiết sự kiện"
                  onClick={() => setViewingPlan(null)}
                  className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                {viewingPlan.description || "Không có ghi chú thêm."}
              </p>

              <div className="space-y-2 bg-slate-950/40 neu-pressed-sm rounded-xl p-3.5 text-xs font-mono">
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-amber-500/80 shrink-0" />
                  <span className="text-slate-300">Bắt đầu: <span className="text-amber-400">{formatDateTimeVN(viewingPlan.startDate)}</span></span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-400/80 shrink-0" />
                  <span className="text-slate-300">Kết thúc: <span className="text-indigo-400">{formatDateTimeVN(viewingPlan.endDate || viewingPlan.startDate)}</span></span>
                </div>
                {viewingPlan.isRecurring && (
                  <div className="flex items-center gap-2 text-indigo-400">
                    <Repeat className="w-3.5 h-3.5 shrink-0" />
                    <span>Lặp lại: {recurrenceText(viewingPlan)}</span>
                  </div>
                )}
              </div>

              {/* Add to the phone's native calendar (.ics — works on iOS & Android) */}
              <button
                type="button"
                onClick={() => handleAddToCalendar(viewingPlan)}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-md shadow-sky-500/10"
              >
                <CalendarPlus className="w-4 h-4" /> Thêm vào lịch điện thoại
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-[11px] text-slate-500 font-sans">
                <span className="flex items-center gap-1.5">
                  {viewingPlan.isShared ? <Eye className="w-3.5 h-3.5 text-sky-400" /> : <Lock className="w-3.5 h-3.5 text-indigo-400" />}
                  {viewingPlan.isShared ? "Công khai" : "Riêng tư"} • Lập bởi {creator ? creator.fullName : "Thành viên"}
                </span>
                <div className="flex items-center justify-end gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setViewingPlan(null)}
                    className="px-3 py-1.5 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 neu-btn rounded-lg font-semibold cursor-pointer"
                  >
                    Đóng lại
                  </button>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => handleOpenEditPlan(viewingPlan)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20 rounded-lg font-semibold cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Sửa
                    </button>
                  )}
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => void handleDeleteClick(viewingPlan.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-lg font-semibold cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Xóa
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* Holiday detail viewer (click a Vietnamese holiday badge on the calendar) */}
      {viewingHoliday && (() => {
        const holiday = viewingHoliday.holiday;
        const parsedDate = new Date(`${holiday.date}T00:00:00`);
        const isValidDate = !isNaN(parsedDate.getTime());
        const weekday = isValidDate ? parsedDate.toLocaleDateString("vi-VN", { weekday: "long" }) : "";
        const dateLabel = isValidDate ? parsedDate.toLocaleDateString("vi-VN", { day: "numeric", month: "long", year: "numeric" }) : holiday.date;
        return (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={holidayRef}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              className={`bg-slate-900 border border-slate-800 ${holidayBorderClass(holiday.tone)} rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none`}
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="space-y-1 min-w-0">
                  <span className={`text-[10px] px-2 py-0.5 rounded-lg ${holidayBadgeClass(holiday.tone)} font-semibold inline-flex items-center gap-1`}>
                    <CalendarIcon className="w-3 h-3" /> {holidayToneLabel(holiday.tone)}
                  </span>
                  <h3 className="text-md font-bold text-slate-100">{holiday.title}</h3>
                </div>
                <button
                  type="button"
                  aria-label="Đóng chi tiết ngày lễ"
                  onClick={() => setViewingHoliday(null)}
                  className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 bg-slate-950/40 neu-pressed-sm rounded-xl p-3.5 text-xs">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <span className="text-slate-300 capitalize">{weekday ? `${weekday}, ` : ""}{dateLabel}</span>
                </div>
                {holiday.lunarDate && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <span className="text-slate-300">{holiday.lunarDate}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span className="text-slate-300">{holidayToneLabel(holiday.tone)}</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-xs font-bold text-slate-200">Ý nghĩa</h4>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {holiday.meaning}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setViewingHoliday(null)}
                className="w-full px-4 py-2 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-slate-100 neu-btn rounded-xl font-semibold cursor-pointer transition-all"
              >
                Đóng lại
              </button>
            </motion.div>
          </div>
        );
      })()}

      {/* Birthday detail viewer (click a birthday badge on the calendar) */}
      {viewingBirthday && (() => {
        const u = viewingBirthday.user;
        const dobParsed = u.dateOfBirth ? new Date(`${u.dateOfBirth.slice(0, 10)}T00:00:00`) : null;
        const dob = dobParsed && !isNaN(dobParsed.getTime()) ? dobParsed : null;
        const birthYear = dob ? dob.getFullYear() : null;
        const hasRealYear = !!birthYear && birthYear > 1900;
        const turningAge = hasRealYear ? calYear - (birthYear as number) : null;
        const bdDate = new Date(calYear, calMonth, viewingBirthday.day);
        const weekday = bdDate.toLocaleDateString("vi-VN", { weekday: "long" });
        const dateLabel = bdDate.toLocaleDateString("vi-VN", { day: "numeric", month: "long" });
        return (
          <div
            className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          >
            <motion.div
              ref={birthdayRef}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={(e) => e.stopPropagation()}
              role="dialog"
              aria-modal="true"
              className="bg-slate-900 border border-slate-800 border-l-4 border-l-pink-500 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-800">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar user={u} className="w-11 h-11 rounded-xl text-base" extraClass="shrink-0" />
                  <div className="min-w-0 space-y-1">
                    <span className="text-[10px] px-2 py-0.5 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20 font-semibold inline-flex items-center gap-1">
                      <Cake className="w-3 h-3" /> Sinh nhật
                    </span>
                    <h3 className="text-md font-bold text-slate-100 truncate">{u.fullName}</h3>
                  </div>
                </div>
                <button
                  type="button"
                  aria-label="Đóng chi tiết sinh nhật"
                  onClick={() => setViewingBirthday(null)}
                  className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-2.5 bg-slate-950/40 neu-pressed-sm rounded-xl p-3.5 text-xs">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <span className="text-slate-300 capitalize">{weekday}, ngày {dateLabel}</span>
                </div>
                {turningAge !== null && turningAge > 0 && (
                  <div className="flex items-center gap-2">
                    <Cake className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                    <span className="text-slate-300">Tròn <span className="text-pink-400 font-bold">{turningAge} tuổi</span></span>
                  </div>
                )}
                {u.familyRelation && (
                  <div className="flex items-center gap-2">
                    <Tag className="w-3.5 h-3.5 text-pink-400/70 shrink-0" />
                    <span className="text-slate-300">Quan hệ: {FAMILY_RELATION_LABELS[u.familyRelation]}</span>
                  </div>
                )}
                {dob && hasRealYear && (
                  <div className="flex items-center gap-2">
                    <Clock className="w-3.5 h-3.5 text-pink-400/70 shrink-0" />
                    <span className="text-slate-400 font-mono">Ngày sinh: {pad2(dob.getDate())}/{pad2(dob.getMonth() + 1)}/{dob.getFullYear()}</span>
                  </div>
                )}
              </div>

              <p className="text-xs text-slate-400 text-center leading-relaxed">
                🎉 Đừng quên gửi lời chúc mừng đến <span className="text-pink-400 font-semibold">{u.fullName}</span> nhé!
              </p>

              <button
                type="button"
                onClick={() => setViewingBirthday(null)}
                className="w-full px-4 py-2 bg-slate-950 text-slate-300 hover:bg-slate-800 hover:text-slate-100 neu-btn rounded-xl font-semibold cursor-pointer transition-all"
              >
                Đóng lại
              </button>
            </motion.div>
          </div>
        );
      })()}

      {isFormOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          id={editingPlan ? "plan-edit-modal" : "plan-create-modal"}
        >
          <motion.div
            ref={formRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-1.5">
                <CalendarIcon className="w-5 h-5 text-sky-400" /> {editingPlan ? "Chỉnh sửa sự kiện" : "Đăng ký lịch trình sinh hoạt"}
              </h3>
              <button
                type="button"
                aria-label="Đóng form lịch trình"
                onClick={handleClosePlanForm}
                className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="flex flex-col min-h-0 flex-1 overflow-hidden text-xs">
              <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">
                  {formError}
                </div>
              )}

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">Tên sự kiện / Lịch trình <span className="text-rose-400">*</span></label>
                <input 
                  type="text" 
                  placeholder="Ví dụ: Cơm tối nhà nội, Đi tiêm phòng cho con..."
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">Ghi chú lưu ý thêm</label>
                <textarea 
                  rows={2}
                  placeholder="Chuẩn bị quà cáp, tài liệu, tiền lẻ hoặc phương tiện di chuyển..."
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-slate-400 block font-semibold">Bắt đầu <span className="text-rose-400">*</span></label>
                <DateTimePicker24 value={newStartDate} onChange={setNewStartDate} required />
              </div>

              <div className="space-y-1 min-w-0">
                <label className="text-slate-400 block font-semibold">Kết thúc</label>
                <DateTimePicker24 value={newEndDate} onChange={setNewEndDate} />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-xl border border-slate-800/80">
                <div className="space-y-1">
                  <label className="text-slate-400 block font-semibold">Xảy ra định kỳ</label>
                  <FancySelect
                    value={newIsRecurring ? "true" : "false"}
                    onChange={(v) => setNewIsRecurring(v === "true")}
                    ariaLabel="Xảy ra định kỳ"
                    options={[
                      { value: "false", label: "Chỉ xảy ra một lần" },
                      { value: "true", label: "Sự kiện có lặp lại" }
                    ]}
                  />
                </div>

                {newIsRecurring && (
                  <div className="space-y-1 font-mono">
                    <label className="text-slate-400 block font-semibold">Tần suất lặp lại</label>
                    <FancySelect
                      value={newRecurrenceType}
                      onChange={(v) => setNewRecurrenceType(v as any)}
                      ariaLabel="Tần suất lặp lại"
                      options={[
                        { value: "daily", label: "Hằng ngày" },
                        { value: "weekly", label: "Hằng tuần" },
                        { value: "monthly", label: "Hằng tháng" }
                      ]}
                    />
                  </div>
                )}
                {newIsRecurring && newRecurrenceType === "weekly" && (
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-slate-400 block font-semibold">Lặp vào thứ nào trong tuần</label>
                    <div className="grid grid-cols-7 gap-1.5">
                      {WEEKDAY_OPTIONS.map(day => {
                        const active = newRecurrenceWeekdays.includes(day.value);
                        return (
                          <button
                            key={day.value}
                            type="button"
                            onClick={() => setNewRecurrenceWeekdays(prev => active ? prev.filter(v => v !== day.value) : [...prev, day.value].sort((a, b) => a - b))}
                            className={`px-2 py-2 rounded-lg text-[11px] font-bold border cursor-pointer transition-colors ${active ? "bg-indigo-500 text-white border-indigo-400" : "bg-slate-950 text-slate-400 border-slate-800 hover:border-indigo-500/50"}`}
                          >
                            {day.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 min-w-0">
                  <label className="text-slate-400 block font-semibold">Phạm vi chia sẻ</label>
                  <FancySelect
                    value={newIsShared ? "true" : "false"}
                    onChange={(v) => setNewIsShared(v === "true")}
                    ariaLabel="Phạm vi chia sẻ"
                    options={[
                      { value: "true", label: "Công khai cả nhà cùng thấy" },
                      { value: "false", label: "Riêng tư cá nhân" }
                    ]}
                  />
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <label className="text-slate-400 block font-semibold">Loại sự kiện</label>
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {PLAN_TYPES.map(t => {
                      const Icon = t.icon;
                      const active = newColor === t.value;
                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setNewColor(t.value)}
                          className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left cursor-pointer transition-colors ${active ? "border-slate-100 bg-slate-800/40" : "border-slate-800 bg-slate-950 hover:border-slate-700"}`}
                        >
                          <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${t.dotHex}22`, color: t.dotHex }}>
                            <Icon className="w-4 h-4" />
                          </span>
                          <span className="text-[11px] font-semibold text-slate-200 leading-tight min-w-0">{t.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              </div>

              <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
                <button
                  type="button"
                  onClick={handleClosePlanForm}
                  className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl transition-all cursor-pointer font-bold"
                >
                  Đóng lại
                </button>
                <button 
                  type="submit" 
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {editingPlan ? "Lưu thay đổi" : "Lưu kế hoạch"}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
