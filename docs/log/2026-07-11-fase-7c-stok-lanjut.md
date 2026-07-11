# Log Kerja — Fase 7c: Stok Lanjut

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang ROI-UMKM.**

## Yang dikerjakan

Modul stok sebelumnya sudah kuat (multi-gudang, average cost, batch/lot + FEFO, transfer,
opname, kartu stok, ambang minimum). Fase 7c menambah tiga kemampuan retail/distribusi:

1. **Titik pesan otomatis → usulan pembelian.** Produk dengan total stok ≤ stok minimum tampil
   di kartu **Usulan pembelian otomatis** (halaman Stok) dengan usulan qty (menaikkan kembali
   ke 2× ambang). Sekali klik membuat **Permintaan Pembelian (PR)** yang diteruskan ke modul
   Pengadaan (Fase 6d) — rantai titik-pesan → PR → PO → GRN tersambung penuh.
2. **Multi-satuan (UOM).** Produk bisa punya **satuan besar** (mis. "dus") + **faktor konversi**
   (1 dus = 24 pcs). Tampil di katalog sebagai info konversi. Satuan dasar tetap sumber kebenaran
   stok/akuntansi — tidak mengubah pergerakan stok.
3. **Barcode + nomor seri.** Kolom **barcode** untuk pindai di kasir (endpoint lookup) &
   pencarian cepat. Produk terpilih bisa **melacak nomor seri** (registri unit `in_stock → sold`)
   untuk barang bernilai tinggi/garansi (elektronik, mesin).

### Perubahan teknis
- **Migrasi `0030_stock_advanced`** (backward-compatible): kolom produk `barcode`,
  `uom_secondary`, `uom_factor` (default 1), `track_serial` (default 0); tabel `product_serials`
  (in_stock/sold, UNIQUE per produk).
- **Skema shared**: `productSchema` diperluas (barcode, uomSecondary, uomFactor, trackSerial);
  `serialSchema`, `serialStatusSchema`, `SERIAL_STATUSES`, tipe `ApiProductSerial`,
  `ApiReorderSuggestion`.
- **API baru `stockAdvanced.ts`**: `GET /reorder-suggestions` (titik pesan → usulan),
  `GET /products/lookup?barcode=`, `GET/POST /products/:id/serials`,
  `PATCH /products/:id/serials/:serialId`. Audit `stock.serial.*`. Usulan → PR memakai endpoint
  `/requisitions` yang sudah ada.
- **Web**: halaman **Produk** — form baru (barcode, satuan besar + faktor, lacak nomor seri) +
  kolom Barcode & label "Seri", info konversi UOM, dan **pengelola nomor seri** per produk;
  halaman **Stok** — kartu **Usulan pembelian otomatis** + tombol buat Permintaan Pembelian.
- **Seed-demo**: barcode + UOM pada Kopi/Teh; produk bernomor seri (Mesin Sangrai + 2 seri);
  produk titik-pesan (Filter V60, stok 0 < minimum 40) agar kartu usulan tampil.

## Validasi

- Typecheck · unit test (24) · build · **smoke 548 → 560** (+12): buat produk barcode/UOM/seri;
  pindai barcode 200 & 404; tambah seri 201; duplikat seri 409; daftar seri; tandai terjual;
  status seri berubah; viewer tambah seri 403; usulan pembelian memuat produk titik-pesan
  (usulan 20 = 2× ambang); viewer baca usulan 200; buat PR dari usulan 201. Asersi lama tetap
  hijau (entitas baru terpisah).
- Catatan teknis: `HAVING` pada usulan memakai ekspresi agregat penuh (`COALESCE(SUM(s.qty),0)`),
  bukan alias — di SQLite alias `qty` bisa keliru terikat ke kolom `stock_levels.qty` (NULL untuk
  produk tanpa stok) sehingga produk stok-nol luput dari usulan.
- Screenshot halaman Stok (usulan pembelian) & Produk (barcode/UOM/seri) dikirim ke pemilik.

## Berikutnya

Fase 7d: Pajak UMKM — PPh Final 0,5% (PP 55/2022) dari omzet bulanan + setoran + jurnal,
PPh 23 potong + bukti potong, SPT Masa PPN 1111 (rekap A/B dari faktur ber-PPN, ekspor).
