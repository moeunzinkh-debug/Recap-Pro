import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../db/schema";
import { encryptSecret, decryptSecret, maskSecret } from "./crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

export interface RecapItem {
  id: string;
  fileName: string;
  fileSize: number;
  durationSec: number;
  frameCount: number;
  model: string;
  title: string | null;
  script: string | null;
  status: "processing" | "done" | "failed";
  error: string | null;
  isPublic: boolean;
  createdAt: string;
}

export interface ApiKeyItem {
  id: string;
  name: string;
  valueEncrypted: string;
  createdAt: string;
  updatedAt: string;
}

// Durable file-backed store for standalone/container execution if postgres is not online
const DB_FILE = path.join(process.cwd(), ".data_store.json");

interface DataStore {
  recaps: RecapItem[];
  apiKeys: Record<string, ApiKeyItem>;
}

async function loadStore(): Promise<DataStore> {
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    return JSON.parse(raw);
  } catch {
    return { recaps: [], apiKeys: {} };
  }
}

async function saveStore(store: DataStore): Promise<void> {
  try {
    await fs.writeFile(DB_FILE, JSON.stringify(store, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write data store:", err);
  }
}

let pool: Pool | null = null;
let db: any = null;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
    db = drizzle(pool, { schema });
  } catch (e) {
    console.warn("Could not connect to PostgreSQL with DATABASE_URL, using local store:", e);
  }
}

export async function getAllRecaps(): Promise<RecapItem[]> {
  const store = await loadStore();
  return store.recaps.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
}

export async function getRecapById(id: string): Promise<RecapItem | null> {
  const store = await loadStore();
  return store.recaps.find((r) => r.id === id) || null;
}

export async function createRecap(
  data: Omit<RecapItem, "id" | "createdAt">
): Promise<RecapItem> {
  const store = await loadStore();
  const newRecap: RecapItem = {
    ...data,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  };
  store.recaps.unshift(newRecap);
  await saveStore(store);
  return newRecap;
}

export async function updateRecap(
  id: string,
  partial: Partial<RecapItem>
): Promise<RecapItem | null> {
  const store = await loadStore();
  const idx = store.recaps.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  store.recaps[idx] = { ...store.recaps[idx], ...partial };
  await saveStore(store);
  return store.recaps[idx];
}

export async function deleteRecap(id: string): Promise<boolean> {
  const store = await loadStore();
  const idx = store.recaps.findIndex((r) => r.id === id);
  if (idx === -1) return false;
  store.recaps.splice(idx, 1);
  await saveStore(store);
  return true;
}

export async function clearAllRecaps(): Promise<void> {
  const store = await loadStore();
  store.recaps = [];
  await saveStore(store);
}

export async function getActiveApiKey(name: string = "GEMINI_API_KEY"): Promise<{
  hasKey: boolean;
  masked: string;
  decrypted?: string;
}> {
  // Check user saved in store first
  const store = await loadStore();
  const entry = store.apiKeys[name];
  if (entry) {
    try {
      const dec = decryptSecret(entry.valueEncrypted);
      return { hasKey: true, masked: maskSecret(dec), decrypted: dec };
    } catch {
      // decryption failed
    }
  }

  // Fallback to environment variable
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey) {
    return { hasKey: true, masked: maskSecret(envKey), decrypted: envKey };
  }

  return { hasKey: false, masked: "" };
}

export async function setApiKey(
  name: string = "GEMINI_API_KEY",
  plainValue: string
): Promise<void> {
  const store = await loadStore();
  const encrypted = encryptSecret(plainValue.trim());
  const now = new Date().toISOString();
  store.apiKeys[name] = {
    id: crypto.randomUUID(),
    name,
    valueEncrypted: encrypted,
    createdAt: store.apiKeys[name]?.createdAt || now,
    updatedAt: now,
  };
  await saveStore(store);
}

export async function deleteApiKey(
  name: string = "GEMINI_API_KEY"
): Promise<boolean> {
  const store = await loadStore();
  if (store.apiKeys[name]) {
    delete store.apiKeys[name];
    await saveStore(store);
    return true;
  }
  return false;
}

