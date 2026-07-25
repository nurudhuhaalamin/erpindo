# Log Kerja — Fase 16g: Isi halaman Kasir (POS) dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis ketujuh program i18n modul. `pos.tsx` mencakup layar kasir penuh: buka/
tutup shift, keranjang & pembayaran multi-metode, tahan/panggil transaksi,
rekap harian (per jam / per shift / per metode), serta panel Struk & Refund.

38 entri kamus baru + **35 penggantian**, termasuk komponen `RecapCard` dan
`RefundPanel` agar seluruh layar ikut bahasa, bukan sebagian.

## Tiga pengaman kini jadi standar

Fase ini adalah yang pertama dikerjakan dengan **ketiga** pelajaran sekaligus:

1. **Regex sadar-spasi** untuk teks JSX multi-baris (pelajaran 16c).
2. **Penanda negatif hanya dari teks murni UI** — bukan kata yang juga muncul di
   data pengguna (pelajaran 16c/16e). Di sini sengaja **tidak** memakai
   "Tunai"/"Lunas" karena keduanya muncul sebagai metode/status pada data struk;
   dipakai judul kartu.
3. **Sapuan atribut TANPA batas panjang** (pelajaran 16f). Terbukti langsung
   berguna: sapuan menangkap **3 kalimat panjang** yang dengan alat lama akan
   lolos diam-diam —
   - "Mulai sesi kasir dengan mencatat kas awal di laci."
   - "Penjualan POS per jam, per shift, dan per metode pembayaran."
   - "Pilih struk, isi qty barang yang dikembalikan — uang tunai keluar dari laci shift ini."

Sapuan akhir atas **seluruh** halaman yang sudah dikerjakan (6 berkas) kini
bersih.

## Validasi

- **UI-sim +1 (`F0i`)**: mode EN pada Kasir memuat judul kartu Inggris dan tidak
  lagi memuat "Rekap hari ini"/"Buka shift".
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).

## Catatan

- **Sengaja tidak diterjemahkan:** `PPN` (nama pajak resmi) dan nilai contoh
  (`500000`).
- **Cakupan kumulatif: ±15 layar** tuntas isinya; kamus **201 entri**.

## Koreksi: dua cacat lagi pada cara kerja (bukan pada terjemahan)

Cek `F0i` gagal dengan `shift=false recap=false tanpaID=true`. Diagnostik itu
langsung mencurigakan: teks Inggris **dan** Indonesia sama-sama absen — pertanda
halamannya tidak ter-render sama sekali.

**1. Rute uji salah.** Saya menulis `/app/kasir`, padahal rute sebenarnya
`/app/pos` (`main.tsx`). Halaman kosong → asersi negatif `tanpaID` **lolos
secara hampa**, bukan karena terjemahan benar.

> **Pelajaran:** asersi negatif saja tidak pernah cukup — ia bisa lolos justru
> ketika halaman gagal dimuat. Setiap cek i18n **wajib** memuat asersi **positif**
> (teks Inggris yang harus ada). Di sini justru asersi positif itulah yang
> menyelamatkan: tanpa `shift`/`recap`, kegagalan ini akan lolos sebagai "hijau".

**2. Pola keempat yang belum tertangkap alat.** Teks JSX yang didahului ekspresi
tidak pernah cocok dengan regex `>teks<`:

```jsx
{openShift.isPending ? <Spinner /> : null} Buka Shift
```

Sapuan pola ini (`}` … teks … `<`) menemukan 3 di `pos.tsx` ("Proses Refund",
"Buka Shift", "Konfirmasi Tutup") dan **3 lagi di halaman yang sudah dinyatakan
selesai** — "Tambah seri" (masterdata, 16b), "Tambah" & "Simpan" (finance, 16f).
Semuanya diperbaiki di fase ini.

### Empat pola sapuan yang kini wajib sebelum menyatakan halaman selesai

| # | Pola | Ditemukan di fase |
|---|---|---|
| 1 | Teks JSX multi-baris (`>\n teks \n<`) | 16c |
| 2 | Atribut **tanpa batas panjang** | 16f |
| 3 | Teks setelah ekspresi (`{expr} teks <`) | 16g |
| 4 | Asersi wajib punya penanda **positif**, bukan hanya negatif | 16g |

## Iterasi asersi ketiga: halaman ber-state menuntut cek yang lebih hati-hati

Setelah rute diperbaiki, `F0i` masih gagal — kini `shift=true recap=false`.
Terjemahannya benar; asersinya yang keliru lagi.

Layar Kasir punya **dua keadaan**:

| Keadaan | Yang ter-render |
|---|---|
| Shift **tertutup** | hanya kartu "Buka shift" (+ gudang, kas awal) |
| Shift **terbuka** | keranjang, Rekap hari ini, Struk & Refund |

ui-sim mendarat pada keadaan **tertutup**, sehingga kartu Rekap/Struk memang
tidak ada di layar. Menuntut keduanya sekaligus adalah kesalahan asersi, bukan
bukti halaman belum diterjemahkan.

Cek disesuaikan: menerima **salah satu** keadaan (penanda positif per keadaan)
dengan penanda negatif yang mencakup ketiga teks Indonesia. Alasannya ditulis di
komentar uji.

**Pelajaran (menambah daftar 4 pola):** untuk halaman yang punya beberapa
keadaan, asersi harus menyebut keadaan mana yang diuji — atau menerima keduanya
secara eksplisit. Cek yang menganggap satu halaman selalu menampilkan hal sama
akan gagal palsu, dan (lebih berbahaya) bisa juga **lolos palsu** bila keadaan
yang kebetulan muncul tidak memuat teks yang diperiksa.
