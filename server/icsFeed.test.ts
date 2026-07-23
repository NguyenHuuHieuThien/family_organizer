/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from "vitest";
import { planToIcsEvent } from "./icsFeed.js";
import type { FamilyPlan } from "../src/types.js";

const base: FamilyPlan = {
  id: "p1", title: "Test", description: "",
  startDate: "2026-07-23 09:00", endDate: "",
  isRecurring: false, recurrenceType: "none",
  creatorId: "u1", isShared: true, color: "sky", createdAt: "2026-07-23T00:00:00Z"
};
const mk = (o: Partial<FamilyPlan>) => planToIcsEvent({ ...base, ...o }, "20260723T000000Z");
const find = (lines: string[], key: string) => lines.find(l => l.startsWith(key));

describe("planToIcsEvent — sự kiện lặp KHÔNG kéo dài mỗi lần từ start→end (bug lịch iPhone)", () => {
  it("hằng tuần có ngày kết thúc: DTEND ngắn (1h), mốc dừng nằm ở RRULE UNTIL", () => {
    const lines = mk({ isRecurring: true, recurrenceType: "weekly", recurrenceWeekdays: [3], startDate: "2026-07-23 09:00", endDate: "2026-09-30 00:00" });
    expect(find(lines, "DTSTART:")).toBe("DTSTART:20260723T090000");
    // DTEND phải là +1h, KHÔNG được là 2026-09-30 (nếu không mỗi lần lặp phủ kín mọi ngày)
    expect(find(lines, "DTEND:")).toBe("DTEND:20260723T100000");
    expect(find(lines, "RRULE:")).toBe("RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20260930T235959");
  });

  it("lặp vô hạn (không đặt endDate): không có UNTIL", () => {
    const lines = mk({ isRecurring: true, recurrenceType: "weekly", recurrenceWeekdays: [3], startDate: "2026-07-23 09:00", endDate: "" });
    expect(find(lines, "DTEND:")).toBe("DTEND:20260723T100000");
    expect(find(lines, "RRULE:")).toBe("RRULE:FREQ=WEEKLY;BYDAY=WE");
  });

  it("hằng năm (kỷ niệm/giỗ): FREQ=YEARLY, DTEND +1h", () => {
    const lines = mk({ isRecurring: true, recurrenceType: "yearly", startDate: "2020-08-12 00:00", endDate: "" });
    expect(find(lines, "RRULE:")).toBe("RRULE:FREQ=YEARLY");
    expect(find(lines, "DTEND:")).toBe("DTEND:20200812T010000");
  });

  it("sự kiện 1 lần nhiều ngày: DTEND = ngày kết thúc thật (giữ khoảng)", () => {
    const lines = mk({ isRecurring: false, recurrenceType: "none", startDate: "2026-07-01 08:00", endDate: "2026-07-05 17:00" });
    expect(find(lines, "DTEND:")).toBe("DTEND:20260705T170000");
    expect(find(lines, "RRULE:")).toBeUndefined();
  });

  it("sự kiện 1 lần không endDate: DTEND = +1h (tránh zero-duration)", () => {
    const lines = mk({ startDate: "2026-07-01 08:00", endDate: "" });
    expect(find(lines, "DTEND:")).toBe("DTEND:20260701T090000");
  });

  it("startDate hỏng → không sinh VEVENT", () => {
    expect(mk({ startDate: "khong-phai-ngay" })).toEqual([]);
  });
});
