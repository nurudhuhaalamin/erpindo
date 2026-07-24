import { describe, expect, it } from "vitest";
import { postJournal } from "../src/lib/accounting";
import {
  computeBalanceSheet,
  computeIncomeStatement,
  monthStart,
  profitLoss,
} from "../src/lib/reports";
import { newTenantDb } from "./helpers/memdb";

/**
 * Fase 14h — uji mesin laporan keuangan (`lib/reports.ts`) terhadap SQLite
 * in-memory beskema produksi. Menjaga janji inti aplikasi: **Neraca selalu
 * seimbang** dan laba/rugi berjalan masuk ke ekuitas. Menguji Laba Rugi
 * (rentang tanggal, void dikecualikan), Neraca (keseimbangan, laba berjalan,
 * saldo nol disaring, kutoff `asOf`), `profitLoss` (batas `to` eksklusif), dan
 * `monthStart`.
 */

const KAS = "acc-1-1000"; // asset
const MODAL = "acc-3-1000"; // equity
const PENDAPATAN = "acc-4-1000"; // income
const BEBAN_SEWA = "acc-5-3000"; // expense

/** Post satu jurnal dua-baris (debit → kredit) pada tanggal tertentu. */
async function post(
  db: Awaited<ReturnType<typeof newTenantDb>>,
  date: string,
  debitAcc: string,
  creditAcc: string,
  amount: number,
) {
  return postJournal(db, {
    entryDate: date,
    createdBy: "u1",
    lines: [
      { accountId: debitAcc, debit: amount, credit: 0 },
      { accountId: creditAcc, debit: 0, credit: amount },
    ],
  });
}

describe("computeIncomeStatement", () => {
  it("menjumlahkan pendapatan & beban serta laba bersih", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-05", KAS, PENDAPATAN, 10_000_000); // penjualan tunai
    await post(db, "2026-07-10", BEBAN_SEWA, KAS, 3_000_000); // bayar sewa
    const is = await computeIncomeStatement(db, "2026-07-01", "2026-07-31");
    expect(is.totalIncome).toBe(10_000_000);
    expect(is.totalExpense).toBe(3_000_000);
    expect(is.netProfit).toBe(7_000_000);
    expect(is.income.find((r) => r.code === "4-1000")?.amount).toBe(10_000_000);
    expect(is.expense.find((r) => r.code === "5-3000")?.amount).toBe(3_000_000);
  });

  it("hanya memuat entri dalam rentang [from, to]", async () => {
    const db = await newTenantDb();
    await post(db, "2026-06-30", KAS, PENDAPATAN, 5_000_000); // di luar (Juni)
    await post(db, "2026-07-15", KAS, PENDAPATAN, 8_000_000); // di dalam
    const is = await computeIncomeStatement(db, "2026-07-01", "2026-07-31");
    expect(is.totalIncome).toBe(8_000_000);
  });

  it("mengabaikan jurnal berstatus void", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-05", KAS, PENDAPATAN, 10_000_000);
    const dibatalkan = await post(db, "2026-07-06", KAS, PENDAPATAN, 4_000_000);
    await db.prepare(`UPDATE journal_entries SET status = 'void' WHERE id = ?`).bind(dibatalkan.id).run();
    const is = await computeIncomeStatement(db, "2026-07-01", "2026-07-31");
    expect(is.totalIncome).toBe(10_000_000); // yang void tak terhitung
  });
});

describe("computeBalanceSheet", () => {
  it("selalu seimbang; laba berjalan masuk ekuitas", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-01", KAS, MODAL, 100_000_000); // setoran modal
    await post(db, "2026-07-05", KAS, PENDAPATAN, 10_000_000); // penjualan tunai
    await post(db, "2026-07-10", BEBAN_SEWA, KAS, 3_000_000); // beban
    const bs = await computeBalanceSheet(db, "2026-07-31");

    expect(bs.balanced).toBe(true);
    expect(bs.totalAssets).toBe(bs.totalLiabilities + bs.totalEquity);
    // Kas = 100jt + 10jt − 3jt = 107jt.
    expect(bs.assets.find((r) => r.code === "1-1000")?.amount).toBe(107_000_000);
    expect(bs.totalAssets).toBe(107_000_000);
    // Ekuitas = Modal 100jt + laba berjalan 7jt.
    const laba = bs.equity.find((r) => r.accountId === "laba-berjalan");
    expect(laba?.amount).toBe(7_000_000);
    expect(bs.totalEquity).toBe(107_000_000);
    expect(bs.totalLiabilities).toBe(0);
  });

  it("menyaring akun bersaldo nol", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-01", KAS, MODAL, 50_000_000);
    const bs = await computeBalanceSheet(db, "2026-07-31");
    // Bank tak pernah disentuh → tak muncul di daftar aset.
    expect(bs.assets.some((r) => r.code === "1-1100")).toBe(false);
    expect(bs.assets.some((r) => r.code === "1-1000")).toBe(true);
    // Tanpa laba berjalan → tak ada baris laba berjalan.
    expect(bs.equity.some((r) => r.accountId === "laba-berjalan")).toBe(false);
  });

  it("menghormati kutoff asOf (entri setelah tanggal dikecualikan)", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-01", KAS, MODAL, 100_000_000);
    await post(db, "2026-08-01", KAS, PENDAPATAN, 20_000_000); // setelah asOf
    const bs = await computeBalanceSheet(db, "2026-07-31");
    expect(bs.assets.find((r) => r.code === "1-1000")?.amount).toBe(100_000_000);
    expect(bs.equity.some((r) => r.accountId === "laba-berjalan")).toBe(false);
    expect(bs.balanced).toBe(true);
  });

  it("rugi berjalan (negatif) tetap seimbang", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-01", KAS, MODAL, 100_000_000);
    await post(db, "2026-07-10", BEBAN_SEWA, KAS, 5_000_000); // rugi (tanpa pendapatan)
    const bs = await computeBalanceSheet(db, "2026-07-31");
    expect(bs.equity.find((r) => r.accountId === "laba-berjalan")?.amount).toBe(-5_000_000);
    expect(bs.totalAssets).toBe(95_000_000);
    expect(bs.balanced).toBe(true);
  });
});

describe("profitLoss", () => {
  it("batas `to` bersifat eksklusif (beda dari Laba Rugi yang inklusif)", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-31", KAS, PENDAPATAN, 9_000_000); // tepat di batas
    // to = '2026-07-31' → entri 31 Juli DIKECUALIKAN (< to).
    const excl = await profitLoss(db, "2026-07-01", "2026-07-31");
    expect(excl.income).toBe(0);
    expect(excl.profit).toBe(0);
    // to = '2026-08-01' → entri 31 Juli TERMASUK.
    const incl = await profitLoss(db, "2026-07-01", "2026-08-01");
    expect(incl.income).toBe(9_000_000);
    expect(incl.profit).toBe(9_000_000);
    // Bandingkan: Laba Rugi inklusif memuat entri tanggal `to`.
    const is = await computeIncomeStatement(db, "2026-07-01", "2026-07-31");
    expect(is.totalIncome).toBe(9_000_000);
  });

  it("menghitung laba = pendapatan − beban", async () => {
    const db = await newTenantDb();
    await post(db, "2026-07-05", KAS, PENDAPATAN, 12_000_000);
    await post(db, "2026-07-06", BEBAN_SEWA, KAS, 4_000_000);
    const pl = await profitLoss(db, "2026-07-01", "2026-08-01");
    expect(pl).toEqual({ income: 12_000_000, expense: 4_000_000, profit: 8_000_000 });
  });
});

describe("monthStart", () => {
  it("mengembalikan tanggal 1 berformat YYYY-MM-01 & berurutan kronologis", () => {
    const prev = monthStart(-1);
    const cur = monthStart(0);
    const next = monthStart(1);
    for (const d of [prev, cur, next]) expect(d).toMatch(/^\d{4}-\d{2}-01$/);
    expect(prev < cur).toBe(true);
    expect(cur < next).toBe(true);
  });

  it("offset melintasi batas tahun dengan benar (UTC)", () => {
    const cur = monthStart(0);
    const plus12 = monthStart(12);
    expect(plus12.slice(5, 7)).toBe(cur.slice(5, 7)); // bulan sama
    expect(Number(plus12.slice(0, 4))).toBe(Number(cur.slice(0, 4)) + 1); // tahun +1
  });
});
