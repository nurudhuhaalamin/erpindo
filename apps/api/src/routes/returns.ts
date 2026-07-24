import { createReturnSchema } from "@erpindo/shared";
import { Hono } from "hono";
import type { SqlExecutor } from "@erpindo/db";
import type { AppEnv } from "../env";
import {
  accountIdByCode,
  getLockedBefore,
  InsufficientStockError,
  nextDocNo,
  postJournal,
  stockIn,
  stockOut,
  SYS_ACCOUNTS,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Retur penjualan (nota kredit) & pembelian (nota debit).
 * Selalu terikat dokumen asal: qty per produk tidak boleh melebihi yang belum
 * diretur, harga memakai harga dokumen asal, PPN proporsional dengan tarif
 * dokumen. Nilai retur mengurangi sisa tagihan (total - dibayar - diretur).
 */

type DocRow = {
  doc_no: string;
  tax_rate: number;
  total: number;
  paid_amount: number;
  returned_amount: number;
  voided_at: string | null;
};

export async function docLineAggregates(
  db: SqlExecutor,
  lineTable: string,
  fk: string,
  refId: string,
): Promise<Map<string, { qty: number; amount: number }>> {
  const { results } = await db
    .prepare(`SELECT product_id, SUM(qty) AS qty, SUM(amount) AS amount FROM ${lineTable} WHERE ${fk} = ? GROUP BY product_id`)
    .bind(refId)
    .all<{ product_id: string; qty: number; amount: number }>();
  return new Map(results.map((r) => [r.product_id, { qty: r.qty, amount: r.amount }]));
}

export async function returnedQtyPerProduct(db: SqlExecutor, refType: string, refId: string): Promise<Map<string, number>> {
  const { results } = await db
    .prepare(
      `SELECT rl.product_id, SUM(rl.qty) AS qty
       FROM return_lines rl JOIN returns r ON r.id = rl.return_id
       WHERE r.ref_type = ? AND r.ref_id = ? GROUP BY rl.product_id`,
    )
    .bind(refType, refId)
    .all<{ product_id: string; qty: number }>();
  return new Map(results.map((r) => [r.product_id, r.qty]));
}

export const returnRoutes = new Hono<AppEnv>().post(
  "/:tenantId/returns",
  requireAuth,
  requireTenantRole("admin"),
  async (c) => {
    const parsed = createReturnSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const isSale = input.refType === "invoice";
    const table = isSale ? "invoices" : "purchases";
    const lineTable = isSale ? "invoice_lines" : "purchase_lines";
    const fk = isSale ? "invoice_id" : "purchase_id";
    const noColumn = isSale ? "invoice_no" : "purchase_no";

    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.returnDate <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);
    }

    const { results: docs } = await db
      .prepare(
        `SELECT ${noColumn} AS doc_no, tax_rate, total, paid_amount, returned_amount, voided_at FROM ${table} WHERE id = ?`,
      )
      .bind(input.refId)
      .all<DocRow>();
    const doc = docs[0];
    if (!doc) return c.json({ error: "Dokumen asal tidak ditemukan." }, 404);
    if (doc.voided_at) return c.json({ error: "Dokumen asal sudah dibatalkan — tidak bisa diretur." }, 400);

    // Validasi qty per produk terhadap dokumen asal dan retur sebelumnya.
    const docLines = await docLineAggregates(db, lineTable, fk, input.refId);
    const alreadyReturned = await returnedQtyPerProduct(db, input.refType, input.refId);

    let subtotal = 0;
    const pricedLines: { productId: string; qty: number; unitPrice: number; amount: number }[] = [];
    for (const line of input.lines) {
      const docLine = docLines.get(line.productId);
      if (!docLine) return c.json({ error: "Ada produk yang tidak terdapat pada dokumen asal." }, 400);
      const available = docLine.qty - (alreadyReturned.get(line.productId) ?? 0);
      if (line.qty > available) {
        return c.json({ error: `Qty retur melebihi sisa yang bisa diretur (maks ${available}).` }, 400);
      }
      const unitPrice = Math.round(docLine.amount / docLine.qty);
      const amount = line.qty * unitPrice;
      subtotal += amount;
      pricedLines.push({ productId: line.productId, qty: line.qty, unitPrice, amount });
    }

    const taxAmount = Math.round((subtotal * doc.tax_rate) / 100);
    const total = subtotal + taxAmount;
    const remaining = doc.total - doc.paid_amount - doc.returned_amount;
    // Retur mengurangi sisa tagihan lebih dulu; kelebihannya (mis. faktur sudah
    // dibayar) dikembalikan tunai lewat akun kas/bank (Fase 14c).
    const appliedToDoc = Math.max(0, Math.min(total, remaining));
    const refund = total - appliedToDoc;
    let refundAccountId: string | null = null;
    if (refund > 0) {
      if (!input.refundAccountId) {
        return c.json(
          {
            error: `Nilai retur (Rp ${total.toLocaleString("id-ID")}) melebihi sisa tagihan (Rp ${Math.max(0, remaining).toLocaleString("id-ID")}) — pilih akun kas/bank untuk refund Rp ${refund.toLocaleString("id-ID")}.`,
            detail: "refund-account-required",
          },
          400,
        );
      }
      const { results: accts } = await db
        .prepare(`SELECT id FROM accounts WHERE id = ? AND type = 'asset' AND is_archived = 0`)
        .bind(input.refundAccountId)
        .all<{ id: string }>();
      if (!accts[0]) return c.json({ error: "Akun refund harus akun aset (kas/bank) yang aktif." }, 400);
      refundAccountId = input.refundAccountId;
    }

    const returnId = crypto.randomUUID();

    // Mutasi stok + nilai persediaan pada biaya rata-rata berjalan.
    let inventoryValue = 0;
    if (isSale) {
      for (const line of pricedLines) {
        const { results: levels } = await db
          .prepare(`SELECT avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
          .bind(line.productId, input.warehouseId)
          .all<{ avg_cost: number }>();
        const avgCost = levels[0]?.avg_cost ?? 0;
        await stockIn(db, {
          productId: line.productId,
          warehouseId: input.warehouseId,
          qty: line.qty,
          unitCost: avgCost,
          refType: "sale",
          refId: returnId,
        });
        inventoryValue += line.qty * avgCost;
      }
    } else {
      try {
        for (const line of pricedLines) {
          inventoryValue += await stockOut(db, {
            productId: line.productId,
            warehouseId: input.warehouseId,
            qty: line.qty,
            refType: "purchase",
            refId: returnId,
          });
        }
      } catch (err) {
        if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
        throw err;
      }
    }

    const returnNo = await nextDocNo(db, "returns", "RTN");
    const memo = `Retur ${isSale ? "penjualan" : "pembelian"} ${doc.doc_no} (${returnNo})${input.memo ? ` — ${input.memo}` : ""}`;

    // Jurnal pembalik proporsional.
    const lines: { accountId: string; description: string; debit: number; credit: number }[] = [];
    if (isSale) {
      const [pendapatan, ppnKeluaran, piutang, persediaan, hpp] = await Promise.all([
        accountIdByCode(db, SYS_ACCOUNTS.PENDAPATAN),
        accountIdByCode(db, SYS_ACCOUNTS.PPN_KELUARAN),
        accountIdByCode(db, SYS_ACCOUNTS.PIUTANG),
        accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
        accountIdByCode(db, SYS_ACCOUNTS.HPP),
      ]);
      lines.push({ accountId: pendapatan, description: memo, debit: subtotal, credit: 0 });
      if (taxAmount > 0) lines.push({ accountId: ppnKeluaran, description: memo, debit: taxAmount, credit: 0 });
      // Kurangi piutang sebatas sisa tagihan; kelebihan = kas keluar (refund).
      if (appliedToDoc > 0) lines.push({ accountId: piutang, description: memo, debit: 0, credit: appliedToDoc });
      if (refund > 0 && refundAccountId) lines.push({ accountId: refundAccountId, description: `Refund ${memo}`, debit: 0, credit: refund });
      if (inventoryValue > 0) {
        lines.push({ accountId: persediaan, description: memo, debit: inventoryValue, credit: 0 });
        lines.push({ accountId: hpp, description: memo, debit: 0, credit: inventoryValue });
      }
    } else {
      const [hutang, persediaan, ppnMasukan, bebanLain] = await Promise.all([
        accountIdByCode(db, SYS_ACCOUNTS.HUTANG),
        accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
        accountIdByCode(db, SYS_ACCOUNTS.PPN_MASUKAN),
        accountIdByCode(db, "5-4000"),
      ]);
      // Kurangi hutang sebatas sisa tagihan; kelebihan = kas masuk (refund dari pemasok).
      if (appliedToDoc > 0) lines.push({ accountId: hutang, description: memo, debit: appliedToDoc, credit: 0 });
      if (refund > 0 && refundAccountId) lines.push({ accountId: refundAccountId, description: `Refund ${memo}`, debit: refund, credit: 0 });
      if (inventoryValue > 0) lines.push({ accountId: persediaan, description: memo, debit: 0, credit: inventoryValue });
      if (taxAmount > 0) lines.push({ accountId: ppnMasukan, description: memo, debit: 0, credit: taxAmount });
      // Selisih harga dokumen vs biaya rata-rata → beban/pendapatan operasional lain.
      const diff = subtotal - inventoryValue;
      if (diff > 0) lines.push({ accountId: bebanLain, description: memo, debit: 0, credit: diff });
      if (diff < 0) lines.push({ accountId: bebanLain, description: memo, debit: -diff, credit: 0 });
    }

    const journal = await postJournal(db, {
      entryDate: input.returnDate,
      memo,
      createdBy: c.get("user").id,
      lines,
    });

    await db
      .prepare(
        `INSERT INTO returns (id, return_no, ref_type, ref_id, return_date, memo, subtotal, tax_amount, total,
                              journal_entry_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        returnId,
        returnNo,
        input.refType,
        input.refId,
        input.returnDate,
        input.memo ?? null,
        subtotal,
        taxAmount,
        total,
        journal.id,
        c.get("user").id,
      )
      .run();
    for (const line of pricedLines) {
      await db
        .prepare(
          `INSERT INTO return_lines (id, return_id, product_id, qty, unit_price, amount) VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), returnId, line.productId, line.qty, line.unitPrice, line.amount)
        .run();
    }

    // Perbarui sisa tagihan dokumen; lunas bila dibayar + diretur menutup total.
    const newReturned = doc.returned_amount + total;
    await db
      .prepare(`UPDATE ${table} SET returned_amount = ?, status = ? WHERE id = ?`)
      .bind(newReturned, doc.paid_amount + newReturned >= doc.total ? "paid" : "posted", input.refId)
      .run();

    await audit(c.env, {
      action: isSale ? "sales.return_posted" : "purchase.return_posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { returnNo, docNo: doc.doc_no, total, refund },
      ip: clientIp(c),
    });
    return c.json({ ok: true, returnNo, total, refund, journalNo: journal.entryNo }, 201);
  },
);
