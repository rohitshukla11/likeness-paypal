"use client";

/**
 * Verify: anyone drops a file (hashed in the browser, never uploaded), pastes its sha256 or a receipt id, and sees
 * Licensed, Revoked ("licensed when made, since revoked"), Expired, Refunded or Unknown, with the creator, the
 * licensee, the PayPal capture and payout or refund behind the answer, and the receipt's Ed25519 signature check.
 */
import { useState } from "react";
import type { VerifyResult } from "@/lib/verify";
import { Result } from "./result";

const inputClass = "w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

async function sha256Hex(f: File) {
  const d = await crypto.subtle.digest("SHA-256", await f.arrayBuffer());
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function VerifyPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<VerifyResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<{ url: string; name: string; sha: string } | null>(null);

  async function lookUp(q: string) {
    const v = q.trim();
    if (!v) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const param = v.startsWith("rcp_") ? `receipt=${encodeURIComponent(v)}` : `sha=${encodeURIComponent(v)}`;
      const res = await fetch(`/api/verify?${param}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setResult(json as VerifyResult);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    const sha = await sha256Hex(f);
    setFile({ url: URL.createObjectURL(f), name: f.name, sha });
    setQuery(sha);
    await lookUp(sha);
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Verify an ad</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">Was the person in this ad paid and did they license it? Anyone can check; no account needed.</p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex min-w-0 flex-col gap-3">
          <label
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void onFile(e.dataTransfer.files[0]);
            }}
            className="flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-white px-4 text-sm font-semibold focus-within:outline focus-within:outline-2 focus-within:outline-brand"
          >
            <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-brand">
              ↑
            </span>
            <span className="flex-1">{busy ? "Checking…" : "Drop a file or choose one"}</span>
            <input type="file" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
          </label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void lookUp(query);
            }}
            className="flex flex-col gap-2 text-sm"
          >
            <label htmlFor="q" className="text-muted">
              or a receipt id (rcp_…) or the file&apos;s sha256
            </label>
            <div className="flex gap-2">
              <input id="q" className={`${inputClass} font-mono text-xs`} placeholder="rcp_… or 64 hex characters" value={query} onChange={(e) => setQuery(e.target.value)} />
              <button type="submit" disabled={busy || !query.trim()} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 cursor-pointer">
                Look up
              </button>
            </div>
          </form>
          <figure className="m-0 flex flex-col gap-2 rounded-2xl border border-line bg-white p-3">
            {file ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={file.url} alt="The checked file" className="max-h-[480px] w-full rounded-xl bg-paper object-contain" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center rounded-xl bg-paper p-4 text-center text-sm text-muted">The file you check appears here. It is hashed in your browser; nothing is uploaded.</div>
            )}
            {file && <figcaption className="break-all font-mono text-xs text-muted">sha256 {file.sha}</figcaption>}
          </figure>
        </div>
        <div className="min-w-0">
          {error && <p className="mb-3 rounded-xl bg-bad-soft px-4 py-3 text-sm text-bad">{error}</p>}
          {result ? (
            <Result result={result} />
          ) : (
            <p className="rounded-2xl border border-line bg-white p-4 text-sm text-muted">
              Every ad made through Likeness has a receipt signed with Ed25519 that names its licence and the PayPal capture, payout or refund behind it.
              Edited or re-encoded copies come back Unknown.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
