import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  boolean,
} from "drizzle-orm/pg-core";

export const recaps = pgTable("recaps", {
  id: uuid("id").defaultRandom().primaryKey(),
  fileName: text("file_name").notNull(),
  fileSize: bigint("file_size", { mode: "number" }).notNull(),
  durationSec: integer("duration_sec").notNull(),
  frameCount: integer("frame_count").notNull().default(0),
  model: text("model").notNull().default("gemini-2.0-flash"),
  title: text("title"),
  script: text("script"),
  status: text("status").notNull().default("processing"), // processing | done | failed
  error: text("error"),
  isPublic: boolean("is_public").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Recap = typeof recaps.$inferSelect;
export type NewRecap = typeof recaps.$inferInsert;

/** User-managed API keys (encrypted at rest) e.g. GEMINI_API_KEY */
export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  valueEncrypted: text("value_encrypted").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
