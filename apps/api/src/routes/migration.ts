import { openingBalanceSchema, type ApiOpeningStatus } from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { accountIdByCode, postJournal, stockIn, SYS_ACCOUNTS } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Migrasi & saldo awal (Fase 13f). Menyusun SATU jurnal pembuka seimbang dari
 * saldo awal akun + stok awal, lalu menyetel nilai persediaan agar cocok dengan
 * buku besar. Hanya boleh saat buku masih kosong (belum ada jurnal terposting).
 *
 * Akun ekuitas penyeimbang = Laba Ditahan (3-2000): selisih debit-kredit input
 * ditempatkan di sini sehingga jurnal SELALU seimbang (praktik "Opening Balance
 * Equity" standar migrasi).
 */

const OPENING_EQUITY_CODE = "3-2000"; // Laba Ditahan

async function postedCount(db: ReturnType<typeof getTenantDb>): Promise<number> {
  const { results } = await db
    .prepare(`SELECT COUNT(*) AS n FROM journal_entries WHERE status = 'posted'`)
    .all<{ n: number }>();
  return results[0]?.n ?? 0;
}

export const migrationRoutes = new Hono<AppEnv>()
  .get("/:tenantId/migration/opening-status", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const n = await postedCount(db);
    const body: ApiOpeningStatus = { canSetOpening: n === 0, postedEntries: n };
    return c.json(body);
  })

  .post("/:tenantId/migration/opening-balances", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = openingBalanceSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const { asOfDate, accounts, stock } = parsed.data;
    if (accounts.length === 0 && stock.length === 0) {
      return c.json({ error: "Isi minimal satu saldo akun atau stok awal." }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    // Guard: saldo awal hanya sekali, saat buku kosong.
    if ((await postedCount(db)) > 0) {
      return c.json(
        { error: "Buku sudah berisi transaksi — saldo awal hanya bisa diisi saat buku masih kosong.", detail: "books-not-empty" },
        409,
      );
    }

    // Validasi referensi stok (produk & gudang milik tenant) + hitung nilai persediaan.
    let stockValue = 0;
    for (const s of stock) {
      const prod = await db.prepare(`SELECT id FROM products WHERE id = ? AND is_archived = 0`).bind(s.productId).first();
      if (!prod) return c.json({ error: `Produk ${s.productId} tidak ditemukan.` }, 400);
      const wh = await db.prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`).bind(s.warehouseId).first();
      if (!wh) return c.json({ error: `Gudang ${s.warehouseId} tidak ditemukan.` }, 400);
      stockValue += s.qty * s.unitCost;
    }

    // Susun baris jurnal pembuka: saldo akun (harus akun non-persediaan) + Persediaan dari stok.
    const lines: { accountId: string; debit: number; credit: number; description: string }[] = [];
    for (const a of accounts) {
      if (a.accountCode === SYS_ACCOUNTS.PERSEDIAAN) {
        return c.json(
          { error: "Saldo Persediaan diambil dari bagian Stok Awal — jangan diisi di saldo akun." },
          400,
        );
      }
      let accId: string;
      try {
        accId = await accountIdByCode(db, a.accountCode);
      } catch {
        return c.json({ error: `Akun ${a.accountCode} tidak ada di bagan akun.` }, 400);
      }
      lines.push({ accountId: accId, debit: a.debit, credit: a.credit, description: "Saldo awal" });
    }
    if (stockValue > 0) {
      const persId = await accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN);
      lines.push({ accountId: persId, debit: stockValue, credit: 0, description: "Saldo awal persediaan" });
    }

    // Penyeimbang ke Ekuitas Saldo Awal (Laba Ditahan): jurnal SELALU seimbang.
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    const diff = totalDebit - totalCredit;
    if (diff !== 0) {
      const eqId = await accountIdByCode(db, OPENING_EQUITY_CODE);
      lines.push({
        accountId: eqId,
        debit: diff < 0 ? -diff : 0,
        credit: diff > 0 ? diff : 0,
        description: "Ekuitas saldo awal (penyeimbang)",
      });
    }
    if (lines.length < 2) {
      return c.json({ error: "Saldo awal perlu minimal dua sisi (mis. kas & modal)." }, 400);
    }

    // Posting jurnal pembuka + set stok (mutasi masuk + level).
    const entry = await postJournal(db, {
      entryDate: asOfDate,
      memo: "Saldo awal (migrasi)",
      createdBy: c.get("user").id,
      lines,
    });
    const refId = crypto.randomUUID();
    for (const s of stock) {
      await stockIn(db, {
        productId: s.productId,
        warehouseId: s.warehouseId,
        qty: s.qty,
        unitCost: s.unitCost,
        refType: "adjustment",
        refId,
      });
    }

    await audit(c.env, {
      action: "migration.opening_balances",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { entryNo: entry.entryNo, accounts: accounts.length, stockLines: stock.length, stockValue },
      ip: clientIp(c),
    });
    return c.json({ ok: true, entryNo: entry.entryNo, stockValue, balancing: diff }, 201);
  });
