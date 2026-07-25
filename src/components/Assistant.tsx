/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, Loader2, Mic, MicOff, Send, ShoppingCart, X } from "lucide-react";
import { User } from "../types.js";
import { motion, AnimatePresence } from "motion/react";
import { useModalA11y } from "../hooks/useModalA11y.js";
import { useTranslation } from "react-i18next";

interface AssistantProps {
  currentUser: User;
  authHeaders: Record<string, string>;
}

interface AssistantShoppingItem {
  name: string;
  quantity?: string;
  note?: string;
}

interface AssistantAction {
  id: string;
  type: "create_shopping_items";
  title: string;
  items: AssistantShoppingItem[];
  status?: "pending" | "running" | "done" | "error";
  error?: string;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  actions?: AssistantAction[];
}

export function Assistant({ currentUser, authHeaders }: AssistantProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      role: "assistant",
      content: t("assistant.welcome", { name: currentUser.fullName })
    }
  ]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort?.();
      }
    };
  }, []);

  const panelRef = useRef<HTMLDivElement | null>(null);
  const closePanel = useCallback(() => setOpen(false), []);
  useModalA11y(open, closePanel, panelRef);

  const updateAction = (actionId: string, patch: Partial<AssistantAction>) => {
    setMessages(prev => prev.map(msg => {
      if (!msg.actions) return msg;
      return {
        ...msg,
        actions: msg.actions.map(action => action.id === actionId ? { ...action, ...patch } : action)
      };
    }));
  };

  const sendQuestion = async (rawQuestion: string) => {
    const question = rawQuestion.trim();
    if (!question || loading) return;

    setMessages(prev => [...prev, { role: "user", content: question }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ message: question })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t("assistant.errorBusy"));

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.answer || t("assistant.fallbackAnswer"),
        actions: Array.isArray(data.actions) ? data.actions : []
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: err.message || t("assistant.errorConnect")
      }]);
    } finally {
      setLoading(false);
    }
  };

  const ask = (e: React.FormEvent) => {
    e.preventDefault();
    void sendQuestion(input);
  };

  const startVoiceInput = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: t("assistant.voiceNotSupported")
      }]);
      return;
    }

    if (isListening) {
      recognitionRef.current?.stop?.();
      setIsListening(false);
      return;
    }

    const recognition = new Recognition();
    recognitionRef.current = recognition;
    recognition.lang = "vi-VN";
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);
    recognition.onend = () => setIsListening(false);
    recognition.onerror = (event: any) => {
      setIsListening(false);
      if (event?.error === "aborted") return;
      const message = event?.error === "not-allowed"
        ? t("assistant.voicePermission")
        : t("assistant.voiceNotClear");
      setMessages(prev => [...prev, { role: "assistant", content: message }]);
    };
    recognition.onresult = (event: any) => {
      const transcript = String(event?.results?.[0]?.[0]?.transcript || "").trim();
      if (!transcript) return;
      setInput(transcript);
      void sendQuestion(transcript);
    };

    recognition.start();
  };

  const runAction = async (action: AssistantAction) => {
    if (action.status === "running" || action.status === "done") return;

    updateAction(action.id, { status: "running", error: "" });

    try {
      if (action.type !== "create_shopping_items") {
        throw new Error(t("assistant.actionUnsupported"));
      }

      const items = action.items.filter(item => item.name.trim());
      if (items.length === 0) {
        throw new Error(t("assistant.actionNoItems"));
      }

      for (const item of items) {
        const res = await fetch("/api/shopping", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            name: item.name.trim(),
            quantity: item.quantity?.trim() || "",
            note: item.note?.trim() || t("assistant.actionAddNote")
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || t("assistant.actionAddError", { name: item.name }));
        }
      }

      updateAction(action.id, { status: "done", error: "" });
      setMessages(prev => [...prev, {
        role: "assistant",
        content: t("assistant.actionAdded", { n: items.length })
      }]);
    } catch (err: any) {
      updateAction(action.id, {
        status: "error",
        error: err.message || t("assistant.actionUnsupported")
      });
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] right-5 z-30 bg-sky-500 hover:bg-sky-400 text-slate-950 rounded-full w-12 h-12 shadow-2xl shadow-sky-500/20 flex items-center justify-center"
        title={t("assistant.title")}
      >
        <Bot className="w-5 h-5" />
      </button>

      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-slate-950/60 backdrop-blur-xs">
            <motion.div
              ref={panelRef}
              tabIndex={-1}
              initial={{ opacity: 0, y: 16, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 16, scale: 0.98 }}
              role="dialog"
              aria-modal="true"
              aria-label={t("assistant.dialogAria")}
              className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden outline-none"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Bot className="w-4 h-4 text-sky-400" />
                  <span className="text-sm font-bold text-slate-100">{t("assistant.title")}</span>
                </div>
                <button onClick={() => setOpen(false)} className="p-1.5 text-slate-400 hover:text-slate-100 bg-slate-950 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="h-96 overflow-y-auto p-4 space-y-3">
                {messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={`text-xs leading-relaxed rounded-2xl px-3 py-2 max-w-[88%] whitespace-pre-line ${msg.role === "user" ? "ml-auto bg-sky-500 text-slate-950 font-semibold" : "bg-slate-950 neu-pressed-sm text-slate-300"}`}
                  >
                    <div>{msg.content}</div>

                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 space-y-2 whitespace-normal">
                        {msg.actions.map(action => (
                          <div key={action.id} className="border border-slate-800 bg-slate-900/80 rounded-xl p-3 space-y-2">
                            <div className="flex items-start gap-2">
                              <ShoppingCart className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                              <div className="min-w-0 flex-1">
                                <p className="font-bold text-slate-100">{action.title}</p>
                                <ul className="mt-1 space-y-0.5 text-[11px] text-slate-400">
                                  {action.items.map((item, itemIndex) => (
                                    <li key={`${action.id}_${itemIndex}`} className="flex gap-1.5">
                                      <span className="text-slate-600">-</span>
                                      <span>
                                        {item.name}
                                        {item.quantity ? <span className="text-slate-500"> ({item.quantity})</span> : null}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>

                            {action.status === "error" && (
                              <div className="flex items-center gap-1.5 text-[11px] text-rose-400">
                                <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                <span>{action.error}</span>
                              </div>
                            )}

                            {action.status === "done" ? (
                              <div className="flex items-center gap-1.5 text-[11px] font-bold text-emerald-400">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                <span>{t("assistant.actionDone")}</span>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => void runAction(action)}
                                disabled={action.status === "running"}
                                className="w-full flex items-center justify-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-slate-950 rounded-lg px-3 py-2 text-[11px] font-bold transition-all cursor-pointer"
                              >
                                {action.status === "running" ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <ShoppingCart className="w-3.5 h-3.5" />
                                )}
                                {action.status === "running" ? t("assistant.actionAdding") : t("assistant.actionAddBtn", { n: action.items.length })}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {loading && <div className="text-xs text-slate-500">{t("assistant.thinking")}</div>}
              </div>

              <form onSubmit={ask} className="p-3 border-t border-slate-800 flex gap-2">
                <button
                  type="button"
                  onClick={startVoiceInput}
                  disabled={loading}
                  className={`shrink-0 rounded-xl px-3 py-2 border transition-all cursor-pointer disabled:opacity-60 ${isListening ? "bg-rose-500 text-slate-950 border-rose-400" : "bg-slate-950 text-slate-400 hover:text-slate-100 border-slate-800 hover:bg-slate-800"}`}
                  title={isListening ? t("assistant.voiceStopTitle") : t("assistant.voiceMicTitle")}
                >
                  {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                </button>
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={isListening ? t("assistant.inputListening") : t("assistant.inputPlaceholder")}
                  className="flex-1 bg-slate-950 neu-pressed-sm rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-sky-500 min-w-0"
                />
                <button disabled={loading} type="submit" className="bg-sky-500 hover:bg-sky-400 disabled:opacity-60 text-slate-950 rounded-xl px-3 py-2">
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
