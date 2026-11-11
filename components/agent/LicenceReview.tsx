"use client";
/** "Review with agent" on a pending licence request: the creator agent's checks stream in, then its advice. */
import { useState } from "react";
import { btnClass, StatusPill } from "@/components/ds";

type Step = { step: string; status: string; detail: string };
const LABEL: Record<string, string> = { request: "Request", terms: "Your terms", history: "Brand history", brief: "Brief vs banned uses", recommendation: "Advice" };

export function LicenceReview({ licenceId }: { licenceId: string }) {
  const [steps, setSteps] = useState<Step[]>([]);
  const [reasons, setReasons] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setSteps([]);
    setReasons([]);
    setError(null);
    try {
      const res = await fetch("/api/agent/creator/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ licenceId }) });
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
          const e = JSON.parse(line) as { t: string; step?: string; status?: string; detail?: string; reasons?: string[]; message?: string };
          if (e.t === "step") setSteps((s) => [...s, { step: e.step!, status: e.status!, detail: e.detail! }]);
          if (e.t === "review") setReasons(e.reasons ?? []);
          if (e.t === "error") setError(e.message ?? "error");
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <button type="button" onClick={() => void run()} disabled={busy} className={btnClass("outline", "self-start")}>
        {busy ? "Reviewing…" : "Review with agent"}
      </button>
      {steps.length > 0 && (
        <ol className="m-0 flex list-none flex-col gap-1 rounded-[12px] bg-paper p-3 text-[13px]" aria-live="polite">
          {steps.map((s, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2">
              <StatusPill kind={s.status === "ok" ? "licensed" : s.status === "failed" ? "revoked" : "waiting"}>{LABEL[s.step] ?? s.step}</StatusPill>
              <span>{s.detail}</span>
            </li>
          ))}
          {reasons.map((r, i) => (
            <li key={`r${i}`} className="pl-2 text-grey">
              · {r}
            </li>
          ))}
        </ol>
      )}
      {error && (
        <p role="alert" className="m-0 text-[13px] text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
