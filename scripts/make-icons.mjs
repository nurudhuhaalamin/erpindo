#!/usr/bin/env node
/**
 * Generator aset merek (Fase 10a) — SUMBER: logo ASLI dari pemilik, dipakai
 * apa adanya (tanpa digambar ulang):
 *   apps/web/public/brand/source-icon.png  → ikon squircle "ERP indo"
 *   apps/web/public/brand/source-logo.png  → wordmark "ERPindo" + tagline
 *
 * Keluaran: pwa-192/512 + favicon.png (crop rapat squircle + sudut membulat
 * transparan), brand/logo-erpindo.png (wordmark ter-trim untuk header/sidebar),
 * og-image.png (komposit wordmark + ikon).
 *
 * Pemakaian: node scripts/make-icons.mjs — dijalankan manual saat logo
 * berubah; hasil PNG di-commit.
 */

import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUB = path.join(ROOT, "apps/web/public");
const BRAND = path.join(PUB, "brand");
const sharp = (
  await import("sharp").catch(() => import(path.join(ROOT, "node_modules/.pnpm/node_modules/sharp/lib/index.js")))
).default;

// --- Ikon: trim margin putih → mask sudut membulat (squircle) → ukuran PWA ---
const trimmedIcon = await sharp(path.join(BRAND, "source-icon.png"))
  .trim({ threshold: 12 }) // buang margin putih + bayangan tipis di tepi
  .toBuffer();
const meta = await sharp(trimmedIcon).metadata();
const side = Math.min(meta.width, meta.height);
const squared = await sharp(trimmedIcon)
  .resize(side, side, { fit: "cover" })
  .toBuffer();

async function roundedIcon(size) {
  const radius = Math.round(size * 0.22); // proporsi sudut squircle sumber
  const mask = Buffer.from(
    `<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}" fill="#fff"/></svg>`,
  );
  return sharp(squared)
    .resize(size, size)
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
}

for (const size of [192, 512]) {
  await sharp(await roundedIcon(size)).toFile(path.join(PUB, `pwa-${size}.png`));
  console.log(`  ✓ pwa-${size}.png`);
}
await sharp(await roundedIcon(64)).toFile(path.join(PUB, "favicon.png"));
console.log("  ✓ favicon.png");

// --- Wordmark: trim margin putih untuk dipakai di header/sidebar ------------
await sharp(path.join(BRAND, "source-logo.png"))
  .trim({ threshold: 12 })
  .png()
  .toFile(path.join(BRAND, "logo-erpindo.png"));
console.log("  ✓ brand/logo-erpindo.png");

// --- Gambar OG 1200×630: wordmark asli di panel putih + ikon ---------------
const logoBuf = await sharp(path.join(BRAND, "logo-erpindo.png")).resize({ width: 760 }).png().toBuffer();
const logoMeta = await sharp(logoBuf).metadata();
const iconBuf = await roundedIcon(230);
const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#172554"/>
  </linearGradient></defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="70" y="${315 - Math.round(logoMeta.height / 2) - 34}" width="${logoMeta.width + 68}" height="${logoMeta.height + 68}" rx="28" fill="#ffffff"/>
</svg>`;
await sharp(Buffer.from(bg))
  .composite([
    { input: logoBuf, left: 104, top: 315 - Math.round(logoMeta.height / 2) },
    { input: iconBuf, left: 1200 - 230 - 80, top: 315 - 115 },
  ])
  .png()
  .toFile(path.join(PUB, "og-image.png"));
console.log("  ✓ og-image.png");
console.log("Selesai.");
