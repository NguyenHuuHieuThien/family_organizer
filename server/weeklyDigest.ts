/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Bản tin tuần gia đình — gửi qua Telegram vào sáng thứ Hai (7h–10h).
// Tóm tắt: chi tiêu tuần qua, task trễ/sắp hạn, lịch & sinh nhật sắp tới,
// giấy tờ sắp hết hạn. Nếu có Gemini key thì dùng AI viết bản tin thân thiện;
// ngược lại gửi bản văn bản có cấu trúc sẵn.
//
// Cấu hình (cùng kho app_settings với Telegram backup):
//   telegramBotToken          — token bot
//   telegramChatId            — chat id nhận tin
//   telegramWeeklyDigestEnabled — "1" = bật
//   telegramWeeklyDigestLastSent — "YYYY-MM-DD" của thứ Hai đã gửi (dedupe)

import { FamilyDB, getAppSettings, setAppSetting } from "./db.js";
import { TaskStatus } from "../src/types.js";

// ─── HELPERS ────────────────────────────────────────────────────────────────

const CATEGORY_LABEL: Record<string, string> = {
  food: "Ăn uống", education2: "Học tập", utilities: "Điện nước",
  shopping: "Mua sắm", medical: "Y tế", transport: "Đi lại",
  debt_bank: "Trả nợ NH", debt_personal: "Trả nợ CN",
  funeral: "Ma chay", ceremony: "Hiếu hỉ",
  rent: "Thuê nhà", internet: "Cước Internet", phone: "Điện thoại",
  insurance: "Bảo hiểm", loan: "Trả nợ", other: "Khác"
};

const fmt = (n: number) =>
  n.toLocaleString("vi-VN") + "₫";

const localDateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Trả về "YYYY-MM-DD" của thứ Hai trong tuần chứa d */
function getMondayKey(d: Date): string {
  const day = d.getDay(); // 0=CN, 1=T2...
  const diff = day === 0 ? -6 : 1 - day;
  const mon = new Date(d);
  mon.setDate(d.getDate() + diff);
  return localDateKey(mon);
}

/** Số ngày giữa hai YYYY-MM-DD (a − b), b mặc định là hôm nay */
function daysDiff(dateStr: string, from: Date): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  return Math.round((target.getTime() - base.getTime()) / 86400000);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function getTaskAssigneeNames(task: { assigneeId?: string | null; assigneeIds?: string[] }, userMap: Record<string, string>): string {
  const ids = Array.isArray(task.assigneeIds) && task.assigneeIds.length > 0
    ? task.assigneeIds
    : task.assigneeId
      ? [task.assigneeId]
      : [];
  if (ids.length === 0) return "Chung";
  return ids.map(id => userMap[id] || "?").join(", ");
}

// ─── DỮ LIỆU BẢN TIN ────────────────────────────────────────────────────────

interface DigestData {
  weekStartLabel: string;   // "12/7"
  weekEndLabel: string;     // "18/7/2026"
  income: number;
  expense: number;
  topExpense: Array<{ cat: string; total: number }>;
  overdue: Array<{ title: string; assignee: string; daysLate: number }>;
  upcoming: Array<{ title: string; assignee: string; daysUntil: number; dateLabel: string }>;
  events: Array<{ title: string; daysUntil: number; dateLabel: string }>;
  birthdays: Array<{ name: string; daysUntil: number; age: number; dateLabel: string }>;
  expiringDocs: Array<{ title: string; owner: string; daysUntil: number; dateLabel: string }>;
}

function buildDigestData(now: Date): DigestData {
  const db = FamilyDB["readRaw"]();            // truy cập nội bộ
  const todayStr = localDateKey(now);

  // ── Tuần trước (7 ngày qua) ──────────────────────────────────────────────
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  const weekAgoStr = localDateKey(weekAgo);

  const recentTxs = db.transactions.filter(tx => {
    const d = (tx.date || tx.createdAt || "").slice(0, 10);
    return d >= weekAgoStr && d <= todayStr;
  });

  let income = 0;
  let expense = 0;
  const catMap: Record<string, number> = {};
  for (const tx of recentTxs) {
    if (tx.type === "income") income += tx.amount;
    else {
      expense += tx.amount;
      catMap[tx.category] = (catMap[tx.category] || 0) + tx.amount;
    }
  }
  const topExpense = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, total]) => ({ cat: CATEGORY_LABEL[cat] || cat, total }));

  // ── Task quá hạn / sắp hạn ───────────────────────────────────────────────
  const userMap: Record<string, string> = {};
  for (const u of db.users) userMap[u.id] = u.fullName;

  const activeTasks = db.tasks.filter(
    t => t.status !== TaskStatus.COMPLETED && t.dueDate
  );

  const overdue = activeTasks
    .filter(t => t.dueDate.slice(0, 10) < todayStr)
    .map(t => ({
      title: t.title,
      assignee: getTaskAssigneeNames(t, userMap),
      daysLate: -daysDiff(t.dueDate.slice(0, 10), now)
    }))
    .slice(0, 5);

  const upcoming = activeTasks
    .filter(t => {
      const d = daysDiff(t.dueDate.slice(0, 10), now);
      return d >= 0 && d <= 7;
    })
    .map(t => {
      const d = daysDiff(t.dueDate.slice(0, 10), now);
      const dt = new Date(now);
      dt.setDate(now.getDate() + d);
      return {
        title: t.title,
        assignee: getTaskAssigneeNames(t, userMap),
        daysUntil: d,
        dateLabel: `${dt.getDate()}/${dt.getMonth() + 1}`
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // ── Lịch / kế hoạch sắp tới (7 ngày) ────────────────────────────────────
  const events = db.plans
    .filter(p => {
      const d = daysDiff(p.startDate.slice(0, 10), now);
      return d >= 0 && d <= 7;
    })
    .map(p => {
      const d = daysDiff(p.startDate.slice(0, 10), now);
      const dt = new Date(now);
      dt.setDate(now.getDate() + d);
      return {
        title: p.title,
        daysUntil: d,
        dateLabel: `${dt.getDate()}/${dt.getMonth() + 1}`
      };
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // ── Sinh nhật (14 ngày tới) ───────────────────────────────────────────────
  const birthdays = db.users
    .filter(u => u.dateOfBirth)
    .flatMap(u => {
      const dob = new Date(u.dateOfBirth!);
      if (isNaN(dob.getTime())) return [];
      const thisYear = new Date(now.getFullYear(), dob.getMonth(), dob.getDate());
      const nextYear = new Date(now.getFullYear() + 1, dob.getMonth(), dob.getDate());
      const target = thisYear >= new Date(now.getFullYear(), now.getMonth(), now.getDate())
        ? thisYear : nextYear;
      const diff = daysDiff(localDateKey(target), now);
      if (diff < 0 || diff > 14) return [];
      return [{
        name: u.fullName,
        daysUntil: diff,
        age: target.getFullYear() - dob.getFullYear(),
        dateLabel: `${target.getDate()}/${target.getMonth() + 1}`
      }];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil);

  // ── Giấy tờ sắp hết hạn (30 ngày) ───────────────────────────────────────
  const expiringDocs = db.documents
    .filter(doc => doc.expiryDate)
    .flatMap(doc => {
      const diff = daysDiff(doc.expiryDate!, now);
      if (diff < 0 || diff > 30) return [];
      const owner = doc.ownerId ? (userMap[doc.ownerId] || "?") : "Gia đình";
      const [y, m, d] = doc.expiryDate!.split("-").map(Number);
      return [{ title: doc.title, owner, daysUntil: diff, dateLabel: `${d}/${m}/${y}` }];
    })
    .sort((a, b) => a.daysUntil - b.daysUntil)
    .slice(0, 5);

  // ── Label tuần ───────────────────────────────────────────────────────────
  const weekEnd = new Date(now);
  weekEnd.setDate(now.getDate() - 1);
  const weekStart = new Date(weekEnd);
  weekStart.setDate(weekEnd.getDate() - 6);

  return {
    weekStartLabel: `${weekStart.getDate()}/${weekStart.getMonth() + 1}`,
    weekEndLabel: `${weekEnd.getDate()}/${weekEnd.getMonth() + 1}/${weekEnd.getFullYear()}`,
    income, expense, topExpense,
    overdue, upcoming, events, birthdays, expiringDocs
  };
}

// ─── FORMAT VĂN BẢN (fallback khi không có Gemini) ──────────────────────────

function buildFallbackText(d: DigestData): string {
  const lines: string[] = [];
  lines.push(`📋 <b>Bản tin tuần gia đình</b>`);
  lines.push(`📅 Tuần ${d.weekStartLabel} – ${d.weekEndLabel}`);
  lines.push("");

  // Tài chính
  lines.push("💰 <b>Chi tiêu tuần qua</b>");
  lines.push(`  Thu: <b>${fmt(d.income)}</b>  |  Chi: <b>${fmt(d.expense)}</b>`);
  const balance = d.income - d.expense;
  if (balance !== 0) {
    const sign = balance >= 0 ? "+" : "";
    lines.push(`  Chênh lệch: ${sign}${fmt(balance)}`);
  }
  if (d.topExpense.length > 0) {
    lines.push(`  Top chi: ${d.topExpense.map(e => `${e.cat} ${fmt(e.total)}`).join(" · ")}`);
  }
  lines.push("");

  // Tasks quá hạn
  if (d.overdue.length > 0) {
    lines.push(`⚠️ <b>Việc quá hạn (${d.overdue.length})</b>`);
    for (const t of d.overdue) {
      lines.push(`  • ${escapeHtml(t.title)} — ${escapeHtml(t.assignee)} (đã trễ ${t.daysLate} ngày)`);
    }
    lines.push("");
  }

  // Tasks sắp hạn
  if (d.upcoming.length > 0) {
    lines.push(`📌 <b>Sắp đến hạn (7 ngày tới)</b>`);
    for (const t of d.upcoming) {
      const when = t.daysUntil === 0 ? "hôm nay" : `${t.dateLabel} (${t.daysUntil} ngày)`;
      lines.push(`  • ${escapeHtml(t.title)} — ${escapeHtml(t.assignee)}, ${when}`);
    }
    lines.push("");
  }

  // Lịch/sự kiện
  if (d.events.length > 0) {
    lines.push("📅 <b>Lịch & kế hoạch tuần tới</b>");
    for (const e of d.events) {
      const when = e.daysUntil === 0 ? "hôm nay" : `${e.dateLabel} (${e.daysUntil} ngày)`;
      lines.push(`  • ${escapeHtml(e.title)} — ${when}`);
    }
    lines.push("");
  }

  // Sinh nhật
  if (d.birthdays.length > 0) {
    lines.push("🎂 <b>Sinh nhật sắp tới</b>");
    for (const b of d.birthdays) {
      const when = b.daysUntil === 0 ? "hôm nay 🎉" : `${b.dateLabel} (${b.daysUntil} ngày nữa)`;
      lines.push(`  • ${escapeHtml(b.name)} tròn ${b.age} tuổi — ${when}`);
    }
    lines.push("");
  }

  // Giấy tờ hết hạn
  if (d.expiringDocs.length > 0) {
    lines.push("📄 <b>Giấy tờ sắp hết hạn</b>");
    for (const doc of d.expiringDocs) {
      const when = doc.daysUntil === 0 ? "hôm nay!" : `${doc.dateLabel} (${doc.daysUntil} ngày)`;
      lines.push(`  • ${escapeHtml(doc.title)} (${escapeHtml(doc.owner)}) — ${when}`);
    }
    lines.push("");
  }

  if (
    d.overdue.length === 0 && d.upcoming.length === 0 &&
    d.events.length === 0 && d.birthdays.length === 0 &&
    d.expiringDocs.length === 0 && d.income === 0 && d.expense === 0
  ) {
    lines.push("✅ Tuần yên ả — cả nhà không có gì cần chú ý đặc biệt!");
  } else {
    lines.push("Chúc cả nhà tuần mới vui khỏe 💪");
  }

  return lines.join("\n");
}

// ─── NÂNG CAO VỚI GEMINI (tùy chọn) ─────────────────────────────────────────

async function enhanceWithAI(data: DigestData, apiKey: string): Promise<string | null> {
  try {
    const { GoogleGenAI } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `Bạn là trợ lý gia đình thân thiện. Dưới đây là dữ liệu tóm tắt tuần của gia đình.
Hãy viết một bản tin ngắn gọn, vui vẻ, dễ đọc bằng tiếng Việt để gửi qua Telegram vào sáng thứ Hai.
Yêu cầu:
- Độ dài 150–250 từ, không dài hơn
- Được dùng emoji để tạo cảm giác thân thiện
- Giọng điệu ấm áp, quan tâm, như thành viên gia đình nhắc nhau
- Định dạng plain text (không dùng markdown hay code block; Telegram sẽ render HTML nên chỉ dùng thẻ <b> để in đậm khi cần)
- Đề cập đến các điểm quan trọng: chi tiêu, việc trễ/sắp hạn, sự kiện, sinh nhật, giấy tờ
- Nếu tuần không có gì đặc biệt, hãy động viên và chúc tuần mới tốt lành
- Bắt đầu bằng "📋 Bản tin tuần gia đình" và kết thúc bằng lời chúc

Dữ liệu tuần ${data.weekStartLabel}–${data.weekEndLabel}:
${JSON.stringify({
  "Tài chính": {
    "Thu": data.income, "Chi": data.expense,
    "Top chi tiêu": data.topExpense.map(e => `${e.cat}: ${e.total}₫`)
  },
  "Việc quá hạn": data.overdue.map(t => `${t.title} (${t.assignee}, trễ ${t.daysLate} ngày)`),
  "Việc sắp hạn": data.upcoming.map(t => `${t.title} — ${t.assignee}, ${t.dateLabel}`),
  "Lịch & sự kiện": data.events.map(e => `${e.title} — ${e.dateLabel}`),
  "Sinh nhật": data.birthdays.map(b => `${b.name} ${b.age} tuổi — ${b.dateLabel}`),
  "Giấy tờ hết hạn": data.expiringDocs.map(d => `${d.title} (${d.owner}) — ${d.dateLabel}`)
}, null, 2)}`;

    const res = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: { responseMimeType: "text/plain" }
    } as any);

    const text = (res as any).text?.() || "";
    return text.trim() || null;
  } catch (err: any) {
    console.error("[weeklyDigest] Gemini thất bại, dùng fallback:", err?.message || err);
    return null;
  }
}

// ─── GỬI QUA TELEGRAM ────────────────────────────────────────────────────────

async function sendTelegramHtml(token: string, chatId: string, html: string): Promise<void> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text: html, parse_mode: "HTML" })
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.ok) {
    throw new Error(`Telegram lỗi: ${data.description || `HTTP ${res.status}`}`);
  }
}

// ─── ĐIỂM VÀO CÔNG KHAI ─────────────────────────────────────────────────────

/**
 * Thu thập dữ liệu, tạo bản tin, gửi Telegram.
 * Ném Error nếu chưa cấu hình hoặc gửi thất bại.
 */
export async function sendWeeklyDigest(now = new Date()): Promise<{ aiUsed: boolean }> {
  const s = getAppSettings();
  const token = s.telegramBotToken || "";
  const chatId = s.telegramChatId || "";
  if (!token || !chatId) throw new Error("Chưa cấu hình Telegram bot token / chat ID.");

  const data = buildDigestData(now);
  const geminiKey = (s.geminiApiKey || "").trim() || (process.env.GEMINI_API_KEY || process.env.API_KEY || "").trim();

  let text: string;
  let aiUsed = false;

  if (geminiKey) {
    const aiText = await enhanceWithAI(data, geminiKey);
    if (aiText) {
      text = aiText;
      aiUsed = true;
    } else {
      text = buildFallbackText(data);
    }
  } else {
    text = buildFallbackText(data);
  }

  await sendTelegramHtml(token, chatId, text);
  return { aiUsed };
}

/**
 * Gọi mỗi 30 phút (cùng interval với backup tự động).
 * Điều kiện gửi: thứ Hai + 7h–10h + enabled + chưa gửi tuần này.
 */
let sending = false;

export async function runWeeklyDigestTick(now = new Date()): Promise<void> {
  if (sending) return;
  const s = getAppSettings();
  if (s.telegramWeeklyDigestEnabled !== "1") return;
  if (!s.telegramBotToken || !s.telegramChatId) return;

  // Chỉ chạy thứ Hai (getDay() === 1), trong khung 7h–10h
  if (now.getDay() !== 1) return;
  const hour = now.getHours();
  if (hour < 7 || hour >= 10) return;

  // Dedupe: đã gửi thứ Hai tuần này chưa?
  const mondayKey = getMondayKey(now);
  if (s.telegramWeeklyDigestLastSent === mondayKey) return;

  sending = true;
  try {
    const { aiUsed } = await sendWeeklyDigest(now);
    setAppSetting("telegramWeeklyDigestLastSent", mondayKey);
    console.log(`[weeklyDigest] Bản tin tuần đã gửi (AI=${aiUsed}).`);
  } catch (e: any) {
    console.error("[weeklyDigest] Gửi thất bại:", e?.message || e);
    // best-effort: không set lastSent để thử lại lần tick tiếp
  } finally {
    sending = false;
  }
}
