# Log Kerja — Gelombang C-4 (Fase 2u): Manufaktur + QC

**Tanggal:** 5 Juli 2026 · **Status akhir:** selesai, siap PR.

## Konteks

Untuk usaha yang **memproduksi barang** (mebel, makanan, konveksi): resep produk
(Bill of Materials), **perintah produksi** yang mengonsumsi bahan menjadi produk jadi
dengan **biaya gabungan**, dan **inspeksi QC** (lulus / karantina).

## Yang dibangun

- **Migrasi tenant `0015_manufacturing`**: tabel `boms` (resep per produk jadi, `output_qty`
  = hasil per resep) + `bom_lines` (komponen & jumlah); `production_orders` (no. urut PRD,
  produk, gudang, jumlah, status draf/produced, qc_status none/pending/passed/quarantined,
  unit_cost/total_cost, gudang karantina).
- **API `routes/manufacturing.ts`**:
  - BoM: `GET /boms`, `GET /boms/:productId`, `PUT /boms` (admin, upsert + ganti seluruh
    baris). Validasi: produk jadi bukan jasa, komponen ada, komponen ≠ produk jadi, tak ganda.
  - Produksi: `POST /production-orders` (draf; jumlah harus kelipatan `output_qty`),
    `POST /production-orders/:id/complete` — konsumsi bahan (`stockOut`, biaya rata-rata) →
    produk jadi (`stockIn`) dengan **biaya/unit = total biaya bahan ÷ jumlah**. Bahan & produk
    jadi sama-sama di akun Persediaan → **netral nilai, tanpa jurnal** (neraca tetap seimbang).
    Stok bahan kurang → 400, dibatalkan.
  - QC: `POST /production-orders/:id/qc` — `passed` (siap jual) atau `quarantined` (pindahkan
    hasil ke gudang karantina, juga netral nilai).
- **Web `pages/manufacturing.tsx`**: form resep (produk jadi, hasil per resep, komponen
  dinamis), form perintah produksi (produk ber-resep, gudang, jumlah), daftar resep, riwayat
  produksi dengan badge status & QC + tombol Produksi / Luluskan / Karantina (pemilih gudang
  karantina). Nav "Manufaktur" (ikon `Factory`).

## Validasi (semua hijau)

- Typecheck · 24 unit test · build.
- **Smoke 239 → 258** — seksi "11o. Manufaktur + QC": beli bahan (kayu 20@50rb, paku 100@1rb),
  RBAC viewer 403 (BoM & produksi), simpan BoM, tolak BoM produk jasa & komponen=produk,
  tolak jumlah bukan kelipatan hasil resep, **produksi 4 unit → biaya total 440rb, biaya/unit
  110rb**, bahan berkurang (kayu 12, paku 60) & produk jadi +4 senilai 440rb, **neraca saldo
  tetap seimbang** (netral nilai), QC luluskan, produksi melebihi stok bahan → 400, produksi
  2 unit lalu **karantina ke gudang kedua** (meja utama 4, karantina 2), neraca tetap seimbang.
- Verifikasi visual Playwright: halaman Manufaktur (resep + produksi + QC) terang & gelap.

## Berikutnya

Gelombang C lanjut: Maintenance (jadwal servis aset + work order), Helpdesk, Ekspor e-Faktur.
