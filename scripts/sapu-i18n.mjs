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
/**
 * Teks tampilan yang SAMA di kedua bahasa, jadi bukan utang meski berbentuk
 * literal (Fase 19u). Daftar eksplisit, bukan tebakan pola: tiap butir sudah
 * diputuskan satu per satu — istilah resmi Indonesia yang memang tidak
 * diterjemahkan (aturan sejak Fase 16), singkatan lintas-bahasa, atau contoh
 * kode. Menambah butir ke sini adalah keputusan sadar, dan itulah gunanya
 * daftar: kalau suatu saat salah, kesalahannya terbaca di sini.
 */
const NETRAL = new Set([
  "No.", "QC", "SKU", "DPP", "PPN", "PPh 21", "PPh 23", "PPh Final", "NPWP",
  "TER", "PTKP", "HPP", "BEP", "BoM", "FEFO", "CRM", "POS", "e-Faktur",
  "Work center", "WC-CUT", "CAB-BDG", "PRJ-01", "PRD-001",
  "00.000.000.0-000.000", "LGN-01", "BRG-001", "CAB-01", "USD", "0%",
  "1721-A1", "BPJS", "PPh 21 (TER)", "Qty", "Lot", "Menu", "Harga",
  // Nama & perusahaan contoh sengaja tetap Indonesia (keputusan 19q): pasar
  // produk ini UKM Indonesia, dan contoh yang realistis lebih menolong.
  "PT Maju Jaya", "Budi Santoso",
  "Email", "Password",
]);

const RE_TAILWIND = /(^|\s)(text|bg|border|flex|grid|gap|rounded|dark|hover|sm|md|lg|p[xytblr]?|m[xytblr]?|w|h)[-:]/;

const isID = (s) => {
  const t = s.replace(/\s+/g, " ").trim();
  if (t.length < 3 || !/[a-zA-Z]/.test(t)) return false;
  if (KUNCI.has(t)) return false;                       // argumen u("kunci")
  if (/^(https?:|\/|#)/.test(t)) return false;
  if (RE_TAILWIND.test(t) && /^[\w\s:/[\]().↔·—–-]+$/.test(t)) return false;
  return RE_ID.test(t);
};

/**
 * Pecah isi template literal menjadi potongan STATIS saja, membuang tiap
 * `${…}` (dengan pencocokan kurung, supaya interpolasi bersarang ikut terbuang).
 *
 * Ditambahkan Fase 17c. Sebelumnya isi template diuji utuh, jadi className
 * berkondisi seperti
 *   `flex gap-2 ${aktif ? "bg-brand-600" : "text-slate-400"}`
 * lolos dari saringan Tailwind — saringan itu menuntut SELURUH string hanya
 * berisi karakter kelas, sementara `$`, `{`, `?`, dan tanda kutip di dalam
 * interpolasi membuatnya gagal, lalu string itu dilaporkan sebagai utang teks.
 * Positif palsu ini akan muncul di hampir tiap berkas yang dirombak pada Fase
 * 17, jadi sekarang tiap potongan statis dinilai sendiri-sendiri.
 */
const potonganStatis = (body) => {
  const out = [];
  let buf = "";
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "$" && body[i + 1] === "{") {
      out.push(buf);
      buf = "";
      let d = 0;
      for (i += 1; i < body.length; i++) {
        if (body[i] === "{") d++;
        else if (body[i] === "}" && --d === 0) break;
      }
    } else buf += body[i];
  }
  out.push(buf);
  return out;
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

/**
 * Kelas bug tersendiri (ditemukan Fase 16t): `{u("kunci")}` yang berada di
 * dalam TEMPLATE LITERAL. Di sana ia bukan JSX — teksnya keluar harfiah, jadi
 * pemakai melihat tulisan `{u("subtotal")}`. Bentuk yang sah adalah
 * `${u("subtotal")}` (interpolasi). Bug ini tak terlihat mata dan tak
 * terjangkau asersi innerText, jadi harus dijaga di sini.
 */
function panggilanHarfiah(src) {
  const out = [];
  for (const m of src.matchAll(/`(?:[^`\\]|\\.)*`/gs)) {
    for (const t of m[0].matchAll(/(?<!\$)\{u\("([^"]+)"\)\}/g)) {
      out.push({ baris: src.slice(0, m.index + t.index).split("\n").length, kunci: t[1] });
    }
  }
  return out;
}

/**
 * Pola tabel-lookup dwibahasa (Fase 19s).
 *
 * `app.tsx` menerjemahkan menu bukan lewat `u("kunci")` melainkan lewat dua
 * tabel: `NAV_ITEMS` (label Indonesia + rute) dipasangkan dengan
 * `NAV_LABEL_EN` (rute → label Inggris), dan nama seksi dengan `SECTION_EN`.
 * Alat ini tidak mengenalinya, jadi 64 temuan dilaporkan di berkas yang
 * sebenarnya sudah dwibahasa sejak Fase 13e — dan angka palsu sebesar itu
 * MENUTUPI belasan utang nyata di berkas yang sama. Itulah alasan pola ini
 * diajarkan sekarang, bukan sekadar demi angka yang rapi.
 *
 * Yang penting: ini BUKAN pembungkaman. Pasangan diperiksa betulan —
 * label yang rutenya tidak ada di tabel EN tetap dilaporkan, jadi menu baru
 * yang lupa diberi label Inggris tetap ketahuan.
 */
function zonaTabelDwibahasa(src) {
  const sah = [];
  const bolong = [];

  const blok = (re, buka, tutup) => {
    const out = [];
    for (const m of src.matchAll(re)) {
      const awal = m.index + m[0].length - 1;
      let d = 0;
      for (let i = awal; i < src.length; i++) {
        if (src[i] === buka) d++;
        else if (src[i] === tutup && --d === 0) {
          out.push({ a: m.index, b: i, isi: src.slice(awal, i + 1), nama: m[1] });
          break;
        }
      }
    }
    return out;
  };

  // 1. Deklarasi `const X_EN … = { … }`: seluruh isinya sisi Inggris plus
  //    kunci pencarian (rute atau nama seksi Indonesia). Bukan teks layar.
  const tabelEn = blok(/\bconst\s+([A-Z0-9_]*_EN)\b[^=]*=\s*\{/g, "{", "}");
  sah.push(...tabelEn.map((t) => ({ a: t.a, b: t.b })));

  const kunciEn = new Set();
  for (const t of tabelEn)
    for (const k of t.isi.matchAll(/(?:^|[{,]\s*)"?([^":,{}\n]+?)"?\s*:/g)) kunciEn.add(k[1].trim());

  // 2. Tabel item bernavigasi: entri `{ to: "…", label: "…" , section: "…" }`.
  //    Label & seksinya sah HANYA bila padanan Inggrisnya benar-benar ada.
  if (tabelEn.length > 0) {
    for (const t of blok(/\bconst\s+([A-Z0-9_]+)\b[^=]*=\s*\[/g, "[", "]")) {
      for (const e of t.isi.matchAll(/\{[^{}]*\bto:\s*"([^"]+)"[^{}]*\}/g)) {
        const label = e[0].match(/\blabel:\s*"([^"]+)"/)?.[1];
        const seksi = e[0].match(/\bsection:\s*"([^"]+)"/)?.[1];
        const a = t.a + e.index;
        const b = a + e[0].length;
        const kurang = [];
        if (label && !kunciEn.has(e[1])) kurang.push(`rute ${e[1]}`);
        if (seksi && !kunciEn.has(seksi)) kurang.push(`seksi "${seksi}"`);
        if (kurang.length === 0) sah.push({ a, b });
        else
          bolong.push({
            baris: src.slice(0, a).split("\n").length,
            pesan: `${label ?? e[1]} — tanpa padanan Inggris (${kurang.join(", ")})`,
          });
      }
    }
  }
  // 3. Peta label berpasangan `const X = { … }` + `const X_EN = { … }`
  //    (Fase 20m). Peta semacam ini berisi KODE → label, bukan kalimat layar,
  //    dan sudah dwibahasa. Yang diperiksa bukan keberadaan pasangannya saja
  //    melainkan CAKUPANNYA: kunci yang ada di sisi Indonesia tetapi hilang di
  //    sisi Inggris dilaporkan sebagai bug, karena pengguna Inggris akan
  //    melihat kode mentah tanpa ada yang tahu.
  const petaEn = new Map();
  for (const t of tabelEn) {
    const kunci = new Set();
    for (const k of t.isi.matchAll(/(?:^|[{,]\s*)"?([A-Za-z0-9_.]+)"?\s*:/g)) kunci.add(k[1].trim());
    petaEn.set(t.nama, kunci);
  }
  for (const t of blok(/\bconst\s+([A-Z0-9_]+)\b[^=]*=\s*\{/g, "{", "}")) {
    const pasangan = petaEn.get(`${t.nama}_EN`);
    if (!pasangan) continue;
    const kurang = [];
    for (const k of t.isi.matchAll(/(?:^|[{,]\s*)"?([A-Za-z0-9_.]+)"?\s*:/g)) {
      if (!pasangan.has(k[1].trim())) kurang.push(k[1].trim());
    }
    if (kurang.length === 0) sah.push({ a: t.a, b: t.b });
    else
      bolong.push({
        baris: src.slice(0, t.a).split("\n").length,
        pesan: `${t.nama} — ${kurang.length} kunci tanpa padanan di ${t.nama}_EN (${kurang.slice(0, 4).join(", ")})`,
      });
  }

  return { sah, bolong };
}

let totalLayar = 0;
let totalHarfiah = 0;
let totalBolong = 0;
let totalAtribut = 0;
for (const file of process.argv.slice(2)) {
  const asli = readFileSync(file, "utf8");
  const src = bersihkan(asli);

  for (const h of panggilanHarfiah(src)) {
    totalHarfiah++;
    console.log(
      `  ⚠️  ${file}:${h.baris}  {u("${h.kunci}")} di dalam template literal — ` +
        `keluar harfiah, seharusnya \${u("${h.kunci}")}`,
    );
  }
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

  // Ternary dwibahasa yang memang sah. Dua bentuk dipakai di repo ini:
  //   lang === "en" ? "…" : "…"
  //   en ? "…" : "…"          (setelah `const en = lang === "en"`)
  // Sisi Indonesianya memang harus ada, jadi jangan dihitung utang.
  const zonaSah = [];
  const punyaAliasEn = /\bconst\s+en\s*=\s*lang\s*===\s*"en"/.test(src);
  const polaTernary = punyaAliasEn
    ? /(?:lang\s*===\s*"en"|\ben)\s*\?/g
    : /lang\s*===\s*"en"\s*\?/g;
  for (const m of src.matchAll(polaTernary)) {
    const titikDua = src.indexOf(":", m.index + m[0].length);
    const akhir = src.indexOf("\n", titikDua < 0 ? m.index : titikDua);
    zonaSah.push({ a: m.index, b: akhir < 0 ? src.length : akhir });
  }

  // Bentuk ketiga (ditambahkan Fase 17d): pembantu `L(lang, "id", "en")` yang
  // dipakai landing page. Sama sahnya dengan ternary di atas — sisi Indonesia
  // memang harus ada — tetapi selama ini tak dikenali, sehingga SELURUH teks
  // landing (69 potong) terhitung utang padahal halaman itu sudah dwibahasa
  // sejak Fase 13d. Angka utang yang salah lebih berbahaya daripada tidak ada
  // angka: ia membuat halaman yang sudah selesai terlihat belum digarap.
  // `\bL\(` aman: pada `HTML(` huruf L didahului M, jadi tak ada batas kata.
  zonaSah.push(...rentang("L", "SAH"));

  // Tabel-lookup dwibahasa (Fase 19s) — lihat komentar zonaTabelDwibahasa.
  const tabel = zonaTabelDwibahasa(src);
  zonaSah.push(...tabel.sah);
  for (const b of tabel.bolong) {
    totalBolong++;
    console.log(`  ⚠️  ${file}:${b.baris}  ${b.pesan}`);
  }

  // Pakai TUMPANG-TINDIH rentang, bukan sekadar posisi awal: potongan teks JSX
  // sering dimulai tepat SEBELUM `downloadCsv(` sehingga awalnya di luar zona
  // padahal isinya jelas milik panggilan itu.
  const jenisDari = (a, b = a) => {
    const tumpang = (z) => a <= z.b && b >= z.a;
    if (zonaSah.some(tumpang)) return "SAH";
    const z = zona.find(tumpang);
    return z ? z.jenis : "LAYAR";
  };

  for (const m of src.matchAll(/(?:^|[^\w])"((?:[^"\\]|\\.)*)"/gm))
    if (isID(m[1])) add(jenisDari(m.index, m.index + m[0].length), m[1], m.index);
  for (const m of src.matchAll(/`((?:[^`\\]|\\.)*)`/gs))
    for (const seg of potonganStatis(m[1]))
      if (isID(seg)) add(jenisDari(m.index, m.index + m[0].length), seg, m.index);
  for (const m of src.matchAll(/[>}]([^<>{}]+)[<{]/gs))
    if (isID(m[1])) add(jenisDari(m.index, m.index + m[0].length), m[1], m.index);

  /**
   * Kelas buta tersendiri (ditemukan Fase 19t): teks tampilan yang duduk di
   * ATRIBUT — `label="Akun"`, `title="Pendapatan"`, `confirmLabel="Arsipkan"`.
   *
   * Saringan `isID` di atas menuntut ada kata penanda Indonesia, jadi label
   * satu kata seperti "Kode", "Akun", atau "Aksi" lolos begitu saja — padahal
   * `label=` pada <Td> adalah judul kartu yang dibaca pemakai di layar HP, dan
   * `title=` pada <Card> adalah judul kartu yang selalu terlihat.
   *
   * Di sini penandanya bukan kosakata melainkan POSISI: atribut-atribut ini
   * memang berisi teks tampilan, titik. Yang sah hanyalah bentuk `={u("…")}`,
   * dan bentuk itu bukan literal sehingga tidak tertangkap pola ini.
   */
  // `\s*=\s*` (bukan `=` polos) sejak Fase 21b: bentuk NILAI BAWAAN PARAMETER
  // — `label = "Ekspor CSV"` di tanda tangan komponen — luput dari pola lama
  // yang menuntut `=` tanpa spasi. Satu default semacam itu membuat SEBELAS
  // tombol ekspor tetap berbahasa Indonesia di mode Inggris tanpa terlihat.
  const ATRIBUT_TAMPILAN = /\b(label|title|confirmLabel|cancelLabel|placeholder|aria-label)\s*=\s*"([^"]{2,60})"/g;
  for (const m of src.matchAll(ATRIBUT_TAMPILAN)) {
    const teks = m[2];
    // Buang yang jelas bukan kalimat tampilan: kode/slug (huruf kecil berstrip),
    // dan nilai satu kata berbahasa Inggris yang sama di kedua bahasa.
    if (/^[a-z0-9-]+$/.test(teks)) continue;
    if (NETRAL.has(teks)) continue;
    if (jenisDari(m.index, m.index + m[0].length) !== "LAYAR") continue;
    add("ATRIBUT", `${m[1]}="${teks}"`, m.index);
  }

  const rows = [...hits.values()].sort((a, b) => a.baris - b.baris);
  const layar = rows.filter((r) => r.jenis === "LAYAR");
  const atribut = rows.filter((r) => r.jenis === "ATRIBUT");
  totalLayar += layar.length;
  totalAtribut += atribut.length;
  const ringkas = `${file}: LAYAR=${layar.length} ATRIBUT=${atribut.length} TOAST=${rows.filter((r) => r.jenis === "TOAST").length} BERKAS=${rows.filter((r) => r.jenis === "BERKAS").length}`;
  console.log(layar.length === 0 && atribut.length === 0 ? `BERSIH ✅ ${ringkas}` : ringkas);
  for (const r of layar) console.log(`  ${String(r.baris).padStart(4)}  ${JSON.stringify(r.teks.slice(0, 95))}`);
  for (const r of atribut) console.log(`  ${String(r.baris).padStart(4)}  [atribut] ${r.teks.slice(0, 95)}`);
}
console.log(`\nTOTAL utang teks layar: ${totalLayar}`);
console.log(`TOTAL teks tampilan di atribut: ${totalAtribut}`);
if (totalHarfiah > 0) {
  console.log(`TOTAL panggilan u() harfiah (BUG, bukan sekadar utang): ${totalHarfiah}`);
  process.exitCode = 1;
}
if (totalBolong > 0) {
  console.log(`TOTAL item menu tanpa padanan Inggris (BUG, bukan sekadar utang): ${totalBolong}`);
  process.exitCode = 1;
}
