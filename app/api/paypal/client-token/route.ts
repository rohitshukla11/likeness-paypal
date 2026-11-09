import { browserClientToken, paypalConfig } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";

/** A browser-safe client token for the JS SDK v6 (signed-in demo sessions only). */
export async function GET() {
  if (!(await getSession())) return Response.json({ error: "no session" }, { status: 401 });
  const { accessToken, expiresIn } = await browserClientToken();
  return Response.json({ accessToken, expiresIn, env: paypalConfig().env }, { headers: { "Cache-Control": "no-store" } });
}
