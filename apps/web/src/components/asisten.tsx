import { useNavigate } from "@tanstack/react-router";
import { NotebookPen, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiRequestError, formatIDR } from "../api/client";
import { Button, Spinner } from "./ui";

/**
 * Asisten erpindo — panel chat mengambang (Workers AI, kuota gratis).
 * Dua mode: Tanya (cara pakai, grounded panduan) dan Draf Jurnal (bahasa
 * alami → usulan jurnal seimbang yang dimuat ke form Jurnal Umum — AI tidak
 * pernah menulis data sendiri).
 */

type ChatMsg = { role: "user" | "assistant"; content: string };

export function Asisten({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "jurnal">("chat");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [quota, setQuota] = useState<number | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, busy]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setNotice(null);
    setBusy(true);
    try {
      if (mode === "chat") {
        const history = [...messages, { role: "user" as const, content: text }];
        setMessages(history);
        const res = await api.aiChat(tenantId, history.slice(-8));
        setMessages([...history, { role: "assistant", content: res.reply }]);
        if (typeof res.quotaRemaining === "number") setQuota(res.quotaRemaining);
      } else {
        setMessages((m) => [...m, { role: "user", content: `Draf jurnal: ${text}` }]);
        const { draft, quotaRemaining } = await api.aiJurnal(tenantId, text);
        const ringkas = draft.lines
          .map((l) => `${l.accountCode} ${l.accountName}: ${l.debit ? `D ${formatIDR(l.debit)}` : `K ${formatIDR(l.credit)}`}`)
          .join("\n");
        setMessages((m) => [
          ...m,
          { role: "assistant", content: `Usulan jurnal "${draft.memo}":\n${ringkas}\n\nDraf dimuat ke form Jurnal Umum — periksa lalu posting.` },
        ]);
        if (typeof quotaRemaining === "number") setQuota(quotaRemaining);
        sessionStorage.setItem("erpindo-ai-draft", JSON.stringify(draft));
        navigate({ to: "/app/keuangan/jurnal" });
      }
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      if (status === 408) {
        setNotice("Asisten AI lama merespons (mungkin sedang sibuk). Coba lagi sebentar.");
      } else if (status === 503) {
        setNotice("Fitur AI sedang tidak tersedia — fitur lain tetap berjalan normal. Coba lagi nanti.");
      } else if (status === 429) {
        setNotice((err as Error).message);
      } else {
        setNotice((err as Error).message || "Terjadi kesalahan. Coba lagi.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Tombol mengambang */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="fixed bottom-5 right-5 z-40 flex size-12 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 print:hidden"
        aria-label={open ? "Tutup Asisten erpindo" : "Buka Asisten erpindo"}
        title="Asisten erpindo (AI)"
      >
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-40 flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> Asisten erpindo
            </div>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
              <button
                onClick={() => setMode("chat")}
                className={`rounded-md px-2.5 py-1 ${mode === "chat" ? "bg-white font-medium shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
              >
                Tanya
              </button>
              {isAdmin ? (
                <button
                  onClick={() => setMode("jurnal")}
                  className={`rounded-md px-2.5 py-1 ${mode === "jurnal" ? "bg-white font-medium shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <NotebookPen className="size-3" aria-hidden /> Draf Jurnal
                  </span>
                </button>
              ) : null}
            </div>
          </div>

          <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-3 text-sm">
            {messages.length === 0 ? (
              <div className="text-slate-500 dark:text-slate-400">
                {mode === "chat" ? (
                  <>
                    <p>Tanyakan cara memakai erpindo, misalnya:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>Bagaimana cara ekspor XML Coretax?</li>
                      <li>Cara mencatat retur penjualan?</li>
                      <li>Gaji karyawan dihitung bagaimana?</li>
                    </ul>
                  </>
                ) : (
                  <>
                    <p>Tulis transaksi dengan bahasa sehari-hari, misalnya:</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>bayar listrik 500 ribu dari kas</li>
                      <li>setor tunai ke bank 2 juta</li>
                    </ul>
                    <p className="mt-2 text-xs">Hasilnya hanya draf — Anda yang meninjau & memposting.</p>
                  </>
                )}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "ml-8 whitespace-pre-wrap rounded-2xl rounded-br-sm bg-brand-600 px-3 py-2 text-white"
                    : "mr-8 whitespace-pre-wrap rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-slate-800 dark:bg-slate-800 dark:text-slate-100"
                }
              >
                {m.content}
              </div>
            ))}
            {busy ? (
              <div className="mr-8 flex items-center gap-2 rounded-2xl bg-slate-100 px-3 py-2 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                <Spinner /> berpikir…
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                {notice}
              </div>
            ) : null}
            {quota !== null && !busy ? (
              <p className="text-right text-[11px] text-slate-400 dark:text-slate-500">Sisa kuota AI hari ini: {quota}</p>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "chat" ? "Tanya cara pakai…" : "Deskripsikan transaksinya…"}
              aria-label="Pesan untuk Asisten erpindo"
              className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
            />
            <Button type="submit" className="h-10 w-10 p-0" disabled={busy || !input.trim()} aria-label="Kirim">
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
