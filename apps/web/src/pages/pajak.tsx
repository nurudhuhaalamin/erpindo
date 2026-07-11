import { PPH23_OBJECTS, PPH23_OBJECT_LABELS } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { api, downloadCsv, formatDate, formatIDR } from "../api/client";
import { Badge, Button, Card, CardBody, CardHeader, Input, Label, Select, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

const th = "pb-2 pr-4 text-left font-medium text-slate-500 dark:text-slate-400";
const td = "border-b border-slate-100 py-2 pr-4 dark:border-slate-800/60";
const todayStr = () => new Date().toISOString().slice(0, 10);
const thisMonth = () => new Date().toISOString().slice(0, 7);

type Tab = "pph-final" | "pph23" | "spt-ppn";

export function PajakPage() {
  const { tenant } = useWorkspace();
  const isAdmin = tenant.role !== "viewer";
  const [tab, setTab] = useState<Tab>("pph-final");

  const tabs: { key: Tab; label: string }[] = [
    { key: "pph-final", label: "PPh Final 0,5%" },
    { key: "pph23", label: "PPh 23 (Bukti Potong)" },
    { key: "spt-ppn", label: "SPT Masa PPN" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Pajak</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          PPh Final UMKM 0,5% (PP 55/2022), pemotongan PPh 23 + bukti potong, dan rekap SPT Masa PPN 1111.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-brand-600 text-brand-700 dark:text-brand-300" : "border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "pph-final" ? <PphFinalSection isAdmin={isAdmin} /> : null}
      {tab === "pph23" ? <Pph23Section isAdmin={isAdmin} /> : null}
      {tab === "spt-ppn" ? <SptPpnSection /> : null}
    </div>
  );
}

// --- PPh Final 0,5% ---------------------------------------------------------
function PphFinalSection({ isAdmin }: { isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState(thisMonth());
  const [accountId, setAccountId] = useState("");
  const [paidDate, setPaidDate] = useState(todayStr());

  const accountsQuery = useQuery({ queryKey: ["accounts", tenant.tenantId], queryFn: () => api.accounts(tenant.tenantId) });
  const cashAccounts = (accountsQuery.data?.accounts ?? []).filter((a) => a.type === "asset" && !a.isArchived && (a.code.startsWith("1-10") || a.code.startsWith("1-11")));
  const preview = useQuery({ queryKey: ["pph-final-preview", tenant.tenantId, period], queryFn: () => api.pphFinalPreview(tenant.tenantId, period), enabled: /^\d{4}-\d{2}$/.test(period) });
  const list = useQuery({ queryKey: ["pph-final", tenant.tenantId], queryFn: () => api.pphFinalList(tenant.tenantId) });

  const pay = useMutation({
    mutationFn: () => api.payPphFinal(tenant.tenantId, { period, accountId, paidDate }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pph-final", tenant.tenantId] });
      queryClient.invalidateQueries({ queryKey: ["pph-final-preview", tenant.tenantId, period] });
      toast("success", "Setoran PPh Final tercatat & terjurnal.");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const records = list.data?.records ?? [];
  return (
    <div className="space-y-6">
      {isAdmin ? (
        <Card>
          <CardHeader title="Setor PPh Final masa" description="Omzet (peredaran bruto) dihitung otomatis dari faktur penjualan bulan terpilih × 0,5%." />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr_10rem_auto] sm:items-end">
              <div>
                <Label htmlFor="pf-period">Masa (bulan)</Label>
                <Input id="pf-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="pf-account">Bayar dari</Label>
                <Select id="pf-account" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                  <option value="">— pilih akun kas/bank —</option>
                  {cashAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="pf-date">Tanggal setor</Label>
                <Input id="pf-date" type="date" value={paidDate} onChange={(e) => setPaidDate(e.target.value)} />
              </div>
              <Button
                onClick={() => pay.mutate()}
                disabled={pay.isPending || !accountId || !preview.data || preview.data.alreadyRecorded || preview.data.amount <= 0}
              >
                {pay.isPending ? <Spinner /> : null} Catat setoran
              </Button>
            </div>
            {preview.data ? (
              <div className="rounded-xl bg-slate-50 p-4 text-sm dark:bg-slate-800/40">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span>Omzet masa {preview.data.period}: <strong className="tabular-nums">{formatIDR(preview.data.omzet)}</strong></span>
                  <span>PPh Final ({preview.data.rate}%): <strong className="tabular-nums text-brand-700 dark:text-brand-300">{formatIDR(preview.data.amount)}</strong></span>
                </div>
                {preview.data.alreadyRecorded ? <p className="mt-2 text-amber-600 dark:text-amber-400">Masa ini sudah dicatat.</p> : null}
                {preview.data.amount <= 0 ? <p className="mt-2 text-slate-500">Belum ada omzet pada masa ini.</p> : null}
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader title="Riwayat setoran PPh Final" />
        <CardBody>
          {list.isLoading ? (
            <Spinner />
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada setoran tercatat.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Masa</th>
                    <th className={`${th} text-right`}>Omzet</th>
                    <th className={`${th} text-right`}>Tarif</th>
                    <th className={`${th} text-right`}>PPh Final</th>
                    <th className={th}>Tgl setor</th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} font-medium`}>{r.period}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.omzet)}</td>
                      <td className={`${td} text-right tabular-nums`}>{r.rate}%</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.amount)}</td>
                      <td className={`${td} tabular-nums`}>{formatDate(r.paidDate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// --- PPh 23 -----------------------------------------------------------------
function Pph23Section({ isAdmin }: { isAdmin: boolean }) {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [contactId, setContactId] = useState("");
  const [taxDate, setTaxDate] = useState(todayStr());
  const [objectType, setObjectType] = useState<string>(PPH23_OBJECTS[0].code);
  const [gross, setGross] = useState("");
  const [depositId, setDepositId] = useState<string | null>(null);
  const [depAccount, setDepAccount] = useState("");

  const rate = PPH23_OBJECTS.find((o) => o.code === objectType)?.rate ?? 2;
  const amount = Math.round(((Number(gross) || 0) * rate) / 100);

  const contactsQuery = useQuery({ queryKey: ["contacts", tenant.tenantId], queryFn: () => api.listItems<{ id: string; name: string }>(tenant.tenantId, "contacts") });
  const accountsQuery = useQuery({ queryKey: ["accounts", tenant.tenantId], queryFn: () => api.accounts(tenant.tenantId) });
  const accounts = accountsQuery.data?.accounts ?? [];
  const cashAccounts = accounts.filter((a) => a.type === "asset" && !a.isArchived && (a.code.startsWith("1-10") || a.code.startsWith("1-11")));
  const sourceAccounts = accounts.filter((a) => !a.isArchived && (a.type === "liability" || a.type === "asset"));
  const [sourceAccountId, setSourceAccountId] = useState("");
  const list = useQuery({ queryKey: ["pph23", tenant.tenantId], queryFn: () => api.pph23List(tenant.tenantId) });

  const create = useMutation({
    mutationFn: () => api.createPph23(tenant.tenantId, { contactId, taxDate, objectType, gross: Number(gross) || 0, rate, sourceAccountId, note: "" }),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ["pph23", tenant.tenantId] });
      setGross("");
      toast("success", `Bukti potong ${r.docNo} dibuat.`);
    },
    onError: (e: Error) => toast("error", e.message),
  });
  const deposit = useMutation({
    mutationFn: (id: string) => api.depositPph23(tenant.tenantId, id, { accountId: depAccount, depositDate: todayStr() }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pph23", tenant.tenantId] });
      setDepositId(null);
      toast("success", "PPh 23 disetor.");
    },
    onError: (e: Error) => toast("error", e.message),
  });

  const records = list.data?.records ?? [];
  return (
    <div className="space-y-6">
      {isAdmin ? (
        <Card>
          <CardHeader title="Buat bukti potong PPh 23" description="Potong PPh 23 atas jasa/sewa/royalti/dll dari rekanan. Menciptakan Hutang PPh 23 untuk disetor." />
          <CardBody className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <Label htmlFor="p23-contact">Rekanan (dipotong)</Label>
                <Select id="p23-contact" value={contactId} onChange={(e) => setContactId(e.target.value)}>
                  <option value="">— pilih rekanan —</option>
                  {(contactsQuery.data?.items ?? []).map((k) => (
                    <option key={k.id} value={k.id}>{k.name}</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="p23-object">Objek pajak</Label>
                <Select id="p23-object" value={objectType} onChange={(e) => setObjectType(e.target.value)}>
                  {PPH23_OBJECTS.map((o) => (
                    <option key={o.code} value={o.code}>{o.label} ({o.rate}%)</option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="p23-date">Tanggal</Label>
                <Input id="p23-date" type="date" value={taxDate} onChange={(e) => setTaxDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="p23-gross">Dasar pengenaan (Rp)</Label>
                <Input id="p23-gross" type="number" min={0} value={gross} onChange={(e) => setGross(e.target.value)} placeholder="mis. 10000000" />
              </div>
              <div>
                <Label htmlFor="p23-source">Akun sumber</Label>
                <Select id="p23-source" value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)}>
                  <option value="">— hutang usaha / kas —</option>
                  {sourceAccounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.code} · {a.name}</option>
                  ))}
                </Select>
              </div>
              <div className="flex items-end">
                <div className="w-full rounded-xl bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/40">
                  PPh dipotong ({rate}%): <strong className="tabular-nums">{formatIDR(amount)}</strong>
                </div>
              </div>
            </div>
            <Button onClick={() => create.mutate()} disabled={create.isPending || !contactId || !sourceAccountId || amount <= 0}>
              {create.isPending ? <Spinner /> : null} Buat bukti potong
            </Button>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader
          title="Bukti potong PPh 23"
          action={
            records.length > 0 ? (
              <Button
                variant="secondary"
                className="h-9"
                onClick={() =>
                  downloadCsv(
                    "pph23.csv",
                    ["Nomor", "Tanggal", "Rekanan", "NPWP", "Objek", "DPP", "Tarif", "PPh 23", "Status"],
                    records.map((r) => [r.docNo, r.taxDate, r.contactName, r.contactNpwp ?? "-", PPH23_OBJECT_LABELS[r.objectType] ?? r.objectType, r.gross, `${r.rate}%`, r.amount, r.deposited ? "Disetor" : "Belum"]),
                  )
                }
              >
                <Download className="size-4" aria-hidden /> Ekspor CSV
              </Button>
            ) : undefined
          }
        />
        <CardBody>
          {list.isLoading ? (
            <Spinner />
          ) : records.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada bukti potong.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className={th}>Nomor</th>
                    <th className={th}>Tanggal</th>
                    <th className={th}>Rekanan</th>
                    <th className={th}>Objek</th>
                    <th className={`${th} text-right`}>DPP</th>
                    <th className={`${th} text-right`}>PPh 23</th>
                    <th className={th}>Status</th>
                    {isAdmin ? <th className={th}></th> : null}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r) => (
                    <tr key={r.id}>
                      <td className={`${td} font-mono text-xs`}>{r.docNo}</td>
                      <td className={`${td} tabular-nums`}>{formatDate(r.taxDate)}</td>
                      <td className={td}>{r.contactName}</td>
                      <td className={td}>{PPH23_OBJECT_LABELS[r.objectType] ?? r.objectType}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.gross)}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatIDR(r.amount)}</td>
                      <td className={td}>{r.deposited ? <Badge tone="green">Disetor</Badge> : <Badge tone="amber">Belum setor</Badge>}</td>
                      {isAdmin ? (
                        <td className={`${td} text-right`}>
                          {!r.deposited ? (
                            depositId === r.id ? (
                              <span className="flex items-center gap-1">
                                <Select value={depAccount} onChange={(e) => setDepAccount(e.target.value)} className="h-8">
                                  <option value="">kas/bank</option>
                                  {cashAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.code}</option>
                                  ))}
                                </Select>
                                <Button className="h-8" onClick={() => deposit.mutate(r.id)} disabled={deposit.isPending || !depAccount}>Setor</Button>
                                <Button variant="ghost" className="h-8" onClick={() => setDepositId(null)}>Batal</Button>
                              </span>
                            ) : (
                              <Button variant="secondary" className="h-8" onClick={() => { setDepositId(r.id); setDepAccount(""); }}>Setor</Button>
                            )
                          ) : null}
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

// --- SPT Masa PPN 1111 ------------------------------------------------------
function SptPpnSection() {
  const { tenant } = useWorkspace();
  const [period, setPeriod] = useState(thisMonth());
  const query = useQuery({ queryKey: ["spt-ppn", tenant.tenantId, period], queryFn: () => api.sptPpn(tenant.tenantId, period), enabled: /^\d{4}-\d{2}$/.test(period) });
  const data = query.data;
  const netLabel = useMemo(() => {
    if (!data) return "";
    return data.net >= 0 ? "PPN Kurang Bayar (setor)" : "PPN Lebih Bayar (kompensasi)";
  }, [data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="SPT Masa PPN 1111"
          description="Rekap Pajak Keluaran (A: faktur penjualan ber-PPN) vs Pajak Masukan (B: pembelian ber-PPN)."
          action={
            data ? (
              <Button
                variant="secondary"
                className="h-9"
                onClick={() =>
                  downloadCsv(
                    `spt-ppn-1111-${period}.csv`,
                    ["Bagian", "Nomor", "Tanggal", "Lawan Transaksi", "NPWP", "DPP", "PPN"],
                    [
                      ...data.output.map((r) => ["A - Keluaran", r.docNo, r.date, r.partnerName, r.partnerNpwp ?? "-", r.dpp, r.ppn]),
                      ...data.input.map((r) => ["B - Masukan", r.docNo, r.date, r.partnerName, r.partnerNpwp ?? "-", r.dpp, r.ppn]),
                    ],
                  )
                }
              >
                <Download className="size-4" aria-hidden /> Ekspor CSV
              </Button>
            ) : undefined
          }
        />
        <CardBody className="space-y-5">
          <div>
            <Label htmlFor="spt-period">Masa (bulan)</Label>
            <Input id="spt-period" type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="max-w-[12rem]" />
          </div>
          {query.isLoading ? (
            <Spinner />
          ) : !data ? null : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500">Pajak Keluaran (A)</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatIDR(data.totalOutputPpn)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-4 dark:bg-slate-800/40">
                  <p className="text-xs text-slate-500">Pajak Masukan (B)</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatIDR(data.totalInputPpn)}</p>
                </div>
                <div className={`rounded-xl p-4 ${data.net >= 0 ? "bg-amber-50 dark:bg-amber-500/10" : "bg-emerald-50 dark:bg-emerald-500/10"}`}>
                  <p className="text-xs text-slate-500">{netLabel}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{formatIDR(Math.abs(data.net))}</p>
                </div>
              </div>
              <SptTable title="A. Pajak Keluaran (faktur penjualan)" rows={data.output} totalDpp={data.totalOutputDpp} totalPpn={data.totalOutputPpn} />
              <SptTable title="B. Pajak Masukan (pembelian)" rows={data.input} totalDpp={data.totalInputDpp} totalPpn={data.totalInputPpn} />
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function SptTable({ title, rows, totalDpp, totalPpn }: { title: string; rows: { docNo: string; date: string; partnerName: string; partnerNpwp: string | null; dpp: number; ppn: number }[]; totalDpp: number; totalPpn: number }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">Tidak ada transaksi ber-PPN pada masa ini.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800">
                <th className={th}>Nomor</th>
                <th className={th}>Tanggal</th>
                <th className={th}>Lawan Transaksi</th>
                <th className={`${th} text-right`}>DPP</th>
                <th className={`${th} text-right`}>PPN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.docNo}>
                  <td className={`${td} font-mono text-xs`}>{r.docNo}</td>
                  <td className={`${td} tabular-nums`}>{formatDate(r.date)}</td>
                  <td className={td}>{r.partnerName}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatIDR(r.dpp)}</td>
                  <td className={`${td} text-right tabular-nums`}>{formatIDR(r.ppn)}</td>
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="py-2 pr-4" colSpan={3}>Total ({rows.length})</td>
                <td className="py-2 pr-4 text-right tabular-nums">{formatIDR(totalDpp)}</td>
                <td className="py-2 text-right tabular-nums">{formatIDR(totalPpn)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
