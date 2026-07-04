import {
  calculatePayslip,
  employeeSchema,
  runPayrollSchema,
  type ApiEmployee,
  type ApiPayrollRun,
  type ApiPayslip,
  type PtkpStatus,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { accountIdByCode, getLockedBefore, nextDocNo, postJournal } from "../lib/accounting";
import { audit } from "../lib/audit";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";
import { clientIp } from "./auth";

/**
 * HR & Payroll (Fase 2o): karyawan + penggajian bulanan. Setiap run menghitung
 * PPh 21 (metode TER) & BPJS pekerja per karyawan, lalu memposting satu jurnal
 * beban gaji: Debit Beban Gaji (bruto), Kredit Kas (netto), Kredit Hutang Gaji
 * (potongan yang harus disetor). Perhitungan pajak ada di paket shared (teruji).
 */

const BEBAN_GAJI = "5-2000";
const HUTANG_GAJI = "2-1200";

export const payrollRoutes = new Hono<AppEnv>()

  .get("/:tenantId/employees", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT id, name, position, ptkp_status, base_salary, allowances, bank_account, join_date, is_active
         FROM employees ORDER BY is_active DESC, name`,
      )
      .all<{
        id: string;
        name: string;
        position: string | null;
        ptkp_status: PtkpStatus;
        base_salary: number;
        allowances: number;
        bank_account: string | null;
        join_date: string | null;
        is_active: number;
      }>();
    const employees: ApiEmployee[] = results.map((r) => ({
      id: r.id,
      name: r.name,
      position: r.position,
      ptkpStatus: r.ptkp_status,
      baseSalary: r.base_salary,
      allowances: r.allowances,
      bankAccount: r.bank_account,
      joinDate: r.join_date,
      isActive: r.is_active === 1,
    }));
    return c.json({ employees });
  })

  .post("/:tenantId/employees", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = employeeSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO employees (id, name, position, ptkp_status, base_salary, allowances, bank_account, join_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        input.name,
        input.position ?? null,
        input.ptkpStatus,
        input.baseSalary,
        input.allowances,
        input.bankAccount ?? null,
        input.joinDate ?? null,
      )
      .run();
    await audit(c.env, {
      action: "hr.employee.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, name: input.name },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .patch("/:tenantId/employees/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db.prepare(`SELECT id FROM employees WHERE id = ?`).bind(id).all<{ id: string }>();
    if (!results[0]) return c.json({ error: "Karyawan tidak ditemukan." }, 404);

    // Nonaktifkan/aktifkan atau perbarui field via skema parsial.
    if (typeof body.isActive === "boolean") {
      await db.prepare(`UPDATE employees SET is_active = ? WHERE id = ?`).bind(body.isActive ? 1 : 0, id).run();
    } else {
      const parsed = employeeSchema.safeParse(body);
      if (!parsed.success) {
        return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
      }
      const i = parsed.data;
      await db
        .prepare(
          `UPDATE employees SET name=?, position=?, ptkp_status=?, base_salary=?, allowances=?, bank_account=?, join_date=? WHERE id=?`,
        )
        .bind(i.name, i.position ?? null, i.ptkpStatus, i.baseSalary, i.allowances, i.bankAccount ?? null, i.joinDate ?? null, id)
        .run();
    }
    await audit(c.env, {
      action: "hr.employee.updated",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  .get("/:tenantId/payroll-runs", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results: runs } = await db
      .prepare(
        `SELECT r.id, r.run_no, r.period, r.status, r.total_gross, r.total_deductions, r.total_net, r.created_at,
                e.entry_no AS journal_no
         FROM payroll_runs r LEFT JOIN journal_entries e ON e.id = r.journal_entry_id
         ORDER BY r.period DESC`,
      )
      .all<{
        id: string;
        run_no: string;
        period: string;
        status: "posted";
        total_gross: number;
        total_deductions: number;
        total_net: number;
        created_at: string;
        journal_no: string | null;
      }>();

    const { results: slips } = await db
      .prepare(
        `SELECT p.id, p.run_id, p.employee_id, e.name AS employee_name, e.position, p.base_salary, p.allowances,
                p.gross, p.bpjs_health_employee, p.bpjs_jht_employee, p.bpjs_jp_employee, p.ter_category, p.ter_rate,
                p.pph21, p.total_deductions, p.net
         FROM payslips p JOIN employees e ON e.id = p.employee_id`,
      )
      .all<{
        id: string;
        run_id: string;
        employee_id: string;
        employee_name: string;
        position: string | null;
        base_salary: number;
        allowances: number;
        gross: number;
        bpjs_health_employee: number;
        bpjs_jht_employee: number;
        bpjs_jp_employee: number;
        ter_category: string;
        ter_rate: number;
        pph21: number;
        total_deductions: number;
        net: number;
      }>();

    const byRun = new Map<string, ApiPayslip[]>();
    for (const s of slips) {
      const list = byRun.get(s.run_id) ?? [];
      list.push({
        id: s.id,
        employeeId: s.employee_id,
        employeeName: s.employee_name,
        position: s.position,
        baseSalary: s.base_salary,
        allowances: s.allowances,
        gross: s.gross,
        bpjsHealthEmployee: s.bpjs_health_employee,
        bpjsJhtEmployee: s.bpjs_jht_employee,
        bpjsJpEmployee: s.bpjs_jp_employee,
        terCategory: s.ter_category,
        terRate: s.ter_rate,
        pph21: s.pph21,
        totalDeductions: s.total_deductions,
        net: s.net,
      });
      byRun.set(s.run_id, list);
    }

    const payrollRuns: ApiPayrollRun[] = runs.map((r) => ({
      id: r.id,
      runNo: r.run_no,
      period: r.period,
      status: r.status,
      totalGross: r.total_gross,
      totalDeductions: r.total_deductions,
      totalNet: r.total_net,
      journalNo: r.journal_no,
      createdAt: r.created_at,
      payslips: byRun.get(r.id) ?? [],
    }));
    return c.json({ runs: payrollRuns });
  })

  .post("/:tenantId/payroll-runs", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = runPayrollSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    // Satu run per periode.
    const { results: existing } = await db
      .prepare(`SELECT id FROM payroll_runs WHERE period = ?`)
      .bind(input.period)
      .all<{ id: string }>();
    if (existing[0]) return c.json({ error: `Penggajian periode ${input.period} sudah dijalankan.` }, 409);

    // Tutup buku: tanggal bayar tidak boleh di periode terkunci.
    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.paymentDate <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup — penggajian ditolak.` }, 400);
    }

    // Akun kas harus bertipe aset & aktif.
    const { results: accs } = await db
      .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
      .bind(input.cashAccountId)
      .all<{ type: string }>();
    if (!accs[0] || accs[0].type !== "asset") return c.json({ error: "Akun pembayar harus akun kas/bank (aset)." }, 400);

    const { results: emps } = await db
      .prepare(`SELECT id, ptkp_status, base_salary, allowances FROM employees WHERE is_active = 1`)
      .all<{ id: string; ptkp_status: PtkpStatus; base_salary: number; allowances: number }>();
    if (emps.length === 0) return c.json({ error: "Tidak ada karyawan aktif untuk digaji." }, 400);

    const runId = crypto.randomUUID();
    const runNo = await nextDocNo(db, "payroll_runs", "GAJI");

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    const slips = emps.map((e) => {
      const b = calculatePayslip({ baseSalary: e.base_salary, allowances: e.allowances, ptkpStatus: e.ptkp_status });
      totalGross += b.gross;
      totalDeductions += b.totalDeductions;
      totalNet += b.net;
      return { employeeId: e.id, base: e.base_salary, allowances: e.allowances, ...b };
    });

    const [bebanGaji, hutangGaji] = await Promise.all([
      accountIdByCode(db, BEBAN_GAJI),
      accountIdByCode(db, HUTANG_GAJI),
    ]);

    const journal = await postJournal(db, {
      entryDate: input.paymentDate,
      memo: `Penggajian ${input.period} (${runNo})`,
      createdBy: c.get("user").id,
      lines: [
        { accountId: bebanGaji, description: `Beban gaji ${input.period}`, debit: totalGross, credit: 0 },
        { accountId: input.cashAccountId, description: `Gaji netto ${input.period}`, debit: 0, credit: totalNet },
        ...(totalDeductions > 0
          ? [{ accountId: hutangGaji, description: `Potongan PPh21 & BPJS ${input.period}`, debit: 0, credit: totalDeductions }]
          : []),
      ],
    });

    await db
      .prepare(
        `INSERT INTO payroll_runs (id, run_no, period, status, total_gross, total_deductions, total_net, journal_entry_id, created_by)
         VALUES (?, ?, ?, 'posted', ?, ?, ?, ?, ?)`,
      )
      .bind(runId, runNo, input.period, totalGross, totalDeductions, totalNet, journal.id, c.get("user").id)
      .run();

    for (const s of slips) {
      await db
        .prepare(
          `INSERT INTO payslips (id, run_id, employee_id, base_salary, allowances, gross, bpjs_health_employee,
                                 bpjs_jht_employee, bpjs_jp_employee, ter_category, ter_rate, pph21, total_deductions, net)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          crypto.randomUUID(),
          runId,
          s.employeeId,
          s.base,
          s.allowances,
          s.gross,
          s.bpjsHealthEmployee,
          s.bpjsJhtEmployee,
          s.bpjsJpEmployee,
          s.terCategory,
          s.terRate,
          s.pph21,
          s.totalDeductions,
          s.net,
        )
        .run();
    }

    await audit(c.env, {
      action: "hr.payroll.run",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { runNo, period: input.period, totalGross, totalNet, employees: emps.length },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id: runId, runNo, totalGross, totalDeductions, totalNet, employees: emps.length }, 201);
  });
