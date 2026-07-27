import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import type { ApiAccount } from "@erpindo/shared";
import { api, formatIDR } from "../api/client";
import {
  Alert,
  Button,
  Card,
  CardBody,
  CardHeader,
  Input,
  Label,
  PageHeading,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useUi, type UiKey } from "../i18n/ui";
import { useWorkspace } from "./app";

/**
 * Catat Transaksi — wizard berbahasa sehari-hari untuk pengguna yang tidak
 * akrab dengan jurnal/debit-kredit. Pengguna memilih kategori awam; sistem
 * membentuk jurnal 2 baris yang seimbang dan mempostingnya lewat endpoint
 * jurnal yang sudah ada. Tidak ada jalur pembukuan baru.
 */

type Mode = "masuk" | "keluar" | "pindah";

/**
 * Kategori awam → kode akun template COA. Kategori disembunyikan bila kode tak
 * ada di COA tenant.
 *
 * Fase 19d: yang disimpan kini **kunci kamus**, bukan label berbahasa Indonesia.
 * Sebelumnya labelnya merangkap dua peran — teks yang ditampilkan SEKALIGUS
 * nilai `<option>` dan kunci pencarian (`categories.find(c => c.label ===
 * category)`). Menerjemahkan labelnya begitu saja akan memutus pencarian itu
 * setiap kali bahasa diganti: `category` masih menyimpan teks bahasa lama
 * sementara daftarnya sudah berganti, sehingga kategori terpilih diam-diam
 * hilang dan jurnalnya gagal terbentuk.
 *
 * `satisfies` dipakai supaya kunci yang salah tulis tertangkap saat kompilasi,
 * bukan menjadi teks kosong saat dijalankan (pola Fase 16u).
 */
const CATEGORIES = {
  keluar: [
    { key: "katListrikAir", code: "5-4000" },
    { key: "katSewaTempat", code: "5-3000" },
    { key: "katGajiKaryawan", code: "5-2000" },
    { key: "katPerlengkapan", code: "5-4000" },
    { key: "katBayarHutang", code: "2-1000" },
    { key: "katPrive", code: "3-1000" },
  ],
  masuk: [
    { key: "katSetoranModal", code: "3-1000" },
    { key: "katPendapatanLain", code: "4-2000" },
    { key: "katPelunasanPiutang", code: "1-1200" },
  ],
} satisfies Record<Exclude<Mode, "pindah">, { key: UiKey; code: string }[]>;

const MODE_META = [
  { key: "masuk", labelKey: "uangMasuk", icon: ArrowDownToLine },
  { key: "keluar", labelKey: "uangKeluar", icon: ArrowUpFromLine },
  { key: "pindah", labelKey: "pindahDana", icon: ArrowRightLeft },
] satisfies { key: Mode; labelKey: UiKey; icon: typeof ArrowDownToLine }[];

const MANUAL = "__manual__";

function isWallet(a: ApiAccount): boolean {
  return (
    a.type === "asset" && (a.code === "1-1000" || a.code === "1-1100" || /kas|bank/i.test(a.name))
  );
}

export function CatatPage() {
  const { tenant } = useWorkspace();
  const u = useUi();
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
    [accountsQuery.data]
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
        : byCode.get(categories.find((c) => c.key === category)?.code ?? "");
  // Label tampil diterjemahkan dari kuncinya; MANUAL memakai nama akun pilihan.
  const categoryLabel =
    category === MANUAL
      ? (targetAccount?.name ?? "…")
      : category
        ? u(category as UiKey)
        : "…";
  const amountInt = Math.round(Number(amount) || 0);

  const preview =
    amountInt > 0 && wallet && targetAccount
      ? mode === "masuk"
        ? `${formatIDR(amountInt)} ${u("pratinjauMasukKe")} ${wallet.name} ${u("pratinjauDari")} "${categoryLabel}".`
        : mode === "keluar"
          ? `${formatIDR(amountInt)} ${u("pratinjauKeluarDari")} ${wallet.name} ${u("pratinjauUntuk")} "${categoryLabel}".`
          : `${formatIDR(amountInt)} ${u("pratinjauDipindahDari")} ${wallet.name} ${u("pratinjauKe")} ${targetAccount.name}.`
      : null;

  const mutation = useMutation({
    mutationFn: () => {
      if (!wallet || !targetAccount) throw new Error(u("pilihDompetKategoriDulu"));
      const memo =
        note.trim() ||
        (mode === "pindah" ? `${u("pindahDana")} ${wallet.name} → ${targetAccount.name}` : categoryLabel);
      const debitFirst = mode !== "keluar"; // masuk & pindah: dana bertambah di tujuan (debit)
      const lines =
        mode === "keluar"
          ? [
              { accountId: targetAccount.id, debit: amountInt, credit: 0 },
              { accountId: wallet.id, debit: 0, credit: amountInt },
            ]
          : [
              {
                accountId: (mode === "pindah" ? targetAccount : wallet).id,
                debit: amountInt,
                credit: 0,
              },
              {
                accountId: (mode === "pindah" ? wallet : targetAccount).id,
                debit: 0,
                credit: amountInt,
              },
            ];
      void debitFirst;
      return api.createJournalEntry(tenant.tenantId, { entryDate, memo, lines });
    },
    onSuccess: () => {
      toast("success", `${u("tercatatPrefix")} ${preview ?? u("transaksiTersimpan")}`);
      setAmount("");
      setNote("");
      queryClient.invalidateQueries({ queryKey: ["journal", tenant.tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (amountInt <= 0) {
      toast("error", u("isiJumlahDulu"));
      return;
    }
    mutation.mutate();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <PageHeading k="catatTransaksi" />
      </div>

      {!canWrite ? (
        <Alert tone="info">
          {u("hanyaLihatCatat")}
        </Alert>
      ) : null}

      <Card>
        <CardBody className="space-y-5">
          <div className="grid grid-cols-3 gap-2" role="tablist" aria-label={u("jenisTransaksi")}>
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
                {u(m.labelKey)}
              </button>
            ))}
          </div>

          {accountsQuery.isLoading ? (
            <Spinner />
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="catat-tanggal">{u("tanggal")}</Label>
                  <Input
                    id="catat-tanggal"
                    type="date"
                    value={entryDate}
                    onChange={(e) => setEntryDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="catat-jumlah">{u("jumlahRupiah")}</Label>
                  <Input
                    id="catat-jumlah"
                    type="number"
                    min="1"
                    step="1"
                    placeholder={u("contohNominal")}
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="catat-dompet">
                    {mode === "pindah" ? u("dariDompet") : u("dompetKasBank")}
                  </Label>
                  <Select
                    id="catat-dompet"
                    value={wallet?.id ?? ""}
                    onChange={(e) => setWalletId(e.target.value)}
                  >
                    {wallets.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </Select>
                </div>
                {mode === "pindah" ? (
                  <div>
                    <Label htmlFor="catat-dompet-tujuan">{u("keDompet")}</Label>
                    <Select
                      id="catat-dompet-tujuan"
                      value={walletTo?.id ?? ""}
                      onChange={(e) => setWalletToId(e.target.value)}
                    >
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
                    <Label htmlFor="catat-kategori">
                      {mode === "masuk" ? u("uangnyaDariMana") : u("untukApa")}
                    </Label>
                    <Select
                      id="catat-kategori"
                      value={category}
                      onChange={(e) => setCategory(e.target.value)}
                      required
                    >
                      <option value="">{u("pilihKategoriOpsi")}</option>
                      {categories.map((c) => (
                        <option key={c.key} value={c.key}>
                          {u(c.key)}
                        </option>
                      ))}
                      <option value={MANUAL}>{u("kategoriLainnya")}</option>
                    </Select>
                  </div>
                )}
              </div>

              {category === MANUAL && mode !== "pindah" ? (
                <div>
                  <Label htmlFor="catat-akun-manual">{u("akunTujuan")}</Label>
                  <Select
                    id="catat-akun-manual"
                    value={manualAccountId}
                    onChange={(e) => setManualAccountId(e.target.value)}
                    required
                  >
                    <option value="">{u("pilihAkunOpsi")}</option>
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
                <Label htmlFor="catat-catatan">{u("catatanOpsional")}</Label>
                <Input
                  id="catat-catatan"
                  placeholder={u("contohCatatanListrik")}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>

              {preview ? (
                <div className="rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200">
                  {u("yangAkanDicatat")} <span className="font-medium">{preview}</span>
                </div>
              ) : null}

              <Button type="submit" disabled={!canWrite || mutation.isPending || !preview}>
                {mutation.isPending ? u("menyimpanEllipsis") : u("catatAksi")}
              </Button>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={u("bagaimanaDibukukan")}
          description={u("descBagaimanaDibukukan")}
        />
      </Card>
    </div>
  );
}
