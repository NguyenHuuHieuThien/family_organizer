/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Sao lưu TOÀN PHẦN: một tệp .zip duy nhất chứa 100% trạng thái hệ thống —
// snapshot DB (db.json), toàn bộ tệp media (data/uploads/**) và cấu hình app
// (app_settings.json, gồm cả Gemini key — người dùng đã chọn đưa vào backup).
// Mục đích: server hỏng thì chỉ cần tệp này import vào server mới là chạy lại y nguyên.
//
// Cấu trúc tệp zip:
//   manifest.json       — nhận diện tệp + phiên bản định dạng + thống kê
//   db.json             — snapshot toàn bộ database
//   app_settings.json   — cấu hình admin (Gemini key...)
//   uploads/**          — ảnh hóa đơn, avatar, ảnh ghi chú, ảnh tài sản, tệp giấy tờ

import fs from "fs";
import path from "path";
import { Open as unzipOpen } from "unzipper";
import { FamilyDB, getAppSettings, replaceAppSettings } from "./db.js";
import { UPLOADS_DIR } from "./media.js";

const DATA_DIR = path.dirname(UPLOADS_DIR); // .../data
const MANIFEST_APP = "family-organizer";
const MANIFEST_FORMAT = 1;

// ─── EXPORT ──────────────────────────────────────────────────────────────────

/**
 * Đóng gói backup toàn phần và ghi thẳng vào stream (HTTP response) —
 * không tạo file tạm, không dồn vào RAM. Trả về Promise kết thúc khi nén xong.
 */
export function streamFullBackup(out: NodeJS.WritableStream): Promise<void> {
  const db = FamilyDB.getFullSnapshot();
  const manifest = {
    app: MANIFEST_APP,
    format: MANIFEST_FORMAT,
    createdAt: new Date().toISOString(),
    counts: {
      users: db.users.length,
      tasks: db.tasks.length,
      transactions: db.transactions.length,
      notes: (db as any).notes?.length ?? 0
    }
  };

  return new Promise(async (resolve, reject) => {
    const archiverMod: any = await import("archiver");
    const archiver = archiverMod.default || archiverMod;
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", reject);
    archive.on("warning", (err) => console.error("Cảnh báo khi nén backup:", err));
    out.on("error", reject);
    archive.on("end", () => resolve());

    archive.pipe(out);
    archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });
    archive.append(JSON.stringify(db, null, 2), { name: "db.json" });
    archive.append(JSON.stringify(getAppSettings(), null, 2), { name: "app_settings.json" });
    if (fs.existsSync(UPLOADS_DIR)) {
      archive.directory(UPLOADS_DIR, "uploads");
    }
    void archive.finalize();
  });
}

export function fullBackupFilename(): string {
  const ts = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  return `family-organizer_full_${ts}.zip`;
}

// ─── IMPORT ──────────────────────────────────────────────────────────────────

interface ZipEntryLike {
  path: string;
  type: string;
  buffer(): Promise<Buffer>;
  stream(): NodeJS.ReadableStream;
}

/**
 * Khôi phục toàn phần từ tệp zip đã upload (buffer). Quy trình an toàn:
 *  1. Ghi zip ra file tạm, đọc + xác thực db.json trước khi động vào bất cứ thứ gì.
 *  2. Tạo backup JSON "an toàn" của trạng thái hiện tại (giữ vĩnh viễn, phòng lỡ tay).
 *  3. Đổi tên uploads hiện tại sang thư mục .old, giải nén uploads mới;
 *     lỗi giữa chừng thì trả lại thư mục cũ (rollback).
 *  4. Ghi đè app_settings.json + nạp snapshot DB vào MongoDB.
 */
export async function importFullBackup(zipBuffer: Buffer, userId: string, username: string): Promise<{ restoredFiles: number }> {
  if (!zipBuffer || zipBuffer.length === 0) throw new Error("Tệp tải lên rỗng!");

  const tmpZip = path.join(DATA_DIR, `tmp_full_import_${Date.now()}.zip`);
  fs.writeFileSync(tmpZip, zipBuffer);

  const oldUploads = `${UPLOADS_DIR}.old_${Date.now()}`;
  let uploadsSwapped = false;

  try {
    // 1. Đọc & xác thực nội dung zip TRƯỚC khi thay đổi hệ thống
    const zip = await unzipOpen.file(tmpZip).catch(() => {
      throw new Error("Tệp tải lên không phải là tệp .zip hợp lệ hoặc đã bị hỏng!");
    });
    const entries = zip.files as unknown as ZipEntryLike[];
    const findEntry = (name: string) => entries.find(e => e.path === name && e.type === "File");

    const dbEntry = findEntry("db.json");
    if (!dbEntry) throw new Error("Tệp không phải backup toàn phần hợp lệ (thiếu db.json)!");

    const manifestEntry = findEntry("manifest.json");
    if (manifestEntry) {
      const manifest = JSON.parse((await manifestEntry.buffer()).toString("utf8"));
      if (manifest.app !== MANIFEST_APP) throw new Error("Tệp backup không thuộc ứng dụng Family Organizer!");
      if (manifest.format > MANIFEST_FORMAT) throw new Error("Tệp backup được tạo từ phiên bản mới hơn — hãy cập nhật app trước khi khôi phục.");
    }

    const parsedDb = JSON.parse((await dbEntry.buffer()).toString("utf8"));
    if (!parsedDb.users || !parsedDb.tasks) throw new Error("db.json trong tệp backup thiếu dữ liệu cốt lõi!");

    const settingsEntry = findEntry("app_settings.json");
    const parsedSettings = settingsEntry
      ? JSON.parse((await settingsEntry.buffer()).toString("utf8"))
      : null;

    // 2. Backup an toàn trạng thái hiện tại (trước khi ghi đè)
    try {
      FamilyDB.createBackup("manual", userId, username);
    } catch (e) {
      console.error("Không tạo được backup an toàn trước khi import (vẫn tiếp tục):", e);
    }

    // 3. Thay thế hoàn toàn thư mục uploads
    if (fs.existsSync(UPLOADS_DIR)) fs.renameSync(UPLOADS_DIR, oldUploads);
    uploadsSwapped = true;
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });

    let restoredFiles = 0;
    for (const entry of entries) {
      if (entry.type !== "File" || !entry.path.startsWith("uploads/")) continue;
      const rel = entry.path.slice("uploads/".length);
      const target = path.resolve(UPLOADS_DIR, rel);
      // Chặn path traversal — mọi file phải nằm trong UPLOADS_DIR
      if (target !== UPLOADS_DIR && !target.startsWith(UPLOADS_DIR + path.sep)) continue;
      fs.mkdirSync(path.dirname(target), { recursive: true });
      await new Promise<void>((resolve, reject) => {
        entry.stream()
          .pipe(fs.createWriteStream(target))
          .on("finish", () => resolve())
          .on("error", reject);
      });
      restoredFiles++;
    }

    // 4. Cấu hình app + DB (đã qua điểm không thể lỗi vặt — DB save là atomic)
    if (parsedSettings) replaceAppSettings(parsedSettings);
    FamilyDB.restoreFromSnapshot(parsedDb, userId, username, "tệp backup toàn phần được tải lên");

    // Thành công: dọn uploads cũ + zip tạm
    fs.rmSync(oldUploads, { recursive: true, force: true });
    return { restoredFiles };
  } catch (err) {
    // Rollback thư mục uploads nếu đã kịp hoán đổi
    if (uploadsSwapped && fs.existsSync(oldUploads)) {
      try {
        fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
        fs.renameSync(oldUploads, UPLOADS_DIR);
      } catch (rollbackErr) {
        console.error("LỖI NGHIÊM TRỌNG: rollback thư mục uploads thất bại:", rollbackErr);
      }
    }
    throw err;
  } finally {
    try { fs.rmSync(tmpZip, { force: true }); } catch { /* bỏ qua */ }
  }
}
