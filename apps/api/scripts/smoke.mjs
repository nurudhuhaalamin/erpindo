#!/usr/bin/env node
/**
 * Smoke test end-to-end: menjalankan `wrangler dev` (D1 & KV lokal) lalu
 * menguji alur nyata lewat HTTP:
 *   register → verifikasi email → login → RBAC → tulis/baca DB tenant →
 *   undang anggota → terima undangan → viewer ditolak di endpoint admin.
 *
 * Gagal = exit code 1. Dipakai lokal dan di CI sebagai gerbang merge.
 */
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const persistDir = mkdtempSync(join(tmpdir(), "erpindo-smoke-"));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

// Config dev = wrangler.jsonc minus binding "ai" (butuh kredensial remote).
const { makeDevConfig } = await import(join(apiDir, "../../scripts/make-dev-config.mjs"));
makeDevConfig();

let failures = 0;
function check(name, cond, extra = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.error(`  ✗ ${name} ${extra}`);
  }
}

const logs = [];
const child = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "-c",
    "../../wrangler.dev.jsonc",
    "--port",
    String(PORT),
    "--persist-to",
    persistDir,
    "--show-interactive-dev-session=false",
    // Untuk memicu cron via /__scheduled dan menyimulasikan trial kedaluwarsa.
    "--test-scheduled",
    "--var",
    "TRIAL_DAYS_OVERRIDE:0",
    // Uji jalur akun comped (Fase 4a): email Dewi mendapat tenant aktif permanen.
    "--var",
    "COMPED_EMAILS:dewi@majujaya.co.id",
  ],
  { cwd: apiDir, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
);
child.stdout.on("data", (d) => logs.push(d.toString()));
child.stderr.on("data", (d) => logs.push(d.toString()));

function findInLogs(regex) {
  for (const chunk of logs.join("").split("\n")) {
    const m = chunk.match(regex);
    if (m) return m;
  }
  return null;
}

async function waitForReady(timeoutMs = 90_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`wrangler dev tidak siap dalam ${timeoutMs / 1000}s.\nLog:\n${logs.join("")}`);
}

/** TOTP RFC 6238 (SHA-1, 6 digit) — padanan Node dari apps/api/src/lib/totp.ts */
function totpNode(secretB32, timeMs = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const ch of secretB32) {
    value = (value << 5) | alphabet.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(timeMs / 1000 / 30)));
  const mac = createHmac("sha1", Buffer.from(bytes)).update(counter).digest();
  const off = mac[mac.length - 1] & 0xf;
  const code = (((mac[off] & 0x7f) << 24) | (mac[off + 1] << 16) | (mac[off + 2] << 8) | mac[off + 3]) % 1_000_000;
  return String(code).padStart(6, "0");
}

/** Klien fetch mini dengan cookie jar per pengguna. */
function makeClient() {
  let cookie = "";
  return async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* respons bukan JSON (mis. XML) — tetap tersedia lewat .text */
    }
    return { status: res.status, json, text };
  };
}

try {
  console.log("Menunggu wrangler dev siap...");
  await waitForReady();
  console.log("Server siap. Menjalankan skenario:\n");

  // --- PWA: manifest & service worker terlayani (Fase 2a) -----------------------
  console.log("0. Aset PWA");
  const manifest = await fetch(`${BASE}/manifest.webmanifest`);
  check("manifest.webmanifest terlayani (200)", manifest.status === 200);
  const sw = await fetch(`${BASE}/sw.js`);
  check("service worker sw.js terlayani (200)", sw.status === 200);

  // --- Registrasi pemilik + provisioning tenant -----------------------------
  console.log("1. Registrasi perusahaan baru");
  let owner = makeClient();
  const reg = await owner("POST", "/api/auth/register", {
    companyName: "PT Maju Jaya",
    name: "Budi Santoso",
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check("register 201", reg.status === 201, `→ ${reg.status} ${JSON.stringify(reg.json)}`);
  const tenantId = reg.json?.tenantId;
  check("tenantId & slug diberikan", Boolean(tenantId && reg.json?.slug === "pt-maju-jaya"));

  const dup = await owner("POST", "/api/auth/register", {
    companyName: "PT Lain",
    name: "Budi",
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check("email ganda ditolak 409", dup.status === 409);

  // --- Verifikasi email dari link di log ------------------------------------
  console.log("2. Verifikasi email (link diambil dari log mailer)");
  await new Promise((r) => setTimeout(r, 300));
  const verifyMatch = findInLogs(/verifikasi\?token=([0-9a-f]{64})/);
  check("email verifikasi terkirim ke log", Boolean(verifyMatch));
  if (verifyMatch) {
    const ver = await owner("POST", "/api/auth/verify", { token: verifyMatch[1] });
    check("verifikasi 200", ver.status === 200);
    const reuse = await owner("POST", "/api/auth/verify", { token: verifyMatch[1] });
    check("token verifikasi sekali pakai", reuse.status === 400);
  }

  // --- Sesi & login ----------------------------------------------------------
  console.log("3. Sesi & login");
  const me = await owner("GET", "/api/auth/me");
  check("me 200 + emailVerified", me.status === 200 && me.json?.user?.emailVerified === true);
  check("membership owner", me.json?.memberships?.[0]?.role === "owner");

  const anon = makeClient();
  const meAnon = await anon("GET", "/api/auth/me");
  check("tanpa sesi ditolak 401", meAnon.status === 401);

  const badLogin = await anon("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "password-salah",
  });
  check("login password salah 401", badLogin.status === 401);

  // --- Tulis & baca DATABASE TENANT ------------------------------------------
  console.log("4. Pengaturan perusahaan (database tenant)");
  const patch = await owner("PATCH", `/api/tenants/${tenantId}/settings`, {
    address: "Jl. Sudirman No. 1, Jakarta",
    npwp: "01.234.567.8-901.000",
  });
  check("update settings 200", patch.status === 200);
  const settings = await owner("GET", `/api/tenants/${tenantId}/settings`);
  check(
    "settings tersimpan di DB tenant",
    settings.json?.settings?.display_name === "PT Maju Jaya" &&
      settings.json?.settings?.npwp === "01.234.567.8-901.000",
    `→ ${JSON.stringify(settings.json)}`,
  );

  // --- Undangan anggota + RBAC ------------------------------------------------
  console.log("5. Undangan anggota & RBAC");
  const invite = await owner("POST", `/api/tenants/${tenantId}/invites`, {
    email: "sari@majujaya.co.id",
    role: "viewer",
  });
  check("undangan terkirim 201", invite.status === 201 && /undangan\?token=/.test(invite.json?.inviteUrl ?? ""));

  const viewer = makeClient();
  const regViewer = await viewer("POST", "/api/auth/register", {
    companyName: "Toko Sari",
    name: "Sari Dewi",
    email: "sari@majujaya.co.id",
    password: "rahasia-sari-456",
  });
  check("registrasi user kedua 201 (tenant kedua terprovisi)", regViewer.status === 201);

  const inviteToken = invite.json.inviteUrl.split("token=")[1];
  const accept = await viewer("POST", "/api/invites/accept", { token: inviteToken });
  check("terima undangan 200", accept.status === 200 && accept.json?.tenantId === tenantId);

  const viewerRead = await viewer("GET", `/api/tenants/${tenantId}/settings`);
  check("viewer boleh membaca settings", viewerRead.status === 200);
  const viewerWrite = await viewer("PATCH", `/api/tenants/${tenantId}/settings`, { address: "coba tulis" });
  check("viewer DITOLAK menulis settings (403)", viewerWrite.status === 403);
  const viewerMembers = await viewer("GET", `/api/tenants/${tenantId}/members`);
  check("viewer DITOLAK melihat anggota (403)", viewerMembers.status === 403);

  const members = await owner("GET", `/api/tenants/${tenantId}/members`);
  check("owner melihat 2 anggota", members.status === 200 && members.json?.members?.length === 2);

  const outsider = makeClient();
  await outsider("POST", "/api/auth/register", {
    companyName: "CV Pihak Luar",
    name: "Orang Luar",
    email: "luar@contoh.com",
    password: "rahasia-luar-789",
  });
  const crossTenant = await outsider("GET", `/api/tenants/${tenantId}/settings`);
  check("NON-anggota DITOLAK akses tenant lain (403) — isolasi tenant", crossTenant.status === 403);

  // --- Modul Keuangan & Master Data (Fase 1a) ---------------------------------
  console.log("6. Bagan Akun (COA)");
  const accountsRes = await owner("GET", `/api/tenants/${tenantId}/accounts`);
  const accounts = accountsRes.json?.accounts ?? [];
  check("COA template Indonesia tersemai (22 akun)", accountsRes.status === 200 && accounts.length === 22);
  const kas = accounts.find((a) => a.code === "1-1000");
  const modal = accounts.find((a) => a.code === "3-1000");
  const penjualan = accounts.find((a) => a.code === "4-1000");
  check("akun Kas/Modal/Pendapatan ada", Boolean(kas && modal && penjualan));

  const newAcc = await owner("POST", `/api/tenants/${tenantId}/accounts`, {
    code: "1-1600",
    name: "Piutang Karyawan",
    type: "asset",
  });
  check("tambah akun kustom 201", newAcc.status === 201);
  const dupAcc = await owner("POST", `/api/tenants/${tenantId}/accounts`, {
    code: "1-1600",
    name: "Duplikat",
    type: "asset",
  });
  check("kode akun ganda ditolak 409", dupAcc.status === 409);

  console.log("7. Jurnal double-entry");
  const goodJournal = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-02",
    memo: "Setoran modal awal",
    lines: [
      { accountId: kas.id, description: "Setoran tunai", debit: 50_000_000, credit: 0 },
      { accountId: modal.id, debit: 0, credit: 50_000_000 },
    ],
  });
  check("jurnal seimbang diposting 201", goodJournal.status === 201, `→ ${JSON.stringify(goodJournal.json)}`);
  check("nomor jurnal berurutan JRN-00001", goodJournal.json?.entryNo === "JRN-00001");

  const badJournal = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-02",
    lines: [
      { accountId: kas.id, debit: 10_000, credit: 0 },
      { accountId: modal.id, debit: 0, credit: 9_000 },
    ],
  });
  check("jurnal TIDAK seimbang DITOLAK 400", badJournal.status === 400);

  await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-03",
    memo: "Penjualan tunai",
    lines: [
      { accountId: kas.id, debit: 2_500_000, credit: 0 },
      { accountId: penjualan.id, debit: 0, credit: 2_500_000 },
    ],
  });

  const ledger = await owner("GET", `/api/tenants/${tenantId}/ledger/${kas.id}`);
  check(
    "buku besar Kas: 2 mutasi, saldo 52.500.000",
    ledger.status === 200 && ledger.json?.entries?.length === 2 && ledger.json?.balance === 52_500_000,
    `→ ${JSON.stringify(ledger.json?.balance)}`,
  );

  const tb = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check(
    "neraca saldo SEIMBANG (debit = kredit = 52.500.000)",
    tb.status === 200 && tb.json?.balanced === true && tb.json?.totalDebit === 52_500_000,
    `→ ${JSON.stringify(tb.json)}`,
  );

  const viewerJournal = await viewer("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-02",
    lines: [
      { accountId: kas.id, debit: 1000, credit: 0 },
      { accountId: modal.id, debit: 0, credit: 1000 },
    ],
  });
  check("viewer DITOLAK memposting jurnal (403)", viewerJournal.status === 403);
  const viewerTb = await viewer("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("viewer boleh melihat neraca saldo", viewerTb.status === 200);

  console.log("8. Master data");
  const product = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "BRG-001",
    name: "Kopi Arabika 1kg",
    unit: "pcs",
    sellPrice: 150_000,
    buyPrice: 100_000,
  });
  check("tambah produk 201", product.status === 201);
  const dupProduct = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "BRG-001",
    name: "Duplikat",
    unit: "pcs",
    sellPrice: 0,
    buyPrice: 0,
  });
  check("SKU ganda ditolak 409", dupProduct.status === 409);

  const contact = await owner("POST", `/api/tenants/${tenantId}/contacts`, {
    type: "customer",
    name: "PT Pelanggan Setia",
    email: "info@pelanggansetia.co.id",
  });
  check("tambah kontak 201", contact.status === 201);

  const warehouses = await owner("GET", `/api/tenants/${tenantId}/warehouses`);
  check(
    "Gudang Utama otomatis tersedia",
    warehouses.status === 200 && warehouses.json?.items?.some((w) => w.code === "UTAMA"),
  );

  const products = await owner("GET", `/api/tenants/${tenantId}/products`);
  check("daftar produk berisi 1 item", products.json?.items?.length === 1);
  const archiveProduct = await owner("POST", `/api/tenants/${tenantId}/products/${product.json.id}/archive`);
  const productsAfter = await owner("GET", `/api/tenants/${tenantId}/products`);
  check("arsip produk menyembunyikan dari daftar", archiveProduct.status === 200 && productsAfter.json?.items?.length === 0);

  // Isolasi tenant untuk data akuntansi: tenant lain tidak melihat jurnal ini.
  const outsiderTb = await outsider("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("non-anggota DITOLAK membaca neraca saldo tenant lain (403)", outsiderTb.status === 403);

  // Impor batch master data (Fase 2d): valid masuk, duplikat & invalid dilaporkan.
  const importRes = await owner("POST", `/api/tenants/${tenantId}/contacts/import`, {
    rows: [
      { type: "customer", name: "PT Impor Satu", email: "satu@impor.co.id" },
      { type: "supplier", name: "CV Impor Dua" },
      { type: "customer", name: "X" }, // nama terlalu pendek → gagal validasi
      { type: "aneh", name: "PT Jenis Salah" }, // jenis tidak dikenal → gagal
    ],
  });
  check(
    "impor kontak: 2 masuk, 2 gagal dengan pesan per-baris",
    importRes.status === 200 && importRes.json?.inserted === 2 && importRes.json?.failed === 2 && importRes.json?.errors?.length === 2,
    `→ ${JSON.stringify(importRes.json)}`,
  );
  const importDupe = await owner("POST", `/api/tenants/${tenantId}/products/import`, {
    rows: [
      { sku: "IMP-001", name: "Barang Impor", unit: "pcs", sellPrice: 10_000, buyPrice: 5_000 },
      { sku: "IMP-001", name: "Duplikat SKU", unit: "pcs", sellPrice: 1, buyPrice: 1 },
    ],
  });
  check(
    "impor produk: duplikat SKU dilewati dengan laporan",
    importDupe.json?.inserted === 1 && importDupe.json?.failed === 1 && /sudah ada/.test(importDupe.json?.errors?.[0]?.message ?? ""),
    `→ ${JSON.stringify(importDupe.json)}`,
  );
  const importByViewer = await viewer("POST", `/api/tenants/${tenantId}/contacts/import`, {
    rows: [{ type: "customer", name: "PT Viewer" }],
  });
  check("viewer DITOLAK mengimpor (403)", importByViewer.status === 403);

  // --- Siklus dagang penuh: beli → jual → bayar (Fase 1b) -----------------------
  console.log("9. Siklus pembelian → penjualan → pembayaran");

  const prodBarang = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "BRG-002",
    name: "Teh Hijau Premium 250g",
    unit: "pcs",
    sellPrice: 150_000,
    buyPrice: 100_000,
  });
  const supplier = await owner("POST", `/api/tenants/${tenantId}/contacts`, {
    type: "supplier",
    name: "CV Pemasok Teh",
  });
  const whs = await owner("GET", `/api/tenants/${tenantId}/warehouses`);
  const whUtama = whs.json.items.find((w) => w.code === "UTAMA");
  const customer = contact; // PT Pelanggan Setia (customer) dari bagian 8

  // Jual sebelum ada stok → harus ditolak.
  const sellNoStock = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("jual tanpa stok DITOLAK 400", sellNoStock.status === 400);

  // Beli 10 pcs @ Rp100.000 + PPN 11%.
  const purchase = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 10, unitPrice: 100_000 }],
  });
  check("faktur pembelian diposting (PB-00001, total 1.110.000)", purchase.status === 201 && purchase.json?.total === 1_110_000, `→ ${JSON.stringify(purchase.json)}`);

  let stock = await owner("GET", `/api/tenants/${tenantId}/stock`);
  let level = stock.json?.levels?.find((l) => l.sku === "BRG-002");
  check("stok masuk 10 pcs @avg 100.000", level?.qty === 10 && level?.avgCost === 100_000);

  // Jual 3 pcs @ Rp150.000 + PPN 11%.
  const invoice = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-04",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 3, unitPrice: 150_000 }],
  });
  check("faktur penjualan diposting (total 499.500)", invoice.status === 201 && invoice.json?.total === 499_500, `→ ${JSON.stringify(invoice.json)}`);

  // Jual 100 pcs → stok tidak cukup.
  const sellTooMany = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-04",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 100, unitPrice: 150_000 }],
  });
  check("jual melebihi stok DITOLAK 400", sellTooMany.status === 400);

  stock = await owner("GET", `/api/tenants/${tenantId}/stock`);
  level = stock.json?.levels?.find((l) => l.sku === "BRG-002");
  check("stok berkurang menjadi 7 pcs (nilai 700.000)", level?.qty === 7 && level?.value === 700_000);

  // Buku besar HPP harus berisi 3 × 100.000.
  const accountsNow = await owner("GET", `/api/tenants/${tenantId}/accounts`);
  const hppAcc = accountsNow.json.accounts.find((a) => a.code === "5-1000");
  const hppLedger = await owner("GET", `/api/tenants/${tenantId}/ledger/${hppAcc.id}`);
  check("jurnal HPP otomatis 300.000", hppLedger.json?.balance === 300_000, `→ ${hppLedger.json?.balance}`);

  // Terima pembayaran penuh ke Kas.
  const kasAcc = accountsNow.json.accounts.find((a) => a.code === "1-1000");
  const payment = await owner("POST", `/api/tenants/${tenantId}/payments`, {
    refType: "invoice",
    refId: invoice.json.id,
    accountId: kasAcc.id,
    amount: 499_500,
    paymentDate: "2026-07-05",
  });
  check("pembayaran dicatat & faktur lunas", payment.status === 201 && payment.json?.settled === true);

  const overpay = await owner("POST", `/api/tenants/${tenantId}/payments`, {
    refType: "invoice",
    refId: invoice.json.id,
    accountId: kasAcc.id,
    amount: 1,
    paymentDate: "2026-07-05",
  });
  check("pembayaran melebihi sisa tagihan DITOLAK 400", overpay.status === 400);

  const invoicesAfter = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  const paidInvoice = invoicesAfter.json?.docs?.find((d) => d.id === invoice.json.id);
  check("status faktur = paid", paidInvoice?.status === "paid");

  // Neraca saldo tetap seimbang setelah seluruh siklus otomatis.
  const tbAfter = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check(
    "neraca saldo TETAP seimbang setelah siklus dagang",
    tbAfter.status === 200 && tbAfter.json?.balanced === true,
    `→ debit ${tbAfter.json?.totalDebit} vs kredit ${tbAfter.json?.totalCredit}`,
  );

  const viewerInvoice = await viewer("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-04",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 1 }],
  });
  check("viewer DITOLAK membuat faktur (403)", viewerInvoice.status === 403);

  // --- Laporan keuangan & dashboard (Fase 1c) -----------------------------------
  console.log("10. Laporan keuangan & dashboard");

  // Konteks angka: modal 50jt + penjualan tunai (jurnal manual) 2,5jt masuk 4-1000;
  // siklus dagang: jual 450rb (+PPN 49,5rb), HPP 300rb; beli 1,11jt belum dibayar.
  const pl = await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-07-01&to=2026-07-31`);
  check(
    "laba rugi: pendapatan 2.950.000, beban 300.000, laba 2.650.000",
    pl.status === 200 &&
      pl.json?.totalIncome === 2_950_000 &&
      pl.json?.totalExpense === 300_000 &&
      pl.json?.netProfit === 2_650_000,
    `→ ${JSON.stringify(pl.json && { i: pl.json.totalIncome, e: pl.json.totalExpense, n: pl.json.netProfit })}`,
  );

  const bs = await owner("GET", `/api/tenants/${tenantId}/reports/balance-sheet?asOf=2026-07-31`);
  check(
    "neraca SEIMBANG: aset = kewajiban + ekuitas (incl. laba berjalan)",
    bs.status === 200 && bs.json?.balanced === true,
    `→ aset ${bs.json?.totalAssets} vs K+E ${(bs.json?.totalLiabilities ?? 0) + (bs.json?.totalEquity ?? 0)}`,
  );
  check(
    "neraca memuat baris Laba (Rugi) Berjalan 2.650.000",
    bs.json?.equity?.some((r) => r.name.includes("Berjalan") && r.amount === 2_650_000),
  );

  const badDate = await owner("GET", `/api/tenants/${tenantId}/reports/balance-sheet?asOf=31-07-2026`);
  check("format tanggal salah DITOLAK 400", badDate.status === 400);

  const dash = await owner("GET", `/api/tenants/${tenantId}/dashboard`);
  check(
    "dashboard: piutang 0, hutang 1.110.000, persediaan 700.000",
    dash.status === 200 &&
      dash.json?.receivableOutstanding === 0 &&
      dash.json?.payableOutstanding === 1_110_000 &&
      dash.json?.inventoryValue === 700_000,
    `→ ${JSON.stringify(dash.json)}`,
  );
  check("dashboard: kas & bank 52.999.500", dash.json?.cashAndBank === 52_999_500, `→ ${dash.json?.cashAndBank}`);

  const viewerPl = await viewer(
    "GET",
    `/api/tenants/${tenantId}/reports/income-statement?from=2026-07-01&to=2026-07-31`,
  );
  check("viewer boleh melihat laba rugi", viewerPl.status === 200);

  // --- Kartu stok, aging & tutup buku (Fase 1d) ---------------------------------
  console.log("11. Kartu stok, umur hutang & tutup buku");

  const stockCard = await owner(
    "GET",
    `/api/tenants/${tenantId}/stock-card/${prodBarang.json.id}?warehouseId=${whUtama.id}`,
  );
  check(
    "kartu stok: 2 mutasi (+10, -3) saldo akhir 7",
    stockCard.status === 200 &&
      stockCard.json?.rows?.length === 2 &&
      stockCard.json?.rows?.[0]?.qty === 10 &&
      stockCard.json?.rows?.[1]?.qty === -3 &&
      stockCard.json?.balance === 7,
    `→ ${JSON.stringify(stockCard.json)}`,
  );

  const agingAp = await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=payable`);
  check(
    "aging hutang: CV Pemasok Teh 1.110.000",
    agingAp.status === 200 &&
      agingAp.json?.grandTotal === 1_110_000 &&
      agingAp.json?.rows?.[0]?.contactName === "CV Pemasok Teh",
    `→ ${JSON.stringify(agingAp.json)}`,
  );
  const agingAr = await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=receivable`);
  check("aging piutang kosong (semua lunas)", agingAr.status === 200 && agingAr.json?.rows?.length === 0);

  // Penyesuaian stok (opname) — dijalankan SEBELUM tutup buku (memakai tanggal hari ini).
  console.log("11b. Penyesuaian stok (opname) & audit log");
  const adjDown = await owner("POST", `/api/tenants/${tenantId}/stock-adjustments`, {
    productId: prodBarang.json.id,
    warehouseId: whUtama.id,
    physicalQty: 5,
    note: "opname: 2 rusak",
  });
  check(
    "opname 7→5: selisih -2, nilai 200.000, jurnal dibuat",
    adjDown.status === 201 && adjDown.json?.delta === -2 && adjDown.json?.value === 200_000 && Boolean(adjDown.json?.entryNo),
    `→ ${JSON.stringify(adjDown.json)}`,
  );
  const adjSame = await owner("POST", `/api/tenants/${tenantId}/stock-adjustments`, {
    productId: prodBarang.json.id,
    warehouseId: whUtama.id,
    physicalQty: 5,
  });
  check("opname tanpa selisih DITOLAK 400", adjSame.status === 400);
  const adjUp = await owner("POST", `/api/tenants/${tenantId}/stock-adjustments`, {
    productId: prodBarang.json.id,
    warehouseId: whUtama.id,
    physicalQty: 6,
    note: "ketemu 1 di rak lain",
  });
  check("opname 5→6: selisih +1, nilai 100.000", adjUp.status === 201 && adjUp.json?.delta === 1 && adjUp.json?.value === 100_000);

  const stockAfterAdj = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check(
    "stok kini 6 pcs",
    stockAfterAdj.json?.levels?.find((l) => l.sku === "BRG-002")?.qty === 6,
  );
  const tbAfterAdj = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah opname", tbAfterAdj.json?.balanced === true);

  const adjByViewer = await viewer("POST", `/api/tenants/${tenantId}/stock-adjustments`, {
    productId: prodBarang.json.id,
    warehouseId: whUtama.id,
    physicalQty: 0,
  });
  check("viewer DITOLAK opname (403)", adjByViewer.status === 403);

  const auditLogs = await owner("GET", `/api/tenants/${tenantId}/audit-logs`);
  check(
    "audit log owner: berisi aktivitas incl. penyesuaian stok",
    auditLogs.status === 200 && auditLogs.json?.logs?.some((l) => l.action === "inventory.adjusted"),
  );
  const auditByViewer = await viewer("GET", `/api/tenants/${tenantId}/audit-logs`);
  check("viewer DITOLAK membaca audit log (403)", auditByViewer.status === 403);

  // --- Transfer antar gudang & profil (Fase 2g) -----------------------------------
  console.log("11b2. Transfer antar gudang & profil pengguna");
  const wh2 = await owner("POST", `/api/tenants/${tenantId}/warehouses`, {
    code: "CAB-01",
    name: "Gudang Cabang",
  });
  check("gudang kedua dibuat", wh2.status === 201);

  const transferSame = await owner("POST", `/api/tenants/${tenantId}/stock-transfers`, {
    productId: prodBarang.json.id,
    fromWarehouseId: whUtama.id,
    toWarehouseId: whUtama.id,
    qty: 1,
  });
  check("transfer ke gudang yang sama DITOLAK 400", transferSame.status === 400);

  const transfer = await owner("POST", `/api/tenants/${tenantId}/stock-transfers`, {
    productId: prodBarang.json.id,
    fromWarehouseId: whUtama.id,
    toWarehouseId: wh2.json.id,
    qty: 2,
  });
  check("transfer 2 pcs (nilai 200.000)", transfer.status === 201 && transfer.json?.value === 200_000);

  const stockAfterTransfer = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const utamaLevel = stockAfterTransfer.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id);
  const cabangLevel = stockAfterTransfer.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === wh2.json.id);
  check(
    "level per gudang benar (4 & 2) dan total nilai tetap 600.000",
    utamaLevel?.qty === 4 && cabangLevel?.qty === 2 && utamaLevel.value + cabangLevel.value === 600_000,
    `→ ${JSON.stringify({ utama: utamaLevel?.qty, cabang: cabangLevel?.qty })}`,
  );
  // Kembalikan agar skenario retur di bawah tetap memakai stok Gudang Utama.
  await owner("POST", `/api/tenants/${tenantId}/stock-transfers`, {
    productId: prodBarang.json.id,
    fromWarehouseId: wh2.json.id,
    toWarehouseId: whUtama.id,
    qty: 2,
  });

  const rename = await owner("PATCH", "/api/auth/profile", { name: "Budi Santoso Jr" });
  const meRenamed = await owner("GET", "/api/auth/me");
  check("ubah nama profil", rename.status === 200 && meRenamed.json?.user?.name === "Budi Santoso Jr");

  const wrongPass = await owner("POST", "/api/auth/change-password", {
    currentPassword: "salah-total",
    newPassword: "rahasia-baru-456",
  });
  check("ganti password dengan password lama salah DITOLAK 400", wrongPass.status === 400);
  const changePass = await owner("POST", "/api/auth/change-password", {
    currentPassword: "rahasia-kuat-123",
    newPassword: "rahasia-baru-456",
  });
  check("ganti password berhasil", changePass.status === 200);
  const meStill = await owner("GET", "/api/auth/me");
  check("sesi saat ini tetap hidup setelah ganti password", meStill.status === 200);
  const loginOldPass = await makeClient()("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check("login dengan password lama DITOLAK 401", loginOldPass.status === 401);
  // Kembalikan password agar skenario 2FA di bawah tetap valid.
  await owner("POST", "/api/auth/change-password", {
    currentPassword: "rahasia-baru-456",
    newPassword: "rahasia-kuat-123",
  });

  // --- Retur penjualan & pembelian (Fase 2f) --------------------------------------
  console.log("11c. Retur penjualan & pembelian");
  // Faktur kedua (belum dibayar): jual 2 pcs @150rb + PPN 11% = 333.000; stok 6→4.
  const inv2 = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 2, unitPrice: 150_000 }],
  });
  check("faktur kedua diposting (333.000)", inv2.status === 201 && inv2.json?.total === 333_000);

  const returnTooMany = await owner("POST", `/api/tenants/${tenantId}/returns`, {
    refType: "invoice",
    refId: inv2.json.id,
    warehouseId: whUtama.id,
    returnDate: "2026-07-03",
    lines: [{ productId: prodBarang.json.id, qty: 5 }],
  });
  check("retur melebihi qty dokumen DITOLAK 400", returnTooMany.status === 400);

  const salesReturn = await owner("POST", `/api/tenants/${tenantId}/returns`, {
    refType: "invoice",
    refId: inv2.json.id,
    warehouseId: whUtama.id,
    returnDate: "2026-07-03",
    memo: "1 rusak saat kirim",
    lines: [{ productId: prodBarang.json.id, qty: 1 }],
  });
  check(
    "retur penjualan 1 pcs: nilai 166.500 + jurnal",
    salesReturn.status === 201 && salesReturn.json?.total === 166_500 && Boolean(salesReturn.json?.journalNo),
    `→ ${JSON.stringify(salesReturn.json)}`,
  );

  const invoicesAfterReturn = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  const inv2After = invoicesAfterReturn.json?.docs?.find((d) => d.id === inv2.json.id);
  check("faktur mencatat returnedAmount 166.500", inv2After?.returnedAmount === 166_500);

  const agingAfterReturn = await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=receivable`);
  check(
    "aging piutang: sisa 166.500 setelah retur",
    agingAfterReturn.json?.grandTotal === 166_500,
    `→ ${agingAfterReturn.json?.grandTotal}`,
  );

  // Retur pembelian 2 pcs dari PB-00001 (1.110.000): 200rb + PPN 22rb = 222rb; stok turun 2.
  const purchases = await owner("GET", `/api/tenants/${tenantId}/purchases`);
  const pb1 = purchases.json.docs.find((d) => d.docNo === "PB-00001");
  const purchaseReturn = await owner("POST", `/api/tenants/${tenantId}/returns`, {
    refType: "purchase",
    refId: pb1.id,
    warehouseId: whUtama.id,
    returnDate: "2026-07-03",
    lines: [{ productId: prodBarang.json.id, qty: 2 }],
  });
  check(
    "retur pembelian 2 pcs: nilai 222.000",
    purchaseReturn.status === 201 && purchaseReturn.json?.total === 222_000,
    `→ ${JSON.stringify(purchaseReturn.json)}`,
  );

  const agingApAfterReturn = await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=payable`);
  check("aging hutang berkurang menjadi 888.000", agingApAfterReturn.json?.grandTotal === 888_000);

  const stockAfterReturns = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check(
    "stok setelah retur: 6−2(jual)+1(retur jual)−2(retur beli) = 3",
    stockAfterReturns.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty === 3,
  );

  const tbAfterReturns = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah retur", tbAfterReturns.json?.balanced === true);

  const returnByViewer = await viewer("POST", `/api/tenants/${tenantId}/returns`, {
    refType: "invoice",
    refId: inv2.json.id,
    warehouseId: whUtama.id,
    returnDate: "2026-07-03",
    lines: [{ productId: prodBarang.json.id, qty: 1 }],
  });
  check("viewer DITOLAK membuat retur (403)", returnByViewer.status === 403);

  // --- POS / Kasir (Fase 2h) --------------------------------------------------------
  console.log("11d. POS / Kasir");
  const openShift = await owner("POST", `/api/tenants/${tenantId}/pos/shift/open`, {
    warehouseId: whUtama.id,
    openingCash: 500_000,
  });
  check("shift dibuka (SHF-00001, kas awal 500rb)", openShift.status === 201 && openShift.json?.shiftNo === "SHF-00001");

  const doubleOpen = await owner("POST", `/api/tenants/${tenantId}/pos/shift/open`, {
    warehouseId: whUtama.id,
    openingCash: 0,
  });
  check("membuka shift kedua saat masih ada yang terbuka DITOLAK 400", doubleOpen.status === 400);

  const underpay = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: openShift.json.id,
    taxRate: 0,
    cashReceived: 100,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("uang kurang dari total DITOLAK 400", underpay.status === 400);

  const posSale = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: openShift.json.id,
    taxRate: 0,
    cashReceived: 200_000,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check(
    "penjualan POS: total 150rb, kembalian 50rb",
    posSale.status === 201 && posSale.json?.total === 150_000 && posSale.json?.change === 50_000,
    `→ ${JSON.stringify(posSale.json)}`,
  );

  const invoicesWithPos = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  const posInvoice = invoicesWithPos.json?.docs?.find((d) => d.docNo === posSale.json.invoiceNo);
  check("faktur POS berstatus LUNAS", posInvoice?.status === "paid" && posInvoice?.paidAmount === 150_000);

  const shiftState = await owner("GET", `/api/tenants/${tenantId}/pos/shift`);
  check(
    "status shift: 1 transaksi, seharusnya kas 650rb",
    shiftState.json?.shift?.salesCount === 1 && shiftState.json?.shift?.expectedCash === 650_000,
  );

  const closeShift = await owner("POST", `/api/tenants/${tenantId}/pos/shift/${openShift.json.id}/close`, {
    closingCash: 640_000,
  });
  check(
    "tutup shift: fisik 640rb vs seharusnya 650rb → selisih -10rb terjurnal",
    closeShift.status === 200 && closeShift.json?.expected === 650_000 && closeShift.json?.difference === -10_000,
    `→ ${JSON.stringify(closeShift.json)}`,
  );

  const saleOnClosed = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: openShift.json.id,
    taxRate: 0,
    cashReceived: 200_000,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("penjualan pada shift tertutup DITOLAK 400", saleOnClosed.status === 400);

  const tbAfterPos = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah POS", tbAfterPos.json?.balanced === true);

  const shiftByViewer = await viewer("POST", `/api/tenants/${tenantId}/pos/shift/open`, {
    warehouseId: whUtama.id,
    openingCash: 0,
  });
  check("viewer DITOLAK membuka shift (403)", shiftByViewer.status === 403);

  // --- Approval engine pembelian (Fase 2i) -----------------------------------------
  console.log("11e. Persetujuan pembelian (approval engine)");

  // Undang admin baru untuk menguji jalur non-owner.
  const inviteAdmin = await owner("POST", `/api/tenants/${tenantId}/invites`, {
    email: "dewi@majujaya.co.id",
    role: "admin",
  });
  const admin = makeClient();
  await admin("POST", "/api/auth/register", {
    companyName: "Usaha Dewi",
    name: "Dewi Lestari",
    email: "dewi@majujaya.co.id",
    password: "rahasia-dewi-789",
  });
  await admin("POST", "/api/invites/accept", { token: inviteAdmin.json.inviteUrl.split("token=")[1] });

  // --- Akun comped (Fase 4a): email di COMPED_EMAILS → tenant aktif permanen ------
  // Server dijalankan dengan COMPED_EMAILS=dewi@majujaya.co.id (lihat spawn args).
  const dewiMe = await admin("GET", "/api/auth/me");
  const dewiOwn = dewiMe.json?.memberships?.find((m) => m.tenantSlug?.startsWith("usaha-dewi"));
  check(
    "register email comped → tenant langsung active + paket enterprise tanpa akhir trial",
    dewiOwn?.tenantStatus === "active" && dewiOwn?.plan === "enterprise" && dewiOwn?.trialEndsAt === null,
    `→ ${JSON.stringify(dewiOwn)}`,
  );
  check(
    "register email biasa tetap trial (tenant utama tidak ikut comped)",
    dewiMe.json?.memberships?.find((m) => m.tenantId === tenantId)?.tenantStatus === "trial",
  );
  const dewiCo = await admin("POST", "/api/auth/companies", { companyName: "Cabang Dewi" });
  check("perusahaan tambahan milik email comped 201", dewiCo.status === 201);
  const dewiMe2 = await admin("GET", "/api/auth/me");
  const dewiCoRow = dewiMe2.json?.memberships?.find((m) => m.tenantId === dewiCo.json?.tenantId);
  check(
    "perusahaan tambahan comped juga active/enterprise",
    dewiCoRow?.tenantStatus === "active" && dewiCoRow?.plan === "enterprise" && dewiCoRow?.trialEndsAt === null,
    `→ ${JSON.stringify(dewiCoRow)}`,
  );

  const thresholdByViewer = await viewer("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount: 1 });
  check("viewer DITOLAK mengatur ambang (403)", thresholdByViewer.status === 403);
  const setThreshold = await owner("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount: 1_000_000 });
  check("owner mengatur ambang 1.000.000", setThreshold.status === 200);

  const smallPurchase = await admin("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 2, unitPrice: 100_000 }],
  });
  check("pembelian admin DI BAWAH ambang (222rb) langsung diposting 201", smallPurchase.status === 201);

  const bigPurchase = await admin("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 10, unitPrice: 100_000 }],
  });
  check(
    "pembelian admin DI ATAS ambang (1.110.000) → 202 menunggu persetujuan",
    bigPurchase.status === 202 && bigPurchase.json?.pendingApproval === true && bigPurchase.json?.requestNo === "APR-00001",
    `→ ${JSON.stringify(bigPurchase.json)}`,
  );

  let stockPending = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check(
    "stok & jurnal TIDAK berubah saat menunggu (4 pcs setelah pembelian kecil)",
    stockPending.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty === 4,
  );

  const approvalsByAdmin = await admin("GET", `/api/tenants/${tenantId}/approvals`);
  check("admin DITOLAK melihat daftar persetujuan (403)", approvalsByAdmin.status === 403);

  const approvals = await owner("GET", `/api/tenants/${tenantId}/approvals`);
  const pendingReq = approvals.json?.requests?.find((r) => r.status === "pending");
  check("owner melihat 1 permintaan menunggu", approvals.status === 200 && Boolean(pendingReq));

  const approveByAdmin = await admin("POST", `/api/tenants/${tenantId}/approvals/${pendingReq.id}/approve`);
  check("admin DITOLAK menyetujui (403)", approveByAdmin.status === 403);

  const approve = await owner("POST", `/api/tenants/${tenantId}/approvals/${pendingReq.id}/approve`);
  check("owner menyetujui → faktur pembelian diposting", approve.status === 200 && Boolean(approve.json?.docNo));

  stockPending = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check(
    "stok bertambah 10 setelah disetujui (total 14)",
    stockPending.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty === 14,
  );

  const doubleApprove = await owner("POST", `/api/tenants/${tenantId}/approvals/${pendingReq.id}/approve`);
  check("menyetujui dua kali DITOLAK 404", doubleApprove.status === 404);

  const bigPurchase2 = await admin("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 11,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 20, unitPrice: 100_000 }],
  });
  const approvals2 = await owner("GET", `/api/tenants/${tenantId}/approvals`);
  const pending2 = approvals2.json?.requests?.find((r) => r.status === "pending");
  const rejectReq = await owner("POST", `/api/tenants/${tenantId}/approvals/${pending2.id}/reject`, {
    note: "Terlalu besar bulan ini",
  });
  check("owner menolak permintaan kedua", bigPurchase2.status === 202 && rejectReq.status === 200);
  stockPending = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check(
    "penolakan tidak mengubah stok (tetap 14)",
    stockPending.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty === 14,
  );
  const tbAfterApprovals = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur persetujuan", tbAfterApprovals.json?.balanced === true);

  // --- Lot & kedaluwarsa (Fase 2j) ----------------------------------------------
  console.log("11f. Batch/lot & kedaluwarsa (FEFO)");

  // Owner dipakai agar ambang persetujuan 1.000.000 tidak ikut campur; PPN 0 dan
  // faktur dibiarkan belum dibayar supaya ekspektasi arus kas tidak berubah.
  const prodExp = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "BRG-EXP",
    name: "Yogurt Botol 250ml",
    unit: "pcs",
    sellPrice: 15_000,
    buyPrice: 10_000,
    trackExpiry: true,
  });
  check("produk berpelacakan kedaluwarsa dibuat 201", prodExp.status === 201);

  const buyNoExp = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodExp.json.id, qty: 5, unitPrice: 10_000 }],
  });
  check(
    "pembelian produk terlacak TANPA tanggal exp DITOLAK 400",
    buyNoExp.status === 400 && /kedaluwarsa/.test(buyNoExp.json?.error ?? ""),
    `→ ${JSON.stringify(buyNoExp.json)}`,
  );

  // Dua lot: LOT-A kedaluwarsa +10 hari (harus keluar duluan), LOT-B +100 hari.
  const expSoon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
  const expFar = new Date(Date.now() + 100 * 86_400_000).toISOString().slice(0, 10);
  const buyLots = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-07-03",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [
      { productId: prodExp.json.id, qty: 5, unitPrice: 10_000, lotNo: "LOT-A", expiryDate: expSoon },
      { productId: prodExp.json.id, qty: 5, unitPrice: 10_000, lotNo: "LOT-B", expiryDate: expFar },
    ],
  });
  check("pembelian 2 lot diposting (total 100.000)", buyLots.status === 201 && buyLots.json?.total === 100_000);

  let lotsRes = await owner("GET", `/api/tenants/${tenantId}/stock-lots`);
  let expLots = (lotsRes.json?.lots ?? []).filter((l) => l.sku === "BRG-EXP");
  check(
    "daftar lot urut FEFO (LOT-A dulu, 5+5)",
    lotsRes.status === 200 &&
      expLots.length === 2 &&
      expLots[0]?.lotNo === "LOT-A" &&
      expLots[0]?.qty === 5 &&
      expLots[1]?.lotNo === "LOT-B" &&
      expLots[1]?.qty === 5,
    `→ ${JSON.stringify(expLots)}`,
  );
  check(
    "peringatan: 1 lot kedaluwarsa ≤ 30 hari (LOT-A)",
    lotsRes.json?.expiringSoon === 1 && expLots[0]?.daysToExpiry === 10,
    `→ expiringSoon=${lotsRes.json?.expiringSoon}, days=${expLots[0]?.daysToExpiry}`,
  );
  check(
    "produk tanpa pelacakan tidak punya lot (BRG-002 bebas lot)",
    !(lotsRes.json?.lots ?? []).some((l) => l.sku === "BRG-002"),
  );

  // Jual 3 → semuanya dari LOT-A (kedaluwarsa terdekat lebih dulu).
  const sellFefo1 = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-04",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodExp.json.id, qty: 3, unitPrice: 15_000 }],
  });
  lotsRes = await owner("GET", `/api/tenants/${tenantId}/stock-lots`);
  expLots = (lotsRes.json?.lots ?? []).filter((l) => l.sku === "BRG-EXP");
  check(
    "jual 3 mengambil LOT-A dulu (FEFO): LOT-A sisa 2, LOT-B tetap 5",
    sellFefo1.status === 201 &&
      expLots.find((l) => l.lotNo === "LOT-A")?.qty === 2 &&
      expLots.find((l) => l.lotNo === "LOT-B")?.qty === 5,
    `→ ${JSON.stringify(expLots)}`,
  );

  // Jual 4 → LOT-A habis (2) lalu lanjut ke LOT-B (2).
  const sellFefo2 = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-04",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodExp.json.id, qty: 4, unitPrice: 15_000 }],
  });
  lotsRes = await owner("GET", `/api/tenants/${tenantId}/stock-lots`);
  expLots = (lotsRes.json?.lots ?? []).filter((l) => l.sku === "BRG-EXP");
  check(
    "jual 4 menghabiskan LOT-A lalu memotong LOT-B (sisa hanya LOT-B = 3)",
    sellFefo2.status === 201 && expLots.length === 1 && expLots[0]?.lotNo === "LOT-B" && expLots[0]?.qty === 3,
    `→ ${JSON.stringify(expLots)}`,
  );

  const lotsByViewer = await viewer("GET", `/api/tenants/${tenantId}/stock-lots`);
  check("viewer boleh melihat daftar lot", lotsByViewer.status === 200);

  const tbAfterLots = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur lot/FEFO", tbAfterLots.json?.balanced === true);

  // Tutup buku sampai 10 Juli — transaksi ≤ tanggal itu harus ditolak.
  const closeByViewer = await viewer("POST", `/api/tenants/${tenantId}/close-books`, { date: "2026-07-10" });
  check("viewer/admin DITOLAK menutup buku (403)", closeByViewer.status === 403);

  const close = await owner("POST", `/api/tenants/${tenantId}/close-books`, { date: "2026-07-10" });
  check("owner menutup buku sampai 2026-07-10", close.status === 200 && close.json?.lockedBefore === "2026-07-10");

  const lockedJournal = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-05",
    lines: [
      { accountId: kas.id, debit: 1000, credit: 0 },
      { accountId: modal.id, debit: 0, credit: 1000 },
    ],
  });
  check("jurnal pada periode terkunci DITOLAK 400", lockedJournal.status === 400);

  const lockedInvoice = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-07-08",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("faktur pada periode terkunci DITOLAK 400", lockedInvoice.status === 400);

  const stockAfterLock = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const levelAfterLock = stockAfterLock.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id);
  check("stok TIDAK berubah oleh faktur yang ditolak (tetap 14)", levelAfterLock?.qty === 14);

  const openJournal = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-07-15",
    memo: "Setelah tutup buku",
    lines: [
      { accountId: kas.id, debit: 1000, credit: 0 },
      { accountId: modal.id, debit: 0, credit: 1000 },
    ],
  });
  check("jurnal SETELAH tanggal kunci tetap boleh (201)", openJournal.status === 201);

  const rollback = await owner("POST", `/api/tenants/${tenantId}/close-books`, { date: "2026-07-01" });
  check("tanggal kunci mundur DITOLAK 400", rollback.status === 400);

  // --- CRM Pipeline (Fase 2l) -----------------------------------------------------
  console.log("11g. CRM Pipeline (lead, funnel, aktivitas, penawaran, konversi)");

  const lead = await owner("POST", `/api/tenants/${tenantId}/leads`, {
    name: "PT Calon Pelanggan",
    contactPerson: "Ibu Sari",
    phone: "0811-2222-3333",
    estValue: 5_000_000,
  });
  check("buat lead 201", lead.status === 201, `→ ${JSON.stringify(lead.json)}`);
  const leadId = lead.json?.id;

  const leadsList = await owner("GET", `/api/tenants/${tenantId}/leads`);
  check(
    "daftar lead berisi 1 (tahap 'new')",
    leadsList.status === 200 && leadsList.json?.leads?.length === 1 && leadsList.json.leads[0].stage === "new",
  );

  const viewerLead = await viewer("POST", `/api/tenants/${tenantId}/leads`, { name: "Coba Viewer" });
  check("viewer DITOLAK membuat lead (403)", viewerLead.status === 403);
  const outsiderLeads = await outsider("GET", `/api/tenants/${tenantId}/leads`);
  check("non-anggota DITOLAK akses CRM tenant lain (403)", outsiderLeads.status === 403);

  const act = await owner("POST", `/api/tenants/${tenantId}/leads/${leadId}/activities`, {
    type: "call",
    note: "Telepon perkenalan, tertarik produk.",
    activityDate: "2026-07-15",
  });
  check("catat aktivitas lead 201", act.status === 201);
  const acts = await owner("GET", `/api/tenants/${tenantId}/leads/${leadId}/activities`);
  check("daftar aktivitas berisi 1", acts.status === 200 && acts.json?.activities?.length === 1);

  const moveStage = await owner("PATCH", `/api/tenants/${tenantId}/leads/${leadId}`, { stage: "qualified" });
  check("pindah tahap lead 200", moveStage.status === 200);

  const contactsBefore = await owner("GET", `/api/tenants/${tenantId}/contacts`);
  const nContactsBefore = contactsBefore.json?.items?.length ?? 0;
  const convertLead = await owner("POST", `/api/tenants/${tenantId}/leads/${leadId}/convert`);
  check("konversi lead → pelanggan 201", convertLead.status === 201 && Boolean(convertLead.json?.contactId));
  const contactsAfter = await owner("GET", `/api/tenants/${tenantId}/contacts`);
  const newCust = contactsAfter.json?.items?.find((k) => k.name === "PT Calon Pelanggan" && k.type === "customer");
  check(
    "kontak pelanggan baru terbentuk dari lead",
    (contactsAfter.json?.items?.length ?? 0) === nContactsBefore + 1 && Boolean(newCust),
  );

  const reconvert = await owner("POST", `/api/tenants/${tenantId}/leads/${leadId}/convert`);
  check("konversi lead kedua kali DITOLAK 400", reconvert.status === 400);

  // Penawaran (quotation) — 2 baris, PPN 11%: 300rb + 33rb = 333rb.
  const quote = await owner("POST", `/api/tenants/${tenantId}/quotations`, {
    contactId: newCust.id,
    quoteDate: "2026-07-20",
    taxRate: 11,
    lines: [
      { productId: prodBarang.json.id, qty: 2, unitPrice: 100_000 },
      { productId: prodBarang.json.id, qty: 1, unitPrice: 100_000 },
    ],
  });
  check(
    "buat penawaran 201, total = 300rb + PPN 33rb = 333rb",
    quote.status === 201 && quote.json?.total === 333_000,
    `→ ${JSON.stringify(quote.json)}`,
  );
  const quoteId = quote.json?.id;

  const convertEarly = await owner("POST", `/api/tenants/${tenantId}/quotations/${quoteId}/convert`, {
    warehouseId: whUtama.id,
    invoiceDate: "2026-07-20",
  });
  check("konversi penawaran belum 'diterima' DITOLAK 400", convertEarly.status === 400);

  const acceptQuote = await owner("PATCH", `/api/tenants/${tenantId}/quotations/${quoteId}/status`, { status: "accepted" });
  check("tandai penawaran 'diterima' 200", acceptQuote.status === 200);

  const stockBeforeConv = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const qtyBeforeConv =
    stockBeforeConv.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty ?? 0;

  const convertQuote = await owner("POST", `/api/tenants/${tenantId}/quotations/${quoteId}/convert`, {
    warehouseId: whUtama.id,
    invoiceDate: "2026-07-20",
  });
  check(
    "konversi penawaran → faktur 201",
    convertQuote.status === 201 && Boolean(convertQuote.json?.docNo),
    `→ ${JSON.stringify(convertQuote.json)}`,
  );

  const quotesAfter = await owner("GET", `/api/tenants/${tenantId}/quotations`);
  const convertedQuote = quotesAfter.json?.quotations?.find((q) => q.id === quoteId);
  check(
    "penawaran menjadi 'converted' + tertaut ke faktur",
    convertedQuote?.status === "converted" && Boolean(convertedQuote?.resultInvoiceId),
  );

  const invoicesAfterConv = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  check(
    "faktur hasil konversi muncul di daftar penjualan",
    invoicesAfterConv.json?.docs?.some((d) => d.docNo === convertQuote.json.docNo),
  );

  const stockAfterConv = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const qtyAfterConv =
    stockAfterConv.json?.levels?.find((l) => l.sku === "BRG-002" && l.warehouseId === whUtama.id)?.qty ?? 0;
  check(
    "stok BRG-002 berkurang 3 setelah konversi penawaran",
    qtyAfterConv === qtyBeforeConv - 3,
    `→ ${qtyBeforeConv} → ${qtyAfterConv}`,
  );

  const reconvertQuote = await owner("POST", `/api/tenants/${tenantId}/quotations/${quoteId}/convert`, {
    warehouseId: whUtama.id,
    invoiceDate: "2026-07-20",
  });
  check("konversi penawaran kedua kali DITOLAK 400", reconvertQuote.status === 400);

  const tbAfterCrm = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur CRM", tbAfterCrm.json?.balanced === true);

  // --- Anggaran (Fase 2n) ---------------------------------------------------------
  console.log("11h. Anggaran (budget vs realisasi)");
  const expenseAcc = accounts.find((a) => a.type === "expense");

  const setBudget = await owner("PUT", `/api/tenants/${tenantId}/budgets`, {
    accountId: penjualan.id,
    period: "2026-07",
    amount: 10_000_000,
  });
  check("tetapkan anggaran pendapatan 200", setBudget.status === 200);
  await owner("PUT", `/api/tenants/${tenantId}/budgets`, { accountId: expenseAcc.id, period: "2026-07", amount: 2_000_000 });

  const budgetRep = await owner("GET", `/api/tenants/${tenantId}/budgets/2026-07`);
  const penjRow = budgetRep.json?.rows?.find((r) => r.accountId === penjualan.id);
  check("laporan anggaran memuat baris pendapatan dengan anggaran 10jt", budgetRep.status === 200 && penjRow?.budget === 10_000_000);

  // Realisasi harus cocok dengan Laba Rugi bulan itu (satu sumber = jurnal).
  const isJul = await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-07-01&to=2026-07-31`);
  const penjIsActual = isJul.json?.income?.find((l) => l.accountId === penjualan.id)?.amount ?? 0;
  check(
    "realisasi anggaran = angka Laba Rugi bulan yang sama",
    penjRow?.actual === penjIsActual,
    `→ budget=${penjRow?.actual} vs IS=${penjIsActual}`,
  );
  check("selisih pendapatan = realisasi − anggaran", penjRow?.variance === penjRow.actual - 10_000_000);

  // Upsert: ubah anggaran akun yang sama → nilai ter-update, bukan ganda.
  await owner("PUT", `/api/tenants/${tenantId}/budgets`, { accountId: penjualan.id, period: "2026-07", amount: 12_000_000 });
  const budgetRep2 = await owner("GET", `/api/tenants/${tenantId}/budgets/2026-07`);
  check(
    "ubah anggaran meng-upsert (tetap satu baris, nilai 12jt)",
    budgetRep2.json?.rows?.find((r) => r.accountId === penjualan.id)?.budget === 12_000_000,
  );

  const viewerBudget = await viewer("PUT", `/api/tenants/${tenantId}/budgets`, {
    accountId: penjualan.id,
    period: "2026-07",
    amount: 1,
  });
  check("viewer DITOLAK menetapkan anggaran (403)", viewerBudget.status === 403);

  const budgetOnAsset = await owner("PUT", `/api/tenants/${tenantId}/budgets`, {
    accountId: kas.id,
    period: "2026-07",
    amount: 1000,
  });
  check("anggaran pada akun non-pendapatan/beban DITOLAK 400", budgetOnAsset.status === 400);

  const badPeriod = await owner("GET", `/api/tenants/${tenantId}/budgets/2026-7`);
  check("periode salah format DITOLAK 400", badPeriod.status === 400);

  // --- HR & Payroll (Fase 2o) -----------------------------------------------------
  // Digaji di Agustus (setelah tanggal kunci 2026-07-10 & di luar jendela arus kas Juli).
  console.log("11i. HR & Payroll (PPh 21 TER + BPJS)");

  const empA = await owner("POST", `/api/tenants/${tenantId}/employees`, {
    name: "Andi Karyawan",
    position: "Staf",
    ptkpStatus: "TK/0",
    baseSalary: 5_000_000,
    allowances: 0,
  });
  check("tambah karyawan 201", empA.status === 201);
  await owner("POST", `/api/tenants/${tenantId}/employees`, {
    name: "Bunga Manajer",
    position: "Manajer",
    ptkpStatus: "TK/0",
    baseSalary: 10_000_000,
    allowances: 0,
  });

  const viewerEmp = await viewer("POST", `/api/tenants/${tenantId}/employees`, { name: "X", ptkpStatus: "TK/0", baseSalary: 1 });
  check("viewer DITOLAK menambah karyawan (403)", viewerEmp.status === 403);

  const emps = await owner("GET", `/api/tenants/${tenantId}/employees`);
  check("daftar karyawan berisi 2 aktif", emps.status === 200 && emps.json?.employees?.length === 2);

  // Jalankan penggajian Agustus.
  const runRes = await owner("POST", `/api/tenants/${tenantId}/payroll-runs`, {
    period: "2026-08",
    cashAccountId: kas.id,
    paymentDate: "2026-08-15",
  });
  check(
    "jalankan penggajian 201 (bruto 15jt, netto 14,2jt, 2 karyawan)",
    runRes.status === 201 && runRes.json?.totalGross === 15_000_000 && runRes.json?.totalNet === 14_200_000 && runRes.json?.employees === 2,
    `→ ${JSON.stringify(runRes.json)}`,
  );

  const runs = await owner("GET", `/api/tenants/${tenantId}/payroll-runs`);
  const run1 = runs.json?.runs?.[0];
  const slipB = run1?.payslips?.find((p) => p.employeeName === "Bunga Manajer");
  check("slip manajer: PPh21 200rb (TER A 2%), potongan 600rb, netto 9,4jt", slipB?.pph21 === 200_000 && slipB?.totalDeductions === 600_000 && slipB?.net === 9_400_000, `→ ${JSON.stringify(slipB)}`);
  const slipA = run1?.payslips?.find((p) => p.employeeName === "Andi Karyawan");
  check("slip staf (bruto 5jt < ambang): PPh21 0, BPJS 200rb, netto 4,8jt", slipA?.pph21 === 0 && slipA?.net === 4_800_000);

  const dupRun = await owner("POST", `/api/tenants/${tenantId}/payroll-runs`, { period: "2026-08", cashAccountId: kas.id, paymentDate: "2026-08-15" });
  check("penggajian ganda periode sama DITOLAK 409", dupRun.status === 409);

  const viewerRun = await viewer("POST", `/api/tenants/${tenantId}/payroll-runs`, { period: "2026-09", cashAccountId: kas.id, paymentDate: "2026-09-15" });
  check("viewer DITOLAK menjalankan penggajian (403)", viewerRun.status === 403);

  const badAccRun = await owner("POST", `/api/tenants/${tenantId}/payroll-runs`, { period: "2026-09", cashAccountId: modal.id, paymentDate: "2026-09-15" });
  check("penggajian dengan akun non-kas DITOLAK 400", badAccRun.status === 400);

  const tbAfterPayroll = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah penggajian", tbAfterPayroll.json?.balanced === true);

  // --- Aset Tetap (Fase 2p) -------------------------------------------------------
  // Beroperasi di Agustus (di luar jendela arus kas Juli & tanggal kunci).
  console.log("11j. Aset Tetap (penyusutan garis lurus + pelepasan)");

  const viewerAsset = await viewer("POST", `/api/tenants/${tenantId}/assets`, {
    name: "X",
    acquisitionDate: "2026-08-01",
    acquisitionCost: 1_000_000,
    usefulLifeMonths: 12,
    cashAccountId: kas.id,
  });
  check("viewer DITOLAK mendaftarkan aset (403)", viewerAsset.status === 403);

  const asset = await owner("POST", `/api/tenants/${tenantId}/assets`, {
    name: "Mobil Operasional",
    category: "Kendaraan",
    acquisitionDate: "2026-08-01",
    acquisitionCost: 48_000_000,
    usefulLifeMonths: 48,
    residualValue: 0,
    cashAccountId: kas.id,
  });
  check("daftarkan aset 201 (jurnal perolehan otomatis)", asset.status === 201, `→ ${JSON.stringify(asset.json)}`);

  const badResidual = await owner("POST", `/api/tenants/${tenantId}/assets`, {
    name: "Salah",
    acquisitionDate: "2026-08-01",
    acquisitionCost: 10_000_000,
    usefulLifeMonths: 12,
    residualValue: 20_000_000,
    cashAccountId: kas.id,
  });
  check("nilai residu ≥ perolehan DITOLAK 400", badResidual.status === 400);

  const assets1 = await owner("GET", `/api/tenants/${tenantId}/assets`);
  const a1 = assets1.json?.assets?.find((x) => x.id === asset.json.id);
  check("aset tampil: nilai buku 48jt, penyusutan 1jt/bln", a1?.bookValue === 48_000_000 && a1?.monthlyDepreciation === 1_000_000);

  const dep1 = await owner("POST", `/api/tenants/${tenantId}/assets/depreciation`, { period: "2026-08", date: "2026-08-31" });
  check("jalankan penyusutan Agustus: 1 aset, total 1jt", dep1.status === 200 && dep1.json?.count === 1 && dep1.json?.total === 1_000_000, `→ ${JSON.stringify(dep1.json)}`);

  const dep2 = await owner("POST", `/api/tenants/${tenantId}/assets/depreciation`, { period: "2026-08", date: "2026-08-31" });
  check("penyusutan periode sama idempotent (0 aset)", dep2.json?.count === 0);

  const assets2 = await owner("GET", `/api/tenants/${tenantId}/assets`);
  const a2 = assets2.json?.assets?.find((x) => x.id === asset.json.id);
  check("setelah susut: akumulasi 1jt, nilai buku 47jt", a2?.accumulatedDepreciation === 1_000_000 && a2?.bookValue === 47_000_000);

  // Lepas dengan hasil 50jt → laba pelepasan 3jt (50 − nilai buku 47).
  const disp = await owner("POST", `/api/tenants/${tenantId}/assets/${asset.json.id}/dispose`, {
    disposalDate: "2026-08-31",
    proceeds: 50_000_000,
    cashAccountId: kas.id,
  });
  check("lepas aset: nilai buku 47jt, laba pelepasan 3jt", disp.status === 201 && disp.json?.bookValue === 47_000_000 && disp.json?.gain === 3_000_000, `→ ${JSON.stringify(disp.json)}`);

  const assets3 = await owner("GET", `/api/tenants/${tenantId}/assets`);
  check("aset berstatus dilepas", assets3.json?.assets?.find((x) => x.id === asset.json.id)?.status === "disposed");

  const dispAgain = await owner("POST", `/api/tenants/${tenantId}/assets/${asset.json.id}/dispose`, {
    disposalDate: "2026-08-31",
    proceeds: 0,
    cashAccountId: kas.id,
  });
  check("lepas aset yang sudah dilepas DITOLAK 400", dispAgain.status === 400);

  const tbAfterAssets = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah penyusutan & pelepasan", tbAfterAssets.json?.balanced === true);

  // --- Proyek (Fase 2q) -----------------------------------------------------------
  // Jurnal ber-tag bertanggal Agustus (di luar jendela arus kas Juli).
  console.log("11k. Proyek (tagging biaya/pendapatan + profitabilitas)");

  const viewerProject = await viewer("POST", `/api/tenants/${tenantId}/projects`, { code: "X", name: "Coba" });
  check("viewer DITOLAK membuat proyek (403)", viewerProject.status === 403);

  const project = await owner("POST", `/api/tenants/${tenantId}/projects`, {
    code: "prj-01",
    name: "Renovasi Kantor Klien A",
    budget: 8_000_000,
  });
  check("buat proyek 201 (kode di-uppercase)", project.status === 201);
  const projectId = project.json?.id;

  const dupProject = await owner("POST", `/api/tenants/${tenantId}/projects`, { code: "PRJ-01", name: "Lain" });
  check("kode proyek ganda DITOLAK 409", dupProject.status === 409);

  // Tag pendapatan 10jt & biaya 4jt ke proyek lewat jurnal manual.
  await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-08-05",
    memo: "Termin proyek A",
    projectId,
    lines: [
      { accountId: kas.id, debit: 10_000_000, credit: 0 },
      { accountId: penjualan.id, debit: 0, credit: 10_000_000 },
    ],
  });
  await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-08-06",
    memo: "Biaya material proyek A",
    projectId,
    lines: [
      { accountId: expenseAcc.id, debit: 4_000_000, credit: 0 },
      { accountId: kas.id, debit: 0, credit: 4_000_000 },
    ],
  });

  const badProjJournal = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-08-05",
    projectId: "proyek-tidak-ada",
    lines: [
      { accountId: kas.id, debit: 1000, credit: 0 },
      { accountId: penjualan.id, debit: 0, credit: 1000 },
    ],
  });
  check("jurnal dengan proyek tak dikenal DITOLAK 400", badProjJournal.status === 400);

  const projList = await owner("GET", `/api/tenants/${tenantId}/projects`);
  const p1 = projList.json?.projects?.find((x) => x.id === projectId);
  check(
    "profitabilitas proyek: pendapatan 10jt, biaya 4jt, laba 6jt",
    p1?.revenue === 10_000_000 && p1?.cost === 4_000_000 && p1?.profit === 6_000_000,
    `→ ${JSON.stringify(p1 && { r: p1.revenue, c: p1.cost, p: p1.profit })}`,
  );

  // Tugas proyek.
  const task = await owner("POST", `/api/tenants/${tenantId}/projects/${projectId}/tasks`, { name: "Pasang plafon" });
  check("tambah tugas proyek 201", task.status === 201);
  const detail = await owner("GET", `/api/tenants/${tenantId}/projects/${projectId}`);
  check("detail proyek: 1 tugas + 2 entri jurnal ber-tag", detail.json?.tasks?.length === 1 && detail.json?.entries?.length === 2);
  const setTask = await owner("PATCH", `/api/tenants/${tenantId}/projects/${projectId}/tasks/${task.json.id}`, { status: "done" });
  check("ubah status tugas 200", setTask.status === 200 && setTask.json?.status === "done");

  const setProjStatus = await owner("PATCH", `/api/tenants/${tenantId}/projects/${projectId}/status`, { status: "completed" });
  check("ubah status proyek jadi selesai 200", setProjStatus.status === 200);

  const tbAfterProject = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah jurnal proyek", tbAfterProject.json?.balanced === true);

  // --- Multi mata uang (Fase 2r) --------------------------------------------------
  // Beroperasi di Agustus (di luar jendela arus kas Juli & tanggal kunci).
  console.log("11l. Multi mata uang (faktur valas + selisih kurs)");

  const viewerCur = await viewer("PUT", `/api/tenants/${tenantId}/currencies`, { code: "USD", name: "Dolar", rate: 16000 });
  check("viewer DITOLAK menetapkan kurs (403)", viewerCur.status === 403);

  const editIdr = await owner("PUT", `/api/tenants/${tenantId}/currencies`, { code: "IDR", name: "Rupiah", rate: 2 });
  check("mengubah kurs IDR (basis) DITOLAK 400", editIdr.status === 400);

  const setUsd = await owner("PUT", `/api/tenants/${tenantId}/currencies`, { code: "USD", name: "Dolar AS", rate: 16000 });
  check("tetapkan kurs USD 200", setUsd.status === 200);
  const curList = await owner("GET", `/api/tenants/${tenantId}/currencies`);
  check("daftar mata uang berisi IDR (basis) + USD", curList.json?.currencies?.length === 2 && curList.json.currencies.some((c) => c.code === "USD" && c.rate === 16000));

  // Stok untuk dijual dalam USD.
  const prodUsd = await owner("POST", `/api/tenants/${tenantId}/products`, { sku: "BRG-USD", name: "Barang Ekspor", unit: "pcs", sellPrice: 0, buyPrice: 100_000 });
  await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id,
    invoiceDate: "2026-08-01",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: prodUsd.json.id, qty: 10, unitPrice: 100_000 }],
  });

  const noRate = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-08-10",
    taxRate: 0,
    warehouseId: whUtama.id,
    currency: "USD",
    lines: [{ productId: prodUsd.json.id, qty: 1, unitPrice: 1000 }],
  });
  check("faktur valas tanpa kurs DITOLAK 400", noRate.status === 400);

  const eurInv = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-08-10",
    taxRate: 0,
    warehouseId: whUtama.id,
    currency: "EUR",
    exchangeRate: 17000,
    lines: [{ productId: prodUsd.json.id, qty: 1, unitPrice: 1000 }],
  });
  check("faktur mata uang tak terdaftar DITOLAK 400", eurInv.status === 400);

  // Faktur 1000 USD @ 16.000 → 16.000.000 IDR di buku.
  const usdInv = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-08-10",
    taxRate: 0,
    warehouseId: whUtama.id,
    currency: "USD",
    exchangeRate: 16000,
    lines: [{ productId: prodUsd.json.id, qty: 1, unitPrice: 1000 }],
  });
  check("faktur USD 1000 @16.000 → total 16jt IDR", usdInv.status === 201 && usdInv.json?.total === 16_000_000, `→ ${JSON.stringify(usdInv.json)}`);

  const usdDocs = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  const usdDoc = usdDocs.json?.docs?.find((d) => d.id === usdInv.json.id);
  check("faktur menyimpan valas (USD, foreignTotal 1000, kurs 16.000)", usdDoc?.currency === "USD" && usdDoc?.foreignTotal === 1000 && usdDoc?.exchangeRate === 16000);

  // Terima 1000 USD saat kurs naik ke 16.500 → selisih kurs laba 500rb.
  const usdPay = await owner("POST", `/api/tenants/${tenantId}/payments`, {
    refType: "invoice",
    refId: usdInv.json.id,
    accountId: kas.id,
    foreignAmount: 1000,
    exchangeRate: 16500,
    paymentDate: "2026-08-15",
  });
  check(
    "pelunasan USD @16.500 → lunas + selisih kurs laba 500rb",
    usdPay.status === 201 && usdPay.json?.settled === true && usdPay.json?.forexGain === 500_000,
    `→ ${JSON.stringify(usdPay.json)}`,
  );

  const tbAfterFx = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah faktur & pelunasan valas", tbAfterFx.json?.balanced === true);

  // --- Kontrak & tagihan berulang (Fase 2s) --------------------------------------
  // Tanggal setelah kunci 2026-07-10; faktur = piutang (tak sentuh arus kas Juli).
  console.log("11m. Kontrak & tagihan berulang (produk jasa)");

  // Produk jasa: faktur tak butuh stok.
  const svc = await owner("POST", `/api/tenants/${tenantId}/products`, { sku: "JASA-01", name: "Jasa Maintenance Bulanan", unit: "bln", sellPrice: 500_000, isService: true });
  check("tambah produk jasa 201", svc.status === 201);

  const viewerContract = await viewer("POST", `/api/tenants/${tenantId}/contracts`, { code: "X", contactId: customer.json.id, name: "x", frequency: "monthly", warehouseId: whUtama.id, startDate: "2026-07-15", lines: [{ productId: svc.json.id, qty: 1, unitPrice: 1 }] });
  check("viewer DITOLAK membuat kontrak (403)", viewerContract.status === 403);

  const contract = await owner("POST", `/api/tenants/${tenantId}/contracts`, {
    code: "lgn-01",
    contactId: customer.json.id,
    name: "Langganan Maintenance",
    frequency: "monthly",
    taxRate: 0,
    warehouseId: whUtama.id,
    startDate: "2026-07-15",
    lines: [{ productId: svc.json.id, qty: 1, unitPrice: 500_000 }],
  });
  check("buat kontrak bulanan 201", contract.status === 201, `→ ${JSON.stringify(contract.json)}`);

  const dupContract = await owner("POST", `/api/tenants/${tenantId}/contracts`, { code: "LGN-01", contactId: customer.json.id, name: "Duplikat", frequency: "monthly", warehouseId: whUtama.id, startDate: "2026-07-15", lines: [{ productId: svc.json.id, qty: 1, unitPrice: 1 }] });
  check("kode kontrak ganda DITOLAK 409", dupContract.status === 409);

  const invCountBeforeBill = (await owner("GET", `/api/tenants/${tenantId}/invoices`)).json?.docs?.length ?? 0;

  const bill1 = await owner("POST", `/api/tenants/${tenantId}/contracts/run-billing`, { date: "2026-07-15" });
  check("tagihan 15 Jul: 1 faktur (500rb) terbit", bill1.status === 200 && bill1.json?.issued === 1 && bill1.json?.total === 500_000, `→ ${JSON.stringify(bill1.json)}`);

  const invCountAfterBill = (await owner("GET", `/api/tenants/${tenantId}/invoices`)).json?.docs?.length ?? 0;
  check("faktur baru muncul di daftar penjualan", invCountAfterBill === invCountBeforeBill + 1);

  const ctList = await owner("GET", `/api/tenants/${tenantId}/contracts`);
  const ct1 = ctList.json?.contracts?.find((c) => c.id === contract.json.id);
  check("tanggal tagih maju ke 2026-08-15, 1 faktur terbit", ct1?.nextInvoiceDate === "2026-08-15" && ct1?.invoiceCount === 1);

  const bill1b = await owner("POST", `/api/tenants/${tenantId}/contracts/run-billing`, { date: "2026-07-15" });
  check("menagih ulang tanggal sama: 0 faktur (belum jatuh tempo)", bill1b.json?.issued === 0);

  const bill2 = await owner("POST", `/api/tenants/${tenantId}/contracts/run-billing`, { date: "2026-08-15" });
  check("tagihan 15 Agu: 1 faktur lagi terbit", bill2.json?.issued === 1);

  // Produk jasa tak menggerakkan stok — pastikan tak ada baris stok untuk JASA-01.
  const stockSvc = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check("produk jasa tidak muncul di level stok", !stockSvc.json?.levels?.some((l) => l.sku === "JASA-01"));

  const tbAfterContract = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah tagihan kontrak", tbAfterContract.json?.balanced === true);

  // --- Konsolidasi multi-perusahaan (Fase 2t) ------------------------------------
  console.log("11n. Konsolidasi multi-perusahaan (laporan gabungan lintas tenant)");

  // Owner "budi" membuat perusahaan kedua di bawah akun yang sama.
  const co2 = await owner("POST", "/api/auth/companies", { companyName: "PT Anak Usaha" });
  check("buat perusahaan kedua 201", co2.status === 201, `→ ${co2.status} ${JSON.stringify(co2.json)}`);
  const tenant2 = co2.json?.tenantId;

  const meMulti = await owner("GET", "/api/auth/me");
  check("owner kini memiliki 2 keanggotaan", (meMulti.json?.memberships?.length ?? 0) === 2);

  // Isolasi: perusahaan kedua punya bagan akun bersih & pembukuan terpisah.
  const acc2 = (await owner("GET", `/api/tenants/${tenant2}/accounts`)).json?.accounts ?? [];
  const kas2 = acc2.find((a) => a.code === "1-1000");
  const modal2 = acc2.find((a) => a.code === "3-1000");
  const pend2 = acc2.find((a) => a.code === "4-1000");
  const beban2 = acc2.find((a) => a.code === "5-2000");
  check("perusahaan kedua tersemai COA (22 akun)", acc2.length === 22 && Boolean(kas2 && modal2 && pend2 && beban2));

  // Pembukuan perusahaan kedua (tanpa tutup buku): modal 30jt, pendapatan 20jt, beban 8jt.
  await owner("POST", `/api/tenants/${tenant2}/journal-entries`, {
    entryDate: "2026-07-01",
    memo: "Setoran modal PT Anak Usaha",
    lines: [
      { accountId: kas2.id, debit: 30_000_000, credit: 0 },
      { accountId: modal2.id, debit: 0, credit: 30_000_000 },
    ],
  });
  await owner("POST", `/api/tenants/${tenant2}/journal-entries`, {
    entryDate: "2026-07-05",
    memo: "Pendapatan jasa",
    lines: [
      { accountId: kas2.id, debit: 20_000_000, credit: 0 },
      { accountId: pend2.id, debit: 0, credit: 20_000_000 },
    ],
  });
  await owner("POST", `/api/tenants/${tenant2}/journal-entries`, {
    entryDate: "2026-07-06",
    memo: "Beban gaji",
    lines: [
      { accountId: beban2.id, debit: 8_000_000, credit: 0 },
      { accountId: kas2.id, debit: 0, credit: 8_000_000 },
    ],
  });

  const companiesRes = await owner("GET", "/api/consolidation/companies");
  check(
    "daftar perusahaan konsolidasi berisi 2 milik owner",
    companiesRes.status === 200 &&
      companiesRes.json?.companies?.length === 2 &&
      companiesRes.json.companies.some((c) => c.tenantId === tenantId) &&
      companiesRes.json.companies.some((c) => c.tenantId === tenant2),
  );

  // Isolasi: user lain (viewer) hanya melihat perusahaan yang IA miliki, bukan milik owner.
  const viewerCompanies = await viewer("GET", "/api/consolidation/companies");
  check(
    "user lain tidak melihat perusahaan owner (isolasi kepemilikan)",
    viewerCompanies.status === 200 &&
      viewerCompanies.json?.companies?.length === 1 &&
      !viewerCompanies.json.companies.some((c) => c.tenantId === tenantId || c.tenantId === tenant2),
  );

  const consAnonClient = makeClient();
  const consAnon = await consAnonClient("GET", "/api/consolidation/companies");
  check("konsolidasi tanpa sesi DITOLAK 401", consAnon.status === 401);

  // Laba Rugi konsolidasi = jumlah laporan tunggal tiap perusahaan (invariant).
  const win = "from=2026-07-01&to=2026-07-31";
  const is1 = (await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?${win}`)).json;
  const is2 = (await owner("GET", `/api/tenants/${tenant2}/reports/income-statement?${win}`)).json;
  const consIS = await owner("GET", `/api/consolidation/income-statement?${win}`);
  check(
    "laba rugi konsolidasi = penjumlahan laporan tiap perusahaan",
    consIS.status === 200 &&
      consIS.json?.companies?.length === 2 &&
      consIS.json.totalIncome === is1.totalIncome + is2.totalIncome &&
      consIS.json.totalExpense === is1.totalExpense + is2.totalExpense &&
      consIS.json.netProfit === is1.netProfit + is2.netProfit,
    `→ ${JSON.stringify({ c: consIS.json?.netProfit, a: is1?.netProfit, b: is2?.netProfit })}`,
  );
  check(
    "perusahaan kedua: pendapatan 20jt, beban 8jt, laba 12jt (rincian per perusahaan)",
    consIS.json?.totalIncomeByCompany?.[tenant2] === 20_000_000 &&
      consIS.json?.totalExpenseByCompany?.[tenant2] === 8_000_000 &&
      consIS.json?.netProfitByCompany?.[tenant2] === 12_000_000,
    `→ ${JSON.stringify(consIS.json?.netProfitByCompany)}`,
  );
  const pendRow = consIS.json?.income?.find((r) => r.code === "4-1000");
  check(
    "baris Pendapatan Penjualan menyimpan nilai per perusahaan",
    pendRow?.amounts?.[tenant2] === 20_000_000,
  );

  // Filter perusahaan: hanya perusahaan kedua → laporan tunggalnya.
  const consFiltered = await owner("GET", `/api/consolidation/income-statement?${win}&companies=${tenant2}`);
  check(
    "filter companies=tenant2 → hanya 1 perusahaan, laba 12jt",
    consFiltered.json?.companies?.length === 1 && consFiltered.json?.netProfit === 12_000_000,
  );

  // Neraca konsolidasi = jumlah neraca tiap perusahaan, tetap seimbang.
  const bs1 = (await owner("GET", `/api/tenants/${tenantId}/reports/balance-sheet?asOf=2026-07-31`)).json;
  const bs2 = (await owner("GET", `/api/tenants/${tenant2}/reports/balance-sheet?asOf=2026-07-31`)).json;
  const consBS = await owner("GET", "/api/consolidation/balance-sheet?asOf=2026-07-31");
  check(
    "neraca konsolidasi seimbang & total = penjumlahan (aset 42jt utk perusahaan kedua)",
    consBS.status === 200 &&
      consBS.json?.balanced === true &&
      consBS.json.totalAssets === bs1.totalAssets + bs2.totalAssets &&
      consBS.json.totalEquity === bs1.totalEquity + bs2.totalEquity &&
      consBS.json.totalAssetsByCompany?.[tenant2] === 42_000_000,
    `→ ${JSON.stringify({ ta: consBS.json?.totalAssets, a2: consBS.json?.totalAssetsByCompany?.[tenant2] })}`,
  );

  // --- Manufaktur + QC (Fase 2u) -------------------------------------------------
  console.log("11o. Manufaktur + QC (BoM, produksi biaya gabungan, inspeksi QC)");

  const kayu = await owner("POST", `/api/tenants/${tenantId}/products`, { sku: "BHN-KAYU", name: "Kayu Jati", unit: "batang", sellPrice: 60_000 });
  const paku = await owner("POST", `/api/tenants/${tenantId}/products`, { sku: "BHN-PAKU", name: "Paku", unit: "pcs", sellPrice: 1_500 });
  const meja = await owner("POST", `/api/tenants/${tenantId}/products`, { sku: "JADI-MEJA", name: "Meja Kerja", unit: "unit", sellPrice: 500_000 });
  check("tambah produk bahan & produk jadi 201", kayu.status === 201 && paku.status === 201 && meja.status === 201);

  // Beli bahan secara kredit (tanpa PPN) — tak menyentuh kas (jaga asersi arus kas).
  await owner("POST", `/api/tenants/${tenantId}/purchases`, { contactId: supplier.json.id, invoiceDate: "2026-07-15", taxRate: 0, warehouseId: whUtama.id, lines: [{ productId: kayu.json.id, qty: 20, unitPrice: 50_000 }] });
  await owner("POST", `/api/tenants/${tenantId}/purchases`, { contactId: supplier.json.id, invoiceDate: "2026-07-15", taxRate: 0, warehouseId: whUtama.id, lines: [{ productId: paku.json.id, qty: 100, unitPrice: 1_000 }] });
  const stockRaw = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const kayuLvl = stockRaw.json?.levels?.find((l) => l.sku === "BHN-KAYU");
  const pakuLvl = stockRaw.json?.levels?.find((l) => l.sku === "BHN-PAKU");
  check("stok bahan masuk (kayu 20@50k, paku 100@1k)", kayuLvl?.qty === 20 && kayuLvl?.avgCost === 50_000 && pakuLvl?.qty === 100 && pakuLvl?.avgCost === 1_000);

  // RBAC: viewer tak boleh mengubah BoM.
  const viewerBom = await viewer("PUT", `/api/tenants/${tenantId}/boms`, { productId: meja.json.id, outputQty: 2, lines: [{ componentId: kayu.json.id, qty: 4 }] });
  check("viewer DITOLAK menyimpan BoM (403)", viewerBom.status === 403);

  // BoM: 4 kayu + 20 paku menghasilkan 2 meja.
  const bom = await owner("PUT", `/api/tenants/${tenantId}/boms`, { productId: meja.json.id, outputQty: 2, lines: [{ componentId: kayu.json.id, qty: 4 }, { componentId: paku.json.id, qty: 20 }] });
  check("simpan BoM Meja 201", bom.status === 201, `→ ${JSON.stringify(bom.json)}`);

  const bomService = await owner("PUT", `/api/tenants/${tenantId}/boms`, { productId: svc.json.id, outputQty: 1, lines: [{ componentId: kayu.json.id, qty: 1 }] });
  check("BoM untuk produk jasa DITOLAK 400", bomService.status === 400);

  const bomSelf = await owner("PUT", `/api/tenants/${tenantId}/boms`, { productId: meja.json.id, outputQty: 1, lines: [{ componentId: meja.json.id, qty: 1 }] });
  check("BoM komponen = produk jadi DITOLAK 400", bomSelf.status === 400);

  const ordBad = await owner("POST", `/api/tenants/${tenantId}/production-orders`, { productId: meja.json.id, warehouseId: whUtama.id, qty: 3 });
  check("jumlah produksi bukan kelipatan hasil resep DITOLAK 400", ordBad.status === 400);

  const viewerOrder = await viewer("POST", `/api/tenants/${tenantId}/production-orders`, { productId: meja.json.id, warehouseId: whUtama.id, qty: 2 });
  check("viewer DITOLAK membuat perintah produksi (403)", viewerOrder.status === 403);

  const ord1 = await owner("POST", `/api/tenants/${tenantId}/production-orders`, { productId: meja.json.id, warehouseId: whUtama.id, qty: 4 });
  check("buat perintah produksi 4 unit 201", ord1.status === 201);

  const done1 = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/complete`);
  check("produksi selesai: biaya total 440rb, biaya/unit 110rb", done1.status === 200 && done1.json?.totalCost === 440_000 && done1.json?.unitCost === 110_000, `→ ${JSON.stringify(done1.json)}`);

  const stockProd = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const kayuAfter = stockProd.json?.levels?.find((l) => l.sku === "BHN-KAYU");
  const pakuAfter = stockProd.json?.levels?.find((l) => l.sku === "BHN-PAKU");
  const mejaUtama = stockProd.json?.levels?.find((l) => l.sku === "JADI-MEJA" && l.warehouseId === whUtama.id);
  check("bahan berkurang (kayu 12, paku 60), meja +4 @110k (nilai 440rb)", kayuAfter?.qty === 12 && pakuAfter?.qty === 60 && mejaUtama?.qty === 4 && mejaUtama?.value === 440_000, `→ ${JSON.stringify({ k: kayuAfter?.qty, p: pakuAfter?.qty, m: mejaUtama?.qty, v: mejaUtama?.value })}`);

  const tbAfterProd = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah produksi (netral nilai)", tbAfterProd.json?.balanced === true);

  const qcPass = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/qc`, { result: "passed" });
  check("QC luluskan hasil produksi 200", qcPass.status === 200);
  const ordListA = await owner("GET", `/api/tenants/${tenantId}/production-orders`);
  check("status QC menjadi lulus", ordListA.json?.orders?.find((o) => o.id === ord1.json.id)?.qcStatus === "passed");

  // Stok bahan tak cukup untuk 20 unit (butuh 40 kayu, tersedia 12).
  const ordBig = await owner("POST", `/api/tenants/${tenantId}/production-orders`, { productId: meja.json.id, warehouseId: whUtama.id, qty: 20 });
  const doneBig = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ordBig.json.id}/complete`);
  check("produksi melebihi stok bahan DITOLAK 400", doneBig.status === 400);

  // Produksi lagi 2 unit lalu karantina ke gudang kedua.
  const ord2 = await owner("POST", `/api/tenants/${tenantId}/production-orders`, { productId: meja.json.id, warehouseId: whUtama.id, qty: 2 });
  const done2 = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord2.json.id}/complete`);
  check("produksi 2 unit selesai (biaya 220rb)", done2.status === 200 && done2.json?.totalCost === 220_000);

  const qcQuar = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord2.json.id}/qc`, { result: "quarantined", warehouseId: wh2.json.id });
  check("QC karantina memindahkan hasil ke gudang kedua 200", qcQuar.status === 200);

  const stockQc = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const mejaUtama2 = stockQc.json?.levels?.find((l) => l.sku === "JADI-MEJA" && l.warehouseId === whUtama.id);
  const mejaWh2 = stockQc.json?.levels?.find((l) => l.sku === "JADI-MEJA" && l.warehouseId === wh2.json.id);
  check("karantina: meja gudang utama 4, gudang karantina 2", mejaUtama2?.qty === 4 && mejaWh2?.qty === 2, `→ ${JSON.stringify({ u: mejaUtama2?.qty, q: mejaWh2?.qty })}`);

  const tbAfterQc = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah karantina QC", tbAfterQc.json?.balanced === true);

  // --- Maintenance / servis aset (Fase 2v) ---------------------------------------
  // Aset & jurnal bertanggal Agustus (di luar jendela arus kas Juli, setelah kunci 10 Jul).
  console.log("11p. Maintenance / servis aset (jadwal, work order, biaya)");

  const genset = await owner("POST", `/api/tenants/${tenantId}/assets`, { name: "Genset Pabrik", category: "Mesin", acquisitionDate: "2026-08-01", acquisitionCost: 24_000_000, usefulLifeMonths: 48, residualValue: 0, cashAccountId: kas.id });
  check("daftarkan aset untuk servis 201", genset.status === 201);

  const viewerSch = await viewer("POST", `/api/tenants/${tenantId}/maintenance/schedules`, { assetId: genset.json.id, name: "x servis", intervalMonths: 1, startDate: "2026-08-05" });
  check("viewer DITOLAK membuat jadwal servis (403)", viewerSch.status === 403);

  const sch = await owner("POST", `/api/tenants/${tenantId}/maintenance/schedules`, { assetId: genset.json.id, name: "Servis rutin bulanan", intervalMonths: 1, startDate: "2026-08-05" });
  check("buat jadwal servis 201", sch.status === 201, `→ ${JSON.stringify(sch.json)}`);

  const gen1 = await owner("POST", `/api/tenants/${tenantId}/maintenance/run`, { date: "2026-08-05" });
  check("terbitkan servis jatuh tempo 5 Agu: 1 work order", gen1.status === 200 && gen1.json?.generated === 1, `→ ${JSON.stringify(gen1.json)}`);

  const gen1b = await owner("POST", `/api/tenants/${tenantId}/maintenance/run`, { date: "2026-08-05" });
  check("terbitkan ulang tanggal sama: 0 work order (belum jatuh tempo)", gen1b.json?.generated === 0);

  const schList = await owner("GET", `/api/tenants/${tenantId}/maintenance/schedules`);
  check("tanggal servis berikutnya maju ke 2026-09-05", schList.json?.schedules?.find((s) => s.id === sch.json.id)?.nextDueDate === "2026-09-05");

  const woList1 = await owner("GET", `/api/tenants/${tenantId}/maintenance/work-orders`);
  const wo1 = woList1.json?.workOrders?.find((w) => w.assetId === genset.json.id && w.status === "open");
  check("work order otomatis terbit dari jadwal (terbuka)", Boolean(wo1) && wo1.title === "Servis rutin bulanan");

  const woNoAcc = await owner("POST", `/api/tenants/${tenantId}/maintenance/work-orders/${wo1.id}/complete`, { completedDate: "2026-08-20", cost: 500_000 });
  check("selesaikan work order berbiaya tanpa akun DITOLAK 400", woNoAcc.status === 400);

  const woDone = await owner("POST", `/api/tenants/${tenantId}/maintenance/work-orders/${wo1.id}/complete`, { completedDate: "2026-08-20", cost: 500_000, cashAccountId: kas.id, notes: "Ganti oli & filter" });
  check("selesaikan work order (biaya 500rb, jurnal beban) 200", woDone.status === 200 && woDone.json?.cost === 500_000);

  const woReDone = await owner("POST", `/api/tenants/${tenantId}/maintenance/work-orders/${wo1.id}/complete`, { completedDate: "2026-08-20", cost: 0 });
  check("menyelesaikan work order yang sudah selesai DITOLAK 409", woReDone.status === 409);

  const adhoc = await owner("POST", `/api/tenants/${tenantId}/maintenance/work-orders`, { assetId: genset.json.id, title: "Perbaikan mendadak", scheduledDate: "2026-08-25" });
  check("buat work order ad-hoc 201", adhoc.status === 201);
  const adhocDone = await owner("POST", `/api/tenants/${tenantId}/maintenance/work-orders/${adhoc.json.id}/complete`, { completedDate: "2026-08-26", cost: 0 });
  check("selesaikan work order tanpa biaya (tanpa jurnal) 200", adhocDone.status === 200);

  const accForBeban = (await owner("GET", `/api/tenants/${tenantId}/accounts`)).json?.accounts?.find((a) => a.code === "5-7000");
  const bebanLedger = await owner("GET", `/api/tenants/${tenantId}/ledger/${accForBeban.id}`);
  check("Beban Pemeliharaan tercatat 500rb di buku besar", bebanLedger.json?.balance === 500_000, `→ ${bebanLedger.json?.balance}`);

  const tbAfterMaint = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah servis aset", tbAfterMaint.json?.balanced === true);

  // --- Helpdesk / tiket dukungan (Fase 2w) ---------------------------------------
  console.log("11q. Helpdesk (tiket, prioritas/status, penugasan, balasan)");

  const viewerTicket = await viewer("POST", `/api/tenants/${tenantId}/tickets`, { contactId: customer.json.id, subject: "coba tiket", priority: "low" });
  check("viewer DITOLAK membuat tiket (403)", viewerTicket.status === 403);

  const badPrio = await owner("POST", `/api/tenants/${tenantId}/tickets`, { contactId: customer.json.id, subject: "Prioritas salah", priority: "kritis" });
  check("prioritas tidak dikenal DITOLAK 400", badPrio.status === 400);

  const ticket = await owner("POST", `/api/tenants/${tenantId}/tickets`, { contactId: customer.json.id, subject: "Aplikasi error saat cetak faktur", description: "Muncul layar putih saat klik cetak.", priority: "high" });
  check("buat tiket 201 (TKT-00001, status open)", ticket.status === 201 && ticket.json?.ticketNo === "TKT-00001", `→ ${JSON.stringify(ticket.json)}`);

  const tkList = await owner("GET", `/api/tenants/${tenantId}/tickets`);
  const tk1 = tkList.json?.tickets?.find((t) => t.id === ticket.json.id);
  check("tiket tampil di daftar (open, high, 0 balasan)", tk1?.status === "open" && tk1?.priority === "high" && tk1?.replyCount === 0);

  await owner("POST", `/api/tenants/${tenantId}/tickets/${ticket.json.id}/replies`, { body: "Terima kasih, kami sedang periksa.", internal: false });
  const noteRes = await owner("POST", `/api/tenants/${tenantId}/tickets/${ticket.json.id}/replies`, { body: "Reproduksi di Chrome versi lama.", internal: true });
  check("tambah balasan & catatan internal 201", noteRes.status === 201);

  const emptyReply = await owner("POST", `/api/tenants/${tenantId}/tickets/${ticket.json.id}/replies`, { body: "  " });
  check("balasan kosong DITOLAK 400", emptyReply.status === 400);

  const assignBad = await owner("PATCH", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`, { assignedTo: "bukan-anggota-xyz" });
  check("tugaskan ke non-anggota DITOLAK 400", assignBad.status === 400);

  const assignOk = await owner("PATCH", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`, { assignedTo: me.json.user.id });
  check("tugaskan ke anggota 200 (nama tersimpan)", assignOk.status === 200 && Boolean(assignOk.json?.ticket?.assignedName));

  await owner("PATCH", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`, { status: "in_progress" });
  const resolveRes = await owner("PATCH", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`, { status: "resolved" });
  check("ubah status ke selesai 200 (resolvedAt terisi)", resolveRes.status === 200 && Boolean(resolveRes.json?.ticket?.resolvedAt));

  const emptyUpdate = await owner("PATCH", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`, {});
  check("update tanpa perubahan DITOLAK 400", emptyUpdate.status === 400);

  const tkDetail = await owner("GET", `/api/tenants/${tenantId}/tickets/${ticket.json.id}`);
  check("detail tiket: 2 balasan (1 internal), status selesai", tkDetail.json?.replies?.length === 2 && tkDetail.json?.replies?.some((r) => r.internal === true) && tkDetail.json?.status === "resolved");

  const viewerReadTk = await viewer("GET", `/api/tenants/${tenantId}/tickets`);
  check("viewer boleh membaca daftar tiket (200)", viewerReadTk.status === 200);

  // --- Ekspor e-Faktur (Fase 2x) -------------------------------------------------
  // Faktur ber-PPN bertanggal setelah kunci 10 Jul; produk jasa (tanpa stok).
  console.log("11r. Ekspor e-Faktur (faktur keluaran ber-PPN)");

  const buyerPkp = await owner("POST", `/api/tenants/${tenantId}/contacts`, { type: "customer", name: "PT Kena Pajak", npwp: "0011223344556000" });
  check("buat pelanggan ber-NPWP 201", buyerPkp.status === 201);

  const efInv = await owner("POST", `/api/tenants/${tenantId}/invoices`, { contactId: buyerPkp.json.id, invoiceDate: "2026-07-16", taxRate: 11, warehouseId: whUtama.id, lines: [{ productId: svc.json.id, qty: 2, unitPrice: 1_000_000 }] });
  check("faktur ber-PPN 11% diposting (total 2.220.000)", efInv.status === 201 && efInv.json?.total === 2_220_000, `→ ${JSON.stringify(efInv.json)}`);

  const badEf = await owner("GET", `/api/tenants/${tenantId}/reports/efaktur?from=x&to=2026-07-31`);
  check("parameter tanggal salah DITOLAK 400", badEf.status === 400);

  const viewerEf = await viewer("GET", `/api/tenants/${tenantId}/reports/efaktur?from=2026-07-01&to=2026-07-31`);
  check("viewer boleh membaca ekspor e-Faktur (200)", viewerEf.status === 200);

  const ef = await owner("GET", `/api/tenants/${tenantId}/reports/efaktur?from=2026-07-01&to=2026-07-31`);
  const efRow = ef.json?.rows?.find((r) => r.invoiceNo === efInv.json.docNo);
  check("baris e-Faktur: DPP 2jt, PPN 220rb, NPWP & nama pembeli benar",
    efRow?.dpp === 2_000_000 && efRow?.ppn === 220_000 && efRow?.buyerNpwp === "0011223344556000" && efRow?.buyerName === "PT Kena Pajak",
    `→ ${JSON.stringify(efRow)}`);
  check("hanya faktur ber-PPN yang diekspor (semua PPN > 0)", ef.json?.rows?.length > 0 && ef.json.rows.every((r) => r.ppn > 0 && r.dpp > 0));
  check("total e-Faktur = penjumlahan baris (invariant)",
    ef.json?.totalDpp === ef.json.rows.reduce((s, r) => s + r.dpp, 0) &&
    ef.json?.totalPpn === ef.json.rows.reduce((s, r) => s + r.ppn, 0));

  const efEmpty = await owner("GET", `/api/tenants/${tenantId}/reports/efaktur?from=2027-01-01&to=2027-01-31`);
  check("periode tanpa faktur ber-PPN: kosong", efEmpty.json?.rows?.length === 0 && efEmpty.json?.totalPpn === 0);

  // --- Void dokumen, edit master data & rename akun (Fase 3b) ---------------------
  // Semua dokumen bertanggal Agustus 2026: setelah kunci buku 10 Jul dan di luar
  // jendela asersi arus kas/laba-rugi Juli, jadi angka lama tidak terganggu.
  console.log("11s. Void dokumen, edit master data & rename akun");

  // Edit master data (PUT) + guard duplikat kolom unik.
  const vdProd1 = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "VD-001", name: "Kopi Robusta 1kg", unit: "pcs", sellPrice: 80_000, buyPrice: 50_000,
  });
  check("produk VD-001 dibuat", vdProd1.status === 201);

  const vdEdit = await owner("PUT", `/api/tenants/${tenantId}/products/${vdProd1.json.id}`, {
    sku: "VD-001", name: "Kopi Robusta Premium 1kg", unit: "pcs", sellPrice: 85_000, buyPrice: 50_000,
  });
  check("edit produk (PUT) 200", vdEdit.status === 200);
  const vdItems = await owner("GET", `/api/tenants/${tenantId}/products`);
  const vdRow = vdItems.json?.items?.find((p) => p.sku === "VD-001");
  check("perubahan tersimpan (nama & harga jual baru)", vdRow?.name === "Kopi Robusta Premium 1kg" && vdRow?.sell_price === 85_000);

  const vdDup = await owner("PUT", `/api/tenants/${tenantId}/products/${vdProd1.json.id}`, {
    sku: "BRG-002", name: "Coba tabrak SKU", unit: "pcs", sellPrice: 1, buyPrice: 1,
  });
  check("edit ke SKU milik produk lain DITOLAK 409", vdDup.status === 409);
  const vdEdit404 = await owner("PUT", `/api/tenants/${tenantId}/products/${crypto.randomUUID()}`, {
    sku: "VD-404", name: "Tidak ada", unit: "pcs", sellPrice: 1, buyPrice: 1,
  });
  check("edit produk yang tidak ada DITOLAK 404", vdEdit404.status === 404);
  const vdEditViewer = await viewer("PUT", `/api/tenants/${tenantId}/products/${vdProd1.json.id}`, {
    sku: "VD-001", name: "Viewer usil", unit: "pcs", sellPrice: 1, buyPrice: 1,
  });
  check("viewer DITOLAK mengedit produk (403)", vdEditViewer.status === 403);
  const vdWhDup = await owner("PUT", `/api/tenants/${tenantId}/warehouses/${wh2.json.id}`, {
    code: "UTAMA", name: "Gudang Cabang",
  });
  check("edit kode gudang menabrak kode lain DITOLAK 409", vdWhDup.status === 409);

  // Rename akun (nama saja; kode & tipe terkunci).
  const vdRename = await owner("PATCH", `/api/tenants/${tenantId}/accounts/${kasAcc.id}`, { name: "Kas Utama" });
  const vdAccs = await owner("GET", `/api/tenants/${tenantId}/accounts`);
  check(
    "rename akun 1-1000 → 'Kas Utama' (kode tetap)",
    vdRename.status === 200 && vdAccs.json?.accounts?.find((a) => a.code === "1-1000")?.name === "Kas Utama",
  );
  const vdRenameBad = await owner("PATCH", `/api/tenants/${tenantId}/accounts/${kasAcc.id}`, { name: "x" });
  check("rename dengan nama terlalu pendek DITOLAK 400", vdRenameBad.status === 400);
  const vdRenameViewer = await viewer("PATCH", `/api/tenants/${tenantId}/accounts/${kasAcc.id}`, { name: "Kas Viewer" });
  check("viewer DITOLAK me-rename akun (403)", vdRenameViewer.status === 403);
  const vdRename404 = await owner("PATCH", `/api/tenants/${tenantId}/accounts/${crypto.randomUUID()}`, { name: "Tidak Ada" });
  check("rename akun yang tidak ada DITOLAK 404", vdRename404.status === 404);

  // Void faktur penjualan: jurnal pembalik + stok kembali persis + outstanding hilang.
  const vdAgingArBefore = (await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=receivable`)).json?.grandTotal ?? 0;
  const vdPlBefore = (await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-08-01&to=2026-08-31`)).json;

  const vdPurchA = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-08-01", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 20, unitPrice: 50_000 }],
  });
  check("beli 20 pcs VD-001 (1.000.000)", vdPurchA.status === 201 && vdPurchA.json?.total === 1_000_000);

  const vdInvB = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-02", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 5, unitPrice: 80_000 }],
  });
  check("jual 5 pcs VD-001 (total 444.000)", vdInvB.status === 201 && vdInvB.json?.total === 444_000, `→ ${JSON.stringify(vdInvB.json)}`);
  const vdStock1 = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check("stok VD-001 turun ke 15", vdStock1.json?.levels?.find((l) => l.sku === "VD-001")?.qty === 15);
  const vdAgingArMid = (await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=receivable`)).json?.grandTotal ?? 0;
  check("piutang bertambah 444.000", vdAgingArMid === vdAgingArBefore + 444_000, `→ ${vdAgingArMid}`);

  const vdVoidViewer = await viewer("POST", `/api/tenants/${tenantId}/invoices/${vdInvB.json.id}/void`);
  check("viewer DITOLAK membatalkan faktur (403)", vdVoidViewer.status === 403);

  const vdVoidB = await owner("POST", `/api/tenants/${tenantId}/invoices/${vdInvB.json.id}/void`);
  check("void faktur 200 + jurnal pembalik", vdVoidB.status === 200 && Boolean(vdVoidB.json?.reversalEntryNo), `→ ${JSON.stringify(vdVoidB.json)}`);

  const vdStock2 = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const vdLevel2 = vdStock2.json?.levels?.find((l) => l.sku === "VD-001");
  check("stok VD-001 kembali 20 pcs @50.000 (nilai 1.000.000)", vdLevel2?.qty === 20 && vdLevel2?.avgCost === 50_000 && vdLevel2?.value === 1_000_000, `→ ${JSON.stringify(vdLevel2)}`);

  const vdDocsB = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  check("faktur ditandai voidedAt", vdDocsB.json?.docs?.find((d) => d.id === vdInvB.json.id)?.voidedAt != null);
  const vdAgingArAfter = (await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=receivable`)).json?.grandTotal ?? 0;
  check("piutang kembali seperti sebelum faktur", vdAgingArAfter === vdAgingArBefore, `→ ${vdAgingArAfter} vs ${vdAgingArBefore}`);
  const vdPlAfter = (await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-08-01&to=2026-08-31`)).json;
  check(
    "laba rugi Agustus kembali persis (pendapatan & HPP terbalik penuh)",
    vdPlAfter?.totalIncome === vdPlBefore?.totalIncome && vdPlAfter?.totalExpense === vdPlBefore?.totalExpense && vdPlAfter?.netProfit === vdPlBefore?.netProfit,
    `→ ${JSON.stringify({ before: vdPlBefore?.netProfit, after: vdPlAfter?.netProfit })}`,
  );
  const vdTb1 = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah void faktur", vdTb1.json?.balanced === true);

  const vdVoidAgain = await owner("POST", `/api/tenants/${tenantId}/invoices/${vdInvB.json.id}/void`);
  check("void dua kali DITOLAK 400", vdVoidAgain.status === 400);
  const vdPayVoided = await owner("POST", `/api/tenants/${tenantId}/payments`, {
    refType: "invoice", refId: vdInvB.json.id, accountId: kasAcc.id, amount: 1000, paymentDate: "2026-08-05",
  });
  check("bayar dokumen void DITOLAK 400", vdPayVoided.status === 400);
  const vdReturnVoided = await owner("POST", `/api/tenants/${tenantId}/returns`, {
    refType: "invoice", refId: vdInvB.json.id, warehouseId: whUtama.id, returnDate: "2026-08-05",
    lines: [{ productId: vdProd1.json.id, qty: 1 }],
  });
  check("retur dokumen void DITOLAK 400", vdReturnVoided.status === 400);

  const vdVoidPaid = await owner("POST", `/api/tenants/${tenantId}/invoices/${invoice.json.id}/void`);
  check("void faktur TERBAYAR DITOLAK 400", vdVoidPaid.status === 400);
  const vdVoidReturned = await owner("POST", `/api/tenants/${tenantId}/invoices/${inv2.json.id}/void`);
  check("void faktur yang punya retur DITOLAK 400", vdVoidReturned.status === 400);
  const vdVoid404 = await owner("POST", `/api/tenants/${tenantId}/invoices/${crypto.randomUUID()}/void`);
  check("void dokumen yang tidak ada DITOLAK 404", vdVoid404.status === 404);

  // Void pembelian: hanya bila stok dari pembelian itu belum bergerak.
  const vdProd2 = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "VD-002", name: "Gula Aren 500g", unit: "pcs", sellPrice: 90_000, buyPrice: 60_000,
  });
  const vdAgingApBefore = (await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=payable`)).json?.grandTotal ?? 0;
  const vdPurchC = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-08-03", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: vdProd2.json.id, qty: 10, unitPrice: 60_000 }],
  });
  check("beli 10 pcs VD-002 (666.000)", vdPurchC.status === 201 && vdPurchC.json?.total === 666_000);

  const vdVoidC = await owner("POST", `/api/tenants/${tenantId}/purchases/${vdPurchC.json.id}/void`);
  check("void pembelian (stok utuh) 200", vdVoidC.status === 200 && Boolean(vdVoidC.json?.reversalEntryNo), `→ ${JSON.stringify(vdVoidC.json)}`);
  const vdStock3 = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check("stok VD-002 kembali 0", (vdStock3.json?.levels?.find((l) => l.sku === "VD-002")?.qty ?? 0) === 0);
  const vdAgingApAfter = (await owner("GET", `/api/tenants/${tenantId}/reports/aging?type=payable`)).json?.grandTotal ?? 0;
  check("hutang kembali seperti sebelum pembelian", vdAgingApAfter === vdAgingApBefore);
  const vdTb2 = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah void pembelian", vdTb2.json?.balanced === true);

  const vdPurchD = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-08-03", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd2.json.id, qty: 10, unitPrice: 60_000 }],
  });
  const vdInvE = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-04", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd2.json.id, qty: 2, unitPrice: 90_000 }],
  });
  check("pembelian D & penjualan E diposting", vdPurchD.status === 201 && vdInvE.status === 201);
  const vdVoidD = await owner("POST", `/api/tenants/${tenantId}/purchases/${vdPurchD.json.id}/void`);
  check("void pembelian yang stoknya SUDAH BERGERAK ditolak 400", vdVoidD.status === 400, `→ ${JSON.stringify(vdVoidD.json)}`);
  const vdVoidE = await owner("POST", `/api/tenants/${tenantId}/invoices/${vdInvE.json.id}/void`);
  const vdStock4 = await owner("GET", `/api/tenants/${tenantId}/stock`);
  check("void penjualan E: stok VD-002 kembali 10", vdVoidE.status === 200 && vdStock4.json?.levels?.find((l) => l.sku === "VD-002")?.qty === 10);

  // Produk berpelacakan lot/kedaluwarsa: void pembelian diarahkan ke retur.
  const vdProdExp = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "VD-EXP", name: "Susu UHT 1L", unit: "pcs", sellPrice: 20_000, buyPrice: 10_000, trackExpiry: true,
  });
  const vdPurchF = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-08-05", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProdExp.json.id, qty: 5, unitPrice: 10_000, expiryDate: "2027-01-01" }],
  });
  check("pembelian produk ber-lot diposting", vdPurchF.status === 201);
  const vdVoidF = await owner("POST", `/api/tenants/${tenantId}/purchases/${vdPurchF.json.id}/void`);
  check("void pembelian produk ber-lot DITOLAK 400 (pakai retur)", vdVoidF.status === 400);

  // Void menghormati tutup buku: kunci maju ke 10 Agustus lalu coba batalkan
  // dokumen bertanggal 5 Agustus → jurnal pembalik tertolak periode terkunci.
  const vdInvG = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-05", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 1, unitPrice: 80_000 }],
  });
  check("faktur G (5 Agu) diposting", vdInvG.status === 201);
  const vdClose = await owner("POST", `/api/tenants/${tenantId}/close-books`, { date: "2026-08-10" });
  check("tutup buku maju ke 2026-08-10", vdClose.status === 200);
  const vdVoidLocked = await owner("POST", `/api/tenants/${tenantId}/invoices/${vdInvG.json.id}/void`);
  check(
    "void dokumen di periode TERKUNCI ditolak 400 + saran retur",
    vdVoidLocked.status === 400 && String(vdVoidLocked.json?.error ?? "").includes("Retur"),
    `→ ${JSON.stringify(vdVoidLocked.json)}`,
  );
  const vdTb3 = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang di akhir seksi void", vdTb3.json?.balanced === true);

  // --- Pencarian & pagination (Fase 3c) --------------------------------------------
  console.log("11t. Pencarian & pagination (master data, dokumen, jurnal)");

  const searchVd = await owner("GET", `/api/tenants/${tenantId}/products?q=VD-`);
  check(
    "cari produk ?q=VD- → 3 hasil, semua ber-SKU VD-",
    searchVd.status === 200 && searchVd.json?.total === 3 && searchVd.json.items.every((p) => p.sku.startsWith("VD-")),
    `→ total ${searchVd.json?.total}`,
  );
  const searchWildcard = await owner("GET", `/api/tenants/${tenantId}/products?q=${encodeURIComponent("%")}`);
  check("wildcard '%' dicari sebagai literal (0 hasil)", searchWildcard.status === 200 && searchWildcard.json?.total === 0);

  const page1 = await owner("GET", `/api/tenants/${tenantId}/products?limit=2`);
  const page2 = await owner("GET", `/api/tenants/${tenantId}/products?limit=2&offset=2`);
  check(
    "pagination produk: limit=2 memberi 2 baris, offset=2 memberi baris berbeda, total konsisten",
    page1.json?.items?.length === 2 &&
      page1.json?.total > 2 &&
      page2.json?.items?.length === 2 &&
      page1.json.items[0].id !== page2.json.items[0].id &&
      page2.json.total === page1.json.total,
  );
  const bigLimit = await owner("GET", `/api/tenants/${tenantId}/products?limit=9999`);
  check("limit di-clamp maksimal 500", bigLimit.status === 200 && bigLimit.json?.limit === 500);

  const searchContact = await owner("GET", `/api/tenants/${tenantId}/contacts?q=Kena Pajak`);
  check(
    "cari kontak ?q=Kena Pajak → PT Kena Pajak ditemukan",
    searchContact.status === 200 && searchContact.json?.total === 1 && searchContact.json.items[0]?.name === "PT Kena Pajak",
  );

  const searchInv = await owner("GET", `/api/tenants/${tenantId}/invoices?q=INV-00001`);
  check(
    "cari faktur ?q=INV-00001 → tepat 1 dokumen",
    searchInv.status === 200 && searchInv.json?.total === 1 && searchInv.json.docs[0]?.docNo === "INV-00001",
    `→ ${JSON.stringify({ total: searchInv.json?.total })}`,
  );
  const searchInvByContact = await owner("GET", `/api/tenants/${tenantId}/invoices?q=${encodeURIComponent("Kena Pajak")}`);
  check(
    "cari faktur berdasarkan nama kontak → semua milik PT Kena Pajak",
    searchInvByContact.json?.total >= 1 && searchInvByContact.json.docs.every((d) => d.contactName === "PT Kena Pajak"),
  );
  const invPage = await owner("GET", `/api/tenants/${tenantId}/invoices?limit=1`);
  check("pagination faktur: limit=1 → 1 dokumen, total > 1", invPage.json?.docs?.length === 1 && invPage.json?.total > 1);

  const searchJrn = await owner("GET", `/api/tenants/${tenantId}/journal-entries?q=Pembatalan`);
  check(
    "cari jurnal ?q=Pembatalan → ≥3 jurnal pembalik void, semuanya cocok",
    searchJrn.status === 200 &&
      searchJrn.json?.total >= 3 &&
      searchJrn.json.entries.every((e) => (e.memo ?? "").includes("Pembatalan")),
    `→ total ${searchJrn.json?.total}`,
  );
  const jrnPage = await owner("GET", `/api/tenants/${tenantId}/journal-entries?limit=1&offset=1`);
  check("pagination jurnal: limit=1&offset=1 → 1 entri, total banyak", jrnPage.json?.entries?.length === 1 && jrnPage.json?.total > 1);

  const viewerSearch = await viewer("GET", `/api/tenants/${tenantId}/products?q=VD-001`);
  check("viewer boleh mencari (200)", viewerSearch.status === 200 && viewerSearch.json?.total === 1);

  // Alur nyata: temukan produk lewat pencarian → langsung difakturkan.
  const foundProduct = viewerSearch.json?.items?.[0] ?? searchVd.json.items.find((p) => p.sku === "VD-001");
  const invFromSearch = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id,
    invoiceDate: "2026-08-15",
    taxRate: 0,
    warehouseId: whUtama.id,
    lines: [{ productId: foundProduct.id, qty: 1, unitPrice: 80_000 }],
  });
  check("faktur dengan produk hasil pencarian diposting (80.000)", invFromSearch.status === 201 && invFromSearch.json?.total === 80_000, `→ ${JSON.stringify(invFromSearch.json)}`);
  const tbAfterSearchFlow = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur pencarian→faktur", tbAfterSearchFlow.json?.balanced === true);

  // --- Diskon per baris, stok menipis & notifikasi, logo kop (Fase 3d) -------------
  console.log("11u. Diskon per baris, notifikasi stok menipis, & logo kop");

  // Diskon faktur penjualan: 4 × 100rb − 25% = 300rb; PPN 11% dari nilai setelah diskon.
  const duPlBefore = (await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-08-01&to=2026-08-31`)).json;
  const duInv = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-20", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 4, unitPrice: 100_000, discountPct: 25 }],
  });
  check("faktur berdiskon 25%: total 333.000 (300rb + PPN 33rb)", duInv.status === 201 && duInv.json?.total === 333_000, `→ ${JSON.stringify(duInv.json)}`);
  const duDocs = await owner("GET", `/api/tenants/${tenantId}/invoices?q=${duInv.json.docNo}`);
  const duLine = duDocs.json?.docs?.[0]?.lines?.[0];
  check("baris menyimpan diskon 25% & nilai 300.000", duLine?.discountPct === 25 && duLine?.amount === 300_000, `→ ${JSON.stringify(duLine)}`);
  const duPlAfter = (await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-08-01&to=2026-08-31`)).json;
  check(
    "laba rugi: pendapatan +300rb (setelah diskon) & HPP +200rb (4 × 50rb)",
    duPlAfter?.totalIncome === duPlBefore?.totalIncome + 300_000 && duPlAfter?.totalExpense === duPlBefore?.totalExpense + 200_000,
    `→ Δincome ${duPlAfter?.totalIncome - duPlBefore?.totalIncome}, Δexpense ${duPlAfter?.totalExpense - duPlBefore?.totalExpense}`,
  );

  // Diskon pembelian: persediaan masuk pada biaya setelah diskon.
  const duProd3 = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "VD-003", name: "Cokelat Bubuk 250g", unit: "pcs", sellPrice: 35_000, buyPrice: 20_000,
  });
  const duPurch = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-08-20", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: duProd3.json.id, qty: 10, unitPrice: 20_000, discountPct: 10 }],
  });
  check("pembelian berdiskon 10%: total 180.000", duPurch.status === 201 && duPurch.json?.total === 180_000);
  const duStock = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const duLevel = duStock.json?.levels?.find((l) => l.sku === "VD-003");
  check("stok VD-003 masuk 10 pcs @18.000 (nilai 180.000 = jurnal Persediaan)", duLevel?.qty === 10 && duLevel?.avgCost === 18_000 && duLevel?.value === 180_000, `→ ${JSON.stringify(duLevel)}`);
  const duTb = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah transaksi berdiskon", duTb.json?.balanced === true);

  const duBadDisc = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-20", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 1, unitPrice: 1000, discountPct: 150 }],
  });
  check("diskon > 100% DITOLAK 400", duBadDisc.status === 400);

  // Stok menipis: ambang minimum 15 > stok 10 → notifikasi muncul.
  const duMinStock = await owner("PUT", `/api/tenants/${tenantId}/products/${duProd3.json.id}`, {
    sku: "VD-003", name: "Cokelat Bubuk 250g", unit: "pcs", sellPrice: 35_000, buyPrice: 20_000, minStock: 15,
  });
  check("set ambang stok minimum lewat edit produk", duMinStock.status === 200);

  // Faktur lewat jatuh tempo (due date sudah lampau, belum dibayar).
  const duOverdue = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-20", dueDate: "2026-07-01", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 1, unitPrice: 80_000 }],
  });
  check("faktur jatuh tempo lampau diposting", duOverdue.status === 201);

  const duNotif = await owner("GET", `/api/tenants/${tenantId}/notifications`);
  check(
    "notifikasi stok menipis muncul (VD-003 sisa 10 ≤ ambang 15)",
    duNotif.status === 200 && duNotif.json?.notifications?.some((n) => n.type === "low_stock" && n.detail.includes("VD-003")),
    `→ ${JSON.stringify(duNotif.json?.notifications?.filter((n) => n.type === "low_stock"))}`,
  );
  check(
    "notifikasi faktur lewat jatuh tempo muncul",
    duNotif.json?.notifications?.some((n) => n.type === "overdue_invoice" && n.title.includes(duOverdue.json.docNo)),
  );
  check("count = jumlah notifikasi (konsisten)", duNotif.json?.count === duNotif.json?.notifications?.length);
  const duNotifViewer = await viewer("GET", `/api/tenants/${tenantId}/notifications`);
  check("viewer boleh membaca notifikasi (200)", duNotifViewer.status === 200);

  // Tren penjualan harian (grafik dashboard Fase 3e).
  const duTrend = await owner("GET", `/api/tenants/${tenantId}/reports/sales-daily?days=30`);
  check(
    "tren penjualan harian: 200, baris terurut & dalam jendela 30 hari",
    duTrend.status === 200 &&
      Array.isArray(duTrend.json?.rows) &&
      duTrend.json.rows.every((r) => r.date >= duTrend.json.from && r.total > 0 && r.count > 0),
    `→ ${JSON.stringify({ from: duTrend.json?.from, n: duTrend.json?.rows?.length })}`,
  );
  const duTrendClamp = await owner("GET", `/api/tenants/${tenantId}/reports/sales-daily?days=999`);
  check("parameter days di-clamp maksimal 90", duTrendClamp.json?.days === 90);
  const duTrendViewer = await viewer("GET", `/api/tenants/${tenantId}/reports/sales-daily`);
  check("viewer boleh membaca tren penjualan (200)", duTrendViewer.status === 200);

  // Logo kop: simpan data URL kecil di settings, tampil di cetakan.
  const duLogo = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const duSetLogo = await owner("PATCH", `/api/tenants/${tenantId}/settings`, { logoDataUrl: duLogo });
  const duSettings = await owner("GET", `/api/tenants/${tenantId}/settings`);
  check("logo tersimpan di settings tenant", duSetLogo.status === 200 && duSettings.json?.settings?.logo_data_url === duLogo);
  const duBadLogo = await owner("PATCH", `/api/tenants/${tenantId}/settings`, { logoDataUrl: "data:text/html;base64,PGI+" });
  check("format logo tidak dikenal DITOLAK 400", duBadLogo.status === 400);
  const duClearLogo = await owner("PATCH", `/api/tenants/${tenantId}/settings`, { logoDataUrl: "" });
  const duSettings2 = await owner("GET", `/api/tenants/${tenantId}/settings`);
  check("logo bisa dihapus (string kosong)", duClearLogo.status === 200 && duSettings2.json?.settings?.logo_data_url === "");

  // --- e-Faktur XML Coretax (Fase 3f) ----------------------------------------------
  console.log("11v. e-Faktur XML Coretax");

  // Pembeli ber-NPWP dengan karakter khusus XML di nama (uji escaping).
  const cxBuyer = await owner("POST", `/api/tenants/${tenantId}/contacts`, {
    type: "customer", name: "Toko Roti & Kopi <Nusantara>", npwp: "12.345.678.9-012.000",
    address: "Jl. Melati No. 5, Bandung",
  });
  const cxInv = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: cxBuyer.json.id, invoiceDate: "2026-08-21", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 2, unitPrice: 100_000, discountPct: 10 }],
  });
  check("faktur ber-NPWP diposting (180rb + PPN 19,8rb = 199.800)", cxInv.status === 201 && cxInv.json?.total === 199_800, `→ ${JSON.stringify(cxInv.json)}`);
  // Faktur tarif 12% penuh (barang mewah) → kode transaksi 01, DPP = harga penuh.
  const cxLux = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-08-21", taxRate: 12, warehouseId: whUtama.id,
    lines: [{ productId: vdProd1.json.id, qty: 1, unitPrice: 50_000 }],
  });
  check("faktur tarif 12% diposting (total 56.000)", cxLux.status === 201 && cxLux.json?.total === 56_000);

  const cxRes = await owner("GET", `/api/tenants/${tenantId}/reports/efaktur-xml?from=2026-08-01&to=2026-08-31`);
  const cxXml = cxRes.text ?? "";
  check("ekspor XML Coretax 200", cxRes.status === 200, `→ ${cxRes.status}`);
  check(
    "dokumen XML valid: deklarasi + root TaxInvoiceBulk + elemen wajib CustomDocMonthYear",
    cxXml.startsWith(`<?xml version="1.0" encoding="utf-8"?>`) &&
      cxXml.includes("<TaxInvoiceBulk") &&
      cxXml.trimEnd().endsWith("</TaxInvoiceBulk>") &&
      cxXml.includes("<CustomDocMonthYear/>"),
  );
  check(
    "TIN penjual 16 digit dari NPWP settings + SellerIDTKU berakhiran 000000",
    cxXml.includes("<TIN>0012345678901000</TIN>") && cxXml.includes("<SellerIDTKU>0012345678901000000000</SellerIDTKU>"),
  );

  // Potong per-faktur berdasarkan RefDesc untuk asersi per dokumen.
  const cxDocOf = (docNo) => cxXml.split("<TaxInvoice>").find((s) => s.includes(`<RefDesc>${docNo}</RefDesc>`));
  const cxDocA = cxDocOf(cxInv.json.docNo);
  check("faktur ber-NPWP ada di XML (RefDesc = nomor faktur)", Boolean(cxDocA));
  check("non-mewah memakai kode transaksi 04 (DPP nilai lain, PMK 131/2024)", cxDocA?.includes("<TrxCode>04</TrxCode>") === true);
  check(
    "TIN pembeli dinormalkan 16 digit + BuyerIDTKU",
    cxDocA?.includes("<BuyerTin>0123456789012000</BuyerTin>") === true &&
      cxDocA?.includes("<BuyerIDTKU>0123456789012000000000</BuyerIDTKU>") === true,
  );
  check("nama pembeli ter-escape XML", cxDocA?.includes("<BuyerName>Toko Roti &amp; Kopi &lt;Nusantara&gt;</BuyerName>") === true);
  check(
    "baris berdiskon: Price 100000, Qty 2, TotalDiscount 20000, TaxBase 180000",
    cxDocA?.includes("<Price>100000.00</Price>") === true &&
      cxDocA?.includes("<Qty>2</Qty>") === true &&
      cxDocA?.includes("<TotalDiscount>20000.00</TotalDiscount>") === true &&
      cxDocA?.includes("<TaxBase>180000.00</TaxBase>") === true,
  );
  check(
    "DPP nilai lain = 11/12 × TaxBase (165000) + VATRate 12 + PPN eksak 19800",
    cxDocA?.includes("<OtherTaxBase>165000.00</OtherTaxBase>") === true &&
      cxDocA?.includes("<VATRate>12</VATRate>") === true &&
      cxDocA?.includes("<VAT>19800.00</VAT>") === true,
  );

  const cxDocLux = cxDocOf(cxLux.json.docNo);
  check(
    "faktur tarif 12%: kode 01, OtherTaxBase = TaxBase penuh (50000), PPN 6000",
    cxDocLux?.includes("<TrxCode>01</TrxCode>") === true &&
      cxDocLux?.includes("<OtherTaxBase>50000.00</OtherTaxBase>") === true &&
      cxDocLux?.includes("<VAT>6000.00</VAT>") === true,
  );
  check("pembeli tanpa NPWP diekspor sebagai 16 digit nol", cxDocLux?.includes("<BuyerTin>0000000000000000</BuyerTin>") === true);

  const cxDocDisc = cxDocOf(duInv.json.docNo);
  check(
    "faktur diskon 25% dari 11u ikut ter-ekspor (OtherTaxBase 275000, VAT 33000)",
    cxDocDisc?.includes("<OtherTaxBase>275000.00</OtherTaxBase>") === true && cxDocDisc?.includes("<VAT>33000.00</VAT>") === true,
  );
  check("faktur VOID dikecualikan dari XML", !cxXml.includes(`<RefDesc>${vdInvB.json.docNo}</RefDesc>`));
  check("faktur non-PPN dikecualikan dari XML", !cxXml.includes(`<RefDesc>${duOverdue.json.docNo}</RefDesc>`));

  const cxViewer = await viewer("GET", `/api/tenants/${tenantId}/reports/efaktur-xml?from=2026-08-01&to=2026-08-31`);
  check("viewer boleh mengekspor XML (200)", cxViewer.status === 200);
  const cxBadDate = await owner("GET", `/api/tenants/${tenantId}/reports/efaktur-xml?from=2026-08&to=2026-08-31`);
  check("tanggal salah format DITOLAK 400", cxBadDate.status === 400);
  const cxNoNpwp = await viewer("GET", `/api/tenants/${regViewer.json.tenantId}/reports/efaktur-xml?from=2026-08-01&to=2026-08-31`);
  check(
    "tenant tanpa NPWP DITOLAK 400 dengan pesan jelas",
    cxNoNpwp.status === 400 && /NPWP/.test(cxNoNpwp.json?.error ?? ""),
    `→ ${JSON.stringify(cxNoNpwp.json)}`,
  );

  // --- Asisten AI (Fase 4e) ---------------------------------------------------------
  console.log("11w. Asisten AI (Workers AI)");
  // Kontrak degradasi anggun: di lingkungan tanpa binding AI (dev/CI, config
  // wrangler.dev.jsonc), endpoint WAJIB membalas 503 — di produksi 200.
  // RBAC & auth tetap deterministik di kedua lingkungan.
  const aiAnon = await fetch(`${BASE}/api/tenants/${tenantId}/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: "halo" }] }),
  });
  check("AI chat tanpa sesi DITOLAK 401", aiAnon.status === 401);
  const aiChat = await owner("POST", `/api/tenants/${tenantId}/ai/chat`, {
    messages: [{ role: "user", content: "Bagaimana cara ekspor XML Coretax?" }],
  });
  check(
    "AI chat membalas 200 (produksi) ATAU 503 (binding absen) — degradasi anggun",
    aiChat.status === 200 || aiChat.status === 503,
    `→ ${aiChat.status}`,
  );
  // 503 kini WAJIB membawa `detail` (alasan diagnosa — Fase 5a); di env smoke
  // (config tanpa binding) alasannya pasti binding-absent.
  check(
    "AI chat 503 menyertakan detail 'binding-absent'",
    aiChat.status === 200 || aiChat.json?.detail === "binding-absent",
    `→ ${JSON.stringify(aiChat.json)}`,
  );
  const aiJurnalViewer = await viewer("POST", `/api/tenants/${tenantId}/ai/jurnal`, { prompt: "bayar listrik 500 ribu dari kas" });
  check("viewer DITOLAK membuat draf jurnal AI (403)", aiJurnalViewer.status === 403);
  const aiJurnal = await owner("POST", `/api/tenants/${tenantId}/ai/jurnal`, { prompt: "bayar listrik 500 ribu dari kas" });
  check(
    "AI draf jurnal membalas 200/422 (produksi) ATAU 503 (binding absen)",
    [200, 422, 503].includes(aiJurnal.status),
    `→ ${aiJurnal.status}`,
  );
  check(
    "AI draf jurnal 503 menyertakan detail 'binding-absent'",
    aiJurnal.status !== 503 || aiJurnal.json?.detail === "binding-absent",
    `→ ${JSON.stringify(aiJurnal.json)}`,
  );

  // --- Arus kas (Fase 2b-1) -------------------------------------------------------
  console.log("12. Arus kas");
  // Konteks: modal 50jt (2/7) + penjualan tunai 2,5jt (3/7) + terima pembayaran 499,5rb (5/7)
  // + jurnal pasca tutup buku 1rb (15/7). Tidak ada kas keluar.
  const cf = await owner("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=2026-07-03&to=2026-07-31`);
  check(
    "arus kas: saldo awal 50jt, masuk 3.150.500, keluar 10rb, akhir 53.140.500",
    cf.status === 200 &&
      cf.json?.openingBalance === 50_000_000 &&
      cf.json?.totalIn === 3_150_500 &&
      cf.json?.totalOut === 10_000 &&
      cf.json?.closingBalance === 53_140_500,
    `→ ${JSON.stringify(cf.json && { o: cf.json.openingBalance, i: cf.json.totalIn, out: cf.json.totalOut, c: cf.json.closingBalance })}`,
  );

  // --- 2FA TOTP (Fase 2c) ---------------------------------------------------------
  console.log("13. Verifikasi dua langkah (2FA TOTP)");
  const setup = await owner("POST", "/api/auth/2fa/setup");
  check("setup 2FA memberi rahasia base32 + otpauth", setup.status === 200 && /^[A-Z2-7]{32}$/.test(setup.json?.secret ?? "") && (setup.json?.otpauthUrl ?? "").startsWith("otpauth://totp/"));

  const wrongEnable = await owner("POST", "/api/auth/2fa/enable", { code: "000000" });
  check("aktivasi dengan kode salah DITOLAK 400", wrongEnable.status === 400);

  const enable = await owner("POST", "/api/auth/2fa/enable", { code: totpNode(setup.json.secret) });
  check("aktivasi dengan kode benar 200", enable.status === 200);

  const meWith2fa = await owner("GET", "/api/auth/me");
  check("me menunjukkan totpEnabled", meWith2fa.json?.user?.totpEnabled === true);

  await owner("POST", "/api/auth/logout");
  const ownerAgain = makeClient();
  const loginNoCode = await ownerAgain("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
  });
  check(
    "login tanpa kode → 401 + twoFactorRequired",
    loginNoCode.status === 401 && loginNoCode.json?.twoFactorRequired === true,
  );
  const loginBadCode = await ownerAgain("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
    totpCode: "000000",
  });
  check("login dengan kode salah 401", loginBadCode.status === 401);
  const loginGood = await ownerAgain("POST", "/api/auth/login", {
    email: "budi@majujaya.co.id",
    password: "rahasia-kuat-123",
    totpCode: totpNode(setup.json.secret),
  });
  check("login password + kode benar 200", loginGood.status === 200);

  const disable2fa = await ownerAgain("POST", "/api/auth/2fa/disable", { code: totpNode(setup.json.secret) });
  check("nonaktifkan 2FA dengan kode benar 200", disable2fa.status === 200);
  // Pakai sesi baru (owner lama sudah logout) untuk sisa pengujian.
  owner = ownerAgain;

  // --- Siklus langganan: trial kedaluwarsa → past_due → baca-saja (Fase 2b-1) ------
  console.log("14. Siklus langganan (trial berakhir)");
  // Semua tenant dibuat dengan TRIAL_DAYS_OVERRIDE=0 → trial sudah lewat.
  const cron = await fetch(`${BASE}/__scheduled?cron=17+1+*+*+*`);
  check("cron trigger dieksekusi", cron.status === 200);

  const meAfterCron = await owner("GET", "/api/auth/me");
  check(
    "status tenant menjadi past_due setelah cron",
    meAfterCron.json?.memberships?.[0]?.tenantStatus === "past_due",
    `→ ${meAfterCron.json?.memberships?.[0]?.tenantStatus}`,
  );

  await new Promise((r) => setTimeout(r, 400));
  const trialMail = findInLogs(/subject="Masa trial .* telah berakhir"/);
  check("email pemberitahuan trial berakhir terkirim ke Owner", Boolean(trialMail));

  const readWhilePastDue = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("mode baca-saja: MEMBACA laporan tetap boleh (200)", readWhilePastDue.status === 200);

  const writeWhilePastDue = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "BRG-BLOKIR",
    name: "Tidak boleh masuk",
    unit: "pcs",
    sellPrice: 1,
    buyPrice: 1,
  });
  check("mode baca-saja: MENULIS ditolak 402", writeWhilePastDue.status === 402);

  // Akun comped kebal siklus trial: cron di atas TIDAK menurunkan tenant Dewi
  // (status 'active' tak pernah disentuh cron) dan menulis tetap boleh.
  const dewiMeAfterCron = await admin("GET", "/api/auth/me");
  check(
    "tenant comped TETAP active setelah cron trial-expiry",
    dewiMeAfterCron.json?.memberships?.find((m) => m.tenantId === dewiOwn?.tenantId)?.tenantStatus === "active",
  );
  const compedWrite = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/products`, {
    sku: "CMP-001", name: "Produk Akun Comped", unit: "pcs", sellPrice: 1000, buyPrice: 500,
  });
  check("tenant comped tetap BISA MENULIS setelah cron (201, bukan 402)", compedWrite.status === 201, `→ ${compedWrite.status}`);

  // --- Catat Transaksi / wizard pemula (Fase 5c) --------------------------------
  // Wizard di web membentuk jurnal 2 baris standar — kontraknya diuji di sini
  // pada tenant comped (tenant utama sudah baca-saja pasca-cron di atas).
  console.log("14b. Catat Transaksi (wizard pemula)");
  const dwAccounts = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/accounts`);
  const dwKas = dwAccounts.json?.accounts?.find((a) => a.code === "1-1000");
  const dwSewa = dwAccounts.json?.accounts?.find((a) => a.code === "5-3000");
  check("COA tenant comped punya Kas & Beban Sewa (kategori wizard terpetakan)", Boolean(dwKas && dwSewa));
  const wizardJournal = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/journal-entries`, {
    entryDate: new Date().toISOString().slice(0, 10),
    memo: "Sewa tempat",
    lines: [
      { accountId: dwSewa.id, debit: 750_000, credit: 0 },
      { accountId: dwKas.id, debit: 0, credit: 750_000 },
    ],
  });
  check("jurnal bentukan wizard (uang keluar → kategori) diposting 201", wizardJournal.status === 201, `→ ${JSON.stringify(wizardJournal.json)}`);
  const dwTb = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/trial-balance`);
  check(
    "neraca saldo tenant comped tetap seimbang setelah catatan wizard",
    dwTb.status === 200 && dwTb.json?.balanced === true,
    `→ ${JSON.stringify(dwTb.json && { d: dwTb.json.totalDebit, k: dwTb.json.totalCredit })}`,
  );

  // --- Logout -----------------------------------------------------------------
  console.log("15. Logout");
  const out = await owner("POST", "/api/auth/logout");
  check("logout 200", out.status === 200);
  const afterLogout = await owner("GET", "/api/auth/me");
  check("sesi dicabut setelah logout", afterLogout.status === 401);

  console.log(`\n${failures === 0 ? "SEMUA SMOKE TEST LULUS ✅" : `${failures} PEMERIKSAAN GAGAL ❌`}`);
} catch (err) {
  failures++;
  console.error("Smoke test error:", err);
} finally {
  child.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 1000));
  child.kill("SIGKILL");
}

process.exit(failures === 0 ? 0 : 1);
