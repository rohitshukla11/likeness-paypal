/** Test doubles for the engine: an in-memory store with the same admit/release semantics, and a recording PayPal. */
import { generateKeyPairSync, sign } from "node:crypto";
import { canonicalJson, sha256Hex } from "../lib/canonical";
import type { LicenceView, MandateView } from "../lib/engine/policy";
import type { RenderProvider } from "../lib/engine/providers";
import type { EngineDeps, EngineStore, PayPalPort, RenderContext, RenderRow, RenderStatus } from "../lib/engine/render-and-pay";
import type { ReceiptPayload, SignedReceipt } from "../lib/receipts";

export const DAY = 86_400_000;

export function licence(over: Partial<LicenceView> = {}, now = new Date()): LicenceView & { id: string; creatorId: string; brandId: string } {
  return {
    id: "lic_1",
    creatorId: "cre_1",
    brandId: "brd_1",
    status: "active",
    revokedAt: null,
    expiresAt: new Date(now.getTime() + 30 * DAY),
    allowedUses: ["advertising", "social"],
    bannedUses: ["political", "adult", "minors", "impersonation", "deception"],
    renderCap: 10,
    rendersUsed: 0,
    pricePerRenderCents: 200,
    videoMultiplier: 3,
    ...over,
  };
}

export function mandate(over: Partial<MandateView> = {}, now = new Date()): MandateView & { id: string; brandId: string } {
  return {
    id: "man_1",
    brandId: "brd_1",
    status: "active",
    expiresAt: new Date(now.getTime() + 30 * DAY),
    paymentTokenId: "vault_1",
    maxPerRenderCents: 1000,
    dailyCapCents: 2000,
    totalBudgetCents: 5000,
    spentCents: 0,
    stepUpThresholdCents: 500,
    ...over,
  };
}

type TestLicence = ReturnType<typeof licence>;
type TestMandate = ReturnType<typeof mandate>;

export class MemoryStore implements EngineStore {
  renders = new Map<string, RenderRow>();
  refusals: { renderId: string | null; reason: string; detail: string }[] = [];
  orders = new Map<string, Record<string, unknown>>();
  payouts = new Map<string, Record<string, unknown>>();
  receipts = new Map<string, SignedReceipt>();
  creator = { id: "cre_1", photoRef: "/demo/rohit.svg", payoutPaypalEmail: "creator@example.com" as string | null, workspaceId: "ws_1" as string | null };
  media = new Map<string, { bytes: Uint8Array; mime: string; sha256: string }>();

  constructor(
    public licence: TestLicence,
    public mandate: TestMandate,
    private readonly clock: () => Date,
  ) {}

  async getRender(id: string) {
    const r = this.renders.get(id);
    return r ? { ...r } : null;
  }

  admit: EngineStore["admit"] = async (req, opts, decide) => {
    const existing = this.renders.get(req.renderId);
    if (existing && (existing.status !== "needs_brand_approval" || !opts.stepUpApproved)) return { render: { ...existing }, created: false };
    const spent = [...this.renders.values()].filter((r) => r.mandateId === this.mandate.id && r.reserved && r.createdAt >= opts.dayStart).reduce((s, r) => s + r.amountCents, 0);
    const a = decide({ ...this.licence }, { ...this.mandate }, spent);
    const reserve = a.status === "authorizing";
    const row: RenderRow = existing
      ? { ...existing, status: a.status, amountCents: a.amountCents, reserved: reserve }
      : {
          id: req.renderId,
          licenceId: req.licenceId,
          mandateId: req.mandateId,
          kind: req.kind,
          use: req.use,
          prompt: req.prompt,
          promptSha256: sha256Hex(req.prompt),
          status: a.status,
          amountCents: a.amountCents,
          currency: "USD",
          reserved: reserve,
          platformFeeCents: 0,
          creatorPayoutCents: 0,
          outputRef: null,
          outputSha256: null,
          outputMime: null,
          model: null,
          renderNote: null,
          orderId: null,
          authorizationId: null,
          captureId: null,
          refundId: null,
          payoutBatchId: null,
          payoutSenderBatchId: null,
          reviewDeadline: null,
          decision: null,
          decidedAt: null,
          error: a.status === "refused" ? a.refusal.detail : null,
          createdAt: this.clock(),
        };
    this.renders.set(row.id, row);
    if (reserve) {
      this.licence.rendersUsed += 1;
      this.mandate.spentCents += a.amountCents;
    }
    if (a.status === "refused") this.refusals.push({ renderId: row.id, reason: a.refusal.reason, detail: a.refusal.detail });
    return { render: { ...row }, created: !existing };
  };

  async context(renderId: string): Promise<RenderContext> {
    return { render: { ...this.renders.get(renderId)! }, creator: { ...this.creator }, brandId: this.licence.brandId, paymentTokenId: this.mandate.paymentTokenId };
  }

  async update(renderId: string, patch: Partial<RenderRow>, fromStatus?: RenderStatus[]) {
    const r = this.renders.get(renderId);
    if (!r || (fromStatus && !fromStatus.includes(r.status))) return null;
    const next = { ...r, ...patch };
    this.renders.set(renderId, next);
    return { ...next };
  }

  async release(renderId: string, opts: { render: boolean }) {
    const r = this.renders.get(renderId)!;
    if (!r.reserved) return;
    if (opts.render) this.licence.rendersUsed = Math.max(0, this.licence.rendersUsed - 1);
    this.mandate.spentCents = Math.max(0, this.mandate.spentCents - r.amountCents);
    this.renders.set(renderId, { ...r, reserved: false });
  }

  async refuse(r: { renderId: string | null; reason: string; detail: string }) {
    this.refusals.push({ renderId: r.renderId, reason: r.reason, detail: r.detail });
  }

  async recordOrder(o: { orderId: string } & Record<string, unknown>) {
    this.orders.set(o.orderId, { ...this.orders.get(o.orderId), ...o });
  }

  async recordPayout(p: { senderBatchId: string } & Record<string, unknown>) {
    this.payouts.set(p.senderBatchId, p);
  }

  async saveReceipt(renderId: string, r: SignedReceipt) {
    if (!this.receipts.has(renderId)) this.receipts.set(renderId, r);
  }

  async saveMedia(renderId: string, m: { bytes: Uint8Array; mime: string; sha256: string }) {
    if (!this.media.has(renderId)) this.media.set(renderId, m);
  }

  async due(now: Date, staleMs: number) {
    return [...this.renders.values()]
      .filter(
        (r) =>
          (r.status === "in_review" && r.reviewDeadline && r.reviewDeadline < now) ||
          ((r.status === "settling" || r.status === "refunding") && now.getTime() - r.createdAt.getTime() > staleMs) ||
          ((r.status === "accepted" || r.status === "rejected") && !this.receipts.has(r.id)),
      )
      .map((r) => r.id);
  }
}

/** A PayPal that records every call and answers like the sandbox does. `fail` makes a named call throw. */
export function mockPayPal(fail: Partial<Record<keyof PayPalPort, Error>> = {}) {
  const calls: { op: keyof PayPalPort; requestId?: string; args: unknown[] }[] = [];
  const seen = new Map<string, unknown>(); // PayPal-Request-Id → first response (idempotency, as PayPal does)
  const call = async <T>(op: keyof PayPalPort, requestId: string | undefined, args: unknown[], make: () => T): Promise<T> => {
    calls.push({ op, requestId, args });
    if (fail[op]) throw fail[op];
    if (requestId && seen.has(requestId)) return seen.get(requestId) as T;
    const out = make();
    if (requestId) seen.set(requestId, out);
    return out;
  };
  let n = 0;
  const paypal: PayPalPort = {
    createVaultOrder: (input, opts) =>
      call("createVaultOrder", opts?.requestId, [input], () => {
        n++;
        return { id: `ORDER${n}`, status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: `AUTH${n}`, status: "CREATED" }] } }] };
      }),
    authorizeOrder: (id, opts) => call("authorizeOrder", opts?.requestId, [id], () => ({ id, status: "COMPLETED", purchase_units: [{ payments: { authorizations: [{ id: `AUTH-${id}`, status: "CREATED" }] } }] })),
    captureAuthorization: (id, input, opts) => call("captureAuthorization", opts?.requestId, [id, input], () => ({ id: `CAP-${id}`, status: "COMPLETED" })),
    voidAuthorization: (id, opts) => call("voidAuthorization", opts?.requestId, [id], () => undefined),
    refundCapture: (id, input, opts) => call("refundCapture", opts?.requestId, [id, input], () => ({ id: `REF-${id}`, status: "COMPLETED" })),
    createPayout: (input) => call("createPayout", input.senderBatchId, [input], () => ({ batch_header: { payout_batch_id: `BATCH-${input.senderBatchId}`, batch_status: "PENDING" } })),
  };
  return { paypal, calls };
}

export const stubProvider: RenderProvider = {
  name: "test",
  async render(input) {
    return { outputRef: `/demo/${input.renderId}.svg`, sha256: sha256Hex(input.prompt), mime: "image/svg+xml", model: "test" };
  },
};

const { privateKey } = generateKeyPairSync("ed25519");
export function testSign(p: ReceiptPayload): SignedReceipt {
  const c = canonicalJson(p);
  return { payload: p, canonical: c, payloadSha256: sha256Hex(c), signature: sign(null, Buffer.from(c), privateKey).toString("base64"), keyId: "test", alg: "Ed25519" };
}

/** A full engine on fakes, with a settable clock. */
export function testEngine(opts: { licence?: Partial<LicenceView>; mandate?: Partial<MandateView>; fail?: Partial<Record<keyof PayPalPort, Error>>; provider?: RenderProvider; compliance?: EngineDeps["compliance"] } = {}) {
  let now = new Date("2026-11-10T12:00:00Z");
  const store = new MemoryStore(licence(opts.licence, now), mandate(opts.mandate, now), () => now);
  const pp = mockPayPal(opts.fail);
  let receiptN = 0;
  const deps: EngineDeps = {
    store,
    paypal: pp.paypal,
    provider: opts.provider ?? stubProvider,
    compliance: opts.compliance ?? { name: "test", check: async () => ({ ok: true }) },
    sign: testSign,
    now: () => now,
    reviewWindowSeconds: 120,
    newReceiptId: () => `rcp_${++receiptN}`,
  };
  return { deps, store, calls: pp.calls, advance: (ms: number) => (now = new Date(now.getTime() + ms)) };
}
