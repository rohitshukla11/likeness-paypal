/**
 * Render and pay: one render, end to end, idempotent per render id.
 *   1. Policy check in ONE transaction (licence and mandate rows locked): refusal row and NO PayPal call on any
 *      failure; above the step-up threshold the render waits in needs_brand_approval. Passing reserves the money.
 *   2. Order on the brand's vault_id, intent AUTHORIZE.
 *   3. Render through the RenderProvider.
 *   4. Compliance hook.
 *   5. Capture. If 3 or 4 fails (or the capture does): void the authorization, release the reservation, refusal row.
 *   6. Review window: Accept pays the creator 90% now (sender_batch_id = render id); Reject refunds the capture with
 *      no payout; past the deadline settle() auto-accepts.
 *   7. Sign the receipt (Ed25519) with the PayPal order, authorization, capture and payout or refund ids.
 *
 * Every PayPal call carries a PayPal-Request-Id made from the render id (`<id>-order`, `-capture`, …), and every
 * step starts from the render's stored status, so calling renderAndPay again for the same id, or settle() again,
 * never charges, pays or refunds twice. The engine talks to the database, PayPal, the provider and the compliance
 * hook only through the ports below (tests pass in-memory and mocked ones).
 */
import { sha256Hex } from "../canonical";
import type { Authorization, Capture, Order, Refund, VaultOrderInput } from "../paypal/orders";
import type { PayoutBatch, PayoutInput } from "../paypal/payouts";
import type { RequestOptions } from "../paypal/http";
import type { ReceiptPayload, SignedReceipt } from "../receipts";
import type { ComplianceHook } from "./compliance";
import { checkRender, splitPayout, utcDayStart, type LicenceView, type MandateView, type RefusalCode, type Verdict } from "./policy";
import type { RenderProvider } from "./providers";

// ---------------------------------------------------------------- Ports

export interface PayPalPort {
  createVaultOrder(input: VaultOrderInput, opts?: RequestOptions): Promise<Order>;
  authorizeOrder(id: string, opts?: RequestOptions): Promise<Order>;
  captureAuthorization(authorizationId: string, input?: { amount?: number | string; finalCapture?: boolean }, opts?: RequestOptions): Promise<Capture>;
  voidAuthorization(authorizationId: string, opts?: RequestOptions): Promise<Authorization | undefined>;
  refundCapture(captureId: string, input?: { note?: string }, opts?: RequestOptions): Promise<Refund>;
  createPayout(input: PayoutInput, opts?: RequestOptions): Promise<PayoutBatch>;
}

export type RenderStatus =
  | "needs_brand_approval"
  | "refused"
  | "authorizing"
  | "rendering"
  | "capturing"
  | "in_review"
  | "settling"
  | "accepted"
  | "refunding"
  | "rejected"
  | "voided"
  | "failed";

export interface RenderRow {
  id: string;
  licenceId: string;
  mandateId: string;
  kind: "image" | "video";
  use: string;
  prompt: string;
  promptSha256: string;
  status: RenderStatus;
  amountCents: number;
  currency: string;
  reserved: boolean;
  platformFeeCents: number;
  creatorPayoutCents: number;
  outputRef: string | null;
  outputSha256: string | null;
  outputMime: string | null;
  model: string | null;
  renderNote: string | null;
  orderId: string | null;
  authorizationId: string | null;
  captureId: string | null;
  refundId: string | null;
  payoutBatchId: string | null;
  payoutSenderBatchId: string | null;
  reviewDeadline: Date | null;
  decision: "accept" | "reject" | "auto_accept" | null;
  decidedAt: Date | null;
  error: string | null;
  createdAt: Date;
}

export interface RenderContext {
  render: RenderRow;
  creator: { id: string; photoRef: string | null; payoutPaypalEmail: string | null; workspaceId: string | null };
  brandId: string;
  paymentTokenId: string | null;
}

export interface RenderRequest {
  renderId: string;
  licenceId: string;
  mandateId: string;
  kind: "image" | "video";
  use: string;
  prompt: string;
}

/** What the policy transaction writes, decided by the engine from the locked rows. */
export type Admission =
  | { status: "refused"; amountCents: number; refusal: { reason: RefusalCode | string; detail: string } }
  | { status: "needs_brand_approval"; amountCents: number }
  | { status: "authorizing"; amountCents: number; reserve: true };

export interface EngineStore {
  getRender(id: string): Promise<RenderRow | null>;
  /**
   * One transaction: lock the licence and the mandate, sum the mandate's committed spend since `dayStart`, call
   * `decide`, then insert the render (or, for an existing needs_brand_approval render, update it) with the decided
   * status; reserve the amount (licence renders_used + 1, mandate spent_cents + amount) and/or write the refusal.
   * An existing render in any other status is returned unchanged with created=false.
   */
  admit(req: RenderRequest, opts: { dayStart: Date; stepUpApproved: boolean }, decide: (l: LicenceView, m: MandateView, spentTodayCents: number) => Admission): Promise<{ render: RenderRow; created: boolean }>;
  context(renderId: string): Promise<RenderContext>;
  /** Updates the render; with `fromStatus`, only if it is currently in one of those statuses (null if not). */
  update(renderId: string, patch: Partial<RenderRow>, fromStatus?: RenderStatus[]): Promise<RenderRow | null>;
  /** Gives back a reservation: spend (always) and the licence's render (when `render` is true). */
  release(renderId: string, opts: { render: boolean }): Promise<void>;
  refuse(r: { renderId: string | null; licenceId: string | null; mandateId: string | null; reason: string; detail: string }): Promise<void>;
  recordOrder(o: { orderId: string; paymentTokenId: string | null; status: string; authorizationId?: string | null; authorizationStatus?: string | null; captureId?: string | null; refundId?: string | null; amountCents: number; customId: string }): Promise<void>;
  recordPayout(p: { senderBatchId: string; payoutBatchId: string; receiverEmail: string; amountCents: number; status: string }): Promise<void>;
  saveReceipt(renderId: string, r: SignedReceipt): Promise<void>;
  /** Stores a generated file with its render (served at /media/<render id>). Idempotent. */
  saveMedia(renderId: string, m: { bytes: Uint8Array; mime: string; sha256: string }): Promise<void>;
  /**
   * Renders to settle now: in_review past their deadline, settling/refunding ones idle for over `staleMs`, and
   * accepted/rejected ones still missing their receipt.
   */
  due(now: Date, staleMs: number): Promise<string[]>;
}

export interface EngineDeps {
  store: EngineStore;
  paypal: PayPalPort;
  provider: RenderProvider;
  compliance: ComplianceHook;
  sign: (p: ReceiptPayload) => SignedReceipt;
  now: () => Date;
  reviewWindowSeconds: number;
  newReceiptId: () => string;
}

// ---------------------------------------------------------------- Helpers

const cents = (c: number) => (c / 100).toFixed(2);
const why = (e: unknown) => (e instanceof Error ? (typeof (e as { toString?: () => string }).toString === "function" ? e.toString() : e.message) : String(e));

/** PayPal errors print as "PayPal <status> <name>: <message> (debug_id …)"; everything else as its message. */
function describe(e: unknown): string {
  const s = why(e);
  return s.startsWith("Error: ") ? s.slice(7) : s;
}

// ---------------------------------------------------------------- 1. Policy

/** Runs the whole pipeline for a new render (or resumes it). Returns the render as it stands afterwards. */
export async function renderAndPay(req: RenderRequest, deps: EngineDeps): Promise<RenderRow> {
  const existing = await deps.store.getRender(req.renderId);
  if (existing) return resume(existing, deps);
  const { render } = await admit(req, deps, false);
  return resume(render, deps);
}

/** The brand approves a render waiting above its step-up threshold: the policy is checked again, then it runs. */
export async function approveStepUp(renderId: string, deps: EngineDeps): Promise<RenderRow> {
  const r = await deps.store.getRender(renderId);
  if (!r) throw new Error("no such render");
  if (r.status !== "needs_brand_approval") return resume(r, deps);
  const { render } = await admit({ renderId, licenceId: r.licenceId, mandateId: r.mandateId, kind: r.kind, use: r.use, prompt: r.prompt }, deps, true);
  return resume(render, deps);
}

/** The brand declines a render waiting for step-up approval: it is refused, and nothing was ever charged. */
export async function declineStepUp(renderId: string, deps: EngineDeps): Promise<RenderRow | null> {
  const r = await deps.store.update(renderId, { status: "refused", error: "the brand declined the step-up" }, ["needs_brand_approval"]);
  if (r) await deps.store.refuse({ renderId, licenceId: r.licenceId, mandateId: r.mandateId, reason: "step_up_declined", detail: "the brand declined the render above its step-up threshold" });
  return r ?? deps.store.getRender(renderId);
}

async function admit(req: RenderRequest, deps: EngineDeps, stepUpApproved: boolean) {
  const now = deps.now();
  return deps.store.admit(req, { dayStart: utcDayStart(now), stepUpApproved }, (l, m, spentTodayCents) => {
    const v: Verdict = checkRender(l, m, { kind: req.kind, use: req.use, spentTodayCents, stepUpApproved, now });
    if (v.ok === true) return { status: "authorizing", amountCents: v.amountCents, reserve: true };
    if (v.ok === "step_up") return { status: "needs_brand_approval", amountCents: v.amountCents };
    return { status: "refused", amountCents: 0, refusal: { reason: v.code, detail: v.reason } };
  });
}

/** Continues a render from its stored status up to the review window (or a terminal status). */
async function resume(r: RenderRow, deps: EngineDeps): Promise<RenderRow> {
  let render = r;
  for (;;) {
    switch (render.status) {
      case "authorizing":
        render = await authorize(render, deps);
        break;
      case "rendering":
        render = await produce(render, deps);
        break;
      case "capturing":
        render = await capture(render, deps);
        break;
      default:
        return render;
    }
  }
}

// ---------------------------------------------------------------- 2. Authorize on the saved wallet

async function authorize(r: RenderRow, deps: EngineDeps): Promise<RenderRow> {
  const ctx = await deps.store.context(r.id);
  try {
    if (!ctx.paymentTokenId) throw new Error("the mandate has no saved wallet");
    let order = await deps.paypal.createVaultOrder(
      { vaultId: ctx.paymentTokenId, amount: cents(r.amountCents), currency: r.currency, customId: r.id, referenceId: r.id, description: `Licensed ${r.kind} render ${r.id}` },
      { requestId: `${r.id}-order` },
    );
    let auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
    if (!auth) {
      order = await deps.paypal.authorizeOrder(order.id, { requestId: `${r.id}-authorize` });
      auth = order.purchase_units?.[0]?.payments?.authorizations?.[0];
    }
    if (!auth) throw new Error(`order ${order.id} has no authorization (status ${order.status})`);
    if (auth.status !== "CREATED" && auth.status !== "PENDING") throw new Error(`authorization ${auth.id} is ${auth.status}`);
    await deps.store.recordOrder({ orderId: order.id, paymentTokenId: ctx.paymentTokenId, status: order.status, authorizationId: auth.id, authorizationStatus: auth.status, amountCents: r.amountCents, customId: r.id });
    return (await deps.store.update(r.id, { status: "rendering", orderId: order.id, authorizationId: auth.id }, ["authorizing"])) ?? (await mustGet(r.id, deps));
  } catch (e) {
    // Nothing to void: no authorization exists. Give the reservation back.
    return fail(r, deps, "failed", "paypal_authorize_failed", describe(e), false);
  }
}

// ---------------------------------------------------------------- 3–4. Render and compliance

async function produce(r: RenderRow, deps: EngineDeps): Promise<RenderRow> {
  const ctx = await deps.store.context(r.id);
  try {
    const out = await deps.provider.render({ renderId: r.id, kind: r.kind, prompt: r.prompt, use: r.use, workspaceId: ctx.creator.workspaceId, creatorPhotoRef: ctx.creator.photoRef });
    const check = await deps.compliance.check({ renderId: r.id, use: r.use, prompt: r.prompt, output: out });
    if (!check.ok) return fail(r, deps, "voided", "compliance_failed", check.reason, true);
    let outputRef = out.outputRef;
    if (out.bytes) {
      await deps.store.saveMedia(r.id, { bytes: out.bytes, mime: out.mime, sha256: out.sha256 });
      outputRef = `/media/${r.id}`;
    }
    return (
      (await deps.store.update(r.id, { status: "capturing", outputRef, outputSha256: out.sha256, outputMime: out.mime, model: out.model, renderNote: out.note ?? null }, ["rendering"])) ??
      (await mustGet(r.id, deps))
    );
  } catch (e) {
    return fail(r, deps, "voided", "render_failed", describe(e), true);
  }
}

// ---------------------------------------------------------------- 5. Capture

async function capture(r: RenderRow, deps: EngineDeps): Promise<RenderRow> {
  try {
    const c = await deps.paypal.captureAuthorization(r.authorizationId!, { finalCapture: true }, { requestId: `${r.id}-capture` });
    if (c.status !== "COMPLETED" && c.status !== "PENDING") throw new Error(`capture ${c.id} is ${c.status}`);
    const deadline = new Date(deps.now().getTime() + deps.reviewWindowSeconds * 1000);
    await deps.store.recordOrder({ orderId: r.orderId!, paymentTokenId: null, status: "CAPTURED", authorizationId: r.authorizationId, authorizationStatus: "CAPTURED", captureId: c.id, amountCents: r.amountCents, customId: r.id });
    return (await deps.store.update(r.id, { status: "in_review", captureId: c.id, reviewDeadline: deadline }, ["capturing"])) ?? (await mustGet(r.id, deps));
  } catch (e) {
    return fail(r, deps, "voided", "capture_failed", describe(e), true);
  }
}

/** Ends a render before money moved: void the authorization if there is one, release, refusal row. */
async function fail(r: RenderRow, deps: EngineDeps, status: "voided" | "failed", reason: string, detail: string, voidAuth: boolean): Promise<RenderRow> {
  let note = detail;
  if (voidAuth && r.authorizationId) {
    try {
      await deps.paypal.voidAuthorization(r.authorizationId, { requestId: `${r.id}-void` });
      await deps.store.recordOrder({ orderId: r.orderId!, paymentTokenId: null, status: "VOIDED", authorizationId: r.authorizationId, authorizationStatus: "VOIDED", amountCents: r.amountCents, customId: r.id });
    } catch (e) {
      note = `${detail}; void failed: ${describe(e)}`;
    }
  }
  const updated = await deps.store.update(r.id, { status, error: note }, [r.status]);
  if (!updated) return mustGet(r.id, deps); // someone else moved it on
  if (r.reserved) await deps.store.release(r.id, { render: true });
  await deps.store.refuse({ renderId: r.id, licenceId: r.licenceId, mandateId: r.mandateId, reason, detail: note });
  return (await deps.store.getRender(r.id))!;
}

// ---------------------------------------------------------------- 6–7. Review window, settlement, receipt

/** The brand accepts: the creator is paid now. */
export const accept = (renderId: string, deps: EngineDeps) => decide(renderId, "accept", deps);
/** The brand rejects: the capture is refunded and the creator is not paid. */
export const reject = (renderId: string, deps: EngineDeps) => decide(renderId, "reject", deps);

/** Auto-accepts every render past its review deadline (and retries stuck settlements). Returns what it settled. */
export async function settle(deps: EngineDeps): Promise<RenderRow[]> {
  const ids = await deps.store.due(deps.now(), 60_000);
  const out: RenderRow[] = [];
  for (const id of ids) {
    try {
      const r = await mustGet(id, deps);
      // A stuck refund is finished as a refund; everything else past its deadline is accepted.
      out.push(await decide(id, r.status === "refunding" ? "reject" : "auto_accept", deps));
    } catch {
      // left as is; the next settle() retries it
    }
  }
  return out;
}

async function decide(renderId: string, decision: "accept" | "reject" | "auto_accept", deps: EngineDeps): Promise<RenderRow> {
  const current = await mustGet(renderId, deps);
  const paying = decision !== "reject";
  const claimStatus: RenderStatus = paying ? "settling" : "refunding";
  // Claim: only one of the brand's click and the deadline wins. A render already settling/refunding (a crashed
  // attempt) is resumed by the same kind of decision.
  let r: RenderRow | null;
  if (current.status === claimStatus) r = current;
  else if (current.status === "in_review") {
    if (decision === "auto_accept" && current.reviewDeadline && deps.now() < current.reviewDeadline) return current;
    r = await deps.store.update(renderId, { status: claimStatus, decision, decidedAt: deps.now() }, ["in_review"]);
  } else {
    // Already settled: make sure its receipt exists (saveReceipt keeps the first one), then report it as is.
    if (current.status === "accepted" || current.status === "rejected") await signReceipt(current, deps);
    return mustGet(renderId, deps);
  }
  if (!r) return mustGet(renderId, deps);

  if (paying) {
    const ctx = await deps.store.context(renderId);
    const email = ctx.creator.payoutPaypalEmail;
    if (!email) {
      await deps.store.update(renderId, { error: "the creator has no payout PayPal email yet; retrying at the next settle" });
      return mustGet(renderId, deps);
    }
    const { creatorCents, feeCents } = splitPayout(r.amountCents);
    try {
      const batch = await deps.paypal.createPayout({ senderBatchId: renderId, receiverEmail: email, amount: cents(creatorCents), note: `Your 90% of licensed render ${renderId}`, senderItemId: renderId });
      await deps.store.recordPayout({ senderBatchId: renderId, payoutBatchId: batch.batch_header.payout_batch_id, receiverEmail: email, amountCents: creatorCents, status: batch.batch_header.batch_status });
      r = (await deps.store.update(renderId, { status: "accepted", payoutBatchId: batch.batch_header.payout_batch_id, payoutSenderBatchId: renderId, creatorPayoutCents: creatorCents, platformFeeCents: feeCents, error: null }, ["settling"]))!;
    } catch (e) {
      await deps.store.update(renderId, { error: `payout failed: ${describe(e)}` });
      throw e;
    }
  } else {
    try {
      const refund = await deps.paypal.refundCapture(r.captureId!, { note: "The brand rejected this render" }, { requestId: `${renderId}-refund` });
      await deps.store.recordOrder({ orderId: r.orderId!, paymentTokenId: null, status: "REFUNDED", authorizationId: r.authorizationId, authorizationStatus: "CAPTURED", captureId: r.captureId, refundId: refund.id, amountCents: r.amountCents, customId: renderId });
      r = (await deps.store.update(renderId, { status: "rejected", refundId: refund.id, creatorPayoutCents: 0, platformFeeCents: 0, error: null }, ["refunding"]))!;
      // The money is back with the brand: release the spend; the render still counts against the licence.
      if (r.reserved) await deps.store.release(renderId, { render: false });
    } catch (e) {
      await deps.store.update(renderId, { error: `refund failed: ${describe(e)}` });
      throw e;
    }
  }
  await signReceipt(r, deps);
  return mustGet(renderId, deps);
}

async function signReceipt(r: RenderRow, deps: EngineDeps) {
  const ctx = await deps.store.context(r.id);
  const payload: ReceiptPayload = {
    v: 1,
    receiptId: deps.newReceiptId(),
    renderId: r.id,
    licenceId: r.licenceId,
    mandateId: r.mandateId,
    creatorId: ctx.creator.id,
    brandId: ctx.brandId,
    use: r.use,
    kind: r.kind,
    promptSha256: r.promptSha256,
    outputSha256: r.outputSha256 ?? "",
    outputMime: r.outputMime ?? "",
    model: r.model ?? "",
    amountCents: r.amountCents,
    currency: r.currency,
    creatorPayoutCents: r.creatorPayoutCents,
    platformFeeCents: r.platformFeeCents,
    status: r.status === "rejected" ? "refunded" : "licensed",
    decision: r.decision ?? "accept",
    paypal: {
      orderId: r.orderId!,
      authorizationId: r.authorizationId!,
      captureId: r.captureId!,
      ...(r.payoutBatchId ? { payoutBatchId: r.payoutBatchId, payoutSenderBatchId: r.payoutSenderBatchId ?? r.id } : {}),
      ...(r.refundId ? { refundId: r.refundId } : {}),
    },
    renderedAt: r.createdAt.toISOString(),
    settledAt: (r.decidedAt ?? deps.now()).toISOString(),
  };
  await deps.store.saveReceipt(r.id, deps.sign(payload));
}

async function mustGet(id: string, deps: EngineDeps) {
  const r = await deps.store.getRender(id);
  if (!r) throw new Error(`render ${id} not found`);
  return r;
}

export const promptHash = (prompt: string) => sha256Hex(prompt);
