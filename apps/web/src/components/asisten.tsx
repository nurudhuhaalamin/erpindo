import { useNavigate } from "@tanstack/react-router";
import { LineChart, NotebookPen, Send, Sparkles, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, ApiRequestError, formatIDR } from "../api/client";
import { Button, Spinner } from "./ui";
import { useUi } from "../i18n/ui";

/**
 * Asisten erpindo — panel chat mengambang (Workers AI, kuota gratis).
 * Tiga mode: Tanya (cara pakai, grounded panduan), Laporan (tanya kondisi
 * keuangan — dijawab dari buku nyata, read-only), dan Draf Jurnal (bahasa
 * alami → usulan jurnal seimbang yang dimuat ke form Jurnal Umum). AI tidak
 * pernah menulis data sendiri.
 */

type ChatMsg = { role: "user" | "assistant"; content: string };

export function Asisten({ tenantId, isAdmin }: { tenantId: string; isAdmin: boolean }) {
  const u = useUi();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"chat" | "jurnal" | "laporan">("chat");
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
      } else if (mode === "laporan") {
        setMessages((m) => [...m, { role: "user", content: text }]);
        const res = await api.aiLaporan(tenantId, text);
        setMessages((m) => [...m, { role: "assistant", content: res.reply }]);
        if (typeof res.quotaRemaining === "number") setQuota(res.quotaRemaining);
      } else {
        setMessages((m) => [...m, { role: "user", content: `${u("cpDrafJurnalPrefix")} ${text}` }]);
        const { draft, quotaRemaining } = await api.aiJurnal(tenantId, text);
        const ringkas = draft.lines
          .map(
            (l) =>
              `${l.accountCode} ${l.accountName}: ${l.debit ? `${u("cpHurufDebit")} ${formatIDR(l.debit)}` : `${u("cpHurufKredit")} ${formatIDR(l.credit)}`}`,
          )
          .join("\n");
        setMessages((m) => [
          ...m,
          {
            role: "assistant",
            content: `${u("cpUsulanJurnal")} "${draft.memo}":\n${ringkas}\n\n${u("cpDrafDimuat")}`,
          },
        ]);
        if (typeof quotaRemaining === "number") setQuota(quotaRemaining);
        sessionStorage.setItem("erpindo-ai-draft", JSON.stringify(draft));
        navigate({ to: "/app/keuangan/jurnal" });
      }
    } catch (err) {
      const status = err instanceof ApiRequestError ? err.status : 0;
      if (status === 408) {
        setNotice(u("cpAiLamaMerespons"));
      } else if (status === 503) {
        setNotice(u("cpAiTakTersedia"));
      } else if (status === 429) {
        setNotice((err as Error).message);
      } else {
        setNotice((err as Error).message || u("cpKesalahanUmum"));
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
        aria-label={open ? u("cpTutupAsisten") : u("cpBukaAsisten")}
        title={u("cpAsistenAi")}
      >
        {open ? <X className="size-5" aria-hidden /> : <Sparkles className="size-5" aria-hidden />}
      </button>

      {open ? (
        <div className="fixed bottom-20 right-5 z-40 flex h-[min(560px,75vh)] w-[min(380px,calc(100vw-2.5rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 print:hidden">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-700">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> {u("cpAsisten")}
            </div>
            <div className="flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
              <button
                onClick={() => setMode("chat")}
                className={`rounded-md px-2.5 py-1 ${mode === "chat" ? "bg-white font-medium shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
              >
                {u("cpModeTanya")}
              </button>
              <button
                onClick={() => setMode("laporan")}
                className={`rounded-md px-2.5 py-1 ${mode === "laporan" ? "bg-white font-medium shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
              >
                <span className="inline-flex items-center gap-1">
                  <LineChart className="size-3" aria-hidden /> {u("cpModeLaporan")}
                </span>
              </button>
              {isAdmin ? (
                <button
                  onClick={() => setMode("jurnal")}
                  className={`rounded-md px-2.5 py-1 ${mode === "jurnal" ? "bg-white font-medium shadow-sm dark:bg-slate-700" : "text-slate-500"}`}
                >
                  <span className="inline-flex items-center gap-1">
                    <NotebookPen className="size-3" aria-hidden /> {u("cpModeJurnal")}
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
                    <p>{u("cpAjakanTanya")}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>{u("cpContohTanya1")}</li>
                      <li>{u("cpContohTanya2")}</li>
                      <li>{u("cpContohTanya3")}</li>
                    </ul>
                  </>
                ) : mode === "laporan" ? (
                  <>
                    <p>{u("cpAjakanLaporan")}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>{u("cpContohLaporan1")}</li>
                      <li>{u("cpContohLaporan2")}</li>
                      <li>{u("cpContohLaporan3")}</li>
                    </ul>
                    <p className="mt-2 text-xs">{u("cpHanyaMembaca")}</p>
                  </>
                ) : (
                  <>
                    <p>{u("cpAjakanJurnal")}</p>
                    <ul className="mt-2 list-disc space-y-1 pl-4">
                      <li>{u("cpContohJurnal1")}</li>
                      <li>{u("cpContohJurnal2")}</li>
                    </ul>
                    <p className="mt-2 text-xs">{u("cpHanyaDraf")}</p>
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
                <Spinner /> {u("cpBerpikir")}
              </div>
            ) : null}
            {notice ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
                {notice}
              </div>
            ) : null}
            {quota !== null && !busy ? (
              <p className="text-right text-[11px] text-slate-400 dark:text-slate-500">{u("cpSisaKuota")} {quota}</p>
            ) : null}
          </div>

          <form onSubmit={onSubmit} className="flex items-center gap-2 border-t border-slate-200 p-3 dark:border-slate-700">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === "chat" ? u("cpPlaceholderTanya") : mode === "laporan" ? u("cpPlaceholderLaporan") : u("cpPlaceholderJurnal")}
              aria-label={u("cpPesanUntukAsisten")}
              className="h-10 flex-1 rounded-lg border border-slate-300 bg-white px-3 text-sm focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-slate-600 dark:bg-slate-800"
            />
            <Button type="submit" className="h-10 w-10 p-0" disabled={busy || !input.trim()} aria-label={u("cpKirim")}>
              <Send className="size-4" aria-hidden />
            </Button>
          </form>
        </div>
      ) : null}
    </>
  );
}
