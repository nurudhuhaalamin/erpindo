/**
 * Migrasi tertanam: sumber kebenaran skema untuk control-plane dan database
 * tenant. Disimpan sebagai konstanta agar bisa dijalankan dari Worker saat
 * provisioning tenant baru maupun saat upgrade versi (tanpa akses filesystem).
 *
 * Aturan: migrasi bersifat append-only — jangan pernah mengubah entri lama,
 * selalu tambahkan migrasi baru di akhir daftar.
 */

export type Migration = {
  id: string;
  statements: string[];
};

export const CONTROL_PLANE_MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        email_verified INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE tenants (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        db_ref TEXT NOT NULL,
        status TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'trial',
        trial_ends_at TEXT,
        schema_version INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE memberships (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at TEXT NOT NULL
      )`,
      `CREATE UNIQUE INDEX memberships_user_tenant ON memberships (user_id, tenant_id)`,
      `CREATE TABLE sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      )`,
      `CREATE INDEX sessions_user ON sessions (user_id)`,
      `CREATE TABLE tokens (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        email TEXT NOT NULL,
        user_id TEXT,
        tenant_id TEXT,
        role TEXT,
        expires_at TEXT NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE audit_logs (
        id TEXT PRIMARY KEY,
        tenant_id TEXT,
        user_id TEXT,
        action TEXT NOT NULL,
        detail TEXT,
        ip TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX audit_logs_tenant ON audit_logs (tenant_id, created_at)`,
    ],
  },
];

/**
 * Skema database tenant Fase 0: baru berisi pengaturan perusahaan.
 * Tabel-tabel modul bisnis (COA, jurnal, produk, dst.) ditambahkan sebagai
 * migrasi baru pada Fase 1.
 */
export const TENANT_MIGRATIONS: Migration[] = [
  {
    id: "0001_init",
    statements: [
      `CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
  },
];

/** Antarmuka minimal database yang dibutuhkan runner migrasi (kompatibel D1). */
export type SqlExecutor = {
  prepare(query: string): {
    bind(...values: unknown[]): {
      all<T = unknown>(): Promise<{ results: T[] }>;
      run(): Promise<unknown>;
    };
    all<T = unknown>(): Promise<{ results: T[] }>;
    run(): Promise<unknown>;
  };
};

/**
 * Terapkan migrasi yang belum berjalan, dicatat di tabel `_migrations`.
 * Aman dipanggil berulang (idempotent). Mengembalikan daftar id yang baru
 * diterapkan.
 */
export async function applyMigrations(db: SqlExecutor, migrations: Migration[]): Promise<string[]> {
  await db
    .prepare(`CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at TEXT NOT NULL)`)
    .run();

  const { results } = await db.prepare(`SELECT id FROM _migrations`).all<{ id: string }>();
  const done = new Set(results.map((r) => r.id));
  const applied: string[] = [];

  for (const migration of migrations) {
    if (done.has(migration.id)) continue;
    for (const statement of migration.statements) {
      await db.prepare(statement).run();
    }
    await db
      .prepare(`INSERT INTO _migrations (id, applied_at) VALUES (?, ?)`)
      .bind(migration.id, new Date().toISOString())
      .run();
    applied.push(migration.id);
  }
  return applied;
}

export const TENANT_SCHEMA_VERSION = TENANT_MIGRATIONS.length;
