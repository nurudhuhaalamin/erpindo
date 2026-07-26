# Fase 16r — Lunasi utang i18n halaman Penggajian

Sub-fase ketujuh pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/payroll.tsx` — 15 temuan meski Fase 16i menyatakannya
"tuntas".

## Yang dikerjakan

- **18 entri kamus baru** di `apps/web/src/i18n/ui.ts` (554 → 572).
- **19 blok teks** diganti ke `u("…")`: pengumuman tarif TER/BPJS, ringkasan
  `{n} aktif dari {m} karyawan`, lencana `aktif`/`nonaktif`, satuan `hari` pada
  saldo cuti, `· di bawah {induk}` pada bagan organisasi, pesan struktur
  kosong, judul kartu komponen ad-hoc, `· jurnal {no}` pada kasbon, `(sisa {n})`
  pada pilihan karyawan, `Periode {periode}` dan lencana `jurnal {no}` pada
  riwayat penggajian, serta judul + deskripsi `ConfirmDialog` pembatalan.

## Konstanta tingkat modul — kelima dan keenam

Dua sekaligus, berdampingan: `LEAVE_LABEL` dan `LEAVE_STATUS_LABEL`. Totalnya
kini **enam** di **lima berkas** (`TASK_COLUMNS` 16j, `CONTACT_TYPE_LABELS`
16m, `STATUS_LABEL` 16p, `REF_TYPE_LABELS` 16q, dan dua ini).

Yang pantas dicatat: ketiga kunci `LEAVE_LABEL` — `cutiTahunan`, `sakit`,
`izin` — **sudah dibuat oleh Fase 16i**, fase yang mengerjakan halaman ini.
Kamusnya dibangun, konstantanya tidak pernah disambungkan.

Ini kejadian kedua dengan bentuk yang sama, setelah enam `aria-label` di Fase
16p yang kuncinya juga sudah ada sejak 16j. Jadi kegagalannya bukan "lupa
menerjemahkan", melainkan: **menerjemahkan yang sedang dilihat, lalu tidak
menyapu rujukan lain ke kata yang sama di berkas itu.** Membuat kunci dan
memakai kunci adalah dua pekerjaan berbeda, dan yang kedua mudah dikira sudah
selesai karena yang pertama sudah.

## Satu efek samping yang dipilih sadar

`LEAVE_LABEL` juga dipakai di dalam `toast()`:

```ts
`Pengajuan ${u(LEAVE_LABEL[form.type]).toLowerCase()} ${res.days} hari dicatat — menunggu persetujuan.`
```

Karena konstantanya kini menyimpan kunci, kata jenis cutinya ikut bahasa
antarmuka sementara sisa kalimatnya tetap Indonesia — satu toast menjadi
setengah dwibahasa. Pesan toast memang di luar lingkup sejak 16b.

Tiga pilihan yang ada: (a) biarkan setengah, (b) simpan peta Indonesia-saja
kedua khusus untuk toast, (c) tarik toast ke dalam lingkup di tengah fase.
Dipilih (a): (b) menduplikasi data yang baru saja disatukan demi teks yang
dibaca sekilas, dan (c) memperbesar lingkup fase tanpa rencana. Dicatat di
sini supaya tidak terlihat seperti kelalaian.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **206** cek lolos (naik dari 205) |

Cek baru `F0v` — rute `/app/hr/penggajian` diverifikasi ke `main.tsx` lebih
dulu. Halaman ini **bertab**, dan hanya tab aktif yang dirender; asersinya
karena itu dibatasi pada tab bawaan (Karyawan) plus pengumuman pajak yang
selalu tampil di atas tab — persis pelajaran yang membuat cek `F0k` gagal di
Fase 16i.

Sisa temuan halaman ini tinggal 2, keduanya potongan kode.

## Sisa utang setelah fase ini

| Halaman | Temuan | Fase yang menyatakan "tuntas" |
| --- | ---: | --- |
| `pos.tsx` | 11 | 16g |
| `crm.tsx` | 9 | 16h |

Satu sub-fase lagi (16s, menggabungkan keduanya) dan utang dari audit 16k
lunas. Di luar itu tetap ada **26 halaman yang belum pernah masuk program
i18n** (~789 temuan mentah, lihat Fase 16n) — pekerjaan yang belum dimulai,
bukan utang.
