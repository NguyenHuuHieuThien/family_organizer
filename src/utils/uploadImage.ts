/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { optimizeImageFile, OptimizedImage } from "./image.js";

function authHeader(): Record<string, string> {
  const token = localStorage.getItem("family_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Upload an already-optimized base64 data URL; returns the stored "/uploads/..." URL. */
export interface UploadOptions {
  subfolder?: string;
  saveToDrive?: boolean;
  fileName?: string;
}

export interface UploadedFileRef {
  url: string;
  sizeKb?: number;
  driveFileId?: string;
  driveUrl?: string;
}

export async function uploadDataUrlDetailed(dataUrl: string, category: string, options?: UploadOptions): Promise<UploadedFileRef> {
  const res = await fetch("/api/uploads", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader() },
    body: JSON.stringify({ dataUrl, category, subfolder: options?.subfolder, saveToDrive: options?.saveToDrive, fileName: options?.fileName })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Tải ảnh lên thất bại.");
  }
  const data = await res.json();
  return data as UploadedFileRef;
}

export async function uploadDataUrl(dataUrl: string, category: string, subfolder?: string): Promise<string> {
  const data = await uploadDataUrlDetailed(dataUrl, category, { subfolder });
  return data.url;
}

export interface UploadedImage extends OptimizedImage {
  url: string;
  driveFileId?: string;
  driveUrl?: string;
}

/** Optimize a file in the browser, then upload it as a stored file. */
export async function optimizeAndUpload(
  file: File,
  category: string,
  options?: Parameters<typeof optimizeImageFile>[1],
  subfolder?: string,
  uploadOptions?: UploadOptions
): Promise<UploadedImage> {
  const optimized = await optimizeImageFile(file, options);
  const uploaded = await uploadDataUrlDetailed(optimized.dataUrl, category, { ...uploadOptions, subfolder: uploadOptions?.subfolder ?? subfolder });
  return { ...optimized, ...uploaded };
}
