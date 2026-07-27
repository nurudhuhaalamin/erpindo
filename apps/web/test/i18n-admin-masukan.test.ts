import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Penjaga sumber untuk `admin.tsx` & `dukungan.tsx` (Fase 19r).
 *
 * Kenapa uji sumber, bukan cek ui-sim seperti sub-fase i18n lainnya: halaman
 * `/app/admin` hanya merender kelima tabnya untuk admin platform, sedangkan
 * akun simulasi UI sengaja BUKAN admin platform — cek `F17` justru memastikan
 * menu Admin tersembunyi baginya. Menyetel `PLATFORM_ADMIN_EMAILS` di ui-sim
 * akan mematikan cek akses itu. Jadi isi tab admin tidak bisa diukur dari
 * halaman yang dirender, dan penjagaannya dipasang di tingkat sumber — pola
 * yang sama dengan `label-kolom-dinamis.test.ts` (18t).
 *
 * Yang dijaga adalah dua kelas cacat yang benar-benar pernah terjadi:
 *  1. Kebocoran peta label `shared` yang berbahasa Indonesia (ditemukan 19r di
 *     `dukungan.tsx`, halaman yang dipakai pelanggan). Sapuan teks tidak bisa
 *     melihatnya karena tak ada literal di berkasnya.
 *  2. Label tampilan yang sekaligus menjadi nilai state — menerjemahkannya
 *     mematikan fitur tanpa galat apa pun (cacat senyap 19d di `catat.tsx`).
 */

const DIR = dirname(fileURLToPath(import.meta.url));
const admin = readFileSync(join(DIR, "../src/pages/admin.tsx"), "utf8");
const dukungan = readFileSync(join(DIR, "../src/pages/dukungan.tsx"), "utf8");

describe("i18n admin & dukungan (Fase 19r)", () => {
  it("tidak membaca peta label masukan dari shared secara langsung", () => {
    // Peta itu tetap Indonesia karena apps/api memakainya (pola 16t); sisi web
    // WAJIB lewat KATEGORI_KEY / STATUS_MASUKAN_KEY.
    for (const [nama, isi] of [
      ["admin.tsx", admin],
      ["dukungan.tsx", dukungan],
    ] as const) {
      expect(isi, nama).not.toMatch(/FEEDBACK_CATEGORY_LABELS/);
      expect(isi, nama).not.toMatch(/FEEDBACK_STATUS_LABELS/);
    }
  });

  it("keduanya memakai penerjemah useUi", () => {
    expect(admin).toMatch(/const u = useUi\(\)/);
    expect(dukungan).toMatch(/const u = useUi\(\)/);
  });

  it("nilai state tab admin berupa kode, bukan teks yang ditampilkan", () => {
    // Sebelum 19r: `const TABS = ["Ringkasan", "Tenant", …]` — labelnya
    // sekaligus nilai state. Menerjemahkannya akan membuat tab tidak pernah
    // cocok dan seluruh isi halaman menghilang tanpa galat.
    const m = admin.match(/const TABS = \[(.*?)\] as const;/s);
    expect(m, "deklarasi TABS tidak ditemukan").not.toBeNull();
    const nilai = [...m![1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!);
    expect(nilai.length).toBeGreaterThan(0);
    for (const v of nilai) expect(v).toMatch(/^[a-z]+$/);
    // Setiap kode harus punya kunci kamus di TAB_KEY.
    for (const v of nilai) expect(admin).toMatch(new RegExp(`\\b${v}: "ad`));
  });
});
