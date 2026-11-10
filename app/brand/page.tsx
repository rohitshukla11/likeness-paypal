import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "../notice";
import { Badge, btn, Card, day, Empty, Field, input, Mono, PageTitle, short, Stat, toneOf, usd } from "../ui";
import { demoWalletAvailable } from "@/lib/wallet";
import { attachDemoWallet, requestLicence, saveMandate } from "./actions";
import { WalletButton } from "./wallet-button";

export default function BrandPage(props: PageProps<"/brand">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Loading your brand…</p>}>
      <Brand {...props} />
    </Suspense>
  );
}

async function Brand({ searchParams }: PageProps<"/brand">) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  const { brand, mandate: m, wallet, creators, licences, spentToday } = await brandView(s.brandId);
  const active = licences.filter((l) => l.state === "active");

  return (
    <>
      <PageTitle title={brand.name} sub="Approve once: a mandate with your spending limits, and your PayPal wallet saved for pay-per-render. Then license a creator and render ads in the Studio.">
        <Link href="/brand/studio" className={btn.primary}>
          Open Studio{active.length ? ` (${active.length} licence${active.length === 1 ? "" : "s"})` : ""}
        </Link>
      </PageTitle>
      <Notice ok={q.ok} error={q.error} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="1. PayPal wallet" action={wallet ? <Badge tone="good">saved</Badge> : <Badge tone="warn">not saved</Badge>}>
          {wallet ? (
            <div className="text-sm">
              <p>
                <span className="font-semibold">{wallet.kind === "demo" ? "Demo wallet (shared sandbox buyer)" : (wallet.payerEmail ?? "PayPal account")}</span> is saved for pay-per-render.
              </p>
              <p className="mt-1 text-muted">
                Vault id <Mono>{short(wallet.paymentTokenId)}</Mono> · usage UNSCHEDULED_POSTPAID · saved {day(wallet.createdAt)}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <WalletButton />
              {demoWalletAvailable() && (
                <form action={attachDemoWallet} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                  <button className={btn.ghost}>Use demo wallet</button>
                  <span className="text-xs text-muted">No sandbox login? Use a shared sandbox buyer wallet instead.</span>
                </form>
              )}
            </div>
          )}
        </Card>

        <Card title="2. Mandate" action={m ? <Badge tone={toneOf(m.status)}>{m.status.replace("_", " ")}</Badge> : <Badge>none yet</Badge>}>
          {m && (
            <div className="mb-3 grid grid-cols-3 gap-2">
              <Stat label="Spent" value={usd(m.spentCents)} sub={`of ${usd(m.totalBudgetCents)}`} />
              <Stat label="Today" value={usd(spentToday)} sub={`of ${usd(m.dailyCapCents)}`} />
              <Stat label="Expires" value={day(m.expiresAt)} />
            </div>
          )}
          <form action={saveMandate} className="grid grid-cols-2 gap-3">
            <Field label="Max per render ($)">
              <input name="perRender" type="number" min="0.5" step="0.01" defaultValue={((m?.maxPerRenderCents ?? 1000) / 100).toFixed(2)} className={input} />
            </Field>
            <Field label="Daily cap ($)">
              <input name="daily" type="number" min="0.5" step="0.01" defaultValue={((m?.dailyCapCents ?? 2000) / 100).toFixed(2)} className={input} />
            </Field>
            <Field label="Total budget ($)">
              <input name="budget" type="number" min="0.5" step="0.01" defaultValue={((m?.totalBudgetCents ?? 5000) / 100).toFixed(2)} className={input} />
            </Field>
            <Field label="Step-up above ($)" hint="Renders above this wait for your approval">
              <input name="stepUp" type="number" min="0" step="0.01" defaultValue={((m?.stepUpThresholdCents ?? 500) / 100).toFixed(2)} className={input} />
            </Field>
            <Field label="Valid for (days)">
              <input name="days" type="number" min="1" max="365" defaultValue={30} className={input} />
            </Field>
            <div className="flex items-end">
              <button className={`${btn.dark} w-full`}>{m ? "Update mandate" : "Save mandate"}</button>
            </div>
          </form>
        </Card>

        <Card title="3. Request a licence">
          {creators.map((c) => (
            <form key={c.id} action={requestLicence} className="flex flex-col gap-3">
              <input type="hidden" name="creatorId" value={c.id} />
              <div className="flex items-center gap-3">
                <Image src={c.photoRef ?? "/demo/rohit.svg"} alt="" width={48} height={60} className="h-14 w-12 rounded-lg object-cover" />
                <div className="text-sm">
                  <p className="font-semibold">{c.name}</p>
                  <p className="text-muted">
                    {usd(c.pricePerRenderCents)} per image · {usd(c.pricePerRenderCents * c.videoMultiplier)} per video · up to {c.maxRendersPerLicence} renders, {c.maxDays} days
                  </p>
                </div>
              </div>
              <fieldset className="flex flex-wrap gap-2 text-sm">
                <legend className="mb-1 font-medium">Uses</legend>
                {c.allowedUses.map((u) => (
                  <label key={u} className="flex items-center gap-1.5 rounded-lg border border-line px-2.5 py-1.5">
                    <input type="checkbox" name="uses" value={u} defaultChecked={u === "advertising"} className="accent-brand" />
                    {u}
                  </label>
                ))}
              </fieldset>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Renders">
                  <input name="renderCap" type="number" min="1" max={c.maxRendersPerLicence} defaultValue={Math.min(5, c.maxRendersPerLicence)} className={input} />
                </Field>
                <Field label="Days">
                  <input name="days" type="number" min="1" max={c.maxDays} defaultValue={Math.min(14, c.maxDays)} className={input} />
                </Field>
              </div>
              <Field label="Campaign brief">
                <textarea name="brief" rows={2} minLength={10} maxLength={600} defaultValue="Spring launch: three social ads for our new cold brew." className={input} />
              </Field>
              <button className={`${btn.primary} self-start`} disabled={!c.acceptingLicences}>
                Send request
              </button>
            </form>
          ))}
        </Card>

        <Card title="Licences">
          {licences.length === 0 ? (
            <Empty>No licences yet. Send a request, then approve it as the Creator.</Empty>
          ) : (
            <ul className="flex flex-col divide-y divide-line">
              {licences.map((l) => (
                <li key={l.id} className="py-2.5 text-sm">
                  <p className="font-semibold">
                    {l.creatorName} <Badge tone={toneOf(l.state)}>{l.state}</Badge>
                  </p>
                  <p className="text-muted">
                    {l.allowedUses.join(", ")} · {l.rendersUsed}/{l.renderCap} renders · {usd(l.pricePerRenderCents)}/render{l.expiresAt ? ` · until ${day(l.expiresAt)}` : ""}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  );
}
