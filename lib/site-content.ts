/**
 * Marketing copy that is data, not code. Every number here is true by construction, with where it comes from;
 * testimonials are real quotes only. An empty list hides the section entirely.
 */

export const MEASUREMENTS = {
  /** lib/engine/render-and-pay.ts: Accept pays the creator 90% of the captured amount through PayPal Payouts. */
  creatorShare: {
    value: 90,
    source: "On Accept (or at the review deadline) the engine pays the creator 90% of the capture through PayPal Payouts",
  },
  /** lib/engine/policy.ts: a refused render is decided in the policy transaction, before any PayPal call. */
  refusedPayPalCalls: {
    value: 0,
    source: "A refused render (revoked licence, cap, budget, daily cap) is refused in the policy transaction, before any PayPal call",
  },
} as const;

export type Testimonial = { quote: string; name: string; role: string };

/** Real, attributed quotes only. Leave empty until there are some: the section is then not rendered. */
export const TESTIMONIALS: Testimonial[] = [];

export const BUILT_ON = ["PayPal Vault", "Orders v2", "Payouts", "JS SDK v6", "Neon Postgres", "Ed25519 receipts"];
