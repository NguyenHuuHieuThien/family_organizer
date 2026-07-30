/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Web Push delivery. Sends system notifications (and an app-icon badge count)
// to subscribed devices so the PWA behaves like a native app even when closed.
// No-ops gracefully when VAPID keys are not configured.

// web-push là CommonJS — dưới ESM ("type": "module") không destructure named export
// trực tiếp được (Node báo "does not provide an export named ..."). Import default rồi lấy field.
import webpush from "web-push";
const { setVapidDetails, sendNotification } = webpush;
import { FamilyOrganizerDB, Notification, PushSubscriptionRecord } from "../src/types.js";

function cleanEnvValue(value: string | undefined): string {
  const v = String(value || "").trim();
  return /^your_.+_here$/i.test(v) ? "" : v;
}

const VAPID_PUBLIC_KEY = cleanEnvValue(process.env.VAPID_PUBLIC_KEY);
const VAPID_PRIVATE_KEY = cleanEnvValue(process.env.VAPID_PRIVATE_KEY);
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@family-organizer.local";

let configured = false;
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  try {
    setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    configured = true;
    console.log("Web Push: VAPID đã cấu hình — thông báo đẩy BẬT.");
  } catch (e) {
    console.warn(`VAPID không hợp lệ — thông báo đẩy TẮT: ${e instanceof Error ? e.message : String(e)}`);
  }
} else {
  console.log("Web Push: chưa có VAPID keys — thông báo đẩy TẮT (đặt VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY trong .env).");
}

export function isPushConfigured(): boolean {
  return configured;
}

export function getVapidPublicKey(): string {
  return configured ? VAPID_PUBLIC_KEY : "";
}

// Map a notification type → the in-app tab id, so tapping the banner deep-links there.
function tabForNotification(notif: Notification): string {
  switch (notif.type) {
    case "task": return "tasks";
    case "plan": return "plans";
    case "finance": return "finance";
    case "medication": return "medications";
    case "note": return "notes";
    default: return "dashboard";
  }
}

function unreadCountFor(db: FamilyOrganizerDB, userId: string): number {
  return db.notifications.filter(n => (n.userId === "all" || n.userId === userId) && !n.isRead).length;
}

// Send one payload to one subscription. Returns "ok" | "dead" | "error".
async function sendOne(sub: PushSubscriptionRecord, payload: string): Promise<"ok" | "dead" | "error"> {
  try {
    await sendNotification(sub.subscription, payload);
    return "ok";
  } catch (err: any) {
    const code = err?.statusCode;
    // 404/410 = subscription expired or unsubscribed → safe to delete.
    if (code === 404 || code === 410) return "dead";
    console.error("Gửi push thất bại:", code || err?.message || err);
    return "error";
  }
}

// Fire push for a freshly-created notification to every recipient device.
// Fire-and-forget friendly; expired subscriptions are reported via onDead.
export async function dispatchPush(
  db: FamilyOrganizerDB,
  notif: Notification,
  onDead?: (deadEndpoints: string[]) => void,
  excludeUserId?: string
): Promise<number> {
  if (!configured) return 0;
  const subs = db.pushSubscriptions || [];
  const targets = subs.filter(s =>
    (notif.userId === "all" || s.userId === notif.userId) && s.userId !== excludeUserId
  );
  if (targets.length === 0) return 0;

  const tab = tabForNotification(notif);
  const dead: string[] = [];
  let sent = 0;

  await Promise.all(targets.map(async (t) => {
    const payload = JSON.stringify({
      title: notif.title,
      body: notif.content,
      tag: notif.id,
      tab,
      badge: unreadCountFor(db, t.userId),
    });
    const result = await sendOne(t, payload);
    if (result === "ok") sent++;
    else if (result === "dead") dead.push(t.endpoint);
  }));

  if (dead.length && onDead) {
    try { onDead(dead); } catch (e) { console.error("Dọn subscription hỏng lỗi:", e); }
  }
  return sent;
}

// One-off test notification to all of a single user's devices.
export async function sendTestPush(
  subs: PushSubscriptionRecord[],
  userId: string,
  onDead?: (deadEndpoints: string[]) => void
): Promise<number> {
  if (!configured) return 0;
  const targets = (subs || []).filter(s => s.userId === userId);
  const dead: string[] = [];
  let sent = 0;
  const payload = JSON.stringify({
    title: "🔔 Thông báo thử",
    body: "Tuyệt vời! Thiết bị này đã nhận được thông báo đẩy từ Family Organizer.",
    tag: `test-${Date.now()}`,
    tab: "dashboard",
    badge: 1,
  });
  await Promise.all(targets.map(async (t) => {
    const result = await sendOne(t, payload);
    if (result === "ok") sent++;
    else if (result === "dead") dead.push(t.endpoint);
  }));
  if (dead.length && onDead) { try { onDead(dead); } catch { /* ignore */ } }
  return sent;
}
