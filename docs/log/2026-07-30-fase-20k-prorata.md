# Fase 20k — Ganti paket mandiri dengan prorata

Pemilik bisa naik/turun paket sendiri di tengah siklus, tanpa menghubungi kami.

## Yang dikerjakan

- `hitungProrata()` di `packages/shared/src/core.ts` — fungsi murni.
- `GET /:tenantId/billing/prorata` (pratinjau) + `POST /:tenantId/billing/change-plan`
  (eksekusi) di `apps/api/src/routes/billing.ts`.
- Migrasi control-plane `0015_plan_change_prorata`: `tenants.pending_plan` +
  `subscription_invoices.is_prorata`.
- Blok cron **1b2** di `apps/api/src/index.ts` menerapkan penurunan terjadwal.
- Kartu Langganan di `apps/web/src/pages/settings/company.tsx`: tombol naik/turun
  + dialog pratinjau, dwibahasa.
- `subscriptionEndsAt` pada endpoint admin platform (`routes/admin.ts`).

## Aturannya sengaja tidak simetris

- **Naik paket berlaku SEKARANG**, ditagih selisih harga × sisa hari ÷ 30. Orang
  menaikkan paket karena butuh kapasitasnya hari itu juga; menundanya ke akhir
  periode membuat pembayaran terasa seperti hukuman.
- **Turun paket berlaku di AKHIR PERIODE**, tanpa tagihan dan tanpa refund.
  Mereka sudah membayar sisa periode ini, jadi mereka berhak memakainya.

Refund tunai **tidak** dilakukan, dan itu keputusan yang disadari: uang keluar
menuntut jalur persetujuan, rekonsiliasi, dan penanganan sengketa yang belum ada
di sistem ini. Membangunnya setengah jadi lebih berbahaya daripada tidak sama
sekali.

## Satu rumus, dua pemakai

`hitungProrata()` dipakai **pratinjau di layar dan penagihan di server** dari
fungsi yang sama persis. Tidak ada hitungan kedua di sisi web yang bisa berbeda
diam-diam dari yang ditagihkan — dan layar yang menampilkan angka berbeda dari
yang akhirnya dipotong adalah cara tercepat kehilangan kepercayaan pelanggan.

Pratinjau juga **tidak menyentuh apa pun**. Ada cek smoke tersendiri untuk itu:
pemilik harus bisa menekan tombolnya untuk melihat angkanya tanpa takut sudah
terlanjur membeli.

## Dua lubang yang ditutup di sisi uang

**Invoice prorata tidak memperpanjang masa berlaku.** Webhook lama selalu
menambah satu bulan pada `subscription_ends_at`. Untuk invoice prorata itu
salah: yang dibeli adalah kenaikan paket untuk sisa periode yang **sudah**
berjalan, bukan sebulan tambahan. Tanpa `is_prorata`, setiap kenaikan paket akan
memberi tenant sebulan gratis — dan tidak ada satu laporan pun yang akan
menunjukkannya.

**Nol tanpa penanda berarti gratis.** Tenant tanpa siklus berjalan menghasilkan
`bayarSekarang: 0`. Kalau route hanya membaca angka itu, naik paket jadi gratis.
Karena itu hasilnya membawa `bisaProrata`, dan route menolak dengan 400 sambil
mengarahkan ke pembelian biasa. Diuji dari dua sisi (unit + smoke).

## Koreksi: `pnpm test` tidak saya jalankan sebelum rebase

Setelah menambah dua route billing saya menjalankan typecheck, lint, smoke, dan
ui-sim — **tetapi tidak `pnpm test`**. Saat gerbang penuh dijalankan ulang
sesudah rebase, penjaga RBAC per-rute langsung merah:

```
+   "billing.ts GET \"/:tenantId/billing/prorata\"",
+   "billing.ts POST \"/:tenantId/billing/change-plan\"",
```

Kedua endpoint memang sengaja memakai `requireAuth` + cek keanggotaan manual,
bukan `requireTenantRole` — alasannya sama dengan endpoint billing lama: tenant
`past_due` justru **perlu** bisa pindah paket sebagai jalan keluar, sementara
`requireTenantRole` memblokir tulis saat past_due. Keduanya ditambahkan ke
daftar putih beserta alasannya.

Yang perlu dicatat bukan penyelesaiannya melainkan sebabnya: melewatkan satu
gerbang membuat saya percaya pekerjaannya selesai selama hampir satu jam.

## Koreksi kedua: penjaga yang tertinggal dalam keadaan dilumpuhkan

`F2b` merah pada jalannya setelah rebase:

```
✗ F2b tenant tanpa periode berlangganan TIDAK ditawari ganti paket prorata → 2 tombol
```

Sebabnya `const langgananAktif = true;` — pelumpuhan **sementara** yang saya buat
untuk membuktikan `F2b` bisa gagal, dan kontainer restart sebelum sempat
dikembalikan. Ceknya bekerja persis seperti yang diharapkan: ia menangkap
penjaganya sendiri yang mati. Sudah dikembalikan.

## Yang tidak punya cakupan, dinyatakan apa adanya

Dialog prorata **tidak punya cek ui-sim maupun pemeriksaan mata**. Tenant ui-sim
adalah akun *comped* — paket enterprise tanpa periode berlangganan — sehingga
tombol dan dialognya memang tidak boleh muncul di sana. Membuatnya bisa dicapai
menuntut hak admin platform, yang justru dipastikan **tidak ada** oleh `F17`.

Yang menutupinya: **7 unit test** pada angka rupiah persisnya, **11 cek smoke**
end-to-end lewat API sungguhan, dan `F2b` yang menjaga tombolnya tidak muncul
untuk tenant tanpa periode. Bagian yang paling berbahaya di fitur ini adalah
aritmetikanya, dan aritmetikanya diuji.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **305** (dari 298) |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **906** (dari 894) |
| `node scripts/ui-sim.mjs` | 0 | **274** (dari 273) |
| `node scripts/sapu-i18n.mjs` | 0 | utang atribut tetap **0** |

Tujuh unit test (`packages/shared/test/prorata.test.ts`) menguji angka
**persisnya** pada tanggal yang ditentukan, bukan sekadar "ada angkanya" — kode
yang menyentuh uang pelanggan salahnya tidak terlihat di layar mana pun:
tagihan yang kelebihan sedikit tetap terbayar, yang kekurangan sedikit tetap
mengaktifkan paket.

Termasuk kasus yang paling mudah lolos: naik paket **di hari terakhir** harus
tetap menagih sesuatu. Nol di situ berarti naik paket gratis yang bisa diulang
tiap bulan.

## Catatan cakupan: halaman Pengaturan belum dwibahasa

Kartu Langganan yang saya sentuh di fase ini memakai `useUi()`, tetapi **sisa
halaman Pengaturan tidak**. Penyapu i18n tidak pernah menghitungnya karena glob
gerbang di `CLAUDE.md` hanya menyapu `pages/*.tsx` dan tidak turun ke subfolder:

```
apps/web/src/pages/settings  → 219 utang teks layar, 33 atribut
```

Lima dari enam berkasnya tidak memanggil `useUi()` sama sekali. Ini kelima
kalinya klaim cakupan i18n saya ternyata tidak lengkap, dengan sebab yang selalu
sama: membaca daftar, bukan menjalankan alat pada seluruh sasarannya.
Dijadwalkan sebagai **Fase 20m** atas keputusan pemilik.
