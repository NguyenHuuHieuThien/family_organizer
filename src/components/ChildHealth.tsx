/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input, Textarea } from "./ui";
import React, { useEffect, useMemo, useState } from "react";
import { Syringe, Plus, Trash2, Check, Calendar, Ruler, HeartPulse, Pill, ShieldAlert, Phone, Pencil, X, Droplet, AlertTriangle, Stethoscope, Cake, FileDown } from "lucide-react";
import { VaccinationRecord, GrowthRecord, MedicationReminder, MedicationLog, User, UserRole, EmergencyProfile, EmergencyContact, BLOOD_TYPE_OPTIONS, FAMILY_RELATION_LABELS } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { assessBmi, ageFromDob, BmiAssessment } from "../utils/bmi.js";
import { Avatar } from "./Avatar.js";
import { Medication } from "./Medication.js";
import { ShimmerLine, Reveal, IconChip, staggerDelay } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";
import { DateInputDMY, formatDateVN } from "./DateTimePicker24.js";
import { useTranslation } from "react-i18next";

type HealthSection = "growth" | "vaccination" | "medication" | "emergency";

interface ChildHealthProps {
  currentUser: User;
  users: User[];
  vaccinations: VaccinationRecord[];
  growthRecords: GrowthRecord[];
  healthProfiles: EmergencyProfile[];
  medications: MedicationReminder[];
  medicationLogs: MedicationLog[];
  onSaveHealthProfile: (p: Partial<EmergencyProfile>) => Promise<any>;
  onSaveVaccination: (v: Partial<VaccinationRecord>) => Promise<any>;
  onDeleteVaccination: (id: string) => Promise<any>;
  onSaveGrowth: (g: Partial<GrowthRecord>) => Promise<any>;
  onDeleteGrowth: (id: string) => Promise<any>;
  onSaveMedication: (medication: Partial<MedicationReminder>) => Promise<any>;
  onDeleteMedication: (id: string) => Promise<any>;
  onLogDose: (medicationId: string, date: string, time: string, status: "taken" | "skipped" | "none") => Promise<any>;
  // Deep-link: mở sẵn một sub-tab (vd: thông báo thuốc → mục Lịch thuốc)
  requestedSection?: HealthSection;
  requestedSectionSeq?: number;
}

// Vắc-xin phổ biến theo lịch tiêm chủng VN (gợi ý qua datalist, vẫn cho tự nhập).
const COMMON_VACCINES = [
  "Lao (BCG)", "Viêm gan B", "6 trong 1", "5 trong 1", "Bại liệt (OPV/IPV)",
  "Phế cầu", "Rota (uống)", "Sởi", "Sởi - Quai bị - Rubella (MMR)",
  "Viêm não Nhật Bản", "Thủy đậu", "Cúm", "Viêm gan A",
  "Bạch hầu - Ho gà - Uốn ván (DPT)", "HPV"
];

function daysLeft(dateStr?: string): number | null {
  if (!dateStr) return null;
  const p = String(dateStr).split("-");
  if (p.length < 3) return null;
  const target = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  const t = new Date();
  return Math.round((target.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
}

// Tuổi kiểu Việt Nam: bé dưới 3 tuổi nói theo "X tháng Y ngày" (dưới 1 tháng
// thì "X ngày"), từ 3 tuổi trở lên nói "X tuổi".
function formatAgeVi(dobStr?: string): string | null {
  if (!dobStr) return null;
  const dob = new Date(dobStr);
  const now = new Date();
  if (isNaN(dob.getTime()) || dob > now) return null;
  let months = (now.getFullYear() - dob.getFullYear()) * 12 + (now.getMonth() - dob.getMonth());
  let anchor = new Date(dob);
  anchor.setMonth(dob.getMonth() + months);
  if (anchor > now) {
    months -= 1;
    anchor = new Date(dob);
    anchor.setMonth(dob.getMonth() + months);
  }
  const days = Math.floor((now.getTime() - anchor.getTime()) / 86400000);
  if (months >= 36) return `${Math.floor(months / 12)} tuổi`;
  if (months >= 1) return `${months} tháng ${days} ngày`;
  return `${days} ngày`;
}

function parsePositiveMeasurement(value: string): number | undefined {
  const raw = value.trim();
  if (!raw) return undefined;
  const num = Number(raw.replace(",", "."));
  return Number.isFinite(num) && num > 0 ? num : NaN;
}

function bmiBadgeClass(c: BmiAssessment["color"]) {
  switch (c) {
    case "emerald": return "bg-emerald-500/15 text-emerald-400 border-emerald-500/30";
    case "amber": return "bg-amber-500/15 text-amber-400 border-amber-500/30";
    case "rose": return "bg-rose-500/15 text-rose-400 border-rose-500/30";
    default: return "bg-slate-700/30 text-slate-300 border-slate-600/40";
  }
}

// Mini SVG line chart for a single metric over time.
function MiniChart({ data, color, unit, noDataLabel }: { data: { date: string; value: number }[]; color: string; unit: string; noDataLabel: string }) {
  if (data.length === 0) return <p className="text-[10px] text-slate-600">{noDataLabel}</p>;
  const values = data.map(d => d.value);
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 240, H = 60, pad = 6;
  const pts = data.map((d, i) => {
    const x = data.length === 1 ? W / 2 : pad + (i / (data.length - 1)) * (W - 2 * pad);
    const y = H - pad - ((d.value - min) / range) * (H - 2 * pad);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  return (
    <div className="space-y-1">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-16">
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {data.map((d, i) => {
          const x = data.length === 1 ? W / 2 : pad + (i / (data.length - 1)) * (W - 2 * pad);
          const y = H - pad - ((d.value - min) / range) * (H - 2 * pad);
          return <circle key={i} cx={x} cy={y} r="2.5" fill={color} />;
        })}
      </svg>
      <div className="flex justify-between text-[9px] text-slate-500 font-mono">
        <span>{min}{unit}</span><span>{max}{unit}</span>
      </div>
    </div>
  );
}

// "Hệ" thẻ bài theo quan hệ gia đình.
interface CardTheme { frame: string; ring: string; glow: string; accent: string; element: string; titleKey: string; rayHex: string; }
const CARD_THEME_BY_RELATION: Record<string, CardTheme> = {
  ba:         { frame: "from-cyan-300 via-blue-500 to-indigo-700", ring: "border-cyan-500/50 dark:border-cyan-300/60", glow: "shadow-cyan-500/15 dark:shadow-cyan-400/25", accent: "text-cyan-700 dark:text-cyan-300", element: "🛡️", titleKey: "childHealth.cardThemeFather", rayHex: "#38bdf8" },
  me:         { frame: "from-pink-300 via-rose-500 to-fuchsia-700", ring: "border-pink-500/50 dark:border-pink-300/60", glow: "shadow-rose-500/15 dark:shadow-rose-400/25", accent: "text-pink-700 dark:text-pink-300", element: "🌸", titleKey: "childHealth.cardThemeMother", rayHex: "#f472b6" },
  con:        { frame: "from-emerald-300 via-green-500 to-teal-700", ring: "border-emerald-500/50 dark:border-emerald-300/60", glow: "shadow-emerald-500/15 dark:shadow-emerald-400/25", accent: "text-emerald-700 dark:text-emerald-300", element: "🌱", titleKey: "childHealth.cardThemeChild", rayHex: "#34d399" },
  ong_noi:    { frame: "from-amber-200 via-yellow-500 to-orange-700", ring: "border-amber-500/50 dark:border-amber-300/60", glow: "shadow-amber-500/15 dark:shadow-amber-400/25", accent: "text-amber-700 dark:text-amber-300", element: "👑", titleKey: "childHealth.cardThemeGrandparent", rayHex: "#fbbf24" },
  ong_ngoai:  { frame: "from-amber-200 via-yellow-500 to-orange-700", ring: "border-amber-500/50 dark:border-amber-300/60", glow: "shadow-amber-500/15 dark:shadow-amber-400/25", accent: "text-amber-700 dark:text-amber-300", element: "👑", titleKey: "childHealth.cardThemeGrandparent", rayHex: "#fbbf24" },
  ba_noi:     { frame: "from-fuchsia-300 via-purple-500 to-violet-800", ring: "border-fuchsia-500/50 dark:border-fuchsia-300/60", glow: "shadow-fuchsia-500/15 dark:shadow-fuchsia-400/25", accent: "text-fuchsia-700 dark:text-fuchsia-300", element: "🌟", titleKey: "childHealth.cardThemeGrandmother", rayHex: "#e879f9" },
  ba_ngoai:   { frame: "from-fuchsia-300 via-purple-500 to-violet-800", ring: "border-fuchsia-500/50 dark:border-fuchsia-300/60", glow: "shadow-fuchsia-500/15 dark:shadow-fuchsia-400/25", accent: "text-fuchsia-700 dark:text-fuchsia-300", element: "🌟", titleKey: "childHealth.cardThemeGrandmother", rayHex: "#e879f9" },
  anh_chi_em: { frame: "from-violet-300 via-indigo-500 to-blue-800", ring: "border-violet-500/50 dark:border-violet-300/60", glow: "shadow-violet-500/15 dark:shadow-violet-400/25", accent: "text-violet-700 dark:text-violet-300", element: "⚡", titleKey: "childHealth.cardThemeSibling", rayHex: "#a78bfa" },
};
const DEFAULT_CARD_THEME: CardTheme = { frame: "from-zinc-300 via-zinc-500 to-zinc-700", ring: "border-zinc-500/50 dark:border-zinc-300/50", glow: "shadow-zinc-500/10 dark:shadow-zinc-400/20", accent: "text-zinc-600 dark:text-zinc-300", element: "✨", titleKey: "childHealth.cardThemeDefault", rayHex: "#a1a1aa" };
const cardThemeFor = (relation?: string): CardTheme => (relation && CARD_THEME_BY_RELATION[relation]) || DEFAULT_CARD_THEME;

export function ChildHealth({
  currentUser,
  users,
  vaccinations,
  growthRecords,
  healthProfiles,
  medications,
  medicationLogs,
  onSaveHealthProfile,
  onSaveVaccination,
  onDeleteVaccination,
  onSaveGrowth,
  onDeleteGrowth,
  onSaveMedication,
  onDeleteMedication,
  onLogDose,
  requestedSection,
  requestedSectionSeq
}: ChildHealthProps) {
  const { t } = useTranslation();

  // Ưu tiên hiển thị trẻ em trước; nếu không có thì cho chọn bất kỳ thành viên.
  const sortedMembers = useMemo(() => {
    return [...users].filter(u => !u.isDeleted).sort((a, b) => (a.familyRelation === "con" ? -1 : 0) - (b.familyRelation === "con" ? -1 : 0));
  }, [users]);

  // Sub-tab đang xem — Thẻ khẩn cấp đứng đầu (thông tin sống còn cần thấy ngay)
  const [section, setSection] = useState<HealthSection>("emergency");
  // Đáp ứng deep-link (vd: bấm thông báo thuốc mở thẳng mục Lịch thuốc).
  // seq = 0 nghĩa là chưa có yêu cầu thật — bỏ qua để giữ mặc định Thẻ khẩn cấp
  // khi mở tab (giá trị khởi tạo "growth" bên App không được ghi đè).
  useEffect(() => {
    if (requestedSectionSeq && requestedSection) setSection(requestedSection);
  }, [requestedSectionSeq]); // eslint-disable-line react-hooks/exhaustive-deps

  // Thành viên đang chọn ở FORM thêm mới (danh sách hiển thị tất cả thành viên)
  const [formMemberId, setFormMemberId] = useState<string>(sortedMembers[0]?.id || "");
  useEffect(() => {
    if (sortedMembers.length === 0) {
      if (formMemberId) setFormMemberId("");
      return;
    }
    if (!formMemberId || !sortedMembers.some(u => u.id === formMemberId)) {
      setFormMemberId(sortedMembers[0].id);
    }
  }, [sortedMembers, formMemberId]);

  // Vaccination form
  const [vName, setVName] = useState("");
  const [vDose, setVDose] = useState("");
  const [vScheduled, setVScheduled] = useState("");
  const [vNote, setVNote] = useState("");
  const [vError, setVError] = useState("");

  // Growth form
  const [gDate, setGDate] = useState(new Date().toISOString().slice(0, 10));
  const [gHeight, setGHeight] = useState("");
  const [gWeight, setGWeight] = useState("");
  const [gError, setGError] = useState("");

  // Thẻ khẩn cấp: hồ sơ đang sửa (userId) + các trường form
  const canEditEmergency = currentUser.role === UserRole.ADMIN || currentUser.role === UserRole.MEMBER;
  const [epEditingId, setEpEditingId] = useState<string | null>(null);
  const [epBlood, setEpBlood] = useState("");
  const [epAllergies, setEpAllergies] = useState("");
  const [epChronic, setEpChronic] = useState("");
  const [epMeds, setEpMeds] = useState("");
  const [epBhyt, setEpBhyt] = useState("");
  const [epHeight, setEpHeight] = useState("");
  const [epWeight, setEpWeight] = useState("");
  const [epNotes, setEpNotes] = useState("");
  const [epContacts, setEpContacts] = useState<EmergencyContact[]>([]);
  const [epError, setEpError] = useState("");
  const [epSaving, setEpSaving] = useState(false);

  const profileByUser = useMemo(() => {
    const map = new Map<string, EmergencyProfile>();
    healthProfiles.forEach(p => map.set(p.userId, p));
    return map;
  }, [healthProfiles]);

  const openEpEdit = (memberId: string) => {
    const p = profileByUser.get(memberId);
    setEpBlood(p?.bloodType || "");
    setEpAllergies(p?.allergies || "");
    setEpChronic(p?.chronicConditions || "");
    setEpMeds(p?.currentMedications || "");
    setEpBhyt(p?.healthInsuranceNumber || "");
    const m = latestMeasureFor(memberId);
    setEpHeight(m.height != null ? String(m.height) : "");
    setEpWeight(m.weight != null ? String(m.weight) : "");
    setEpNotes(p?.notes || "");
    setEpContacts(p?.emergencyContacts?.length ? p.emergencyContacts.map(c => ({ ...c })) : [{ name: "", phone: "", relation: "" }]);
    setEpError("");
    setEpEditingId(memberId);
  };

  const parseMeasure = (s: string): number | null => {
    const n = parseFloat(s.trim().replace(",", "."));
    return isNaN(n) || n <= 0 ? null : n;
  };

  const saveEp = async () => {
    if (!epEditingId) return;
    const h = epHeight.trim() ? parseMeasure(epHeight) : undefined;
    const w = epWeight.trim() ? parseMeasure(epWeight) : undefined;
    if (h === null || w === null) {
      setEpError(t("childHealth.errorMeasureInvalid"));
      return;
    }
    setEpSaving(true);
    setEpError("");
    try {
      // Số đo thay đổi → ghi thêm một dòng vào sổ Tăng trưởng (ngày hôm nay)
      const prev = latestMeasureFor(epEditingId);
      if ((h != null && h !== prev.height) || (w != null && w !== prev.weight)) {
        await onSaveGrowth({
          childId: epEditingId,
          date: new Date().toISOString().slice(0, 10),
          heightCm: h,
          weightKg: w
        });
      }
      await onSaveHealthProfile({
        userId: epEditingId,
        bloodType: epBlood || undefined,
        allergies: epAllergies,
        chronicConditions: epChronic,
        currentMedications: epMeds,
        healthInsuranceNumber: epBhyt,
        emergencyContacts: epContacts,
        notes: epNotes
      });
      setEpEditingId(null);
    } catch (err: any) {
      setEpError(err.message || t("childHealth.errorProfileSave"));
    } finally {
      setEpSaving(false);
    }
  };

  const vaccinesByChild = useMemo(() => {
    const map = new Map<string, VaccinationRecord[]>();
    for (const v of vaccinations) {
      const list = map.get(v.childId) ?? [];
      list.push(v);
      map.set(v.childId, list);
    }
    map.forEach(list => list.sort((a, b) => (a.scheduledDate || a.doneDate || "").localeCompare(b.scheduledDate || b.doneDate || "")));
    return map;
  }, [vaccinations]);

  const growthByChild = useMemo(() => {
    const map = new Map<string, GrowthRecord[]>();
    for (const g of growthRecords) {
      const list = map.get(g.childId) ?? [];
      list.push(g);
      map.set(g.childId, list);
    }
    map.forEach(list => list.sort((a, b) => a.date.localeCompare(b.date)));
    return map;
  }, [growthRecords]);

  // Số đo gần nhất của một thành viên — chiều cao và cân nặng tìm riêng
  const latestMeasureFor = (memberId: string): { height?: number; weight?: number; date?: string } => {
    const list = growthByChild.get(memberId) ?? [];
    let height: number | undefined, weight: number | undefined, date: string | undefined;
    for (let i = list.length - 1; i >= 0; i--) {
      if (height == null && list[i].heightCm != null) { height = list[i].heightCm; date = date || list[i].date; }
      if (weight == null && list[i].weightKg != null) { weight = list[i].weightKg; date = date || list[i].date; }
      if (height != null && weight != null) break;
    }
    return { height, weight, date };
  };

  // Xuất thẻ khẩn cấp ra PDF khổ A6 ngang (in gập bỏ ví). pdfmake lazy-load khi bấm.
  const [exportingCardId, setExportingCardId] = useState<string | null>(null);
  const exportCardPdf = async (member: User, p?: EmergencyProfile) => {
    if (exportingCardId) return;
    setExportingCardId(member.id);
    try {
      const measure = latestMeasureFor(member.id);
      const { exportEmergencyCardPdf } = await import("../utils/pdfExport.js");
      await exportEmergencyCardPdf({
        fullName: member.fullName,
        relationLabel: member.familyRelation ? FAMILY_RELATION_LABELS[member.familyRelation] : undefined,
        dateOfBirth: member.dateOfBirth,
        bloodType: p?.bloodType,
        heightCm: measure.height,
        weightKg: measure.weight,
        allergies: p?.allergies,
        chronicConditions: p?.chronicConditions,
        currentMedications: p?.currentMedications,
        healthInsuranceNumber: p?.healthInsuranceNumber,
        notes: p?.notes,
        contacts: p?.emergencyContacts?.filter(c => c.name || c.phone) || []
      });
    } catch (e) {
      console.error("export emergency card PDF failed:", e);
    } finally {
      setExportingCardId(null);
    }
  };

  // BMI từ bản ghi mới nhất có ĐỦ cả chiều cao & cân nặng của một thành viên.
  const bmiFor = (member: User, records: GrowthRecord[]): BmiAssessment | null => {
    const latest = [...records].reverse().find(g => g.heightCm != null && g.weightKg != null);
    if (!latest) return null;
    return assessBmi(latest.heightCm!, latest.weightKg!, member.dateOfBirth, member.gender);
  };

  const handleAddVaccine = async (e: React.FormEvent) => {
    e.preventDefault();
    setVError("");
    if (!formMemberId) { setVError(t("childHealth.errorNoMember")); return; }
    if (!vName.trim()) { setVError(t("childHealth.errorVaccineNoName")); return; }
    try {
      await onSaveVaccination({ childId: formMemberId, name: vName.trim(), doseLabel: vDose.trim() || undefined, scheduledDate: vScheduled || undefined, status: "scheduled", note: vNote.trim() || undefined });
      setVName(""); setVDose(""); setVScheduled(""); setVNote("");
    } catch (err: any) {
      setVError(err.message || t("childHealth.errorSaveFailed"));
    }
  };

  const toggleVaccineDone = async (v: VaccinationRecord) => {
    const done = v.status === "done";
    await onSaveVaccination({
      id: v.id, childId: v.childId, name: v.name, doseLabel: v.doseLabel, scheduledDate: v.scheduledDate,
      status: done ? "scheduled" : "done",
      doneDate: done ? undefined : new Date().toISOString().slice(0, 10),
      note: v.note
    });
  };

  const handleAddGrowth = async (e: React.FormEvent) => {
    e.preventDefault();
    setGError("");
    if (!formMemberId) { setGError(t("childHealth.errorNoMember")); return; }
    if (!gHeight && !gWeight) { setGError(t("childHealth.errorGrowthRequired")); return; }
    const height = parsePositiveMeasurement(gHeight);
    const weight = parsePositiveMeasurement(gWeight);
    if (height === undefined && weight === undefined) {
      setGError(t("childHealth.errorGrowthRequired"));
      return;
    }
    if (Number.isNaN(height) || Number.isNaN(weight)) {
      setGError(t("childHealth.errorGrowthPositive"));
      return;
    }
    try {
      await onSaveGrowth({ childId: formMemberId, date: gDate, heightCm: height, weightKg: weight });
      setGHeight(""); setGWeight("");
    } catch (err: any) {
      setGError(err.message || t("childHealth.errorSaveFailed"));
    }
  };

  const renderMemberSelect = (accent: string, spanClass: string) => (
    <div className={`space-y-1 ${spanClass}`}>
      <label className="text-slate-500 text-[10px] block">{t("childHealth.memberSelectLabel")}</label>
      <FancySelect
        value={formMemberId}
        onChange={setFormMemberId}
        ariaLabel={t("childHealth.memberSelectAria")}
        className={accent}
        options={sortedMembers.map(u => ({ value: u.id, label: u.fullName }))}
      />
    </div>
  );

  const renderMemberHeader = (member: User, right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar user={member} className="w-7 h-7 rounded-lg text-[11px]" extraClass="shrink-0" />
        <span className="text-xs font-bold text-slate-100 truncate">{member.fullName}</span>
      </div>
      {right}
    </div>
  );

  const subTabs: { id: HealthSection; label: string; icon: typeof Ruler; active: string }[] = [
    { id: "emergency", label: t("childHealth.tabEmergency"), icon: ShieldAlert, active: "bg-amber-500 text-slate-950" },
    { id: "growth", label: t("childHealth.tabGrowth"), icon: Ruler, active: "bg-emerald-500 text-slate-950" },
    { id: "vaccination", label: t("childHealth.tabVaccination"), icon: Syringe, active: "bg-sky-500 text-slate-950" },
    { id: "medication", label: t("childHealth.tabMedication"), icon: Pill, active: "bg-rose-500 text-slate-950" }
  ];

  return (
    <div className="space-y-6" id="child-health-module">
      {/* Tiêu đề + thanh sub-tab */}
      <Reveal className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-3 space-y-3">
        <ShimmerLine accent="pink" />
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2 px-1">
          <IconChip accent="pink"><HeartPulse className="w-4 h-4" /></IconChip> {t("childHealth.title")}
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-bold">
          {subTabs.map(tab => {
            const Icon = tab.icon;
            const isActive = section === tab.id;
            return (
              <Button
                key={tab.id}
                type="button"
                onClick={() => setSection(tab.id)}
                className={`px-2 py-2.5 rounded-xl flex items-center justify-center gap-1.5 cursor-pointer transition-all ${isActive ? tab.active : "text-slate-400 hover:text-slate-200 hover:bg-slate-800"}`}
              >
                <Icon className="w-4 h-4" /> <span className="truncate">{tab.label}</span>
              </Button>
            );
          })}
        </div>
      </Reveal>

      {/* ─── TĂNG TRƯỞNG ─────────────────────────────────────────────── */}
      {section === "growth" && (
        <div className="space-y-5">
          <Reveal delay={0.06} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-4">
            <ShimmerLine accent="emerald" />
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <IconChip accent="emerald"><Ruler className="w-4 h-4" /></IconChip> {t("childHealth.growthTitle")}
            </h4>
            <form onSubmit={handleAddGrowth} className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
              {renderMemberSelect("focus:border-emerald-500", "col-span-2 sm:col-span-4")}
              <div className="space-y-1 col-span-2 sm:col-span-1">
                <label className="text-slate-500 text-[10px] block">{t("childHealth.measureDateLabel")}</label>
                <DateInputDMY value={gDate} onChange={setGDate} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500 font-mono" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 text-[10px] block">{t("childHealth.heightLabel")}</label>
                <Input inputMode="decimal" value={gHeight} onChange={e => setGHeight(e.target.value)} placeholder={t("childHealth.heightPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
              </div>
              <div className="space-y-1">
                <label className="text-slate-500 text-[10px] block">{t("childHealth.weightLabel")}</label>
                <Input inputMode="decimal" value={gWeight} onChange={e => setGWeight(e.target.value)} placeholder={t("childHealth.weightPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-emerald-500" />
              </div>
              <Button type="submit" className="col-span-2 sm:col-span-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg px-3 py-2 font-bold flex items-center justify-center gap-1 cursor-pointer self-end"><Plus className="w-4 h-4" /> {t("childHealth.recordBtn")}</Button>
              {gError && <p className="col-span-2 sm:col-span-4 text-[11px] text-rose-400">{gError}</p>}
            </form>
          </Reveal>

          {sortedMembers.length === 0 ? (
            <p className="text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-4 text-center">{t("childHealth.noMembers")}</p>
          ) : sortedMembers.map((member, memberIndex) => {
            const records = growthByChild.get(member.id) ?? [];
            const bmi = bmiFor(member, records);
            return (
              <Reveal key={member.id} delay={0.12 + staggerDelay(memberIndex, 0.06, 5)} className="bg-slate-900 neu-raised rounded-2xl p-4 space-y-3">
                {renderMemberHeader(member, bmi ? (
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border shrink-0 ${bmiBadgeClass(bmi.color)}`}>
                    BMI {bmi.bmi.toFixed(1)} · {bmi.label}
                  </span>
                ) : undefined)}
                {records.length === 0 ? (
                  <p className="text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-lg px-3 py-2 text-center">{t("childHealth.noGrowthData")}</p>
                ) : (
                  <>
                    {bmi && (
                      <p className="text-[10px] text-slate-500">
                        {bmi.basis === "adult" && t("childHealth.bmiAdultNote") + " "}
                        {bmi.basis === "child" && t("childHealth.bmiChildNote", {
                          gender: member.gender ? (member.gender === "male" ? t("childHealth.genderMale") : t("childHealth.genderFemale")) : "",
                          age: (() => { const a = ageFromDob(member.dateOfBirth); return a != null ? t("childHealth.ageYears", { n: Math.floor(a) }) : ""; })()
                        }) + " "}
                        {bmi.note}
                      </p>
                    )}
                    {/* Số đo mới nhất */}
                    {(() => {
                      const heights = records.filter(g => g.heightCm != null);
                      const weights = records.filter(g => g.weightKg != null);
                      const lastH = heights[heights.length - 1];
                      const prevH = heights[heights.length - 2];
                      const lastW = weights[weights.length - 1];
                      const prevW = weights[weights.length - 2];
                      const fmt = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");
                      const deltaText = (cur?: number, prev?: number, unit = "") => {
                        if (cur == null || prev == null) return null;
                        const d = Math.round((cur - prev) * 10) / 10;
                        if (d === 0) return <span className="text-slate-500">· {t("childHealth.unchanged")}</span>;
                        return (
                          <span className="text-slate-400">
                            · {d > 0 ? "▲ +" : "▼ "}{fmt(d)} {unit}
                          </span>
                        );
                      };
                      return (
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-slate-950/60 neu-pressed-sm rounded-xl p-3.5">
                            <p className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">{t("childHealth.heightLabel")}</p>
                            <p className="mt-1.5 text-3xl md:text-4xl font-extrabold text-emerald-400 tabular-nums leading-none">
                              {lastH ? fmt(lastH.heightCm!) : "—"}
                              <span className="text-sm font-bold text-slate-400 ml-1.5">cm</span>
                            </p>
                            <p className="mt-2 text-[10px] text-slate-500 font-mono">
                              {lastH ? <>{t("childHealth.measuredOn", { date: formatDateVN(lastH.date) })} {deltaText(lastH.heightCm!, prevH?.heightCm ?? undefined, "cm")}</> : t("childHealth.noHeightData")}
                            </p>
                          </div>
                          <div className="bg-slate-950/60 neu-pressed-sm rounded-xl p-3.5">
                            <p className="text-[10px] text-sky-400 font-bold uppercase tracking-wider">{t("childHealth.weightLabel")}</p>
                            <p className="mt-1.5 text-3xl md:text-4xl font-extrabold text-sky-400 tabular-nums leading-none">
                              {lastW ? fmt(lastW.weightKg!) : "—"}
                              <span className="text-sm font-bold text-slate-400 ml-1.5">kg</span>
                            </p>
                            <p className="mt-2 text-[10px] text-slate-500 font-mono">
                              {lastW ? <>{t("childHealth.measuredOn", { date: formatDateVN(lastW.date) })} {deltaText(lastW.weightKg!, prevW?.weightKg ?? undefined, "kg")}</> : t("childHealth.noHeightData")}
                            </p>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-slate-950/60 neu-pressed-sm rounded-xl p-3">
                        <p className="text-[10px] text-emerald-400 font-bold uppercase mb-1">{t("childHealth.heightChartLabel")}</p>
                        <MiniChart data={records.filter(g => g.heightCm != null).map(g => ({ date: g.date, value: g.heightCm! }))} color="#10b981" unit="cm" noDataLabel={t("childHealth.noChartData")} />
                      </div>
                      <div className="bg-slate-950/60 neu-pressed-sm rounded-xl p-3">
                        <p className="text-[10px] text-sky-400 font-bold uppercase mb-1">{t("childHealth.weightChartLabel")}</p>
                        <MiniChart data={records.filter(g => g.weightKg != null).map(g => ({ date: g.date, value: g.weightKg! }))} color="#0ea5e9" unit="kg" noDataLabel={t("childHealth.noChartData")} />
                      </div>
                    </div>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                      {[...records].reverse().map(g => (
                        <div key={g.id} className="flex items-center justify-between text-xs bg-slate-950/40 neu-pressed-sm rounded-lg px-3 py-2">
                          <span className="font-mono text-slate-400">{formatDateVN(g.date)}</span>
                          <span className="text-slate-100 font-bold tabular-nums">
                            {g.heightCm != null ? `${g.heightCm} cm` : "—"} <span className="text-slate-500 font-normal">·</span> {g.weightKg != null ? `${g.weightKg} kg` : "—"}
                          </span>
                          <Button onClick={() => onDeleteGrowth(g.id)} className="text-slate-600 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></Button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ─── TIÊM CHỦNG ──────────────────────────────────────────────── */}
      {section === "vaccination" && (
        <div className="space-y-5">
          <Reveal delay={0.06} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-4">
            <ShimmerLine accent="sky" />
            <h4 className="text-sm font-bold text-slate-200 flex items-center gap-2">
              <IconChip accent="sky"><Syringe className="w-4 h-4" /></IconChip> {t("childHealth.vaccinationTitle")}
            </h4>
            <form onSubmit={handleAddVaccine} className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              {renderMemberSelect("focus:border-sky-500", "col-span-1 sm:col-span-2")}
              <Input list="vaccine-list" value={vName} onChange={e => setVName(e.target.value)} placeholder={t("childHealth.vaccineNamePlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-sky-500" />
              <datalist id="vaccine-list">{COMMON_VACCINES.map(v => <option key={v} value={v} />)}</datalist>
              <Input value={vDose} onChange={e => setVDose(e.target.value)} placeholder={t("childHealth.vaccineDosePlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-sky-500" />
              <div className="space-y-1">
                <label className="text-slate-500 text-[10px] block">{t("childHealth.vaccineDateLabel")}</label>
                <DateInputDMY value={vScheduled} onChange={setVScheduled} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-sky-500 font-mono" />
              </div>
              <Input value={vNote} onChange={e => setVNote(e.target.value)} placeholder={t("childHealth.vaccineNotePlaceholder")} className="bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-sky-500 self-end" />
              {vError && <p className="sm:col-span-2 text-[11px] text-rose-400">{vError}</p>}
              <Button type="submit" className="sm:col-span-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-lg px-3 py-2 font-bold flex items-center justify-center gap-1 cursor-pointer"><Plus className="w-4 h-4" /> {t("childHealth.addVaccineBtn")}</Button>
            </form>
          </Reveal>

          {sortedMembers.length === 0 ? (
            <p className="text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl p-4 text-center">{t("childHealth.noMembers")}</p>
          ) : sortedMembers.map((member, memberIndex) => {
            const list = vaccinesByChild.get(member.id) ?? [];
            return (
              <Reveal key={member.id} delay={0.12 + staggerDelay(memberIndex, 0.06, 5)} className="bg-slate-900 neu-raised rounded-2xl p-4 space-y-3">
                {renderMemberHeader(member, <span className="text-[10px] text-slate-500 font-mono shrink-0">{t("childHealth.vaccineDoseCount", { n: list.length })}</span>)}
                {list.length === 0 ? (
                  <p className="text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-lg px-3 py-2 text-center">{t("childHealth.noVaccines")}</p>
                ) : (
                  <div className="space-y-2">
                    <AnimatePresence>
                      {list.map(v => {
                        const dl = v.status === "scheduled" ? daysLeft(v.scheduledDate) : null;
                        return (
                          <motion.div key={v.id} layout initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="bg-slate-950/60 neu-pressed-sm rounded-xl p-3 flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-slate-100 truncate">{v.name} {v.doseLabel && <span className="text-slate-400 font-normal">• {v.doseLabel}</span>}</p>
                              <p className="text-[10px] text-slate-500 font-mono flex items-center gap-2 flex-wrap">
                                {v.status === "done" ? (
                                  <span className="text-emerald-400">{t("childHealth.vaccineDone", { date: formatDateVN(v.doneDate) || "" })}</span>
                                ) : (
                                  <>
                                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" /> {v.scheduledDate ? formatDateVN(v.scheduledDate) : t("childHealth.vaccineNotScheduled")}</span>
                                    {dl !== null && <span className={dl < 0 ? "text-rose-400" : dl <= 7 ? "text-amber-400" : "text-slate-500"}>{dl < 0 ? t("childHealth.vaccineOverdueDays", { n: -dl }) : t("childHealth.vaccineDaysLeft", { n: dl })}</span>}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <Button onClick={() => toggleVaccineDone(v)} className={`px-2 py-1 rounded-lg text-[10px] font-bold border cursor-pointer ${v.status === "done" ? "bg-emerald-500 text-slate-950 border-emerald-400" : "bg-slate-900 text-emerald-400 border-slate-700 hover:border-emerald-500/50"}`} title={t("childHealth.markVaccineDoneTitle")}>
                                <Check className="w-3 h-3" />
                              </Button>
                              <Button onClick={() => onDeleteVaccination(v.id)} className="p-1.5 text-slate-500 hover:text-rose-400 cursor-pointer"><Trash2 className="w-3.5 h-3.5" /></Button>
                            </div>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}
              </Reveal>
            );
          })}
        </div>
      )}

      {/* ─── LỊCH THUỐC ──────────────────────────────────────────────── */}
      {section === "medication" && (
        <Medication
          currentUser={currentUser}
          users={users}
          medications={medications}
          medicationLogs={medicationLogs}
          onSaveMedication={onSaveMedication}
          onDeleteMedication={onDeleteMedication}
          onLogDose={onLogDose}
        />
      )}

      {/* ─── THẺ KHẨN CẤP ────────────────────────────────────────────── */}
      {section === "emergency" && (
        <div className="space-y-4">
          <p className="text-[11px] text-slate-500 px-1">{t("childHealth.emergencyIntro")}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6 justify-items-center sm:justify-items-stretch">
            {users.filter(u => !u.isDeleted).map((member, mi) => {
              const p = profileByUser.get(member.id);
              const isEditing = epEditingId === member.id;
              const relationLabel = member.familyRelation ? FAMILY_RELATION_LABELS[member.familyRelation] : "";
              const theme = cardThemeFor(member.familyRelation);

              // ─── NHÁNH XEM: thẻ bài sưu tầm ───
              if (!isEditing) {
                const measure = latestMeasureFor(member.id);
                const abilities: { label: string; value: string; icon: typeof Droplet; tone: string }[] = [];
                if (p?.allergies) abilities.push({ label: t("childHealth.allergyLabel"), value: p.allergies, icon: AlertTriangle, tone: "text-rose-600 dark:text-rose-300" });
                if (p?.chronicConditions) abilities.push({ label: t("childHealth.chronicLabel"), value: p.chronicConditions, icon: HeartPulse, tone: "text-orange-600 dark:text-orange-300" });
                if (p?.currentMedications) abilities.push({ label: t("childHealth.medicationLabel"), value: p.currentMedications, icon: Pill, tone: "text-cyan-600 dark:text-cyan-300" });
                if (p?.healthInsuranceNumber) abilities.push({ label: t("childHealth.bhytLabel"), value: p.healthInsuranceNumber, icon: Stethoscope, tone: "text-emerald-600 dark:text-emerald-300" });

                return (
                  <Reveal key={member.id} delay={0.05 + staggerDelay(mi)} className="w-full max-w-[340px] sm:max-w-none">
                    <div className="relative h-full bg-slate-900 neu-raised rounded-2xl overflow-hidden flex flex-col">
                      <div aria-hidden className={`h-1 bg-gradient-to-r ${theme.frame}`} />

                      <div className="p-4 flex flex-col gap-3 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className={`shrink-0 rounded-full p-[2px] bg-gradient-to-br ${theme.frame}`}>
                              <Avatar user={member} className="w-12 h-12 rounded-full text-lg" extraClass="ring-2 ring-slate-900" />
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-slate-100 truncate">{member.fullName}</p>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold ${theme.accent}`}>
                                <span>{theme.element}</span> {t(theme.titleKey)}{relationLabel ? ` · ${relationLabel}` : ""}
                              </span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-1.5">
                            {p && (
                              <Button
                                type="button"
                                onClick={() => exportCardPdf(member, p)}
                                disabled={exportingCardId !== null}
                                title={t("childHealth.exportPdfTitle")}
                                aria-label={t("childHealth.exportPdfAria")}
                                className="p-1.5 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-indigo-400 cursor-pointer disabled:opacity-60"
                              >
                                {exportingCardId === member.id
                                  ? <span className="block w-3.5 h-3.5 border-2 border-slate-700 border-t-indigo-400 rounded-full animate-spin" />
                                  : <FileDown className="w-3.5 h-3.5" />}
                              </Button>
                            )}
                            {canEditEmergency && (
                              <Button type="button" onClick={() => openEpEdit(member.id)} title={t("childHealth.editCardTitle")} aria-label={t("childHealth.editCardTitle")} className="p-1.5 rounded-lg bg-slate-950 neu-btn text-slate-500 hover:text-amber-500 dark:hover:text-amber-400 cursor-pointer">
                                <Pencil className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-amber-700 dark:text-amber-300">{t("childHealth.emergencyBadge")}</span>
                        </div>

                        {!p ? (
                          <div className="flex-1 flex items-center justify-center py-6">
                            <p className="text-[11px] text-slate-500 border border-dashed border-slate-800 rounded-xl px-4 py-5 text-center">
                              {t("childHealth.cardNotActivated")}{canEditEmergency ? t("childHealth.cardNotActivatedEdit") : ""}
                            </p>
                          </div>
                        ) : (
                          <>
                            <div className="grid grid-cols-2 gap-2">
                              <div className="rounded-xl bg-slate-950 neu-pressed-sm px-3 py-2 flex flex-col gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                  <Droplet className="w-3 h-3 text-red-600 dark:text-red-400 fill-red-600 dark:fill-red-400" /> {t("childHealth.bloodTypeLabel")}
                                </span>
                                <span className="text-2xl font-black leading-none text-red-600 dark:text-red-400">{p.bloodType || "?"}</span>
                              </div>
                              <div className="rounded-xl bg-slate-950 neu-pressed-sm px-3 py-2 flex flex-col gap-1">
                                <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                  <Cake className="w-3 h-3 text-pink-500 dark:text-pink-400" /> {t("childHealth.dobLabel")}
                                </span>
                                {member.dateOfBirth ? (
                                  <span className="text-[11px] font-bold text-slate-200 leading-tight">
                                    {formatDateVN(member.dateOfBirth)}
                                    {formatAgeVi(member.dateOfBirth) && (
                                      <span className="block text-[10px] font-medium text-pink-600 dark:text-pink-300">{formatAgeVi(member.dateOfBirth)}</span>
                                    )}
                                  </span>
                                ) : (
                                  <span className="text-[11px] text-slate-500">—</span>
                                )}
                              </div>
                            </div>

                            {(measure.height != null || measure.weight != null) && (() => {
                              const bmi = (measure.height != null && measure.weight != null)
                                ? assessBmi(measure.height, measure.weight, member.dateOfBirth, member.gender)
                                : null;
                              const bmiColor = bmi?.color === "emerald"
                                ? "text-emerald-400"
                                : bmi?.color === "amber" ? "text-amber-400" : "text-rose-400";
                              return (
                                <div className="grid grid-cols-3 gap-2">
                                  <div className="rounded-xl bg-slate-950 neu-pressed-sm px-2.5 py-2 flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500 flex items-center gap-1">
                                      <Ruler className="w-3 h-3 text-sky-500 dark:text-sky-400" /> cm
                                    </span>
                                    <span className="text-[13px] font-black text-slate-200 font-mono leading-tight">
                                      {measure.height != null ? measure.height : "—"}
                                    </span>
                                  </div>
                                  <div className="rounded-xl bg-slate-950 neu-pressed-sm px-2.5 py-2 flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">kg</span>
                                    <span className="text-[13px] font-black text-slate-200 font-mono leading-tight">
                                      {measure.weight != null ? measure.weight : "—"}
                                    </span>
                                  </div>
                                  <div className="rounded-xl bg-slate-950 neu-pressed-sm px-2.5 py-2 flex flex-col gap-0.5">
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">BMI</span>
                                    {bmi ? (
                                      <>
                                        <span className={`text-[13px] font-black font-mono leading-tight ${bmiColor}`}>
                                          {bmi.bmi.toFixed(1)}
                                        </span>
                                        <span className={`text-[9px] font-semibold leading-tight ${bmiColor}`}>
                                          {bmi.label}
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-[13px] font-black text-slate-600 font-mono leading-tight">—</span>
                                    )}
                                  </div>
                                </div>
                              );
                            })()}

                            <div className="rounded-xl bg-slate-950 neu-pressed-sm divide-y divide-slate-850/60 flex-1">
                              {abilities.length === 0 ? (
                                <p className="text-[11px] text-slate-500 px-3 py-2.5 text-center italic">{t("childHealth.noMedicalInfo")}</p>
                              ) : abilities.map((a, i) => {
                                const Icon = a.icon;
                                return (
                                  <div key={i} className="flex items-start gap-2.5 px-3 py-2">
                                    <Icon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${a.tone}`} />
                                    <div className="min-w-0">
                                      <span className="text-[9px] font-bold uppercase tracking-wide text-slate-500">{a.label}</span>
                                      <p className="text-[11px] text-slate-200 leading-snug">{a.value}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>

                            {p.emergencyContacts?.length > 0 && (
                              <div className="rounded-xl bg-slate-950 neu-pressed-sm px-3 py-2 space-y-1.5">
                                <p className="text-[9px] text-slate-500 font-bold uppercase tracking-widest flex items-center gap-1"><Phone className="w-3 h-3 text-emerald-600 dark:text-emerald-400" /> {t("childHealth.emergencyContactsLabel")}</p>
                                {p.emergencyContacts.map((c, i) => (
                                  <a key={i} href={`tel:${c.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 text-[11px] text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-300 transition-colors">
                                    <span className="font-semibold truncate">{c.name}</span>
                                    {c.relation && <span className="text-slate-500 shrink-0">({c.relation})</span>}
                                    <span className="font-mono text-emerald-600 dark:text-emerald-400 ml-auto shrink-0">{c.phone}</span>
                                  </a>
                                ))}
                              </div>
                            )}

                            {p.notes && (
                              <p className="text-[10px] text-slate-500 italic leading-relaxed px-1">"{p.notes}"</p>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </Reveal>
                );
              }

              // ─── NHÁNH SỬA: form chức năng ───
              return (
                <Reveal key={member.id} delay={0.05 + staggerDelay(mi)} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-3.5 sm:p-4 space-y-3 w-full max-w-[330px] sm:max-w-none">
                  <ShimmerLine accent="amber" />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar user={member} className="w-9 h-9 rounded-xl text-sm" extraClass="shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-200 truncate">{member.fullName}</p>
                        {relationLabel && <p className="text-[10px] text-slate-500">{relationLabel}</p>}
                      </div>
                    </div>
                    <Button type="button" onClick={() => setEpEditingId(null)} title={t("childHealth.cancelBtn")} className="shrink-0 p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 cursor-pointer transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-2 text-xs">
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-slate-500 text-[10px] block">{t("childHealth.bloodTypeLabel")}</label>
                          <FancySelect
                            value={epBlood}
                            onChange={setEpBlood}
                            ariaLabel={t("childHealth.bloodTypeLabel")}
                            placeholder={t("childHealth.formBloodTypeUnknown")}
                            options={[{ value: "", label: t("childHealth.formBloodTypeUnknown") }, ...BLOOD_TYPE_OPTIONS.map(b => ({ value: b, label: b }))]}
                          />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-500 text-[10px] block">{t("childHealth.bhytLabel")}</label>
                          <Input value={epBhyt} onChange={e => setEpBhyt(e.target.value)} placeholder={t("childHealth.formBhytPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500 font-mono" />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1">
                          <label className="text-slate-500 text-[10px] block">{t("childHealth.heightLabel")} (cm)</label>
                          <Input value={epHeight} onChange={e => setEpHeight(e.target.value)} placeholder="112" inputMode="decimal" className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500 font-mono" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-slate-500 text-[10px] block">{t("childHealth.weightLabel")} (kg)</label>
                          <Input value={epWeight} onChange={e => setEpWeight(e.target.value)} placeholder="18,5" inputMode="decimal" className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500 font-mono" />
                        </div>
                        <p className="col-span-2 text-[9px] text-slate-600 -mt-0.5">{t("childHealth.formMeasureNote")}</p>
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] block">{t("childHealth.formAllergyLabel")}</label>
                        <Input value={epAllergies} onChange={e => setEpAllergies(e.target.value)} placeholder={t("childHealth.formAllergyPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] block">{t("childHealth.formChronicLabel")}</label>
                        <Input value={epChronic} onChange={e => setEpChronic(e.target.value)} placeholder={t("childHealth.formChronicPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
                      </div>
                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] block">{t("childHealth.formMedsLabel")}</label>
                        <Input value={epMeds} onChange={e => setEpMeds(e.target.value)} placeholder={t("childHealth.formMedsPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500" />
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-slate-500 text-[10px] block">{t("childHealth.formContactsLabel")}</label>
                        {epContacts.map((c, i) => (
                          <div key={i} className="flex flex-wrap gap-1.5">
                            <Input value={c.name} onChange={e => setEpContacts(prev => prev.map((x, xi) => xi === i ? { ...x, name: e.target.value } : x))} placeholder={t("childHealth.formContactNamePlaceholder")} className="basis-full sm:basis-0 sm:flex-1 min-w-0 bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-amber-500" />
                            <Input value={c.phone} onChange={e => setEpContacts(prev => prev.map((x, xi) => xi === i ? { ...x, phone: e.target.value } : x))} placeholder={t("childHealth.formContactPhonePlaceholder")} inputMode="tel" className="flex-1 min-w-0 sm:flex-none sm:w-28 bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-amber-500 font-mono" />
                            <Input value={c.relation || ""} onChange={e => setEpContacts(prev => prev.map((x, xi) => xi === i ? { ...x, relation: e.target.value } : x))} placeholder={t("childHealth.formContactRelationPlaceholder")} className="w-24 sm:w-20 bg-slate-950 neu-pressed-sm rounded-lg px-2.5 py-2 text-slate-200 outline-none focus:border-amber-500" />
                            <Button type="button" onClick={() => setEpContacts(prev => prev.filter((_, xi) => xi !== i))} title={t("childHealth.removeContactTitle")} className="p-2 rounded-lg bg-slate-800 hover:bg-rose-500/20 text-slate-500 hover:text-rose-400 cursor-pointer shrink-0">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        ))}
                        {epContacts.length < 5 && (
                          <Button type="button" onClick={() => setEpContacts(prev => [...prev, { name: "", phone: "", relation: "" }])} className="text-[11px] font-bold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer">
                            <Plus className="w-3 h-3" /> {t("childHealth.addContactBtn")}
                          </Button>
                        )}
                      </div>

                      <div className="space-y-1">
                        <label className="text-slate-500 text-[10px] block">{t("childHealth.formNotesLabel")}</label>
                        <Textarea value={epNotes} onChange={e => setEpNotes(e.target.value)} rows={2} placeholder={t("childHealth.formNotesPlaceholder")} className="w-full bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-amber-500 resize-none" />
                      </div>

                      {epError && <p className="text-[11px] text-rose-400">{epError}</p>}
                      <Button type="button" disabled={epSaving} onClick={saveEp} className="w-full bg-amber-500 hover:bg-amber-400 disabled:opacity-60 text-slate-950 rounded-lg px-3 py-2 font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                        <Check className="w-4 h-4" /> {epSaving ? t("childHealth.savingBtn") : t("childHealth.saveBtn")}
                      </Button>
                  </div>
                </Reveal>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
