import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppPage, btnClass, Card, StatCard } from "@/components/ds";
import { RenderCard } from "@/components/dashboard/RenderCard";
import { usd } from "@/components/dashboard/shared";
import { chipClass, Field, inputClass } from "@/components/ui";
import { engineDeps, settle } from "@/lib/engine";
import { brandRenders, brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "@/app/notice";
import Loading from "../../loading";
import { acceptRender, approveRender, declineRender, rejectRender, startRender } from "./actions";
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
  const [{ mandate: m, wallet, licences, spentToday }, renders] = await Promise.all([brandView(s.brandId), brandRenders(s.brandId)]);
  const active = licences.filter((l) => l.state === "active");
  const ready = !!wallet && !!m && active.length > 0;

  return (
    <AppPage
      title="Studio"
      description="Each render is checked against the licence and your mandate, authorized on your saved PayPal wallet, rendered, checked and captured. Then accept (the creator is paid 90%) or reject (you're refunded)."
      actions={
        <Link href="/brand" className={btnClass("outline")}>
          Brand settings
        </Link>
      }
    >
      <Notice ok={q.ok} error={q.error} />

      {m && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Spent" value={usd(m.spentCents)} note={`of ${usd(m.totalBudgetCents)} budget`} />
          <StatCard label="Today" value={usd(spentToday)} note={`of ${usd(m.dailyCapCents)} daily cap`} />
          <StatCard label="Max per render" value={usd(m.maxPerRenderCents)} note="mandate limit" />
          <StatCard label="Step-up above" value={usd(m.stepUpThresholdCents)} note="you approve these first" />
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-[18px] desk:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <Card title="New render">
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
          <form action={startRender} className="flex flex-col gap-3">
            <Field label="Licence and use">
              <select name="licenceUse" className={inputClass} required>
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
            <Field label="Prompt">
              <textarea name="prompt" rows={3} defaultValue="Rohit holding our cold brew on a sunny morning, warm light, clean background" className={inputClass} />
            </Field>
            <button className={btnClass("lime", "cursor-pointer self-start")} disabled={!ready}>
              Render
            </button>
            <p className="m-0 text-[13px] text-grey">Demo renders come from pre-generated images (no AI call, no cost). The PayPal calls are real sandbox calls.</p>
          </form>
        </Card>

        <Card title={`Your renders${renders.length ? ` (${renders.length})` : ""}`}>
          {renders.length === 0 ? (
            <p className="m-0 text-grey">No renders yet. Render an ad: it shows up here with its PayPal order, capture and payout or refund.</p>
          ) : (
            renders.map(({ render: r, receiptId, creatorName, refusal }) => (
              <RenderCard
                key={r.id}
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
            ))
          )}
        </Card>
      </div>
    </AppPage>
  );
}
