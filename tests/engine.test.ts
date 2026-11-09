/** The engine end to end on fakes: which PayPal calls happen, in what order, with which idempotency keys. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accept, approveStepUp, declineStepUp, reject, renderAndPay, settle, type RenderRequest } from "../lib/engine/render-and-pay";
import { testEngine } from "./fakes";

const req = (over: Partial<RenderRequest> = {}): RenderRequest => ({ renderId: "rnd_1", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "A sunny coffee ad", ...over });
const ops = (calls: { op: string }[]) => calls.map((c) => c.op);

describe("renderAndPay", () => {
  it("authorizes, renders, captures and waits for review", async () => {
    const t = testEngine();
    const r = await renderAndPay(req(), t.deps);
    assert.equal(r.status, "in_review");
    assert.deepEqual(ops(t.calls), ["createVaultOrder", "captureAuthorization"]);
    assert.deepEqual(
      t.calls.map((c) => c.requestId),
      ["rnd_1-order", "rnd_1-capture"],
    );
    assert.equal((t.calls[0].args[0] as { vaultId: string }).vaultId, "vault_1");
    assert.equal(r.amountCents, 200);
    assert.ok(r.reviewDeadline && r.reviewDeadline.getTime() - t.deps.now().getTime() === 120_000);
    assert.equal(t.store.licence.rendersUsed, 1);
    assert.equal(t.store.mandate.spentCents, 200);
  });

  it("accept: pays the creator 90% with sender_batch_id = render id, and signs a licensed receipt", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    const r = await accept("rnd_1", t.deps);
    assert.equal(r.status, "accepted");
    const payout = t.calls.find((c) => c.op === "createPayout")!.args[0] as { senderBatchId: string; amount: string; receiverEmail: string };
    assert.deepEqual([payout.senderBatchId, payout.amount, payout.receiverEmail], ["rnd_1", "1.80", "creator@example.com"]);
    assert.deepEqual([r.creatorPayoutCents, r.platformFeeCents], [180, 20]);
    const receipt = t.store.receipts.get("rnd_1")!;
    assert.equal(receipt.payload.status, "licensed");
    assert.equal(receipt.payload.paypal.captureId, r.captureId);
    assert.equal(receipt.payload.paypal.payoutBatchId, r.payoutBatchId);
    // accepting again changes nothing and calls PayPal no more
    const before = t.calls.length;
    await accept("rnd_1", t.deps);
    assert.equal(t.calls.length, before);
  });

  it("reject: refunds the capture, no payout, refunded receipt, spend released", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    const r = await reject("rnd_1", t.deps);
    assert.equal(r.status, "rejected");
    assert.deepEqual(ops(t.calls), ["createVaultOrder", "captureAuthorization", "refundCapture"]);
    assert.equal(t.calls[2].requestId, "rnd_1-refund");
    assert.equal(t.store.receipts.get("rnd_1")!.payload.status, "refunded");
    assert.ok(t.store.receipts.get("rnd_1")!.payload.paypal.refundId);
    assert.equal(t.store.mandate.spentCents, 0);
    assert.equal(t.store.licence.rendersUsed, 1, "a rejected render still used one of the licence's renders");
  });

  it("the brand's click and the deadline can't both settle a render", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    await reject("rnd_1", t.deps);
    t.advance(10 * 60_000);
    await settle(t.deps);
    assert.equal(ops(t.calls).filter((o) => o === "createPayout").length, 0);
  });

  it("settle(): auto-accepts after the review window, not before", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    t.advance(60_000);
    assert.equal((await settle(t.deps)).length, 0);
    t.advance(61_000);
    const [r] = await settle(t.deps);
    assert.equal(r.status, "accepted");
    assert.equal(r.decision, "auto_accept");
    assert.equal(t.store.receipts.get("rnd_1")!.payload.decision, "auto_accept");
  });

  it("revoked licence: refusal row and zero PayPal calls", async () => {
    const t = testEngine({ licence: { status: "revoked", revokedAt: new Date("2026-11-10T11:00:00Z") } });
    const r = await renderAndPay(req(), t.deps);
    assert.equal(r.status, "refused");
    assert.equal(t.calls.length, 0);
    assert.equal(t.store.refusals[0].reason, "licence_revoked");
    assert.equal(t.store.mandate.spentCents, 0);
  });

  for (const [name, opts, code] of [
    ["expired licence", { licence: { expiresAt: new Date("2026-11-10T11:59:59Z") } }, "licence_expired"],
    ["render cap", { licence: { renderCap: 1, rendersUsed: 1 } }, "render_cap"],
    ["budget", { mandate: { totalBudgetCents: 100 } }, "budget"],
  ] as const) {
    it(`${name}: refused with no PayPal call`, async () => {
      const t = testEngine(opts);
      const r = await renderAndPay(req(), t.deps);
      assert.equal(r.status, "refused");
      assert.equal(t.calls.length, 0);
      assert.equal(t.store.refusals[0].reason, code);
    });
  }

  it("daily cap: counts today's earlier renders", async () => {
    const t = testEngine({ mandate: { dailyCapCents: 400 } });
    await renderAndPay(req({ renderId: "rnd_a" }), t.deps);
    await renderAndPay(req({ renderId: "rnd_b" }), t.deps);
    const calls = t.calls.length;
    const r = await renderAndPay(req({ renderId: "rnd_c" }), t.deps);
    assert.equal(r.status, "refused");
    assert.equal(t.calls.length, calls, "no PayPal call for the refused render");
    assert.equal(t.store.refusals.at(-1)!.reason, "daily_cap");
  });

  it("step-up: waits for the brand with no PayPal call, then runs once approved", async () => {
    const t = testEngine({ mandate: { stepUpThresholdCents: 500 } });
    const held = await renderAndPay(req({ kind: "video" }), t.deps); // 3 × 200 = 600
    assert.equal(held.status, "needs_brand_approval");
    assert.equal(t.calls.length, 0);
    assert.equal(t.store.mandate.spentCents, 0, "nothing reserved while waiting");
    const r = await approveStepUp("rnd_1", t.deps);
    assert.equal(r.status, "in_review");
    assert.equal(r.amountCents, 600);
    assert.equal(t.store.mandate.spentCents, 600);
  });

  it("step-up declined: refused, never charged", async () => {
    const t = testEngine({ mandate: { stepUpThresholdCents: 100 } });
    await renderAndPay(req(), t.deps);
    const r = await declineStepUp("rnd_1", t.deps);
    assert.equal(r!.status, "refused");
    assert.equal(t.calls.length, 0);
  });

  it("render failure: voids the authorization, releases the reservation, refusal row", async () => {
    const t = testEngine({ provider: { name: "broken", render: async () => Promise.reject(new Error("model unavailable")) } });
    const r = await renderAndPay(req(), t.deps);
    assert.equal(r.status, "voided");
    assert.deepEqual(ops(t.calls), ["createVaultOrder", "voidAuthorization"]);
    assert.equal(t.calls[1].requestId, "rnd_1-void");
    assert.equal(t.store.refusals[0].reason, "render_failed");
    assert.equal(t.store.mandate.spentCents, 0);
    assert.equal(t.store.licence.rendersUsed, 0);
  });

  it("compliance failure: voids, never captures", async () => {
    const t = testEngine({ compliance: { name: "strict", check: async () => ({ ok: false, reason: "no AI label" }) } });
    const r = await renderAndPay(req(), t.deps);
    assert.equal(r.status, "voided");
    assert.ok(!ops(t.calls).includes("captureAuthorization"));
    assert.equal(t.store.refusals[0].reason, "compliance_failed");
  });

  it("PayPal declines the authorization: failed, reservation released, nothing to void", async () => {
    const t = testEngine({ fail: { createVaultOrder: new Error("PayPal 422 UNPROCESSABLE_ENTITY: instrument declined (debug_id abc123)") } });
    const r = await renderAndPay(req(), t.deps);
    assert.equal(r.status, "failed");
    assert.match(r.error!, /debug_id abc123/);
    assert.deepEqual(ops(t.calls), ["createVaultOrder"]);
    assert.equal(t.store.mandate.spentCents, 0);
  });

  it("is idempotent per render id: a second call makes no PayPal call", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    const n = t.calls.length;
    const again = await renderAndPay(req(), t.deps);
    assert.equal(again.status, "in_review");
    assert.equal(t.calls.length, n);
    assert.equal(t.store.licence.rendersUsed, 1);
  });

  it("resumes a render interrupted after the authorization with the same request ids", async () => {
    const t = testEngine();
    await renderAndPay(req(), t.deps);
    // pretend the process died after authorizing: put it back to rendering
    await t.store.update("rnd_1", { status: "rendering", captureId: null });
    await renderAndPay(req(), t.deps);
    const captures = t.calls.filter((c) => c.op === "captureAuthorization");
    assert.equal(captures.length, 2);
    assert.equal(captures[0].requestId, captures[1].requestId, "same PayPal-Request-Id, so PayPal captures once");
  });
});
