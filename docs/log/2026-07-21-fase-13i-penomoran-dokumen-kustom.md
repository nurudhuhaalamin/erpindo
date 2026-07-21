# Log Kerja — Fase 13i: Penomoran dokumen kustom

**Tanggal:** 21 Juli 2026.

## Yang dikerjakan

Perusahaan kini bisa menyesuaikan **format nomor dokumen** per jenis (faktur
penjualan, faktur pembelian, pembayaran) — permintaan khas perusahaan menengah/besar
yang punya konvensi penomoran sendiri.

1. **Pola berbasis token.** Mis. `INV-{YYYY}{MM}-{SEQ:4}` → `INV-202607-0001`.
   Token: `{YYYY}`/`{YY}` (tahun), `{MM}` (bulan), `{DD}` (tanggal), `{SEQ}` /
   `{SEQ:n}` (nomor urut, pad n digit; default 5).
2. **Urutan ber-scope periode.** Urutan dihitung dari bagian pola SEBELUM `{SEQ}`
   dengan token tanggal terisi — bila pola memuat `{YYYY}`/`{MM}`, urutan otomatis
   **reset tiap periode** (cari nomor berawalan sama di kolom nomor dokumen);
   tanpa token periode → urutan menerus.
3. **Opt-in & aman.** Tanpa pola tersimpan, sistem memakai penomoran bawaan
   (`INV-00001`) — perusahaan yang sudah berjalan tak terpengaruh, dan mengosongkan
   pola mengembalikannya ke bawaan.
4. **UI** di Pengaturan → Perusahaan → **Penomoran dokumen** (khusus Owner):
   input pola per jenis + **pratinjau langsung** nomor yang akan terbit + validasi
   (`{SEQ}` wajib).

### Berkas

- `packages/shared/src/docNumbering.ts` (baru): `DOC_TYPES`, `docNumberingSchema`,
  `isValidDocPattern`, `renderDocNumber`, `docNumberScopePrefix`, tipe `ApiDocNumbering`.
- `apps/api/src/lib/accounting.ts`: `nextDocNo` menerima `opts { docType, column, date }` —
  membaca pola tenant dari `settings.doc_numbering`, menghitung urutan ber-scope, lalu
  merender; **fallback ke perilaku lama** bila tak ada pola. Dipasang di titik pembuatan
  faktur/pembelian (`commercePosting.ts`), pembayaran (`commerce.ts`), dan POS (`pos.ts`).
- `apps/api/src/routes/tenants.ts`: `GET/PATCH /:tenantId/doc-numbering` (GET viewer,
  PATCH owner) — simpan JSON ke `settings`, buang pola kosong.
- `apps/web`: klien + kartu **DocNumberingCard** (pratinjau via `renderDocNumber`).

## Batas cakupan (jujur)

- Fase 13i pada rencana juga menyebut **custom field per modul** (faktur/kontak/produk).
  Itu fitur lintas-permukaan besar (definisi + form + cetakan + ekspor) — **ditunda**
  sebagai pekerjaan tersendiri; sub-fase ini fokus pada penomoran dokumen yang berdiri
  sendiri, lengkap, dan teruji.
- Penomoran kustom berlaku untuk 3 jenis dokumen utama (faktur jual/beli, pembayaran).
  Jenis lain (SO/DO/PO/GRN, dll.) tetap format bawaan — mudah ditambah dengan meneruskan
  `opts` ke `nextDocNo` di titiknya.

## Validasi

- **Unit 127 → 137** (+10): `renderDocNumber` (token tanggal + padding SEQ, tak terpotong),
  `docNumberScopePrefix` (reset per bulan vs menerus), `isValidDocPattern` (wajib {SEQ},
  tolak kosong/spasi/terlalu panjang), `docNumberingSchema`.
- **Smoke 835 → 842** (+7... 9 cek): tolak pola tanpa {SEQ} (400), simpan+GET pola, faktur
  jasa Juli → `TST-202607-001` lalu `002` (urut per periode), reset ke bawaan → kembali `INV-#####`.
- **UI-sim 181 → 182** (+1): kartu Penomoran dokumen + pratinjau render di tab Perusahaan.
- typecheck 4/4 · lint bersih · build.
