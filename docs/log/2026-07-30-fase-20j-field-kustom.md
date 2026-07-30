# Fase 20j — Field kustom per modul

Pemilik menambahkan kolomnya sendiri pada Kontak, Produk, dan Faktur penjualan.
Kolomnya ikut tampil di form, cetakan, dan ekspor.

## Yang dikerjakan

- Migrasi tenant `0041_custom_fields`: `custom_field_defs` + `custom_field_values`.
- `packages/shared/src/customFields.ts` — skema definisi + `validasiNilaiKustom()`.
- `apps/api/src/lib/customFields.ts` — baca definisi, validasi, simpan nilai.
- `apps/api/src/routes/customFields.ts` — CRUD definisi.
- Nilai tersambung ke CRUD master data (`routes/masterdata.ts`) dan faktur
  penjualan (`routes/commerce.ts`).
- Web: kartu **Field kustom** di Pengaturan, komponen `CustomFieldInputs` +
  hook `useFieldKustom` untuk tiga form, kolom kustom pada cetakan faktur, dan
  tombol **Ekspor CSV** kontak & produk.

## Empat tipe, bukan tipe bebas

`teks`, `angka`, `tanggal`, `pilihan`. Tiap tipe menambah satu jalur validasi,
satu kontrol form, satu aturan konversi ekspor, dan satu cara gagal. Membuka
tipe bebas berarti menambah jalur yang tak satu pun gerbang bisa menguji.

## Satu aturan validasi, dipakai server dan web

`validasiNilaiKustom()` tinggal di `packages/shared` dan dipanggil **keduanya**.
Layar yang menerima nilai lalu ditolak server — atau sebaliknya — adalah cacat
yang hanya muncul di tangan pengguna, tidak pernah di tangan kita.

## Tiga keputusan yang menjaga data tetap bisa dipercaya

**Kunci tak dikenal DITOLAK, bukan diabaikan.** Mengabaikannya berarti salah
ketik kunci (`nomer_po` alih-alih `nomor_po`) menghasilkan data yang tampak
tersimpan di layar tetapi tidak pernah ada di mana pun. Diuji di unit dan smoke.

**Faktur divalidasi SEBELUM diposting.** Field kustom faktur diperiksa lebih
dulu, baru `executeInvoice()` dijalankan. Memeriksanya sesudah berarti jurnal &
stok sudah terlanjur bergerak untuk faktur yang ditolak — dan jurnal di repo ini
tidak bisa dihapus, hanya dibalik. Cek smoke membandingkan total debit neraca
saldo dan jumlah dokumen sebelum/sesudah penolakan; keduanya wajib **tidak
berubah**.

**Hapus = arsipkan.** `custom_field_values` ber-`ON DELETE CASCADE`, jadi
penghapusan sungguhan ikut membuang seluruh nilai yang sudah dicatat pemilik
pada ratusan dokumen — karena satu klik di layar pengaturan. Definisi hanya
ditandai `is_archived`.

## Ekspor memakai `fieldKey`, cetakan memakai `label`

Judul kolom ekspor memakai **kunci**, bukan label: label boleh diubah pemilik
sewaktu-waktu, kunci tidak. Berkas ekspor yang judul kolomnya berubah diam-diam
akan merusak spreadsheet penerimanya.

Cetakan sebaliknya memakai **label**, karena itu yang dibaca manusia.

Cek smoke mengunci **bentuk datanya** (`label` + `fieldKey` + `type` + `defId`
semuanya ada), bukan hanya nilainya — kehilangan salah satunya membuat salah
satu dari dua janji itu tidak ditepati.

## Koreksi: janji di kartu sempat tidak ditepati

Deskripsi kartu Field kustom berbunyi *"ikut tampil di form, cetakan, dan
ekspor"*. Saat pemeriksaan mata, form-nya benar — tetapi:

- `print.tsx` **tidak menyentuh** `customFields` sama sekali, dan
- tidak ada ekspor CSV untuk kontak/produk (yang ada hanya *template* impor).

Jadi dua dari tiga janji itu salah pada saat saya menuliskannya. Keduanya
dikerjakan (kolom kustom pada cetakan faktur + tombol Ekspor CSV), bukan
deskripsinya yang diperkecil.

Ini ditemukan karena membaca kalimat yang saya tulis sendiri lalu memeriksa
kodenya — bukan oleh gerbang mana pun. Tidak ada cek yang bisa menangkap
"deskripsi menjanjikan hal yang tidak ada".

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **315** (dari 305) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **928** (dari 906) |
| `node scripts/ui-sim.mjs` | 0 | **279** (dari 274) |
| `node scripts/sapu-i18n.mjs` | 0 | utang atribut tetap **0** |

Sepuluh unit test, 22 cek smoke, lima cek ui-sim (`F2c`).

**`F2c` dibuktikan bisa gagal.** `CustomFieldInputs` dilumpuhkan sementara
(`if (true) return null`) dan dua ceknya langsung merah (`276/278 — 0 blok`).
Setelah dikembalikan, hijau lagi.

`F2c` sengaja tidak berhenti pada daftar definisi: ia membuat definisi di
Pengaturan lalu **pindah ke halaman Kontak** dan memastikan kolomnya benar-benar
ada di form. Memeriksa daftar definisinya saja akan hijau walau kolomnya tak
pernah sampai ke form mana pun — dan hanya itulah yang berguna bagi pemilik.

**Pemeriksaan mata** lewat `UI_SIM_SHOT` untuk kartu definisi dan form kontak;
di situlah janji "cetakan dan ekspor" ketahuan belum ditepati. Blok tangkapan
sementara sudah dihapus lagi.

## Catatan penyapu i18n

Utang teks layar naik 102 → 105. Ketiganya bukan teks tampilan:
`"produk.csv"`/`"kontak.csv"` (nama berkas ekspor) dan `"kontak"` (`idPrefix`
komponen). Kelas positif palsu yang sama dengan yang sudah diklasifikasikan di
Fase 19; utang **atribut** tetap 0.

## Yang sengaja tidak dikerjakan

- **Field kustom pada faktur pembelian.** Modulnya sengaja hanya `invoice`:
  kolom tambahan pada dokumen keluar diminta pembeli, sedangkan pada dokumen
  masuk belum ada kebutuhan yang jelas. Menambahkannya nanti hanya perlu satu
  nilai baru pada `CHECK` migrasi.
- **Field kustom di API publik & impor marketplace.** Keduanya lewat skema yang
  sama, jadi nilainya akan divalidasi bila dikirim — tetapi belum ada cek smoke
  yang membuktikannya, jadi tidak diklaim.
