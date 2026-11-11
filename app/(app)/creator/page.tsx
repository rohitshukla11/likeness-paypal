import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { onboardingEnabled } from "@/lib/onboarding/google";
import { AppPage, btnClass, Card, CreatorFace, Initial, StatCard, StatusPill } from "@/components/ds";
import { CREATOR_LABEL, PayPalId, renderPill, usd, when } from "@/components/dashboard/shared";
import { chipClass, Field, fmtDay, inputClass, StatusBadge } from "@/components/ui";
import { BANNED_USES, USES } from "@/lib/db/schema";
import { engineDeps, settle } from "@/lib/engine";
import { creatorView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "@/app/notice";
import Loading from "../loading";
import { decideRequest, revokeLicence, saveTerms } from "./actions";

export default function CreatorPage(props: PageProps<"/creator">) {
  return (
    <Suspense fallback={<Loading />}>
      <Creator {...props} />
    </Suspense>
  );
}

async function Creator({ searchParams }: PageProps<"/creator">) {
  const s = await getSession();
  if (!s) redirect("/");
  await settle(engineDeps()).catch(() => []); // renders past their review window are auto-accepted on load
  const q = await searchParams;
  const { creator: c, requests, licences, ledger, earned, pending } = await creatorView(s.creatorId);

  return (
    <AppPage
      title={`Hi ${c.name}`}
      description="You approve each brand once, within your terms. Every ad made under a licence is paid to your PayPal (90%) when the brand accepts it, and comes with a signed receipt."
      actions={
        onboardingEnabled() && !c.googleSub ? (
          <Link href="/creator/onboard" className={btnClass("ink")}>
            Verify your own likeness
          </Link>
        ) : undefined
      }
    >
      <Notice ok={q.ok} error={q.error} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Paid to your PayPal" value={usd(earned)} note="90% of each accepted ad, through PayPal Payouts" />
        <StatCard label="In review" value={usd(pending)} note="paid when accepted or at the deadline" />
        <Card tone="violet">
          <span className="flex items-center gap-3">
            <CreatorFace seed={c.id} photo={c.photoRef ?? "/demo/rohit.svg"} size={52} ring="#FFFFFF" label={`${c.name}'s reference portrait (demo illustration)`} />
            <span className="flex min-w-0 flex-col">
              <span className="text-[18px] font-bold">{c.name}</span>
              <span className="text-[13px]">Demo creator · illustrated portrait</span>
            </span>
          </span>
          <span className="text-[14px] font-semibold">{c.acceptingLicences ? "Accepting licence requests" : "Not accepting requests"}</span>
          <span className="text-[13px]">Payouts to {c.payoutPaypalEmail ?? "no PayPal email yet (set it below)"}</span>
        </Card>
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <Card title="Your terms and payout">
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
        </Card>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Card title={`Licence requests${requests.length ? ` (${requests.length})` : ""}`}>
            {requests.length === 0 ? (
              <p className="m-0 text-grey">No requests waiting. When a brand asks to use your likeness, it shows up here.</p>
            ) : (
              requests.map((r) => (
                <div key={r.id} className="flex flex-col gap-2 rounded-[14px] bg-paper p-3 text-[14px]">
                  <span className="flex flex-wrap items-center gap-2">
                    <Initial name={r.brandName} size={28} />
                    <b>{r.brandName}</b>
                    <StatusBadge status="pending" />
                  </span>
                  <span className="text-grey">&ldquo;{r.brief}&rdquo;</span>
                  <span>
                    {r.allowedUses.join(", ")} · {r.renderCap} renders · {r.days} days · {usd(c.pricePerRenderCents)} per render
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <form action={decideRequest.bind(null, r.id, true)}>
                      <button className={btnClass("lime", "cursor-pointer")}>Approve</button>
                    </form>
                    <form action={decideRequest.bind(null, r.id, false)}>
                      <button className={btnClass("outline", "cursor-pointer")}>Decline</button>
                    </form>
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card title="Licences">
            {licences.length === 0 ? (
              <p className="m-0 text-grey">No licences yet.</p>
            ) : (
              licences.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-divider py-2 text-[14px] last:border-0">
                  <StatusBadge status={l.state} />
                  <span className="font-semibold">{l.brandName}</span>
                  <span className="min-w-0 text-grey">
                    {l.allowedUses.join(", ")} · {l.rendersUsed}/{l.renderCap} renders · {usd(l.pricePerRenderCents)} · {l.state === "revoked" ? `revoked ${fmtDay(l.revokedAt)}` : `until ${fmtDay(l.expiresAt)}`}
                  </span>
                  {(l.state === "active" || l.state === "exhausted" || l.state === "expired") && (
                    <form action={revokeLicence.bind(null, l.id)} className="ml-auto">
                      <button className={btnClass("danger", "cursor-pointer")}>Revoke</button>
                    </form>
                  )}
                </div>
              ))
            )}
          </Card>
        </div>
      </div>

      <Card title="Earnings" action={<span className="text-[13px] text-grey">{ledger.length} ad{ledger.length === 1 ? "" : "s"} made with your likeness</span>}>
        {ledger.length === 0 ? (
          <p className="m-0 text-grey">No ads yet.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] text-grey">
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
                      <span className="text-[12px] text-grey">{r.payoutBatchId ? "payout " : r.refundId ? "refund " : "capture "}</span>
                      <PayPalId id={r.payoutBatchId ?? r.refundId ?? r.captureId} />
                    </td>
                    <td>
                      {receiptId ? (
                        <Link href={`/verify/${receiptId}`} className="inline-flex min-h-11 items-center font-semibold text-ink underline">
                          View
                        </Link>
                      ) : (
                        <span className="text-grey">–</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </AppPage>
  );
}
