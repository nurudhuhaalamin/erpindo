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
  const me = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  const demo = me.memberships.find((m) => m.tenantSlug.startsWith("pt-demo-sejahtera"));
  check("akun punya workspace PT Demo Sejahtera hasil seed", Boolean(demo));
  await page.evaluate((tid) => localStorage.setItem("erpindo-tenant", tid), demo.tenantId);
  await gotoRoute("/app", 900);
  check("workspace aktif menampilkan PT Demo Sejahtera", (await page.innerText("body")).includes("PT Demo Sejahtera"));
  check("login & pindah workspace tanpa galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

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
