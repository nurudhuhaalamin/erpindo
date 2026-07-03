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
    "../../wrangler.jsonc",
    "--port",
    String(PORT),
    "--persist-to",
    persistDir,
    "--show-interactive-dev-session=false",
    // Untuk memicu cron via /__scheduled dan menyimulasikan trial kedaluwarsa.
    "--test-scheduled",
    "--var",
    "TRIAL_DAYS_OVERRIDE:0",
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
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* respons bukan JSON */
    }
    return { status: res.status, json };
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
  check("COA template Indonesia tersemai (18 akun)", accountsRes.status === 200 && accounts.length === 18);
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
  const levelAfterLock = stockAfterLock.json?.levels?.find((l) => l.sku === "BRG-002");
  check("stok TIDAK berubah oleh faktur yang ditolak (tetap 7)", levelAfterLock?.qty === 7);

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

  // --- Arus kas (Fase 2b-1) -------------------------------------------------------
  console.log("12. Arus kas");
  // Konteks: modal 50jt (2/7) + penjualan tunai 2,5jt (3/7) + terima pembayaran 499,5rb (5/7)
  // + jurnal pasca tutup buku 1rb (15/7). Tidak ada kas keluar.
  const cf = await owner("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=2026-07-03&to=2026-07-31`);
  check(
    "arus kas: saldo awal 50jt, masuk 3.000.500, saldo akhir 53.000.500",
    cf.status === 200 &&
      cf.json?.openingBalance === 50_000_000 &&
      cf.json?.totalIn === 3_000_500 &&
      cf.json?.totalOut === 0 &&
      cf.json?.closingBalance === 53_000_500,
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
