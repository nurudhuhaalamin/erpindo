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
  {
    id: "0003_custom_roles",
    statements: [
      // RBAC granular (Fase 7e): peran kustom per tenant. base_role menjaga
      // kompatibilitas requireTenantRole (baca/tulis per level); permissions =
      // JSON array kunci modul yang boleh diakses. memberships.custom_role_id
      // menunjuk peran kustom bila anggota memakainya (role tetap terisi base).
      `CREATE TABLE custom_roles (
        id TEXT PRIMARY KEY,
        tenant_id TEXT NOT NULL,
        name TEXT NOT NULL,
        base_role TEXT NOT NULL,
        permissions TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX custom_roles_tenant ON custom_roles (tenant_id)`,
      `ALTER TABLE memberships ADD COLUMN custom_role_id TEXT`,
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
  {
    id: "0004_returns",
    statements: [
      // Retur penjualan (nota kredit) & pembelian (nota debit), terikat dokumen asal.
      `CREATE TABLE returns (
        id TEXT PRIMARY KEY,
        return_no TEXT NOT NULL UNIQUE,
        ref_type TEXT NOT NULL CHECK (ref_type IN ('invoice','purchase')),
        ref_id TEXT NOT NULL,
        return_date TEXT NOT NULL,
        memo TEXT,
        subtotal INTEGER NOT NULL,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        journal_entry_id TEXT NOT NULL REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE return_lines (
        id TEXT PRIMARY KEY,
        return_id TEXT NOT NULL REFERENCES returns(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        amount INTEGER NOT NULL
      )`,
      `CREATE INDEX return_lines_return ON return_lines (return_id)`,
      `CREATE INDEX returns_ref ON returns (ref_type, ref_id)`,
      // Sisa tagihan efektif = total - paid_amount - returned_amount.
      `ALTER TABLE invoices ADD COLUMN returned_amount INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE purchases ADD COLUMN returned_amount INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "0005_pos",
    statements: [
      // Sesi kasir: buka dengan kas awal, tutup dengan hitung kas fisik.
      `CREATE TABLE pos_shifts (
        id TEXT PRIMARY KEY,
        shift_no TEXT NOT NULL UNIQUE,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
        opening_cash INTEGER NOT NULL DEFAULT 0,
        opened_by TEXT NOT NULL,
        opened_at TEXT NOT NULL DEFAULT (datetime('now')),
        expected_cash INTEGER,
        closing_cash INTEGER,
        difference INTEGER,
        journal_entry_id TEXT,
        closed_by TEXT,
        closed_at TEXT
      )`,
      // Penjualan POS memakai mesin faktur yang sama; kolom ini menautkannya ke shift.
      `ALTER TABLE invoices ADD COLUMN pos_shift_id TEXT`,
    ],
  },
  {
    id: "0006_approvals",
    statements: [
      // Antrean persetujuan: dokumen DISIMPAN sebagai payload dan baru
      // diposting (jurnal + stok) saat Owner menyetujui.
      `CREATE TABLE approval_requests (
        id TEXT PRIMARY KEY,
        request_no TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL CHECK (type IN ('purchase')),
        payload TEXT NOT NULL,
        summary TEXT,
        total INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        requested_by TEXT NOT NULL,
        requested_at TEXT NOT NULL DEFAULT (datetime('now')),
        decided_by TEXT,
        decided_at TEXT,
        decision_note TEXT,
        result_doc_id TEXT
      )`,
    ],
  },
  {
    id: "0007_lots",
    statements: [
      // Pelacakan lot/batch + kedaluwarsa per produk (opsional per produk).
      `ALTER TABLE products ADD COLUMN track_expiry INTEGER NOT NULL DEFAULT 0`,
      `CREATE TABLE stock_lots (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        lot_no TEXT,
        expiry_date TEXT,
        qty INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX stock_lots_fefo ON stock_lots (product_id, warehouse_id, expiry_date)`,
    ],
  },
  {
    id: "0008_crm",
    statements: [
      // CRM: corong pra-penjualan. Lead bergerak lewat tahap funnel, dicatat
      // aktivitas follow-up, lalu dikonversi menjadi kontak pelanggan.
      `CREATE TABLE leads (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        contact_person TEXT,
        email TEXT,
        phone TEXT,
        source TEXT,
        stage TEXT NOT NULL DEFAULT 'new' CHECK (stage IN ('new','contacted','qualified','proposal','won','lost')),
        est_value INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','won','lost')),
        converted_contact_id TEXT REFERENCES contacts(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX leads_stage ON leads (status, stage, created_at)`,
      `CREATE TABLE lead_activities (
        id TEXT PRIMARY KEY,
        lead_id TEXT NOT NULL REFERENCES leads(id),
        type TEXT NOT NULL CHECK (type IN ('call','email','meeting','whatsapp','note')),
        note TEXT NOT NULL,
        activity_date TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX lead_activities_lead ON lead_activities (lead_id, activity_date)`,
      // Penawaran (quotation) — sengaja dilepas dari akuntansi: tak berjurnal &
      // tak menggerakkan stok. Stok/jurnal baru bergerak saat dikonversi ke faktur.
      `CREATE TABLE quotations (
        id TEXT PRIMARY KEY,
        quote_no TEXT NOT NULL UNIQUE,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        lead_id TEXT REFERENCES leads(id),
        quote_date TEXT NOT NULL,
        valid_until TEXT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','converted')),
        subtotal INTEGER NOT NULL,
        tax_rate INTEGER NOT NULL DEFAULT 0,
        tax_amount INTEGER NOT NULL DEFAULT 0,
        total INTEGER NOT NULL,
        notes TEXT,
        result_invoice_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE quotation_lines (
        id TEXT PRIMARY KEY,
        quotation_id TEXT NOT NULL REFERENCES quotations(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        description TEXT,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0),
        amount INTEGER NOT NULL
      )`,
    ],
  },
  {
    id: "0009_budgets",
    statements: [
      // Anggaran per akun (pendapatan/beban) per bulan (period = 'YYYY-MM').
      // Realisasi tetap dihitung dari jurnal — tabel ini hanya menyimpan target.
      `CREATE TABLE budgets (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        period TEXT NOT NULL,
        amount INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (account_id, period)
      )`,
      `CREATE INDEX budgets_period ON budgets (period)`,
    ],
  },
  {
    id: "0010_payroll",
    statements: [
      // HR & Payroll: karyawan + penggajian bulanan (PPh 21 TER + BPJS).
      `CREATE TABLE employees (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        position TEXT,
        ptkp_status TEXT NOT NULL DEFAULT 'TK/0',
        base_salary INTEGER NOT NULL DEFAULT 0,
        allowances INTEGER NOT NULL DEFAULT 0,
        bank_account TEXT,
        join_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE payroll_runs (
        id TEXT PRIMARY KEY,
        run_no TEXT NOT NULL UNIQUE,
        period TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'posted',
        total_gross INTEGER NOT NULL,
        total_deductions INTEGER NOT NULL,
        total_net INTEGER NOT NULL,
        journal_entry_id TEXT REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (period)
      )`,
      `CREATE TABLE payslips (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES payroll_runs(id),
        employee_id TEXT NOT NULL REFERENCES employees(id),
        base_salary INTEGER NOT NULL,
        allowances INTEGER NOT NULL,
        gross INTEGER NOT NULL,
        bpjs_health_employee INTEGER NOT NULL DEFAULT 0,
        bpjs_jht_employee INTEGER NOT NULL DEFAULT 0,
        bpjs_jp_employee INTEGER NOT NULL DEFAULT 0,
        ter_category TEXT NOT NULL,
        ter_rate REAL NOT NULL,
        pph21 INTEGER NOT NULL DEFAULT 0,
        total_deductions INTEGER NOT NULL DEFAULT 0,
        net INTEGER NOT NULL
      )`,
      `CREATE INDEX payslips_run ON payslips (run_id)`,
    ],
  },
  {
    id: "0011_fixed_assets",
    statements: [
      // Akun beban penyusutan (Aset Tetap 1-1500 & Akumulasi 1-1510 sudah ada di COA).
      `INSERT INTO accounts (id, code, name, type, is_system) VALUES ('acc-5-5000', '5-5000', 'Beban Penyusutan', 'expense', 1)`,
      `CREATE TABLE fixed_assets (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        acquisition_date TEXT NOT NULL,
        acquisition_cost INTEGER NOT NULL,
        useful_life_months INTEGER NOT NULL,
        residual_value INTEGER NOT NULL DEFAULT 0,
        accumulated_depreciation INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','disposed')),
        disposed_date TEXT,
        journal_entry_id TEXT REFERENCES journal_entries(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE depreciation_entries (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES fixed_assets(id),
        period TEXT NOT NULL,
        amount INTEGER NOT NULL,
        journal_entry_id TEXT REFERENCES journal_entries(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (asset_id, period)
      )`,
    ],
  },
  {
    id: "0012_projects",
    statements: [
      // Proyek: tagging biaya/pendapatan lewat project_id di jurnal → laporan
      // profitabilitas dihitung dari jurnal terposting yang ber-tag.
      `CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        contact_id TEXT REFERENCES contacts(id),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','on_hold')),
        budget INTEGER NOT NULL DEFAULT 0,
        start_date TEXT,
        end_date TEXT,
        notes TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE project_tasks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
        due_date TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `ALTER TABLE journal_entries ADD COLUMN project_id TEXT REFERENCES projects(id)`,
      `CREATE INDEX journal_entries_project ON journal_entries (project_id)`,
    ],
  },
  {
    id: "0013_multicurrency",
    statements: [
      // Akun laba/rugi selisih kurs.
      `INSERT INTO accounts (id, code, name, type, is_system) VALUES ('acc-4-3000', '4-3000', 'Laba Selisih Kurs', 'income', 1)`,
      `INSERT INTO accounts (id, code, name, type, is_system) VALUES ('acc-5-6000', '5-6000', 'Rugi Selisih Kurs', 'expense', 1)`,
      // Master mata uang. rate = IDR per 1 unit valas (REAL). IDR = basis (rate 1).
      `CREATE TABLE currencies (
        code TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        rate REAL NOT NULL DEFAULT 1,
        is_base INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `INSERT INTO currencies (code, name, rate, is_base) VALUES ('IDR', 'Rupiah', 1, 1)`,
      // Faktur/pembayaran valas: nilai buku tetap IDR; kolom valas untuk jejak & selisih kurs.
      `ALTER TABLE invoices ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR'`,
      `ALTER TABLE invoices ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE invoices ADD COLUMN foreign_total INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE purchases ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR'`,
      `ALTER TABLE purchases ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE purchases ADD COLUMN foreign_total INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE payments ADD COLUMN currency TEXT NOT NULL DEFAULT 'IDR'`,
      `ALTER TABLE payments ADD COLUMN exchange_rate REAL NOT NULL DEFAULT 1`,
      `ALTER TABLE payments ADD COLUMN foreign_amount INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "0014_contracts",
    statements: [
      // Produk jasa: tidak melacak stok (faktur tak menggerakkan stok/HPP).
      `ALTER TABLE products ADD COLUMN is_service INTEGER NOT NULL DEFAULT 0`,
      // Kontrak tagihan berulang: Cron menerbitkan faktur saat jatuh tempo.
      `CREATE TABLE contracts (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        name TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly','yearly')),
        tax_rate INTEGER NOT NULL DEFAULT 0,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        next_invoice_date TEXT NOT NULL,
        end_date TEXT,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','ended')),
        last_invoice_id TEXT,
        invoice_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX contracts_due ON contracts (status, next_invoice_date)`,
      `CREATE TABLE contract_lines (
        id TEXT PRIMARY KEY,
        contract_id TEXT NOT NULL REFERENCES contracts(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        description TEXT,
        qty INTEGER NOT NULL CHECK (qty > 0),
        unit_price INTEGER NOT NULL CHECK (unit_price >= 0)
      )`,
    ],
  },
  {
    id: "0015_manufacturing",
    statements: [
      // Bill of Materials: resep satu produk jadi. `output_qty` = jumlah unit
      // produk jadi yang dihasilkan dari komponen yang terdaftar.
      `CREATE TABLE boms (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL UNIQUE REFERENCES products(id),
        output_qty INTEGER NOT NULL CHECK (output_qty > 0),
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE bom_lines (
        id TEXT PRIMARY KEY,
        bom_id TEXT NOT NULL REFERENCES boms(id),
        component_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL CHECK (qty > 0)
      )`,
      // Perintah produksi: mengonsumsi bahan (stok keluar) → produk jadi (stok
      // masuk) dengan biaya gabungan. Netral terhadap nilai persediaan (bahan &
      // produk jadi sama-sama di akun Persediaan) sehingga tanpa jurnal.
      `CREATE TABLE production_orders (
        id TEXT PRIMARY KEY,
        order_no TEXT NOT NULL UNIQUE,
        product_id TEXT NOT NULL REFERENCES products(id),
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        qty INTEGER NOT NULL CHECK (qty > 0),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','produced')),
        qc_status TEXT NOT NULL DEFAULT 'none' CHECK (qc_status IN ('none','pending','passed','quarantined')),
        unit_cost INTEGER NOT NULL DEFAULT 0,
        total_cost INTEGER NOT NULL DEFAULT 0,
        qc_warehouse_id TEXT REFERENCES warehouses(id),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        produced_at TEXT
      )`,
    ],
  },
  {
    id: "0016_maintenance",
    statements: [
      // Akun beban servis/pemeliharaan aset.
      `INSERT INTO accounts (id, code, name, type, is_system) VALUES ('acc-5-7000', '5-7000', 'Beban Pemeliharaan', 'expense', 1)`,
      // Jadwal servis berkala per aset tetap. Cron menerbitkan work order saat
      // jatuh tempo lalu memajukan tanggal servis berikutnya.
      `CREATE TABLE maintenance_schedules (
        id TEXT PRIMARY KEY,
        asset_id TEXT NOT NULL REFERENCES fixed_assets(id),
        name TEXT NOT NULL,
        interval_months INTEGER NOT NULL CHECK (interval_months > 0),
        next_due_date TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX maintenance_due ON maintenance_schedules (active, next_due_date)`,
      // Work order: pekerjaan servis (dari jadwal atau ad-hoc). Saat selesai
      // dengan biaya, memposting jurnal Beban Pemeliharaan / Kas-Bank.
      `CREATE TABLE work_orders (
        id TEXT PRIMARY KEY,
        order_no TEXT NOT NULL UNIQUE,
        asset_id TEXT NOT NULL REFERENCES fixed_assets(id),
        schedule_id TEXT REFERENCES maintenance_schedules(id),
        title TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','done')),
        scheduled_date TEXT NOT NULL,
        completed_date TEXT,
        cost INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        journal_entry_id TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    id: "0017_helpdesk",
    statements: [
      // Tiket dukungan pelanggan: prioritas, status, penugasan, terhubung kontak.
      `CREATE TABLE tickets (
        id TEXT PRIMARY KEY,
        ticket_no TEXT NOT NULL UNIQUE,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        subject TEXT NOT NULL,
        description TEXT,
        priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','resolved','closed')),
        assigned_to TEXT,
        assigned_name TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        resolved_at TEXT
      )`,
      `CREATE INDEX tickets_status ON tickets (status, created_at)`,
      // Balasan/komentar pada tiket (internal = catatan tim, bukan untuk pelanggan).
      `CREATE TABLE ticket_replies (
        id TEXT PRIMARY KEY,
        ticket_id TEXT NOT NULL REFERENCES tickets(id),
        body TEXT NOT NULL,
        author_user_id TEXT NOT NULL,
        author_name TEXT NOT NULL,
        internal INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    id: "0018_void",
    statements: [
      // Pembatalan dokumen: terisi = dokumen dibatalkan (jurnal pembalik telah
      // diposting & stok dikembalikan). Semua query outstanding memfilter
      // voided_at IS NULL.
      `ALTER TABLE invoices ADD COLUMN voided_at TEXT`,
      `ALTER TABLE purchases ADD COLUMN voided_at TEXT`,
    ],
  },
  {
    id: "0019_commerce_extras",
    statements: [
      // Diskon per baris (persen 0–100): nilai baris & PPN dihitung setelah diskon.
      `ALTER TABLE invoice_lines ADD COLUMN discount_pct REAL NOT NULL DEFAULT 0`,
      `ALTER TABLE purchase_lines ADD COLUMN discount_pct REAL NOT NULL DEFAULT 0`,
      // Ambang stok menipis per produk (0 = tanpa peringatan).
      `ALTER TABLE products ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0`,
    ],
  },
  {
    id: "0020_finance_extras",
    statements: [
      // Template jurnal berulang: lines = JSON [{accountId, debit, credit}].
      // schedule 'monthly' + next_run_date → cron memposting otomatis; NULL =
      // hanya terbit manual dari form Jurnal Umum.
      `CREATE TABLE journal_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        memo TEXT,
        lines TEXT NOT NULL,
        schedule TEXT,
        next_run_date TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
      )`,
      // Rekonsiliasi bank v1: baris mutasi rekening koran hasil impor CSV.
      // amount bertanda (+ masuk / − keluar); matched_journal_line_id terisi =
      // baris sudah dicocokkan (otomatis maupun manual).
      `CREATE TABLE bank_statement_items (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        stmt_date TEXT NOT NULL,
        description TEXT NOT NULL,
        amount INTEGER NOT NULL,
        matched_journal_line_id TEXT,
        created_at TEXT NOT NULL
      )`,
      `CREATE INDEX idx_bank_stmt_account ON bank_statement_items(account_id, stmt_date)`,
    ],
  },
  {
    id: "0021_crm_extras",
    statements: [
      // Rencana tindak lanjut: aktivitas bisa diberi tenggat — masuk lonceng
      // notifikasi saat jatuh tempo (kolom source lead & valid_until penawaran
      // sudah ada sejak 0008).
      `ALTER TABLE lead_activities ADD COLUMN due_at TEXT`,
    ],
  },
  {
    id: "0022_hr_extras",
    statements: [
      // Saldo cuti tahunan (hari) — dipotong saat pengajuan cuti tahunan disetujui.
      `ALTER TABLE employees ADD COLUMN leave_balance INTEGER NOT NULL DEFAULT 12`,
      // Slip menyimpan total komponen ad-hoc (bonus/lembur/potongan, ikut bruto &
      // pajak) dan potongan cicilan kasbon (dipotong dari netto, di luar pajak).
      `ALTER TABLE payslips ADD COLUMN adjustments_total INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE payslips ADD COLUMN loan_deduction INTEGER NOT NULL DEFAULT 0`,
      // Komponen ad-hoc per periode; run_id terisi saat periode itu digaji.
      `CREATE TABLE payroll_adjustments (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        run_id TEXT REFERENCES payroll_runs(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX payroll_adjustments_period ON payroll_adjustments (period)`,
      // Kasbon/pinjaman karyawan: pencairan berjurnal (Piutang Karyawan), cicilan
      // otomatis memotong netto tiap run penggajian sampai lunas.
      `CREATE TABLE employee_loans (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        name TEXT NOT NULL,
        principal INTEGER NOT NULL,
        monthly_deduction INTEGER NOT NULL,
        balance INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        journal_entry_id TEXT REFERENCES journal_entries(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // Cuti & izin: pengajuan + keputusan Owner/Admin; cuti tahunan yang disetujui
      // memotong saldo cuti karyawan.
      `CREATE TABLE leave_requests (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        type TEXT NOT NULL,
        start_date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        days INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        note TEXT,
        decided_by TEXT,
        decided_at TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
    ],
  },
  {
    id: "0023_project_extras",
    statements: [
      // Termin penagihan: milestone → 'Buat faktur dari termin' (faktur penjualan
      // jasa tertaut proyek). invoice_id terisi setelah difakturkan.
      `CREATE TABLE project_milestones (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        name TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'planned',
        invoice_id TEXT REFERENCES invoices(id),
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX project_milestones_project ON project_milestones (project_id)`,
      // RAB: anggaran biaya per kategori vs realisasi (realisasi dari jurnal ber-tag proyek).
      `CREATE TABLE project_budgets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        category TEXT NOT NULL,
        planned_amount INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX project_budgets_project ON project_budgets (project_id)`,
      // Timesheet: jam kerja per karyawan per proyek (informatif, jam × tarif) →
      // estimasi biaya tenaga kerja proyek (gaji sudah dibebankan lewat payroll,
      // jadi tidak dijurnal ulang agar tak dobel-hitung).
      `CREATE TABLE time_entries (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id),
        employee_id TEXT REFERENCES employees(id),
        entry_date TEXT NOT NULL,
        hours REAL NOT NULL,
        hourly_rate INTEGER NOT NULL DEFAULT 0,
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX time_entries_project ON time_entries (project_id)`,
    ],
  },
  {
    id: "0024_hr_attendance",
    statements: [
      // Absensi/kehadiran harian per karyawan — satu baris per karyawan per tanggal
      // (upsert saat dikoreksi). status: hadir/izin/sakit/alfa/cuti; jam masuk/keluar opsional.
      `CREATE TABLE attendance (
        id TEXT PRIMARY KEY,
        employee_id TEXT NOT NULL REFERENCES employees(id),
        date TEXT NOT NULL,
        clock_in TEXT,
        clock_out TEXT,
        status TEXT NOT NULL DEFAULT 'hadir',
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (employee_id, date)
      )`,
      `CREATE INDEX attendance_emp_date ON attendance (employee_id, date)`,
    ],
  },
  {
    id: "0025_project_pm",
    statements: [
      // Manajemen proyek serius: penanggung jawab tugas, prioritas, urutan kanban.
      // ALTER backward-compatible — tugas lama tetap valid (assignee kosong, prioritas 'medium').
      `ALTER TABLE project_tasks ADD COLUMN assignee_id TEXT REFERENCES employees(id)`,
      `ALTER TABLE project_tasks ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'`,
      `ALTER TABLE project_tasks ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0`,
      `CREATE INDEX project_tasks_assignee ON project_tasks (assignee_id)`,
    ],
  },
  {
    id: "0026_procurement",
    statements: [
      // Procure-to-pay: permintaan (PR) → pesanan (PO) → penerimaan (GRN).
      // Stok & jurnal terjadi saat penerimaan lewat executePurchase (faktur pembelian).
      `CREATE TABLE purchase_requisitions (
        id TEXT PRIMARY KEY,
        req_no TEXT NOT NULL,
        note TEXT,
        status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected','ordered')),
        requested_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE purchase_requisition_lines (
        id TEXT PRIMARY KEY,
        requisition_id TEXT NOT NULL REFERENCES purchase_requisitions(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL,
        note TEXT
      )`,
      `CREATE INDEX prl_requisition ON purchase_requisition_lines (requisition_id)`,
      `CREATE TABLE purchase_orders (
        id TEXT PRIMARY KEY,
        po_no TEXT NOT NULL,
        requisition_id TEXT REFERENCES purchase_requisitions(id),
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        order_date TEXT NOT NULL,
        expected_date TEXT,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        tax_rate INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ordered' CHECK (status IN ('ordered','received','cancelled')),
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE purchase_order_lines (
        id TEXT PRIMARY KEY,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL,
        unit_price INTEGER NOT NULL
      )`,
      `CREATE INDEX pol_po ON purchase_order_lines (po_id)`,
      `CREATE TABLE goods_receipts (
        id TEXT PRIMARY KEY,
        grn_no TEXT NOT NULL,
        po_id TEXT NOT NULL REFERENCES purchase_orders(id),
        receipt_date TEXT NOT NULL,
        purchase_id TEXT REFERENCES purchases(id),
        note TEXT,
        received_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE goods_receipt_lines (
        id TEXT PRIMARY KEY,
        grn_id TEXT NOT NULL REFERENCES goods_receipts(id),
        po_line_id TEXT NOT NULL REFERENCES purchase_order_lines(id),
        qty_received INTEGER NOT NULL
      )`,
      `CREATE INDEX grl_grn ON goods_receipt_lines (grn_id)`,
    ],
  },
  {
    id: "0027_approval_engine",
    statements: [
      // Approval workflow engine (Fase 6e): aturan berjenjang generik + alur multi-langkah.
      // Berdampingan dengan approval pembelian ambang-tunggal lama (approval_requests) — tak diubah.
      `CREATE TABLE approval_rules (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        min_amount INTEGER NOT NULL DEFAULT 0,
        approver_roles TEXT NOT NULL,
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE approval_flows (
        id TEXT PRIMARY KEY,
        flow_no TEXT NOT NULL,
        doc_type TEXT NOT NULL,
        title TEXT NOT NULL,
        amount INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        current_step INTEGER NOT NULL DEFAULT 1,
        rule_id TEXT REFERENCES approval_rules(id),
        requested_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE approval_flow_steps (
        id TEXT PRIMARY KEY,
        flow_id TEXT NOT NULL REFERENCES approval_flows(id),
        step_order INTEGER NOT NULL,
        approver_role TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
        decided_by TEXT,
        decided_at TEXT,
        note TEXT
      )`,
      `CREATE INDEX afs_flow ON approval_flow_steps (flow_id)`,
    ],
  },
  {
    id: "0028_pos_multipay",
    statements: [
      // POS lanjut (Fase 7a): pembayaran multi-metode per penjualan + tahan transaksi.
      // amount = nilai yang masuk pembukuan (tunai = kas yang tinggal di laci setelah kembalian);
      // tendered = nominal yang diserahkan pelanggan (tunai bisa lebih untuk kembalian).
      `CREATE TABLE pos_sale_payments (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL REFERENCES invoices(id),
        shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
        method TEXT NOT NULL,
        amount INTEGER NOT NULL,
        tendered INTEGER NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX psp_shift ON pos_sale_payments (shift_id)`,
      `CREATE INDEX psp_invoice ON pos_sale_payments (invoice_id)`,
      // Transaksi ditahan (park): keranjang disimpan sementara per shift.
      `CREATE TABLE pos_held_sales (
        id TEXT PRIMARY KEY,
        shift_id TEXT NOT NULL REFERENCES pos_shifts(id),
        label TEXT NOT NULL,
        cart TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX phs_shift ON pos_held_sales (shift_id)`,
    ],
  },
  {
    id: "0029_sales_orders",
    statements: [
      // Penjualan bertahap (Fase 7b): pesanan pelanggan (SO) → surat jalan (DO) → faktur.
      // SO & faktur tak menggerakkan stok; stok keluar TEPAT SEKALI di surat jalan (DO).
      `CREATE TABLE sales_orders (
        id TEXT PRIMARY KEY,
        so_no TEXT NOT NULL,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        order_date TEXT NOT NULL,
        expected_date TEXT,
        warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
        tax_rate INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','delivered','invoiced','cancelled')),
        dp_amount INTEGER NOT NULL DEFAULT 0,
        invoice_id TEXT REFERENCES invoices(id),
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE sales_order_lines (
        id TEXT PRIMARY KEY,
        so_id TEXT NOT NULL REFERENCES sales_orders(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL,
        unit_price INTEGER NOT NULL,
        discount_pct REAL NOT NULL DEFAULT 0
      )`,
      `CREATE INDEX sol_so ON sales_order_lines (so_id)`,
      `CREATE TABLE delivery_orders (
        id TEXT PRIMARY KEY,
        do_no TEXT NOT NULL,
        so_id TEXT NOT NULL REFERENCES sales_orders(id),
        delivery_date TEXT NOT NULL,
        journal_entry_id TEXT REFERENCES journal_entries(id),
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE TABLE delivery_order_lines (
        id TEXT PRIMARY KEY,
        do_id TEXT NOT NULL REFERENCES delivery_orders(id),
        product_id TEXT NOT NULL REFERENCES products(id),
        qty INTEGER NOT NULL
      )`,
      `CREATE INDEX dol_do ON delivery_order_lines (do_id)`,
    ],
  },
  {
    id: "0030_stock_advanced",
    statements: [
      // Stok lanjut (Fase 7c): barcode, multi-satuan (UOM), nomor seri.
      // Kolom produk baru — backward-compatible (nilai default aman untuk data lama).
      `ALTER TABLE products ADD COLUMN barcode TEXT`,
      // Satuan besar (mis. "dus") + faktor konversi (1 satuan besar = uom_factor satuan dasar).
      `ALTER TABLE products ADD COLUMN uom_secondary TEXT`,
      `ALTER TABLE products ADD COLUMN uom_factor INTEGER NOT NULL DEFAULT 1`,
      // Produk terpilih melacak nomor seri (barang bernilai tinggi/garansi).
      `ALTER TABLE products ADD COLUMN track_serial INTEGER NOT NULL DEFAULT 0`,
      // Registri nomor seri per produk (in_stock → sold). Ringan, terpisah dari stock_levels.
      `CREATE TABLE product_serials (
        id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL REFERENCES products(id),
        serial_no TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'in_stock' CHECK (status IN ('in_stock','sold')),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (product_id, serial_no)
      )`,
      `CREATE INDEX ps_product ON product_serials (product_id)`,
    ],
  },
  {
    id: "0031_umkm_tax",
    statements: [
      // Pajak UMKM (Fase 7d): PPh Final 0,5% (PP 55/2022) per bulan + PPh 23 (bukti potong).
      `CREATE TABLE tax_pph_final (
        id TEXT PRIMARY KEY,
        period TEXT NOT NULL UNIQUE,
        omzet INTEGER NOT NULL,
        rate REAL NOT NULL DEFAULT 0.5,
        amount INTEGER NOT NULL,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        journal_entry_id TEXT REFERENCES journal_entries(id),
        paid_date TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      // PPh 23 dipotong dari pihak lain (jasa/sewa/royalti/dll) → bukti potong + hutang PPh 23.
      `CREATE TABLE tax_pph23 (
        id TEXT PRIMARY KEY,
        doc_no TEXT NOT NULL,
        contact_id TEXT NOT NULL REFERENCES contacts(id),
        tax_date TEXT NOT NULL,
        object_type TEXT NOT NULL,
        gross INTEGER NOT NULL,
        rate REAL NOT NULL,
        amount INTEGER NOT NULL,
        source_account_id TEXT NOT NULL REFERENCES accounts(id),
        journal_entry_id TEXT REFERENCES journal_entries(id),
        deposited INTEGER NOT NULL DEFAULT 0,
        deposit_journal_id TEXT REFERENCES journal_entries(id),
        note TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `CREATE INDEX pph23_contact ON tax_pph23 (contact_id)`,
    ],
  },
  {
    id: "0032_dimensions",
    statements: [
      // Akuntansi dimensi (Fase 7f): cost center / departemen opsional per baris jurnal.
      // Backward-compatible: kolom nullable; baris lama & jurnal otomatis tak terpengaruh.
      `CREATE TABLE cost_centers (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        is_archived INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`,
      `ALTER TABLE journal_lines ADD COLUMN cost_center_id TEXT`,
      `CREATE INDEX journal_lines_cc ON journal_lines (cost_center_id)`,
      // Rekonsiliasi bank v2 (Fase 7f): aturan auto-match tersimpan per akun.
      `CREATE TABLE bank_match_rules (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL REFERENCES accounts(id),
        keyword TEXT NOT NULL,
        date_tolerance INTEGER NOT NULL DEFAULT 3,
        active INTEGER NOT NULL DEFAULT 1,
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
