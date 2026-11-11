import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AppPage, btnClass, Card, ErrorCard, Skeleton, StatusPill } from "@/components/ds";
import { IconCheck } from "@/components/ds/icons";
import { PayPalId } from "@/components/dashboard/shared";
import { HttpError } from "@/lib/errors";
import { PayPalError } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";
import { completeWalletSetup } from "@/lib/wallet";

/** PayPal sends the brand back here after approving the wallet (redirect flow); the SDK flow lands here too. */
export default function VaultReturn(props: PageProps<"/paypal/vault/return">) {
  return (
    <AppPage title="PayPal wallet" narrow>
      <Suspense
        fallback={
          <div role="status" aria-label="Saving your PayPal wallet">
            <Skeleton className="h-48" />
            <span className="sr-only">Saving your PayPal wallet…</span>
          </div>
        }
      >
        <Saved {...props} />
      </Suspense>
    </AppPage>
  );
}

async function Saved({ searchParams }: PageProps<"/paypal/vault/return">) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  const token = typeof q.approval_token_id === "string" ? q.approval_token_id : null;
  let result: { ok: true; email: string | null; id: string } | { ok: false; error: string };
  try {
    const w = await completeWalletSetup(s.brandId, token);
    result = { ok: true, email: w.payerEmail, id: w.paymentTokenId };
  } catch (e) {
    result = { ok: false, error: e instanceof HttpError ? e.message : e instanceof PayPalError ? e.toString() : "Could not save the wallet" };
  }
  if (!result.ok)
    return (
      <>
        <h2 className="m-0 text-[20px] font-bold">The wallet wasn&apos;t saved</h2>
        <ErrorCard
          action={
            <Link href="/brand" className={btnClass("outline")}>
              Back to brand
            </Link>
          }
        >
          {result.error}
        </ErrorCard>
      </>
    );
  return (
    <Card tone="lime">
      <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-ink text-lime">
        <IconCheck size={28} />
      </span>
      <h2 className="m-0 text-[24px] font-bold">Wallet saved ✓</h2>
      <p className="m-0 text-[15px]">
        {result.email ?? "Your PayPal account"} is saved for pay-per-render. Each licensed ad is authorized on it, and captured only when it renders and
        passes its checks.
      </p>
      <p className="m-0 flex flex-wrap items-center gap-2 text-[14px]">
        <StatusPill kind="lime">Saved</StatusPill> Vault id <PayPalId id={result.id} />
      </p>
      <div className="flex flex-wrap gap-2">
        <Link href="/brand/studio" className={btnClass("ink")}>
          Open Studio
        </Link>
        <Link href="/brand" className={btnClass("outline-dark")}>
          Back to brand
        </Link>
      </div>
    </Card>
  );
}
