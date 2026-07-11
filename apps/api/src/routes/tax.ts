import {
  pph23DepositSchema,
  pph23Schema,
  pphFinalSchema,
  type ApiPph23,
  type ApiPphFinal,
  type ApiPphFinalPreview,
  type ApiSptPpn,
  type ApiSptPpnRow,
} from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { getLockedBefore, nextDocNo, postJournal } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Pajak UMKM (Fase 7d):
 * - PPh Final 0,5% (PP 55/2022): dihitung dari peredaran bruto (omzet) per masa bulan,
 *   dicatat sebagai Beban PPh Final dibayar dari kas/bank.
 * - PPh 23: pemotongan atas jasa/sewa/royalti/dll → bukti potong + Hutang PPh 23,
 *   lalu disetor (mengurangi hutang).
 * - SPT Masa PPN 1111: rekap keluaran (faktur ber-PPN) vs masukan (pembelian ber-PPN).
 */

const BEBAN_PPH_FINAL = "5-2100";
const HUTANG_PPH23 = "2-1400";
const PERIOD_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

async function ensureAccountByCode(db: SqlExecutor, code: string, name: string, type: "asset" | "liability" | "equity" | "income" | "expense"): Promise<string> {
  const { results } = await db.prepare(`SELECT id FROM accounts WHERE code = ?`).bind(code).all<{ id: string }>();
  if (results[0]) return results[0].id;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO accounts (id, code, name, type) VALUES (?, ?, ?, ?)`).bind(id, code, name, type).run();
  return id;
}

/** Peredaran bruto (omzet) suatu masa: total DPP faktur penjualan (non-batal) pada bulan itu. */
async function omzetForPeriod(db: SqlExecutor, period: string): Promise<number> {
  const { results } = await db
    .prepare(`SELECT COALESCE(SUM(subtotal), 0) AS omzet FROM invoices WHERE voided_at IS NULL AND substr(invoice_date, 1, 7) = ?`)
    .bind(period)
    .all<{ omzet: number }>();
  return results[0]?.omzet ?? 0;
}

async function assetAccount(db: SqlExecutor, id: string): Promise<boolean> {
  const { results } = await db.prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`).bind(id).all<{ type: string }>();
  return results[0]?.type === "asset";
}

export const taxRoutes = new Hono<AppEnv>()
  // --- PPh Final 0,5% -------------------------------------------------------
  .get("/:tenantId/tax/pph-final/preview", requireAuth, requireTenantRole("viewer"), async (c) => {
    const period = c.req.query("period") ?? "";
    if (!PERIOD_RE.test(period)) return c.json({ error: "Masa pajak harus format YYYY-MM." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const omzet = await omzetForPeriod(db, period);
    const rate = 0.5;
    const existing = await db.prepare(`SELECT id FROM tax_pph_final WHERE period = ?`).bind(period).all<{ id: string }>();
    const preview: ApiPphFinalPreview = { period, omzet, rate, amount: Math.round((omzet * rate) / 100), alreadyRecorded: Boolean(existing.results[0]) };
    return c.json(preview);
  })

  .get("/:tenantId/tax/pph-final", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, period, omzet, rate, amount, account_id, paid_date, created_at FROM tax_pph_final ORDER BY period DESC LIMIT 60`)
      .all<{ id: string; period: string; omzet: number; rate: number; amount: number; account_id: string; paid_date: string; created_at: string }>();
    const records: ApiPphFinal[] = results.map((r) => ({ id: r.id, period: r.period, omzet: r.omzet, rate: r.rate, amount: r.amount, accountId: r.account_id, paidDate: r.paid_date, createdAt: r.created_at }));
    return c.json({ records });
  })

  .post("/:tenantId/tax/pph-final", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = pphFinalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const dup = await db.prepare(`SELECT id FROM tax_pph_final WHERE period = ?`).bind(input.period).all<{ id: string }>();
    if (dup.results[0]) return c.json({ error: `Masa ${input.period} sudah dicatat.` }, 409);
    if (!(await assetAccount(db, input.accountId))) return c.json({ error: "Akun pembayaran harus akun kas/bank (aset)." }, 400);
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.paidDate <= lockedBefore) return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);

    const omzet = await omzetForPeriod(db, input.period);
    const rate = 0.5;
    const amount = Math.round((omzet * rate) / 100);
    if (amount <= 0) return c.json({ error: "Omzet masa ini 0 — tidak ada PPh Final untuk disetor." }, 400);

    const beban = await ensureAccountByCode(db, BEBAN_PPH_FINAL, "Beban PPh Final UMKM", "expense");
    const memo = `PPh Final UMKM 0,5% masa ${input.period}`;
    const journal = await postJournal(db, {
      entryDate: input.paidDate,
      memo,
      createdBy: c.get("user").id,
      lines: [
        { accountId: beban, description: memo, debit: amount, credit: 0 },
        { accountId: input.accountId, description: memo, debit: 0, credit: amount },
      ],
    });
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO tax_pph_final (id, period, omzet, rate, amount, account_id, journal_entry_id, paid_date, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, input.period, omzet, rate, amount, input.accountId, journal.id, input.paidDate, c.get("user").id)
      .run();
    await audit(c.env, { action: "tax.pph_final.paid", userId: c.get("user").id, tenantId: tenant.id, detail: { period: input.period, amount }, ip: clientIp(c) });
    return c.json({ ok: true, id, amount }, 201);
  })

  // --- PPh 23 (bukti potong) ------------------------------------------------
  .get("/:tenantId/tax/pph23", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT t.id, t.doc_no, t.contact_id, k.name AS contact_name, k.npwp AS contact_npwp,
                t.tax_date, t.object_type, t.gross, t.rate, t.amount, t.deposited, t.note, t.created_at
         FROM tax_pph23 t JOIN contacts k ON k.id = t.contact_id
         ORDER BY t.tax_date DESC, t.created_at DESC LIMIT 200`,
      )
      .all<{ id: string; doc_no: string; contact_id: string; contact_name: string; contact_npwp: string | null; tax_date: string; object_type: string; gross: number; rate: number; amount: number; deposited: number; note: string | null; created_at: string }>();
    const records: ApiPph23[] = results.map((r) => ({
      id: r.id,
      docNo: r.doc_no,
      contactId: r.contact_id,
      contactName: r.contact_name,
      contactNpwp: r.contact_npwp,
      taxDate: r.tax_date,
      objectType: r.object_type,
      gross: r.gross,
      rate: r.rate,
      amount: r.amount,
      deposited: r.deposited === 1,
      note: r.note,
      createdAt: r.created_at,
    }));
    return c.json({ records });
  })

  .post("/:tenantId/tax/pph23", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = pph23Schema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const cust = await db.prepare(`SELECT id FROM contacts WHERE id = ?`).bind(input.contactId).all<{ id: string }>();
    if (!cust.results[0]) return c.json({ error: "Rekanan tidak ditemukan." }, 404);
    const src = await db.prepare(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`).bind(input.sourceAccountId).all<{ id: string }>();
    if (!src.results[0]) return c.json({ error: "Akun sumber tidak ditemukan." }, 400);
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.taxDate <= lockedBefore) return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);

    const amount = Math.round((input.gross * input.rate) / 100);
    if (amount <= 0) return c.json({ error: "Nilai PPh 23 nol — periksa dasar & tarif." }, 400);

    const hutang = await ensureAccountByCode(db, HUTANG_PPH23, "Hutang PPh 23", "liability");
    const docNo = await nextDocNo(db, "tax_pph23", "BP23");
    const memo = `Bukti potong PPh 23 ${docNo}`;
    // Dr akun sumber (mis. Hutang Usaha yang dikurangi / kas) / Cr Hutang PPh 23.
    const journal = await postJournal(db, {
      entryDate: input.taxDate,
      memo,
      createdBy: c.get("user").id,
      lines: [
        { accountId: input.sourceAccountId, description: memo, debit: amount, credit: 0 },
        { accountId: hutang, description: memo, debit: 0, credit: amount },
      ],
    });
    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO tax_pph23 (id, doc_no, contact_id, tax_date, object_type, gross, rate, amount, source_account_id, journal_entry_id, note, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, docNo, input.contactId, input.taxDate, input.objectType, input.gross, input.rate, amount, input.sourceAccountId, journal.id, input.note ? input.note : null, c.get("user").id)
      .run();
    await audit(c.env, { action: "tax.pph23.withheld", userId: c.get("user").id, tenantId: tenant.id, detail: { docNo, amount }, ip: clientIp(c) });
    return c.json({ ok: true, id, docNo, amount }, 201);
  })

  .post("/:tenantId/tax/pph23/:id/deposit", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = pph23DepositSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const input = parsed.data;

    const { results } = await db.prepare(`SELECT doc_no, amount, deposited FROM tax_pph23 WHERE id = ?`).bind(id).all<{ doc_no: string; amount: number; deposited: number }>();
    const row = results[0];
    if (!row) return c.json({ error: "Bukti potong tidak ditemukan." }, 404);
    if (row.deposited === 1) return c.json({ error: "Bukti potong ini sudah disetor." }, 409);
    if (!(await assetAccount(db, input.accountId))) return c.json({ error: "Akun setor harus akun kas/bank (aset)." }, 400);
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.depositDate <= lockedBefore) return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup.` }, 400);

    const hutang = await ensureAccountByCode(db, HUTANG_PPH23, "Hutang PPh 23", "liability");
    const memo = `Setor PPh 23 ${row.doc_no}`;
    const journal = await postJournal(db, {
      entryDate: input.depositDate,
      memo,
      createdBy: c.get("user").id,
      lines: [
        { accountId: hutang, description: memo, debit: row.amount, credit: 0 },
        { accountId: input.accountId, description: memo, debit: 0, credit: row.amount },
      ],
    });
    await db.prepare(`UPDATE tax_pph23 SET deposited = 1, deposit_journal_id = ? WHERE id = ?`).bind(journal.id, id).run();
    await audit(c.env, { action: "tax.pph23.deposited", userId: c.get("user").id, tenantId: tenant.id, detail: { docNo: row.doc_no, amount: row.amount }, ip: clientIp(c) });
    return c.json({ ok: true });
  })

  // --- SPT Masa PPN 1111 ----------------------------------------------------
  .get("/:tenantId/tax/spt-ppn", requireAuth, requireTenantRole("viewer"), async (c) => {
    const period = c.req.query("period") ?? "";
    if (!PERIOD_RE.test(period)) return c.json({ error: "Masa pajak harus format YYYY-MM." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const { results: outputs } = await db
      .prepare(
        `SELECT i.invoice_no AS doc_no, i.invoice_date AS date, i.subtotal AS dpp, i.tax_amount AS ppn,
                k.name AS partner_name, k.npwp AS partner_npwp
         FROM invoices i JOIN contacts k ON k.id = i.contact_id
         WHERE i.tax_amount > 0 AND i.voided_at IS NULL AND substr(i.invoice_date, 1, 7) = ?
         ORDER BY i.invoice_date, i.invoice_no`,
      )
      .bind(period)
      .all<{ doc_no: string; date: string; dpp: number; ppn: number; partner_name: string; partner_npwp: string | null }>();

    const { results: inputs } = await db
      .prepare(
        `SELECT p.purchase_no AS doc_no, p.purchase_date AS date, p.subtotal AS dpp, p.tax_amount AS ppn,
                k.name AS partner_name, k.npwp AS partner_npwp
         FROM purchases p JOIN contacts k ON k.id = p.contact_id
         WHERE p.tax_amount > 0 AND p.voided_at IS NULL AND substr(p.purchase_date, 1, 7) = ?
         ORDER BY p.purchase_date, p.purchase_no`,
      )
      .bind(period)
      .all<{ doc_no: string; date: string; dpp: number; ppn: number; partner_name: string; partner_npwp: string | null }>();

    const toRow = (r: { doc_no: string; date: string; dpp: number; ppn: number; partner_name: string; partner_npwp: string | null }): ApiSptPpnRow => ({
      docNo: r.doc_no,
      date: r.date,
      partnerName: r.partner_name,
      partnerNpwp: r.partner_npwp,
      dpp: r.dpp,
      ppn: r.ppn,
    });
    const output = outputs.map(toRow);
    const input = inputs.map(toRow);
    const totalOutputPpn = output.reduce((s, r) => s + r.ppn, 0);
    const totalInputPpn = input.reduce((s, r) => s + r.ppn, 0);
    const body: ApiSptPpn = {
      period,
      output,
      input,
      totalOutputDpp: output.reduce((s, r) => s + r.dpp, 0),
      totalOutputPpn,
      totalInputDpp: input.reduce((s, r) => s + r.dpp, 0),
      totalInputPpn,
      net: totalOutputPpn - totalInputPpn,
    };
    return c.json(body);
  });
