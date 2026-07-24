# Log Kerja — Fase 14e: Bukti sosial & konversi landing

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Menutup celah konversi di landing (survei 14-riset): tanpa bukti sosial, tanpa CTA lengket
mobile, kalkulator per-user tak menampilkan angka hemat.

1. **Bukti sosial faktual — bukan testimoni karangan.** Seksi **IntegrationBadges**:
   "Kompatibel dengan alat & standar yang Anda pakai" + badge kapabilitas nyata (Midtrans,
   e-Faktur/Coretax DJP, PPh 21 TER & BPJS, Google Drive, WhatsApp, impor Shopee/Tokopedia/
   TikTok). **Sengaja tidak membuat testimoni pelanggan palsu** (produk tahap awal; testimoni
   karangan menyesatkan) — badge kepatuhan/integrasi adalah trust signal yang jujur & benar.
2. **CTA lengket di mobile** (`StickyMobileCta`, `sm:hidden`): tombol "Coba Gratis" +
   "Hubungi". Tombol Hubungi mengarah ke **form Jadwalkan Demo** (`#demo`) yang sudah
   mengumpulkan nomor WhatsApp — **tanpa menanam nomor WA palsu** yang bisa menyasar orang lain.
3. **Kalkulator "Hemat Rp X"**: `PerUserCalculator` kini menampilkan penghematan eksplisit
   per bulan (biaya sistem per-user − harga paket Business) + harga Business konkret di kartu.
4. **Risk-reversal**: CtaBand → "Tanpa kartu kredit · batal kapan saja · data bisa diekspor
   kapan pun" (Hero sudah punya baris serupa).
5. **A11y/kontras**: alt text screenshot showcase kini deskriptif (judul + manfaat pertama,
   bukan sekadar judul tab); beberapa `text-slate-400` → `text-slate-500` untuk kontras.

Elemen baru dwibahasa via helper `L()` yang sudah ada (badge & CTA); string kalkulator
tetap Indonesia sampai Fase 14f (i18n landing tuntas).

## Validasi

- **UI-sim 182 → 183** (+1): landing memuat badge kompatibilitas (Midtrans/Coretax) +
  output "Hemat sekitar" di kalkulator (penanda netral-bahasa).
- Smoke 850 (SEO landing 14d tetap hijau) · typecheck 4/4 · lint bersih · build · unit 156.

## Catatan jujur

- Testimoni pelanggan asli sebaiknya ditambahkan pemilik saat sudah ada — struktur bukti
  sosial kini berbasis fakta (integrasi/kepatuhan), bukan kutipan yang dikarang.
- Tombol WhatsApp mengarah ke form demo alih-alih `wa.me/<nomor>` karena belum ada nomor WA
  resmi; tinggal diganti bila pemilik menyediakannya.
