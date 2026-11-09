import { HttpError } from "@/lib/errors";
import { PayPalError } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";
import { completeWalletSetup } from "@/lib/wallet";

/** After the SDK's onApprove: turn the brand's approved setup token into its saved wallet (payment token). */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return Response.json({ error: "no session" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { vaultSetupToken?: string };
  try {
    const w = await completeWalletSetup(s.brandId, body.vaultSetupToken);
    return Response.json({ saved: true, payerEmail: w.payerEmail });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 502;
    return Response.json({ error: e instanceof Error ? e.message : "could not save the wallet", debugId: e instanceof PayPalError ? e.debugId : undefined }, { status });
  }
}
