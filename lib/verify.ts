import "server-only";
/**
 * Was this ad licensed? Look up its signed receipt (by receipt id, or by the sha256 of the delivered file), check the
 * Ed25519 signature over the exact canonical payload, then read the licence's state now.
 *   Licensed – a valid receipt, the brand accepted (or the window passed) and the creator was paid; licence in force
 *   Expired  – a valid licensed receipt; the licence has since ended or used up its renders
 *   Revoked  – a valid licensed receipt; the creator has since revoked the licence ("licensed when made")
 *   Refunded – a valid receipt for an ad the brand rejected: refunded, the creator not paid, not licensed for use
 *   Unknown  – no receipt, or one whose signature doesn't verify
 * Results are plain JSON (ISO dates) so the API and both verify pages share them.
 */
import { desc, eq } from "drizzle-orm";
import { db } from "./db";
import { brands, creators, licences, receipts } from "./db/schema";
import { licenceState } from "./licences";
import { checkReceipt, receiptPublicKey, type ReceiptPayload } from "./receipts";

export type Verdict = "Licensed" | "Expired" | "Revoked" | "Refunded" | "Unknown";

export type VerifyResult = {
  verdict: Verdict;
  headline: string;
  receiptId: string | null;
  signature: { valid: boolean; alg: string; keyId: string; publicKeyId: string } | null;
  payload: ReceiptPayload | null;
  licence: { id: string; state: string; uses: string[]; renders: string; expiresAt: string | null; revokedAt: string | null } | null;
  creator: { name: string; photoRef: string | null } | null;
  brand: { name: string } | null;
  notes: string[];
};

const day = (iso: string | Date) => new Date(iso).toISOString().slice(0, 10);

export async function verifyReceipt(receiptId: string): Promise<VerifyResult> {
  if (!/^rcp_[A-Za-z0-9_-]{6,40}$/.test(receiptId)) return unknown(`No receipt ${receiptId.slice(0, 40)}.`, null);
  const [r] = await db().select().from(receipts).where(eq(receipts.id, receiptId));
  return r ? verifyCore(r, []) : unknown("Unknown. No receipt with this id.", receiptId);
}

/** By the sha256 of the delivered file. Demo renders reuse a few images, so the newest receipt for those bytes wins. */
export async function verifyHash(sha256: string): Promise<VerifyResult> {
  const h = sha256.trim().toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{64}$/.test(h)) return unknown("That isn't a sha256 (64 hex characters).", null);
  const rows = await db().select().from(receipts).where(eq(receipts.outputSha256, h)).orderBy(desc(receipts.createdAt)).limit(2);
  if (!rows.length) return unknown("Unknown. No signed receipt for these exact bytes: edited, re-encoded, or never licensed.", null);
  const notes = rows.length > 1 ? ["Several renders share these bytes (the demo's pre-generated images); this is the newest receipt. Check by receipt id for a specific one."] : [];
  return verifyCore(rows[0], notes);
}

function unknown(headline: string, receiptId: string | null): VerifyResult {
  return { verdict: "Unknown", headline, receiptId, signature: null, payload: null, licence: null, creator: null, brand: null, notes: [] };
}

async function verifyCore(r: typeof receipts.$inferSelect, notes: string[]): Promise<VerifyResult> {
  const valid = checkReceipt({ canonical: r.canonicalPayload, signature: r.signature, keyId: r.keyId });
  const signature = { valid, alg: r.alg, keyId: r.keyId, publicKeyId: receiptPublicKey().keyId };
  if (!valid) {
    notes.push("A receipt exists but its signature does not verify with this server's Ed25519 public key (GET /api/receipts/public-key).");
    return { ...unknown("Unknown. The receipt's signature does not verify.", r.id), signature };
  }
  const payload = JSON.parse(r.canonicalPayload) as ReceiptPayload;
  const [row] = await db()
    .select({ licence: licences, creatorName: creators.name, creatorPhoto: creators.photoRef, brandName: brands.name })
    .from(licences)
    .innerJoin(creators, eq(creators.id, licences.creatorId))
    .innerJoin(brands, eq(brands.id, licences.brandId))
    .where(eq(licences.id, payload.licenceId));
  const made = day(payload.renderedAt);
  const licence = row
    ? {
        id: row.licence.id,
        state: licenceState(row.licence),
        uses: row.licence.allowedUses,
        renders: `${row.licence.rendersUsed} of ${row.licence.renderCap}`,
        expiresAt: row.licence.expiresAt?.toISOString() ?? null,
        revokedAt: row.licence.revokedAt?.toISOString() ?? null,
      }
    : null;
  let verdict: Verdict;
  let headline: string;
  if (payload.status === "refunded") {
    verdict = "Refunded";
    headline = `Refunded. The brand rejected this ${payload.kind} on ${day(payload.settledAt)}; the charge was refunded and it isn't licensed for use.`;
  } else if (licence?.state === "revoked") {
    verdict = "Revoked";
    headline = `Revoked. Licensed when made (${made}); the creator revoked the licence on ${day(licence.revokedAt!)}.`;
  } else if (!licence || licence.state === "expired" || licence.state === "exhausted") {
    verdict = "Expired";
    headline = `Expired. Licensed when made (${made}); the licence has ${licence?.state === "exhausted" ? "used all its renders" : "ended"}.`;
  } else {
    verdict = "Licensed";
    headline = `Licensed. Made on ${made} for ${payload.use} use under an active licence; paid through PayPal and the creator paid out.`;
  }
  notes.push("The signature covers the whole payload below, including the PayPal ids; change one character and it no longer verifies.");
  return {
    verdict,
    headline,
    receiptId: r.id,
    signature,
    payload,
    licence,
    creator: row ? { name: row.creatorName, photoRef: row.creatorPhoto } : null,
    brand: row ? { name: row.brandName } : null,
    notes,
  };
}
