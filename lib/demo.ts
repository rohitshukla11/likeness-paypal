import "server-only";
/**
 * Demo workspaces: each visitor gets an isolated set of rows (a creator "Rohit" with the demo portrait, and a demo
 * brand), so judges never see each other's licences or renders. "Reset demo" starts a new workspace; the old one is
 * left in place, nothing is deleted.
 */
import { eq } from "drizzle-orm";
import { db } from "./db";
import { brands, creators, workspaces } from "./db/schema";
import { newId } from "./errors";

export interface Workspace {
  id: string;
  creatorId: string;
  brandId: string;
}

export async function createWorkspace(opts: { creatorEmail?: string | null; brandName?: string } = {}): Promise<Workspace> {
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
  });
  return { id, creatorId, brandId };
}

export async function getWorkspace(id: string): Promise<Workspace | null> {
  const [c] = await db().select({ id: creators.id }).from(creators).where(eq(creators.workspaceId, id)).limit(1);
  const [b] = await db().select({ id: brands.id }).from(brands).where(eq(brands.workspaceId, id)).limit(1);
  return c && b ? { id, creatorId: c.id, brandId: b.id } : null;
}
