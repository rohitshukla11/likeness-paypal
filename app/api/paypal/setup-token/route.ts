import { headers } from "next/headers";
import { PayPalError } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";
import { appOrigin, startWalletSetup } from "@/lib/wallet";

/** The server creates the Vault setup token (UNSCHEDULED_POSTPAID); the page hands its id to the SDK session. */
export async function POST() {
  const s = await getSession();
  if (!s) return Response.json({ error: "no session" }, { status: 401 });
  try {
    const t = await startWalletSetup(s.brandId, appOrigin(await headers()));
    return Response.json({ id: t.id, status: t.status, approveUrl: t.approveUrl });
  } catch (e) {
    const debugId = e instanceof PayPalError ? e.debugId : undefined;
    return Response.json({ error: e instanceof Error ? e.message : "setup failed", debugId }, { status: 502 });
  }
}
