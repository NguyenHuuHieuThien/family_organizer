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
const METRICS_KEEP_MS = 7 * 24 * 3600 * 1000;

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI || DEFAULT_MONGO_URI;

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

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

let cachedState: FamilyOrganizerDB | null = null;
let cachedMetrics: ServerMetricRow[] = [];
let saveQueue: Promise<void> = Promise.resolve();

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

  FamilyState = mongooseMod.models.FamilyState || mongooseMod.model("FamilyState", familyStateSchema);
  ServerMetric = mongooseMod.models.ServerMetric || mongooseMod.model("ServerMetric", serverMetricSchema);
}

export async function initializeMongooseStorage(seed: FamilyOrganizerDB): Promise<void> {
  await ensureModels();
  if (mongooseMod!.connection.readyState === 0) {
    await mongooseMod!.connect(mongoUri, { serverSelectionTimeoutMS: 8000 });
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

  console.log(`Đã kết nối MongoDB bằng Mongoose: ${mongoUri.replace(/:\/\/.*@/, "://***:***@")}`);
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
      await FamilyState.findByIdAndUpdate(
        STATE_ID,
        { _id: STATE_ID, schemaVersion: SCHEMA_VERSION, data: snapshot, updatedAt: new Date() },
        { upsert: true, returnDocument: "after" }
      ).exec();
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
