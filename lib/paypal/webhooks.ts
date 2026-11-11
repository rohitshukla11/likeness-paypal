/**
 * Webhooks v1: register this app's endpoint, and verify each delivery with PayPal before acting on it
 * (POST /v1/notifications/verify-webhook-signature with the delivery's transmission headers and PAYPAL_WEBHOOK_ID).
 * https://developer.paypal.com/api/rest/webhooks/
 */
import { paypalRequest } from "./http";

/** What the app listens to: authorizations, captures and refunds, payouts, and saved wallets. */
export const WEBHOOK_EVENTS = [
  "PAYMENT.AUTHORIZATION.CREATED",
  "PAYMENT.AUTHORIZATION.VOIDED",
  "PAYMENT.CAPTURE.COMPLETED",
  "PAYMENT.CAPTURE.PENDING",
  "PAYMENT.CAPTURE.DENIED",
  "PAYMENT.CAPTURE.REFUNDED",
  "PAYMENT.CAPTURE.REVERSED",
  "PAYMENT.PAYOUTSBATCH.SUCCESS",
  "PAYMENT.PAYOUTSBATCH.DENIED",
  "PAYMENT.PAYOUTS-ITEM.SUCCEEDED",
  "PAYMENT.PAYOUTS-ITEM.FAILED",
  "PAYMENT.PAYOUTS-ITEM.UNCLAIMED",
  "VAULT.PAYMENT-TOKEN.CREATED",
  "VAULT.PAYMENT-TOKEN.DELETED",
] as const;

export type Webhook = { id: string; url: string; event_types: { name: string }[] };

export const listWebhooks = () => paypalRequest<{ webhooks: Webhook[] }>("GET", "/v1/notifications/webhooks", undefined, { representation: false });

export const createWebhook = (url: string, events: readonly string[] = WEBHOOK_EVENTS) =>
  paypalRequest<Webhook>("POST", "/v1/notifications/webhooks", { url, event_types: events.map((name) => ({ name })) }, { representation: false });

/** True only if PayPal confirms this delivery was signed by PayPal for our webhook id. */
export async function verifyWebhook(headers: Headers, event: unknown, webhookId: string): Promise<boolean> {
  const h = (k: string) => headers.get(k) ?? "";
  if (!h("paypal-transmission-id") || !h("paypal-transmission-sig")) return false;
  const r = await paypalRequest<{ verification_status?: string }>(
    "POST",
    "/v1/notifications/verify-webhook-signature",
    {
      auth_algo: h("paypal-auth-algo"),
      cert_url: h("paypal-cert-url"),
      transmission_id: h("paypal-transmission-id"),
      transmission_sig: h("paypal-transmission-sig"),
      transmission_time: h("paypal-transmission-time"),
      webhook_id: webhookId,
      webhook_event: event,
    },
    { representation: false },
  );
  return r.verification_status === "SUCCESS";
}
