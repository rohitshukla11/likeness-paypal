/** The mandate checker's refusals: each one means no PayPal call. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkRender, priceOf, splitPayout, type RenderAsk } from "../lib/engine/policy";
import { DAY, licence, mandate } from "./fakes";

const now = new Date("2026-11-10T12:00:00Z");
const ask = (over: Partial<RenderAsk> = {}): RenderAsk => ({ kind: "image", use: "advertising", spentTodayCents: 0, now, ...over });
const refusal = (v: ReturnType<typeof checkRender>) => (v.ok === false ? v.code : v.ok === true ? "ok" : "step_up");

describe("checkRender", () => {
  it("passes a render within the licence and the mandate", () => {
    assert.deepEqual(checkRender(licence({}, now), mandate({}, now), ask()), { ok: true, amountCents: 200 });
  });

  it("refuses a revoked licence", () => {
    assert.equal(refusal(checkRender(licence({ status: "revoked", revokedAt: new Date(now.getTime() - 1000) }, now), mandate({}, now), ask())), "licence_revoked");
    // revokedAt alone is enough, whatever the status column says
    assert.equal(refusal(checkRender(licence({ revokedAt: now }, now), mandate({}, now), ask())), "licence_revoked");
  });

  it("refuses an expired licence", () => {
    assert.equal(refusal(checkRender(licence({ expiresAt: new Date(now.getTime() - 1) }, now), mandate({}, now), ask())), "licence_expired");
    assert.equal(refusal(checkRender(licence({ expiresAt: now }, now), mandate({}, now), ask())), "licence_expired");
  });

  it("refuses a licence that isn't active (pending, declined)", () => {
    assert.equal(refusal(checkRender(licence({ status: "pending" }, now), mandate({}, now), ask())), "licence_not_active");
  });

  it("refuses when the render cap is reached", () => {
    assert.equal(refusal(checkRender(licence({ renderCap: 3, rendersUsed: 3 }, now), mandate({}, now), ask())), "render_cap");
    assert.equal(refusal(checkRender(licence({ renderCap: 3, rendersUsed: 2 }, now), mandate({}, now), ask())), "ok");
  });

  it("refuses banned and unlicensed uses", () => {
    for (const use of ["political", "adult", "minors", "impersonation", "deception"]) {
      // banned even if a licence somehow listed it
      assert.equal(refusal(checkRender(licence({ allowedUses: [use] }, now), mandate({}, now), ask({ use }))), "use_banned", use);
    }
    assert.equal(refusal(checkRender(licence({}, now), mandate({}, now), ask({ use: "editorial" }))), "use_not_allowed");
  });

  it("refuses when the daily cap would be exceeded", () => {
    assert.equal(refusal(checkRender(licence({}, now), mandate({ dailyCapCents: 1000 }, now), ask({ spentTodayCents: 900 }))), "daily_cap");
    assert.equal(refusal(checkRender(licence({}, now), mandate({ dailyCapCents: 1000 }, now), ask({ spentTodayCents: 800 }))), "ok"); // exactly at the cap
  });

  it("refuses when the total budget would be exceeded", () => {
    assert.equal(refusal(checkRender(licence({}, now), mandate({ totalBudgetCents: 1000, spentCents: 900 }, now), ask())), "budget");
  });

  it("refuses above the per-render maximum", () => {
    assert.equal(refusal(checkRender(licence({ pricePerRenderCents: 300 }, now), mandate({ maxPerRenderCents: 500 }, now), ask({ kind: "video" }))), "per_render_max");
  });

  it("refuses an inactive or expired mandate, or one without a saved wallet", () => {
    assert.equal(refusal(checkRender(licence({}, now), mandate({ status: "pending_wallet" }, now), ask())), "mandate_not_active");
    assert.equal(refusal(checkRender(licence({}, now), mandate({ expiresAt: new Date(now.getTime() - DAY) }, now), ask())), "mandate_expired");
    assert.equal(refusal(checkRender(licence({}, now), mandate({ paymentTokenId: null }, now), ask())), "no_wallet");
  });

  it("holds a render above the step-up threshold for the brand, and passes it once approved", () => {
    const l = licence({ pricePerRenderCents: 200 }, now); // video = 600
    const m = mandate({ stepUpThresholdCents: 500 }, now);
    assert.equal(refusal(checkRender(l, m, ask({ kind: "video" }))), "step_up");
    assert.deepEqual(checkRender(l, m, ask({ kind: "video", stepUpApproved: true })), { ok: true, amountCents: 600 });
  });

  it("refuses video under an image-only licence (video multiplier 0) and still allows images", () => {
    const l = licence({ videoMultiplier: 0 }, now);
    assert.equal(refusal(checkRender(l, mandate({}, now), ask({ kind: "video" }))), "video_not_allowed");
    assert.equal(checkRender(l, mandate({}, now), ask({ kind: "image" })).ok, true);
  });

  it("checks the licence before the mandate (a revoked licence says so even with no budget left)", () => {
    assert.equal(refusal(checkRender(licence({ revokedAt: now }, now), mandate({ totalBudgetCents: 0 }, now), ask())), "licence_revoked");
  });
});

describe("prices", () => {
  it("video costs videoMultiplier × the per-render price", () => {
    assert.equal(priceOf({ pricePerRenderCents: 250, videoMultiplier: 3 }, "video"), 750);
    assert.equal(priceOf({ pricePerRenderCents: 250, videoMultiplier: 3 }, "image"), 250);
  });
  it("the creator gets 90%, the platform the rest", () => {
    assert.deepEqual(splitPayout(200), { creatorCents: 180, feeCents: 20 });
    assert.deepEqual(splitPayout(199), { creatorCents: 179, feeCents: 20 });
  });
});
