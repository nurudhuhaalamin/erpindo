# Rencana Monetisasi Bertingkat (Fase 13)

> Dokumen keputusan bisnis + teknis untuk pemaketan ERPindo. Ditulis Fase 13,
> mencerminkan yang sudah dikirim (13a–13h). Bahasa Indonesia, sesuai konvensi repo.

## Keputusan harga (pemilik)

Empat tingkat, **per perusahaan per bulan**, pengguna **tak terbatas di semua paket**:

| | Trial | Starter | Business | Enterprise |
|---|---|---|---|---|
| Harga | Rp0 (30 hari) | Rp499.000 | Rp999.000 | Rp2.499.000 |
| Cakupan | Penuh (rasa Enterprise, 1 entitas) | Inti | Inti + Operasional | Semua |
| Kuota AI/hari | 100 | 25 | 100 | 250 |
| Pengguna | tak terbatas | tak terbatas | tak terbatas | tak terbatas |

## Prinsip yang disepakati

1. **Pembeda = kedalaman operasional, jumlah entitas, level layanan — BUKAN jumlah user.**
   Ini pembeda utama vs ERP konvensional yang menagih per-user; jadi alat jualan utama.
2. **Akuntansi inti tak pernah dipotong.** Semua paket dapat: akuntansi lengkap (jurnal
   double-entry, buku besar, neraca, laba rugi, arus kas), penjualan/pembelian, POS, stok,
   kas & bank, pajak (PPN/PPh final/e-Faktur), kontak/produk/gudang, notifikasi, ekspor CSV/ZIP.
3. **Trial = akses penuh** (konversi terbaik), bukan rasa Starter.
4. **Pelanggan lama Rp389rb di-grandfather** akses penuh (`legacy_full_access`) — tak diturunkan paksa.
5. **Perbandingan pesaing implisit per kategori** di landing (tanpa menyebut merek).

## Pemetaan modul → paket (terpusat di `packages/shared/src/core.ts`)

- **Business+** (operasional): HR & Payroll, Absensi, Manufaktur+QC+Routing, Proyek, Pengadaan
  (PR→PO→GRN), Approval engine, RBAC peran kustom, CRM, Maintenance, Helpdesk, Penjualan
  bertahap (SO/DO), multi-currency, kontrak berulang, laporan terjadwal, backup Drive, struktur organisasi.
- **Enterprise** (skala): konsolidasi multi-perusahaan, dimensi/cost center, **API publik &
  webhook**, **keamanan lanjutan** (2FA wajib + pembatasan IP + ekspor audit).

Menggeser modul antar paket = ubah satu baris di `MODULE_MIN_PLAN`. Penegakan lewat satu
middleware global `enforcePlanByPath` (segmen path → modul); di bawah paket → `403
plan-upgrade-required` (dipakai UI untuk kartu upsell, bukan error keras).

## Yang sudah dikirim (merge per sub-fase)

| Sub-fase | Isi | PR |
|---|---|---|
| 13a–13c | Struktur 4 paket + penegakan modul + billing per paket + upsell + landing harga/demo/layanan | #84 |
| 13d | Fondasi i18n (ID/EN) + landing dwibahasa | #85 |
| 13f | Wizard migrasi & saldo awal (jurnal pembuka seimbang) | #86 |
| 13e | Multibahasa gelombang 2 (shell aplikasi + dashboard) | #87 |
| 13g | Keamanan enterprise (2FA wajib, IP CIDR, audit CSV) | #88 |
| 13h | API publik (Bearer) + webhook (HMAC) + `/api-docs` | #89 |

## Keputusan default yang mudah digeser (satu tempat)

1. Enterprise termasuk **3 entitas**, tambahan **Rp750rb/entitas** (`EXTRA_ENTITY_PRICE`).
2. Bahasa kedua = **Inggris**; bahasa lain tinggal menambah kolom kamus di `apps/web/src/i18n`.
3. Kuota AI per paket di `PLAN_LIMITS` (`aiDailyLimit`).

## Menunggu koordinasi pemilik (bukan pemblokir kode)

- **Server Key Midtrans** → checkout paket nyata (kode siap sejak 11b/13b).
- **Aktifkan R2** → membuka lampiran dokumen (prasyarat Enterprise).
- **Provisioning D1 dinamis** → menerima >6 tenant (toggle + verifikasi produksi).
- **PLATFORM_ADMIN_EMAILS** → melihat permintaan demo di Admin Platform; **Resend** → email notifikasi demo.

## Sisa opsional (belum dikerjakan)

- **13i — Kustomisasi dokumen**: format nomor dokumen kustom + custom field per modul (khas perusahaan besar).
- Tulis penuh via API publik (faktur/pembayaran) dengan kurasi posting jurnal.
- Dunning otomatis + upgrade/downgrade prorata mandiri.
