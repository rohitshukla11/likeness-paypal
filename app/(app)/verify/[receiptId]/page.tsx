import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AppPage, btnClass, Skeleton } from "@/components/ds";
import { verifyReceipt } from "@/lib/verify";
import { Result } from "../result";

/** A receipt's own page: shareable proof that an ad was licensed and paid (or refunded, revoked, expired). */
export default function ReceiptPage(props: PageProps<"/verify/[receiptId]">) {
  return (
    <AppPage
      title="Receipt"
      description="An Ed25519-signed receipt: the licence and the PayPal payments behind one ad."
      actions={
        <Link href="/verify" className={btnClass("outline")}>
          Check another ad
        </Link>
      }
    >
      <Suspense
        fallback={
          <div role="status" aria-label="Checking the receipt" className="flex flex-col gap-[18px]">
            <Skeleton className="h-24" />
            <Skeleton className="h-64" />
            <span className="sr-only">Checking the receipt…</span>
          </div>
        }
      >
        <Receipt {...props} />
      </Suspense>
    </AppPage>
  );
}

async function Receipt({ params }: PageProps<"/verify/[receiptId]">) {
  const { receiptId } = await params;
  await connection(); // request time: the receipt is read from the database
  return <Result result={await verifyReceipt(decodeURIComponent(receiptId))} />;
}
