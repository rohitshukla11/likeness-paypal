/**
 * The brand's dashboard, in the layout of likeness-eth (FaceVisa)'s BrandAgentConsole: a banner with the brand's
 * monogram and status chips, the numbers, the one-time setup (lime: the PayPal wallet and the mandate), licences, and
 * the spend table with PayPal ids. Server component; the Save PayPal wallet button is the one client island.
 * FaceVisa's chain parts (wallet connect, tokens, gas, tx hashes, World ID, Arkiv) are replaced by PayPal Vault and ids.
 */
import Link from "next/link";
import { attachDemoWallet, requestLicence, saveMandate } from "@/app/(app)/brand/actions";
import { WalletButton } from "@/app/(app)/brand/wallet-button";
import { btnClass, CreatorFace, StatusPill } from "@/components/ds";
import { PayPalId, renderPill, STATUS_LABEL, usd, when } from "@/components/dashboard/shared";
import { chipClass, Field, fmtDay, inputClass, StatusBadge } from "@/components/ui";
import type { brandRenders, brandView } from "@/lib/queries";
import { IconSearch } from "@/components/ds/icons";
import { isSynthetic, portraitUrl, SHARED_PAYOUT_NOTE } from "@/lib/personas";
import { Banner, CHIP, Empty, Fact, MUTED, Monogram, OUTLINE, Panel, Stat, StatsRow, SURFACE, SyntheticBadge } from "./kit";

type View = Awaited<ReturnType<typeof brandView>>;
type Renders = Awaited<ReturnType<typeof brandRenders>>;

export function BrandHome({ v, renders, notice, demoWallet, picked }: { v: View; renders: Renders; notice?: React.ReactNode; demoWallet: boolean; picked?: string | null }) {
  const { brand, mandate: m, wallet, creators, licences, spentToday } = v;
  // The request form's creator: the one picked on a card, else the first one this brand has no licence or request with.
  const open = (id: string) => v.cards.find((c) => c.id === id)?.licence === "not_yet";
  const req = creators.find((c) => c.id === picked) ?? creators.find((c) => open(c.id)) ?? null;
  const active = licences.filter((l) => l.state === "active");
  const charged = renders.filter((x) => x.render.captureId);
  const refunded = charged.filter((x) => x.render.refundId).reduce((t, x) => t + x.render.amountCents, 0);
  const walletPill = wallet ? (wallet.kind === "demo" ? <StatusPill kind="waiting" title="A shared sandbox buyer wallet">Demo wallet</StatusPill> : <StatusPill kind="licensed">Saved</StatusPill>) : <StatusPill kind="lime">Not saved</StatusPill>;
  const mandatePill = m ? <StatusPill kind={m.status === "active" ? "licensed" : m.status === "pending_wallet" ? "waiting" : "revoked"}>{m.status.replace("_", " ")}</StatusPill> : <StatusPill kind="neutral">None yet</StatusPill>;

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-[18px] px-4 pb-12 pt-6 sm:px-8">
      <Banner
        label="Your brand workspace"
        visual={<Monogram name={brand.name} />}
        title={brand.name}
        sub="Approve once: a mandate with your spending limits, and your PayPal wallet saved for pay-per-render. Then license a creator and make ads in the Studio."
        chips={
          <>
            <span className={`${CHIP} bg-paper text-ink`}>PayPal wallet: {wallet ? (wallet.kind === "demo" ? "demo wallet" : "saved") : "not saved"}</span>
            <span className={`${CHIP} bg-paper text-ink`}>Mandate: {m ? m.status.replace("_", " ") : "none yet"}</span>
            <span className={`${CHIP} bg-violet-soft text-wait`}>
              {active.length} active licence{active.length === 1 ? "" : "s"}
            </span>
          </>
        }
        actions={
          <>
            <Link href="/creators" className={btnClass("lime", "gap-2")}>
              <IconSearch size={18} />
              Find creators
            </Link>
            <Link href="/brand/studio" className={OUTLINE}>
              Open Studio
            </Link>
          </>
        }
      />

      {notice}

      <StatsRow>
        <Stat accent label="Spent" value={m ? usd(m.spentCents) : "–"} note={m ? `of ${usd(m.totalBudgetCents)} budget` : "no mandate yet"} />
        <Stat label="Today" value={m ? usd(spentToday) : "–"} note={m ? `of ${usd(m.dailyCapCents)} daily cap` : undefined} />
        <Stat label="Budget left" value={m ? usd(Math.max(0, m.totalBudgetCents - m.spentCents)) : "–"} />
        <Stat label="Refunded" value={usd(refunded)} note="rejected ads" />
        <Stat label="Licences" value={active.length} note={`${licences.filter((l) => l.state === "pending").length} waiting for the creator`} />
      </StatsRow>

      <Panel tone={wallet && m?.status === "active" ? "plain" : "lime"} title="Set up once">
        <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-2">
          <section className={`${SURFACE} flex min-w-0 flex-col gap-3 p-5`} aria-label="PayPal wallet">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[18px] font-bold">1. PayPal wallet</h3>
              {walletPill}
            </div>
            {wallet ? (
              <dl className="m-0 grid grid-cols-1 gap-2 text-[13px] sm:grid-cols-3">
                <Fact label="Account" value={wallet.kind === "demo" ? "Demo wallet (sandbox)" : (wallet.payerEmail ?? "PayPal account")} />
                <Fact label="Vault id" value={<PayPalId id={wallet.paymentTokenId} />} />
                <Fact label="Saved" value={fmtDay(wallet.createdAt)} />
              </dl>
            ) : (
              <>
                <p className="m-0 text-[14px]">Save a PayPal wallet once. Each licensed ad is authorized on it, and captured only when it renders and passes its checks.</p>
                <WalletButton />
                {demoWallet && (
                  <form action={attachDemoWallet} className="flex flex-wrap items-center gap-3 border-t border-divider pt-3">
                    <button className={OUTLINE}>Use demo wallet</button>
                    <span className={`text-[13px] ${MUTED}`}>No sandbox login? Use a shared sandbox buyer wallet instead.</span>
                  </form>
                )}
              </>
            )}
            <span className={`text-[12px] ${MUTED}`}>PayPal Vault, usage UNSCHEDULED_POSTPAID: charged per ad, never in advance.</span>
          </section>

          <section className={`${SURFACE} flex min-w-0 flex-col gap-3 p-5`} aria-label="Mandate">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="m-0 text-[18px] font-bold">2. Mandate</h3>
              {mandatePill}
            </div>
            {m && (
              <p className={`m-0 text-[13px] ${MUTED}`}>
                Max {usd(m.maxPerRenderCents)} per ad · step-up above {usd(m.stepUpThresholdCents)} · expires {fmtDay(m.expiresAt)}
              </p>
            )}
            <form action={saveMandate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Max per render ($)">
                <input name="perRender" type="number" min="0.5" step="0.01" defaultValue={((m?.maxPerRenderCents ?? 1000) / 100).toFixed(2)} className={inputClass} />
              </Field>
              <Field label="Daily cap ($)">
                <input name="daily" type="number" min="0.5" step="0.01" defaultValue={((m?.dailyCapCents ?? 2000) / 100).toFixed(2)} className={inputClass} />
              </Field>
              <Field label="Total budget ($)">
                <input name="budget" type="number" min="0.5" step="0.01" defaultValue={((m?.totalBudgetCents ?? 5000) / 100).toFixed(2)} className={inputClass} />
              </Field>
              <Field label="Step-up above ($)" hint="Renders above this wait for your approval">
                <input name="stepUp" type="number" min="0" step="0.01" defaultValue={((m?.stepUpThresholdCents ?? 500) / 100).toFixed(2)} className={inputClass} />
              </Field>
              <Field label="Valid for (days)">
                <input name="days" type="number" min="1" max="365" defaultValue={30} className={inputClass} />
              </Field>
              <div className="flex items-end">
                <button className={btnClass("ink", "w-full cursor-pointer")}>{m ? "Update mandate" : "Save mandate"}</button>
              </div>
            </form>
          </section>
        </div>
      </Panel>

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
        <Panel tone="surface" title="Request a licence" id="request">
          {!req ? (
            <Empty>Every creator here is already licensed or asked: see Licences.</Empty>
          ) : (
            <form key={req.id} action={requestLicence} className="flex flex-col gap-3">
              <input type="hidden" name="creatorId" value={req.id} />
              <div className="flex items-center gap-3">
                <CreatorFace seed={req.id} photo={portraitUrl(req.photoRef) ?? "/demo/rohit.svg"} size={56} />
                <div className="min-w-0 text-[14px]">
                  <p className="m-0 font-semibold">{req.name}</p>
                  <p className={`m-0 ${MUTED}`}>
                    {usd(req.pricePerRenderCents)} per image · {req.videoMultiplier > 0 ? `${usd(req.pricePerRenderCents * req.videoMultiplier)} per video` : "images only"} · up to {req.maxRendersPerLicence} renders, {req.maxDays} days
                  </p>
                </div>
              </div>
              {isSynthetic(req.photoRef) && <SyntheticBadge />}
              {creators.length > 1 && <p className={`m-0 text-[13px] ${MUTED}`}>Pick another creator on the <Link href="/creators" className="font-semibold text-ink underline">Creators</Link> page.</p>}
              <Field label="Uses" group>
                <div className="flex flex-wrap gap-2">
                  {req.allowedUses.map((u) => (
                    <label key={u} className={chipClass}>
                      <input type="checkbox" name="uses" value={u} defaultChecked={u === "advertising" || req.allowedUses.length === 1} className="h-4 w-4 accent-lime" />
                      {u}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Renders">
                  <input name="renderCap" type="number" min="1" max={req.maxRendersPerLicence} defaultValue={Math.min(5, req.maxRendersPerLicence)} className={inputClass} />
                </Field>
                <Field label="Days">
                  <input name="days" type="number" min="1" max={req.maxDays} defaultValue={Math.min(14, req.maxDays)} className={inputClass} />
                </Field>
              </div>
              <Field label="Campaign brief">
                <textarea name="brief" rows={2} minLength={10} maxLength={600} defaultValue="Spring launch: three social ads for our new cold brew." className={inputClass} />
              </Field>
              <button className={btnClass("lime", "cursor-pointer self-start")} disabled={!req.acceptingLicences}>
                Send request to {req.name.split(" ")[0]}
              </button>
            </form>
          )}
        </Panel>

        <Panel title={`Licences${licences.length ? ` (${licences.length})` : ""}`}>
          {licences.length === 0 ? (
            <Empty>No licences yet. Send a request, then approve it as the Creator.</Empty>
          ) : (
            <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2">
              {licences.map((l) => (
                <li key={l.id} className={`${SURFACE} flex min-w-0 flex-col gap-2 p-4`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="truncate text-[16px]">{l.creatorName}</b>
                    <StatusBadge status={l.state} />
                  </div>
                  {isSynthetic(l.creatorPhoto) && <SyntheticBadge />}
                  <dl className="m-0 grid grid-cols-3 gap-2 text-[13px]">
                    <Fact label="Uses" value={l.allowedUses.join(", ")} />
                    <Fact label="Renders" value={`${l.rendersUsed} of ${l.renderCap}`} />
                    <Fact label="Until" value={l.expiresAt ? fmtDay(l.expiresAt) : "–"} />
                  </dl>
                  <span className={`text-[13px] ${MUTED}`}>
                    {usd(l.pricePerRenderCents)} per image · {l.videoMultiplier > 0 ? `video ${l.videoMultiplier}×` : "images only"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel tone="surface" title="Spend" action={<span className={`text-[13px] ${MUTED}`}>every ad charged to your wallet</span>}>
        {charged.length === 0 ? (
          <Empty>Nothing charged yet. Ads you make in the Studio show up here with their PayPal capture and payout or refund.</Empty>
        ) : (
          <div className="relative -mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead className={`text-[13px] ${MUTED}`}>
                <tr>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="pr-3 font-medium">Creator</th>
                  <th className="pr-3 font-medium">Amount</th>
                  <th className="pr-3 font-medium">Status</th>
                  <th className="pr-3 font-medium">Capture</th>
                  <th className="pr-3 font-medium">Payout / refund</th>
                  <th className="font-medium">Receipt</th>
                </tr>
              </thead>
              <tbody>
                {charged.map(({ render: r, creatorName, creatorPhoto, receiptId }) => (
                  <tr key={r.id} className="border-t border-divider">
                    <td className="py-2.5 pr-3 whitespace-nowrap">{when(r.createdAt)}</td>
                    <td className="pr-3">{creatorName}</td>
                    <td className="tnum pr-3 font-semibold">{usd(r.amountCents)}</td>
                    <td className="pr-3">
                      <StatusPill kind={renderPill(r.status)}>{STATUS_LABEL[r.status] ?? r.status}</StatusPill>
                    </td>
                    <td className="pr-3">
                      <PayPalId id={r.captureId} />
                    </td>
                    <td className="pr-3">
                      {r.payoutBatchId ? <PayPalId id={r.payoutBatchId} /> : r.refundId ? <PayPalId id={r.refundId} /> : <span className={MUTED}>–</span>}
                      {r.payoutBatchId && isSynthetic(creatorPhoto) && <span className={`block text-[11px] ${MUTED}`}>{SHARED_PAYOUT_NOTE}</span>}
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
    </div>
  );
}
