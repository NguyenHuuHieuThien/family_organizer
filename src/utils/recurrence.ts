/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Logic mở rộng sự kiện LẶP LẠI thành các ngày diễn ra cụ thể — nguồn chân lý
// chung cho lịch tháng (Schedules) và "Sự kiện sắp diễn ra" (Dashboard).
// Tách thuần để test được: bug "hằng tuần tô mọi ngày" (07/2026) nằm ở đây.

export interface RecurringPlanLike {
  startDate: string;              // "YYYY-MM-DD" hoặc "YYYY-MM-DD HH:mm"
  endDate?: string;               // ngày kết thúc khoảng áp dụng lặp lại
  isRecurring: boolean;
  recurrenceType?: "none" | "daily" | "weekly" | "monthly" | "yearly";
  recurrenceWeekdays?: number[];  // 0=CN, 1=T2... (chỉ dùng cho weekly)
}

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** Parse phần ngày của "YYYY-MM-DD[ HH:mm]" theo giờ địa phương; null nếu hỏng. */
export function parsePlanDate(s: string | undefined): Date | null {
  const raw = String(s || "").slice(0, 10);
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Liệt kê các ngày sự kiện lặp lại diễn ra trong [rangeStart, rangeEnd] (bao gồm 2 biên).
 * - daily: mọi ngày; weekly: đúng các thứ đã chọn (mặc định = thứ của ngày bắt đầu);
 *   monthly: đúng ngày-trong-tháng của ngày bắt đầu; yearly: đúng ngày+tháng của ngày
 *   bắt đầu (kỷ niệm/giỗ).
 * - KHÔNG đặt endDate → lặp vô hạn (giới hạn bởi khoảng xem); có endDate hợp lệ → chặn tới
 *   đó; endDate < startDate coi như sự kiện 1 ngày.
 * - Sự kiện không lặp (hoặc recurrenceType "none") trả mảng rỗng — caller tự xử lý.
 */
export function expandRecurringOccurrences(
  plan: RecurringPlanLike,
  rangeStart: Date,
  rangeEnd: Date
): Date[] {
  if (!plan.isRecurring || !plan.recurrenceType || plan.recurrenceType === "none") return [];
  const start = parsePlanDate(plan.startDate);
  if (!start) return [];

  const from = dayStart(new Date(Math.max(dayStart(rangeStart).getTime(), start.getTime())));
  const to = dayStart(rangeEnd);
  // Mốc dừng chuỗi lặp (`last`):
  // - KHÔNG đặt ngày kết thúc → lặp VÔ HẠN (chỉ giới hạn bởi khoảng đang xem `to`).
  //   Đây là hành vi mong đợi cho sự kiện định kỳ nói chung và kỷ niệm/giỗ (yearly).
  // - Có ngày kết thúc hợp lệ (>= ngày bắt đầu) → chặn tới đúng ngày đó.
  // - Ngày kết thúc hỏng/trước ngày bắt đầu → coi như sự kiện 1 ngày.
  const endRaw = String(plan.endDate ?? "").trim();
  const endParsed = endRaw ? parsePlanDate(endRaw) : null;
  const last = !endRaw
    ? to
    : (!endParsed || endParsed < start ? start : endParsed);
  const result: Date[] = [];
  const cursor = new Date(from);
  let guard = 0;
  while (cursor <= to && cursor <= last && guard < 400) {
    let matches = false;
    if (plan.recurrenceType === "daily") matches = true;
    else if (plan.recurrenceType === "weekly") {
      const weekdays = (plan.recurrenceWeekdays && plan.recurrenceWeekdays.length > 0)
        ? plan.recurrenceWeekdays
        : [start.getDay()];
      matches = weekdays.includes(cursor.getDay());
    } else if (plan.recurrenceType === "monthly") {
      matches = cursor.getDate() === start.getDate();
    } else if (plan.recurrenceType === "yearly") {
      matches = cursor.getDate() === start.getDate() && cursor.getMonth() === start.getMonth();
    }
    if (matches) result.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
    guard++;
  }
  return result;
}
