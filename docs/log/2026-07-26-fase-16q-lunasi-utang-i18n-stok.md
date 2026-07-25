# Fase 16q — Lunasi utang i18n halaman Stok

Sub-fase keenam pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/stok.tsx` — 18 temuan meski Fase 16d menyatakannya
"tuntas".

## Yang dikerjakan

- **14 entri kamus baru** di `apps/web/src/i18n/ui.ts` (540 → 554).
- **11 blok teks + opsi `— pilih produk —` (2×)** diganti ke `u("…")`:
  judul `Kartu stok — {produk}`, penjelasan transfer antar gudang, opsi
  `— pilih —`, tombol `Transfer`, penjelasan FEFO pada kartu lot, peringatan
  lot kedaluwarsa ≤ 30 hari, penjelasan metode biaya rata-rata bergerak, pesan
  `Tidak ada produk dengan stok ≤ {n}`, dan baris total
  `Total nilai (terfilter)` / `Total nilai persediaan`.

## Konstanta tingkat modul — keempat

`REF_TYPE_LABELS` (`Pembelian`/`Penjualan`/`Penyesuaian` pada baris kartu stok)
menyimpan teks tampilan sebagai `string`. Ini kejadian **keempat** setelah
`TASK_COLUMNS` (16j), `CONTACT_TYPE_LABELS` (16m), dan `STATUS_LABEL` (16p) —
di empat berkas berbeda. Sudah bukan kebetulan, jadi ditulis sebagai aturan:

> **Konstanta tingkat modul yang menyimpan teks tampilan harus bertipe
> `Record<…, UiKey>`, bukan `Record<…, string>`.**

Dua hal kecil yang muncul saat memasangnya:

- Kunci `pembelianJudul`/`penjualanJudul` ternyata **belum ada** di kamus. Kata
  "Penjualan"/"Pembelian" memang dipakai di `commerce.tsx`, tetapi di sana ia
  hidup sebagai objek `Dual` di dalam `MODE_CFG` — tidak terjangkau `u()`.
  Kuncinya ditambahkan, bukan diasumsikan ada.
- `Record<string, UiKey>` menghasilkan `UiKey | undefined` saat diindeks, dan
  TypeScript tidak mempersempit tipe di antara **dua** akses indeks terpisah
  (`X[k] ? u(X[k]) : …` tetap galat). Diperbaiki dengan menyimpannya ke
  variabel lokal lebih dulu — sekaligus menjaga perilaku lama: jenis yang belum
  dikenal kamus tetap ditampilkan apa adanya, bukan sebagai kunci mentah.

## Yang sengaja TIDAK diterjemahkan: catatan yang tersimpan sebagai data

Dua teks pada usulan pembelian otomatis dibiarkan berbahasa Indonesia:

```ts
note: "Usulan otomatis dari titik pesan (stok menipis)",
lines: […, { note: `Stok ${s.qty} ≤ minimum ${s.minStock}` }],
```

Keduanya **dikirim ke server dan tersimpan** pada permintaan pembelian, lalu
dibaca kemudian di halaman Pengadaan — mungkin oleh orang lain. Bila
diterjemahkan saat pembuatan, bahasa catatan yang tersimpan akan bergantung
pada siapa yang kebetulan membuatnya, sehingga basis data menjadi campur
bahasa.

Ini prinsip yang sama dengan header CSV (16m) dan pesan tagihan WhatsApp (16l):
**teks yang keluar dari antarmuka dan menjadi data bukanlah teks antarmuka.**

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **205** cek lolos (naik dari 204) |

Cek baru `F0u` — rute `/app/stok` diverifikasi ke `main.tsx` lebih dulu.
Penanda positifnya menerima **dua** kemungkinan kalimat penjelasan (kartu
transfer atau kartu level stok) agar tidak rapuh terhadap peran pemakai:
kartu transfer hanya tampil untuk admin.

Sisa temuan halaman ini tinggal 3: satu potongan kode dan dua catatan
tersimpan yang memang sengaja dibiarkan.

## Sisa utang setelah fase ini

| Halaman | Temuan | Fase yang menyatakan "tuntas" |
| --- | ---: | --- |
| `payroll.tsx` | 15 | 16i |
| `pos.tsx` | 11 | 16g |
| `crm.tsx` | 9 | 16h |

Dua sub-fase lagi dan utang dari audit 16k lunas. Di luar itu tetap ada
**26 halaman yang belum pernah masuk program i18n** (~789 temuan mentah,
lihat Fase 16n) — pekerjaan yang belum dimulai, bukan utang.
