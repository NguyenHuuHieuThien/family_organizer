/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState, useRef } from "react";
import { Pill, Plus, Trash2, Clock, X, Check, Ban } from "lucide-react";
import { MedicationReminder, MedicationLog, User, canManageMedication } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { DateInputDMY, TimeSelect24 } from "./DateTimePicker24.js";
import { useTabFab } from "./FabHost.js";
import { ShimmerLine, Reveal, IconChip } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";

interface MedicationProps {
  currentUser: User;
  users: User[];
  medications: MedicationReminder[];
  medicationLogs: MedicationLog[];
  onSaveMedication: (medication: Partial<MedicationReminder>) => Promise<any>;
  onDeleteMedication: (id: string) => Promise<any>;
  onLogDose: (medicationId: string, date: string, time: string, status: "taken" | "skipped" | "none") => Promise<any>;
}

// Ngày hôm nay theo giờ địa phương dạng YYYY-MM-DD (khớp định dạng MedicationLog.date).
function localToday(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function Medication({
  currentUser,
  users,
  medications,
  medicationLogs,
  onSaveMedication,
  onDeleteMedication,
  onLogDose
}: MedicationProps) {
  const [name, setName] = useState("");
  const [dosage, setDosage] = useState("");
  const [patientId, setPatientId] = useState(currentUser.id);
  const [times, setTimes] = useState<string[]>(["08:00", "20:00"]);
  const [timeDraft, setTimeDraft] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Ô nhập tên thuốc — nút nổi cuộn lên đây và focus để thêm nhanh
  const nameInputRef = useRef<HTMLInputElement>(null);
  const focusAddMed = () => {
    nameInputRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    nameInputRef.current?.focus();
  };

  // Nút nổi thêm nhanh — cuộn tới ô thêm lịch thuốc và focus (chỉ người có quyền)
  useTabFab(
    canManageMedication(currentUser.role)
      ? { id: "medications", color: "rose", title: "Thêm lịch nhắc thuốc", icon: Pill, onClick: focusAddMed }
      : null
  );

  const sorted = useMemo(
    () => [...medications].sort((a, b) => a.name.localeCompare(b.name)),
    [medications]
  );

  const canManage = canManageMedication(currentUser.role);
  const today = localToday();
  const [doseSaving, setDoseSaving] = useState<string | null>(null);

  // Tra cứu nhanh trạng thái liều theo (medId|time) cho ngày hôm nay.
  const todayLogMap = useMemo(() => {
    const map = new Map<string, MedicationLog["status"]>();
    for (const log of medicationLogs) {
      if (log.date === today) map.set(`${log.medicationId}|${log.time}`, log.status);
    }
    return map;
  }, [medicationLogs, today]);

  // Lịch thuốc có hiệu lực hôm nay (đang bật + trong khoảng ngày bắt đầu/kết thúc).
  const isActiveToday = (med: MedicationReminder) =>
    med.isActive &&
    (!med.startDate || med.startDate <= today) &&
    (!med.endDate || med.endDate >= today);

  // Đếm tiến độ liều hôm nay để hiện ở đầu trang.
  const todayProgress = useMemo(() => {
    let total = 0;
    let taken = 0;
    for (const med of medications) {
      if (!isActiveToday(med)) continue;
      for (const time of med.times) {
        total++;
        if (todayLogMap.get(`${med.id}|${time}`) === "taken") taken++;
      }
    }
    return { total, taken };
  }, [medications, todayLogMap, today]);

  // Bấm "Đã uống"/"Bỏ qua": nếu trạng thái đang là chính nó thì bỏ đánh dấu (none).
  const handleDoseClick = async (med: MedicationReminder, time: string, target: "taken" | "skipped") => {
    const key = `${med.id}|${time}`;
    const current = todayLogMap.get(key);
    const next = current === target ? "none" : target;
    setDoseSaving(key);
    try {
      await onLogDose(med.id, today, time, next);
    } catch (e) {
      console.error("Không ghi nhận được liều thuốc", e);
    } finally {
      setDoseSaving(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!name.trim()) {
      setError("Nhập tên thuốc cần nhắc.");
      return;
    }
    const parsedTimes = times.filter(Boolean);
    if (parsedTimes.length === 0) {
      setError("Thêm ít nhất một giờ uống, ví dụ 08:00.");
      return;
    }

    setSaving(true);
    try {
      await onSaveMedication({
        name: name.trim(),
        dosage: dosage.trim(),
        patientId,
        times: parsedTimes,
        startDate,
        endDate: endDate || undefined,
        notes: notes.trim(),
        isActive: true
      });
      setName("");
      setDosage("");
      setNotes("");
    } catch (err: any) {
      setError(err.message || "Không lưu được lịch thuốc");
    } finally {
      setSaving(false);
    }
  };

  const addTime = () => {
    if (!timeDraft) return;
    if (!times.includes(timeDraft)) {
      setTimes([...times, timeDraft].sort());
    }
    setTimeDraft("");
  };

  const removeTime = (idx: number) => {
    setTimes(times.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-6" id="medication-module">
      <Reveal delay={0.06} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-4">
        <ShimmerLine accent="rose" />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <IconChip accent="rose"><Pill className="w-4 h-4" /></IconChip> Nhắc thuốc gia đình
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {canManage && todayProgress.total > 0 && (
              <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${todayProgress.taken >= todayProgress.total ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-rose-500/10 text-rose-400 border-rose-500/20"}`}>
                Hôm nay: {todayProgress.taken}/{todayProgress.total} liều
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-mono">{sorted.length} lịch</span>
          </div>
        </div>

        {canManageMedication(currentUser.role) && (
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
            <input ref={nameInputRef} value={name} onChange={(e) => setName(e.target.value)} placeholder="Tên thuốc" className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-rose-500" />
            <input value={dosage} onChange={(e) => setDosage(e.target.value)} placeholder="Liều dùng" className="md:col-span-2 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-rose-500" />
            <div className="md:col-span-2">
              <FancySelect
                value={patientId}
                onChange={setPatientId}
                ariaLabel="Người uống thuốc"
                options={users.map(u => ({ value: u.id, label: u.fullName }))}
              />
            </div>

            {/* Giờ uống - chip pickers */}
            <div className="md:col-span-6 bg-slate-950/40 neu-pressed-sm rounded-xl p-3 space-y-2">
              <label className="text-slate-400 font-semibold flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-rose-400" /> Giờ uống thuốc trong ngày</label>
              <div className="flex flex-wrap items-center gap-2">
                {times.map((t, i) => (
                  <span key={`${t}-${i}`} className="flex items-center gap-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg pl-2.5 pr-1 py-1 font-mono text-[11px]">
                    {t}
                    <button type="button" onClick={() => removeTime(i)} className="hover:text-rose-200 cursor-pointer" title="Xóa giờ này">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
                <TimeSelect24 value={timeDraft} onChange={setTimeDraft} />
                <button type="button" onClick={addTime} className="bg-slate-800 hover:bg-slate-700 text-rose-400 rounded-lg px-2.5 py-1 text-[11px] font-bold flex items-center gap-1 cursor-pointer">
                  <Plus className="w-3 h-3" /> Thêm giờ
                </button>
              </div>
            </div>

            <div className="md:col-span-3 space-y-1">
              <label className="text-slate-500 text-[10px] block">Ngày bắt đầu</label>
              <DateInputDMY value={startDate} onChange={setStartDate} className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-rose-500 font-mono" />
            </div>
            <div className="md:col-span-3 space-y-1">
              <label className="text-slate-500 text-[10px] block">Ngày kết thúc (tùy chọn)</label>
              <DateInputDMY value={endDate} onChange={setEndDate} className="w-full bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-rose-500 font-mono" />
            </div>

            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ghi chú, sau ăn..." className="md:col-span-4 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2.5 text-slate-200 outline-none focus:border-rose-500" />
            <button disabled={saving} type="submit" className="md:col-span-2 bg-rose-500 hover:bg-rose-400 disabled:opacity-60 text-slate-950 rounded-xl px-3 py-2.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" /> Thêm lịch thuốc
            </button>
          </form>
        )}
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </Reveal>

      {sorted.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center">
          <p className="text-sm text-slate-500">Chưa có lịch nhắc thuốc nào.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6">
          <AnimatePresence>
            {sorted.map(med => {
              const patient = users.find(u => u.id === med.patientId);
              return (
                <motion.div
                  key={med.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  whileHover={{ y: -3 }}
                  className="bg-slate-900 neu-raised hover:border-rose-500/30 rounded-2xl p-4 shadow-xl hover:shadow-rose-500/10 transition-[box-shadow,border-color] duration-300 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h4 className="text-sm font-bold text-slate-100">{med.name}</h4>
                      <p className="text-xs text-slate-500">{med.dosage || "Chưa ghi liều"} • {patient?.fullName || "Thành viên"}</p>
                    </div>
                    {canManageMedication(currentUser.role) && (
                      <button onClick={() => onDeleteMedication(med.id)} className="p-1.5 text-slate-500 hover:text-rose-400 bg-slate-950 neu-btn rounded-lg">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {med.times.map(time => (
                      <span key={time} className="text-[10px] px-2 py-1 rounded-lg bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono flex items-center gap-1">
                        <Clock className="w-3 h-3" /> {time}
                      </span>
                    ))}
                  </div>

                  {/* Nhật ký liều hôm nay — chỉ hiện cho người quản lý & khi lịch còn hiệu lực */}
                  {canManage && isActiveToday(med) && med.times.length > 0 && (
                    <div className="bg-slate-950/40 neu-pressed-sm rounded-xl p-2.5 space-y-2">
                      <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">Hôm nay</p>
                      <div className="space-y-1.5">
                        {med.times.map(time => {
                          const key = `${med.id}|${time}`;
                          const status = todayLogMap.get(key);
                          const busy = doseSaving === key;
                          return (
                            <div key={time} className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-mono text-slate-300 flex items-center gap-1">
                                <Clock className="w-3 h-3 text-slate-500" /> {time}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDoseClick(med, time, "taken")}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 cursor-pointer ${status === "taken" ? "bg-emerald-500 text-slate-950 border-emerald-400" : "bg-slate-900 text-emerald-400 border-slate-700 hover:border-emerald-500/50"}`}
                                  title="Đã uống"
                                >
                                  <Check className="w-3 h-3" /> Đã uống
                                </button>
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => handleDoseClick(med, time, "skipped")}
                                  className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold border transition-colors disabled:opacity-50 cursor-pointer ${status === "skipped" ? "bg-amber-500 text-slate-950 border-amber-400" : "bg-slate-900 text-amber-400 border-slate-700 hover:border-amber-500/50"}`}
                                  title="Bỏ qua liều này"
                                >
                                  <Ban className="w-3 h-3" /> Bỏ qua
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-[11px] text-slate-500 leading-relaxed">{med.notes || "Không có ghi chú thêm."}</p>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

    </div>
  );
}
