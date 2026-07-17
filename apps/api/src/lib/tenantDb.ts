import { applyMigrations, TENANT_MIGRATIONS, TENANT_SCHEMA_VERSION, type SqlExecutor } from "@erpindo/db";
import type { Env } from "../env";

/**
 * Abstraksi database-per-tenant.
 *
 * - Mode "local" (dev/test): tenant dipetakan ke pool binding D1 statis yang
 *   dideklarasikan di wrangler.jsonc (TENANT_DB_1..N). Binding Workers tidak
 *   bisa dibuat dinamis, jadi pool ini mensimulasikan provisioning nyata.
 * - Mode "cloudflare" (produksi): database D1 dibuat dinamis via REST API dan
 *   di-query lewat endpoint /d1/database/{uuid}/query.
 *
 * Kedua jalur mengembalikan antarmuka SqlExecutor yang sama sehingga kode
 * modul bisnis tidak perlu tahu berjalan di mode mana.
 */

const LOCAL_POOL = ["TENANT_DB_1", "TENANT_DB_2", "TENANT_DB_3", "TENANT_DB_4", "TENANT_DB_5", "TENANT_DB_6"] as const;

type CfD1QueryResult = {
  success: boolean;
  errors: { message: string }[];
  result: { results: unknown[]; success: boolean }[];
};

/** Driver produksi: eksekusi SQL ke D1 dinamis via Cloudflare REST API. */
class HttpD1Executor implements SqlExecutor {
  constructor(
    private accountId: string,
    private apiToken: string,
    private databaseId: string,
  ) {}

  prepare(query: string) {
    const exec = async <T>(params: unknown[]): Promise<{ results: T[] }> => {
      const url = `https://api.cloudflare.com/client/v4/accounts/${this.accountId}/d1/database/${this.databaseId}/query`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: query, params }),
      });
      const body = (await res.json()) as CfD1QueryResult;
      if (!res.ok || !body.success) {
        const msg = body.errors?.map((e) => e.message).join("; ") || res.statusText;
        throw new Error(`Query D1 tenant gagal: ${msg}`);
      }
      return { results: (body.result?.[0]?.results ?? []) as T[] };
    };

    // `.first()` melengkapi antarmuka D1 nyata (mode lokal) agar kode yang
    // memakainya tetap berjalan identik di mode cloudflare — ambil baris pertama
    // dalam SATU round-trip REST (bukan tarik semua lalu iris di sisi Worker).
    const first = async <T>(params: unknown[]): Promise<T | null> => {
      const { results } = await exec<T>(params);
      return results.length > 0 ? (results[0] as T) : null;
    };

    const statement = (params: unknown[]) => ({
      all: <T = unknown>() => exec<T>(params),
      run: () => exec(params),
      first: <T = unknown>() => first<T>(params),
    });

    return {
      bind: (...values: unknown[]) => statement(values),
      all: <T = unknown>() => exec<T>([]),
      run: () => exec([]),
      first: <T = unknown>() => first<T>([]),
    };
  }
}

export function getTenantDb(env: Env, dbRef: string): SqlExecutor {
  const [kind, ref] = dbRef.split(":", 2);
  if (kind === "binding") {
    const db = (env as unknown as Record<string, D1Database | undefined>)[ref!];
    if (!db) throw new Error(`Binding database tenant '${ref}' tidak ditemukan`);
    return db as unknown as SqlExecutor;
  }
  if (kind === "uuid") {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("CLOUDFLARE_API_TOKEN/ACCOUNT_ID belum dikonfigurasi untuk akses tenant produksi");
    }
    return new HttpD1Executor(env.CLOUDFLARE_ACCOUNT_ID, env.CLOUDFLARE_API_TOKEN, ref!);
  }
  throw new Error(`db_ref tidak dikenal: ${dbRef}`);
}

/**
 * Sediakan database untuk tenant baru dan jalankan migrasi skema tenant.
 * Mengembalikan db_ref yang disimpan di tabel tenants.
 */
export async function provisionTenantDb(env: Env, tenantSlug: string, usedRefs: string[]): Promise<string> {
  let dbRef: string;

  if (env.TENANT_DB_MODE === "cloudflare") {
    if (!env.CLOUDFLARE_API_TOKEN || !env.CLOUDFLARE_ACCOUNT_ID) {
      throw new Error("Mode cloudflare butuh CLOUDFLARE_API_TOKEN dan CLOUDFLARE_ACCOUNT_ID");
    }
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/d1/database`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: `erpindo-tenant-${tenantSlug}` }),
      },
    );
    const body = (await res.json()) as { success: boolean; result?: { uuid: string }; errors?: { message: string }[] };
    if (!res.ok || !body.success || !body.result) {
      throw new Error(`Gagal membuat database tenant: ${body.errors?.map((e) => e.message).join("; ")}`);
    }
    dbRef = `uuid:${body.result.uuid}`;
  } else {
    const used = new Set(usedRefs);
    const free = LOCAL_POOL.find((name) => {
      const bound = (env as unknown as Record<string, unknown>)[name] !== undefined;
      return bound && !used.has(`binding:${name}`);
    });
    if (!free) {
      throw new Error("Pool database tenant lokal habis — tambah binding TENANT_DB_* di wrangler.jsonc");
    }
    dbRef = `binding:${free}`;
  }

  const db = getTenantDb(env, dbRef);
  await applyMigrations(db, TENANT_MIGRATIONS);
  return dbRef;
}

/**
 * Pastikan database sebuah tenant berada di versi skema terkini.
 *
 * Ini menutup celah kapasitas/kompatibilitas utama sebelum Fase 11: dulu
 * `applyMigrations` hanya dijalankan SEKALI saat provisioning, sehingga tenant
 * lama TIDAK pernah menerima migrasi baru yang ditambahkan pada rilis berikut.
 * Fungsi ini dipanggil "malas" saat tenant diakses (middleware) dan borongan
 * lewat {@link migrateAllTenants} (cron/endpoint admin).
 *
 * Aman dipanggil di setiap request: bila `schemaVersion` sudah mutakhir, ia
 * langsung kembali tanpa menyentuh database tenant. `applyMigrations` sendiri
 * idempoten (mencatat id di tabel `_migrations`), jadi dua request paralel yang
 * sama-sama memicu migrasi tidak akan merusak apa pun. Mengembalikan versi
 * terbaru tenant tersebut.
 */
export async function ensureTenantMigrated(
  env: Env,
  tenant: { id: string; dbRef: string; schemaVersion: number },
): Promise<number> {
  if (tenant.schemaVersion >= TENANT_SCHEMA_VERSION) return tenant.schemaVersion;
  const db = getTenantDb(env, tenant.dbRef);
  const applied = await applyMigrations(db, TENANT_MIGRATIONS);
  await env.DB.prepare(`UPDATE tenants SET schema_version = ? WHERE id = ?`)
    .bind(TENANT_SCHEMA_VERSION, tenant.id)
    .run();
  if (applied.length > 0) {
    console.log(`[db] tenant ${tenant.id} migrasi diterapkan (v${tenant.schemaVersion}→v${TENANT_SCHEMA_VERSION}): ${applied.join(", ")}`);
  }
  return TENANT_SCHEMA_VERSION;
}

export type TenantMigrationResult = {
  id: string;
  slug: string;
  from: number;
  to: number;
  applied: string[];
  ok: boolean;
  error?: string;
};

/**
 * Terapkan migrasi tenant yang tertinggal ke SEMUA tenant. Dipakai saat rilis
 * skema baru agar tenant yang jarang/tak pernah dibuka (mis. hanya disentuh
 * cron) tetap termutakhirkan. Per-tenant di-try/catch terpisah: satu tenant
 * gagal tidak menghentikan sisanya (resumable — jalankan lagi untuk mencoba
 * ulang yang gagal, karena versi hanya dinaikkan saat sukses).
 */
export async function migrateAllTenants(env: Env): Promise<TenantMigrationResult[]> {
  const { results } = await env.DB.prepare(
    `SELECT id, slug, db_ref, schema_version FROM tenants ORDER BY created_at`,
  ).all<{ id: string; slug: string; db_ref: string; schema_version: number }>();

  const out: TenantMigrationResult[] = [];
  for (const t of results) {
    const from = t.schema_version;
    if (from >= TENANT_SCHEMA_VERSION) {
      out.push({ id: t.id, slug: t.slug, from, to: from, applied: [], ok: true });
      continue;
    }
    try {
      const db = getTenantDb(env, t.db_ref);
      const applied = await applyMigrations(db, TENANT_MIGRATIONS);
      await env.DB.prepare(`UPDATE tenants SET schema_version = ? WHERE id = ?`)
        .bind(TENANT_SCHEMA_VERSION, t.id)
        .run();
      out.push({ id: t.id, slug: t.slug, from, to: TENANT_SCHEMA_VERSION, applied, ok: true });
    } catch (err) {
      out.push({ id: t.id, slug: t.slug, from, to: from, applied: [], ok: false, error: (err as Error).message });
    }
  }
  return out;
}

export { TENANT_SCHEMA_VERSION };
