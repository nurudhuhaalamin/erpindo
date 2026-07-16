# Log Kerja — Fase 10c: Edit & hapus/void transaksi terposting

**Tanggal:** 16 Juli 2026 · PR ketiga Fase 10. Menjawab butir 3 (PENTING): transaksi yang sudah
diinput/dibayarkan kini bisa dikoreksi — dengan cara yang benar untuk pembukuan double-entry:
**jurnal pembalik bertaut dua arah**, bukan menghapus riwayat.

## Fondasi

- **Migrasi tenant `0037_reversals`**: `journal_entries` + `reversed_by_entry_id`/
  `reverses_entry_id` (self-FK + index) — penjaga keras "dibalik tepat sekali";
  `payments` & `payroll_runs` + `voided_at`/`void_journal_entry_id`; tabel baru
  `payroll_loan_cuts` (potongan kasbon per run, untuk pemulihan saldo deterministik).
- **`reverseJournal()`** (lib/accounting): klaim atomik `UPDATE … SET reversed_by_entry_id = id
  WHERE … IS NULL RETURNING` (sentinel diri — FK-safe, kebal balapan), swap debit↔kredit
  **mempertahankan cost center**, tanggal default = tanggal asal (gerbang tutup buku tetap
  berlaku; opsi tanggal hari ini bila periode terkunci), un-claim bila posting gagal.
  `voidDoc` faktur lama direfactor memakai helper ini (respons & pesan error tak berubah).
- **`journalSourceDoc()`**: jurnal tak menyimpan kolom ref — keterkaitan dicek terbalik ke 13
  tabel ber-`journal_entry_id`; jurnal milik dokumen ditolak dibalik langsung (pesan menyebut
  dokumennya). Catatan D1: UNION ALL 13 term ditolak ("too many terms in compound SELECT") →
  satu query kecil per tabel.

## Kemampuan baru per modul

- **Pembayaran**: `GET /payments` (daftar per dokumen) + `POST /payments/:id/void` — sisa
  tagihan pulih, status dokumen di-recompute; pembayaran valas membalik 3 baris (termasuk
  selisih kurs) utuh. **Pembayaran POS diblokir** (jurnalnya menyatu dengan struk) dengan
  arahan ke Refund Kasir. UI: tombol **Pembayaran** di baris dokumen → panel daftar + Hapus.
- **Jurnal Umum**: `POST /journal-entries/:id/reverse` — guard berlapis (sudah dibalik /
  jurnal pembalik / milik dokumen / jurnal sistem penyesuaian-stok & penutup / tanggal mundur);
  daftar jurnal memuat `reversedByEntryNo`/`reversesEntryNo` → badge **DIBALIK**/**PEMBALIK**;
  tombol **Balik** + dialog dua tahap bila periode asal terkunci (tawarkan tanggal hari ini).
- **Faktur jual/beli**: tombol **Ubah** = batalkan + muat ke form → posting jadi dokumen BARU
  bernomor baru (buku besar immutable; dijelaskan di dialog).
- **Penggajian**: `POST /payroll-runs/:id/void` — jurnal terbalik, **saldo kasbon pulih persis**
  dari `payroll_loan_cuts`, komponen ad-hoc dilepas, periode bisa digaji ulang; guard urutan
  (run terbaru dulu) + guard run legacy ber-kasbon tanpa rincian. Kolom `period` ber-UNIQUE
  (SQLite tak bisa melepas constraint) → run void diberi sufiks tombstone, tampilan memotong
  kembali ke YYYY-MM; akumulasi 1721-A1 mengecualikan run void.
- **POS**: `GET /pos/receipts` + `POST /pos/refunds` — refund tunai dari laci shift TERBUKA:
  barang kembali (avg cost kini), jurnal pembalik proporsional HARI INI, baris
  `pos_sale_payments` NEGATIF → kas laci & rekap shift menyusut persis. UI panel
  **Struk & Refund** di halaman Kasir.
- **Opname/transfer stok — sengaja TANPA void**: pembalikan average-cost setelah ada mutasi
  susulan tidak sehat; koreksinya opname/transfer pembalik (tercakup panduan). Riwayat
  opname belum punya halaman sendiri, jadi tombol prefill ditunda (dicatat sebagai catatan).

## Validasi

Typecheck · lint bersih · unit 33 · build · **smoke 677 → 720** (+43, seksi 14h: setiap jenis
pembalikan diikuti asersi **neraca saldo seimbang** — void pembayaran, valas, balik jurnal +
seluruh guard 400, void payroll 2 periode berurutan + saldo kasbon pulih + run ulang, POS refund
parsial + kas laci menyusut + over-qty/non-POS/POS-payment 400) · **UI-SIM 137 → 142** (+5:
balik jurnal via UI + badge, panel Pembayaran, panel Struk & Refund). Bukti visual terkirim.

## Berikutnya

Fase 10d: masuk/daftar via Google (butir 5) — siap-pakai, tombol muncul saat kredensial dipasang.
