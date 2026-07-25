// Sapuan sisa teks Indonesia di halaman web — versi terpercaya.
//
// Menyapu SEMUA literal string, template literal, dan potongan teks JSX, lalu
// membuang kelas positif-palsu yang sudah terbukti:
//   - komentar kode (// dan /* */)
//   - sisi `id:` dari pasangan Dual { id: "…", en: "…" } — memang harus Indonesia
//   - argumen kunci kamus: u("namaKunci")
//   - nama kelas Tailwind
// Sisanya dikelompokkan: [LAYAR] teks layar (utang nyata), [TOAST] pesan toast
// (di luar lingkup program 16b–16k), [BERKAS] header kolom / nama sheet berkas
// ekspor CSV-Excel (format berkas, bukan teks layar).
//
// Pakai: node scripts/sapu-i18n.mjs apps/web/src/pages/*.tsx
import { readFileSync } from "node:fs";

const KUNCI = new Set(
  [...readFileSync("apps/web/src/i18n/ui.ts", "utf8").matchAll(/^ {2}([a-zA-Z0-9]+):/gm)].map(
    (m) => m[1],
  ),
);

const KATA_ID = [
  "dan","atau","yang","untuk","dari","dengan","tidak","belum","sudah","akan","bisa","boleh",
  "tiap","bila","saat","agar","jadi","mis","dll","juga","ini","itu","per","ke","di","pada",
  "nama","tanggal","nilai","jumlah","daftar","daftarkan","tambah","simpan","batal","batalkan",
  "hapus","ubah","buat","dibuat","pilih","cari","aset","akun","kas","bank","jurnal","saldo",
  "masa","hasil","biaya","periode","catatan","keterangan","mutasi","setoran","setor","tarik",
  "penarikan","transfer","rekening","penyusutan","susut","tersusut","perolehan","kategori",
  "residu","manfaat","pelepasan","lepas","dilepas","dibayar","diterima","sejak","bln","bulan",
  "ya","aktif","jalankan","penjualan","pembelian","sumber","tujuan","berhasil","gagal","cocok",
  "manual","otomatis","neraca","laba","rugi","kredit","debit","dobel","diulang","aman","seimbang",
  "dipicu","awal","dibuang","urungkan","peralatan","kendaraan","melacak","mulai","tetap","barang",
  "lunas","menampilkan","kurs","faktur","dokumen","produk","gudang","pelanggan","pemasok","stok",
  "kedaluwarsa","wajib","diisi","refund","retur","pembalik","posting","diposting","terkunci",
  "template","dimuat","periksa","lalu","koreksi","terjadi","berjalan","ditukar","saling","akhir",
  "kosong","header","terbaka","perubahan","memengaruhi","transaksi","lama","memakai","sekaligus",
  "satu","karakter","minimal","modal","sewa","ruko","bulanan","penawaran","prospek","dijurnal",
  "selisih","tagihan","melebihi","sisa","pencarian","mencocokkan","nomor","kontak","muncul",
  "sini","beserta","status","pembayaran","pembayarannya","kata","kunci","lain","coba","anda",
];
const RE_ID = new RegExp(`(^|[^a-z])(${KATA_ID.join("|")})([^a-z]|$)`, "i");
const RE_TAILWIND = /(^|\s)(text|bg|border|flex|grid|gap|rounded|dark|hover|sm|md|lg|p[xytblr]?|m[xytblr]?|w|h)[-:]/;

const isID = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 3 || !/[a-zA-Z]/.test(t)) return false;
  if (KUNCI.has(t)) return false;                       // argumen u("kunci")
  if (/^(https?:|\/|#)/.test(t)) return false;
  if (RE_TAILWIND.test(t) && /^[\w\s:/[\]().↔·—–-]+$/.test(t)) return false;
  return RE_ID.test(t);
};

// buang komentar + sisi id: dari pasangan Dual, ganti dengan spasi agar
// nomor baris tetap benar
const bersihkan = (src) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + m.slice(p1.length).replace(/./g, " "))
    .replace(/\bid:\s*"(?:[^"\\]|\\.)*"(\s*,\s*\n?\s*en:)/g, (m, tail) =>
      m.slice(0, m.length - tail.length).replace(/[^\n]/g, " ") + tail,
    );

let totalLayar = 0;
for (const file of process.argv.slice(2)) {
  const asli = readFileSync(file, "utf8");
  const src = bersihkan(asli);
  const hits = new Map();
  const add = (jenis, teks, idx) => {
    const baris = src.slice(0, idx).split("\n").length;
    const k = `${baris}|${teks.replace(/\s+/g, " ").trim()}`;
    if (!hits.has(k)) hits.set(k, { jenis, baris, teks: teks.replace(/\s+/g, " ").trim() });
  };
  // Rentang [awal, akhir) dari tiap panggilan yang isinya bukan teks layar,
  // dihitung dengan mencocokkan kurung — jauh lebih tepat daripada menebak
  // dari konteks beberapa ratus karakter sebelumnya.
  const rentang = (nama, jenis) => {
    const out = [];
    for (const m of src.matchAll(new RegExp(`\\b${nama}\\(`, "g"))) {
      let d = 0;
      for (let i = m.index + m[0].length - 1; i < src.length; i++) {
        if (src[i] === "(") d++;
        else if (src[i] === ")" && --d === 0) {
          out.push({ a: m.index, b: i, jenis });
          break;
        }
      }
    }
    return out;
  };
  // downloadCsv/downloadXlsx = isi BERKAS ekspor (nama sheet, header kolom),
  // bukan teks layar — sama seperti header template CSV impor (Fase 16m).
  // Menerjemahkannya berarti mengubah format berkas, bukan bahasa antarmuka.
  const zona = [
    ...rentang("toast", "TOAST"),
    ...rentang("downloadXlsx", "BERKAS"),
    ...rentang("downloadCsv", "BERKAS"),
  ];

  // Ternary dwibahasa yang memang sah: lang === "en" ? "…" : "…"
  const zonaSah = [];
  for (const m of src.matchAll(/lang\s*===\s*"en"\s*\?/g)) {
    const akhir = src.indexOf("\n", src.indexOf(":", m.index + m[0].length));
    zonaSah.push({ a: m.index, b: akhir < 0 ? src.length : akhir });
  }

  const jenisDari = (idx) => {
    if (zonaSah.some((z) => idx >= z.a && idx <= z.b)) return "SAH";
    const z = zona.find((z) => idx >= z.a && idx <= z.b);
    return z ? z.jenis : "LAYAR";
  };

  for (const m of src.matchAll(/(?:^|[^\w])"((?:[^"\\]|\\.)*)"/gm))
    if (isID(m[1])) add(jenisDari(m.index), m[1], m.index);
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/gs))
    if (isID(m[1])) add(jenisDari(m.index), m[1], m.index);
  for (const m of src.matchAll(/[>}]([^<>{}]+)[<{]/gs))
    if (isID(m[1])) add(jenisDari(m.index), m[1], m.index);

  const rows = [...hits.values()].sort((a, b) => a.baris - b.baris);
  const layar = rows.filter((r) => r.jenis === "LAYAR");
  totalLayar += layar.length;
  const ringkas = `${file}: LAYAR=${layar.length} TOAST=${rows.filter((r) => r.jenis === "TOAST").length} BERKAS=${rows.filter((r) => r.jenis === "BERKAS").length}`;
  console.log(layar.length === 0 ? `BERSIH ✅ ${ringkas}` : ringkas);
  for (const r of layar) console.log(`  ${String(r.baris).padStart(4)}  ${JSON.stringify(r.teks.slice(0, 95))}`);
}
console.log(`\nTOTAL utang teks layar: ${totalLayar}`);
