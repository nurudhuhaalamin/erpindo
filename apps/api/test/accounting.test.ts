import { describe, expect, it } from "vitest";
import { nextDocNo, PeriodLockedError, postJournal } from "../src/lib/accounting";
import { newTenantDb } from "./helpers/memdb";

/**
 * Fase 14a — uji mesin akuntansi inti (`lib/accounting.ts`) terhadap SQLite
 * in-memory beskema produksi. Sebelumnya 0 coverage padahal SEMUA jurnal lewat
 * `postJournal` dan setiap dokumen bernomor lewat `nextDocNo`.
 */

const ACC_KAS = "acc-1-1000";
const ACC_BANK = "acc-1-1100";

describe("postJournal (double-entry)", () => {
  it("memposting jurnal seimbang + menomori JRN berurutan", async () => {
    const db = await newTenantDb();
    const j1 = await postJournal(db, {
      entryDate: "2026-07-01",
      memo: "setoran",
      createdBy: "u1",
      lines: [
        { accountId: ACC_KAS, debit: 100_000, credit: 0 },
        { accountId: ACC_BANK, debit: 0, credit: 100_000 },
      ],
    });
    expect(j1.entryNo).toBe("JRN-00001");
    const j2 = await postJournal(db, {
      entryDate: "2026-07-02",
      memo: "lagi",
      createdBy: "u1",
      lines: [
        { accountId: ACC_BANK, debit: 50_000, credit: 0 },
        { accountId: ACC_KAS, debit: 0, credit: 50_000 },
      ],
    });
    expect(j2.entryNo).toBe("JRN-00002");
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM journal_lines`).first<{ n: number }>();
    expect(row?.n).toBe(4);
  });

  it("menolak jurnal tak seimbang (debit ≠ kredit)", async () => {
    const db = await newTenantDb();
    await expect(
      postJournal(db, {
        entryDate: "2026-07-01",
        createdBy: "u1",
        lines: [
          { accountId: ACC_KAS, debit: 100_000, credit: 0 },
          { accountId: ACC_BANK, debit: 0, credit: 90_000 },
        ],
      }),
    ).rejects.toThrow(/tidak seimbang/);
    // Tidak ada jurnal tersisa.
    const row = await db.prepare(`SELECT COUNT(*) AS n FROM journal_entries`).first<{ n: number }>();
    expect(row?.n).toBe(0);
  });

  it("menolak jurnal nol atau < 2 baris", async () => {
    const db = await newTenantDb();
    await expect(
      postJournal(db, { entryDate: "2026-07-01", createdBy: "u1", lines: [{ accountId: ACC_KAS, debit: 0, credit: 0 }, { accountId: ACC_BANK, debit: 0, credit: 0 }] }),
    ).rejects.toThrow(/tidak seimbang/);
  });

  it("menolak transaksi pada periode yang sudah ditutup (PeriodLockedError)", async () => {
    const db = await newTenantDb();
    await db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('locked_before', '2026-06-30', datetime('now'))`)
      .run();
    await expect(
      postJournal(db, {
        entryDate: "2026-06-15",
        createdBy: "u1",
        lines: [
          { accountId: ACC_KAS, debit: 10_000, credit: 0 },
          { accountId: ACC_BANK, debit: 0, credit: 10_000 },
        ],
      }),
    ).rejects.toBeInstanceOf(PeriodLockedError);
    // Tanggal setelah kunci → boleh.
    const ok = await postJournal(db, {
      entryDate: "2026-07-01",
      createdBy: "u1",
      lines: [
        { accountId: ACC_KAS, debit: 10_000, credit: 0 },
        { accountId: ACC_BANK, debit: 0, credit: 10_000 },
      ],
    });
    expect(ok.entryNo).toBe("JRN-00001");
  });
});

describe("nextDocNo", () => {
  it("format bawaan PREFIX-00001 berurutan per tabel", async () => {
    const db = await newTenantDb();
    expect(await nextDocNo(db, "journal_entries", "JRN")).toBe("JRN-00001");
    // Belum ada baris tersimpan → tetap 00001 (dihitung dari COUNT tabel).
    await postJournal(db, {
      entryDate: "2026-07-01",
      createdBy: "u1",
      lines: [
        { accountId: ACC_KAS, debit: 1, credit: 0 },
        { accountId: ACC_BANK, debit: 0, credit: 1 },
      ],
    });
    expect(await nextDocNo(db, "journal_entries", "JRN")).toBe("JRN-00002");
  });

  it("pola kustom di-scope per periode (integrasi dengan settings)", async () => {
    const db = await newTenantDb();
    await db
      .prepare(`INSERT INTO settings (key, value, updated_at) VALUES ('doc_numbering', ?, datetime('now'))`)
      .bind(JSON.stringify({ invoice: "INV-{YYYY}{MM}-{SEQ:3}" }))
      .run();
    const opts = { docType: "invoice" as const, column: "invoice_no", date: "2026-07-15" };
    // Belum ada faktur Juli → 001.
    expect(await nextDocNo(db, "invoices", "INV", opts)).toBe("INV-202607-001");
    // Sisipkan satu faktur Juli 2026 → berikutnya 002.
    await db
      .prepare(
        `INSERT INTO invoices (id, invoice_no, contact_id, invoice_date, subtotal, total, journal_entry_id, created_by)
         VALUES ('i1', 'INV-202607-001', 'c1', '2026-07-15', 0, 0, 'j1', 'u1')`,
      )
      .run();
    expect(await nextDocNo(db, "invoices", "INV", opts)).toBe("INV-202607-002");
    // Periode berbeda (Agustus) reset ke 001.
    expect(await nextDocNo(db, "invoices", "INV", { ...opts, date: "2026-08-01" })).toBe("INV-202608-001");
  });
});
