import {
  AGING_BUCKETS,
  type AgingBucket,
  type ApiAgingRow,
  type ApiCashFlow,
  type ApiDashboard,
  type ApiEfakturReport,
  type ApiEfakturRow,
  type ApiSalesAnalytics,
  type ApiStockCardRow,
} from "@erpindo/shared";
import { Hono } from "hono";
import type { AppEnv } from "../env";
import { computeBalanceSheet, computeIncomeStatement } from "../lib/reports";
import { getTenantDb } from "../lib/tenantDb";
import { requireAuth, requireTenantRole } from "../middleware/auth";

/**
 * Laporan keuangan & dashboard. Semua angka dihitung dari jurnal terposting —
 * satu sumber kebenaran, sehingga laporan otomatis konsisten dengan buku besar.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** NPWP → TIN 16 digit Coretax: buang non-digit; 15 digit lama diberi awalan 0. */
function tin16(raw: string | null): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (digits.length === 16) return digits;
  if (digits.length === 15) return `0${digits}`;
  return "";
}

const XML_ENTITIES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function xmlEscape(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => XML_ENTITIES[ch] ?? ch);
}

export const reportRoutes = new Hono<AppEnv>()

  // -------------------------------------------------------------------------
  // Laba Rugi (periode)
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/income-statement", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(await computeIncomeStatement(db, from, to));
  })

  // -------------------------------------------------------------------------
  // Neraca (per tanggal) — ekuitas menyertakan Laba Berjalan agar seimbang
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/balance-sheet", requireAuth, requireTenantRole("viewer"), async (c) => {
    const asOf = c.req.query("asOf") ?? "";
    if (!DATE_RE.test(asOf)) return c.json({ error: "Parameter asOf wajib berformat YYYY-MM-DD." }, 400);
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    return c.json(await computeBalanceSheet(db, asOf));
  })

  // -------------------------------------------------------------------------
  // Arus Kas (metode langsung sederhana): mutasi akun Kas & Bank per periode,
  // dikelompokkan berdasarkan keterangan jurnal.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/cash-flow", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const CASH_FILTER = `a.code IN ('1-1000', '1-1100')`;

    const { results: openRows } = await db
      .prepare(
        `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         JOIN accounts a ON a.id = l.account_id
         WHERE ${CASH_FILTER} AND e.entry_date < ?`,
      )
      .bind(from)
      .all<{ balance: number }>();
    const openingBalance = openRows[0]?.balance ?? 0;

    // Delta kas per jurnal dalam periode; label = keterangan jurnal.
    const { results: entries } = await db
      .prepare(
        `SELECT COALESCE(e.memo, 'Lain-lain') AS label, SUM(l.debit - l.credit) AS delta
         FROM journal_lines l
         JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
         JOIN accounts a ON a.id = l.account_id
         WHERE ${CASH_FILTER} AND e.entry_date >= ? AND e.entry_date <= ?
         GROUP BY e.id HAVING delta != 0
         ORDER BY e.entry_date, e.entry_no`,
      )
      .bind(from, to)
      .all<{ label: string; delta: number }>();

    const inflows = entries.filter((r) => r.delta > 0).map((r) => ({ label: r.label, amount: r.delta }));
    const outflows = entries.filter((r) => r.delta < 0).map((r) => ({ label: r.label, amount: -r.delta }));
    const totalIn = inflows.reduce((s, r) => s + r.amount, 0);
    const totalOut = outflows.reduce((s, r) => s + r.amount, 0);

    const body: ApiCashFlow = {
      from,
      to,
      openingBalance,
      inflows,
      outflows,
      totalIn,
      totalOut,
      netChange: totalIn - totalOut,
      closingBalance: openingBalance + totalIn - totalOut,
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Ekspor e-Faktur: faktur keluaran ber-PPN dalam periode (untuk impor DJP).
  // Nilai DPP/PPN dalam Rupiah (faktur valas sudah dikonversi saat posting).
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/efaktur", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const { results } = await db
      .prepare(
        `SELECT i.invoice_no, i.invoice_date, i.subtotal, i.tax_amount, i.total,
                k.name AS buyer_name, k.npwp AS buyer_npwp
         FROM invoices i JOIN contacts k ON k.id = i.contact_id
         WHERE i.tax_amount > 0 AND i.voided_at IS NULL AND i.invoice_date >= ? AND i.invoice_date <= ?
         ORDER BY i.invoice_date, i.invoice_no`,
      )
      .bind(from, to)
      .all<{
        invoice_no: string;
        invoice_date: string;
        subtotal: number;
        tax_amount: number;
        total: number;
        buyer_name: string;
        buyer_npwp: string | null;
      }>();

    const rows: ApiEfakturRow[] = results.map((r) => ({
      invoiceNo: r.invoice_no,
      invoiceDate: r.invoice_date,
      buyerNpwp: r.buyer_npwp,
      buyerName: r.buyer_name,
      dpp: r.subtotal,
      ppn: r.tax_amount,
      total: r.total,
    }));
    const body: ApiEfakturReport = {
      from,
      to,
      rows,
      totalDpp: rows.reduce((s, r) => s + r.dpp, 0),
      totalPpn: rows.reduce((s, r) => s + r.ppn, 0),
    };
    return c.json(body);
  })

  // -------------------------------------------------------------------------
  // Ekspor e-Faktur XML Coretax (TaxInvoiceBulk) — sejak 2025 DJP hanya
  // menerima XML untuk impor faktur keluaran. Non-mewah (tarif efektif 11%,
  // PMK 131/2024) memakai kode transaksi 04 dengan DPP nilai lain = 11/12 ×
  // nilai setelah diskon; tarif 12 penuh (mewah) memakai kode 01. Elemen
  // CustomDocMonthYear wajib ada sejak skema Coretax Feb 2025.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/efaktur-xml", requireAuth, requireTenantRole("viewer"), async (c) => {
    const from = c.req.query("from") ?? "";
    const to = c.req.query("to") ?? "";
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      return c.json({ error: "Parameter from/to wajib berformat YYYY-MM-DD." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);

    const { results: npwpRows } = await db
      .prepare(`SELECT value FROM settings WHERE key = 'npwp'`)
      .all<{ value: string }>();
    const sellerTin = tin16(npwpRows[0]?.value ?? null);
    if (!sellerTin) {
      return c.json({ error: "Isi NPWP perusahaan (15/16 digit) di halaman Pengaturan terlebih dulu." }, 400);
    }

    const { results: docs } = await db
      .prepare(
        `SELECT i.id, i.invoice_no, i.invoice_date, i.tax_rate, i.exchange_rate,
                k.name AS buyer_name, k.npwp AS buyer_npwp, k.address AS buyer_address
         FROM invoices i JOIN contacts k ON k.id = i.contact_id
         WHERE i.tax_amount > 0 AND i.voided_at IS NULL AND i.invoice_date >= ? AND i.invoice_date <= ?
         ORDER BY i.invoice_date, i.invoice_no`,
      )
      .bind(from, to)
      .all<{
        id: string;
        invoice_no: string;
        invoice_date: string;
        tax_rate: number;
        exchange_rate: number;
        buyer_name: string;
        buyer_npwp: string | null;
        buyer_address: string | null;
      }>();

    type XmlLine = {
      invoice_id: string;
      description: string | null;
      qty: number;
      unit_price: number;
      discount_pct: number;
      product_name: string;
      is_service: number;
    };
    let lines: XmlLine[] = [];
    if (docs.length > 0) {
      const ph = docs.map(() => "?").join(",");
      const res = await db
        .prepare(
          `SELECT il.invoice_id, il.description, il.qty, il.unit_price, il.discount_pct,
                  p.name AS product_name, p.is_service
           FROM invoice_lines il JOIN products p ON p.id = il.product_id
           WHERE il.invoice_id IN (${ph}) ORDER BY il.rowid`,
        )
        .bind(...docs.map((d) => d.id))
        .all<XmlLine>();
      lines = res.results;
    }
    const linesByDoc = new Map<string, XmlLine[]>();
    for (const l of lines) {
      const arr = linesByDoc.get(l.invoice_id) ?? [];
      arr.push(l);
      linesByDoc.set(l.invoice_id, arr);
    }

    const out: string[] = [
      `<?xml version="1.0" encoding="utf-8"?>`,
      `<TaxInvoiceBulk xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema">`,
      `  <TIN>${sellerTin}</TIN>`,
      `  <ListOfTaxInvoice>`,
    ];
    for (const d of docs) {
      // Pembeli tanpa NPWP valid diekspor sebagai 16 digit nol (lawan transaksi umum).
      const buyerTin = tin16(d.buyer_npwp) || "0000000000000000";
      const trxCode = d.tax_rate === 12 ? "01" : "04";
      out.push(
        `    <TaxInvoice>`,
        `      <TaxInvoiceDate>${d.invoice_date}</TaxInvoiceDate>`,
        `      <TaxInvoiceOpt>Normal</TaxInvoiceOpt>`,
        `      <TrxCode>${trxCode}</TrxCode>`,
        `      <AddInfo/>`,
        `      <CustomDoc/>`,
        `      <CustomDocMonthYear/>`,
        `      <RefDesc>${xmlEscape(d.invoice_no)}</RefDesc>`,
        `      <FacilityStamp/>`,
        `      <SellerIDTKU>${sellerTin}000000</SellerIDTKU>`,
        `      <BuyerTin>${buyerTin}</BuyerTin>`,
        `      <BuyerDocument>TIN</BuyerDocument>`,
        `      <BuyerCountry>IDN</BuyerCountry>`,
        `      <BuyerDocumentNumber/>`,
        `      <BuyerName>${xmlEscape(d.buyer_name)}</BuyerName>`,
        `      <BuyerAdress>${xmlEscape(d.buyer_address?.trim() || "-")}</BuyerAdress>`,
        `      <BuyerEmail/>`,
        `      <BuyerIDTKU>${buyerTin}000000</BuyerIDTKU>`,
        `      <ListOfGoodService>`,
      );
      for (const l of linesByDoc.get(d.id) ?? []) {
        // Reproduksi persis perhitungan posting: harga satuan dikonversi ke IDR,
        // lalu nilai baris dibulatkan setelah diskon — jumlah TaxBase = subtotal faktur.
        const unitIdr = Math.round(l.unit_price * d.exchange_rate);
        const taxBase = Math.round(l.qty * unitIdr * (1 - l.discount_pct / 100));
        const totalDiscount = unitIdr * l.qty - taxBase;
        const otherTaxBase = d.tax_rate === 12 ? taxBase : Math.round((taxBase * 11 * 100) / 12) / 100;
        const vat = Math.round(otherTaxBase * 12) / 100;
        out.push(
          `        <GoodService>`,
          `          <Opt>${l.is_service ? "B" : "A"}</Opt>`,
          `          <Code>000000</Code>`,
          `          <Name>${xmlEscape(l.description?.trim() || l.product_name)}</Name>`,
          `          <Unit>UM.0018</Unit>`,
          `          <Price>${unitIdr.toFixed(2)}</Price>`,
          `          <Qty>${l.qty}</Qty>`,
          `          <TotalDiscount>${totalDiscount.toFixed(2)}</TotalDiscount>`,
          `          <TaxBase>${taxBase.toFixed(2)}</TaxBase>`,
          `          <OtherTaxBase>${otherTaxBase.toFixed(2)}</OtherTaxBase>`,
          `          <VATRate>12</VATRate>`,
          `          <VAT>${vat.toFixed(2)}</VAT>`,
          `          <STLGRate>0</STLGRate>`,
          `          <STLG>0</STLG>`,
          `        </GoodService>`,
        );
      }
      out.push(`      </ListOfGoodService>`, `    </TaxInvoice>`);
    }
    out.push(`  </ListOfTaxInvoice>`, `</TaxInvoiceBulk>`, ``);

    return c.body(out.join("\n"), 200, {
      "Content-Type": "application/xml; charset=utf-8",
      "Content-Disposition": `attachment; filename="efaktur-coretax-${from}-sd-${to}.xml"`,
    });
  })

  // -------------------------------------------------------------------------
  // Kartu stok: riwayat mutasi satu produk di satu gudang + saldo berjalan
  // -------------------------------------------------------------------------
  .get("/:tenantId/stock-card/:productId", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const productId = c.req.param("productId");
    const warehouseId = c.req.query("warehouseId");
    if (!warehouseId) return c.json({ error: "Parameter warehouseId wajib diisi." }, 400);

    const { results } = await db
      .prepare(
        `SELECT created_at, ref_type, qty, unit_cost FROM stock_movements
         WHERE product_id = ? AND warehouse_id = ? ORDER BY created_at, rowid`,
      )
      .bind(productId, warehouseId)
      .all<{ created_at: string; ref_type: string; qty: number; unit_cost: number }>();

    let balance = 0;
    const rows: ApiStockCardRow[] = results.map((r) => {
      balance += r.qty;
      return { date: r.created_at, refType: r.ref_type, qty: r.qty, unitCost: r.unit_cost, balance };
    });
    return c.json({ rows, balance });
  })

  // -------------------------------------------------------------------------
  // Umur piutang/hutang (aging) per kontak, berdasarkan tanggal jatuh tempo
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/aging", requireAuth, requireTenantRole("viewer"), async (c) => {
    const kind = c.req.query("type");
    if (kind !== "receivable" && kind !== "payable") {
      return c.json({ error: "Parameter type harus 'receivable' atau 'payable'." }, 400);
    }
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const table = kind === "receivable" ? "invoices" : "purchases";
    const dateCol = kind === "receivable" ? "invoice_date" : "purchase_date";

    const { results } = await db
      .prepare(
        `SELECT d.contact_id, k.name AS contact_name, d.total - d.paid_amount - d.returned_amount AS outstanding,
                COALESCE(d.due_date, d.${dateCol}) AS due
         FROM ${table} d JOIN contacts k ON k.id = d.contact_id
         WHERE d.status != 'paid' AND d.voided_at IS NULL AND d.total > d.paid_amount + d.returned_amount`,
      )
      .all<{ contact_id: string; contact_name: string; outstanding: number; due: string }>();

    const today = new Date().toISOString().slice(0, 10);
    const byContact = new Map<string, ApiAgingRow>();
    for (const r of results) {
      const days = Math.floor((Date.parse(today) - Date.parse(r.due)) / 86_400_000);
      const bucket: AgingBucket =
        days <= 0 ? "current" : days <= 30 ? "d1_30" : days <= 60 ? "d31_60" : days <= 90 ? "d61_90" : "d90_plus";
      const row =
        byContact.get(r.contact_id) ??
        ({
          contactId: r.contact_id,
          contactName: r.contact_name,
          buckets: Object.fromEntries(AGING_BUCKETS.map((b) => [b, 0])) as Record<AgingBucket, number>,
          total: 0,
        } satisfies ApiAgingRow);
      row.buckets[bucket] += r.outstanding;
      row.total += r.outstanding;
      byContact.set(r.contact_id, row);
    }

    const rows = [...byContact.values()].sort((a, b) => b.total - a.total);
    const grandTotal = rows.reduce((s, r) => s + r.total, 0);
    return c.json({ rows, grandTotal });
  })

  // -------------------------------------------------------------------------
  // Tren penjualan harian (grafik dashboard): total faktur per tanggal untuk
  // N hari terakhir; dokumen void dikecualikan. Hari tanpa penjualan diisi 0
  // di sisi klien agar sumbu waktu tetap kontinu.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/sales-daily", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 7), 90);
    const from = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);

    const { results } = await db
      .prepare(
        `SELECT invoice_date AS date, SUM(total) AS total, COUNT(*) AS n
         FROM invoices WHERE voided_at IS NULL AND invoice_date >= ?
         GROUP BY invoice_date ORDER BY invoice_date`,
      )
      .bind(from)
      .all<{ date: string; total: number; n: number }>();
    return c.json({ from, days, rows: results.map((r) => ({ date: r.date, total: r.total, count: r.n })) });
  })

  // -------------------------------------------------------------------------
  // Tren penjualan bulanan (Fase 7h): omzet & jumlah faktur per bulan untuk N
  // bulan terakhir. Dipakai grafik tren dashboard kustom.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/sales-monthly", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const months = Math.min(Math.max(Number(c.req.query("months")) || 6, 3), 24);
    const now = new Date();
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
    const from = start.toISOString().slice(0, 7); // YYYY-MM bulan paling awal

    const { results } = await db
      .prepare(
        `SELECT substr(invoice_date, 1, 7) AS month, SUM(total) AS total, COUNT(*) AS n
         FROM invoices WHERE voided_at IS NULL AND substr(invoice_date, 1, 7) >= ?
         GROUP BY month ORDER BY month`,
      )
      .bind(from)
      .all<{ month: string; total: number; n: number }>();
    return c.json({ from, months, rows: results.map((r) => ({ month: r.month, total: r.total, count: r.n })) });
  })

  // -------------------------------------------------------------------------
  // Dashboard: ringkasan angka nyata
  // -------------------------------------------------------------------------
  // -------------------------------------------------------------------------
  // Laporan penjualan analitik (Fase 5h): agregat per produk & per pelanggan
  // untuk rentang tanggal. Dokumen void dikecualikan.
  // -------------------------------------------------------------------------
  .get("/:tenantId/reports/sales-analytics", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const today = new Date().toISOString().slice(0, 10);
    const to = c.req.query("to") || today;
    const from = c.req.query("from") || `${today.slice(0, 7)}-01`;

    const [totalRow, byProductRes, byCustomerRes] = await Promise.all([
      db
        .prepare(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM invoices WHERE voided_at IS NULL AND invoice_date BETWEEN ? AND ?`)
        .bind(from, to)
        .all<{ total: number; n: number }>(),
      db
        .prepare(
          `SELECT p.id AS product_id, p.sku, p.name, SUM(il.qty) AS qty, SUM(il.amount) AS revenue
           FROM invoice_lines il
           JOIN invoices i ON i.id = il.invoice_id
           JOIN products p ON p.id = il.product_id
           WHERE i.voided_at IS NULL AND i.invoice_date BETWEEN ? AND ?
           GROUP BY p.id ORDER BY revenue DESC`,
        )
        .bind(from, to)
        .all<{ product_id: string; sku: string; name: string; qty: number; revenue: number }>(),
      db
        .prepare(
          `SELECT k.id AS contact_id, k.name, COUNT(*) AS n, SUM(i.total) AS revenue
           FROM invoices i JOIN contacts k ON k.id = i.contact_id
           WHERE i.voided_at IS NULL AND i.invoice_date BETWEEN ? AND ?
           GROUP BY k.id ORDER BY revenue DESC`,
        )
        .bind(from, to)
        .all<{ contact_id: string; name: string; n: number; revenue: number }>(),
    ]);

    const body: ApiSalesAnalytics = {
      from,
      to,
      totalRevenue: totalRow.results[0]?.total ?? 0,
      invoiceCount: totalRow.results[0]?.n ?? 0,
      byProduct: byProductRes.results.map((r) => ({
        productId: r.product_id,
        sku: r.sku,
        name: r.name,
        qty: r.qty,
        revenue: r.revenue,
      })),
      byCustomer: byCustomerRes.results.map((r) => ({
        contactId: r.contact_id,
        name: r.name,
        invoiceCount: r.n,
        revenue: r.revenue,
      })),
    };
    return c.json(body);
  })

  .get("/:tenantId/dashboard", requireAuth, requireTenantRole("viewer"), async (c) => {
    const db = getTenantDb(c.env, c.get("tenant").dbRef);
    const monthPrefix = new Date().toISOString().slice(0, 7); // YYYY-MM
    const lastMonthPrefix = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).toISOString().slice(0, 7);

    const [cashRows, salesRows, lastMonthRows, arRows, apRows, stockRows, leadRows] = await Promise.all([
      db
        .prepare(
          `SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
           FROM journal_lines l
           JOIN journal_entries e ON e.id = l.entry_id AND e.status = 'posted'
           JOIN accounts a ON a.id = l.account_id
           WHERE a.code IN ('1-1000', '1-1100')`,
        )
        .all<{ balance: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total), 0) AS total, COUNT(*) AS n FROM invoices WHERE voided_at IS NULL AND invoice_date LIKE ?`)
        .bind(`${monthPrefix}%`)
        .all<{ total: number; n: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE voided_at IS NULL AND invoice_date LIKE ?`)
        .bind(`${lastMonthPrefix}%`)
        .all<{ total: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total - paid_amount - returned_amount), 0) AS outstanding FROM invoices WHERE status != 'paid' AND voided_at IS NULL`)
        .all<{ outstanding: number }>(),
      db
        .prepare(`SELECT COALESCE(SUM(total - paid_amount - returned_amount), 0) AS outstanding FROM purchases WHERE status != 'paid' AND voided_at IS NULL`)
        .all<{ outstanding: number }>(),
      db.prepare(`SELECT COALESCE(SUM(qty * avg_cost), 0) AS value FROM stock_levels`).all<{ value: number }>(),
      db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE status = 'open'`).all<{ n: number }>(),
    ]);

    const body: ApiDashboard = {
      cashAndBank: cashRows.results[0]?.balance ?? 0,
      salesThisMonth: salesRows.results[0]?.total ?? 0,
      salesCountThisMonth: salesRows.results[0]?.n ?? 0,
      salesLastMonth: lastMonthRows.results[0]?.total ?? 0,
      receivableOutstanding: arRows.results[0]?.outstanding ?? 0,
      payableOutstanding: apRows.results[0]?.outstanding ?? 0,
      inventoryValue: stockRows.results[0]?.value ?? 0,
      openLeadsCount: leadRows.results[0]?.n ?? 0,
    };
    return c.json(body);
  });
