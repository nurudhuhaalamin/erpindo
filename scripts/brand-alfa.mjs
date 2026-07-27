#!/usr/bin/env node
/**
 * Membuat varian wordmark ber-alfa dari logo sumber (Fase 19a).
 *
 * Masalah yang dipecahkan: `logo-erpindo.png` adalah PNG **RGB tanpa kanal
 * alfa** — latar putihnya ikut terbakar di dalam gambar (64% pikselnya putih).
 * Karena itu `BrandWordmark` selama ini membungkusnya dengan chip `bg-white`:
 * chip itu bukan hiasan, melainkan penyamar kotak putih yang memang akan
 * muncul di latar apa pun.
 *
 * Yang dihasilkan:
 *   logo-erpindo.png       — latar transparan, warna asli (untuk tema terang)
 *   logo-erpindo-dark.png  — sama, tetapi tulisan gelap dicerahkan (tema gelap)
 *
 * Sumbernya `logo-erpindo-original.png` (berkas asli, disimpan apa adanya),
 * sehingga skrip ini bisa dijalankan ulang tanpa merusak apa pun.
 *
 * Pemakaian:  node scripts/brand-alfa.mjs
 *
 * Skrip ini SEKALI JALAN: hasilnya (dua PNG) ikut ter-commit, dan skripnya
 * disimpan sebagai catatan bagaimana berkas itu dibuat — bukan sebagai bagian
 * dari build. Karena itu `sharp` sengaja TIDAK dijadikan dependensi repo;
 * ia dicari dari store pnpm bila tidak terpasang di akar.
 */

import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);

function muatSharp() {
  try {
    return require("sharp");
  } catch {
    // Dependensi transitif: ada di store pnpm tapi tidak tertaut di akar.
    const store = path.join(ROOT, "node_modules/.pnpm");
    const dir = existsSync(store)
      ? readdirSync(store).find((d) => d.startsWith("sharp@"))
      : undefined;
    if (!dir) {
      console.error(
        "sharp tidak ditemukan. Jalankan `pnpm install` lebih dulu, atau pasang sementara:\n" +
          "  pnpm add -w -D sharp   (lalu hapus lagi — skrip ini sekali jalan)",
      );
      process.exit(1);
    }
    return require(path.join(store, dir, "node_modules/sharp"));
  }
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "apps/web/public/brand");
const SUMBER = path.join(DIR, "logo-erpindo-original.png");
const sharp = muatSharp();

/**
 * Melepas latar putih menjadi alfa dengan tepi yang tetap halus.
 *
 * Piksel gambar ini adalah hasil campuran warna C di atas putih:
 *   P = a·C + (1−a)·255
 * Sehingga alfa bisa dipulihkan dari kanal paling gelap, lalu warnanya
 * di-"un-premultiply" kembali:
 *   a = 1 − min(r,g,b)/255      C = (P − (1−a)·255) / a
 *
 * Ambang batas dipakai HANYA untuk memaksa piksel yang praktis putih menjadi
 * benar-benar transparan — sumbernya bukan putih murni (sudutnya 253–254),
 * jadi tanpa ini akan tersisa kabut tipis di seluruh kotak.
 */
function lepasPutih(data, info) {
  const c = info.channels;
  const keluar = Buffer.alloc(info.width * info.height * 4);
  for (let i = 0, o = 0; i < data.length; i += c, o += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const min = Math.min(r, g, b);
    let a = 1 - min / 255;
    // Praktis putih → transparan penuh (buang kabut 253–254).
    if (min >= 250) a = 0;
    if (a <= 0) {
      keluar[o] = keluar[o + 1] = keluar[o + 2] = keluar[o + 3] = 0;
      continue;
    }
    // Un-premultiply; dijepit agar pembulatan tidak meluber dari 0..255.
    const un = (v) => Math.max(0, Math.min(255, Math.round((v - (1 - a) * 255) / a)));
    keluar[o] = un(r);
    keluar[o + 1] = un(g);
    keluar[o + 2] = un(b);
    keluar[o + 3] = Math.round(a * 255);
  }
  return keluar;
}

/**
 * Varian tema gelap: cerahkan tulisan yang gelap-netral, pertahankan biru.
 *
 * Pembedanya **kroma absolut** (max−min), bukan saturasi relatif. Ini bukan
 * pilihan gaya melainkan koreksi bug: saturasi `(max−min)/max` tidak berarti
 * apa-apa untuk warna nyaris hitam. Piksel kata "indo" setelah un-premultiply
 * bernilai `[0,4,8]` → saturasinya terhitung **1,0** (seolah warna paling
 * pekat), sehingga penyaringan berbasis saturasi tidak mengenainya sama sekali
 * dan varian gelap keluar identik dengan varian terang.
 *
 * Dengan kroma absolut: `[0,4,8]` → 8 (netral, dicerahkan), sedangkan biru
 * merek `[0,64,128]` → 128 (berwarna, dipertahankan).
 */
const KROMA_NETRAL = 40; // di bawah ini dianggap abu-abu, bukan warna merek
const GELAP_MAKS = 170; // di atas ini sudah cukup terang, tak perlu disentuh
const TERANG = 235; // abu terang; bukan putih murni agar tidak menyilaukan

function varianGelap(rgba) {
  const keluar = Buffer.from(rgba);
  for (let o = 0; o < keluar.length; o += 4) {
    if (keluar[o + 3] === 0) continue;
    const max = Math.max(keluar[o], keluar[o + 1], keluar[o + 2]);
    const min = Math.min(keluar[o], keluar[o + 1], keluar[o + 2]);
    if (max - min < KROMA_NETRAL && max < GELAP_MAKS) {
      keluar[o] = keluar[o + 1] = keluar[o + 2] = TERANG;
    }
  }
  return keluar;
}

async function main() {
  const { data, info } = await sharp(SUMBER).raw().toBuffer({ resolveWithObject: true });
  const opsi = { raw: { width: info.width, height: info.height, channels: 4 } };

  const terang = lepasPutih(data, info);
  await sharp(terang, opsi).png({ compressionLevel: 9 }).toFile(path.join(DIR, "logo-erpindo.png"));

  const gelap = varianGelap(terang);
  await sharp(gelap, opsi)
    .png({ compressionLevel: 9 })
    .toFile(path.join(DIR, "logo-erpindo-dark.png"));

  console.log(`Wordmark ber-alfa dibuat dari ${info.width}x${info.height}: terang + gelap.`);
}

await main();
