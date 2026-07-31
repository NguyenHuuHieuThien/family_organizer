/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { getAppSettings } from "./db.js";

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink%2Cname";
const SCOPE = "https://www.googleapis.com/auth/drive.file";

interface ServiceAccountKey {
  client_email?: string;
  private_key?: string;
}

export interface DriveStatus {
  configured: boolean;
  enabled: boolean;
  folderId: string;
  serviceAccountEmail: string;
}

export interface DriveUploadResult {
  id: string;
  webViewLink: string;
  name: string;
}

function parseServiceAccount(raw: string): ServiceAccountKey | null {
  try {
    const parsed = JSON.parse(raw || "{}");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function getDriveKey(): ServiceAccountKey | null {
  const s = getAppSettings();
  return parseServiceAccount(s.googleDriveServiceAccountJson || "");
}

export function googleDriveStatus(): DriveStatus {
  const s = getAppSettings();
  const key = getDriveKey();
  return {
    configured: Boolean(key?.client_email && key?.private_key && s.googleDriveFolderId),
    enabled: s.googleDriveEnabled === "1",
    folderId: s.googleDriveFolderId || "",
    serviceAccountEmail: key?.client_email || ""
  };
}

async function getAccessToken(key: ServiceAccountKey): Promise<string> {
  if (!key.client_email || !key.private_key) throw new Error("Service account JSON thiếu client_email/private_key.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: key.client_email,
    scope: SCOPE,
    aud: TOKEN_URL,
    exp: now + 3600,
    iat: now
  }));
  const unsigned = `${header}.${claim}`;
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsigned);
  signer.end();
  const signature = signer.sign(key.private_key);
  const assertion = `${unsigned}.${base64Url(signature)}`;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) throw new Error(data.error_description || data.error || "Không lấy được access token Google Drive.");
  return String(data.access_token);
}

export async function testGoogleDriveConfig(serviceAccountJson: string, folderId: string): Promise<DriveStatus> {
  const key = parseServiceAccount(serviceAccountJson);
  if (!key?.client_email || !key.private_key) throw new Error("Service account JSON không hợp lệ.");
  if (!String(folderId || "").trim()) throw new Error("Thiếu Google Drive Folder ID.");
  await getAccessToken(key);
  return { configured: true, enabled: true, folderId: String(folderId).trim(), serviceAccountEmail: key.client_email };
}

export async function uploadDataUrlToGoogleDrive(dataUrl: string, fileName: string): Promise<DriveUploadResult | null> {
  const status = googleDriveStatus();
  if (!status.configured || !status.enabled) return null;
  const key = getDriveKey();
  if (!key) return null;
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) throw new Error("Dữ liệu tệp Drive không hợp lệ.");
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const token = await getAccessToken(key);
  const metadata = { name: fileName || `family-organizer-${Date.now()}`, parents: [status.folderId] };
  const boundary = `family_organizer_${Date.now()}_${crypto.randomBytes(6).toString("hex")}`;
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`),
    Buffer.from(`--${boundary}\r\nContent-Type: ${mime}\r\n\r\n`),
    buffer,
    Buffer.from(`\r\n--${boundary}--\r\n`)
  ]);

  const res = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": `multipart/related; boundary=${boundary}` },
    body
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error?.message || "Upload Google Drive thất bại.");
  return { id: String(data.id), webViewLink: String(data.webViewLink || ""), name: String(data.name || fileName) };
}
