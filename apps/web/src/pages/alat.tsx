import { PTKP_STATUSES, terCategory, terRate, type PtkpStatus } from "@erpindo/shared";
import { useState } from "react";
import { formatIDR } from "../api/client";
import { Card, CardBody, CardHeader, Input, Label, Select, Tabs } from "../components/ui";

/**
 * Alat bantu bisnis (Fase 10g) — kalkulator klien-saja (tanpa API): HPP per
 * unit, markup vs margin, titik impas (BEP), simulasi PPh 21 TER (reuse mesin
 * gaji shared), PPN, dan cicilan kasbon. Untuk perencanaan cepat, bukan
 * pencatatan resmi.
 */

const num = (v: string): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function ResultRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 ${strong ? "text-base font-semibold" : "text-sm"}`}>
      <span className={strong ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-400"}>{label}</span>
      <span className={strong ? "text-brand-700 dark:text-brand-300" : "text-slate-800 dark:text-slate-200"}>{value}</span>
    </div>
  );
}

function Field({ id, label, value, onChange, suffix }: { id: string; label: string; value: string; onChange: (v: string) => void; suffix?: string }) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" min="0" value={value} onChange={(e) => onChange(e.target.value)} />
        {suffix ? <span className="text-sm text-slate-500">{suffix}</span> : null}
      </div>
    </div>
  );
}

type Tab = "hpp" | "markup" | "bep" | "pph21" | "ppn" | "kasbon";

export function AlatPage() {
  const [tab, setTab] = useState<Tab>("hpp");
  const tabs: { key: Tab; label: string }[] = [
    { key: "hpp", label: "HPP per unit" },
    { key: "markup", label: "Markup vs Margin" },
    { key: "bep", label: "Titik Impas (BEP)" },
    { key: "pph21", label: "PPh 21 (TER)" },
    { key: "ppn", label: "PPN" },
    { key: "kasbon", label: "Cicilan Kasbon" },
  ];
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Alat Bantu</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          Kalkulator cepat untuk keputusan harga, pajak, dan gaji. Hitungan bantu perencanaan — bukan pencatatan resmi.
        </p>
      </div>
      <Tabs tabs={tabs} active={tab} onChange={setTab} />
      {tab === "hpp" ? <HppCalc /> : null}
      {tab === "markup" ? <MarkupCalc /> : null}
      {tab === "bep" ? <BepCalc /> : null}
      {tab === "pph21" ? <Pph21Calc /> : null}
      {tab === "ppn" ? <PpnCalc /> : null}
      {tab === "kasbon" ? <KasbonCalc /> : null}
    </div>
  );
}

function HppCalc() {
  const [bahan, setBahan] = useState("10000");
  const [tenaga, setTenaga] = useState("3000");
  const [overhead, setOverhead] = useState("2000");
  const [margin, setMargin] = useState("30");
  const hpp = num(bahan) + num(tenaga) + num(overhead);
  const m = Math.min(Math.max(num(margin), 0), 99);
  const hargaJual = m < 100 ? Math.round(hpp / (1 - m / 100)) : hpp;
  const laba = hargaJual - hpp;
  return (
    <Card>
      <CardHeader title="Harga Pokok Produksi (HPP) per unit" description="Jumlahkan biaya per unit, tentukan margin, dapatkan harga jual." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="hpp-bahan" label="Biaya bahan / unit" value={bahan} onChange={setBahan} suffix="Rp" />
          <Field id="hpp-tenaga" label="Biaya tenaga / unit" value={tenaga} onChange={setTenaga} suffix="Rp" />
          <Field id="hpp-overhead" label="Overhead / unit" value={overhead} onChange={setOverhead} suffix="Rp" />
          <Field id="hpp-margin" label="Target margin" value={margin} onChange={setMargin} suffix="%" />
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label="HPP per unit" value={formatIDR(hpp)} />
          <ResultRow label="Laba per unit" value={formatIDR(laba)} />
          <ResultRow label="Harga jual disarankan" value={formatIDR(hargaJual)} strong />
        </div>
      </CardBody>
    </Card>
  );
}

function MarkupCalc() {
  const [hpp, setHpp] = useState("15000");
  const [jual, setJual] = useState("25000");
  const cost = num(hpp);
  const price = num(jual);
  const laba = price - cost;
  const markup = cost > 0 ? (laba / cost) * 100 : 0;
  const margin = price > 0 ? (laba / price) * 100 : 0;
  return (
    <Card>
      <CardHeader title="Markup vs Margin" description="Dua cara melihat untung: markup dihitung dari modal, margin dari harga jual." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="mk-hpp" label="Harga pokok (modal)" value={hpp} onChange={setHpp} suffix="Rp" />
          <Field id="mk-jual" label="Harga jual" value={jual} onChange={setJual} suffix="Rp" />
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label="Laba kotor" value={formatIDR(laba)} />
          <ResultRow label="Markup (dari modal)" value={`${markup.toFixed(1)}%`} strong />
          <ResultRow label="Margin (dari harga jual)" value={`${margin.toFixed(1)}%`} strong />
        </div>
      </CardBody>
    </Card>
  );
}

function BepCalc() {
  const [fixed, setFixed] = useState("5000000");
  const [price, setPrice] = useState("25000");
  const [variable, setVariable] = useState("15000");
  const contrib = num(price) - num(variable);
  const bepUnit = contrib > 0 ? Math.ceil(num(fixed) / contrib) : 0;
  const bepRupiah = bepUnit * num(price);
  return (
    <Card>
      <CardHeader title="Titik Impas (BEP)" description="Berapa unit harus terjual agar tidak rugi — menutup biaya tetap." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field id="bep-fixed" label="Biaya tetap / bulan" value={fixed} onChange={setFixed} suffix="Rp" />
          <Field id="bep-price" label="Harga jual / unit" value={price} onChange={setPrice} suffix="Rp" />
          <Field id="bep-var" label="Biaya variabel / unit" value={variable} onChange={setVariable} suffix="Rp" />
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label="Margin kontribusi / unit" value={formatIDR(contrib)} />
          {contrib > 0 ? (
            <>
              <ResultRow label="Impas pada" value={`${bepUnit.toLocaleString("id-ID")} unit`} strong />
              <ResultRow label="Setara omzet" value={formatIDR(bepRupiah)} />
            </>
          ) : (
            <p className="py-2 text-sm text-red-600 dark:text-red-400">Harga jual harus lebih tinggi dari biaya variabel agar bisa impas.</p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

function Pph21Calc() {
  const [gross, setGross] = useState("8000000");
  const [ptkp, setPtkp] = useState<PtkpStatus>("TK/0");
  const g = num(gross);
  const cat = terCategory(ptkp);
  const rate = terRate(cat, g);
  const pph = Math.round((g * rate) / 100);
  return (
    <Card>
      <CardHeader title="Simulasi PPh 21 (metode TER)" description="Tarif Efektif Rata-rata bulanan (PMK 168/2023). Mesin yang sama dengan penggajian." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pph-gross" label="Penghasilan bruto / bulan" value={gross} onChange={setGross} suffix="Rp" />
          <div>
            <Label htmlFor="pph-ptkp">Status PTKP</Label>
            <Select id="pph-ptkp" value={ptkp} onChange={(e) => setPtkp(e.target.value as PtkpStatus)}>
              {PTKP_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label={`Kategori TER (${ptkp})`} value={cat} />
          <ResultRow label="Tarif efektif" value={`${rate}%`} />
          <ResultRow label="PPh 21 / bulan" value={formatIDR(pph)} strong />
          <ResultRow label="Take-home (setelah PPh 21)" value={formatIDR(g - pph)} />
        </div>
      </CardBody>
    </Card>
  );
}

function PpnCalc() {
  const [dpp, setDpp] = useState("1000000");
  const [rate, setRate] = useState("11");
  const base = num(dpp);
  const r = num(rate);
  const ppn = Math.round((base * r) / 100);
  return (
    <Card>
      <CardHeader title="PPN" description="Hitung PPN dari Dasar Pengenaan Pajak (DPP)." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="ppn-dpp" label="DPP (harga sebelum PPN)" value={dpp} onChange={setDpp} suffix="Rp" />
          <div>
            <Label htmlFor="ppn-rate">Tarif PPN</Label>
            <Select id="ppn-rate" value={rate} onChange={(e) => setRate(e.target.value)}>
              <option value="11">11%</option>
              <option value="12">12%</option>
            </Select>
          </div>
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label={`PPN ${r}%`} value={formatIDR(ppn)} />
          <ResultRow label="Total (DPP + PPN)" value={formatIDR(base + ppn)} strong />
        </div>
      </CardBody>
    </Card>
  );
}

function KasbonCalc() {
  const [pokok, setPokok] = useState("1200000");
  const [tenor, setTenor] = useState("6");
  const p = num(pokok);
  const t = Math.max(Math.round(num(tenor)), 1);
  const perBulan = Math.ceil(p / t);
  const terakhir = p - perBulan * (t - 1);
  return (
    <Card>
      <CardHeader title="Cicilan Kasbon Karyawan" description="Bagi pinjaman rata per bulan (tanpa bunga) — potongan gaji tiap periode." />
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="kb-pokok" label="Jumlah pinjaman" value={pokok} onChange={setPokok} suffix="Rp" />
          <Field id="kb-tenor" label="Jumlah cicilan" value={tenor} onChange={setTenor} suffix="bulan" />
        </div>
        <div className="rounded-xl bg-slate-50 px-4 py-2 dark:bg-slate-800/50">
          <ResultRow label="Potongan per bulan" value={formatIDR(perBulan)} strong />
          {terakhir !== perBulan ? <ResultRow label="Cicilan terakhir" value={formatIDR(terakhir)} /> : null}
          <ResultRow label="Total dipotong" value={formatIDR(p)} />
        </div>
      </CardBody>
    </Card>
  );
}
