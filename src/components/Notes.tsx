/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Checkbox, Input, Textarea } from "./ui";
import React, { useState, useMemo, useCallback, useEffect, useRef, lazy, Suspense } from "react";
import { useTranslation } from "react-i18next";
import {
  FileText,
  Plus,
  Trash2,
  Pin,
  PinOff,
  Search,
  Tag as TagIcon,
  Eye,
  Lock,
  Edit3,
  X,
  Share2,
  Sparkles,
  Loader2
} from "lucide-react";
import { Note, User, UserRole, isLimitedViewer } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { useConfirm } from "./ConfirmDialog.js";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { useTabFab } from "./FabHost.js";
import { ShimmerLine, Reveal, staggerDelay } from "./Lively.js";
import { FancySelect } from "./FancySelect.js";
import { optimizeAndUpload } from "../utils/uploadImage.js";

interface NotesProps {
  currentUser: User;
  users: User[];
  notes: Note[];
  onSaveNote: (note: Partial<Note>) => Promise<any>;
  onDeleteNote: (id: string) => Promise<any>;
  authHeaders: Record<string, string>;
}

// Full Markdown (GFM) renderer — lazy-loaded so react-markdown stays out of the
// initial bundle and only loads when a note is opened or previewed.
const MarkdownView = lazy(() => import("./Markdown.js"));

export function Notes({
  currentUser,
  users,
  notes,
  onSaveNote,
  onDeleteNote,
  authHeaders
}: NotesProps) {
  const { t } = useTranslation();
  const MarkdownFallback = () => <p className="text-slate-500 text-xs">{t("notes.loadingMarkdown")}</p>;

  // Query states
  const [searchTerm, setSearchTerm] = useState("");
  const [tagFilter, setTagFilter] = useState("all");

  // Interaction controls
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [readingNote, setReadingNote] = useState<Note | null>(null);
  const [formError, setFormError] = useState("");
  const { confirm, ConfirmDialog } = useConfirm();

  // Editor states
  const [formTitle, setFormTitle] = useState("");
  const [formContent, setFormContent] = useState("");
  const [formTagsStr, setFormTagsStr] = useState("");
  const [formIsPinned, setFormIsPinned] = useState(false);
  const [formIsShared, setFormIsShared] = useState(true);
  const [editorPreview, setEditorPreview] = useState(false); // Soạn (false) / Xem trước (true)
  const [imagePasting, setImagePasting] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement | null>(null);

  // Dán ảnh từ clipboard (Ctrl+V) vào ô soạn: tối ưu + upload rồi chèn
  // markdown ![ảnh](url) ngay tại vị trí con trỏ.
  const handleContentPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const img = Array.from(e.clipboardData?.items || [])
      .find(it => it.kind === "file" && it.type.startsWith("image/"))
      ?.getAsFile();
    if (!img || imagePasting) return;
    e.preventDefault();
    setFormError("");
    setImagePasting(true);
    // Ghi lại vị trí con trỏ TRƯỚC khi await (upload xong textarea có thể mất focus)
    const el = contentRef.current;
    const selStart = el?.selectionStart ?? formContent.length;
    const selEnd = el?.selectionEnd ?? selStart;
    try {
      const up = await optimizeAndUpload(img, "notes", {
        maxSourceBytes: 20 * 1024 * 1024,
        targetBytes: 600 * 1024,
        maxSizes: [1280, 1024, 768],
        qualities: [0.82, 0.72, 0.62],
        backgroundColor: "#ffffff"
      });
      const snippet = `![ảnh](${up.url})`;
      setFormContent(prev => {
        const before = prev.slice(0, selStart);
        const after = prev.slice(selEnd);
        // Tự chèn xuống dòng quanh ảnh cho markdown render thành khối riêng
        const pre = before && !before.endsWith("\n") ? `${before}\n` : before;
        const post = after && !after.startsWith("\n") ? `\n${after}` : after;
        return `${pre}${snippet}${post}`;
      });
    } catch (err: any) {
      setFormError(err.message || t("notes.errPaste"));
    } finally {
      setImagePasting(false);
    }
  };

  // AI viết nháp ghi chú
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");

  useEffect(() => {
    fetch("/api/version", { headers: authHeaders })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d) setAiEnabled(!!d.aiEnabled); })
      .catch(() => {});
  }, []);

  const handleAiDraft = async () => {
    const p = aiPrompt.trim();
    if (!p) { setAiError(t("notes.aiErrPromptEmpty")); return; }
    setAiBusy(true);
    setAiError("");
    try {
      const res = await fetch("/api/notes/ai-draft", {
        method: "POST",
        headers: { ...authHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: p, title: formTitle.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("notes.aiErr"));
      if (!formTitle.trim() && data.title) setFormTitle(data.title);
      setFormContent(prev => (prev.trim() ? `${prev.trim()}\n\n${data.content}` : data.content));
      setEditorPreview(true); // hiển thị kết quả đã render
      setAiPrompt("");
    } catch (err: any) {
      setAiError(err.message || t("notes.aiErr"));
    } finally {
      setAiBusy(false);
    }
  };

  // Escape-to-close + scroll lock + focus trap for the editor & reader modals
  const editorRef = React.useRef<HTMLDivElement | null>(null);
  const readerRef = React.useRef<HTMLDivElement | null>(null);
  const closeEditor = useCallback(() => setIsEditorOpen(false), []);
  const closeReader = useCallback(() => setReadingNote(null), []);
  useModalA11y(isEditorOpen, closeEditor, editorRef);
  useModalA11y(!!readingNote, closeReader, readerRef);

  // Compute tags pool
  const tagsPool = useMemo(() => {
    const list = new Set<string>();
    notes.forEach(n => n.tags.forEach(t => list.add(t)));
    return Array.from(list);
  }, [notes]);

  // Compute filtered notes list based on credentials
  const filteredNotes = useMemo(() => {
    return notes.filter(n => {
      // 1. Search text
      const matchText =
        n.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        n.content.toLowerCase().includes(searchTerm.toLowerCase());
      if (!matchText) return false;

      // 2. Tag filter
      if (tagFilter !== "all" && !n.tags.includes(tagFilter)) return false;

      // 3. Shared scope protection: limited viewers (Child/Guest) only see shared + their own; others see all but others' private
      if (isLimitedViewer(currentUser.role)) {
        if (!n.isShared && n.creatorId !== currentUser.id) return false;
      } else {
        if (!n.isShared && n.creatorId !== currentUser.id && currentUser.role !== UserRole.ADMIN) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [notes, searchTerm, tagFilter, currentUser]);

  // Separate Pinned and Unpinned
  const pinnedNotes = useMemo(() => filteredNotes.filter(n => n.isPinned), [filteredNotes]);
  const normalNotes = useMemo(() => filteredNotes.filter(n => !n.isPinned), [filteredNotes]);

  // Open note reader modal
  const handleReadNote = (note: Note) => {
    setReadingNote(note);
  };

  // Open editor for creating
  const handleOpenCreateForm = () => {
    setFormTitle("");
    setFormContent("");
    setFormTagsStr("");
    setFormIsPinned(false);
    setFormIsShared(true);
    setEditorPreview(false);
    setAiPrompt("");
    setAiError("");
    setEditingNote(null);
    setFormError("");
    setIsEditorOpen(true);
  };

  // Nút nổi viết nhanh — ẩn khi đang mở trình soạn hoặc tài khoản khách
  useTabFab(
    currentUser.role !== UserRole.GUEST && !isEditorOpen
      ? { id: "notes", color: "sky", title: t("notes.fabTitle"), icon: FileText, onClick: handleOpenCreateForm }
      : null
  );

  // Open editor for modifying
  const handleOpenEditForm = (note: Note) => {
    setFormTitle(note.title);
    setFormContent(note.content);
    setFormTagsStr(note.tags.join(", "));
    setFormIsPinned(note.isPinned);
    setFormIsShared(note.isShared);
    setEditorPreview(false);
    setAiPrompt("");
    setAiError("");
    setEditingNote(note);
    setFormError("");
    setReadingNote(null); // close the reader so the editor isn't hidden behind it
    setIsEditorOpen(true);
  };

  // Save Note trigger
  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError("");

    if (!formTitle.trim()) {
      setFormError(t("notes.errTitleRequired"));
      return;
    }

    const payload: Partial<Note> & { baseUpdatedAt?: string } = {
      title: formTitle.trim(),
      content: formContent,
      isPinned: formIsPinned,
      isShared: formIsShared,
      tags: formTagsStr.split(",").map(t => t.trim()).filter(Boolean)
    };

    if (editingNote) {
      payload.id = editingNote.id;
      // Chống 2 người cùng sửa đè nhau: gửi kèm updatedAt của bản đang mở —
      // server so với bản hiện tại, lệch thì trả 409 (hiện ở formError).
      payload.baseUpdatedAt = editingNote.updatedAt;
    }

    try {
      await onSaveNote(payload);
      setIsEditorOpen(false);
      setEditingNote(null);
    } catch (err: any) {
      setFormError(err.message || t("notes.errSave"));
    }
  };

  // Delete note trigger
  const handleDeleteClick = async (noteId: string) => {
    const ok = await confirm({
      title: t("notes.deleteTitle"),
      message: t("notes.deleteMsg"),
      confirmLabel: t("notes.deleteConfirm"),
      cancelLabel: t("notes.deleteCancel"),
      tone: "danger"
    });
    if (!ok) return;

    await onDeleteNote(noteId);
    if (readingNote?.id === noteId) setReadingNote(null);
  };

  // Quick toggle pin state
  const handleTogglePin = async (note: Note) => {
    try {
      await onSaveNote({
        id: note.id,
        isPinned: !note.isPinned
      });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="space-y-6" id="notes-module">

      {/* Note headers with search */}
      <Reveal className="relative overflow-hidden bg-slate-900 neu-raised p-4.5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4" id="notes-control-header">
        <ShimmerLine accent="sky" />

        {/* Search & Tags triggers */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 flex-1">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 h-4.5 w-4.5 text-slate-500" />
            <Input
              type="text"
              placeholder={t("notes.searchPlaceholder")}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-slate-950 neu-pressed-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 rounded-xl text-slate-200 placeholder-slate-500 text-xs focus:outline-none transition-all"
            />
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            <TagIcon className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-[130px] text-xs">
              <FancySelect
                value={tagFilter}
                onChange={setTagFilter}
                ariaLabel={t("notes.tagFilterAria")}
                options={[
                  { value: "all", label: t("notes.tagFilterAll") },
                  ...tagsPool.map(tg => ({ value: tg, label: `#${tg}` }))
                ]}
              />
            </div>
          </div>
        </div>

        {/* Create Note Trigger */}
        <Button
          disabled={currentUser.role === UserRole.GUEST}
          onClick={handleOpenCreateForm}
          className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-950 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all self-start md:self-auto shrink-0 shadow-md shadow-sky-500/5 cursor-pointer"
        >
          <Plus className="w-4 h-4" /> {t("notes.addNoteBtn")}
        </Button>
      </Reveal>

      {/* Grid of Results: Pinned block at top, normal block underneath */}
      {filteredNotes.length === 0 ? (
        <div className="bg-slate-900/40 border border-dashed border-slate-800 rounded-2xl py-12 text-center" id="empty-notes">
          <p className="text-sm text-slate-500">{t("notes.emptyState")}</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* PINNED SECTION */}
          {pinnedNotes.length > 0 && (
            <div className="space-y-3" id="pinned-notes-block">
              <h3 className="text-xs font-bold text-slate-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Pin className="w-4 h-4 text-yellow-400" /> {t("notes.pinnedSectionTitle", { n: pinnedNotes.length })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {pinnedNotes.map((note, noteIndex) => {
                  const creator = users.find(u => u.id === note.creatorId);
                  return (
                    <Reveal
                      key={note.id}
                      delay={0.06 + staggerDelay(noteIndex)}
                      hoverLift
                      onClick={() => handleReadNote(note)}
                      className="bg-slate-900 neu-btn hover:shadow-lg hover:shadow-yellow-500/10 px-4.5 py-4 rounded-2xl flex flex-col justify-between space-y-4 cursor-pointer relative group transition-[box-shadow,border-color] duration-300 overflow-hidden"
                    >
                      <ShimmerLine accent="yellow" />
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-sky-400 transition-colors">{note.title}</h4>
                          <span className="shrink-0 text-[10px] px-2 py-0.5 bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 font-semibold rounded-lg">{t("notes.pinnedBadge")}</span>
                        </div>
                        <div className="relative max-h-[4.75rem] overflow-hidden [&>div]:text-[11px] [&_*]:!mt-0 [&_*]:!mb-0 [&>div>*+*]:!mt-1">
                          <Suspense fallback={<MarkdownFallback />}>
                            <MarkdownView content={note.content} />
                          </Suspense>
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-slate-900 to-transparent" />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-sans">
                        <span>{t("notes.createdBy", { name: creator ? creator.fullName.split(" ")[0] : t("notes.unknownMember") })}</span>
                        <span>{new Date(note.updatedAt).toLocaleDateString("vi-VN", { month: "numeric", day: "numeric" })}</span>
                      </div>

                      {/* Sticky hover actions */}
                      <div className="absolute right-3.5 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-slate-900 p-1 rounded-lg shadow-md border border-slate-800">
                        <Button
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                          className="p-1.5 hover:bg-slate-800 rounded text-yellow-400"
                          title={t("notes.btnUnpin")}
                        >
                          <PinOff className="w-3.5 h-3.5" />
                        </Button>
                        {currentUser.role !== UserRole.GUEST && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditForm(note); }}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-sky-400"
                            title={t("notes.btnEdit")}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {(note.creatorId === currentUser.id || currentUser.role === UserRole.ADMIN) && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(note.id); }}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                            title={t("notes.btnDelete")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          )}

          {/* NORMAL SECTION */}
          {normalNotes.length > 0 && (
            <div className="space-y-4" id="all-notes-block">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {t("notes.normalSectionTitle", { n: normalNotes.length })}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6">
                {normalNotes.map((note, noteIndex) => {
                  const creator = users.find(u => u.id === note.creatorId);
                  return (
                    <Reveal
                      key={note.id}
                      delay={0.1 + staggerDelay(noteIndex)}
                      hoverLift
                      onClick={() => handleReadNote(note)}
                      className="bg-slate-900 neu-btn hover:border-sky-500/30 hover:shadow-lg hover:shadow-sky-500/5 px-4.5 py-4 rounded-2xl flex flex-col justify-between space-y-4 cursor-pointer relative group transition-[box-shadow,border-color] duration-300"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-100 line-clamp-1 group-hover:text-sky-400 transition-colors">{note.title}</h4>
                          <span className="text-[10px] text-slate-500 font-mono flex items-center gap-1">
                            {note.isShared ? <Share2 className="w-3 h-3 text-sky-400/90" /> : <Lock className="w-3 h-3 text-indigo-400" />}
                            {note.isShared ? t("notes.visPublic") : t("notes.visPrivate")}
                          </span>
                        </div>
                        <div className="relative max-h-[4.75rem] overflow-hidden [&>div]:text-[11px] [&_*]:!mt-0 [&_*]:!mb-0 [&>div>*+*]:!mt-1">
                          <Suspense fallback={<MarkdownFallback />}>
                            <MarkdownView content={note.content} />
                          </Suspense>
                          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-5 bg-gradient-to-t from-slate-900 to-transparent" />
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-500 font-sans">
                        <span>{t("notes.createdBy", { name: creator ? creator.fullName.split(" ")[0] : t("notes.unknownMember") })}</span>
                        <span>{new Date(note.updatedAt).toLocaleDateString("vi-VN", { month: "numeric", day: "numeric" })}</span>
                      </div>

                      {/* Hover actions */}
                      <div className="absolute right-3.5 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-slate-900 p-1 rounded-lg shadow-md border border-slate-800">
                        <Button
                          onClick={(e) => { e.stopPropagation(); handleTogglePin(note); }}
                          className="p-1.5 hover:bg-slate-800 rounded text-slate-500 hover:text-yellow-400"
                          title={t("notes.btnPin")}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </Button>
                        {currentUser.role !== UserRole.GUEST && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleOpenEditForm(note); }}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-sky-400"
                            title={t("notes.btnEdit")}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        {(note.creatorId === currentUser.id || currentUser.role === UserRole.ADMIN) && (
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleDeleteClick(note.id); }}
                            className="p-1.5 hover:bg-slate-800 rounded text-slate-400 hover:text-rose-400"
                            title={t("notes.btnDelete")}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </Reveal>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Editor Modal for Writing / Modifying */}
      {isEditorOpen && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          id="note-editor-modal"
        >
          <motion.div
            ref={editorRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-4xl shadow-2xl max-h-[90vh] flex flex-col overflow-hidden outline-none"
          >
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-slate-800 shrink-0">
              <h3 className="text-md font-bold text-slate-100 flex items-center gap-1.5">
                <FileText className="w-5 h-5 text-sky-400" />
                {editingNote ? t("notes.formTitleEdit", { title: editingNote.title }) : t("notes.formTitleCreate")}
              </h3>
              <Button
                onClick={() => setIsEditorOpen(false)}
                className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            <form onSubmit={handleSaveNote} className="flex flex-col min-h-0 flex-1 overflow-hidden text-xs">
              <div className="space-y-4 overflow-y-auto px-5 py-4 flex-1 min-h-0">
              {formError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 rounded-xl font-medium">
                  {formError}
                </div>
              )}

              {/* Title Input */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">Tựa đề ghi chú <span className="text-rose-400">*</span></label>
                <Input
                  type="text"
                  placeholder={t("notes.formNamePlaceholder")}
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 text-sm font-bold"
                />
              </div>

              {/* AI viết giúp — chỉ hiện khi đã cấu hình Gemini key */}
              {aiEnabled && (
                <div className="space-y-1.5 bg-violet-500/5 border border-violet-500/20 rounded-xl p-3">
                  <label className="text-violet-300 font-semibold flex items-center gap-1.5 text-[11px]">
                    <Sparkles className="w-3.5 h-3.5" /> {t("notes.aiLabel")}
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Input
                      value={aiPrompt}
                      onChange={(e) => setAiPrompt(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAiDraft(); } }}
                      placeholder={t("notes.aiPlaceholder")}
                      className="flex-1 bg-slate-950 neu-pressed-sm rounded-lg px-3 py-2 text-slate-200 outline-none focus:border-violet-500"
                    />
                    <Button
                      type="button"
                      onClick={handleAiDraft}
                      disabled={aiBusy || !aiPrompt.trim()}
                      className="bg-violet-500 hover:bg-violet-400 disabled:opacity-50 text-slate-950 font-bold px-3.5 py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-all"
                    >
                      {aiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                      {aiBusy ? t("notes.aiGenerating") : t("notes.aiGenBtn")}
                    </Button>
                  </div>
                  {aiError && <p className="text-[11px] text-rose-400">{aiError}</p>}
                  <p className="text-[10px] text-violet-300/60">{t("notes.aiHint")}</p>
                </div>
              )}

              {/* Content: trình soạn Markdown đầy đủ + xem trước trực tiếp */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center gap-2">
                  <label className="text-slate-400 font-semibold">{t("notes.contentLabel")}</label>
                  <div className="flex bg-slate-950 neu-pressed-sm rounded-lg p-0.5 text-[10px] font-bold">
                    <Button
                      type="button"
                      onClick={() => setEditorPreview(false)}
                      className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${!editorPreview ? "bg-sky-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      <Edit3 className="w-3 h-3" /> {t("notes.editorTab")}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setEditorPreview(true)}
                      className={`px-2.5 py-1 rounded-md flex items-center gap-1 cursor-pointer transition-colors ${editorPreview ? "bg-sky-500 text-slate-950" : "text-slate-400 hover:text-slate-200"}`}
                    >
                      <Eye className="w-3 h-3" /> {t("notes.previewTab")}
                    </Button>
                  </div>
                </div>
                {editorPreview ? (
                  <div className="w-full min-h-[12rem] max-h-[40vh] overflow-y-auto bg-slate-950 neu-pressed-sm rounded-lg p-3">
                    <Suspense fallback={<MarkdownFallback />}>
                      <MarkdownView content={formContent} />
                    </Suspense>
                  </div>
                ) : (
                  <Textarea
                    ref={contentRef}
                    rows={10}
                    placeholder={`# Tiêu đề\n\n**In đậm**, *in nghiêng*, ~~gạch ngang~~, [liên kết](https://...)\n\n## Danh sách\n- mục thường\n- [ ] việc cần làm\n- [x] đã xong\n\n1. có thứ tự\n\n> Trích dẫn\n\n\`code\` hoặc khối \`\`\` ... \`\`\`\n\n| Cột A | Cột B |\n| --- | --- |\n| 1 | 2 |`}
                    value={formContent}
                    onChange={(e) => setFormContent(e.target.value)}
                    onPaste={handleContentPaste}
                    className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2.5 text-slate-200 focus:outline-none focus:border-sky-500 font-mono leading-relaxed"
                  />
                )}
                <p className="text-[10px] text-slate-500">
                  {t("notes.contentHint")}
                  {imagePasting && <span className="text-sky-400 font-semibold">{t("notes.imagePasting")}</span>}
                </p>
              </div>

              {/* Tags, Pinned and Shared row */}
              <div className="space-y-1">
                <label className="text-slate-400 block font-semibold">{t("notes.tagsLabel")}</label>
                <Input
                  type="text"
                  placeholder={t("notes.tagsPlaceholder")}
                  value={formTagsStr}
                  onChange={(e) => setFormTagsStr(e.target.value)}
                  className="w-full bg-slate-950 neu-pressed-sm rounded-lg p-2 text-slate-200 focus:outline-none focus:border-sky-500"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 bg-slate-950/40 p-4 neu-pressed-sm rounded-xl">
                <label className={`flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${formIsPinned ? "border-yellow-500/35 bg-yellow-500/12 text-yellow-200" : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
                  <span>{t("notes.pinCheckbox")}</span>
                  <Checkbox
                    checked={formIsPinned}
                    onCheckedChange={(checked) => setFormIsPinned(checked === true)}
                    className="cursor-pointer"
                  />
                </label>

                <label className={`flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-all ${formIsShared ? "border-sky-500/35 bg-sky-500/12 text-sky-200" : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
                  <span>{t("notes.shareCheckbox")}</span>
                  <Checkbox
                    checked={formIsShared}
                    onCheckedChange={(checked) => setFormIsShared(checked === true)}
                    className="cursor-pointer"
                  />
                </label>
              </div>

              </div>

              {/* Form buttons */}
              <div className="flex items-center justify-end gap-2.5 px-5 py-4 border-t border-slate-800 shrink-0">
                <Button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl transition-all cursor-pointer font-bold"
                >
                  {t("notes.closeBtn")}
                </Button>
                <Button
                  type="submit"
                  className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-bold transition-all cursor-pointer"
                >
                  {t("notes.saveBtn")}
                </Button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* Reader Modal for viewing Markdown notes */}
      {readingNote && (
        <div
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          id="note-reader-modal"
        >
          <motion.div
            ref={readerRef}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl p-5 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto outline-none"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="space-y-0.5">
                <span className="text-[10px] text-slate-500 font-mono">{t("notes.readerReading")}</span>
                <h3 className="text-md font-bold text-sky-400 flex items-center gap-1.5">{readingNote.title}</h3>
              </div>
              <Button
                onClick={() => setReadingNote(null)}
                className="text-slate-400 hover:text-slate-200 bg-slate-800 p-1.5 rounded-lg"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Markdown details container */}
            <div className="bg-slate-950 p-4.5 rounded-xl border border-slate-800/80 overflow-y-auto max-h-[350px]">
              <Suspense fallback={<MarkdownFallback />}>
                <MarkdownView content={readingNote.content} />
              </Suspense>
            </div>

            {/* Note info footer */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1.5 border-t border-slate-800/60 font-mono">
              <div className="flex gap-2">
                {readingNote.tags.map((tg, i) => (
                  <span key={i} className="text-[10px] text-sky-400/80">#{tg}</span>
                ))}
              </div>
              <span>{t("notes.readerUpdated", { date: new Date(readingNote.updatedAt).toLocaleDateString("vi-VN", { month: "long", day: "numeric" }) })}</span>
            </div>

            {/* Reading window footer buttons */}
            <div className="flex justify-between items-center pt-2">
              {(readingNote.creatorId === currentUser.id || currentUser.role === UserRole.ADMIN) ? (
                <Button
                  onClick={() => handleDeleteClick(readingNote.id)}
                  className="px-3.5 py-1.5 bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 border border-rose-500/20 rounded-xl text-xs font-semibold cursor-pointer"
                >
                  {t("notes.readerDeleteBtn")}
                </Button>
              ) : <div />}

              <div className="flex gap-2.5">
                <Button
                  onClick={() => setReadingNote(null)}
                  className="px-4 py-2 bg-slate-950 text-slate-400 hover:bg-slate-800 hover:text-slate-200 rounded-xl transition-all cursor-pointer font-bold text-xs"
                >
                  {t("notes.readerCloseBtn")}
                </Button>
                {currentUser.role !== UserRole.GUEST && (
                  <Button
                    onClick={() => handleOpenEditForm(readingNote)}
                    className="px-4 py-2 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-xl font-bold transition-all cursor-pointer text-xs"
                  >
                    {t("notes.readerEditBtn")}
                  </Button>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {ConfirmDialog}
    </div>
  );
}
