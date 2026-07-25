# Log Kerja — Fase 16i: Isi halaman Penggajian dwibahasa

**Tanggal:** 25 Juli 2026.

## Yang dikerjakan

Lapis kesembilan program i18n modul — dan **berkas halaman terbesar aplikasi**
(`payroll.tsx`, ±1.015 baris). Mencakup tujuh komponen: daftar karyawan,
departemen bertingkat, bagan organisasi, jalankan penggajian + riwayat & slip,
komponen ad-hoc per periode, kasbon karyawan, serta cuti & izin.

**69 entri kamus baru + 94 penggantian** — fase dengan penggantian terbanyak
sejauh ini.

## Hasil survei empat pola (dilakukan di awal)

| Pola | Jumlah |
|---|---|
| Teks JSX multi-baris | 42 |
| Atribut tanpa batas panjang | 22 — termasuk **6 kalimat panjang** (deskripsi kartu kasbon, cuti, komponen, dll.) |
| Teks setelah ekspresi | 5 (Ajukan, Cairkan Kasbon, Jalankan Penggajian, Tambah Karyawan, Tambah Komponen) |
| Sudah tersedia di kamus | 12 |

Enam kalimat panjang itu adalah penjelasan mekanika yang paling dibaca pengguna
(mis. "Pencairan tercatat sebagai Piutang Karyawan (berjurnal). Cicilan dipotong
otomatis dari gaji netto…") — persis jenis teks yang dulu tersembunyi dari alat
survei sebelum pengaman 16f.

## Validasi

- **UI-sim +1 (`F0k`)**: rute diverifikasi ke `main.tsx` lebih dulu
  (`/app/hr/penggajian`, bukan `/app/payroll`); penanda positif ("Employees" +
  "Run monthly payroll"/"Payroll history") dan negatif dari teks murni UI.
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).
- Sapuan 4 pola atas **delapan** berkas: bersih.

## Catatan

- **Sengaja tidak diterjemahkan:** `BPJS`, `PPh 21 (TER)`, `PTKP` — istilah resmi
  ketenagakerjaan/pajak Indonesia, konsisten sejak 14f.
- "Izin" diterjemahkan **"Excused"** (bukan "Permission") karena konteksnya jenis
  ketidakhadiran, bukan perizinan.
- **Cakupan kumulatif: ±18 layar** tuntas isinya; kamus **306 entri**.

## Koreksi asersi: halaman bertab hanya me-render tab aktif

Cek `F0k` gagal dengan `employees=true payroll=false tanpaID=true`.
Terjemahannya benar ("Employees" muncul); asersinya yang keliru.

Halaman Penggajian **bertab** sejak Fase 10g, dan hanya tab aktif yang
di-render (`{tab === "karyawan" ? … : null}`). Tab default adalah **Karyawan**,
sedangkan kartu "Jalankan penggajian bulanan" / "Riwayat penggajian" ada di tab
**Gaji** — sehingga menuntut keduanya adalah kesalahan asersi, bukan bukti bug.

Cek disesuaikan agar hanya menuntut isi **tab default**: "Employees" + form
karyawan ("Add employee"/"Position"), dengan penanda negatif dari tab yang sama
("Tambah Karyawan", "Gaji pokok").

**Pelajaran (memperluas aturan sadar-state dari 16g):** selain halaman
ber-*state* (mis. shift POS terbuka/tertutup), halaman **bertab** juga hanya
menampilkan sebagian isinya. Asersi i18n harus menyebut tab/keadaan mana yang
diuji — atau uji perlu mengeklik tab lebih dulu. Keduanya kini masuk daftar
pengaman.
