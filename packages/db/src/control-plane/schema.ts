import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

/**
 * Skema control-plane: data lintas-tenant (akun, tenant, langganan).
 * Seluruh data bisnis per perusahaan hidup di database tenant masing-masing.
 */

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  emailVerified: integer("email_verified", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});

export const tenants = sqliteTable("tenants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  /**
   * Referensi database tenant:
   *  - "binding:TENANT_DB_1"  → D1 binding lokal (dev/test)
   *  - "uuid:<database-uuid>" → database D1 nyata via Cloudflare API (produksi)
   */
  dbRef: text("db_ref").notNull(),
  status: text("status").notNull(),
  plan: text("plan").notNull().default("trial"),
  trialEndsAt: text("trial_ends_at"),
  schemaVersion: integer("schema_version").notNull().default(0),
  createdAt: text("created_at").notNull(),
});

export const memberships = sqliteTable(
  "memberships",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    tenantId: text("tenant_id").notNull(),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (t) => [uniqueIndex("memberships_user_tenant").on(t.userId, t.tenantId)],
);

export const sessions = sqliteTable("sessions", {
  /** SHA-256 hex dari token sesi — token mentah hanya ada di cookie klien. */
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
});

export const tokens = sqliteTable("tokens", {
  id: text("id").primaryKey(),
  /** SHA-256 hex dari token mentah yang dikirim via email/link. */
  tokenHash: text("token_hash").notNull().unique(),
  type: text("type").notNull(), // 'verify' | 'reset' | 'invite'
  email: text("email").notNull(),
  userId: text("user_id"),
  tenantId: text("tenant_id"),
  role: text("role"),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  tenantId: text("tenant_id"),
  userId: text("user_id"),
  action: text("action").notNull(),
  detail: text("detail"), // JSON string
  ip: text("ip"),
  createdAt: text("created_at").notNull(),
});
