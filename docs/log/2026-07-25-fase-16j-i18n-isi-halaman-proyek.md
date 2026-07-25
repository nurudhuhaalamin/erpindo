# Log Kerja — Fase 16j: Isi halaman Proyek dwibahasa + pola kelima

**Tanggal:** 25 Juli 2026.

## Pola kelima ditemukan: string di dalam object literal

Saat menyiapkan fase ini, muncul bentuk yang **belum pernah tertangkap** empat
pola sebelumnya — teks yang hidup sebagai **properti objek**, bukan teks JSX
maupun atribut:

```tsx
<Tabs tabs={[{ key: "ikhtisar", label: "Ikhtisar" }, …]} />
```

Sapuan pola ini (`label:` / `title:` / `text:` bernilai string) atas **seluruh**
halaman menemukan 117 kemunculan. Tetapi **tidak semuanya cacat** — dan itu
diperiksa satu per satu sebelum diklaim:

| Sumber | Jumlah | Status |
|---|---|---|
| `app.tsx` (menu sidebar) | 60 | **Bukan cacat** — punya peta terjemahan sendiri (`NAV_LABEL_EN`), dibuktikan cek ui-sim F0b |
| `reports.tsx`, `finance.tsx` (`name:`) | 3 | **Bukan UI layar** — nama *sheet* pada berkas Excel yang diunduh, sekelas header CSV yang memang dibiarkan |
| **`payroll.tsx` label tab** | 6 | **Cacat nyata** — tab Karyawan/Gaji/Komponen/Kasbon/Cuti/Departemen masih Indonesia meski 16i dinyatakan "tuntas" |
| `projects.tsx` tab + kolom papan | 7 | Cacat, diperbaiki di fase ini |
| Halaman yang belum digarap | sisanya | Wajar |

**Koreksi jujur:** klaim "tuntas" pada 16i sekali lagi terlalu dini — label tab
luput karena bentuknya belum masuk daftar pola. Sudah diperbaiki di sini.

## Yang dikerjakan

`projects.tsx` (±990 baris, sembilan komponen): daftar proyek, detail bertab
(Ikhtisar/Tugas/Timesheet/Termin & RAB), Gantt, papan tugas kanban, beban kerja,
termin penagihan, RAB, dan timesheet.

**65 entri kamus baru + 70 penggantian**, termasuk label tab & kolom kanban.

### Catatan teknis: konstanta level-modul

`TASK_COLUMNS` adalah konstanta level-modul, sehingga **tidak boleh memanggil
hook**. Solusinya: simpan **kunci kamus** (`labelKey: UiKey`), lalu terjemahkan
saat render (`u(col.labelKey)`) — pola yang bisa dipakai ulang untuk konstanta
serupa.

## Validasi

- **UI-sim +1 (`F0l`)**: rute diverifikasi lebih dulu (`/app/proyek`); penanda
  positif ("Project list"/"No projects yet" + "New project"/"Project name") dan
  negatif dari teks murni UI.
- typecheck 4/4 · lint bersih · build · unit 234 · smoke 861 (tak berubah).
- **Sapuan lima pola atas sembilan berkas: bersih.**

## Cakupan

**±20 layar** tuntas isinya; kamus **371 entri**.
