import Link from "next/link";
import { Suspense } from "react";
import { verifyReceipt } from "@/lib/verify";
import { Result } from "../result";

/** A receipt's own page: shareable proof that an ad was licensed and paid (or refunded, revoked, expired). */
export default function ReceiptPage(props: PageProps<"/verify/[receiptId]">) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Receipt</h1>
        <Link href="/verify" className="text-sm font-semibold text-brand underline">
          Check another ad
        </Link>
      </div>
      <Suspense fallback={<p className="text-sm text-muted">Checking the receipt…</p>}>
        <Receipt {...props} />
      </Suspense>
    </div>
  );
}

async function Receipt({ params }: PageProps<"/verify/[receiptId]">) {
  const { receiptId } = await params;
  return <Result result={await verifyReceipt(decodeURIComponent(receiptId))} />;
}
