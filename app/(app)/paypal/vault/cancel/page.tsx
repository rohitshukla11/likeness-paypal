import Link from "next/link";
import { btn, Card } from "@/app/ui";

export default function VaultCancel() {
  return (
    <Card className="mx-auto max-w-lg text-center">
      <div className="flex flex-col items-center gap-3 py-4">
        <h1 className="text-xl font-bold">Wallet not saved</h1>
        <p className="text-sm text-muted">You cancelled at PayPal. Nothing was saved and nothing was charged.</p>
        <Link href="/brand" className={btn.ghost}>Back to brand</Link>
      </div>
    </Card>
  );
}
