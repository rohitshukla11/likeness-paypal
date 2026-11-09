/**
 * Orders v2 and Payments v2: an order charged to a saved PayPal wallet (vault_id) with intent AUTHORIZE, then
 * capture, void or refund. https://developer.paypal.com/docs/api/orders/v2/ and /docs/api/payments/v2/
 */
import { money, paypalRequest, type RequestOptions } from "./http";

type Link = { rel: string; href: string; method?: string };

export interface Authorization {
  id: string;
  status: string; // CREATED, CAPTURED, PARTIALLY_CAPTURED, VOIDED, DENIED, EXPIRED, PENDING
  amount?: { currency_code: string; value: string };
  expiration_time?: string;
}

export interface Capture {
  id: string;
  status: string; // COMPLETED, PENDING, DECLINED, REFUNDED, PARTIALLY_REFUNDED, FAILED
  amount?: { currency_code: string; value: string };
}

export interface Refund {
  id: string;
  status: string; // COMPLETED, PENDING, CANCELLED, FAILED
  amount?: { currency_code: string; value: string };
}

export interface Order {
  id: string;
  status: string; // CREATED, SAVED, APPROVED, VOIDED, COMPLETED, PAYER_ACTION_REQUIRED
  intent?: string;
  purchase_units?: { reference_id?: string; payments?: { authorizations?: Authorization[]; captures?: Capture[] } }[];
  links?: Link[];
}

export interface VaultOrderInput {
  vaultId: string;
  amount: number | string;
  currency?: string;
  description?: string;
  /** Your own reference, e.g. a licence id; it comes back on the order and in reports. */
  customId?: string;
  referenceId?: string;
}

/**
 * POST /v2/checkout/orders, intent AUTHORIZE, paid by a saved PayPal wallet (payment_source.paypal.vault_id).
 * With a vault_id PayPal may authorize during creation; `authorizationOf` reads it either way.
 */
export function createVaultOrder(input: VaultOrderInput, opts?: RequestOptions) {
  return paypalRequest<Order>(
    "POST",
    "/v2/checkout/orders",
    {
      intent: "AUTHORIZE",
      purchase_units: [
        {
          ...(input.referenceId ? { reference_id: input.referenceId } : {}),
          ...(input.customId ? { custom_id: input.customId } : {}),
          ...(input.description ? { description: input.description } : {}),
          amount: money(input.amount, input.currency),
        },
      ],
      payment_source: { paypal: { vault_id: input.vaultId } },
    },
    opts,
  );
}

/** GET /v2/checkout/orders/{id}. */
export function getOrder(id: string, opts?: RequestOptions) {
  return paypalRequest<Order>("GET", `/v2/checkout/orders/${encodeURIComponent(id)}`, undefined, opts);
}

/** POST /v2/checkout/orders/{id}/authorize: for an order not already authorized at creation. */
export function authorizeOrder(id: string, opts?: RequestOptions) {
  return paypalRequest<Order>("POST", `/v2/checkout/orders/${encodeURIComponent(id)}/authorize`, {}, opts);
}

/** The order's first authorization, if any. */
export function authorizationOf(order: Order): Authorization | undefined {
  return order.purchase_units?.[0]?.payments?.authorizations?.[0];
}

/** POST /v2/payments/authorizations/{id}/capture: all of it, or `amount` (final capture by default). */
export function captureAuthorization(authorizationId: string, input: { amount?: number | string; currency?: string; finalCapture?: boolean } = {}, opts?: RequestOptions) {
  return paypalRequest<Capture>(
    "POST",
    `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/capture`,
    { ...(input.amount !== undefined ? { amount: { currency_code: input.currency ?? "USD", value: money(input.amount).value } } : {}), final_capture: input.finalCapture ?? true },
    opts,
  );
}

/** POST /v2/payments/authorizations/{id}/void: releases the hold. */
export function voidAuthorization(authorizationId: string, opts?: RequestOptions) {
  return paypalRequest<Authorization | undefined>("POST", `/v2/payments/authorizations/${encodeURIComponent(authorizationId)}/void`, undefined, opts);
}

/** POST /v2/payments/captures/{id}/refund: all of it, or `amount`. */
export function refundCapture(captureId: string, input: { amount?: number | string; currency?: string; note?: string } = {}, opts?: RequestOptions) {
  return paypalRequest<Refund>(
    "POST",
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    {
      ...(input.amount !== undefined ? { amount: { currency_code: input.currency ?? "USD", value: money(input.amount).value } } : {}),
      ...(input.note ? { note_to_payer: input.note } : {}),
    },
    opts,
  );
}
