import "server-only";
/**
 * Demo workspaces: each visitor gets an isolated set of rows (a creator "Rohit" with the demo portrait, and a demo
 * brand), so judges never see each other's licences or renders. "Reset demo" starts a new workspace; the old one is
 * left in place, nothing is deleted.
 * For a 3-minute demo each workspace also starts with a mandate (default limits, waiting for a wallet: "Use demo
 * wallet" or "Save PayPal wallet" activates it) and one licence Rohit has already approved (advertising and social,
 * 10 renders, 30 days). Requesting and approving more licences works as usual.
 */
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { db } from "./db";
import { BANNED_USES, brands, creators, licences, mandates, workspaces } from "./db/schema";
import { newId } from "./errors";

export interface Workspace {
  id: string;
  creatorId: string;
  brandId: string;
}

export async function createWorkspace(opts: { creatorEmail?: string | null; brandName?: string; seedDemo?: boolean } = {}): Promise<Workspace> {
  const id = newId("ws");
  const creatorId = newId("cre");
  const brandId = newId("brd");
  await db().transaction(async (tx) => {
    await tx.insert(workspaces).values({ id });
    await tx.insert(creators).values({
      id: creatorId,
      workspaceId: id,
      name: "Rohit",
      photoRef: "/demo/rohit.svg",
      payoutPaypalEmail: opts.creatorEmail === undefined ? (process.env.PAYPAL_SANDBOX_CREATOR_EMAIL ?? null) : opts.creatorEmail,
      pricePerRenderCents: 200,
      videoMultiplier: 3,
      allowedUses: ["advertising", "social"],
      maxRendersPerLicence: 10,
      maxDays: 30,
    });
    await tx.insert(brands).values({ id: brandId, workspaceId: id, name: opts.brandName ?? "Demo Brand Co." });
    if (opts.seedDemo !== false) {
      const now = Date.now();
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
      await tx.insert(licences).values({
        id: newId("lic"),
        creatorId,
        brandId,
        pricePerRenderCents: 200,
        videoMultiplier: 3,
        allowedUses: ["advertising", "social"],
        bannedUses: [...BANNED_USES],
        renderCap: 10,
        days: 30,
        brief: "Demo: café and lifestyle ads (pre-approved by the demo creator)",
        expiresAt: new Date(now + 30 * 86_400_000),
        status: "active",
        approvedAt: new Date(now),
      });
    }
  });
  return { id, creatorId, brandId };
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  // A live onboarded creator (FEATURE_CREATOR_ONBOARDING) takes over the creator persona; else the seeded one.
  const [onboarded] = await db()
    .select({ id: creators.id })
    .from(creators)
    .where(and(eq(creators.workspaceId, id), isNotNull(creators.googleSub), eq(creators.status, "live")))
    .orderBy(desc(creators.createdAt))
    .limit(1);
  const [seeded] = onboarded ? [onboarded] : await db().select({ id: creators.id }).from(creators).where(eq(creators.workspaceId, id)).orderBy(creators.createdAt).limit(1);
  const c = seeded;
  const [b] = await db().select({ id: brands.id }).from(brands).where(eq(brands.workspaceId, id)).limit(1);
  return c && b ? { id, creatorId: c.id, brandId: b.id } : null;
}
