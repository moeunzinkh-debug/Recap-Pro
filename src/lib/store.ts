/**
 * Recap Pro storage layer.
 *
 * Production (Cloudflare Workers): Cloudflare D1 (SQLite) bound as `RECAPS_DB`.
 * Tables are created automatically on first use, so no manual migrations are
 * needed after `npm run db:create`.
 *
 * Fallback: an in-memory store so the worker still runs when the D1 binding
 * is missing (useful for quick tests) — data will NOT persist in that mode.
 */

import { decryptSecret, encryptSecret, maskSecret, type CryptoEnv } from "./crypto";

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

export interface StoreEnv extends CryptoEnv {
  /** Cloudflare D1 database binding */
  RECAPS_DB?: D1DatabaseLike;
  /** Gemini API key used as a fallback when no key is stored */
  GEMINI_API_KEY?: string;
}

export interface RecapStore {
  readonly backend: "d1" | "memory";
  getAllRecaps(): Promise<RecapItem[]>;
  getRecapById(id: string): Promise<RecapItem | null>;
  createRecap(data: Omit<RecapItem, "id" | "createdAt">): Promise<RecapItem>;
  updateRecap(
    id: string,
    partial: Partial<RecapItem>
  ): Promise<RecapItem | null>;
  deleteRecap(id: string): Promise<boolean>;
  clearAllRecaps(): Promise<void>;
  getActiveApiKey(
    name?: string
  ): Promise<{ hasKey: boolean; masked: string; decrypted?: string }>;
  setApiKey(name: string | undefined, plainValue: string): Promise<void>;
  deleteApiKey(name?: string): Promise<boolean>;
}

export interface ActiveApiKeyInfo {
  hasKey: boolean;
  masked: string;
  decrypted?: string;
}

/* ------------------------------------------------------------------ */
/* Minimal Cloudflare D1 typings (runtime-compatible with real D1).    */
/* ------------------------------------------------------------------ */

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(columnName?: string): Promise<T | null>;
  all<T = unknown>(): Promise<{ results: T[] }>;
  run(): Promise<unknown>;
}

export interface D1DatabaseLike {
  prepare(query: string): D1PreparedStatement;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function nowIso(): string {
  return new Date().toISOString();
}

function newId(): string {
  return crypto.randomUUID();
}

function toRecapStatus(value: unknown): RecapItem["status"] {
  return value === "done" || value === "failed" ? value : "processing";
}

/* ------------------------------------------------------------------ */
/* D1 (Cloudflare Workers production storage)                          */
/* ------------------------------------------------------------------ */

interface RecapRow {
  id: string;
  file_name: string;
  file_size: number;
  duration_sec: number;
  frame_count: number;
  model: string;
  title: string | null;
  script: string | null;
  status: string;
  error: string | null;
  is_public: number | boolean;
  created_at: string;
}

interface ApiKeyRow {
  id: string;
  name: string;
  value_encrypted: string;
  created_at: string;
  updated_at: string;
}

function rowToRecap(row: RecapRow): RecapItem {
  return {
    id: String(row.id),
    fileName: String(row.file_name ?? ""),
    fileSize: Number(row.file_size) || 0,
    durationSec: Number(row.duration_sec) || 0,
    frameCount: Number(row.frame_count) || 0,
    model: String(row.model ?? "gemini-3.7-flash"),
    title: row.title ?? null,
    script: row.script ?? null,
    status: toRecapStatus(row.status),
    error: row.error ?? null,
    isPublic: Boolean(row.is_public),
    createdAt: String(row.created_at ?? ""),
  };
}

class D1Store implements RecapStore {
  readonly backend = "d1" as const;
  private ensurePromise: Promise<void> | null = null;

  constructor(
    private db: D1DatabaseLike,
    private env: StoreEnv
  ) {}

  private ensureTables(): Promise<void> {
    if (!this.ensurePromise) {
      this.ensurePromise = (async () => {
        await this.db
          .prepare(
            `CREATE TABLE IF NOT EXISTS recaps (
              id TEXT PRIMARY KEY,
              file_name TEXT NOT NULL,
              file_size INTEGER NOT NULL DEFAULT 0,
              duration_sec INTEGER NOT NULL DEFAULT 0,
              frame_count INTEGER NOT NULL DEFAULT 0,
              model TEXT NOT NULL DEFAULT 'gemini-3.7-flash',
              title TEXT,
              script TEXT,
              status TEXT NOT NULL DEFAULT 'processing',
              error TEXT,
              is_public INTEGER NOT NULL DEFAULT 1,
              created_at TEXT NOT NULL
            )`
          )
          .run();
        await this.db
          .prepare(
            `CREATE TABLE IF NOT EXISTS api_keys (
              id TEXT PRIMARY KEY,
              name TEXT NOT NULL UNIQUE,
              value_encrypted TEXT NOT NULL,
              created_at TEXT NOT NULL,
              updated_at TEXT NOT NULL
            )`
          )
          .run();
      })().catch((err) => {
        this.ensurePromise = null;
        throw err;
      });
    }
    return this.ensurePromise;
  }

  async getAllRecaps(): Promise<RecapItem[]> {
    await this.ensureTables();
    const { results } = await this.db
      .prepare("SELECT * FROM recaps ORDER BY created_at DESC")
      .all<RecapRow>();
    return results.map(rowToRecap);
  }

  async getRecapById(id: string): Promise<RecapItem | null> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT * FROM recaps WHERE id = ?1")
      .bind(id)
      .first<RecapRow>();
    return row ? rowToRecap(row) : null;
  }

  async createRecap(
    data: Omit<RecapItem, "id" | "createdAt">
  ): Promise<RecapItem> {
    await this.ensureTables();
    const recap: RecapItem = {
      ...data,
      id: newId(),
      createdAt: nowIso(),
    };
    await this.db
      .prepare(
        `INSERT INTO recaps
          (id, file_name, file_size, duration_sec, frame_count, model, title, script, status, error, is_public, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)`
      )
      .bind(
        recap.id,
        recap.fileName,
        recap.fileSize,
        recap.durationSec,
        recap.frameCount,
        recap.model,
        recap.title,
        recap.script,
        recap.status,
        recap.error,
        recap.isPublic ? 1 : 0,
        recap.createdAt
      )
      .run();
    return recap;
  }

  async updateRecap(
    id: string,
    partial: Partial<RecapItem>
  ): Promise<RecapItem | null> {
    await this.ensureTables();
    const current = await this.getRecapById(id);
    if (!current) return null;
    const next: RecapItem = { ...current, ...partial };
    await this.db
      .prepare(
        `UPDATE recaps
            SET file_name = ?1, file_size = ?2, duration_sec = ?3, frame_count = ?4,
                model = ?5, title = ?6, script = ?7, status = ?8, error = ?9,
                is_public = ?10, created_at = ?11
          WHERE id = ?12`
      )
      .bind(
        next.fileName,
        next.fileSize,
        next.durationSec,
        next.frameCount,
        next.model,
        next.title,
        next.script,
        next.status,
        next.error,
        next.isPublic ? 1 : 0,
        next.createdAt,
        next.id
      )
      .run();
    return next;
  }

  async deleteRecap(id: string): Promise<boolean> {
    await this.ensureTables();
    const existing = await this.getRecapById(id);
    if (!existing) return false;
    await this.db.prepare("DELETE FROM recaps WHERE id = ?1").bind(id).run();
    return true;
  }

  async clearAllRecaps(): Promise<void> {
    await this.ensureTables();
    await this.db.prepare("DELETE FROM recaps").run();
  }

  async getActiveApiKey(name: string = "GEMINI_API_KEY"): Promise<ActiveApiKeyInfo> {
    await this.ensureTables();
    const row = await this.db
      .prepare("SELECT * FROM api_keys WHERE name = ?1")
      .bind(name)
      .first<ApiKeyRow>();
    if (row) {
      try {
        const dec = await decryptSecret(String(row.value_encrypted ?? ""), this.env);
        return { hasKey: true, masked: maskSecret(dec), decrypted: dec };
      } catch {
        // stored value can no longer be decrypted — fall through to env key
      }
    }

    const envKey = this.env.GEMINI_API_KEY;
    if (envKey) {
      return { hasKey: true, masked: maskSecret(envKey), decrypted: envKey };
    }

    return { hasKey: false, masked: "" };
  }

  async setApiKey(
    name: string = "GEMINI_API_KEY",
    plainValue: string
  ): Promise<void> {
    await this.ensureTables();
    const encrypted = await encryptSecret(plainValue.trim(), this.env);
    const now = nowIso();
    const existing = await this.db
      .prepare("SELECT * FROM api_keys WHERE name = ?1")
      .bind(name)
      .first<ApiKeyRow>();
    if (existing) {
      await this.db
        .prepare("UPDATE api_keys SET value_encrypted = ?1, updated_at = ?2 WHERE name = ?3")
        .bind(encrypted, now, name)
        .run();
    } else {
      await this.db
        .prepare(
          "INSERT INTO api_keys (id, name, value_encrypted, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5)"
        )
        .bind(newId(), name, encrypted, now, now)
        .run();
    }
  }

  async deleteApiKey(name: string = "GEMINI_API_KEY"): Promise<boolean> {
    await this.ensureTables();
    const existing = await this.db
      .prepare("SELECT * FROM api_keys WHERE name = ?1")
      .bind(name)
      .first<ApiKeyRow>();
    if (!existing) return false;
    await this.db
      .prepare("DELETE FROM api_keys WHERE name = ?1")
      .bind(name)
      .run();
    return true;
  }
}

/* ------------------------------------------------------------------ */
/* In-memory fallback (no D1 binding / local quick tests)              */
/* ------------------------------------------------------------------ */

class MemoryStore implements RecapStore {
  readonly backend = "memory" as const;
  private recaps: RecapItem[] = [];
  private apiKeys = new Map<string, ApiKeyItem>();

  constructor(private env: StoreEnv) {}

  async getAllRecaps(): Promise<RecapItem[]> {
    return [...this.recaps]
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      .map((r) => ({ ...r }));
  }

  async getRecapById(id: string): Promise<RecapItem | null> {
    const found = this.recaps.find((r) => r.id === id);
    return found ? { ...found } : null;
  }

  async createRecap(
    data: Omit<RecapItem, "id" | "createdAt">
  ): Promise<RecapItem> {
    const recap: RecapItem = {
      ...data,
      id: newId(),
      createdAt: nowIso(),
    };
    this.recaps.unshift(recap);
    return { ...recap };
  }

  async updateRecap(
    id: string,
    partial: Partial<RecapItem>
  ): Promise<RecapItem | null> {
    const idx = this.recaps.findIndex((r) => r.id === id);
    if (idx === -1) return null;
    this.recaps[idx] = { ...this.recaps[idx], ...partial };
    return { ...this.recaps[idx] };
  }

  async deleteRecap(id: string): Promise<boolean> {
    const idx = this.recaps.findIndex((r) => r.id === id);
    if (idx === -1) return false;
    this.recaps.splice(idx, 1);
    return true;
  }

  async clearAllRecaps(): Promise<void> {
    this.recaps = [];
  }

  async getActiveApiKey(name: string = "GEMINI_API_KEY"): Promise<ActiveApiKeyInfo> {
    const entry = this.apiKeys.get(name);
    if (entry) {
      try {
        const dec = await decryptSecret(entry.valueEncrypted, this.env);
        return { hasKey: true, masked: maskSecret(dec), decrypted: dec };
      } catch {
        // corrupted value — fall through to env key
      }
    }

    const envKey = this.env.GEMINI_API_KEY;
    if (envKey) {
      return { hasKey: true, masked: maskSecret(envKey), decrypted: envKey };
    }

    return { hasKey: false, masked: "" };
  }

  async setApiKey(
    name: string = "GEMINI_API_KEY",
    plainValue: string
  ): Promise<void> {
    const encrypted = await encryptSecret(plainValue.trim(), this.env);
    const now = nowIso();
    const existing = this.apiKeys.get(name);
    this.apiKeys.set(name, {
      id: existing?.id || newId(),
      name,
      valueEncrypted: encrypted,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
    });
  }

  async deleteApiKey(name: string = "GEMINI_API_KEY"): Promise<boolean> {
    return this.apiKeys.delete(name);
  }
}

/* ------------------------------------------------------------------ */
/* Factory                                                             */
/* ------------------------------------------------------------------ */

let warnedMemoryFallback = false;

export function createStore(env: StoreEnv): RecapStore {
  if (env.RECAPS_DB) {
    return new D1Store(env.RECAPS_DB, env);
  }
  if (!warnedMemoryFallback) {
    warnedMemoryFallback = true;
    console.warn(
      "[Recap Pro] RECAPS_DB (D1) is not bound — using in-memory storage. " +
        "Data will NOT persist. Run `npm run db:create` and redeploy to enable D1."
    );
  }
  return new MemoryStore(env);
}

export function createMemoryStore(env: StoreEnv = {}): RecapStore {
  return new MemoryStore(env);
}
