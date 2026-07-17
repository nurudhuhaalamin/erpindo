import {
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_STATUS_LABELS,
  FEEDBACK_STATUSES,
  PLAN_LABELS,
  renderMarkdown,
  type ApiBlogPost,
  type Plan,
} from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, formatDate } from "../api/client";
import { useDebounced } from "./commerce";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  ConfirmDialog,
  Input,
  Label,
  Select,
  Spinner,
  useToast,
} from "../components/ui";
import { useWorkspace } from "./app";

/**
 * Dashboard admin platform (Fase 10e) — hanya untuk email pada
 * PLATFORM_ADMIN_EMAILS: pantau pendaftar & langganan, kelola masukan
 * pengguna, dan tulis artikel blog (tayang SSR di /blog).
 */

const TABS = ["Ringkasan", "Tenant", "Infra", "Masukan", "Blog"] as const;
type Tab = (typeof TABS)[number];

const STATUS_TONE: Record<string, "green" | "amber" | "red" | "neutral" | "brand"> = {
  active: "green",
  trial: "brand",
  past_due: "amber",
  suspended: "red",
};

export function AdminPage() {
  const { me } = useWorkspace();
  const [tab, setTab] = useState<Tab>("Ringkasan");

  if (!me.user.isPlatformAdmin) {
    return (
      <div className="p-2">
        <Alert tone="error">Halaman ini khusus admin platform ERPindo.</Alert>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Admin Platform</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Pantau pendaftar &amp; langganan, tanggapi masukan pengguna, dan kelola artikel blog.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Bagian admin">
        {TABS.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`rounded-lg px-3.5 py-2 text-sm font-medium ${
              tab === t
                ? "bg-brand-600 text-white shadow-sm"
                : "bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Ringkasan" ? <OverviewTab /> : null}
      {tab === "Tenant" ? <TenantsTab /> : null}
      {tab === "Infra" ? <InfraTab /> : null}
      {tab === "Masukan" ? <FeedbackTab /> : null}
      {tab === "Blog" ? <BlogTab /> : null}
    </div>
  );
}

function OverviewTab() {
  const q = useQuery({ queryKey: ["admin-overview"], queryFn: api.adminOverview });
  if (q.isLoading) return <Spinner />;
  if (!q.data) return <Alert tone="error">Gagal memuat ringkasan.</Alert>;
  const d = q.data;
  const stats = [
    { label: "Total perusahaan", value: d.totals.tenants },
    { label: "Total pengguna", value: d.totals.users },
    { label: "Trial berjalan", value: d.byStatus.trial ?? 0 },
    { label: "Aktif berbayar/comped", value: d.byStatus.active ?? 0 },
    { label: "Menunggak (baca-saja)", value: d.byStatus.past_due ?? 0 },
    { label: "Masukan baru", value: d.totals.feedbackBaru },
  ];
  const maxGrowth = Math.max(...d.growth.map((g) => g.n), 1);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardBody>
              <div className="text-sm text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="mt-1 text-2xl font-bold tabular-nums">{s.value}</div>
            </CardBody>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader title="Pendaftaran per bulan" description="Perusahaan baru 12 bulan terakhir." />
        <CardBody>
          <div className="flex h-32 items-end gap-2">
            {d.growth.map((g) => (
              <div key={g.month} className="flex flex-1 flex-col items-center gap-1">
                <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{g.n}</span>
                <div
                  className="w-full rounded-t bg-brand-500"
                  style={{ height: `${Math.max((g.n / maxGrowth) * 100, 4)}%` }}
                />
                <span className="text-[10px] text-slate-400">{g.month.slice(2)}</span>
              </div>
            ))}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Pendaftar terbaru" description="20 perusahaan terakhir beserta email pemiliknya." />
        <CardBody>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Perusahaan</th>
                  <th className="pb-2 pr-4 font-medium">Pemilik</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Paket</th>
                  <th className="pb-2 font-medium">Daftar</th>
                </tr>
              </thead>
              <tbody>
                {d.recentSignups.map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2 pr-4 font-medium">{t.name}</td>
                    <td className="py-2 pr-4">{t.ownerEmail ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{PLAN_LABELS[t.plan as Plan] ?? t.plan}</td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{formatDate(t.createdAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function TenantsTab() {
  const [search, setSearch] = useState("");
  const q = useDebounced(search);
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["admin-tenants", q, status],
    queryFn: () => api.adminTenants({ q, status, limit: 100 }),
    placeholderData: (prev) => prev,
  });
  return (
    <Card>
      <CardHeader title="Semua perusahaan" description={`${query.data?.total ?? 0} perusahaan terdaftar.`} />
      <CardBody className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <Input
            aria-label="Cari perusahaan"
            placeholder="Cari nama/slug…"
            className="max-w-xs"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <Select aria-label="Filter status" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Semua status</option>
            <option value="trial">Trial</option>
            <option value="active">Aktif</option>
            <option value="past_due">Menunggak</option>
            <option value="suspended">Ditangguhkan</option>
          </Select>
        </div>
        {query.isLoading ? (
          <Spinner />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                  <th className="pb-2 pr-4 font-medium">Perusahaan</th>
                  <th className="pb-2 pr-4 font-medium">Pemilik</th>
                  <th className="pb-2 pr-4 font-medium">Status</th>
                  <th className="pb-2 pr-4 font-medium">Paket</th>
                  <th className="pb-2 pr-4 font-medium">Anggota</th>
                  <th className="pb-2 pr-4 font-medium">Trial berakhir</th>
                  <th className="pb-2 font-medium">Daftar</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.tenants ?? []).map((t) => (
                  <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2 pr-4">
                      <div className="font-medium">{t.name}</div>
                      <div className="text-xs text-slate-400">{t.slug}</div>
                    </td>
                    <td className="py-2 pr-4">{t.ownerEmail ?? "—"}</td>
                    <td className="py-2 pr-4">
                      <Badge tone={STATUS_TONE[t.status] ?? "neutral"}>{t.status}</Badge>
                    </td>
                    <td className="py-2 pr-4">{PLAN_LABELS[t.plan as Plan] ?? t.plan}</td>
                    <td className="py-2 pr-4 tabular-nums">{t.members}</td>
                    <td className="py-2 pr-4 text-slate-500 dark:text-slate-400">
                      {t.trialEndsAt ? formatDate(t.trialEndsAt.slice(0, 10)) : "—"}
                    </td>
                    <td className="py-2 text-slate-500 dark:text-slate-400">{formatDate(t.createdAt.slice(0, 10))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

/**
 * Infra & kapasitas (Fase 11a): mode database tenant, versi skema, dan sebaran
 * migrasi antar-tenant. Tombol "Migrasi sekarang" menerapkan migrasi skema baru
 * ke tenant yang tertinggal (idempoten & resumable).
 */
function InfraTab() {
  const toast = useToast();
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ["admin-infra"], queryFn: api.adminInfra });
  const migrate = useMutation({
    mutationFn: api.adminMigrateTenants,
    onSuccess: (r) => {
      toast(
        r.failed ? "error" : "success",
        r.migrated > 0
          ? `${r.migrated} perusahaan dimutakhirkan${r.failed ? `, ${r.failed} gagal` : ""}.`
          : "Semua perusahaan sudah di versi skema terkini.",
      );
      void qc.invalidateQueries({ queryKey: ["admin-infra"] });
    },
    onError: (e) => toast("error", (e as Error).message),
  });

  const d = query.data;
  const behind = d?.tenantsBehind ?? 0;
  const stats = d
    ? [
        { label: "Mode database tenant", value: d.dbMode === "cloudflare" ? "Cloudflare (D1 dinamis)" : "Lokal (pool binding)" },
        { label: "Versi skema terkini", value: `v${d.schemaVersion}` },
        { label: "Total perusahaan", value: String(d.totalTenants) },
        { label: "Tertinggal migrasi", value: String(behind) },
      ]
    : [];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title="Infrastruktur & kapasitas"
          description="Mode database tenant, versi skema, dan status migrasi antar-perusahaan."
        />
        <CardBody className="space-y-4">
          {query.isLoading ? (
            <Spinner />
          ) : !d ? (
            <Alert tone="error">Gagal memuat status infra.</Alert>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((s) => (
                  <div key={s.label} className="rounded-xl bg-slate-50 p-3 ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{s.label}</div>
                    <div className="mt-1 text-lg font-bold tabular-nums">{s.value}</div>
                  </div>
                ))}
              </div>

              {behind > 0 ? (
                <Alert tone="info">
                  {behind} perusahaan belum di versi skema terkini. Klik “Migrasi sekarang” untuk menerapkan migrasi.
                </Alert>
              ) : (
                <Alert tone="success">Semua perusahaan berada di versi skema terkini.</Alert>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => migrate.mutate()} disabled={migrate.isPending}>
                  {migrate.isPending ? "Memigrasi…" : "Migrasi sekarang"}
                </Button>
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  Aman dijalankan berulang — hanya perusahaan yang tertinggal yang disentuh.
                </span>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Sebaran versi skema</h3>
                  <div className="space-y-1">
                    {d.versionDistribution.map((v) => (
                      <div key={v.v} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-900">
                        <span>v{v.v}{v.v === d.schemaVersion ? " (terkini)" : ""}</span>
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">{v.n} perusahaan</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Jenis penyimpanan</h3>
                  <div className="space-y-1">
                    {Object.entries(d.refKinds).map(([kind, n]) => (
                      <div key={kind} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-slate-900">
                        <span>{kind === "cloudflare" ? "D1 dinamis (uuid)" : "Pool binding lokal"}</span>
                        <span className="tabular-nums text-slate-500 dark:text-slate-400">{n} perusahaan</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {d.behind.length > 0 ? (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">Perusahaan tertinggal</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                          <th className="pb-2 pr-4 font-medium">Perusahaan</th>
                          <th className="pb-2 font-medium">Versi skema</th>
                        </tr>
                      </thead>
                      <tbody>
                        {d.behind.map((t) => (
                          <tr key={t.id} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                            <td className="py-2 pr-4">
                              <div className="font-medium">{t.name}</div>
                              <div className="text-xs text-slate-400">{t.slug}</div>
                            </td>
                            <td className="py-2 tabular-nums">v{t.schemaVersion} → v{d.schemaVersion}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function FeedbackTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState("");
  const query = useQuery({
    queryKey: ["admin-feedback", status],
    queryFn: () => api.adminFeedback(status || undefined),
    placeholderData: (prev) => prev,
  });
  const update = useMutation({
    mutationFn: (input: { id: string; status?: string; adminNote?: string }) =>
      api.adminUpdateFeedback(input.id, { status: input.status, adminNote: input.adminNote }),
    onSuccess: () => {
      toast("success", "Masukan diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["admin-feedback"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const [noteDraft, setNoteDraft] = useState<Record<string, string>>({});
  return (
    <Card>
      <CardHeader title="Masukan pengguna" description="Saran fitur, laporan bug, dan pertanyaan dari seluruh pengguna." />
      <CardBody className="space-y-3">
        <Select aria-label="Filter status masukan" className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Semua status</option>
          {FEEDBACK_STATUSES.map((s) => (
            <option key={s} value={s}>
              {FEEDBACK_STATUS_LABELS[s]}
            </option>
          ))}
        </Select>
        {query.isLoading ? (
          <Spinner />
        ) : (query.data?.feedback ?? []).length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada masukan.</p>
        ) : (
          (query.data?.feedback ?? []).map((f) => (
            <div key={f.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="brand">{FEEDBACK_CATEGORY_LABELS[f.category]}</Badge>
                <span className="font-medium">{f.userName}</span>
                <span className="text-xs text-slate-400">{f.userEmail}</span>
                {f.tenantName ? <span className="text-xs text-slate-400">· {f.tenantName}</span> : null}
                <span className="text-xs text-slate-400">· {formatDate(f.createdAt.slice(0, 10))}</span>
                <span className="ml-auto">
                  <Select
                    aria-label={`Status masukan ${f.id}`}
                    className="h-8 w-32"
                    value={f.status}
                    onChange={(e) => update.mutate({ id: f.id, status: e.target.value })}
                  >
                    {FEEDBACK_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {FEEDBACK_STATUS_LABELS[s]}
                      </option>
                    ))}
                  </Select>
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-slate-700 dark:text-slate-200">{f.message}</p>
              {f.pagePath ? <p className="mt-1 text-xs text-slate-400">Halaman: {f.pagePath}</p> : null}
              <div className="mt-2 flex gap-2">
                <Input
                  aria-label={`Balasan untuk ${f.id}`}
                  placeholder={f.adminNote ? `Balasan: ${f.adminNote}` : "Tulis balasan singkat (tampil ke pengguna)…"}
                  className="h-9 flex-1"
                  value={noteDraft[f.id] ?? ""}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, [f.id]: e.target.value }))}
                />
                <Button
                  variant="secondary"
                  className="h-9"
                  disabled={!noteDraft[f.id]?.trim() || update.isPending}
                  onClick={() => {
                    update.mutate({ id: f.id, adminNote: noteDraft[f.id]!.trim() });
                    setNoteDraft((d) => ({ ...d, [f.id]: "" }));
                  }}
                >
                  Balas
                </Button>
              </div>
            </div>
          ))
        )}
      </CardBody>
    </Card>
  );
}

const EMPTY_POST = { slug: "", title: "", excerpt: "", bodyMd: "", coverUrl: "" };

function BlogTab() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["admin-blog"], queryFn: api.adminBlogPosts });
  const [editing, setEditing] = useState<ApiBlogPost | null>(null);
  const [form, setForm] = useState(EMPTY_POST);
  const [preview, setPreview] = useState(false);
  const [deleting, setDeleting] = useState<ApiBlogPost | null>(null);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["admin-blog"] });
  const save = useMutation({
    mutationFn: () => {
      const input = {
        slug: form.slug.trim(),
        title: form.title.trim(),
        excerpt: form.excerpt.trim() || undefined,
        bodyMd: form.bodyMd,
        coverUrl: form.coverUrl.trim(),
      };
      return editing ? api.adminUpdateBlogPost(editing.id, input) : api.adminCreateBlogPost(input);
    },
    onSuccess: () => {
      toast("success", editing ? "Artikel diperbarui." : "Draf artikel dibuat — terbitkan bila sudah siap.");
      setEditing(null);
      setForm(EMPTY_POST);
      refresh();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const publish = useMutation({
    mutationFn: (input: { id: string; published: boolean }) =>
      api.adminUpdateBlogPost(input.id, { published: input.published }),
    onSuccess: (_res, vars) => {
      toast("success", vars.published ? "Artikel TAYANG di /blog." : "Artikel ditarik jadi draf.");
      refresh();
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const doDelete = useMutation({
    mutationFn: (id: string) => api.adminDeleteBlogPost(id),
    onSuccess: () => {
      toast("success", "Artikel dihapus.");
      setDeleting(null);
      refresh();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={editing ? `Ubah artikel: ${editing.title}` : "Artikel baru"}
          description="Markdown sederhana: # judul, - daftar, **tebal**, [tautan](https://…). Artikel tayang di /blog setelah diterbitkan."
        />
        <CardBody className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="blog-title">Judul</Label>
              <Input id="blog-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label htmlFor="blog-slug">Slug (URL)</Label>
              <Input
                id="blog-slug"
                placeholder="cara-hitung-hpp-umkm"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value })}
              />
            </div>
          </div>
          <div>
            <Label htmlFor="blog-excerpt">Ringkasan (untuk daftar & meta description)</Label>
            <Input id="blog-excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
          </div>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="blog-body" className="mb-0">
                Isi artikel (Markdown)
              </Label>
              <button
                type="button"
                className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
                onClick={() => setPreview((p) => !p)}
              >
                {preview ? "Tulis" : "Pratinjau"}
              </button>
            </div>
            {preview ? (
              <div
                className="prose-blog min-h-40 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-900"
                // renderMarkdown escape-first — aman XSS by construction.
                dangerouslySetInnerHTML={{ __html: renderMarkdown(form.bodyMd || "*Belum ada isi.*") }}
              />
            ) : (
              <textarea
                id="blog-body"
                rows={12}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                value={form.bodyMd}
                onChange={(e) => setForm({ ...form, bodyMd: e.target.value })}
              />
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {editing ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setEditing(null);
                  setForm(EMPTY_POST);
                }}
              >
                Batal
              </Button>
            ) : null}
            <Button onClick={() => save.mutate()} disabled={save.isPending || !form.title.trim() || !form.slug.trim() || form.bodyMd.length < 10}>
              {save.isPending ? <Spinner /> : null} {editing ? "Simpan Perubahan" : "Simpan Draf"}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Semua artikel" description="Draf tidak tampil di /blog sampai diterbitkan." />
        <CardBody>
          {query.isLoading ? (
            <Spinner />
          ) : (query.data?.posts ?? []).length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada artikel.</p>
          ) : (
            <div className="space-y-2">
              {(query.data?.posts ?? []).map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                  <span className="font-medium">{p.title}</span>
                  <span className="font-mono text-xs text-slate-400">/blog/{p.slug}</span>
                  {p.publishedAt ? <Badge tone="green">TAYANG</Badge> : <Badge tone="amber">DRAF</Badge>}
                  <span className="ml-auto flex gap-2">
                    {p.publishedAt ? (
                      <a
                        href={`/blog/${p.slug}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
                      >
                        Lihat
                      </a>
                    ) : null}
                    <button
                      className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
                      onClick={() => {
                        setEditing(p);
                        setForm({
                          slug: p.slug,
                          title: p.title,
                          excerpt: p.excerpt ?? "",
                          bodyMd: p.bodyMd,
                          coverUrl: p.coverUrl ?? "",
                        });
                        window.scrollTo({ top: 0, behavior: "smooth" });
                      }}
                    >
                      Ubah
                    </button>
                    <button
                      className="text-xs font-medium text-brand-700 underline-offset-2 hover:underline dark:text-brand-400"
                      onClick={() => publish.mutate({ id: p.id, published: !p.publishedAt })}
                    >
                      {p.publishedAt ? "Tarik" : "Terbitkan"}
                    </button>
                    <button
                      className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                      onClick={() => setDeleting(p)}
                    >
                      Hapus
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={deleting !== null}
        title={`Hapus artikel "${deleting?.title}"?`}
        description="Artikel dihapus permanen dari blog. Aksi ini tidak bisa diurungkan."
        confirmLabel="Ya, hapus artikel"
        danger
        busy={doDelete.isPending}
        onConfirm={() => deleting && doDelete.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}
