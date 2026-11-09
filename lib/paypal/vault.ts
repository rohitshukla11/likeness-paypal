/**
 * The brand's MANDATE saves its PayPal wallet once, without a purchase (Vault v3): a setup token the brand approves,
 * then a payment token whose id is the vault_id that every render's authorization is charged to.
 *
 * The payment model: the creator approves a LICENCE once; the brand approves a MANDATE once (its limits, and saving
 * its PayPal wallet). Per render: policy check -> authorize on the vault_id -> render -> compliance check -> capture
 * -> payout to the creator (90%). The authorization is voided if the render or the compliance check fails; the
 * capture is refunded if the brand rejects the ad. A revoked or expired licence, or an exceeded mandate, is refused
 * before any PayPal call.
 *
 * https://developer.paypal.com/docs/checkout/save-payment-methods/purchase-later/payment-tokens-api/paypal/
 */
import { linkOf, paypalRequest, type RequestOptions } from "./http";

type Link = { rel: string; href: string; method?: string };

export interface SetupToken {
  id: string;
  /** PAYER_ACTION_REQUIRED until the buyer approves, then APPROVED. */
  status: string;
  customer?: { id: string };
  links?: Link[];
}

export interface PaymentToken {
  id: string;
  customer?: { id: string };
  payment_source?: { paypal?: { email_address?: string; payer_id?: string } };
  links?: Link[];
}

export interface SetupTokenInput {
  returnUrl: string;
  cancelUrl: string;
  description?: string;
  brandName?: string;
  /**
   * How the saved wallet will be charged. Default UNSCHEDULED_POSTPAID: the brand is charged per render, at
   * unscheduled times, after the fact (Vault v3 `payment_source.paypal.usage_pattern`).
   */
  usagePattern?: "UNSCHEDULED_POSTPAID" | "IMMEDIATE" | "DEFERRED" | "UNSCHEDULED_PREPAID";
  /** An existing PayPal customer id, to add the wallet to that customer. */
  customerId?: string;
}

/** POST /v3/vault/setup-tokens: a PayPal wallet setup for merchant-initiated use. The buyer approves at `approveUrl`. */
export async function createSetupToken(input: SetupTokenInput, opts?: RequestOptions) {
  const token = await paypalRequest<SetupToken>(
    "POST",
    "/v3/vault/setup-tokens",
    {
      ...(input.customerId ? { customer: { id: input.customerId } } : {}),
      payment_source: {
        paypal: {
          description: input.description ?? "Pay for licensed ads",
          permit_multiple_payment_tokens: false,
          usage_pattern: input.usagePattern ?? "UNSCHEDULED_POSTPAID",
          usage_type: "MERCHANT",
          customer_type: "CONSUMER",
          experience_context: {
            brand_name: input.brandName ?? "Likeness",
            locale: "en-US",
            shipping_preference: "NO_SHIPPING",
            user_action: "SETUP_NOW",
            return_url: input.returnUrl,
            cancel_url: input.cancelUrl,
          },
        },
      },
    },
    opts,
  );
  return { ...token, approveUrl: linkOf(token.links, "approve") };
}

/** GET /v3/vault/setup-tokens/{id}: its status (APPROVED once the buyer has approved). */
export function getSetupToken(id: string, opts?: RequestOptions) {
  return paypalRequest<SetupToken>("GET", `/v3/vault/setup-tokens/${encodeURIComponent(id)}`, undefined, opts);
}

/** POST /v3/vault/payment-tokens from an approved setup token. The returned id is the vault_id. */
export function createPaymentToken(setupTokenId: string, opts?: RequestOptions) {
  return paypalRequest<PaymentToken>("POST", "/v3/vault/payment-tokens", { payment_source: { token: { id: setupTokenId, type: "SETUP_TOKEN" } } }, opts);
}

/** GET /v3/vault/payment-tokens/{id}: the saved wallet, if it still exists (404 once deleted). */
export function getPaymentToken(id: string, opts?: RequestOptions) {
  return paypalRequest<PaymentToken>("GET", `/v3/vault/payment-tokens/${encodeURIComponent(id)}`, undefined, opts);
}

/** GET /v3/vault/payment-tokens?customer_id=…: a PayPal customer's saved payment tokens. */
export function listPaymentTokens(customerId: string, opts?: RequestOptions) {
  return paypalRequest<{ customer?: { id: string }; payment_tokens?: PaymentToken[] }>("GET", `/v3/vault/payment-tokens?customer_id=${encodeURIComponent(customerId)}`, undefined, opts);
}
