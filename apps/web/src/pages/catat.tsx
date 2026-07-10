import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { ApiAccount } from "@erpindo/shared";
import { api, formatIDR } from "../api/client";
import { Alert, Button, Card, CardBody, CardHeader, Input, Label, Select, Spinner, useToast } from "../components/ui";
import { useWorkspace } from "./app";

/**
 * Catat Transaksi — wizard berbahasa sehari-hari untuk pengguna yang tidak
 * akrab dengan jurnal/debit-kredit. Pengguna memilih kategori awam; sistem
 * membentuk jurnal 2 baris yang seimbang dan mempostingnya lewat endpoint
 * jurnal yang sudah ada. Tidak ada jalur pembukuan baru.
 */

type Mode = "masuk" | "keluar" | "pindah";

/** Kategori awam → kode akun template COA. Kategori disembunyikan bila kode tak ada di COA tenant. */
const CATEGORIES: Record<Exclude<Mode, "pindah">, { label: string; code: string }[]> = {
  keluar: [
    { label: "Bayar listrik, air & internet", code: "5-4000" },
    { label: "Sewa tempat", code: "5-3000" },
    { label: "Gaji karyawan", code: "5-2000" },
    { label: "Perlengkapan & operasional", code: "5-4000" },
    { label: "Bayar hutang usaha", code: "2-1000" },
    { label: "Prive (ambil uang pribadi)", code: "3-1000" },
  ],
  masuk: [
    { label: "Setoran modal", code: "3-1000" },
    { label: "Pendapatan di luar faktur", code: "4-2000" },
    { label: "Terima pelunasan piutang (di luar faktur)", code: "1-1200" },
  ],
};

const MODE_META: { key: Mode; label: string; icon: typeof ArrowDownToLine }[] = [
  { key: "masuk", label: "Uang Masuk", icon: ArrowDownToLine },
  { key: "keluar", label: "Uang Keluar", icon: ArrowUpFromLine },
  { key: "pindah", label: "Pindah Dana", icon: ArrowRightLeft },
];

const MANUAL = "__manual__";

function isWallet(a: ApiAccount): boolean {
  return a.type === "asset" && (a.code === "1-1000" || a.code === "1-1100" || /kas|bank/i.test(a.name));
}

export function CatatPage() {
  const { tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const canWrite = tenant.role !== "viewer";

  const [mode, setMode] = useState<Mode>("keluar");
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [walletId, setWalletId] = useState("");
  const [walletToId, setWalletToId] = useState("");
  const [category, setCategory] = useState("");
  const [manualAccountId, setManualAccountId] = useState("");
  const [note, setNote] = useState("");

  const accountsQuery = useQuery({
    queryKey: ["accounts", tenant.tenantId],
    queryFn: () => api.accounts(tenant.tenantId),
  });
  const accounts = useMemo(
    () => (accountsQuery.data?.accounts ?? []).filter((a) => !a.isArchived),
    [accountsQuery.data],
  );
  const wallets = accounts.filter(isWallet);
  const byCode = useMemo(() => new Map(accounts.map((a) => [a.code, a])), [accounts]);
  const byId = useMemo(() => new Map(accounts.map((a) => [a.id, a])), [accounts]);

  // Kategori yang kodenya benar-benar ada di COA tenant ini.
  const categories = mode === "pindah" ? [] : CATEGORIES[mode].filter((c) => byCode.has(c.code));

  const wallet = byId.get(walletId) ?? wallets[0];
  const walletTo = byId.get(walletToId) ?? wallets.find((w) => w.id !== wallet?.id);
  const targetAccount =
    mode === "pindah"
      ? walletTo
      : category === MANUAL
        ? byId.get(manualAccountId)
        : byCode.get(categories.find((c) => c.label === category)?.code ?? "");
  const categoryLabel = category === MANUAL ? (targetAccount?.name ?? "…") : category || "…";
  const amountInt = Math.round(Number(amount) || 0);

  const preview =
    amountInt > 0 && wallet && targetAccount
      ? mode === "masuk"
        ? `${formatIDR(amountInt)} masuk ke ${wallet.name} dari "${categoryLabel}".`
        : mode === "keluar"
          ? `${formatIDR(amountInt)} keluar dari ${wallet.name} untuk "${categoryLabel}".`
          : `${formatIDR(amountInt)} dipindahkan dari ${wallet.name} ke ${targetAccount.name}.`
      : null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!wallet || !targetAccount) throw new Error("Pilih dompet dan kategori dulu.");
      const memo = note.trim() || (mode === "pindah" ? `Pindah dana ${wallet.name} → ${targetAccount.name}` : categoryLabel);
      const debitFirst = mode !== "keluar"; // masuk & pindah: dana bertambah di tujuan (debit)
      const lines =
        mode === "keluar"
          ? [
              { accountId: targetAccount.id, debit: amountInt, credit: 0 },
              { accountId: wallet.id, debit: 0, credit: amountInt },
            ]
          : [
              { accountId: (mode === "pindah" ? targetAccount : wallet).id, debit: amountInt, credit: 0 },
              { accountId: (mode === "pindah" ? wallet : targetAccount).id, debit: 0, credit: amountInt },
            ];
      void debitFirst;
      return api.createJournalEntry(tenant.tenantId, { entryDate, memo, lines });
    },
    onSuccess: () => {
      toast("success", `Tercatat: ${preview ?? "transaksi tersimpan."}`);
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["journal", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (amountInt <= 0) {
      toast("error", "Isi jumlah uangnya dulu.");
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Catat Transaksi</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Catat uang masuk, uang keluar, atau pindah dana dengan bahasa sehari-hari — pembukuan (jurnal) dibuat otomatis
          di belakang layar. Tanpa perlu paham debit-kredit.
        </p>
      </div>

      {!canWrite ? <Alert tone="info">Peran Anda hanya bisa melihat — minta Owner/Admin untuk mencatat transaksi.</Alert> : null}

      <Card>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Jenis transaksi">
            {MODE_META.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                onClick={() => {
                  setMode(m.key);
                  setCategory("");
                }}
                className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-3 text-sm font-medium transition-colors sm:flex-row sm:justify-center ${
                  mode === m.key
                    ? "border-brand-300 bg-brand-50 text-brand-700 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-200"
                    : "border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800/60"
                }`}
              >
                <m.icon className="size-4 shrink-0" aria-hidden />
                {m.label}
              </button>
            ))}
          </div>

          {accountsQuery.isLoading ? (
            <Spinner />
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="catat-tanggal">Tanggal</Label>
                  <Input id="catat-tanggal" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} required />
                </div>
                <div>
                  <Label htmlFor="catat-jumlah">Jumlah (Rp)</Label>
                  <Input
                    id="catat-jumlah"
                    type="number"
                    min="1"
                    step="1"
                    placeholder="mis. 500000"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="catat-dompet">{mode === "pindah" ? "Dari dompet" : "Dompet (kas/bank)"}</Label>
                  <Select id="catat-dompet" value={wallet?.id ?? ""} onChange={(e) => setWalletId(e.target.value)}>
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {mode === "pindah" ? (
                  <div>
                    <Label htmlFor="catat-dompet-tujuan">Ke dompet</Label>
                    <Select id="catat-dompet-tujuan" value={walletTo?.id ?? ""} onChange={(e) => setWalletToId(e.target.value)}>
                      {wallets
                        .filter((w) => w.id !== wallet?.id)
                        .map((w) => (
                          <option key={w.id} value={w.id}>
                            {w.name}
                          </option>
                        ))}
                    </Select>
                  </div>
                ) : (
                  <div>
                    <Label htmlFor="catat-kategori">{mode === "masuk" ? "Uangnya dari mana?" : "Untuk apa?"}</Label>
                    <Select
                      id="catat-kategori"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                    >
                      <option value="">— pilih kategori —</option>
                      {categories.map((c) => (
                        <option key={c.label} value={c.label}>
                          {c.label}
                        </option>
                      ))}
                      <option value={MANUAL}>Lainnya — pilih akun sendiri…</option>
                    </Select>
                  </div>
                )}
              </div>

              {category === MANUAL && mode !== "pindah" ? (
                <div>
                  <Label htmlFor="catat-akun-manual">Akun tujuan</Label>
                  <Select id="catat-akun-manual" value={manualAccountId} onChange={(e) => setManualAccountId(e.target.value)} required>
                    <option value="">— pilih akun —</option>
                    {accounts
                      .filter((a) => !isWallet(a))
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} · {a.name}
                        </option>
                      ))}
                  </Select>
                </div>
              ) : null}

              <div>
                <Label htmlFor="catat-catatan">Catatan (opsional)</Label>
                <Input
                  id="catat-catatan"
                  placeholder="mis. token listrik bulan Juli"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {preview ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
                  Yang akan dicatat: <span className="font-medium">{preview}</span>
                </div>
              ) : null}

              <Button type="submit" disabled={!canWrite || mutation.isPending || !preview}>
                {mutation.isPending ? "Menyimpan…" : "Catat"}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="Bagaimana ini dibukukan?"
          description="Setiap catatan menjadi jurnal 2 baris yang seimbang — sama seperti dicatat akuntan. Rinciannya bisa dilihat di Jurnal Umum (menu bisa disembunyikan lewat Mode Sederhana di Pengaturan)."
        />
      </Card>
    </div>
  );
}
