import type { ApiCommerceDoc, ApiQuotation } from "@erpindo/shared";
import { useQuery } from "@tanstack/react-query";
import { api, formatDate, formatIDR } from "../api/client";
import { Spinner } from "../components/ui";

/**
 * Halaman cetak faktur — tanpa shell aplikasi, ramah printer.
 * Dibuka di tab baru: /cetak/faktur?tenant=<tenantId>&id=<invoiceId>
 * Tombol "Cetak / Simpan PDF" memakai dialog print browser (bisa Save as PDF).
 */
export function InvoicePrintPage() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenant") ?? "";
  const invoiceId = params.get("id") ?? "";

  const invoicesQuery = useQuery({
    queryKey: ["invoices", tenantId],
    queryFn: () => api.invoices(tenantId),
    enabled: Boolean(tenantId),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings", tenantId],
    queryFn: () => api.settings(tenantId),
    enabled: Boolean(tenantId),
  });

  const doc: ApiCommerceDoc | undefined = invoicesQuery.data?.docs.find((d) => d.id === invoiceId);
  const company = settingsQuery.data?.settings ?? {};

  if (invoicesQuery.isLoading || settingsQuery.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!doc) {
    return <div className="p-8 text-sm">Faktur tidak ditemukan atau Anda tidak punya akses.</div>;
  }

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-start gap-4">
          {company.logo_data_url ? (
            <img src={company.logo_data_url} alt="Logo perusahaan" className="h-16 w-auto max-w-32 object-contain" />
          ) : null}
          <div>
            <div className="text-2xl font-bold">{company.display_name ?? "—"}</div>
            {company.address ? <div className="text-sm">{company.address}</div> : null}
            {company.npwp ? <div className="text-sm">NPWP: {company.npwp}</div> : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">FAKTUR</div>
          <div className="font-mono text-sm">{doc.docNo}</div>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold text-slate-500">Kepada</div>
          <div className="font-medium">{doc.contactName}</div>
        </div>
        <div className="text-right">
          <div>
            Tanggal: <span className="font-medium">{formatDate(doc.date)}</span>
          </div>
          {doc.dueDate ? (
            <div>
              Jatuh tempo: <span className="font-medium">{formatDate(doc.dueDate)}</span>
            </div>
          ) : null}
          <div>
            Status: <span className="font-medium">{doc.status === "paid" ? "LUNAS" : "BELUM LUNAS"}</span>
          </div>
        </div>
      </section>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left">
            <th className="py-2 pr-4">Barang</th>
            <th className="py-2 pr-4 text-right">Qty</th>
            <th className="py-2 pr-4 text-right">Harga Satuan</th>
            <th className="py-2 pr-4 text-right">Diskon</th>
            <th className="py-2 text-right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {doc.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-200">
              <td className="py-2 pr-4">
                {l.productName}
                {l.description ? <span className="text-slate-500"> — {l.description}</span> : null}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{l.qty}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(l.unitPrice)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
              <td className="py-2 text-right tabular-nums">{formatIDR(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-1.5 pr-4 text-right">
              Subtotal
            </td>
            <td className="py-1.5 text-right tabular-nums">{formatIDR(doc.subtotal)}</td>
          </tr>
          {doc.taxAmount > 0 ? (
            <tr>
              <td colSpan={4} className="py-1.5 pr-4 text-right">
                PPN {doc.taxRate}%
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatIDR(doc.taxAmount)}</td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-slate-900 text-base font-bold">
            <td colSpan={4} className="py-2 pr-4 text-right">
              TOTAL
            </td>
            <td className="py-2 text-right tabular-nums">{formatIDR(doc.total)}</td>
          </tr>
          {doc.paidAmount > 0 && doc.status !== "paid" ? (
            <tr>
              <td colSpan={4} className="py-1.5 pr-4 text-right">
                Sudah dibayar
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatIDR(doc.paidAmount)}</td>
            </tr>
          ) : null}
        </tfoot>
      </table>

      <footer className="mt-10 text-center text-xs text-slate-400">
        Dibuat dengan erpindo — ERP untuk UMKM Indonesia
      </footer>
    </div>
  );
}

/**
 * Halaman cetak penawaran (quotation) — pola sama dengan faktur.
 * Dibuka di tab baru: /cetak/penawaran?tenant=<tenantId>&id=<quotationId>
 */
export function QuotationPrintPage() {
  const params = new URLSearchParams(window.location.search);
  const tenantId = params.get("tenant") ?? "";
  const quotationId = params.get("id") ?? "";

  const quotesQuery = useQuery({
    queryKey: ["quotations", tenantId],
    queryFn: () => api.quotations(tenantId),
    enabled: Boolean(tenantId),
  });
  const settingsQuery = useQuery({
    queryKey: ["settings", tenantId],
    queryFn: () => api.settings(tenantId),
    enabled: Boolean(tenantId),
  });

  const quote: ApiQuotation | undefined = quotesQuery.data?.quotations.find((q) => q.id === quotationId);
  const company = settingsQuery.data?.settings ?? {};

  if (quotesQuery.isLoading || settingsQuery.isLoading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <Spinner />
      </div>
    );
  }
  if (!quote) {
    return <div className="p-8 text-sm">Penawaran tidak ditemukan atau Anda tidak punya akses.</div>;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const expired = Boolean(
    quote.validUntil && quote.validUntil < todayStr && (quote.status === "draft" || quote.status === "sent"),
  );

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-slate-900 print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <button
          onClick={() => window.print()}
          className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800"
        >
          🖨 Cetak / Simpan PDF
        </button>
      </div>

      <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
        <div className="flex items-start gap-4">
          {company.logo_data_url ? (
            <img src={company.logo_data_url} alt="Logo perusahaan" className="h-16 w-auto max-w-32 object-contain" />
          ) : null}
          <div>
            <div className="text-2xl font-bold">{company.display_name ?? "—"}</div>
            {company.address ? <div className="text-sm">{company.address}</div> : null}
            {company.npwp ? <div className="text-sm">NPWP: {company.npwp}</div> : null}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold tracking-wide">PENAWARAN</div>
          <div className="font-mono text-sm">{quote.quoteNo}</div>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <div className="font-semibold text-slate-500">Kepada</div>
          <div className="font-medium">{quote.contactName}</div>
        </div>
        <div className="text-right">
          <div>
            Tanggal: <span className="font-medium">{formatDate(quote.quoteDate)}</span>
          </div>
          {quote.validUntil ? (
            <div>
              Berlaku sampai: <span className="font-medium">{formatDate(quote.validUntil)}</span>
              {expired ? <span className="ml-1 font-semibold text-red-600">(KEDALUWARSA)</span> : null}
            </div>
          ) : null}
        </div>
      </section>

      <table className="mt-6 w-full text-sm">
        <thead>
          <tr className="border-b-2 border-slate-900 text-left">
            <th className="py-2 pr-4">Barang</th>
            <th className="py-2 pr-4 text-right">Qty</th>
            <th className="py-2 pr-4 text-right">Harga Satuan</th>
            <th className="py-2 pr-4 text-right">Diskon</th>
            <th className="py-2 text-right">Jumlah</th>
          </tr>
        </thead>
        <tbody>
          {quote.lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-200">
              <td className="py-2 pr-4">
                {l.productName}
                {l.description ? <span className="text-slate-500"> — {l.description}</span> : null}
              </td>
              <td className="py-2 pr-4 text-right tabular-nums">{l.qty}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(l.unitPrice)}</td>
              <td className="py-2 pr-4 text-right tabular-nums">{l.discountPct > 0 ? `${l.discountPct}%` : "—"}</td>
              <td className="py-2 text-right tabular-nums">{formatIDR(l.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4} className="py-1.5 pr-4 text-right">
              Subtotal
            </td>
            <td className="py-1.5 text-right tabular-nums">{formatIDR(quote.subtotal)}</td>
          </tr>
          {quote.taxAmount > 0 ? (
            <tr>
              <td colSpan={4} className="py-1.5 pr-4 text-right">
                PPN {quote.taxRate}%
              </td>
              <td className="py-1.5 text-right tabular-nums">{formatIDR(quote.taxAmount)}</td>
            </tr>
          ) : null}
          <tr className="border-t-2 border-slate-900 text-base font-bold">
            <td colSpan={4} className="py-2 pr-4 text-right">
              TOTAL
            </td>
            <td className="py-2 text-right tabular-nums">{formatIDR(quote.total)}</td>
          </tr>
        </tfoot>
      </table>

      {quote.notes ? (
        <section className="mt-6 text-sm">
          <div className="font-semibold text-slate-500">Catatan</div>
          <p className="whitespace-pre-line">{quote.notes}</p>
        </section>
      ) : null}

      <p className="mt-6 text-xs text-slate-500">
        Dokumen ini adalah penawaran harga, bukan tagihan. Harga dapat berubah setelah masa berlaku berakhir.
      </p>

      <footer className="mt-10 text-center text-xs text-slate-400">
        Dibuat dengan erpindo — ERP untuk UMKM Indonesia
      </footer>
    </div>
  );
}
