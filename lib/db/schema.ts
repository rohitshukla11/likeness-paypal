/** Database schema (Drizzle, Postgres on Neon). Money is stored in integer cents with a currency code. */
import { sql } from "drizzle-orm";
import { boolean, customType, index, integer, pgTable, text, timestamp, uniqueIndex, type AnyPgColumn } from "drizzle-orm/pg-core";
import { BANNED_USES } from "../engine/policy";

export { BANNED_USES };

/** Raw bytes (Postgres bytea) as a Node Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

const ts = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => ts("created_at").notNull().defaultNow();

/** Uses a creator can offer. */
export const USES = ["advertising", "social", "editorial", "internal"] as const;

// ---------------------------------------------------------------- PayPal records

/** A brand's saved PayPal wallet: the approved setup token and the payment token (vault_id) made from it. */
export const paypalVaultTokens = pgTable("paypal_vault_tokens", {
  paymentTokenId: text("payment_token_id").primaryKey(),
  setupTokenId: text("setup_token_id").notNull(),
  customerId: text("customer_id"),
  payerEmail: text("payer_email"),
  /** The brand that saved it (null for wallets saved by scripts). */
  brandId: text("brand_id").references((): AnyPgColumn => brands.id),
  createdAt: createdAt(),
});

/** An order charged to a saved wallet: its authorization, and then a capture (and refund) or a void. */
export const paypalOrders = pgTable("paypal_orders", {
  orderId: text("order_id").primaryKey(),
  paymentTokenId: text("payment_token_id").references(() => paypalVaultTokens.paymentTokenId),
  status: text("status").notNull(),
  authorizationId: text("authorization_id"),
  authorizationStatus: text("authorization_status"),
  captureId: text("capture_id"),
  refundId: text("refund_id"),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  customId: text("custom_id"),
  createdAt: createdAt(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

/** A payout to a creator. sender_batch_id is the idempotency key (the render id for render payouts). */
export const paypalPayouts = pgTable("paypal_payouts", {
  senderBatchId: text("sender_batch_id").primaryKey(),
  payoutBatchId: text("payout_batch_id"),
  receiverEmail: text("receiver_email").notNull(),
  amountCents: integer("amount_cents").notNull(),
  currency: text("currency").notNull().default("USD"),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

// ---------------------------------------------------------------- People

/** A demo visitor's isolated workspace: every creator and brand belongs to one. */
export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  createdAt: createdAt(),
});

/** A creator: whose face, where to pay them, and their default terms for new licences. */
export const creators = pgTable(
  "creators",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    name: text("name").notNull(),
    /** Path or storage key of the creator's reference photo (e.g. /demo/rohit.svg). */
    photoRef: text("photo_ref"),
    payoutPaypalEmail: text("payout_paypal_email"),
    pricePerRenderCents: integer("price_per_render_cents").notNull().default(200),
    videoMultiplier: integer("video_multiplier").notNull().default(3),
    allowedUses: text("allowed_uses").array().notNull().default(sql`ARRAY['advertising','social']::text[]`),
    maxRendersPerLicence: integer("max_renders_per_licence").notNull().default(10),
    maxDays: integer("max_days").notNull().default(30),
    acceptingLicences: boolean("accepting_licences").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index("creators_workspace_idx").on(t.workspaceId)],
);

/** A brand. pendingSetupTokenId is the Vault setup token its owner is approving right now. */
export const brands = pgTable(
  "brands",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id").references(() => workspaces.id),
    name: text("name").notNull(),
    pendingSetupTokenId: text("pending_setup_token_id"),
    /** The wallet this brand's mandate charges: its own saved wallet, or the shared sandbox demo wallet. */
    paymentTokenId: text("payment_token_id").references((): AnyPgColumn => paypalVaultTokens.paymentTokenId),
    /** own | demo */
    walletKind: text("wallet_kind"),
    createdAt: createdAt(),
  },
  (t) => [index("brands_workspace_idx").on(t.workspaceId)],
);

// ---------------------------------------------------------------- Licences and mandates

/**
 * The creator's approval, once: this brand may use this face for these uses, at this price, for this many renders,
 * until expires_at. A request is a licence in status pending; the creator approves (active) or declines it.
 * Banned uses are fixed (BANNED_USES) and stored on each licence so its receipt shows them.
 */
export const licences = pgTable(
  "licences",
  {
    id: text("id").primaryKey(),
    creatorId: text("creator_id").notNull().references(() => creators.id),
    brandId: text("brand_id").notNull().references(() => brands.id),
    pricePerRenderCents: integer("price_per_render_cents").notNull(),
    videoMultiplier: integer("video_multiplier").notNull().default(3),
    allowedUses: text("allowed_uses").array().notNull(),
    bannedUses: text("banned_uses").array().notNull().default(sql`ARRAY['political','adult','minors','impersonation','deception']::text[]`),
    renderCap: integer("render_cap").notNull(),
    rendersUsed: integer("renders_used").notNull().default(0),
    /** Days asked for; expires_at is set from it when the creator approves. */
    days: integer("days").notNull(),
    brief: text("brief"),
    expiresAt: ts("expires_at"),
    /** pending | active | declined | revoked | expired */
    status: text("status").notNull().default("pending"),
    termsSha256: text("terms_sha256"),
    approvedAt: ts("approved_at"),
    declinedAt: ts("declined_at"),
    revokedAt: ts("revoked_at"),
    createdAt: createdAt(),
  },
  (t) => [index("licences_creator_idx").on(t.creatorId), index("licences_brand_idx").on(t.brandId)],
);

/**
 * The brand's approval, once: its PayPal wallet (vault token) and the limits its renders are charged within.
 * spent_cents counts captured and in-flight renders (released on void or refund).
 */
export const mandates = pgTable(
  "mandates",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id").notNull().references(() => brands.id),
    paymentTokenId: text("payment_token_id").references(() => paypalVaultTokens.paymentTokenId),
    maxPerRenderCents: integer("max_per_render_cents").notNull(),
    dailyCapCents: integer("daily_cap_cents").notNull(),
    totalBudgetCents: integer("total_budget_cents").notNull(),
    spentCents: integer("spent_cents").notNull().default(0),
    /** Renders priced above this wait for the brand's explicit approval (needs_brand_approval). */
    stepUpThresholdCents: integer("step_up_threshold_cents").notNull(),
    expiresAt: ts("expires_at").notNull(),
    /** pending_wallet | active | revoked | expired */
    status: text("status").notNull().default("pending_wallet"),
    termsSha256: text("terms_sha256"),
    createdAt: createdAt(),
  },
  (t) => [index("mandates_brand_idx").on(t.brandId)],
);

// ---------------------------------------------------------------- Renders, receipts, refusals

/**
 * One render and its money. id is the idempotency key for everything: PayPal-Request-Ids derive from it and the
 * creator's payout uses it as sender_batch_id.
 * status: needs_brand_approval | authorized | rendering | captured | in_review | settling | accepted | refunding |
 *         rejected | voided | refused | failed
 */
export const renders = pgTable(
  "renders",
  {
    id: text("id").primaryKey(),
    licenceId: text("licence_id").notNull().references(() => licences.id),
    mandateId: text("mandate_id").notNull().references(() => mandates.id),
    /** image | video */
    kind: text("kind").notNull(),
    use: text("use").notNull(),
    prompt: text("prompt").notNull(),
    promptSha256: text("prompt_sha256").notNull(),
    outputRef: text("output_ref"),
    outputSha256: text("output_sha256"),
    outputMime: text("output_mime"),
    model: text("model"),
    /** Shown with the render, e.g. "demo render: the daily AI image cap is reached". */
    renderNote: text("render_note"),
    status: text("status").notNull(),
    amountCents: integer("amount_cents").notNull(),
    currency: text("currency").notNull().default("USD"),
    platformFeeCents: integer("platform_fee_cents").notNull().default(0),
    creatorPayoutCents: integer("creator_payout_cents").notNull().default(0),
    /** True while amount_cents is counted in the mandate's spent_cents and the licence's renders_used. */
    reserved: boolean("reserved").notNull().default(false),
    orderId: text("order_id").references(() => paypalOrders.orderId),
    authorizationId: text("authorization_id"),
    captureId: text("capture_id"),
    refundId: text("refund_id"),
    payoutBatchId: text("payout_batch_id"),
    payoutSenderBatchId: text("payout_sender_batch_id").references(() => paypalPayouts.senderBatchId),
    reviewDeadline: ts("review_deadline"),
    /** accept | reject | auto_accept */
    decision: text("decision"),
    decidedAt: ts("decided_at"),
    error: text("error"),
    createdAt: createdAt(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("renders_licence_idx").on(t.licenceId), index("renders_mandate_idx").on(t.mandateId), index("renders_status_deadline_idx").on(t.status, t.reviewDeadline)],
);

/** The signed receipt of a settled render (Ed25519 over the canonical JSON payload). status: licensed | refunded */
export const receipts = pgTable(
  "receipts",
  {
    id: text("id").primaryKey(),
    renderId: text("render_id").notNull().references(() => renders.id),
    canonicalPayload: text("canonical_payload").notNull(),
    payloadSha256: text("payload_sha256").notNull(),
    signature: text("signature").notNull(),
    alg: text("alg").notNull().default("Ed25519"),
    keyId: text("key_id").notNull(),
    status: text("status").notNull(),
    outputSha256: text("output_sha256"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("receipts_render_idx").on(t.renderId), index("receipts_output_sha_idx").on(t.outputSha256)],
);

/** Why a render was refused or failed before money moved (policy refusals make no PayPal call at all). */
export const refusals = pgTable(
  "refusals",
  {
    id: text("id").primaryKey(),
    renderId: text("render_id").references(() => renders.id),
    licenceId: text("licence_id").references(() => licences.id),
    mandateId: text("mandate_id").references(() => mandates.id),
    /** A short code (licence_revoked, daily_cap, render_failed, …) */
    reason: text("reason").notNull(),
    detail: text("detail"),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("refusals_render_idx").on(t.renderId)],
);

/** A generated file (image or video), stored with its render: there is no object store in this deployment. */
export const renderMedia = pgTable("render_media", {
  renderId: text("render_id")
    .primaryKey()
    .references(() => renders.id),
  mime: text("mime").notNull(),
  sha256: text("sha256").notNull(),
  bytes: bytea("bytes").notNull(),
  createdAt: createdAt(),
});

/**
 * AI spend caps as atomic counters: key → count. A render reserves its keys in one transaction
 * (UPDATE … WHERE count < limit), so two concurrent renders can never both take the last slot.
 * Keys: image:day:<YYYY-MM-DD>, image:ws:<workspace id>, video:total.
 */
export const aiQuota = pgTable("ai_quota", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});
