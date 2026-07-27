# Fase 19l — Dimensi & Anggaran dwibahasa

| Berkas | Teks layar | Toast |
| --- | --- | --- |
| `dimensi.tsx` | **27 → 2** | 0 |
| `budget.tsx` | **10 → 0** (`BERSIH ✅`) | 0 |

Sisa 2 di `dimensi.tsx` adalah kunci react-query (`bank-rules`). **±35 entri
kamus baru.**

## `UiKey` yang kini mengikat langsung terasa

Ini sub-fase pertama setelah perbaikan tipe di 19k, dan perbedaannya nyata:
setiap kunci yang belum ada **langsung merah di typecheck**, bukan menunggu
sampai terlihat di layar. Urutan kerjanya jadi terbalik dari sebelumnya —
kamusnya ditambahkan dulu, baru dipakai.

Tiga kunci yang sempat saya kira baru ternyata sudah ada (`periodeBulan`,
`akun`, `realisasi`) dan dipakai ulang; `periodeBulan` bahkan sempat jadi
duplikat sebelum dibuang.

## Tiga artefak penggantian massal — dan sumbernya yang sama

Fase ini menghasilkan tiga kerusakan dari metode yang sama, semuanya tertangkap
sebelum ter-commit:

| Artefak | Ditangkap | Sebab |
| --- | --- | --- |
| `{u("takLagiBisaDipilih")}` di template literal | `sapu-i18n` | JSX-isme di dalam backtick |
| `description="{u("simpanAturan")} pencocokan…"` | `tsc` | frasa pendek `"Simpan aturan"` cocok **di dalam** kalimat panjang |
| `Belum ada akun {title}` tak tergantikan | sapuan | teks terpotong dua baris |

Yang kedua paling instruktif: saya mengganti frasa **"Simpan aturan"** (label
tombol) dan tanpa sengaja mengenai awal kalimat deskripsi *"Simpan aturan
pencocokan berdasarkan…"* — merusaknya jadi atribut JSX yang tidak sah.
Penyebabnya bukan sekadar ceroboh: **frasa pendek adalah substring dari frasa
panjang**, jadi urutan penggantian menentukan hasilnya.

Sejak 19j saya sudah menegaskan anchor pada skrip **penyisip**. Fase ini
menunjukkan bahwa itu belum cukup untuk skrip **pengganti**: yang dibutuhkan
adalah mengganti dari yang **paling panjang ke paling pendek**, atau memakai
penanda yang unik (mis. seluruh atribut `title="…"`, bukan isinya saja).

## Cek baru `F1l`

Satu cek untuk dua rute, keduanya diverifikasi ke `audit-routes.mjs` lebih dulu.
Penandanya judul kartu utama masing-masing halaman.

## Validasi

Seluruh gerbang diverifikasi lewat **status keluar**.

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | lolos (exit 0) |
| `pnpm lint` | bersih (exit 0) |
| `pnpm test` | **249** unit test lolos (tetap) |
| `pnpm build` | ok (exit 0) |
| `pnpm smoke` | **863** cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **245** cek lolos (naik dari 244) |

## Sisa program i18n

7 berkas, ±235 teks: `admin`, `alat`, `migration`, `marketplace`,
`consolidation`, `currencies`, `mulai`, ditambah sisa `app.tsx` +
`src/components/`.
