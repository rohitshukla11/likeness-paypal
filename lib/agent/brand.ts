import "server-only";
/**
 * The brand's agent: chat that makes and pays for licensed ads, and answers money questions.
 * Its own tools run the real engine (licence and mandate check → authorize on the saved wallet → render →
 * compliance → capture), streaming every step; the PayPal Agent Toolkit gives it read tools (list_transactions,
 * get_order). Refusals come back in plain words and end the turn ("Licence revoked: I didn't charge your PayPal.").
 * Caps: AGENT_TURNS_PER_WORKSPACE (20) per demo workspace and AGENT_TURNS_DAILY (400) across all visitors.
 */
import { and, desc, eq, gte, inArray, isNotNull } from "drizzle-orm";
import type { Quota } from "../ai/quota";
import { db } from "../db";
import { creators, licences, mandates, renders } from "../db/schema";
import { newId } from "../errors";
import { licenceState } from "../licences";
import type { EngineDeps, RenderRow } from "../engine/render-and-pay";
import { renderAndPay } from "../engine/render-and-pay";
import { brandView } from "../queries";
import { runAgent, type AgentEvent, type AgentTool } from "./llm";
import { reportingNote, summarizeOrder } from "./paypal-summary";
import type { GenAiLike } from "../ai/gemini";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;

export function agentCaps(env: NodeJS.ProcessEnv = process.env) {
  const n = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) >= 0 && v !== undefined && v !== "" ? Math.floor(Number(v)) : d);
  return { perWorkspace: n(env.AGENT_TURNS_PER_WORKSPACE, 20), daily: n(env.AGENT_TURNS_DAILY, 400) };
}
export const agentKeys = (workspaceId: string, now: Date, caps = agentCaps()) => [
  { key: `agent:day:${now.toISOString().slice(0, 10)}`, limit: caps.daily },
  { key: `agent:ws:${workspaceId}`, limit: caps.perWorkspace },
];

/** What a refusal or failure means for the brand, in plain words. */
export function plainWords(r: Pick<RenderRow, "status" | "amountCents" | "error">, reason: string | null): string | undefined {
  const notCharged = "I didn't charge your PayPal.";
  if (r.status === "refused") {
    const why: Record<string, string> = {
      licence_revoked: "Licence revoked",
      licence_expired: "Licence expired",
      licence_not_active: "There's no active licence",
      render_cap: "This licence has no renders left",
      daily_cap: "That would go over your daily cap",
      budget: "That would go over your total budget",
      per_render_max: "That's above your per-render maximum",
      mandate_not_active: "Your mandate isn't active yet (save a PayPal wallet first)",
      mandate_expired: "Your mandate has expired",
      no_wallet: "You haven't saved a PayPal wallet yet",
      use_banned: "That use is never allowed",
      use_not_allowed: "The licence doesn't allow that use",
      video_not_allowed: "This creator allows images only, not video",
      prompt_refused: `The prompt was refused (${r.error ?? "banned use"})`,
      step_up_declined: "You declined it",
    };
    return `${why[reason ?? ""] ?? `Refused (${r.error ?? reason ?? "policy"})`}: ${notCharged}`;
  }
  if (r.status === "voided" || r.status === "failed") return `The render didn't go through (${r.error ?? r.status}), so I voided the authorization: you weren't charged.`;
  if (r.status === "needs_brand_approval") return `That's ${usd(r.amountCents)}, above your step-up threshold: approve it in the Studio first. Nothing is charged yet.`;
  return undefined;
}

export interface BrandAgentDeps {
  engine: (onStep: EngineDeps["onStep"]) => EngineDeps;
  /** PayPal Agent Toolkit read tools (list_transactions, get_order), already bound to the sandbox. */
  paypalRead: Record<string, (args: Record<string, unknown>) => Promise<unknown>>;
  quota: Quota;
  client?: GenAiLike;
  now?: () => Date;
}

const SYSTEM = `You are the brand's ad agent in Likeness × PayPal, a PayPal sandbox demo. You make licensed AI ads of a creator and pay for them through the brand's saved PayPal wallet, and you answer questions about the brand's spend.
Rules:
- To make an ad, call make_ad once. Pass the brand's request as the prompt in your own words (a short visual brief), the kind (image, or video if asked) and the aspect ratio if one is given (9:16, 16:9 or 1:1). Name the creator if the user does.
- "Make another one" means: call make_ad again with the previous brief (or a close variation).
- Never claim money moved unless a tool said so. Quote amounts and statuses from tool results; don't invent ids.
- After an ad is made, say in one or two sentences what happened (authorized, rendered, checked, captured) and that the brand can Accept (the creator is paid 90% and the receipt is signed) or Reject (refund) in the Studio before the review window closes.
- For spend questions, call spend_summary, then list_transactions. Answer with the figures from spend_summary. If list_transactions returns a "note", add that note as one short sentence, word for word, and say nothing else about PayPal's reporting; otherwise you may add how many of the brand's transactions PayPal already shows ("yours"). Never quote the whole merchant account's figures as the brand's. Two sentences at most.
- For PayPal's record of an ad ("show me PayPal's record for my last ad"), call get_order (leave id empty for the last ad) and summarise in one or two sentences: the order status, the authorization amount and status, the capture amount and status, and the capture id (and the refund, if there is one).
- For anything about licences, the wallet or limits, call get_status.
- Keep answers short and plain. No markdown tables.`;

export async function runBrandAgent(input: { workspaceId: string; brandId: string; history: { role: "user" | "model"; text: string }[]; emit: (e: AgentEvent) => void; deps: BrandAgentDeps }) {
  const { deps, brandId } = input;
  const now = deps.now ?? (() => new Date());
  if (!(await deps.quota.reserve(agentKeys(input.workspaceId, now())))) {
    const c = agentCaps();
    const text = `The agent has reached its limit (${c.perWorkspace} turns per demo workspace, ${c.daily} a day across the demo). You can still make ads in the Studio form.`;
    input.emit({ t: "text", text });
    input.emit({ t: "done", usage: { model: "-", promptTokens: 0, outputTokens: 0, thoughtTokens: 0, costUsd: 0 } });
    return { text };
  }

  const tools: AgentTool[] = [
    {
      name: "get_status",
      description: "The brand's PayPal wallet, mandate limits and spend, and its licences (creator, uses, renders left, status, price).",
      parameters: { type: "object", properties: {} },
      async run() {
        const v = await brandView(brandId);
        return {
          wallet: v.wallet ? (v.wallet.kind === "demo" ? "demo wallet (shared sandbox buyer)" : `saved (${v.wallet.payerEmail ?? "PayPal"})`) : "not saved",
          mandate: v.mandate
            ? { status: v.mandate.status, perRenderMax: usd(v.mandate.maxPerRenderCents), dailyCap: usd(v.mandate.dailyCapCents), spentToday: usd(v.spentToday), budget: usd(v.mandate.totalBudgetCents), spent: usd(v.mandate.spentCents), stepUpAbove: usd(v.mandate.stepUpThresholdCents) }
            : null,
          licences: v.licences.map((l) => ({ creator: l.creatorName, state: l.state, uses: l.allowedUses, renders: `${l.rendersUsed}/${l.renderCap}`, pricePerImage: usd(l.pricePerRenderCents), pricePerVideo: usd(l.pricePerRenderCents * l.videoMultiplier), until: l.expiresAt?.toISOString().slice(0, 10) ?? null })),
        };
      },
      summarize: (r) => {
        const x = r as { wallet: string; licences: unknown[] };
        return `wallet ${x.wallet}, ${x.licences.length} licence(s)`;
      },
    },
    {
      name: "make_ad",
      description: "Make one licensed ad and pay for it: licence and mandate check, authorize on the saved PayPal wallet, render, compliance check, capture. Returns the render and its PayPal ids, or why it was refused (then nothing is charged).",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "A short visual brief for the ad" },
          kind: { type: "string", enum: ["image", "video"], description: "image (default) or video" },
          aspect: { type: "string", enum: ["1:1", "9:16", "16:9"], description: "Aspect ratio for an image (default 1:1)" },
          creator: { type: "string", description: "The creator's name, e.g. Rohit" },
          use: { type: "string", description: "The licensed use (default: the licence's first use, e.g. advertising)" },
        },
        required: ["prompt"],
      },
      async run(args) {
        const prompt = String(args.prompt ?? "").trim().slice(0, 1000);
        if (prompt.length < 5) return { status: "invalid", say: "Tell me a little about the ad you want (at least a few words)." };
        const kind = args.kind === "video" ? "video" : "image";
        const aspect = (["1:1", "9:16", "16:9"] as const).find((a) => a === args.aspect) ?? (kind === "video" ? null : "1:1");
        const name = typeof args.creator === "string" ? args.creator.toLowerCase() : "";
        const all = await db()
          .select({ l: licences, creatorName: creators.name })
          .from(licences)
          .innerJoin(creators, eq(creators.id, licences.creatorId))
          .where(and(eq(licences.brandId, brandId), inArray(licences.status, ["active", "revoked", "expired"])))
          .orderBy(desc(licences.createdAt));
        const mine = all.filter((x) => !name || x.creatorName.toLowerCase().includes(name));
        // The active licence if there is one; else the newest, so the engine refuses it for the real reason (e.g. revoked).
        const pick = mine.find((x) => licenceState(x.l) === "active") ?? mine[0];
        if (!pick) return { status: "no_licence", say: `You don't have a licence${name ? ` for ${args.creator}` : ""} yet: request one on the Brand page and have the creator approve it. I didn't charge your PayPal.` };
        const [m] = await db().select().from(mandates).where(eq(mandates.brandId, brandId)).orderBy(desc(mandates.createdAt)).limit(1);
        if (!m) return { status: "no_mandate", say: "You haven't set up a mandate yet: save one (and a PayPal wallet) on the Brand page. I didn't charge your PayPal." };
        const use = typeof args.use === "string" && pick.l.allowedUses.includes(args.use) ? args.use : pick.l.allowedUses[0];
        let fromRenderId: string | null = null;
        if (kind === "video") {
          const [img] = await db()
            .select({ id: renders.id })
            .from(renders)
            .where(and(eq(renders.licenceId, pick.l.id), eq(renders.kind, "image"), inArray(renders.status, ["in_review", "accepted"])))
            .orderBy(desc(renders.createdAt))
            .limit(1);
          fromRenderId = img?.id ?? null;
        }
        let reason: string | null = null;
        const r = await renderAndPay(
          { renderId: newId("rnd"), licenceId: pick.l.id, mandateId: m.id, kind, aspect, fromRenderId, use, prompt },
          deps.engine((e) => {
            if (e && (e.status === "refused" || e.status === "failed")) reason = (e.ids?.reason as string | null) ?? (e.step === "prompt_check" ? "prompt_refused" : null);
            input.emit({ t: "step", renderId: e!.renderId, step: e!.step, status: e!.status, detail: e!.detail, ids: e!.ids });
          }),
        );
        if (r.status === "refused" && !reason) {
          const { refusals } = await import("../db/schema");
          const [ref] = await db().select().from(refusals).where(eq(refusals.renderId, r.id)).limit(1);
          reason = ref?.reason ?? null;
        }
        return {
          status: r.status,
          render_id: r.id,
          creator: pick.creatorName,
          kind,
          aspect,
          amount: usd(r.amountCents),
          model: r.model,
          note: r.renderNote,
          paypal: { order: r.orderId, authorization: r.authorizationId, capture: r.captureId },
          review_deadline: r.reviewDeadline?.toISOString() ?? null,
          say: plainWords(r, reason),
        };
      },
      summarize: (r) => {
        const x = r as { status: string; amount?: string; render_id?: string };
        return `${x.status}${x.amount ? `, ${x.amount}` : ""}`;
      },
      finalText: (r) => (r as { say?: string }).say,
    },
    {
      name: "spend_summary",
      description: "The brand's spend from this app's records over the last N days: captured, refunded, net, paid to creators, and the renders.",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How many days back (default 7)" } } },
      async run(args) {
        const days = Math.min(90, Math.max(1, Math.floor(Number(args.days ?? 7)) || 7));
        const since = new Date(now().getTime() - days * 86_400_000);
        const rows = await db()
          .select({ r: renders })
          .from(renders)
          .innerJoin(licences, eq(licences.id, renders.licenceId))
          .where(and(eq(licences.brandId, brandId), gte(renders.createdAt, since)));
        const captured = rows.filter((x) => x.r.captureId);
        const sum = (xs: typeof rows, f: (r: (typeof rows)[number]["r"]) => number) => xs.reduce((s, x) => s + f(x.r), 0);
        const refunded = captured.filter((x) => x.r.refundId);
        return {
          period: `last ${days} days (since ${since.toISOString().slice(0, 10)})`,
          captured: usd(sum(captured, (r) => r.amountCents)),
          refunded: usd(sum(refunded, (r) => r.amountCents)),
          net: usd(sum(captured, (r) => r.amountCents) - sum(refunded, (r) => r.amountCents)),
          paidToCreators: usd(sum(captured, (r) => r.creatorPayoutCents)),
          ads: {
            captured: captured.length,
            capturedOfWhichStillInReview: rows.filter((x) => x.r.status === "in_review").length,
            refunded: refunded.length,
            refusedOrVoidedNotCharged: rows.filter((x) => ["refused", "voided", "failed"].includes(x.r.status)).length,
          },
        };
      },
      summarize: (r) => {
        const x = r as { net: string; ads: { captured: number } };
        return `net ${x.net}, ${x.ads.captured} captured`;
      },
    },
    {
      name: "list_transactions",
      description: "PayPal Agent Toolkit (read): the merchant's PayPal transactions from PayPal's reporting, over the last N days (default 7, at most 31).",
      parameters: { type: "object", properties: { days: { type: "integer", description: "How many days back (default 7)" } } },
      async run(args) {
        // Dates come from the server's clock, not the model's guess; PayPal searches at most 31 days.
        const days = Math.min(31, Math.max(1, Math.floor(Number(args.days ?? 7)) || 7));
        const end = now().toISOString().slice(0, 10);
        const start = new Date(now().getTime() - days * 86_400_000).toISOString().slice(0, 10);
        const raw = (await deps.paypalRead.list_transactions({ start_date: `${start}T00:00:00Z`, end_date: `${end}T23:59:59Z`, page_size: 100 })) as unknown;
        const data = typeof raw === "string" ? JSON.parse(raw) : raw;
        const list = ((data as { transaction_details?: { transaction_info?: { transaction_id?: string; transaction_event_code?: string; transaction_status?: string; transaction_amount?: { value?: string; currency_code?: string }; transaction_initiation_date?: string } }[] })?.transaction_details ?? []).map((t) => t.transaction_info ?? {});
        // The PayPal account is the whole demo's merchant account: match its transactions to THIS brand's captures
        // and refunds (a capture's id is its PayPal transaction id).
        const mine = await db()
          .select({ capture: renders.captureId, refund: renders.refundId })
          .from(renders)
          .innerJoin(licences, eq(licences.id, renders.licenceId))
          .where(and(eq(licences.brandId, brandId), gte(renders.createdAt, new Date(`${start}T00:00:00Z`))));
        const ids = new Set(mine.flatMap((m) => [m.capture, m.refund]).filter((x): x is string => !!x));
        const yours = list.filter((t) => t.transaction_id && ids.has(t.transaction_id));
        const sum = (xs: typeof list) => `$${xs.reduce((acc, t) => acc + Number(t.transaction_amount?.value ?? 0), 0).toFixed(2)}`;
        return {
          range: `${start} to ${end}`,
          yours: { foundInPayPal: yours.length, ofYourCapturesAndRefunds: ids.size, net: sum(yours), transactions: yours.slice(-8).map((t) => ({ id: t.transaction_id, status: t.transaction_status, amount: t.transaction_amount?.value, date: t.transaction_initiation_date?.slice(0, 10) })) },
          ...(ids.size && reportingNote(yours.length) ? { note: reportingNote(yours.length) } : {}),
          wholeDemoMerchantAccount: { count: list.length, note: "all demo brands share one sandbox merchant account" },
        };
      },
      summarize: (r) => {
        const x = r as { yours: { foundInPayPal: number; ofYourCapturesAndRefunds: number } };
        return `PayPal shows ${x.yours.foundInPayPal} of your ${x.yours.ofYourCapturesAndRefunds} capture/refund transaction(s)`;
      },
    },
    {
      name: "get_order",
      description: "PayPal Agent Toolkit (read): PayPal's own record of one of the brand's ads (its order: status, authorization, capture, refund). Leave id empty for the brand's last ad.",
      parameters: { type: "object", properties: { id: { type: "string", description: "A PayPal order id of one of the brand's ads (default: the last ad)" } } },
      async run(args) {
        const asked = typeof args.id === "string" && args.id.trim() ? args.id.trim() : null;
        // Only the brand's own orders: the last ad's, or one it names that belongs to one of its renders.
        const [r] = await db()
          .select({ orderId: renders.orderId, renderId: renders.id, createdAt: renders.createdAt })
          .from(renders)
          .innerJoin(licences, eq(licences.id, renders.licenceId))
          .where(and(eq(licences.brandId, brandId), asked ? eq(renders.orderId, asked) : isNotNull(renders.orderId)))
          .orderBy(desc(renders.createdAt))
          .limit(1);
        if (!r?.orderId) return { error: asked ? "that order isn't one of your ads" : "you haven't made a paid ad yet" };
        const o = summarizeOrder(await deps.paypalRead.get_order({ id: r.orderId }));
        return { ad: { render: r.renderId, made: r.createdAt.toISOString().slice(0, 16).replace("T", " ") + " UTC" }, ...o };
      },
      summarize: (r) => {
        const x = r as { orderStatus?: string; capture?: { id?: string | null; amount?: string | null } | null; error?: string };
        return x.error ?? `order ${x.orderStatus ?? "?"}${x.capture ? `, capture ${x.capture.amount ?? "?"} (${x.capture.id})` : ""}`;
      },
    },
  ];
  const system = `${SYSTEM}\nToday is ${now().toISOString().slice(0, 10)} (UTC).`;
  return runAgent({ system, history: input.history.slice(-12), tools, emit: input.emit, client: deps.client });
}
