# Fase 19u (bagian 1) — teks tampilan di atribut

Menindaklanjuti kelas buta yang ditemukan 19t: teks tampilan yang duduk di
**atribut** (`label=`, `title=`, `placeholder=`, `confirmLabel=`) dan tak
pernah terlihat penyapu karena saringannya menuntut kata penanda Indonesia.

## Daftar istilah netral — supaya angka nol berarti nol

Sebelum menerjemahkan apa pun, satu hal harus diselesaikan lebih dulu: dari
123 temuan atribut, sebagian memang **sama di kedua bahasa** — `DPP`, `PPN`,
`PPh 21`, `PPh 23`, `NPWP`, `SKU`, `QC`, `No.`, `BoM`, `FEFO`, `e-Faktur`,
`Work center` — plus contoh kode seperti `WC-CUT` dan `CAB-BDG`.

Kalau butir-butir itu terus dilaporkan, tak satu berkas pun bisa mencapai
nol, dan angka sisanya berhenti bermakna. Penyapu kini punya daftar `NETRAL`
yang **eksplisit, bukan tebakan pola**: tiap butir sudah diputuskan satu per
satu, dan menambah butir baru adalah keputusan sadar yang terbaca di satu
tempat. Kalau suatu saat salah, kesalahannya kelihatan.

Efeknya: **123 → 86** sebelum sebaris terjemahan pun ditulis. Itu bukan
perbaikan, melainkan koreksi pengukuran — dan disebut apa adanya di sini
supaya tidak terbaca sebagai kemajuan yang tidak terjadi.

## Berkas yang dikerjakan

| Berkas | Atribut | Hasil |
| --- | ---: | --- |
| `manufacturing.tsx` | 12 → 0 | **BERSIH** |
| `maintenance.tsx` | 7 → 0 | **BERSIH** |
| `dimensi.tsx` | 8 → 0 | **BERSIH** |

Judul kartu yang selalu terlihat ("Perintah produksi", "Riwayat produksi",
"Jadwal servis berkala", "Work order ad-hoc", "Cost center / departemen") dan
label kartu layar HP ("Tahap", "Standar", "Aktual", "Varian", "Rencana",
"Aksi", "Dimensi") kini dwibahasa. Empat kunci lama dipakai ulang: `kode`,
`arsipkan`, `pendapatan`, `beban`.

**Satu jebakan makna lagi:** kamus sudah punya `tahapBaru`, `tahapPenawaran`,
dan seterusnya — itu **tahap pipeline CRM**, sedangkan "Tahap" di manufaktur
berarti langkah routing produksi. Dipakai ulang, tombolnya akan salah arti.
Dipakai kunci `mfTahap` sendiri. Pelajaran 16u, kejadian ketujuh.

## Validasi

| Gerbang | Hasil | Jumlah cek |
| --- | --- | --- |
| `pnpm typecheck` | 0 | — |
| `pnpm lint` | 0 | — |
| `pnpm test` | 0 | **252** |
| `pnpm build` | 0 | — |
| `pnpm smoke` | 0 | **863** |
| `node scripts/ui-sim.mjs` | 0 | **254** |

Tanpa cek ui-sim baru. Yang dikerjakan adalah judul kartu dan label kartu HP
pada halaman yang **sudah** dinaungi cek dwibahasanya masing-masing (`F1h`
untuk Manufaktur & Pemeliharaan, `F1l` untuk Dimensi) serta `F28`/`F33` untuk
kartu HP. Menambah cek hampa hanya demi menaikkan angka melanggar semangat
aturan "jumlah cek hanya boleh naik" — aturan itu menuntut cakupan bertambah,
bukan angkanya.

## Sisa

**65 temuan atribut di 20 berkas** (terbanyak `projects` 8, `mulai` 5,
`marketplace` 5, `consolidation` 4, `approvals` 4), ditambah **102 temuan
teks layar** yang sudah diklasifikasikan di 19t sebagai disengaja atau
positif palsu.

Bagian 2 melanjutkan sisa 65 itu. Program dwibahasa Fase 19 **masih belum
tuntas**, dan tetap dinyatakan begitu sampai benar-benar nol.
