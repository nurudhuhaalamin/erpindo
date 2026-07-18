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
    // Akun demo publik (Fase 10b): pool DB tenant lokal terbatas (6), jadi
    // perusahaan demo dites pada tenant comped yang sudah ada (Cabang Dewi —
    // status aktif permanen sehingga penolakan tulis = 403 role, bukan 402).
    "--var",
    "DEMO_TENANT_SLUG:cabang-dewi",
    // Admin platform (Fase 10e): email pemilik smoke (Budi) di-gate sebagai
    // admin platform; Dewi (comped) bukan admin → dipakai menguji 403.
    "--var",
    "PLATFORM_ADMIN_EMAILS:budi@majujaya.co.id",
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

  // --- Header keamanan (Fase 10h) ----------------------------------------------
  console.log("0a. Header keamanan");
  const secResp = await fetch(`${BASE}/api/health`);
  const csp = secResp.headers.get("content-security-policy") ?? "";
  check(
    "Content-Security-Policy hadir dengan default-src 'self' + object-src 'none'",
    csp.includes("default-src 'self'") && csp.includes("object-src 'none'") && csp.includes("frame-ancestors 'none'"),
    `→ ${csp.slice(0, 80)}`,
  );
  check("CSP TIDAK memaksa upgrade-insecure-requests (aman utk http lokal)", !csp.includes("upgrade-insecure-requests"));
  check("Referrer-Policy diset", (secResp.headers.get("referrer-policy") ?? "").includes("strict-origin"));
  check("Permissions-Policy membatasi kamera/mikrofon/lokasi", (secResp.headers.get("permissions-policy") ?? "").includes("camera"));

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

  // Fase 10b: sebelum perusahaan demo (slug DEMO_TENANT_SLUG) ada, tombol
  // "Lihat Demo" harus mendapat 404 yang jelas, bukan galat server.
  const demoTooEarly = await makeClient()("POST", "/api/auth/demo");
  check("demo 404 sebelum perusahaan demo di-seed", demoTooEarly.status === 404, `→ ${JSON.stringify(demoTooEarly.json)}`);
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

  // --- Kelola peran anggota (Fase 6a) ---------------------------------------------
  const ownerRow = members.json.members.find((m) => m.role === "owner");
  const viewerRow = members.json.members.find((m) => m.role === "viewer");

  const viewerChangeRole = await viewer("PATCH", `/api/tenants/${tenantId}/members/${ownerRow.userId}`, { role: "viewer" });
  check("viewer DITOLAK ubah peran anggota (403)", viewerChangeRole.status === 403);

  const promote = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerRow.userId}`, { role: "admin" });
  check("owner ubah peran anggota → admin 200", promote.status === 200 && promote.json?.role === "admin");
  const membersAfter = await owner("GET", `/api/tenants/${tenantId}/members`);
  check("peran anggota tersimpan sebagai admin", membersAfter.json?.members?.find((m) => m.userId === viewerRow.userId)?.role === "admin");
  const demoteBack = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerRow.userId}`, { role: "viewer" });
  check("owner kembalikan peran → viewer 200", demoteBack.status === 200);

  const selfDemote = await owner("PATCH", `/api/tenants/${tenantId}/members/${ownerRow.userId}`, { role: "admin" });
  check("turunkan pemilik terakhir DITOLAK 400", selfDemote.status === 400);
  const selfRemove = await owner("DELETE", `/api/tenants/${tenantId}/members/${ownerRow.userId}`);
  check("keluarkan diri sendiri DITOLAK 400", selfRemove.status === 400);
  const removeUnknown = await owner("DELETE", `/api/tenants/${tenantId}/members/user-tidak-ada`);
  check("keluarkan anggota tak dikenal DITOLAK 404", removeUnknown.status === 404);
  // Uji hapus 200 dilakukan di bawah memakai 'outsider' yang sudah terdaftar
  // (tanpa registrasi baru agar tidak menabrak rate-limit register).

  const outsider = makeClient();
  await outsider("POST", "/api/auth/register", {
    companyName: "CV Pihak Luar",
    name: "Orang Luar",
    email: "luar@contoh.com",
    password: "rahasia-luar-789",
  });
  const crossTenant = await outsider("GET", `/api/tenants/${tenantId}/settings`);
  check("NON-anggota DITOLAK akses tenant lain (403) — isolasi tenant", crossTenant.status === 403);

  // Uji hapus anggota 200 memakai 'outsider' yang sudah punya akun (tanpa registrasi
  // baru) — undang, terima, lalu keluarkan; jumlah anggota kembali ke 2.
  const inviteOutsider = await owner("POST", `/api/tenants/${tenantId}/invites`, { email: "luar@contoh.com", role: "viewer" });
  await outsider("POST", "/api/invites/accept", { token: inviteOutsider.json.inviteUrl.split("token=")[1] });
  const members3 = await owner("GET", `/api/tenants/${tenantId}/members`);
  check("anggota jadi 3 setelah undangan diterima", members3.json?.members?.length === 3);
  const outsiderRow = members3.json.members.find((m) => m.email === "luar@contoh.com");
  const removeOutsider = await owner("DELETE", `/api/tenants/${tenantId}/members/${outsiderRow.userId}`);
  check("owner keluarkan anggota 200", removeOutsider.status === 200);
  const members4 = await owner("GET", `/api/tenants/${tenantId}/members`);
  check("anggota kembali 2 setelah dikeluarkan", members4.json?.members?.length === 2);
  const outsiderAfterRemoval = await outsider("GET", `/api/tenants/${tenantId}/settings`);
  check("anggota yang dikeluarkan kehilangan akses (403)", outsiderAfterRemoval.status === 403);

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
  check("dashboard: memuat penjualan bulan lalu (untuk delta)", typeof dash.json?.salesLastMonth === "number");
  // KPI Laba Bulan Ini (Fase 12d): dari jurnal terposting, konsisten dengan laba rugi.
  check(
    "dashboard: laba bulan ini & bulan lalu (Fase 12d) berupa angka",
    typeof dash.json?.profitThisMonth === "number" && typeof dash.json?.profitLastMonth === "number",
    `→ ${JSON.stringify({ cur: dash.json?.profitThisMonth, prev: dash.json?.profitLastMonth })}`,
  );
  {
    // Konsistensi (bebas-jam): laba bulan ini di dashboard = netProfit laporan
    // laba rugi untuk bulan kalender berjalan.
    const now = new Date();
    const mFrom = `${now.toISOString().slice(0, 7)}-01`;
    const mTo = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
    const plCur = await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=${mFrom}&to=${mTo}`);
    check(
      "dashboard: laba bulan ini konsisten dengan laporan laba rugi",
      plCur.status === 200 && dash.json?.profitThisMonth === plCur.json?.netProfit,
      `→ dashboard ${dash.json?.profitThisMonth} vs L/R ${plCur.json?.netProfit}`,
    );
  }

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

  // --- POS lanjut (Fase 7a): multi metode bayar + split + tahan transaksi ---------
  console.log("11d2. POS lanjut (multi-bayar + tahan transaksi)");
  // Produk khusus POS, distok lewat pembelian September (di luar jendela arus kas Juli
  // & di luar asersi stok BRG-002), lalu dibayar tunai agar tak menyisakan hutang.
  const prodPos = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "POS-7A", name: "Produk POS", unit: "pcs", sellPrice: 150_000, buyPrice: 100_000,
  });
  const posBuy = await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-09-15", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: prodPos.json.id, qty: 5, unitPrice: 100_000 }],
  });
  await owner("POST", `/api/tenants/${tenantId}/payments`, {
    refType: "purchase", refId: posBuy.json.id, accountId: kas.id, amount: 500_000, paymentDate: "2026-09-15",
  });
  const shift2 = await owner("POST", `/api/tenants/${tenantId}/pos/shift/open`, { warehouseId: whUtama.id, openingCash: 0 });
  check("buka shift kedua (kas awal 0)", shift2.status === 201);
  // Split: tunai 100rb + QRIS 50rb untuk total 150rb → kembalian 0; hanya tunai masuk laci.
  const splitSale = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: shift2.json.id, taxRate: 0,
    payments: [{ method: "tunai", amount: 100_000 }, { method: "qris", amount: 50_000 }],
    lines: [{ productId: prodPos.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("penjualan split tunai+QRIS 201 (kembalian 0)", splitSale.status === 201 && splitSale.json?.total === 150_000 && splitSale.json?.change === 0, `→ ${JSON.stringify(splitSale.json)}`);
  const shift2State = await owner("GET", `/api/tenants/${tenantId}/pos/shift`);
  check("kas laci shift hanya porsi TUNAI (100rb, bukan 150rb)", shift2State.json?.shift?.expectedCash === 100_000, `→ ${shift2State.json?.shift?.expectedCash}`);
  const badOverpay = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: shift2.json.id, taxRate: 0,
    payments: [{ method: "qris", amount: 200_000 }],
    lines: [{ productId: prodPos.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("kembalian dari non-tunai DITOLAK 400", badOverpay.status === 400);
  const underPay2 = await owner("POST", `/api/tenants/${tenantId}/pos/sales`, {
    shiftId: shift2.json.id, taxRate: 0,
    payments: [{ method: "kartu", amount: 100_000 }],
    lines: [{ productId: prodPos.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("total pembayaran kurang DITOLAK 400", underPay2.status === 400);
  const hold1 = await owner("POST", `/api/tenants/${tenantId}/pos/held`, {
    shiftId: shift2.json.id, label: "Meja 3", cart: [{ productId: prodPos.json.id, qty: 2, unitPrice: 150_000 }], taxRate: 0,
  });
  check("tahan transaksi 201", hold1.status === 201);
  const heldList = await owner("GET", `/api/tenants/${tenantId}/pos/held?shiftId=${shift2.json.id}`);
  check("daftar tahan memuat 1 (Meja 3, 1 item)", heldList.json?.held?.length === 1 && heldList.json.held[0].label === "Meja 3" && heldList.json.held[0].cart?.length === 1, `→ ${JSON.stringify(heldList.json?.held)}`);
  const delHeld = await owner("DELETE", `/api/tenants/${tenantId}/pos/held/${hold1.json.id}`);
  check("hapus/panggil tahan 200", delHeld.status === 200);
  const viewerHold = await viewer("POST", `/api/tenants/${tenantId}/pos/held`, { shiftId: shift2.json.id, label: "X", cart: [{ productId: prodPos.json.id, qty: 1, unitPrice: 1 }] });
  check("viewer DITOLAK menahan transaksi (403)", viewerHold.status === 403);
  await owner("POST", `/api/tenants/${tenantId}/pos/shift/${shift2.json.id}/close`, { closingCash: 100_000 });
  const tbAfterPos2 = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah POS multi-bayar", tbAfterPos2.json?.balanced === true);

  // --- Penjualan bertahap (Fase 7b): SO → Surat Jalan (DO) → Faktur ---------------
  console.log("11d3. Penjualan bertahap (SO → Surat Jalan → Faktur)");
  // Produk & tanggal khusus (September) agar tak menyentuh asersi stok BRG-002 & arus kas Juli.
  const prodSo = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "SO-7B", name: "Produk Pesanan", unit: "pcs", sellPrice: 200_000, buyPrice: 120_000,
  });
  await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-09-16", taxRate: 0, warehouseId: whUtama.id,
    lines: [{ productId: prodSo.json.id, qty: 20, unitPrice: 120_000 }],
  });
  const soBody = {
    contactId: customer.json.id, orderDate: "2026-09-16", warehouseId: whUtama.id, taxRate: 11,
    lines: [{ productId: prodSo.json.id, qty: 5, unitPrice: 200_000 }],
  };
  const viewerSo = await viewer("POST", `/api/tenants/${tenantId}/sales-orders`, soBody);
  check("viewer DITOLAK membuat pesanan penjualan (403)", viewerSo.status === 403);
  const so1 = await owner("POST", `/api/tenants/${tenantId}/sales-orders`, soBody);
  check("buat pesanan penjualan 201 (SO bernomor)", so1.status === 201 && Boolean(so1.json?.soNo), `→ ${JSON.stringify(so1.json)}`);

  // Faktur sebelum surat jalan DITOLAK (harus dikirim dulu).
  const invBeforeDeliver = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/invoice`, { invoiceDate: "2026-09-20" });
  check("faktur sebelum surat jalan DITOLAK 409", invBeforeDeliver.status === 409, `→ ${invBeforeDeliver.status}`);

  // Uang muka (DP) 300rb via kas.
  const dp = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/down-payment`, {
    amount: 300_000, accountId: kas.id, paymentDate: "2026-09-17",
  });
  check("uang muka pesanan 200", dp.status === 200, `→ ${JSON.stringify(dp.json)}`);

  const stockBeforeDeliver = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const soStockPre = stockBeforeDeliver.json?.levels?.find((l) => l.sku === "SO-7B" && l.warehouseId === whUtama.id)?.qty;
  check("stok awal produk pesanan = 20 (dari pembelian)", soStockPre === 20, `→ ${soStockPre}`);

  // Surat jalan: stok KELUAR di sini (5 pcs) + jurnal HPP.
  const deliver = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/deliver`, { deliveryDate: "2026-09-18" });
  check("surat jalan (DO) 201 dengan nomor", deliver.status === 201 && Boolean(deliver.json?.doNo), `→ ${JSON.stringify(deliver.json)}`);
  const stockAfterDeliver = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const soStockDeliver = stockAfterDeliver.json?.levels?.find((l) => l.sku === "SO-7B" && l.warehouseId === whUtama.id)?.qty;
  check("stok BERKURANG 5 saat surat jalan (20 → 15)", soStockDeliver === 15, `→ ${soStockDeliver}`);

  // Pesanan terkirim tidak boleh dibatalkan.
  const cancelDelivered = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/cancel`, {});
  check("batalkan pesanan yang sudah dikirim DITOLAK 409", cancelDelivered.status === 409, `→ ${cancelDelivered.status}`);

  // Faktur dari pesanan terkirim: pendapatan diakui, stok TIDAK bergerak lagi (skipStock).
  const soInvoice = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/invoice`, { invoiceDate: "2026-09-20", dueDate: "2026-10-20" });
  check("faktur dari pesanan terkirim 201 (total 1.110.000 = 1jt + PPN 110rb)", soInvoice.status === 201 && soInvoice.json?.total === 1_110_000, `→ ${JSON.stringify(soInvoice.json)}`);
  const stockAfterInvoice = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const soStockInvoice = stockAfterInvoice.json?.levels?.find((l) => l.sku === "SO-7B" && l.warehouseId === whUtama.id)?.qty;
  check("stok TIDAK bergerak lagi saat faktur (tetap 15)", soStockInvoice === 15, `→ ${soStockInvoice}`);

  // Uang muka terpakai → faktur sebagian terbayar.
  const soInvList = await owner("GET", `/api/tenants/${tenantId}/invoices`);
  const soInvDoc = soInvList.json?.docs?.find((d) => d.docNo === soInvoice.json.invoiceNo);
  check("uang muka 300rb diterapkan ke faktur (paidAmount 300rb, status posted)", soInvDoc?.paidAmount === 300_000 && soInvDoc?.status === "posted", `→ ${JSON.stringify(soInvDoc && { p: soInvDoc.paidAmount, s: soInvDoc.status })}`);

  // Kirim ulang pesanan yang sudah difakturkan DITOLAK.
  const reDeliver = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so1.json.id}/deliver`, { deliveryDate: "2026-09-21" });
  check("kirim ulang pesanan yang sudah difakturkan DITOLAK 409", reDeliver.status === 409, `→ ${reDeliver.status}`);

  // Pesanan kedua yang masih terbuka boleh dibatalkan.
  const so2 = await owner("POST", `/api/tenants/${tenantId}/sales-orders`, soBody);
  const cancelOpen = await owner("POST", `/api/tenants/${tenantId}/sales-orders/${so2.json.id}/cancel`, {});
  check("batalkan pesanan terbuka 200", cancelOpen.status === 200, `→ ${cancelOpen.status}`);

  const soList = await owner("GET", `/api/tenants/${tenantId}/sales-orders`);
  const so1Row = soList.json?.orders?.find((o) => o.id === so1.json.id);
  check("daftar pesanan: SO pertama berstatus 'invoiced' + ada nomor faktur & surat jalan", so1Row?.status === "invoiced" && Boolean(so1Row?.invoiceNo) && Boolean(so1Row?.deliveryNo), `→ ${JSON.stringify(so1Row && { s: so1Row.status, inv: so1Row.invoiceNo, dl: so1Row.deliveryNo })}`);

  const tbAfterSo = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur penjualan bertahap", tbAfterSo.json?.balanced === true);

  // --- Stok lanjut (Fase 7c): barcode, multi-satuan, nomor seri, titik pesan ------
  console.log("11d4. Stok lanjut (barcode + UOM + nomor seri + titik pesan)");
  const prodSerial = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "SER-7C", name: "Mesin Espresso", unit: "unit", sellPrice: 12_000_000, buyPrice: 9_000_000,
    barcode: "8991234567890", uomSecondary: "dus", uomFactor: 6, trackSerial: true,
  });
  check("buat produk barcode + UOM + lacak seri 201", prodSerial.status === 201, `→ ${prodSerial.status}`);
  const lookup = await owner("GET", `/api/tenants/${tenantId}/products/lookup?barcode=8991234567890`);
  check("pindai barcode menemukan produk", lookup.status === 200 && lookup.json?.product?.id === prodSerial.json.id && lookup.json?.product?.sku === "SER-7C", `→ ${JSON.stringify(lookup.json?.product)}`);
  const lookupMiss = await owner("GET", `/api/tenants/${tenantId}/products/lookup?barcode=0000000000000`);
  check("pindai barcode tak dikenal → 404", lookupMiss.status === 404);

  const ser1 = await owner("POST", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`, { serialNo: "SN-0001" });
  check("tambah nomor seri SN-0001 201", ser1.status === 201);
  const serDup = await owner("POST", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`, { serialNo: "SN-0001" });
  check("nomor seri duplikat DITOLAK 409", serDup.status === 409);
  await owner("POST", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`, { serialNo: "SN-0002", note: "garansi 2 tahun" });
  const serList = await owner("GET", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`);
  check("daftar seri: 2 unit, keduanya tersedia", serList.json?.serials?.length === 2 && serList.json.serials.every((s) => s.status === "in_stock"), `→ ${JSON.stringify(serList.json?.serials?.map((s) => s.serialNo))}`);
  const serSold = await owner("PATCH", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials/${ser1.json.id}`, { status: "sold" });
  check("tandai seri terjual 200", serSold.status === 200);
  const serList2 = await owner("GET", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`);
  check("SN-0001 kini 'sold', 1 tersedia", serList2.json?.serials?.find((s) => s.serialNo === "SN-0001")?.status === "sold" && serList2.json.serials.filter((s) => s.status === "in_stock").length === 1);
  const serViewer = await viewer("POST", `/api/tenants/${tenantId}/products/${prodSerial.json.id}/serials`, { serialNo: "SN-X" });
  check("viewer DITOLAK menambah nomor seri (403)", serViewer.status === 403);

  // Titik pesan otomatis → usulan pembelian (produk baru, min_stock>0, tanpa stok).
  const prodReorder = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "RORDER-7C", name: "Filter Kertas V60", unit: "pak", sellPrice: 35_000, buyPrice: 20_000, minStock: 10,
  });
  const reorder = await owner("GET", `/api/tenants/${tenantId}/reorder-suggestions`);
  const roRow = reorder.json?.suggestions?.find((s) => s.sku === "RORDER-7C");
  check("usulan pembelian memuat produk di bawah titik pesan (usulan 20 = 2× ambang)", reorder.status === 200 && roRow?.suggestedQty === 20 && roRow?.qty === 0 && roRow?.shortfall === 10, `→ ${JSON.stringify(roRow)}`);
  const reorderViewer = await viewer("GET", `/api/tenants/${tenantId}/reorder-suggestions`);
  check("viewer boleh membaca usulan pembelian (200)", reorderViewer.status === 200);
  // Sambungkan ke Pengadaan: buat permintaan pembelian dari usulan.
  const roPr = await owner("POST", `/api/tenants/${tenantId}/requisitions`, {
    note: "Usulan otomatis titik pesan", lines: [{ productId: prodReorder.json.id, qty: roRow.suggestedQty }],
  });
  check("buat permintaan pembelian dari usulan 201", roPr.status === 201 && Boolean(roPr.json?.reqNo), `→ ${JSON.stringify(roPr.json)}`);

  // --- Pajak UMKM (Fase 7d): PPh Final 0,5% + PPh 23 + SPT Masa PPN ----------------
  console.log("11d5. Pajak UMKM (PPh Final + PPh 23 + SPT PPN)");
  // Masa Oktober terisolasi (tak ada transaksi lain) agar omzet/PPN deterministik.
  const prodTax = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "TAX-7D", name: "Produk Pajak", unit: "pcs", sellPrice: 200_000, buyPrice: 100_000,
  });
  await owner("POST", `/api/tenants/${tenantId}/purchases`, {
    contactId: supplier.json.id, invoiceDate: "2026-10-05", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: prodTax.json.id, qty: 10, unitPrice: 100_000 }],
  });
  const taxSale = await owner("POST", `/api/tenants/${tenantId}/invoices`, {
    contactId: customer.json.id, invoiceDate: "2026-10-06", taxRate: 11, warehouseId: whUtama.id,
    lines: [{ productId: prodTax.json.id, qty: 5, unitPrice: 200_000 }],
  });
  check("faktur PPN Oktober (DPP 1jt + PPN 110rb)", taxSale.status === 201 && taxSale.json?.total === 1_110_000);

  // PPh Final 0,5%.
  const pfPrev = await owner("GET", `/api/tenants/${tenantId}/tax/pph-final/preview?period=2026-10`);
  check("preview PPh Final: omzet 1jt → PPh 5.000", pfPrev.status === 200 && pfPrev.json?.omzet === 1_000_000 && pfPrev.json?.amount === 5_000, `→ ${JSON.stringify(pfPrev.json)}`);
  const pfViewer = await viewer("POST", `/api/tenants/${tenantId}/tax/pph-final`, { period: "2026-10", accountId: kas.id, paidDate: "2026-10-10" });
  check("viewer DITOLAK setor PPh Final (403)", pfViewer.status === 403);
  const pfPay = await owner("POST", `/api/tenants/${tenantId}/tax/pph-final`, { period: "2026-10", accountId: kas.id, paidDate: "2026-10-10" });
  check("setor PPh Final 201 (amount 5.000)", pfPay.status === 201 && pfPay.json?.amount === 5_000, `→ ${JSON.stringify(pfPay.json)}`);
  const pfDup = await owner("POST", `/api/tenants/${tenantId}/tax/pph-final`, { period: "2026-10", accountId: kas.id, paidDate: "2026-10-10" });
  check("setor PPh Final masa yang sama DITOLAK 409", pfDup.status === 409);
  const pfZero = await owner("POST", `/api/tenants/${tenantId}/tax/pph-final`, { period: "2026-11", accountId: kas.id, paidDate: "2026-11-10" });
  check("setor PPh Final masa tanpa omzet DITOLAK 400", pfZero.status === 400);

  // PPh 23 (bukti potong) + setor.
  const p23Viewer = await viewer("POST", `/api/tenants/${tenantId}/tax/pph23`, { contactId: supplier.json.id, taxDate: "2026-10-07", objectType: "jasa", gross: 10_000_000, rate: 2, sourceAccountId: kas.id });
  check("viewer DITOLAK membuat bukti potong (403)", p23Viewer.status === 403);
  const p23 = await owner("POST", `/api/tenants/${tenantId}/tax/pph23`, { contactId: supplier.json.id, taxDate: "2026-10-07", objectType: "jasa", gross: 10_000_000, rate: 2, sourceAccountId: kas.id });
  check("buat bukti potong PPh 23 (2% × 10jt = 200rb)", p23.status === 201 && p23.json?.amount === 200_000 && Boolean(p23.json?.docNo), `→ ${JSON.stringify(p23.json)}`);
  const p23Deposit = await owner("POST", `/api/tenants/${tenantId}/tax/pph23/${p23.json.id}/deposit`, { accountId: kas.id, depositDate: "2026-10-08" });
  check("setor PPh 23 200", p23Deposit.status === 200);
  const p23Redeposit = await owner("POST", `/api/tenants/${tenantId}/tax/pph23/${p23.json.id}/deposit`, { accountId: kas.id, depositDate: "2026-10-08" });
  check("setor ulang PPh 23 DITOLAK 409", p23Redeposit.status === 409);

  // SPT Masa PPN 1111 (masa Oktober terisolasi).
  const spt = await owner("GET", `/api/tenants/${tenantId}/tax/spt-ppn?period=2026-10`);
  check(
    "SPT Masa PPN Oktober: keluaran 110rb, masukan 110rb, netto 0",
    spt.status === 200 && spt.json?.totalOutputPpn === 110_000 && spt.json?.totalInputPpn === 110_000 && spt.json?.net === 0 && spt.json?.output?.length === 1 && spt.json?.input?.length === 1,
    `→ ${JSON.stringify(spt.json && { o: spt.json.totalOutputPpn, i: spt.json.totalInputPpn, net: spt.json.net })}`,
  );

  const tbAfterTax = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur pajak", tbAfterTax.json?.balanced === true);

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

  // --- Import pesanan marketplace (Fase 11e) — di tenant Dewi (aktif, terisolasi
  //     dari asersi angka tenant utama) ------------------------------------------
  const mpT = dewiCo.json.tenantId;
  const mpDate = new Date().toISOString().slice(0, 10);
  const mpWh = (await admin("GET", `/api/tenants/${mpT}/warehouses`)).json.items.find((w) => w.code === "UTAMA").id;
  const mpSupplier = await admin("POST", `/api/tenants/${mpT}/contacts`, { type: "supplier", name: "Pemasok MP" });
  const mpCust = await admin("POST", `/api/tenants/${mpT}/contacts`, { type: "customer", name: "Pembeli Shopee" });
  const mpProd = await admin("POST", `/api/tenants/${mpT}/products`, { sku: "MP-9Z", name: "Produk Marketplace", unit: "pcs", sellPrice: 50_000, buyPrice: 30_000 });
  await admin("POST", `/api/tenants/${mpT}/purchases`, {
    contactId: mpSupplier.json.id, invoiceDate: mpDate, taxRate: 0, warehouseId: mpWh,
    lines: [{ productId: mpProd.json.id, qty: 20, unitPrice: 30_000 }],
  });
  const mpBody = (rows) => ({ channel: "shopee", warehouseId: mpWh, contactId: mpCust.json.id, rows });
  const mpImport = await admin("POST", `/api/tenants/${mpT}/marketplace/import`, mpBody([
    { externalOrderNo: "SHP-9001", orderDate: mpDate, sku: "MP-9Z", qty: 2, unitPrice: 50_000 },
    { externalOrderNo: "SHP-9001", orderDate: mpDate, sku: "MP-9Z", qty: 1, unitPrice: 60_000 },
    { externalOrderNo: "SHP-9002", orderDate: mpDate, sku: "mp-9z", qty: 1, unitPrice: 50_000 },
  ]));
  check("import marketplace: 2 pesanan → 2 faktur (baris digabung, SKU case-insensitive)",
    mpImport.status === 200 && mpImport.json?.imported?.length === 2 && mpImport.json?.failed?.length === 0,
    `→ ${JSON.stringify({ imported: mpImport.json?.imported?.length, failed: mpImport.json?.failed })}`);
  const mpAgain = await admin("POST", `/api/tenants/${mpT}/marketplace/import`, mpBody([
    { externalOrderNo: "SHP-9001", orderDate: mpDate, sku: "MP-9Z", qty: 2, unitPrice: 50_000 },
    { externalOrderNo: "SHP-9002", orderDate: mpDate, sku: "MP-9Z", qty: 1, unitPrice: 50_000 },
  ]));
  check("re-import idempoten → 2 dilewati, 0 diimpor",
    mpAgain.json?.imported?.length === 0 && mpAgain.json?.skipped?.length === 2,
    `→ ${JSON.stringify({ imported: mpAgain.json?.imported?.length, skipped: mpAgain.json?.skipped?.length })}`);
  const mpBad = await admin("POST", `/api/tenants/${mpT}/marketplace/import`, mpBody([
    { externalOrderNo: "SHP-9003", orderDate: mpDate, sku: "SKU-TIDAK-ADA", qty: 1, unitPrice: 1_000 },
  ]));
  check("SKU tak dikenal → pesanan gagal (0 diimpor)",
    mpBad.json?.failed?.length === 1 && mpBad.json?.imported?.length === 0, `→ ${JSON.stringify(mpBad.json)}`);
  const mpNoSession = await fetch(`${BASE}/api/tenants/${mpT}/marketplace/import`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(mpBody([])),
  });
  check("impor marketplace tanpa sesi → 401", mpNoSession.status === 401, `→ HTTP ${mpNoSession.status}`);
  const mpOrders = await admin("GET", `/api/tenants/${mpT}/marketplace/orders`);
  check("daftar pesanan marketplace memuat SHP-9001 dengan nomor faktur",
    mpOrders.status === 200 && mpOrders.json?.orders?.some((o) => o.externalOrderNo === "SHP-9001" && o.invoiceNo),
    `→ ${JSON.stringify(mpOrders.json?.orders?.slice(0, 2))}`);

  // --- Template industri (Fase 11f) — di tenant Dewi (terisolasi) --------------
  const indTplRetail = await admin("POST", `/api/tenants/${mpT}/setup/industry-template`, { industry: "retail" });
  check("template industri retail: 5 produk + 2 kontak ditambahkan",
    indTplRetail.status === 200 && indTplRetail.json?.productsAdded === 5 && indTplRetail.json?.contactsAdded === 2,
    `→ ${JSON.stringify(indTplRetail.json)}`);
  const indTplAgain = await admin("POST", `/api/tenants/${mpT}/setup/industry-template`, { industry: "retail" });
  check("terapkan ulang template → idempoten (0 ditambahkan)",
    indTplAgain.json?.productsAdded === 0 && indTplAgain.json?.contactsAdded === 0, `→ ${JSON.stringify(indTplAgain.json)}`);
  const indTplBad = await admin("POST", `/api/tenants/${mpT}/setup/industry-template`, { industry: "tidak-ada" });
  check("jenis usaha tak dikenal → 400", indTplBad.status === 400, `→ HTTP ${indTplBad.status}`);
  const indTplViewer = await viewer("POST", `/api/tenants/${tenantId}/setup/industry-template`, { industry: "retail" });
  check("viewer DITOLAK menerapkan template (403)", indTplViewer.status === 403, `→ HTTP ${indTplViewer.status}`);

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

  // --- Pengadaan / procure-to-pay (Fase 6d): PR → PO → penerimaan → faktur --------
  console.log("11e2. Pengadaan (PR → PO → penerimaan → faktur pembelian)");
  // Produk khusus pengadaan (BRG-002 dipakai asersi stok=14 di bagian lain).
  const prodProc = await owner("POST", `/api/tenants/${tenantId}/products`, {
    sku: "PRC-001", name: "Barang Pengadaan", unit: "pcs", sellPrice: 40_000, buyPrice: 20_000,
  });

  const viewerReq = await viewer("POST", `/api/tenants/${tenantId}/requisitions`, {
    lines: [{ productId: prodProc.json.id, qty: 5 }],
  });
  check("viewer DITOLAK membuat permintaan (403)", viewerReq.status === 403);

  const req = await owner("POST", `/api/tenants/${tenantId}/requisitions`, {
    note: "Restok barang", lines: [{ productId: prodProc.json.id, qty: 5, note: "segera" }],
  });
  check("buat permintaan pembelian 201", req.status === 201 && Boolean(req.json?.reqNo));
  const badProdReq = await owner("POST", `/api/tenants/${tenantId}/requisitions`, {
    lines: [{ productId: "produk-tidak-ada", qty: 1 }],
  });
  check("permintaan produk tak dikenal 404", badProdReq.status === 404);
  const approveReq = await owner("PATCH", `/api/tenants/${tenantId}/requisitions/${req.json.id}`, { status: "approved" });
  check("setujui permintaan 200", approveReq.status === 200);

  const po = await owner("POST", `/api/tenants/${tenantId}/purchase-orders`, {
    requisitionId: req.json.id, contactId: supplier.json.id, orderDate: "2026-09-05",
    warehouseId: whUtama.id, taxRate: 0,
    lines: [{ productId: prodProc.json.id, qty: 5, unitPrice: 20_000 }],
  });
  check("buat pesanan dari permintaan 201", po.status === 201 && Boolean(po.json?.poNo));
  const reqAfterPo = await owner("GET", `/api/tenants/${tenantId}/requisitions`);
  check("permintaan jadi 'ordered' setelah dipesan", reqAfterPo.json?.requisitions?.find((r) => r.id === req.json.id)?.status === "ordered");
  const viewerPo = await viewer("POST", `/api/tenants/${tenantId}/purchase-orders`, {
    contactId: supplier.json.id, orderDate: "2026-09-05", warehouseId: whUtama.id, taxRate: 0,
    lines: [{ productId: prodProc.json.id, qty: 1, unitPrice: 1000 }],
  });
  check("viewer DITOLAK membuat pesanan (403)", viewerPo.status === 403);

  const poList = await owner("GET", `/api/tenants/${tenantId}/purchase-orders`);
  const poRow = poList.json?.orders?.find((o) => o.id === po.json.id);
  const poLineId = poRow?.lines?.[0]?.id;
  check("pesanan tampil dengan status 'ordered' + total", poRow?.status === "ordered" && poRow?.total === 100_000, `→ ${JSON.stringify(poRow?.total)}`);

  // Terima melebihi dipesan → 400.
  const overRecv = await owner("POST", `/api/tenants/${tenantId}/purchase-orders/${po.json.id}/receive`, {
    receiptDate: "2026-09-06", lines: [{ poLineId, qtyReceived: 99 }],
  });
  check("terima melebihi dipesan DITOLAK 400", overRecv.status === 400);
  // Terima penuh → faktur pembelian + stok masuk.
  const recv = await owner("POST", `/api/tenants/${tenantId}/purchase-orders/${po.json.id}/receive`, {
    receiptDate: "2026-09-06", lines: [{ poLineId, qtyReceived: 5 }],
  });
  check("terima barang → faktur pembelian 201", recv.status === 201 && Boolean(recv.json?.purchaseNo), `→ ${JSON.stringify(recv.json)}`);
  const dupRecv = await owner("POST", `/api/tenants/${tenantId}/purchase-orders/${po.json.id}/receive`, {
    receiptDate: "2026-09-06", lines: [{ poLineId, qtyReceived: 1 }],
  });
  check("terima pesanan yang sudah diterima DITOLAK 409", dupRecv.status === 409);
  const stockAfterProc = await owner("GET", `/api/tenants/${tenantId}/stock`);
  const barangQtyAfter = stockAfterProc.json?.levels?.find((l) => l.sku === "PRC-001" && l.warehouseId === whUtama.id)?.qty ?? 0;
  check("stok bertambah jadi 5 setelah penerimaan", barangQtyAfter === 5, `→ ${barangQtyAfter}`);
  const purchasesAfterProc = await owner("GET", `/api/tenants/${tenantId}/purchases`);
  check("faktur pembelian hasil penerimaan muncul di daftar pembelian", purchasesAfterProc.json?.docs?.some((d) => d.docNo === recv.json.purchaseNo));
  const grnList = await owner("GET", `/api/tenants/${tenantId}/goods-receipts`);
  check("penerimaan (GRN) tercatat + tertaut faktur", grnList.json?.receipts?.some((g) => g.purchaseNo === recv.json.purchaseNo));

  // Batalkan pesanan (buat PO segar tanpa PR).
  const po2 = await owner("POST", `/api/tenants/${tenantId}/purchase-orders`, {
    contactId: supplier.json.id, orderDate: "2026-09-05", warehouseId: whUtama.id, taxRate: 0,
    lines: [{ productId: prodBarang.json.id, qty: 2, unitPrice: 20_000 }],
  });
  const cancelPo = await owner("POST", `/api/tenants/${tenantId}/purchase-orders/${po2.json.id}/cancel`);
  check("batalkan pesanan 200", cancelPo.status === 200);
  const cancelReceived = await owner("POST", `/api/tenants/${tenantId}/purchase-orders/${po.json.id}/cancel`);
  check("batalkan pesanan yang sudah diterima DITOLAK 409", cancelReceived.status === 409);

  const tbAfterProc = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah pengadaan", tbAfterProc.json?.balanced === true);

  // --- Approval workflow engine (Fase 6e): aturan berjenjang + multi-langkah -------
  console.log("11e3. Approval workflow engine (aturan + alur multi-langkah)");
  const viewerRule = await viewer("POST", `/api/tenants/${tenantId}/approval-rules`, {
    name: "X", docType: "pembelian", minAmount: 1, approverRoles: ["owner"],
  });
  check("viewer DITOLAK membuat aturan (403)", viewerRule.status === 403);
  const rule = await owner("POST", `/api/tenants/${tenantId}/approval-rules`, {
    name: "Pembelian besar", docType: "pembelian", minAmount: 5_000_000, approverRoles: ["admin", "owner"],
  });
  check("buat aturan approval 2-langkah 201", rule.status === 201);
  const rulesList = await owner("GET", `/api/tenants/${tenantId}/approval-rules`);
  check("aturan tersimpan dengan urutan approver [admin, owner]", rulesList.json?.rules?.some((r) => r.id === rule.json.id && r.approverRoles?.join(",") === "admin,owner"));

  // Alur di bawah ambang → auto-approved (tanpa aturan cocok).
  const autoFlow = await admin("POST", `/api/tenants/${tenantId}/approval-flows`, {
    docType: "pembelian", title: "Beli ATK", amount: 200_000,
  });
  check("ajukan alur di bawah ambang → auto 'approved'", autoFlow.status === 201 && autoFlow.json?.status === "approved" && autoFlow.json?.autoApproved === true, `→ ${JSON.stringify(autoFlow.json)}`);

  // Alur di atas ambang → pending, 2 langkah (admin lalu owner).
  const flow = await admin("POST", `/api/tenants/${tenantId}/approval-flows`, {
    docType: "pembelian", title: "Beli 4 laptop tim", amount: 8_000_000,
  });
  check("ajukan alur di atas ambang → 'pending' 2 langkah", flow.status === 201 && flow.json?.status === "pending" && flow.json?.steps === 2, `→ ${JSON.stringify(flow.json)}`);
  // Owner mencoba memutus langkah-1 (milik admin) → 403.
  const ownerWrongStep = await owner("POST", `/api/tenants/${tenantId}/approval-flows/${flow.json.id}/steps/decide`, { decision: "approve" });
  check("Pemilik DITOLAK memutus langkah admin (403)", ownerWrongStep.status === 403);
  // Antrean admin memuat alur ini; antrean owner belum.
  const adminQueue = await admin("GET", `/api/tenants/${tenantId}/approval-flows?queue=me`);
  check("antrean admin memuat alur langkah-1", adminQueue.json?.flows?.some((f) => f.id === flow.json.id));
  const ownerQueueEmpty = await owner("GET", `/api/tenants/${tenantId}/approval-flows?queue=me`);
  check("antrean owner belum memuat alur (masih langkah admin)", !ownerQueueEmpty.json?.flows?.some((f) => f.id === flow.json.id));
  // Admin setujui langkah-1 → maju ke langkah owner.
  const step1 = await admin("POST", `/api/tenants/${tenantId}/approval-flows/${flow.json.id}/steps/decide`, { decision: "approve" });
  check("admin setujui langkah-1 → maju (pending)", step1.status === 200 && step1.json?.status === "pending" && step1.json?.currentStep === 2, `→ ${JSON.stringify(step1.json)}`);
  const ownerQueue2 = await owner("GET", `/api/tenants/${tenantId}/approval-flows?queue=me`);
  check("kini antrean owner memuat alur langkah-2", ownerQueue2.json?.flows?.some((f) => f.id === flow.json.id));
  // Owner setujui langkah-2 → alur approved.
  const step2 = await owner("POST", `/api/tenants/${tenantId}/approval-flows/${flow.json.id}/steps/decide`, { decision: "approve" });
  check("owner setujui langkah terakhir → 'approved'", step2.status === 200 && step2.json?.status === "approved");
  const decideDone = await owner("POST", `/api/tenants/${tenantId}/approval-flows/${flow.json.id}/steps/decide`, { decision: "approve" });
  check("memutus alur yang sudah selesai DITOLAK 409", decideDone.status === 409);
  // Jalur reject.
  const flow2 = await admin("POST", `/api/tenants/${tenantId}/approval-flows`, {
    docType: "pembelian", title: "Beli mesin mahal", amount: 9_000_000,
  });
  const rejectStep = await admin("POST", `/api/tenants/${tenantId}/approval-flows/${flow2.json.id}/steps/decide`, { decision: "reject", note: "Tunda dulu" });
  check("tolak di langkah-1 → alur 'rejected'", rejectStep.status === 200 && rejectStep.json?.status === "rejected");
  const history = await owner("GET", `/api/tenants/${tenantId}/approval-flows`);
  const flowHist = history.json?.flows?.find((f) => f.id === flow.json.id);
  check("riwayat memuat alur dengan 2 langkah tersetujui", flowHist?.steps?.filter((s) => s.status === "approved").length === 2, `→ ${JSON.stringify(flowHist?.steps?.map((s) => s.status))}`);

  // --- RBAC granular (Fase 7e): izin per modul + peran kustom ---------------------
  console.log("11e4. RBAC granular (izin modul + peran kustom)");
  const permOwner = await owner("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("izin Owner: semua 13 modul", permOwner.status === 200 && permOwner.json?.role === "owner" && permOwner.json?.permissions?.length === 13, `→ ${permOwner.json?.permissions?.length}`);
  const permAdmin = await admin("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("izin Admin: 12 modul (tanpa kelola pengguna)", permAdmin.status === 200 && permAdmin.json?.permissions?.length === 12 && !permAdmin.json.permissions.includes("pengguna"), `→ ${permAdmin.json?.permissions?.length}`);
  const permViewerPre = await viewer("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("izin Viewer: semua modul terlihat (baca-saja)", permViewerPre.status === 200 && permViewerPre.json?.role === "viewer" && permViewerPre.json?.permissions?.length === 13);

  const roleViewerTry = await viewer("POST", `/api/tenants/${tenantId}/roles`, { name: "X", baseRole: "admin", permissions: ["penjualan"] });
  check("viewer DITOLAK membuat peran kustom (403)", roleViewerTry.status === 403);
  const kasirRole = await owner("POST", `/api/tenants/${tenantId}/roles`, { name: "Kasir Toko", baseRole: "admin", permissions: ["penjualan", "kasir"] });
  check("buat peran kustom 'Kasir Toko' 201", kasirRole.status === 201 && Boolean(kasirRole.json?.id));

  const membersList = await owner("GET", `/api/tenants/${tenantId}/members`);
  const viewerMember = membersList.json?.members?.find((m) => m.role === "viewer");
  check("daftar anggota memuat viewer", Boolean(viewerMember?.userId));
  const assignKasir = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerMember.userId}/assign`, { customRoleId: kasirRole.json.id });
  check("tetapkan peran kustom ke anggota 200", assignKasir.status === 200, `→ ${assignKasir.status}`);
  const permViewerKasir = await viewer("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("izin anggota kini = peran kustom (base admin, 2 modul)", permViewerKasir.json?.role === "admin" && permViewerKasir.json?.roleName === "Kasir Toko" && permViewerKasir.json?.permissions?.length === 2, `→ ${JSON.stringify(permViewerKasir.json)}`);
  const taxBlocked = await viewer("GET", `/api/tenants/${tenantId}/tax/pph-final/preview?period=2026-10`);
  check("peran kustom tanpa izin 'pajak' DITOLAK akses Pajak (403)", taxBlocked.status === 403, `→ ${taxBlocked.status}`);

  const pajakRole = await owner("POST", `/api/tenants/${tenantId}/roles`, { name: "Staf Pajak", baseRole: "admin", permissions: ["pajak", "laporan"] });
  await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerMember.userId}/assign`, { customRoleId: pajakRole.json.id });
  const taxAllowed = await viewer("GET", `/api/tenants/${tenantId}/tax/pph-final/preview?period=2026-10`);
  check("peran kustom dengan izin 'pajak' BOLEH akses Pajak (200)", taxAllowed.status === 200, `→ ${taxAllowed.status}`);

  const delInUse = await owner("DELETE", `/api/tenants/${tenantId}/roles/${pajakRole.json.id}`);
  check("hapus peran yang masih dipakai DITOLAK 409", delInUse.status === 409);
  const restoreViewer = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerMember.userId}/assign`, { preset: "viewer" });
  check("kembalikan anggota ke preset Viewer 200", restoreViewer.status === 200);
  const delFreed = await owner("DELETE", `/api/tenants/${tenantId}/roles/${pajakRole.json.id}`);
  check("hapus peran yang sudah tak dipakai 200", delFreed.status === 200);
  await owner("DELETE", `/api/tenants/${tenantId}/roles/${kasirRole.json.id}`);
  const permViewerPost = await viewer("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("anggota kembali jadi Viewer baca-saja (13 modul)", permViewerPost.json?.role === "viewer" && permViewerPost.json?.permissions?.length === 13);

  // --- Akuntansi dimensi + rekonsiliasi bank v2 (Fase 7f) -------------------------
  console.log("11e5. Akuntansi dimensi (cost center) + rekonsiliasi v2");
  const ccViewer = await viewer("POST", `/api/tenants/${tenantId}/cost-centers`, { code: "X", name: "X" });
  check("viewer DITOLAK membuat cost center (403)", ccViewer.status === 403);
  const cc = await owner("POST", `/api/tenants/${tenantId}/cost-centers`, { code: "CAB-UJI", name: "Cabang Uji" });
  check("buat cost center 201", cc.status === 201 && Boolean(cc.json?.id));
  const ccDup = await owner("POST", `/api/tenants/${tenantId}/cost-centers`, { code: "CAB-UJI", name: "Lain" });
  check("kode cost center duplikat DITOLAK 409", ccDup.status === 409);

  const accsForDim = await owner("GET", `/api/tenants/${tenantId}/accounts`);
  const bebanAcc = accsForDim.json?.accounts?.find((a) => a.code === "5-4000");
  const bankAcc = accsForDim.json?.accounts?.find((a) => a.code === "1-1100");
  // Jurnal Oktober terisolasi: Beban 500rb ditandai cost center / Kas 500rb.
  const dimJrn = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-12", memo: "Beban operasional Cabang Uji",
    lines: [
      { accountId: bebanAcc.id, debit: 500_000, credit: 0, costCenterId: cc.json.id },
      { accountId: kas.id, debit: 0, credit: 500_000 },
    ],
  });
  check("jurnal dengan dimensi cost center 201", dimJrn.status === 201, `→ ${JSON.stringify(dimJrn.json)}`);
  const dimBad = await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-12", memo: "x",
    lines: [
      { accountId: bebanAcc.id, debit: 1_000, credit: 0, costCenterId: "tidak-ada" },
      { accountId: kas.id, debit: 0, credit: 1_000 },
    ],
  });
  check("jurnal dengan cost center tak dikenal DITOLAK 400", dimBad.status === 400);
  const dimRep = await owner("GET", `/api/tenants/${tenantId}/reports/dimension?from=2026-10-01&to=2026-10-31`);
  const ccRow = dimRep.json?.rows?.find((r) => r.costCenterId === cc.json.id);
  check("laporan dimensi: Cabang Uji beban 500rb (laba -500rb)", dimRep.status === 200 && ccRow?.expense === 500_000 && ccRow?.net === -500_000, `→ ${JSON.stringify(ccRow)}`);
  const ccArchive = await owner("POST", `/api/tenants/${tenantId}/cost-centers/${cc.json.id}/archive`);
  check("arsipkan cost center 200", ccArchive.status === 200);

  // Rekonsiliasi bank v2: aturan auto-match.
  const brViewer = await viewer("POST", `/api/tenants/${tenantId}/bank-match-rules`, { accountId: bankAcc.id, keyword: "X" });
  check("viewer DITOLAK membuat aturan auto-match (403)", brViewer.status === 403);
  const br = await owner("POST", `/api/tenants/${tenantId}/bank-match-rules`, { accountId: bankAcc.id, keyword: "BIAYA ADM", dateTolerance: 2 });
  check("buat aturan auto-match 201", br.status === 201 && Boolean(br.json?.id));
  const brList = await owner("GET", `/api/tenants/${tenantId}/bank-match-rules`);
  check("daftar aturan memuat aturan baru", brList.json?.rules?.some((r) => r.id === br.json.id && r.keyword === "BIAYA ADM"));
  const brDel = await owner("DELETE", `/api/tenants/${tenantId}/bank-match-rules/${br.json.id}`);
  check("hapus aturan auto-match 200", brDel.status === 200);

  const tbAfterDim = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah alur dimensi", tbAfterDim.json?.balanced === true);

  // --- RBAC berdimensi (Fase 8d): scope cost center per peran kustom -------------
  console.log("11e6. RBAC berdimensi (scope cost center per peran)");
  const ccScopeA = await owner("POST", `/api/tenants/${tenantId}/cost-centers`, { code: "SCOPE-A", name: "Cabang Scope A" });
  const ccScopeB = await owner("POST", `/api/tenants/${tenantId}/cost-centers`, { code: "SCOPE-B", name: "Cabang Scope B" });
  // Jurnal beban Oktober untuk kedua cabang (periode terisolasi dari asersi lama).
  await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-21", description: "Beban cabang A", lines: [
      { accountId: bebanAcc.id, debit: 250_000, credit: 0, costCenterId: ccScopeA.json.id },
      { accountId: bankAcc.id, debit: 0, credit: 250_000 },
    ],
  });
  await owner("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-21", description: "Beban cabang B", lines: [
      { accountId: bebanAcc.id, debit: 350_000, credit: 0, costCenterId: ccScopeB.json.id },
      { accountId: bankAcc.id, debit: 0, credit: 350_000 },
    ],
  });

  const scopeTooBig = await owner("POST", `/api/tenants/${tenantId}/roles`, { name: "Kebanyakan", baseRole: "admin", permissions: ["keuangan"], scopeCostCenterIds: Array.from({ length: 21 }, (_, i) => `id-${i}`) });
  check("scope > 20 cost center DITOLAK 400", scopeTooBig.status === 400);
  const scopedRole = await owner("POST", `/api/tenants/${tenantId}/roles`, {
    name: "Manajer Cabang A", baseRole: "admin", permissions: ["keuangan", "laporan"], scopeCostCenterIds: [ccScopeA.json.id],
  });
  check("buat peran ber-scope 201", scopedRole.status === 201 && Boolean(scopedRole.json?.id));
  const rolesWithScope = await owner("GET", `/api/tenants/${tenantId}/roles`);
  check("daftar peran memuat scope", rolesWithScope.json?.roles?.some((r) => r.id === scopedRole.json.id && r.scopeCostCenterIds?.length === 1));

  const assignScoped = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerMember.userId}/assign`, { customRoleId: scopedRole.json.id });
  check("tetapkan peran ber-scope ke anggota 200", assignScoped.status === 200);
  const permScoped = await viewer("GET", `/api/tenants/${tenantId}/my-permissions`);
  check("my-permissions memuat scope cost center", permScoped.json?.scopeCostCenterIds?.length === 1 && permScoped.json.scopeCostCenterIds[0] === ccScopeA.json.id, `→ ${JSON.stringify(permScoped.json?.scopeCostCenterIds)}`);

  const ccListScoped = await viewer("GET", `/api/tenants/${tenantId}/cost-centers`);
  check(
    "daftar cost center TERSARING (hanya Scope A, tanpa Scope B)",
    ccListScoped.json?.items?.some((i) => i.id === ccScopeA.json.id) && !ccListScoped.json?.items?.some((i) => i.id === ccScopeB.json.id),
    `→ ${JSON.stringify(ccListScoped.json?.items?.map((i) => i.code))}`,
  );
  const dimScoped = await viewer("GET", `/api/tenants/${tenantId}/reports/dimension?from=2026-10-01&to=2026-10-31`);
  check(
    "laporan dimensi tersaring: HANYA baris Scope A (tanpa Scope B & tanpa-dimensi)",
    dimScoped.status === 200 && dimScoped.json?.rows?.length >= 1 && dimScoped.json.rows.every((r) => r.costCenterId === ccScopeA.json.id),
    `→ ${JSON.stringify(dimScoped.json?.rows?.map((r) => r.code))}`,
  );
  const jrnOutScope = await viewer("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-22", description: "Coba luar scope", lines: [
      { accountId: bebanAcc.id, debit: 10_000, credit: 0, costCenterId: ccScopeB.json.id },
      { accountId: bankAcc.id, debit: 0, credit: 10_000 },
    ],
  });
  check("jurnal ke cost center LUAR scope DITOLAK 403", jrnOutScope.status === 403, `→ ${jrnOutScope.status}`);
  const jrnInScope = await viewer("POST", `/api/tenants/${tenantId}/journal-entries`, {
    entryDate: "2026-10-22", description: "Beban dalam scope", lines: [
      { accountId: bebanAcc.id, debit: 10_000, credit: 0, costCenterId: ccScopeA.json.id },
      { accountId: bankAcc.id, debit: 0, credit: 10_000 },
    ],
  });
  check("jurnal ke cost center DALAM scope BOLEH 201", jrnInScope.status === 201, `→ ${jrnInScope.status}`);

  const ccListOwner = await owner("GET", `/api/tenants/${tenantId}/cost-centers`);
  check("pengguna TANPA scope tetap melihat semua (perilaku lama)", ccListOwner.json?.items?.some((i) => i.id === ccScopeB.json.id));

  // Kembalikan anggota ke preset Viewer agar blok-blok berikutnya tak terpengaruh.
  const restoreViewer2 = await owner("PATCH", `/api/tenants/${tenantId}/members/${viewerMember.userId}/assign`, { preset: "viewer" });
  check("anggota dikembalikan ke preset Viewer 200", restoreViewer2.status === 200);

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

  // --- CRM lanjut (Fase 5e): sumber lead, tenggat follow-up, laporan konversi ------
  console.log("11g2. CRM lanjut (sumber, tenggat follow-up, laporan sumber, masa berlaku penawaran)");

  const lead5e = await owner("POST", `/api/tenants/${tenantId}/leads`, {
    name: "Toko Oleh-Oleh Nusantara",
    contactPerson: "Pak Bagus",
    estValue: 4_000_000,
    source: "Instagram",
  });
  check("buat lead ber-sumber 201", lead5e.status === 201, `→ ${JSON.stringify(lead5e.json)}`);
  const leads5e = await owner("GET", `/api/tenants/${tenantId}/leads`);
  check(
    "daftar lead memuat kolom sumber",
    leads5e.json?.leads?.some((l) => l.id === lead5e.json?.id && l.source === "Instagram"),
  );

  const act5e = await owner("POST", `/api/tenants/${tenantId}/leads/${lead5e.json?.id}/activities`, {
    type: "whatsapp",
    note: "Kirim katalog — janji dihubungi lagi.",
    activityDate: "2026-01-02",
    dueAt: "2026-01-05",
  });
  check("catat aktivitas ber-tenggat 201", act5e.status === 201, `→ ${JSON.stringify(act5e.json)}`);
  const acts5e = await owner("GET", `/api/tenants/${tenantId}/leads/${lead5e.json?.id}/activities`);
  check(
    "daftar aktivitas memuat tenggat (dueAt)",
    acts5e.json?.activities?.some((a) => a.dueAt === "2026-01-05"),
  );

  const notif5e = await owner("GET", `/api/tenants/${tenantId}/notifications`);
  check(
    "lonceng notifikasi memuat follow-up jatuh tempo (crm_followup_due)",
    notif5e.json?.notifications?.some((n) => n.type === "crm_followup_due"),
    `→ ${JSON.stringify(notif5e.json?.notifications?.map((n) => n.type))}`,
  );

  const crmReport = await owner("GET", `/api/tenants/${tenantId}/crm/report`);
  const igRow = crmReport.json?.rows?.find((r) => r.source === "Instagram");
  check("laporan sumber lead 200 + baris Instagram", crmReport.status === 200 && Boolean(igRow));
  check(
    "baris laporan punya total & conversionPct angka",
    igRow?.total >= 1 && typeof igRow?.conversionPct === "number",
    `→ ${JSON.stringify(crmReport.json)}`,
  );
  const outsiderReport = await outsider("GET", `/api/tenants/${tenantId}/crm/report`);
  check("non-anggota DITOLAK laporan CRM (403)", outsiderReport.status === 403);

  const quote5e = await owner("POST", `/api/tenants/${tenantId}/quotations`, {
    contactId: newCust.id,
    quoteDate: "2026-01-10",
    validUntil: "2026-01-31",
    taxRate: 0,
    lines: [{ productId: prodBarang.json.id, qty: 1, unitPrice: 150_000 }],
  });
  check("buat penawaran ber-masa-berlaku 201", quote5e.status === 201, `→ ${JSON.stringify(quote5e.json)}`);
  const quotes5e = await owner("GET", `/api/tenants/${tenantId}/quotations`);
  check(
    "daftar penawaran memuat validUntil (basis status kedaluwarsa)",
    quotes5e.json?.quotations?.some((q) => q.id === quote5e.json?.id && q.validUntil === "2026-01-31"),
  );

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

  // --- Struktur organisasi (Fase 8c): departemen hierarki + atasan ---------------
  console.log("11i3. Struktur organisasi (departemen, atasan, bagan)");
  const deptViewer = await viewer("POST", `/api/tenants/${tenantId}/departments`, { code: "X", name: "Xx" });
  check("viewer DITOLAK membuat departemen (403)", deptViewer.status === 403);
  const deptOps = await owner("POST", `/api/tenants/${tenantId}/departments`, { code: "OPS", name: "Operasional" });
  check("buat departemen 201", deptOps.status === 201 && Boolean(deptOps.json?.id));
  const deptDup = await owner("POST", `/api/tenants/${tenantId}/departments`, { code: "OPS", name: "Lain" });
  check("kode departemen duplikat DITOLAK 409", deptDup.status === 409);
  const deptSub = await owner("POST", `/api/tenants/${tenantId}/departments`, { code: "OPS-GDG", name: "Gudang", parentId: deptOps.json.id });
  check("sub-departemen 201", deptSub.status === 201);
  const cyc = await owner("PATCH", `/api/tenants/${tenantId}/departments/${deptOps.json.id}`, { code: "OPS", name: "Operasional", parentId: deptSub.json.id });
  check("struktur MELINGKAR ditolak 400 (induk = anak sendiri)", cyc.status === 400);
  const selfParent = await owner("PATCH", `/api/tenants/${tenantId}/departments/${deptOps.json.id}`, { code: "OPS", name: "Operasional", parentId: deptOps.json.id });
  check("departemen jadi induk dirinya DITOLAK 400", selfParent.status === 400);

  const empOrg = await owner("POST", `/api/tenants/${tenantId}/employees`, {
    name: "Citra Organisasi", position: "Staf Gudang", ptkpStatus: "TK/0", baseSalary: 5_100_000, allowances: 0,
    departmentId: deptSub.json.id, managerId: empA.json.id,
  });
  check("karyawan ber-departemen + atasan 201", empOrg.status === 201);
  const selfMgr = await owner("PATCH", `/api/tenants/${tenantId}/employees/${empOrg.json.id}`, {
    name: "Citra Organisasi", ptkpStatus: "TK/0", baseSalary: 5_100_000, allowances: 0, managerId: empOrg.json.id,
  });
  check("atasan = diri sendiri DITOLAK 400", selfMgr.status === 400);
  const empsOrg = await owner("GET", `/api/tenants/${tenantId}/employees`);
  const citra = empsOrg.json?.employees?.find((e) => e.name === "Citra Organisasi");
  check("GET karyawan menyertakan nama departemen & atasan", citra?.departmentName === "Gudang" && citra?.managerName === "Andi Karyawan", `→ ${JSON.stringify(citra && { d: citra.departmentName, m: citra.managerName })}`);
  const chart = await owner("GET", `/api/tenants/${tenantId}/org-chart`);
  const opsNode = chart.json?.tree?.find((n) => n.code === "OPS");
  check("bagan organisasi: OPS punya sub Gudang berisi Citra", opsNode?.children?.[0]?.code === "OPS-GDG" && opsNode?.children?.[0]?.employees?.some((e) => e.name === "Citra Organisasi"));
  const archived = await owner("DELETE", `/api/tenants/${tenantId}/departments/${deptSub.json.id}`);
  const deptsAfter = await owner("GET", `/api/tenants/${tenantId}/departments`);
  check("arsip departemen 200 dan hilang dari daftar", archived.status === 200 && !deptsAfter.json?.departments?.some((d) => d.code === "OPS-GDG"));

  // --- HR lanjut (Fase 5f): kasbon, komponen ad-hoc, cuti & izin ------------------
  console.log("11i2. HR lanjut (kasbon, bonus/potongan ad-hoc, cuti & izin, 1721-A1)");
  const andiId = empA.json?.id;

  // Kasbon Andi: pokok 2jt, cicilan 1jt/bln — pencairan berjurnal (Piutang Karyawan).
  const loan = await owner("POST", `/api/tenants/${tenantId}/employee-loans`, {
    employeeId: andiId,
    name: "Kasbon uji",
    principal: 2_000_000,
    monthlyDeduction: 1_000_000,
    cashAccountId: kas.id,
    loanDate: "2026-09-01",
  });
  check("cairkan kasbon 201 + jurnal", loan.status === 201 && Boolean(loan.json?.journalNo), `→ ${JSON.stringify(loan.json)}`);
  const loansList = await owner("GET", `/api/tenants/${tenantId}/employee-loans`);
  const loan1 = loansList.json?.loans?.find((l) => l.id === loan.json?.id);
  check("daftar kasbon: saldo 2jt, status aktif", loan1?.balance === 2_000_000 && loan1?.status === "active");
  const badLoan = await owner("POST", `/api/tenants/${tenantId}/employee-loans`, {
    employeeId: andiId, name: "Cicilan > pokok", principal: 1_000_000, monthlyDeduction: 2_000_000, cashAccountId: kas.id, loanDate: "2026-09-01",
  });
  check("kasbon cicilan > pokok DITOLAK 400", badLoan.status === 400);
  const viewerLoan = await viewer("POST", `/api/tenants/${tenantId}/employee-loans`, {
    employeeId: andiId, name: "x", principal: 1000, monthlyDeduction: 100, cashAccountId: kas.id, loanDate: "2026-09-01",
  });
  check("viewer DITOLAK mencairkan kasbon (403)", viewerLoan.status === 403);

  // Komponen ad-hoc periode 2026-09: bonus 1jt untuk Andi (ikut bruto & pajak).
  const adj = await owner("POST", `/api/tenants/${tenantId}/payroll-adjustments`, {
    period: "2026-09", employeeId: andiId, name: "Bonus uji", amount: 1_000_000,
  });
  check("tambah komponen ad-hoc 201", adj.status === 201);
  const adjThrow = await owner("POST", `/api/tenants/${tenantId}/payroll-adjustments`, {
    period: "2026-09", employeeId: andiId, name: "Potongan salah", amount: -500_000,
  });
  const adjList = await owner("GET", `/api/tenants/${tenantId}/payroll-adjustments?period=2026-09`);
  check("daftar komponen periode berisi 2 (belum terpakai)", adjList.json?.adjustments?.length === 2 && adjList.json.adjustments.every((a) => a.runId === null));
  const delAdj = await owner("DELETE", `/api/tenants/${tenantId}/payroll-adjustments/${adjThrow.json?.id}`);
  check("hapus komponen belum terpakai 200", delAdj.status === 200);

  // Jalankan penggajian 2026-09 → Andi: bruto 6jt (5jt + bonus 1jt), cicilan kasbon 1jt terpotong.
  const run9 = await owner("POST", `/api/tenants/${tenantId}/payroll-runs`, {
    period: "2026-09", cashAccountId: kas.id, paymentDate: "2026-09-15",
  });
  check("penggajian 2026-09 dengan bonus 201", run9.status === 201, `→ ${JSON.stringify(run9.json)}`);
  const runs9 = await owner("GET", `/api/tenants/${tenantId}/payroll-runs`);
  const run9row = runs9.json?.runs?.find((r) => r.period === "2026-09");
  const slipAndi = run9row?.payslips?.find((p) => p.employeeName === "Andi Karyawan");
  check(
    "slip Andi memuat bonus (bruto 6jt, komponen +1jt) & cicilan kasbon 1jt",
    slipAndi?.gross === 6_000_000 && slipAndi?.adjustmentsTotal === 1_000_000 && slipAndi?.loanDeduction === 1_000_000,
    `→ ${JSON.stringify(slipAndi)}`,
  );
  const loansAfter = await owner("GET", `/api/tenants/${tenantId}/employee-loans`);
  const loanAfter = loansAfter.json?.loans?.find((l) => l.id === loan.json?.id);
  check("saldo kasbon berkurang jadi 1jt setelah run", loanAfter?.balance === 1_000_000 && loanAfter?.status === "active");
  const delUsed = await owner("DELETE", `/api/tenants/${tenantId}/payroll-adjustments/${adj.json?.id}`);
  check("hapus komponen yang sudah terpakai DITOLAK 409", delUsed.status === 409);

  // Cuti & izin: annual 3 hari disetujui → saldo cuti Andi 12 → 9; pengajuan > saldo ditolak.
  const leave = await owner("POST", `/api/tenants/${tenantId}/leave-requests`, {
    employeeId: andiId, type: "annual", startDate: "2026-09-20", endDate: "2026-09-22", note: "Acara keluarga",
  });
  check("ajukan cuti tahunan 3 hari 201", leave.status === 201 && leave.json?.days === 3, `→ ${JSON.stringify(leave.json)}`);
  const viewerLeave = await viewer("POST", `/api/tenants/${tenantId}/leave-requests`, {
    employeeId: andiId, type: "sick", startDate: "2026-09-20", endDate: "2026-09-20",
  });
  check("viewer DITOLAK mengajukan cuti (403)", viewerLeave.status === 403);
  const approveLeave = await owner("PATCH", `/api/tenants/${tenantId}/leave-requests/${leave.json?.id}`, { status: "approved" });
  check("setujui cuti 200", approveLeave.status === 200);
  const empsAfterLeave = await owner("GET", `/api/tenants/${tenantId}/employees`);
  const andiAfter = empsAfterLeave.json?.employees?.find((e) => e.id === andiId);
  check("saldo cuti Andi berkurang 12 → 9 setelah cuti tahunan disetujui", andiAfter?.leaveBalance === 9, `→ ${andiAfter?.leaveBalance}`);
  const reApprove = await owner("PATCH", `/api/tenants/${tenantId}/leave-requests/${leave.json?.id}`, { status: "rejected" });
  check("memutuskan cuti yang sudah diputus DITOLAK 409", reApprove.status === 409);
  const bigLeave = await owner("POST", `/api/tenants/${tenantId}/leave-requests`, {
    employeeId: andiId, type: "annual", startDate: "2026-10-01", endDate: "2026-10-20",
  });
  const bigApprove = await owner("PATCH", `/api/tenants/${tenantId}/leave-requests/${bigLeave.json?.id}`, { status: "approved" });
  check("setujui cuti melebihi saldo DITOLAK 400", bigApprove.status === 400);

  // Absensi/kehadiran (Fase 6b): upsert per karyawan+tanggal, rekap bulanan, hapus, RBAC.
  const attMonth = "2026-09";
  const viewerAtt = await viewer("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: andiId, date: `${attMonth}-01`, status: "hadir",
  });
  check("viewer DITOLAK mencatat kehadiran (403)", viewerAtt.status === 403);
  const att1 = await owner("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: andiId, date: `${attMonth}-01`, status: "hadir", clockIn: "08:00", clockOut: "17:00",
  });
  check("catat kehadiran hadir 201", att1.status === 201);
  const att2 = await owner("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: andiId, date: `${attMonth}-02`, status: "sakit", note: "Demam",
  });
  check("catat kehadiran sakit 201", att2.status === 201);
  const badStatusAtt = await owner("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: andiId, date: `${attMonth}-03`, status: "bolos",
  });
  check("status kehadiran tak dikenal DITOLAK 400", badStatusAtt.status === 400);
  const unknownEmpAtt = await owner("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: "tidak-ada", date: `${attMonth}-03`, status: "hadir",
  });
  check("kehadiran karyawan tak dikenal 404", unknownEmpAtt.status === 404);
  const attList = await owner("GET", `/api/tenants/${tenantId}/attendance?month=${attMonth}`);
  check("daftar kehadiran memuat 2 catatan Andi", attList.status === 200 && attList.json?.records?.filter((r) => r.employeeId === andiId).length === 2);
  const andiRecap = attList.json?.recap?.find((r) => r.employeeId === andiId);
  check("rekap Andi: 1 hadir + 1 sakit", andiRecap?.hadir === 1 && andiRecap?.sakit === 1 && andiRecap?.total === 2, `→ ${JSON.stringify(andiRecap)}`);
  // Upsert: catat ulang tanggal yang sama → menimpa, bukan menambah baris.
  const attUpsert = await owner("POST", `/api/tenants/${tenantId}/attendance`, {
    employeeId: andiId, date: `${attMonth}-01`, status: "izin",
  });
  check("upsert kehadiran tanggal sama 201", attUpsert.status === 201);
  const attList2 = await owner("GET", `/api/tenants/${tenantId}/attendance?month=${attMonth}`);
  const andiRecap2 = attList2.json?.recap?.find((r) => r.employeeId === andiId);
  check("upsert menimpa: total tetap 2, kini 1 izin + 1 sakit", andiRecap2?.total === 2 && andiRecap2?.izin === 1 && andiRecap2?.hadir === 0, `→ ${JSON.stringify(andiRecap2)}`);
  const attToDelete = attList2.json?.records?.find((r) => r.employeeId === andiId && r.date === `${attMonth}-02`);
  const delAtt = await owner("DELETE", `/api/tenants/${tenantId}/attendance/${attToDelete?.id}`);
  check("hapus catatan kehadiran 200", delAtt.status === 200);
  const delUnknownAtt = await owner("DELETE", `/api/tenants/${tenantId}/attendance/tidak-ada`);
  check("hapus kehadiran tak dikenal 404", delUnknownAtt.status === 404);
  const attList3 = await owner("GET", `/api/tenants/${tenantId}/attendance?month=${attMonth}`);
  check("setelah hapus tersisa 1 catatan Andi", attList3.json?.records?.filter((r) => r.employeeId === andiId).length === 1);

  const tbAfterHr = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah kasbon & penggajian bonus", tbAfterHr.json?.balanced === true);

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

  // --- Proyek lanjut (Fase 5g): termin, RAB, papan tugas, timesheet ----------------
  console.log("11k2. Proyek lanjut (termin → faktur, RAB, progres tugas, timesheet)");

  const viewerMs = await viewer("POST", `/api/tenants/${tenantId}/projects/${projectId}/milestones`, { name: "X", amount: 1000 });
  check("viewer DITOLAK menambah termin (403)", viewerMs.status === 403);

  // Proyek jasa baru dengan pelanggan (agar bisa menagih termin).
  const projSvc = await owner("POST", `/api/tenants/${tenantId}/projects`, {
    code: "PRJ-JASA-5G",
    name: "Jasa Desain 5g",
    contactId: newCust.id,
    budget: 5_000_000,
  });
  check("buat proyek jasa ber-pelanggan 201", projSvc.status === 201);
  const projSvcId = projSvc.json?.id;

  const ms1 = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/milestones`, { name: "Uang muka", amount: 5_000_000 });
  check("tambah termin 201", ms1.status === 201);
  const badMs = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/milestones`, { name: "X", amount: 0 });
  check("termin nominal 0 DITOLAK 400", badMs.status === 400);

  const invMs = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/milestones/${ms1.json?.id}/invoice`, {
    invoiceDate: "2026-07-20",
    taxRate: 0,
    warehouseId: whUtama.id,
  });
  check("buat faktur dari termin 201 (5jt)", invMs.status === 201 && invMs.json?.total === 5_000_000, `→ ${JSON.stringify(invMs.json)}`);

  const detailSvc = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  const invoicedMs = detailSvc.json?.milestones?.find((m) => m.id === ms1.json?.id);
  check(
    "termin jadi 'invoiced' + tertaut faktur, pendapatan proyek 5jt",
    invoicedMs?.status === "invoiced" && Boolean(invoicedMs?.invoiceNo) && detailSvc.json?.revenue === 5_000_000,
    `→ ${JSON.stringify({ st: invoicedMs?.status, rev: detailSvc.json?.revenue })}`,
  );

  const reInvMs = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/milestones/${ms1.json?.id}/invoice`, {
    invoiceDate: "2026-07-20", taxRate: 0, warehouseId: whUtama.id,
  });
  check("faktur termin kedua kali DITOLAK 400", reInvMs.status === 400);
  const delInvMs = await owner("DELETE", `/api/tenants/${tenantId}/projects/${projSvcId}/milestones/${ms1.json?.id}`);
  check("hapus termin yang sudah difakturkan DITOLAK 409", delInvMs.status === 409);

  // Proyek tanpa pelanggan tidak bisa menagih termin.
  const projNoCust = await owner("POST", `/api/tenants/${tenantId}/projects`, { code: "PRJ-NOCUST-5G", name: "Tanpa Pelanggan" });
  const msNoCust = await owner("POST", `/api/tenants/${tenantId}/projects/${projNoCust.json?.id}/milestones`, { name: "DP", amount: 1_000_000 });
  const invNoCust = await owner("POST", `/api/tenants/${tenantId}/projects/${projNoCust.json?.id}/milestones/${msNoCust.json?.id}/invoice`, {
    invoiceDate: "2026-07-20", taxRate: 0, warehouseId: whUtama.id,
  });
  check("faktur termin proyek tanpa pelanggan DITOLAK 400", invNoCust.status === 400);

  // RAB: dua baris anggaran → plannedCost 5jt.
  await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/budgets`, { category: "Material", plannedAmount: 3_000_000 });
  await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/budgets`, { category: "Tenaga kerja", plannedAmount: 2_000_000 });
  const detailBudget = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  check("RAB: 2 baris, total anggaran 5jt", detailBudget.json?.budgets?.length === 2 && detailBudget.json?.plannedCost === 5_000_000);
  const viewerProjBudget = await viewer("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/budgets`, { category: "X", plannedAmount: 1000 });
  check("viewer DITOLAK menambah RAB (403)", viewerProjBudget.status === 403);

  // Timesheet: 10 jam × 100rb → estimasi biaya tenaga kerja 1jt (informatif, tak dijurnal).
  const te1 = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/time-entries`, { entryDate: "2026-07-18", hours: 10, hourlyRate: 100_000, note: "Desain" });
  check("catat timesheet 201", te1.status === 201);
  const detailTime = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  check("timesheet: estimasi biaya tenaga kerja 1jt", detailTime.json?.laborCost === 1_000_000 && detailTime.json?.timeEntries?.length === 1);

  // Papan tugas: 2 tugas, 1 selesai → progres 50%.
  const ta1 = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks`, { name: "Survei" });
  await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks`, { name: "Gambar kerja" });
  await owner("PATCH", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks/${ta1.json?.id}`, { status: "done" });
  const detailProg = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  check("progres proyek = 50% (1 dari 2 tugas selesai)", detailProg.json?.progressPct === 50, `→ ${detailProg.json?.progressPct}`);

  // --- Proyek PM serius (Fase 6c): penanggung jawab, prioritas, beban kerja -------
  const pmTask = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks`, {
    name: "Pasang instalasi listrik", assigneeId: andiId, priority: "high", dueDate: "2026-09-30",
  });
  check("tambah tugas dengan PJ + prioritas 201", pmTask.status === 201);
  const badAssignTask = await owner("POST", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks`, {
    name: "Tugas PJ salah", assigneeId: "karyawan-tidak-ada",
  });
  check("tambah tugas PJ tak dikenal 404", badAssignTask.status === 404);
  const detailPm = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  const pmTaskRow = detailPm.json?.tasks?.find((t) => t.id === pmTask.json?.id);
  check("tugas memuat penanggung jawab & prioritas", pmTaskRow?.assigneeName === "Andi Karyawan" && pmTaskRow?.priority === "high", `→ ${JSON.stringify(pmTaskRow)}`);
  check("beban kerja (workload) tersedia & terisi", Array.isArray(detailPm.json?.workload) && detailPm.json.workload.length >= 1);
  const andiWorkload = detailPm.json?.workload?.find((w) => w.assigneeId === andiId);
  check("beban kerja Andi: 1 tugas terbuka (high)", andiWorkload?.openTasks === 1 && andiWorkload?.todo === 1, `→ ${JSON.stringify(andiWorkload)}`);
  // Perbarui: ubah prioritas & kosongkan PJ.
  const pmUpdate = await owner("PATCH", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks/${pmTask.json?.id}`, {
    priority: "low", assigneeId: null,
  });
  check("perbarui prioritas + kosongkan PJ 200", pmUpdate.status === 200);
  const badAssignUpdate = await owner("PATCH", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks/${pmTask.json?.id}`, { assigneeId: "karyawan-tidak-ada" });
  check("perbarui PJ tak dikenal 404", badAssignUpdate.status === 404);
  const detailPm2 = await owner("GET", `/api/tenants/${tenantId}/projects/${projSvcId}`);
  const pmTaskRow2 = detailPm2.json?.tasks?.find((t) => t.id === pmTask.json?.id);
  check("PJ dikosongkan & prioritas jadi low", pmTaskRow2?.assigneeId === null && pmTaskRow2?.priority === "low", `→ ${JSON.stringify(pmTaskRow2)}`);
  const viewerTaskUpd = await viewer("PATCH", `/api/tenants/${tenantId}/projects/${projSvcId}/tasks/${pmTask.json?.id}`, { priority: "high" });
  check("viewer DITOLAK memperbarui tugas (403)", viewerTaskUpd.status === 403);

  const tbAfterProjectExtras = await owner("GET", `/api/tenants/${tenantId}/trial-balance`);
  check("neraca saldo TETAP seimbang setelah termin & faktur proyek", tbAfterProjectExtras.json?.balanced === true);

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

  // --- Manufaktur routing + Proyek Gantt (Fase 7g) -------------------------------
  console.log("11o2. Manufaktur routing (work center) + Proyek Gantt");
  const wcViewer = await viewer("POST", `/api/tenants/${tenantId}/work-centers`, { code: "X", name: "X" });
  check("viewer DITOLAK membuat work center (403)", wcViewer.status === 403);
  const wc = await owner("POST", `/api/tenants/${tenantId}/work-centers`, { code: "WC-CUT", name: "Pemotongan", hourlyRate: 50_000 });
  check("buat work center 201", wc.status === 201 && Boolean(wc.json?.id));
  const wcDup = await owner("POST", `/api/tenants/${tenantId}/work-centers`, { code: "WC-CUT", name: "Lain" });
  check("kode work center duplikat DITOLAK 409", wcDup.status === 409);
  const rtStep1 = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/routing`, { workCenterId: wc.json.id, name: "Potong kayu", standardCost: 100_000 });
  check("tambah tahap routing 201", rtStep1.status === 201 && Boolean(rtStep1.json?.id));
  const badWc = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/routing`, { workCenterId: "tidak-ada", name: "X", standardCost: 1 });
  check("routing dengan work center tak dikenal DITOLAK 400", badWc.status === 400);
  const stepDone = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/routing/${rtStep1.json.id}/complete`, { actualCost: 120_000 });
  check("catat biaya aktual + selesai 200", stepDone.status === 200);
  const stepRedone = await owner("POST", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/routing/${rtStep1.json.id}/complete`, { actualCost: 1 });
  check("selesaikan tahap yang sudah selesai DITOLAK 409", stepRedone.status === 409);
  const routing = await owner("GET", `/api/tenants/${tenantId}/production-orders/${ord1.json.id}/routing`);
  check("routing: standar 100rb, aktual 120rb, varian +20rb", routing.json?.totalStandard === 100_000 && routing.json?.totalActual === 120_000 && routing.json?.variance === 20_000, `→ ${JSON.stringify({ s: routing.json?.totalStandard, a: routing.json?.totalActual, v: routing.json?.variance })}`);

  // Proyek Gantt: jadwal + baseline pada tugas yang sudah ada (projectId/task dari 11k).
  const schedTask = await owner("PATCH", `/api/tenants/${tenantId}/projects/${projectId}/tasks/${task.json.id}`, { startDate: "2026-09-01", endDate: "2026-09-10", setBaseline: true });
  check("tetapkan jadwal + baseline tugas 200", schedTask.status === 200);
  const projAfter = await owner("GET", `/api/tenants/${tenantId}/projects/${projectId}`);
  const schedTaskRow = projAfter.json?.tasks?.find((t) => t.id === task.json.id);
  check("tugas menyimpan jadwal & baseline (Gantt)", schedTaskRow?.startDate === "2026-09-01" && schedTaskRow?.endDate === "2026-09-10" && schedTaskRow?.baselineStart === "2026-09-01" && schedTaskRow?.baselineEnd === "2026-09-10", `→ ${JSON.stringify(schedTaskRow && { s: schedTaskRow.startDate, e: schedTaskRow.endDate, bs: schedTaskRow.baselineStart })}`);

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
  check("faktur ditandai voidedAt", Boolean(vdDocsB.json?.docs?.find((d) => d.id === vdInvB.json.id)?.voidedAt));
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
  // Filter rentang grafik dashboard (Fase 12d): 7 hari valid, di bawahnya di-clamp.
  const duTrend7 = await owner("GET", `/api/tenants/${tenantId}/reports/sales-daily?days=7`);
  check("rentang 7 hari diterima apa adanya", duTrend7.status === 200 && duTrend7.json?.days === 7);
  const duTrendMin = await owner("GET", `/api/tenants/${tenantId}/reports/sales-daily?days=1`);
  check("parameter days di-clamp minimal 7", duTrendMin.json?.days === 7);
  const duTrendViewer = await viewer("GET", `/api/tenants/${tenantId}/reports/sales-daily`);
  check("viewer boleh membaca tren penjualan (200)", duTrendViewer.status === 200);

  // Laporan penjualan analitik (Fase 5h): agregat per produk & per pelanggan.
  const salesAnalytics = await owner("GET", `/api/tenants/${tenantId}/reports/sales-analytics?from=2026-01-01&to=2026-12-31`);
  check(
    "laporan penjualan analitik 200: total = jumlah omzet produk, ada baris produk & pelanggan",
    salesAnalytics.status === 200 &&
      Array.isArray(salesAnalytics.json?.byProduct) &&
      salesAnalytics.json.byProduct.length > 0 &&
      Array.isArray(salesAnalytics.json?.byCustomer) &&
      salesAnalytics.json.byCustomer.length > 0 &&
      salesAnalytics.json.byProduct.every((r) => r.qty > 0 && r.revenue > 0),
    `→ ${JSON.stringify({ total: salesAnalytics.json?.totalRevenue, np: salesAnalytics.json?.byProduct?.length, nc: salesAnalytics.json?.byCustomer?.length })}`,
  );
  check(
    "laporan penjualan: byProduct terurut menurun berdasarkan omzet",
    salesAnalytics.json.byProduct.every((r, i, arr) => i === 0 || arr[i - 1].revenue >= r.revenue),
  );
  const salesAnalyticsViewer = await viewer("GET", `/api/tenants/${tenantId}/reports/sales-analytics`);
  check("viewer boleh membaca laporan penjualan (200)", salesAnalyticsViewer.status === 200);

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
  // Fase 11c: tanya laporan bahasa natural (read-only, semua anggota).
  const aiLaporanAnon = await fetch(`${BASE}/api/tenants/${tenantId}/ai/laporan`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: "berapa laba bulan ini?" }),
  });
  check("AI laporan tanpa sesi DITOLAK 401", aiLaporanAnon.status === 401, `→ HTTP ${aiLaporanAnon.status}`);
  const aiLaporan = await viewer("POST", `/api/tenants/${tenantId}/ai/laporan`, { question: "berapa laba bulan ini?" });
  check(
    "AI laporan (viewer) membalas 200 (produksi) ATAU 503 binding-absent",
    aiLaporan.status === 200 || (aiLaporan.status === 503 && aiLaporan.json?.detail === "binding-absent"),
    `→ ${aiLaporan.status} ${JSON.stringify(aiLaporan.json)}`,
  );

  // --- Arus kas (Fase 2b-1) -------------------------------------------------------
  console.log("12. Arus kas");
  // Konteks: modal 50jt (2/7) + penjualan tunai 2,5jt (3/7) + terima pembayaran 499,5rb (5/7)
  // + jurnal pasca tutup buku 1rb (15/7). Tidak ada kas keluar.
  const cf = await owner("GET", `/api/tenants/${tenantId}/reports/cash-flow?from=2026-07-03&to=2026-07-31`);
  check(
    "arus kas: saldo awal 50jt, masuk 3.300.500, keluar 10rb, akhir 53.290.500",
    cf.status === 200 &&
      cf.json?.openingBalance === 50_000_000 &&
      cf.json?.totalIn === 3_300_500 &&
      cf.json?.totalOut === 10_000 &&
      cf.json?.closingBalance === 53_290_500,
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
  // --- Dashboard kustom, tren bulanan, ekspor Excel & laporan terjadwal (Fase 7h) ---
  // Dijalankan SEBELUM cron trial-expiry (bagian 14) selagi tenant utama masih
  // dapat menulis; memakai faktur Juli yang sudah ada.
  console.log("13b. Dashboard kustom: tren bulanan + laporan terjadwal (Fase 7h)");
  const monthly7h = await owner("GET", `/api/tenants/${tenantId}/reports/sales-monthly?months=6`);
  check("tren penjualan bulanan 200 + array", monthly7h.status === 200 && Array.isArray(monthly7h.json?.rows));
  const analytics7h = await owner("GET", `/api/tenants/${tenantId}/reports/sales-analytics?from=2026-07-01&to=2026-07-31`);
  check("data laporan penjualan (sumber ekspor Excel) 200", analytics7h.status === 200 && Array.isArray(analytics7h.json?.byProduct));
  const snapList0 = await owner("GET", `/api/tenants/${tenantId}/report-snapshots`);
  check("daftar laporan terjadwal 200 + array", snapList0.status === 200 && Array.isArray(snapList0.json?.snapshots));
  const recapViewer = await viewer("POST", `/api/tenants/${tenantId}/report-snapshots/run`, { period: "2026-07" });
  check("viewer DITOLAK menyusun rekap (403)", recapViewer.status === 403, `→ ${recapViewer.status}`);
  const recapBad = await owner("POST", `/api/tenants/${tenantId}/report-snapshots/run`, { period: "2026/07" });
  check("periode rekap tak valid DITOLAK 400", recapBad.status === 400);
  const recap7h = await owner("POST", `/api/tenants/${tenantId}/report-snapshots/run`, { period: "2026-07" });
  check(
    "susun rekap Juli 200 + ada omzet & faktur",
    recap7h.status === 200 && recap7h.json?.summary?.totalRevenue > 0 && recap7h.json?.summary?.invoiceCount >= 1,
    `→ ${JSON.stringify(recap7h.json?.summary)}`,
  );
  const recap7h2 = await owner("POST", `/api/tenants/${tenantId}/report-snapshots/run`, { period: "2026-07" });
  check("rekap idempoten (jalankan ulang 200)", recap7h2.status === 200);
  const snapList1 = await owner("GET", `/api/tenants/${tenantId}/report-snapshots`);
  const julSnaps = (snapList1.json?.snapshots ?? []).filter((s) => s.period === "2026-07");
  check("rekap Juli tersimpan tepat 1 (idempoten UNIQUE kind+period)", julSnaps.length === 1, `→ ${julSnaps.length}`);
  check("snapshot omzet konsisten dengan hasil run", julSnaps[0]?.summary?.totalRevenue === recap7h.json?.summary?.totalRevenue);

  // --- Ekspor penuh & backup Google Drive (Fase 8b) --------------------------------
  console.log("13c. Ekspor penuh & backup Google Drive (Fase 8b)");
  const exp1 = await owner("GET", `/api/tenants/${tenantId}/export/full`);
  check("ekspor penuh 200 + berkas ZIP (magic PK)", exp1.status === 200 && exp1.text.startsWith("PK"));
  check("ZIP memuat manifest.json + CSV jurnal", exp1.text.includes("manifest.json") && exp1.text.includes("data/journal_entries.csv"));
  check("ZIP memuat CSV faktur & produk", exp1.text.includes("data/invoices.csv") && exp1.text.includes("data/products.csv"));
  const expViewer = await viewer("GET", `/api/tenants/${tenantId}/export/full`);
  check("viewer DITOLAK ekspor penuh (403)", expViewer.status === 403);
  const drvStatus = await owner("GET", `/api/tenants/${tenantId}/drive/status`);
  check("status Drive 200: belum dikonfigurasi (tanpa secret)", drvStatus.status === 200 && drvStatus.json?.configured === false && drvStatus.json?.connected === false);
  const drvConnect = await owner("GET", `/api/tenants/${tenantId}/drive/connect`);
  check("sambung Drive tanpa konfigurasi DITOLAK 503", drvConnect.status === 503);
  const drvBackup = await owner("POST", `/api/tenants/${tenantId}/drive/backup-now`);
  check("backup Drive tanpa konfigurasi DITOLAK 503", drvBackup.status === 503);

  // --- Pengerasan hasil audit (Fase 9a) -------------------------------------
  console.log("13d. Pengerasan hasil audit (Fase 9a)");

  // Paginasi keyset buku besar: jendela terbaru + openingBalance + kursor.
  const lgFull = await owner("GET", `/api/tenants/${tenantId}/ledger/${kas.id}`);
  check(
    "buku besar penuh: 200, openingBalance 0, tanpa kursor lanjutan",
    lgFull.status === 200 && lgFull.json?.openingBalance === 0 && lgFull.json?.nextCursor === null,
    `→ ${lgFull.status} opening=${lgFull.json?.openingBalance} cursor=${lgFull.json?.nextCursor}`,
  );
  check("akun kas punya cukup baris untuk uji paginasi (≥6)", (lgFull.json?.entries?.length ?? 0) >= 6);
  const lgWin = await owner("GET", `/api/tenants/${tenantId}/ledger/${kas.id}?limit=3`);
  check(
    "jendela limit=3: berisi 3 baris TERBARU + kursor lanjutan",
    lgWin.status === 200 && lgWin.json?.entries?.length === 3 && typeof lgWin.json?.nextCursor === "string",
  );
  check("saldo akhir jendela = saldo akhir buku penuh", lgWin.json?.balance === lgFull.json?.balance);
  check(
    "saldo berjalan baris pertama jendela konsisten dengan openingBalance",
    lgWin.json?.entries?.[0]?.balance ===
      lgWin.json?.openingBalance + lgWin.json?.entries?.[0]?.debit - lgWin.json?.entries?.[0]?.credit,
  );
  const lgOlder = await owner(
    "GET",
    `/api/tenants/${tenantId}/ledger/${kas.id}?limit=3&before=${encodeURIComponent(lgWin.json?.nextCursor ?? "")}`,
  );
  check(
    "halaman lebih lama: saldo akhirnya = openingBalance halaman terbaru",
    lgOlder.status === 200 && lgOlder.json?.balance === lgWin.json?.openingBalance,
    `→ ${lgOlder.status} ${lgOlder.json?.balance} vs ${lgWin.json?.openingBalance}`,
  );
  const lgBadCur = await owner("GET", `/api/tenants/${tenantId}/ledger/${kas.id}?before=kursor-ngawur`);
  check("kursor buku besar tak valid DITOLAK 400", lgBadCur.status === 400);
  const lgClamp = await owner("GET", `/api/tenants/${tenantId}/ledger/${kas.id}?limit=999999`);
  check("limit di luar batas di-clamp (tetap 200)", lgClamp.status === 200);

  // Validasi Zod pada input yang dulu dikoersi manual.
  const thrBad = await owner("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount: "sejuta" });
  check("ambang persetujuan non-angka DITOLAK 400", thrBad.status === 400);
  const thrNeg = await owner("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount: -5 });
  check("ambang persetujuan negatif DITOLAK 400", thrNeg.status === 400);
  const thrFrac = await owner("POST", `/api/tenants/${tenantId}/approval-threshold`, { amount: 10.5 });
  check("ambang persetujuan pecahan DITOLAK 400", thrFrac.status === 400);
  const rejBadNote = await owner("POST", `/api/tenants/${tenantId}/approvals/tidak-ada/reject`, {
    note: "x".repeat(301),
  });
  check("catatan penolakan >300 karakter DITOLAK 400", rejBadNote.status === 400);
  const mtBadDate = await owner("POST", `/api/tenants/${tenantId}/maintenance/run`, { date: "31-12-2026" });
  check("pemicu servis dengan tanggal salah format DITOLAK 400", mtBadDate.status === 400);
  const impEmpty = await owner("POST", `/api/tenants/${tenantId}/contacts/import`, { rows: [] });
  check(
    "impor tanpa baris DITOLAK 400 + pesan Indonesia",
    impEmpty.status === 400 && /Tidak ada baris/.test(impEmpty.json?.error ?? ""),
  );
  const impOver = await owner("POST", `/api/tenants/${tenantId}/contacts/import`, {
    rows: Array.from({ length: 501 }, (_, i) => ({ name: `Kontak ${i}` })),
  });
  check(
    "impor >500 baris DITOLAK 400 + pesan Indonesia",
    impOver.status === 400 && /Maksimal 500/.test(impOver.json?.error ?? ""),
  );

  // Kursor audit log: riwayat lebih lama dari 100 kini terjangkau.
  const al1 = await owner("GET", `/api/tenants/${tenantId}/audit-logs`);
  check(
    "audit log 200 + bidang nextCursor hadir + maksimal 100 baris",
    al1.status === 200 && "nextCursor" in (al1.json ?? {}) && (al1.json?.logs?.length ?? 0) <= 100,
  );
  check("aktivitas tenant sudah >100 → kursor lanjutan tersedia", typeof al1.json?.nextCursor === "string");
  const al2 = await owner(
    "GET",
    `/api/tenants/${tenantId}/audit-logs?before=${encodeURIComponent(al1.json?.nextCursor ?? "")}`,
  );
  check(
    "halaman audit lebih lama 200 + berisi baris yang memang lebih tua",
    al2.status === 200 &&
      (al2.json?.logs?.length ?? 0) >= 1 &&
      al2.json?.logs?.[0]?.createdAt <= al1.json?.logs?.[al1.json.logs.length - 1]?.createdAt,
  );
  const alBadCur = await owner("GET", `/api/tenants/${tenantId}/audit-logs?before=ngawur`);
  check("kursor audit log tak valid DITOLAK 400", alBadCur.status === 400);

  // Endpoint berat tetap normal di bawah pembatas longgar per pengguna.
  const rlReport = await owner("GET", `/api/tenants/${tenantId}/reports/income-statement?from=2026-01-01&to=2026-12-31`);
  check("laporan laba rugi tetap 200 di bawah pembatas per pengguna", rlReport.status === 200);

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

  // Anti lock-in (Fase 8b): data TETAP bisa diekspor walau langganan berakhir.
  const expPastDue = await owner("GET", `/api/tenants/${tenantId}/export/full`);
  check("ekspor penuh TETAP BISA saat past_due (200 + ZIP)", expPastDue.status === 200 && expPastDue.text.startsWith("PK"));
  check("ekspor saat past_due tetap memuat manifest", expPastDue.text.includes("manifest.json"));

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

  // --- Keuangan lanjut (Fase 5d): template jurnal + rekonsiliasi + penutup ------
  console.log("14c. Keuangan lanjut (template, rekonsiliasi bank, jurnal penutup)");
  const todayStr = new Date().toISOString().slice(0, 10);

  const tplBad = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/journal-templates`, {
    name: "Template pincang",
    lines: [
      { accountId: dwSewa.id, debit: 100_000, credit: 0 },
      { accountId: dwKas.id, debit: 0, credit: 90_000 },
    ],
  });
  check("template TIDAK seimbang DITOLAK 400", tplBad.status === 400);

  const tplOk = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/journal-templates`, {
    name: "Sewa ruko bulanan",
    memo: "Sewa ruko",
    lines: [
      { accountId: dwSewa.id, debit: 750_000, credit: 0 },
      { accountId: dwKas.id, debit: 0, credit: 750_000 },
    ],
    schedule: "monthly",
    nextRunDate: todayStr,
  });
  check("template jurnal berulang dibuat 201", tplOk.status === 201, `→ ${JSON.stringify(tplOk.json)}`);

  const tplList = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/journal-templates`);
  check(
    "daftar template berisi 1 dengan kode akun ter-join & jadwal bulanan",
    tplList.status === 200 &&
      tplList.json?.templates?.length === 1 &&
      tplList.json.templates[0].lines[0]?.accountCode === "5-3000" &&
      tplList.json.templates[0].schedule === "monthly",
    `→ ${JSON.stringify(tplList.json)}`,
  );

  const tplPost = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/journal-templates/${tplOk.json.id}/post`, {});
  check("terbitkan template manual → jurnal 201 dengan nomor", tplPost.status === 201 && Boolean(tplPost.json?.entryNo), `→ ${JSON.stringify(tplPost.json)}`);

  // Rekonsiliasi: 1 baris cocok otomatis (nominal −750rb, tanggal sama dengan
  // jurnal kas di atas), 1 baris tanpa pasangan.
  const reconImport = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/bank-recon/import`, {
    accountId: dwKas.id,
    items: [
      { date: todayStr, description: "TRSF SEWA RUKO", amount: -750_000 },
      { date: todayStr, description: "BIAYA ADMIN BANK", amount: -123_456 },
    ],
  });
  check(
    "impor mutasi bank 201: 2 baris, ≥1 cocok otomatis (nominal+tanggal)",
    reconImport.status === 201 && reconImport.json?.imported === 2 && reconImport.json?.autoMatched >= 1,
    `→ ${JSON.stringify(reconImport.json)}`,
  );

  const recon1 = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/bank-recon?accountId=${dwKas.id}`);
  const unmatchedItem = recon1.json?.items?.find((i) => i.matchedJournalLineId === null);
  check(
    "ringkasan rekonsiliasi benar (total 2, ada yang belum cocok) + kandidat baris jurnal tersedia",
    recon1.status === 200 && recon1.json?.summary?.total === 2 && recon1.json?.summary?.unmatched >= 1 && (recon1.json?.unmatchedLines?.length ?? 0) > 0,
    `→ ${JSON.stringify(recon1.json?.summary)}`,
  );

  const manualLine = recon1.json.unmatchedLines[0];
  const doMatch = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/bank-recon/${unmatchedItem.id}/match`, {
    journalLineId: manualLine.id,
  });
  check("pencocokan manual 200", doMatch.status === 200, `→ ${JSON.stringify(doMatch.json)}`);
  const doUnmatch = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/bank-recon/${unmatchedItem.id}/unmatch`, {});
  const recon2 = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/bank-recon?accountId=${dwKas.id}`);
  check(
    "lepas pencocokan 200 dan ringkasan kembali (1 cocok, 1 belum)",
    doUnmatch.status === 200 && recon2.json?.summary?.matched === 1 && recon2.json?.summary?.unmatched === 1,
    `→ ${JSON.stringify(recon2.json?.summary)}`,
  );

  // Jurnal penutup: saldo P/L (2× sewa 750rb = rugi 1,5jt) dinolkan ke Laba Ditahan.
  const closing = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/closing-entry`, { asOf: todayStr });
  check(
    "jurnal penutup 201 dengan rugi bersih −1.500.000",
    closing.status === 201 && closing.json?.netProfit === -1_500_000,
    `→ ${JSON.stringify(closing.json)}`,
  );
  const plAfterClose = await admin(
    "GET",
    `/api/tenants/${dewiOwn.tenantId}/reports/income-statement?from=${todayStr}&to=${todayStr}`,
  );
  check(
    "setelah penutup: total beban periode = 0 (saldo P/L nol)",
    plAfterClose.status === 200 && plAfterClose.json?.totalExpense === 0 && plAfterClose.json?.totalIncome === 0,
    `→ ${JSON.stringify(plAfterClose.json && { i: plAfterClose.json.totalIncome, e: plAfterClose.json.totalExpense })}`,
  );
  const closingAgain = await admin("POST", `/api/tenants/${dewiOwn.tenantId}/closing-entry`, { asOf: todayStr });
  check("jurnal penutup kedua DITOLAK 400 (tidak ada saldo tersisa)", closingAgain.status === 400);

  const tplDel = await admin("DELETE", `/api/tenants/${dewiOwn.tenantId}/journal-templates/${tplOk.json.id}`);
  const tplList2 = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/journal-templates`);
  check("hapus template 200 dan daftar kosong", tplDel.status === 200 && tplList2.json?.templates?.length === 0);

  const tbAfterClose = await admin("GET", `/api/tenants/${dewiOwn.tenantId}/trial-balance`);
  check("neraca saldo tetap seimbang setelah seluruh alur 5d", tbAfterClose.status === 200 && tbAfterClose.json?.balanced === true);

  // --- Fase 10b: akun demo publik baca-saja ------------------------------------
  // Perusahaan demo dites pada tenant comped "Cabang Dewi" (via var
  // DEMO_TENANT_SLUG) — pool DB tenant lokal sudah terpakai penuh, dan status
  // aktif permanen menjamin penolakan tulis datang dari peran (403), bukan
  // mode baca-saja langganan (402).
  console.log("14g. Akun demo publik baca-saja (Fase 10b)");
  const demoVisitor = makeClient();
  const demoIn = await demoVisitor("POST", "/api/auth/demo");
  check("masuk demo 200 tanpa mendaftar", demoIn.status === 200, `→ ${JSON.stringify(demoIn.json)}`);
  const demoMe = await demoVisitor("GET", "/api/auth/me");
  const demoMembership = demoMe.json?.memberships?.[0];
  check(
    "sesi demo = viewer di perusahaan demo + flag isDemo",
    demoMe.status === 200 &&
      demoMe.json?.user?.isDemo === true &&
      demoMe.json?.memberships?.length === 1 &&
      demoMembership?.role === "viewer" &&
      (demoMembership?.tenantSlug ?? "").startsWith("cabang-dewi"),
    `→ ${JSON.stringify(demoMe.json?.user)} ${JSON.stringify(demoMembership)}`,
  );
  const demoRead = await demoVisitor("GET", `/api/tenants/${demoMembership?.tenantId}/products`);
  check("demo boleh membaca data tenant (200)", demoRead.status === 200, `→ HTTP ${demoRead.status}`);
  const demoWrite = await demoVisitor("POST", `/api/tenants/${demoMembership?.tenantId}/products`, {});
  check("demo DITOLAK menulis data tenant (403)", demoWrite.status === 403, `→ HTTP ${demoWrite.status}`);
  const demoCompany = await demoVisitor("POST", "/api/auth/companies", { companyName: "Usaha Demo Baru" });
  check("demo DITOLAK membuat perusahaan baru (403)", demoCompany.status === 403, `→ HTTP ${demoCompany.status}`);
  const demoProfile = await demoVisitor("PATCH", "/api/auth/profile", { name: "Iseng" });
  check("demo DITOLAK mengubah profil (403)", demoProfile.status === 403, `→ HTTP ${demoProfile.status}`);
  const demo2fa = await demoVisitor("POST", "/api/auth/2fa/setup");
  check("demo DITOLAK setup 2FA (403)", demo2fa.status === 403, `→ HTTP ${demo2fa.status}`);
  const demoAgain = await makeClient()("POST", "/api/auth/demo");
  check("masuk demo kedua 200 (idempoten — user demo dipakai ulang)", demoAgain.status === 200, `→ HTTP ${demoAgain.status}`);

  // --- Fase 10c: void & pembalikan transaksi terposting -------------------------
  // Semua diuji pada tenant comped (aktif permanen). Setiap jenis pembalikan
  // diikuti asersi neraca saldo seimbang (assertTB).
  console.log("14h. Void & pembalikan transaksi terposting (Fase 10c)");
  const vT = `/api/tenants/${dewiOwn.tenantId}`;
  const todayISO = new Date().toISOString().slice(0, 10);
  const assertTB = async (label) => {
    const tb = await admin("GET", `${vT}/trial-balance`);
    check(
      `neraca saldo seimbang ${label}`,
      tb.status === 200 && tb.json?.balanced === true,
      `→ ${JSON.stringify(tb.json && { d: tb.json.totalDebit, k: tb.json.totalCredit })}`,
    );
  };

  // Setup: pemasok+pelanggan, stok 10 pcs produk comped (CMP-001).
  const vProdId = compedWrite.json.id;
  const vWhs = await admin("GET", `${vT}/warehouses`);
  const vWh = vWhs.json.items[0];
  const vCust = await admin("POST", `${vT}/contacts`, { type: "customer", name: "Pelanggan Void" });
  const vSupp = await admin("POST", `${vT}/contacts`, { type: "supplier", name: "Pemasok Void" });
  const vBuy = await admin("POST", `${vT}/purchases`, {
    contactId: vSupp.json.id, invoiceDate: todayISO, taxRate: 0, warehouseId: vWh.id,
    lines: [{ productId: vProdId, qty: 10, unitPrice: 500 }],
  });
  check("setup: stok 10 pcs dibeli (201)", vBuy.status === 201, `→ ${JSON.stringify(vBuy.json)}`);

  // 1) Void pembayaran: jual 5 pcs → bayar sebagian → hapus pembayaran.
  const vSell = await admin("POST", `${vT}/invoices`, {
    contactId: vCust.json.id, invoiceDate: todayISO, taxRate: 0, warehouseId: vWh.id,
    lines: [{ productId: vProdId, qty: 5, unitPrice: 1000 }],
  });
  check("faktur jual 5 pcs 201 (total 5.000)", vSell.status === 201 && vSell.json?.total === 5000);
  const vPay1 = await admin("POST", `${vT}/payments`, {
    refType: "invoice", refId: vSell.json.id, accountId: dwKas.id, amount: 2000, paymentDate: todayISO,
  });
  check("bayar sebagian 2.000 (201)", vPay1.status === 201);
  const vPayList1 = await admin("GET", `${vT}/payments?refType=invoice&refId=${vSell.json.id}`);
  const vPayRow = vPayList1.json?.payments?.[0];
  check("daftar pembayaran dokumen memuat 1 baris aktif", vPayList1.status === 200 && vPayList1.json?.payments?.length === 1 && vPayRow?.voidedAt === null);
  const vVoidPay = await admin("POST", `${vT}/payments/${vPayRow.id}/void`, {});
  check(
    "void pembayaran 200 → sisa tagihan pulih (paidAmount 0)",
    vVoidPay.status === 200 && vVoidPay.json?.paidAmount === 0 && Boolean(vVoidPay.json?.reversalEntryNo),
    `→ ${JSON.stringify(vVoidPay.json)}`,
  );
  await assertTB("setelah void pembayaran");
  const vPayList2 = await admin("GET", `${vT}/payments?refType=invoice&refId=${vSell.json.id}`);
  check(
    "baris pembayaran tertanda DIHAPUS (voidedAt + jurnal pembalik)",
    Boolean(vPayList2.json?.payments?.[0]?.voidedAt) && Boolean(vPayList2.json?.payments?.[0]?.voidJournalNo),
  );
  const vVoidPayAgain = await admin("POST", `${vT}/payments/${vPayRow.id}/void`, {});
  check("void pembayaran kedua DITOLAK 400", vVoidPayAgain.status === 400);
  const vPay2 = await admin("POST", `${vT}/payments`, {
    refType: "invoice", refId: vSell.json.id, accountId: dwKas.id, amount: 5000, paymentDate: todayISO,
  });
  check("bayar ulang penuh setelah void 201 → lunas", vPay2.status === 201 && vPay2.json?.settled === true);

  // 2) Void pembayaran valas: selisih kurs ikut terbalik bersih.
  await admin("PUT", `${vT}/currencies`, { code: "USD", name: "Dolar AS", rate: 15_000 });
  const vUsdInv = await admin("POST", `${vT}/invoices`, {
    contactId: vCust.json.id, invoiceDate: todayISO, taxRate: 0, warehouseId: vWh.id,
    currency: "USD", exchangeRate: 15_000,
    lines: [{ productId: vProdId, qty: 1, unitPrice: 10 }],
  });
  check("faktur USD 10 @15.000 → 150.000 IDR (201)", vUsdInv.status === 201 && vUsdInv.json?.total === 150_000);
  const vUsdPay = await admin("POST", `${vT}/payments`, {
    refType: "invoice", refId: vUsdInv.json.id, accountId: dwKas.id,
    foreignAmount: 10, exchangeRate: 15_500, paymentDate: todayISO,
  });
  check("pelunasan USD @15.500 → selisih kurs laba 5.000", vUsdPay.status === 201 && vUsdPay.json?.forexGain === 5000);
  const vUsdPayList = await admin("GET", `${vT}/payments?refType=invoice&refId=${vUsdInv.json.id}`);
  const vUsdVoid = await admin("POST", `${vT}/payments/${vUsdPayList.json.payments[0].id}/void`, {});
  check("void pembayaran valas 200 (3 baris jurnal terbalik utuh)", vUsdVoid.status === 200 && vUsdVoid.json?.paidAmount === 0);
  await assertTB("setelah void pembayaran valas");

  // 3) Balik jurnal manual + guard-nya.
  const vJrn = await admin("POST", `${vT}/journal-entries`, {
    entryDate: todayISO, memo: "Beban parkir kantor",
    lines: [
      { accountId: dwSewa.id, debit: 100_000, credit: 0 },
      { accountId: dwKas.id, debit: 0, credit: 100_000 },
    ],
  });
  check("jurnal manual 201", vJrn.status === 201);
  const vRevEarly = await admin("POST", `${vT}/journal-entries/${vJrn.json.id}/reverse`, { date: "2020-01-01" });
  check("balik dengan tanggal SEBELUM jurnal asal DITOLAK 400", vRevEarly.status === 400);
  const vRev = await admin("POST", `${vT}/journal-entries/${vJrn.json.id}/reverse`, {});
  check("balik jurnal manual 201 + nomor pembalik", vRev.status === 201 && Boolean(vRev.json?.reversalEntryNo), `→ ${JSON.stringify(vRev.json)}`);
  await assertTB("setelah balik jurnal manual");
  const vJrnList = await admin("GET", `${vT}/journal-entries?q=${encodeURIComponent("Beban parkir")}`);
  const vJrnRow = vJrnList.json?.entries?.find((e) => e.id === vJrn.json.id);
  check(
    "daftar jurnal memuat tautan dua arah (reversedByEntryNo terisi)",
    vJrnRow?.reversedByEntryNo === vRev.json.reversalEntryNo,
    `→ ${JSON.stringify(vJrnRow && { r1: vJrnRow.reversedByEntryNo, r2: vJrnRow.reversesEntryNo })}`,
  );
  const vRevAgain = await admin("POST", `${vT}/journal-entries/${vJrn.json.id}/reverse`, {});
  check("balik jurnal kedua kali DITOLAK 400", vRevAgain.status === 400);
  const vRevList = await admin("GET", `${vT}/journal-entries?q=${encodeURIComponent("Pembalikan")}`);
  const vRevRow = vRevList.json?.entries?.find((e) => e.reversesEntryNo === vJrn.json.entryNo);
  const vRevOfRev = await admin("POST", `${vT}/journal-entries/${vRevRow.id}/reverse`, {});
  check("membalik jurnal PEMBALIK DITOLAK 400", vRevOfRev.status === 400);
  const vBuyJrnList = await admin("GET", `${vT}/journal-entries?q=${encodeURIComponent(vBuy.json.docNo)}`);
  const vBuyJrn = vBuyJrnList.json?.entries?.[0];
  const vRevDoc = await admin("POST", `${vT}/journal-entries/${vBuyJrn.id}/reverse`, {});
  check(
    "membalik jurnal ber-dokumen DITOLAK 400 dengan label dokumen",
    vRevDoc.status === 400 && /faktur pembelian/.test(vRevDoc.json?.error ?? ""),
    `→ ${JSON.stringify(vRevDoc.json)}`,
  );

  // 4) Void penggajian: kasbon pulih, ad-hoc lepas, run ulang boleh.
  const vEmp = await admin("POST", `${vT}/employees`, {
    name: "Karyawan Void", ptkpStatus: "TK/0", baseSalary: 5_000_000, allowances: 0,
  });
  check("karyawan dibuat 201", vEmp.status === 201);
  const vLoan = await admin("POST", `${vT}/employee-loans`, {
    employeeId: vEmp.json.id, name: "Kasbon uji void", principal: 1_200_000, monthlyDeduction: 100_000,
    cashAccountId: dwKas.id, loanDate: todayISO,
  });
  check("kasbon 1,2jt dicairkan 201", vLoan.status === 201);
  const vAdj = await admin("POST", `${vT}/payroll-adjustments`, {
    period: "2026-05", employeeId: vEmp.json.id, name: "Bonus uji void", amount: 50_000,
  });
  check("komponen ad-hoc 201", vAdj.status === 201);
  const vRun1 = await admin("POST", `${vT}/payroll-runs`, {
    period: "2026-05", cashAccountId: dwKas.id, paymentDate: todayISO,
  });
  check("penggajian 2026-05 berjalan 201", vRun1.status === 201, `→ ${JSON.stringify(vRun1.json)}`);
  const vLoans1 = await admin("GET", `${vT}/employee-loans`);
  check(
    "saldo kasbon terpotong cicilan (1,2jt → 1,1jt)",
    vLoans1.json?.loans?.find((l) => l.id === vLoan.json.id)?.balance === 1_100_000,
  );
  const vRun2 = await admin("POST", `${vT}/payroll-runs`, {
    period: "2026-06", cashAccountId: dwKas.id, paymentDate: todayISO,
  });
  check("penggajian 2026-06 berjalan 201", vRun2.status === 201);
  const vVoidOld = await admin("POST", `${vT}/payroll-runs/${vRun1.json.id}/void`, {});
  check("void run LAMA saat ada run lebih baru DITOLAK 400 (urutan mundur)", vVoidOld.status === 400);
  const vVoidNew = await admin("POST", `${vT}/payroll-runs/${vRun2.json.id}/void`, {});
  check("void run terbaru (2026-06) 200", vVoidNew.status === 200, `→ ${JSON.stringify(vVoidNew.json)}`);
  const vVoidMay = await admin("POST", `${vT}/payroll-runs/${vRun1.json.id}/void`, {});
  check("lalu void 2026-05 (kini terbaru) 200", vVoidMay.status === 200);
  await assertTB("setelah void penggajian");
  const vLoans2 = await admin("GET", `${vT}/employee-loans`);
  check(
    "saldo kasbon pulih persis ke 1,2jt setelah kedua run dibatalkan",
    vLoans2.json?.loans?.find((l) => l.id === vLoan.json.id)?.balance === 1_200_000,
    `→ ${vLoans2.json?.loans?.find((l) => l.id === vLoan.json.id)?.balance}`,
  );
  const vAdjAfter = await admin("GET", `${vT}/payroll-adjustments?period=2026-05`);
  check("komponen ad-hoc dilepas (runId null) setelah void", vAdjAfter.json?.adjustments?.[0]?.runId === null);
  const vRunAgain = await admin("POST", `${vT}/payroll-runs`, {
    period: "2026-05", cashAccountId: dwKas.id, paymentDate: todayISO,
  });
  check("periode 2026-05 bisa digaji ULANG setelah void (201)", vRunAgain.status === 201, `→ ${JSON.stringify(vRunAgain.json)}`);

  // 5) POS refund: kas laci menyusut, retur tercatat, guard qty & non-POS.
  const vShift = await admin("POST", `${vT}/pos/shift/open`, { warehouseId: vWh.id, openingCash: 10_000 });
  check("shift kasir dibuka 201", vShift.status === 201);
  const vPosSale = await admin("POST", `${vT}/pos/sales`, {
    shiftId: vShift.json.id, taxRate: 0, cashReceived: 2000,
    lines: [{ productId: vProdId, qty: 2, unitPrice: 1000 }],
  });
  check("penjualan POS 2 pcs (201, total 2.000)", vPosSale.status === 201 && vPosSale.json?.total === 2000);
  const vReceipts = await admin("GET", `${vT}/pos/receipts?q=${encodeURIComponent(vPosSale.json.invoiceNo)}`);
  const vReceipt = vReceipts.json?.receipts?.[0];
  check(
    "daftar struk memuat struk POS dengan qty bisa-refund 2",
    vReceipts.status === 200 && vReceipt?.invoiceNo === vPosSale.json.invoiceNo && vReceipt?.lines?.[0]?.qtyReturnable === 2,
  );
  const vRefundOver = await admin("POST", `${vT}/pos/refunds`, {
    invoiceId: vReceipt.id, lines: [{ productId: vProdId, qty: 5 }],
  });
  check("refund melebihi qty struk DITOLAK 400", vRefundOver.status === 400);
  const vRefundNonPos = await admin("POST", `${vT}/pos/refunds`, {
    invoiceId: vSell.json.id, lines: [{ productId: vProdId, qty: 1 }],
  });
  check("refund faktur NON-POS DITOLAK 400", vRefundNonPos.status === 400);
  const vRefund = await admin("POST", `${vT}/pos/refunds`, {
    invoiceId: vReceipt.id, lines: [{ productId: vProdId, qty: 1 }],
  });
  check("refund 1 pcs 201 (Rp 1.000 keluar dari laci)", vRefund.status === 201 && vRefund.json?.total === 1000, `→ ${JSON.stringify(vRefund.json)}`);
  await assertTB("setelah refund POS");
  const vShiftAfter = await admin("GET", `${vT}/pos/shift`);
  check(
    "kas laci shift menyusut sebesar refund (10.000 + 2.000 − 1.000)",
    vShiftAfter.json?.shift?.expectedCash === 11_000,
    `→ ${vShiftAfter.json?.shift?.expectedCash}`,
  );
  const vPosPayList = await admin("GET", `${vT}/payments?refType=invoice&refId=${vReceipt.id}`);
  const vPosPayRow = vPosPayList.json?.payments?.find((p) => !p.voidedAt);
  const vPosPayVoid = await admin("POST", `${vT}/payments/${vPosPayRow.id}/void`, {});
  check(
    "void pembayaran POS DITOLAK 400 (arahkan ke Refund Kasir)",
    vPosPayVoid.status === 400 && /Kasir/.test(vPosPayVoid.json?.error ?? ""),
    `→ ${JSON.stringify(vPosPayVoid.json)}`,
  );

  // --- Fase 10d: masuk/daftar via Google ----------------------------------------
  // Instance utama TANPA kredensial (degradasi anggun); jalur positif diuji
  // pada instance wrangler kedua ber-kredensial dummy (drive/status pada
  // instance utama tetap mengasersi configured=false).
  console.log("14i. Masuk via Google (Fase 10d)");
  const gAvail = await fetch(`${BASE}/api/auth/google/available`);
  check("available=false tanpa kredensial", gAvail.status === 200 && (await gAvail.json()).available === false);
  const gStart = await fetch(`${BASE}/api/auth/google`, { redirect: "manual" });
  check("mulai alur Google tanpa kredensial DITOLAK 503", gStart.status === 503);
  const gCb = await fetch(`${BASE}/api/auth/google/callback?code=x&state=palsu`, { redirect: "manual" });
  check(
    "callback tanpa kredensial → redirect anggun ke /masuk",
    gCb.status === 302 && (gCb.headers.get("location") ?? "").includes("google=belum-dikonfigurasi"),
  );

  {
    const persist2 = mkdtempSync(join(tmpdir(), "erpindo-smoke-g-"));
    const PORT2 = PORT + 1;
    const child2 = spawn(
      "pnpm",
      [
        "exec", "wrangler", "dev", "-c", "../../wrangler.dev.jsonc",
        "--port", String(PORT2), "--persist-to", persist2,
        "--show-interactive-dev-session=false",
        "--var", "GOOGLE_CLIENT_ID:dummy-client-id",
        "--var", "GOOGLE_CLIENT_SECRET:dummy-secret",
      ],
      { cwd: apiDir, stdio: ["ignore", "ignore", "ignore"], env: { ...process.env, CI: "1" } },
    );
    try {
      const start2 = Date.now();
      let ready = false;
      while (Date.now() - start2 < 90_000) {
        try {
          const r = await fetch(`http://127.0.0.1:${PORT2}/api/health`);
          if (r.ok) { ready = true; break; }
        } catch { /* belum siap */ }
        await new Promise((r) => setTimeout(r, 500));
      }
      check("instance kedua (kredensial dummy) siap", ready);

      const g2Avail = await fetch(`http://127.0.0.1:${PORT2}/api/auth/google/available`);
      check("available=true dengan kredensial terpasang", (await g2Avail.json()).available === true);
      const g2Start = await fetch(`http://127.0.0.1:${PORT2}/api/auth/google`, { redirect: "manual" });
      const g2Loc = g2Start.headers.get("location") ?? "";
      check(
        "mulai alur → 302 ke consent Google dengan state bertanda tangan",
        g2Start.status === 302 && g2Loc.startsWith("https://accounts.google.com/o/oauth2/v2/auth") &&
          g2Loc.includes("state=login.") && g2Loc.includes(encodeURIComponent("/api/auth/google/callback")),
        `→ ${g2Start.status} ${g2Loc.slice(0, 120)}`,
      );
      const g2BadState = await fetch(`http://127.0.0.1:${PORT2}/api/auth/google/callback?code=x&state=login.palsu`, { redirect: "manual" });
      check("callback dengan state PALSU DITOLAK 400", g2BadState.status === 400);
      const g2Denied = await fetch(`http://127.0.0.1:${PORT2}/api/auth/google/callback?error=access_denied`, { redirect: "manual" });
      check(
        "consent dibatalkan pengguna → redirect ramah ke /masuk",
        g2Denied.status === 302 && (g2Denied.headers.get("location") ?? "").includes("google=dibatalkan"),
      );
    } finally {
      child2.kill("SIGTERM");
      setTimeout(() => child2.kill("SIGKILL"), 1500);
    }
  }

  // --- Fase 10e: admin platform + masukan pengguna + blog SEO ------------------
  // Budi (pemilik smoke) = admin platform (PLATFORM_ADMIN_EMAILS); Dewi bukan.
  console.log("14j. Admin platform + masukan + blog SEO (Fase 10e)");
  const aNoSession = await makeClient()("GET", "/api/admin/overview");
  check("admin/overview tanpa sesi DITOLAK 401", aNoSession.status === 401, `→ HTTP ${aNoSession.status}`);
  const aByDewi = await admin("GET", "/api/admin/overview");
  check("admin/overview oleh non-admin (Dewi) DITOLAK 403", aByDewi.status === 403, `→ HTTP ${aByDewi.status}`);
  const aOverview = await owner("GET", "/api/admin/overview");
  check(
    "admin/overview oleh admin platform (Budi) 200 + totals",
    aOverview.status === 200 && (aOverview.json?.totals?.tenants ?? 0) >= 1 && (aOverview.json?.totals?.users ?? 0) >= 1,
    `→ ${JSON.stringify(aOverview.json?.totals)}`,
  );
  const budiMe = await owner("GET", "/api/auth/me");
  check("Budi ditandai isPlatformAdmin=true di /me", budiMe.json?.user?.isPlatformAdmin === true);
  const aTenants = await owner("GET", "/api/admin/tenants?status=trial");
  check(
    "daftar tenant terfilter status=trial (semua hasil berstatus trial)",
    aTenants.status === 200 && Array.isArray(aTenants.json?.tenants) && aTenants.json.tenants.every((t) => t.status === "trial"),
    `→ ${aTenants.json?.tenants?.map((t) => t.status).join(",")}`,
  );

  // --- Fase 11a: infra & auto-migrasi skema tenant ---------------------------
  const infraByDewi = await admin("GET", "/api/admin/infra");
  check("admin/infra oleh non-admin (Dewi) DITOLAK 403", infraByDewi.status === 403, `→ HTTP ${infraByDewi.status}`);
  const infra = await owner("GET", "/api/admin/infra");
  check(
    "admin/infra 200 + mode DB + versi skema + tak ada tenant tertinggal",
    infra.status === 200 &&
      typeof infra.json?.dbMode === "string" &&
      infra.json?.schemaVersion >= 1 &&
      infra.json?.totalTenants >= 1 &&
      infra.json?.tenantsBehind === 0,
    `→ ${JSON.stringify({ dbMode: infra.json?.dbMode, v: infra.json?.schemaVersion, total: infra.json?.totalTenants, behind: infra.json?.tenantsBehind })}`,
  );
  check(
    "admin/infra: semua tenant di versi skema terkini (distribusi 1 entri = schemaVersion)",
    Array.isArray(infra.json?.versionDistribution) &&
      infra.json.versionDistribution.length === 1 &&
      infra.json.versionDistribution[0].v === infra.json.schemaVersion,
    `→ ${JSON.stringify(infra.json?.versionDistribution)}`,
  );
  // migrate-tenants idempoten: tenant baru sudah mutakhir → 0 dimigrasi, 0 gagal.
  const migrateByDewi = await admin("POST", "/api/admin/migrate-tenants");
  check("admin/migrate-tenants oleh non-admin DITOLAK 403", migrateByDewi.status === 403, `→ HTTP ${migrateByDewi.status}`);
  const migrate = await owner("POST", "/api/admin/migrate-tenants");
  check(
    "admin/migrate-tenants 200 + idempoten (0 gagal, semua tenant tercakup)",
    migrate.status === 200 && migrate.json?.failed === 0 && migrate.json?.total >= 1 && migrate.json?.migrated === 0,
    `→ ${JSON.stringify({ total: migrate.json?.total, migrated: migrate.json?.migrated, failed: migrate.json?.failed })}`,
  );

  // --- Fase 11b: billing langganan (tanpa kunci Midtrans → degradasi anggun) ---
  const billNoAuth = await makeClient()("GET", `/api/tenants/${tenantId}/billing`);
  check("billing tanpa sesi DITOLAK 401", billNoAuth.status === 401, `→ HTTP ${billNoAuth.status}`);
  const billStatus = await owner("GET", `/api/tenants/${tenantId}/billing`);
  check(
    "billing status 200 + configured=false + harga Rp389.000",
    billStatus.status === 200 && billStatus.json?.configured === false && billStatus.json?.pricePerMonth === 389000 && Array.isArray(billStatus.json?.invoices),
    `→ ${JSON.stringify({ configured: billStatus.json?.configured, price: billStatus.json?.pricePerMonth })}`,
  );
  const billCheckoutOwner = await owner("POST", `/api/tenants/${tenantId}/billing/checkout`);
  check("billing checkout tanpa konfigurasi Midtrans → 503", billCheckoutOwner.status === 503, `→ HTTP ${billCheckoutOwner.status}`);
  // Dewi = anggota admin (bukan owner) di tenant ini → ditolak mengatur langganan.
  const billCheckoutAdmin = await admin("POST", `/api/tenants/${tenantId}/billing/checkout`);
  check("billing checkout oleh non-Pemilik → 403", billCheckoutAdmin.status === 403, `→ HTTP ${billCheckoutAdmin.status}`);
  // Webhook tanpa kunci → diabaikan sopan (200), tak mengubah apa pun.
  const billWebhook = await makeClient()("POST", "/api/billing/notification", { order_id: "x", transaction_status: "settlement" });
  check("webhook billing tanpa kunci → 200 diabaikan", billWebhook.status === 200 && billWebhook.json?.ignored === true, `→ HTTP ${billWebhook.status}`);

  // Fase 11d: payment collection link (tanpa Midtrans → degradasi anggun).
  const plStatus = await owner("GET", `/api/tenants/${tenantId}/invoices/inv-x/payment-link`);
  check(
    "payment-link status 200 + configured=false + link null",
    plStatus.status === 200 && plStatus.json?.configured === false && plStatus.json?.link === null,
    `→ ${JSON.stringify(plStatus.json)}`,
  );
  const plCreate = await owner("POST", `/api/tenants/${tenantId}/invoices/inv-x/payment-link`);
  check("buat payment-link tanpa konfigurasi Midtrans → 503", plCreate.status === 503, `→ HTTP ${plCreate.status}`);
  const plViewer = await viewer("POST", `/api/tenants/${tenantId}/invoices/inv-x/payment-link`);
  check("buat payment-link oleh viewer → 403", plViewer.status === 403, `→ HTTP ${plViewer.status}`);
  const plAnon = await fetch(`${BASE}/api/tenants/${tenantId}/invoices/inv-x/payment-link`);
  check("payment-link status tanpa sesi → 401", plAnon.status === 401, `→ HTTP ${plAnon.status}`);

  // Masukan pengguna (dukungan) — Budi mengirim, lalu admin mengubah statusnya.
  const fbBad = await owner("POST", "/api/feedback", { category: "salah-kategori", message: "Halo dukungan" });
  check("kirim masukan dengan kategori salah DITOLAK 400", fbBad.status === 400, `→ HTTP ${fbBad.status}`);
  const fbOk = await owner("POST", "/api/feedback", {
    category: "saran", message: "Mohon tambahkan ekspor PDF di laporan.", pagePath: "/app/laporan/penjualan", tenantId,
  });
  check("kirim masukan valid 201", fbOk.status === 201 && Boolean(fbOk.json?.id), `→ ${JSON.stringify(fbOk.json)}`);
  const fbMine = await owner("GET", "/api/feedback/mine");
  const fbEntry = fbMine.json?.feedback?.find((f) => f.id === fbOk.json.id);
  check("riwayat masukan saya memuat entri baru (status 'baru')", fbMine.status === 200 && fbEntry?.status === "baru", `→ ${JSON.stringify(fbEntry)}`);
  const fbPatch = await owner("PATCH", `/api/admin/feedback/${fbOk.json.id}`, { status: "dibaca" });
  check("admin menandai masukan 'dibaca' 200", fbPatch.status === 200 && fbPatch.json?.ok === true);
  const fbMine2 = await owner("GET", "/api/feedback/mine");
  check("status masukan berubah jadi 'dibaca'", fbMine2.json?.feedback?.find((f) => f.id === fbOk.json.id)?.status === "dibaca");

  // Blog SEO — draft dulu (404 publik), lalu terbit (200 SSR ber-<title>).
  const blogSlug = "tips-pembukuan-umkm";
  const blogNew = await owner("POST", "/api/admin/blog-posts", {
    slug: blogSlug,
    title: "Tips Pembukuan untuk UMKM Pemula",
    excerpt: "Lima kebiasaan sederhana agar keuangan usaha rapi.",
    bodyMd: "## Mulai dari kas\n\nCatat **setiap** pemasukan dan pengeluaran.\n\n- Pisahkan uang pribadi\n- Rekonsiliasi tiap pekan",
  });
  check("buat artikel blog (draft) 201", blogNew.status === 201 && Boolean(blogNew.json?.id), `→ ${JSON.stringify(blogNew.json)}`);
  const blogDraft = await fetch(`${BASE}/blog/${blogSlug}`);
  check("artikel draft belum tampil publik (404)", blogDraft.status === 404, `→ HTTP ${blogDraft.status}`);
  const blogPublish = await owner("PATCH", `/api/admin/blog-posts/${blogNew.json.id}`, { published: true });
  check("terbitkan artikel 200", blogPublish.status === 200 && blogPublish.json?.ok === true);
  const blogView = await fetch(`${BASE}/blog/${blogSlug}`);
  const blogHtml = await blogView.text();
  check(
    "artikel terbit dilayani SSR 200 dengan <title> + isi ter-render",
    blogView.status === 200 &&
      blogHtml.includes("<title>Tips Pembukuan untuk UMKM Pemula — Blog ERPindo</title>") &&
      blogHtml.includes("<h3>Mulai dari kas</h3>") &&
      blogHtml.includes("<strong>setiap</strong>"),
    `→ HTTP ${blogView.status}`,
  );
  const blogIndex = await (await fetch(`${BASE}/blog`)).text();
  check("halaman /blog memuat judul artikel terbit", blogIndex.includes("Tips Pembukuan untuk UMKM Pemula"));
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  check("sitemap.xml memuat URL slug artikel", sitemap.includes(`/blog/${blogSlug}`));
  const robots = await fetch(`${BASE}/robots.txt`);
  const robotsTxt = await robots.text();
  check("robots.txt 200 memblokir /app + menyertakan sitemap", robots.status === 200 && robotsTxt.includes("Disallow: /app") && robotsTxt.includes("Sitemap:"));

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
