// Bagian Pengaturan (dipecah dari settings.tsx pada Fase 14b — nama ekspor
// tak berubah; settings/index.tsx merakit ulang tab).
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../../api/client";
import { Badge, Button, Card, CardBody, CardHeader, ConfirmDialog, Input, Label, Spinner, useToast } from "../../components/ui";
import { useUi } from "../../i18n/ui";
import { useWorkspace, isSimpleMode, setSimpleMode } from "../app";

export function DisplayModeCard() {
  const u = useUi();
  const [simple, setSimple] = useState(isSimpleMode);
  return (
    <Card>
      <CardHeader
        title={u("tampilanJudul")}
        description={u("descTampilan")}
      />
      <CardBody>
        <label className="flex cursor-pointer items-start gap-3">
          <input
            id="simpleMode"
            type="checkbox"
            checked={simple}
            onChange={(e) => {
              setSimple(e.target.checked);
              setSimpleMode(e.target.checked);
            }}
            className="mt-1 size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            <span className="font-medium">{u("modeSederhana")}</span>
            <span className="mt-0.5 block text-sm text-slate-500 dark:text-slate-400">
              {u("sembunyikanMenuAkuntansi")}
            </span>
          </span>
        </label>
      </CardBody>
    </Card>
  );
}


export function ProfileCard() {
  const u = useUi();
  const { me } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(me.user.name);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  const saveName = useMutation({
    mutationFn: () => api.updateProfile(name),
    onSuccess: () => {
      toast("success", "Nama diperbarui.");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const savePassword = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast("success", "Password diganti. Sesi di perangkat lain telah dikeluarkan.");
      setCurrentPassword("");
      setNewPassword("");
    },
    onError: (err) => toast("error", (err as Error).message),
  });

  return (
    <Card>
      <CardHeader title={u("profilSaya")} description={me.user.email} />
      <CardBody className="space-y-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 sm:max-w-xs">
            <Label htmlFor="prof-name">{u("nama")}</Label>
            <Input id="prof-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <Button variant="secondary" onClick={() => saveName.mutate()} disabled={saveName.isPending || name.trim().length < 2}>
            {saveName.isPending ? <Spinner /> : null} {u("simpanNama")}
          </Button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="sm:w-56">
            <Label htmlFor="prof-cur">{u("passwordSaatIni")}</Label>
            <Input id="prof-cur" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
          <div className="sm:w-56">
            <Label htmlFor="prof-new">{u("passwordBaru")}</Label>
            <Input
              id="prof-new"
              type="password"
              placeholder={u("minimal8Karakter")}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </div>
          <Button
            variant="secondary"
            onClick={() => savePassword.mutate()}
            disabled={savePassword.isPending || !currentPassword || newPassword.length < 8}
          >
            {savePassword.isPending ? <Spinner /> : null} {u("gantiPassword")}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}


export function SecurityCard() {
  const u = useUi();
  const { me } = useWorkspace();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [code, setCode] = useState("");
  const [disableOpen, setDisableOpen] = useState(false);

  const setup = useMutation({
    mutationFn: api.totpSetup,
    onSuccess: (res) => setSetupData(res),
    onError: (err) => toast("error", (err as Error).message),
  });
  const enable = useMutation({
    mutationFn: () => api.totpEnable(code),
    onSuccess: () => {
      toast("success", "2FA aktif. Kode authenticator kini diminta setiap login.");
      setSetupData(null);
      setCode("");
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => toast("error", (err as Error).message),
  });
  const disable = useMutation({
    mutationFn: () => api.totpDisable(code),
    onSuccess: () => {
      toast("success", "2FA dinonaktifkan.");
      setCode("");
      setDisableOpen(false);
      queryClient.invalidateQueries({ queryKey: ["me"] });
    },
    onError: (err) => {
      toast("error", (err as Error).message);
      setDisableOpen(false);
    },
  });

  return (
    <Card>
      <CardHeader
        title={u("keamanan2fa")}
        description={u("desc2fa")}
      />
      <CardBody className="space-y-3 text-sm">
        {me.user.totpEnabled ? (
          <>
            <div className="flex items-center gap-2">
              <Badge tone="brand">{u("duaFaAktif")}</Badge>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="totp-off">{u("kodeUntukMenonaktifkan")}</Label>
                <Input
                  id="totp-off"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={u("enamDigit")}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button variant="danger" disabled={code.length !== 6 || disable.isPending} onClick={() => setDisableOpen(true)}>
                {u("nonaktifkan2fa")}
              </Button>
            </div>
            <ConfirmDialog
              open={disableOpen}
              title={u("konfirmNonaktif2fa")}
              description={u("descNonaktif2fa")}
              confirmLabel={u("yaNonaktifkan")}
              danger
              busy={disable.isPending}
              onConfirm={() => disable.mutate()}
              onCancel={() => setDisableOpen(false)}
            />
          </>
        ) : setupData ? (
          <>
            <p>
              {u("langkah2faSatu")} <strong>{u("masukkanKunciManual")}</strong> {u("atauBukaTautan")}
            </p>
            <p className="break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs dark:bg-slate-800">
              {setupData.secret}
            </p>
            <p>
              <a href={setupData.otpauthUrl} className="text-brand-700 underline dark:text-brand-400">
                {u("bukaDiAuthenticator")}
              </a>
            </p>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <Label htmlFor="totp-code">{u("langkah2faDua")}</Label>
                <Input
                  id="totp-code"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </div>
              <Button disabled={code.length !== 6 || enable.isPending} onClick={() => enable.mutate()}>
                {enable.isPending ? <Spinner /> : null} {u("konfirmasiAktifkan")}
              </Button>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span className="text-slate-500 dark:text-slate-400">{u("duaFaBelumAktif")}</span>
            <Button variant="secondary" onClick={() => setup.mutate()} disabled={setup.isPending}>
              {setup.isPending ? <Spinner /> : null} {u("aktifkan2fa")}
            </Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

