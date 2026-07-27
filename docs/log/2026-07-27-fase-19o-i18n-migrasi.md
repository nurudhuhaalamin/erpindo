# Fase 19o — Halaman Migrasi (saldo awal) dwibahasa

`apps/web/src/pages/migration.tsx` — impor saldo awal dari sistem lama.

**21 → 9 temuan**, **3 → 0 toast**. Kesembilan sisanya positif palsu: contoh
data CSV, potongan kode yang tertangkap regex, dan kunci react-query. ±15 entri
kamus baru.

Dipecah dari rencana (`migration` + `alat`); `alat` menjadi 19p.

## Contoh data CSV tetap Indonesia

`ACCOUNTS_SAMPLE` dan `STOCK_SAMPLE` berisi `kode,debit,kredit` dan
`sku,gudang,qty,biaya` — **nama kolom yang harus ditulis pengguna di CSV-nya**,
bukan teks antarmuka. Menerjemahkannya justru akan membuat contohnya salah,
karena pengurainya mencocokkan nama kolom Indonesia (`r.kode ?? r.code`).

Keputusan yang sama dengan contoh CSV rekening koran di 19c.

## Pesan galat pengurai ikut diterjemahkan

`Kode akun tidak dikenal:`, `SKU tidak ditemukan:`, `Gudang tidak ditemukan:` —
ketiganya dilempar sebagai `Error` lalu ditampilkan sebagai `Alert` ke pengguna,
jadi termasuk teks layar. Nilai yang menyebabkannya (kode/SKU/nama gudang)
disisipkan setelah frasa, jadi tidak perlu penyulihan.

## Penanda `F1o` dipilih dari keadaan yang benar-benar dirender

Halaman ini punya **dua keadaan**: formulir impor (buku masih kosong) dan
peringatan terkunci (buku sudah berisi jurnal). Perusahaan demo sudah punya
banyak jurnal terposting, jadi yang dirender di ui-sim adalah **peringatannya**.

Penanda cek karena itu diambil dari peringatan itu, bukan dari judul formulir —
memakai penanda formulir akan merah walaupun terjemahannya benar. Ini penerapan
langsung pelajaran `F1c` (19c), di mana saya memilih penanda yang hanya muncul
bila ada data.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **249** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **248** cek lolos (naik dari 247) |

## Sisa program i18n

2 berkas halaman: `alat` (28) dan `admin` (49), ditambah sisa `app.tsx` +
`src/components/`. Keduanya halaman internal — `admin` bahkan hanya untuk admin
platform, bukan pelanggan.
