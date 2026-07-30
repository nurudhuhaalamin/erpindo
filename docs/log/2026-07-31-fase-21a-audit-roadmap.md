# Fase 21a — Audit roadmap menyeluruh

Tanpa kode fitur. Satu tujuan: membuat `docs/03-roadmap-lanjutan.md` mencerminkan
kode, karena berkas itulah yang dipakai pemilik untuk memutuskan apa yang
dibangun berikutnya — dan berkas itu terbukti berulang kali salah.

## Kenapa audit ini perlu

| Kapan | Temuan |
| --- | --- |
| Saat menyusun rencana Fase 20 | **7 baris** sudah dikerjakan, hanya belum tercentang |
| Sesudah 20l | **4 baris lagi** basi — keempatnya saya sendiri yang bangun di Fase 20 |
| Audit ini | **29 dari 74** baris tanpa penanda ternyata salah gambar |

Fase 20l seharusnya sudah membereskan ini. Yang saya lakukan di sana: memperbaiki
**tujuh baris yang ada di daftar rencana saya**, bukan menyapu seluruh berkasnya.
Kesalahan yang sama persis dengan glob penyapu i18n di 20m — memperbaiki yang
saya ingat, bukan menjalankan pemeriksaan pada seluruh sasaran.

## Hasil

Baris ide bertanda status: **18 → 46** dari 92. Sisa 46 memang belum dikerjakan.

### ✅ Ternyata sudah ada (19 baris)

Semuanya diverifikasi ke kode, bukan ke ingatan:

| Baris | Bukti |
| --- | --- |
| Sales order terpisah dari faktur | `routes/salesOrders.ts` |
| Purchase order formal → GRN → faktur | `routes/procurement.ts` |
| Approval multi-level | `routes/approvalsEngine.ts`, `approval_flow_steps.step_order` |
| Departemen sebagai dimensi | cost center di `routes/dimensions.ts` |
| Laporan penjualan analitik | `routes/reports.ts` `sales-analytics` (Fase 5h/7h) |
| Ekspor Excel `.xlsx` | penulis OOXML mandiri di `api/client.ts` (Fase 7h) |
| Bukti potong 1721-A1 | `routes/tax.ts` |
| Absensi | `routes/payroll.ts` `/attendance` |
| Kasbon karyawan | `routes/payroll.ts` |
| Papan kanban drag-and-drop | `pages/crm.tsx` (`draggable` + `onDrop`) |
| Anggaran per proyek | `routes/projects.ts` |
| Timesheet per proyek | `routes/projects.ts` |
| Penagihan per termin proyek | `routes/projects.ts` (milestone) |
| Tulis penuh via API publik | `routes/publicApi.ts`, key ber-scope `write` |
| PPh unifikasi | Fase 20d |
| Revaluasi aset | Fase 20e |
| Eliminasi antar-perusahaan | Fase 20f |
| Prorata langganan | Fase 20k |
| Dunning otomatis | Fase 20a–20c |

Empat yang terakhir adalah pekerjaan saya sendiri di Fase 20 yang tidak saya
centang di 20l.

### 🟡 Sebagian (9 baris) — yang paling berguna dari audit ini

Inilah baris-baris yang paling mudah salah dibaca: ada sesuatu di kode, tetapi
**tidak seperti yang dijanjikan barisnya**.

| Baris | Yang ada | Yang belum |
| --- | --- | --- |
| **Satuan ganda** | kolom `uom_secondary`/`uom_factor` di master produk | konversinya **tidak dipakai saat transaksi** — `lib/commercePosting.ts` tak menyentuhnya sama sekali |
| **Laporan terjadwal via email** | rekap dibuat otomatis Cron & tersimpan | **tidak dikirim email**, tanpa PDF |
| **Jurnal berulang via Cron** | template jurnal | tidak dijadwalkan Cron |
| **Jurnal penutup otomatis** | tombolnya ada di Pengaturan | ditekan manual, bukan otomatis |
| **Auto-match bank cerdas** | auto-match deterministik berbasis kata kunci | pencocokan deskripsi bebas-format |
| **Rasio keuangan** | margin kotor | rasio lancar, perputaran persediaan |
| **Form lead publik** | form publik → `demo_requests` | **belum masuk CRM leads** |
| **Overhead ke HPP produksi** | kalkulator HPP di `pages/alat.tsx` | overhead belum masuk jurnal produksi |
| **Perbandingan periode** | delta vs bulan lalu | pembanding tahun lalu |

`uom_factor` adalah contoh paling jelas kenapa audit ini harus memeriksa
**perilaku, bukan keberadaan kolom**. Mencentangnya karena kolomnya ada akan
membuat pemilik mengira konversi dus→pcs sudah berjalan, padahal tidak.

## Koreksi: satu centang saya ternyata PALSU

Baris **"Ringkasan bulanan otomatis"** saya centang penuh di Fase 20l dengan
alasan `runMonthlyRecap` ada di handler cron. Isi fungsinya tidak saya periksa.

Ternyata fungsi itu **hanya menyimpan snapshot** ke `report_snapshots` dan
menulis audit log — **tidak memanggil mailer sama sekali**. Barisnya berbunyi
"narasi kinerja **dikirim email** tiap awal bulan"; bagian emailnya tidak ada.

Sudah dikoreksi jadi 🟡 beserta catatan koreksinya di baris itu.

Ini persis kelas kesalahan yang paling berbahaya di berkas ini: baris tak
bertanda hanya membuat pemilik mengira ada pekerjaan tersisa, sedangkan **centang
palsu membuatnya mengira pekerjaan itu tidak perlu**. Dari 18 baris yang sudah
bertanda, ini satu-satunya yang salah — 17 sisanya diverifikasi ulang dan benar.

## Aturan baru: ✅ wajib membawa jejak

Ditulis di kepala `docs/03-roadmap-lanjutan.md`, jadi berlaku untuk pembaruan
berikutnya:

- **✅ wajib menyebut berkas atau nomor fase** — klaimnya bisa diperiksa sendiri
  alih-alih dipercaya.
- **🟡 bila hanya sebagian**, menyebut apa yang ada dan apa yang belum. Kolom
  database yang ada tetapi tidak dipakai saat transaksi adalah 🟡, bukan ✅.
- **⏸️ bila ditunda**, beserta alasannya.
- Yang belum dikerjakan **dibiarkan tanpa tanda**.

Diperiksa: **0 baris ✅ tanpa jejak**.

## Validasi

Tidak ada kode fitur, jadi gerbang dipakai untuk membuktikan **tidak ada yang
rusak** — angkanya harus **tetap**, bukan naik:

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **319** (tetap) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **928** (tetap) |
| `node scripts/ui-sim.mjs` | 0 | **281** (tetap) |
| `sapu-i18n` (glob `**`) | 0 | utang atribut **0** (tetap) |

## Catatan cara kerja: satu grep saya sempat salah

Saat memeriksa "laporan terjadwal" saya mencari `scheduled_reports` dan tidak
menemukan apa pun — hampir menyimpulkan fiturnya tidak ada. Nama berkasnya
ternyata `routes/scheduledReports.ts` dan tabelnya `report_snapshots`.

Pola grep yang salah terlihat persis seperti fitur yang tidak ada. Karena itu
tiap "TIDAK ADA" dalam audit ini dicari dengan **lebih dari satu pola** sebelum
disimpulkan.

## Yang benar-benar tersisa

**Tidak butuh Anda** — kandidat Fase 21 berikutnya:

- Revaluasi saldo valas akhir periode (selisih kurs belum terealisasi) — saat ini
  kurs hanya dijurnal saat pelunasan, jadi laporan akhir bulan perusahaan
  ber-valas belum sesuai PSAK
- Mode offline penuh POS (antrean IndexedDB)
- Harga bertingkat per pelanggan/grup
- Menuntaskan sembilan baris 🟡 di atas — beberapa berbiaya rendah, mis.
  **mengirimkan rekap bulanan yang sudah dibuat** (fungsinya sudah ada, tinggal
  memanggil mailer) dan **menyambungkan form lead publik ke CRM**
- Stok konsinyasi, dashboard bisa dikustomisasi, kas kecil, proyeksi arus kas

**Menunggu Anda**: Server Key Midtrans, aktivasi R2, token WhatsApp, API key
marketplace, API token Cloudflare. Di luar kendali kita: Coretax API.
