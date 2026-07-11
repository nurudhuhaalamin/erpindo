# Log Kerja — Fase 7d: Pajak UMKM

**Tanggal:** 11 Juli 2026 · **Fase 7 (pendalaman modul), gelombang ROI-UMKM.**

## Yang dikerjakan

Sebelumnya perpajakan baru menutup PPN keluaran (e-Faktur CSV/XML Coretax) & PPh 21 (payroll).
Fase 7d menambah **halaman Pajak** khusus dengan tiga kewajiban umum UMKM:

1. **PPh Final UMKM 0,5%** (PP 55/2022). Omzet (peredaran bruto) masa bulanan **dihitung
   otomatis** dari total DPP faktur penjualan bulan itu × 0,5%. Setoran dicatat + dijurnal
   (Dr Beban PPh Final / Cr Kas-Bank). Satu setoran per masa (anti-dobel).
2. **PPh 23** — pemotongan atas jasa/sewa/royalti/bunga/dividen (tarif lazim 2%/15%) →
   **bukti potong** bernomor + **Hutang PPh 23**; lalu **disetor** (mengurangi hutang). Ekspor CSV.
3. **SPT Masa PPN 1111** — rekap **Pajak Keluaran (A)** (faktur ber-PPN) vs **Pajak Masukan (B)**
   (pembelian ber-PPN) per masa + **kurang/lebih bayar** + ekspor CSV.

### Perubahan teknis
- **Migrasi `0031_umkm_tax`**: `tax_pph_final` (period unik, omzet, rate, amount, journal) +
  `tax_pph23` (bukti potong, hutang, status setor).
- **Skema shared**: `pphFinalSchema`, `pph23Schema` (+`PPH23_OBJECTS` tarif), `pph23DepositSchema`,
  tipe `ApiPphFinal(+Preview)`, `ApiPph23`, `ApiSptPpn`.
- **API `tax.ts`**: `GET tax/pph-final/preview` & `tax/pph-final` (list) & `POST` (setor);
  `GET/POST tax/pph23` + `POST tax/pph23/:id/deposit`; `GET tax/spt-ppn`. Akun on-demand
  Beban PPh Final `5-2100` & Hutang PPh 23 `2-1400`. Audit `tax.*`. Hormati kunci tutup buku.
- **Web**: halaman **Pajak** (`/app/keuangan/pajak`) bertab + nav grup Keuangan (ikon Percent);
  label audit `tax.*`.
- **seed-demo**: setor PPh Final masa berjalan + 2 bukti potong PPh 23 (jasa disetor, sewa belum).

## Validasi

- Typecheck · unit test (24) · build · **smoke 560 → 572** (+12): faktur PPN Oktober terisolasi;
  preview PPh Final (omzet 1jt → 5rb); viewer setor 403; setor 201; setor masa sama 409; masa
  tanpa omzet 400; bukti potong PPh 23 (2%×10jt=200rb); viewer buat 403; setor PPh 23 200; setor
  ulang 409; SPT PPN Oktober (keluaran 110rb = masukan 110rb, netto 0); neraca saldo seimbang.
  Masa Oktober dipakai agar omzet/PPN deterministik & tak menyentuh asersi Juli.
- Screenshot halaman Pajak dikirim ke pemilik.

## Berikutnya

Fase 7e: RBAC granular — izin per modul/aksi + peran kustom di control-plane; Owner/Admin/Viewer
jadi preset yang memetakan ke set izin (additive, `requireTenantRole` lama tetap jalan, smoke hijau).
