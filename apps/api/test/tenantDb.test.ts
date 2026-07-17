import { TENANT_SCHEMA_VERSION } from "@erpindo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../src/env";
import { ensureTenantMigrated, getTenantDb, migrateAllTenants } from "../src/lib/tenantDb";

/**
 * Fase 11a — jalur produksi (mode cloudflare) & auto-migrasi tenant.
 *
 * Mode cloudflare (getTenantDb "uuid:") tak tersentuh smoke lokal, jadi diuji
 * di sini dengan fetch tiruan. Orkestrasi migrasi diuji dengan database tiruan
 * in-memory yang meniru semantik tabel `_migrations`.
 */

// --- HttpD1Executor via getTenantDb("uuid:...") + fetch tiruan ---------------

function cfResponse(rows: unknown[]) {
  return new Response(JSON.stringify({ success: true, errors: [], result: [{ results: rows, success: true }] }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

const cfEnv = { CLOUDFLARE_API_TOKEN: "tok", CLOUDFLARE_ACCOUNT_ID: "acc" } as unknown as Env;

describe("HttpD1Executor (mode cloudflare)", () => {
  afterEach(() => vi.restoreAllMocks());

  it("all() memetakan hasil D1 REST + mengirim sql & params", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(cfResponse([{ id: "a" }, { id: "b" }]));
    const db = getTenantDb(cfEnv, "uuid:db-123");
    const { results } = await db.prepare("SELECT id FROM x WHERE y = ?").bind(7).all<{ id: string }>();
    expect(results).toEqual([{ id: "a" }, { id: "b" }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain("/accounts/acc/d1/database/db-123/query");
    expect(JSON.parse(String(init?.body))).toEqual({ sql: "SELECT id FROM x WHERE y = ?", params: [7] });
  });

  it("first() mengembalikan baris pertama, atau null bila kosong", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(cfResponse([{ id: "a" }, { id: "b" }]));
    const db = getTenantDb(cfEnv, "uuid:db-123");
    expect(await db.prepare("SELECT id FROM x").bind().first<{ id: string }>()).toEqual({ id: "a" });

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(cfResponse([]));
    expect(await db.prepare("SELECT id FROM x").bind().first()).toBeNull();
  });

  it("melempar error yang jelas saat D1 REST gagal", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: false, errors: [{ message: "boom" }], result: [] }), { status: 500 }),
    );
    const db = getTenantDb(cfEnv, "uuid:db-123");
    await expect(db.prepare("SELECT 1").all()).rejects.toThrow(/boom/);
  });

  it("uuid: tanpa kredensial → error konfigurasi", () => {
    expect(() => getTenantDb({} as Env, "uuid:db-1")).toThrow(/CLOUDFLARE_API_TOKEN/);
  });
});

// --- Database tiruan: meniru semantik tabel `_migrations` --------------------

/** Executor tiruan yang cukup untuk applyMigrations (idempoten). */
function fakeTenantDb(opts: { seeded?: string[]; failOnRun?: boolean } = {}) {
  const migrations = new Set(opts.seeded ?? []);
  let touched = false;
  const exec = {
    prepare(sql: string) {
      const handle = (params: unknown[]) => ({
        async all<T = unknown>(): Promise<{ results: T[] }> {
          if (/SELECT id FROM _migrations/i.test(sql)) {
            return { results: [...migrations].map((id) => ({ id })) as T[] };
          }
          return { results: [] };
        },
        async run() {
          touched = true;
          if (opts.failOnRun) throw new Error("tenant db meledak");
          if (/INSERT INTO _migrations/i.test(sql)) migrations.add(String(params[0]));
          return {};
        },
        async first<T = unknown>(): Promise<T | null> {
          return null;
        },
      });
      return {
        bind: (...p: unknown[]) => handle(p),
        all: <T = unknown>() => handle([]).all<T>(),
        run: () => handle([]).run(),
        first: <T = unknown>() => handle([]).first<T>(),
      };
    },
  };
  return { exec, get touched() { return touched; }, get count() { return migrations.size; } };
}

/** Control-plane tiruan: hanya tabel `tenants` (SELECT semua + UPDATE versi). */
function fakeControlPlane(rows: { id: string; slug: string; db_ref: string; schema_version: number }[]) {
  return {
    prepare(sql: string) {
      const handle = (params: unknown[]) => ({
        async all<T = unknown>(): Promise<{ results: T[] }> {
          if (/FROM tenants/i.test(sql)) return { results: rows as T[] };
          return { results: [] };
        },
        async run() {
          if (/UPDATE tenants SET schema_version/i.test(sql)) {
            const [version, id] = params as [number, string];
            const row = rows.find((r) => r.id === id);
            if (row) row.schema_version = version;
          }
          return {};
        },
        async first<T = unknown>(): Promise<T | null> {
          return null;
        },
      });
      return {
        bind: (...p: unknown[]) => handle(p),
        all: <T = unknown>() => handle([]).all<T>(),
        run: () => handle([]).run(),
        first: <T = unknown>() => handle([]).first<T>(),
      };
    },
  };
}

describe("ensureTenantMigrated", () => {
  it("tenant mutakhir → langsung kembali, database tak disentuh", async () => {
    const tenantDb = fakeTenantDb();
    const env = { DB: fakeControlPlane([]), TDB: tenantDb.exec } as unknown as Env;
    const v = await ensureTenantMigrated(env, { id: "t1", dbRef: "binding:TDB", schemaVersion: TENANT_SCHEMA_VERSION });
    expect(v).toBe(TENANT_SCHEMA_VERSION);
    expect(tenantDb.touched).toBe(false);
  });

  it("tenant tertinggal → migrasi diterapkan + versi dinaikkan di control-plane", async () => {
    const tenantDb = fakeTenantDb();
    const rows = [{ id: "t1", slug: "toko", db_ref: "binding:TDB", schema_version: 0 }];
    const env = { DB: fakeControlPlane(rows), TDB: tenantDb.exec } as unknown as Env;
    const v = await ensureTenantMigrated(env, { id: "t1", dbRef: "binding:TDB", schemaVersion: 0 });
    expect(v).toBe(TENANT_SCHEMA_VERSION);
    expect(tenantDb.count).toBe(TENANT_SCHEMA_VERSION); // semua migrasi tercatat
    expect(rows[0]?.schema_version).toBe(TENANT_SCHEMA_VERSION);
  });
});

describe("migrateAllTenants", () => {
  it("mutakhir dilewati, tertinggal dimigrasi, gagal terisolasi (resumable)", async () => {
    const fresh = fakeTenantDb();
    const stale = fakeTenantDb();
    const broken = fakeTenantDb({ failOnRun: true });
    const rows = [
      { id: "t-fresh", slug: "fresh", db_ref: "binding:FRESH", schema_version: TENANT_SCHEMA_VERSION },
      { id: "t-stale", slug: "stale", db_ref: "binding:STALE", schema_version: 0 },
      { id: "t-broken", slug: "broken", db_ref: "binding:BROKEN", schema_version: 0 },
    ];
    const env = {
      DB: fakeControlPlane(rows),
      FRESH: fresh.exec,
      STALE: stale.exec,
      BROKEN: broken.exec,
    } as unknown as Env;

    const results = await migrateAllTenants(env);
    const pick = (id: string) => {
      const r = results.find((x) => x.id === id);
      if (!r) throw new Error(`hasil migrasi tenant ${id} tidak ada`);
      return r;
    };

    // Mutakhir: dilewati tanpa menyentuh DB.
    expect(pick("t-fresh").ok).toBe(true);
    expect(pick("t-fresh").applied).toEqual([]);
    expect(fresh.touched).toBe(false);

    // Tertinggal: semua migrasi diterapkan + versi control-plane naik.
    expect(pick("t-stale").ok).toBe(true);
    expect(pick("t-stale").applied.length).toBe(TENANT_SCHEMA_VERSION);
    expect(rows.find((r) => r.id === "t-stale")?.schema_version).toBe(TENANT_SCHEMA_VERSION);

    // Gagal: dilaporkan error, versi TIDAK naik (dicoba ulang saat dijalankan lagi).
    expect(pick("t-broken").ok).toBe(false);
    expect(pick("t-broken").error).toMatch(/meledak/);
    expect(rows.find((r) => r.id === "t-broken")?.schema_version).toBe(0);
  });
});
