# Fase 16t — Peta label `packages/shared` + bug struk POS

Lanjutan langsung Fase 16s, yang menemukan bahwa sapuan selama ini hanya
melihat `apps/web/src/pages/` sementara teks tampilan juga hidup di
`packages/shared`.

## Bug nyata yang ditemukan: struk POS tercetak dengan penanda mentah

Saat membaca `pos.tsx` untuk fase ini, ketahuan `printReceipt` memuat:

```ts
<tr><td>{u("subtotal")}</td><td …>…</td></tr>
<tr><td>{u("tunai")}</td>…
<tr><td>{u("kembalian")}</td>…
<div class="c">{u("terimaKasih")}</div>
```

`printReceipt` **bukan komponen React** — ia menyusun **string HTML** lalu
menulisnya ke jendela cetak. Di dalam template literal, `{u("subtotal")}`
tidak memanggil apa pun; ia keluar **harfiah**. Artinya setiap struk yang
dicetak sejak **Fase 16g** menampilkan tulisan `{u("subtotal")}`,
`{u("tunai")}`, `{u("kembalian")}`, dan `{u("terimaKasih")}` di kertas.

Bug ini lolos dari semua lapis pemeriksaan yang ada, dan alasannya masuk akal:

- **Tidak terlihat di layar** — struk dibuka di jendela `window.open` terpisah.
- **Tidak terjangkau `ui-sim`** — asersinya memakai `innerText` halaman utama,
  dan skrip malah menutup otomatis jendela tambahan.
- **Tidak terjangkau sapuan** — `{u("subtotal")}` justru *terlihat seperti*
  kode yang sudah diterjemahkan. Sapuan mencari teks Indonesia yang tersisa,
  bukan pemanggilan `u()` yang gagal.

Perbaikannya: label dilewatkan sebagai parameter dari komponen pemanggil (yang
punya akses hook), dan fungsinya dipecah dua —

- `buildReceiptHtml(opts)` — **murni**, mengembalikan string HTML.
- `printReceipt(opts)` — efek samping, membuka jendela dan menulis hasilnya.

Pemisahan itu membuat isinya bisa diuji tanpa DOM. Ditambahkan
`apps/web/test/receipt.test.ts` (4 uji), yang pertama menegaskan
`expect(html).not.toContain('{u("')` — uji itu **gagal** pada kode di `main`
sebelum perbaikan ini.

## Kelas bugnya disapu menyeluruh, lalu dipasang ke alat

Menemukan satu bug tidak sama dengan menutup kelasnya. Seluruh
`apps/web/src/**` disapu untuk bentuk yang sama — `{u("kunci")}` di dalam
template literal — dan hasilnya: **struk POS adalah satu-satunya kejadian**.
Sisanya memakai bentuk yang sah, `${u("kunci")}`.

Perbedaan keduanya cuma satu karakter `$`, dan itulah yang membuatnya berbahaya:
keduanya terbaca "sudah diterjemahkan" saat ditinjau sekilas.

Karena itu pemeriksaannya dipasang ke `scripts/sapu-i18n.mjs`, dengan **exit
code 1** — berbeda dari utang teks biasa yang hanya dilaporkan. Utang adalah
pekerjaan yang belum selesai; ini bug yang sudah tayang ke pemakai, jadi
perlakuannya berbeda.

```
⚠️  pos.tsx:73  {u("subtotal")} di dalam template literal —
    keluar harfiah, seharusnya ${u("subtotal")}
```

Diuji dua arah: berkas contoh dengan bentuk salah membuat skrip keluar dengan
kode 1, sementara bentuk `${u("…")}` di baris sebelahnya tidak dilaporkan.

## Peta label `packages/shared`

Ada **25 peta label** bertipe `Record<…, string>` di `packages/shared`.
Enam di antaranya dirender oleh halaman yang sudah dinyatakan bersih, jadi
enam itulah utang yang benar-benar mengurangi klaim sebelumnya:

| Peta | Halaman | Fase yang mengklaim tuntas | Titik render |
| --- | --- | --- | ---: |
| `ACCOUNT_TYPE_LABELS` | `finance.tsx` | 16o | 2 |
| `INDUSTRY_LABELS` | `masterdata.tsx` | 16m | 1 |
| `LEAD_ACTIVITY_LABELS` | `crm.tsx` | 16s | 2 |
| `POS_PAYMENT_METHOD_LABELS` | `pos.tsx` | 16s | 4 |
| `PROJECT_TASK_PRIORITY_LABELS` | `projects.tsx` | 16p | 3 |
| `AGING_BUCKET_LABELS` | `reports.tsx` | 16n | 1 |

Sembilan belas sisanya dipakai halaman yang **belum pernah** masuk program
i18n (`approvals`, `procurement`, `helpdesk`, `attendance`, `salesorders`,
`marketplace`, `contracts`, `admin`) — pekerjaan yang belum dimulai, bukan
klaim keliru.

Arah ketergantungan tetap dijaga seperti 16s: `packages/shared` **tidak**
mengimpor kamus web (`apps/api` ikut memakainya). Web memetakan sendiri, mis.:

```ts
const ACCOUNT_TYPE_KEY: Record<AccountType, UiKey> = {
  asset: "aset", liability: "kewajiban", equity: "ekuitas",
  income: "pendapatan", expense: "beban",
};
```

### Satu konstanta, dua perlakuan

`AGING_BUCKET_LABELS` dipakai **dua kali** di `reports.tsx`:

- baris 419 — header kolom di dalam `downloadCsv(...)` → **tetap Indonesia**
  (aturan format berkas, Fase 16m);
- baris 450 — header tabel di layar → **diterjemahkan**.

Jadi konstanta yang sama sengaja diterjemahkan di satu tempat dan tidak di
tempat lain. Itu bukan inkonsistensi, melainkan penerapan aturan yang sudah
diputuskan: berkas ekspor bukan teks antarmuka.

## Catatan teknis

`tsconfig` memakai `noUncheckedIndexedAccess`, sehingga `Record<K, UiKey>`
menghasilkan `UiKey | undefined` saat diindeks — meski `K` adalah union
terbatas dan petanya lengkap. Untuk `ACCOUNT_TYPE_KEY` dan `AGING_BUCKET_KEY`
dipakai penegasan `!` (gaya yang sudah ada di repo, mis. `query.data!`).

Lima impor `*_LABELS` yang jadi tak terpakai dilepas — ESLint menangkapnya.

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | **238** unit test lolos (naik dari 234: +4 uji struk) |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **208** cek lolos (naik dari 207) |

Cek baru `F0x` — rute `/app/keuangan/akun`. Penanda negatifnya memakai
`Kewajiban` dan `Ekuitas`, dua kata yang **tidak** muncul sebagai nama akun
bawaan; memilih `Aset` akan rapuh karena banyak nama akun mengandungnya
(pelajaran Fase 16e: penanda negatif harus murni teks UI, bukan data pengguna).

## Sisa

| Lingkup | Perkiraan temuan mentah |
| --- | ---: |
| 26 halaman yang belum pernah masuk program i18n | ~789 |
| 19 peta label `shared` untuk halaman yang belum digarap | (bagian dari ~335) |
| `apps/web/src/components/` | ~28 |
