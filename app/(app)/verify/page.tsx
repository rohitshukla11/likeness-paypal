"use client";

/**
 * Verify: anyone drops a file (hashed in the browser, never uploaded), pastes its sha256 or a receipt id, and sees
 * Licensed, Revoked ("licensed when made, since revoked"), Expired, Refunded or Unknown, with the creator, the
 * licensee, the PayPal capture and payout or refund behind the answer, and the receipt's Ed25519 signature check.
 */
import { useState } from "react";
import { AppPage, btnClass, Card, ErrorCard } from "@/components/ds";
import { IconUpload } from "@/components/ds/icons";
import { inputClass } from "@/components/ui";
import type { VerifyResult } from "@/lib/verify";
import { Result } from "./result";

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
    <AppPage title="Verify an ad" description="Was the person in this ad paid, and did they license it? Anyone can check; no account needed. Files are hashed in your browser, never uploaded.">
      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card>
            <label
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                void onFile(e.dataTransfer.files[0]);
              }}
              className="flex min-h-16 cursor-pointer items-center gap-3 rounded-[16px] border-2 border-dashed border-field bg-paper px-4 text-[15px] font-semibold focus-within:outline focus-within:outline-[3px] focus-within:outline-violet"
            >
              <span aria-hidden="true" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-lime text-ink">
                <IconUpload size={20} />
              </span>
              <span className="flex-1">{busy ? "Checking…" : "Drop a file or choose one"}</span>
              <input type="file" className="sr-only" onChange={(e) => void onFile(e.target.files?.[0])} />
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lookUp(query);
              }}
              className="flex flex-col gap-1.5"
            >
              <label htmlFor="q" className="text-[14px] font-medium text-grey">
                or a receipt id (rcp_…) or the file&apos;s sha256
              </label>
              <div className="flex gap-2">
                <input id="q" className={`${inputClass} font-mono text-[13px]`} placeholder="rcp_… or 64 hex characters" value={query} onChange={(e) => setQuery(e.target.value)} />
                <button type="submit" disabled={busy || !query.trim()} className={btnClass("ink", "cursor-pointer")}>
                  Look up
                </button>
              </div>
            </form>
          </Card>
          <Card as="div">
            <figure className="m-0 flex flex-col gap-2">
              {file ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.url} alt="The checked file" className="max-h-[480px] w-full rounded-[12px] bg-paper object-contain" />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center rounded-[12px] bg-paper p-4 text-center text-[14px] text-grey">
                  The file you check appears here. It is hashed in your browser; nothing is uploaded.
                </div>
              )}
              {file && <figcaption className="break-all font-mono text-[12px] text-grey">sha256 {file.sha}</figcaption>}
            </figure>
          </Card>
        </div>
        <div className="flex min-w-0 flex-col gap-[18px]">
          {error && <ErrorCard>{error}</ErrorCard>}
          {result ? (
            <Result result={result} />
          ) : (
            <Card title="What you get">
              <p className="m-0 text-[14px] text-grey">
                Every ad made through Likeness has a receipt signed with Ed25519 that names its licence and the PayPal order, authorization, capture and
                payout or refund behind it. The verdict is Licensed, Revoked (licensed when made), Expired, Refunded or Unknown. Edited or re-encoded
                copies come back Unknown.
              </p>
            </Card>
          )}
        </div>
      </div>
    </AppPage>
  );
}
