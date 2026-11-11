import Link from "next/link";
import { btnClass, NoticePage } from "@/components/ds";

export default function VaultCancel() {
  return (
    <NoticePage
      title="Wallet not saved"
      description="PayPal wallet"
      action={
        <Link href="/brand" className={btnClass("ink")}>
          Back to brand
        </Link>
      }
    >
      You cancelled at PayPal. Nothing was saved and nothing was charged.
    </NoticePage>
  );
}
