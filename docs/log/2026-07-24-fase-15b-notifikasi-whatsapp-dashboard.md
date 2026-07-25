# Log Kerja — Fase 15b: Tombol pengingat WhatsApp di dashboard

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Fitur retensi harian: dari widget **"Faktur lewat jatuh tempo"** di dashboard,
pemilik kini bisa menagih pelanggan **satu klik** lewat WhatsApp — tanpa membuka
tiap faktur. Berjalan **tanpa kunci apa pun** (memakai `wa.me`; pengguna memilih
kontak tujuan di WhatsApp).

1. **`ApiNotification.waText?`** (`packages/shared/src/accounting.ts`): field
   opsional berisi pesan pengingat siap-kirim. Bila ada, UI menampilkan tombol WA.
2. **API** (`apps/api/src/routes/tenants.ts`): untuk tiap faktur jatuh tempo,
   `waText` diisi pesan berbahasa Indonesia yang sopan — memuat nama pelanggan,
   no. faktur, nominal sisa (format rupiah), dan tanggal jatuh tempo. Notifikasi
   jenis lain (stok menipis, tiket, dll.) **tidak** diberi `waText`.
3. **UI** (`apps/web/src/pages/dashboard.tsx`): tiap baris faktur jatuh tempo di
   widget kini punya tombol **"Tagih (WA)"** (ikon MessageCircle, hijau) yang
   membuka `https://wa.me/?text=<pesan>` di tab baru. Tautan ke daftar penjualan
   tetap ada; tombol tak mengganggu navigasi.

Mengikuti pola "Tagih (WA)" yang sudah ada di detail faktur (Fase 11d) — kini
dibawa ke dashboard tempat pemilik meninjau harinya.

## Validasi

- typecheck 4/4 · lint bersih · build · unit 90 (shared).
- **Smoke 850 → 852** (+2): notifikasi jatuh tempo membawa `waText` yang memuat
  no. faktur + nominal; notifikasi `low_stock` tidak membawa `waText`.
- **ui-sim**: dijalankan untuk memastikan tanpa regresi. Tombol sendiri tak
  muncul di skenario ui-sim karena dashboard sim memakai tenant baru tanpa faktur
  jatuh tempo — jadi jalur datanya dikunci di smoke, sedangkan render tombol
  bersifat kondisional sederhana (`n.waText && …`) yang lolos typecheck/build.

## Catatan

- Tombol memakai `wa.me` tanpa nomor (pengguna pilih kontak) — konsisten dengan
  Fase 11d dan menghindari menyimpan/menebak nomor. Bila kelak ada nomor kontak
  tersimpan, tinggal disisipkan ke `waLink()` (sudah teruji di shared).
- Kandidat perluasan berikutnya: tombol serupa di dropdown lonceng notifikasi.
