#!/usr/bin/env node
/**
 * Seed perusahaan demo "PT Demo Sejahtera" berisi data untuk SEMUA modul —
 * dipakai pemilik untuk mereview aplikasi secara langsung dan sebagai sumber
 * data screenshot panduan/landing.
 *
 * Pemakaian:
 *   BASE_URL=https://erpindo.example.workers.dev \
 *   SEED_EMAIL=pemilik@contoh.com SEED_PASSWORD=rahasia \
 *   node scripts/seed-demo.mjs [--force]
 *
 * Alternatif tanpa password (ops): SEED_SESSION=<token sesi mentah> — token
 * dibuat manual dengan meng-INSERT sha256(token) ke tabel sessions control-plane,
 * dipakai sekali untuk seeding, lalu barisnya dihapus.
 *
 * Alternatif tanpa kredensial sama sekali (ops via runner CI): SEED_REGISTER=1 —
 * skrip MENDAFTARKAN akun seeder baru dengan email+password acak yang dibuat di
 * proses ini dan tidak pernah dicetak; setelah seeding, kepemilikan perusahaan
 * demo dipindahkan ke akun tujuan lewat control-plane dan akun seeder
 * dinonaktifkan. Email seeder dicetak agar operator bisa menindaklanjuti.
 *
 * - Mode default: login memakai akun yang SUDAH terdaftar (tidak membuat akun baru).
 * - Menolak berjalan bila perusahaan demo sudah ada (idempoten; --force
 *   membuat salinan baru dengan slug berbeda, hanya untuk uji lokal).
 * - Gagal keras (exit 1) pada respons tak terduga agar drift skema terlihat.
 * - Semua tanggal relatif terhadap hari eksekusi (0–60 hari ke belakang)
 *   sehingga grafik dashboard 30 hari selalu hidup.
 */

import { randomBytes } from "node:crypto";

const BASE = (process.env.BASE_URL ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
const SESSION = process.env.SEED_SESSION;
const REGISTER = process.env.SEED_REGISTER === "1";
const FORCE = process.argv.includes("--force");
const COMPANY = "PT Demo Sejahtera";

if (!REGISTER && !SESSION && (!EMAIL || !PASSWORD)) {
  console.error("Set SEED_EMAIL + SEED_PASSWORD, SEED_SESSION (token sesi mentah), atau SEED_REGISTER=1.");
  process.exit(1);
}

// --- klien fetch mini dengan cookie jar (pola smoke.mjs) ---------------------
function makeClient(initialCookie = "") {
  let cookie = initialCookie;
  return async function request(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) cookie = setCookie.split(";")[0];
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* bukan JSON */
    }
    return { status: res.status, json };
  };
}

const api = makeClient(SESSION ? `erpindo_sid=${SESSION}` : "");
let steps = 0;

/** Jalankan satu langkah; gagal keras bila status tidak sesuai harapan. */
async function step(name, method, path, body, expect = [200, 201]) {
  const res = await api(method, path, body);
  if (!expect.includes(res.status)) {
    console.error(`✗ ${name} → HTTP ${res.status}\n  ${method} ${path}\n  ${JSON.stringify(res.json)}`);
    process.exit(1);
  }
  steps++;
  console.log(`  ✓ ${name}`);
  return res.json;
}

const day = 86_400_000;
/** Tanggal ISO n hari yang lalu (n boleh negatif untuk masa depan). */
const daysAgo = (n) => new Date(Date.now() - n * day).toISOString().slice(0, 10);
const thisMonth = new Date().toISOString().slice(0, 7);
const lastMonth = new Date(Date.now() - 28 * day).toISOString().slice(0, 7);

// Logo demo kecil (SVG kotak "DS" indigo, base64 — jauh di bawah batas 64KB).
const LOGO_SVG =
  `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="20" fill="#6366f1"/>` +
  `<text x="48" y="62" font-family="Arial" font-size="40" font-weight="bold" fill="#fff" text-anchor="middle">DS</text></svg>`;
const LOGO_DATA_URL = `data:image/svg+xml;base64,${Buffer.from(LOGO_SVG).toString("base64")}`;

console.log(`Seed demo → ${BASE} sebagai ${EMAIL}\n`);

// --- 0. Login/registrasi & buat perusahaan demo --------------------------------
if (REGISTER) {
  // Kredensial acak dibuat di proses ini dan TIDAK pernah dicetak.
  const seederEmail = `seeder-${Date.now()}@demo-seed.example.com`;
  const seederPass = randomBytes(24).toString("base64url");
  const reg = await api("POST", "/api/auth/register", {
    companyName: "Workspace Seeder", name: "Seeder Otomatis", email: seederEmail, password: seederPass,
  });
  if (reg.status !== 201) {
    console.error(`Registrasi seeder gagal (HTTP ${reg.status}): ${JSON.stringify(reg.json)}`);
    process.exit(1);
  }
  console.log(`  ✓ registrasi akun seeder: ${seederEmail}`);
  console.log("    (setelah seeding: pindahkan kepemilikan perusahaan demo ke akun tujuan lewat control-plane, lalu nonaktifkan akun seeder)");
} else if (!SESSION) {
  const login = await api("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
  if (login.status !== 200) {
    console.error(`Login gagal (HTTP ${login.status}): ${JSON.stringify(login.json)}`);
    console.error("Pastikan akun sudah terdaftar dan password benar. Bila 2FA aktif, seed harus dijalankan sebelum 2FA atau tambahkan totpCode manual.");
    process.exit(1);
  }
  console.log("  ✓ login");
}

const me = await api("GET", "/api/auth/me");
if (me.status !== 200) {
  console.error(`Sesi tidak valid (HTTP ${me.status}). Periksa SEED_SESSION/kredensial.`);
  process.exit(1);
}
console.log(`  ✓ sesi aktif sebagai ${me.json.user.email}`);
const existingDemo = (me.json?.memberships ?? []).find((m) => (m.tenantSlug ?? "").startsWith("pt-demo-sejahtera"));
if (existingDemo && !FORCE) {
  console.error(`Perusahaan demo sudah ada (${existingDemo.tenantSlug}). Berhenti agar tidak menggandakan data. Pakai --force untuk salinan baru (hanya uji lokal).`);
  process.exit(1);
}

const company = await step("buat perusahaan PT Demo Sejahtera", "POST", "/api/auth/companies", { companyName: COMPANY });
const T = `/api/tenants/${company.tenantId}`;

// --- 1. Pengaturan perusahaan -------------------------------------------------
await step("pengaturan: alamat, NPWP, logo", "PATCH", `${T}/settings`, {
  address: "Jl. Merdeka No. 88, Bandung, Jawa Barat 40111",
  npwp: "01.234.567.8-901.000",
  logoDataUrl: LOGO_DATA_URL,
});

// --- 2. Bagan akun: referensi + akun kustom ----------------------------------
const accountsRes = await step("baca bagan akun", "GET", `${T}/accounts`);
const acc = (code) => {
  const a = accountsRes.accounts.find((x) => x.code === code);
  if (!a) {
    console.error(`Akun ${code} tidak ditemukan di COA.`);
    process.exit(1);
  }
  return a;
};
const kas = acc("1-1000");
const bank = acc("1-1100");
const modal = acc("3-1000");

// Setoran modal awal — agar saldo Kas & Bank realistis (tidak negatif) setelah
// seluruh pembelian, aset, dan gaji dibayarkan.
await step("jurnal setoran modal awal 200 juta", "POST", `${T}/journal-entries`, {
  entryDate: daysAgo(59),
  memo: "Setoran modal awal pemilik",
  lines: [
    { accountId: bank.id, debit: 150_000_000, credit: 0 },
    { accountId: kas.id, debit: 50_000_000, credit: 0 },
    { accountId: modal.id, debit: 0, credit: 200_000_000 },
  ],
});
await step("akun kustom: Beban Iklan Digital", "POST", `${T}/accounts`, { code: "6-2100", name: "Beban Iklan Digital", type: "expense" });
const bebanIklan = (await api("GET", `${T}/accounts`)).json.accounts.find((a) => a.code === "6-2100");
const bebanListrik = accountsRes.accounts.find((a) => a.name.toLowerCase().includes("listrik")) ?? bebanIklan;
const penjualanAcc = accountsRes.accounts.find((a) => a.type === "income");

// --- 3. Produk (dagang, jasa, kedaluwarsa, bahan & jadi) -----------------------
async function product(p) {
  return step(`produk ${p.sku}`, "POST", `${T}/products`, p);
}
const kopi = await product({ sku: "KOPI-250", name: "Kopi Arabika Gayo 250g", unit: "pcs", sellPrice: 85_000, buyPrice: 55_000, minStock: 20 });
const teh = await product({ sku: "TEH-100", name: "Teh Melati Premium 100g", unit: "pcs", sellPrice: 45_000, buyPrice: 28_000, minStock: 15 });
const gula = await product({ sku: "GULA-1L", name: "Gula Aren Cair 1L", unit: "btl", sellPrice: 60_000, buyPrice: 38_000 });
const keripik = await product({ sku: "KRPK-200", name: "Keripik Singkong Balado 200g", unit: "pcs", sellPrice: 25_000, buyPrice: 14_000, minStock: 30 });
const sambal = await product({ sku: "SMBL-140", name: "Sambal Bawang Botol 140g", unit: "btl", sellPrice: 35_000, buyPrice: 20_000, trackExpiry: true });
const madu = await product({ sku: "MADU-500", name: "Madu Hutan Murni 500ml", unit: "btl", sellPrice: 120_000, buyPrice: 80_000 });
const sirup = await product({ sku: "SRP-600", name: "Sirup Pandan 600ml", unit: "btl", sellPrice: 40_000, buyPrice: 24_000 });
const kotak = await product({ sku: "BHN-KOTAK", name: "Kotak Hampers Anyaman", unit: "pcs", sellPrice: 0, buyPrice: 15_000 });
const pita = await product({ sku: "BHN-PITA", name: "Pita Satin Emas", unit: "roll", sellPrice: 0, buyPrice: 5_000 });
const hampers = await product({ sku: "HAMPERS-01", name: "Paket Hampers Nusantara", unit: "paket", sellPrice: 250_000, buyPrice: 0 });
const jasaKirim = await product({ sku: "JASA-KIRIM", name: "Jasa Pengiriman Same-Day", unit: "kali", sellPrice: 25_000, isService: true });
const jasaKonsul = await product({ sku: "JASA-RACIK", name: "Jasa Racik Hampers Kustom", unit: "jam", sellPrice: 150_000, isService: true });

// --- 4. Kontak ----------------------------------------------------------------
async function contact(k) {
  return step(`kontak ${k.name}`, "POST", `${T}/contacts`, k);
}
const custToko = await contact({ type: "customer", name: "Toko Oleh-Oleh Priangan", email: "order@priangan.co.id", phone: "022-555-1234", address: "Jl. Cihampelas No. 20, Bandung", npwp: "12.345.678.9-012.000" });
const custKafe = await contact({ type: "customer", name: "Kafe Senja Rasa", email: "halo@senjarasa.id", phone: "0812-3456-7890", address: "Jl. Braga No. 5, Bandung" });
const custHotel = await contact({ type: "customer", name: "Hotel Parahyangan", email: "purchasing@parahyangan.com", phone: "022-777-8899", address: "Jl. Asia Afrika No. 101, Bandung", npwp: "98.765.432.1-098.000" });
const custUmum = await contact({ type: "customer", name: "Pelanggan Umum", phone: "-" });
const custKoperasi = await contact({ type: "customer", name: "Koperasi Karyawan Sejahtera", email: "koperasi@sejahtera.or.id" });
const suppKopi = await contact({ type: "supplier", name: "CV Petani Kopi Gayo", email: "sales@kopigayo.co.id", phone: "0651-222-333" });
const suppKemasan = await contact({ type: "supplier", name: "PT Kemasan Kreatif", email: "cs@kemasankreatif.com", npwp: "11.222.333.4-055.000" });
const suppAneka = await contact({ type: "both", name: "UD Aneka Pangan", phone: "0813-9999-0000" });

// --- 5. Gudang ------------------------------------------------------------------
const whs = await step("baca gudang", "GET", `${T}/warehouses`);
const whUtama = whs.items.find((w) => w.code === "UTAMA");
const whCabang = await step("gudang CABANG", "POST", `${T}/warehouses`, { code: "CABANG", name: "Gudang Cabang Dago", address: "Jl. Ir. H. Juanda No. 210, Bandung" });

// --- 6. Pembelian (stok masuk; lot utk sambal; diskon; PPN variatif) ------------
async function purchase(name, p) {
  return step(name, "POST", `${T}/purchases`, p);
}
await purchase("pembelian kopi+teh (55 hari lalu)", {
  contactId: suppKopi.id, invoiceDate: daysAgo(55), taxRate: 11, warehouseId: whUtama.id,
  lines: [
    { productId: kopi.id, qty: 80, unitPrice: 55_000 },
    { productId: teh.id, qty: 60, unitPrice: 28_000 },
  ],
});
await purchase("pembelian aneka pangan (48 hari lalu, diskon 5%)", {
  contactId: suppAneka.id, invoiceDate: daysAgo(48), taxRate: 0, warehouseId: whUtama.id,
  lines: [
    { productId: gula.id, qty: 40, unitPrice: 38_000, discountPct: 5 },
    { productId: keripik.id, qty: 120, unitPrice: 14_000 },
    { productId: sirup.id, qty: 50, unitPrice: 24_000 },
  ],
});
await purchase("pembelian sambal 2 lot kedaluwarsa (40 hari lalu)", {
  contactId: suppAneka.id, invoiceDate: daysAgo(40), taxRate: 0, warehouseId: whUtama.id,
  lines: [
    { productId: sambal.id, qty: 40, unitPrice: 20_000, lotNo: "SB-A", expiryDate: daysAgo(-25) },
    { productId: sambal.id, qty: 40, unitPrice: 20_000, lotNo: "SB-B", expiryDate: daysAgo(-120) },
  ],
});
await purchase("pembelian madu (35 hari lalu)", {
  contactId: suppAneka.id, invoiceDate: daysAgo(35), taxRate: 0, warehouseId: whUtama.id,
  lines: [{ productId: madu.id, qty: 30, unitPrice: 80_000 }],
});
const purchKemasan = await purchase("pembelian kemasan hampers (30 hari lalu, PPN 11%)", {
  contactId: suppKemasan.id, invoiceDate: daysAgo(30), taxRate: 11, warehouseId: whUtama.id, dueDate: daysAgo(0),
  lines: [
    { productId: kotak.id, qty: 40, unitPrice: 15_000 },
    { productId: pita.id, qty: 80, unitPrice: 5_000 },
  ],
});
await purchase("pembelian restock kopi (12 hari lalu)", {
  contactId: suppKopi.id, invoiceDate: daysAgo(12), taxRate: 11, warehouseId: whUtama.id, dueDate: daysAgo(-18),
  lines: [{ productId: kopi.id, qty: 40, unitPrice: 56_000, discountPct: 2 }],
});

// --- 7. Faktur penjualan tersebar 45 hari (PPN & diskon variatif) ---------------
const soldMix = [
  { p: kopi, qty: 4, price: 85_000 },
  { p: teh, qty: 3, price: 45_000 },
  { p: keripik, qty: 6, price: 25_000 },
  { p: gula, qty: 2, price: 60_000 },
  { p: madu, qty: 1, price: 120_000 },
  { p: sirup, qty: 2, price: 40_000 },
];
const customers = [custToko, custKafe, custHotel, custKoperasi, custUmum];
const invoices = [];
for (let i = 0; i < 22; i++) {
  const back = 45 - i * 2; // 45,43,...,3 hari lalu
  const cust = customers[i % customers.length];
  const l1 = soldMix[i % soldMix.length];
  const l2 = soldMix[(i + 2) % soldMix.length];
  const taxRate = i % 3 === 0 ? 11 : 0;
  const inv = await step(`faktur penjualan #${i + 1} (${back} hari lalu)`, "POST", `${T}/invoices`, {
    contactId: cust.id,
    invoiceDate: daysAgo(back),
    dueDate: daysAgo(back - 14),
    taxRate,
    warehouseId: whUtama.id,
    lines: [
      { productId: l1.p.id, qty: l1.qty, unitPrice: l1.price, ...(i % 4 === 0 ? { discountPct: 10 } : {}) },
      { productId: l2.p.id, qty: l2.qty, unitPrice: l2.price },
    ],
  });
  invoices.push({ ...inv, back });
}
// Faktur jasa (tanpa stok) + faktur sambal (FEFO lot).
const invJasa = await step("faktur jasa racik + kirim", "POST", `${T}/invoices`, {
  contactId: custHotel.id, invoiceDate: daysAgo(8), dueDate: daysAgo(-6), taxRate: 11, warehouseId: whUtama.id,
  lines: [
    { productId: jasaKonsul.id, qty: 3, unitPrice: 150_000 },
    { productId: jasaKirim.id, qty: 2, unitPrice: 25_000 },
  ],
});
await step("faktur sambal (FEFO otomatis)", "POST", `${T}/invoices`, {
  contactId: custToko.id, invoiceDate: daysAgo(5), dueDate: daysAgo(-9), taxRate: 0, warehouseId: whUtama.id,
  lines: [{ productId: sambal.id, qty: 10, unitPrice: 35_000 }],
});

// --- 8. Pembayaran: sebagian lunas, sebagian parsial, sisakan yang telat ---------
for (let i = 0; i < 12; i++) {
  const inv = invoices[i];
  await step(`pelunasan faktur #${i + 1}`, "POST", `${T}/payments`, {
    refType: "invoice", refId: inv.invoiceId ?? inv.id, accountId: i % 2 === 0 ? kas.id : bank.id,
    amount: inv.total, paymentDate: daysAgo(Math.max(inv.back - 5, 0)),
  });
}
const partial = invoices[13];
await step("pembayaran parsial faktur #14", "POST", `${T}/payments`, {
  refType: "invoice", refId: partial.invoiceId ?? partial.id, accountId: bank.id,
  amount: Math.round(partial.total / 2), paymentDate: daysAgo(Math.max(partial.back - 4, 0)),
});
await step("pembayaran hutang kemasan", "POST", `${T}/payments`, {
  refType: "purchase", refId: purchKemasan.purchaseId ?? purchKemasan.id, accountId: bank.id,
  amount: purchKemasan.total, paymentDate: daysAgo(20),
});

// --- 9. Retur & void ------------------------------------------------------------
const invForReturn = invoices[16];
await step("retur penjualan 1 pcs", "POST", `${T}/returns`, {
  refType: "invoice", refId: invForReturn.invoiceId ?? invForReturn.id, warehouseId: whUtama.id,
  returnDate: daysAgo(Math.max(invForReturn.back - 2, 0)),
  lines: [{ productId: soldMix[16 % soldMix.length].p.id, qty: 1 }],
});
const invForVoid = invoices[18];
await step("void 1 faktur salah input", "POST", `${T}/invoices/${invForVoid.invoiceId ?? invForVoid.id}/void`);

// --- 10. POS: shift + penjualan tunai + tutup ------------------------------------
const shift = await step("buka shift kasir", "POST", `${T}/pos/shift/open`, { warehouseId: whUtama.id, openingCash: 500_000 });
let posCash = 0;
for (const [i, sale] of [
  { lines: [{ productId: keripik.id, qty: 3, unitPrice: 25_000 }, { productId: sirup.id, qty: 1, unitPrice: 40_000 }], cash: 150_000 },
  { lines: [{ productId: kopi.id, qty: 1, unitPrice: 85_000, discountPct: 5 }], cash: 100_000 },
  { lines: [{ productId: teh.id, qty: 2, unitPrice: 45_000 }], cash: 100_000 },
].entries()) {
  const s = await step(`penjualan POS #${i + 1}`, "POST", `${T}/pos/sales`, { shiftId: shift.id, taxRate: 0, cashReceived: sale.cash, lines: sale.lines });
  posCash += s.total ?? 0;
}
await step("tutup shift kasir", "POST", `${T}/pos/shift/${shift.id}/close`, { closingCash: 500_000 + posCash });

// --- 11. CRM: lead, aktivitas, konversi → penawaran → faktur ----------------------
const lead1 = await step("lead: Restoran Padang Sabana", "POST", `${T}/leads`, { name: "Restoran Padang Sabana", contactPerson: "Uda Rizal", phone: "0813-1111-2222", estValue: 12_000_000, source: "Referensi" });
await step("aktivitas lead: telepon", "POST", `${T}/leads/${lead1.id}/activities`, { type: "call", note: "Telepon perkenalan — tertarik paket sambal & keripik bulanan.", activityDate: daysAgo(9) });
await step("aktivitas lead: meeting", "POST", `${T}/leads/${lead1.id}/activities`, { type: "meeting", note: "Demo produk di lokasi, minta penawaran resmi.", activityDate: daysAgo(6) });
await step("lead naik tahap qualified", "PATCH", `${T}/leads/${lead1.id}`, { stage: "qualified" });
const conv = await step("konversi lead → pelanggan", "POST", `${T}/leads/${lead1.id}/convert`);
const quote = await step("penawaran untuk pelanggan baru", "POST", `${T}/quotations`, {
  contactId: conv.contactId, quoteDate: daysAgo(4), validUntil: daysAgo(-26), taxRate: 11,
  lines: [
    { productId: sambal.id, qty: 12, unitPrice: 33_000 },
    { productId: keripik.id, qty: 24, unitPrice: 23_000 },
  ],
});
await step("penawaran diterima", "PATCH", `${T}/quotations/${quote.id}/status`, { status: "accepted" });
await step("konversi penawaran → faktur", "POST", `${T}/quotations/${quote.id}/convert`, { warehouseId: whUtama.id, invoiceDate: daysAgo(2) });
await step("penawaran kedua (masih berlaku)", "POST", `${T}/quotations`, {
  contactId: conv.contactId, quoteDate: daysAgo(1), validUntil: daysAgo(-14), taxRate: 11,
  lines: [{ productId: sambal.id, qty: 30, unitPrice: 32_000 }],
});
await step("lead pipeline: Katering Berkah (baru)", "POST", `${T}/leads`, { name: "Katering Berkah Jaya", contactPerson: "Bu Nia", phone: "0812-8888-7777", estValue: 6_000_000, source: "Instagram" });
const lead3 = await step("lead pipeline: Minimarket Bina Warga", "POST", `${T}/leads`, { name: "Minimarket Bina Warga", contactPerson: "Pak Dedi", estValue: 9_000_000, source: "WhatsApp" });
await step("lead ketiga → contacted", "PATCH", `${T}/leads/${lead3.id}`, { stage: "contacted" });
await step("aktivitas lead: follow-up bertenggat", "POST", `${T}/leads/${lead3.id}/activities`, { type: "note", note: "Kirim daftar harga grosir — tunggu keputusan Pak Dedi.", activityDate: daysAgo(1), dueAt: daysAgo(-2) });

// --- 12. Anggaran bulan berjalan ---------------------------------------------------
await step("anggaran pendapatan bulan ini", "PUT", `${T}/budgets`, { accountId: penjualanAcc.id, period: thisMonth, amount: 30_000_000 });
await step("anggaran beban iklan bulan ini", "PUT", `${T}/budgets`, { accountId: bebanIklan.id, period: thisMonth, amount: 2_000_000 });

// --- 13. HR & payroll ---------------------------------------------------------------
const employees = {};
for (const e of [
  { name: "Rina Kusuma", position: "Manajer Operasional", ptkpStatus: "K/1", baseSalary: 9_500_000 },
  { name: "Agus Prabowo", position: "Staf Gudang", ptkpStatus: "TK/0", baseSalary: 5_200_000 },
  { name: "Sari Melati", position: "Kasir", ptkpStatus: "TK/0", baseSalary: 4_900_000 },
  { name: "Budi Santosa", position: "Kurir", ptkpStatus: "K/0", baseSalary: 4_800_000 },
]) {
  employees[e.name] = await step(`karyawan ${e.name}`, "POST", `${T}/employees`, e);
}
await step(`payroll periode ${lastMonth}`, "POST", `${T}/payroll-runs`, { period: lastMonth, cashAccountId: bank.id, paymentDate: daysAgo(3) });

// Kasbon (dicairkan dari bank; cicilan otomatis memotong gaji tiap run berikutnya).
await step("kasbon Agus Prabowo", "POST", `${T}/employee-loans`, {
  employeeId: employees["Agus Prabowo"].id, name: "Kasbon renovasi rumah",
  principal: 3_000_000, monthlyDeduction: 1_000_000, cashAccountId: bank.id, loanDate: daysAgo(2),
});
// Komponen ad-hoc bulan berjalan: bonus untuk manajer, akan ikut saat digaji.
await step("bonus kinerja Rina", "POST", `${T}/payroll-adjustments`, {
  period: thisMonth, employeeId: employees["Rina Kusuma"].id, name: "Bonus kinerja triwulan", amount: 2_500_000,
});
// Jalankan penggajian bulan berjalan → slip Rina memuat bonus, slip Agus memuat cicilan kasbon.
await step(`payroll periode ${thisMonth}`, "POST", `${T}/payroll-runs`, { period: thisMonth, cashAccountId: bank.id, paymentDate: daysAgo(0) });
// Cuti & izin: pengajuan lalu disetujui (memotong saldo cuti Sari).
const cutiSari = await step("pengajuan cuti tahunan Sari", "POST", `${T}/leave-requests`, {
  employeeId: employees["Sari Melati"].id, type: "annual", startDate: daysAgo(-7), endDate: daysAgo(-9), note: "Acara keluarga",
});
await step("setujui cuti Sari", "PATCH", `${T}/leave-requests/${cutiSari.id}`, { status: "approved" });
await step("pengajuan izin Budi (menunggu)", "POST", `${T}/leave-requests`, {
  employeeId: employees["Budi Santosa"].id, type: "permit", startDate: daysAgo(-3), endDate: daysAgo(-3), note: "Urusan keluarga",
});

// Absensi/kehadiran bulan berjalan: beberapa hari untuk beragam status (rekap kaya).
const attDays = [`${thisMonth}-02`, `${thisMonth}-03`, `${thisMonth}-04`, `${thisMonth}-05`];
const attPlan = [
  ["Rina Kusuma", ["hadir", "hadir", "hadir", "hadir"]],
  ["Agus Prabowo", ["hadir", "sakit", "hadir", "hadir"]],
  ["Sari Melati", ["hadir", "hadir", "izin", "hadir"]],
  ["Budi Santosa", ["hadir", "alfa", "hadir", "hadir"]],
];
for (const [name, statuses] of attPlan) {
  for (let i = 0; i < attDays.length; i++) {
    const status = statuses[i];
    await step(`absensi ${name} ${attDays[i]}`, "POST", `${T}/attendance`, {
      employeeId: employees[name].id,
      date: attDays[i],
      status,
      ...(status === "hadir" ? { clockIn: "08:00", clockOut: "17:00" } : {}),
    });
  }
}

// --- 13b. Pengadaan (procure-to-pay): PR → PO → penerimaan → faktur ------------------
const req1 = await step("permintaan pembelian bahan baku", "POST", `${T}/requisitions`, {
  note: "Restok kopi & keripik untuk hampers",
  lines: [
    { productId: kopi.id, qty: 20, note: "stok menipis" },
    { productId: keripik.id, qty: 30 },
  ],
});
await step("setujui permintaan pembelian", "PATCH", `${T}/requisitions/${req1.id}`, { status: "approved" });
const po1 = await step("pesanan pembelian ke CV Petani Kopi", "POST", `${T}/purchase-orders`, {
  requisitionId: req1.id, contactId: suppKopi.id, orderDate: daysAgo(9), expectedDate: daysAgo(-2),
  warehouseId: whUtama.id, taxRate: 11,
  lines: [
    { productId: kopi.id, qty: 20, unitPrice: 55_000 },
    { productId: keripik.id, qty: 30, unitPrice: 14_000 },
  ],
});
const poDetail = await step("ambil pesanan untuk penerimaan", "GET", `${T}/purchase-orders`);
const po1Full = poDetail.orders.find((o) => o.id === po1.id);
await step("terima barang PO (faktur + stok masuk)", "POST", `${T}/purchase-orders/${po1.id}/receive`, {
  receiptDate: daysAgo(7),
  lines: po1Full.lines.map((l) => ({ poLineId: l.id, qtyReceived: l.qty })),
});
// Permintaan menunggu keputusan (untuk demo antrean).
await step("permintaan pembelian kemasan (menunggu)", "POST", `${T}/requisitions`, {
  note: "Kotak & pita untuk batch berikutnya",
  lines: [{ productId: kotak.id, qty: 50 }, { productId: pita.id, qty: 20 }],
});

// --- 13c. Approval workflow engine: aturan berjenjang + alur multi-langkah -----------
await step("aturan approval: pembelian besar (Admin→Pemilik)", "POST", `${T}/approval-rules`, {
  name: "Pembelian besar", docType: "pembelian", minAmount: 5_000_000, approverRoles: ["admin", "owner"],
});
await step("aturan approval: pengeluaran ≥ 1jt (Pemilik)", "POST", `${T}/approval-rules`, {
  name: "Pengeluaran kas", docType: "pengeluaran", minAmount: 1_000_000, approverRoles: ["owner"],
});
// Alur menunggu (di atas ambang → butuh persetujuan berjenjang).
await step("ajukan alur: beli laptop tim (8jt)", "POST", `${T}/approval-flows`, {
  docType: "pembelian", title: "Pembelian 4 laptop tim operasional", amount: 8_000_000,
});
// Alur pengeluaran lalu disetujui Pemilik → selesai.
const flowExp = await step("ajukan alur: sewa gudang (2jt)", "POST", `${T}/approval-flows`, {
  docType: "pengeluaran", title: "Sewa gudang tambahan bulan ini", amount: 2_000_000,
});
await step("Pemilik setujui pengeluaran", "POST", `${T}/approval-flows/${flowExp.id}/steps/decide`, { decision: "approve" });
// Alur kecil di bawah ambang → otomatis disetujui (tanpa aturan).
await step("ajukan alur: ATK kantor (300rb, auto)", "POST", `${T}/approval-flows`, {
  docType: "pengeluaran", title: "Beli ATK kantor", amount: 300_000,
});

// --- 14. Aset tetap + penyusutan ----------------------------------------------------
await step("aset: mobil boks", "POST", `${T}/assets`, {
  name: "Mobil Boks Operasional", category: "Kendaraan", acquisitionDate: daysAgo(58),
  acquisitionCost: 96_000_000, usefulLifeMonths: 48, residualValue: 0, cashAccountId: bank.id,
});
const genset = await step("aset: genset gudang", "POST", `${T}/assets`, {
  name: "Genset Gudang 5kVA", category: "Peralatan", acquisitionDate: daysAgo(58),
  acquisitionCost: 18_000_000, usefulLifeMonths: 36, residualValue: 0, cashAccountId: kas.id,
});
await step(`penyusutan periode ${lastMonth}`, "POST", `${T}/assets/depreciation`, { period: lastMonth, date: daysAgo(3) });

// --- 15. Proyek -----------------------------------------------------------------------
const proj = await step("proyek: Hampers Korporat Q3", "POST", `${T}/projects`, { code: "PRJ-HAMPERS", name: "Hampers Korporat Q3", budget: 15_000_000 });
await step("jurnal termin proyek", "POST", `${T}/journal-entries`, {
  entryDate: daysAgo(10), memo: "Termin 1 proyek hampers korporat", projectId: proj.id,
  lines: [
    { accountId: bank.id, debit: 7_500_000, credit: 0 },
    { accountId: penjualanAcc.id, debit: 0, credit: 7_500_000 },
  ],
});
await step("tugas proyek: desain kartu ucapan", "POST", `${T}/projects/${proj.id}/tasks`, { name: "Desain kartu ucapan korporat", assigneeId: employees["Rina Kusuma"].id, priority: "high", dueDate: daysAgo(-2) });
const task2 = await step("tugas proyek: nego vendor kotak", "POST", `${T}/projects/${proj.id}/tasks`, { name: "Negosiasi vendor kotak premium", assigneeId: employees["Agus Prabowo"].id, priority: "medium" });
await step("tugas kedua selesai", "PATCH", `${T}/projects/${proj.id}/tasks/${task2.id}`, { status: "done" });
await step("proyek kedua: Booth Pameran UMKM", "POST", `${T}/projects`, { code: "PRJ-EXPO", name: "Booth Pameran UMKM Jabar", budget: 5_000_000 });

// Proyek jasa dengan pelanggan: termin penagihan, RAB, papan tugas, timesheet (Fase 5g).
const projSvc = await step("proyek jasa: Desain Interior Kafe", "POST", `${T}/projects`, { code: "PRJ-INTERIOR", name: "Desain Interior Kafe Koperasi", contactId: custKoperasi.id, budget: 20_000_000, startDate: daysAgo(20), endDate: daysAgo(-25) });
await step("RAB material", "POST", `${T}/projects/${projSvc.id}/budgets`, { category: "Material & furnitur", plannedAmount: 12_000_000 });
await step("RAB tenaga kerja", "POST", `${T}/projects/${projSvc.id}/budgets`, { category: "Tenaga kerja", plannedAmount: 6_000_000 });
const termin1 = await step("termin uang muka 40%", "POST", `${T}/projects/${projSvc.id}/milestones`, { name: "Uang muka 40%", amount: 8_000_000 });
await step("faktur dari termin uang muka", "POST", `${T}/projects/${projSvc.id}/milestones/${termin1.id}/invoice`, { invoiceDate: daysAgo(8), taxRate: 0, warehouseId: whUtama.id });
await step("termin pelunasan 60%", "POST", `${T}/projects/${projSvc.id}/milestones`, { name: "Pelunasan 60%", amount: 12_000_000 });
await step("tugas: survei lokasi", "POST", `${T}/projects/${projSvc.id}/tasks`, { name: "Survei lokasi & ukur ruang", assigneeId: employees["Agus Prabowo"].id, priority: "medium", dueDate: daysAgo(-1) });
const projTask2 = await step("tugas: gambar kerja 3D", "POST", `${T}/projects/${projSvc.id}/tasks`, { name: "Buat gambar kerja 3D", assigneeId: employees["Rina Kusuma"].id, priority: "high", dueDate: daysAgo(-5) });
await step("tugas 3D proses", "PATCH", `${T}/projects/${projSvc.id}/tasks/${projTask2.id}`, { status: "in_progress" });
const projTask3 = await step("tugas: presentasi konsep", "POST", `${T}/projects/${projSvc.id}/tasks`, { name: "Presentasi konsep ke klien", assigneeId: employees["Rina Kusuma"].id, priority: "high" });
await step("tugas presentasi selesai", "PATCH", `${T}/projects/${projSvc.id}/tasks/${projTask3.id}`, { status: "done" });
await step("timesheet Rina", "POST", `${T}/projects/${projSvc.id}/time-entries`, { employeeId: employees["Rina Kusuma"].id, entryDate: daysAgo(6), hours: 8, hourlyRate: 75_000, note: "Survei & konsep desain" });
await step("timesheet Agus", "POST", `${T}/projects/${projSvc.id}/time-entries`, { employeeId: employees["Agus Prabowo"].id, entryDate: daysAgo(4), hours: 6, hourlyRate: 50_000, note: "Bantu ukur ruang" });

// --- 16. Multi mata uang + faktur valas -------------------------------------------------
await step("kurs USD 16.200", "PUT", `${T}/currencies`, { code: "USD", name: "Dolar AS", rate: 16_200 });
await step("faktur ekspor USD", "POST", `${T}/invoices`, {
  contactId: custHotel.id, invoiceDate: daysAgo(7), dueDate: daysAgo(-23), taxRate: 0,
  warehouseId: whUtama.id, currency: "USD", exchangeRate: 16_200,
  lines: [{ productId: kopi.id, qty: 20, unitPrice: 7 }],
});

// --- 17. Kontrak berulang ----------------------------------------------------------------
await step("kontrak langganan kafe", "POST", `${T}/contracts`, {
  code: "LGN-KAFE", contactId: custKafe.id, name: "Langganan Kopi & Teh Bulanan", frequency: "monthly",
  taxRate: 11, warehouseId: whUtama.id, startDate: daysAgo(25),
  lines: [
    { productId: kopi.id, qty: 5, unitPrice: 82_000 },
    { productId: teh.id, qty: 5, unitPrice: 43_000 },
  ],
});
await step("terbitkan tagihan kontrak jatuh tempo", "POST", `${T}/contracts/run-billing`, { date: daysAgo(0) });

// --- 18. Manufaktur: BoM → produksi → QC --------------------------------------------------
await step("BoM Paket Hampers", "PUT", `${T}/boms`, {
  productId: hampers.id, outputQty: 1,
  lines: [
    { componentId: kotak.id, qty: 1 },
    { componentId: pita.id, qty: 2 },
    { componentId: kopi.id, qty: 1 },
    { componentId: teh.id, qty: 1 },
    { componentId: madu.id, qty: 1 },
  ],
});
const prodOrder = await step("perintah produksi 6 hampers", "POST", `${T}/production-orders`, { productId: hampers.id, warehouseId: whUtama.id, qty: 6 });
await step("produksi selesai", "POST", `${T}/production-orders/${prodOrder.id}/complete`);
await step("QC lulus", "POST", `${T}/production-orders/${prodOrder.id}/qc`, { result: "passed" });
await step("jual 3 hampers hasil produksi", "POST", `${T}/invoices`, {
  contactId: custKoperasi.id, invoiceDate: daysAgo(1), taxRate: 11, warehouseId: whUtama.id,
  lines: [{ productId: hampers.id, qty: 3, unitPrice: 250_000 }],
});

// --- 19. Maintenance ------------------------------------------------------------------------
await step("jadwal servis genset bulanan", "POST", `${T}/maintenance/schedules`, {
  assetId: genset.id, name: "Servis rutin genset", intervalMonths: 1, startDate: daysAgo(20),
});
await step("terbitkan work order jatuh tempo", "POST", `${T}/maintenance/run`, { date: daysAgo(20) });
const woList = await step("baca work order", "GET", `${T}/maintenance/work-orders`);
const woOpen = (woList.workOrders ?? []).find((w) => w.status === "open");
if (woOpen) {
  await step("selesaikan work order + biaya", "POST", `${T}/maintenance/work-orders/${woOpen.id}/complete`, {
    completedDate: daysAgo(18), cost: 350_000, cashAccountId: kas.id, notes: "Ganti oli, filter udara, cek beban.",
  });
}
await step("work order ad-hoc terbuka", "POST", `${T}/maintenance/work-orders`, {
  assetId: genset.id, title: "Cek suara kasar saat start", scheduledDate: daysAgo(-3),
});

// --- 20. Helpdesk ------------------------------------------------------------------------------
const tkt1 = await step("tiket prioritas tinggi", "POST", `${T}/tickets`, {
  contactId: custToko.id, subject: "Kiriman kurang 2 karton keripik", description: "PO minggu lalu diterima kurang 2 karton.", priority: "high",
});
await step("balasan tiket", "POST", `${T}/tickets/${tkt1.id}/replies`, { body: "Terima kasih infonya — kami cek surat jalan dan kirim kekurangannya besok.", internal: false });
await step("catatan internal tiket", "POST", `${T}/tickets/${tkt1.id}/replies`, { body: "Stok gudang cabang aman, kirim dari sana.", internal: true });
const meUser = await api("GET", "/api/auth/me");
await step("tugaskan tiket ke pemilik", "PATCH", `${T}/tickets/${tkt1.id}`, { assignedTo: meUser.json.user.id });
const tkt2 = await step("tiket pertanyaan harga", "POST", `${T}/tickets`, {
  contactId: custKafe.id, subject: "Minta pricelist grosir terbaru", priority: "medium",
});
await step("tiket kedua selesai", "PATCH", `${T}/tickets/${tkt2.id}`, { status: "resolved" });
await step("tiket saran produk", "POST", `${T}/tickets`, {
  contactId: custKoperasi.id, subject: "Usul varian sambal level pedas", priority: "low",
});

// --- 21. Opname & transfer gudang -----------------------------------------------------------------
const stockNow = await api("GET", `${T}/stock`);
const keripikLevel = stockNow.json.levels.find((l) => l.sku === "KRPK-200" && l.warehouseId === whUtama.id);
if (keripikLevel && keripikLevel.qty > 2) {
  await step("opname keripik (susut 2)", "POST", `${T}/stock-adjustments`, {
    productId: keripik.id, warehouseId: whUtama.id, physicalQty: keripikLevel.qty - 2, note: "Opname bulanan: 2 bungkus rusak",
  });
}
await step("transfer teh ke gudang cabang", "POST", `${T}/stock-transfers`, {
  productId: teh.id, fromWarehouseId: whUtama.id, toWarehouseId: whCabang.id, qty: 10,
});

// --- 22. Persetujuan pembelian: ambang + pengajuan pending dari staf admin -------------------------
await step("ambang persetujuan 5 juta", "POST", `${T}/approval-threshold`, { amount: 5_000_000 });
const staffEmail = `staf.demo.${Date.now()}@example.com`;
// Password staf acak & tidak dicetak — akun ini hanya perlu ada sebagai
// pengaju approval; operator menonaktifkannya setelah seeding produksi.
const staffPass = randomBytes(24).toString("base64url");
const staff = makeClient();
const staffReg = await staff("POST", "/api/auth/register", {
  companyName: "Workspace Staf Demo", name: "Staf Demo", email: staffEmail, password: staffPass,
});
if (staffReg.status === 201) {
  const invite = await api("POST", `${T}/invites`, { email: staffEmail, role: "admin" });
  const token = (invite.json?.inviteUrl ?? "").split("token=")[1];
  if (token) {
    await staff("POST", "/api/invites/accept", { token });
    const pending = await staff("POST", `${T}/purchases`, {
      contactId: suppKopi.id, invoiceDate: daysAgo(1), taxRate: 11, warehouseId: whUtama.id,
      lines: [{ productId: kopi.id, qty: 120, unitPrice: 55_000 }],
    });
    if (pending.status === 201 || pending.status === 202) {
      steps++;
      console.log("  ✓ pengajuan pembelian besar menunggu persetujuan owner");
    } else {
      console.log(`  ! pengajuan approval dilewati (HTTP ${pending.status})`);
    }
  }
} else {
  console.log(`  ! seed approval dilewati — registrasi staf gagal (HTTP ${staffReg.status})`);
}

// --- 23. Jurnal operasional lain-lain ---------------------------------------------------------------
await step("jurnal beban listrik", "POST", `${T}/journal-entries`, {
  entryDate: daysAgo(6), memo: "Bayar listrik & air gudang",
  lines: [
    { accountId: bebanListrik.id, debit: 750_000, credit: 0 },
    { accountId: kas.id, debit: 0, credit: 750_000 },
  ],
});
await step("jurnal beban iklan digital", "POST", `${T}/journal-entries`, {
  entryDate: daysAgo(4), memo: "Iklan Instagram & marketplace",
  lines: [
    { accountId: bebanIklan.id, debit: 1_200_000, credit: 0 },
    { accountId: kas.id, debit: 0, credit: 1_200_000 },
  ],
});

// --- Keuangan lanjut (Fase 5d): template jurnal + rekonsiliasi bank ----------------------------------
await step("template jurnal berulang: sewa ruko bulanan", "POST", `${T}/journal-templates`, {
  name: "Sewa ruko bulanan",
  memo: "Sewa ruko Jl. Merdeka",
  lines: [
    { accountId: acc("5-3000").id, debit: 3_500_000, credit: 0 },
    { accountId: bank.id, debit: 0, credit: 3_500_000 },
  ],
  schedule: "monthly",
  nextRunDate: daysAgo(-20), // terbit otomatis ±20 hari lagi
});
await step("jurnal bayar internet kantor (untuk rekonsiliasi)", "POST", `${T}/journal-entries`, {
  entryDate: daysAgo(2), memo: "Internet kantor",
  lines: [
    { accountId: acc("5-4000").id, debit: 350_000, credit: 0 },
    { accountId: bank.id, debit: 0, credit: 350_000 },
  ],
});
await step("impor mutasi rekening koran (1 cocok otomatis, 2 belum)", "POST", `${T}/bank-recon/import`, {
  accountId: bank.id,
  items: [
    { date: daysAgo(2), description: "PEMBAYARAN INTERNET OFFICE", amount: -350_000 },
    { date: daysAgo(1), description: "BIAYA ADM", amount: -6_500 },
    { date: daysAgo(0), description: "SETORAN TUNAI CABANG", amount: 2_000_000 },
  ],
});

// --- Ringkasan akhir ---------------------------------------------------------------------------------
const dash = await api("GET", `${T}/reports/dashboard`);
const tb = await api("GET", `${T}/trial-balance`);
console.log(`\nSelesai: ${steps} langkah seed berhasil.`);
console.log(`Perusahaan: ${COMPANY} (slug ${company.slug})`);
console.log(`Neraca saldo seimbang: ${tb.json?.balanced === true ? "YA ✅" : "PERIKSA ❌"}`);
if (dash.status === 200) console.log("Dashboard terisi — siap direview.");
process.exit(tb.json?.balanced === true ? 0 : 1);
