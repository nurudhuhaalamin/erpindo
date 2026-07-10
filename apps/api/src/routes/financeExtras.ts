import { bankImportSchema, journalTemplateSchema, type ApiBankStatementItem, type ApiJournalTemplate } from "@erpindo/shared";
import type { SqlExecutor } from "@erpindo/db";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { postJournal, PeriodLockedError } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * Keuangan lanjut (Fase 5d): template jurnal berulang + rekonsiliasi bank v1.
 *
 * - Template = jurnal siap pakai (sewa, listrik, dsb.). Terbit manual sekali
 *   klik, atau otomatis bulanan via cron bila schedule='monthly'.
 * - Rekonsiliasi: impor mutasi rekening koran (CSV di sisi klien → JSON),
 *   auto-match ke baris jurnal akun tsb. (nominal sama, tanggal ±3 hari),
 *   sisanya dicocokkan manual. Tidak pernah mengubah jurnal — hanya menandai.
 */

const MATCH_WINDOW_DAYS = 3;

function addMonthsClamped(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const base = new Date(Date.UTC(y!, m! - 1 + months, 1));
  const lastDay = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + 1, 0)).getUTCDate();
  return `${base.getUTCFullYear()}-${String(base.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d!, lastDay)).padStart(2, "0")}`;
}

function shiftDays(dateStr: string, days: number): string {
  const t = new Date(`${dateStr}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + days);
  return t.toISOString().slice(0, 10);
}

type TemplateRow = {
  id: string;
  name: string;
  memo: string | null;
  lines: string;
  schedule: string | null;
  next_run_date: string | null;
  is_active: number;
};

type StoredLine = { accountId: string; debit: number; credit: number };

/** Posting otomatis template terjadwal yang jatuh tempo (dipanggil cron harian). */
export async function runScheduledTemplates(db: SqlExecutor, today: string, createdBy: string): Promise<{ posted: number }> {
  const { results } = await db
    .prepare(
      `SELECT * FROM journal_templates
       WHERE is_active = 1 AND schedule = 'monthly' AND next_run_date IS NOT NULL AND next_run_date <= ?`,
    )
    .bind(today)
    .all<TemplateRow>();
  let posted = 0;
  for (const t of results) {
    const runDate = t.next_run_date!;
    try {
      const lines = JSON.parse(t.lines) as StoredLine[];
      await postJournal(db, { entryDate: runDate, memo: t.memo ?? t.name, createdBy, lines });
      posted++;
    } catch (err) {
      // Periode terkunci/akun terarsip: jangan macet — lewati posting periode
      // ini tapi tetap majukan jadwal agar tidak menumpuk selamanya.
      console.error(`[cron] template jurnal '${t.name}' gagal diposting:`, err);
    }
    await db
      .prepare(`UPDATE journal_templates SET next_run_date = ? WHERE id = ?`)
      .bind(addMonthsClamped(runDate, 1), t.id)
      .run();
  }
  return { posted };
}

/** Baris jurnal kandidat pencocokan untuk satu akun (nominal bertanda = debit − kredit). */
async function candidateLines(db: SqlExecutor, accountId: string) {
  const { results } = await db
    .prepare(
      `SELECT jl.id, jl.debit, jl.credit, je.entry_no, je.entry_date, COALESCE(jl.description, je.memo, '') AS description
       FROM journal_lines jl
       JOIN journal_entries je ON je.id = jl.entry_id
       WHERE jl.account_id = ?
         AND jl.id NOT IN (SELECT matched_journal_line_id FROM bank_statement_items WHERE matched_journal_line_id IS NOT NULL)
       ORDER BY je.entry_date DESC
       LIMIT 400`,
    )
    .bind(accountId)
    .all<{ id: string; debit: number; credit: number; entry_no: string; entry_date: string; description: string }>();
  return results.map((r) => ({
    id: r.id,
    entryNo: r.entry_no,
    entryDate: r.entry_date,
    description: r.description,
    amount: r.debit - r.credit,
  }));
}

export const financeExtraRoutes = new Hono<AppEnv>()

  // ------------------------------- Template jurnal --------------------------
  .get("/:tenantId/journal-templates", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db.prepare(`SELECT * FROM journal_templates ORDER BY name`).all<TemplateRow>();
    const { results: accounts } = await db
      .prepare(`SELECT id, code, name FROM accounts`)
      .all<{ id: string; code: string; name: string }>();
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const templates: ApiJournalTemplate[] = results.map((t) => ({
      id: t.id,
      name: t.name,
      memo: t.memo,
      lines: (JSON.parse(t.lines) as StoredLine[]).map((l) => ({
        accountId: l.accountId,
        accountCode: byId.get(l.accountId)?.code ?? "?",
        accountName: byId.get(l.accountId)?.name ?? "(akun terhapus)",
        debit: l.debit,
        credit: l.credit,
      })),
      schedule: (t.schedule as "monthly" | null) ?? null,
      nextRunDate: t.next_run_date,
      isActive: t.is_active === 1,
    }));
    return c.json({ templates });
  })

  .post("/:tenantId/journal-templates", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = journalTemplateSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const { name, memo, lines, schedule, nextRunDate } = parsed.data;
    const debit = lines.reduce((s, l) => s + l.debit, 0);
    const credit = lines.reduce((s, l) => s + l.credit, 0);
    if (debit !== credit || debit === 0) {
      return c.json({ error: "Template harus seimbang (total debit = total kredit, bukan nol)." }, 400);
    }
    if (schedule && !nextRunDate) {
      return c.json({ error: "Jadwal bulanan membutuhkan tanggal terbit pertama." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    for (const l of lines) {
      const acc = await db.prepare(`SELECT id FROM accounts WHERE id = ? AND is_archived = 0`).bind(l.accountId).all();
      if (acc.results.length === 0) return c.json({ error: "Ada baris dengan akun yang tidak dikenal/terarsip." }, 400);
    }
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO journal_templates (id, name, memo, lines, schedule, next_run_date, is_active, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
      )
      .bind(
        id,
        name,
        memo ?? null,
        JSON.stringify(lines.map((l) => ({ accountId: l.accountId, debit: l.debit, credit: l.credit }))),
        schedule ?? null,
        schedule ? (nextRunDate ?? null) : null,
        new Date().toISOString(),
      )
      .run();
    await audit(c.env, { action: "accounting.template_created", userId: c.get("user").id, tenantId: c.get("tenant").id, detail: { name }, ip: clientIp(c) });
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/journal-templates/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    await db.prepare(`DELETE FROM journal_templates WHERE id = ?`).bind(c.req.param("id")).run();
    return c.json({ ok: true });
  })

  /** Terbitkan template sekarang (manual) — jurnal bertanggal hari ini. */
  .post("/:tenantId/journal-templates/:id/post", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db.prepare(`SELECT * FROM journal_templates WHERE id = ?`).bind(c.req.param("id")).all<TemplateRow>();
    const t = results[0];
    if (!t) return c.json({ error: "Template tidak ditemukan." }, 404);
    try {
      const res = await postJournal(db, {
        entryDate: new Date().toISOString().slice(0, 10),
        memo: t.memo ?? t.name,
        createdBy: c.get("user").id,
        lines: JSON.parse(t.lines) as StoredLine[],
      });
      return c.json({ ok: true, entryNo: res.entryNo }, 201);
    } catch (err) {
      if (err instanceof PeriodLockedError) return c.json({ error: err.message }, 409);
      return c.json({ error: (err as Error).message }, 400);
    }
  })

  // ------------------------------ Rekonsiliasi bank --------------------------
  .post("/:tenantId/bank-recon/import", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = bankImportSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const { accountId, items } = parsed.data;
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const acc = await db
      .prepare(`SELECT id FROM accounts WHERE id = ? AND type = 'asset' AND is_archived = 0`)
      .bind(accountId)
      .all();
    if (acc.results.length === 0) return c.json({ error: "Pilih akun kas/bank yang valid." }, 400);

    const candidates = await candidateLines(db, accountId);
    const used = new Set<string>();
    let autoMatched = 0;
    const now = new Date().toISOString();
    for (const item of items) {
      const lo = shiftDays(item.date, -MATCH_WINDOW_DAYS);
      const hi = shiftDays(item.date, MATCH_WINDOW_DAYS);
      const hit = candidates.find((l) => !used.has(l.id) && l.amount === item.amount && l.entryDate >= lo && l.entryDate <= hi);
      if (hit) {
        used.add(hit.id);
        autoMatched++;
      }
      await db
        .prepare(
          `INSERT INTO bank_statement_items (id, account_id, stmt_date, description, amount, matched_journal_line_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(crypto.randomUUID(), accountId, item.date, item.description, item.amount, hit?.id ?? null, now)
        .run();
    }
    await audit(c.env, { action: "accounting.bank_imported", userId: c.get("user").id, tenantId: c.get("tenant").id, detail: { count: items.length, autoMatched }, ip: clientIp(c) });
    return c.json({ ok: true, imported: items.length, autoMatched }, 201);
  })

  .get("/:tenantId/bank-recon", requireAuth, requireTenantRole("viewer"), async (c) => {
    const accountId = c.req.query("accountId") ?? "";
    if (!accountId) return c.json({ error: "accountId wajib diisi" }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT b.id, b.stmt_date, b.description, b.amount, b.matched_journal_line_id, je.entry_no
         FROM bank_statement_items b
         LEFT JOIN journal_lines jl ON jl.id = b.matched_journal_line_id
         LEFT JOIN journal_entries je ON je.id = jl.entry_id
         WHERE b.account_id = ?
         ORDER BY b.stmt_date DESC, b.description
         LIMIT 500`,
      )
      .bind(accountId)
      .all<{ id: string; stmt_date: string; description: string; amount: number; matched_journal_line_id: string | null; entry_no: string | null }>();
    const items: ApiBankStatementItem[] = results.map((r) => ({
      id: r.id,
      stmtDate: r.stmt_date,
      description: r.description,
      amount: r.amount,
      matchedJournalLineId: r.matched_journal_line_id,
      matchedEntryNo: r.entry_no,
    }));
    const unmatchedLines = (await candidateLines(db, accountId)).slice(0, 100);
    const matched = items.filter((i) => i.matchedJournalLineId !== null).length;
    return c.json({
      items,
      unmatchedLines,
      summary: { total: items.length, matched, unmatched: items.length - matched },
    });
  })

  .post("/:tenantId/bank-recon/:itemId/match", requireAuth, requireTenantRole("admin"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { journalLineId?: string };
    if (!body.journalLineId) return c.json({ error: "journalLineId wajib diisi" }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const item = (
      await db.prepare(`SELECT id, account_id FROM bank_statement_items WHERE id = ?`).bind(c.req.param("itemId")).all<{ id: string; account_id: string }>()
    ).results[0];
    if (!item) return c.json({ error: "Baris mutasi tidak ditemukan." }, 404);
    const line = (
      await db.prepare(`SELECT id FROM journal_lines WHERE id = ? AND account_id = ?`).bind(body.journalLineId, item.account_id).all()
    ).results[0];
    if (!line) return c.json({ error: "Baris jurnal tidak ditemukan pada akun yang sama." }, 400);
    const taken = (
      await db.prepare(`SELECT id FROM bank_statement_items WHERE matched_journal_line_id = ? AND id != ?`).bind(body.journalLineId, item.id).all()
    ).results[0];
    if (taken) return c.json({ error: "Baris jurnal itu sudah dicocokkan ke mutasi lain." }, 409);
    await db.prepare(`UPDATE bank_statement_items SET matched_journal_line_id = ? WHERE id = ?`).bind(body.journalLineId, item.id).run();
    return c.json({ ok: true });
  })

  .post("/:tenantId/bank-recon/:itemId/unmatch", requireAuth, requireTenantRole("admin"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    await db.prepare(`UPDATE bank_statement_items SET matched_journal_line_id = NULL WHERE id = ?`).bind(c.req.param("itemId")).run();
    return c.json({ ok: true });
  })

  /** Jurnal penutup tahunan: pindahkan laba berjalan s.d. tanggal ke Laba Ditahan. */
  .post("/:tenantId/closing-entry", requireAuth, requireTenantRole("owner"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { asOf?: string };
    const asOf = body.asOf ?? "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return c.json({ error: "Tanggal tidak valid (YYYY-MM-DD)" }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT a.id, a.type, SUM(jl.credit) - SUM(jl.debit) AS net
         FROM journal_lines jl
         JOIN journal_entries je ON je.id = jl.entry_id
         JOIN accounts a ON a.id = jl.account_id
         WHERE a.type IN ('income', 'expense') AND je.entry_date <= ?
         GROUP BY a.id, a.type
         HAVING net != 0`,
      )
      .bind(asOf)
      .all<{ id: string; type: string; net: number }>();
    if (results.length === 0) return c.json({ error: "Tidak ada saldo pendapatan/beban untuk ditutup." }, 400);
    const retained = (
      await db.prepare(`SELECT id FROM accounts WHERE code = '3-2000'`).all<{ id: string }>()
    ).results[0];
    if (!retained) return c.json({ error: "Akun Laba Ditahan (3-2000) tidak ditemukan." }, 400);

    // Balik saldo tiap akun P/L (income bersaldo kredit → debit; expense sebaliknya),
    // selisihnya (laba/rugi bersih) mendarat di Laba Ditahan.
    const lines = results.map((r) => ({
      accountId: r.id,
      debit: r.net > 0 ? r.net : 0,
      credit: r.net < 0 ? -r.net : 0,
    }));
    const netProfit = results.reduce((s, r) => s + r.net, 0);
    lines.push({ accountId: retained.id, debit: netProfit < 0 ? -netProfit : 0, credit: netProfit > 0 ? netProfit : 0 });
    try {
      const res = await postJournal(db, {
        entryDate: asOf,
        memo: `Jurnal penutup s.d. ${asOf} — laba/rugi bersih ke Laba Ditahan`,
        createdBy: c.get("user").id,
        lines: lines.filter((l) => l.debit !== 0 || l.credit !== 0),
      });
      await audit(c.env, { action: "accounting.closing_entry", userId: c.get("user").id, tenantId: c.get("tenant").id, detail: { asOf, netProfit }, ip: clientIp(c) });
      return c.json({ ok: true, entryNo: res.entryNo, netProfit }, 201);
    } catch (err) {
      if (err instanceof PeriodLockedError) return c.json({ error: err.message }, 409);
      return c.json({ error: (err as Error).message }, 400);
    }
  });
