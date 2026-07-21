import {
  approvalThresholdSchema,
  createInvoiceSchema,
  createPaymentSchema,
  createPurchaseSchema,
  decisionNoteSchema,
  reverseJournalSchema,
  stockAdjustmentSchema,
  stockTransferSchema,
  type ApiPayment,
  type ApiStockLevel,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import {
  accountIdByCode,
  AlreadyReversedError,
  InsufficientStockError,
  nextDocNo,
  PeriodLockedError,
  postJournal,
  reverseJournal,
  stockIn,
  stockOut,
  SYS_ACCOUNTS,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { emitWebhook } from "../lib/webhooks";
import {
  approvalThreshold,
  checkPeriodOpen,
  executeInvoice,
  executePurchase,
  INVOICE_CFG,
  listDocs,
  PURCHASE_CFG,
  voidDoc,
} from "../lib/commercePosting";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Rute siklus penjualan & pembelian. Mesin posting (jurnal + stok + void)
 * dipindah ke ../lib/commercePosting pada Fase 12c; berkas ini tinggal
 * handler HTTP-nya.
 */

export const commerceRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Faktur penjualan
  // -------------------------------------------------------------------------
  .get("/:tenantId/invoices", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(
      await listDocs(db, INVOICE_CFG, {
        q: c.req.query("q"),
        limit: Number(c.req.query("limit")) || undefined,
        offset: Number(c.req.query("offset")) || undefined,
      }),
    );
  })

  .post("/:tenantId/invoices", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createInvoiceSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    const result = await executeInvoice(db, parsed.data, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await audit(c.env, {
      action: "sales.invoice_posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    // Webhook keluar (Fase 13h): notifikasi faktur baru ke integrator.
    await emitWebhook(c.env, tenant.id, "invoice.created", { id: result.invoiceId, invoiceNo: result.docNo, total: result.total });
    return c.json({ ok: true, id: result.invoiceId, docNo: result.docNo, total: result.total }, 201);
  })

  .post("/:tenantId/invoices/:id/void", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const result = await voidDoc(db, INVOICE_CFG, c.req.param("id"), c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    await audit(c.env, {
      action: "sales.invoice_voided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, reversalEntryNo: result.reversalEntryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, reversalEntryNo: result.reversalEntryNo });
  })

  // -------------------------------------------------------------------------
  // Faktur pembelian
  // -------------------------------------------------------------------------
  .get("/:tenantId/purchases", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(
      await listDocs(db, PURCHASE_CFG, {
        q: c.req.query("q"),
        limit: Number(c.req.query("limit")) || undefined,
        offset: Number(c.req.query("offset")) || undefined,
      }),
    );
  })

  .post("/:tenantId/purchases", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createPurchaseSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Gerbang persetujuan: pembelian ≥ ambang oleh non-Owner masuk antrean,
    // TANPA jurnal & TANPA stok — baru diposting saat Owner menyetujui.
    const threshold = await approvalThreshold(db);
    const previewTotal =
      input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) +
      Math.round((input.lines.reduce((s, l) => s + l.qty * l.unitPrice, 0) * input.taxRate) / 100);
    if (threshold > 0 && previewTotal >= threshold && tenant.role !== "owner") {
      const requestNo = await nextDocNo(db, "approval_requests", "APR");
      const id = crypto.randomUUID();
      await db
        .prepare(
          `INSERT INTO approval_requests (id, request_no, type, payload, summary, total, requested_by)
           VALUES (?, ?, 'purchase', ?, ?, ?, ?)`,
        )
        .bind(
          id,
          requestNo,
          JSON.stringify(input),
          `Pembelian ${input.lines.length} baris`,
          previewTotal,
          c.get("user").id,
        )
        .run();
      await audit(c.env, {
        action: "approval.requested",
        userId: c.get("user").id,
        tenantId: tenant.id,
        detail: { requestNo, total: previewTotal },
        ip: clientIp(c),
      });
      return c.json({ ok: true, pendingApproval: true, requestNo, total: previewTotal }, 202);
    }

    const result = await executePurchase(db, input, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await audit(c.env, {
      action: "purchase.posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, total: result.total },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: result.purchaseId, docNo: result.docNo, total: result.total }, 201);
  })

  .post("/:tenantId/purchases/:id/void", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const result = await voidDoc(db, PURCHASE_CFG, c.req.param("id"), c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, result.status);
    await audit(c.env, {
      action: "purchase.voided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { docNo: result.docNo, reversalEntryNo: result.reversalEntryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, reversalEntryNo: result.reversalEntryNo });
  })

  // -------------------------------------------------------------------------
  // Persetujuan pembelian (Owner)
  // -------------------------------------------------------------------------
  .post("/:tenantId/approval-threshold", requireAuth, requireTenantRole("owner"), async (c) => {
    const parsedThreshold = approvalThresholdSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsedThreshold.success) return c.json({ error: "Nominal tidak valid." }, 400);
    const amount = parsedThreshold.data.amount;
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    await db
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES ('approval_threshold_purchase', ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      )
      .bind(String(amount))
      .run();
    await audit(c.env, {
      action: "approval.threshold_set",
      userId: c.get("user").id,
      tenantId: c.get("tenant").id,
      detail: { amount },
      ip: clientIp(c),
    });
    return c.json({ ok: true, amount });
  })

  .get("/:tenantId/approvals", requireAuth, requireTenantRole("owner"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT id, request_no, type, summary, total, status, requested_by, requested_at, decision_note
         FROM approval_requests ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, requested_at DESC LIMIT 100`,
      )
      .all<Record<string, unknown>>();
    return c.json({ requests: results });
  })

  .post("/:tenantId/approvals/:id/approve", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db
      .prepare(`SELECT payload, request_no FROM approval_requests WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .all<{ payload: string; request_no: string }>();
    const req = results[0];
    if (!req) return c.json({ error: "Permintaan tidak ditemukan atau sudah diputuskan." }, 404);

    const parsed = createPurchaseSchema.safeParse(JSON.parse(req.payload));
    if (!parsed.success) return c.json({ error: "Payload permintaan tidak valid." }, 400);

    const result = await executePurchase(db, parsed.data, c.get("user").id);
    if ("error" in result) return c.json({ error: result.error }, 400);

    await db
      .prepare(
        `UPDATE approval_requests SET status = 'approved', decided_by = ?, decided_at = datetime('now'),
                result_doc_id = ? WHERE id = ?`,
      )
      .bind(c.get("user").id, result.purchaseId, id)
      .run();
    await audit(c.env, {
      action: "approval.approved",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { requestNo: req.request_no, docNo: result.docNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, docNo: result.docNo, total: result.total });
  })

  .post("/:tenantId/approvals/:id/reject", requireAuth, requireTenantRole("owner"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const parsedNote = decisionNoteSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsedNote.success) return c.json({ error: "Catatan tidak valid (maksimal 300 karakter)." }, 400);
    const note = parsedNote.data.note ?? "";

    const { results } = await db
      .prepare(`SELECT request_no FROM approval_requests WHERE id = ? AND status = 'pending'`)
      .bind(id)
      .all<{ request_no: string }>();
    if (!results[0]) return c.json({ error: "Permintaan tidak ditemukan atau sudah diputuskan." }, 404);

    await db
      .prepare(
        `UPDATE approval_requests SET status = 'rejected', decided_by = ?, decided_at = datetime('now'),
                decision_note = ? WHERE id = ?`,
      )
      .bind(c.get("user").id, note || null, id)
      .run();
    await audit(c.env, {
      action: "approval.rejected",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { requestNo: results[0].request_no, note },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
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
      .prepare(
        `SELECT ${cfg.noColumn} AS doc_no, total, paid_amount, returned_amount, currency, exchange_rate, voided_at
         FROM ${cfg.table} WHERE id = ?`,
      )
      .bind(input.refId)
      .all<{ doc_no: string; total: number; paid_amount: number; returned_amount: number; currency: string; exchange_rate: number; voided_at: string | null }>();
    const doc = docs[0];
    if (!doc) return c.json({ error: "Dokumen tidak ditemukan." }, 404);
    if (doc.voided_at) return c.json({ error: "Dokumen sudah dibatalkan — tidak bisa menerima pembayaran." }, 400);
    const lockError = await checkPeriodOpen(db, input.paymentDate);
    if (lockError) return c.json({ error: lockError }, 400);

    // Faktur valas: bayar dalam valas + kurs saat bayar → selisih kurs dijurnal.
    // Faktur IDR: pakai `amount` (IDR) seperti biasa (kurs 1, tanpa selisih).
    const isForeign = doc.currency !== "IDR";
    let counterCleared: number; // IDR yang mengurangi piutang/hutang (pada kurs faktur)
    let cashIdr: number; // IDR kas yang benar-benar berpindah (pada kurs bayar)
    let foreignAmt: number;
    let payRate: number;
    if (isForeign) {
      if (!input.foreignAmount || !input.exchangeRate) {
        return c.json({ error: `Faktur dalam ${doc.currency} — isi jumlah valas & kurs saat pembayaran.` }, 400);
      }
      foreignAmt = input.foreignAmount;
      payRate = input.exchangeRate;
      counterCleared = Math.round(foreignAmt * doc.exchange_rate);
      cashIdr = Math.round(foreignAmt * payRate);
    } else {
      if (!input.amount) return c.json({ error: "Nominal pembayaran wajib diisi." }, 400);
      foreignAmt = input.amount;
      payRate = 1;
      counterCleared = input.amount;
      cashIdr = input.amount;
    }

    const remaining = doc.total - doc.paid_amount - doc.returned_amount;
    if (counterCleared > remaining) {
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

    const direction = input.refType === "invoice" ? "receive" : "pay";
    const counterId = await accountIdByCode(db, direction === "receive" ? SYS_ACCOUNTS.PIUTANG : SYS_ACCOUNTS.HUTANG);

    const paymentNo = await nextDocNo(db, "payments", "PAY");
    const memo =
      direction === "receive" ? `Penerimaan ${doc.doc_no} (${paymentNo})` : `Pembayaran ${doc.doc_no} (${paymentNo})`;

    // Selisih kurs favorable (laba): terima IDR > piutang, atau bayar IDR < hutang.
    const forexGain = direction === "receive" ? cashIdr - counterCleared : counterCleared - cashIdr;
    const forexLine =
      forexGain === 0
        ? []
        : forexGain > 0
          ? [{ accountId: await accountIdByCode(db, "4-3000"), description: `Selisih kurs ${doc.doc_no}`, debit: 0, credit: forexGain }]
          : [{ accountId: await accountIdByCode(db, "5-6000"), description: `Selisih kurs ${doc.doc_no}`, debit: -forexGain, credit: 0 }];

    const baseLines =
      direction === "receive"
        ? [
            { accountId: input.accountId, description: memo, debit: cashIdr, credit: 0 },
            { accountId: counterId, description: memo, debit: 0, credit: counterCleared },
          ]
        : [
            { accountId: counterId, description: memo, debit: counterCleared, credit: 0 },
            { accountId: input.accountId, description: memo, debit: 0, credit: cashIdr },
          ];

    const journal = await postJournal(db, {
      entryDate: input.paymentDate,
      memo,
      createdBy: c.get("user").id,
      lines: [...baseLines, ...forexLine],
    });

    await db
      .prepare(
        `INSERT INTO payments (id, payment_no, direction, ref_type, ref_id, account_id, amount,
                               payment_date, journal_entry_id, created_by, currency, exchange_rate, foreign_amount)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        crypto.randomUUID(),
        paymentNo,
        direction,
        input.refType,
        input.refId,
        input.accountId,
        counterCleared,
        input.paymentDate,
        journal.id,
        c.get("user").id,
        doc.currency,
        payRate,
        foreignAmt,
      )
      .run();

    const newPaid = doc.paid_amount + counterCleared;
    await db
      .prepare(`UPDATE ${cfg.table} SET paid_amount = ?, status = ? WHERE id = ?`)
      .bind(newPaid, newPaid + doc.returned_amount >= doc.total ? "paid" : "posted", input.refId)
      .run();

    await audit(c.env, {
      action: "payment.recorded",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { paymentNo, refType: input.refType, docNo: doc.doc_no, amount: counterCleared, forexGain },
      ip: clientIp(c),
    });
    // Webhook keluar (Fase 13h): hanya untuk penerimaan dari pelanggan.
    if (direction === "receive") {
      await emitWebhook(c.env, tenant.id, "payment.received", { paymentNo, refType: input.refType, docNo: doc.doc_no, amount: counterCleared });
    }
    return c.json(
      { ok: true, paymentNo, paidAmount: newPaid, settled: newPaid + doc.returned_amount >= doc.total, forexGain },
      201,
    );
  })

  // -------------------------------------------------------------------------
  // Daftar pembayaran (Fase 10c) — baris untuk tombol Hapus di UI. Filter
  // opsional per dokumen (refType + refId); tanpa filter = 200 terbaru.
  // -------------------------------------------------------------------------
  .get("/:tenantId/payments", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const refType = c.req.query("refType");
    const refId = c.req.query("refId");
    const binds: string[] = [];
    let where = "";
    if (refType && refId) {
      where = "WHERE p.ref_type = ? AND p.ref_id = ?";
      binds.push(refType, refId);
    }
    const { results } = await db
      .prepare(
        `SELECT p.id, p.payment_no, p.direction, p.ref_type, p.ref_id, p.account_id, a.name AS account_name,
                p.amount, p.payment_date, p.currency, p.exchange_rate, p.foreign_amount, p.voided_at,
                j.entry_no AS journal_no, v.entry_no AS void_journal_no,
                COALESCE(i.invoice_no, pu.purchase_no) AS doc_no,
                CASE WHEN i.pos_shift_id IS NOT NULL THEN 1 ELSE 0 END AS is_pos
         FROM payments p
         LEFT JOIN accounts a ON a.id = p.account_id
         LEFT JOIN journal_entries j ON j.id = p.journal_entry_id
         LEFT JOIN journal_entries v ON v.id = p.void_journal_entry_id
         LEFT JOIN invoices i ON p.ref_type = 'invoice' AND i.id = p.ref_id
         LEFT JOIN purchases pu ON p.ref_type = 'purchase' AND pu.id = p.ref_id
         ${where}
         ORDER BY p.payment_date DESC, p.payment_no DESC LIMIT 200`,
      )
      .bind(...binds)
      .all<{
        id: string;
        payment_no: string;
        direction: "receive" | "pay";
        ref_type: "invoice" | "purchase";
        ref_id: string;
        account_id: string;
        account_name: string | null;
        amount: number;
        payment_date: string;
        currency: string | null;
        exchange_rate: number | null;
        foreign_amount: number | null;
        voided_at: string | null;
        journal_no: string | null;
        void_journal_no: string | null;
        doc_no: string | null;
        is_pos: number;
      }>();
    const payments: ApiPayment[] = results.map((r) => ({
      id: r.id,
      paymentNo: r.payment_no,
      direction: r.direction,
      refType: r.ref_type,
      refId: r.ref_id,
      docNo: r.doc_no,
      accountId: r.account_id,
      accountName: r.account_name,
      amount: r.amount,
      paymentDate: r.payment_date,
      currency: r.currency ?? "IDR",
      exchangeRate: r.exchange_rate ?? 1,
      foreignAmount: r.foreign_amount,
      voidedAt: r.voided_at,
      journalNo: r.journal_no,
      voidJournalNo: r.void_journal_no,
      isPos: r.is_pos === 1,
    }));
    return c.json({ payments });
  })

  // -------------------------------------------------------------------------
  // Void pembayaran (Fase 10c): jurnal pembalik + sisa tagihan dokumen pulih.
  // Pembayaran POS diblokir — jurnalnya menyatu dengan struk penjualannya.
  // -------------------------------------------------------------------------
  .post("/:tenantId/payments/:id/void", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = reverseJournalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid" }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const paymentId = c.req.param("id");

    const { results: rows } = await db
      .prepare(
        `SELECT id, payment_no, direction, ref_type, ref_id, amount, payment_date, journal_entry_id, voided_at
         FROM payments WHERE id = ?`,
      )
      .bind(paymentId)
      .all<{
        id: string;
        payment_no: string;
        direction: "receive" | "pay";
        ref_type: "invoice" | "purchase";
        ref_id: string;
        amount: number;
        payment_date: string;
        journal_entry_id: string;
        voided_at: string | null;
      }>();
    const payment = rows[0];
    if (!payment) return c.json({ error: "Pembayaran tidak ditemukan." }, 404);
    if (payment.voided_at) return c.json({ error: "Pembayaran sudah dibatalkan sebelumnya." }, 400);

    // JEBAKAN POS: pembayaran POS berbagi journal_entry_id dengan faktur
    // penjualannya — membalik jurnal itu ikut membalik pendapatan & HPP struk.
    const { results: posInv } = await db
      .prepare(`SELECT id FROM invoices WHERE journal_entry_id = ? LIMIT 1`)
      .bind(payment.journal_entry_id)
      .all<{ id: string }>();
    if (posInv[0]) {
      return c.json({ error: "Pembayaran POS menyatu dengan struknya — gunakan Retur/Refund di Kasir." }, 400);
    }

    if (parsed.data.date && parsed.data.date < payment.payment_date) {
      return c.json({ error: "Tanggal pembalikan tidak boleh sebelum tanggal pembayaran." }, 400);
    }

    let reversal: { id: string; entryNo: string };
    try {
      reversal = await reverseJournal(db, payment.journal_entry_id, {
        date: parsed.data.date,
        memo: `Pembatalan ${payment.payment_no}`,
        userId: c.get("user").id,
      });
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return c.json({ error: `${err.message} Kirim tanggal hari ini untuk membalik di periode berjalan.` }, 400);
      }
      if (err instanceof AlreadyReversedError) return c.json({ error: err.message }, 400);
      if (err instanceof Error && err.message === "Jurnal asal dokumen tidak ditemukan.") {
        return c.json({ error: err.message }, 400);
      }
      throw err;
    }

    await db
      .prepare(`UPDATE payments SET voided_at = datetime('now'), void_journal_entry_id = ? WHERE id = ?`)
      .bind(reversal.id, paymentId)
      .run();

    // Pulihkan sisa tagihan dokumen (pola recompute status yang sama dengan
    // pencatatan pembayaran).
    const cfg = payment.ref_type === "invoice" ? INVOICE_CFG : PURCHASE_CFG;
    const { results: docs } = await db
      .prepare(`SELECT ${cfg.noColumn} AS doc_no, total, paid_amount, returned_amount FROM ${cfg.table} WHERE id = ?`)
      .bind(payment.ref_id)
      .all<{ doc_no: string; total: number; paid_amount: number; returned_amount: number }>();
    const doc = docs[0];
    let newPaid = 0;
    if (doc) {
      newPaid = Math.max(doc.paid_amount - payment.amount, 0);
      await db
        .prepare(`UPDATE ${cfg.table} SET paid_amount = ?, status = ? WHERE id = ?`)
        .bind(newPaid, newPaid + doc.returned_amount >= doc.total ? "paid" : "posted", payment.ref_id)
        .run();
    }

    await audit(c.env, {
      action: "payment.voided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { paymentNo: payment.payment_no, docNo: doc?.doc_no, amount: payment.amount, reversalEntryNo: reversal.entryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, paymentNo: payment.payment_no, reversalEntryNo: reversal.entryNo, paidAmount: newPaid });
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
    // Webhook keluar (Fase 13h): stok menipis bila total qty produk ≤ min_stock.
    if (delta < 0) {
      const low = await db
        .prepare(
          `SELECT p.min_stock, COALESCE(SUM(s.qty), 0) AS total
           FROM products p LEFT JOIN stock_levels s ON s.product_id = p.id
           WHERE p.id = ? GROUP BY p.id`,
        )
        .bind(input.productId)
        .first<{ min_stock: number; total: number }>();
      if (low && low.min_stock > 0 && low.total <= low.min_stock) {
        await emitWebhook(c.env, tenant.id, "stock.low", { productId: input.productId, sku: product.sku, name: product.name, qty: low.total, minStock: low.min_stock });
      }
    }
    return c.json({ ok: true, delta, value, entryNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Transfer antar gudang: nilai persediaan berpindah pada biaya rata-rata —
  // total nilai perusahaan tidak berubah, jadi tidak perlu jurnal.
  // -------------------------------------------------------------------------
  .post("/:tenantId/stock-transfers", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = stockTransferSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return c.json(
        { error: flat.formErrors[0] ?? "Data tidak valid", issues: flat.fieldErrors as Record<string, string[]> },
        400,
      );
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: whs } = await db
      .prepare(`SELECT id FROM warehouses WHERE is_archived = 0 AND id IN (?, ?)`)
      .bind(input.fromWarehouseId, input.toWarehouseId)
      .all<{ id: string }>();
    if (whs.length !== 2) return c.json({ error: "Gudang asal/tujuan tidak ditemukan." }, 400);

    const transferId = crypto.randomUUID();
    let cost: number;
    try {
      cost = await stockOut(db, {
        productId: input.productId,
        warehouseId: input.fromWarehouseId,
        qty: input.qty,
        refType: "adjustment",
        refId: transferId,
      });
    } catch (err) {
      if (err instanceof InsufficientStockError) return c.json({ error: err.message }, 400);
      throw err;
    }
    await stockIn(db, {
      productId: input.productId,
      warehouseId: input.toWarehouseId,
      qty: input.qty,
      unitCost: Math.round(cost / input.qty),
      refType: "adjustment",
      refId: transferId,
    });

    await audit(c.env, {
      action: "inventory.transferred",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { productId: input.productId, qty: input.qty, from: input.fromWarehouseId, to: input.toWarehouseId },
      ip: clientIp(c),
    });
    return c.json({ ok: true, qty: input.qty, value: cost }, 201);
  })

  // -------------------------------------------------------------------------
  // Lot & kedaluwarsa: daftar lot aktif, urut kedaluwarsa terdekat (FEFO)
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock-lots", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const today = new Date().toISOString().slice(0, 10);
    const { results } = await db
      .prepare(
        `SELECT sl.id, sl.product_id, p.sku, p.name AS product_name, w.name AS warehouse_name,
                sl.lot_no, sl.expiry_date, sl.qty
         FROM stock_lots sl
         JOIN products p ON p.id = sl.product_id
         JOIN warehouses w ON w.id = sl.warehouse_id
         WHERE sl.qty > 0
         ORDER BY sl.expiry_date IS NULL, sl.expiry_date ASC`,
      )
      .all<{
        id: string;
        product_id: string;
        sku: string;
        product_name: string;
        warehouse_name: string;
        lot_no: string | null;
        expiry_date: string | null;
        qty: number;
      }>();

    const lots = results.map((r) => ({
      id: r.id,
      productId: r.product_id,
      sku: r.sku,
      productName: r.product_name,
      warehouseName: r.warehouse_name,
      lotNo: r.lot_no,
      expiryDate: r.expiry_date,
      qty: r.qty,
      daysToExpiry: r.expiry_date ? Math.ceil((Date.parse(r.expiry_date) - Date.parse(today)) / 86_400_000) : null,
    }));
    const expiringSoon = lots.filter((l) => l.daysToExpiry !== null && l.daysToExpiry <= 30).length;
    return c.json({ lots, expiringSoon });
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
