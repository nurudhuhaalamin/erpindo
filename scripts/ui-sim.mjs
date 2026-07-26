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
import { existsSync, mkdirSync, rmSync } from "node:fs";
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
    // Akun demo publik (Fase 13b): comped → aktif permanen + kebal pagar trial,
    // sehingga seed bisa membuat perusahaan kedua (PT Demo Sejahtera).
    "--var",
    `COMPED_EMAILS:${EMAIL}`,
  ],
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
  // locale id-ID: pasar utama Indonesia — i18n (Fase 13e) default ke Indonesia
  // (tanpa ini Chromium default en-US → aplikasi ter-render Inggris).
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 }, locale: "id-ID" });
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
  // F23 — Fase 17f. Ketiga selektor di bawah adalah GERBANG seluruh suite:
  // setiap cek F0–F22 melewati form ini lebih dulu. Diperiksa eksplisit SEBELUM
  // dipakai supaya kegagalannya menyebut sendiri sebabnya — tanpa cek ini,
  // `page.fill("#email")` hanya melempar timeout yang tidak menjelaskan apa pun
  // padahal penyebabnya perombakan `auth.tsx`.
  const gerbang = {
    email: await page.locator("#email").count(),
    password: await page.locator("#password").count(),
    submit: await page.locator("button[type=submit]").count(),
  };
  check(
    "F23 kontrak halaman masuk utuh (#email, #password, button[type=submit])",
    gerbang.email === 1 && gerbang.password === 1 && gerbang.submit >= 1,
    `→ email=${gerbang.email} password=${gerbang.password} submit=${gerbang.submit}`,
  );
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30_000 });
  check("login via form → diarahkan ke /app", page.url().endsWith("/app"));

  // Fase 17a — gelap-dulu. Konteks ui-sim TIDAK menyetel preferensi tema, jadi
  // ini menguji perilaku bawaan: skrip anti-FOUC di index.html harus sudah
  // memasang kelas `.dark` + color-scheme SEBELUM React jalan. Sekaligus
  // memastikan latar benar-benar gelap (bukan hanya kelasnya terpasang).
  // `data-theme-init` HANYA dipasang oleh public/theme-init.js. Tanpa penanda
  // itu, asersi ini akan lolos secara hampa dari efek React yang berjalan
  // belakangan — padahal justru anti-FOUC-nya yang sedang diuji.
  const temaAwal = await page.evaluate(() => ({
    init: document.documentElement.dataset.themeInit ?? "",
    dark: document.documentElement.classList.contains("dark"),
    scheme: document.documentElement.style.colorScheme,
    bg: getComputedStyle(document.body).backgroundColor,
  }));
  const rgbGelap = (s) => {
    const m = s.match(/\d+/g);
    return m ? Number(m[0]) + Number(m[1]) + Number(m[2]) < 160 : false;
  };
  check(
    "F20a anti-FOUC memasang tema gelap-dulu sebelum React (data-theme-init + latar gelap)",
    temaAwal.init === "dark" && temaAwal.dark && temaAwal.scheme === "dark" && rgbGelap(temaAwal.bg),
    `→ init=${temaAwal.init || "(tidak jalan)"} dark=${temaAwal.dark} scheme=${temaAwal.scheme} bg=${temaAwal.bg}`,
  );
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

  // Multibahasa aplikasi (Fase 13e): toggle EN → menu sidebar + dashboard Inggris.
  resetErrors();
  await page.locator("aside").getByRole("button", { name: "EN", exact: true }).first().click();
  await page.waitForTimeout(300);
  const appEn = await page.innerText("body");
  check(
    "F0b toggle EN: menu sidebar & dashboard berbahasa Inggris",
    appEn.includes("Sales") && appEn.includes("Inventory") && appEn.includes("Profit This Month") && (appEn.includes("Good ") || appEn.includes("Overview of")),
    `→ EN aplikasi tidak lengkap`,
  );
  // Fase 16a: judul + pengantar HALAMAN MODUL ikut bahasa aktif (dulu selalu
  // Indonesia walau menu sidebar sudah Inggris).
  await gotoRoute("/app/master/produk", 700);
  const produkEn = await page.innerText("body");
  check(
    "F0c judul halaman modul ikut EN: Produk → 'Products' + pengantar Inggris",
    produkEn.includes("Products") && produkEn.includes("catalogue of goods") && !produkEn.includes("Katalog barang"),
    `→ judul/pengantar halaman modul belum Inggris`,
  );
  check(
    "F0d isi halaman Produk ikut EN: label kolom & tombol (Name/Selling price/Edit)",
    produkEn.includes("Name") && produkEn.includes("Selling price") && produkEn.includes("Edit") &&
      !produkEn.includes("Harga Jual"),
    `→ isi halaman Produk belum Inggris`,
  );
  // Fase 16m — pelunasan utang 16b. Rute diverifikasi ke main.tsx:
  // /app/master/produk dan /app/master/kontak. Judul kartu form + label
  // kotak centang selalu tampil untuk admin, jadi asersinya tak bergantung data.
  const adaAddProduct =
    produkEn.includes("Add product") && produkEn.includes("Track serial numbers");
  const tanpaProdukSisaId =
    !produkEn.includes("Tambah produk") && !produkEn.includes("Lacak nomor seri");
  check(
    "F0o sisa teks halaman Produk ikut EN: judul form + label lacak seri, tanpa teks Indonesia",
    adaAddProduct && tanpaProdukSisaId,
    `→ form=${adaAddProduct} tanpaID=${tanpaProdukSisaId}`,
  );
  await gotoRoute("/app/master/kontak", 800);
  const kontakEn = await page.innerText("body");
  const adaAddContact = kontakEn.includes("Add contact");
  const tanpaKontakId =
    !kontakEn.includes("Tambah kontak") && !kontakEn.includes("bisa impor sekaligus dari CSV");
  check(
    "F0p sisa teks halaman Kontak ikut EN: judul form tambah kontak, tanpa teks Indonesia",
    adaAddContact && tanpaKontakId,
    `→ form=${adaAddContact} tanpaID=${tanpaKontakId}`,
  );
  await gotoRoute("/app/penjualan", 800);
  const jualEn = await page.innerText("body");
  // Judul kartu daftar & label kontak = teks terlihat; harga satuan hanya ada
  // sebagai PLACEHOLDER (atribut) sehingga tak terbaca innerText — dicek lewat
  // selektor tersendiri.
  const adaSalesList = jualEn.includes("Sales list");
  const adaCustomer = jualEn.includes("Customer");
  const tanpaDaftarPenjualan = !jualEn.includes("Daftar penjualan");
  const phUnitPrice = (await page.locator('input[placeholder="Unit price"]').count()) > 0;
  check(
    "F0e isi halaman Penjualan ikut EN: 'Sales list' + label Customer + placeholder Unit price",
    adaSalesList && adaCustomer && tanpaDaftarPenjualan && phUnitPrice,
    `→ salesList=${adaSalesList} customer=${adaCustomer} tanpaID=${tanpaDaftarPenjualan} placeholder=${phUnitPrice}`,
  );
  // Fase 16l — pelunasan utang 16c: teks yang dulu tertinggal berbahasa
  // Indonesia di halaman ini. Penanda negatifnya murni teks UI (bukan nama
  // produk/kontak), sesuai pelajaran Fase 16e.
  const adaAddItem = jualEn.includes("Add item") && jualEn.includes("Post Invoice");
  const tanpaSisaId =
    !jualEn.includes("Tambah barang") &&
    !jualEn.includes("Posting Faktur") &&
    !jualEn.includes("Dokumen yang Anda posting");
  check(
    "F0n sisa teks halaman Penjualan ikut EN: tombol baris & posting, tanpa teks Indonesia",
    adaAddItem && tanpaSisaId,
    `→ tombol=${adaAddItem} tanpaID=${tanpaSisaId}`,
  );
  await gotoRoute("/app/stok", 800);
  const stokEn = await page.innerText("body");
  const adaStockLevels = stokEn.includes("Stock levels per warehouse");
  const adaBalance = stokEn.includes("Balance") || stokEn.includes("Average cost");
  const tanpaLevelId = !stokEn.includes("Level stok per gudang");
  check(
    "F0f isi halaman Stok ikut EN: judul kartu + kolom, tanpa teks Indonesia",
    adaStockLevels && adaBalance && tanpaLevelId,
    `→ stockLevels=${adaStockLevels} balance=${adaBalance} tanpaID=${tanpaLevelId}`,
  );
  await gotoRoute("/app/keuangan/laba-rugi", 800);
  const lrEn = await page.innerText("body");
  const adaIncome = lrEn.includes("Income");
  const adaExpense = lrEn.includes("Expenses");
  // Penanda negatif HARUS teks murni UI. Kata "Pendapatan"/"Beban" muncul di
  // NAMA AKUN bagan akun ("Pendapatan Penjualan", "Beban Gaji") — itu data
  // pengguna yang memang tidak diterjemahkan, jadi tak bisa dipakai sebagai
  // bukti. Label toggle perbandingan periode hanya ada di antarmuka.
  const adaCompare = lrEn.includes("Compare with the previous period");
  const tanpaCompareId = !lrEn.includes("Bandingkan dengan periode sebelumnya");
  check(
    "F0g isi halaman Laba Rugi ikut EN: Income/Expenses + label toggle periode",
    adaIncome && adaExpense && adaCompare && tanpaCompareId,
    `→ income=${adaIncome} expenses=${adaExpense} compare=${adaCompare} tanpaID=${tanpaCompareId}`,
  );
  await gotoRoute("/app/keuangan/jurnal", 800);
  const jrnEn = await page.innerText("body");
  // Penanda negatif = teks murni UI. "Debit"/"Kredit" & nama akun juga muncul di
  // DATA (nama akun bagan akun), jadi dipakai judul kartu yang hanya ada di UI.
  const adaPosted = jrnEn.includes("Posted entries");
  const adaNewEntry = jrnEn.includes("New manual entry");
  const tanpaJurnalId = !jrnEn.includes("Jurnal terposting") && !jrnEn.includes("Jurnal manual baru");
  check(
    "F0h isi halaman Jurnal Umum ikut EN: judul kartu UI, tanpa teks Indonesia",
    adaPosted && adaNewEntry && tanpaJurnalId,
    `→ posted=${adaPosted} newEntry=${adaNewEntry} tanpaID=${tanpaJurnalId}`,
  );
  await gotoRoute("/app/pos", 900);
  const posEn = await page.innerText("body");
  // Penanda negatif = judul kartu murni UI (bukan "Tunai"/"Lunas" yang bisa
  // muncul sebagai status/metode pada data struk).
  // Layar Kasir punya DUA keadaan: shift tertutup (kartu "Buka shift") dan shift
  // terbuka (keranjang + Rekap + Struk & Refund). Asersi hanya boleh menuntut
  // teks yang benar-benar ter-render pada keadaan saat itu — menuntut kartu
  // Rekap saat shift tertutup adalah kesalahan asersi, bukan bukti bug.
  const shiftTertutup = posEn.includes("Open shift") || posEn.includes("Opening cash");
  const shiftTerbuka = posEn.includes("Cart") || posEn.includes("Today's summary");
  const adaPosEn = shiftTertutup || shiftTerbuka;
  const tanpaPosId =
    !posEn.includes("Buka shift") && !posEn.includes("Kas awal") && !posEn.includes("Rekap hari ini");
  check(
    "F0i isi halaman Kasir ikut EN (kedua keadaan shift), tanpa teks Indonesia",
    adaPosEn && tanpaPosId,
    `→ tertutup=${shiftTertutup} terbuka=${shiftTerbuka} tanpaID=${tanpaPosId}`,
  );
  await gotoRoute("/app/crm/leads", 800);
  const crmEn = await page.innerText("body");
  // Penanda positif wajib (pelajaran 16g) + penanda negatif dari teks murni UI.
  const adaActiveLeads = crmEn.includes("Active leads") || crmEn.includes("No leads yet");
  const adaSource = crmEn.includes("Source") || crmEn.includes("Conversion by source");
  const tanpaCrmId = !crmEn.includes("Lead aktif") && !crmEn.includes("Konversi per sumber");
  check(
    "F0j isi halaman CRM ikut EN: kartu lead + konversi sumber, tanpa teks Indonesia",
    adaActiveLeads && adaSource && tanpaCrmId,
    `→ leads=${adaActiveLeads} source=${adaSource} tanpaID=${tanpaCrmId}`,
  );
  // Rute diverifikasi ke main.tsx lebih dulu: /app/hr/penggajian (bukan /app/payroll).
  await gotoRoute("/app/hr/penggajian", 900);
  const hrEn = await page.innerText("body");
  // Halaman Penggajian BERTAB (Fase 10g) — hanya tab aktif yang ter-render.
  // Tab default = "Karyawan", jadi asersi hanya boleh menuntut isi tab itu;
  // menuntut kartu tab "Gaji" adalah kesalahan asersi, bukan bukti bug.
  const adaEmployees = hrEn.includes("Employees") || hrEn.includes("No employees yet");
  const adaEmpForm = hrEn.includes("Add employee") || hrEn.includes("Position");
  const tanpaHrId = !hrEn.includes("Tambah Karyawan") && !hrEn.includes("Gaji pokok");
  check(
    "F0k isi tab Karyawan (Penggajian) ikut EN, tanpa teks Indonesia",
    adaEmployees && adaEmpForm && tanpaHrId,
    `→ employees=${adaEmployees} form=${adaEmpForm} tanpaID=${tanpaHrId}`,
  );
  // Rute diverifikasi ke main.tsx: /app/proyek. Halaman daftar (bukan detail
  // bertab), jadi asersi menuntut isi daftar saja.
  await gotoRoute("/app/proyek", 800);
  const prjEn = await page.innerText("body");
  const adaProjectList = prjEn.includes("Project list") || prjEn.includes("No projects yet");
  const adaNewProject = prjEn.includes("New project") || prjEn.includes("Project name");
  const tanpaPrjId = !prjEn.includes("Daftar proyek") && !prjEn.includes("Proyek baru");
  check(
    "F0l isi halaman Proyek ikut EN: daftar + form proyek, tanpa teks Indonesia",
    adaProjectList && adaNewProject && tanpaPrjId,
    `→ list=${adaProjectList} form=${adaNewProject} tanpaID=${tanpaPrjId}`,
  );
  // Rute diverifikasi ke main.tsx: /app/keuangan/aset. Kartu ikhtisar + kartu
  // "Daftar aset" selalu tampil (tak bergantung ada/tidaknya data), jadi asersi
  // memakai penanda positif yang stabil di kedua keadaan.
  await gotoRoute("/app/keuangan/aset", 800);
  const asetEn = await page.innerText("body");
  const adaAssetKpi =
    asetEn.includes("Active assets") && asetEn.includes("Total book value");
  const adaAssetList = asetEn.includes("Asset list") || asetEn.includes("No assets yet");
  const tanpaAsetId =
    !asetEn.includes("Aset aktif") &&
    !asetEn.includes("Nilai buku total") &&
    !asetEn.includes("Daftarkan aset baru");
  check(
    "F0m isi halaman Aset Tetap ikut EN: kartu ikhtisar + daftar aset, tanpa teks Indonesia",
    adaAssetKpi && adaAssetList && tanpaAsetId,
    `→ kpi=${adaAssetKpi} daftar=${adaAssetList} tanpaID=${tanpaAsetId}`,
  );
  // Fase 16u — isi dasbor. Rute /app (layar pertama setelah masuk). Kartu
  // "Faktur lewat jatuh tempo" dan "Beban perlu diperiksa" selalu dirender
  // (widget bawaan aktif), sedangkan "Mulai dari sini" hanya untuk peran
  // owner — sesi ui-sim memang owner, tapi asersinya tetap dibuat longgar
  // dengan menerima salah satu penanda agar tidak rapuh terhadap peran.
  await gotoRoute("/app", 900);
  const dashEn = await page.innerText("body");
  const adaDashEn =
    dashEn.includes("Overdue invoices") || dashEn.includes("Expenses worth checking");
  const tanpaDashId =
    !dashEn.includes("Faktur lewat jatuh tempo") &&
    !dashEn.includes("Beban perlu diperiksa") &&
    !dashEn.includes("Alur kerja harian");
  check(
    "F0y isi dasbor ikut EN: kartu jatuh tempo / beban, tanpa teks Indonesia",
    adaDashEn && tanpaDashId,
    `→ kartu=${adaDashEn} tanpaID=${tanpaDashId}`,
  );
  // Fase 16t — peta label dari packages/shared. Rute diverifikasi ke main.tsx:
  // /app/keuangan/akun. Jenis akun berasal dari ACCOUNT_TYPE_LABELS di paket
  // bersama yang tetap berbahasa Indonesia; cek ini memastikan pemetaan sisi
  // web benar-benar terpasang. Penanda negatifnya memakai "Kewajiban" dan
  // "Ekuitas" — dua kata yang TIDAK muncul sebagai nama akun bawaan (pelajaran
  // Fase 16e: penanda negatif harus murni teks UI, bukan data pengguna).
  await gotoRoute("/app/keuangan/akun", 900);
  const akunEn = await page.innerText("body");
  const adaJenisEn = akunEn.includes("Liabilities") && akunEn.includes("Equity");
  const tanpaJenisId = !akunEn.includes("Kewajiban") && !akunEn.includes("Ekuitas");
  check(
    "F0x jenis akun ikut EN meski labelnya dari packages/shared",
    adaJenisEn && tanpaJenisId,
    `→ jenisEN=${adaJenisEn} tanpaID=${tanpaJenisId}`,
  );
  // Fase 16s — pelunasan utang 16h. Rute diverifikasi ke main.tsx:
  // /app/crm/leads (TIDAK ada /app/crm telanjang — pelajaran Fase 16h).
  // Tahap lead berasal dari LEAD_STAGE_LABELS di packages/shared yang tetap
  // berbahasa Indonesia; web memetakannya sendiri ke kamus, jadi cek ini
  // memastikan pemetaan itu benar-benar terpasang.
  await gotoRoute("/app/crm/leads", 900);
  const crmSisaEn = await page.innerText("body");
  const adaTahapEn = crmSisaEn.includes("Qualified") && crmSisaEn.includes("Contacted");
  const tanpaTahapId =
    !crmSisaEn.includes("Terkualifikasi") && !crmSisaEn.includes("Dihubungi");
  check(
    "F0w tahap lead CRM ikut EN meski labelnya dari packages/shared",
    adaTahapEn && tanpaTahapId,
    `→ tahapEN=${adaTahapEn} tanpaID=${tanpaTahapId}`,
  );
  // Fase 16r — pelunasan utang 16i. Rute diverifikasi ke main.tsx:
  // /app/hr/penggajian. Halaman BERTAB — hanya tab aktif yang dirender, jadi
  // asersinya terbatas pada tab bawaan (Karyawan) + pengumuman pajak yang
  // selalu tampil di atas tab (pelajaran Fase 16i).
  await gotoRoute("/app/hr/penggajian", 900);
  const gajiSisaEn = await page.innerText("body");
  const adaGajiSisaEn =
    gajiSisaEn.includes("rates follow the 2024 rules") && gajiSisaEn.includes("active of");
  const tanpaGajiSisaId =
    !gajiSisaEn.includes("mengikuti ketentuan 2024") && !gajiSisaEn.includes("aktif dari");
  check(
    "F0v sisa teks Penggajian ikut EN: catatan pajak & ringkasan karyawan, tanpa teks Indonesia",
    adaGajiSisaEn && tanpaGajiSisaId,
    `→ catatan=${adaGajiSisaEn} tanpaID=${tanpaGajiSisaId}`,
  );
  // Fase 16q — pelunasan utang 16d. Rute diverifikasi ke main.tsx: /app/stok.
  // Kartu transfer & level stok selalu tampil untuk admin.
  await gotoRoute("/app/stok", 900);
  const stokSisaEn = await page.innerText("body");
  const adaStokSisaEn =
    stokSisaEn.includes("Inventory value moves at average cost") ||
    stokSisaEn.includes("moving average cost method");
  const tanpaStokSisaId =
    !stokSisaEn.includes("Nilai persediaan berpindah") &&
    !stokSisaEn.includes("biaya rata-rata bergerak") &&
    !stokSisaEn.includes("Total nilai persediaan");
  check(
    "F0u sisa teks Stok ikut EN: penjelasan transfer & metode biaya, tanpa teks Indonesia",
    adaStokSisaEn && tanpaStokSisaId,
    `→ penjelasan=${adaStokSisaEn} tanpaID=${tanpaStokSisaId}`,
  );

  // F24 — Fase 17g. Halaman Stok kini memakai komponen `Table`, dan `Td numeric`
  // menempelkan utilitas `num` (mono + tabular-nums) dari 17a. Yang diperiksa di
  // sini adalah HASIL RENDER-nya, bukan sekadar kelasnya menempel: utilitas itu
  // bisa saja ada di DOM tetapi kalah oleh aturan CSS lain — persis jebakan yang
  // menyembunyikan bug penimpaan kelas selama belasan fase (lihat Fase 17b).
  const selNumerik = await page.evaluate(() => {
    const td = document.querySelector("td.num");
    if (!td) return null;
    const cs = getComputedStyle(td);
    return { font: cs.fontFamily, angka: cs.fontVariantNumeric, align: cs.textAlign };
  });
  check(
    "F24 kolom angka Stok benar-benar ter-render mono + tabular-nums",
    Boolean(
      selNumerik &&
        /mono/i.test(selNumerik.font) &&
        selNumerik.angka.includes("tabular-nums") &&
        selNumerik.align === "right",
    ),
    `→ ${selNumerik ? `font=${selNumerik.font.slice(0, 40)} nums=${selNumerik.angka} align=${selNumerik.align}` : "tidak ada td.num"}`,
  );
  // Fase 16p — pelunasan utang 16j. Rute diverifikasi ke main.tsx: /app/proyek.
  // Tombol buat proyek selalu tampil untuk admin; lencana status hanya muncul
  // bila ada proyek, jadi asersinya hanya menuntut tombolnya.
  await gotoRoute("/app/proyek", 800);
  const prjSisaEn = await page.innerText("body");
  const adaProyekSisaEn = prjSisaEn.includes("Create Project");
  const tanpaProyekSisaId =
    !prjSisaEn.includes("Buat Proyek") && !prjSisaEn.includes("Seret kartu untuk memindahkan");
  check(
    "F0t sisa teks Proyek ikut EN: tombol buat proyek, tanpa teks Indonesia",
    adaProyekSisaEn && tanpaProyekSisaId,
    `→ tombol=${adaProyekSisaEn} tanpaID=${tanpaProyekSisaId}`,
  );
  // Fase 16o — pelunasan utang 16f. Rute diverifikasi ke main.tsx:
  // /app/keuangan/jurnal. Form jurnal manual selalu tampil untuk admin, jadi
  // penanda positifnya tak bergantung ada/tidaknya jurnal tersimpan.
  await gotoRoute("/app/keuangan/jurnal", 900);
  const jrSisaEn = await page.innerText("body");
  const adaJurnalSisaEn = jrSisaEn.includes("Post Entry") && jrSisaEn.includes("Add line");
  const tanpaJurnalSisaId =
    !jrSisaEn.includes("Posting Jurnal") &&
    !jrSisaEn.includes("Tambah baris") &&
    !jrSisaEn.includes("belum seimbang");
  check(
    "F0s sisa teks Jurnal Umum ikut EN: tombol posting & tambah baris, tanpa teks Indonesia",
    adaJurnalSisaEn && tanpaJurnalSisaId,
    `→ tombol=${adaJurnalSisaEn} tanpaID=${tanpaJurnalSisaId}`,
  );
  // Fase 16n — pelunasan utang 16e. Rute diverifikasi ke main.tsx:
  // /app/keuangan/arus-kas dan /app/keuangan/neraca. Baris ringkasan arus kas
  // selalu tampil begitu data termuat (tak bergantung ada/tidaknya mutasi).
  await gotoRoute("/app/keuangan/arus-kas", 900);
  const akEn = await page.innerText("body");
  const adaArusKas =
    akEn.includes("Opening cash balance") && akEn.includes("Closing cash balance");
  const tanpaArusKasId =
    !akEn.includes("Saldo kas awal periode") && !akEn.includes("Perubahan kas bersih");
  check(
    "F0q sisa teks Arus Kas ikut EN: baris saldo awal & akhir, tanpa teks Indonesia",
    adaArusKas && tanpaArusKasId,
    `→ baris=${adaArusKas} tanpaID=${tanpaArusKasId}`,
  );
  await gotoRoute("/app/keuangan/neraca", 900);
  const nrEn = await page.innerText("body");
  const adaNeracaEn = nrEn.includes("balanced ✓") || nrEn.includes("NOT balanced");
  const tanpaNeracaId = !nrEn.includes("seimbang ✓");
  check(
    "F0r lencana keseimbangan Neraca ikut EN, tanpa teks Indonesia",
    adaNeracaEn && tanpaNeracaId,
    `→ lencana=${adaNeracaEn} tanpaID=${tanpaNeracaId}`,
  );
  await gotoRoute("/app/keuangan/neraca-saldo", 700);
  const tbEn = await page.innerText("body");
  check(
    "F0c halaman laporan ikut EN: Neraca Saldo → 'Trial Balance'",
    tbEn.includes("Trial Balance") && !tbEn.includes("Ringkasan saldo semua akun"),
    `→ judul laporan belum Inggris`,
  );
  await gotoRoute("/app", 600);
  await page.locator("aside").getByRole("button", { name: "ID", exact: true }).first().click();
  await page.waitForTimeout(300);
  check("F0b toggle kembali ke ID", (await page.innerText("body")).includes("Penjualan"));
  await gotoRoute("/app/master/produk", 700);
  check(
    "F0c kembali ke ID: judul halaman modul kembali 'Produk'",
    (await page.innerText("body")).includes("Katalog barang"),
  );
  await gotoRoute("/app", 600);
  check("F0b multibahasa aplikasi bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);
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

  // F20b/F20c — Fase 17c: palet perintah ⌘K.
  //
  // F20c dijalankan LEBIH DULU dan sengaja memakai `allLinks` di atas sebagai
  // pembanding: palet WAJIB tidak menambah satu pun `<a>`/`<button>` ke dalam
  // `<nav>`. Sebelas asersi F13/F14 menghitung `aside nav a:visible` dan
  // `aside nav button:visible`; kalau kelak palet dipindahkan ke dalam sidebar,
  // kesebelasnya pecah sekaligus tanpa pesan yang menjelaskan sebabnya. Cek ini
  // ada supaya kegagalannya menyebut sendiri penyebabnya.
  resetErrors();
  const navSebelumPalet = await navLinks();
  const tombolNavSebelum = await page.locator("aside nav button:visible").count();
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const paletDialog = page.locator('[role="dialog"][aria-modal="true"]').filter({ has: page.locator('input[aria-label="Cari halaman"]') });
  check("F20b Ctrl+K membuka palet perintah", (await paletDialog.count()) === 1);
  check(
    "F20c palet tidak menambah tautan/tombol ke dalam <nav>",
    (await navLinks()) === navSebelumPalet &&
      (await page.locator("aside nav button:visible").count()) === tombolNavSebelum,
    `→ nav ${navSebelumPalet}→${await navLinks()}, tombol ${tombolNavSebelum}→${await page.locator("aside nav button:visible").count()}`,
  );
  // Regresi bug yang ketahuan dari tangkapan layar Fase 17c: dengan
  // `onMouseEnter`, membuka palet sementara kursor kebetulan diam di atas area
  // daftar akan memindahkan sorotan ke baris di bawah kursor — Enter lalu
  // membawa pengguna ke halaman yang tidak ia pilih. Karena itu kursor SENGAJA
  // ditaruh di tengah area daftar dulu, baru palet dibuka lewat papan ketik.
  await page.keyboard.press("Escape");
  await page.waitForTimeout(200);
  await page.mouse.move(680, 470);
  await page.keyboard.press("Control+k");
  await page.waitForTimeout(400);
  const barisPalet = paletDialog.locator("li button");
  check(
    "F20b membuka palet menyorot baris pertama walau kursor diam di atas daftar",
    (await barisPalet.first().getAttribute("data-aktif")) === "1" &&
      (await barisPalet.nth(1).getAttribute("data-aktif")) === null,
  );

  // Ketik lalu Enter — menguji penyaringan DAN navigasi dalam satu jalur.
  await page.locator('input[aria-label="Cari halaman"]').fill("kontak");
  await page.waitForTimeout(300);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(900);
  check("F20b Enter di palet menavigasi ke menu terpilih", page.url().includes("/app/master/kontak"), `→ ${page.url()}`);
  check("F20b palet tertutup setelah navigasi", (await paletDialog.count()) === 0);
  // Pemicu di topbar — jalur yang bisa ditemukan pengguna tanpa tahu pintasan.
  await page.getByRole("button", { name: "Buka palet perintah" }).click();
  await page.waitForTimeout(400);
  check("F20b tombol topbar juga membuka palet", (await paletDialog.count()) === 1);
  // Escape harus menutup tanpa berpindah halaman. Keadaan "terbuka" dimasukkan
  // ke dalam asersi dengan sengaja: kalau paletnya tak pernah terbuka, asersi
  // "sudah tertutup + URL tetap" akan lolos secara hampa.
  const urlSebelumEsc = page.url();
  const terbukaSebelumEsc = (await paletDialog.count()) === 1;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  check(
    "F20b Escape menutup palet tanpa berpindah halaman",
    terbukaSebelumEsc && (await paletDialog.count()) === 0 && page.url() === urlSebelumEsc,
    `→ terbuka=${terbukaSebelumEsc}`,
  );
  check("F20b palet bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

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
  const perusahaanBody = await page.innerText("body");
  check("F19 tab Perusahaan menampilkan kartu Profil perusahaan", perusahaanBody.includes("Profil perusahaan"));
  // Fase 13b: kartu 3 paket di Langganan (Starter/Business/Enterprise + harga).
  check(
    "F19 Langganan menampilkan 3 paket (Starter/Business/Enterprise + harga Rp999.000)",
    perusahaanBody.includes("Starter") && perusahaanBody.includes("Business") && perusahaanBody.includes("Enterprise") && /Rp\s?999\.000/.test(perusahaanBody),
    `→ ${/Rp\s?999\.000/.test(perusahaanBody)}`,
  );
  // Fase 13i: kartu Penomoran dokumen dengan pratinjau langsung.
  check(
    "F19 Penomoran dokumen: kartu + pratinjau nomor tampil",
    perusahaanBody.includes("Penomoran dokumen") && perusahaanBody.includes("Pratinjau"),
    `→ ${perusahaanBody.includes("Penomoran dokumen")}`,
  );

  // Fase 13g: tab Data & Keamanan menampilkan kartu Keamanan lanjutan
  // (tenant utama berpaket trial = akses penuh → form tampil, bukan upsell).
  await page.getByRole("tab", { name: "Data & Keamanan" }).click();
  await page.waitForTimeout(500);
  const keamananBody = await page.innerText("body");
  check(
    "F19 Keamanan lanjutan: kartu 2FA wajib + pembatasan IP + ekspor audit CSV tampil",
    keamananBody.includes("Keamanan lanjutan") &&
      keamananBody.includes("Wajibkan verifikasi 2 langkah") &&
      keamananBody.includes("Pembatasan IP") &&
      keamananBody.includes("Ekspor audit log (CSV)"),
    `→ ${keamananBody.includes("Keamanan lanjutan")}`,
  );

  // Fase 13h: tab Lainnya menampilkan kartu API & Integrasi (API key + webhook).
  await page.getByRole("tab", { name: "Lainnya" }).click();
  await page.waitForTimeout(500);
  const lainnyaBody = await page.innerText("body");
  check(
    "F19 API & Integrasi: kartu API key + webhook tampil (paket penuh)",
    lainnyaBody.includes("API & Integrasi") &&
      lainnyaBody.includes("API key") &&
      lainnyaBody.includes("Webhook"),
    `→ ${lainnyaBody.includes("API & Integrasi")}`,
  );

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

  // F15 — landing harga 3 paket (Fase 13c) + masuk mode demo tanpa daftar.
  // Dijalankan TERAKHIR karena tombol demo mengganti cookie sesi konteks ini.
  console.log("3. Landing harga 3 paket & mode demo (Fase 13c)");
  resetErrors();
  await gotoRoute("/", 600);
  const landingText = (await page.innerText("body")).replace(/\u00A0/g, " ");
  check(
    "F15 landing menampilkan 3 paket (Starter/Business/Enterprise + Rp999.000)",
    landingText.includes("Starter") && landingText.includes("Business") && landingText.includes("Enterprise") && /Rp\s?999\.000/.test(landingText),
    `→ harga 3 paket tidak lengkap`,
  );
  check(
    "F15 landing memuat kalkulator per-pengguna + perbandingan kategori",
    landingText.includes("per pengguna") && landingText.includes("ERPindo"),
  );
  // Fase 14e: bukti sosial (badge kompatibilitas, proper noun lintas-bahasa) +
  // output "Hemat" di kalkulator. Pakai penanda netral-bahasa.
  check(
    "F15 landing: badge kompatibilitas (Midtrans/Coretax) + hemat Rp di kalkulator",
    landingText.includes("Midtrans") && landingText.includes("Coretax") && landingText.includes("Hemat sekitar"),
    `→ badge/hemat tidak tampil`,
  );
  // F21 — Fase 17d. Kisi modul kini BERBAGI garis (gap-px di atas latar garis),
  // jadi jumlah sel yang tidak habis dibagi jumlah kolom meninggalkan lubang
  // yang menganga — pada tata letak kartu terpisah yang lama, lubang itu tak
  // terlihat sama sekali. FEATURE_GROUPS berisi 11 modul di kisi 3 kolom, dan
  // sel ke-12 sengaja diisi ajakan. Penjaga ini akan berbunyi kalau modul
  // ke-12 ditambahkan kelak dan lubang baru muncul di baris berikutnya.
  const selModul = await page.locator('[data-kisi="modul"] > *').count();
  check(
    "F21 kisi modul landing terisi penuh (kelipatan 3 kolom, tanpa sel kosong)",
    selModul > 0 && selModul % 3 === 0,
    `→ ${selModul} sel`,
  );

  // F22 — Fase 17e. Gambar produk di landing adalah aset ter-commit yang
  // dihasilkan skrip terpisah (`screenshots.mjs`). Skrip itu diam-diam rusak
  // sejak Fase 13b, jadi gambarnya tertinggal belasan fase tanpa ada yang
  // berbunyi. Cek ini tidak bisa tahu gambarnya BASI, tapi bisa memastikan
  // berkasnya benar-benar ada dan termuat — kegagalan paling kasarnya.
  const gambarHero = await page.evaluate(() => {
    const img = document.querySelector('img[src*="hero-dashboard"]');
    return img ? { w: img.naturalWidth, h: img.naturalHeight } : null;
  });
  check(
    "F22 gambar produk hero landing termuat (bukan 404/rusak)",
    Boolean(gambarHero && gambarHero.w > 800 && gambarHero.h > 400),
    `→ ${gambarHero ? `${gambarHero.w}x${gambarHero.h}` : "tidak ada <img>"}`,
  );

  // Multibahasa (Fase 13d): toggle EN → hero & harga berbahasa Inggris, lalu kembali ID.
  await page.getByRole("button", { name: "EN", exact: true }).first().click();
  await page.waitForTimeout(300);
  const enText = await page.innerText("body");
  check(
    "F15 toggle EN menerjemahkan hero + harga ke Inggris",
    enText.includes("all in one app") && enText.includes("Most popular") && enText.includes("/month"),
    `→ EN tidak lengkap`,
  );
  // Fase 14f: seluruh seksi landing (Showcase/Comparison/Security/FAQ) kini dwibahasa.
  check(
    "F15 landing 100% dwibahasa: seksi Showcase/Comparison/FAQ ikut ke Inggris",
    enText.includes("See how it works") && enText.includes("Still using") && enText.includes("Frequently asked questions"),
    `→ seksi landing belum sepenuhnya EN`,
  );
  await page.getByRole("button", { name: "ID", exact: true }).first().click();
  await page.waitForTimeout(300);
  check("F15 toggle kembali ke ID", (await page.innerText("body")).includes("beres dalam satu aplikasi"));
  // Form Jadwalkan Demo (Fase 13c): isi + kirim -> konfirmasi.
  await page.locator('input[aria-label="Nama"]').fill("Uji Sim");
  await page.locator('input[aria-label="Perusahaan"]').fill("PT Uji Simulasi");
  await page.locator('input[aria-label="Email"]').fill("uji.demo@contoh.co.id");
  const demoPost = postDone("/demo-requests");
  await page.getByRole("button", { name: "Kirim permintaan demo" }).click();
  await demoPost;
  await page.getByText("Terima kasih!").first().waitFor({ timeout: 10_000 });
  check("F15 form Jadwalkan Demo terkirim (201 + konfirmasi)", true);
  const demoButtons = await page.getByRole("button", { name: /Lihat Demo/ }).count();
  check("F15 landing memuat tombol 'Lihat Demo'", demoButtons >= 1, `→ ${demoButtons} tombol`);
  await page.getByRole("button", { name: /Lihat Demo/ }).first().click();
  await page.waitForURL("**/app", { timeout: 30_000 });
  await page.waitForTimeout(1500);
  const demoBody = await page.innerText("body");
  check("F15 masuk demo tanpa daftar → banner 'Mode demo' tampil", demoBody.includes("Mode demo"));
  check("F15 sesi demo berada di PT Demo Sejahtera", demoBody.includes("PT Demo Sejahtera"));
  check("F15 mode demo bebas galat halaman", errors.length === 0, `→ ${errors[0] ?? ""}`);

  // Tangkapan layar opsional (Fase 17c) — BUKAN cek, tidak menambah hitungan.
  // Perombakan desain Fase 17 perlu diperiksa mata, bukan hanya oleh asersi:
  // asersi bisa lolos sementara tata letaknya kacau. Set `UI_SIM_SHOT=<dir>`
  // untuk merekam beberapa halaman kunci pada akhir jalannya suite.
  // Sengaja memakai suite ini karena di sinilah sesi sudah masuk dan datanya
  // sudah tersemai penuh — set `audit` di screenshots.mjs menyemai ulang dan
  // tertahan batas "satu perusahaan trial per akun".
  if (process.env.UI_SIM_SHOT) {
    const dir = process.env.UI_SIM_SHOT;
    mkdirSync(dir, { recursive: true });
    // Memakai `page` yang sudah ada, BUKAN ctx.newPage(): penjaga di atas
    // (`ctx.on("page", …)`) menutup setiap halaman selain `page`.
    const halaman = page;
    for (const [rute, nama, penuh] of [
      ["/app", "dasbor", false],
      ["/app/master/produk", "produk", false],
      ["/app/keuangan/jurnal", "jurnal", false],
      ["/app/stok", "stok", false],
    ]) {
      await halaman.goto(`${BASE}${rute}`, { waitUntil: "networkidle" });
      await halaman.waitForTimeout(1200);
      await halaman.screenshot({ path: path.join(dir, `${nama}.png`), fullPage: penuh });
    }
    // Palet perintah terbuka — rasa "alat pro" yang jadi inti fase ini.
    await halaman.keyboard.press("Control+k");
    await halaman.waitForTimeout(500);
    await halaman.screenshot({ path: path.join(dir, "palet.png"), fullPage: false });
    // Landing terakhir — palet hanya ada di dalam shell aplikasi, jadi urutannya
    // tidak boleh dibalik.
    for (const [rute, nama, penuh] of [
      ["/", "landing-atas", false],
      ["/", "landing-penuh", true],
      // Halaman masuk dilihat SETELAH sesi dibuang; kalau masih ada sesi,
      // /masuk mengalihkan ke /app dan tangkapannya jadi salah halaman.
      ["/masuk", "masuk", false],
    ]) {
      if (rute === "/masuk") await ctx.clearCookies();
      await halaman.goto(`${BASE}${rute}`, { waitUntil: "networkidle" });
      await halaman.waitForTimeout(1200);
      await halaman.screenshot({ path: path.join(dir, `${nama}.png`), fullPage: penuh });
    }
    console.log(`\nTangkapan layar ditulis ke ${dir}`);
  }

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
