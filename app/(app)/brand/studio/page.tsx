import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandAgent } from "@/components/agent/BrandAgent";
import { btnClass } from "@/components/ds";
import { Banner, Empty, Fact, Monogram, OUTLINE, Panel, Stat, StatsRow, SURFACE, SyntheticBadge } from "@/components/dashboard/kit";
import { isSynthetic } from "@/lib/personas";
import { geminiConfigured } from "@/lib/ai/gemini";
import { RenderCard } from "@/components/dashboard/RenderCard";
import { usd } from "@/components/dashboard/shared";
import { chipClass, Field, inputClass } from "@/components/ui";
import { engineDeps, settle } from "@/lib/engine";
import { brandRenders, brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "@/app/notice";
import Loading from "../../loading";
import { ethVideoSeconds } from "@/lib/ai/eth";
import { acceptRender, approveRender, declineRender, rejectRender, startRender } from "./actions";
import { PromptPreview } from "./prompt-preview";
import { Countdown } from "./countdown";

export default function StudioPage(props: PageProps<"/brand/studio">) {
  return (
    <Suspense fallback={<Loading />}>
      <Studio {...props} />
    </Suspense>
  );
}

async function Studio({ searchParams }: PageProps<"/brand/studio">) {
  const s = await getSession();
  if (!s) redirect("/");
  await settle(engineDeps()).catch(() => []);
  const q = await searchParams;
  const [{ brand, mandate: m, wallet, licences, spentToday }, renders] = await Promise.all([brandView(s.brandId), brandRenders(s.brandId)]);
  // RENDER_PROVIDER=eth: likeness-eth's pipeline (a video makes its own opening still; the exact prompt is shown).
  const eth = process.env.RENDER_PROVIDER === "eth";
  const ai = eth || process.env.RENDER_PROVIDER === "gemini";
  const active = licences.filter((l) => l.state === "active");
  const ready = !!wallet && !!m && active.length > 0;

  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-[18px] px-4 pb-12 pt-6 sm:px-8">
      <Banner
        label="Studio"
        visual={<Monogram name={brand.name} />}
        title="Studio"
        sub="Each ad is checked against the licence and your mandate, authorized on your saved PayPal wallet, rendered, checked and captured. Then accept (the creator is paid 90%) or reject (you're refunded)."
        actions={
          <Link href="/brand" className={OUTLINE}>
            Brand settings
          </Link>
        }
      />
      <Notice ok={q.ok} error={q.error} />

      {geminiConfigured() && (
        <Panel tone="lime" title="Brief your agent" label="Brief your agent">
          <BrandAgent />
        </Panel>
      )}

      {m && (
        <StatsRow label="Your mandate">
          <Stat accent label="Spent" value={usd(m.spentCents)} note={`of ${usd(m.totalBudgetCents)} budget`} />
          <Stat label="Today" value={usd(spentToday)} note={`of ${usd(m.dailyCapCents)} daily cap`} />
          <Stat label="Max per ad" value={usd(m.maxPerRenderCents)} note="mandate limit" />
          <Stat label="Step-up above" value={usd(m.stepUpThresholdCents)} note="you approve these first" />
          <Stat label="Ads" value={renders.length} note={`${renders.filter((x) => x.render.status === "in_review").length} in review`} />
        </StatsRow>
      )}

      <div className="grid grid-cols-1 items-start gap-[18px] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Panel title={`Your ads${renders.length ? ` (${renders.length})` : ""}`}>
          {renders.length === 0 ? (
            <Empty>No ads yet. Ask the agent or use the form: each ad shows up here with its PayPal order, capture and payout or refund.</Empty>
          ) : (
            <div className="flex flex-col gap-3">
              {renders.map(({ render: r, receiptId, creatorName, creatorPhoto, refusal }) => (
                <div key={r.id} className={`${SURFACE} flex flex-col gap-2 p-2`}>
                  {isSynthetic(creatorPhoto) && <SyntheticBadge className="mx-2 mt-1" />}
                  <RenderCard
                    r={r}
                    mode="brand"
                    name={creatorName}
                    receiptId={receiptId}
                    refusal={refusal}
                    actions={
                      r.status === "in_review" && r.reviewDeadline ? (
                        <>
                          <form action={acceptRender.bind(null, r.id)}>
                            <button className={btnClass("lime", "cursor-pointer")}>Accept</button>
                          </form>
                          <form action={rejectRender.bind(null, r.id)}>
                            <button className={btnClass("danger", "cursor-pointer")}>Reject</button>
                          </form>
                          <Countdown deadline={r.reviewDeadline.toISOString()} />
                        </>
                      ) : r.status === "needs_brand_approval" ? (
                        <>
                          <form action={approveRender.bind(null, r.id)}>
                            <button className={btnClass("lime", "cursor-pointer")}>Approve {usd(r.amountCents)}</button>
                          </form>
                          <form action={declineRender.bind(null, r.id)}>
                            <button className={btnClass("outline", "cursor-pointer")}>Decline</button>
                          </form>
                        </>
                      ) : undefined
                    }
                  />
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="flex min-w-0 flex-col gap-[18px]">
        <Panel tone="surface" title="Make an ad with the form">
          {!wallet || !m ? (
            <p className="m-0 text-[14px] text-wait">
              {!wallet ? "Save your PayPal wallet" : "Save a mandate"} on the{" "}
              <Link href="/brand" className="font-semibold text-ink underline">
                brand page
              </Link>{" "}
              first.
            </p>
          ) : active.length === 0 ? (
            <p className="m-0 text-[14px] text-wait">
              No active licence. Request one on the{" "}
              <Link href="/brand" className="font-semibold text-ink underline">
                brand page
              </Link>{" "}
              and approve it as the Creator.
            </p>
          ) : null}
          <form id="render-form" action={startRender} className="flex flex-col gap-3">
            <Field label="Licence and use">
              <select name="licenceUse" className={inputClass} required>
                {licences
                  .filter((l) => l.state !== "pending" && l.state !== "declined")
                  .flatMap((l) =>
                    l.allowedUses.map((u) => (
                      <option key={`${l.id}|${u}`} value={`${l.id}|${u}`}>
                        {l.creatorName}
                        {isSynthetic(l.creatorPhoto) ? " (synthetic creator)" : ""} · {u} · {l.state} · {l.rendersUsed}/{l.renderCap}
                        {l.videoMultiplier > 0 ? "" : " · images only"}
                      </option>
                    )),
                  )}
              </select>
            </Field>
            <Field label="Kind" group>
              <div className="flex flex-wrap gap-2">
                {(["image", "video"] as const).map((k) => (
                  <label key={k} className={chipClass}>
                    <input type="radio" name="kind" value={k} defaultChecked={k === "image"} className="h-4 w-4 accent-lime" />
                    {k}
                  </label>
                ))}
              </div>
            </Field>
            {!eth && (
            <Field label="Video starts from" hint="A video's first frame is one of your generated ad images under the same licence (not the raw photo).">
              <select name="fromRenderId" className={inputClass} defaultValue="">
                <option value="">(images: not used)</option>
                {renders
                  .filter(({ render: r }) => r.kind === "image" && r.outputRef?.startsWith("/media/") && !!r.captureId)
                  .map(({ render: r }) => (
                    <option key={r.id} value={r.id}>
                      Image of {r.createdAt.toISOString().slice(0, 16).replace("T", " ")} · &ldquo;{r.prompt.slice(0, 40)}&rdquo;
                    </option>
                  ))}
              </select>
            </Field>
            )}
            <Field label="Prompt">
              <textarea name="prompt" rows={3} defaultValue="Rohit holding our cold brew on a sunny morning, warm light, clean background" className={inputClass} />
            </Field>
            {eth && <PromptPreview formId="render-form" seconds={ethVideoSeconds()} />}
            <button className={btnClass("lime", "cursor-pointer self-start")} disabled={!ready}>
              Render
            </button>
            <p className="m-0 text-[13px] text-grey">
              {eth
                ? `AI renders on the Gemini API with likeness-eth's pipeline: the face is checked and regenerated once if it doesn't match; a video is ${ethVideoSeconds()} s at 16:9 from its own opening still. Over the AI caps a labelled demo stands in.`
                : ai
                  ? "AI renders on the Gemini API, within the AI caps; over a cap a labelled demo stands in."
                  : "Demo renders come from pre-generated images (no AI call, no cost)."}{" "}
              The PayPal calls are real sandbox calls.
            </p>
          </form>
        </Panel>

        {m && (
          <Panel tone="ink" title="Your mandate">
            <dl className="m-0 grid grid-cols-2 gap-3 text-[13px]">
              <Fact label="Status" value={m.status.replace("_", " ")} />
              <Fact label="Wallet" value={wallet ? (wallet.kind === "demo" ? "demo wallet" : "saved") : "not saved"} />
              <Fact label="Budget left" value={usd(Math.max(0, m.totalBudgetCents - m.spentCents))} />
              <Fact label="Expires" value={m.expiresAt.toISOString().slice(0, 10)} />
            </dl>
            <p className="m-0 text-[13px] text-grey-dark">Ads above the step-up threshold wait for your approval; anything past a limit is refused before PayPal is called.</p>
          </Panel>
        )}
        </div>
      </div>
    </div>
  );
}
