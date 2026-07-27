# Fase 18t — Konsolidasi & Proyek: dua tabel terakhir

Sub-fase penutup migrasi tabel. Setelah ini **tidak ada lagi `<table>` tulisan
tangan di layar aplikasi** — yang tersisa hanya dokumen cetak.

## Yang dikerjakan

### `apps/web/src/pages/consolidation.tsx` — 1 tabel, kolom dinamis

Ini satu-satunya tabel di aplikasi yang **jumlah kolomnya ditentukan data**,
bukan kode: satu kolom per perusahaan yang dimiliki pengguna, lewat
`companies.map()`.

Konsekuensinya pada pola kartu: `label` **tidak boleh** ditulis tetap seperti
tabel lain — ia harus ikut `c.name`. Kalau tidak, pembaca di HP melihat deretan
angka tanpa tahu angka perusahaan yang mana.

Pasangan `const th` / `const td` lokal dihapus. Kolom Akun **tidak** `numeric`
karena selnya memuat kode **dan** nama akun.

### `apps/web/src/pages/projects.tsx` — 1 tabel

Tabel "Pendapatan & biaya (dari jurnal ber-tag)" di dalam detail proyek. Judul
kolomnya dari `u()`, jadi `label` ikut `u()` — pelajaran 18r diterapkan
langsung.

## Cek baru: penjaga sumber, bukan asersi ui-sim

Bentuk kolom dinamis perlu dijaga, tetapi **ui-sim tidak bisa menjaganya**.
Suite berjalan pada sesi demo yang hanya memiliki **satu** perusahaan, sehingga
tabel konsolidasi tidak dirender sama sekali di sana — terbukti dari tangkapan
layar: yang tampil adalah pesan *"Anda baru memiliki satu perusahaan."*
Menambahkan asersi ui-sim untuknya akan **hijau secara hampa**, persis jenis
cek yang berulang kali dihindari sejak Fase 17.

Karena itu penjaganya berupa **uji sumber**, mengikuti bentuk
`apps/api/test/rbac-guard.test.ts` yang sudah dipakai repo ini:
`apps/web/test/label-kolom-dinamis.test.ts` mem-parse `consolidation.tsx` dan
menuntut setiap `<Td key={c.tenantId}>` memberi `label={c.name}` — serta
menolak `label="…"` harfiah pada sel yang sama.

Kenapa ini layak dijaga: kalau kelak seseorang menggantinya dengan teks tetap,
**tampilan di layar lebar tetap benar** (judul kolomnya masih dari `<Th>`)
sementara di HP informasinya hilang. Cacat yang hanya muncul di satu
breakpoint, jenis yang paling mudah lolos.

### Dibuktikan bisa gagal

`label={c.name}` diganti `label="Nilai"` pada kedua tempat, lalu uji dijalankan:

```
× setiap sel per-perusahaan memberi label dari nama perusahaan
× tidak ada sel per-perusahaan yang memakai label teks tetap
Tests  2 failed (2)
```

Setelah dikembalikan, keduanya hijau.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**, bukan penyaringan
keluaran (pelajaran 18f).

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (naik dari 244) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **233** cek lolos (tetap) |
| `node scripts/sapu-i18n.mjs` | tidak ada utang baru |

## Diperiksa dengan mata

Tangkapan layar 390px halaman penuh untuk keduanya. Tabel proyek berada **di
dalam** detail proyek, jadi tangkapan daftar saja tidak cukup — tombol "Detail"
diklik lebih dulu. Hasilnya benar: Jurnal, Tanggal, Keterangan, Pendapatan,
Biaya tersaji sebagai kartu berlabel, dengan keterangan panjang membungkus
rapi.

Halaman konsolidasi diperiksa juga, dan justru dari situlah diketahui bahwa
tabelnya tidak dirender di sesi demo — yang mengubah bentuk penjagaannya.

## Migrasi tabel: selesai

Pemeriksaan `grep '<table'` pada seluruh `apps/web/src/pages/` kini hanya
menyisakan **8 tabel yang memang dikecualikan permanen**:

| Berkas | Jumlah | Alasan |
| --- | ---: | --- |
| `print.tsx` | 5 | Seluruh berkas adalah dokumen cetak |
| `pos.tsx` → `buildReceiptHtml` | 2 | Struk termal (string HTML) |
| `salesorders.tsx` → `printDeliveryNote` | 1 | Surat jalan (string HTML) |

Semuanya dokumen cetak yang wajib putih terlepas dari tema layar.
