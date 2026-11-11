import { inArray } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { paypalWebhookEvents } from "@/lib/db/schema";
import { runEngineE2E } from "@/lib/e2e";
import { paypalConfig } from "@/lib/paypal/http";

/**
 * The engine's sandbox e2e on this deployed server (`pnpm e2e:live`). Off (404) unless E2E_TOKEN is set; the caller
 * sends `Authorization: Bearer <E2E_TOKEN>`. Sandbox only, StubProvider only (no AI calls), uses DEMO_VAULT_ID.
 *   POST            runs the accept, reject, deadline and revoke paths
 *   GET ?ids=a,b    the PayPal webhook events received for those resource ids (captures, refunds, payout batches)
 */
async function allowed(req: Request) {
  await connection();
  const token = process.env.E2E_TOKEN;
  if (!token || paypalConfig().env !== "sandbox") return false;
  return req.headers.get("authorization") === `Bearer ${token}`;
}

export const maxDuration = 120;

export async function POST(req: Request) {
  if (!(await allowed(req))) return new Response("not found", { status: 404 });
  const vault = process.env.DEMO_VAULT_ID;
  if (!vault) return Response.json({ error: "DEMO_VAULT_ID is not set" }, { status: 503 });
  try {
    return Response.json(await runEngineE2E(vault, "live"));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.toString() : String(e) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await allowed(req))) return new Response("not found", { status: 404 });
  const ids = (new URL(req.url).searchParams.get("ids") ?? "").split(",").filter(Boolean).slice(0, 50);
  if (!ids.length) return Response.json({ events: [] });
  const rows = await db()
    .select({ id: paypalWebhookEvents.id, type: paypalWebhookEvents.eventType, resourceId: paypalWebhookEvents.resourceId, verified: paypalWebhookEvents.verified })
    .from(paypalWebhookEvents)
    .where(inArray(paypalWebhookEvents.resourceId, ids));
  return Response.json({ events: rows });
}
