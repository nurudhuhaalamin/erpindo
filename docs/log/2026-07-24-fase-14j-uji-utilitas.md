# Log Kerja — Fase 14j: Uji utilitas murni (ZIP ekspor + grounding AI)

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Lanjutan rangkaian uji 14a/14g/14h/14i. Dua utilitas **murni** (tanpa database)
yang belum tercakup uji:

**`apps/api/test/utils.test.ts`** (8 uji):

- **`buildZip`** (`lib/zip.ts` — arsip ekspor data "Unduh semua data", anti
  lock-in Fase 8b): arsip kosong = EOCD 22 byte dengan 0 entri; satu entri →
  tanda tangan local header `0x04034b50`, metode **store**, **CRC32 = nilai cek
  standar `0xCBF43926`** untuk string `"123456789"`, ukuran & panjang nama benar,
  nama + data hadir di byte; banyak entri → EOCD mencatat jumlah tepat & semua
  nama hadir; CRC32 berbeda untuk isi berbeda (deteksi perubahan data).
- **`pickRelevant`** (`lib/guideKnowledge.ts` — grounding Asisten AI): pertanyaan
  bermuatan kata kunci mengembalikan modul cocok; tanpa kecocokan → array kosong;
  batas `max` (default 2) dihormati; **kecocokan judul (+3) menang atas satu kata
  kunci (+2)** sehingga hasil paling relevan di urutan pertama.

Tanpa perubahan kode produksi — murni menambah uji.

## Validasi

- **Unit 187 → 195** (+8): seluruhnya di `apps/api` (85 → 93).
- typecheck 4/4 · lint bersih · build.
- Smoke 850 · ui-sim 184 **(tak berubah — fase uji saja**, tanpa kode produksi/UI).

## Catatan

- CRC32 diverifikasi terhadap nilai cek CRC-32 baku (`"123456789"` → `0xCBF43926`),
  sehingga uji ini juga menjaga kebenaran implementasi CRC internal `zip.ts`, bukan
  sekadar struktur arsip.
