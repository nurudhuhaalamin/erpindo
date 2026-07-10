#!/usr/bin/env node
/**
 * Buat `wrangler.dev.jsonc` (root repo): salinan wrangler.jsonc TANPA binding
 * "ai". Binding Workers AI memaksa wrangler dev membuka sesi remote yang
 * butuh kredensial Cloudflare — tidak tersedia di CI/dev lokal. Semua
 * pemakaian `wrangler dev` (smoke, screenshot, dev lokal) memakai config ini;
 * deploy produksi tetap memakai wrangler.jsonc lengkap.
 *
 * Dipakai sebagai modul (makeDevConfig) atau dijalankan langsung.
 */

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function makeDevConfig() {
  const src = readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");
  const stripped = src.replace(/^\s*"ai":\s*\{\s*"binding":\s*"AI"\s*\},?\s*$/m, "");
  if (stripped === src) {
    throw new Error("Binding \"ai\" tidak ditemukan di wrangler.jsonc — periksa format make-dev-config.mjs.");
  }
  const out = path.join(ROOT, "wrangler.dev.jsonc");
  writeFileSync(out, `// DIBUAT OTOMATIS oleh scripts/make-dev-config.mjs — jangan edit/commit.\n${stripped}`);
  return out;
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  console.log(makeDevConfig());
}
