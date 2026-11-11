/** A verification result (shared by /verify and /verify/[receiptId]; no hooks, so server or client). */
import Image from "next/image";
import type { VerifyResult } from "@/lib/verify";

const LOOK = {
  Licensed: { bg: "bg-good-soft", fg: "text-good", mark: "✓", stamp: "Licensed" },
  Revoked: { bg: "bg-bad-soft", fg: "text-bad", mark: "✕", stamp: "Licensed when made, since revoked" },
  Refunded: { bg: "bg-bad-soft", fg: "text-bad", mark: "↺", stamp: "Refunded" },
  Expired: { bg: "bg-paper", fg: "text-muted", mark: "?", stamp: "Expired" },
  Unknown: { bg: "bg-paper", fg: "text-muted", mark: "?", stamp: "Unknown" },
} as const;

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "–");

export function Result({ result: v }: { result: VerifyResult }) {
  const look = LOOK[v.verdict];
  const p = v.payload;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <section aria-live="polite" className={`flex items-center gap-4 rounded-2xl px-5 py-4 ${look.bg}`}>
        <span aria-hidden="true" className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white text-xl font-bold ${look.fg}`}>
          {look.mark}
        </span>
        <div className="min-w-0">
          <p className={`text-2xl font-bold ${look.fg}`}>{look.stamp}</p>
          <p className="text-sm">{v.headline}</p>
        </div>
      </section>

      {p && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-line bg-white p-3">
              {v.creator?.photoRef && <Image src={v.creator.photoRef} alt="" width={40} height={50} className="h-12 w-10 rounded-lg object-cover" />}
              <div className="min-w-0 text-sm">
                <p className="text-xs text-muted">Creator</p>
                <p className="truncate font-semibold">{v.creator?.name ?? "–"}</p>
              </div>
            </div>
            <div className="rounded-2xl border border-line bg-white p-3 text-sm">
              <p className="text-xs text-muted">Licensee</p>
              <p className="font-semibold">{v.brand?.name ?? "–"}</p>
            </div>
            <div className="rounded-2xl border border-line bg-white p-3 text-sm">
              <p className="text-xs text-muted">Licence now</p>
              <p className="font-semibold">{v.licence?.state ?? "–"}</p>
              <p className="text-xs text-muted">
                {v.licence?.renders} renders · until {day(v.licence?.expiresAt)}
              </p>
            </div>
          </div>

          <section className="rounded-2xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold">
              {p.kind === "video" ? "A video ad" : "An image ad"} for {p.use} use · {usd(p.amountCents)} {p.currency}
            </p>
            <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              {[
                ["PayPal order", p.paypal.orderId],
                ["Authorization", p.paypal.authorizationId],
                ["Capture", p.paypal.captureId],
                ...(p.paypal.payoutBatchId ? [["Creator payout (90%)", `${p.paypal.payoutBatchId} · ${usd(p.creatorPayoutCents)}`]] : []),
                ...(p.paypal.refundId ? [["Refund", p.paypal.refundId]] : []),
                ["Decision", p.decision.replace("_", "-")],
                ["Rendered", p.renderedAt.replace("T", " ").slice(0, 16) + " UTC"],
                ["Settled", p.settledAt.replace("T", " ").slice(0, 16) + " UTC"],
                ["Model", p.model],
                ["Prompt sha256", p.promptSha256],
                ["File sha256", p.outputSha256],
              ].map(([k, val]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-muted">{k}</dt>
                  <dd className="break-all font-mono">{val}</dd>
                </div>
              ))}
            </dl>
          </section>
        </>
      )}

      {v.signature && (
        <ul className="grid gap-2 rounded-2xl bg-ink p-4 text-sm text-white sm:grid-cols-2">
          <Check ok={v.signature.valid}>
            Ed25519 signature {v.signature.valid ? "valid" : "INVALID"} (key {v.signature.keyId})
          </Check>
          <Check ok={!!p?.paypal.captureId}>Paid through PayPal (captured)</Check>
          <Check ok={!!p?.paypal.payoutBatchId}>{p?.paypal.payoutBatchId ? "Creator paid out" : "No payout (refunded)"}</Check>
          <Check ok={v.verdict === "Licensed"}>{v.verdict === "Licensed" ? "Licence still in force" : `Licence ${v.licence?.state ?? "unknown"}`}</Check>
        </ul>
      )}

      {v.receiptId && v.payload && (
        <p className="text-xs text-muted">
          Receipt <span className="font-mono">{v.receiptId}</span> · check it yourself with the public key at <a className="text-brand underline" href="/api/receipts/public-key">/api/receipts/public-key</a>.
        </p>
      )}
      {v.notes.map((n) => (
        <p key={n} className="text-xs text-muted">
          {n}
        </p>
      ))}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs ${ok ? "bg-good text-white" : "bg-white/20 text-white/70"}`}>
        {ok ? "✓" : "–"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Passed: " : "Not passed: "}</span>
        {children}
      </span>
    </li>
  );
}
