import "server-only";
/**
 * Licence requests, the creator's decision, licences and revocation, in Postgres (Drizzle). A request is a licence
 * row in status pending; the creator approves it (active, with expires_at and the terms' sha256 fixed then) or
 * declines it. Each decision and each revocation is one transaction holding the licence row (SELECT … FOR UPDATE),
 * so a revocation and a render's policy check can't interleave: a revoked licence refuses every later render.
 */
import { and, desc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { canonicalJson, sha256Hex } from "./canonical";
import { db } from "./db";
import { BANNED_USES, brands, creators, licences } from "./db/schema";
import { HttpError, newId } from "./errors";

export type Licence = typeof licences.$inferSelect;
/** What a licence is now: its stored status, or expired / used up when time or renders have run out. */
export type LicenceState = "pending" | "active" | "declined" | "revoked" | "expired" | "exhausted";

export function licenceState(l: Pick<Licence, "status" | "expiresAt" | "rendersUsed" | "renderCap" | "revokedAt">, now = new Date()): LicenceState {
  if (l.revokedAt || l.status === "revoked") return "revoked";
  if (l.status !== "active") return l.status as LicenceState;
  if (!l.expiresAt || now >= l.expiresAt) return "expired";
  if (l.rendersUsed >= l.renderCap) return "exhausted";
  return "active";
}

/** The terms a licence fixes when approved; their sha256 goes on every receipt. */
export function licenceTerms(l: Pick<Licence, "id" | "creatorId" | "brandId" | "pricePerRenderCents" | "videoMultiplier" | "allowedUses" | "bannedUses" | "renderCap" | "expiresAt">) {
  return {
    licenceId: l.id,
    creatorId: l.creatorId,
    brandId: l.brandId,
    pricePerRenderCents: l.pricePerRenderCents,
    videoMultiplier: l.videoMultiplier,
    allowedUses: [...l.allowedUses].sort(),
    bannedUses: [...l.bannedUses].sort(),
    renderCap: l.renderCap,
    expiresAt: l.expiresAt?.toISOString() ?? null,
  };
}

export async function fileRequest(brandId: string, input: { creatorId: string; uses: string[]; days: number; renderCap: number; brief: string }): Promise<Licence> {
  const [brand] = await db().select().from(brands).where(eq(brands.id, brandId));
  if (!brand) throw new HttpError(409, "set up your brand first");
  const [c] = await db().select().from(creators).where(eq(creators.id, input.creatorId));
  if (!c || c.status !== "live" || !c.acceptingLicences || c.workspaceId !== brand.workspaceId) throw new HttpError(404, "this creator isn't accepting licences");
  const uses = [...new Set((input.uses ?? []).map(String))];
  if (!uses.length) throw new HttpError(400, "choose at least one use");
  const banned = uses.filter((u) => (BANNED_USES as readonly string[]).includes(u));
  if (banned.length) throw new HttpError(400, `never allowed: ${banned.join(", ")}`);
  const outside = uses.filter((u) => !c.allowedUses.includes(u));
  if (outside.length) throw new HttpError(400, `this creator doesn't allow: ${outside.join(", ")}`);
  const days = Math.floor(Number(input.days));
  if (!(days >= 1 && days <= c.maxDays)) throw new HttpError(400, `duration must be 1 to ${c.maxDays} days`);
  const renderCap = Math.floor(Number(input.renderCap));
  if (!(renderCap >= 1 && renderCap <= c.maxRendersPerLicence)) throw new HttpError(400, `renders must be 1 to ${c.maxRendersPerLicence}`);
  const brief = String(input.brief ?? "").trim();
  if (brief.length < 10 || brief.length > 600) throw new HttpError(400, "describe the campaign in 10 to 600 characters");
  const [l] = await db()
    .insert(licences)
    .values({ id: newId("lic"), creatorId: c.id, brandId, pricePerRenderCents: c.pricePerRenderCents, videoMultiplier: c.videoMultiplier, allowedUses: uses, bannedUses: [...BANNED_USES], renderCap, days, brief, status: "pending" })
    .returning();
  return l;
}

/** The creator approves (price and video multiplier from their terms now) or declines a pending request. */
export async function decide(creatorId: string, licenceId: string, approve: boolean, now = new Date()): Promise<Licence> {
  return db().transaction(async (tx) => {
    const [l] = await tx.select().from(licences).where(eq(licences.id, licenceId)).for("update");
    if (!l) throw new HttpError(404, "no such request");
    if (l.creatorId !== creatorId) throw new HttpError(403, "only the creator can decide this request");
    if (l.status !== "pending") throw new HttpError(409, `request already ${l.status}`);
    if (!approve) {
      const [d] = await tx.update(licences).set({ status: "declined", declinedAt: now }).where(eq(licences.id, licenceId)).returning();
      return d;
    }
    const [c] = await tx.select().from(creators).where(eq(creators.id, creatorId));
    if (!c) throw new HttpError(409, "set your terms first");
    const expiresAt = new Date(now.getTime() + l.days * 86_400_000);
    const fixed = { ...l, pricePerRenderCents: c.pricePerRenderCents, videoMultiplier: c.videoMultiplier, expiresAt };
    const [a] = await tx
      .update(licences)
      .set({ status: "active", approvedAt: now, expiresAt, pricePerRenderCents: fixed.pricePerRenderCents, videoMultiplier: fixed.videoMultiplier, termsSha256: sha256Hex(canonicalJson(licenceTerms(fixed))) })
      .where(eq(licences.id, licenceId))
      .returning();
    return a;
  });
}

/** Revokes a licence at once. Renders already settled keep their receipts ("licensed when made"); new ones are refused. */
export async function revoke(creatorId: string, licenceId: string, now = new Date()): Promise<Licence> {
  return db().transaction(async (tx) => {
    const [l] = await tx.select().from(licences).where(eq(licences.id, licenceId)).for("update");
    if (!l) throw new HttpError(404, "no such licence");
    if (l.creatorId !== creatorId) throw new HttpError(403, "only the creator can revoke this licence");
    if (l.revokedAt) return l;
    if (l.status !== "active" && l.status !== "expired") throw new HttpError(409, `a ${l.status} licence can't be revoked`);
    const [r] = await tx.update(licences).set({ status: "revoked", revokedAt: now }).where(and(eq(licences.id, licenceId), eq(licences.creatorId, creatorId))).returning();
    return r;
  });
}

export async function getLicence(id: string): Promise<Licence | null> {
  const [l] = await db().select().from(licences).where(eq(licences.id, id));
  return l ?? null;
}

/** A creator's or a brand's licences (and requests), newest first, with both names and the current state. */
export async function listFor(field: "creatorId" | "brandId", id: string) {
  const b = alias(brands, "b");
  const c = alias(creators, "c");
  const rows = await db()
    .select({ licence: licences, brandName: b.name, creatorName: c.name, creatorPhoto: c.photoRef })
    .from(licences)
    .innerJoin(b, eq(b.id, licences.brandId))
    .innerJoin(c, eq(c.id, licences.creatorId))
    .where(eq(licences[field], id))
    .orderBy(desc(licences.createdAt))
    .limit(200);
  return rows.map((r) => ({ ...r.licence, brandName: r.brandName, creatorName: r.creatorName, creatorPhoto: r.creatorPhoto, state: licenceState(r.licence) }));
}
