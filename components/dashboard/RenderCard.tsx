/**
 * One render as a preview card: the image (or why there is none), what it is, its status and money, the PayPal ids
 * behind it, and the page's actions for it (Accept / Reject with the review countdown, step-up Approve / Decline).
 * Server-safe: the Studio passes the row, and the actions as forms posting its server actions.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { pillClass, StatusPill } from "@/components/ds";
import { CREATOR_LABEL, PayPalIds, pipelineLabel, renderPill, short, STATUS_LABEL, usd, when, type Render } from "./shared";

export function RenderCard({
  r,
  mode,
  name,
  receiptId,
  refusal,
  actions,
}: {
  r: Render;
  mode: "brand" | "creator";
  /** The other side: the creator's name for the brand, the brand's for the creator. */
  name: string;
  receiptId?: string | null;
  refusal?: { reason: string; detail: string | null } | null;
  actions?: ReactNode;
}) {
  const label = (mode === "brand" ? STATUS_LABEL : CREATOR_LABEL)[r.status] ?? r.status;
  const kind = r.kind === "video" ? "Video ad" : "Image ad";

  const ai = !!r.model && !r.model.startsWith("stub") && !r.model.startsWith("demo clip");
  const media = r.outputRef && r.outputMime === "video/mp4" ? (
    <video src={r.outputRef} controls muted playsInline preload="metadata" aria-label={`${kind} for ${mode === "brand" ? name : "you"}: ${r.prompt}`} className="aspect-square w-full shrink-0 rounded-[12px] bg-ink object-cover sm:w-[240px]" />
  ) : r.outputRef ? (
    <a href={r.outputRef} target="_blank" rel="noreferrer" className="block shrink-0 rounded-[12px]" aria-label={`Open the full ${kind.toLowerCase()} (new tab)`}>
      {/* Plain <img> as in likeness-ai: a fixed square box, object-cover, so the aspect ratio is never distorted. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={r.outputRef} alt={`${kind} for ${mode === "brand" ? name : "you"}: ${r.prompt}`} width={240} height={240} className="aspect-square w-full rounded-[12px] bg-white object-cover sm:w-[240px]" />
    </a>
  ) : (
    <div className="flex aspect-square w-full shrink-0 items-center justify-center rounded-[12px] bg-white p-4 text-center text-[13px] text-grey sm:w-[240px]">
      {r.status === "needs_brand_approval" ? "Waiting for the brand's approval. Nothing is charged yet." : (refusal?.detail ?? r.error ?? "No output")}
    </div>
  );

  return (
    <article className="flex min-w-0 flex-col gap-3 rounded-[16px] bg-paper p-3 sm:flex-row" aria-label={`${kind}, ${label}`}>
      {media}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 text-[14px]">
        <span className="flex flex-wrap items-center gap-2">
          <b>{kind}</b>
          <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-semibold text-lime">{ai ? "AI-generated" : "Demo render"} · licensed likeness</span>
          <StatusPill kind={renderPill(r.status)}>{label}</StatusPill>
        </span>
        <span className="tnum text-grey">
          {when(r.createdAt)} · <b className="text-ink">{usd(r.amountCents)}</b>
          {mode === "creator" && r.status === "accepted" ? ` · you were paid ${usd(r.creatorPayoutCents)}` : ""} · {pipelineLabel(r)}
        </span>
        <span className="text-grey">
          {mode === "brand" ? `Creator: ${name}` : `Brand: ${name}`} · {r.use} · licence {short(r.licenceId)}
        </span>
        {r.renderNote && <span className="text-[13px] font-medium text-wait">{r.renderNote}</span>}
        <span className="text-[13px] text-grey">&ldquo;{r.prompt.length > 160 ? `${r.prompt.slice(0, 157)}…` : r.prompt}&rdquo;</span>
        {refusal && r.status !== "needs_brand_approval" && (
          <span className="text-[13px] text-bad">
            {refusal.reason.replaceAll("_", " ")}
            {refusal.detail ? `: ${refusal.detail}` : ""}
          </span>
        )}
        {r.orderId && (
          <div className="mt-1 rounded-[12px] bg-white px-3 py-2">
            <PayPalIds r={r} payoutNote={r.payoutBatchId ? `(${usd(r.creatorPayoutCents)} to the creator)` : undefined} />
          </div>
        )}
        {(actions || receiptId) && (
          <span className="mt-1 flex flex-wrap items-center gap-2">
            {actions}
            {receiptId && (
              <Link href={`/verify/${receiptId}`} className={pillClass("outline", "min-h-11 px-4 text-[13px]")}>
                Signed receipt
              </Link>
            )}
          </span>
        )}
      </div>
    </article>
  );
}
