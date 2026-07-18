# Log Kerja — Fase 12e: Quick wins POS (roadmap §2)

**Tanggal:** 17 Juli 2026.

## Yang dikerjakan

1. **Tombol nominal cepat** di panel pembayaran (`pos.tsx`): "Uang pas" mengisi
   tender tunai persis sebesar sisa di luar metode non-tunai; "+50rb"/"+100rb"
   menambah nominal tunai (pelanggan menyerahkan lembaran uang). Memakai state
   tender multi-metode yang sudah ada — tanpa perubahan API.
2. **Kembalian dibuat menonjol** — teks lebih besar & tebal (emerald) agar kasir
   tak salah hitung saat menyerahkan kembalian.
3. **Rekap penjualan harian** — endpoint baru `GET /:tenantId/pos/recap?date=`
   (role viewer): total hari itu + rincian **per jam** (`strftime('%H')`, jam
   dikembalikan UTC dan dikonversi ke jam lokal perangkat di klien — Indonesia
   punya 3 zona waktu), **per shift** (nomor shift, status, total, porsi tunai),
   dan **per metode** dari `pos_sale_payments` (faktur POS lama tanpa baris
   pembayaran dihitung tunai penuh, pola `shiftTotals`). Tipe `ApiPosRecap` di
   `@erpindo/shared`, `api.posRecap` di klien, kartu lipat "Rekap hari ini" di
   halaman POS (data diambil saat dibuka).

## Catatan koreksi roadmap (kejujuran)

Ide roadmap "pembayaran non-tunai tercatat (QRIS/transfer → jurnal bank)"
**sudah ada sejak Fase 7a** (multi-tender + jurnal ke akun bank) — tidak
dibangun ulang, item roadmap dicentang dengan catatan ini.

## Validasi

- Smoke **778 → 782** (+4): rekap memuat QRIS 50rb dari penjualan split; total
  per jam = total keseluruhan; ada baris per shift; anonim ditolak 401.
- UI-sim **164 → 168** (+4): klik "Uang pas" + "+50rb" → kembalian tampil;
  bayar via nominal cepat → 201; kartu rekap terbuka; bebas galat halaman.
- Typecheck 4/4 · lint bersih · unit 90 · build — semua hijau.
