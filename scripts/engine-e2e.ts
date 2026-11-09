/**
 * The render engine against the PayPal sandbox and the real database, with the StubProvider (no AI calls, no cost).
 * Reuses a saved wallet (vault_id): E2E_VAULT_ID, else the first payment token of PayPal customer E2E_CUSTOMER_ID,
 * else the newest one in paypal_vault_tokens. Each run makes its own demo workspace (creator, brand, licence, mandate).
 *   accept path   render -> authorize -> capture -> brand accepts -> payout 90% -> licensed receipt
 *   reject path   render -> authorize -> capture -> brand rejects -> refund, no payout -> refunded receipt
 *   deadline path render -> capture -> review window (3 s here) passes -> settle() auto-accepts -> payout
 *   revoke path   creator revokes the licence -> render refused in the policy check, ZERO PayPal calls
 * Prints truncated ids and statuses only (debug_id on PayPal errors). Sandbox only.
 *
 *   pnpm e2e:engine
 */
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { closeDb, db } from "../lib/db";
import { creators, mandates, paypalVaultTokens, receipts, refusals } from "../lib/db/schema";
import { createWorkspace } from "../lib/demo";
import { engineDeps, livePayPal } from "../lib/engine";
import { StubProvider } from "../lib/engine/providers";
import { accept, reject, renderAndPay, settle, type PayPalPort, type RenderRow } from "../lib/engine/render-and-pay";
import { newId } from "../lib/errors";
import { decide, fileRequest, revoke } from "../lib/licences";
import { paypalConfig } from "../lib/paypal/http";
import { getPaymentToken, listPaymentTokens } from "../lib/paypal/vault";
import { checkReceipt } from "../lib/receipts";

const short = (id: string | null | undefined) => (!id ? "-" : id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`);
const line = (step: string, detail: string) => console.log(`${step.padEnd(24)} ${detail}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Wraps PayPal to count calls (the revoke path must make none). */
function counting(): { paypal: PayPalPort; count: () => number } {
  let n = 0;
  const paypal = Object.fromEntries(Object.entries(livePayPal).map(([k, fn]) => [k, (...a: unknown[]) => (n++, (fn as (...x: unknown[]) => unknown)(...a))])) as unknown as PayPalPort;
  return { paypal, count: () => n };
}

async function vaultId(): Promise<string> {
  if (process.env.E2E_VAULT_ID) return process.env.E2E_VAULT_ID;
  if (process.env.E2E_CUSTOMER_ID) {
    const l = await listPaymentTokens(process.env.E2E_CUSTOMER_ID);
    const t = l.payment_tokens?.[0];
    if (!t) throw new Error(`customer ${process.env.E2E_CUSTOMER_ID} has no saved payment tokens`);
    return t.id;
  }
  const [t] = await db().select().from(paypalVaultTokens).orderBy(desc(paypalVaultTokens.createdAt)).limit(1);
  if (!t) throw new Error("no saved wallet: set E2E_VAULT_ID or E2E_CUSTOMER_ID (run pnpm smoke:paypal to make one)");
  return t.paymentTokenId;
}

function show(r: RenderRow) {
  return `${r.status}${r.error ? ` (${r.error})` : ""}`;
}

async function receiptLine(renderId: string) {
  const [rc] = await db().select().from(receipts).where(eq(receipts.renderId, renderId));
  if (!rc) return "no receipt";
  const ok = checkReceipt({ canonical: rc.canonicalPayload, signature: rc.signature, keyId: rc.keyId });
  return `receipt ${short(rc.id)} ${rc.status}, Ed25519 signature ${ok ? "valid" : "INVALID"}`;
}

async function main() {
  if (paypalConfig().env !== "sandbox") throw new Error("runs only with PAYPAL_ENV=sandbox");
  const run = `e2e-${randomUUID().slice(0, 8)}`;
  line("run", `${run} (sandbox, StubProvider)`);

  const vid = await vaultId();
  const token = await getPaymentToken(vid);
  line("saved wallet", `vault_id ${short(token.id)} valid, customer ${short(token.customer?.id)}`);

  const ws = await createWorkspace({ brandName: `E2E brand ${run}` });
  await db()
    .insert(paypalVaultTokens)
    .values({ paymentTokenId: token.id, setupTokenId: "reused-from-smoke-run", customerId: token.customer?.id ?? null, payerEmail: token.payment_source?.paypal?.email_address ?? null })
    .onConflictDoNothing();
  const [c] = await db().select().from(creators).where(eq(creators.id, ws.creatorId));
  line("workspace", `${short(ws.id)}: creator ${c.name}, payout to ${c.payoutPaypalEmail ? c.payoutPaypalEmail.replace(/^(.{3}).*(@.*)$/, "$1…$2") : "-"}`);

  const mandateId = newId("man");
  await db().insert(mandates).values({ id: mandateId, brandId: ws.brandId, paymentTokenId: token.id, maxPerRenderCents: 1000, dailyCapCents: 5000, totalBudgetCents: 10000, stepUpThresholdCents: 800, expiresAt: new Date(Date.now() + 30 * 86_400_000), status: "active" });
  const req = await fileRequest(ws.brandId, { creatorId: ws.creatorId, uses: ["advertising"], days: 7, renderCap: 5, brief: "End-to-end test of the render engine" });
  const lic = await decide(ws.creatorId, req.id, true);
  line("licence + mandate", `licence ${short(lic.id)} ${lic.status} $${(lic.pricePerRenderCents / 100).toFixed(2)}/render, mandate ${short(mandateId)} active`);

  const base = { licenceId: lic.id, mandateId, kind: "image" as const, use: "advertising" };
  const deps = engineDeps({ provider: new StubProvider() });
  let failures = 0;
  const expect = (cond: boolean, what: string) => {
    if (!cond) {
      failures++;
      line("  CHECK FAILED", what);
    }
  };

  // ---- accept path
  console.log("\naccept path");
  const a = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Morning coffee ad, warm light" }, deps);
  line("  render", `${short(a.id)} ${show(a)}; order ${short(a.orderId)}, authorization ${short(a.authorizationId)}, capture ${short(a.captureId)}`);
  const a2 = await accept(a.id, deps);
  line("  brand accepts", `${show(a2)}; payout batch ${short(a2.payoutBatchId)} $${(a2.creatorPayoutCents / 100).toFixed(2)} (sender_batch_id = render id), fee $${(a2.platformFeeCents / 100).toFixed(2)}`);
  line("  receipt", await receiptLine(a.id));
  expect(a2.status === "accepted" && !!a2.payoutBatchId, "accept path ends accepted with a payout");

  // ---- reject path
  console.log("\nreject path");
  const r = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Running shoe ad, city at dawn" }, deps);
  line("  render", `${short(r.id)} ${show(r)}; order ${short(r.orderId)}, capture ${short(r.captureId)}`);
  const r2 = await reject(r.id, deps);
  line("  brand rejects", `${show(r2)}; refund ${short(r2.refundId)}, payout ${short(r2.payoutBatchId)}`);
  line("  receipt", await receiptLine(r.id));
  expect(r2.status === "rejected" && !!r2.refundId && !r2.payoutBatchId, "reject path refunds with no payout");

  // ---- deadline path (auto-accept by settle())
  console.log("\ndeadline path");
  const dDeps = engineDeps({ provider: new StubProvider(), reviewWindowSeconds: 3 });
  const d = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Headphones ad, studio" }, dDeps);
  line("  render", `${short(d.id)} ${show(d)}; review deadline in 3 s`);
  await sleep(3500);
  const settled = (await settle(dDeps)).find((x) => x.id === d.id);
  line("  settle()", settled ? `${show(settled)} (${settled.decision}); payout batch ${short(settled.payoutBatchId)}` : "not settled");
  line("  receipt", await receiptLine(d.id));
  expect(settled?.status === "accepted" && settled.decision === "auto_accept", "deadline path auto-accepts");

  // ---- revoke path
  console.log("\nrevoke path");
  await revoke(ws.creatorId, lic.id);
  line("  creator revokes", `licence ${short(lic.id)} revoked`);
  const counter = counting();
  const v = await renderAndPay({ ...base, renderId: newId("rnd"), prompt: "Skincare ad, soft light" }, engineDeps({ paypal: counter.paypal, provider: new StubProvider() }));
  const [ref] = await db().select().from(refusals).where(eq(refusals.renderId, v.id));
  line("  render", `${short(v.id)} ${v.status}; refusal ${ref?.reason ?? "-"} ("${ref?.detail ?? ""}"); PayPal calls: ${counter.count()}`);
  expect(v.status === "refused" && ref?.reason === "licence_revoked" && counter.count() === 0, "revoke path refuses with zero PayPal calls");

  console.log(`\n${failures ? `${failures} check(s) FAILED` : "engine e2e: all paths passed"}`);
  if (failures) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`engine e2e stopped: ${e instanceof Error ? e.toString() : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
