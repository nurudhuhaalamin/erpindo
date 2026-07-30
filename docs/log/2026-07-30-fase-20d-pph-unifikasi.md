# Fase 20d — PPh unifikasi

Rekap **semua** PPh yang dipotong atau disetor dalam satu masa: PPh 21 dari
penggajian, PPh 23 dari bukti potong, dan PPh Final 4(2).

## Yang dikerjakan

Satu tab baru di halaman Pajak, dan **satu endpoint yang murni membaca**.

Tidak ada tabel baru, tidak ada migrasi, tidak ada jurnal baru — ketiga jenis
PPh itu **sudah** menjurnal saat dibuat. Yang selama ini tidak ada hanyalah
satu tempat untuk melihatnya sekaligus; sebelumnya pengisi SPT harus membuka
tiga tab dan menjumlahkan sendiri.

Sumber datanya:

| Jenis | Dari | Bentuk baris |
| --- | --- | --- |
| PPh 21 | `payslips` ⋈ `payroll_runs` | satu baris ringkas per payroll run |
| PPh 23 | `tax_pph23` ⋈ `contacts` | satu baris per bukti potong, **plus status setor** |
| PPh Final 4(2) | `tax_pph_final` | satu baris per masa (tabelnya UNIQUE per period) |

### Dua keputusan yang perlu dicatat

**PPh 21 direkap per masa, bukan per karyawan.** Bukti potong 1721-A1 bersifat
tahunan; memecah per karyawan di sini hanya menambah baris tanpa menambah
informasi yang dibutuhkan formulir masa. Tarif efektifnya dihitung balik dari
total (`pph21 / bruto`) supaya kolomnya tetap terisi bermakna.

**`belumDisetor` dipisahkan sendiri.** Hanya PPh 23 yang punya status setor;
PPh 21 dan Final sudah disetor saat diposting. Angka ini yang paling mudah
salah dibaca — kalau kolom `deposited` keliru, totalnya tetap terlihat wajar
tetapi menyesatkan saat mengisi SPT. Karena itu ia diuji tersendiri di smoke.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **268** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **867** (dari 863) |
| `node scripts/ui-sim.mjs` | 0 | **255** (dari 254) |
| `sapu-i18n` | — | `pajak.tsx` **BERSIH**, atribut 0 |

Empat cek smoke baru: rekap memuat bukti potong PPh 23 yang sudah disetor
(`belumDisetor === 0`), **total = jumlah ketiga jenisnya**, masa tak valid
ditolak 400, dan viewer boleh membacanya (ini laporan, bukan aksi).

Cek ui-sim baru **`F1v`**: penandanya diambil dari kartu yang dirender **tanpa
syarat data** (judul + pengantar), bukan dari angka rekapnya — perusahaan demo
belum tentu punya PPh pada masa berjalan, dan cek yang bergantung data semacam
itu merah karena alasan yang salah (pelajaran F1c/F1o).

### Pemeriksaan mata — dan verifikasi aritmetikanya

Tab dilihat langsung dalam mode EN dengan data demo nyata, dan angkanya
diperiksa sendiri, bukan sekadar "tampak wajar":

```
PPh 21        Rp 360.000     (GAJI-00002)
PPh 23        Rp 260.000     (BP23-00001 160rb + BP23-00002 100rb)
PPh Final     Rp 347.189
Total         Rp 967.189     ← 360.000 + 260.000 + 347.189 ✓
Belum disetor Rp 100.000     ← tepat BP23-00002 yang berstatus "Not yet deposited" ✓
```

Keduanya cocok. Blok tangkapan sementara sudah dihapus lagi dari `ui-sim.mjs`.

## Catatan: CI tidak terpicu untuk 20c

Commit `d7db8be` (Fase 20c) terdorong ke branch tetapi **tidak ada workflow run
sama sekali** untuknya — bukan gagal, melainkan tak pernah dijalankan. Daftar
run hanya mencatat sampai `adb30c2` (20b).

Karena itu 20c dan 20d berbagi satu PR: mendorong 20d memberi head baru yang
memicu CI untuk keduanya sekaligus. Ini menyimpang dari aturan satu PR per
sub-fase, dan disebutkan di sini supaya jelas alasannya. Kedua commit-nya tetap
terpisah di dalam PR.
