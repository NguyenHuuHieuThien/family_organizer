/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Image as ImageIcon, MessageCircle, Mic, Paperclip, Phone, PhoneOff, Send, Trash2, Video, X } from "lucide-react";
import { Button, Textarea } from "./ui";
import { Avatar } from "./Avatar.js";
import { FancySelect } from "./FancySelect.js";
import { FamilyChatAttachment, FamilyChatMessage, User, UserRole } from "../types.js";
import { uploadDataUrl } from "../utils/uploadImage.js";

interface FamilyChatProps {
  currentUser: User;
  users: User[];
  messages: FamilyChatMessage[];
  authHeaders: Record<string, string>;
  callSignal?: CallSignal | null;
  onSendMessage: (content: string, attachments?: FamilyChatAttachment[]) => Promise<any>;
  onDeleteMessage: (id: string) => Promise<any>;
}

interface PendingAttachment {
  id: string;
  file: File;
  previewUrl: string;
  kind: FamilyChatAttachment["kind"];
}

type CallMode = "audio" | "video";
type CallStatus = "idle" | "calling" | "ringing" | "connecting" | "in-call";
interface IncomingCall { callId: string; mode: CallMode; fromUserId: string; fromUserName: string }
interface ActiveCall { callId: string; mode: CallMode; peerUserId: string; initiator: boolean }
interface CallSignal {
  callId: string;
  type: "invite" | "accept" | "decline" | "offer" | "answer" | "ice" | "end";
  mode: CallMode;
  fromUserId: string;
  fromUserName?: string;
  targetUserId?: string;
  payload?: any;
}

function formatChatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });
  if (sameDay) return time;
  return `${d.toLocaleDateString("vi-VN", { day: "2-digit", month: "2-digit" })} ${time}`;
}

function kindFromMime(mime: string): PendingAttachment["kind"] {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "file";
}

function kindIcon(kind: PendingAttachment["kind"]) {
  switch (kind) {
    case "image": return ImageIcon;
    case "video": return Video;
    default: return FileText;
  }
}

function attachmentLabel(a: FamilyChatAttachment): string {
  if (a.kind === "image") return "Ảnh";
  if (a.kind === "video") return "Video";
  if (a.kind === "audio") return "Âm thanh";
  return "Tệp";
}

async function fileToDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Không đọc được tệp ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function isImageAttachment(att: FamilyChatAttachment): boolean {
  return att.kind === "image" || att.mimeType.startsWith("image/");
}

function isVideoAttachment(att: FamilyChatAttachment): boolean {
  return att.kind === "video" || att.mimeType.startsWith("video/");
}

function isAudioAttachment(att: FamilyChatAttachment): boolean {
  return att.kind === "audio" || att.mimeType.startsWith("audio/");
}

function newCallId(): string {
  return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function callStatusLabel(status: CallStatus): string {
  switch (status) {
    case "calling": return "Đang gọi";
    case "ringing": return "Cuộc gọi đến";
    case "connecting": return "Đang kết nối";
    case "in-call": return "Đang trong cuộc gọi";
    default: return "Sẵn sàng";
  }
}

export function FamilyChat({ currentUser, users, messages, authHeaders, callSignal, onSendMessage, onDeleteMessage }: FamilyChatProps) {
  const [content, setContent] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [callTargetId, setCallTargetId] = useState("");
  const [callStatus, setCallStatus] = useState<CallStatus>("idle");
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [callError, setCallError] = useState("");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [localStreamState, setLocalStreamState] = useState<MediaStream | null>(null);

  const endRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const incomingCallRef = useRef<IncomingCall | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const queuedIceRef = useRef<RTCIceCandidateInit[]>([]);
  const canSend = currentUser.role !== UserRole.GUEST;

  const usersById = useMemo(() => new Map(users.map(u => [u.id, u])), [users]);
  const callableUsers = useMemo(() => users.filter(u => !u.isDeleted && u.id !== currentUser.id && u.role !== UserRole.GUEST), [users, currentUser.id]);
  const sorted = useMemo(() => [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()), [messages]);

  useEffect(() => {
    if (!callTargetId && callableUsers[0]) setCallTargetId(callableUsers[0].id);
  }, [callTargetId, callableUsers]);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  useEffect(() => {
    incomingCallRef.current = incomingCall;
  }, [incomingCall]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [sorted.length]);

  useEffect(() => {
    return () => { pending.forEach(a => URL.revokeObjectURL(a.previewUrl)); };
  }, [pending]);

  useEffect(() => {
    if (localVideoRef.current) localVideoRef.current.srcObject = localStreamState;
  }, [localStreamState]);

  useEffect(() => {
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  const sendCallSignal = async (signal: Omit<CallSignal, "fromUserId" | "fromUserName">) => {
    const res = await fetch("/api/chat/call-signal", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders },
      body: JSON.stringify(signal)
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "Không gửi được tín hiệu call.");
    }
  };

  const cleanupCall = (notify = false) => {
    const call = activeCallRef.current;
    if (notify && call) {
      void sendCallSignal({ callId: call.callId, type: "end", mode: call.mode, targetUserId: call.peerUserId }).catch(() => undefined);
    }
    pcRef.current?.close();
    pcRef.current = null;
    queuedIceRef.current = [];
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStreamState(null);
    setRemoteStream(null);
    setActiveCall(null);
    activeCallRef.current = null;
    setIncomingCall(null);
    setCallStatus("idle");
  };

  const ensureLocalStream = async (mode: CallMode): Promise<MediaStream> => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: mode === "video" });
    localStreamRef.current = stream;
    setLocalStreamState(stream);
    return stream;
  };

  const makePeer = async (call: ActiveCall): Promise<RTCPeerConnection> => {
    if (pcRef.current) return pcRef.current;
    const stream = await ensureLocalStream(call.mode);
    const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        void sendCallSignal({ callId: call.callId, type: "ice", mode: call.mode, targetUserId: call.peerUserId, payload: event.candidate.toJSON() }).catch(() => undefined);
      }
    };
    pc.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) setRemoteStream(stream);
      setCallStatus("in-call");
    };
    pc.onconnectionstatechange = () => {
      if (["connected", "completed"].includes(pc.connectionState)) setCallStatus("in-call");
      if (["failed", "disconnected", "closed"].includes(pc.connectionState)) {
        if (pc.connectionState !== "disconnected") cleanupCall(false);
      }
    };
    pcRef.current = pc;
    return pc;
  };

  const flushQueuedIce = async () => {
    const pc = pcRef.current;
    if (!pc || !pc.remoteDescription) return;
    const queue = queuedIceRef.current.splice(0);
    for (const c of queue) await pc.addIceCandidate(new RTCIceCandidate(c));
  };

  const startCall = async (mode: CallMode) => {
    if (!canSend || callStatus !== "idle") return;
    const targetId = callTargetId || callableUsers[0]?.id;
    if (!targetId) {
      setCallError("Chưa có thành viên nào để gọi.");
      return;
    }
    setCallError("");
    try {
      const call: ActiveCall = { callId: newCallId(), mode, peerUserId: targetId, initiator: true };
      await ensureLocalStream(mode);
      setActiveCall(call);
      activeCallRef.current = call;
      setCallStatus("calling");
      await sendCallSignal({ callId: call.callId, type: "invite", mode, targetUserId: targetId });
    } catch (err: any) {
      cleanupCall(false);
      setCallError(err.message || "Không mở được camera/micro.");
    }
  };

  const acceptCall = async () => {
    if (!incomingCall) return;
    setCallError("");
    try {
      const call: ActiveCall = { callId: incomingCall.callId, mode: incomingCall.mode, peerUserId: incomingCall.fromUserId, initiator: false };
      await ensureLocalStream(incomingCall.mode);
      setActiveCall(call);
      activeCallRef.current = call;
      setCallStatus("connecting");
      setIncomingCall(null);
      await makePeer(call);
      await sendCallSignal({ callId: call.callId, type: "accept", mode: call.mode, targetUserId: call.peerUserId });
    } catch (err: any) {
      cleanupCall(false);
      setCallError(err.message || "Không nhận được cuộc gọi.");
    }
  };

  const declineCall = async () => {
    if (!incomingCall) return;
    await sendCallSignal({ callId: incomingCall.callId, type: "decline", mode: incomingCall.mode, targetUserId: incomingCall.fromUserId }).catch(() => undefined);
    setIncomingCall(null);
    setCallStatus("idle");
  };

  const handleCallSignal = async (signal: CallSignal) => {
    if (!signal || signal.fromUserId === currentUser.id) return;
    if (signal.targetUserId && signal.targetUserId !== currentUser.id) return;

    if (signal.type === "invite") {
      const currentIncoming = incomingCallRef.current;
      if (currentIncoming?.callId === signal.callId) return;
      if (currentIncoming) return;
      if (activeCallRef.current) {
        await sendCallSignal({ callId: signal.callId, type: "decline", mode: signal.mode, targetUserId: signal.fromUserId }).catch(() => undefined);
        return;
      }
      setIncomingCall({ callId: signal.callId, mode: signal.mode, fromUserId: signal.fromUserId, fromUserName: signal.fromUserName || usersById.get(signal.fromUserId)?.fullName || "Thành viên" });
      setCallStatus("ringing");
      return;
    }

    const currentIncoming = incomingCallRef.current;
    if (currentIncoming?.callId === signal.callId && signal.fromUserId === currentIncoming.fromUserId) {
      if (signal.type === "end" || signal.type === "decline") {
        setIncomingCall(null);
        incomingCallRef.current = null;
        setCallStatus("idle");
        setCallError(signal.type === "end" ? "Người gọi đã kết thúc cuộc gọi." : "Cuộc gọi đã bị hủy.");
      }
      return;
    }

    const call = activeCallRef.current;
    if (!call || call.callId !== signal.callId) return;
    if (signal.fromUserId !== call.peerUserId) return;

    if (signal.type === "decline" || signal.type === "end") {
      cleanupCall(false);
      setCallError(signal.type === "decline" ? "Người nhận đã từ chối cuộc gọi." : "Cuộc gọi đã kết thúc.");
      return;
    }

    if (signal.type === "accept" && call.initiator) {
      setCallStatus("connecting");
      const pc = await makePeer(call);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await sendCallSignal({ callId: call.callId, type: "offer", mode: call.mode, targetUserId: call.peerUserId, payload: offer });
      return;
    }

    if (signal.type === "offer") {
      const pc = await makePeer(call);
      await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushQueuedIce();
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await sendCallSignal({ callId: call.callId, type: "answer", mode: call.mode, targetUserId: call.peerUserId, payload: answer });
      return;
    }

    if (signal.type === "answer") {
      const pc = pcRef.current;
      if (pc) {
        await pc.setRemoteDescription(new RTCSessionDescription(signal.payload));
        await flushQueuedIce();
      }
      return;
    }

    if (signal.type === "ice") {
      const pc = pcRef.current;
      if (!pc || !pc.remoteDescription) queuedIceRef.current.push(signal.payload);
      else await pc.addIceCandidate(new RTCIceCandidate(signal.payload));
    }
  };

  useEffect(() => {
    if (!callSignal) return;
    void handleCallSignal(callSignal);
  }, [callSignal]);

  useEffect(() => () => cleanupCall(true), []);

  const clearPending = () => {
    pending.forEach(a => URL.revokeObjectURL(a.previewUrl));
    setPending([]);
  };

  const addFiles = async (files: File[]) => {
    if (!canSend) return;
    const accepted = files.filter(f => f.type.startsWith("image/") || f.type.startsWith("video/") || f.type.startsWith("audio/") || /\.(pdf|txt|csv|zip|docx?|xlsx?|pptx?)$/i.test(f.name));
    if (accepted.length === 0) return;
    setError("");
    setUploadingFiles(true);
    try {
      const next = accepted.slice(0, Math.max(0, 6 - pending.length)).map(file => ({
        id: `pending_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        kind: kindFromMime(file.type)
      }));
      if (pending.length + accepted.length > 6) setError("Mỗi tin nhắn đính kèm tối đa 6 tệp.");
      setPending(prev => [...prev, ...next]);
    } catch (err: any) {
      setError(err.message || "Không thêm được tệp.");
    } finally {
      setUploadingFiles(false);
    }
  };

  const removePending = (id: string) => {
    setPending(prev => {
      const found = prev.find(x => x.id === id);
      if (found) URL.revokeObjectURL(found.previewUrl);
      return prev.filter(x => x.id !== id);
    });
  };

  const send = async () => {
    const msg = content.trim();
    if ((!msg && pending.length === 0) || sending || !canSend) return;
    setError("");
    setSending(true);
    try {
      const attachments: FamilyChatAttachment[] = [];
      for (const item of pending) {
        const dataUrl = await fileToDataUrl(item.file);
        const url = await uploadDataUrl(dataUrl, "chat");
        attachments.push({
          id: `chatatt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          fileName: item.file.name,
          url,
          mimeType: item.file.type || "application/octet-stream",
          sizeKb: Math.max(1, Math.round(item.file.size / 1024)),
          kind: item.kind
        });
      }
      await onSendMessage(msg, attachments);
      setContent("");
      clearPending();
    } catch (err: any) {
      setError(err.message || "Không gửi được tin nhắn.");
    } finally {
      setSending(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await onDeleteMessage(id);
    } catch (err: any) {
      setError(err.message || "Không xóa được tin nhắn.");
    }
  };

  const callPeer = activeCall ? usersById.get(activeCall.peerUserId) : null;
  const callPeerName = callPeer?.fullName || "Thành viên";
  const incomingCaller = incomingCall ? usersById.get(incomingCall.fromUserId) : null;
  const incomingModeLabel = incomingCall?.mode === "video" ? "Cuộc gọi video đến" : "Cuộc gọi thoại đến";
  const activeModeLabel = activeCall?.mode === "video" ? "Video" : "Thoại";

  return (
    <div className="h-[calc(100vh-8.5rem)] min-h-[560px] flex flex-col gap-4" id="family-chat-module">
      <input ref={fileInputRef} type="file" multiple className="hidden" accept="image/*,video/*,audio/*,.pdf,.txt,.csv,.zip,.doc,.docx,.xls,.xlsx,.ppt,.pptx" onChange={(e) => { void addFiles(Array.from(e.target.files || [])); e.currentTarget.value = ""; }} />

      <div className="bg-slate-900 neu-raised rounded-2xl border border-slate-800/70 p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2"><MessageCircle className="w-5 h-5 text-sky-400" /> Chat gia đình</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">{sorted.length} tin nhắn gần nhất</p>
          </div>
          <div className="flex -space-x-2 shrink-0">{users.filter(u => !u.isDeleted).slice(0, 5).map(u => <Avatar key={u.id} user={u} className="size-8 rounded-full text-xs ring-2 ring-slate-900" />)}</div>
        </div>

        {canSend && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl bg-slate-950/60 border border-slate-800 p-2">
            <div className="min-w-0 flex-1">
              <FancySelect
                value={callTargetId}
                onChange={setCallTargetId}
                disabled={callStatus !== "idle"}
                ariaLabel="Chọn người để gọi"
                options={callableUsers.length === 0 ? [{ value: "", label: "Không có người để gọi" }] : callableUsers.map(u => ({ value: u.id, label: u.fullName }))}
              />
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" onClick={() => void startCall("audio")} disabled={callStatus !== "idle" || !callTargetId} className="h-9 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white px-3"><Phone className="size-4" /> Gọi</Button>
              <Button type="button" onClick={() => void startCall("video")} disabled={callStatus !== "idle" || !callTargetId} className="h-9 rounded-lg bg-sky-500 hover:bg-sky-600 text-white px-3"><Video className="size-4" /> Video</Button>
            </div>
          </div>
        )}

        {callError && <p className="text-xs text-rose-400">{callError}</p>}
        {incomingCall && typeof document !== "undefined" && createPortal(
          <div className="fixed inset-0 z-[2147483647] flex items-center justify-center bg-slate-950/95 px-4 py-6 backdrop-blur-xl">
            <div className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-slate-700 bg-slate-900 shadow-[0_30px_120px_rgba(0,0,0,0.65)]">
              <div className="absolute inset-x-0 top-0 h-1 bg-sky-400/80" />
              <div className="absolute -left-16 top-10 size-40 rounded-full bg-sky-500/15 blur-3xl" />
              <div className="absolute -right-12 bottom-8 size-40 rounded-full bg-emerald-500/10 blur-3xl" />
              <div className="relative border-b border-slate-800 px-7 pb-6 pt-7">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.25em] text-sky-300/80">Cuộc gọi đến</p>
                    <div className="mt-2 text-2xl font-semibold text-slate-50">{incomingModeLabel}</div>
                  </div>
                  <div className="rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-[11px] font-medium text-sky-200">
                    {callStatusLabel(callStatus)}
                  </div>
                </div>
                <div className="mt-6 flex items-center gap-5">
                  <div className="relative shrink-0">
                    <div className="absolute inset-0 rounded-full bg-sky-400/15 animate-ping" />
                    <div className="absolute inset-[-10px] rounded-full border border-sky-400/20" />
                    <div className="relative flex size-20 items-center justify-center rounded-full border border-sky-400/35 bg-slate-950 text-2xl font-semibold text-sky-100">
                      {incomingCaller?.fullName?.[0] || incomingCall.fromUserName[0] || "?"}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-2xl font-semibold text-slate-50">{incomingCall.fromUserName}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-400">Đang chờ bạn phản hồi. Nếu nhận, cuộc gọi sẽ mở ngay trên màn hình này.</p>
                  </div>
                </div>
              </div>
              <div className="relative px-7 py-6">
                <div className="grid gap-3 rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-sm text-slate-300 sm:grid-cols-2">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-sky-500/15 text-sky-200"><Phone className="size-4" /></div>
                    <div>
                      <div className="font-medium text-slate-100">Loại cuộc gọi</div>
                      <div className="text-xs text-slate-500">{incomingCall.mode === "video" ? "Video call" : "Thoại"}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200"><Mic className="size-4" /></div>
                    <div>
                      <div className="font-medium text-slate-100">Trạng thái</div>
                      <div className="text-xs text-slate-500">Đang đổ chuông</div>
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button onClick={() => void declineCall()} className="h-14 justify-center rounded-2xl bg-rose-500 text-white shadow-lg shadow-rose-950/40 hover:bg-rose-600" aria-label="Từ chối cuộc gọi">
                    <PhoneOff className="size-5" /> Từ chối
                  </Button>
                  <Button onClick={() => void acceptCall()} className="h-14 justify-center rounded-2xl bg-emerald-500 text-white shadow-lg shadow-emerald-950/40 hover:bg-emerald-600" aria-label="Nhận cuộc gọi">
                    {incomingCall.mode === "video" ? <Video className="size-5" /> : <Phone className="size-5" />}
                    Nhận cuộc gọi
                  </Button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
        {activeCall && (
          <div className="rounded-3xl border border-slate-800 bg-slate-950 p-4 space-y-4 shadow-lg shadow-black/20">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-[11px] uppercase tracking-[0.2em] text-slate-500">{activeModeLabel}</p>
                <div className="mt-1 truncate text-sm font-medium text-slate-100">
                  {callStatusLabel(callStatus)} với {callPeerName}
                </div>
              </div>
              <Button onClick={() => cleanupCall(true)} className="w-full justify-center rounded-full bg-rose-500 px-4 py-2 text-white hover:bg-rose-600 sm:w-auto">
                <PhoneOff className="size-4" /> Kết thúc
              </Button>
            </div>

            {activeCall.mode === "video" ? (
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1.5fr)_minmax(220px,0.7fr)]">
                <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <video ref={remoteVideoRef} autoPlay playsInline className="absolute inset-0 h-full w-full object-cover" />
                  {!remoteStream && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/70 text-sm text-slate-400">
                      <span className="flex items-center gap-2"><Mic className="size-4" /> Chờ người bên kia...</span>
                    </div>
                  )}
                </div>
                <div className="relative min-h-[220px] overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
                  <video ref={localVideoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" />
                  <div className="absolute left-3 top-3 rounded-full border border-slate-700 bg-slate-950/80 px-2.5 py-1 text-[11px] text-slate-300">Bạn</div>
                  {!localStreamState && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-950/50 text-xs text-slate-400">Đang bật camera...</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
                <audio ref={remoteAudioRef} autoPlay />
                <div className="flex items-center gap-4">
                  <div className="flex size-14 items-center justify-center rounded-2xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-200">
                    <Phone className="size-6" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-base font-semibold text-slate-100">{callPeerName}</div>
                    <p className="mt-1 text-sm text-slate-400">Cuộc gọi thoại đang hoạt động</p>
                  </div>
                  <div className="hidden sm:block rounded-full border border-slate-700 bg-slate-950 px-3 py-1.5 text-xs text-slate-300">
                    {callStatusLabel(callStatus)}
                  </div>
                </div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-full bg-sky-500/15 text-sky-200"><Mic className="size-5" /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100">Micro của bạn</div>
                        <div className="text-xs text-slate-500">Đang phát âm thanh hai chiều</div>
                      </div>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-200"><Phone className="size-5" /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-100">Đầu dây bên kia</div>
                        <div className="text-xs text-slate-500">Âm thanh sẽ phát tự động</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto rounded-2xl border border-slate-800/70 bg-slate-950/60 p-3 md:p-4 space-y-3">
        {sorted.length === 0 ? <div className="h-full min-h-72 flex items-center justify-center text-center"><p className="text-sm text-slate-500">Chưa có tin nhắn nào.</p></div> : sorted.map(msg => {
          const sender = usersById.get(msg.senderId); const mine = msg.senderId === currentUser.id; const canDelete = mine || currentUser.role === UserRole.ADMIN;
          return <div key={msg.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>{!mine && sender && <Avatar user={sender} className="size-8 rounded-full text-xs" />}<div className={`max-w-[86%] sm:max-w-[72%] ${mine ? "items-end" : "items-start"} flex flex-col gap-1`}><div className={`flex items-center gap-2 ${mine ? "flex-row-reverse" : ""}`}><span className="text-[10px] text-slate-500 truncate max-w-36">{mine ? "Bạn" : sender?.fullName || "Thành viên"}</span><span className="text-[10px] text-slate-600 tabular-nums">{formatChatTime(msg.createdAt)}</span></div><div className={`group relative rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ${mine ? "bg-sky-500 text-white rounded-br-md" : "bg-slate-900 text-slate-100 border border-slate-800 rounded-bl-md"}`}>{msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}{msg.attachments && msg.attachments.length > 0 && <div className="mt-2 space-y-2">{msg.attachments.map(att => { if (isImageAttachment(att)) return <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-white/10 bg-black/10"><img src={att.url} alt={att.fileName} className="max-h-72 w-full object-cover" /><div className="px-2 py-1 text-[10px] opacity-90 truncate">{att.fileName}</div></a>; if (isVideoAttachment(att)) return <a key={att.id} href={att.url} target="_blank" rel="noreferrer" className="block rounded-xl border border-white/10 bg-black/10 overflow-hidden"><video src={att.url} controls className="w-full max-h-72 bg-black" /><div className="px-2 py-1 text-[10px] opacity-90 truncate">{att.fileName}</div></a>; if (isAudioAttachment(att)) return <div key={att.id} className="rounded-xl border border-white/10 bg-black/10 p-2"><div className="text-[10px] opacity-90 truncate mb-1">{att.fileName}</div><audio src={att.url} controls className="w-full" /></div>; return <a key={att.id} href={att.url} download={att.fileName} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/10 px-3 py-2 hover:bg-black/20"><FileText className="size-4 shrink-0" /><span className="min-w-0 text-xs truncate">{att.fileName}</span><span className="text-[10px] opacity-80 shrink-0">{attachmentLabel(att)}</span></a>; })}</div>}{canDelete && <Button type="button" onClick={() => void remove(msg.id)} className={`absolute -top-2 ${mine ? "-left-8" : "-right-8"} size-7 rounded-full bg-slate-900 border border-slate-800 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 focus:opacity-100`} title="Xóa tin nhắn"><Trash2 className="size-3.5" /></Button>}</div></div>{mine && <Avatar user={currentUser} className="size-8 rounded-full text-xs" />}</div>;
        })}<div ref={endRef} />
      </div>

      <div className="bg-slate-900 neu-raised rounded-2xl border border-slate-800/70 p-3">{error && <p className="text-sm text-rose-400 mb-2">{error}</p>}{pending.length > 0 && <div className="mb-3 flex flex-wrap gap-2">{pending.map(a => { const Icon = kindIcon(a.kind); return <div key={a.id} className="relative flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950 px-2 py-1.5 pr-8 max-w-full">{a.kind === "image" ? <img src={a.previewUrl} alt={a.file.name} className="size-8 rounded-lg object-cover shrink-0" /> : <Icon className="size-4 text-slate-400 shrink-0" />}<span className="text-xs text-slate-300 truncate max-w-48">{a.file.name}</span><button type="button" onClick={() => removePending(a.id)} className="absolute right-1.5 top-1/2 -translate-y-1/2 size-5 rounded-full text-slate-500 hover:text-rose-400 flex items-center justify-center" aria-label="Bỏ tệp"><X className="size-3.5" /></button></div>; })}</div>}<div className="flex items-end gap-2"><Textarea value={content} disabled={!canSend} onChange={(e) => setContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }} placeholder={canSend ? "Nhắn cho cả nhà..." : "Tài khoản Khách chỉ xem chat"} className="min-h-12 max-h-32 bg-slate-950 rounded-xl resize-none" /><Button type="button" onClick={() => fileInputRef.current?.click()} disabled={!canSend} className="size-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100"><Paperclip className="size-5" /></Button><Button type="button" onClick={() => void send()} disabled={(!content.trim() && pending.length === 0) || sending || uploadingFiles || !canSend} className="size-12 rounded-xl bg-sky-500 hover:bg-sky-600 text-white"><Send className="size-5" /></Button></div></div>
    </div>
  );
}
