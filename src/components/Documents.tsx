/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input } from "./ui";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { FileText, Plus, Trash2, Pencil, X, Calendar, User as UserIcon, Paperclip, ExternalLink, ShieldAlert, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { FamilyDocument, DocumentFile, DocumentType, DOCUMENT_TYPE_LABELS, User, UserRole } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { optimizeAndUpload, uploadDataUrlDetailed } from "../utils/uploadImage.js";
import { useTabFab } from "./FabHost.js";
import { useConfirm } from "./ConfirmDialog.js";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { ShimmerLine, Reveal, IconChip } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";
import { formatDateVN } from "./DateTimePicker24.js";
import { useTranslation } from "react-i18next";
import { currentLocalDate } from "../utils/dateTime.js";

interface DocumentsProps {
  currentUser: User;
  users: User[];
  documents: FamilyDocument[];
  onSaveDocument: (doc: Partial<FamilyDocument>) => Promise<any>;
  onDeleteDocument: (id: string) => Promise<any>;
}

const MAX_DOC_FILES = 6;
const DOC_TYPE_ORDER: DocumentType[] = [
  "cccd", "passport", "driver_license", "vehicle_registration", "vehicle_inspection",
  "insurance", "health_insurance", "warranty", "contract", "certificate", "other"
];

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("family_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Số ngày còn lại đến hạn (âm = đã quá hạn), theo giờ địa phương.
function daysUntil(dateStr?: string): number | null {
  if (!dateStr) return null;
  const p = String(dateStr).split("-");
  if (p.length < 3) return null;
  const y = Number(p[0]), m = Number(p[1]), d = Number(p[2]);
  if (!y || !m || !d) return null;
  const target = new Date(y, m - 1, d);
  const t = new Date();
  const todayMid = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((target.getTime() - todayMid.getTime()) / 86400000);
}

export function Documents({ currentUser, users, documents, onSaveDocument, onDeleteDocument }: DocumentsProps) {
  const { t } = useTranslation();
  const [type, setType] = useState<DocumentType>("cccd");
  const [title, setTitle] = useState("");
  const [titleManual, setTitleManual] = useState(false); // người dùng đã tự sửa tên?
  const [ownerId, setOwnerId] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [issuer, setIssuer] = useState("");
  const [issueDate, setIssueDate] = useState(currentLocalDate());
  const [expiryDate, setExpiryDate] = useState(currentLocalDate());
  const [notes, setNotes] = useState("");
  const [isShared, setIsShared] = useState(false);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [savePickedToDrive, setSavePickedToDrive] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  // updatedAt của bản giấy tờ lúc mở form sửa — server so để phát hiện sửa đè nhau (409)
  const [editingBaseUpdatedAt, setEditingBaseUpdatedAt] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSummary, setAiSummary] = useState("");
  const [aiConfidence, setAiConfidence] = useState<number | null>(null);
  const [aiMissingFields, setAiMissingFields] = useState<string[]>([]);
  const [filterType, setFilterType] = useState<string>("all");
  // Trình xem ảnh (lightbox): ảnh của một giấy tờ + vị trí đang xem.
  const [viewer, setViewer] = useState<{ files: DocumentFile[]; index: number; title: string } | null>(null);

  const formRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const closeViewer = () => setViewer(null);
  const viewerPrev = () => setViewer(v => v ? { ...v, index: (v.index - 1 + v.files.length) % v.files.length } : v);
  const viewerNext = () => setViewer(v => v ? { ...v, index: (v.index + 1) % v.files.length } : v);
  useModalA11y(!!viewer, closeViewer, viewerRef);

  useEffect(() => {
    fetch("/api/settings/google-drive/status", { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(d => setDriveConnected(Boolean(d?.connected)))
      .catch(() => setDriveConnected(false));
  }, []);

  useEffect(() => {
    if (!driveConnected) setSavePickedToDrive(false);
  }, [driveConnected]);

  // Mũi tên trái/phải để chuyển ảnh trong lightbox.
  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") viewerPrev();
      else if (e.key === "ArrowRight") viewerNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  const canManageDocument = (doc: FamilyDocument) =>
    doc.creatorId === currentUser.id ||
    doc.ownerId === currentUser.id ||
    (doc.isShared && currentUser.role === UserRole.ADMIN);

  useTabFab({ id: "documents", color: "emerald", title: t("documents.fabAdd"), icon: FileText, onClick: () => {
    resetForm();
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }});

  // Tự tạo tên giấy tờ từ loại + chủ sở hữu — dùng labels gốc (tiếng Việt) vì tên này
  // được lưu vào DB và cần nhất quán bất kể ngôn ngữ hiển thị hiện tại.
  const autoTitle = (docType: DocumentType, oId: string) => {
    const label = DOCUMENT_TYPE_LABELS[docType];
    const owner = users.find(u => u.id === oId);
    return owner ? `${label} của ${owner.fullName}` : label;
  };

  const applyAiResult = (data: any, fallbackName: string) => {
    const nextType = DOC_TYPE_ORDER.includes(data?.documentType) ? data.documentType as DocumentType : "other";
    setType(nextType);
    setTitle(data?.title?.trim() || fallbackName || DOCUMENT_TYPE_LABELS[nextType]);
    setTitleManual(true);
    if (data?.ownerName) {
      const matchedOwner = users.find(u => u.fullName.toLowerCase() === String(data.ownerName).trim().toLowerCase());
      if (matchedOwner) setOwnerId(matchedOwner.id);
    }
    setDocumentNumber(data?.documentNumber?.trim() || "");
    setIssuer(data?.issuer?.trim() || "");
    setIssueDate(/^\d{4}-\d{2}-\d{2}$/.test(data?.issueDate || "") ? data.issueDate : "");
    setExpiryDate(/^\d{4}-\d{2}-\d{2}$/.test(data?.expiryDate || "") ? data.expiryDate : "");
    setNotes(data?.notes?.trim() || "");
    setAiConfidence(typeof data?.confidence === "number" ? data.confidence : null);
    setAiMissingFields(Array.isArray(data?.missingFields) ? data.missingFields : []);
    setAiSummary("AI đã phân tích xong. Kiểm tra nhanh thông tin bên dưới rồi bấm lưu.");
  };

  const analyzeDocumentFile = async (dataUrl: string, fileName: string) => {
    setAnalyzing(true);
    setAiSummary("");
    try {
      const res = await fetch("/api/documents/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ dataUrl, fileName })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "AI chưa đọc được giấy tờ.");
      applyAiResult(data, fileName.replace(/\.[^.]+$/, ""));
    } catch (err: any) {
      setAiSummary(err.message || "AI chưa đọc được giấy tờ. App vẫn có thể lưu tệp với tên tạm.");
      if (!title.trim()) {
        setType("other");
        setTitle(fileName.replace(/\.[^.]+$/, "") || "Giấy tờ mới");
        setTitleManual(true);
      }
    } finally {
      setAnalyzing(false);
    }
  };

  // Khi đổi loại/chủ sở hữu mà người dùng chưa tự gõ tên thì cập nhật tên gợi ý.
  useEffect(() => {
    if (!titleManual) setTitle(autoTitle(type, ownerId));
  }, [type, ownerId, titleManual, users]);

  const resetForm = () => {
    setType("cccd"); setTitle(""); setTitleManual(false); setOwnerId(""); setDocumentNumber("");
    setIssuer(""); setIssueDate(currentLocalDate()); setExpiryDate(currentLocalDate()); setNotes("");
    setIsShared(false); setFiles([]); setEditingId(null); setEditingBaseUpdatedAt(""); setError(""); setAiSummary("");
    setAiConfidence(null); setAiMissingFields([]);
  };

  const startEdit = (doc: FamilyDocument) => {
    setType(doc.type);
    setTitle(doc.title);
    // Nếu tên trùng tên tự sinh thì vẫn cho cập nhật theo loại/chủ sở hữu; ngược lại giữ nguyên.
    setTitleManual(doc.title !== autoTitle(doc.type, doc.ownerId || ""));
    setOwnerId(doc.ownerId || "");
    setDocumentNumber(doc.documentNumber || "");
    setIssuer(doc.issuer || "");
    setIssueDate(doc.issueDate || currentLocalDate());
    setExpiryDate(doc.expiryDate || currentLocalDate());
    setNotes(doc.notes || "");
    setIsShared(doc.isShared);
    setFiles(doc.files || []);
    setEditingId(doc.id);
    setEditingBaseUpdatedAt(doc.updatedAt || ""); // chống 2 người cùng sửa đè nhau (409)
    setError("");
    setAiSummary("Đang sửa giấy tờ đã lưu. Thêm ảnh/PDF mới nếu muốn AI đọc lại.");
    setAiConfidence(null); setAiMissingFields([]);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // Nhận cả ảnh (tối ưu trước khi tải) lẫn PDF (tải nguyên bản, tối đa 10MB).
  const addPickedFiles = async (picked: File[]) => {
    if (picked.length === 0) return;
    if (files.length + picked.length > MAX_DOC_FILES) {
      setError(t("documents.errorMaxFiles", { max: MAX_DOC_FILES }));
      return;
    }
    setError("");
    setUploading(true);
    try {
      const added: DocumentFile[] = [];
      let firstForAi: { dataUrl: string; fileName: string } | null = null;
      for (const file of picked) {
        const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
        let url: string; let sizeKb: number; let driveFileId: string | undefined; let driveUrl: string | undefined;
        if (isPdf) {
          if (file.size > 10 * 1024 * 1024) throw new Error(t("documents.errorPdfTooLarge", { name: file.name }));
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(String(r.result));
            r.onerror = () => reject(new Error(t("documents.errorPdfRead")));
            r.readAsDataURL(file);
          });
          if (!firstForAi) firstForAi = { dataUrl, fileName: file.name };
          const uploaded = await uploadDataUrlDetailed(dataUrl, "documents", { saveToDrive: driveConnected && savePickedToDrive, fileName: file.name });
          url = uploaded.url;
          driveFileId = uploaded.driveFileId;
          driveUrl = uploaded.driveUrl;
          sizeKb = Math.max(1, Math.round(file.size / 1024));
        } else {
          const up = await optimizeAndUpload(file, "documents", {
            maxSourceBytes: 25 * 1024 * 1024,
            targetBytes: 1000 * 1024,
            maxSizes: [1600, 1280, 1024, 768],
            qualities: [0.86, 0.78, 0.68, 0.58],
            backgroundColor: "#ffffff"
          }, undefined, { saveToDrive: driveConnected && savePickedToDrive, fileName: file.name });
          if (!firstForAi) firstForAi = { dataUrl: up.dataUrl, fileName: file.name };
          url = up.url;
          driveFileId = up.driveFileId;
          driveUrl = up.driveUrl;
          sizeKb = up.sizeKb;
        }
        added.push({
          id: `docfile_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: file.name,
          url,
          driveFileId,
          driveUrl,
          sizeKb,
          createdAt: new Date().toISOString()
        });
      }
      setFiles(prev => [...prev, ...added]);
      if (firstForAi) void analyzeDocumentFile(firstForAi.dataUrl, firstForAi.fileName);
    } catch (err: any) {
      setError(err.message || t("documents.errorUpload"));
    } finally {
      setUploading(false);
    }
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = ""; // cho phép chọn lại cùng tệp
    void addPickedFiles(picked);
  };

  // Dán ảnh từ clipboard (Ctrl+V) vào form — chụp màn hình scan/CCCD dán thẳng.
  const handlePaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData?.items || [])
      .filter(it => it.kind === "file" && (it.type.startsWith("image/") || it.type === "application/pdf"))
      .map(it => it.getAsFile())
      .filter((f): f is File => !!f)
      .map((f, i) => (f.name && !/^image\.(png|jpe?g)$/i.test(f.name))
        ? f
        : new File([f], `dan-tu-clipboard-${Date.now()}-${i + 1}.png`, { type: f.type }));
    if (imgs.length === 0) return;
    e.preventDefault();
    if (uploading || files.length >= MAX_DOC_FILES) return;
    void addPickedFiles(imgs);
  };

  const isPdfFile = (f: DocumentFile) => /\.pdf$/i.test(f.url) || /\.pdf$/i.test(f.fileName);

  const removeFile = (id: string) => setFiles(prev => prev.filter(f => f.id !== id));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (files.length === 0) {
      setError("Hãy tải lên ít nhất một ảnh/PDF giấy tờ để AI phân tích.");
      return;
    }
    const finalTitle = title.trim() || autoTitle(type, ownerId);
    setSaving(true);
    try {
      const payload: Partial<FamilyDocument> & { baseUpdatedAt?: string } = {
        id: editingId || undefined,
        type,
        title: finalTitle,
        ownerId: ownerId || undefined,
        documentNumber: documentNumber.trim() || undefined,
        issuer: issuer.trim() || undefined,
        issueDate: issueDate || undefined,
        expiryDate: expiryDate || undefined,
        notes: notes.trim() || undefined,
        isShared,
        files
      };
      if (editingId) payload.baseUpdatedAt = editingBaseUpdatedAt || undefined;
      await onSaveDocument(payload);
      resetForm();
    } catch (err: any) {
      setError(err.message || t("documents.errorSave"));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (doc: FamilyDocument) => {
    const ok = await confirm({
      title: t("documents.deleteTitle"),
      message: t("documents.deleteMsg", { title: doc.title }),
      confirmLabel: t("common.delete"),
      tone: "danger"
    });
    if (!ok) return;
    try {
      await onDeleteDocument(doc.id);
      if (editingId === doc.id) resetForm();
    } catch (err) {
      console.error("delete document failed", err);
    }
  };

  const sorted = useMemo(() => {
    const list = filterType === "all" ? documents : documents.filter(d => d.type === filterType);
    // Sắp xếp: sắp/đã hết hạn lên trước, rồi tới có HSD xa, cuối cùng là không có HSD.
    return [...list].sort((a, b) => {
      const da = daysUntil(a.expiryDate);
      const db = daysUntil(b.expiryDate);
      if (da === null && db === null) return a.title.localeCompare(b.title);
      if (da === null) return 1;
      if (db === null) return -1;
      return da - db;
    });
  }, [documents, filterType]);

  const expiringCount = useMemo(
    () => documents.filter(d => { const n = daysUntil(d.expiryDate); return n !== null && n <= 30; }).length,
    [documents]
  );

  const expiryBadge = (dateStr?: string) => {
    const n = daysUntil(dateStr);
    if (n === null) return null;
    if (n < 0) return { text: t("documents.expiredDaysAgo", { n: -n }), cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    if (n === 0) return { text: t("documents.expiresToday"), cls: "bg-rose-500/15 text-rose-400 border-rose-500/30" };
    if (n <= 30) return { text: t("documents.daysLeft", { n }), cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" };
    return { text: t("documents.expiryOn", { date: formatDateVN(dateStr) }), cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" };
  };

  return (
    <div className="space-y-6" id="documents-module">
      {/* Form thêm/sửa */}
      <Reveal>
      <div ref={formRef} className="relative overflow-hidden bg-slate-900 neu-raised rounded-2xl p-5 space-y-4">
        <ShimmerLine accent="indigo" />
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
            <IconChip accent="indigo"><FileText className="w-4 h-4" /></IconChip> {editingId ? t("documents.editDoc") : t("documents.title")}
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            {expiringCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-amber-500/10 text-amber-400 border-amber-500/20 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> {t("documents.expiringCount", { n: expiringCount })}
              </span>
            )}
            <span className="text-[10px] text-slate-500 font-mono">{t("documents.docCount", { n: documents.length })}</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} onPaste={handlePaste} className="grid grid-cols-1 md:grid-cols-6 gap-2 text-xs">
          <div className="md:col-span-6 rounded-2xl border border-indigo-500/20 bg-indigo-500/8 p-4 space-y-1.5">
            <h4 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-300" /> Tải giấy tờ lên, AI tự đọc thông tin
            </h4>
            <p className="text-[11px] leading-relaxed text-slate-500">
              Chọn hoặc dán ảnh/PDF scan. AI sẽ tự nhận diện loại giấy tờ, số giấy tờ, nơi cấp, ngày cấp/hết hạn và ghi chú cần lưu.
            </p>
          </div>

          {/* Đính kèm ảnh/scan/PDF — hỗ trợ dán ảnh từ clipboard (Ctrl+V) vào form */}
          <div className="md:col-span-6 relative bg-slate-950/40 neu-pressed-sm rounded-xl p-3 space-y-2 overflow-hidden">
            {analyzing && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-slate-950/85 backdrop-blur-sm text-center">
                <Sparkles className="w-6 h-6 text-indigo-300 animate-pulse" />
                <p className="text-xs font-bold text-slate-100">AI đang phân tích giấy tờ...</p>
                <p className="text-[11px] text-slate-500">Đang đọc ảnh/PDF và trích xuất thông tin.</p>
              </div>
            )}
            <div className="flex items-center justify-between gap-2">
              <label className="text-slate-400 font-semibold flex items-center gap-1.5 min-w-0">
                <Paperclip className="w-3.5 h-3.5 text-indigo-400 shrink-0" /> {t("documents.attachmentsLabel", { count: files.length, max: MAX_DOC_FILES })}
                <span className="hidden sm:inline text-[10px] text-slate-600 font-normal">{t("documents.pasteHint")}</span>
              </label>
              <label className={`text-[11px] font-bold rounded-lg px-2.5 py-1 cursor-pointer flex items-center gap-1 shrink-0 ${uploading || files.length >= MAX_DOC_FILES ? "bg-slate-800 text-slate-600 cursor-not-allowed" : "bg-slate-800 hover:bg-slate-700 text-indigo-400"}`}>
                <Plus className="w-3 h-3" /> {uploading ? t("documents.uploading") : t("documents.addFile")}
                <Input type="file" accept="image/*,application/pdf,.pdf" multiple disabled={uploading || files.length >= MAX_DOC_FILES} onChange={handleFilePick} className="hidden" />
              </label>
            </div>
            {driveConnected && (
              <label className={`flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-all ${savePickedToDrive ? "border-indigo-500/35 bg-indigo-500/12 text-indigo-200" : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
                <span>Lưu thêm bản sao vào Google Drive khi thêm tệp mới</span>
                <Input type="checkbox" checked={savePickedToDrive} onChange={(e) => setSavePickedToDrive(e.target.checked)} className="size-3.5 shrink-0 accent-indigo-500" />
              </label>
            )}
            {files.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {files.map(f => (
                  <div key={f.id} className="relative group">
                    {isPdfFile(f) ? (
                      <a href={f.url} target="_blank" rel="noreferrer" title={f.fileName} className="w-16 h-16 rounded-lg border border-slate-700 bg-slate-900 flex flex-col items-center justify-center gap-0.5 text-rose-400 hover:bg-slate-800">
                        <FileText className="w-5 h-5" />
                        <span className="text-[8px] font-bold">PDF</span>
                      </a>
                    ) : (
                      <img src={f.url} alt={f.fileName} className="w-16 h-16 object-cover rounded-lg border border-slate-700" />
                    )}
                    <Button type="button" onClick={() => removeFile(f.id)} className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white rounded-full p-0.5 cursor-pointer" title={t("documents.removeFileTooltip")}>
                      <X className="w-3 h-3" />
                    </Button>
                    {f.driveUrl && (
                      <a href={f.driveUrl} target="_blank" rel="noreferrer" className="absolute -bottom-1.5 -right-1.5 bg-sky-500 text-white rounded-full p-0.5" title="Mở trên Google Drive">
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {(analyzing || aiSummary || files.length > 0) && (
            <div className="md:col-span-6 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <Sparkles className={`w-4 h-4 text-indigo-300 ${analyzing ? "animate-pulse" : ""}`} /> Thông tin AI nhận diện
                </h4>
                <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${analyzing ? "bg-indigo-500/10 text-indigo-300 border-indigo-500/20" : "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"}`}>
                  {analyzing ? "Đang phân tích..." : "Sẵn sàng lưu"}
                </span>
              </div>
              {aiSummary && <p className="text-[11px] text-slate-500">{aiSummary}</p>}
              {!analyzing && aiConfidence !== null && (
                <p className="text-[11px] text-slate-500">Độ tin cậy: <span className="font-semibold text-slate-200">{Math.round(aiConfidence * 100)}%</span></p>
              )}
              {!analyzing && aiMissingFields.length > 0 && (
                <p className="text-[11px] text-amber-400">Thiếu/chưa chắc: {aiMissingFields.join(", ")}</p>
              )}
              {!analyzing && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-[11px]">
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Loại giấy tờ</span><b className="text-slate-100">{t(`documents.docTypes.${type}`)}</b></div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Tên giấy tờ</span><b className="text-slate-100">{title || "Chưa nhận diện"}</b></div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Số giấy tờ</span><b className="text-slate-100">{documentNumber || "-"}</b></div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Nơi cấp</span><b className="text-slate-100">{issuer || "-"}</b></div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Ngày cấp</span><b className="text-slate-100">{issueDate ? formatDateVN(issueDate) : "-"}</b></div>
                    <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5"><span className="block text-slate-500">Ngày hết hạn</span><b className="text-slate-100">{expiryDate ? formatDateVN(expiryDate) : "-"}</b></div>
                  </div>
                  {notes && <div className="rounded-xl bg-slate-900 border border-slate-800 p-2.5 text-[11px]"><span className="block text-slate-500 mb-1">Ghi chú</span><p className="text-slate-200 leading-relaxed">{notes}</p></div>}
                </>
              )}
            </div>
          )}

          <div className="md:col-span-6 flex items-center gap-2">
            <Button disabled={saving || uploading || analyzing || files.length === 0} type="submit" className="bg-indigo-500 hover:bg-indigo-400 disabled:opacity-60 text-white rounded-xl px-4 py-2.5 font-bold flex items-center justify-center gap-1.5 cursor-pointer">
              <Plus className="w-4 h-4" /> {editingId ? t("documents.saveChanges") : t("documents.addDoc")}
            </Button>
            {editingId && (
              <Button type="button" onClick={resetForm} className="bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl px-4 py-2.5 font-bold cursor-pointer">
                {t("documents.cancelBtn")}
              </Button>
            )}
          </div>
        </form>
        {error && <p className="text-[11px] text-rose-400">{error}</p>}
      </div>
      </Reveal>

      {/* Bộ lọc loại */}
      {documents.length > 0 && (
        <div className="w-full space-y-2 text-xs">
          <span className="block text-slate-500">{t("documents.filterLabel")}</span>
          <div className="w-full">
            <FancySelect
              value={filterType}
              onChange={setFilterType}
              ariaLabel={t("documents.filterAriaLabel")}
              className="grid-cols-1 lg:grid-cols-6"
              inlineGrid
              options={[
                { value: "all", label: t("documents.filterAll") },
                ...DOC_TYPE_ORDER.map(dt => ({ value: dt, label: t(`documents.docTypes.${dt}`) }))
              ]}
            />
          </div>
        </div>
      )}

      {/* Danh sách */}
      {sorted.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center">
          <p className="text-sm text-slate-500">{t("documents.emptyState")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 xl:gap-6">
          <AnimatePresence>
            {sorted.map(doc => {
              const owner = users.find(u => u.id === doc.ownerId);
              const badge = expiryBadge(doc.expiryDate);
              const canManage = canManageDocument(doc);
              return (
                <motion.div
                  key={doc.id}
                  layout
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  whileHover={{ y: -3 }}
                  className="bg-slate-900 neu-raised hover:border-indigo-500/30 rounded-2xl p-4 shadow-xl hover:shadow-indigo-500/10 transition-[box-shadow,border-color] duration-300 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <span className="text-[10px] px-2 py-0.5 rounded-lg bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-semibold">
                        {t(`documents.docTypes.${doc.type}`)}
                      </span>
                      <h4 className="text-sm font-bold text-slate-100 mt-1.5 truncate">{doc.title}</h4>
                    </div>
                    {canManage && (
                    <div className="flex items-center gap-1 shrink-0">
                      <Button onClick={() => startEdit(doc)} className="p-1.5 text-slate-500 hover:text-amber-400 bg-slate-950 neu-btn rounded-lg cursor-pointer" title={t("documents.editTooltip")}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button onClick={() => handleDelete(doc)} className="p-1.5 text-slate-500 hover:text-rose-400 bg-slate-950 neu-btn rounded-lg cursor-pointer" title={t("documents.deleteTooltip")}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    )}
                  </div>

                  <div className="space-y-1.5 text-[11px] text-slate-400">
                    {doc.documentNumber && <p>{t("documents.numberPrefix")} <span className="text-slate-200 font-mono">{doc.documentNumber}</span></p>}
                    {owner && <p className="flex items-center gap-1"><UserIcon className="w-3 h-3 text-slate-500" /> {owner.fullName}</p>}
                    {doc.issuer && <p className="text-slate-500">{t("documents.issuerPrefix", { issuer: doc.issuer })}</p>}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {badge && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold flex items-center gap-1 ${badge.cls}`}>
                        <Calendar className="w-3 h-3" /> {badge.text}
                      </span>
                    )}
                    <span className={`text-[10px] px-2 py-0.5 rounded-lg border font-semibold ${doc.isShared ? "bg-sky-500/10 text-sky-400 border-sky-500/20" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                      {doc.isShared ? t("documents.shared") : t("documents.private")}
                    </span>
                  </div>

                  {doc.files && doc.files.length > 0 && (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {doc.files.map((f, i) => (
                        isPdfFile(f) ? (
                          <a
                            key={f.id}
                            href={f.url}
                            target="_blank"
                            rel="noreferrer"
                            title={t("documents.openFile", { name: f.fileName })}
                            className="w-14 h-14 rounded-lg border border-slate-700 bg-slate-950/60 flex flex-col items-center justify-center gap-0.5 text-rose-400 hover:bg-slate-800 transition-colors"
                          >
                            <FileText className="w-5 h-5" />
                            <span className="text-[8px] font-bold">PDF</span>
                          </a>
                        ) : (
                          <Button
                            key={f.id}
                            type="button"
                            onClick={() => {
                              const imgs = doc.files.filter(x => !isPdfFile(x));
                              setViewer({ files: imgs, index: Math.max(0, imgs.findIndex(x => x.id === f.id)), title: doc.title });
                            }}
                            className="relative group cursor-pointer"
                            title={t("documents.viewFile", { name: f.fileName })}
                          >
                            <img src={f.url} alt={f.fileName} className="w-14 h-14 object-cover rounded-lg border border-slate-700" />
                            <span className="absolute inset-0 bg-slate-950/0 group-hover:bg-slate-950/40 rounded-lg flex items-center justify-center transition-colors">
                              <ExternalLink className="w-4 h-4 text-white opacity-0 group-hover:opacity-100" />
                            </span>
                          </Button>
                        )
                      ))}
                    </div>
                  )}

                  {doc.notes && <p className="text-[11px] text-slate-500 leading-relaxed border-t border-slate-800 pt-2">{doc.notes}</p>}
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Trình xem ảnh giấy tờ */}
      {viewer && viewer.files[viewer.index] && (
        <div onClick={closeViewer} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[60] p-4" id="document-photo-viewer">
          <div ref={viewerRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={t("documents.viewerAriaLabel")} className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{viewer.title}</p>
                <p className="text-[11px] text-slate-500 tabular-nums truncate">
                  {viewer.files[viewer.index].fileName}
                  {viewer.files.length > 1 && ` • ${viewer.index + 1}/${viewer.files.length}`}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a href={viewer.files[viewer.index].url} target="_blank" rel="noreferrer" aria-label={t("documents.openOriginalAria")} title={t("documents.openOriginalTooltip")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center">
                  <ExternalLink className="size-4" />
                </a>
                <Button type="button" onClick={closeViewer} aria-label={t("documents.closeViewerAria")} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center">
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-950 flex items-center justify-center p-3 relative">
              <img src={viewer.files[viewer.index].url} alt={viewer.files[viewer.index].fileName} className="max-h-[72vh] max-w-full object-contain rounded-lg" />
              {viewer.files.length > 1 && (
                <>
                  <Button type="button" onClick={viewerPrev} aria-label={t("documents.prevImage")} className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700">
                    <ChevronLeft className="size-5" />
                  </Button>
                  <Button type="button" onClick={viewerNext} aria-label={t("documents.nextImage")} className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 flex items-center justify-center border border-slate-700">
                    <ChevronRight className="size-5" />
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
