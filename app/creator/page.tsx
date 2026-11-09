import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BANNED_USES, USES } from "@/lib/db/schema";
import { engineDeps, settle } from "@/lib/engine";
import { creatorView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "../notice";
import { Badge, btn, Card, day, Empty, Field, input, Mono, PageTitle, short, Stat, toneOf, usd } from "../ui";
import { decideRequest, revokeLicence, saveTerms } from "./actions";

export default function CreatorPage(props: PageProps<"/creator">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your dashboard…</p>}>
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
    <>
      <PageTitle title={`Hi ${c.name}`} sub="You approve each brand once, within your terms. Every ad made under a licence is paid to your PayPal (90%) when the brand accepts it, and comes with a signed receipt." />
      <Notice ok={q.ok} error={q.error} />

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <div className="flex flex-col gap-4">
          <Card title="Your likeness">
            <div className="flex items-center gap-4">
              <Image src={c.photoRef ?? "/demo/rohit.svg"} alt={`${c.name}'s reference portrait (demo illustration)`} width={80} height={100} className="h-20 w-16 rounded-xl object-cover" />
              <div className="min-w-0 text-sm">
                <p className="font-semibold">{c.name}</p>
                <p className="text-muted">Demo creator · illustrated portrait</p>
                <p className="mt-1">{c.acceptingLicences ? <Badge tone="good">accepting licences</Badge> : <Badge>not accepting</Badge>}</p>
              </div>
            </div>
          </Card>

          <Card title="Terms and payout">
            <form action={saveTerms} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Price per render (USD)" hint="Video costs 3× this">
                  <input name="price" type="number" min="0.5" max="100" step="0.01" defaultValue={(c.pricePerRenderCents / 100).toFixed(2)} className={input} />
                </Field>
                <Field label="Renders per licence">
                  <input name="cap" type="number" min="1" max="100" defaultValue={c.maxRendersPerLicence} className={input} />
                </Field>
                <Field label="Longest licence (days)">
                  <input name="days" type="number" min="1" max="365" defaultValue={c.maxDays} className={input} />
                </Field>
                <Field label="Accepting requests">
                  <span className="flex h-[38px] items-center">
                    <input name="accepting" type="checkbox" defaultChecked={c.acceptingLicences} className="h-4 w-4 accent-brand" />
                  </span>
                </Field>
              </div>
              <fieldset className="flex flex-col gap-1.5 text-sm">
                <legend className="mb-1 font-medium">Uses you allow</legend>
                <div className="flex flex-wrap gap-2">
                  {USES.map((u) => (
                    <label key={u} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5">
                      <input type="checkbox" name="uses" value={u} defaultChecked={c.allowedUses.includes(u)} className="accent-brand" />
                      {u}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted">Never allowed, whatever the terms: {BANNED_USES.join(", ")}.</p>
              </fieldset>
              <Field label="Payout PayPal email" hint="Sandbox: a personal sandbox account. Payouts go here.">
                <input name="email" type="email" defaultValue={c.payoutPaypalEmail ?? ""} placeholder="you@example.com" className={input} />
              </Field>
              <button className={`${btn.primary} self-start`}>Save terms</button>
            </form>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title={`Licence requests${requests.length ? ` (${requests.length})` : ""}`}>
            {requests.length === 0 ? (
              <Empty>No requests waiting. When a brand asks to use your likeness, it shows up here.</Empty>
            ) : (
              <ul className="flex flex-col gap-3">
                {requests.map((r) => (
                  <li key={r.id} className="rounded-xl border border-line p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold">{r.brandName}</p>
                      <Badge tone="warn">pending</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">&ldquo;{r.brief}&rdquo;</p>
                    <p className="mt-1 text-sm">
                      {r.allowedUses.join(", ")} · {r.renderCap} renders · {r.days} days · {usd(c.pricePerRenderCents)} per render
                    </p>
                    <div className="mt-2 flex gap-2">
                      <form action={decideRequest.bind(null, r.id, true)}>
                        <button className={btn.good}>Approve</button>
                      </form>
                      <form action={decideRequest.bind(null, r.id, false)}>
                        <button className={btn.ghost}>Decline</button>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Licences">
            {licences.length === 0 ? (
              <Empty>No licences yet.</Empty>
            ) : (
              <ul className="flex flex-col divide-y divide-line">
                {licences.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {l.brandName} <Badge tone={toneOf(l.state)}>{l.state}</Badge>
                      </p>
                      <p className="text-muted">
                        {l.allowedUses.join(", ")} · {l.rendersUsed}/{l.renderCap} renders · {usd(l.pricePerRenderCents)} · {l.state === "revoked" ? `revoked ${day(l.revokedAt)}` : `until ${day(l.expiresAt)}`}
                      </p>
                    </div>
                    {(l.state === "active" || l.state === "exhausted" || l.state === "expired") && (
                      <form action={revokeLicence.bind(null, l.id)}>
                        <button className={btn.bad}>Revoke</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Earnings">
            <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Stat label="Paid to your PayPal" value={usd(earned)} sub="90% of each accepted ad" />
              <Stat label="In review" value={usd(pending)} sub="paid when accepted or at the deadline" />
              <Stat label="Ads" value={ledger.length} />
            </div>
            {ledger.length === 0 ? (
              <Empty>No ads yet.</Empty>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-sm">
                  <thead className="text-xs text-muted">
                    <tr>
                      <th className="py-1.5 font-medium">Date</th>
                      <th className="font-medium">Brand</th>
                      <th className="font-medium">Ad</th>
                      <th className="font-medium">You</th>
                      <th className="font-medium">PayPal</th>
                      <th className="font-medium">Receipt</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {ledger.map(({ render: r, brandName, receiptId }) => (
                      <tr key={r.id}>
                        <td className="py-2">{day(r.createdAt)}</td>
                        <td>{brandName}</td>
                        <td className="tnum">
                          {usd(r.amountCents)} <Badge tone={toneOf(r.status)}>{r.status === "rejected" ? "refunded" : r.status.replace("_", " ")}</Badge>
                        </td>
                        <td className="tnum font-semibold">{r.status === "accepted" ? usd(r.creatorPayoutCents) : "–"}</td>
                        <td>
                          <Mono>{r.payoutBatchId ? `payout ${short(r.payoutBatchId)}` : r.refundId ? `refund ${short(r.refundId)}` : `capture ${short(r.captureId)}`}</Mono>
                        </td>
                        <td>{receiptId ? <Link href={`/verify/${receiptId}`} className="text-brand underline">view</Link> : "–"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
