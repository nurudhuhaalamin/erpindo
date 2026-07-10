import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Link2, Link2Off, Upload, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import { Badge, Button, Card, CardBody, CardHeader, Label, Select, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

/**
 * Kas & Bank (Fase 5d): saldo per akun kas/bank, mutasi dengan saldo berjalan
 * (dari buku besar), dan rekonsiliasi rekening koran — impor CSV mutasi bank,
 * auto-match nominal+tanggal, sisanya dicocokkan manual. Rekonsiliasi hanya
 * MENANDAI baris; tidak pernah mengubah jurnal.
 */

/** Parse CSV mutasi sederhana: tanggal, keterangan, jumlah (+masuk/−keluar). */
function parseCsv(text: string): { rows: { date: string; description: string; amount: number }[]; errors: string[] } {
  const rows: { date: string; description: string; amount: number }[] = [];
  const errors: string[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (const [i, line] of lines.entries()) {
    const parts = line.split(/[;,\t]/).map((p) => p.trim());
    if (i === 0 && /tanggal|date/i.test(parts[0] ?? "")) continue; // baris header
    if (parts.length < 3) {
      errors.push(`Baris ${i + 1}: butuh 3 kolom (tanggal;keterangan;jumlah)`);
      continue;
    }
    const [rawDate, description, rawAmount] = [parts[0]!, parts.slice(1, -1).join(", "), parts[parts.length - 1]!];
    const m = rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = m ? (m[3]!.length === 4 ? `${m[3]}-${m[2]}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`) : null;
    const amount = Math.round(Number(rawAmount.replace(/\./g, "").replace(",", ".")));
    if (!date) {
      errors.push(`Baris ${i + 1}: tanggal tidak dikenal (${rawDate}) — pakai YYYY-MM-DD atau DD/MM/YYYY`);
      continue;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      errors.push(`Baris ${i + 1}: jumlah tidak valid (${rawAmount})`);
      continue;
    }
    rows.push({ date, description: description || "(tanpa keterangan)", amount });
  }
  return { rows, errors };
}

export function KasBankPage() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const isAdmin = tenant.role !== "viewer";
  const [selectedId, setSelectedId] = useState("");
  const [csvText, setCsvText] = useState("");
  const [matchPick, setMatchPick] = useState<Record<string, string>>({});

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const tbQuery = useQuery({
    queryKey: ["trial-balance", tenant.tenantId],
    queryFn: () => api.trialBalance(tenant.tenantId),
  });
  const wallets = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? []).filter(
        (a) => !a.isArchived && a.type === "asset" && (a.code === "1-1000" || a.code === "1-1100" || /kas|bank/i.test(a.name)),
      ),
    [accountsQuery.data],
  );
  const balanceByCode = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of tbQuery.data?.rows ?? []) map.set(r.code, r.debit - r.credit);
    return map;
  }, [tbQuery.data]);

  const selected = wallets.find((w) => w.id === selectedId) ?? wallets[0];

  const ledgerQuery = useQuery({
    queryKey: ["ledger", tenant.tenantId, selected?.id],
    queryFn: () => api.ledger(tenant.tenantId, selected!.id),
    enabled: Boolean(selected),
  });
  const reconQuery = useQuery({
    queryKey: ["bank-recon", tenant.tenantId, selected?.id],
    queryFn: () => api.bankRecon(tenant.tenantId, selected!.id),
    enabled: Boolean(selected),
  });

  const importMutation = useMutation({
    mutationFn: () => {
      const { rows, errors } = parseCsv(csvText);
      if (errors.length > 0) throw new Error(errors.slice(0, 3).join(" · "));
      if (rows.length === 0) throw new Error("Tidak ada baris mutasi yang bisa dibaca.");
      return api.bankReconImport(tenant.tenantId, { accountId: selected!.id, items: rows });
    },
    onSuccess: (res) => {
      toast("success", `${res.imported} mutasi diimpor — ${res.autoMatched} langsung cocok otomatis.`);
      setCsvText("");
      queryClient.invalidateQueries({ queryKey: ["bank-recon", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const matchMutation = useMutation({
    mutationFn: ({ itemId, lineId }: { itemId: string; lineId: string }) => api.bankReconMatch(tenant.tenantId, itemId, lineId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bank-recon", tenant.tenantId] }),
    onError: (err) => toast("error", (err as Error).message),
  });
  const unmatchMutation = useMutation({
    mutationFn: (itemId: string) => api.bankReconUnmatch(tenant.tenantId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bank-recon", tenant.tenantId] }),
  });

  const recon = reconQuery.data;

  return (
    <div className="max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Kas & Bank</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Saldo dan mutasi tiap akun kas/bank, plus rekonsiliasi dengan rekening koran — pastikan catatan Anda sama
          dengan catatan bank.
        </p>
      </div>

      {accountsQuery.isLoading || tbQuery.isLoading ? (
        <Spinner />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {wallets.map((w) => (
              <button
                key={w.id}
                onClick={() => setSelectedId(w.id)}
                className={`rounded-2xl border p-4 text-left transition-colors ${
                  selected?.id === w.id
                    ? "border-brand-300 bg-brand-50 dark:border-brand-500/40 dark:bg-brand-500/10"
                    : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800/60"
                }`}
              >
                <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                  {w.code === "1-1100" || /bank/i.test(w.name) ? (
                    <Landmark className="size-4" aria-hidden />
                  ) : (
                    <Wallet className="size-4" aria-hidden />
                  )}
                  {w.name}
                </div>
                <div className="mt-1.5 text-xl font-semibold tabular-nums">{formatIDR(balanceByCode.get(w.code) ?? 0)}</div>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader
              title={`Mutasi ${selected?.name ?? ""}`}
              description="Riwayat keluar-masuk beserta saldo berjalan — sama dengan buku besar akun ini."
            />
            <CardBody>
              {ledgerQuery.isLoading ? (
                <Spinner />
              ) : (ledgerQuery.data?.entries.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada mutasi pada akun ini.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
                        <th className="py-2 pr-3 font-medium">Tanggal</th>
                        <th className="py-2 pr-3 font-medium">Keterangan</th>
                        <th className="py-2 pr-3 text-right font-medium">Masuk</th>
                        <th className="py-2 pr-3 text-right font-medium">Keluar</th>
                        <th className="py-2 text-right font-medium">Saldo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledgerQuery.data!.entries.slice(-50).map((e, i) => (
                        <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDate(e.entryDate)}</td>
                          <td className="py-2 pr-3">{e.description ?? e.entryNo}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{e.debit ? formatIDR(e.debit) : "—"}</td>
                          <td className="py-2 pr-3 text-right tabular-nums">{e.credit ? formatIDR(e.credit) : "—"}</td>
                          <td className="py-2 text-right font-medium tabular-nums">{formatIDR(e.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title="Rekonsiliasi rekening koran"
              description="Unduh mutasi (CSV) dari internet banking, tempel di sini — sistem mencocokkan otomatis berdasarkan nominal yang sama dan tanggal berdekatan (±3 hari)."
            />
            <CardBody className="space-y-4">
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="csv-mutasi">
                    Tempel CSV mutasi — kolom: tanggal; keterangan; jumlah (+ masuk / − keluar)
                  </Label>
                  <textarea
                    id="csv-mutasi"
                    rows={4}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={"2026-07-01;TRSF DARI PT MAJU;5000000\n2026-07-03;BIAYA ADMIN;-6500"}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <Button onClick={() => importMutation.mutate()} disabled={!csvText.trim() || importMutation.isPending}>
                    <Upload className="size-4" aria-hidden /> {importMutation.isPending ? "Mengimpor…" : "Impor & cocokkan otomatis"}
                  </Button>
                </div>
              ) : null}

              {recon && recon.items.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="green">{recon.summary.matched} cocok</Badge>
                    <Badge tone={recon.summary.unmatched > 0 ? "amber" : "green"}>{recon.summary.unmatched} belum cocok</Badge>
                    <span className="text-slate-500 dark:text-slate-400">dari {recon.summary.total} baris mutasi</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[640px] text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-700 dark:text-slate-400">
                          <th className="py-2 pr-3 font-medium">Tanggal</th>
                          <th className="py-2 pr-3 font-medium">Keterangan bank</th>
                          <th className="py-2 pr-3 text-right font-medium">Jumlah</th>
                          <th className="py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recon.items.map((item) => (
                          <tr key={item.id} className="border-b border-slate-100 align-top dark:border-slate-800">
                            <td className="py-2 pr-3 whitespace-nowrap">{formatDate(item.stmtDate)}</td>
                            <td className="py-2 pr-3">{item.description}</td>
                            <td className={`py-2 pr-3 text-right tabular-nums ${item.amount < 0 ? "text-red-600 dark:text-red-400" : ""}`}>
                              {formatIDR(item.amount)}
                            </td>
                            <td className="py-2">
                              {item.matchedJournalLineId ? (
                                <span className="inline-flex flex-wrap items-center gap-2">
                                  <Badge tone="green">cocok · {item.matchedEntryNo}</Badge>
                                  {isAdmin ? (
                                    <button
                                      onClick={() => unmatchMutation.mutate(item.id)}
                                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400"
                                    >
                                      <Link2Off className="size-3.5" aria-hidden /> lepas
                                    </button>
                                  ) : null}
                                </span>
                              ) : isAdmin ? (
                                <span className="flex flex-wrap items-center gap-2">
                                  <Select
                                    aria-label="Pilih baris jurnal untuk dicocokkan"
                                    className="h-8 max-w-64 text-xs"
                                    value={matchPick[item.id] ?? ""}
                                    onChange={(e) => setMatchPick((m) => ({ ...m, [item.id]: e.target.value }))}
                                  >
                                    <option value="">— pilih baris jurnal —</option>
                                    {recon.unmatchedLines.map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {formatDate(l.entryDate)} · {l.entryNo} · {formatIDR(l.amount)}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    className="h-8"
                                    disabled={!matchPick[item.id] || matchMutation.isPending}
                                    onClick={() => matchMutation.mutate({ itemId: item.id, lineId: matchPick[item.id]! })}
                                  >
                                    <Link2 className="size-4" aria-hidden /> Cocokkan
                                  </Button>
                                </span>
                              ) : (
                                <Badge tone="amber">belum cocok</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : recon ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  Belum ada mutasi rekening koran yang diimpor untuk akun ini.
                </p>
              ) : null}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
