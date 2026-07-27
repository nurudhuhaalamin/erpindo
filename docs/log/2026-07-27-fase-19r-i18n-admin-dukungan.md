# Fase 19r — i18n dashboard admin platform & halaman Dukungan

## Yang dikerjakan

Dua halaman, dikerjakan bersama karena keduanya membaca peta label masukan yang
sama dari `@erpindo/shared`.

### `admin.tsx` — dashboard admin platform

Lima tab (Ringkasan, Tenant, Infra, Masukan, Blog): **49 → 2** temuan sapuan
layar, **5 → 0** toast. Dua sisanya positif palsu berupa potongan kode.
**±100 entri kamus baru** berawalan `ad`.

Awalan itu bukan sekadar kerapian. Halaman ini penuh kata umum — "Status",
"Daftar", "Hapus", "Ubah", "Batal" — yang sudah dipakai kunci lain dengan makna
berbeda di modul lain. Memberi ruang nama sendiri lebih murah daripada
memeriksa satu per satu apakah maknanya kebetulan sama.

**Dua cacat ikut diperbaiki, bukan hanya diterjemahkan:**

1. **Label tab sekaligus nilai state.** `const TABS = ["Ringkasan", "Tenant",
   …]` dipakai langsung sebagai `useState<Tab>`. Menerjemahkannya begitu saja
   akan membuat `tab === "Ringkasan"` tidak pernah cocok dan **seluruh isi
   halaman menghilang tanpa satu pun galat** — persis cacat senyap 19d di
   `catat.tsx`. Kode dan label kini dipisah lewat `TAB_KEY`.
2. **Lencana status menampilkan kode mentah.** `<Badge>{t.status}</Badge>`
   menampilkan `past_due` dan `suspended` apa adanya — di kedua bahasa. Kini
   lewat `STATUS_KEY`, jadi ini perbaikan tampilan untuk pemakai Indonesia
   juga, bukan cuma terjemahan.

### `dukungan.tsx` — dan temuan yang membuatnya masuk lingkup

Sapuan melaporkan `dukungan.tsx` hanya punya **5** temuan, jadi ia tercatat di
tabel "sisa" beberapa sub-fase terakhir seolah hampir beres. Kenyataannya
halaman ini **tidak punya `useUi()` sama sekali** — seluruhnya satu bahasa.

Sapuan tidak bisa melihatnya karena sebagian besar teksnya **tidak berbentuk
literal di berkas itu**: kategori dan status masukan dibaca dari
`FEEDBACK_CATEGORY_LABELS` / `FEEDBACK_STATUS_LABELS` di `@erpindo/shared`,
yang memang berbahasa Indonesia. Kata pendek seperti "Jenis", "Pesan", dan
"Kirim Masukan" juga lolos ambang heuristiknya.

Ini kebocoran yang **menghadap pelanggan**: halaman Dukungan dipakai semua
pengguna, dan dropdown "Saran fitur / Laporan bug / Pertanyaan" tetap
Indonesia walau tombol EN ditekan. Karena penyebabnya sama persis dengan yang
baru saja saya perbaiki di `admin.tsx`, halaman ini dikerjakan tuntas di
sub-fase yang sama: **0 temuan, 0 toast**, +11 entri kamus berawalan `dk`.

Peta kode → kunci kamus diletakkan di modul tersendiri,
`apps/web/src/i18n/masukan.ts`, karena dipakai dua halaman. Mengimpornya dari
`admin.tsx` akan menyeret seluruh potongan bundel admin ke halaman dukungan
yang dipakai pelanggan.

## Kejujuran: apa yang TIDAK terverifikasi

Kelima tab `admin.tsx` **tidak pernah dirender** dalam validasi ini. Halaman
itu hanya menampilkan isinya untuk admin platform, sedangkan akun simulasi UI
sengaja bukan admin platform — cek `F17` justru memastikan menu Admin
tersembunyi baginya. Menyetel `PLATFORM_ADMIN_EMAILS` di ui-sim akan mematikan
cek akses itu, jadi tukar-tambahnya tidak sepadan.

Yang benar-benar diukur untuk `admin.tsx`: kompilasi (`satisfies Record<…,
UiKey>` menolak kunci salah tulis), pesan penjaga aksesnya dalam mode EN, dan
tiga penjaga sumber baru. Isi kelima tab itu **belum pernah dilihat mata
maupun asersi** — dinyatakan di sini supaya tidak ada yang mengira sebaliknya.

Sebagai gantinya ditambah `apps/web/test/i18n-admin-masukan.test.ts` (3 uji),
mengikuti pola `label-kolom-dinamis.test.ts` (18t) yang dipakai justru ketika
cek ui-sim akan hampa:

1. Kedua halaman **tidak** membaca `FEEDBACK_*_LABELS` langsung — kebocoran
   yang baru ditemukan hari ini tidak bisa kembali diam-diam.
2. Keduanya memanggil `useUi()`.
3. Nilai state tab admin berupa kode huruf kecil, bukan teks tampilan, dan
   tiap kode punya kunci di `TAB_KEY`.

## Validasi

Semua gerbang dinilai dari **status keluar**.

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **252** (dari 249) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **252** (dari 251) |

Cek ui-sim baru **`F1s`**: dalam mode EN, `/app/dukungan` memuat "Send
feedback", "My feedback", dan **"Feature suggestion"** — penanda terakhir itu
sengaja diambil dari lencana kategori, yaitu justru nilai yang datang dari
peta label `shared`; tanpa itu kebocoran hari ini tetap tak terukur.
`/app/admin` memuat "platform admins only". Ketiganya juga diperiksa **tidak**
memuat padanan Indonesianya.

### Pemeriksaan mata

`/app/dukungan` dan `/app/admin` dilihat langsung dalam mode EN. Dukungan
tampil penuh berbahasa Inggris termasuk isi dropdown kategori; Admin tampil
sebagaimana mestinya untuk non-admin (hanya pesan penjaga). Blok tangkapan
sementara sudah dihapus lagi dari `ui-sim.mjs`.

## Sisa program i18n

Total utang teks layar seluruh halaman: **208** (titik awal Fase 19: 781).

| Berkas | Layar | Catatan |
| --- | ---: | --- |
| `app.tsx` | 64 | Sebagian besar positif palsu (menu lewat tabel-lookup). Yang nyata: spanduk verifikasi email dan tombol "Keluar", keduanya terlihat di tangkapan layar 19p–19r. |
| `print.tsx` | 36 | **Di luar lingkup** atas keputusan pemilik — dokumen cetak tetap Indonesia. |
| `commerce.tsx` | 15 (+22 toast) | Halaman yang sudah dikerjakan; sisanya belum diklasifikasikan. |
| `catat.tsx` | 14 | idem. |
| sisanya | 79 | Tersebar di 20-an berkas, terbanyak 9. Sebagian sudah diketahui disengaja (contoh kolom CSV di `migration`, parameter URL di `auth`). |

Sub-fase penutup **19s**: ekor `app.tsx` + `src/components/`, mengajari
`sapu-i18n.mjs` mengenali pola tabel-lookup supaya 64 positif palsu berhenti
menutupi regresi nyata, lalu **memeriksa satu per satu** sisa temuan itu —
diklasifikasikan disengaja atau utang, bukan diasumsikan aman. Pelajaran
`dukungan.tsx` hari ini membuat langkah terakhir itu wajib: angka kecil pada
sapuan **tidak** berarti halamannya hampir beres.
