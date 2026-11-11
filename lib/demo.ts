import "server-only";
/**
 * Demo workspaces: each visitor gets an isolated set of rows (a creator "Rohit" with the demo portrait, and a demo
 * brand), so judges never see each other's licences or renders. A visitor keeps their workspace (a cookie); nothing
 * is deleted.
 * Each new workspace also gets two SYNTHETIC creators (fictional people with AI-generated faces, lib/personas.ts),
 * so the brand's creator filter has something to filter.
 * For a 3-minute demo each workspace also starts with a mandate (default limits, waiting for a wallet: "Use demo
 * wallet" or "Save PayPal wallet" activates it), one licence Rohit has already approved (advertising and social,
 * 10 renders, 30 days) and one from Theo (synthetic); Maya (synthetic) starts with none, so a request to her shows
 * the creator's side ("Review with agent"). Requesting and approving more licences works as usual.
 * The visitor plays one creator at a time (lk_cre, lib/session.ts): Rohit unless they pick another.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { BANNED_USES, brands, creators, licences, mandates, workspaces } from "./db/schema";
import { newId } from "./errors";
import { PERSONAS } from "./personas";

export interface Workspace {
  id: string;
  creatorId: string;
  brandId: string;
}

export async function createWorkspace(opts: { creatorEmail?: string | null; brandName?: string; seedDemo?: boolean } = {}): Promise<Workspace> {
  const id = newId("ws");
  const brandId = newId("brd");
  // Rohit always; the two synthetic creators only in a demo workspace (not in the e2e's bare workspaces).
  const seeded = PERSONAS.filter((p) => p.key === "rohit" || opts.seedDemo !== false).map((p) => ({ p, id: newId("cre") }));
  const creatorId = seeded[0].id;
  await db().transaction(async (tx) => {
    const now = Date.now();
    await tx.insert(workspaces).values({ id });
    await tx.insert(creators).values(
      seeded.map(({ p, id: cid }, i) => ({
        id: cid,
        workspaceId: id,
        name: p.name,
        photoRef: p.photo,
        // One sandbox payout account for all three (the synthetic creators share the demo's).
        payoutPaypalEmail: opts.creatorEmail === undefined ? (process.env.PAYPAL_SANDBOX_CREATOR_EMAIL ?? null) : opts.creatorEmail,
        ...p.terms,
        // Distinct times, so "the workspace's first creator" is always Rohit.
        createdAt: new Date(now + i),
      })),
    );
    await tx.insert(brands).values({ id: brandId, workspaceId: id, name: opts.brandName ?? "Demo Brand Co." });
    if (opts.seedDemo !== false) {
      await tx.insert(mandates).values({
        id: newId("man"),
        brandId,
        maxPerRenderCents: 1000,
        dailyCapCents: 2000,
        totalBudgetCents: 5000,
        stepUpThresholdCents: 800,
        expiresAt: new Date(now + 30 * 86_400_000),
        status: "pending_wallet",
      });
      // Rohit's licence is the newest, so "make an ad" without a name uses Rohit.
      const withLicence = seeded.filter(({ p }) => p.seededLicence);
      await tx.insert(licences).values(
        withLicence.map(({ p, id: cid }) => ({
          id: newId("lic"),
          creatorId: cid,
          brandId,
          pricePerRenderCents: p.terms.pricePerRenderCents,
          videoMultiplier: p.terms.videoMultiplier,
          allowedUses: p.seededLicence!.allowedUses,
          bannedUses: [...BANNED_USES],
          renderCap: p.seededLicence!.renderCap,
          days: p.seededLicence!.days,
          brief: p.seededLicence!.brief,
          expiresAt: new Date(now + p.seededLicence!.days * 86_400_000),
          status: "active",
          approvedAt: new Date(now),
          createdAt: new Date(p.key === "rohit" ? now : now - 60_000),
        })),
      );
    }
  });
  return { id, creatorId, brandId };
}

export async function getWorkspace(id: string, preferredCreatorId?: string | null): Promise<Workspace | null> {
  // The creator the visitor chose to play (one of this workspace's live creators), else a live onboarded creator
  // (FEATURE_CREATOR_ONBOARDING), else the seeded one (Rohit, the workspace's first creator).
  const live = and(eq(creators.workspaceId, id), eq(creators.status, "live"));
  const [chosen] = preferredCreatorId ? await db().select({ id: creators.id }).from(creators).where(and(live, eq(creators.id, preferredCreatorId))) : [];
  const [onboarded] = chosen
    ? [chosen]
    : await db()
        .select({ id: creators.id })
        .from(creators)
        .where(and(live, isNotNull(creators.googleSub)))
        .orderBy(desc(creators.createdAt))
        .limit(1);
  const [c] = onboarded ? [onboarded] : await db().select({ id: creators.id }).from(creators).where(eq(creators.workspaceId, id)).orderBy(creators.createdAt, creators.id).limit(1);
  const [b] = await db().select({ id: brands.id }).from(brands).where(eq(brands.workspaceId, id)).limit(1);
  return c && b ? { id, creatorId: c.id, brandId: b.id } : null;
}
