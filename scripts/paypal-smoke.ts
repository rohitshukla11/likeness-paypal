/**
 * PayPal sandbox smoke test of the payment model, end to end (no render or policy code yet: PayPal calls only):
 *   the brand's mandate: OAuth token → setup token (the sandbox buyer approves in a browser) → payment token (vault_id)
 *   → render accepted: authorize $2.00 → capture → payout $1.80 (the creator's 90%) to PAYPAL_SANDBOX_CREATOR_EMAIL
 *   → render failed (render or compliance check): authorize → void
 *   → brand rejected the delivered ad: authorize → capture → refund
 * Prints only truncated IDs and statuses; never a token or a secret. Sandbox only.
 *
 *   pnpm smoke:paypal
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline";
import { accessToken, paypalConfig, PayPalError } from "../lib/paypal/http";
import { createPaymentToken, createSetupToken, getSetupToken } from "../lib/paypal/vault";
import { authorizationOf, authorizeOrder, captureAuthorization, createVaultOrder, refundCapture, voidAuthorization, type Order } from "../lib/paypal/orders";
import { createPayout, getPayout } from "../lib/paypal/payouts";

const short = (id: string | undefined) => (!id ? "-" : id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`);
const line = (step: string, detail: string) => console.log(`${step.padEnd(22)} ${detail}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function step<T>(name: string, run: () => Promise<T>, show: (r: T) => string): Promise<T> {
  try {
    const r = await run();
    line(name, show(r));
    return r;
  } catch (e) {
    line(name, `FAILED ${e instanceof PayPalError ? e.toString() : (e as Error).message}`);
    throw e;
  }
}

/** Waits for Enter (when run in a terminal) or for the setup token to turn APPROVED, whichever comes first. */
async function waitForApproval(setupTokenId: string) {
  let entered = false;
  const rl = process.stdin.isTTY ? createInterface({ input: process.stdin, output: process.stdout }) : undefined;
  rl?.question("Approve in the browser as the sandbox buyer, then press Enter… ", () => {
    entered = true;
  });
  const deadline = Date.now() + 15 * 60_000;
  let status = "";
  while (Date.now() < deadline) {
    status = (await getSetupToken(setupTokenId)).status;
    if (status === "APPROVED" || entered) break;
    await sleep(5000);
  }
  rl?.close();
  return status;
}

/** The order's authorization: from creation if PayPal authorized it then, else from an explicit authorize call. */
async function authorized(label: string, order: Order, run: string) {
  if (authorizationOf(order)) return authorizationOf(order)!;
  const after = await step(`${label} authorize`, () => authorizeOrder(order.id, { requestId: `${run}-${label}-authorize` }), (o) => `order ${o.status}, authorization ${short(authorizationOf(o)?.id)} ${authorizationOf(o)?.status ?? "-"}`);
  const auth = authorizationOf(after);
  if (!auth) throw new Error(`${label}: no authorization on the order`);
  return auth;
}

async function main() {
  const config = paypalConfig();
  if (config.env !== "sandbox") throw new Error("the smoke test runs only with PAYPAL_ENV=sandbox");
  const creatorEmail = process.env.PAYPAL_SANDBOX_CREATOR_EMAIL;
  if (!creatorEmail) throw new Error("set PAYPAL_SANDBOX_CREATOR_EMAIL (a sandbox personal account) in .env.local");
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  const run = `smoke-${randomUUID().slice(0, 8)}`;
  line("run", `${run} (sandbox)`);

  await step("1 OAuth token", () => accessToken(config), () => "ok");

  // UNSCHEDULED_POSTPAID first; if the sandbox refuses it, IMMEDIATE (and say so).
  const urls = { returnUrl: `${appUrl}/paypal/vault/return`, cancelUrl: `${appUrl}/paypal/vault/cancel` };
  let setup;
  try {
    setup = await step("2 setup token", () => createSetupToken({ ...urls, usagePattern: "UNSCHEDULED_POSTPAID" }, { requestId: `${run}-setup` }), (t) => `${short(t.id)} ${t.status} (usage_pattern UNSCHEDULED_POSTPAID)`);
  } catch (e) {
    if (!(e instanceof PayPalError) || ![400, 422].includes(e.status)) throw e;
    line("  retry", "UNSCHEDULED_POSTPAID was refused (above); retrying with IMMEDIATE");
    setup = await step("2 setup token", () => createSetupToken({ ...urls, usagePattern: "IMMEDIATE" }, { requestId: `${run}-setup-immediate` }), (t) => `${short(t.id)} ${t.status} (usage_pattern IMMEDIATE)`);
  }
  if (!setup.approveUrl) throw new Error("no approve link on the setup token");
  console.log(`\n  Approve link (sandbox buyer): ${setup.approveUrl}\n`);
  const approval = await waitForApproval(setup.id);
  line("  buyer approval", approval);

  const token = await step("3 payment token", () => createPaymentToken(setup.id, { requestId: `${run}-payment-token` }), (t) => `vault_id ${short(t.id)}, customer ${short(t.customer?.id)}`);

  // Order 1: authorize, capture, then pay the creator.
  const o1 = await step("4 order 1 ($2.00)", () => createVaultOrder({ vaultId: token.id, amount: "2.00", customId: `${run}-1`, description: "Smoke test: licence 1" }, { requestId: `${run}-order1` }), (o) => `${short(o.id)} ${o.status}${authorizationOf(o) ? `, authorization ${short(authorizationOf(o)!.id)} ${authorizationOf(o)!.status}` : ""}`);
  const a1 = await authorized("4 order 1", o1, run);
  await step("5 capture", () => captureAuthorization(a1.id, {}, { requestId: `${run}-capture1` }), (c) => `${short(c.id)} ${c.status} ${c.amount?.value ?? ""}`);
  const payout = await step("6 payout $1.80", () => createPayout({ senderBatchId: `${run}-payout`, receiverEmail: creatorEmail, amount: "1.80", note: "Smoke test: creator share" }), (p) => `batch ${short(p.batch_header.payout_batch_id)} ${p.batch_header.batch_status}`);
  let payoutStatus = payout.batch_header.batch_status;
  for (let i = 0; i < 12 && ["PENDING", "PROCESSING"].includes(payoutStatus); i++) {
    await sleep(5000);
    payoutStatus = (await getPayout(payout.batch_header.payout_batch_id)).batch_header.batch_status;
  }
  await step("  payout status", () => getPayout(payout.batch_header.payout_batch_id), (p) => `${p.batch_header.batch_status}, item ${short(p.items?.[0]?.payout_item_id)} ${p.items?.[0]?.transaction_status ?? "-"}`);

  // Order 2: authorize, then void.
  const o2 = await step("7 order 2 ($2.00)", () => createVaultOrder({ vaultId: token.id, amount: "2.00", customId: `${run}-2`, description: "Smoke test: licence 2" }, { requestId: `${run}-order2` }), (o) => `${short(o.id)} ${o.status}`);
  const a2 = await authorized("7 order 2", o2, run);
  await step("8 void", () => voidAuthorization(a2.id, { requestId: `${run}-void2` }), (v) => `authorization ${short(a2.id)} ${v?.status ?? "VOIDED (204)"}`);

  // Order 3: authorize, capture, refund.
  const o3 = await step("9 order 3 ($2.00)", () => createVaultOrder({ vaultId: token.id, amount: "2.00", customId: `${run}-3`, description: "Smoke test: licence 3" }, { requestId: `${run}-order3` }), (o) => `${short(o.id)} ${o.status}`);
  const a3 = await authorized("9 order 3", o3, run);
  const c3 = await step("10 capture", () => captureAuthorization(a3.id, {}, { requestId: `${run}-capture3` }), (c) => `${short(c.id)} ${c.status}`);
  await step("11 refund", () => refundCapture(c3.id, { note: "Smoke test refund" }, { requestId: `${run}-refund3` }), (r) => `${short(r.id)} ${r.status} ${r.amount?.value ?? ""}`);

  console.log("\nsmoke test done");
}

main().catch((e) => {
  // PayPal errors were already printed by their step (with debug_id); print anything else here.
  if (!(e instanceof PayPalError)) console.error(`smoke test stopped: ${(e as Error).message}`);
  process.exitCode = 1;
});
