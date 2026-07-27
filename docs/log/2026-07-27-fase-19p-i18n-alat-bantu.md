# Fase 19p — i18n halaman Alat Bantu

## Yang dikerjakan

Halaman **Alat Bantu** (`/app/alat`) kini dwibahasa penuh. Isinya enam
kalkulator klien-saja — HPP per unit, Markup vs Margin, Titik Impas (BEP),
simulasi PPh 21 (TER), PPN, dan cicilan kasbon — yang seluruh teksnya masih
tertanam sebagai literal sejak Fase 10g.

- `apps/web/src/pages/alat.tsx`: **28 → 1** temuan sapuan layar. Sisa satu itu
  positif palsu: penyapu memotong potongan kode `0 ? (laba / price) * 100 : 0;`
  sebagai kalimat.
- **46 entri kamus baru** di `apps/web/src/i18n/ui.ts`. Seluruh nama kunci
  diperiksa lebih dulu terhadap kamus — nol tabrakan.
- Enam komponen kalkulator (`HppCalc`, `MarkupCalc`, `BepCalc`, `Pph21Calc`,
  `PpnCalc`, `KasbonCalc`) masing-masing memanggil `useUi()` sendiri; tak ada
  yang menerima penerjemah lewat prop, jadi tak ada `useMemo` yang perlu
  mencantumkan `u` sebagai dependensi (pelajaran 19f tidak terpicu di sini).

### Yang sengaja TIDAK diterjemahkan

Istilah resmi Indonesia tetap apa adanya di kedua bahasa, sesuai aturan yang
berlaku sejak Fase 16: **PPN, PPh 21, TER, PTKP, DPP, HPP, BEP, PMK 168/2023**.
Jadi kunci `tabPpn` dan `tabPph21Ter` sengaja berisi teks `id` dan `en` yang
sama — itu bukan kelalaian, melainkan keputusan.

Dua kunci lama dipakai ulang alih-alih menambah kembar: `statusPtkp` dan
`hargaJual`. Akibat pemakaian ulang `hargaJual`, label satu ruas di tab
Markup berubah kapitalisasinya dari "Harga jual" menjadi "Harga Jual". Ini
disadari dan diterima — menambah kunci kembar hanya demi satu huruf kecil
adalah utang yang lebih mahal daripada perbedaannya.

## Validasi

Semua gerbang dinilai dari **status keluar**, bukan dari keluaran yang disaring.

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **249** (90 shared + 27 web + 132 api) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **249** (dari 248) |

Cek ui-sim baru **`F1p`**: pada `/app/alat` dalam mode EN, halaman memuat
"Break-even (BEP)", "Suggested selling price", dan "Material cost / unit",
serta **tidak** memuat "Titik Impas (BEP)", "Harga jual disarankan", maupun
"Biaya bahan / unit". Penandanya diambil dari dua lapis yang selalu terlihat —
bilah tab dan isi tab bawaan — karena kalkulator ini murni klien dan tidak
bergantung pada data tenant.

### Pemeriksaan mata

Empat tangkapan layar diperiksa langsung dalam mode EN (tab HPP, BEP, PPh 21,
Cicilan Kasbon) dan satu dalam mode ID. Semua tata letak utuh; bilah tab
melipat ke baris kedua dalam bahasa Inggris karena labelnya lebih panjang,
dan itu tetap terbaca. Blok tangkapan layar sementara sudah **dihapus lagi**
dari `ui-sim.mjs` — diffnya hanya berisi cek `F1p`.

## Koreksi: cakupan sisa yang saya sebut sebelumnya SALAH

Di akhir log 19o saya menulis bahwa sisa program tinggal `alat` (28) dan
`admin` (49), ditambah ekor `app.tsx` dan `src/components/`. **Itu keliru.**

Sapuan penuh setelah 19p menunjukkan `apps/web/src/pages/auth.tsx` punya
**40 temuan layar dan nol mekanisme dwibahasa**. Yang membuatnya lebih penting
daripada `admin`: auth adalah halaman masuk/daftar — layar yang dilihat setiap
calon pelanggan, bukan layar internal.

Ada lapisan kedua yang baru ketahuan saat memeriksanya: `apps/web/src/i18n/index.ts`
sudah memuat kunci auth siap pakai (`authMasukJudul`, `authDaftarJudul`,
`authPerusahaan`, `authPunyaAkun`, …) lewat `DICT`/`useT()` — tetapi
**`useT()` tidak dipakai satu berkas pun**. Terjemahan auth sudah ditulis
sejak Fase 13d lalu tidak pernah tersambung ke halamannya.

Ini kesalahan klaim cakupan yang **keempat** dalam program ini (setelah 18n,
18p, dan 19f). Pola penyebabnya selalu sama: menyimpulkan "tinggal N berkas"
dari ingatan rencana, bukan dari perintah sapuan yang dijalankan saat itu juga.
Aturan yang sudah saya tulis di 19f — klaim "hanya tinggal ini" wajib berasal
dari perintah pencarian yang tercatat — tidak saya jalankan sendiri. Karena
itu tabel di bawah **hasil `sapu-i18n.mjs` yang baru saja dijalankan**, bukan
taksiran.

## Sisa program i18n (terukur, 27 Juli 2026)

Total utang teks layar seluruh halaman: **297** (titik awal Fase 19: 781).

| Berkas | Layar | Catatan |
| --- | ---: | --- |
| `app.tsx` | 64 | Sebagian besar positif palsu (menu lewat tabel-lookup). Yang nyata: spanduk verifikasi email dan tombol "Keluar" — terlihat jelas di tangkapan layar 19p. |
| `admin.tsx` | 49 | Internal, hanya untuk admin platform. |
| `auth.tsx` | 40 | **Menghadap pelanggan.** Nol mekanisme; `useT()` menganggur. |
| `print.tsx` | 36 | **Di luar lingkup** atas keputusan pemilik — dokumen cetak tetap Indonesia. |
| sisanya | 108 | Tersebar di halaman yang sudah dikerjakan; sebagian sudah diketahui disengaja (contoh data CSV di `migration`, nama kolom yang harus diketik pengguna). Tiap butir akan diperiksa satu per satu di sub-fase penutup, bukan diklaim aman sekarang. |

Urutan berikutnya diubah supaya yang menghadap pelanggan didahulukan:
**19q `auth`**, lalu **19r `admin`**, lalu **19s** ekor `app.tsx` +
`src/components/` + mengajari `sapu-i18n.mjs` mengenali pola tabel-lookup
sehingga 64 positif palsu berhenti menutupi regresi nyata di berkas itu.
