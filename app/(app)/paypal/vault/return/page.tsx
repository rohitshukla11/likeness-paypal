import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { HttpError } from "@/lib/errors";
import { PayPalError } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";
import { completeWalletSetup } from "@/lib/wallet";
import { btn, Card, short } from "@/app/ui";

/** PayPal sends the brand back here after approving the wallet (redirect flow); the SDK flow lands here too. */
export default function VaultReturn(props: PageProps<"/paypal/vault/return">) {
  return (
    <Suspense fallback={<p className="text-sm text-muted">Saving your PayPal wallet…</p>}>
      <Saved {...props} />
    </Suspense>
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
  return (
    <Card className="mx-auto max-w-lg text-center">
      {result.ok ? (
        <div className="flex flex-col items-center gap-3 py-4">
          <span aria-hidden="true" className="flex h-14 w-14 items-center justify-center rounded-full bg-good-soft text-2xl text-good">✓</span>
          <h1 className="text-2xl font-bold">Wallet saved ✓</h1>
          <p className="text-sm text-muted">
            {result.email ?? "Your PayPal account"} is saved for pay-per-render (vault id {short(result.id)}). Each licensed ad is authorized on it, and captured only
            when it renders and passes its checks.
          </p>
          <div className="flex gap-2">
            <Link href="/brand" className={btn.ghost}>Back to brand</Link>
            <Link href="/brand/studio" className={btn.primary}>Open Studio</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 py-4">
          <h1 className="text-xl font-bold">The wallet wasn&apos;t saved</h1>
          <p className="text-sm text-bad">{result.error}</p>
          <Link href="/brand" className={btn.ghost}>Back to brand</Link>
        </div>
      )}
    </Card>
  );
}
