import type { Role } from "@erpindo/shared";

export type Env = {
  DB: D1Database;
  RATE_KV: KVNamespace;
  ASSETS: Fetcher;

  // Pool database tenant untuk mode lokal (lihat wrangler.jsonc).
  TENANT_DB_1?: D1Database;
  TENANT_DB_2?: D1Database;
  TENANT_DB_3?: D1Database;
  TENANT_DB_4?: D1Database;
  TENANT_DB_5?: D1Database;

  TENANT_DB_MODE: "local" | "cloudflare";
  /** Opsional: override URL publik aplikasi; default origin request. */
  APP_URL?: string;

  /** Hanya untuk pengujian: override lama trial (hari). */
  TRIAL_DAYS_OVERRIDE?: string;

  // Secret opsional (produksi).
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
