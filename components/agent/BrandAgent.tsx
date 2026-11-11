"use client";
/**
 * The brand agent's chat: each turn streams from /api/agent/brand as newline-delimited JSON, so the tool calls and
 * every engine step (licence check, authorize, render, compliance, capture…) appear as they happen, with their
 * PayPal ids. When a turn ends the page refreshes, so the new render card (Accept / Reject) shows below.
 */
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { btnClass, Card } from "@/components/ds";
import { inputClass } from "@/components/ui";

type Step = { step: string; status: string; detail: string; ids?: Record<string, string | null> };
type Turn = { user: string; tools: { name: string; summary?: string; ok?: boolean }[]; steps: Step[]; answer?: string; error?: string; cost?: number };

const LABEL: Record<string, string> = {
  prompt_check: "Prompt check",
  policy: "Licence and mandate check",
  authorize: "Authorize on saved wallet",
  render: "Render",
  compliance: "Compliance check",
  capture: "Capture",
  review: "Review window",
  payout: "Payout to creator",
  refund: "Refund",
  receipt: "Receipt",
};
const TOOL: Record<string, string> = { make_ad: "Making the ad", get_status: "Reading your wallet, mandate and licences", spend_summary: "Adding up your spend", list_transactions: "PayPal: list_transactions", get_order: "PayPal: get_order" };
const EXAMPLES = ["Make a 9:16 café ad with Rohit", "Make another one", "What did I spend this week?"];

const short = (id: string) => (id.length <= 14 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`);

function Mark({ status }: { status: string }) {
  const s = status === "ok" ? ["✓", "bg-ok-bg text-ok"] : status === "waiting" ? ["…", "bg-wait-bg text-wait"] : ["✕", "bg-bad-bg text-bad"];
  return (
    <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${s[1]}`}>
      {s[0]}
    </span>
  );
}

export function BrandAgent() {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const live = useRef<HTMLDivElement>(null);

  async function send(message: string) {
    const m = message.trim();
    if (!m || busy) return;
    setBusy(true);
    setText("");
    const history = turns.flatMap((t) => [{ role: "user", text: t.user }, ...(t.answer ? [{ role: "model", text: t.answer }] : [])]);
    const turn: Turn = { user: m, tools: [], steps: [] };
    setTurns((ts) => [...ts, turn]);
    const update = (f: (t: Turn) => void) =>
      setTurns((ts) => {
        const copy = [...ts];
        const last = { ...copy[copy.length - 1], tools: [...copy[copy.length - 1].tools], steps: [...copy[copy.length - 1].steps] };
        f(last);
        copy[copy.length - 1] = last;
        return copy;
      });
    try {
      const res = await fetch("/api/agent/brand", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [...history, { role: "user", text: m }] }) });
      if (!res.ok || !res.body) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line) as { t: string; [k: string]: unknown };
          if (e.t === "tool") update((t) => t.tools.push({ name: String(e.name) }));
          else if (e.t === "tool_result")
            update((t) => {
              const i = t.tools.findLastIndex((x) => x.name === e.name && x.summary === undefined);
              if (i >= 0) t.tools[i] = { ...t.tools[i], summary: String(e.summary), ok: Boolean(e.ok) };
            });
          else if (e.t === "step") update((t) => t.steps.push({ step: String(e.step), status: String(e.status), detail: String(e.detail), ids: e.ids as Step["ids"] }));
          else if (e.t === "text") update((t) => (t.answer = String(e.text)));
          else if (e.t === "error") update((t) => (t.error = String(e.message)));
          else if (e.t === "done") update((t) => (t.cost = (e.usage as { costUsd?: number })?.costUsd));
          live.current?.scrollIntoView({ block: "nearest" });
        }
      }
    } catch (err) {
      update((t) => (t.error = (err as Error).message));
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <Card title="Brand agent" action={<span className="text-[12px] text-grey">Gemini + PayPal Agent Toolkit · sandbox</span>}>
      <p className="m-0 text-[14px] text-grey">Ask for an ad and watch every step: licence check, authorize on your saved wallet, render, compliance, capture. Or ask what you spent.</p>
      <div className="flex flex-col gap-3" aria-live="polite">
        {turns.map((t, i) => (
          <div key={i} className="flex flex-col gap-2">
            <p className="m-0 self-end rounded-[14px] bg-ink px-3.5 py-2 text-[14px] text-white">{t.user}</p>
            {(t.tools.length > 0 || t.steps.length > 0) && (
              <ol className="m-0 flex list-none flex-col gap-1.5 rounded-[14px] bg-paper p-3 text-[13px]">
                {t.tools
                  .filter((x) => x.name !== "make_ad")
                  .map((x, j) => (
                    <li key={`t${j}`} className="flex items-start gap-2">
                      <Mark status={x.summary === undefined ? "waiting" : x.ok ? "ok" : "failed"} />
                      <span>
                        <b>{TOOL[x.name] ?? x.name}</b>
                        {x.summary ? <span className="text-grey"> · {x.summary}</span> : null}
                      </span>
                    </li>
                  ))}
                {t.steps.map((s, j) => (
                  <li key={`s${j}`} className="flex items-start gap-2">
                    <Mark status={s.status} />
                    <span className="min-w-0">
                      <b>{LABEL[s.step] ?? s.step}</b> <span className="text-grey">· {s.detail}</span>
                      {s.ids &&
                        Object.entries(s.ids)
                          .filter(([k, v]) => v && k !== "reason" && k !== "deadline")
                          .map(([k, v]) => (
                            <span key={k} className="ml-1 font-mono text-[11px] text-grey" title={String(v)}>
                              {k} {short(String(v))}
                            </span>
                          ))}
                    </span>
                  </li>
                ))}
                {busy && i === turns.length - 1 && !t.answer && (
                  <li className="flex items-center gap-2 text-grey">
                    <Mark status="waiting" /> working…
                  </li>
                )}
              </ol>
            )}
            {t.answer && <p className="m-0 max-w-[90%] rounded-[14px] bg-white px-3.5 py-2 text-[14px] ring-1 ring-divider">{t.answer}</p>}
            {t.error && (
              <p role="alert" className="m-0 text-[13px] text-bad">
                {t.error}
              </p>
            )}
          </div>
        ))}
        <div ref={live} />
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex gap-2"
      >
        <label htmlFor="agent-input" className="sr-only">
          Message the brand agent
        </label>
        <input id="agent-input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Make a 9:16 café ad with Rohit" className={inputClass} disabled={busy} />
        <button type="submit" className={btnClass("ink")} disabled={busy || !text.trim()}>
          {busy ? "Working…" : "Send"}
        </button>
      </form>
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map((x) => (
          <button key={x} type="button" disabled={busy} onClick={() => void send(x)} className="rounded-full bg-paper px-3 py-1.5 text-[13px] font-medium hover:bg-divider disabled:opacity-50 cursor-pointer">
            {x}
          </button>
        ))}
      </div>
    </Card>
  );
}
