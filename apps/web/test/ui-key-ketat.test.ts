import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Penjaga ketatnya `UiKey` (Fase 19k).
 *
 * Sampai fase ini kamus dianotasi `const UI: Record<string, Dual>`. Anotasi itu
 * melebarkan `keyof typeof UI` menjadi `string`, sehingga:
 *
 *   - `u("kunciYangTidakAda")` **lolos kompilasi**;
 *   - seluruh penjaga `satisfies Record<…, UiKey>` yang ditambahkan sejak Fase
 *     16u sebenarnya **hampa** — tidak membatasi apa pun;
 *   - kunci yang hilang baru terlihat saat dijalankan, karena `useUi`
 *     mengembalikan `String(key)` sehingga pemakai melihat nama kuncinya
 *     terpampang di layar (mis. tulisan "ppnLebihBayar").
 *
 * Dua kunci memang sudah terlanjur hilang seperti itu dan baru ketahuan setelah
 * anotasinya dibuang: `ppnLebihBayar` (dipakai sejak 19e) dan `laba` (sejak
 * Fase 16). Keduanya diperbaiki bersama fase ini.
 *
 * Uji ini menjaga penyebabnya, bukan gejalanya: selama anotasi `Record<string,
 * Dual>` tidak kembali, TypeScript akan menangkap kunci asing sendiri.
 */

const SUMBER = join(dirname(fileURLToPath(import.meta.url)), "../src/i18n/ui.ts");

describe("UiKey harus union kunci sebenarnya, bukan string", () => {
  const source = readFileSync(SUMBER, "utf8");

  it("kamus UI tidak dianotasi Record<string, …>", () => {
    // Bentuk yang melebarkan kuncinya. `satisfies` di akhir objek memberi
    // pemeriksaan bentuk yang sama tanpa efek samping itu.
    expect(source).not.toMatch(/const UI\s*:\s*Record<\s*string/);
  });

  it("kamus UI memakai satisfies agar bentuk nilainya tetap diperiksa", () => {
    expect(source).toMatch(/\}\s*satisfies Record<string, Dual>;/);
  });

  it("UiKey diturunkan dari objek kamus", () => {
    expect(source).toMatch(/export type UiKey = keyof typeof UI;/);
  });
});
