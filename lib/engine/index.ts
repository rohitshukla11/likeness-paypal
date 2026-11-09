import "server-only";
/** The engine wired to the real world: Postgres, PayPal (sandbox or live per PAYPAL_ENV), the provider from env. */
import { newId } from "../errors";
import { authorizeOrder, captureAuthorization, createVaultOrder, refundCapture, voidAuthorization } from "../paypal/orders";
import { createPayout } from "../paypal/payouts";
import { signPayload } from "../receipts";
import { stubCompliance } from "./compliance";
import { providerFromEnv } from "./providers";
import type { EngineDeps, PayPalPort } from "./render-and-pay";
import { DrizzleStore } from "./store";

export const livePayPal: PayPalPort = { createVaultOrder, authorizeOrder, captureAuthorization, voidAuthorization, refundCapture, createPayout };

/** REVIEW_WINDOW_SECONDS (default 120): how long the brand has to accept or reject before auto-accept. */
export function reviewWindowSeconds(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.REVIEW_WINDOW_SECONDS ?? 120);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 120;
}

export function engineDeps(overrides: Partial<EngineDeps> = {}): EngineDeps {
  return {
    store: new DrizzleStore(),
    paypal: livePayPal,
    provider: providerFromEnv(),
    compliance: stubCompliance,
    sign: signPayload,
    now: () => new Date(),
    reviewWindowSeconds: reviewWindowSeconds(),
    newReceiptId: () => newId("rcp"),
    ...overrides,
  };
}

export * from "./render-and-pay";
