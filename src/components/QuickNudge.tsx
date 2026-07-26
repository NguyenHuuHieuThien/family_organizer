/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Megaphone, Send, Loader2, Users, AlertCircle, CheckCircle2 } from "lucide-react";
import { User, UserRole } from "../types.js";
import { Avatar } from "./Avatar.js";

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("family_token");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

interface QuickNudgeProps {
  currentUser: User;
  users: User[];
}

export function QuickNudge({ currentUser, users }: QuickNudgeProps) {
  const { t } = useTranslation();
  const recipients = users.filter(u => u.id !== currentUser.id && !u.isDeleted);
  const [recipient, setRecipient] = useState<string | null>(null);
  const [custom, setCustom] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Guests can only receive, never send. Also hide when there's nobody to nudge.
  if (currentUser.role === UserRole.GUEST || recipients.length === 0) return null;

  const PRESETS = [t("dashboard.quickNudge.preset1"), t("dashboard.quickNudge.preset2")];

  const givenName = (full: string) => full.trim().split(/\s+/).pop() || full;
  const recipientLabel = recipient === "all"
    ? t("dashboard.quickNudge.recipientAll")
    : recipients.find(u => u.id === recipient)?.fullName || "";

  const send = async (message: string) => {
    const text = message.trim();
    if (!recipient) { setMsg({ kind: "err", text: t("dashboard.quickNudge.errNoRecipient") }); return; }
    if (!text) { setMsg({ kind: "err", text: t("dashboard.quickNudge.errEmptyMsg") }); return; }
    setBusy(true); setMsg(null);
    try {
      const res = await fetch("/api/notifications/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ toUserId: recipient, message: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t("dashboard.quickNudge.errSendFailed"));
      setMsg({ kind: "ok", text: t("dashboard.quickNudge.sentOk", { name: recipientLabel }) });
      setCustom("");
    } catch (e: any) {
      setMsg({ kind: "err", text: e?.message || t("dashboard.quickNudge.errSendFailed") });
    } finally {
      setBusy(false);
    }
  };

  const chipBase = "flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border text-xs font-semibold cursor-pointer transition-all shrink-0";

  return (
    <div className="bg-slate-900 neu-raised rounded-2xl p-5 space-y-4" id="quick-nudge">
      <div className="flex items-center gap-2">
        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/20 p-1.5 rounded-lg leading-none">
          <Megaphone className="w-4.5 h-4.5" />
        </span>
        <div>
          <h3 className="text-sm font-bold text-slate-200">{t("dashboard.quickNudge.title")}</h3>
          <p className="text-[11px] text-slate-500">{t("dashboard.quickNudge.subtitle")}</p>
        </div>
      </div>

      {/* Recipient picker */}
      <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
        <button
          type="button"
          onClick={() => setRecipient("all")}
          className={`${chipBase} ${recipient === "all" ? "bg-amber-500/15 border-amber-500/40 text-amber-300" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"}`}
        >
          <span className="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
            <Users className="w-3.5 h-3.5" />
          </span>
          {t("dashboard.quickNudge.recipientAll")}
        </button>
        {recipients.map(u => (
          <button
            key={u.id}
            type="button"
            onClick={() => setRecipient(u.id)}
            className={`${chipBase} ${recipient === u.id ? "bg-sky-500/15 border-sky-500/40 text-sky-300" : "bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700"}`}
          >
            <Avatar user={u} className="w-6 h-6 rounded-lg text-[10px]" extraClass="shrink-0" />
            {givenName(u.fullName)}
          </button>
        ))}
      </div>

      {/* Preset quick messages */}
      <div className="flex flex-wrap gap-2">
        {PRESETS.map(p => (
          <button
            key={p}
            type="button"
            disabled={busy}
            onClick={() => send(p)}
            className="px-3 py-1.5 bg-slate-950 hover:bg-slate-800 neu-btn hover:border-sky-500/40 text-slate-300 rounded-lg text-xs font-medium cursor-pointer transition-all disabled:opacity-50"
          >
            {p}
          </button>
        ))}
      </div>

      {/* Custom message */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={custom}
          maxLength={300}
          onChange={(e) => setCustom(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !busy) send(custom); }}
          placeholder={t("dashboard.quickNudge.customPlaceholder")}
          className="flex-1 min-w-0 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-sky-500"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => send(custom)}
          className="flex items-center gap-1.5 px-3.5 py-2 bg-sky-500 hover:bg-sky-400 disabled:opacity-60 disabled:cursor-not-allowed text-slate-950 rounded-xl text-xs font-bold cursor-pointer transition-all shrink-0"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} {t("dashboard.quickNudge.sendBtn")}
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-[11px] rounded-lg p-2.5 border ${
          msg.kind === "ok"
            ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
            : "text-rose-400 bg-rose-500/10 border-rose-500/20"
        }`}>
          {msg.kind === "ok" ? <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}
    </div>
  );
}
