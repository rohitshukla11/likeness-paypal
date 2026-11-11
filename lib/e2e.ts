import "server-only";
/**
 * The engine's sandbox end-to-end paths, shared by `pnpm e2e:engine` (local) and POST /api/e2e (on a deployed
 * server, behind E2E_TOKEN), so both run exactly the same thing. StubProvider only: no AI calls, no cost.
 *   accept   render → authorize → capture → brand accepts → payout 90% → licensed receipt
 *   reject   render → authorize → capture → brand rejects → refund, no payout → refunded receipt
 *   deadline render → capture → review window (3 s) passes → settle() auto-accepts → payout
 *   revoke   the creator revokes the licence → the next render is refused with ZERO PayPal calls
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { mandates, paypalVaultTokens, receipts, refusals } from "./db/schema";
import { createWorkspace } from "./demo";
import { engineDeps, livePayPal } from "./engine";
import { StubProvider } from "./engine/providers";
import { accept, reject, renderAndPay, settle, type PayPalPort, type RenderRow } from "./engine/render-and-pay";
import { newId } from "./errors";
import { decide, fileRequest, revoke } from "./licences";
import { paypalConfig } from "./paypal/http";
import { getPaymentToken } from "./paypal/vault";
import { checkReceipt } from "./receipts";

export type PathResult = { path: "accept" | "reject" | "deadline" | "revoke"; ok: boolean; status: string; ids: Record<string, string | null>; detail: string };
export type E2EResult = { run: string; workspace: string; vault: string; paths: PathResult[]; ok: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function counting(): { paypal: PayPalPort; count: () => number } {
  let n = 0;
  const paypal = Object.fromEntries(Object.entries(livePayPal).map(([k, fn]) => [k, (...a: unknown[]) => (n++, (fn as (...x: unknown[]) => unknown)(...a))])) as unknown as PayPalPort;
  return { paypal, count: () => n };
}

async function receiptOf(renderId: string) {
  const [rc] = await db().select().from(receipts).where(eq(receipts.renderId, renderId));
  return rc ? { id: rc.id, status: rc.status, valid: checkReceipt({ canonical: rc.canonicalPayload, signature: rc.signature, keyId: rc.keyId }) } : null;
}

const ids = (r: RenderRow) => ({ render: r.id, order: r.orderId, authorization: r.authorizationId, capture: r.captureId, payout: r.payoutBatchId, refund: r.refundId });

export async function runEngineE2E(vaultId: string, label = "e2e"): Promise<E2EResult> {
  if (paypalConfig().env !== "sandbox") throw new Error("the e2e runs only with PAYPAL_ENV=sandbox");
  const run = `${label}-${newId("x").slice(2, 10)}`;
  const token = await getPaymentToken(vaultId);
  const ws = await createWorkspace({ brandName: `E2E brand ${run}` });
  await db()
    .insert(paypalVaultTokens)
    .values({ paymentTokenId: token.id, setupTokenId: "reused-sandbox-wallet", customerId: token.customer?.id ?? null, payerEmail: token.payment_source?.paypal?.email_address ?? null })
    .onConflictDoNothing();
  const mandateId = newId("man");
  await db().insert(mandates).values({ id: mandateId, brandId: ws.brandId, paymentTokenId: token.id, maxPerRenderCents: 1000, dailyCapCents: 5000, totalBudgetCents: 10000, stepUpThresholdCents: 800, expiresAt: new Date(Date.now() + 30 * 86_400_000), status: "active" });
  const req = await fileRequest(ws.brandId, { creatorId: ws.creatorId, uses: ["advertising"], days: 7, renderCap: 5, brief: "End-to-end test of the render engine" });
  const lic = await decide(ws.creatorId, req.id, true);
  const base = { licenceId: lic.id, mandateId, kind: "image" as const, use: "advertising" };
  const deps = engineDeps({ provider: new StubProvider() });
  const paths: PathResult[] = [];

  const a = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Morning coffee ad, warm light" }, deps);
  const a2 = a.status === "in_review" ? await accept(a.id, deps) : a;
  const ra = await receiptOf(a.id);
  paths.push({ path: "accept", ok: a2.status === "accepted" && !!a2.payoutBatchId && !!ra?.valid, status: a2.status, ids: ids(a2), detail: `payout $${(a2.creatorPayoutCents / 100).toFixed(2)}, receipt ${ra?.status ?? "-"} ${ra?.valid ? "valid" : "INVALID"}${a2.error ? `; ${a2.error}` : ""}` });

  const r = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Running shoe ad, city at dawn" }, deps);
  const r2 = r.status === "in_review" ? await reject(r.id, deps) : r;
  const rr = await receiptOf(r.id);
  paths.push({ path: "reject", ok: r2.status === "rejected" && !!r2.refundId && !r2.payoutBatchId && !!rr?.valid, status: r2.status, ids: ids(r2), detail: `refund, no payout, receipt ${rr?.status ?? "-"} ${rr?.valid ? "valid" : "INVALID"}${r2.error ? `; ${r2.error}` : ""}` });

  const dDeps = engineDeps({ provider: new StubProvider(), reviewWindowSeconds: 3 });
  const d = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Headphones ad, studio" }, dDeps);
  await sleep(3500);
  const settled = (await settle(dDeps)).find((x) => x.id === d.id) ?? (await dDeps.store.getRender(d.id))!;
  paths.push({ path: "deadline", ok: settled.status === "accepted" && settled.decision === "auto_accept", status: settled.status, ids: ids(settled), detail: `decision ${settled.decision ?? "-"}` });

  await revoke(ws.creatorId, lic.id);
  const counter = counting();
  const v = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Skincare ad, soft light" }, engineDeps({ paypal: counter.paypal, provider: new StubProvider() }));
  const [ref] = await db().select().from(refusals).where(eq(refusals.renderId, v.id));
  paths.push({ path: "revoke", ok: v.status === "refused" && ref?.reason === "licence_revoked" && counter.count() === 0, status: v.status, ids: ids(v), detail: `refusal ${ref?.reason ?? "-"}, PayPal calls ${counter.count()}` });

  return { run, workspace: ws.id, vault: token.id, paths, ok: paths.every((p) => p.ok) };
}
