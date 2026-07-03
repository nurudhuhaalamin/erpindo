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
  {
    id: "0002_totp",
    statements: [
      `ALTER TABLE users ADD COLUMN totp_secret TEXT`,
      `ALTER TABLE users ADD COLUMN totp_enabled INTEGER NOT NULL DEFAULT 0`,
    ],
  },
];

/**
 * Skema database tenant Fase 0: baru berisi pengaturan perusahaan.
 * Tabel-tabel modul bisnis (COA, jurnal, produk, dst.) ditambahkan sebagai
 * migrasi baru pada Fase 1.
 */
/**
 * Template Bagan Akun (COA) standar UMKM Indonesia. Disemai lewat migrasi
 * sehingga tenant baru maupun lama mendapatkannya. Akun sistem (is_system=1)
 * tidak dapat diarsipkan dan menjadi sasaran jurnal otomatis modul lain.
 */
const COA_SEED: [code: string, name: string, type: string][] = [
  ["1-1000", "Kas", "asset"],
  ["1-1100", "Bank", "asset"],
  ["1-1200", "Piutang Usaha", "asset"],
  ["1-1300", "Persediaan Barang", "asset"],
  ["1-1400", "PPN Masukan", "asset"],
  ["1-1500", "Aset Tetap", "asset"],
  ["1-1510", "Akumulasi Penyusutan", "asset"],
  ["2-1000", "Hutang Usaha", "liability"],
  ["2-1100", "PPN Keluaran", "liability"],
  ["2-1200", "Hutang Gaji", "liability"],
  ["3-1000", "Modal Pemilik", "equity"],
  ["3-2000", "Laba Ditahan", "equity"],
  ["4-1000", "Pendapatan Penjualan", "income"],
  ["4-2000", "Pendapatan Lain-lain", "income"],
  ["5-1000", "Harga Pokok Penjualan", "expense"],
  ["5-2000", "Beban Gaji", "expense"],
  ["5-3000", "Beban Sewa", "expense"],
  ["5-4000", "Beban Operasional Lain", "expense"],
];

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
  {
    id: "0002_accounting_masterdata",
    statements: [
      // --- Bagan Akun -----------------------------------------------------
      `CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('asset','liability','equity','income','expense')),
        is_system INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // --- Jurnal double-entry ---------------------------------------------
      // Nominal disimpan sebagai INTEGER rupiah (IDR tidak memakai sen).
      `CREATE TABLE journal_entries (
        id TEXT PRIMARY KEY,
        entry_no TEXT NOT NULL UNIQUE,
        entry_date TEXT NOT NULL,
        memo TEXT,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','void')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE journal_lines (
        id TEXT PRIMARY KEY,
        entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        account_id TEXT NOT NULL REFERENCES accounts(id),
        description TEXT,
        debit INTEGER NOT NULL DEFAULT 0 CHECK (debit >= 0),
        credit INTEGER NOT NULL DEFAULT 0 CHECK (credit >= 0),
        CHECK (NOT (debit > 0 AND credit > 0))
      )`,
      `CREATE INDEX journal_lines_entry ON journal_lines (entry_id)`,
      `CREATE INDEX journal_lines_account ON journal_lines (account_id)`,
      // --- Master data ------------------------------------------------------
      `CREATE TABLE contacts (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL CHECK (type IN ('customer','supplier','both')),
        name TEXT NOT NULL,
        email TEXT,
        phone TEXT,
        address TEXT,
        npwp TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE products (
        id TEXT PRIMARY KEY,
        sku TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        unit TEXT NOT NULL DEFAULT 'pcs',
        sell_price INTEGER NOT NULL DEFAULT 0,
        buy_price INTEGER NOT NULL DEFAULT 0,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE warehouses (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        address TEXT,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // --- Seed COA + gudang utama -----------------------------------------
      ...COA_SEED.map(
        ([code, name, type]) =>
          `INSERT INTO accounts (id, code, name, type, is_system) VALUES ('acc-${code}', '${code}', '${name}', '${type}', 1)`,
      ),
      `INSERT INTO warehouses (id, code, name) VALUES ('wh-utama', 'UTAMA', 'Gudang Utama')`,
    ],
  },
  {
    id: "0003_commerce",
    statements: [
      // --- Faktur penjualan --------------------------------------------------
      `CREATE TABLE invoices (
        id TEXT PRIMARY KEY,
        invoice_no TEXT NOT NULL UNIQUE,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        invoice_date TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','paid')),
        subtotal INTEGER NOT NULL,
        tax_rate INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE invoice_lines (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        description TEXT,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        amount INTEGER NOT NULL
      )`,
      `CREATE INDEX invoice_lines_invoice ON invoice_lines (invoice_id)`,
      // --- Faktur pembelian ---------------------------------------------------
      `CREATE TABLE purchases (
        id TEXT PRIMARY KEY,
        purchase_no TEXT NOT NULL UNIQUE,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        purchase_date TEXT NOT NULL,
        due_date TEXT,
        status TEXT NOT NULL DEFAULT 'posted' CHECK (status IN ('posted','paid')),
        subtotal INTEGER NOT NULL,
        tax_rate INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        paid_amount INTEGER NOT NULL DEFAULT 0,
        journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE purchase_lines (
        id TEXT PRIMARY KEY,
        purchase_id TEXT NOT NULL REFERENCES purchases(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        description TEXT,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        amount INTEGER NOT NULL
      )`,
      `CREATE INDEX purchase_lines_purchase ON purchase_lines (purchase_id)`,
      // --- Stok: mutasi + level berjalan (moving average cost) -----------------
      `CREATE TABLE stock_movements (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        ref_type TEXT NOT NULL CHECK (ref_type IN ('purchase','sale','adjustment')),
        ref_id TEXT,
        qty INTEGER NOT NULL,
        unit_cost INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX stock_movements_product ON stock_movements (product_id, warehouse_id)`,
      `CREATE TABLE stock_levels (
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        qty INTEGER NOT NULL DEFAULT 0,
        avg_cost INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (product_id, warehouse_id)
      )`,
      // --- Pembayaran (terima dari pelanggan / bayar ke pemasok) ---------------
      `CREATE TABLE payments (
        id TEXT PRIMARY KEY,
        payment_no TEXT NOT NULL UNIQUE,
        direction TEXT NOT NULL CHECK (direction IN ('receive','pay')),
        ref_type TEXT NOT NULL CHECK (ref_type IN ('invoice','purchase')),
        ref_id TEXT NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        amount INTEGER NOT NULL CHECK (amount > 0),
        payment_date TEXT NOT NULL,
        journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
