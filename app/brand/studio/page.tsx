import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { engineDeps, settle } from "@/lib/engine";
import { brandRenders, brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "../../notice";
import { Badge, btn, Card, Empty, Field, input, Mono, PageTitle, short, Stat, toneOf, usd, when } from "../../ui";
import { acceptRender, approveRender, declineRender, rejectRender, startRender } from "./actions";
import { Countdown } from "./countdown";

export default function StudioPage(props: PageProps<"/brand/studio">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading the studio…</p>}>
      <Studio {...props} />
    </Suspense>
  );
}

const STATUS_LABEL: Record<string, string> = {
  in_review: "in review",
  needs_brand_approval: "needs your approval",
  accepted: "accepted · creator paid",
  rejected: "rejected · refunded",
  refused: "refused",
  voided: "voided",
  failed: "failed",
  settling: "paying out…",
  refunding: "refunding…",
};

async function Studio({ searchParams }: PageProps<"/brand/studio">) {
  const s = await getSession();
  if (!s) redirect("/");
  await settle(engineDeps()).catch(() => []);
  const q = await searchParams;
  const [{ mandate: m, wallet, licences, spentToday }, renders] = await Promise.all([brandView(s.brandId), brandRenders(s.brandId)]);
  const active = licences.filter((l) => l.state === "active");

  return (
    <>
      <PageTitle title="Studio" sub="Each render is checked against the licence and your mandate, authorized on your saved PayPal wallet, rendered, checked and captured. You then have a review window to accept (the creator is paid) or reject (you're refunded).">
        <Link href="/brand" className={btn.ghost}>
          Brand settings
        </Link>
      </PageTitle>
      <Notice ok={q.ok} error={q.error} />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <div className="flex flex-col gap-4">
          <Card title="New render">
            {!wallet || !m ? (
              <Empty>
                {!wallet ? "Save your PayPal wallet" : "Save a mandate"} on the <Link href="/brand" className="text-brand underline">brand page</Link> first.
              </Empty>
            ) : active.length === 0 ? (
              <Empty>
                No active licence. Request one on the <Link href="/brand" className="text-brand underline">brand page</Link> and approve it as the Creator.
              </Empty>
            ) : null}
            <form action={startRender} className="mt-3 flex flex-col gap-3">
              <Field label="Licence and use">
                <select name="licenceUse" className={input} required>
                  {licences
                    .filter((l) => l.state !== "pending" && l.state !== "declined")
                    .flatMap((l) =>
                      l.allowedUses.map((u) => (
                        <option key={`${l.id}|${u}`} value={`${l.id}|${u}`}>
                          {l.creatorName} · {u} · {l.state} · {l.rendersUsed}/{l.renderCap}
                        </option>
                      )),
                    )}
                </select>
              </Field>
              <fieldset className="flex gap-2 text-sm">
                <legend className="mb-1 font-medium">Kind</legend>
                {(["image", "video"] as const).map((k) => (
                  <label key={k} className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5">
                    <input type="radio" name="kind" value={k} defaultChecked={k === "image"} className="accent-brand" />
                    {k}
                  </label>
                ))}
              </fieldset>
              <Field label="Prompt">
                <textarea name="prompt" rows={3} defaultValue="Rohit holding our cold brew on a sunny morning, warm light, clean background" className={input} />
              </Field>
              <button className={`${btn.primary} self-start`} disabled={!wallet || !m || active.length === 0}>
                Render
              </button>
              <p className="text-xs text-muted">Demo renders come from pre-generated images (no AI call, no cost). The PayPal calls are real sandbox calls.</p>
            </form>
          </Card>

          {m && (
            <Card title="Your mandate">
              <div className="grid grid-cols-2 gap-2">
                <Stat label="Spent / budget" value={usd(m.spentCents)} sub={`of ${usd(m.totalBudgetCents)}`} />
                <Stat label="Today / daily cap" value={usd(spentToday)} sub={`of ${usd(m.dailyCapCents)}`} />
                <Stat label="Max per render" value={usd(m.maxPerRenderCents)} />
                <Stat label="Step-up above" value={usd(m.stepUpThresholdCents)} />
              </div>
            </Card>
          )}
        </div>

        <Card title="Renders">
          {renders.length === 0 ? (
            <Empty>No renders yet.</Empty>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {renders.map(({ render: r, receiptId, creatorName, refusal }) => (
                <li key={r.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-line p-3">
                  {r.outputRef ? (
                    <Image src={r.outputRef} alt={`Render for ${creatorName}: ${r.prompt}`} width={720} height={720} unoptimized className="aspect-square w-full rounded-lg bg-paper object-cover" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center rounded-lg bg-paper p-4 text-center text-sm text-muted">
                      {r.status === "needs_brand_approval" ? "Waiting for your approval. Nothing charged yet." : refusal?.detail ?? r.error ?? "No output"}
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone={toneOf(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</Badge>
                    <span className="tnum text-sm font-semibold">
                      {usd(r.amountCents)} · {r.kind}
                    </span>
                  </div>
                  <p className="line-clamp-2 text-xs text-muted">&ldquo;{r.prompt}&rdquo;</p>
                  {refusal && r.status !== "needs_brand_approval" && (
                    <p className="text-xs text-bad">
                      {refusal.reason.replaceAll("_", " ")}: {refusal.detail}
                    </p>
                  )}
                  <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-xs text-muted">
                    <dt>order</dt>
                    <dd>
                      <Mono>{short(r.orderId)}</Mono>
                    </dd>
                    <dt>capture</dt>
                    <dd>
                      <Mono>{short(r.captureId)}</Mono>
                    </dd>
                    {r.payoutBatchId && (
                      <>
                        <dt>payout</dt>
                        <dd>
                          <Mono>
                            {short(r.payoutBatchId)} ({usd(r.creatorPayoutCents)})
                          </Mono>
                        </dd>
                      </>
                    )}
                    {r.refundId && (
                      <>
                        <dt>refund</dt>
                        <dd>
                          <Mono>{short(r.refundId)}</Mono>
                        </dd>
                      </>
                    )}
                    <dt>made</dt>
                    <dd>{when(r.createdAt)}</dd>
                  </dl>
                  {r.status === "in_review" && r.reviewDeadline && (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2">
                      <form action={acceptRender.bind(null, r.id)}>
                        <button className={btn.good}>Accept</button>
                      </form>
                      <form action={rejectRender.bind(null, r.id)}>
                        <button className={btn.bad}>Reject</button>
                      </form>
                      <Countdown deadline={r.reviewDeadline.toISOString()} />
                    </div>
                  )}
                  {r.status === "needs_brand_approval" && (
                    <div className="flex flex-wrap gap-2 border-t border-line pt-2">
                      <form action={approveRender.bind(null, r.id)}>
                        <button className={btn.good}>Approve {usd(r.amountCents)}</button>
                      </form>
                      <form action={declineRender.bind(null, r.id)}>
                        <button className={btn.ghost}>Decline</button>
                      </form>
                    </div>
                  )}
                  {receiptId && (
                    <Link href={`/verify/${receiptId}`} className="text-xs font-semibold text-brand underline">
                      Signed receipt →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
