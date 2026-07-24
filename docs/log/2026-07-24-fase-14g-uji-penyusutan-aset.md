# Log Kerja — Fase 14g: Uji mesin penyusutan aset

**Tanggal:** 24 Juli 2026.

## Yang dikerjakan

Lanjutan 14a (uji mesin akuntansi inti). Mesin **penyusutan garis lurus**
(`runDepreciation` di `apps/api/src/routes/assets.ts`) — yang dijalankan Cron
bulanan maupun endpoint manual untuk memposting jurnal Beban Penyusutan /
Akumulasi Penyusutan — sebelumnya **tanpa satu pun uji unit**, padahal berdampak
langsung ke nilai buku aset & beban (berimplikasi pajak).

1. **Helper harness baru** (`apps/api/test/helpers/memdb.ts`): `seedAsset()`
   (menyisipkan satu aset tetap dengan biaya/masa/residu/akumulasi/status yang
   dapat diatur) dan `assetAccumulated()` (baca akumulasi penyusutan tercatat).
   Mengikuti pola `seedContact`/`seedProduct` yang sudah ada.
2. **`depreciation.test.ts`** (10 uji) terhadap SQLite in-memory beskema produksi:
   - **Garis lurus:** `(cost−residu)/masa`; jurnal seimbang; arah debit Beban
     `5-5000` / kredit Akumulasi `1-1510` benar; residu diperhitungkan; akumulasi
     bertambah + satu entri `depreciation_entries` per periode.
   - **Idempotensi:** menjalankan ulang periode yang sama → `count 0` (tak ada
     jurnal kedua, akumulasi tetap).
   - **Batas bulan terakhir:** saat sisa < besaran bulanan, hanya menyusut sisa —
     akumulasi berhenti **pas** di `cost−residu`, tak pernah melebihi.
   - **Dilewati dengan benar:** aset tersusut penuh & aset `disposed` tak disusutkan.
   - **Periode terkunci:** `locked_before` → dikembalikan `{ error }` tanpa
     memposting jurnal apa pun.
   - **Banyak aset:** digabung ke **satu** jurnal, total dijumlahkan, tiap entri
     menunjuk jurnal yang sama; tanpa aset aktif → `count 0` tanpa jurnal.

Tanpa perubahan kode produksi — murni menambah uji + dua helper harness.

## Validasi

- **Unit 156 → 166** (+10): seluruhnya di `apps/api` (54 → 64), diuji terhadap
  `runDepreciation` nyata di atas skema migrasi tenant asli.
- typecheck 4/4 · lint bersih · build.
- Smoke 850 · ui-sim 184 **(tak berubah — fase uji saja**, tanpa kode produksi/UI).

## Catatan

- Selisih kurs valas & pelepasan aset (gain/loss) logikanya tertanam di dalam
  handler route (butuh harness HTTP), bukan fungsi terekspor murni seperti
  `runDepreciation` — sengaja tidak diekstrak agar fase ini tetap uji-saja tanpa
  risiko perubahan perilaku. Keduanya sudah tercakup jalur smoke; kandidat uji
  unit berikutnya bila handler-nya dipecah menjadi pustaka tersendiri.
