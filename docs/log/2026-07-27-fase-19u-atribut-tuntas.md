# Fase 19u — teks tampilan di atribut (TUNTAS)

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

## Bagian 2 — sisanya diselesaikan

Ketiga berkas di atas ditulis sebagai "bagian 1" dengan sisa 65 temuan. Sisa
itu **sudah dikerjakan di PR yang sama**, jadi log ini mencatat keduanya.

Berkas yang ikut tuntas: `projects`, `mulai`, `marketplace`, `consolidation`,
`approvals`, `admin`, `budget`, `contracts`, `crm`, `currencies`, `dashboard`,
`finance`, `fitur`, `helpdesk`, `masterdata`, `pajak`, `procurement`,
`reports`, `payroll`, `pos`, `salesorders`, `stok`, dan `components/ui.tsx`.

Tiga komponen ternyata belum punya `useUi()` sama sekali dan baru ketahuan
dari galat kompilasi — bukti bahwa `satisfies`/tsc memang menangkap yang
luput dari mata: `Spinner` (`aria-label="Memuat"`), `PageTour`
(`aria-label="Tutup tur"`), dan `Header` di `fitur.tsx`.

Butir yang masuk daftar `NETRAL` pada bagian 2: kode contoh (`LGN-01`,
`BRG-001`, `CAB-01`, `PRJ-01`, `PRD-001`, `USD`, `0%`, format NPWP), istilah
resmi (`1721-A1`, `BPJS`, `PPh 21 (TER)`, `Qty`, `Lot`), dan **nama contoh
Indonesia** (`PT Maju Jaya`, `Budi Santoso`) — yang terakhir konsisten dengan
keputusan 19q: pasar produk ini UKM Indonesia, contoh yang realistis lebih
menolong daripada contoh yang diterjemahkan.

## Hasil akhir

```
TOTAL teks tampilan di atribut: 0
```

**Kelas atribut tuntas — nol, bukan "hampir".** Sisa 102 temuan teks layar
seluruhnya sudah diklasifikasikan di 19t sebagai disengaja (contoh kolom CSV,
parameter URL, `note:` yang disimpan ke basis data, dokumen cetak) atau
positif palsu (potongan kode, id DOM, sisi `L(lang,…)` landing).
