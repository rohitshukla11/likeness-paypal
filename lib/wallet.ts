import "server-only";
/**
 * The brand saves its PayPal wallet once (Vault v3, no purchase): the server creates a setup token and remembers it
 * on the brand; the brand approves it at PayPal (JS SDK v6 save session, or the approve link); the server then turns
 * that same setup token into a payment token (the vault_id renders are charged to) and activates the mandate.
 * The setup token id coming back from the browser must be the one stored on the brand, so a page can't attach
 * someone else's wallet.
 */
import { and, eq, ne } from "drizzle-orm";
import { db } from "./db";
import { brands, mandates, paypalVaultTokens } from "./db/schema";
import { HttpError } from "./errors";
import { createPaymentToken, createSetupToken, getPaymentToken, getSetupToken } from "./paypal/vault";

export async function startWalletSetup(brandId: string, appUrl: string) {
  const [b] = await db().select().from(brands).where(eq(brands.id, brandId));
  if (!b) throw new HttpError(404, "no such brand");
  const token = await createSetupToken({
    returnUrl: `${appUrl}/paypal/vault/return`,
    cancelUrl: `${appUrl}/paypal/vault/cancel`,
    brandName: "Likeness",
    description: `Pay per licensed ad for ${b.name}`,
    usagePattern: "UNSCHEDULED_POSTPAID",
  });
  await db().update(brands).set({ pendingSetupTokenId: token.id }).where(eq(brands.id, brandId));
  return { id: token.id, status: token.status, approveUrl: token.approveUrl };
}

/** Creates the payment token from the brand's approved setup token (idempotent) and activates its mandates. */
export async function completeWalletSetup(brandId: string, setupTokenId?: string | null) {
  const [b] = await db().select().from(brands).where(eq(brands.id, brandId));
  if (!b?.pendingSetupTokenId) {
    const [w] = b?.paymentTokenId ? await db().select().from(paypalVaultTokens).where(eq(paypalVaultTokens.paymentTokenId, b.paymentTokenId)) : [];
    if (w) return w; // already saved (a reload of the return page)
    throw new HttpError(409, "no wallet setup in progress");
  }
  if (setupTokenId && setupTokenId !== b.pendingSetupTokenId) throw new HttpError(403, "that setup token isn't this brand's");
  const st = await getSetupToken(b.pendingSetupTokenId);
  if (st.status !== "APPROVED") throw new HttpError(409, `PayPal hasn't approved the wallet yet (status ${st.status})`);
  const pt = await createPaymentToken(b.pendingSetupTokenId, { requestId: `${b.pendingSetupTokenId}-payment-token` });
  const row = {
    paymentTokenId: pt.id,
    setupTokenId: b.pendingSetupTokenId,
    customerId: pt.customer?.id ?? null,
    payerEmail: pt.payment_source?.paypal?.email_address ?? null,
    brandId,
  };
  await db().transaction(async (tx) => {
    await tx.insert(paypalVaultTokens).values(row).onConflictDoUpdate({ target: paypalVaultTokens.paymentTokenId, set: { brandId } });
    await tx.update(mandates).set({ paymentTokenId: pt.id, status: "active" }).where(and(eq(mandates.brandId, brandId), ne(mandates.status, "revoked")));
    await tx.update(brands).set({ pendingSetupTokenId: null, paymentTokenId: pt.id, walletKind: "own" }).where(eq(brands.id, brandId));
  });
  return row;
}

/** The origin PayPal sends the buyer back to: APP_URL, else the request's own origin. */
export function appOrigin(h: Headers): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

/** Whether the shared sandbox demo wallet is configured (DEMO_VAULT_ID). */
export const demoWalletAvailable = () => !!process.env.DEMO_VAULT_ID;

/**
 * "Use demo wallet": attaches the shared sandbox wallet (DEMO_VAULT_ID, a payment token saved once by a sandbox
 * buyer) to this brand, so a visitor can render without a sandbox PayPal login. Sandbox only; checked with PayPal.
 */
export async function attachSharedDemoWallet(brandId: string) {
  const id = process.env.DEMO_VAULT_ID;
  if (!id) throw new HttpError(404, "no demo wallet is configured");
  if ((process.env.PAYPAL_ENV ?? "sandbox") !== "sandbox") throw new HttpError(403, "the demo wallet is sandbox only");
  const pt = await getPaymentToken(id);
  await db().transaction(async (tx) => {
    await tx
      .insert(paypalVaultTokens)
      .values({ paymentTokenId: pt.id, setupTokenId: "demo-wallet", customerId: pt.customer?.id ?? null, payerEmail: pt.payment_source?.paypal?.email_address ?? null })
      .onConflictDoNothing();
    await tx.update(brands).set({ paymentTokenId: pt.id, walletKind: "demo", pendingSetupTokenId: null }).where(eq(brands.id, brandId));
    await tx.update(mandates).set({ paymentTokenId: pt.id, status: "active" }).where(and(eq(mandates.brandId, brandId), ne(mandates.status, "revoked")));
  });
  return pt.id;
}
