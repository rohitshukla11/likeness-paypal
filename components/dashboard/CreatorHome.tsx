/**
 * The creator's dashboard, in the layout of likeness-eth (FaceVisa)'s CreatorHome: a profile banner, the numbers,
 * the requests waiting (lime), licences and ads as cards, the earnings ledger with PayPal payout ids, the terms, and
 * a dark "anyone can verify" card. Server component: every action is a form posting this app's server actions.
 * FaceVisa's chain parts (Arkiv listing, Swarm files, World ID, on-chain payment lines) are replaced by PayPal ids.
 */
import Link from "next/link";
import { decideRequest, revokeLicence, saveTerms } from "@/app/(app)/creator/actions";
import { LicenceReview } from "@/components/agent/LicenceReview";
import { btnClass, StatusPill } from "@/components/ds";
import { CREATOR_LABEL, PayPalId, renderPill, usd, when } from "@/components/dashboard/shared";
import { chipClass, Field, fmtDay, inputClass, StatusBadge } from "@/components/ui";
import { BANNED_USES, USES } from "@/lib/db/schema";
import type { creatorView } from "@/lib/queries";
import { Banner, CHIP, Empty, FaceTile, Fact, MUTED, OUTLINE, OUTLINE_BAD, Panel, Rule, Stat, StatsRow, SURFACE } from "./kit";

type View = Awaited<ReturnType<typeof creatorView>>;

export function CreatorHome({ v, notice, reviewEnabled, onboardingLink }: { v: View; notice?: React.ReactNode; reviewEnabled: boolean; onboardingLink: boolean }) {
  const { creator: c, requests, licences, ledger, earned, pending } = v;
  const active = licences.filter((l) => l.state === "active");
  const ads = ledger.filter((x) => x.render.outputRef);

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-[18px] px-4 pb-12 pt-6 sm:px-8">
      <Banner
        label="Your creator profile"
        visual={<FaceTile src={c.photoRef ?? "/demo/rohit.svg"} alt={`${c.name}'s reference portrait (demo illustration)`} />}
        title={c.name}
        sub="You approve each brand once, within your terms. Every ad made under a licence is paid to your PayPal (90%) when the brand accepts it, and comes with a signed receipt."
        chips={
          <>
            <span className={`${CHIP} ${c.acceptingLicences ? "bg-lime text-ink" : "bg-paper text-grey"}`}>{c.acceptingLicences ? "Accepting licence requests" : "Not accepting requests"}</span>
            <span className={`${CHIP} bg-violet-soft text-wait`} title="PayPal Payouts send your 90% here">
              Payouts to {c.payoutPaypalEmail ?? "no PayPal email yet"}
            </span>
            {!c.googleSub && <span className={`${CHIP} bg-paper text-grey`}>Demo creator · illustrated portrait</span>}
          </>
        }
        actions={
          onboardingLink ? (
            <Link href="/creator/onboard" className={btnClass("ink")}>
              Verify your own likeness
            </Link>
          ) : undefined
        }
      />

      {notice}

      <StatsRow>
        <Stat accent label="Paid to your PayPal" value={usd(earned)} note="90% of each accepted ad" />
        <Stat label="In review" value={usd(pending)} note="paid when accepted or at the deadline" />
        <Stat label="Ads" value={ledger.length} note="made with your likeness" />
        <Stat label="Active licences" value={active.length} />
        <Stat label="Requests" value={requests.length} note="waiting for you" />
      </StatsRow>

      <Panel tone="lime" title={`Licence requests waiting for you${requests.length ? ` (${requests.length})` : ""}`}>
        {requests.length === 0 ? (
          <Empty>No requests waiting. When a brand asks to use your likeness, it shows up here.</Empty>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 lg:grid-cols-2">
            {requests.map((r) => (
              <li key={r.id} className={`${SURFACE} flex min-w-0 flex-col gap-3 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="truncate text-[16px]">{r.brandName}</b>
                  <StatusBadge status="pending" />
                </div>
                <span className={`text-[14px] ${MUTED}`}>&ldquo;{r.brief}&rdquo;</span>
                <dl className="m-0 grid grid-cols-3 gap-2 text-[13px]">
                  <Fact label="Uses" value={r.allowedUses.join(", ")} />
                  <Fact label="Renders" value={`${r.renderCap} over ${r.days} days`} />
                  <Fact label="Price" value={`${usd(c.pricePerRenderCents)} / ad`} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <form action={decideRequest.bind(null, r.id, true)}>
                    <button className={btnClass("lime", "cursor-pointer")}>Approve</button>
                  </form>
                  <form action={decideRequest.bind(null, r.id, false)}>
                    <button className={OUTLINE}>Decline</button>
                  </form>
                </div>
                {reviewEnabled && <LicenceReview licenceId={r.id} />}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title={`Your licences${licences.length ? ` (${licences.length})` : ""}`}>
        {licences.length === 0 ? (
          <Empty>No licences yet.</Empty>
        ) : (
          <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
            {licences.map((l) => (
              <li key={l.id} className={`${SURFACE} flex min-w-0 flex-col gap-3 p-4`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <b className="truncate text-[16px]">{l.brandName}</b>
                  <StatusBadge status={l.state} />
                </div>
                <dl className="m-0 grid grid-cols-3 gap-2 text-[13px]">
                  <Fact label="Uses" value={l.allowedUses.join(", ")} />
                  <Fact label="Renders" value={`${l.rendersUsed} of ${l.renderCap}`} />
                  <Fact label={l.state === "revoked" ? "Revoked" : "Until"} value={fmtDay(l.state === "revoked" ? l.revokedAt : l.expiresAt)} />
                </dl>
                <span className={`text-[13px] ${MUTED}`}>{usd(l.pricePerRenderCents)} per image · video 3×</span>
                {(l.state === "active" || l.state === "exhausted" || l.state === "expired") && (
                  <form action={revokeLicence.bind(null, l.id)} className="mt-auto">
                    <button className={OUTLINE_BAD}>Revoke</button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Ads made with your likeness" action={<span className={`text-[13px] ${MUTED}`}>{ledger.length} ad{ledger.length === 1 ? "" : "s"}</span>}>
        {ads.length === 0 ? (
          <Empty>No ads yet. When a brand renders an ad under one of your licences, it shows up here with its PayPal payout.</Empty>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {ads.slice(0, 6).map(({ render: r, brandName, receiptId }) => (
              <article key={r.id} className={`${SURFACE} flex min-w-0 flex-col overflow-hidden`}>
                <div className="bg-paper">
                  {r.outputMime === "video/mp4" ? (
                    <video src={r.outputRef!} controls muted playsInline preload="metadata" className="aspect-square w-full bg-ink object-cover" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.outputRef!} alt={`Ad for ${brandName}: ${r.prompt}`} width={400} height={400} className="aspect-square w-full object-cover" />
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="truncate text-[16px]">{brandName}</b>
                    <StatusPill kind={renderPill(r.status)}>{CREATOR_LABEL[r.status] ?? r.status}</StatusPill>
                  </div>
                  <dl className="m-0 grid grid-cols-3 gap-2 text-[13px]">
                    <Fact label="Ad" value={usd(r.amountCents)} />
                    <Fact label="You" value={r.status === "accepted" ? usd(r.creatorPayoutCents) : "–"} />
                    <Fact label={r.payoutBatchId ? "Payout" : r.refundId ? "Refund" : "Capture"} value={<PayPalId id={r.payoutBatchId ?? r.refundId ?? r.captureId} />} />
                  </dl>
                  {receiptId && (
                    <Link href={`/verify/${receiptId}`} className={`${OUTLINE} mt-auto self-start`}>
                      Receipt
                    </Link>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel tone="surface" title="Earnings ledger" action={<span className={`text-[13px] ${MUTED}`}>every ad, with its PayPal ids</span>}>
        {ledger.length === 0 ? (
          <Empty>No ads yet.</Empty>
        ) : (
          <div className="relative -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead className={`text-[13px] ${MUTED}`}>
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="pr-3 font-medium">Brand</th>
                  <th className="pr-3 font-medium">Ad</th>
                  <th className="pr-3 font-medium">Status</th>
                  <th className="pr-3 font-medium">You</th>
                  <th className="pr-3 font-medium">PayPal</th>
                  <th className="font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map(({ render: r, brandName, receiptId }) => (
                  <tr key={r.id} className="border-t border-divider">
                    <td className="py-2.5 pr-3 whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="pr-3">{brandName}</td>
                    <td className="tnum pr-3">{usd(r.amountCents)}</td>
                    <td className="pr-3">
                      <StatusPill kind={renderPill(r.status)}>{CREATOR_LABEL[r.status] ?? r.status}</StatusPill>
                    </td>
                    <td className="tnum pr-3 font-semibold">{r.status === "accepted" ? usd(r.creatorPayoutCents) : "–"}</td>
                    <td className="pr-3">
                      <span className={`text-[12px] ${MUTED}`}>{r.payoutBatchId ? "payout " : r.refundId ? "refund " : "capture "}</span>
                      <PayPalId id={r.payoutBatchId ?? r.refundId ?? r.captureId} />
                    </td>
                    <td>
                      {receiptId ? (
                        <Link href={`/verify/${receiptId}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline">
                          View
                        </Link>
                      ) : (
                        <span className={MUTED}>–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Panel tone="surface" title="Your rules">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Rule label="Per image" value={usd(c.pricePerRenderCents)} />
            <Rule label="Per video" value={usd(c.pricePerRenderCents * c.videoMultiplier)} />
            <Rule label="Renders" value={`up to ${c.maxRendersPerLicence}`} />
            <Rule label="Longest licence" value={`${c.maxDays} days`} />
          </div>
          <form action={saveTerms} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Price per render (USD)" hint="Video costs 3× this">
                <input name="price" type="number" min="0.5" max="100" step="0.01" defaultValue={(c.pricePerRenderCents / 100).toFixed(2)} className={inputClass} />
              </Field>
              <Field label="Renders per licence">
                <input name="cap" type="number" min="1" max="100" defaultValue={c.maxRendersPerLicence} className={inputClass} />
              </Field>
              <Field label="Longest licence (days)">
                <input name="days" type="number" min="1" max="365" defaultValue={c.maxDays} className={inputClass} />
              </Field>
              <div className="flex items-end">
                <label className={`${chipClass} w-full justify-center`}>
                  <input name="accepting" type="checkbox" defaultChecked={c.acceptingLicences} className="h-4 w-4 accent-lime" />
                  Accepting requests
                </label>
              </div>
            </div>
            <Field label="Uses you allow" group hint={`Never allowed, whatever the terms: ${BANNED_USES.join(", ")}.`}>
              <div className="flex flex-wrap gap-2">
                {USES.map((u) => (
                  <label key={u} className={chipClass}>
                    <input type="checkbox" name="uses" value={u} defaultChecked={c.allowedUses.includes(u)} className="h-4 w-4 accent-lime" />
                    {u}
                  </label>
                ))}
              </div>
            </Field>
            <Field label="Payout PayPal email" hint="Sandbox: a personal sandbox account. Payouts go here.">
              <input name="email" type="email" defaultValue={c.payoutPaypalEmail ?? ""} placeholder="you@example.com" className={inputClass} />
            </Field>
            <button className={btnClass("ink", "cursor-pointer self-start")}>Save terms</button>
          </form>
        </Panel>

        <Panel tone="ink" title="Anyone can check an ad made with your face">
          <p className="m-0 text-[14px] text-grey-dark">
            Every ad gets a receipt signed with Ed25519 that names its licence and the PayPal capture, payout or refund behind it. Drop a file or paste a receipt id
            on Verify: licensed, revoked (&ldquo;licensed when made&rdquo;), refunded or unknown.
          </p>
          <div className="flex flex-wrap gap-2">
            <Link href="/verify" className={btnClass("lime")}>
              Open Verify
            </Link>
            <a href="/api/receipts/public-key" className="inline-flex min-h-11 items-center rounded-full border border-white/25 px-4 text-[14px] font-semibold text-white no-underline hover:border-white">
              Public key
            </a>
          </div>
        </Panel>
      </div>
    </div>
  );
}
