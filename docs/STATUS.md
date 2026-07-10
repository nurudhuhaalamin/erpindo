# 📋 Status Proyek erpindo

> Halaman ini ditulis untuk pemilik produk (non-teknis). Selalu diperbarui setiap ada kemajuan.
> Log teknis per fase ada di folder [docs/log/](./log/).

**Terakhir diperbarui:** 10 Juli 2026

## Di mana kita sekarang?

| Fase | Isi | Status |
|---|---|---|
| Perencanaan | Blueprint bisnis & teknis | ✅ Selesai |
| Fase 0 — Fondasi | Kerangka aplikasi, akun & login, multi-tenant, keamanan dasar, design system, CI/CD | ✅ Selesai |
| Fase 1a — Akuntansi inti & master data | Bagan akun (template Indonesia), jurnal double-entry, buku besar, neraca saldo; produk, kontak, gudang | ✅ Selesai |
| Fase 1b — Penjualan & Pembelian | Faktur jual/beli dengan jurnal & stok otomatis (biaya rata-rata), pembayaran, PPN, level stok | ✅ Selesai |
| Fase 1c — Laporan & dashboard | Laba Rugi, Neraca (selalu seimbang), dashboard angka nyata | ✅ Selesai |
| Fase 1d — Pelengkap MVP | Kartu stok, umur piutang/hutang, ekspor CSV, tutup buku | ✅ Selesai — MVP inti lengkap |
| Fase 2a — PWA & cetak faktur | Aplikasi bisa di-install & offline; faktur bisa dicetak/PDF | ✅ Selesai |
| Fase 2b-1 — Fondasi langganan & arus kas | Paket & batasnya, siklus trial otomatis, mode baca-saja saat menunggak, laporan arus kas | ✅ Selesai |
| Fase 2c — Keamanan 2FA & landing page | Verifikasi dua langkah (authenticator) + halaman depan siap jualan | ✅ Selesai |
| Fase 2d — Impor CSV | Impor produk & kontak dari Excel/CSV dengan laporan per baris | ✅ Selesai |
| Fase 2e — Opname & audit log | Penyesuaian stok berjurnal otomatis + riwayat aktivitas untuk Owner | ✅ Selesai |
| Fase 2f — Retur jual/beli | Nota kredit/debit dengan jurnal pembalik & stok otomatis | ✅ Selesai |
| Fase 2g — Transfer gudang, multi-perusahaan, profil, pengingat email | Operasional harian makin lengkap | ✅ Selesai |
| Fase 2h — POS / Kasir | Layar kasir cepat, shift + rekap kas berjurnal, struk | ✅ Selesai |
| Fase 2i — Persetujuan pembelian | Pembelian besar oleh Admin wajib disetujui Owner dulu | ✅ Selesai |
| Fase 2j — Lot & kedaluwarsa (FEFO) | Lacak lot/exp per produk, keluar otomatis yang paling dekat kedaluwarsa, peringatan ≤ 30 hari | ✅ Selesai |
| Fase 2k — Tampilan baru ala SaaS modern | Sidebar gelap berikon, kartu statistik berwarna, avatar, badge status konsisten, landing lebih meyakinkan | ✅ Selesai |
| Fase 2l — CRM Pipeline | Catat calon pelanggan (lead), tahap funnel, aktivitas follow-up, konversi jadi pelanggan + penawaran (quotation) sekali klik ke faktur | ✅ Selesai |
| Fase 2n — Anggaran | Tetapkan target pendapatan & beban per akun per bulan; realisasi otomatis dari jurnal; laporan selisih (varians) berwarna | ✅ Selesai |
| Fase 2o — HR & Payroll | Data karyawan, penggajian bulanan dengan PPh 21 (metode TER) & BPJS otomatis, slip gaji, jurnal beban gaji otomatis | ✅ Selesai |
| Fase 2p — Aset Tetap | Register aset, penyusutan garis lurus otomatis tiap bulan (jurnal), pelepasan aset dengan laba/rugi | ✅ Selesai |
| Fase 2q — Proyek | Proyek & tugas, tag pendapatan/biaya per proyek (faktur & jurnal), laporan profitabilitas | ✅ Selesai |
| Fase 2r — Multi mata uang | Kurs valas, faktur mata uang asing (dikonversi ke IDR), laba/rugi selisih kurs otomatis saat pelunasan | ✅ Selesai |
| Fase 2s — Kontrak & tagihan berulang | Kontrak langganan yang menerbitkan faktur otomatis tiap periode; produk jasa (tanpa stok) | ✅ Selesai |
| Fase 2t — Konsolidasi multi-perusahaan | Buat perusahaan tambahan dari satu akun; laporan Laba Rugi & Neraca gabungan lintas perusahaan milik pemilik yang sama | ✅ Selesai |
| Fase 2u — Manufaktur & QC | Resep produk (BoM), perintah produksi (bahan → produk jadi biaya gabungan), inspeksi QC (lulus/karantina) | ✅ Selesai |
| Fase 2v — Maintenance / servis aset | Jadwal servis berkala per aset (Cron menerbitkan work order), work order ad-hoc, riwayat & biaya dijurnal | ✅ Selesai |
| Fase 2w — Helpdesk | Tiket dukungan pelanggan: prioritas & status, penugasan ke tim, balasan + catatan internal | ✅ Selesai |
| Fase 2x — Ekspor e-Faktur | Ekspor CSV faktur keluaran ber-PPN per periode (NPWP/DPP/PPN) untuk impor e-Faktur DJP | ✅ Selesai |
| Fase 2y — UI responsif + tema + landing | Sidebar/menu ikut tema terang↔gelap, menu mobile jadi off-canvas drawer, tabel responsif, landing marketing penuh + harga baru | ✅ Selesai |
| Fase 3a — Kepatuhan 2026 + trial 30 hari | Trial 30 hari (teks diturunkan dari konstanta), batas upah JP BPJS Rp11.086.300 (Maret 2026), tanggal format Indonesia, email bertanda tangan | ✅ Selesai |
| Fase 3b — Void, edit master data & konfirmasi | Batalkan faktur jual/beli (jurnal pembalik + stok kembali persis), edit produk/kontak/gudang & nama akun dari UI, dialog konfirmasi untuk semua aksi berisiko | ✅ Selesai |
| Fase 3c — Pencarian, pagination & pemilih berskala | Kotak cari + muat-lebih-banyak di semua daftar utama, combobox typeahead produk/kontak (faktur, kontrak, BoM), pencarian POS sisi server — siap ribuan produk | ✅ Selesai |
| Fase 3d — Diskon, logo kop & notifikasi | Diskon % per baris (faktur, POS, cetakan; PPN & jurnal mengikuti), logo kop faktur/struk dari Pengaturan, ambang stok minimum + lonceng notifikasi (stok menipis, faktur jatuh tempo, tiket, persetujuan) | ✅ Selesai |
| Fase 3e — Dashboard modern & polish | Grafik penjualan 30 hari, checklist onboarding, widget jatuh tempo + feed aktivitas, halaman auth split, nav↔judul selaras (Maintenance→Pemeliharaan), paragraf pengantar semua halaman, favicon/OG + shortcut PWA | ✅ Selesai |
| Fase 3f — e-Faktur XML Coretax | Ekspor XML `TaxInvoiceBulk` sesuai skema impor Coretax terbaru (kode 04 DPP nilai lain 11/12 utk non-mewah, kode 01 utk tarif 12%; NPWP→TIN 16 digit; faktur void/non-PPN dikecualikan) — rangkaian Fase 3 lengkap | ✅ Selesai |
| Fase 4a — Akun bebas langganan + seed demo | Daftar email khusus (`COMPED_EMAILS`) mendapat tenant aktif permanen paket Enterprise (kebal siklus trial); skrip seed "PT Demo Sejahtera" mengisi data hidup SEMUA modul (131 langkah, neraca seimbang) untuk review langsung — **sudah dijalankan di produksi** | ✅ Selesai |
| Fase 4b — Identitas visual baru | Palet baru total: indigo-violet + aksen amber (semua halaman lewat token), font Inter Variable, kartu/tombol/badge disempurnakan, ikon & PWA baru, kontras dark mode diperbaiki | ✅ Selesai |
| Fase 4c — Landing page baru | Hero dengan screenshot produk nyata, trust bar, showcase 5 alur bertab, seksi perbandingan vs Excel, FAQ 8, pipeline screenshot otomatis (WebP 534 KB total) | ✅ Selesai |
| Fase 4d — Panduan lengkap | 23 modul panduan ber-screenshot asli di `/panduan` (publik, code-split, bisa dicari), versi Markdown di repo (`docs/panduan/`), dan tombol `?` di tiap halaman aplikasi yang membuka panduan terkait | ✅ Selesai |
| Fase 4e — Asisten AI gratis | "Asisten erpindo" via Cloudflare Workers AI (kuota gratis 10rb neuron/hari, tanpa API key): chat cara pakai grounded panduan + draf jurnal dari bahasa alami (usulan seimbang, manusia yang memposting); kuota 50/hari/perusahaan; mundur anggun bila AI tak tersedia | ✅ Selesai |
| Fase 4f — Roadmap lanjutan per modul | Dokumen [03-roadmap-lanjutan.md](./03-roadmap-lanjutan.md): 23 modul dinilai kondisi saat ini + quick wins + ide lanjutan berskor Dampak/Usaha/AI, ditutup urutan prioritas 6 bulan & analisis kuota AI gratis — rangkaian Fase 4 lengkap | ✅ Selesai |
| **Fase 5a — Perbaikan kritis review pemilik** | Bug tombol keluar kartu di Penjualan/Pembelian HP, header 4 halaman laporan berantakan di layar sempit, menu hamburger landing, harga 3 kolom di tablet — diverifikasi matriks 108 screenshot (36 halaman × 3 ukuran layar). Jalur error AI dibuat terbaca (503 kini menyebut alasannya; kuota tak terpotong saat gagal) + alat probe produksi untuk mendiagnosa kenapa AI belum menjawab | ✅ **Selesai** |
| Fase 2m — Manajemen dokumen (lampiran file) | Lampiran di faktur/kontak/jurnal (penyimpanan Cloudflare R2) | ⏸ **Menunggu Anda mengaktifkan R2 di dashboard Cloudflare** |
| Fase 2b-2 — Pembayaran langganan | Checkout Midtrans/Xendit, aktivasi otomatis | ⏸ **Menunggu akun gateway dari Anda** |
| Fase 2 — Peluncuran SaaS | Pendaftaran mandiri, pembayaran langganan, PWA penuh | Belum |
| Fase 3+ | POS, HR & Payroll, dan modul lanjutan | Belum |

## Apa yang sudah bisa dilakukan aplikasi hari ini?

1. **Mendaftar sebagai perusahaan baru** — sistem otomatis membuatkan "database pribadi" untuk perusahaan tersebut (inilah pondasi multi-tenant: data tiap perusahaan benar-benar terpisah).
2. **Login/logout dengan aman** — password tersimpan terenkripsi, sesi aman, ada verifikasi email dan lupa-password.
3. **Mengundang anggota tim dengan peran berbeda** — Owner/Admin bisa mengubah data, Viewer hanya bisa melihat. Sistem menolak orang luar yang mencoba mengakses data perusahaan lain.
4. **Mengatur profil perusahaan** (nama, alamat, NPWP) — tersimpan di database milik perusahaan itu sendiri.
5. **Tampil rapi di HP, tablet, dan komputer**, dengan mode terang/gelap.
6. **Pembukuan double-entry sungguhan** *(baru — Fase 1a)*: bagan akun standar Indonesia langsung tersedia (18 akun, bisa ditambah), mencatat jurnal umum (sistem menolak jurnal yang tidak seimbang), melihat buku besar per akun dan neraca saldo yang selalu seimbang. Jurnal yang sudah diposting tidak bisa diubah-ubah — sesuai prinsip audit.
7. **Master data** *(Fase 1a)*: daftar produk (dengan harga jual/beli), kontak pelanggan & pemasok, dan gudang.
8. **Jual-beli lengkap** *(baru — Fase 1b)*: membuat faktur penjualan dan pembelian dengan PPN — sistem **otomatis** membuat catatan akuntansinya dan menambah/mengurangi stok (dengan perhitungan harga pokok rata-rata). Menjual barang yang stoknya kurang otomatis ditolak.
9. **Pencatatan pembayaran** *(baru — Fase 1b)*: menerima pembayaran pelanggan atau membayar pemasok; status faktur otomatis menjadi "lunas"; membayar melebihi tagihan ditolak.
10. **Pantauan stok** *(Fase 1b)*: level stok per gudang beserta nilai persediaan.
11. **Laporan keuangan** *(baru — Fase 1c)*: **Laba Rugi** per periode dan **Neraca** per tanggal yang selalu seimbang (laba berjalan otomatis diperhitungkan) — dihitung langsung dari jurnal, jadi pasti konsisten dengan buku besar.
12. **Dashboard angka nyata** *(Fase 1c)*: kas & bank, penjualan bulan berjalan, piutang/hutang belum lunas, dan nilai persediaan terpampang begitu Anda masuk.
13. **Kartu stok** *(baru — Fase 1d)*: riwayat keluar-masuk setiap barang dengan saldo berjalan.
14. **Umur piutang/hutang** *(baru — Fase 1d)*: siapa berutang berapa dan sudah berapa lama (belum jatuh tempo / 1–30 / 31–60 / 61–90 / >90 hari).
15. **Ekspor CSV** *(baru — Fase 1d)*: Laba Rugi, Neraca, dan aging dapat diunduh dan dibuka di Excel.
16. **Tutup buku** *(Fase 1d)*: Owner dapat mengunci periode — transaksi bertanggal pada periode terkunci ditolak sistem dari jalur mana pun.
17. **Di-install seperti aplikasi native** *(baru — Fase 2a)*: buka aplikasi di HP/komputer → menu "Install"/"Add to Home Screen"; aplikasi tetap terbuka saat offline dan meng-update dirinya otomatis.
18. **Cetak / simpan PDF faktur** *(Fase 2a)*: setiap faktur penjualan punya tampilan cetak profesional dengan kop perusahaan Anda.
19. **Laporan arus kas** *(baru — Fase 2b-1)*: kas masuk/keluar per periode dengan saldo awal & akhir.
20. **Siklus langganan otomatis** *(Fase 2b-1)*: paket dengan batas pengguna yang ditegakkan sistem; trial 30 hari dengan banner pengingat; saat trial habis akun otomatis menjadi baca-saja (data aman, tidak hilang) sampai langganan diaktifkan.
21. **Verifikasi dua langkah (2FA)** *(baru — Fase 2c)*: aktifkan di Pengaturan → Keamanan; login lalu membutuhkan kode 6 digit dari aplikasi authenticator di HP Anda — standar keamanan yang sama dengan internet banking.
22. **Halaman depan siap jualan** *(Fase 2c)*: hero, fitur unggulan, dan daftar harga paket.
23. **Impor dari Excel/CSV** *(Fase 2d)*: pindahkan daftar produk & kontak lama sekaligus — unduh template, isi, unggah; baris bermasalah dilaporkan satu per satu tanpa menggagalkan sisanya.
24. **Stok opname** *(baru — Fase 2e)*: hitung fisik gudang, masukkan angkanya — sistem menyamakan stok dan otomatis membukukan nilai selisihnya (barang hilang/rusak menjadi beban).
25. **Riwayat aktivitas** *(Fase 2e)*: Owner bisa melihat 100 aktivitas terakhir — siapa melakukan apa dan kapan.
26. **Retur penjualan & pembelian** *(Fase 2f)*: barang dikembalikan? Klik Retur pada fakturnya — pembukuan terbalik otomatis (termasuk PPN proporsional), stok kembali bergerak, dan sisa tagihan langsung menyesuaikan.
27. **Transfer antar gudang** *(baru — Fase 2g)*: pindahkan stok antar gudang — nilai persediaan ikut berpindah dengan benar.
28. **Multi-perusahaan** *(baru — Fase 2g)*: satu akun bisa mengelola beberapa perusahaan dan berpindah lewat dropdown.
29. **Profil & ganti password** *(baru — Fase 2g)*: ganti password mencabut sesi di perangkat lain secara otomatis.
30. **Pengingat email otomatis** *(Fase 2g)*: Owner diberi tahu saat trial hampir habis dan saat berakhir.
31. **Kasir (POS)** *(Fase 2h)*: layar kasir cepat untuk toko/kafe — klik produk, terima tunai, kembalian dihitung, struk tercetak; buka/tutup shift dengan hitung kas fisik dan selisihnya otomatis masuk pembukuan.
32. **Persetujuan pembelian** *(Fase 2i)*: tetapkan ambang (mis. Rp 5 juta) — pembelian Admin di atas itu menunggu persetujuan Anda dan baru diproses (stok & pembukuan) setelah disetujui; bisa ditolak dengan catatan.
33. **Lot & tanggal kedaluwarsa (FEFO)** *(Fase 2j)*: centang "lacak kedaluwarsa" pada produk (cocok untuk F&B/farmasi) — pembelian wajib mengisi tanggal exp per baris, penjualan otomatis mengambil lot yang paling dekat kedaluwarsa lebih dulu, dan halaman Stok menandai lot yang lewat (merah) atau ≤ 30 hari lagi (kuning).
34. **Tampilan baru ala SaaS modern** *(Fase 2k)*: sidebar gelap dengan ikon per menu, avatar pengguna, kartu statistik dashboard berikon warna, badge status konsisten (hijau lunas / kuning menunggu / merah lewat), skeleton saat memuat, dan landing page dengan ikon fitur + paket "Terpopuler" yang menonjol.
35. **CRM Pipeline** *(Fase 2l)*: catat calon pelanggan (lead) beserta perkiraan nilainya, gerakkan lewat tahap funnel (baru → dihubungi → terkualifikasi → penawaran → menang/kalah), catat setiap aktivitas follow-up (telepon/WA/email/pertemuan), lalu **konversi lead menjadi pelanggan** sekali klik. Buat **penawaran harga (quotation)** — belum menyentuh stok/pembukuan — dan saat pelanggan setuju, **konversi menjadi faktur penjualan** sekali klik (stok & jurnal otomatis, lewat mesin faktur yang sama). Dashboard menampilkan jumlah lead terbuka.
36. **Anggaran** *(Fase 2n)*: tetapkan target pendapatan & beban per akun untuk tiap bulan, lalu bandingkan dengan **realisasi yang dihitung otomatis dari jurnal**. Selisih ditandai warna (hijau bila menguntungkan — pendapatan di atas target atau beban di bawah target; merah bila sebaliknya), lengkap dengan ringkasan laba/rugi anggaran vs realisasi dan ekspor CSV.
37. **HR & Penggajian** *(Fase 2o)*: catat karyawan (jabatan, status PTKP, gaji pokok + tunjangan), lalu **jalankan penggajian bulanan sekali klik** — sistem menghitung **PPh 21 metode TER** dan **potongan BPJS** (Kesehatan, JHT, JP dengan batas upah) tiap karyawan, menyusun slip gaji, dan otomatis membukukan jurnal beban gaji (netto ke kas, potongan pajak & iuran jadi hutang untuk disetor). *Catatan: tarif pajak/BPJS mengikuti ketentuan 2024 dan diberi tanda agar diverifikasi sebelum penggajian resmi.*
38. **Aset Tetap** *(Fase 2p)*: daftarkan aset (kendaraan, mesin, peralatan) beserta nilai perolehan, masa manfaat, dan nilai residu — sistem membuat jurnal perolehan dan **menyusutkan garis lurus otomatis tiap awal bulan** (beban penyusutan dibukukan sendiri). Saat aset dijual/dibuang, **pelepasan sekali klik** menghapusnya dari buku dan mencatat laba/rugi pelepasan. Halaman menampilkan nilai buku berjalan & persentase tersusut.
39. **Proyek** *(Fase 2q)*: buat proyek (mis. per klien/pekerjaan) dan **tandai faktur, pembelian, atau jurnal ke proyek** — sistem menghitung **profitabilitas per proyek** (pendapatan − biaya = laba, lengkap dengan margin) langsung dari jurnal, jadi konsisten dengan pembukuan. Kelola juga daftar tugas per proyek. Menutup rangkaian modul back-office (Gelombang B).
40. **Multi mata uang** *(Fase 2r)*: tetapkan kurs mata uang asing, lalu **buat faktur dalam USD, SGD, dsb.** — sistem otomatis mengonversi ke Rupiah untuk pembukuan (semua laporan tetap dalam IDR). Saat pelanggan/pemasok melunasi pada kurs yang berbeda, **laba/rugi selisih kurs dijurnal otomatis**. Cocok untuk usaha ekspor/impor.
41. **Kontrak & tagihan berulang** *(Fase 2s)*: buat **kontrak langganan** (bulanan/triwulan/tahunan) — sistem **menerbitkan faktur otomatis** tiap periode jatuh tempo (bisa juga dipicu manual). Dilengkapi **produk jasa** (tanpa stok) agar cocok untuk layanan, sewa, maintenance, dan retainer. Ideal untuk pendapatan berulang.
42. **Konsolidasi multi-perusahaan** *(Fase 2t)*: kelola **beberapa badan usaha dari satu akun** (buat perusahaan baru langsung dari Pengaturan), lalu lihat **Laba Rugi & Neraca gabungan** seluruh perusahaan Anda dalam satu tabel — nilai tiap akun dijumlahkan lintas perusahaan dengan rincian per perusahaan di setiap kolom. Bisa memfilter perusahaan yang disertakan & ekspor CSV. Data tiap perusahaan tetap terpisah dan aman.
43. **Manufaktur & QC** *(Fase 2u)*: buat **resep produk (BoM)** — komponen & jumlah untuk menghasilkan produk jadi — lalu jalankan **perintah produksi**: bahan otomatis keluar dari stok dan produk jadi masuk stok dengan **biaya gabungan** (biaya bahan dibagi jumlah hasil). **Inspeksi QC** menentukan hasil siap jual atau dikarantina ke gudang khusus. Cocok untuk mebel, makanan, konveksi, dan perakitan.
44. **Maintenance / servis aset** *(Fase 2v)*: buat **jadwal servis berkala** per aset (kendaraan, mesin) — sistem **menerbitkan work order otomatis** saat jatuh tempo. Bisa juga buat **work order ad-hoc** untuk perbaikan mendadak. Saat pekerjaan selesai, biaya servis dicatat dan **langsung dijurnal sebagai Beban Pemeliharaan**, lengkap dengan riwayat & total biaya per aset.
45. **Helpdesk** *(Fase 2w)*: kelola **tiket dukungan pelanggan** — atur **prioritas** (rendah s.d. mendesak) dan **status** (terbuka → diproses → selesai), **tugaskan ke anggota tim**, dan balas lewat utas percakapan dengan opsi **catatan internal** yang tak terlihat pelanggan. Setiap tiket terhubung ke kontak.
46. **Ekspor e-Faktur** *(baru — Fase 2x)*: hasilkan **CSV faktur keluaran ber-PPN** per periode — lengkap dengan NPWP/nama pembeli, DPP, dan PPN — siap diimpor ke aplikasi e-Faktur DJP. Faktur non-PPN otomatis dikecualikan; pembeli tanpa NPWP diekspor sebagai `000000000000000`.

47. **Batalkan (void) faktur** *(baru — Fase 3b)*: faktur jual/beli yang salah input dan **belum dibayar/diretur** bisa dibatalkan sekali klik — sistem memposting **jurnal pembalik persis** dan **mengembalikan stok pada biaya asal**, dokumen tetap tercatat dengan tanda DIBATALKAN (jejak audit utuh). Dokumen di periode terkunci atau yang stok pembeliannya sudah bergerak diarahkan memakai retur.
48. **Edit master data & nama akun** *(baru — Fase 3b)*: produk, kontak, dan gudang kini bisa **diubah langsung dari halaman** (tombol Ubah per baris); nama akun di Bagan Akun bisa diganti (kode & tipe sengaja terkunci demi integritas laporan). Mengubah SKU/kode ke nilai yang sudah dipakai ditolak dengan pesan jelas.
49. **Dialog konfirmasi berbrand** *(baru — Fase 3b)*: semua aksi berisiko — arsip data, batalkan dokumen, tutup buku, lepas aset, nonaktif 2FA — kini meminta konfirmasi lewat dialog yang menjelaskan konsekuensinya.
50. **Pencarian & skala besar** *(baru — Fase 3c)*: kotak cari di daftar Produk/Kontak/Gudang, Penjualan/Pembelian, dan Jurnal (dengan "Muat lebih banyak"); memilih produk/pelanggan di form faktur, kontrak, dan resep produksi kini lewat **kotak ketik-cari** yang mengambil hasil dari server — aplikasi tetap ringan meski katalog berisi ribuan produk. Pencarian kasir POS juga dari server.
51. **Diskon per baris** *(baru — Fase 3d)*: kolom diskon % di setiap baris faktur penjualan/pembelian dan keranjang POS — **PPN dan seluruh pembukuan otomatis mengikuti nilai setelah diskon**; cetakan faktur & struk menampilkan diskonnya.
52. **Logo kop faktur & struk** *(baru — Fase 3d)*: unggah logo perusahaan di Pengaturan (otomatis dikecilkan) — langsung tampil di kop cetakan faktur dan struk kasir.
53. **Lonceng notifikasi & stok menipis** *(baru — Fase 3d)*: tetapkan ambang stok minimum per produk; lonceng di bilah atas memberi tahu **stok menipis, faktur lewat jatuh tempo, tiket terbuka, dan pembelian menunggu persetujuan** — klik untuk langsung menuju halamannya.
54. **Dashboard modern & panduan mulai** *(baru — Fase 3e)*: grafik tren penjualan 30 hari dengan tooltip, widget faktur lewat jatuh tempo, feed aktivitas terakhir, dan **checklist "Mulai cepat"** berprogres untuk perusahaan baru (hilang otomatis saat lengkap). Halaman daftar/masuk bergaya split modern; setiap halaman kini punya paragraf pengantar; nama menu dan judul halaman konsisten (Maintenance menjadi Pemeliharaan).
55. **Ekspor e-Faktur XML Coretax** *(baru — Fase 3f)*: satu klik "Unduh XML Coretax" di halaman Ekspor e-Faktur menghasilkan berkas XML yang **langsung bisa diimpor ke Coretax DJP** (format satu-satunya yang diterima sejak 2025). Sistem otomatis memakai kode transaksi yang benar — 04 dengan DPP nilai lain 11/12 untuk barang non-mewah (PMK 131/2024), 01 untuk tarif 12% penuh — menormalkan NPWP ke TIN 16 digit, dan mengecualikan faktur yang dibatalkan/non-PPN. CSV rekap tetap tersedia.

Semua hal di atas **diuji otomatis oleh mesin setiap kali ada perubahan kode** (397 skenario ujian end-to-end + 24 unit test). Perubahan tidak bisa masuk ke versi utama bila ada ujian yang gagal.

## Apakah sudah bisa diakses di internet?

**Ya — jalur deploy otomatis sudah aktif.** Anda telah menghubungkan repo GitHub ke Cloudflare (Workers Builds), dan infrastruktur produksi sudah dibuat di akun Cloudflare Anda: 1 database pusat + 5 database tenant (D1) + penyimpanan rate-limit (KV). Setiap perubahan yang masuk ke versi utama kini otomatis di-build dan di-deploy oleh Cloudflare. Alamat aplikasi bisa dilihat di dashboard Cloudflare → Workers & Pages → **erpindo** (format `erpindo.<nama-akun>.workers.dev`; domain sendiri bisa dipasang kapan saja lewat menu yang sama).

Catatan kapasitas: mode saat ini memakai pool 5 database tenant (cukup untuk 5 perusahaan pertama / masa pengembangan). Peralihan ke pembuatan database dinamis tanpa batas sudah disiapkan di kode — tinggal diaktifkan saat mendekati peluncuran komersial.

## Yang dikerjakan berikutnya

Seluruh mekanik langganan sudah jadi — tinggal pembayarannya. **Yang dibutuhkan dari Anda untuk Fase 2b-2** (±15 menit):

1. Daftar akun di https://dashboard.midtrans.com/register (gratis; siapkan data usaha & rekening bank).
2. Setelah masuk dashboard, buka **Settings → Access Keys**, salin **Server Key** yang berlabel *Sandbox*.
3. Kabari di sesi pengembangan — kunci akan disimpan sebagai *secret* terenkripsi (tidak pernah masuk ke kode), lalu seluruh alur checkout (QRIS/VA/e-wallet), webhook, dan aktivasi paket otomatis dibangun & diuji di mode sandbox dulu.

Sementara menunggu, pengembangan berlanjut ke hal-hal yang tidak butuh akun tersebut (notifikasi email, polising tampilan, keamanan 2FA, dan modul back-office seperti CRM).

### Untuk fitur Lampiran Dokumen (Fase 2m) — ±2 menit dari Anda

Fitur melampirkan file (foto/PDF) ke faktur, kontak, dan jurnal membutuhkan penyimpanan file **Cloudflare R2**, yang belum aktif di akun Anda. Mengaktifkannya: buka https://dash.cloudflare.com → menu **R2** → klik **Enable/Purchase R2** (ada kuota gratis 10 GB; Cloudflare hanya meminta kartu untuk verifikasi, tidak menagih selama di bawah kuota). Setelah aktif, kabari di sesi pengembangan — bucket dibuat otomatis dan fitur lampiran dibangun. Fase ini sengaja dilewati dulu agar pengembangan tidak berhenti; CRM (Fase 2l) dikerjakan lebih dulu.
