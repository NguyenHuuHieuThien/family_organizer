/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// File-based media storage. Images are written to data/uploads/<category>/<subfolder>/
// and referenced from the DB by a short "/uploads/..." URL instead of being inlined
// as base64. This keeps the stored document payloads (and every full-DB write/backup)
// small and fast. Files are served statically by the app.

import fs from "fs";
import path from "path";
import crypto from "crypto";

export const UPLOADS_DIR = path.join(process.cwd(), "data", "uploads");
export const UPLOADS_URL_PREFIX = "/uploads/";

// Ensure the base uploads directory exists so static serving works from boot.
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Categories map to top-level folders ("tab/chủ đề" buckets).
const ALLOWED_CATEGORIES = new Set(["avatars", "assets", "receipts", "documents", "debts", "notes", "photos", "chat"]);

// Reject anything larger than this per single image (after client-side optimize).
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
// PDF/file/video không được optimize phía client nên cho trần riêng, rộng hơn.
const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

const MIME_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
  "application/x-zip-compressed": "zip",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx"
};

const DATA_URL_RE = /^data:([a-z0-9][a-z0-9.+-]*\/[a-z0-9.+-]+);base64,(.+)$/i;

function sanitizeSegment(value: unknown): string {
  return String(value || "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
}

export interface SavedMedia {
  url: string;
  sizeKb: number;
}

/** True for URLs this module owns (and may delete from disk). */
export function isManagedUrl(url: unknown): url is string {
  return typeof url === "string" && url.startsWith(UPLOADS_URL_PREFIX);
}

/**
 * Decode a base64 data URL and persist it under data/uploads/<category>/<subfolder>.
 * Returns the public "/uploads/..." URL to store in the DB.
 */
export function saveDataUrlToFile(dataUrl: unknown, category: string, subfolder?: string): SavedMedia {
  if (!ALLOWED_CATEGORIES.has(category)) {
    throw new Error("Loại thư mục lưu ảnh không hợp lệ.");
  }
  if (typeof dataUrl !== "string") {
    throw new Error("Dữ liệu ảnh không hợp lệ.");
  }
  const match = dataUrl.match(DATA_URL_RE);
  if (!match) {
    throw new Error("Tệp phải là ảnh (data:image) hoặc PDF (data:application/pdf) hợp lệ.");
  }
  const mime = match[1].toLowerCase();
  const ext = MIME_EXT[mime];
  const isLegacyMedia = mime.startsWith("image/") || mime === "application/pdf";
  const isChatMedia = category === "chat" && (
    mime.startsWith("image/") || mime.startsWith("video/") || mime.startsWith("audio/") ||
    mime.startsWith("text/") || mime.startsWith("application/")
  );
  if (!isLegacyMedia && !isChatMedia) {
    throw new Error("Định dạng tệp không được hỗ trợ.");
  }

  const buffer = Buffer.from(match[2], "base64");
  if (buffer.length === 0) throw new Error("Tệp rỗng hoặc hỏng.");
  const maxBytes = category === "chat" ? MAX_CHAT_FILE_BYTES : (mime === "application/pdf" ? MAX_PDF_BYTES : MAX_IMAGE_BYTES);
  if (buffer.length > maxBytes) {
    throw new Error(category === "chat" ? "Tệp chat quá lớn (tối đa 50MB)." : (mime === "application/pdf" ? "PDF quá lớn (tối đa 10MB)." : "Ảnh quá lớn. Vui lòng để app tối ưu ảnh trước khi lưu."));
  }

  const sub = sanitizeSegment(subfolder);
  const dir = sub ? path.join(UPLOADS_DIR, category, sub) : path.join(UPLOADS_DIR, category);
  fs.mkdirSync(dir, { recursive: true });

  const fallbackExt = mime.split("/")[1]?.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "bin";
  const fileName = `${Date.now()}_${crypto.randomBytes(8).toString("hex")}.${ext || fallbackExt}`;
  fs.writeFileSync(path.join(dir, fileName), buffer);

  const url = sub
    ? `${UPLOADS_URL_PREFIX}${category}/${sub}/${fileName}`
    : `${UPLOADS_URL_PREFIX}${category}/${fileName}`;
  return { url, sizeKb: Math.max(1, Math.round(buffer.length / 1024)) };
}

/** Delete a file previously created by saveDataUrlToFile. No-ops for legacy/base64/external URLs. */
export function deleteMediaByUrl(url: unknown): void {
  if (!isManagedUrl(url)) return;
  try {
    const rel = decodeURIComponent(url.slice(UPLOADS_URL_PREFIX.length));
    const target = path.resolve(UPLOADS_DIR, rel);
    // Guard against path traversal — must stay inside UPLOADS_DIR.
    if (target !== UPLOADS_DIR && !target.startsWith(UPLOADS_DIR + path.sep)) return;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  } catch (e) {
    console.error("Không xóa được tệp ảnh:", url, e);
  }
}
