# Fase 17d — Landing page dalam bahasa visual "alat pro padat"

Sub-fase keempat perombakan desain. Sasaran: `apps/web/src/pages/landing/index.tsx`
(802 baris, 14 blok). Isi teks **tidak diubah sama sekali** — yang dirombak
bentuknya.

## Penanda "SaaS umum" yang dibuang

Halaman lama memakai hampir seluruh kosakata visual landing SaaS generik.
Satu per satu diganti:

| Lama | Baru | Alasan |
| --- | --- | --- |
| Orb gradien buram di balik hero (`blur-3xl`) | Kisi garis tipis 56px, memudar ke bawah | Gaya alat memakai garis, bukan kabut. Digambar dengan gradien CSS, tanpa aset baru |
| Judul rata tengah | **Rata kiri** | Teks rata tengah membuat halaman terbaca seperti brosur, bukan alat kerja |
| Judul bergradien (`bg-clip-text text-transparent`) | Warna merek datar | Gradien pada teks adalah penanda paling khas landing SaaS 2020-an |
| Bingkai jendela macOS (tiga titik merah/kuning/hijau) | Bilah alat rapat + jalur `erpindo / dashboard` bergaya mono | Sama seperti aplikasinya sendiri |
| Pita CTA `rounded-3xl` bergradien dua-warna | Bidang merek datar berbingkai, isi rata kiri | idem |
| Pil `rounded-full` (tab showcase, badge integrasi) | Sudut tegas `rounded` | Konsisten dengan `--radius-card` 0.375rem dari 17a |
| Kartu terpisah berbayang (`shadow-md`, `shadow-xl`) | Kisi **berbagi garis** (`gap-px` di atas latar garis) | Modul terbaca sebagai satu sistem, bukan tumpukan kartu |
| Lencana "Paling populer" bergradien mengambang | Lencana datar sebaris dengan nama paket | Kartu populer cukup ditandai garis merek, tanpa diangkat & dibayangi |

Kerapatan: bantalan seksi `py-16` → `py-14`, teks isi `text-sm`/`text-lg` →
`text-[13px]`/`text-[15px]`, lebar isi `max-w-5xl` → `max-w-6xl`.

**Angka memakai utilitas `num`** (mono + `tabular-nums` dari 17a) di TrustBar,
harga paket, dan kalkulator per-pengguna — di situlah font angka yang
ditambahkan 17a benar-benar terpakai di halaman jualan.

## Bug: `text-transform` mengubah apa yang dibaca asersi

Rombakan sempat memecah `F15 toggle EN menerjemahkan hero + harga ke Inggris`.
Sebabnya halus: lencana paket diberi kelas `uppercase`, dan **`innerText`
menghormati `text-transform`** (berbeda dengan `textContent`). Jadi asersi
mencari `"Most popular"` sementara halaman melaporkan `"MOST POPULAR"`.

Tidak ada yang salah pada terjemahannya; yang berubah hanya CSS. Ini kelas jebakan
yang tidak akan tertangkap dengan membaca kode.

Aturan yang dipakai sejak sekarang, ditulis sebagai komentar di tempatnya:
**jangan pasang `uppercase` pada teks yang dibaca asersi `innerText`.**
`uppercase` tetap dipakai pada dua label eyebrow (badge hero dan judul
"Kompatibel dengan…") setelah diperiksa bahwa tak satu pun asersi — di `ui-sim`
maupun `smoke` — membaca kalimat itu. Header tabel dibuat **seragam tanpa**
`uppercase`, karena salah satunya memuat kata "ERPindo" yang memang dibaca asersi.

## Lubang di kisi yang dulu tak terlihat

`FEATURE_GROUPS` berisi **11** modul di kisi **3 kolom** — 12 slot. Pada tata
letak lama (kartu terpisah dengan `gap-5`) slot ke-12 yang kosong tidak terlihat
sama sekali. Begitu kisinya berbagi garis, lubang itu menganga.

Diisi ajakan ("Semua modul termasuk di setiap paket"), bukan ruang mati, dan
dikunci cek baru **`F21`** yang memastikan jumlah sel habis dibagi 3. Kalau
modul ke-12 ditambahkan kelak, lubang baru di baris berikutnya akan berbunyi
sendiri.

## `sapu-i18n.mjs` mengenali pembantu `L()`

Penyapu hanya mengenali dua bentuk ternary dwibahasa (`lang === "en" ? …` dan
`en ? …`). Landing page memakai pembantu sendiri, `L(lang, "id", "en")`, yang
sama sahnya tetapi tak dikenali — sehingga **seluruh teks landing terhitung
utang** padahal halaman itu sudah dwibahasa sejak Fase 13d.

| Berkas | Sebelum | Sesudah |
| --- | ---: | ---: |
| `landing/index.tsx` (versi lama, sebagai pembanding) | 69 | **6** |
| `landing/index.tsx` (setelah 17d) | 71 | **6** |

Angka lama dan baru sama-sama turun ke 6, artinya **17d tidak menambah utang
terjemahan sama sekali** — dua tambahan itu murni teks baru yang memang sudah
dwibahasa. Sisa 6 adalah positif palsu jenis lain (sisi `en` pada pasangan
`{ id, en }` yang kebetulan lolos deteksi kata Indonesia) dan dua `aria-label`
berbahasa Indonesia yang **sengaja dipertahankan**: `input[aria-label="Nama"]`
dan `aria-label="Jumlah karyawan"` dipakai sebagai selektor `ui-sim`.

Sekali lagi perlu dikatakan terus terang: penurunan 69 → 6 **bukan kemajuan
terjemahan**, melainkan koreksi alat ukur yang selama ini salah hitung.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 244 unit test lolos (tetap) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos (tetap) |
| `node scripts/ui-sim.mjs` | **219** cek lolos (naik dari 218) |

Seluruh kontrak string landing dipertahankan dan terbukti lewat F15:
`Starter`/`Business`/`Enterprise`/`Rp999.000`/`per pengguna`/`Midtrans`/
`Coretax`/`Hemat sekitar`/`beres dalam satu aplikasi`/`Terima kasih!`, serta
sisi Inggris `all in one app`/`Most popular`/`/month`/`See how it works`/
`Still using`/`Frequently asked questions`.

## Konsekuensi yang sudah diperiksa, bukan dikira: gambar produk basi

Bingkai hero memuat `apps/web/public/landing/hero-dashboard.webp`. Berkas itu
**diperiksa langsung** (dirender ulang ke PNG lalu dilihat), bukan sekadar
diduga: isinya masih desain **terang, kartu membulat, berbayang lembut** —
persis rupa aplikasi sebelum Fase 17a. Riwayat git membenarkan: terakhir disentuh
pada Fase 10a.

Jadi halaman jualan yang baru masih memajang tangkapan layar produk yang lama.
Ke-33 gambar (6 landing + 27 panduan) diregenerasi di **Fase 17e**, sesuai
rencana — dicatat di sini supaya tidak terlewat, bukan untuk ditunda diam-diam.
