# Log Kerja — Fase 16d: Isi halaman Stok dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis keempat program i18n modul, pola sama (satu halaman dituntaskan penuh).
`stok.tsx` mencakup level stok per gudang, kartu stok, transfer antar gudang,
opname, lot & kedaluwarsa, serta usulan pembelian — enam komponen dalam satu
berkas, semuanya dipatch agar tak ada bagian yang tertinggal berbahasa Indonesia.

24 entri kamus baru (`i18n/ui.ts`) + **35 penggantian**: judul kartu, label
kolom (Saldo, Nilai, Waktu, Biaya Satuan/Rata-rata, Qty fisik, Masuk/Keluar),
label form (Dari/Ke gudang, Catatan), dan teks bersisipan "Hanya tampilkan stok
menipis (qty ≤ …)".

## Pelajaran 16c yang langsung diterapkan

Dua kegagalan CI di 16c mengajarkan dua hal, dan keduanya dipakai sejak awal di
fase ini — sehingga 16d lolos gerbang tanpa siklus perbaikan:

1. **Regex sadar-spasi, bukan pencocokan persis.** Teks JSX kerap ditulis
   multi-baris (`>\n  Saldo\n<`), sehingga pola `">Saldo<"` melewatkannya.
2. **Atribut ≠ teks terlihat.** `page.innerText()` tidak membaca `placeholder`
   / `aria-label`, jadi asersi diarahkan ke teks yang benar-benar terlihat, dan
   pesan gagal menampilkan tiap sub-kondisi agar tak perlu menebak.

## Validasi

- **UI-sim 189 → 190** (+1, cek `F0f`): mode EN pada halaman Stok memuat "Stock
  levels per warehouse" + kolom Inggris, dan **tidak lagi** memuat "Level stok
  per gudang".
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan jujur

- **Sengaja tidak diterjemahkan:** `SKU`, `Lot`, `Qty` — istilah yang lazim sama
  di kedua bahasa pada konteks ERP.
- **Cakupan kumulatif: 4 dari 36 halaman** tuntas isinya (Master Data, Penjualan,
  Pembelian, Stok). Sisanya masih Indonesia di bagian isi.
