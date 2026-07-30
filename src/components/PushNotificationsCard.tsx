/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Button } from "./ui";
import React, { useState, useEffect } from "react";
import { BellRing, BellOff, Send, Loader2, AlertCircle, CheckCircle2, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
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
        setMsg({ kind: "err", text: t("pushNotifications.errPermDenied") });
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const keyRes = await fetch("/api/push/vapid-public-key");
      const keyData = await keyRes.json().catch(() => ({}));
      if (!keyData.publicKey) {
        setMsg({ kind: "err", text: t("pushNotifications.errVapidMissing") });
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
      if (!res.ok) throw new Error(t("pushNotifications.errSaveSubscription"));
      setSubscribed(true);
      setMsg({ kind: "ok", text: t("pushNotifications.okEnabled") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("pushNotifications.errEnable") });
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
      setMsg({ kind: "info", text: t("pushNotifications.okDisabled") });
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("pushNotifications.errDisable") });
    } finally {
      setBusy(false);
    }
  };

  const sendTest = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/push/test", { method: "POST", headers: authHeaders() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("pushNotifications.errSendTest"));
      if (!data.sent) {
        setMsg({ kind: "info", text: t("pushNotifications.infoTestNoDevice") });
      } else {
        setMsg({ kind: "ok", text: t("pushNotifications.okTestSent", { n: data.sent }) });
      }
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("pushNotifications.errSendTest") });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-slate-950 p-4.5 rounded-2xl neu-pressed-sm space-y-4">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
          <BellRing className="w-4.5 h-4.5 text-indigo-400" /> {t("pushNotifications.title")}
        </h3>
        {subscribed && (
          <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-semibold">
            {t("pushNotifications.activeBadge")}
          </span>
        )}
      </div>

      <p className="text-xs text-slate-400 leading-relaxed">
        {t("pushNotifications.description")}
      </p>

      {!SUPPORTED ? (
        <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{t("pushNotifications.notSupported")}</span>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!subscribed ? (
              <Button
                type="button"
                onClick={enable}
                disabled={busy}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-bold cursor-pointer transition-all"
              >
                {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />} {t("pushNotifications.enableBtn")}
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  onClick={sendTest}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/20 rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:opacity-60"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("pushNotifications.sendTestBtn")}
                </Button>
                <Button
                  type="button"
                  onClick={disable}
                  disabled={busy}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-rose-400 neu-btn rounded-xl text-xs font-semibold cursor-pointer transition-all disabled:opacity-60"
                >
                  <BellOff className="w-4 h-4" /> {t("pushNotifications.disableBtn")}
                </Button>
              </>
            )}
          </div>

          {perm === "denied" && (
            <div className="flex items-start gap-2 text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{t("pushNotifications.permBlocked")}</span>
            </div>
          )}

          <p className="flex items-start gap-1.5 text-[10px] text-slate-500 leading-relaxed">
            <Smartphone className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            {t("pushNotifications.iphoneNote")}
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
