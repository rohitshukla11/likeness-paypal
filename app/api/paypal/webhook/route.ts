import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { paypalOrders, paypalPayouts, paypalWebhookEvents } from "@/lib/db/schema";
import { verifyWebhook } from "@/lib/paypal/webhooks";

type Event = { id?: string; event_type?: string; summary?: string; resource?: Record<string, unknown> & { id?: string; status?: string; batch_header?: { payout_batch_id?: string; batch_status?: string }; payout_batch_id?: string; transaction_status?: string } };

/**
 * PayPal webhook deliveries. Each is verified with PayPal (PAYPAL_WEBHOOK_ID) before anything is changed, recorded
 * once by its event id, and then mirrors the new status onto the matching order or payout row. Unverified
 * deliveries are recorded as such and refused (400).
 */
export async function POST(req: Request) {
  await connection();
  const raw = await req.text();
  let event: Event;
  try {
    event = JSON.parse(raw) as Event;
  } catch {
    return Response.json({ error: "not JSON" }, { status: 400 });
  }
  if (!event.id || !event.event_type) return Response.json({ error: "not a PayPal event" }, { status: 400 });
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  const verified = webhookId ? await verifyWebhook(req.headers, event, webhookId).catch(() => false) : false;
  const r = event.resource ?? {};
  const resourceId = r.batch_header?.payout_batch_id ?? r.id ?? null;
  await db()
    .insert(paypalWebhookEvents)
    .values({ id: event.id, eventType: event.event_type, resourceId, verified, summary: event.summary ?? null, body: event as object })
    .onConflictDoNothing();
  if (!verified) return Response.json({ received: true, verified: false }, { status: 400 });

  const t = event.event_type;
  if (t.startsWith("PAYMENT.PAYOUTSBATCH.") && r.batch_header?.payout_batch_id) {
    await db().update(paypalPayouts).set({ status: r.batch_header.batch_status ?? t.split(".").pop()! }).where(eq(paypalPayouts.payoutBatchId, r.batch_header.payout_batch_id));
  } else if (t.startsWith("PAYMENT.CAPTURE.") && r.id && t !== "PAYMENT.CAPTURE.REFUNDED") {
    await db().update(paypalOrders).set({ status: `CAPTURE_${r.status ?? t.split(".").pop()}`, updatedAt: new Date() }).where(eq(paypalOrders.captureId, r.id));
  } else if (t === "PAYMENT.CAPTURE.REFUNDED" && r.id) {
    await db().update(paypalOrders).set({ status: "REFUNDED", updatedAt: new Date() }).where(eq(paypalOrders.refundId, r.id));
  } else if (t === "PAYMENT.AUTHORIZATION.VOIDED" && r.id) {
    await db().update(paypalOrders).set({ authorizationStatus: "VOIDED", updatedAt: new Date() }).where(eq(paypalOrders.authorizationId, r.id));
  }
  return Response.json({ received: true, verified: true });
}
