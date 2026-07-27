import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Penjaga struktural label kolom dinamis (Fase 18t).
 *
 * Pola tabel-kartu (18d) menyembunyikan `<thead>` di layar kecil dan
 * menggantinya dengan prop `label` per sel. Untuk hampir semua tabel `label`
 * itu tetap — "Kode", "Akun", "Total" — dan salah tulis akan langsung terlihat.
 *
 * Tabel konsolidasi berbeda sendiri: **jumlah kolomnya ditentukan data**, satu
 * kolom per perusahaan yang dimiliki pengguna. `label`-nya karena itu harus
 * ikut `c.name`. Kalau seseorang kelak menggantinya dengan teks tetap (mis.
 * `label="Nilai"`), tampilan di layar lebar tetap benar — judul kolomnya masih
 * dari `<Th>` — sementara di HP pembaca melihat deretan angka tanpa tahu angka
 * perusahaan yang mana. Cacat yang hanya muncul di satu breakpoint.
 *
 * Kenapa penjaga SUMBER, bukan asersi ui-sim: suite ui-sim berjalan pada sesi
 * demo yang hanya memiliki SATU perusahaan, sehingga tabel konsolidasi tidak
 * dirender sama sekali di sana — cek ui-sim untuknya akan hijau secara hampa.
 * Menyiapkan keadaan multi-perusahaan di dalam suite jauh lebih besar daripada
 * nilai yang didapat. Bentuknya mengikuti `apps/api/test/rbac-guard.test.ts`,
 * yang juga menjaga invarian dengan mem-parse berkas sumber.
 */

const SUMBER = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/pages/consolidation.tsx",
);

describe("label kolom dinamis pada tabel konsolidasi", () => {
  const source = readFileSync(SUMBER, "utf8");

  it("setiap sel per-perusahaan memberi label dari nama perusahaan", () => {
    // Dua tempat memetakan `companies`: baris data dan baris total. Keduanya
    // harus memberi `label={c.name}`.
    const selPerPerusahaan = [...source.matchAll(/<Td\b[^>]*\bkey=\{c\.tenantId\}[^>]*>/g)].map(
      (m) => m[0],
    );
    expect(selPerPerusahaan.length).toBeGreaterThanOrEqual(2);
    const tanpaLabelDinamis = selPerPerusahaan.filter((s) => !s.includes("label={c.name}"));
    expect(tanpaLabelDinamis).toEqual([]);
  });

  it("tidak ada sel per-perusahaan yang memakai label teks tetap", () => {
    // Menangkap `label="…"` (string harfiah) pada sel yang di-map per
    // perusahaan — bentuk yang lolos pemeriksaan di atas kalau seseorang
    // menulis KEDUANYA, dan yang tetap salah.
    const literal = [...source.matchAll(/<Td\b[^>]*\bkey=\{c\.tenantId\}[^>]*\blabel="/g)];
    expect(literal.map((m) => m[0])).toEqual([]);
  });
});
