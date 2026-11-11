/** A verification result (shared by /verify and /verify/[receiptId]; no hooks, so server or client). */
import type { ReactNode } from "react";
import { Card, CreatorFace, StatusPill, type PillKind } from "@/components/ds";
import { IconCheck, IconCross, IconQuestion, IconShield } from "@/components/ds/icons";
import { PayPalId } from "@/components/dashboard/shared";
import type { VerifyResult } from "@/lib/verify";

const LOOK: Record<VerifyResult["verdict"], { pill: PillKind; card: string; mark: ReactNode; stamp: string }> = {
  Licensed: { pill: "licensed", card: "bg-ok-bg text-ok", mark: <IconCheck size={26} />, stamp: "Licensed" },
  Revoked: { pill: "revoked", card: "bg-bad-bg text-bad", mark: <IconCross size={26} />, stamp: "Licensed when made, since revoked" },
  Refunded: { pill: "revoked", card: "bg-bad-bg text-bad", mark: <span className="text-[24px] font-bold leading-none">↺</span>, stamp: "Refunded" },
  Expired: { pill: "expired", card: "bg-white text-grey", mark: <IconQuestion size={26} />, stamp: "Expired" },
  Unknown: { pill: "neutral", card: "bg-white text-grey", mark: <IconQuestion size={26} />, stamp: "Unknown" },
};

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const day = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : "–");
const at = (iso: string) => iso.replace("T", " ").slice(0, 16) + " UTC";

export function Result({ result: v }: { result: VerifyResult }) {
  const look = LOOK[v.verdict];
  const p = v.payload;
  return (
    <div className="flex min-w-0 flex-col gap-[18px]">
      <section aria-live="polite" className={`flex items-center gap-4 rounded-[20px] p-[18px] sm:px-5 ${look.card}`}>
        <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white">
          {look.mark}
        </span>
        <div className="flex min-w-0 flex-col gap-1">
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill kind={look.pill}>{v.verdict}</StatusPill>
            <span className="font-display text-[clamp(18px,2.4vw,24px)] font-extrabold leading-tight">{look.stamp}</span>
          </span>
          <p className="m-0 text-[15px] text-ink">{v.headline}</p>
        </div>
      </section>

      {p && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="flex min-w-0 items-center gap-3 rounded-[18px] bg-white px-[18px] py-4">
              <CreatorFace seed={v.creator?.name ?? "creator"} photo={v.creator?.photoRef} size={44} />
              <div className="min-w-0">
                <p className="m-0 text-[13px] text-grey">Creator</p>
                <p className="m-0 truncate font-semibold">{v.creator?.name ?? "–"}</p>
              </div>
            </div>
            <div className="min-w-0 rounded-[18px] bg-white px-[18px] py-4">
              <p className="m-0 text-[13px] text-grey">Licensee</p>
              <p className="m-0 font-semibold">{v.brand?.name ?? "–"}</p>
            </div>
            <div className="min-w-0 rounded-[18px] bg-white px-[18px] py-4">
              <p className="m-0 text-[13px] text-grey">Licence now</p>
              <p className="m-0 font-semibold">{v.licence?.state ?? "–"}</p>
              <p className="m-0 text-[12px] text-grey">
                {v.licence?.renders} renders · until {day(v.licence?.expiresAt)}
              </p>
            </div>
          </div>

          <Card title={`${p.kind === "video" ? "A video ad" : "An image ad"} for ${p.use} use · ${usd(p.amountCents)} ${p.currency}`}>
            <dl className="m-0 grid grid-cols-1 gap-x-4 gap-y-2 text-[13px] sm:grid-cols-2">
              {(
                [
                  ["PayPal order", <PayPalId key="o" id={p.paypal.orderId} />],
                  ["Authorization", <PayPalId key="a" id={p.paypal.authorizationId} />],
                  ["Capture", <PayPalId key="c" id={p.paypal.captureId} />],
                  ...(p.paypal.payoutBatchId
                    ? [
                        [
                          "Creator payout (90%)",
                          <span key="p">
                            <PayPalId id={p.paypal.payoutBatchId} /> · {usd(p.creatorPayoutCents)}
                          </span>,
                        ],
                      ]
                    : []),
                  ...(p.paypal.refundId ? [["Refund", <PayPalId key="r" id={p.paypal.refundId} />]] : []),
                  ["Decision", p.decision.replace("_", "-")],
                  ["Rendered", at(p.renderedAt)],
                  ["Settled", at(p.settledAt)],
                  ["Model", p.model],
                  ["Prompt sha256", <span key="ps" className="break-all font-mono text-[12px]">{p.promptSha256}</span>],
                  ["File sha256", <span key="fs" className="break-all font-mono text-[12px]">{p.outputSha256}</span>],
                ] as [string, ReactNode][]
              ).map(([k, val]) => (
                <div key={k} className="min-w-0">
                  <dt className="text-grey">{k}</dt>
                  <dd className="m-0 min-w-0">{val}</dd>
                </div>
              ))}
            </dl>
          </Card>
        </>
      )}

      {v.signature && (
        <Card tone="ink" title="Checks">
          <ul className="m-0 grid list-none grid-cols-1 gap-2 p-0 text-[14px] sm:grid-cols-2">
            <Check ok={v.signature.valid}>
              Ed25519 signature {v.signature.valid ? "valid" : "INVALID"} (key {v.signature.keyId})
            </Check>
            <Check ok={!!p?.paypal.captureId}>Paid through PayPal (captured)</Check>
            <Check ok={!!p?.paypal.payoutBatchId}>{p?.paypal.payoutBatchId ? "Creator paid out" : "No payout (refunded)"}</Check>
            <Check ok={v.verdict === "Licensed"}>{v.verdict === "Licensed" ? "Licence still in force" : `Licence ${v.licence?.state ?? "unknown"}`}</Check>
          </ul>
        </Card>
      )}

      {v.receiptId && v.payload && (
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13px] text-grey">
          <IconShield size={16} /> Receipt <span className="break-all font-mono">{v.receiptId}</span> · check it yourself with the public key at{" "}
          <a className="font-semibold text-ink underline" href="/api/receipts/public-key">
            /api/receipts/public-key
          </a>
          .
        </p>
      )}
      {v.notes.map((n) => (
        <p key={n} className="m-0 text-[13px] text-grey">
          {n}
        </p>
      ))}
    </div>
  );
}

function Check({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <li className="flex items-center gap-2">
      <span aria-hidden="true" className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${ok ? "bg-lime text-ink" : "bg-white/15 text-grey-dark"}`}>
        {ok ? <IconCheck size={14} /> : "–"}
      </span>
      <span>
        <span className="sr-only">{ok ? "Passed: " : "Not passed: "}</span>
        {children}
      </span>
    </li>
  );
}
