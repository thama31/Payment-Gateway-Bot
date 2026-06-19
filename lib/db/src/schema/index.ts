import {
  pgTable,
  text,
  serial,
  bigint,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  telegramId: bigint("telegram_id", { mode: "number" }).primaryKey(),
  username: text("username"),
  firstName: text("first_name"),
  language: varchar("language", { length: 4 }).notNull().default("id"),
  region: varchar("region", { length: 8 }).notNull().default("id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const subscriptionsTable = pgTable("subscriptions", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  planId: text("plan_id").notNull(),
  region: varchar("region", { length: 8 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("active"),
  startedAt: timestamp("started_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentProofsTable = pgTable("payment_proofs", {
  id: serial("id").primaryKey(),
  telegramId: bigint("telegram_id", { mode: "number" }).notNull(),
  username: text("username"),
  planId: text("plan_id").notNull(),
  region: varchar("region", { length: 8 }).notNull(),
  method: varchar("method", { length: 64 }).notNull(),
  fileId: text("file_id"),
  caption: text("caption"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  adminMessageId: bigint("admin_message_id", { mode: "number" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  reviewedAt: timestamp("reviewed_at"),
});

export type User = typeof usersTable.$inferSelect;
export type Subscription = typeof subscriptionsTable.$inferSelect;
export type PaymentProof = typeof paymentProofsTable.$inferSelect;
