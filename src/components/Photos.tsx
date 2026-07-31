/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button, Input } from "./ui";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Camera, ChevronLeft, ChevronRight, ExternalLink, ImagePlus, Plus, Search, Trash2, Upload } from "lucide-react";
import { FamilyPhoto, User, UserRole } from "../types.js";
import { optimizeAndUpload } from "../utils/uploadImage.js";
import { useTabFab } from "./FabHost.js";
import { useConfirm } from "./ConfirmDialog.js";
import { useModalA11y } from "../hooks/useModalA11y.js";

interface PhotosProps {
  currentUser: User;
  users: User[];
  photos: FamilyPhoto[];
  onSavePhoto: (photo: Partial<FamilyPhoto>) => Promise<any>;
  onDeletePhoto: (id: string) => Promise<any>;
}

const MAX_PICKED = 12;

function nextFamilyName(existing: FamilyPhoto[], offset: number): string {
  const used = existing
    .map(p => {
      const m = String(p.title || "").match(/^FAMILY(\d+)$/i);
      return m ? Number(m[1]) : 0;
    })
    .filter(n => Number.isFinite(n) && n > 0);
  const max = used.length ? Math.max(...used) : 0;
  return `FAMILY${String(max + offset + 1).padStart(2, "0")}`;
}

export function Photos({ currentUser, users, photos, onSavePhoto, onDeletePhoto }: PhotosProps) {
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [viewer, setViewer] = useState<{ index: number; list: FamilyPhoto[] } | null>(null);
  const [busyIds, setBusyIds] = useState<Record<string, boolean>>({});
  const [savePickedToDrive, setSavePickedToDrive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const viewerRef = useRef<HTMLDivElement>(null);
  const { confirm, ConfirmDialog } = useConfirm();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return photos;
    return photos.filter(p => [p.title, p.description, p.album, p.fileName, ...(p.tags || [])].filter(Boolean).join(" ").toLowerCase().includes(q));
  }, [photos, query]);

  const canManage = (photo: FamilyPhoto) => photo.creatorId === currentUser.id || (photo.isShared && currentUser.role === UserRole.ADMIN);
  const closeViewer = () => setViewer(null);
  const viewerPrev = () => setViewer(v => v ? { ...v, index: (v.index - 1 + v.list.length) % v.list.length } : v);
  const viewerNext = () => setViewer(v => v ? { ...v, index: (v.index + 1) % v.list.length } : v);
  useModalA11y(!!viewer, closeViewer, viewerRef);

  useEffect(() => {
    if (!viewer) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") viewerPrev();
      if (e.key === "ArrowRight") viewerNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewer]);

  useTabFab({ id: "photos", color: "sky", title: "Thêm ảnh", icon: ImagePlus, onClick: () => fileInputRef.current?.click() });

  const uploadFiles = async (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith("image/") || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(f.name));
    if (imgs.length === 0) return;
    if (imgs.length > MAX_PICKED) {
      setError(`Mỗi lần chọn tối đa ${MAX_PICKED} ảnh.`);
      return;
    }
    setError("");
    setUploading(true);
    try {
      for (let i = 0; i < imgs.length; i++) {
        const file = imgs[i];
        const title = nextFamilyName(photos, i);
        const up = await optimizeAndUpload(file, "photos", {
          maxSourceBytes: 30 * 1024 * 1024,
          targetBytes: 1200 * 1024,
          maxSizes: [1800, 1440, 1200, 900],
          qualities: [0.88, 0.8, 0.7, 0.6],
          backgroundColor: "#ffffff"
        }, undefined, { saveToDrive: savePickedToDrive, fileName: file.name });
        const key = `${Date.now()}_${i}`;
        setBusyIds(prev => ({ ...prev, [key]: true }));
        try {
          await onSavePhoto({
            title,
            url: up.url,
            fileName: file.name,
            sizeKb: up.sizeKb,
            width: up.width,
            height: up.height,
            driveFileId: up.driveFileId,
            driveUrl: up.driveUrl,
            isShared: true,
            tags: []
          });
        } finally {
          setBusyIds(prev => {
            const next = { ...prev };
            delete next[key];
            return next;
          });
        }
      }
    } catch (err: any) {
      setError(err.message || "Tải ảnh lên thất bại.");
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (photo: FamilyPhoto) => {
    const ok = await confirm({ title: "Xóa ảnh?", message: `Xóa ${photo.title} khỏi kho hình ảnh?`, confirmLabel: "Xóa", tone: "danger" });
    if (!ok) return;
    await onDeletePhoto(photo.id);
  };

  const current = viewer ? viewer.list[viewer.index] : null;

  return (
    <div className="space-y-6" id="photos-module" onPaste={(e) => {
      const files = Array.from(e.clipboardData?.files || []);
      if (files.some(f => f.type.startsWith("image/"))) {
        e.preventDefault();
        void uploadFiles(files);
      }
    }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.heic,.heif"
        multiple
        className="hidden"
        onChange={(e) => {
          void uploadFiles(Array.from(e.target.files || []));
          e.currentTarget.value = "";
        }}
      />

      <div className="bg-slate-900 neu-raised rounded-2xl p-4 md:p-5 border border-slate-800/70 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-bold text-slate-100 flex items-center gap-2"><Camera className="w-5 h-5 text-sky-400" /> Quản lý hình ảnh</h3>
          <span className="text-[10px] text-slate-500 font-mono">{photos.length} ảnh</span>
        </div>

        <div className="rounded-xl border border-dashed border-slate-700 bg-slate-950/50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="text-sm text-slate-400">
            Chọn hoặc dán ảnh. Tên sẽ tự chạy <span className="font-mono text-slate-200">FAMILY01</span>, <span className="font-mono text-slate-200">FAMILY02</span>...
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-xs">
            <label className={`flex w-full cursor-pointer select-none items-center justify-between gap-2 rounded-xl border px-3 py-2 text-[11px] font-bold transition-all ${savePickedToDrive ? "border-sky-500/35 bg-sky-500/12 text-sky-200" : "border-slate-800 bg-slate-900 text-slate-400 hover:border-slate-700 hover:text-slate-200"}`}>
              <span>Lưu vào Google Drive</span>
              <Input type="checkbox" checked={savePickedToDrive} onChange={(e) => setSavePickedToDrive(e.target.checked)} className="size-3.5 shrink-0 accent-sky-500" />
            </label>
            <Button type="button" onClick={() => fileInputRef.current?.click()} className="w-full bg-sky-500 hover:bg-sky-600 text-white rounded-xl px-3 py-2 justify-center">
              <Upload className="w-4 h-4" /> {uploading ? "Đang tải..." : "Chọn ảnh"}
            </Button>
          </div>
        </div>

        {error && <p className="text-sm text-rose-400">{error}</p>}
        {Object.keys(busyIds).length > 0 && <p className="text-[11px] text-slate-500">Đang lưu {Object.keys(busyIds).length} ảnh...</p>}
      </div>

      <div className="relative md:w-80">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm ảnh, album, tag..." className="pl-9 bg-slate-900 rounded-xl" />
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-14 border border-dashed border-slate-800 rounded-2xl">
          <p className="text-sm text-slate-500">Chưa có ảnh nào trong kho.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 md:gap-4">
          {filtered.map((photo, index) => {
            const owner = users.find(u => u.id === photo.ownerId);
            return (
              <div key={photo.id} className="group bg-slate-900 neu-raised rounded-2xl overflow-hidden border border-slate-800/70">
                <button type="button" onClick={() => setViewer({ list: filtered, index })} className="block w-full aspect-square bg-slate-950 overflow-hidden">
                  <img src={photo.url} alt={photo.title} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </button>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-100 truncate">{photo.title}</p>
                    </div>
                    {canManage(photo) && (
                      <Button onClick={() => void handleDelete(photo)} className="p-1.5 bg-slate-950 rounded-lg text-slate-500 hover:text-rose-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                  {owner && <p className="text-[11px] text-slate-500 truncate">{owner.fullName}</p>}
                  <div className="flex flex-wrap gap-1">
                    {photo.tags.slice(0, 3).map(tag => <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400">#{tag}</span>)}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {current && (
        <div onClick={closeViewer} className="fixed inset-0 bg-slate-950/90 flex items-center justify-center z-[60] p-4">
          <div ref={viewerRef} tabIndex={-1} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Xem ảnh" className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col outline-none">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-100 truncate">{current.title}</p>
                <p className="text-[11px] text-slate-500 tabular-nums truncate">{current.fileName} • {viewer!.index + 1}/{viewer!.list.length}</p>
              </div>
              <div className="flex gap-2">
                {current.driveUrl && <a href={current.driveUrl} target="_blank" rel="noreferrer" className="size-8 rounded-lg bg-slate-800 text-sky-400 hover:text-sky-300 flex items-center justify-center" title="Mở trên Google Drive"><ExternalLink className="size-4" /></a>}
                <a href={current.url} target="_blank" rel="noreferrer" className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 flex items-center justify-center"><ExternalLink className="size-4" /></a>
                <Button onClick={closeViewer} className="size-8 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200"><Plus className="size-4 rotate-45" /></Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 bg-slate-950 flex items-center justify-center p-3 relative">
              <img src={current.url} alt={current.title} className="max-h-[72vh] max-w-full object-contain rounded-lg" />
              {viewer!.list.length > 1 && (
                <>
                  <Button onClick={viewerPrev} className="absolute left-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700"><ChevronLeft className="size-5" /></Button>
                  <Button onClick={viewerNext} className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700"><ChevronRight className="size-5" /></Button>
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
