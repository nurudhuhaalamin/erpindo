import {
  createAccountSchema,
  createJournalEntrySchema,
  renameAccountSchema,
  reverseJournalSchema,
  type ApiAccount,
  type ApiJournalEntry,
  type ApiJournalLine,
  type ApiTrialBalanceRow,
  type AccountType,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import {
  AlreadyReversedError,
  journalSourceDoc,
  PeriodLockedError,
  postJournal,
  reverseJournal,
} from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole, resolvePermissions } from "../middleware/auth";
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

  // Ganti nama akun saja — kode & tipe terkunci demi integritas laporan
  // (saldo & pemetaan akun sistem bergantung pada kode/tipe yang stabil).
  .patch("/:tenantId/accounts/:accountId", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = renameAccountSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const accountId = c.req.param("accountId");

    const { results } = await db
      .prepare(`SELECT code, name FROM accounts WHERE id = ?`)
      .bind(accountId)
      .all<{ code: string; name: string }>();
    const account = results[0];
    if (!account) return c.json({ error: "Akun tidak ditemukan." }, 404);

    await db.prepare(`UPDATE accounts SET name = ? WHERE id = ?`).bind(parsed.data.name, accountId).run();
    await audit(c.env, {
      action: "accounting.account_renamed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { code: account.code, from: account.name, to: parsed.data.name },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
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
    const q = (c.req.query("q") ?? "").trim();
    const limit = Math.min(Math.max(Number(c.req.query("limit")) || 100, 1), 500);
    const offset = Math.max(Number(c.req.query("offset")) || 0, 0);

    const binds: (string | number)[] = [];
    let whereSql = "";
    if (q) {
      const like = `%${q.replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
      whereSql = `WHERE (e.entry_no LIKE ? ESCAPE '\\' OR e.memo LIKE ? ESCAPE '\\')`;
      binds.push(like, like);
    }

    const [{ results: entries }, { results: countRows }] = await Promise.all([
      db
        .prepare(
          `SELECT e.id, e.entry_no, e.entry_date, e.memo, e.status,
                  r1.entry_no AS reversed_by_no, r2.entry_no AS reverses_no
           FROM journal_entries e
           LEFT JOIN journal_entries r1 ON r1.id = e.reversed_by_entry_id
           LEFT JOIN journal_entries r2 ON r2.id = e.reverses_entry_id
           ${whereSql} ORDER BY e.entry_date DESC, e.entry_no DESC LIMIT ? OFFSET ?`,
        )
        .bind(...binds, limit, offset)
        .all<{
          id: string;
          entry_no: string;
          entry_date: string;
          memo: string | null;
          status: "posted" | "void";
          reversed_by_no: string | null;
          reverses_no: string | null;
        }>(),
      db
        .prepare(`SELECT COUNT(*) AS n FROM journal_entries e ${whereSql}`)
        .bind(...binds)
        .all<{ n: number }>(),
    ]);
    const total = countRows[0]?.n ?? entries.length;
    if (entries.length === 0) return c.json({ entries: [], total, limit, offset });

    const { results: lines } = await db
      .prepare(
        `SELECT l.id, l.entry_id, l.account_id, l.description, l.debit, l.credit, a.code, a.name
         FROM journal_lines l JOIN accounts a ON a.id = l.account_id
         WHERE l.entry_id IN (${entries.map(() => "?").join(",")})`,
      )
      .bind(...entries.map((e) => e.id))
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

    const body: { entries: ApiJournalEntry[]; total: number; limit: number; offset: number } = {
      entries: entries.map((e) => ({
        id: e.id,
        entryNo: e.entry_no,
        entryDate: e.entry_date,
        memo: e.memo,
        status: e.status,
        lines: byEntry.get(e.id) ?? [],
        reversedByEntryNo: e.reversed_by_no,
        reversesEntryNo: e.reverses_no,
      })),
      total,
      limit,
      offset,
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

    // Validasi dimensi (cost center) opsional per baris (Fase 7f).
    const ccIds = [...new Set(input.lines.map((l) => l.costCenterId).filter((x): x is string => Boolean(x)))];
    if (ccIds.length > 0) {
      const { results } = await db.prepare(`SELECT id FROM cost_centers WHERE is_archived = 0 AND id IN (${ccIds.map(() => "?").join(",")})`).bind(...ccIds).all<{ id: string }>();
      if (results.length !== ccIds.length) return c.json({ error: "Ada cost center yang tidak ditemukan." }, 400);

      // RBAC berdimensi (Fase 8d): peran ber-scope hanya boleh membukukan ke
      // cost center dalam scope-nya. Scope NULL = tanpa batasan (jalur lama).
      const resolvedScope = await resolvePermissions(c.env, c.get("user").id, c.get("tenant").id);
      const ccScope = resolvedScope?.scopeCostCenterIds ?? null;
      if (ccScope && ccIds.some((id) => !ccScope.includes(id))) {
        return c.json({ error: "Anda tidak berwenang membukukan ke cost center di luar scope peran Anda." }, 403);
      }
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
          costCenterId: l.costCenterId,
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
  // Balik jurnal (Fase 10c): koreksi jurnal manual dengan jurnal pembalik
  // bertaut dua arah. Jurnal yang lahir dari dokumen (faktur, pembayaran,
  // gaji, dst.) diblokir — pembatalan harus lewat dokumennya agar stok/saldo
  // ikut terkoreksi.
  // -------------------------------------------------------------------------
  .post("/:tenantId/journal-entries/:id/reverse", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = reverseJournalSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return c.json({ error: "Data tidak valid" }, 400);
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const entryId = c.req.param("id");

    const { results: rows } = await db
      .prepare(
        `SELECT id, entry_no, entry_date, memo, status, reversed_by_entry_id, reverses_entry_id
         FROM journal_entries WHERE id = ?`,
      )
      .bind(entryId)
      .all<{
        id: string;
        entry_no: string;
        entry_date: string;
        memo: string | null;
        status: string;
        reversed_by_entry_id: string | null;
        reverses_entry_id: string | null;
      }>();
    const entry = rows[0];
    if (!entry) return c.json({ error: "Jurnal tidak ditemukan." }, 404);
    if (entry.status !== "posted") return c.json({ error: "Hanya jurnal terposting yang bisa dibalik." }, 400);
    if (entry.reverses_entry_id) {
      return c.json({ error: "Jurnal ini sendiri adalah pembalik — tidak bisa dibalik lagi." }, 400);
    }
    if (entry.reversed_by_entry_id) {
      return c.json({ error: `Jurnal ${entry.entry_no} sudah pernah dibalik.` }, 400);
    }

    const sourceDoc = await journalSourceDoc(db, entryId);
    if (sourceDoc) {
      return c.json({ error: `Jurnal ini berasal dari ${sourceDoc} — batalkan lewat dokumen tersebut.` }, 400);
    }
    // Jurnal sistem tanpa baris dokumen (tidak tertangkap pencarian di atas):
    // penyesuaian stok menggerakkan stok (membalik jurnalnya saja membuat
    // stok & buku tidak sinkron) dan jurnal penutup punya alur buka-tutup buku
    // sendiri. Pembatalan (pra-0037) tidak punya tautan — cegah balik ganda.
    const memo = entry.memo ?? "";
    if (memo.startsWith("Penyesuaian stok ")) {
      return c.json({ error: "Jurnal penyesuaian stok — koreksi lewat opname pembalik di halaman Stok." }, 400);
    }
    if (memo.startsWith("Jurnal penutup ")) {
      return c.json({ error: "Jurnal penutup tidak bisa dibalik — buka kembali periode lewat Tutup Buku." }, 400);
    }
    if (memo.startsWith("Pembatalan ")) {
      return c.json({ error: "Jurnal ini sendiri adalah pembalik — tidak bisa dibalik lagi." }, 400);
    }

    if (parsed.data.date && parsed.data.date < entry.entry_date) {
      return c.json({ error: "Tanggal pembalikan tidak boleh sebelum tanggal jurnal asal." }, 400);
    }

    let reversal: { id: string; entryNo: string };
    try {
      reversal = await reverseJournal(db, entryId, {
        date: parsed.data.date,
        memo: `Pembalikan ${entry.entry_no}`,
        userId: c.get("user").id,
      });
    } catch (err) {
      if (err instanceof PeriodLockedError) {
        return c.json({ error: `${err.message} Kirim tanggal hari ini untuk membalik di periode berjalan.` }, 400);
      }
      if (err instanceof AlreadyReversedError) return c.json({ error: err.message }, 400);
      throw err;
    }

    await audit(c.env, {
      action: "accounting.journal_reversed",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { entryNo: entry.entry_no, reversalEntryNo: reversal.entryNo },
      ip: clientIp(c),
    });
    return c.json({ ok: true, entryNo: entry.entry_no, reversalEntryNo: reversal.entryNo }, 201);
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

    // Paginasi keyset (Fase 9a): default memuat `limit` baris TERBARU dengan
    // saldo awal (openingBalance) dihitung agregat, sehingga saldo berjalan
    // tetap benar. Kursor `before` (entry_date|entry_no|line_id) memuat
    // jendela lebih lama. Tanpa parameter, akun kecil berperilaku persis lama.
    const rawLimit = Number(c.req.query("limit") ?? "1000");
    const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 2000) : 1000;
    const before = c.req.query("before");

    type LedgerRow = {
      line_id: string;
      entry_no: string;
      entry_date: string;
      memo: string | null;
      description: string | null;
      debit: number;
      credit: number;
    };

    let cursorCond = "";
    const binds: unknown[] = [accountId];
    if (before) {
      const parts = before.split("|");
      if (parts.length !== 3 || parts.some((p) => !p)) return c.json({ error: "Kursor tidak valid." }, 400);
      cursorCond = ` AND (e.entry_date, e.entry_no, l.id) < (?, ?, ?)`;
      binds.push(parts[0], parts[1], parts[2]);
    }
    binds.push(limit + 1);

    const { results: newestFirst } = await db
      .prepare(
        `SELECT l.id AS line_id, e.entry_no, e.entry_date, e.memo, l.description, l.debit, l.credit
         FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
         WHERE l.account_id = ? AND e.status = 'posted'${cursorCond}
         ORDER BY e.entry_date DESC, e.entry_no DESC, l.id DESC
         LIMIT ?`,
      )
      .bind(...binds)
      .all<LedgerRow>();

    const hasMore = newestFirst.length > limit;
    const rows = newestFirst.slice(0, limit).reverse(); // urut naik untuk saldo berjalan

    // Saldo sebelum baris pertama jendela (0 bila jendela mencakup semuanya).
    const debitNormal = account.type === "asset" || account.type === "expense";
    let openingBalance = 0;
    const first = rows[0];
    if (first && (hasMore || before)) {
      const agg = (
        await db
          .prepare(
            `SELECT COALESCE(SUM(l.debit), 0) AS d, COALESCE(SUM(l.credit), 0) AS cr
             FROM journal_lines l JOIN journal_entries e ON e.id = l.entry_id
             WHERE l.account_id = ? AND e.status = 'posted' AND (e.entry_date, e.entry_no, l.id) < (?, ?, ?)`,
          )
          .bind(accountId, first.entry_date, first.entry_no, first.line_id)
          .all<{ d: number; cr: number }>()
      ).results[0];
      openingBalance = debitNormal ? (agg?.d ?? 0) - (agg?.cr ?? 0) : (agg?.cr ?? 0) - (agg?.d ?? 0);
    }

    let balance = openingBalance;
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

    const nextCursor = hasMore && first ? `${first.entry_date}|${first.entry_no}|${first.line_id}` : null;
    return c.json({ account: toApiAccount(account), entries, balance, openingBalance, nextCursor });
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
