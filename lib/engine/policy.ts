/**
 * The mandate checker: may this render be charged to the brand's saved PayPal wallet, under this licence, right now?
 * Pure (no I/O, no clock of its own): the engine runs it inside the policy transaction with the licence and mandate
 * rows locked and today's spend summed, and the unit tests run it directly. Any refusal means no PayPal call.
 * Amounts in integer cents.
 */

/** Uses no licence may ever allow, whatever its terms say. */
export const BANNED_USES = ["political", "adult", "minors", "impersonation", "deception"] as const;

export interface LicenceView {
  status: string; // pending | active | declined | revoked | expired
  revokedAt: Date | null;
  expiresAt: Date | null;
  allowedUses: string[];
  bannedUses: string[];
  renderCap: number;
  rendersUsed: number;
  pricePerRenderCents: number;
  videoMultiplier: number;
}

export interface MandateView {
  status: string; // pending_wallet | active | revoked | expired
  expiresAt: Date;
  paymentTokenId: string | null;
  maxPerRenderCents: number;
  dailyCapCents: number;
  totalBudgetCents: number;
  spentCents: number;
  stepUpThresholdCents: number;
}

export interface RenderAsk {
  kind: "image" | "video";
  use: string;
  /** What this mandate has already committed today (UTC), in cents. */
  spentTodayCents: number;
  /** The brand approved this render above the step-up threshold. */
  stepUpApproved?: boolean;
  now: Date;
}

export type RefusalCode =
  | "licence_revoked"
  | "licence_not_active"
  | "licence_expired"
  | "use_banned"
  | "use_not_allowed"
  | "video_not_allowed"
  | "render_cap"
  | "mandate_not_active"
  | "mandate_expired"
  | "no_wallet"
  | "per_render_max"
  | "daily_cap"
  | "budget";

export type Verdict = { ok: true; amountCents: number } | { ok: false; code: RefusalCode; reason: string } | { ok: "step_up"; amountCents: number; reason: string };

const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;

/** The price of one render under a licence: video costs videoMultiplier × the per-render price (0: image only). */
export const priceOf = (l: Pick<LicenceView, "pricePerRenderCents" | "videoMultiplier">, kind: RenderAsk["kind"]) => l.pricePerRenderCents * (kind === "video" ? l.videoMultiplier : 1);

/** The creator's 90% and the platform's 10% of a captured render (the creator gets the odd cent's floor). */
export function splitPayout(amountCents: number) {
  const creatorCents = Math.floor((amountCents * 90) / 100);
  return { creatorCents, feeCents: amountCents - creatorCents };
}

/** Midnight UTC of the day `now` falls in: daily caps count from here. */
export const utcDayStart = (now: Date) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

/** Licence first (the creator's consent), then the mandate (the brand's money), then the step-up threshold. */
export function checkRender(l: LicenceView, m: MandateView, ask: RenderAsk): Verdict {
  const no = (code: RefusalCode, reason: string): Verdict => ({ ok: false, code, reason });
  if (l.revokedAt || l.status === "revoked") return no("licence_revoked", "the creator revoked this licence");
  if (l.status !== "active") return no("licence_not_active", `the licence is ${l.status}`);
  if (!l.expiresAt || ask.now >= l.expiresAt) return no("licence_expired", "the licence has expired");
  if ((BANNED_USES as readonly string[]).includes(ask.use) || l.bannedUses.includes(ask.use)) return no("use_banned", `${ask.use} use is never allowed`);
  if (!l.allowedUses.includes(ask.use)) return no("use_not_allowed", `the licence doesn't allow ${ask.use} use`);
  if (ask.kind === "video" && l.videoMultiplier <= 0) return no("video_not_allowed", "the licence is for images only (the creator doesn't allow video)");
  if (l.rendersUsed >= l.renderCap) return no("render_cap", `all ${l.renderCap} renders of this licence are used`);

  const amountCents = priceOf(l, ask.kind);
  if (m.status !== "active") return no("mandate_not_active", m.status === "pending_wallet" ? "the brand hasn't saved a PayPal wallet yet" : `the mandate is ${m.status}`);
  if (ask.now >= m.expiresAt) return no("mandate_expired", "the brand's mandate has expired");
  if (!m.paymentTokenId) return no("no_wallet", "the brand hasn't saved a PayPal wallet yet");
  if (amountCents > m.maxPerRenderCents) return no("per_render_max", `${usd(amountCents)} is above the mandate's ${usd(m.maxPerRenderCents)} per render`);
  if (ask.spentTodayCents + amountCents > m.dailyCapCents) {
    return no("daily_cap", `daily cap: ${usd(ask.spentTodayCents)} of ${usd(m.dailyCapCents)} spent today, ${usd(amountCents)} more would exceed it`);
  }
  if (m.spentCents + amountCents > m.totalBudgetCents) {
    return no("budget", `budget: ${usd(m.spentCents)} of ${usd(m.totalBudgetCents)} spent, ${usd(amountCents)} more would exceed it`);
  }
  if (amountCents > m.stepUpThresholdCents && !ask.stepUpApproved) {
    return { ok: "step_up", amountCents, reason: `${usd(amountCents)} is above the ${usd(m.stepUpThresholdCents)} step-up threshold: the brand approves it first` };
  }
  return { ok: true, amountCents };
}
