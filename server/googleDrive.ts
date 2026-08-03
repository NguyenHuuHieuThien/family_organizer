/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from "crypto";
import { getAppSettings, getSessionSecret, setAppSetting } from "./db.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo";
const DRIVE_INFO_URL = "https://www.googleapis.com/drive/v3/about?fields=user,storageQuota";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id%2CwebViewLink%2Cname";
const SCOPES = ["https://www.googleapis.com/auth/drive.file", "openid", "email", "profile"];

type DriveConnectionStatus = "disconnected" | "connecting" | "connected" | "error" | "expired" | "cancelled";

export interface DriveStatus {
  configured: boolean;
  status: DriveConnectionStatus;
  connected: boolean;
  enabled: boolean;
  accountEmail: string;
  displayName: string;
  picture: string;
  connectedAt: string;
  lastError: string;
  scope: string;
}

export interface DriveUploadResult {
  id: string;
  webViewLink: string;
  name: string;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  id?: string;
  email?: string;
  name?: string;
  picture?: string;
}

function oauthClient() {
  return {
    clientId: String(process.env.GOOGLE_DRIVE_CLIENT_ID || "").trim(),
    clientSecret: String(process.env.GOOGLE_DRIVE_CLIENT_SECRET || "").trim()
  };
}

function requireOAuthClient() {
  const client = oauthClient();
  if (!client.clientId || !client.clientSecret) {
    throw new Error("Google Drive chưa sẵn sàng trên máy chủ.");
  }
  return client;
}

function secretKey(): Buffer {
  return crypto.createHash("sha256").update(getSessionSecret()).digest();
}

function encryptText(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(".");
}

function decryptText(cipherText: string): string {
  const parts = String(cipherText || "").split(".");
  if (parts.length !== 3) return "";
  const [ivB64, tagB64, dataB64] = parts;
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
  return decrypted.toString("utf8");
}

function readStored(key: string): string {
  return String(getAppSettings()[key] || "").trim();
}

function writeJson(key: string, value: unknown): void {
  setAppSetting(key, value ? JSON.stringify(value) : null);
}

function readJson<T>(key: string): T | null {
  const raw = readStored(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function persistLastError(message: string): void {
  setAppSetting("googleDriveLastError", message || null);
  if (message) setAppSetting("googleDriveStatus", "error");
}

function clearLastError(): void {
  setAppSetting("googleDriveLastError", null);
  if (readStored("googleDriveStatus") === "error") setAppSetting("googleDriveStatus", "connected");
}

export function googleDriveStatus(): DriveStatus {
  const client = oauthClient();
  const connected = Boolean(readStored("googleDriveRefreshTokenEnc"));
  let status = (readStored("googleDriveStatus") as DriveConnectionStatus) || (connected ? "connected" : "disconnected");
  if (!connected && status === "connecting") {
    const createdAt = Number(readStored("googleDriveOAuthStateCreatedAt") || 0);
    if (!createdAt || Date.now() - createdAt > 10 * 60 * 1000) status = "expired";
  }
  if (connected && ["disconnected", "connecting", "expired", "cancelled"].includes(status)) status = "connected";
  return {
    configured: Boolean(client.clientId && client.clientSecret),
    status,
    connected,
    enabled: readStored("googleDriveEnabled") !== "0" && connected,
    accountEmail: readStored("googleDriveAccountEmail"),
    displayName: readStored("googleDriveDisplayName"),
    picture: readStored("googleDrivePicture"),
    connectedAt: readStored("googleDriveConnectedAt"),
    lastError: readStored("googleDriveLastError"),
    scope: readStored("googleDriveScope") || SCOPES.join(" ")
  };
}

export function createGoogleDriveOAuthState(): string {
  const state = crypto.randomBytes(24).toString("hex");
  setAppSetting("googleDriveOAuthState", state);
  setAppSetting("googleDriveOAuthStateCreatedAt", String(Date.now()));
  setAppSetting("googleDriveStatus", "connecting");
  setAppSetting("googleDriveLastError", null);
  return state;
}

export function buildGoogleDriveAuthUrl(redirectUri: string, state: string): string {
  const { clientId } = requireOAuthClient();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state
  });
  return `${AUTH_URL}?${params.toString()}`;
}

export function validateGoogleDriveOAuthState(state: string): void {
  const s = getAppSettings();
  const expected = s.googleDriveOAuthState || "";
  const createdAt = Number(s.googleDriveOAuthStateCreatedAt || 0);
  const isFresh = createdAt > 0 && Date.now() - createdAt < 10 * 60 * 1000;
  if (!state || !expected || state !== expected || !isFresh) {
    setAppSetting("googleDriveStatus", "expired");
    throw new Error("Phiên kết nối Google Drive đã hết hạn. Vui lòng bấm kết nối lại.");
  }
}

async function postToken(params: URLSearchParams): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const data = await res.json().catch(() => ({})) as TokenResponse;
  if (!res.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Không lấy được access token Google Drive.");
  }
  return data;
}

async function fetchGoogleUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const res = await fetch(USERINFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) return {};
  return await res.json().catch(() => ({}));
}

async function fetchDriveInfo(accessToken: string): Promise<{ email: string; displayName: string; picture: string }> {
  const [userInfoRes, driveInfoRes] = await Promise.all([
    fetchGoogleUserInfo(accessToken),
    fetch(DRIVE_INFO_URL, { headers: { Authorization: `Bearer ${accessToken}` } }).then(r => r.ok ? r.json().catch(() => ({})) : {})
  ]);
  const driveUser = (driveInfoRes as any)?.user || {};
  return {
    email: String((userInfoRes as GoogleUserInfo).email || driveUser.emailAddress || ""),
    displayName: String((userInfoRes as GoogleUserInfo).name || driveUser.displayName || ""),
    picture: String((userInfoRes as GoogleUserInfo).picture || "")
  };
}

export async function exchangeGoogleDriveCode(code: string, redirectUri: string): Promise<DriveStatus> {
  const { clientId, clientSecret } = requireOAuthClient();
  const data = await postToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri
  }));
  if (!data.refresh_token) {
    throw new Error("Google không trả refresh token. Vui lòng gỡ quyền ứng dụng trong Google Account rồi kết nối lại.");
  }
  const user = await fetchDriveInfo(data.access_token || "");
  setAppSetting("googleDriveAccessTokenEnc", encryptText(data.access_token || ""));
  setAppSetting("googleDriveRefreshTokenEnc", encryptText(data.refresh_token));
  setAppSetting("googleDriveAccessTokenExpiresAt", data.expires_in ? String(Date.now() + data.expires_in * 1000) : null);
  setAppSetting("googleDriveAccountEmail", user.email);
  setAppSetting("googleDriveDisplayName", user.displayName);
  setAppSetting("googleDrivePicture", user.picture);
  setAppSetting("googleDriveScope", data.scope || SCOPES.join(" "));
  setAppSetting("googleDriveEnabled", "1");
  setAppSetting("googleDriveConnectedAt", new Date().toISOString());
  setAppSetting("googleDriveStatus", "connected");
  setAppSetting("googleDriveOAuthState", null);
  setAppSetting("googleDriveOAuthStateCreatedAt", null);
  clearLastError();
  return googleDriveStatus();
}

export function disconnectGoogleDrive(): DriveStatus {
  setAppSetting("googleDriveAccessTokenEnc", null);
  setAppSetting("googleDriveRefreshTokenEnc", null);
  setAppSetting("googleDriveAccessTokenExpiresAt", null);
  setAppSetting("googleDriveAccountEmail", null);
  setAppSetting("googleDriveDisplayName", null);
  setAppSetting("googleDrivePicture", null);
  setAppSetting("googleDriveScope", null);
  setAppSetting("googleDriveEnabled", null);
  setAppSetting("googleDriveConnectedAt", null);
  setAppSetting("googleDriveOAuthState", null);
  setAppSetting("googleDriveOAuthStateCreatedAt", null);
  setAppSetting("googleDriveStatus", "disconnected");
  setAppSetting("googleDriveLastError", null);
  return googleDriveStatus();
}

export async function syncGoogleDriveAccount(): Promise<DriveStatus> {
  const accessToken = await getValidAccessToken();
  const user = await fetchDriveInfo(accessToken);
  setAppSetting("googleDriveAccountEmail", user.email);
  setAppSetting("googleDriveDisplayName", user.displayName);
  setAppSetting("googleDrivePicture", user.picture);
  clearLastError();
  return googleDriveStatus();
}

async function getValidAccessToken(): Promise<string> {
  const existing = readStored("googleDriveAccessTokenEnc");
  const expiresAt = Number(readStored("googleDriveAccessTokenExpiresAt") || 0);
  if (existing && expiresAt > Date.now() + 60_000) {
    return decryptText(existing);
  }
  const refreshTokenEnc = readStored("googleDriveRefreshTokenEnc");
  if (!refreshTokenEnc) throw new Error("Google Drive chưa được kết nối.");
  const { clientId, clientSecret } = requireOAuthClient();
  const refreshToken = decryptText(refreshTokenEnc);
  const data = await postToken(new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token"
  }));
  setAppSetting("googleDriveAccessTokenEnc", encryptText(data.access_token || ""));
  setAppSetting("googleDriveAccessTokenExpiresAt", data.expires_in ? String(Date.now() + data.expires_in * 1000) : null);
  clearLastError();
  return String(data.access_token || "");
}

export async function uploadDataUrlToGoogleDrive(dataUrl: string, fileName: string): Promise<DriveUploadResult | null> {
  const status = googleDriveStatus();
  if (!status.configured || !status.connected || !status.enabled) return null;
  const match = String(dataUrl || "").match(/^data:([^;]+);base64,(.+)$/i);
  if (!match) throw new Error("Dữ liệu tệp Drive không hợp lệ.");
  const mime = match[1];
  const buffer = Buffer.from(match[2], "base64");
  const token = await getValidAccessToken();
  const metadata = { name: fileName || `family-organizer-${Date.now()}` };
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

export function setGoogleDriveIntegrationError(message: string, status: DriveConnectionStatus = "error"): void {
  setAppSetting("googleDriveLastError", message || null);
  setAppSetting("googleDriveStatus", message ? status : "connected");
}
