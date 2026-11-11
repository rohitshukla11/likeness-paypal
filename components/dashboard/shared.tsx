/**
 * Render rows, their labels and the money and PayPal-id formatting shared by the Studio, the Brand and Creator pages
 * and the receipts. Server-safe (no hooks): the server pages read the rows and pass them in.
 */
import type { ReactNode } from "react";
import type { PillKind } from "@/components/ds";
import type { renders } from "@/lib/db/schema";

export type Render = typeof renders.$inferSelect;

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** A PayPal or app id, shortened for a card (the full id stays in the title and for screen readers). */
export const short = (id: string | null | undefined) => (!id ? "–" : id.length <= 14 ? id : `${id.slice(0, 7)}…${id.slice(-4)}`);

export const when = (d: Date | null | undefined) =>
  d ? `${d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" })} UTC` : "–";

/** Render statuses (lib/db/schema.ts) in words. */
export const STATUS_LABEL: Record<string, string> = {
  needs_brand_approval: "Needs your approval",
  authorized: "Authorized",
  rendering: "Rendering…",
  captured: "Captured",
  in_review: "In review",
  settling: "Paying out…",
  accepted: "Accepted · creator paid",
  refunding: "Refunding…",
  rejected: "Rejected · refunded",
  voided: "Voided",
  refused: "Refused",
  failed: "Failed",
};

/** The same statuses as the creator sees them. */
export const CREATOR_LABEL: Record<string, string> = { ...STATUS_LABEL, needs_brand_approval: "Waiting for the brand", accepted: "Accepted · paid to you", rejected: "Rejected · refunded" };

export function renderPill(status: string): PillKind {
  if (status === "accepted") return "licensed";
  if (["rejected", "voided", "refused", "failed"].includes(status)) return "revoked";
  if (["in_review", "needs_brand_approval", "settling", "refunding", "authorized", "rendering", "captured"].includes(status)) return "waiting";
  return "neutral";
}

/** Pre-generated demo renders say so; a real provider would name its model. */
export const pipelineLabel = (r: Pick<Render, "model">) => r.model ?? "no output";

/** A PayPal id: shortened, monospaced, the full id on hover and for screen readers. */
export function PayPalId({ id }: { id: string | null | undefined }) {
  if (!id) return <span className="text-grey">–</span>;
  return (
    <span title={id} className="break-all font-mono text-[12px]">
      <span aria-hidden="true">{short(id)}</span>
      <span className="sr-only">{id}</span>
    </span>
  );
}

/** The PayPal side of one render: order, authorization, capture, then the payout or the refund. */
export function PayPalIds({ r, payoutNote }: { r: Pick<Render, "orderId" | "authorizationId" | "captureId" | "payoutBatchId" | "refundId">; payoutNote?: ReactNode }) {
  const rows: [string, string | null, ReactNode?][] = [
    ["PayPal order", r.orderId],
    ["Authorization", r.authorizationId],
    ["Capture", r.captureId],
  ];
  if (r.payoutBatchId) rows.push(["Payout batch", r.payoutBatchId, payoutNote]);
  if (r.refundId) rows.push(["Refund", r.refundId]);
  return (
    <dl className="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-[13px]">
      {rows.map(([k, v, note]) => (
        <div key={k} className="contents">
          <dt className="text-grey">{k}</dt>
          <dd className="m-0 min-w-0">
            <PayPalId id={v} />
            {note && <span className="text-grey"> {note}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
