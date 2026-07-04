import {
  createAccountSchema,
  createJournalEntrySchema,
  type ApiAccount,
  type ApiJournalEntry,
  type ApiJournalLine,
  type ApiTrialBalanceRow,
  type AccountType,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { PeriodLockedError, postJournal } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

type AccountRow = {
  id: string;
  code: string;
  name: string;
  type: AccountType;
  is_system: number;
  is_archived: number;
};

function toApiAccount(r: AccountRow): ApiAccount {
  return {
    id: r.id,
    code: r.code,
    name: r.name,
    type: r.type,
    isSystem: r.is_system === 1,
    isArchived: r.is_archived === 1,
  };
}

export const accountingRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Bagan Akun (COA)
  // -------------------------------------------------------------------------
  .get("/:tenantId/accounts", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(`SELECT id, code, name, type, is_system, is_archived FROM accounts ORDER BY code`)
      .all<AccountRow>();
    return c.json({ accounts: results.map(toApiAccount) });
  })

  .post("/:tenantId/accounts", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createAccountSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);

    const { results: dupes } = await db
      .prepare(`SELECT id FROM accounts WHERE code = ?`)
      .bind(parsed.data.code)
      .all();
    if (dupes.length > 0) return c.json({ error: `Kode akun ${parsed.data.code} sudah dipakai.` }, 409);

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO accounts (id, code, name, type) VALUES (?, ?, ?, ?)`)
      .bind(id, parsed.data.code, parsed.data.name, parsed.data.type)
      .run();

    await audit(c.env, {
      action: "accounting.account_created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { code: parsed.data.code, name: parsed.data.name },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .post("/:tenantId/accounts/:accountId/archive", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const accountId = c.req.param("accountId");

    const { results } = await db
      .prepare(`SELECT is_system FROM accounts WHERE id = ?`)
      .bind(accountId)
      .all<{ is_system: number }>();
    const account = results[0];
    if (!account) return c.json({ error: "Akun tidak ditemukan." }, 404);
    if (account.is_system === 1) return c.json({ error: "Akun sistem tidak dapat diarsipkan." }, 400);

    const { results: used } = await db
      .prepare(`SELECT id FROM journal_lines WHERE account_id = ? LIMIT 1`)
      .bind(accountId)
      .all();
    if (used.length > 0) {
      return c.json({ error: "Akun sudah dipakai di jurnal — arsipkan tidak diizinkan, riwayat harus utuh." }, 400);
    }

    await db.prepare(`UPDATE accounts SET is_archived = 1 WHERE id = ?`).bind(accountId).run();
    await audit(c.env, {
      action: "accounting.account_archived",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { accountId },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // -------------------------------------------------------------------------
  // Jurnal umum: dibuat langsung berstatus 'posted' dan IMMUTABLE.
  // Koreksi dilakukan lewat jurnal pembalik, bukan edit/hapus.
  // -------------------------------------------------------------------------
  .get("/:tenantId/journal-entries", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: entries } = await db
      .prepare(
        `SELECT id, entry_no, entry_date, memo, status FROM journal_entries
         ORDER BY entry_date DESC, entry_no DESC LIMIT 200`,
      )
      .all<{ id: string; entry_no: string; entry_date: string; memo: string | null; status: "posted" | "void" }>();

    const { results: lines } = await db
      .prepare(
        `SELECT l.id, l.entry_id, l.account_id, l.description, l.debit, l.credit, a.code, a.name
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id`,
      )
      .all<{
        id: string;
        entry_id: string;
        account_id: string;
        description: string | null;
        debit: number;
        credit: number;
        code: string;
        name: string;
      }>();

    const byEntry = new Map<string, ApiJournalLine[]>();
    for (const l of lines) {
      const list = byEntry.get(l.entry_id) ?? [];
      list.push({
        id: l.id,
        accountId: l.account_id,
        accountCode: l.code,
        accountName: l.name,
        description: l.description,
        debit: l.debit,
        credit: l.credit,
      });
      byEntry.set(l.entry_id, list);
    }

    const body: { entries: ApiJournalEntry[] } = {
      entries: entries.map((e) => ({
        id: e.id,
        entryNo: e.entry_no,
        entryDate: e.entry_date,
        memo: e.memo,
        status: e.status,
        lines: byEntry.get(e.id) ?? [],
      })),
    };
    return c.json(body);
  })

  .post("/:tenantId/journal-entries", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = createJournalEntrySchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      return c.json(
        {
          error: flat.formErrors[0] ?? "Data jurnal tidak valid",
          issues: flat.fieldErrors as Record<string, string[]>,
        },
        400,
      );
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Semua akun harus ada dan tidak diarsipkan.
    const accountIds = [...new Set(input.lines.map((l) => l.accountId))];
    const placeholders = accountIds.map(() => "?").join(",");
    const { results: found } = await db
      .prepare(`SELECT id FROM accounts WHERE is_archived = 0 AND id IN (${placeholders})`)
      .bind(...accountIds)
      .all<{ id: string }>();
    if (found.length !== accountIds.length) {
      return c.json({ error: "Ada akun yang tidak ditemukan atau sudah diarsipkan." }, 400);
    }

    if (input.projectId) {
      const { results } = await db.prepare(`SELECT id FROM projects WHERE id = ?`).bind(input.projectId).all();
      if (!results[0]) return c.json({ error: "Proyek tidak ditemukan." }, 400);
    }

    let entryId: string;
    let entryNo: string;
    try {
      ({ id: entryId, entryNo } = await postJournal(db, {
        entryDate: input.entryDate,
        memo: input.memo,
        createdBy: c.get("user").id,
        projectId: input.projectId,
        lines: input.lines.map((l) => ({
          accountId: l.accountId,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
        })),
      }));
    } catch (err) {
      if (err instanceof PeriodLockedError) return c.json({ error: err.message }, 400);
      throw err;
    }

    await audit(c.env, {
      action: "accounting.journal_posted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { entryNo, lines: input.lines.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: entryId, entryNo }, 201);
  })

  // -------------------------------------------------------------------------
  // Buku besar per akun
  // -------------------------------------------------------------------------
  .get("/:tenantId/ledger/:accountId", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const accountId = c.req.param("accountId");

    const { results: accounts } = await db
      .prepare(`SELECT id, code, name, type, is_system, is_archived FROM accounts WHERE id = ?`)
      .bind(accountId)
      .all<AccountRow>();
    const account = accounts[0];
    if (!account) return c.json({ error: "Akun tidak ditemukan." }, 404);

    const { results: rows } = await db
      .prepare(
        `SELECT e.entry_no, e.entry_date, e.memo, l.description, l.debit, l.credit
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
         WHERE l.account_id = ? AND e.status = 'posted'
         ORDER BY e.entry_date, e.entry_no`,
      )
      .bind(accountId)
      .all<{
        entry_no: string;
        entry_date: string;
        memo: string | null;
        description: string | null;
        debit: number;
        credit: number;
      }>();

    let balance = 0;
    const debitNormal = account.type === "asset" || account.type === "expense";
    const entries = rows.map((r) => {
      balance += debitNormal ? r.debit - r.credit : r.credit - r.debit;
      return {
        entryNo: r.entry_no,
        entryDate: r.entry_date,
        description: r.description ?? r.memo,
        debit: r.debit,
        credit: r.credit,
        balance,
      };
    });

    return c.json({ account: toApiAccount(account), entries, balance });
  })

  // -------------------------------------------------------------------------
  // Neraca saldo (trial balance)
  // -------------------------------------------------------------------------
  .get("/:tenantId/trial-balance", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT a.id AS account_id, a.code, a.name, a.type,
                COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
         FROM accounts a
         LEFT JOIN journal_lines l ON l.account_id = a.id
         LEFT JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         GROUP BY a.id HAVING debit > 0 OR credit > 0
         ORDER BY a.code`,
      )
      .all<{ account_id: string; code: string; name: string; type: AccountType; debit: number; credit: number }>();

    // Saldo bersih per akun di kolom sesuai saldo normalnya.
    const rows: ApiTrialBalanceRow[] = results.map((r) => {
      const net = r.debit - r.credit;
      return {
        accountId: r.account_id,
        code: r.code,
        name: r.name,
        type: r.type,
        debit: net > 0 ? net : 0,
        credit: net < 0 ? -net : 0,
      };
    });
    const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
    const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
    return c.json({ rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit });
  });
