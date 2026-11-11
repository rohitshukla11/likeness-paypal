import "server-only";
/** Read models for the dashboards (one workspace at a time). */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "./db";
import { brands, creators, licences, mandates, paypalVaultTokens, receipts, refusals, renders } from "./db/schema";
import { utcDayStart } from "./engine/policy";
import { toCard } from "./creator-browse";
import { listFor } from "./licences";

export async function creatorView(creatorId: string) {
  const b = alias(brands, "b");
  // Two round trips: the creator, their licences and their ledger in parallel, then the workspace's cast.
  const [[creator], all, ledger] = await Promise.all([
    db().select().from(creators).where(eq(creators.id, creatorId)),
    listFor("creatorId", creatorId),
    db()
    .select({ render: renders, brandName: b.name, receiptId: receipts.id })
    .from(renders)
    .innerJoin(licences, eq(licences.id, renders.licenceId))
    .innerJoin(b, eq(b.id, licences.brandId))
    .leftJoin(receipts, eq(receipts.renderId, renders.id))
    .where(and(eq(licences.creatorId, creatorId), inArray(renders.status, ["accepted", "rejected", "in_review", "settling", "refunding"])))
    .orderBy(desc(renders.createdAt))
    .limit(100),
  ]);
  const earned = ledger.filter((l) => l.render.status === "accepted").reduce((s, l) => s + l.render.creatorPayoutCents, 0);
  const pending = ledger.filter((l) => ["in_review", "settling"].includes(l.render.status)).reduce((s, l) => s + Math.floor((l.render.amountCents * 90) / 100), 0);
  // The workspace's live creators the visitor can play (the Creator page's switcher), with their waiting requests.
  const cast = creator?.workspaceId
    ? await db()
        .select({
          id: creators.id,
          name: creators.name,
          photoRef: creators.photoRef,
          waiting: sql<number>`(select count(*)::int from ${licences} where ${licences.creatorId} = ${creators.id} and ${licences.status} = 'pending')`,
        })
        .from(creators)
        .where(and(eq(creators.workspaceId, creator.workspaceId), eq(creators.status, "live")))
        .orderBy(creators.createdAt, creators.id)
    : [];
  return {
    cast,
    creator,
    requests: all.filter((l) => l.state === "pending"),
    licences: all.filter((l) => l.state !== "pending"),
    ledger,
    earned,
    pending,
  };
}

/** The brand's current mandate (newest) with its wallet, today's committed spend, and the brand's licences. */
export async function brandView(brandId: string) {
  // Two round trips: the brand, its newest mandate and its licences in parallel, then what depends on them.
  const [[brand], [mandate], brandLicences] = await Promise.all([
    db().select().from(brands).where(eq(brands.id, brandId)),
    db().select().from(mandates).where(eq(mandates.brandId, brandId)).orderBy(desc(mandates.createdAt)).limit(1),
    listFor("brandId", brandId),
  ]);
  const ws = brand?.workspaceId;
  const [[wallet], workspaceCreators, today] = await Promise.all([
    brand?.paymentTokenId ? db().select().from(paypalVaultTokens).where(eq(paypalVaultTokens.paymentTokenId, brand.paymentTokenId)) : Promise.resolve([]),
    // Live creators only: a draft from creator onboarding isn't offered to brands until it goes live.
    ws ? db().select().from(creators).where(and(eq(creators.workspaceId, ws), eq(creators.status, "live"))).orderBy(creators.createdAt, creators.id) : Promise.resolve([]),
    mandate
      ? db()
          .select({ amount: renders.amountCents, createdAt: renders.createdAt })
          .from(renders)
          .where(and(eq(renders.mandateId, mandate.id), eq(renders.reserved, true)))
      : Promise.resolve([]),
  ]);
  const start = utcDayStart(new Date());
  const spentToday = today.filter((r) => r.createdAt >= start).reduce((s, r) => s + r.amount, 0);
  // The creator browser's cards (and the agent's list_creators): terms, niche, synthetic label, this brand's licence.
  const cards = workspaceCreators.map((c) => toCard(c, brandLicences));
  return { brand, mandate: mandate ?? null, wallet: wallet ? { ...wallet, kind: (brand.walletKind ?? "own") as "own" | "demo" } : null, creators: workspaceCreators, cards, licences: brandLicences, spentToday };
}

/** The brand's renders, newest first, with the latest refusal reason and the receipt id. */
export async function brandRenders(brandId: string, limit = 30) {
  const rows = await db()
    .select({ render: renders, receiptId: receipts.id, receiptStatus: receipts.status, creatorName: creators.name, creatorPhoto: creators.photoRef })
    .from(renders)
    .innerJoin(licences, eq(licences.id, renders.licenceId))
    .innerJoin(creators, eq(creators.id, licences.creatorId))
    .leftJoin(receipts, eq(receipts.renderId, renders.id))
    .where(eq(licences.brandId, brandId))
    .orderBy(desc(renders.createdAt))
    .limit(limit);
  const ids = rows.map((r) => r.render.id);
  const why = ids.length ? await db().select().from(refusals).where(inArray(refusals.renderId, ids)).orderBy(desc(refusals.at)) : [];
  const reason = new Map<string, { reason: string; detail: string | null }>();
  for (const w of why) if (w.renderId && !reason.has(w.renderId)) reason.set(w.renderId, { reason: w.reason, detail: w.detail });
  return rows.map((r) => ({ ...r, refusal: reason.get(r.render.id) ?? null }));
}

/** Does this render belong to this brand? (Actions check before acting.) */
export async function renderOfBrand(renderId: string, brandId: string) {
  const [r] = await db()
    .select({ id: renders.id })
    .from(renders)
    .innerJoin(licences, eq(licences.id, renders.licenceId))
    .where(and(eq(renders.id, renderId), eq(licences.brandId, brandId)));
  return !!r;
}
