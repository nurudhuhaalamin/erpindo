# Fase 20 — Laporan akhir untuk pemilik

Fase ini punya satu tujuan yang Anda tetapkan sendiri: **menghabiskan semua
pekerjaan yang tidak membutuhkan Anda**, sehingga yang tersisa benar-benar hanya
butir yang menuntut kredensial atau keputusan Anda.

Itu tercapai. Di bawah ini apa adanya — termasuk yang tidak selesai penuh.

## Yang jadi

| Sub-fase | Untuk Anda artinya |
| --- | --- |
| **20a–20c** Dunning & masa tenggang | Pelanggan yang **membayar** kini juga diperingatkan sebelum langganannya habis — sebelumnya hanya yang gratis. Plus masa tenggang 3 hari sesuai keputusan Anda |
| **20d** Rekap PPh per masa | Semua PPh (21, 23, Final) dalam satu layar saat mengisi SPT Masa, lengkap dengan penanda mana yang belum disetor |
| **20e** Revaluasi aset | Nilai wajar hasil appraisal masuk **Ekuitas**, bukan laba — untung yang belum terealisasi tidak menggelembungkan laba Anda |
| **20f** Eliminasi antar-perusahaan | Jual-beli antar perusahaan sendiri tidak lagi dihitung sebagai omzet grup |
| **20g** Picking multi-gudang | Satu faktur bisa mengambil dari beberapa gudang; harga pokok dihitung **per gudang asal** |
| **20h** Peramalan stok | Perkiraan kapan stok habis & berapa yang perlu dibeli, dengan kolom **Keyakinan** yang jujur soal data tipis |
| **20j** Kolom buatan sendiri | Tambah kolom Anda sendiri di Kontak/Produk/Faktur — ikut tercetak dan terekspor |
| **20k** Naik/turun paket sendiri | Berpindah paket tanpa menghubungi kami; angkanya terlihat sebelum Anda memutuskan |
| **20m** Halaman Pengaturan dwibahasa | Menutup lubang yang baru ketahuan di fase ini (lihat di bawah) |

## Yang HANYA sebagian, dan kenapa

**20i — Pindai barcode kamera.** Berfungsi di Chrome Android (kasir Anda hampir
pasti di sana), **tidak** di Safari iPhone. Rencana awal menyebut pustaka
tambahan sebagai cadangan; itu tidak dipasang.

Alasannya bukan malas: saya memeriksa peramban yang menjalankan uji otomatis
kami dan ia **tidak punya kamera sama sekali**. Artinya cadangan itu akan masuk
sebagai ±1,2 MB kode yang **tak satu pun uji kami bisa membuktikannya bekerja**.
Repositori ini sudah pernah kena persis itu — sebuah fungsi terjemahan hidup 13
fase tanpa satu pun pemanggil, dan tidak ada yang tahu.

Lebih baik satu batasan yang dinyatakan daripada satu janji yang tak teruji.

## Tiga hal yang saya keliru, dan bagaimana ketahuan

**1. Halaman Pengaturan tidak pernah dwibahasa.** Ini yang paling besar. Selama
seluruh program Fase 19 saya melaporkan aplikasi sudah dwibahasa — padahal
**219 potong tulisan** di halaman Pengaturan tidak pernah ikut. Sebabnya alat
pemeriksanya hanya melihat folder halaman utama dan tidak turun ke subfolder.

Ini **kelima kalinya** klaim cakupan saya soal dwibahasa ternyata tidak lengkap,
dengan sebab yang selalu sama: membaca daftar, bukan menjalankan alat pada
seluruh sasarannya. Karena itu di 20m alatnya diperbaiki **lebih dulu**, lalu
dibuktikan menangkap kesalahan yang dulu lolos, baru isinya diterjemahkan.

**2. Kartu fitur menjanjikan hal yang belum ada.** Deskripsi kolom kustom
berbunyi "ikut tampil di form, cetakan, dan ekspor". Saat memeriksa dengan mata,
formnya benar — tetapi cetakan tidak menyentuhnya sama sekali, dan ekspor CSV
untuk kontak/produk belum ada. Dua dari tiga janji itu salah saat saya
menuliskannya. Keduanya dikerjakan; deskripsinya **tidak** diperkecil.

**3. Satu gerbang pengujian saya lewatkan.** Di 20k saya menjalankan empat dari
lima gerbang dan mengira pekerjaannya selesai — hampir satu jam — sampai
gerbang kelima dijalankan dan langsung merah.

## Angka

| Gerbang | Awal Fase 20 | Sekarang |
| --- | ---: | ---: |
| Uji unit | 259 | **319** |
| Uji smoke (API sungguhan) | 863 | **928** |
| Simulasi UI (Chromium nyata) | 254 | **281** |

Setiap cek UI baru di fase ini **dibuktikan bisa gagal** — penjaganya dilumpuhkan
sementara sampai ceknya merah, lalu dikembalikan. Tanpa langkah itu sebuah cek
hanya membuktikan halamannya ter-render, bukan bahwa aturannya ditegakkan.

## Yang tersisa untuk Anda

| # | Butir | Yang perlu Anda lakukan | Waktu |
| --- | --- | --- | --- |
| 1 | **Server Key Midtrans** | dashboard.midtrans.com → Settings → Access Keys → salin **Server Key** (Sandbox dulu) → kabari saya | ±15 mnt |
| 2 | **Aktifkan Cloudflare R2** | dash.cloudflare.com → menu **R2** → Enable (kuota gratis 10 GB; kartu hanya untuk verifikasi) | ±2 mnt |
| 3 | Token WhatsApp *(opsional)* | Daftar Fonnte / WA Business API, salin token | ±20 mnt |
| 4 | API key marketplace *(opsional)* | Shopee/Tokopedia seller API — butuh akun seller aktif | bervariasi |
| 5 | API token Cloudflare *(opsional)* | Untuk provisioning D1 dinamis saat tenant > 6 | ±5 mnt |

Butir 1–2 membuka fitur yang **kodenya sudah siap dan menunggu** — termasuk
naik-paket prorata yang baru dibangun di 20k. Butir 3–5 membuka fitur baru dan
bisa ditunda tanpa memblokir apa pun.

Di luar kendali kita berdua: **Coretax API** menunggu DJP membuka API publik.

## Utang yang tercatat (bukan yang tersembunyi)

- **Teks halaman Panduan** masih berbahasa Indonesia. Sengaja: isi panduannya
  sendiri hanya ada dalam bahasa Indonesia, dan kerangka Inggris yang membungkus
  artikel Indonesia menjanjikan sesuatu yang tidak ada di dalamnya.
- **Safari iPhone tanpa pindai barcode** (lihat di atas).
- **Ditunda atas keputusan Anda**, tercatat di roadmap beserta alasannya: OCR
  nota, kupon/referral, wrapper mobile Play Store.
