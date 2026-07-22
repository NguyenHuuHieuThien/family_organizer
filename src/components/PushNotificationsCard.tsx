/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { BellRing, BellOff, Send, Loader2, AlertCircle, CheckCircle2, Smartphone } from "lucide-react";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("family_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// VAPID public key (URL-safe base64) → Uint8Array, required by pushManager.subscribe.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

const SUPPORTED =
  typeof window !== "undefined" &&
  "serviceWorker" in navigator &&
  "PushManager" in window &&
  "Notification" in window;

type Msg = { kind: "ok" | "err" | "info"; text: string };

export function PushNotificationsCard() {
  const [perm, setPerm] = useState<NotificationPermission>(SUPPORTED ? Notification.permission : "denied");
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);

  // Reflect the device's current subscription state on mount.
  useEffect(() => {
    if (!SUPPORTED) return;
    let alive = true;
    navigator.serviceWorker.ready
      .then(reg => reg.pushManager.getSubscription())
      .then(sub => { if (alive) setSubscribed(!!sub); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const enable = async () => {
    setBusy(true); setMsg(null);
    try {
      // Permission must be requested from a user gesture — this click qualifies (key on iOS).
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== "granted") {
        setMsg({ kind: "err", text: "Bạn chưa cho phép thông báo. Hãy bật quyền Thông báo cho app trong Cài đặt máy." });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyData = await keyRes.json().catch(() => ({}));
      if (!keyData.publicKey) {
        setMsg({ kind: "err", text: "Máy chủ chưa cấu hình thông báo đẩy (VAPID). Liên hệ quản trị để bật." });
        return;
      }
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
        });
      }
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ subscription: sub }),
      });
      if (!res.ok) throw new Error("Lưu đăng ký lên máy chủ thất bại.");
      setSubscribed(true);
      setMsg({ kind: "ok", text: "Đã bật thông báo trên thiết bị này! 🎉" });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Bật thông báo thất bại." });
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true); setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/unsubscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
      try { (navigator as any).clearAppBadge?.(); } catch { /* ignore */ }
      setMsg({ kind: "info", text: "Đã tắt thông báo trên thiết bị này." });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Tắt thông báo thất bại." });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Gửi thông báo thử thất bại.");
      if (!data.sent) {
        setMsg({ kind: "info", text: "Chưa gửi được tới thiết bị nào. Thử tắt rồi bật lại thông báo." });
      } else {
        setMsg({ kind: "ok", text: `Đã gửi tới ${data.sent} thiết bị. Kiểm tra màn hình khoá nhé!` });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || "Gửi thông báo thử thất bại." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-950 p-4.5 rounded-2xl neu-pressed-sm space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <BellRing className="w-4.5 h-4.5 text-indigo-400" /> Thông báo đẩy
        </h3>
        {subscribed && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            Đang bật
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        Nhận thông báo (việc mới, sự kiện, sinh nhật, nhắc nhở…) ngay trên màn hình khoá kèm số badge trên icon app — kể cả khi không mở app.
      </p>

      {!SUPPORTED ? (
        <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Thiết bị/trình duyệt này chưa hỗ trợ thông báo đẩy. Trên iPhone: mở app từ icon đã “Thêm vào MH chính” (cần iOS 16.4 trở lên).</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!subscribed ? (
              <button
                type="button"
                onClick={enable}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} Bật thông báo
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gửi thử
                </button>
                <button
                  type="button"
                  onClick={disable}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 neu-btn rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:opacity-60"
                >
                  <BellOff className="w-4 h-4" /> Tắt
                </button>
              </>
            )}
          </div>

          {perm === "denied" && (
            <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Quyền thông báo đang bị chặn. Vào Cài đặt máy → tìm app này → bật lại Thông báo.</span>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[10px] text-slate-500 leading-relaxed">
            <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            iPhone: mở từ icon đã cài (không phải tab Safari) và bật quyền một lần. Mỗi thiết bị bật riêng.
          </p>
        </>
      )}

      {msg && (
        <div
          className={`flex items-start gap-2 text-[11px] rounded-lg p-2.5 border ${
            msg.kind === "ok"
              ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
              : msg.kind === "err"
                ? "text-rose-400 bg-rose-500/10 border-rose-500/20"
                : "text-slate-300 bg-slate-800/40 border-slate-700/40"
          }`}
        >
          {msg.kind === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
