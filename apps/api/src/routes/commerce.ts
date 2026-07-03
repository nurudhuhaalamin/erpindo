import {
  createInvoiceSchema,
  createPaymentSchema,
  createPurchaseSchema,
  stockAdjustmentSchema,
  type ApiCommerceDoc,
  type ApiCommerceLine,
  type ApiStockLevel,
} from "@erpindo/shared";
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
 * Siklus penjualan & pembelian. Setiap dokumen otomatis:
 *  - membuat jurnal double-entry (piutang/pendapatan/PPN atau persediaan/hutang)
 *  - menggerakkan stok (keluar dengan HPP moving-average, masuk dengan biaya beli)
 * Dokumen terposting immutable, sama seperti jurnal.
 */

type DocTable = {
  table: "invoices" | "purchases";
  lineTable: "invoice_lines" | "purchase_lines";
  fk: "invoice_id" | "purchase_id";
  noColumn: "invoice_no" | "purchase_no";
  dateColumn: "invoice_date" | "purchase_date";
  prefix: string;
  contactTypes: string[];
};

const INVOICE_CFG: DocTable = {
  table: "invoices",
  lineTable: "invoice_lines",
  fk: "invoice_id",
  noColumn: "invoice_no",
  dateColumn: "invoice_date",
  prefix: "INV",
  contactTypes: ["customer", "both"],
};

const PURCHASE_CFG: DocTable = {
  table: "purchases",
  lineTable: "purchase_lines",
  fk: "purchase_id",
  noColumn: "purchase_no",
  dateColumn: "purchase_date",
  prefix: "PB",
  contactTypes: ["supplier", "both"],
};

async function listDocs(db: SqlExecutor, cfg: DocTable): Promise<ApiCommerceDoc[]> {
  const { results: docs } = await db
    .prepare(
      `SELECT d.id, d.${cfg.noColumn} AS doc_no, d.contact_id, c.name AS contact_name,
              d.${cfg.dateColumn} AS date, d.due_date, d.status, d.subtotal, d.tax_rate,
              d.tax_amount, d.total, d.paid_amount
       FROM ${cfg.table} d JOIN contacts c ON c.id = d.contact_id
       ORDER BY d.created_at DESC LIMIT 200`,
    )
    .all<{
      id: string;
      doc_no: string;
      contact_id: string;
      contact_name: string;
      date: string;
      due_date: string | null;
      status: "posted" | "paid";
      subtotal: number;
      tax_rate: number;
      tax_amount: number;
      total: number;
      paid_amount: number;
    }>();

  const { results: lines } = await db
    .prepare(
      `SELECT l.id, l.${cfg.fk} AS doc_id, l.product_id, p.name AS product_name,
              l.description, l.qty, l.unit_price, l.amount
       FROM ${cfg.lineTable} l JOIN products p ON p.id = l.product_id`,
    )
    .all<{
      id: string;
      doc_id: string;
      product_id: string;
      product_name: string;
      description: string | null;
      qty: number;
      unit_price: number;
      amount: number;
    }>();

  const byDoc = new Map<string, ApiCommerceLine[]>();
  for (const l of lines) {
    const list = byDoc.get(l.doc_id) ?? [];
    list.push({
      id: l.id,
      productId: l.product_id,
      productName: l.product_name,
      description: l.description,
      qty: l.qty,
      unitPrice: l.unit_price,
      amount: l.amount,
    });
    byDoc.set(l.doc_id, list);
  }

  return docs.map((d) => ({
    id: d.id,
    docNo: d.doc_no,
    contactId: d.contact_id,
    contactName: d.contact_name,
    date: d.date,
    dueDate: d.due_date,
    status: d.status,
    subtotal: d.subtotal,
    taxRate: d.tax_rate,
    taxAmount: d.tax_amount,
    total: d.total,
    paidAmount: d.paid_amount,
    lines: byDoc.get(d.id) ?? [],
  }));
}

/** Tolak dokumen bertanggal pada periode yang sudah ditutup buku. */
async function checkPeriodOpen(db: SqlExecutor, date: string): Promise<string | null> {
  const lockedBefore = await getLockedBefore(db);
  if (lockedBefore && date <= lockedBefore) {
    return `Periode sampai ${lockedBefore} sudah ditutup — transaksi bertanggal ${date} ditolak.`;
  }
  return null;
}

/** Validasi rujukan bersama: kontak (jenis sesuai), gudang, produk aktif. */
async function validateRefs(
  db: SqlExecutor,
  cfg: DocTable,
  input: { contactId: string; warehouseId: string; lines: { productId: string }[] },
): Promise<string | null> {
  const { results: contacts } = await db
    .prepare(`SELECT type FROM contacts WHERE id = ? AND is_archived = 0`)
    .bind(input.contactId)
    .all<{ type: string }>();
  if (!contacts[0]) return "Kontak tidak ditemukan.";
  if (!cfg.contactTypes.includes(contacts[0].type)) {
    return cfg.table === "invoices" ? "Kontak tersebut bukan pelanggan." : "Kontak tersebut bukan pemasok.";
  }

  const { results: wh } = await db
    .prepare(`SELECT id FROM warehouses WHERE id = ? AND is_archived = 0`)
    .bind(input.warehouseId)
    .all();
  if (!wh[0]) return "Gudang tidak ditemukan.";

  const productIds = [...new Set(input.lines.map((l) => l.productId))];
  const { results: products } = await db
    .prepare(
      `SELECT id FROM products WHERE is_archived = 0 AND id IN (${productIds.map(() => "?").join(",")})`,
    )
    .bind(...productIds)
    .all<{ id: string }>();
  if (products.length !== productIds.length) return "Ada produk yang tidak ditemukan atau diarsipkan.";
  return null;
}

export const commerceRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Faktur penjualan
  // -------------------------------------------------------------------------
  .get("/:tenantId/invoices", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ docs: await listDocs(db, INVOICE_CFG) });
  })

  .post("/:tenantId/invoices", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createInvoiceSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const refError = await validateRefs(db, INVOICE_CFG, input);
    if (refError) return c.json({ error: refError }, 400);
    const lockError = await checkPeriodOpen(db, input.invoiceDate);
    if (lockError) return c.json({ error: lockError }, 400);

    const subtotal = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const taxAmount = Math.round((subtotal * input.taxRate) / 100);
    const total = subtotal + taxAmount;
    if (total === 0) return c.json({ error: "Total faktur tidak boleh nol." }, 400);

    const invoiceId = crypto.randomUUID();

    // Stok keluar dulu (bisa gagal karena stok kurang) — sebelum jurnal dibuat.
    let totalCogs = 0;
    try {
      for (const line of input.lines) {
        totalCogs += await stockOut(db, {
          productId: line.productId,
          warehouseId: input.warehouseId,
          qty: line.qty,
          refType: "sale",
          refId: invoiceId,
        });
      }
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }

    const [piutang, pendapatan, ppnKeluaran, hpp, persediaan] = await Promise.all([
      accountIdByCode(db, SYS_ACCOUNTS.PIUTANG),
      accountIdByCode(db, SYS_ACCOUNTS.PENDAPATAN),
      accountIdByCode(db, SYS_ACCOUNTS.PPN_KELUARAN),
      accountIdByCode(db, SYS_ACCOUNTS.HPP),
      accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
    ]);

    const docNo = await nextDocNo(db, "invoices", "INV");
    const journal = await postJournal(db, {
      entryDate: input.invoiceDate,
      memo: `Faktur penjualan ${docNo}`,
      createdBy: c.get("user").id,
      lines: [
        { accountId: piutang, description: docNo, debit: total, credit: 0 },
        { accountId: pendapatan, description: docNo, debit: 0, credit: subtotal },
        ...(taxAmount > 0 ? [{ accountId: ppnKeluaran, description: `PPN ${docNo}`, debit: 0, credit: taxAmount }] : []),
        ...(totalCogs > 0
          ? [
              { accountId: hpp, description: `HPP ${docNo}`, debit: totalCogs, credit: 0 },
              { accountId: persediaan, description: `HPP ${docNo}`, debit: 0, credit: totalCogs },
            ]
          : []),
      ],
    });

    await db
      .prepare(
        `INSERT INTO invoices (id, invoice_no, contact_id, invoice_date, due_date, status, subtotal,
                               tax_rate, tax_amount, total, paid_amount, journal_entry_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        invoiceId,
        docNo,
        input.contactId,
        input.invoiceDate,
        input.dueDate ?? null,
        subtotal,
        input.taxRate,
        taxAmount,
        total,
        journal.id,
        c.get("user").id,
      )
      .run();
    for (const line of input.lines) {
      await db
        .prepare(
          `INSERT INTO invoice_lines (id, invoice_id, product_id, description, qty, unit_price, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          invoiceId,
          line.productId,
          line.description ?? null,
          line.qty,
          line.unitPrice,
          line.qty * line.unitPrice,
        )
        .run();
    }

    await audit(c.env, {
      action: "sales.invoice_posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo, total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: invoiceId, docNo, total }, 201);
  })

  // -------------------------------------------------------------------------
  // Faktur pembelian
  // -------------------------------------------------------------------------
  .get("/:tenantId/purchases", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json({ docs: await listDocs(db, PURCHASE_CFG) });
  })

  .post("/:tenantId/purchases", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createPurchaseSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const refError = await validateRefs(db, PURCHASE_CFG, input);
    if (refError) return c.json({ error: refError }, 400);
    const lockError = await checkPeriodOpen(db, input.invoiceDate);
    if (lockError) return c.json({ error: lockError }, 400);

    const subtotal = input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0);
    const taxAmount = Math.round((subtotal * input.taxRate) / 100);
    const total = subtotal + taxAmount;
    if (total === 0) return c.json({ error: "Total faktur tidak boleh nol." }, 400);

    const [persediaan, ppnMasukan, hutang] = await Promise.all([
      accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
      accountIdByCode(db, SYS_ACCOUNTS.PPN_MASUKAN),
      accountIdByCode(db, SYS_ACCOUNTS.HUTANG),
    ]);

    const purchaseId = crypto.randomUUID();
    const docNo = await nextDocNo(db, "purchases", "PB");
    const journal = await postJournal(db, {
      entryDate: input.invoiceDate,
      memo: `Faktur pembelian ${docNo}`,
      createdBy: c.get("user").id,
      lines: [
        { accountId: persediaan, description: docNo, debit: subtotal, credit: 0 },
        ...(taxAmount > 0 ? [{ accountId: ppnMasukan, description: `PPN ${docNo}`, debit: taxAmount, credit: 0 }] : []),
        { accountId: hutang, description: docNo, debit: 0, credit: total },
      ],
    });

    await db
      .prepare(
        `INSERT INTO purchases (id, purchase_no, contact_id, purchase_date, due_date, status, subtotal,
                                tax_rate, tax_amount, total, paid_amount, journal_entry_id, created_by)
         VALUES (?, ?, ?, ?, ?, 'posted', ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        purchaseId,
        docNo,
        input.contactId,
        input.invoiceDate,
        input.dueDate ?? null,
        subtotal,
        input.taxRate,
        taxAmount,
        total,
        journal.id,
        c.get("user").id,
      )
      .run();
    for (const line of input.lines) {
      await db
        .prepare(
          `INSERT INTO purchase_lines (id, purchase_id, product_id, description, qty, unit_price, amount)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          purchaseId,
          line.productId,
          line.description ?? null,
          line.qty,
          line.unitPrice,
          line.qty * line.unitPrice,
        )
        .run();
      await stockIn(db, {
        productId: line.productId,
        warehouseId: input.warehouseId,
        qty: line.qty,
        unitCost: line.unitPrice,
        refType: "purchase",
        refId: purchaseId,
      });
    }

    await audit(c.env, {
      action: "purchase.posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo, total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: purchaseId, docNo, total }, 201);
  })

  // -------------------------------------------------------------------------
  // Pembayaran: terima dari pelanggan / bayar ke pemasok
  // -------------------------------------------------------------------------
  .post("/:tenantId/payments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createPaymentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const cfg = input.refType === "invoice" ? INVOICE_CFG : PURCHASE_CFG;

    const { results: docs } = await db
      .prepare(`SELECT ${cfg.noColumn} AS doc_no, total, paid_amount FROM ${cfg.table} WHERE id = ?`)
      .bind(input.refId)
      .all<{ doc_no: string; total: number; paid_amount: number }>();
    const doc = docs[0];
    if (!doc) return c.json({ error: "Dokumen tidak ditemukan." }, 404);
    const lockError = await checkPeriodOpen(db, input.paymentDate);
    if (lockError) return c.json({ error: lockError }, 400);

    const remaining = doc.total - doc.paid_amount;
    if (input.amount > remaining) {
      return c.json({ error: `Nominal melebihi sisa tagihan (sisa Rp ${remaining.toLocaleString("id-ID")}).` }, 400);
    }

    // Akun pembayaran harus akun kas/bank (tipe aset, tidak diarsipkan).
    const { results: accs } = await db
      .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
      .bind(input.accountId)
      .all<{ type: string }>();
    if (!accs[0] || accs[0].type !== "asset") {
      return c.json({ error: "Akun pembayaran harus akun kas/bank (tipe aset)." }, 400);
    }

    const counterCode = input.refType === "invoice" ? SYS_ACCOUNTS.PIUTANG : SYS_ACCOUNTS.HUTANG;
    const counterId = await accountIdByCode(db, counterCode);

    const paymentNo = await nextDocNo(db, "payments", "PAY");
    const direction = input.refType === "invoice" ? "receive" : "pay";
    const memo =
      direction === "receive" ? `Penerimaan ${doc.doc_no} (${paymentNo})` : `Pembayaran ${doc.doc_no} (${paymentNo})`;

    const journal = await postJournal(db, {
      entryDate: input.paymentDate,
      memo,
      createdBy: c.get("user").id,
      lines:
        direction === "receive"
          ? [
              { accountId: input.accountId, description: memo, debit: input.amount, credit: 0 },
              { accountId: counterId, description: memo, debit: 0, credit: input.amount },
            ]
          : [
              { accountId: counterId, description: memo, debit: input.amount, credit: 0 },
              { accountId: input.accountId, description: memo, debit: 0, credit: input.amount },
            ],
    });

    await db
      .prepare(
        `INSERT INTO payments (id, payment_no, direction, ref_type, ref_id, account_id, amount,
                               payment_date, journal_entry_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        paymentNo,
        direction,
        input.refType,
        input.refId,
        input.accountId,
        input.amount,
        input.paymentDate,
        journal.id,
        c.get("user").id,
      )
      .run();

    const newPaid = doc.paid_amount + input.amount;
    await db
      .prepare(`UPDATE ${cfg.table} SET paid_amount = ?, status = ? WHERE id = ?`)
      .bind(newPaid, newPaid >= doc.total ? "paid" : "posted", input.refId)
      .run();

    await audit(c.env, {
      action: "payment.recorded",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { paymentNo, refType: input.refType, docNo: doc.doc_no, amount: input.amount },
      ip: clientIp(c),
    });
    return c.json({ ok: true, paymentNo, paidAmount: newPaid, settled: newPaid >= doc.total }, 201);
  })

  // -------------------------------------------------------------------------
  // Penyesuaian stok (opname): samakan sistem dengan hasil hitung fisik.
  // Selisih nilai dijurnal ke Beban Operasional Lain ↔ Persediaan.
  // -------------------------------------------------------------------------
  .post("/:tenantId/stock-adjustments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = stockAdjustmentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const today = new Date().toISOString().slice(0, 10);

    const lockError = await checkPeriodOpen(db, today);
    if (lockError) return c.json({ error: lockError }, 400);

    const { results: products } = await db
      .prepare(`SELECT sku, name FROM products WHERE id = ? AND is_archived = 0`)
      .bind(input.productId)
      .all<{ sku: string; name: string }>();
    const product = products[0];
    if (!product) return c.json({ error: "Produk tidak ditemukan." }, 400);

    const { results: levels } = await db
      .prepare(`SELECT qty, avg_cost FROM stock_levels WHERE product_id = ? AND warehouse_id = ?`)
      .bind(input.productId, input.warehouseId)
      .all<{ qty: number; avg_cost: number }>();
    const currentQty = levels[0]?.qty ?? 0;
    const avgCost = levels[0]?.avg_cost ?? 0;

    const delta = input.physicalQty - currentQty;
    if (delta === 0) return c.json({ error: "Tidak ada selisih — stok sistem sudah sama dengan fisik." }, 400);

    const adjustmentId = crypto.randomUUID();
    let value: number;
    if (delta > 0) {
      await stockIn(db, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: delta,
        unitCost: avgCost,
        refType: "adjustment",
        refId: adjustmentId,
      });
      value = delta * avgCost;
    } else {
      value = await stockOut(db, {
        productId: input.productId,
        warehouseId: input.warehouseId,
        qty: -delta,
        refType: "adjustment",
        refId: adjustmentId,
      });
    }

    let entryNo: string | null = null;
    if (value > 0) {
      const [persediaan, bebanLain] = await Promise.all([
        accountIdByCode(db, SYS_ACCOUNTS.PERSEDIAAN),
        accountIdByCode(db, "5-4000"),
      ]);
      const memo = `Penyesuaian stok ${product.sku}: ${currentQty} → ${input.physicalQty}${input.note ? ` (${input.note})` : ""}`;
      const journal = await postJournal(db, {
        entryDate: today,
        memo,
        createdBy: c.get("user").id,
        lines:
          delta < 0
            ? [
                { accountId: bebanLain, description: memo, debit: value, credit: 0 },
                { accountId: persediaan, description: memo, debit: 0, credit: value },
              ]
            : [
                { accountId: persediaan, description: memo, debit: value, credit: 0 },
                { accountId: bebanLain, description: memo, debit: 0, credit: value },
              ],
      });
      entryNo = journal.entryNo;
    }

    await audit(c.env, {
      action: "inventory.adjusted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { sku: product.sku, from: currentQty, to: input.physicalQty, value, note: input.note },
      ip: clientIp(c),
    });
    return c.json({ ok: true, delta, value, entryNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Level stok per gudang
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT s.product_id, p.sku, p.name AS product_name, p.unit,
                s.warehouse_id, w.name AS warehouse_name, s.qty, s.avg_cost
         FROM stock_levels s
         JOIN products p ON p.id = s.product_id
         JOIN warehouses w ON w.id = s.warehouse_id
         ORDER BY p.name, w.name`,
      )
      .all<{
        product_id: string;
        sku: string;
        product_name: string;
        unit: string;
        warehouse_id: string;
        warehouse_name: string;
        qty: number;
        avg_cost: number;
      }>();

    const levels: ApiStockLevel[] = results.map((r) => ({
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      unit: r.unit,
      warehouseId: r.warehouse_id,
      warehouseName: r.warehouse_name,
      qty: r.qty,
      avgCost: r.avg_cost,
      value: r.qty * r.avg_cost,
    }));
    const totalValue = levels.reduce((s, l) => s + l.value, 0);
    return c.json({ levels, totalValue });
  });
