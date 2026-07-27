# Fase 19c — Kas & Bank dwibahasa

Sub-fase pertama program i18n yang dilanjutkan setelah perombakan desain Fase
17–18. Sasarannya `apps/web/src/pages/kasbank.tsx`.

## Penyesuaian lingkup: satu berkas, bukan dua

Rencana menggabungkan `kasbank` + `catat` (95 temuan) dalam satu sub-fase.
Dipecah menjadi dua karena `kasbank` sendiri ternyata memuat tiga hal yang
masing-masing perlu keputusan sendiri (fungsi murni di tingkat modul, pesan
galat pengurai, dan rangkaian awalan/akhiran) — menggabungkannya dengan
`catat` akan menghasilkan PR yang terlalu besar untuk ditinjau dengan benar.
`catat` menjadi 19d.

## Yang dikerjakan

**46 → 8 temuan**, dan kedelapan sisanya positif palsu: potongan kode yang
tertangkap regex, kunci react-query (`bank-recon`), `id` elemen (`csv-mutasi`),
dan **contoh data CSV** pada placeholder. Yang terakhir sengaja dibiarkan: itu
memperagakan bentuk baris rekening koran bank Indonesia, jadi memang berbahasa
Indonesia apa adanya — bukan teks antarmuka.

**±35 entri kamus baru** di `apps/web/src/i18n/ui.ts` (563 → 598).

## Tiga hal yang perlu diputuskan, bukan sekadar diterjemahkan

### 1. `parseCsv` adalah fungsi murni di tingkat modul

Pesan galatnya tampil ke pengguna lewat toast, jadi harus ikut bahasa aktif —
tetapi fungsinya berada di luar komponen sehingga **tidak boleh memanggil
hook**. Penerjemah `u` karena itu diterima sebagai **argumen**, bukan dipanggil
di dalam.

### 2. Rangkaian awalan/akhiran, bukan penyulihan `{n}`

Beberapa pesan memuat angka di tengah kalimat ("Baris 3: …", "dari 12 baris
mutasi"). Godaannya menambahkan mekanisme penyulihan `{n}`.

Tidak dilakukan: kamus ini **sudah punya konvensi** sejak Fase 16 —
`${u("penjualanHariTerakhir")} ${range} ${u("hariTerakhirSuffix")}`.
Memperkenalkan gaya kedua hanya demi satu berkas akan membuat dua konvensi
bersaing di kamus yang sama.

### 3. Kunci yang namanya cocok belum tentu maknanya cocok

`dariPrefix` ("dari"/"of") sengaja **tidak** memakai kunci `dari` yang sudah
ada — kunci itu berisi "Dari"/"From" sebagai label rentang tanggal. Persis
jebakan Fase 16u.

## Kunci kembar: TypeScript menangkapnya lagi

`barisKe` ({ id: "Baris", en: "Row" }) saya tambahkan — padahal **sudah ada
sejak Fase 16** dengan isi **persis sama**:

```
src/i18n/ui.ts(1138,3): error TS1117: An object literal cannot have
multiple properties with the same name.
```

Kejadian yang sama bentuknya dengan Fase 16u. Dengan kamus ±600 entri,
menambah tanpa memeriksa memang berisiko — dan penjaganya adalah kompilator,
bukan kewaspadaan.

## Cek baru `F1c` — dan koreksi pemilihan penandanya

Bentuknya sama dengan seri `F0*`: mode EN memuat penanda Inggris **dan** bebas
penanda Indonesia.

**Rancangan pertama salah**, dan cara salahnya layak dicatat. Penanda
positifnya semula `"Bank statement reconciliation"` + `"Bank description"`,
dan hasilnya:

```
✗ F1c … → EN=false tanpaID=true
```

`tanpaID=true` sudah benar (teks Indonesia memang hilang), tetapi penanda
Inggrisnya tidak lengkap. Setelah mencetak isi halaman yang benar-benar
dirender, sebabnya jelas: **`"Bank description"` adalah judul kolom tabel
rekonsiliasi, yang hanya dirender bila ada baris rekening koran terimpor** —
sementara akun yang terpilih pertama adalah **Kas**, yang tidak punya.

Penandanya diganti ke teks yang dirender **tanpa syarat data**: judul kartu
rekonsiliasi dan keterangan kartu mutasi. Pelajarannya sejalan dengan Fase 16e:
penanda cek harus dipilih dari yang pasti ada, bukan dari yang kebetulan
terlihat saat kita membaca kodenya.

## Temuan sampingan

Saat mencetak isi halaman, terlihat dua teks Indonesia yang **bukan** milik
berkas ini dan memang belum dijadwalkan:

- `"Email Anda belum diverifikasi. Periksa kotak masuk untuk tautan verifikasi."`
- tombol `"Keluar"` di bilah atas

Keduanya dari `app.tsx`, yang dijadwalkan pada 19l. Dicatat di sini supaya
tidak hilang.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **246** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **236** cek lolos (naik dari 235) |
| `node scripts/sapu-i18n.mjs` | `kasbank.tsx` **46 → 8** (sisanya positif palsu) |

## Sisa program i18n

19 berkas, ±612 teks. Berikutnya **19d — `catat.tsx`** (49).
