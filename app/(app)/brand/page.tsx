import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppPage, btnClass, Card, CreatorFace, StatCard, StatusPill } from "@/components/ds";
import { PayPalId, renderPill, STATUS_LABEL, usd, when } from "@/components/dashboard/shared";
import { chipClass, Field, fmtDay, inputClass, StatusBadge } from "@/components/ui";
import { brandRenders, brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { demoWalletAvailable } from "@/lib/wallet";
import { Notice } from "@/app/notice";
import Loading from "../loading";
import { attachDemoWallet, requestLicence, saveMandate } from "./actions";
import { WalletButton } from "./wallet-button";

export default function BrandPage(props: PageProps<"/brand">) {
  return (
    <Suspense fallback={<Loading />}>
      <Brand {...props} />
    </Suspense>
  );
}

async function Brand({ searchParams }: PageProps<"/brand">) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  const [{ brand, mandate: m, wallet, creators, licences, spentToday }, renders] = await Promise.all([brandView(s.brandId), brandRenders(s.brandId)]);
  const active = licences.filter((l) => l.state === "active");
  const charged = renders.filter((x) => x.render.captureId);
  const refunded = charged.filter((x) => x.render.refundId).reduce((t, x) => t + x.render.amountCents, 0);

  return (
    <AppPage
      title={brand.name}
      description="Approve once: a mandate with your spending limits, and your PayPal wallet saved for pay-per-render. Then license a creator and render ads in the Studio."
      actions={
        <Link href="/brand/studio" className={btnClass("lime")}>
          Open Studio{active.length ? ` (${active.length} licence${active.length === 1 ? "" : "s"})` : ""}
        </Link>
      }
    >
      <Notice ok={q.ok} error={q.error} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Spent" value={m ? usd(m.spentCents) : "–"} note={m ? `of ${usd(m.totalBudgetCents)} budget` : "no mandate yet"} />
        <StatCard label="Today" value={m ? usd(spentToday) : "–"} note={m ? `of ${usd(m.dailyCapCents)} daily cap` : "no mandate yet"} />
        <StatCard label="Refunded" value={usd(refunded)} note="rejected ads" />
        <StatCard label="Active licences" value={active.length} note={`${licences.filter((l) => l.state === "pending").length} waiting for the creator`} />
      </div>

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-2">
        <Card
          title="1. PayPal wallet"
          tone={wallet ? "white" : "lime"}
          action={
            wallet ? (
              wallet.kind === "demo" ? (
                <StatusPill kind="waiting" title="A shared sandbox buyer wallet">Demo wallet</StatusPill>
              ) : (
                <StatusPill kind="licensed">Saved</StatusPill>
              )
            ) : (
              <StatusPill kind="lime">Not saved</StatusPill>
            )
          }
        >
          {wallet ? (
            <div className="flex flex-col gap-1 text-[14px]">
              <p className="m-0">
                <b>{wallet.kind === "demo" ? "Demo wallet (shared sandbox buyer)" : (wallet.payerEmail ?? "PayPal account")}</b> is saved for pay-per-render.
              </p>
              <p className="m-0 text-grey">
                Vault id <PayPalId id={wallet.paymentTokenId} /> · usage UNSCHEDULED_POSTPAID · saved {fmtDay(wallet.createdAt)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="m-0 text-[14px]">Save a PayPal wallet once. Each licensed ad is authorized on it, and captured only when it renders and passes its checks.</p>
              <WalletButton />
              {demoWalletAvailable() && (
                <form action={attachDemoWallet} className="flex flex-wrap items-center gap-3 border-t border-ink/15 pt-3">
                  <button className={btnClass("outline-dark", "cursor-pointer")}>Use demo wallet</button>
                  <span className="text-[13px]">No sandbox login? Use a shared sandbox buyer wallet instead.</span>
                </form>
              )}
            </div>
          )}
        </Card>

        <Card title="2. Mandate" action={m ? <StatusPill kind={m.status === "active" ? "licensed" : m.status === "pending_wallet" ? "waiting" : "revoked"}>{m.status.replace("_", " ")}</StatusPill> : <StatusPill kind="neutral">None yet</StatusPill>}>
          {m && (
            <p className="m-0 text-[14px] text-grey">
              Max {usd(m.maxPerRenderCents)} per render · step-up above {usd(m.stepUpThresholdCents)} · expires {fmtDay(m.expiresAt)}
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
        </Card>

        <Card title="3. Request a licence">
          {creators.map((c) => (
            <form key={c.id} action={requestLicence} className="flex flex-col gap-3">
              <input type="hidden" name="creatorId" value={c.id} />
              <div className="flex items-center gap-3">
                <CreatorFace seed={c.id} photo={c.photoRef ?? "/demo/rohit.svg"} size={56} />
                <div className="min-w-0 text-[14px]">
                  <p className="m-0 font-semibold">{c.name}</p>
                  <p className="m-0 text-grey">
                    {usd(c.pricePerRenderCents)} per image · {usd(c.pricePerRenderCents * c.videoMultiplier)} per video · up to {c.maxRendersPerLicence} renders, {c.maxDays} days
                  </p>
                </div>
              </div>
              <Field label="Uses" group>
                <div className="flex flex-wrap gap-2">
                  {c.allowedUses.map((u) => (
                    <label key={u} className={chipClass}>
                      <input type="checkbox" name="uses" value={u} defaultChecked={u === "advertising"} className="h-4 w-4 accent-lime" />
                      {u}
                    </label>
                  ))}
                </div>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Renders">
                  <input name="renderCap" type="number" min="1" max={c.maxRendersPerLicence} defaultValue={Math.min(5, c.maxRendersPerLicence)} className={inputClass} />
                </Field>
                <Field label="Days">
                  <input name="days" type="number" min="1" max={c.maxDays} defaultValue={Math.min(14, c.maxDays)} className={inputClass} />
                </Field>
              </div>
              <Field label="Campaign brief">
                <textarea name="brief" rows={2} minLength={10} maxLength={600} defaultValue="Spring launch: three social ads for our new cold brew." className={inputClass} />
              </Field>
              <button className={btnClass("lime", "cursor-pointer self-start")} disabled={!c.acceptingLicences}>
                Send request
              </button>
            </form>
          ))}
        </Card>

        <Card title="Licences">
          {licences.length === 0 ? (
            <p className="m-0 text-grey">No licences yet. Send a request, then approve it as the Creator.</p>
          ) : (
            licences.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3 border-b border-divider py-2 text-[14px] last:border-0">
                <StatusBadge status={l.state} />
                <span className="font-semibold">{l.creatorName}</span>
                <span className="text-grey">
                  {l.allowedUses.join(", ")} · {l.rendersUsed}/{l.renderCap} renders · {usd(l.pricePerRenderCents)}/render{l.expiresAt ? ` · until ${fmtDay(l.expiresAt)}` : ""}
                </span>
              </div>
            ))
          )}
        </Card>
      </div>

      <Card title="Spend" action={<span className="text-[13px] text-grey">every ad charged to your wallet</span>}>
        {charged.length === 0 ? (
          <p className="m-0 text-grey">Nothing charged yet. Ads you render in the Studio show up here with their PayPal capture and payout or refund.</p>
        ) : (
          <div className="-mx-1 overflow-x-auto px-1">
            <table className="w-full min-w-[640px] border-collapse text-left text-[14px]">
              <thead className="text-[13px] text-grey">
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
                {charged.map(({ render: r, creatorName, receiptId }) => (
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
                    <td className="pr-3">{r.payoutBatchId ? <PayPalId id={r.payoutBatchId} /> : r.refundId ? <PayPalId id={r.refundId} /> : <span className="text-grey">–</span>}</td>
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
