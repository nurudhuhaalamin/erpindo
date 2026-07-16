# Log Kerja — Fase 9b: Simulasi UI penuh (klik-tembus browser nyata pertama)

**Tanggal:** 15 Juli 2026 · Menjawab arahan pemilik "simulasi penuh semua fitur".

## Latar

648→668 uji smoke seluruhnya di lapis HTTP/API — UI React belum pernah diuji interaksinya.
Fase 9b menambah lapisan uji ketiga: browser Chromium sungguhan yang login, mengetik di form,
mengeklik tombol, dan memverifikasi hasil di layar.

## Yang dibangun

1. **`scripts/audit-routes.mjs`** — satu sumber kebenaran daftar rute (44, +8 rute yang belum
   tercakup: pesanan-penjualan, pengadaan, pajak, dimensi, kas-bank, catat, laporan-penjualan,
   absensi); `screenshots.mjs` kini mengimpornya (set `audit` otomatis ikut lengkap).
2. **`scripts/ui-sim.mjs`** — driver plain-node Playwright (pola boot sama dengan
   screenshots.mjs: wrangler dev port scratch + register + seed demo penuh + login):
   - **Sapu 44 rute**: konten render + bebas `pageerror`/`console.error`/respons ≥500;
   - **13 alur interaktif**: login+pindah workspace · buat produk & kontak via form · wizard
     Catat Transaksi (uang keluar) · jurnal manual seimbang → Neraca Saldo tetap seimbang ·
     buku besar (paginasi 9a teruji di UI) · POS buka shift → keranjang → bayar tunai → struk ·
     terima pembayaran faktur outstanding · CRM lead baru di funnel · tiket helpdesk ·
     karyawan baru · ajukan + setujui alur persetujuan · Laba Rugi angka non-nol ·
     toggle Mode Sederhana (4 menu tersembunyi & pulih);
   - Reporter ala smoke: `UI-SIM: N/N checks passed`, exit 1 bila gagal; POST 4xx dicatat
     dengan isi respons agar kegagalan alur langsung terlihat penyebabnya di log CI.
3. **Job CI baru "UI simulation (non-blocking)"** — paralel dengan job gate, `continue-on-error`
   dulu; dipromosikan wajib setelah stabil (rencana Fase 9d). Chromium via
   `npx playwright-core install chromium`.

## Temuan menarik selama pembuatan (bukti nilai uji lapis UI)

- Kartu produk pertama di POS bisa jasa Rp 0 / produk tanpa stok → penjualan ditolak API
  dengan pesan benar — simulasi kini memilih produk berstok (perilaku API tervalidasi dari UI).
- Sidebar dirender dua kali (desktop + drawer mobile) — asersi harus menghitung tautan
  `:visible` saja.

## Validasi

Typecheck · lint bersih · unit test 33 · build · **smoke 668 (tak berubah)** ·
**UI-SIM 122/122 lulus** lokal. Log lengkap dikirim ke pemilik.

## Berikutnya

Fase 9c: efisiensi navigasi (taksonomi menu baru + pencarian + seksi lipat) — kini aman
dirombak karena ada jaring pengaman klik-tembus. Midtrans tetap pemblokir launching #1.
