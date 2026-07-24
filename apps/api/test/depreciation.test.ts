import { describe, expect, it } from "vitest";
import { runDepreciation } from "../src/routes/assets";
import { assetAccumulated, journalTotals, newTenantDb, seedAsset } from "./helpers/memdb";

/**
 * Fase 14g — uji mesin penyusutan garis lurus (`runDepreciation` di
 * routes/assets.ts) terhadap SQLite in-memory beskema produksi. Sebelumnya 0
 * coverage unit padahal Cron bulanan & endpoint manual memposting jurnal beban
 * penyusutan lewatnya. Menguji: besaran garis lurus, keseimbangan jurnal,
 * idempotensi per periode, batas bulan terakhir (tak menyusut melebihi
 * nilai tersusutkan), penolakan periode terkunci, dan agregasi banyak aset.
 */

const AKUM = "acc-1-1510"; // Akumulasi Penyusutan
const BEBAN = "acc-5-5000"; // Beban Penyusutan

/** Ambil satu jurnal penyusutan (asumsi hanya ada satu). */
async function onlyJournal(db: Awaited<ReturnType<typeof newTenantDb>>) {
  return db
    .prepare(`SELECT id, entry_no FROM journal_entries`)
    .first<{ id: string; entry_no: string }>();
}

describe("runDepreciation — garis lurus", () => {
  it("menghitung (cost−residu)/masa & memposting jurnal seimbang", async () => {
    const db = await newTenantDb();
    await seedAsset(db, { cost: 12_000_000, lifeMonths: 12 }); // 1.000.000/bln
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 1, total: 1_000_000 });

    const j = await onlyJournal(db);
    expect(j?.entry_no).toBe("JRN-00001");
    const totals = await journalTotals(db, j!.id);
    expect(totals).toEqual({ debit: 1_000_000, credit: 1_000_000 });

    // Debit ke Beban Penyusutan, kredit ke Akumulasi.
    const beban = await db
      .prepare(`SELECT debit, credit FROM journal_lines WHERE entry_id = ? AND account_id = ?`)
      .bind(j!.id, BEBAN)
      .first<{ debit: number; credit: number }>();
    expect(beban).toEqual({ debit: 1_000_000, credit: 0 });
    const akum = await db
      .prepare(`SELECT debit, credit FROM journal_lines WHERE entry_id = ? AND account_id = ?`)
      .bind(j!.id, AKUM)
      .first<{ debit: number; credit: number }>();
    expect(akum).toEqual({ debit: 0, credit: 1_000_000 });
  });

  it("memperhitungkan nilai residu pada besaran bulanan", async () => {
    const db = await newTenantDb();
    await seedAsset(db, { cost: 10_000_000, residual: 1_000_000, lifeMonths: 9 }); // (10jt−1jt)/9 = 1jt
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 1, total: 1_000_000 });
  });

  it("menambah akumulasi & mencatat satu entri per periode", async () => {
    const db = await newTenantDb();
    const id = await seedAsset(db, { cost: 12_000_000, lifeMonths: 12 });
    await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(await assetAccumulated(db, id)).toBe(1_000_000);
    const entries = await db
      .prepare(`SELECT COUNT(*) AS n FROM depreciation_entries WHERE asset_id = ?`)
      .bind(id)
      .first<{ n: number }>();
    expect(entries?.n).toBe(1);
  });
});

describe("runDepreciation — idempotensi & batas", () => {
  it("idempotent: menjalankan ulang periode yang sama tak menyusut lagi", async () => {
    const db = await newTenantDb();
    const id = await seedAsset(db, { cost: 12_000_000, lifeMonths: 12 });
    await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    const res2 = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res2).toEqual({ count: 0, total: 0 });
    expect(await assetAccumulated(db, id)).toBe(1_000_000); // tetap
    const jn = await db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).first<{ n: number }>();
    expect(jn?.n).toBe(1); // tak ada jurnal kedua
  });

  it("bulan terakhir dibatasi sisa — tak menyusut melebihi (cost−residu)", async () => {
    const db = await newTenantDb();
    // Garis lurus 3.333.333/bln, tapi sisa hanya 1.000.000.
    const id = await seedAsset(db, {
      cost: 10_000_000,
      residual: 0,
      lifeMonths: 3,
      accumulated: 9_000_000,
    });
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 1, total: 1_000_000 });
    expect(await assetAccumulated(db, id)).toBe(10_000_000); // pas nilai tersusutkan, tak lebih
  });

  it("aset sudah tersusut penuh dilewati", async () => {
    const db = await newTenantDb();
    await seedAsset(db, { cost: 8_000_000, residual: 0, lifeMonths: 4, accumulated: 8_000_000 });
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 0, total: 0 });
  });

  it("aset yang sudah dilepas (disposed) tidak disusutkan", async () => {
    const db = await newTenantDb();
    await seedAsset(db, { cost: 12_000_000, lifeMonths: 12, status: "disposed" });
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 0, total: 0 });
  });

  it("menolak periode yang sudah ditutup tanpa memposting apa pun", async () => {
    const db = await newTenantDb();
    await db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('locked_before', '2026-06-30', datetime('now'))`)
      .run();
    const id = await seedAsset(db, { cost: 12_000_000, lifeMonths: 12 });
    const res = await runDepreciation(db, "2026-06", "2026-06-30", "u1");
    expect(res).toEqual({ error: expect.stringContaining("sudah ditutup") });
    expect(await assetAccumulated(db, id)).toBe(0);
    const jn = await db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).first<{ n: number }>();
    expect(jn?.n).toBe(0);
  });
});

describe("runDepreciation — banyak aset", () => {
  it("menggabungkan beberapa aset ke satu jurnal dengan total dijumlahkan", async () => {
    const db = await newTenantDb();
    await seedAsset(db, { cost: 12_000_000, lifeMonths: 12 }); // 1.000.000
    await seedAsset(db, { cost: 24_000_000, lifeMonths: 24 }); // 1.000.000
    await seedAsset(db, { cost: 6_000_000, residual: 0, lifeMonths: 6 }); // 1.000.000
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 3, total: 3_000_000 });

    // Satu jurnal gabungan, seimbang.
    const jn = await db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).first<{ n: number }>();
    expect(jn?.n).toBe(1);
    const j = await onlyJournal(db);
    expect(await journalTotals(db, j!.id)).toEqual({ debit: 3_000_000, credit: 3_000_000 });

    // Tiga entri penyusutan, semuanya menunjuk jurnal yang sama.
    const entries = await db
      .prepare(`SELECT COUNT(*) AS n FROM depreciation_entries WHERE period = '2026-07' AND journal_entry_id = ?`)
      .bind(j!.id)
      .first<{ n: number }>();
    expect(entries?.n).toBe(3);
  });

  it("tanpa aset aktif: count 0, total 0, tanpa jurnal", async () => {
    const db = await newTenantDb();
    const res = await runDepreciation(db, "2026-07", "2026-07-31", "u1");
    expect(res).toEqual({ count: 0, total: 0 });
    const jn = await db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).first<{ n: number }>();
    expect(jn?.n).toBe(0);
  });
});
