/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from "vitest";
import { UserRole, type FamilyOrganizerDB, TaskPriority, TaskStatus } from "../src/types.js";
import { getChangedStorageScopes } from "./mongoose.js";

const baseDb = (): FamilyOrganizerDB => ({
  users: [{ id: "u1", username: "admin", fullName: "Admin", role: UserRole.ADMIN, avatarColor: "bg-red-500", passwordHash: "hash", createdAt: "2026-01-01T00:00:00Z" }],
  tasks: [],
  plans: [],
  notes: [],
  transactions: [],
  rewardLedger: [],
  rewardItems: [],
  budgets: [],
  recurringBills: [],
  savingsGoals: [],
  debts: [],
  assets: [],
  medications: [],
  medicationLogs: [],
  vaccinations: [],
  growthRecords: [],
  healthProfiles: [],
  documents: [],
  photos: [],
  shoppingItems: [],
  dishLibrary: [],
  mealPlan: null,
  marketHistory: [],
  chatMessages: [],
  notifications: [],
  pushSubscriptions: [],
  activityLogs: [],
  backups: []
});

describe("getChangedStorageScopes", () => {
  it("marks all domain collections dirty when there is no persisted baseline", () => {
    const scopes = getChangedStorageScopes(null, baseDb());
    expect(scopes).toContain("users");
    expect(scopes).toContain("tasks");
    expect(scopes).toContain("meal_plans");
    expect(scopes.length).toBeGreaterThan(20);
  });

  it("marks only tasks when a task changes", () => {
    const previous = baseDb();
    const next = baseDb();
    next.tasks.push({
      id: "t1",
      title: "Dọn phòng",
      description: "",
      status: TaskStatus.TODO,
      priority: TaskPriority.MEDIUM,
      dueDate: "2026-08-04 19:00",
      creatorId: "u1",
      assigneeId: "u1",
      assigneeIds: ["u1"],
      isShared: true,
      tags: [],
      comments: [],
      history: [],
      createdAt: "2026-08-04T00:00:00Z",
      updatedAt: "2026-08-04T00:00:00Z"
    });

    expect(getChangedStorageScopes(previous, next)).toEqual(["tasks"]);
  });

  it("marks only meal_plans when the shared meal plan changes", () => {
    const previous = baseDb();
    const next = baseDb();
    next.mealPlan = {
      days: [],
      groceries: [],
      source: "manual",
      adults: 2,
      children: 1,
      updatedAt: "2026-08-04T00:00:00Z",
      updatedById: "u1"
    };

    expect(getChangedStorageScopes(previous, next)).toEqual(["meal_plans"]);
  });
});

