import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Landmark, Link2, Link2Off, Upload, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { api, formatDate, formatIDR } from "../api/client";
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Label,
  PageHeading,
  Select,
  Spinner,
  Table,
  Td,
  Th,
  Thead,
  Tr,
  useToast,
} from "../components/ui";
import { useUi, type UiKey } from "../i18n/ui";
import { useWorkspace } from "./app";

/**
 * Kas & Bank (Fase 5d): saldo per akun kas/bank, mutasi dengan saldo berjalan
 * (dari buku besar), dan rekonsiliasi rekening koran — impor CSV mutasi bank,
 * auto-match nominal+tanggal, sisanya dicocokkan manual. Rekonsiliasi hanya
 * MENANDAI baris; tidak pernah mengubah jurnal.
 */

/**
 * Parse CSV mutasi sederhana: tanggal, keterangan, jumlah (+masuk/−keluar).
 *
 * Penerjemah `u` diterima sebagai argumen, bukan dipanggil di dalam: ini fungsi
 * murni di tingkat modul, sehingga tidak boleh memakai hook. Pesan galatnya
 * tampil ke pengguna lewat toast, jadi tetap harus ikut bahasa aktif.
 */
function parseCsv(
  text: string,
  u: (k: UiKey) => string,
): {
  rows: { date: string; description: string; amount: number }[];
  errors: string[];
} {
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
      errors.push(`${u("barisKe")} ${i + 1}: ${u("csvButuh3Kolom")}`);
      continue;
    }
    const [rawDate, description, rawAmount] = [
      parts[0]!,
      parts.slice(1, -1).join(", "),
      parts[parts.length - 1]!,
    ];
    const m =
      rawDate.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? rawDate.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    const date = m
      ? m[3]!.length === 4
        ? `${m[3]}-${m[2]}-${m[1]}`
        : `${m[1]}-${m[2]}-${m[3]}`
      : null;
    const amount = Math.round(Number(rawAmount.replace(/\./g, "").replace(",", ".")));
    if (!date) {
      errors.push(
        `${u("barisKe")} ${i + 1}: ${u("csvTanggalTakDikenal")} (${rawDate}) — ${u("csvPakaiFormatTanggal")}`
      );
      continue;
    }
    if (!Number.isFinite(amount) || amount === 0) {
      errors.push(`${u("barisKe")} ${i + 1}: ${u("csvJumlahTakValid")} (${rawAmount})`);
      continue;
    }
    rows.push({ date, description: description || u("tanpaKeterangan"), amount });
  }
  return { rows, errors };
}

export function KasBankPage() {
  const { tenant } = useWorkspace();
  const u = useUi();
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
        (a) =>
          !a.isArchived &&
          a.type === "asset" &&
          (a.code === "1-1000" || a.code === "1-1100" || /kas|bank/i.test(a.name))
      ),
    [accountsQuery.data]
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
      const { rows, errors } = parseCsv(csvText, u);
      if (errors.length > 0) throw new Error(errors.slice(0, 3).join(" · "));
      if (rows.length === 0) throw new Error(u("csvTakTerbaca"));
      return api.bankReconImport(tenant.tenantId, { accountId: selected!.id, items: rows });
    },
    onSuccess: (res) => {
      toast(
        "success",
        `${res.imported} ${u("mutasiDiimporSuffix")} — ${res.autoMatched} ${u("langsungCocokSuffix")}`
      );
      setCsvText("");
      queryClient.invalidateQueries({ queryKey: ["bank-recon", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const matchMutation = useMutation({
    mutationFn: ({ itemId, lineId }: { itemId: string; lineId: string }) =>
      api.bankReconMatch(tenant.tenantId, itemId, lineId),
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
        <PageHeading k="kasBank" />
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
                <div className="mt-1.5 text-xl font-semibold tabular-nums">
                  {formatIDR(balanceByCode.get(w.code) ?? 0)}
                </div>
              </button>
            ))}
          </div>

          <Card>
            <CardHeader
              title={`${u("mutasiAkun")} ${selected?.name ?? ""}`}
              description={u("descMutasi")}
            />
            <CardBody>
              {ledgerQuery.isLoading ? (
                <Spinner />
              ) : (ledgerQuery.data?.entries.length ?? 0) === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {u("belumAdaMutasi")}
                </p>
              ) : (
                <Table>
                  <Thead>
                    <tr>
                      <Th>{u("tanggal")}</Th>
                      <Th>{u("keterangan")}</Th>
                      <Th numeric>{u("masuk")}</Th>
                      <Th numeric>{u("keluar")}</Th>
                      <Th numeric>{u("saldo")}</Th>
                    </tr>
                  </Thead>
                  <tbody>
                    {ledgerQuery.data!.entries.slice(-50).map((e, i) => (
                      <Tr key={i}>
                        <Td label={u("tanggal")} className="whitespace-nowrap">
                          {formatDate(e.entryDate)}
                        </Td>
                        <Td label={u("keterangan")}>{e.description ?? e.entryNo}</Td>
                        <Td numeric label={u("masuk")}>
                          {e.debit ? formatIDR(e.debit) : "—"}
                        </Td>
                        <Td numeric label={u("keluar")}>
                          {e.credit ? formatIDR(e.credit) : "—"}
                        </Td>
                        <Td numeric label={u("saldo")} className="font-medium">
                          {formatIDR(e.balance)}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader
              title={u("rekonsiliasiKoran")}
              description={u("descRekonsiliasi")}
            />
            <CardBody className="space-y-4">
              {isAdmin ? (
                <div className="space-y-2">
                  <Label htmlFor="csv-mutasi">
                    {u("labelCsvMutasi")}
                  </Label>
                  <textarea
                    id="csv-mutasi"
                    rows={4}
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={
                      "2026-07-01;TRSF DARI PT MAJU;5000000\n2026-07-03;BIAYA ADMIN;-6500"
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
                  />
                  <Button
                    onClick={() => importMutation.mutate()}
                    disabled={!csvText.trim() || importMutation.isPending}
                  >
                    <Upload className="size-4" aria-hidden />{" "}
                    {importMutation.isPending ? u("mengimpor") : u("imporCocokkan")}
                  </Button>
                </div>
              ) : null}

              {recon && recon.items.length > 0 ? (
                <>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="green">
                      {recon.summary.matched} {u("cocok")}
                    </Badge>
                    <Badge tone={recon.summary.unmatched > 0 ? "amber" : "green"}>
                      {recon.summary.unmatched} {u("belumCocok")}
                    </Badge>
                    <span className="text-slate-500 dark:text-slate-400">
                      {u("dariPrefix")} {recon.summary.total} {u("barisMutasiSuffix")}
                    </span>
                  </div>
                  <Table>
                    <Thead>
                      <tr>
                        <Th>{u("tanggal")}</Th>
                        <Th>{u("keteranganBank")}</Th>
                        <Th numeric>{u("jumlah")}</Th>
                        <Th>{u("status")}</Th>
                      </tr>
                    </Thead>
                    <tbody>
                      {recon.items.map((item) => (
                        <Tr key={item.id} className="align-top">
                          <Td label={u("tanggal")} className="whitespace-nowrap">
                            {formatDate(item.stmtDate)}
                          </Td>
                          <Td label={u("keteranganBank")}>{item.description}</Td>
                          <Td
                            numeric
                            label={u("jumlah")}
                            className={item.amount < 0 ? "text-red-600 dark:text-red-400" : ""}
                          >
                            {formatIDR(item.amount)}
                          </Td>
                          <Td label={u("status")}>
                              {item.matchedJournalLineId ? (
                                <span className="inline-flex flex-wrap items-center gap-2">
                                  <Badge tone="green">
                                    {u("cocok")} · {item.matchedEntryNo}
                                  </Badge>
                                  {isAdmin ? (
                                    <button
                                      onClick={() => unmatchMutation.mutate(item.id)}
                                      className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-red-600 dark:text-slate-400"
                                    >
                                      <Link2Off className="size-3.5" aria-hidden /> {u("lepasCocok")}
                                    </button>
                                  ) : null}
                                </span>
                              ) : isAdmin ? (
                                <span className="flex flex-wrap items-center gap-2">
                                  <Select
                                    aria-label={u("ariaPilihBarisJurnal")}
                                    className="h-8 max-w-64 text-xs"
                                    value={matchPick[item.id] ?? ""}
                                    onChange={(e) =>
                                      setMatchPick((m) => ({ ...m, [item.id]: e.target.value }))
                                    }
                                  >
                                    <option value="">{u("pilihBarisJurnal")}</option>
                                    {recon.unmatchedLines.map((l) => (
                                      <option key={l.id} value={l.id}>
                                        {formatDate(l.entryDate)} · {l.entryNo} ·{" "}
                                        {formatIDR(l.amount)}
                                      </option>
                                    ))}
                                  </Select>
                                  <Button
                                    variant="ghost"
                                    size="xs"
                                    disabled={!matchPick[item.id] || matchMutation.isPending}
                                    onClick={() =>
                                      matchMutation.mutate({
                                        itemId: item.id,
                                        lineId: matchPick[item.id]!,
                                      })
                                    }
                                  >
                                    <Link2 className="size-4" aria-hidden /> {u("cocokkan")}
                                  </Button>
                                </span>
                              ) : (
                                <Badge tone="amber">{u("belumCocok")}</Badge>
                            )}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </>
              ) : recon ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {u("belumAdaKoranDiimpor")}
                </p>
              ) : null}
            </CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
