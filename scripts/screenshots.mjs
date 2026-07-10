#!/usr/bin/env node
/**
 * Pipeline screenshot produk untuk landing page & panduan.
 *
 * Alur: spawn `wrangler dev` pada port scratch → daftar akun contoh → jalankan
 * seed demo lokal (scripts/seed-demo.mjs) → login via Playwright → tangkap
 * halaman sesuai manifest → kompres ke WebP (sharp) ke apps/web/public/<set>/.
 *
 * Pemakaian:  node scripts/screenshots.mjs <landing|panduan>
 * Prasyarat:  pnpm build TIDAK diperlukan (wrangler dev melayani SPA dev);
 *             playwright-core + chromium tersedia (env CI kami memakai
 *             /opt/pw-browsers/chromium; override via CHROMIUM_PATH).
 * Dijalankan manual oleh pengembang — bukan bagian CI.
 */

import { spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = Number(process.env.SHOT_PORT ?? 8839);
const BASE = `http://127.0.0.1:${PORT}`;
const SET = process.argv[2];

/** Manifest: kumpulan tangkapan per set. width = lebar akhir WebP. */
const MANIFESTS = {
  landing: {
    outDir: "apps/web/public/landing",
    viewport: { width: 1440, height: 900 },
    theme: "light",
    quality: 80,
    shots: [
      { route: "/app", name: "hero-dashboard", width: 1400, waitMs: 1600 },
      { route: "/app/pos", name: "showcase-pos", width: 1100, waitMs: 1200 },
      { route: "/app/penjualan", name: "showcase-penjualan", width: 1100, waitMs: 1200 },
      { route: "/app/keuangan/laba-rugi", name: "showcase-laporan", width: 1100, waitMs: 1200 },
      { route: "/app/hr/penggajian", name: "showcase-gaji", width: 1100, waitMs: 1200 },
      { route: "/app/stok", name: "showcase-stok", width: 1100, waitMs: 1200 },
    ],
  },
  panduan: {
    outDir: "apps/web/public/panduan",
    viewport: { width: 1280, height: 800 },
    theme: "light",
    quality: 78,
    shots: [
      { route: "/app", name: "mulai-1", width: 1280, waitMs: 1500 },
      { route: "/app/pengaturan", name: "pengaturan-1", width: 1280, waitMs: 1000 },
      { route: "/app/pos", name: "pos-1", width: 1280, waitMs: 1200 },
      { route: "/app/penjualan", name: "penjualan-1", width: 1280, waitMs: 1200 },
      { route: "/app/pembelian", name: "pembelian-1", width: 1280, waitMs: 1200 },
      { route: "/app/stok", name: "stok-1", width: 1280, waitMs: 1200 },
      { route: "/app/master/produk", name: "produk-1", width: 1280, waitMs: 1000 },
      { route: "/app/master/kontak", name: "kontak-1", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/jurnal", name: "akuntansi-1", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/neraca-saldo", name: "akuntansi-2", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/laba-rugi", name: "laporan-1", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/arus-kas", name: "laporan-2", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/umur-tagihan", name: "laporan-3", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/e-faktur", name: "pajak-1", width: 1280, waitMs: 1000 },
      { route: "/app/hr/penggajian", name: "penggajian-1", width: 1280, waitMs: 1200 },
      { route: "/app/keuangan/aset", name: "aset-1", width: 1280, waitMs: 1000 },
      { route: "/app/crm/leads", name: "crm-1", width: 1280, waitMs: 1000 },
      { route: "/app/crm/penawaran", name: "crm-2", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/anggaran", name: "anggaran-1", width: 1280, waitMs: 1000 },
      { route: "/app/proyek", name: "proyek-1", width: 1280, waitMs: 1000 },
      { route: "/app/keuangan/kurs", name: "kurs-1", width: 1280, waitMs: 1000 },
      { route: "/app/kontrak", name: "kontrak-1", width: 1280, waitMs: 1000 },
      { route: "/app/konsolidasi", name: "konsolidasi-1", width: 1280, waitMs: 1000 },
      { route: "/app/manufaktur", name: "manufaktur-1", width: 1280, waitMs: 1000 },
      { route: "/app/maintenance", name: "maintenance-1", width: 1280, waitMs: 1000 },
      { route: "/app/helpdesk", name: "helpdesk-1", width: 1280, waitMs: 1000 },
      { route: "/app/persetujuan", name: "persetujuan-1", width: 1280, waitMs: 1000 },
    ],
  },
};

const manifest = MANIFESTS[SET];
if (!manifest) {
  console.error(`Set tidak dikenal: '${SET}'. Pilihan: ${Object.keys(MANIFESTS).join(", ")}`);
  process.exit(1);
}

const EMAIL = "demo.screenshot@contoh.co.id";
const PASSWORD = "rahasia-shot-123";
const persistDir = path.join(tmpdir(), `erpindo-shots-${Date.now()}`);

// Config dev = wrangler.jsonc minus binding "ai" (butuh kredensial remote).
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

async function waitReady(timeoutMs = 90_000) {
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

try {
  await waitReady();
  console.log("Server siap. Registrasi akun contoh + seed demo lokal...");
  const reg = await fetch(`${BASE}/api/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ companyName: "Kopi Nusantara", name: "Dewi Lestari", email: EMAIL, password: PASSWORD }),
  });
  if (reg.status !== 201) throw new Error(`register gagal: ${reg.status}`);
  await run("node", ["scripts/seed-demo.mjs"], { BASE_URL: BASE, SEED_EMAIL: EMAIL, SEED_PASSWORD: PASSWORD });

  console.log("Menangkap halaman...");
  const { chromium } = await import("playwright-core");
  // sharp tersedia lewat store pnpm (dibangun untuk pipeline PWA/ikon).
  const sharp = (
    await import("sharp").catch(() => import(path.join(ROOT, "node_modules/.pnpm/node_modules/sharp/lib/index.js")))
  ).default;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: manifest.viewport, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/masuk`, { waitUntil: "networkidle" });
  await page.evaluate((t) => {
    localStorage.setItem("erpindo-theme", t);
    document.documentElement.classList.toggle("dark", t === "dark");
  }, manifest.theme);
  await page.fill("#email", EMAIL);
  await page.fill("#password", PASSWORD);
  await page.click("button[type=submit]");
  await page.waitForURL("**/app", { timeout: 30_000 });

  // Pindah ke workspace PT Demo Sejahtera (perusahaan kedua penuh data).
  const me = await page.evaluate(async () => (await fetch("/api/auth/me")).json());
  const demo = me.memberships.find((m) => m.tenantSlug.startsWith("pt-demo-sejahtera"));
  if (demo) {
    await page.evaluate((tid) => localStorage.setItem("erpindo-tenant", tid), demo.tenantId);
  }

  const outAbs = path.join(ROOT, manifest.outDir);
  mkdirSync(outAbs, { recursive: true });
  let total = 0;
  for (const shot of manifest.shots) {
    await page.goto(`${BASE}${shot.route}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(shot.waitMs);
    // Banner verifikasi email tidak relevan untuk materi tangkapan layar.
    await page.evaluate(() => {
      for (const el of document.querySelectorAll("div")) {
        if (el.childElementCount === 0 && el.textContent?.includes("belum diverifikasi")) {
          (el.closest("[class*='rounded']") ?? el).remove();
          break;
        }
      }
    });
    const png = await page.screenshot({ fullPage: false });
    const out = path.join(outAbs, `${shot.name}.webp`);
    const buf = await sharp(png).resize({ width: shot.width * 2 }).webp({ quality: manifest.quality }).toBuffer();
    await sharp(buf).toFile(out);
    total += buf.length;
    console.log(`  ✓ ${shot.name}.webp (${Math.round(buf.length / 1024)} KB)`);
  }
  console.log(`Selesai: ${manifest.shots.length} gambar, total ${Math.round(total / 1024)} KB → ${manifest.outDir}`);

  await ctx.close();
  await browser.close();
} finally {
  dev.kill("SIGTERM");
  setTimeout(() => dev.kill("SIGKILL"), 1500);
  setTimeout(() => rmSync(persistDir, { recursive: true, force: true }), 2000);
}
