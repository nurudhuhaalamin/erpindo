import type { Role } from "@erpindo/shared";

/** Antarmuka minimal Workers AI — binding opsional (hanya terpasang di produksi). */
export type WorkersAi = {
  run(model: string, options: Record<string, unknown>): Promise<unknown>;
};

export type Env = {
  DB: D1Database;
  RATE_KV: KVNamespace;
  ASSETS: Fetcher;

  /** Workers AI (Asisten erpindo). Opsional: absen di dev/CI → endpoint AI membalas 503. */
  AI?: WorkersAi;

  // Pool database tenant untuk mode lokal (lihat wrangler.jsonc).
  TENANT_DB_1?: D1Database;
  TENANT_DB_2?: D1Database;
  TENANT_DB_3?: D1Database;
  TENANT_DB_4?: D1Database;
  TENANT_DB_5?: D1Database;
  TENANT_DB_6?: D1Database;

  TENANT_DB_MODE: "local" | "cloudflare";
  /** Opsional: override URL publik aplikasi; default origin request. */
  APP_URL?: string;

  /** Hanya untuk pengujian: override lama trial (hari). */
  TRIAL_DAYS_OVERRIDE?: string;

  /**
   * Daftar email (dipisah koma, case-insensitive) yang mendapat tenant
   * aktif permanen tanpa batasan langganan — dipakai untuk akun pemilik.
   * Disimpan sebagai secret di produksi agar email tidak masuk repo.
   */
  COMPED_EMAILS?: string;

  // Secret opsional (produksi).
  /** OAuth Google (backup Drive, Fase 8b). Tanpa keduanya fitur Drive nonaktif anggun. */
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  CLOUDFLARE_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
};

/** Data yang disematkan middleware auth ke konteks Hono. */
export type AuthedUser = {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  sessionId: string;
};

export type TenantContext = {
  id: string;
  name: string;
  slug: string;
  dbRef: string;
  status: string;
  role: Role;
};

export type AppVariables = {
  user: AuthedUser;
  tenant: TenantContext;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
