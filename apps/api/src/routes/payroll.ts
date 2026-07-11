import {
  attendanceSchema,
  calculatePayslip,
  decideLeaveSchema,
  employeeLoanSchema,
  employeeSchema,
  leaveRequestSchema,
  payrollAdjustmentSchema,
  runPayrollSchema,
  type ApiAttendance,
  type ApiAttendanceRecap,
  type ApiEmployee,
  type ApiEmployeeLoan,
  type ApiLeaveRequest,
  type ApiPayrollAdjustment,
  type ApiPayrollRun,
  type ApiPayslip,
  type AttendanceStatus,
  type LeaveType,
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
const PIUTANG_KARYAWAN = "1-1210";

/**
 * Pastikan akun dengan kode tertentu ada (tenant lama tidak punya akun kasbon
 * di template COA-nya) — buat sekali bila belum ada, lalu kembalikan id-nya.
 */
async function ensureAccountByCode(
  db: ReturnType<typeof getTenantDb>,
  code: string,
  name: string,
  type: "asset" | "liability" | "equity" | "income" | "expense",
): Promise<string> {
  const { results } = await db.prepare(`SELECT id FROM accounts WHERE code = ?`).bind(code).all<{ id: string }>();
  if (results[0]) return results[0].id;
  const id = crypto.randomUUID();
  await db.prepare(`INSERT INTO accounts (id, code, name, type) VALUES (?, ?, ?, ?)`).bind(id, code, name, type).run();
  return id;
}

/** Jumlah hari kalender inklusif antara dua tanggal ISO (YYYY-MM-DD). */
function inclusiveDays(startDate: string, endDate: string): number {
  const ms = Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`);
  return Math.round(ms / 86_400_000) + 1;
}

export const payrollRoutes = new Hono<AppEnv>()

  .get("/:tenantId/employees", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT id, name, position, ptkp_status, base_salary, allowances, bank_account, join_date, is_active, leave_balance
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
        leave_balance: number;
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
      leaveBalance: r.leave_balance,
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
                p.pph21, p.total_deductions, p.net, p.adjustments_total, p.loan_deduction
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
        adjustments_total: number;
        loan_deduction: number;
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
        adjustmentsTotal: s.adjustments_total,
        loanDeduction: s.loan_deduction,
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

    // Komponen ad-hoc periode ini (bonus/lembur/potongan) — ikut bruto & pajak.
    const { results: adjRows } = await db
      .prepare(`SELECT id, employee_id, amount FROM payroll_adjustments WHERE period = ? AND run_id IS NULL`)
      .bind(input.period)
      .all<{ id: string; employee_id: string; amount: number }>();
    const adjByEmployee = new Map<string, number>();
    for (const a of adjRows) {
      adjByEmployee.set(a.employee_id, (adjByEmployee.get(a.employee_id) ?? 0) + a.amount);
    }

    // Kasbon aktif — cicilan dipotong dari netto (bukan bruto, tidak kena pajak).
    const { results: loanRows } = await db
      .prepare(`SELECT id, employee_id, monthly_deduction, balance FROM employee_loans WHERE status = 'active' AND balance > 0`)
      .all<{ id: string; employee_id: string; monthly_deduction: number; balance: number }>();

    const runId = crypto.randomUUID();
    const runNo = await nextDocNo(db, "payroll_runs", "GAJI");

    let totalGross = 0;
    let totalDeductions = 0;
    let totalNet = 0;
    let totalLoanDeduction = 0;
    const loanUpdates: { id: string; deduction: number; newBalance: number }[] = [];
    const slips = [];
    for (const e of emps) {
      const adjTotal = adjByEmployee.get(e.id) ?? 0;
      if (e.base_salary + e.allowances + adjTotal < 0) {
        return c.json({ error: "Total potongan ad-hoc melebihi gaji karyawan — periksa kembali komponennya." }, 400);
      }
      const b = calculatePayslip({
        baseSalary: e.base_salary,
        allowances: e.allowances + adjTotal,
        ptkpStatus: e.ptkp_status,
      });

      // Cicilan kasbon: maksimal saldo pinjaman dan tidak melebihi netto slip.
      let loanDeduction = 0;
      let roomLeft = b.net;
      for (const loan of loanRows.filter((l) => l.employee_id === e.id)) {
        const cut = Math.min(loan.monthly_deduction, loan.balance, roomLeft);
        if (cut <= 0) continue;
        loanDeduction += cut;
        roomLeft -= cut;
        loanUpdates.push({ id: loan.id, deduction: cut, newBalance: loan.balance - cut });
      }

      totalGross += b.gross;
      totalDeductions += b.totalDeductions;
      totalNet += b.net - loanDeduction;
      totalLoanDeduction += loanDeduction;
      slips.push({ employeeId: e.id, base: e.base_salary, allowances: e.allowances, adjTotal, loanDeduction, ...b });
    }

    const [bebanGaji, hutangGaji] = await Promise.all([
      accountIdByCode(db, BEBAN_GAJI),
      accountIdByCode(db, HUTANG_GAJI),
    ]);
    const piutangKaryawan =
      totalLoanDeduction > 0 ? await ensureAccountByCode(db, PIUTANG_KARYAWAN, "Piutang Karyawan", "asset") : null;

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
        ...(piutangKaryawan && totalLoanDeduction > 0
          ? [{ accountId: piutangKaryawan, description: `Cicilan kasbon ${input.period}`, debit: 0, credit: totalLoanDeduction }]
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
                                 bpjs_jht_employee, bpjs_jp_employee, ter_category, ter_rate, pph21, total_deductions, net,
                                 adjustments_total, loan_deduction)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
          s.net - s.loanDeduction,
          s.adjTotal,
          s.loanDeduction,
        )
        .run();
    }

    // Tandai komponen ad-hoc terpakai & majukan saldo kasbon.
    for (const a of adjRows) {
      await db.prepare(`UPDATE payroll_adjustments SET run_id = ? WHERE id = ?`).bind(runId, a.id).run();
    }
    for (const u of loanUpdates) {
      await db
        .prepare(`UPDATE employee_loans SET balance = ?, status = CASE WHEN ? <= 0 THEN 'paid' ELSE 'active' END WHERE id = ?`)
        .bind(u.newBalance, u.newBalance, u.id)
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
  })

  // ---------------------------------------------------------------------------
  // Komponen ad-hoc per periode (Fase 5f): bonus/lembur/potongan sekali jalan.
  // ---------------------------------------------------------------------------

  .get("/:tenantId/payroll-adjustments", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const period = c.req.query("period");
    const { results } = await db
      .prepare(
        `SELECT a.id, a.period, a.employee_id, e.name AS employee_name, a.name, a.amount, a.run_id, a.created_at
         FROM payroll_adjustments a JOIN employees e ON e.id = a.employee_id
         ${period ? "WHERE a.period = ?" : ""}
         ORDER BY a.period DESC, a.created_at DESC LIMIT 200`,
      )
      .bind(...(period ? [period] : []))
      .all<{
        id: string;
        period: string;
        employee_id: string;
        employee_name: string;
        name: string;
        amount: number;
        run_id: string | null;
        created_at: string;
      }>();
    const adjustments: ApiPayrollAdjustment[] = results.map((r) => ({
      id: r.id,
      period: r.period,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      name: r.name,
      amount: r.amount,
      runId: r.run_id,
      createdAt: r.created_at,
    }));
    return c.json({ adjustments });
  })

  .post("/:tenantId/payroll-adjustments", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = payrollAdjustmentSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: emp } = await db
      .prepare(`SELECT id FROM employees WHERE id = ? AND is_active = 1`)
      .bind(input.employeeId)
      .all<{ id: string }>();
    if (!emp[0]) return c.json({ error: "Karyawan tidak ditemukan atau nonaktif." }, 404);

    const { results: ran } = await db
      .prepare(`SELECT id FROM payroll_runs WHERE period = ?`)
      .bind(input.period)
      .all<{ id: string }>();
    if (ran[0]) return c.json({ error: `Periode ${input.period} sudah digaji — komponen tidak bisa ditambahkan.` }, 409);

    const id = crypto.randomUUID();
    await db
      .prepare(`INSERT INTO payroll_adjustments (id, period, employee_id, name, amount) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, input.period, input.employeeId, input.name, input.amount)
      .run();
    await audit(c.env, {
      action: "hr.adjustment.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, period: input.period, name: input.name, amount: input.amount },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id }, 201);
  })

  .delete("/:tenantId/payroll-adjustments/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db
      .prepare(`SELECT run_id FROM payroll_adjustments WHERE id = ?`)
      .bind(id)
      .all<{ run_id: string | null }>();
    if (!results[0]) return c.json({ error: "Komponen tidak ditemukan." }, 404);
    if (results[0].run_id) return c.json({ error: "Komponen sudah terpakai di penggajian — tidak bisa dihapus." }, 409);
    await db.prepare(`DELETE FROM payroll_adjustments WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "hr.adjustment.deleted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // ---------------------------------------------------------------------------
  // Kasbon/pinjaman karyawan (Fase 5f): pencairan berjurnal + cicilan otomatis.
  // ---------------------------------------------------------------------------

  .get("/:tenantId/employee-loans", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT l.id, l.employee_id, e.name AS employee_name, l.name, l.principal, l.monthly_deduction,
                l.balance, l.status, j.entry_no AS journal_no, l.created_at
         FROM employee_loans l
         JOIN employees e ON e.id = l.employee_id
         LEFT JOIN journal_entries j ON j.id = l.journal_entry_id
         ORDER BY l.status = 'active' DESC, l.created_at DESC LIMIT 200`,
      )
      .all<{
        id: string;
        employee_id: string;
        employee_name: string;
        name: string;
        principal: number;
        monthly_deduction: number;
        balance: number;
        status: "active" | "paid";
        journal_no: string | null;
        created_at: string;
      }>();
    const loans: ApiEmployeeLoan[] = results.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      name: r.name,
      principal: r.principal,
      monthlyDeduction: r.monthly_deduction,
      balance: r.balance,
      status: r.status,
      journalNo: r.journal_no,
      createdAt: r.created_at,
    }));
    return c.json({ loans });
  })

  .post("/:tenantId/employee-loans", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = employeeLoanSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: emp } = await db
      .prepare(`SELECT id, name FROM employees WHERE id = ? AND is_active = 1`)
      .bind(input.employeeId)
      .all<{ id: string; name: string }>();
    if (!emp[0]) return c.json({ error: "Karyawan tidak ditemukan atau nonaktif." }, 404);

    const { results: accs } = await db
      .prepare(`SELECT type FROM accounts WHERE id = ? AND is_archived = 0`)
      .bind(input.cashAccountId)
      .all<{ type: string }>();
    if (!accs[0] || accs[0].type !== "asset") return c.json({ error: "Akun pencairan harus akun kas/bank (aset)." }, 400);

    const lockedBefore = await getLockedBefore(db);
    if (lockedBefore && input.loanDate <= lockedBefore) {
      return c.json({ error: `Periode sampai ${lockedBefore} sudah ditutup — tanggal pencairan tidak valid.` }, 400);
    }

    const piutangKaryawan = await ensureAccountByCode(db, PIUTANG_KARYAWAN, "Piutang Karyawan", "asset");
    const journal = await postJournal(db, {
      entryDate: input.loanDate,
      memo: `Kasbon ${emp[0].name}: ${input.name}`,
      createdBy: c.get("user").id,
      lines: [
        { accountId: piutangKaryawan, description: `Kasbon ${emp[0].name}`, debit: input.principal, credit: 0 },
        { accountId: input.cashAccountId, description: `Pencairan kasbon ${emp[0].name}`, debit: 0, credit: input.principal },
      ],
    });

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO employee_loans (id, employee_id, name, principal, monthly_deduction, balance, status, journal_entry_id)
         VALUES (?, ?, ?, ?, ?, ?, 'active', ?)`,
      )
      .bind(id, input.employeeId, input.name, input.principal, input.monthlyDeduction, input.principal, journal.id)
      .run();
    await audit(c.env, {
      action: "hr.loan.created",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, employee: emp[0].name, principal: input.principal },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, journalNo: journal.entryNo }, 201);
  })

  // ---------------------------------------------------------------------------
  // Cuti & izin (Fase 5f): pengajuan + keputusan; cuti tahunan memotong saldo.
  // ---------------------------------------------------------------------------

  .get("/:tenantId/leave-requests", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const { results } = await db
      .prepare(
        `SELECT r.id, r.employee_id, e.name AS employee_name, r.type, r.start_date, r.end_date, r.days,
                r.status, r.note, r.created_at
         FROM leave_requests r JOIN employees e ON e.id = r.employee_id
         ORDER BY r.status = 'pending' DESC, r.start_date DESC LIMIT 200`,
      )
      .all<{
        id: string;
        employee_id: string;
        employee_name: string;
        type: LeaveType;
        start_date: string;
        end_date: string;
        days: number;
        status: "pending" | "approved" | "rejected";
        note: string | null;
        created_at: string;
      }>();
    const requests: ApiLeaveRequest[] = results.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      type: r.type,
      startDate: r.start_date,
      endDate: r.end_date,
      days: r.days,
      status: r.status,
      note: r.note,
      createdAt: r.created_at,
    }));
    return c.json({ requests });
  })

  .post("/:tenantId/leave-requests", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = leaveRequestSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: emp } = await db
      .prepare(`SELECT id FROM employees WHERE id = ? AND is_active = 1`)
      .bind(input.employeeId)
      .all<{ id: string }>();
    if (!emp[0]) return c.json({ error: "Karyawan tidak ditemukan atau nonaktif." }, 404);

    const days = inclusiveDays(input.startDate, input.endDate);
    if (days > 60) return c.json({ error: "Rentang cuti terlalu panjang (maksimal 60 hari)." }, 400);

    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO leave_requests (id, employee_id, type, start_date, end_date, days, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.employeeId, input.type, input.startDate, input.endDate, days, input.note ?? null)
      .run();
    await audit(c.env, {
      action: "hr.leave.requested",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, type: input.type, days },
      ip: clientIp(c),
    });
    return c.json({ ok: true, id, days }, 201);
  })

  .patch("/:tenantId/leave-requests/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = decideLeaveSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");

    const { results } = await db
      .prepare(`SELECT employee_id, type, days, status FROM leave_requests WHERE id = ?`)
      .bind(id)
      .all<{ employee_id: string; type: LeaveType; days: number; status: string }>();
    const req = results[0];
    if (!req) return c.json({ error: "Pengajuan tidak ditemukan." }, 404);
    if (req.status !== "pending") return c.json({ error: "Pengajuan sudah diputuskan." }, 409);

    if (parsed.data.status === "approved" && req.type === "annual") {
      const { results: emp } = await db
        .prepare(`SELECT leave_balance FROM employees WHERE id = ?`)
        .bind(req.employee_id)
        .all<{ leave_balance: number }>();
      if ((emp[0]?.leave_balance ?? 0) < req.days) {
        return c.json({ error: `Saldo cuti tidak cukup (sisa ${emp[0]?.leave_balance ?? 0} hari, diajukan ${req.days} hari).` }, 400);
      }
      await db
        .prepare(`UPDATE employees SET leave_balance = leave_balance - ? WHERE id = ?`)
        .bind(req.days, req.employee_id)
        .run();
    }

    await db
      .prepare(`UPDATE leave_requests SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`)
      .bind(parsed.data.status, c.get("user").id, id)
      .run();
    await audit(c.env, {
      action: "hr.leave.decided",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, status: parsed.data.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  })

  // --- Absensi/kehadiran (Fase 6b) ------------------------------------------
  // Satu baris per karyawan per tanggal (upsert saat dikoreksi). GET daftar +
  // rekap bulanan per karyawan; POST catat/koreksi; DELETE hapus satu catatan.

  .get("/:tenantId/attendance", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    // Filter bulan (YYYY-MM); default bulan berjalan. Rekap hanya untuk bulan itu.
    const rawMonth = c.req.query("month") ?? "";
    const month = /^\d{4}-\d{2}$/.test(rawMonth) ? rawMonth : new Date().toISOString().slice(0, 7);
    const prefix = `${month}-%`;

    const { results } = await db
      .prepare(
        `SELECT a.id, a.employee_id, e.name AS employee_name, a.date, a.clock_in, a.clock_out,
                a.status, a.note
         FROM attendance a JOIN employees e ON e.id = a.employee_id
         WHERE a.date LIKE ?
         ORDER BY a.date DESC, e.name ASC LIMIT 500`,
      )
      .bind(prefix)
      .all<{
        id: string;
        employee_id: string;
        employee_name: string;
        date: string;
        clock_in: string | null;
        clock_out: string | null;
        status: AttendanceStatus;
        note: string | null;
      }>();
    const records: ApiAttendance[] = results.map((r) => ({
      id: r.id,
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      date: r.date,
      clockIn: r.clock_in,
      clockOut: r.clock_out,
      status: r.status,
      note: r.note,
    }));

    // Rekap per karyawan aktif — hitung jumlah hari per status untuk bulan tsb.
    const { results: recapRows } = await db
      .prepare(
        `SELECT e.id AS employee_id, e.name AS employee_name,
                SUM(CASE WHEN a.status = 'hadir' THEN 1 ELSE 0 END) AS hadir,
                SUM(CASE WHEN a.status = 'izin'  THEN 1 ELSE 0 END) AS izin,
                SUM(CASE WHEN a.status = 'sakit' THEN 1 ELSE 0 END) AS sakit,
                SUM(CASE WHEN a.status = 'alfa'  THEN 1 ELSE 0 END) AS alfa,
                SUM(CASE WHEN a.status = 'cuti'  THEN 1 ELSE 0 END) AS cuti,
                COUNT(a.id) AS total
         FROM employees e
         LEFT JOIN attendance a ON a.employee_id = e.id AND a.date LIKE ?
         WHERE e.is_active = 1
         GROUP BY e.id, e.name
         ORDER BY e.name ASC`,
      )
      .bind(prefix)
      .all<{
        employee_id: string;
        employee_name: string;
        hadir: number;
        izin: number;
        sakit: number;
        alfa: number;
        cuti: number;
        total: number;
      }>();
    const recap: ApiAttendanceRecap[] = recapRows.map((r) => ({
      employeeId: r.employee_id,
      employeeName: r.employee_name,
      hadir: r.hadir,
      izin: r.izin,
      sakit: r.sakit,
      alfa: r.alfa,
      cuti: r.cuti,
      total: r.total,
    }));

    return c.json({ month, records, recap });
  })

  .post("/:tenantId/attendance", requireAuth, requireTenantRole("admin"), async (c) => {
    const parsed = attendanceSchema.safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) {
      return c.json({ error: "Data tidak valid", issues: parsed.error.flatten().fieldErrors }, 400);
    }
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const input = parsed.data;

    const { results: emp } = await db
      .prepare(`SELECT id FROM employees WHERE id = ? AND is_active = 1`)
      .bind(input.employeeId)
      .all<{ id: string }>();
    if (!emp[0]) return c.json({ error: "Karyawan tidak ditemukan atau nonaktif." }, 404);

    const clockIn = input.clockIn ? input.clockIn : null;
    const clockOut = input.clockOut ? input.clockOut : null;
    const note = input.note && input.note.length > 0 ? input.note : null;

    // Upsert per (employee_id, date): koreksi menimpa catatan lama tanggal itu.
    const id = crypto.randomUUID();
    await db
      .prepare(
        `INSERT INTO attendance (id, employee_id, date, clock_in, clock_out, status, note)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (employee_id, date) DO UPDATE SET
           clock_in = excluded.clock_in,
           clock_out = excluded.clock_out,
           status = excluded.status,
           note = excluded.note`,
      )
      .bind(id, input.employeeId, input.date, clockIn, clockOut, input.status, note)
      .run();
    await audit(c.env, {
      action: "hr.attendance.recorded",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { employeeId: input.employeeId, date: input.date, status: input.status },
      ip: clientIp(c),
    });
    return c.json({ ok: true }, 201);
  })

  .delete("/:tenantId/attendance/:id", requireAuth, requireTenantRole("admin"), async (c) => {
    const tenant = c.get("tenant");
    const db = getTenantDb(c.env, tenant.dbRef);
    const id = c.req.param("id");
    const { results } = await db
      .prepare(`SELECT employee_id, date FROM attendance WHERE id = ?`)
      .bind(id)
      .all<{ employee_id: string; date: string }>();
    if (!results[0]) return c.json({ error: "Catatan kehadiran tidak ditemukan." }, 404);
    await db.prepare(`DELETE FROM attendance WHERE id = ?`).bind(id).run();
    await audit(c.env, {
      action: "hr.attendance.deleted",
      userId: c.get("user").id,
      tenantId: tenant.id,
      detail: { id, employeeId: results[0].employee_id, date: results[0].date },
      ip: clientIp(c),
    });
    return c.json({ ok: true });
  });
