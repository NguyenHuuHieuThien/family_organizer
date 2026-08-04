/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { webcrypto } from "crypto";
import type { FamilyOrganizerDB } from "../src/types.js";

if (!(globalThis as any).crypto) {
  (globalThis as any).crypto = webcrypto;
}

const DEFAULT_MONGO_URI = "mongodb://127.0.0.1:27017/family_organizer";
const STATE_ID = "family-state";
const SCHEMA_VERSION = 1;
const COLLECTION_SCHEMA_VERSION = 2;
const METRICS_KEEP_MS = 7 * 24 * 3600 * 1000;

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_MONGO_URI;
const storageMode = (process.env.DB_STORAGE || process.env.MONGO_STORAGE_MODE || "collections").toLowerCase();
const useLegacyStateStorage = storageMode === "legacy" || storageMode === "family_state";

const COLLECTION_MAP = {
  users: "users",
  tasks: "tasks",
  plans: "plans",
  notes: "notes",
  transactions: "transactions",
  rewardLedger: "reward_ledger",
  rewardItems: "reward_items",
  budgets: "budgets",
  recurringBills: "recurring_bills",
  savingsGoals: "savings_goals",
  debts: "debts",
  assets: "assets",
  medications: "medications",
  medicationLogs: "medication_logs",
  vaccinations: "vaccinations",
  growthRecords: "growth_records",
  healthProfiles: "health_profiles",
  documents: "documents",
  photos: "photos",
  shoppingItems: "shopping_items",
  dishLibrary: "dish_library",
  marketHistory: "market_history",
  chatMessages: "chat_messages",
  notifications: "notifications",
  pushSubscriptions: "push_subscriptions",
  activityLogs: "activity_logs",
  backups: "backups"
} as const satisfies Record<Exclude<keyof FamilyOrganizerDB, "mealPlan">, string>;

type CollectionKey = keyof typeof COLLECTION_MAP;

export interface ServerMetricRow {
  t: number;
  cpu: number | null;
  ram: number | null;
  temp: number | null;
  ssd: number | null;
  disk: number | null;
}

let mongooseMod: typeof import("mongoose") | null = null;
let FamilyState: any;
let ServerMetric: any;
let AppMeta: any;
let MealPlan: any;
const CollectionModels: Partial<Record<CollectionKey, any>> = {};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

let cachedState: FamilyOrganizerDB | null = null;
let persistedState: FamilyOrganizerDB | null = null;
let cachedMetrics: ServerMetricRow[] = [];
let saveQueue: Promise<void> = Promise.resolve();

async function ensureCollectionIndexes(): Promise<void> {
  const indexes: Partial<Record<CollectionKey, any[]>> = {
    users: [{ username: 1 }, { role: 1 }, { isDeleted: 1 }],
    pushSubscriptions: [{ endpoint: 1 }, { userId: 1 }],
    tasks: [{ status: 1 }, { priority: 1 }, { dueDate: 1 }, { creatorId: 1 }, { assigneeIds: 1 }, { isShared: 1 }],
    plans: [{ startDate: 1 }, { endDate: 1 }, { creatorId: 1 }, { isShared: 1 }, { recurrenceType: 1 }],
    notes: [{ creatorId: 1 }, { isShared: 1 }, { isPinned: 1 }, { tags: 1 }],
    transactions: [{ date: 1 }, { type: 1, date: 1 }, { category: 1, date: 1 }, { creatorId: 1 }, { account: 1 }],
    budgets: [{ month: 1, category: 1 }],
    recurringBills: [{ nextDueDate: 1 }, { isActive: 1 }, { category: 1 }],
    savingsGoals: [{ creatorId: 1 }, { isShared: 1 }, { deadline: 1 }],
    debts: [{ direction: 1 }, { counterparty: 1 }, { dueDate: 1 }, { isSettled: 1 }, { creatorId: 1 }],
    assets: [{ type: 1 }, { ownerId: 1 }, { isPinned: 1 }, { createdById: 1 }],
    rewardLedger: [{ userId: 1 }, { taskId: 1 }, { createdAt: 1 }, { createdById: 1 }],
    rewardItems: [{ isActive: 1 }, { cost: 1 }],
    medications: [{ patientId: 1 }, { isActive: 1 }, { startDate: 1 }, { endDate: 1 }],
    medicationLogs: [{ medicationId: 1, date: 1, time: 1 }, { patientId: 1 }, { loggedById: 1 }, { date: 1 }],
    vaccinations: [{ childId: 1 }, { scheduledDate: 1 }, { doneDate: 1 }, { status: 1 }],
    growthRecords: [{ childId: 1, date: 1 }],
    healthProfiles: [{ userId: 1 }],
    documents: [{ type: 1 }, { ownerId: 1 }, { expiryDate: 1 }, { creatorId: 1 }, { isShared: 1 }],
    photos: [{ ownerId: 1 }, { album: 1 }, { takenAt: 1 }, { tags: 1 }, { isShared: 1 }, { creatorId: 1 }],
    shoppingItems: [{ isPurchased: 1 }, { creatorId: 1 }, { purchasedById: 1 }, { createdAt: 1 }],
    dishLibrary: [{ slot: 1 }, { source: 1 }],
    marketHistory: [{ at: 1 }],
    chatMessages: [{ createdAt: 1 }, { senderId: 1 }],
    notifications: [{ userId: 1, isRead: 1, createdAt: -1 }, { type: 1 }],
    activityLogs: [{ createdAt: -1 }, { userId: 1 }, { action: 1 }],
    backups: [{ createdAt: -1 }, { type: 1 }]
  };

  const uniqueIndexes: Partial<Record<CollectionKey, string[]>> = {
    users: ["username"],
    pushSubscriptions: ["endpoint"],
    budgets: ["month,category"],
    medicationLogs: ["medicationId,date,time"],
    growthRecords: ["childId,date"],
    healthProfiles: ["userId"],
    marketHistory: ["at"]
  };

  for (const [key, specs] of Object.entries(indexes) as [CollectionKey, any[]][]) {
    for (const spec of specs) {
      const signature = Object.keys(spec).join(",");
      await CollectionModels[key].collection.createIndex(spec, {
        unique: uniqueIndexes[key]?.includes(signature) || false,
        background: true
      });
    }
  }

  await CollectionModels.tasks.collection.createIndex({ title: "text", description: "text", tags: "text" }, { background: true });
  await CollectionModels.notes.collection.createIndex({ title: "text", content: "text", tags: "text" }, { background: true });
  await CollectionModels.assets.collection.createIndex(
    { name: "text", notes: "text", symbol: "text", certificateNo: "text", serialNo: "text" },
    { background: true }
  );
  await CollectionModels.documents.collection.createIndex(
    { title: "text", documentNumber: "text", issuer: "text", notes: "text" },
    { background: true }
  );
  await CollectionModels.dishLibrary.collection.createIndex({ name: "text", "ingredients.name": "text" }, { background: true });
  await MealPlan.collection.createIndex({ updatedAt: -1 }, { background: true });
}

async function ensureModels(): Promise<void> {
  if (mongooseMod) return;
  const mongoosePkg: any = await import("mongoose");
  mongooseMod = mongoosePkg.default || mongoosePkg;
  const { Schema } = mongooseMod;

  const familyStateSchema = new Schema(
    {
      _id: { type: String, required: true },
      schemaVersion: { type: Number, required: true, default: SCHEMA_VERSION },
      data: { type: Schema.Types.Mixed, required: true },
      updatedAt: { type: Date, required: true, default: Date.now }
    },
    { collection: "family_state", versionKey: false }
  );

  const serverMetricSchema = new Schema(
    {
      t: { type: Number, required: true, unique: true, index: true },
      cpu: { type: Number, default: null },
      ram: { type: Number, default: null },
      temp: { type: Number, default: null },
      ssd: { type: Number, default: null },
      disk: { type: Number, default: null }
    },
    { collection: "server_metrics", versionKey: false }
  );

  const appMetaSchema = new Schema(
    {
      _id: { type: String, required: true },
      schemaVersion: { type: Number, required: true, default: COLLECTION_SCHEMA_VERSION },
      storageMode: { type: String, required: true, default: "collections" },
      migratedFrom: { type: String, default: null },
      migratedAt: { type: Date, default: null },
      updatedAt: { type: Date, required: true, default: Date.now }
    },
    { collection: "app_meta", versionKey: false }
  );

  const genericDocumentSchema = new Schema(
    { _id: { type: String, required: true } },
    { strict: false, versionKey: false }
  );

  const mealPlanSchema = new Schema(
    { _id: { type: String, required: true } },
    { collection: "meal_plans", strict: false, versionKey: false }
  );

  FamilyState = mongooseMod.models.FamilyState || mongooseMod.model("FamilyState", familyStateSchema);
  ServerMetric = mongooseMod.models.ServerMetric || mongooseMod.model("ServerMetric", serverMetricSchema);
  AppMeta = mongooseMod.models.AppMeta || mongooseMod.model("AppMeta", appMetaSchema);
  MealPlan = mongooseMod.models.MealPlan || mongooseMod.model("MealPlan", mealPlanSchema);

  for (const [key, collectionName] of Object.entries(COLLECTION_MAP) as [CollectionKey, string][]) {
    const modelName = `Family_${key}`;
    CollectionModels[key] = mongooseMod.models[modelName] || mongooseMod.model(modelName, genericDocumentSchema, collectionName);
  }
}

function stripMongoFields<T>(doc: any): T {
  if (!doc) return doc;
  const cloned = clone(doc);
  delete cloned._id;
  delete cloned.__v;
  return cloned as T;
}

function withMongoId(doc: any): any {
  const cloned = clone(doc);
  cloned._id = String(cloned.id);
  return cloned;
}

async function collectionsHaveState(): Promise<boolean> {
  const users = await CollectionModels.users.countDocuments().exec();
  const meta = await AppMeta.findById("db").lean().exec();
  return users > 0 || Boolean(meta?.schemaVersion);
}

async function loadCollectionsState(seed: FamilyOrganizerDB): Promise<FamilyOrganizerDB> {
  const state: FamilyOrganizerDB = clone(seed);

  for (const key of Object.keys(COLLECTION_MAP) as CollectionKey[]) {
    const rows = await CollectionModels[key].find({}).lean().exec();
    (state as any)[key] = rows.map((row: any) => stripMongoFields(row));
  }

  const mealPlan = await MealPlan.findById("current").lean().exec();
  state.mealPlan = mealPlan ? stripMongoFields(mealPlan) : null;
  return state;
}

async function replaceCollectionsState(data: FamilyOrganizerDB, migratedFrom: string | null = null): Promise<void> {
  const now = new Date();

  for (const key of Object.keys(COLLECTION_MAP) as CollectionKey[]) {
    await replaceCollectionState(key, (data as any)[key] || []);
  }

  await replaceMealPlanState(data.mealPlan || null);
  await updateCollectionsMeta(now, migratedFrom);
}

async function replaceCollectionState(key: CollectionKey, rowsInput: any[]): Promise<void> {
  const model = CollectionModels[key];
  const rows = (rowsInput || []).filter((row: any) => row?.id);
  const ids = rows.map((row: any) => String(row.id));
  if (rows.length > 0) {
    await model.bulkWrite(
      rows.map((row: any) => ({
        replaceOne: {
          filter: { _id: String(row.id) },
          replacement: withMongoId(row),
          upsert: true
        }
      })),
      { ordered: false }
    );
  }
  if (ids.length > 0) {
    await model.deleteMany({ _id: { $nin: ids } }).exec();
  } else {
    await model.deleteMany({}).exec();
  }
}

async function replaceMealPlanState(mealPlan: FamilyOrganizerDB["mealPlan"]): Promise<void> {
  if (mealPlan) {
    await MealPlan.replaceOne({ _id: "current" }, { _id: "current", ...clone(mealPlan) }, { upsert: true }).exec();
  } else {
    await MealPlan.deleteMany({}).exec();
  }
}

async function updateCollectionsMeta(now = new Date(), migratedFrom: string | null = null): Promise<void> {
  const update: any = {
    _id: "db",
    schemaVersion: COLLECTION_SCHEMA_VERSION,
    storageMode: "collections",
    updatedAt: now
  };
  if (migratedFrom) {
    update.migratedFrom = migratedFrom;
    update.migratedAt = now;
  }

  await AppMeta.findByIdAndUpdate(
    "db",
    update,
    { upsert: true, returnDocument: "after" }
  ).exec();
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function getChangedStorageScopes(previous: FamilyOrganizerDB | null, next: FamilyOrganizerDB): string[] {
  if (!previous) return [...Object.values(COLLECTION_MAP), "meal_plans"];
  const changed: string[] = [];
  for (const key of Object.keys(COLLECTION_MAP) as CollectionKey[]) {
    if (!sameJson((previous as any)[key], (next as any)[key])) changed.push(COLLECTION_MAP[key]);
  }
  if (!sameJson(previous.mealPlan || null, next.mealPlan || null)) changed.push("meal_plans");
  return changed;
}

async function replaceChangedCollectionsState(next: FamilyOrganizerDB): Promise<void> {
  if (!persistedState) {
    await replaceCollectionsState(next);
    persistedState = clone(next);
    return;
  }

  let changed = false;
  const changedScopes = new Set(getChangedStorageScopes(persistedState, next));
  for (const key of Object.keys(COLLECTION_MAP) as CollectionKey[]) {
    if (!changedScopes.has(COLLECTION_MAP[key])) continue;
    await replaceCollectionState(key, (next as any)[key] || []);
    changed = true;
  }

  if (changedScopes.has("meal_plans")) {
    await replaceMealPlanState(next.mealPlan || null);
    changed = true;
  }

  if (changed) {
    await updateCollectionsMeta();
    persistedState = clone(next);
  }
}

export async function initializeMongooseStorage(seed: FamilyOrganizerDB): Promise<void> {
  await ensureModels();
  if (mongooseMod!.connection.readyState === 0) {
    await mongooseMod!.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
  }

  if (!useLegacyStateStorage) {
    await ensureCollectionIndexes();
    if (await collectionsHaveState()) {
      cachedState = await loadCollectionsState(seed);
      persistedState = clone(cachedState);
      console.log(`Đã kết nối MongoDB collections: ${mongoUri.replace(/:\/\/.*@/, "://***:***@")}`);
    } else {
      const existing = await FamilyState.findById(STATE_ID).lean().exec();
      cachedState = clone(existing?.data || seed);
      await replaceCollectionsState(cachedState, existing?.data ? "family_state" : "seed");
      persistedState = clone(cachedState);
      console.log("Đã khởi tạo MongoDB collections từ family_state/seed.");
    }
    return;
  }

  const existing = await FamilyState.findById(STATE_ID).lean().exec();
  if (existing?.data) {
    cachedState = clone(existing.data);
  } else {
    cachedState = clone(seed);
    await FamilyState.findByIdAndUpdate(
      STATE_ID,
      { _id: STATE_ID, schemaVersion: SCHEMA_VERSION, data: cachedState, updatedAt: new Date() },
      { upsert: true, returnDocument: "after" }
    ).exec();
  }
  persistedState = clone(cachedState);

  cachedMetrics = (await ServerMetric.find({ t: { $gte: Date.now() - METRICS_KEEP_MS } })
    .sort({ t: 1 })
    .lean()
    .exec()).map((row: any) => ({
      t: row.t,
      cpu: row.cpu ?? null,
      ram: row.ram ?? null,
      temp: row.temp ?? null,
      ssd: row.ssd ?? null,
      disk: row.disk ?? null
    }));

  console.log(`Đã kết nối MongoDB legacy family_state: ${mongoUri.replace(/:\/\/.*@/, "://***:***@")}`);
}

export function mongooseLoad(): FamilyOrganizerDB {
  if (!cachedState) throw new Error("MongoDB storage chưa được khởi tạo.");
  return clone(cachedState);
}

export function mongooseSave(data: FamilyOrganizerDB): void {
  cachedState = clone(data);
  const snapshot = clone(data);
  saveQueue = saveQueue
    .then(async () => {
      if (!useLegacyStateStorage) {
        await replaceChangedCollectionsState(snapshot);
        return;
      }
      await FamilyState.findByIdAndUpdate(
        STATE_ID,
        { _id: STATE_ID, schemaVersion: SCHEMA_VERSION, data: snapshot, updatedAt: new Date() },
        { upsert: true, returnDocument: "after" }
      ).exec();
      persistedState = clone(snapshot);
    })
    .catch(e => {
      console.error("Lỗi ghi dữ liệu vào MongoDB:", e);
    });
}

export function mongooseCheckpoint(): void {
  // Writes are serialized through saveQueue. Call sites only need a stable in-memory snapshot.
}

export async function flushMongooseWrites(): Promise<void> {
  await saveQueue;
}

export function mongooseAppendServerMetric(row: ServerMetricRow, keepMs = METRICS_KEEP_MS): void {
  cachedMetrics.push(row);
  const cutoff = row.t - keepMs;
  cachedMetrics = cachedMetrics.filter(metric => metric.t >= cutoff);

  void ServerMetric.updateOne({ t: row.t }, row, { upsert: true })
    .then(() => ServerMetric.deleteMany({ t: { $lt: cutoff } }).exec())
    .catch(e => console.error("Lỗi ghi server metrics vào MongoDB:", e));
}

export function mongooseGetServerMetrics(sinceMs: number): ServerMetricRow[] {
  return cachedMetrics.filter(metric => metric.t >= sinceMs).sort((a, b) => a.t - b.t);
}
