// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { PERMISSIONS, type ApiCustomRole, type PermissionKey } from "@erpindo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { api } from "../../api/client";
import { Alert, Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, Label, Select, Spinner, useToast } from "../../components/ui";
import { useWorkspace } from "../app";

export function ApprovalThresholdCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings", tenantId], queryFn: () => api.settings(tenantId) });
  const current = Number(settingsQuery.data?.settings.approval_threshold_purchase ?? 0);
  const [amount, setAmount] = useState("");

  const save = useMutation({
    mutationFn: () => api.setApprovalThreshold(tenantId, Number(amount) || 0),
    onSuccess: (res) => {
      toast("success", res.amount > 0 ? `Ambang persetujuan: ${res.amount.toLocaleString("id-ID")}.` : "Persetujuan dinonaktifkan.");
      queryClient.invalidateQueries({ queryKey: ["settings", tenantId] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader
        title="Persetujuan pembelian"
        description="Pembelian oleh Admin dengan nilai ≥ ambang ini harus Anda setujui dulu sebelum diproses. Isi 0 untuk menonaktifkan."
      />
      <CardBody className="flex flex-wrap items-end gap-3">
        <div className="sm:w-64">
          <Label htmlFor="apr-amount">Ambang (Rp)</Label>
          <Input
            id="apr-amount"
            type="number"
            min={0}
            placeholder={current > 0 ? String(current) : "mis. 5000000"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <Button variant="secondary" onClick={() => save.mutate()} disabled={save.isPending || amount === ""}>
          {save.isPending ? <Spinner /> : null} Simpan
        </Button>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          Saat ini: {current > 0 ? `Rp ${current.toLocaleString("id-ID")}` : "nonaktif"}
        </span>
      </CardBody>
    </Card>
  );
}


const ROLE_LABELS: Record<string, string> = { owner: "Pemilik", admin: "Admin", viewer: "Viewer" };

/** Kelola peran kustom (Fase 7e): nama + peran dasar + centang modul yang diizinkan. */
export function RolesCard({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["roles", tenantId], queryFn: () => api.roles(tenantId) });
  const costCentersQuery = useQuery({ queryKey: ["cost-centers", tenantId], queryFn: () => api.costCenters(tenantId) });
  const costCenters = costCentersQuery.data?.items ?? [];
  const [editing, setEditing] = useState<ApiCustomRole | null>(null);
  const [name, setName] = useState("");
  const [baseRole, setBaseRole] = useState<"admin" | "viewer">("admin");
  const [perms, setPerms] = useState<PermissionKey[]>([]);
  const [scopeCcIds, setScopeCcIds] = useState<string[]>([]);
  const [toDelete, setToDelete] = useState<ApiCustomRole | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
    queryClient.invalidateQueries({ queryKey: ["members", tenantId] });
  };
  const reset = () => { setEditing(null); setName(""); setBaseRole("admin"); setPerms([]); setScopeCcIds([]); };

  const save = useMutation({
    mutationFn: () =>
      editing
        ? api.updateRole(tenantId, editing.id, { name, baseRole, permissions: perms, scopeCostCenterIds: scopeCcIds.length ? scopeCcIds : undefined })
        : api.createRole(tenantId, { name, baseRole, permissions: perms, scopeCostCenterIds: scopeCcIds.length ? scopeCcIds : undefined }),
    onSuccess: () => { toast("success", editing ? "Peran diperbarui." : "Peran kustom dibuat."); reset(); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.deleteRole(tenantId, id),
    onSuccess: () => { toast("success", "Peran dihapus."); setToDelete(null); invalidate(); },
    onError: (e: Error) => toast("error", e.message),
  });

  function startEdit(r: ApiCustomRole) {
    setEditing(r); setName(r.name); setBaseRole(r.baseRole); setPerms(r.permissions); setScopeCcIds(r.scopeCostCenterIds ?? []);
  }
  function togglePerm(key: PermissionKey) {
    setPerms((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }
  function toggleScopeCc(id: string) {
    setScopeCcIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const roles = query.data?.roles ?? [];
  return (
    <Card>
      <CardHeader title="Peran kustom" description="Buat peran dengan akses modul terbatas — mis. Kasir (hanya POS & Penjualan). Peran dasar menentukan hak baca/tulis." />
      <CardBody className="space-y-5">
        {roles.length > 0 ? (
          <div className="space-y-2">
            {roles.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-3 text-sm dark:border-slate-800">
                <div>
                  <span className="font-medium">{r.name}</span>
                  <Badge tone="neutral" >{r.baseRole === "admin" ? "Dasar: Admin" : "Dasar: Viewer"}</Badge>
                  <span className="ml-1 text-xs text-slate-400">{r.permissions.length} modul · {r.memberCount} anggota</span>
                  {r.scopeCostCenterIds ? (
                    <Badge tone="amber">terbatas {r.scopeCostCenterIds.length} cost center</Badge>
                  ) : null}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" className="h-8" onClick={() => startEdit(r)}>Ubah</Button>
                  <Button variant="ghost" className="h-8 text-red-600 dark:text-red-400" onClick={() => setToDelete(r)}>Hapus</Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Belum ada peran kustom. Buat di bawah.</p>
        )}

        <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
          <h4 className="text-sm font-semibold">{editing ? `Ubah peran — ${editing.name}` : "Buat peran kustom"}</h4>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="role-name">Nama peran</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kasir Toko" />
            </div>
            <div>
              <Label htmlFor="role-base">Peran dasar (hak baca/tulis)</Label>
              <Select id="role-base" value={baseRole} onChange={(e) => setBaseRole(e.target.value as "admin" | "viewer")}>
                <option value="admin">Admin (boleh menulis)</option>
                <option value="viewer">Viewer (baca-saja)</option>
              </Select>
            </div>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Modul yang boleh diakses</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {PERMISSIONS.map((p) => (
                <label key={p.key} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                  <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={perms.includes(p.key)} onChange={() => togglePerm(p.key)} />
                  {p.label}
                </label>
              ))}
            </div>
          </div>
          {costCenters.length > 0 ? (
            <div>
              <p className="mb-1 text-sm font-medium">Batasi data ke cost center (opsional)</p>
              <p className="mb-2 text-xs text-slate-500 dark:text-slate-400">
                Bila dipilih, peran ini hanya melihat & membukukan ke cost center tersebut (daftar dimensi,
                laporan per dimensi, dan jurnal). Kosongkan untuk akses semua.
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {costCenters.map((cc) => (
                  <label key={cc.id} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                    <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={scopeCcIds.includes(cc.id)} onChange={() => toggleScopeCc(cc.id)} />
                    {cc.code} · {cc.name}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button onClick={() => save.mutate()} disabled={save.isPending || name.trim().length < 2 || perms.length === 0}>
              {save.isPending ? <Spinner /> : null} {editing ? "Simpan" : "Buat peran"}
            </Button>
            {editing ? <Button variant="secondary" onClick={reset}>Batal</Button> : null}
          </div>
        </div>

        <ConfirmDialog
          open={toDelete !== null}
          title="Hapus peran kustom?"
          description={toDelete ? `Peran "${toDelete.name}" akan dihapus. Pastikan tidak ada anggota yang memakainya.` : undefined}
          confirmLabel="Hapus"
          danger
          busy={del.isPending}
          onConfirm={() => toDelete && del.mutate(toDelete.id)}
          onCancel={() => setToDelete(null)}
        />
      </CardBody>
    </Card>
  );
}


export function MembersCard({ tenantId }: { tenantId: string }) {
  const { me, tenant } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["members", tenantId], queryFn: () => api.members(tenantId) });
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [removing, setRemoving] = useState<{ userId: string; name: string } | null>(null);
  const isOwner = tenant.role === "owner";

  const rolesQuery = useQuery({ queryKey: ["roles", tenantId], queryFn: () => api.roles(tenantId), enabled: tenant.role === "owner" });
  const customRoles = rolesQuery.data?.roles ?? [];

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["members", tenantId] });

  const invite = useMutation({
    mutationFn: (input: { email: string; role: "admin" | "viewer" }) => api.invite(tenantId, input),
    onSuccess: (res) => {
      toast("success", "Undangan dikirim.");
      setInviteUrl(res.inviteUrl);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  // Nilai select: "preset:owner|admin|viewer" atau "custom:<id>".
  const assign = useMutation({
    mutationFn: (v: { userId: string; value: string }) => {
      const [kind, val] = v.value.split(":");
      return kind === "custom"
        ? api.assignMemberRole(tenantId, v.userId, { customRoleId: val })
        : api.assignMemberRole(tenantId, v.userId, { preset: val as "owner" | "admin" | "viewer" });
    },
    onSuccess: () => {
      toast("success", "Peran anggota diperbarui.");
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (userId: string) => api.removeMember(tenantId, userId),
    onSuccess: () => {
      toast("success", "Anggota dikeluarkan.");
      setRemoving(null);
      invalidate();
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = Object.fromEntries(new FormData(form)) as { email: string; role: "admin" | "viewer" };
    invite.mutate(data, { onSuccess: () => form.reset() });
  }

  return (
    <Card>
      <CardHeader title="Anggota tim" description="Undang rekan kerja, atur peran, atau keluarkan anggota. Pemilik dapat mengubah peran." />
      <CardBody className="space-y-5">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500 dark:border-slate-800 dark:text-slate-400">
                <th className="pb-2 pr-4 font-medium">Nama</th>
                <th className="hidden pb-2 pr-4 font-medium sm:table-cell">Email</th>
                <th className="pb-2 pr-4 font-medium">Peran</th>
                {isOwner ? <th className="pb-2 font-medium"></th> : null}
              </tr>
            </thead>
            <tbody>
              {(query.data?.members ?? []).map((m) => {
                const isSelf = m.userId === me.user.id;
                const canManage = isOwner && !isSelf;
                return (
                  <tr key={m.userId} className="border-b border-slate-100 last:border-0 dark:border-slate-800/60">
                    <td className="py-2.5 pr-4">
                      {m.name}
                      {isSelf ? <span className="ml-1 text-xs text-slate-400">(Anda)</span> : null}
                      <div className="text-xs text-slate-400 sm:hidden">{m.email}</div>
                    </td>
                    <td className="hidden py-2.5 pr-4 text-slate-500 dark:text-slate-400 sm:table-cell">{m.email}</td>
                    <td className="py-2.5 pr-4">
                      {canManage ? (
                        <Select
                          aria-label={`Peran ${m.name}`}
                          className="h-8 w-40"
                          value={m.customRoleId ? `custom:${m.customRoleId}` : `preset:${m.role}`}
                          onChange={(e) => assign.mutate({ userId: m.userId, value: e.target.value })}
                          disabled={assign.isPending}
                        >
                          <option value="preset:owner">Pemilik</option>
                          <option value="preset:admin">Admin</option>
                          <option value="preset:viewer">Viewer</option>
                          {customRoles.length > 0 ? (
                            <optgroup label="Peran kustom">
                              {customRoles.map((r) => (
                                <option key={r.id} value={`custom:${r.id}`}>{r.name}</option>
                              ))}
                            </optgroup>
                          ) : null}
                        </Select>
                      ) : (
                        <Badge tone={m.role === "owner" ? "brand" : "neutral"}>{m.roleName ?? ROLE_LABELS[m.role] ?? m.role}</Badge>
                      )}
                    </td>
                    {isOwner ? (
                      <td className="py-2.5 text-right">
                        {canManage ? (
                          <button
                            onClick={() => setRemoving({ userId: m.userId, name: m.name })}
                            className="text-xs text-red-600 hover:underline dark:text-red-400"
                          >
                            Keluarkan
                          </button>
                        ) : null}
                      </td>
                    ) : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <ConfirmDialog
          open={removing !== null}
          title="Keluarkan anggota?"
          description={`${removing?.name ?? ""} akan kehilangan akses ke perusahaan ini. Tindakan ini bisa diulang dengan mengundang kembali.`}
          confirmLabel="Keluarkan"
          danger
          onCancel={() => setRemoving(null)}
          onConfirm={() => removing && remove.mutate(removing.userId)}
          busy={remove.isPending}
        />

        <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Label htmlFor="invite-email">Email</Label>
            <Input id="invite-email" name="email" type="email" placeholder="rekan@perusahaan.co.id" required />
          </div>
          <div className="sm:w-36">
            <Label htmlFor="invite-role">Peran</Label>
            <Select id="invite-role" name="role" defaultValue="viewer">
              <option value="admin">Admin</option>
              <option value="viewer">Viewer</option>
            </Select>
          </div>
          <Button type="submit" disabled={invite.isPending}>
            {invite.isPending ? <Spinner /> : null} Undang
          </Button>
        </form>

        {inviteUrl ? (
          <Alert tone="info">
            Tautan undangan (bagikan bila email belum terkirim):{" "}
            <span className="break-all font-mono text-xs">{inviteUrl}</span>
          </Alert>
        ) : null}
      </CardBody>
    </Card>
  );
}
