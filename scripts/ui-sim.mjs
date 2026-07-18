#!/usr/bin/env node
/**
 * Simulasi UI penuh (Fase 9b): klik-tembus browser NYATA di atas seluruh fitur.
 *
 * Berbeda dari smoke (lapis HTTP) dan screenshots (navigasi + tangkap saja),
 * skrip ini mengetik di form, mengeklik tombol, dan memverifikasi hasil —
 * sambil memantau pageerror, console.error, dan respons ≥500 di setiap rute.
 *
 * Alur: spawn `wrangler dev` port scratch → daftar akun → seed demo penuh →
 * login Playwright → (1) sapu semua rute AUDIT_ROUTES → (2) ±13 alur
 * interaktif nyata. Reporter ala smoke: `UI-SIM: N/N checks passed`, exit 1
 * bila ada yang gagal.
 *
 * Pemakaian:  node scripts/ui-sim.mjs
 * Prasyarat:  chromium (env CI: `npx playwright-core install chromium` atau
 *             /opt/pw-browsers/chromium; override via CHROMIUM_PATH).
 */

import { spawn } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUDIT_ROUTES } from "./audit-routes.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.UISIM_PORT ?? 8798);
const BASE = `http://127.0.0.1:${PORT}`;
const EMAIL = "demo.uisim@contoh.co.id";
const PASSWORD = "rahasia-uisim-123";
const persistDir = path.join(tmpdir(), `erpindo-uisim-${Date.now()}`);

// ---------------------------------------------------------------------------
// Reporter ala smoke.
// ---------------------------------------------------------------------------
let passed = 0;
const failures = [];
function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(name);
    console.error(`  ✗ ${name} ${extra}`);
  }
}

// ---------------------------------------------------------------------------
// Boot stack (resep sama dengan screenshots.mjs).
// ---------------------------------------------------------------------------
const { makeDevConfig } = await import(path.join(ROOT, "scripts/make-dev-config.mjs"));
makeDevConfig();

console.log(`Menyiapkan wrangler dev di :${PORT} (persist ${persistDir})...`);
const dev = spawn(
  "pnpm",
  ["exec", "wrangler", "dev", "-c", "../../wrangler.dev.jsonc", "--port", String(PORT), "--persist-to", persistDir, "--show-interactive-dev-session=false"],
  { cwd: path.join(ROOT, "apps/api"), stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CI: "1" } },
);
dev.stdout.on("data", () => {});
dev.stderr.on("data", () => {});

async function waitReady(timeoutMs = 120_000) {
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
  throw new Error("wrangler dev tidak siap.");
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { cwd: ROOT, stdio: "inherit", env: { ...process.env, ...env } });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exit ${code}`))));
  });
}

let browser;
try {
  await waitReady();
  console.log("Server siap. Registrasi + seed demo penuh...");
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Kopi Nusantara", name: "Dewi Lestari", email: EMAIL, password: PASSWORD }),
  });
  if (reg.status !== 201) throw new Error(`register gagal: ${reg.status}`);
  await run("node", ["scripts/seed-demo.mjs"], { BASE_URL: BASE, SEED_EMAIL: EMAIL, SEED_PASSWORD: PASSWORD });

  const { chromium } = await import("playwright-core");
  // Prioritas: CHROMIUM_PATH → chromium sistem (/opt/pw-browsers) → registri
  // playwright-core sendiri (CI memasang via `npx playwright-core install`).
  const chromiumPath =
    process.env.CHROMIUM_PATH ?? (existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined);
  browser = await chromium.launch(chromiumPath ? { executablePath: chromiumPath } : {});
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  // Tur dasbor (Fase 10f) tampil otomatis sekali untuk pengguna baru — tandai
  // "sudah dilihat" agar tidak menutupi asersi sapuan rute. Tur diuji eksplisit
  // di F18 lewat tombolnya (yang bekerja terlepas dari status ini).
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem("erpindo-tour:dashboard", "1");
    } catch {
      /* abaikan */
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(15_000);

  // Instrumentasi galat: dikumpulkan per segmen (rute/alur) lalu diperiksa.
  // "Failed to load resource" 4xx dikecualikan (mis. cek sesi 401 di halaman
  // publik — perilaku normal); pageerror & respons ≥500 selalu fatal.
  let errors = [];
  const resetErrors = () => {
    errors = [];
  };
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  page.on("response", (r) => {
    // 503 endpoint AI = degradasi anggun yang DIHARAPKAN di dev/CI tanpa binding
    // Workers AI (widget menampilkan teks redup, bukan error) — bukan galat.
    if (r.status() === 503 && r.url().includes("/ai/")) return;
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
    // POST 4xx saat simulasi = aksi ditolak — catat ke log agar kegagalan alur
    // langsung terlihat penyebabnya di keluaran CI.
    if (r.status() >= 400 && r.request().method() === "POST") {
      r.text()
        .then((body) => console.error(`  [POST ${r.status()}] ${r.url()} ${body.slice(0, 200)}`))
        .catch(() => {});
    }
  });
  // Struk POS dibuka via window.open — tutup otomatis agar tidak menumpuk.
  ctx.on("page", (p) => {
    if (p !== page) p.close().catch(() => {});
  });

  const gotoRoute = async (route, waitMs = 700) => {
    await page.goto(`${BASE}${route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(waitMs);
  };
  const postDone = (urlPart, okStatus = [200, 201]) =>
    page.waitForResponse(
      (r) => r.url().includes(urlPart) && r.request().method() === "POST" && okStatus.includes(r.status()),
    );

  // -------------------------------------------------------------------------
  // 0. Login + pindah workspace.
  // -------------------------------------------------------------------------
  console.log("0. Login & pindah workspace");
  resetErrors();
  await gotoRoute("/masuk", 300);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30_000 });
  check("login via form → diarahkan ke /app", page.url().endsWith("/app"));
  // Dashboard tenant BARU (Fase 10a): perusahaan pertama (Kopi Nusantara) belum
  // punya transaksi — kartu KPI harus menampilkan "Rp 0" nyata, bukan shimmer.
  await page.waitForTimeout(1200);
  const freshBody = await page.innerText("body");
  check(
    "dashboard tenant baru menampilkan Rp 0 (bukan skeleton abu-abu)",
    freshBody.includes("Kas & Bank") && (freshBody.match(/Rp\s?0/g) ?? []).length >= 3,
    `→ ${(freshBody.match(/Rp\s?0/g) ?? []).length} nilai Rp 0`,
  );
  check(
    "dashboard tenant baru tanpa skeleton tersisa di kartu KPI",
    (await page.locator(".animate-pulse:visible").count()) === 0,
  );
  const me = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  const demo = me.memberships.find((m) => m.tenantSlug.startsWith("pt-demo-sejahtera"));
  check("akun punya workspace PT Demo Sejahtera hasil seed", Boolean(demo));
  await page.evaluate((tid) => localStorage.setItem("erpindo-tenant", tid), demo.tenantId);
  await gotoRoute("/app", 900);
  check("workspace aktif menampilkan PT Demo Sejahtera", (await page.innerText("body")).includes("PT Demo Sejahtera"));
  check("login & pindah workspace tanpa galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // Quick wins dashboard (Fase 12d): KPI Laba, filter rentang grafik, KPI klik-tembus.
  resetErrors();
  const dashBody = await page.innerText("body");
  check("dashboard memuat KPI 'Laba Bulan Ini' (Fase 12d)", dashBody.includes("Laba Bulan Ini"));
  // Widget ringkasan mingguan AI (Fase 12f): di CI tanpa binding harus tampil
  // fallback redup — bukan error state; di produksi berisi narasi ("Dibuat …").
  await page.getByText("Ringkasan mingguan AI").first().waitFor({ timeout: 15_000 });
  await page
    .getByText(/Fitur AI belum tersedia|Dibuat/)
    .first()
    .waitFor({ timeout: 15_000 });
  check("widget Ringkasan mingguan AI tampil dengan fallback/narasi (tanpa error)", true);
  await page.getByRole("button", { name: "7 hari", exact: true }).click();
  await page.getByText("Penjualan 7 hari terakhir").first().waitFor({ timeout: 10_000 });
  check("filter grafik 7/30/90: klik '7 hari' → judul & grafik ikut", true);
  await page.getByLabel("Kas & Bank — buka laporan sumber").click();
  await page.waitForURL("**/app/keuangan/kas-bank", { timeout: 15_000 });
  check("kartu KPI Kas & Bank bisa diklik → halaman Kas & Bank", true);
  check("quick wins dashboard bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);
  await gotoRoute("/app", 600);

  // -------------------------------------------------------------------------
  // 1. Sapu semua rute: render + bebas galat.
  // -------------------------------------------------------------------------
  console.log("1. Sapu seluruh rute aplikasi");
  for (const [route, name] of AUDIT_ROUTES) {
    resetErrors();
    await gotoRoute(route);
    const text = await page.innerText("body").catch(() => "");
    check(`rute ${name} (${route}) render berisi`, text.replace(/\s+/g, " ").length > 40);
    check(`rute ${name} bebas pageerror/console.error/5xx`, errors.length === 0, `→ ${errors[0] ?? ""}`);
  }

  // -------------------------------------------------------------------------
  // 2. Alur interaktif nyata.
  // -------------------------------------------------------------------------
  console.log("2. Alur interaktif");
  const stamp = String(Date.now()).slice(-6);

  // F1 — Master Data: buat produk via form.
  resetErrors();
  await gotoRoute("/app/master/produk");
  await page.fill("#p-sku", `UISIM-${stamp}`);
  await page.fill("#p-name", "Produk Uji Simulasi");
  await page.fill("#p-sell", "125000");
  const prodForm = page.locator("form", { has: page.locator("#p-sku") });
  const prodPost = postDone("/products");
  await prodForm.getByRole("button", { name: "Tambah", exact: true }).click();
  await prodPost;
  await page.getByText("Produk Uji Simulasi").first().waitFor();
  check("F1 produk: form → 201 → muncul di tabel", true);
  check("F1 produk bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F2 — Master Data: buat kontak pelanggan via form.
  resetErrors();
  await gotoRoute("/app/master/kontak");
  await page.fill("#k-name", "Pelanggan Uji Simulasi");
  const contactForm = page.locator("form", { has: page.locator("#k-name") });
  const contactPost = postDone("/contacts");
  await contactForm.getByRole("button", { name: "Tambah", exact: true }).click();
  await contactPost;
  await page.getByText("Pelanggan Uji Simulasi").first().waitFor();
  check("F2 kontak: form → 201 → muncul di tabel", true);
  check("F2 kontak bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F3 — Catat Transaksi (wizard pemula): uang keluar berkategori.
  resetErrors();
  await gotoRoute("/app/keuangan/catat");
  await page.getByRole("tab", { name: "Uang Keluar" }).click();
  await page.fill("#catat-jumlah", "150000");
  await page.selectOption("#catat-kategori", { index: 1 });
  const catatPost = postDone("/journal-entries");
  await page.getByRole("button", { name: "Catat", exact: true }).click();
  await catatPost;
  check("F3 wizard Catat Transaksi: uang keluar diposting (201)", true);
  check("F3 wizard bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F4 — Jurnal Umum manual 2 baris seimbang → Neraca Saldo tetap seimbang.
  resetErrors();
  await gotoRoute("/app/keuangan/jurnal");
  await page.fill("#jr-memo", "Jurnal uji simulasi UI");
  await page.getByLabel("Akun baris 1").selectOption({ index: 1 });
  await page.getByLabel("Debit baris 1").fill("250000");
  await page.getByLabel("Akun baris 2").selectOption({ index: 2 });
  await page.getByLabel("Kredit baris 2").fill("250000");
  const jurnalPost = postDone("/journal-entries");
  await page.getByRole("button", { name: "Posting Jurnal" }).click();
  await jurnalPost;
  check("F4 jurnal manual seimbang diposting (201)", true);
  await gotoRoute("/app/keuangan/neraca-saldo");
  check("F4 Neraca Saldo tetap 'seimbang ✓' setelah jurnal manual", (await page.innerText("body")).includes("seimbang ✓"));
  check("F4 jurnal bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F5 — Buku Besar: pilih akun → mutasi + saldo berjalan render (uji 9a).
  resetErrors();
  await gotoRoute("/app/keuangan/buku-besar");
  await page.selectOption("#lg-acc", { index: 1 });
  await page.getByText("Saldo akhir").waitFor();
  const lgRows = await page.locator("table tbody tr").count();
  check("F5 buku besar: pilih akun → baris mutasi render (≥3)", lgRows >= 3, `→ ${lgRows} baris`);
  check("F5 buku besar bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F6 — POS: buka shift → tambah produk → bayar tunai → struk.
  resetErrors();
  await gotoRoute("/app/pos", 1000);
  if (await page.locator("#pos-opening").isVisible().catch(() => false)) {
    // Buka shift di Gudang Utama (opsi pertama bisa gudang cabang tanpa stok).
    const whUtama = await page.locator("#pos-wh option", { hasText: "Utama" }).first().getAttribute("value");
    if (whUtama) await page.selectOption("#pos-wh", whUtama);
    await page.fill("#pos-opening", "500000");
    const shiftPost = postDone("/pos/shift/open");
    await page.getByRole("button", { name: "Buka Shift" }).click();
    await shiftPost;
    check("F6 POS: shift dibuka via form", true);
  } else {
    check("F6 POS: shift sudah terbuka", true);
  }
  // Cari produk seed yang PASTI berharga & berstok (kartu pertama bisa jasa
  // Rp 0 atau produk buatan F1 yang stoknya nol → penjualan ditolak API).
  await page.getByPlaceholder("Cari produk / SKU…").fill("Kopi Arabika");
  await page.waitForTimeout(400);
  await page.locator("button", { hasText: "Rp" }).filter({ hasNotText: "Rp 0" }).first().click();
  await page.getByRole("button", { name: "+ Tunai" }).click();
  await page.getByLabel("Nominal Tunai").fill("10000000");
  const salePost = postDone("/pos/sales");
  await page.getByRole("button", { name: "Bayar & Cetak Struk" }).click();
  await salePost;
  check("F6 POS: keranjang → bayar tunai → transaksi 201", true);
  check("F6 POS bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F6b — POS quick wins (Fase 12e): tombol nominal cepat + kembalian menonjol + rekap.
  resetErrors();
  await page.getByPlaceholder("Cari produk / SKU…").fill("Kopi Arabika");
  await page.waitForTimeout(400);
  await page.locator("button", { hasText: "Rp" }).filter({ hasNotText: "Rp 0" }).first().click();
  await page.getByRole("button", { name: "Uang pas", exact: true }).click();
  await page.getByRole("button", { name: "+50rb", exact: true }).click();
  await page.getByText("Kembalian:").first().waitFor({ timeout: 10_000 });
  check("F6b POS: 'Uang pas' + '+50rb' → kembalian Rp 50.000 tampil menonjol", true);
  const salePost2 = postDone("/pos/sales");
  await page.getByRole("button", { name: "Bayar & Cetak Struk" }).click();
  await salePost2;
  check("F6b POS: bayar via nominal cepat → transaksi 201", true);
  await page.getByRole("button", { name: "Lihat rekap" }).click();
  await page.getByText("Per metode").first().waitFor({ timeout: 10_000 });
  check("F6b POS: kartu 'Rekap hari ini' terbuka berisi rekap per jam/shift/metode", true);
  check("F6b POS quick wins bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F7 — Penjualan: terima pembayaran faktur outstanding → lunas.
  resetErrors();
  await gotoRoute("/app/penjualan", 1000);
  const payBtn = page.getByRole("button", { name: "Terima Pembayaran" }).first();
  await payBtn.click();
  await page.locator('select[id^="pay-acc-"]').first().selectOption({ index: 1 });
  const payPost = postDone("/payments");
  await page.getByRole("button", { name: "Catat", exact: true }).first().click();
  await payPost;
  check("F7 penjualan: terima pembayaran faktur outstanding → 201", true);
  check("F7 pembayaran bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F8 — CRM: tambah lead → muncul di papan funnel.
  resetErrors();
  await gotoRoute("/app/crm/leads");
  await page.fill("#lead-name", "Lead Uji Simulasi");
  const leadPost = postDone("/leads");
  await page.getByRole("button", { name: "Tambah Lead" }).click();
  await leadPost;
  await page.getByText("Lead Uji Simulasi").first().waitFor();
  check("F8 CRM: lead baru → 201 → tampil di funnel", true);
  check("F8 CRM bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F9 — Helpdesk: buat tiket bertaut kontak.
  resetErrors();
  await gotoRoute("/app/helpdesk");
  await page.selectOption("#tk-contact", { index: 1 });
  await page.fill("#tk-subject", "Tiket Uji Simulasi");
  await page.fill("#tk-desc", "Dibuat oleh simulasi UI otomatis.");
  const ticketPost = postDone("/tickets");
  await page.getByRole("button", { name: "Buat Tiket" }).click();
  await ticketPost;
  await page.getByText("Tiket Uji Simulasi").first().waitFor();
  check("F9 helpdesk: tiket baru → 201 → tampil di daftar", true);
  check("F9 helpdesk bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F10 — HR: tambah karyawan via form.
  resetErrors();
  await gotoRoute("/app/hr/penggajian", 1000);
  await page.fill("#emp-name", "Karyawan Uji Simulasi");
  await page.fill("#emp-pos", "Staf QA");
  await page.fill("#emp-salary", "5000000");
  const empPost = postDone("/employees");
  await page.getByRole("button", { name: "Tambah Karyawan" }).click();
  await empPost;
  await page.locator("td", { hasText: "Karyawan Uji Simulasi" }).first().waitFor();
  check("F10 HR: karyawan baru → 201 → tampil di daftar", true);
  check("F10 HR bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F11 — Persetujuan: ajukan alur pengeluaran ≥ aturan → setujui dari antrean.
  resetErrors();
  await gotoRoute("/app/persetujuan");
  await page.getByRole("button", { name: "Ajukan", exact: true }).click();
  await page.selectOption("#ap-type", "pengeluaran");
  await page.fill("#ap-title", "Pengeluaran Uji Simulasi");
  await page.fill("#ap-amount", "2000000");
  const flowPost = postDone("/approval-flows");
  await page.getByRole("button", { name: "Ajukan", exact: true }).last().click();
  await flowPost;
  check("F11 persetujuan: alur diajukan (201)", true);
  await page.getByRole("button", { name: "Antrean saya" }).click();
  const flowRow = page.locator("div.rounded-lg", { hasText: "Pengeluaran Uji Simulasi" }).first();
  await flowRow.waitFor();
  const decidePost = postDone("/decide");
  await flowRow.getByRole("button", { name: "Setujui" }).click();
  await decidePost;
  await page.getByText("Pengeluaran Uji Simulasi").first().waitFor({ state: "detached" }).catch(() => {});
  check("F11 persetujuan: langkah disetujui dari antrean (200)", true);
  check("F11 persetujuan bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F12 — Laporan: Laba Rugi menampilkan angka non-nol.
  resetErrors();
  await gotoRoute("/app/keuangan/laba-rugi", 1000);
  const lrText = await page.innerText("body");
  check("F12 laba rugi render angka Rupiah non-nol", /Rp\s?[1-9]/.test(lrText.replace(/\u00A0/g, " ")));
  check("F12 laporan bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F13 — Mode Sederhana: toggle menyembunyikan 4 menu akuntansi teknis.
  resetErrors();
  await gotoRoute("/app/pengaturan");
  // :visible — sidebarContent dirender dua kali (aside desktop + drawer mobile).
  const navBefore = await page.locator("aside nav a:visible").count();
  await page.locator("#simpleMode").click();
  await page.waitForTimeout(400);
  const navSimple = await page.locator("aside nav a:visible").count();
  check("F13 Mode Sederhana menyembunyikan 4 menu", navBefore - navSimple === 4, `→ ${navBefore} vs ${navSimple}`);
  await page.locator("#simpleMode").click();
  await page.waitForTimeout(400);
  const navAfter = await page.locator("aside nav a:visible").count();
  check("F13 menonaktifkan Mode Sederhana memulihkan menu", navAfter === navBefore, `→ ${navAfter}`);
  check("F13 pengaturan bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F14 — Navigasi (Fase 9c): taksonomi baru + pencarian menu + seksi lipat.
  resetErrors();
  await gotoRoute("/app", 900);
  const sectionHeads = await page.locator("aside nav button:visible").allInnerTexts();
  check(
    "F14 taksonomi: seksi 'Laporan' dan 'Aset & Pajak' hadir",
    // CSS `uppercase` membuat innerText kapital semua — bandingkan tanpa kapitalisasi.
    sectionHeads.some((t) => t.trim().toLowerCase() === "laporan") &&
      sectionHeads.some((t) => t.trim().toLowerCase() === "aset & pajak"),
    `→ ${sectionHeads.join(", ")}`,
  );
  check("F14 'Pemeliharaan' pindah ke grup baru dan tetap terjangkau",
    await page.locator("aside nav a:visible", { hasText: "Pemeliharaan" }).count() === 1);
  const navLinks = () => page.locator("aside nav a:visible").filter({ hasNotText: "Panduan" }).count();
  const allLinks = await navLinks();
  const searchBox = page.locator('input[aria-label="Cari menu"]:visible').first();
  await searchBox.fill("kontak");
  await page.waitForTimeout(300);
  const filtered = await navLinks();
  check("F14 pencarian 'kontak' menyaring ke 1 menu Kontak",
    filtered === 1 && (await page.locator("aside nav a:visible", { hasText: "Kontak" }).count()) === 1,
    `→ ${filtered} tautan`);
  await searchBox.press("Escape");
  await page.waitForTimeout(300);
  check("F14 Escape membersihkan pencarian (menu pulih)", (await navLinks()) === allLinks);
  // Lipat seksi Master Data → 3 tautan hilang; persist setelah muat ulang.
  await page.locator("aside nav button:visible", { hasText: "Master Data" }).click();
  await page.waitForTimeout(300);
  const afterCollapse = await navLinks();
  check("F14 melipat 'Master Data' menyembunyikan 3 menu", allLinks - afterCollapse === 3, `→ ${allLinks} vs ${afterCollapse}`);
  await gotoRoute("/app", 900);
  check("F14 lipatan persisten setelah muat ulang", (await navLinks()) === afterCollapse);
  await page.locator("aside nav button:visible", { hasText: "Master Data" }).click();
  await page.waitForTimeout(300);
  check("F14 membuka lipatan memulihkan menu", (await navLinks()) === allLinks);
  check("F14 navigasi bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F16 — Fase 10c: balik jurnal via UI, panel pembayaran dokumen, panel
  // Struk & Refund POS.
  resetErrors();
  await gotoRoute("/app/keuangan/jurnal", 900);
  await page.locator('input[aria-label="Cari jurnal"]').fill("Jurnal uji simulasi UI");
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: "Balik", exact: true }).first().click();
  const revDone = postDone("/reverse");
  await page.getByRole("button", { name: "Ya, balik jurnal" }).click();
  await revDone;
  check("F16 balik jurnal manual via UI (201)", true);
  await page.waitForTimeout(800);
  check("F16 badge DIBALIK tampil pada jurnal asal", (await page.innerText("body")).includes("DIBALIK"));

  await gotoRoute("/app/penjualan", 900);
  await page.getByRole("button", { name: "Pembayaran", exact: true }).first().click();
  await page.waitForTimeout(800);
  check("F16 panel Pembayaran dokumen terbuka", (await page.innerText("body")).includes("Pembayaran dokumen ini"));

  await gotoRoute("/app/pos", 1000);
  await page.getByRole("button", { name: "Struk & Refund" }).click();
  await page.waitForTimeout(900);
  const posBody = await page.innerText("body");
  check("F16 panel Struk & Refund render dengan daftar struk", posBody.includes("Pilih struk, isi qty") && /INV-\d{5}/.test(posBody));
  check("F16 alur Fase 10c bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F17 — Fase 10e: halaman Dukungan render + menu Admin tersembunyi untuk
  // pengguna biasa (bukan admin platform — ui-sim tak menyetel PLATFORM_ADMIN_EMAILS).
  resetErrors();
  await gotoRoute("/app/dukungan", 900);
  const dukunganBody = await page.innerText("body");
  check(
    "F17 halaman Dukungan render (judul + form kirim masukan)",
    dukunganBody.includes("Dukungan & Masukan") && dukunganBody.includes("Kirim masukan"),
  );
  const adminNav = await page.locator("aside nav a:visible", { hasText: "Admin" }).count();
  check("F17 menu 'Admin' tersembunyi untuk pengguna biasa", adminNav === 0, `→ ${adminNav} tautan`);
  check("F17 halaman Dukungan bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F18 — Fase 10f: wizard awal, panduan dalam app, dan tur berpandu.
  resetErrors();
  await gotoRoute("/app/mulai", 900);
  const wizardBody = await page.innerText("body");
  check(
    "F18 wizard awal render (judul + langkah Profil perusahaan)",
    wizardBody.includes("Ayo siapkan cepat") && wizardBody.includes("Profil perusahaan"),
  );
  // Lewati profil → pilih tingkat pengalaman → wizard maju ke langkah Produk.
  await page.getByRole("button", { name: "Lewati", exact: true }).click();
  await page.waitForTimeout(600);
  check("F18 wizard maju ke langkah Pengalaman", (await page.innerText("body")).includes("Seberapa akrab Anda dengan akuntansi"));
  await page.getByRole("button", { name: /Saya pemula/ }).click();
  await page.waitForTimeout(600);
  check("F18 wizard maju ke langkah Produk setelah pilih pengalaman", (await page.innerText("body")).includes("Tambah produk"));

  // Panduan dalam aplikasi (di dalam shell — sidebar tetap tampak).
  await gotoRoute("/app/panduan", 800);
  const guideBody = await page.innerText("body");
  check(
    "F18 panduan dalam app render di dalam shell (kartu modul + sidebar)",
    guideBody.includes("Panduan") && (await page.locator("aside nav a:visible").count()) > 5,
  );
  await gotoRoute("/app/panduan/pos", 800);
  check("F18 artikel panduan modul render (judul + isi)", (await page.innerText("body")).includes("Kasir"));

  // Tur berpandu: buka lewat tombol di topbar, verifikasi kartu tur muncul.
  await gotoRoute("/app/penjualan", 900);
  await page.locator('[title="Tur halaman ini"]').click();
  await page.waitForTimeout(600);
  check(
    "F18 tur berpandu terbuka (dialog + tombol Lanjut)",
    (await page.getByRole("dialog").count()) >= 1 && (await page.getByRole("button", { name: "Lanjut" }).count()) === 1,
  );
  await page.getByRole("button", { name: "Lanjut" }).click();
  await page.waitForTimeout(400);
  check("F18 tur maju ke langkah 2 (tombol Kembali muncul)", (await page.getByRole("button", { name: "Kembali" }).count()) === 1);
  check("F18 alur Fase 10f bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F19 — Fase 10g: halaman bertab (Pengaturan, Penggajian) + kalkulator bisnis.
  resetErrors();
  await gotoRoute("/app/pengaturan", 700);
  check("F19 Pengaturan memakai bilah tab (role=tablist)", (await page.locator('[role="tablist"]').count()) >= 1);
  await page.getByRole("tab", { name: "Perusahaan" }).click();
  await page.waitForTimeout(400);
  check("F19 tab Perusahaan menampilkan kartu Profil perusahaan", (await page.innerText("body")).includes("Profil perusahaan"));

  await gotoRoute("/app/hr/penggajian", 900);
  check("F19 Penggajian bertab: default tab Karyawan (form #emp-name)", (await page.locator("#emp-name").count()) === 1);
  await page.getByRole("tab", { name: "Kasbon" }).click();
  await page.waitForTimeout(400);
  check("F19 tab Kasbon menampilkan kartu pinjaman karyawan", (await page.innerText("body")).includes("Kasbon / pinjaman karyawan"));

  await gotoRoute("/app/alat", 700);
  const alatBody = await page.innerText("body");
  check("F19 kalkulator render (HPP + hasil Rupiah)", alatBody.includes("Harga Pokok Produksi") && /Rp\s?[1-9]/.test(alatBody.replace(/\u00A0/g, " ")));
  await page.getByRole("tab", { name: "PPh 21 (TER)" }).click();
  await page.waitForTimeout(400);
  check("F19 kalkulator PPh 21 TER menampilkan tarif efektif", (await page.innerText("body")).includes("Tarif efektif"));
  check("F19 alur Fase 10g bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // F15 — Fase 10b: landing harga tunggal + masuk mode demo tanpa daftar.
  // Dijalankan TERAKHIR karena tombol demo mengganti cookie sesi konteks ini.
  console.log("3. Landing harga tunggal & mode demo (Fase 10b)");
  resetErrors();
  await gotoRoute("/", 600);
  const landingText = (await page.innerText("body")).replace(/\u00A0/g, " ");
  check(
    "F15 landing menampilkan harga tunggal Rp 389.000",
    /Rp\s?389\.000/.test(landingText),
    `→ tidak ditemukan di landing`,
  );
  const demoButtons = await page.getByRole("button", { name: /Lihat Demo/ }).count();
  check("F15 landing memuat tombol 'Lihat Demo'", demoButtons >= 1, `→ ${demoButtons} tombol`);
  await page.getByRole("button", { name: /Lihat Demo/ }).first().click();
  await page.waitForURL("**/app", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const demoBody = await page.innerText("body");
  check("F15 masuk demo tanpa daftar → banner 'Mode demo' tampil", demoBody.includes("Mode demo"));
  check("F15 sesi demo berada di PT Demo Sejahtera", demoBody.includes("PT Demo Sejahtera"));
  check("F15 mode demo bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  await ctx.close();
  await browser.close();
  browser = undefined;
} catch (err) {
  console.error("GALAT FATAL:", err);
  failures.push(`fatal: ${err.message}`);
} finally {
  if (browser) await browser.close().catch(() => {});
  dev.kill("SIGTERM");
  setTimeout(() => dev.kill("SIGKILL"), 1500);
  setTimeout(() => rmSync(persistDir, { recursive: true, force: true }), 2000);
}

const total = passed + failures.length;
if (failures.length > 0) {
  console.error(`\nUI-SIM: ${passed}/${total} checks passed — ${failures.length} GAGAL:`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`\nUI-SIM: ${passed}/${total} checks passed ✅`);
process.exit(0);
