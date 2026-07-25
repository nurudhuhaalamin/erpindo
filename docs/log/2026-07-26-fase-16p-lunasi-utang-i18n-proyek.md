# Fase 16p — Lunasi utang i18n halaman Proyek

Sub-fase kelima pelunasan utang hasil audit Fase 16k. Sasaran:
`apps/web/src/pages/projects.tsx` — 24 temuan meski Fase 16j (yang **baru saja**
mengerjakan halaman ini) menyatakannya tuntas.

## Dua temuan yang pantas dicatat

### 1. Konstanta tingkat modul, ketiga kalinya — dan lima belas baris dari yang pertama

`STATUS_LABEL` menyimpan teks tampilan (`berjalan`/`ditunda`/`selesai`) sebagai
`string` biasa. Ini kejadian **ketiga** setelah `TASK_COLUMNS` (16j) dan
`CONTACT_TYPE_LABELS` (16m), dan yang paling mengganggu: ia duduk **lima belas
baris di bawah `TASK_COLUMNS`**, di berkas yang sama, yang saya ubah sendiri
pada 16j. Saya memperbaiki satu konstanta lalu berhenti melihat.

```ts
const STATUS_LABEL: Record<"active" | "on_hold" | "completed", UiKey> = {
  active: "berjalan",
  on_hold: "ditunda",
  completed: "selesaiStatus",
} as const;
// render: <Badge tone={…}>{u(STATUS_LABEL[project.status])}</Badge>
```

Pelajarannya bukan "cari `STATUS_LABEL`", melainkan: **memperbaiki satu contoh
dari sebuah pola tidak sama dengan memperbaiki polanya.** Setelah menemukan
satu konstanta tingkat modul yang menyimpan teks, seluruh berkas harus disisir
untuk konstanta sejenis — bukan hanya yang kebetulan sedang dibaca.

### 2. `aria-label` tertinggal padahal kuncinya sudah ada

Enam `aria-label` masih berbahasa Indonesia — `Nama tugas`, `Ubah penanggung
jawab`, `Ubah prioritas`, `Nama termin`, `Kategori RAB`, `Tanggal` — padahal
Fase 16j **sudah membuat keenam kuncinya** (`namaTugas`, `ubahPenanggungJawab`,
`ubahPrioritas`, `namaTermin`, `kategoriRab`, `tanggal`). Yang diterjemahkan
saat itu hanya label yang terlihat; label aksesibilitas pada elemen yang sama
terlewat.

Akibatnya nyata: pemakai pembaca layar akan mendengar bahasa Indonesia di
tengah antarmuka Inggris. Dan ini **tidak mungkin tertangkap** oleh dua lapis
pemeriksaan yang ada — tak terlihat di layar saat ditinjau mata, dan
`innerText` yang dipakai asersi `ui-sim` tidak membaca atribut.

Karena itu pantas dijadikan aturan: **`aria-label` adalah teks UI, dan
kuncinya lebih sering sudah ada daripada belum.** Hanya sapuan yang bisa
menemukannya.

## Yang dikerjakan

- **18 entri kamus baru** di `apps/web/src/i18n/ui.ts` (522 → 540).
- **20 blok teks** di `projects.tsx` diganti ke `u("…")`: tombol `Buat Proyek`,
  ringkasan `Biaya`/`Laba` per proyek, `lewat tenggat`/`{n}% waktu berjalan`
  pada garis waktu, pesan Gantt kosong + petunjuknya, `Belum ditugaskan`,
  kolom kanban `kosong`, petunjuk seret kartu, beban kerja
  (`terbuka`/`belum`/`proses`/`selesai`), `sudah ditagih` pada termin,
  `Realisasi {n}% dari anggaran — melebihi RAB`, dan catatan estimasi timesheet.

Sisa temuan tinggal 5, seluruhnya positif-palsu (potongan kode dan argumen
kunci kamus).

## Validasi

| Gerbang | Hasil |
| --- | --- |
| `pnpm typecheck` | 4/4 paket lolos |
| `pnpm lint` | bersih |
| `pnpm test` | 234 unit test lolos |
| `pnpm build` | ok |
| `pnpm smoke` | 861 cek lolos |
| `node scripts/ui-sim.mjs` | **204** cek lolos (naik dari 203) |

Cek baru `F0t` — rute `/app/proyek` diverifikasi ke `main.tsx` lebih dulu.
Penanda positifnya hanya `Create Project` (tombol itu selalu tampil untuk
admin); lencana status sengaja **tidak** dijadikan syarat karena hanya muncul
bila ada proyek — asersi yang menuntutnya akan rapuh terhadap data demo,
pelajaran dari Fase 16g.

## Sisa utang setelah fase ini

| Halaman | Temuan | Fase yang menyatakan "tuntas" |
| --- | ---: | --- |
| `stok.tsx` | 18 | 16d |
| `payroll.tsx` | 15 | 16i |
| `pos.tsx` | 11 | 16g |
| `crm.tsx` | 9 | 16h |

Ditambah **26 halaman yang belum pernah masuk program i18n** (~789 temuan
mentah) — bukan utang dari klaim keliru, melainkan pekerjaan yang belum
dimulai (lihat Fase 16n).
