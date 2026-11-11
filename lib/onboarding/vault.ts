import "server-only";
/**
 * The creator's reference frames, encrypted with a per-creator data key (AES-256-GCM). The data key exists only
 * wrapped by PHOTO_KEK (a 256-bit key-encryption key in the server environment, AES-256-GCM with the creator id
 * as additional data, so a wrapped key can't be moved to another creator). Ciphertext lives in Postgres
 * (creator_frames). Every opening is written to frame_decryptions before the key is unwrapped.
 * (likeness-ai wrapped the key with Cloud KMS and kept the ciphertext in a Cloud Storage bucket; neither exists here.)
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { creatorFrames, creators, frameDecryptions } from "../db/schema";
import { HttpError, newId } from "../errors";

const frameAad = (id: string, i: number) => Buffer.from(`likeness-paypal|frame|${id}|${i}`);
const dekAad = (id: string) => Buffer.from(`likeness-paypal|dek|${id}`);
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export function seal(key: Uint8Array, plain: Uint8Array, ad: Buffer): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(ad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return Buffer.concat([Buffer.from([1]), iv, c.getAuthTag(), ct]); // v1 | iv(12) | tag(16) | ct
}

export function open(key: Uint8Array, box: Buffer, ad: Buffer): Buffer {
  if (box[0] !== 1) throw new Error("unknown ciphertext version");
  const d = createDecipheriv("aes-256-gcm", key, box.subarray(1, 13));
  d.setAAD(ad);
  d.setAuthTag(box.subarray(13, 29));
  return Buffer.concat([d.update(box.subarray(29)), d.final()]);
}

function kek(): Buffer {
  const b64 = process.env.PHOTO_KEK;
  const k = b64 ? Buffer.from(b64, "base64") : null;
  if (!k || k.length !== 32) throw new HttpError(503, "PHOTO_KEK is not set (32 bytes, base64; see .env.example)");
  return k;
}

export const wrapKey = (dek: Uint8Array, creatorId: string, key: Uint8Array = kek()) => seal(key, dek, dekAad(creatorId)).toString("base64");
export const unwrapKey = (wrapped: string, creatorId: string, key: Uint8Array = kek()) => new Uint8Array(open(key, Buffer.from(wrapped, "base64"), dekAad(creatorId)));

/** Encrypt and store the frames, creating the creator's data key on first use. Returns the key and the frames' sha256. */
export async function sealFrames(creatorId: string, frames: Uint8Array[], existingWrapped?: string | null): Promise<{ wrappedKey: string; sha256: string[] }> {
  let dek: Uint8Array;
  let wrappedKey = existingWrapped ?? undefined;
  if (wrappedKey) dek = unwrapKey(wrappedKey, creatorId);
  else {
    dek = new Uint8Array(randomBytes(32));
    wrappedKey = wrapKey(dek, creatorId);
  }
  try {
    await db().transaction(async (tx) => {
      await tx.delete(creatorFrames).where(eq(creatorFrames.creatorId, creatorId));
      for (const [i, f] of frames.entries()) await tx.insert(creatorFrames).values({ creatorId, idx: i, box: seal(dek, f, frameAad(creatorId, i)) });
    });
    return { wrappedKey, sha256: frames.map(sha256) };
  } finally {
    dek.fill(0);
  }
}

/** Open the frames for one purpose (a render under a licence). Logged before the key is unwrapped. */
export async function openFrames(creatorId: string, purpose: { licenceId?: string | null; renderId?: string | null; by: string }): Promise<Uint8Array[]> {
  const [c] = await db().select({ wrappedKey: creators.wrappedKey, framesSha256: creators.framesSha256 }).from(creators).where(eq(creators.id, creatorId));
  if (!c?.wrappedKey || !c.framesSha256?.length) throw new HttpError(409, "this creator has no protected photos");
  await db().insert(frameDecryptions).values({ id: newId("dec"), creatorId, licenceId: purpose.licenceId ?? null, renderId: purpose.renderId ?? null, by: purpose.by });
  const dek = unwrapKey(c.wrappedKey, creatorId);
  try {
    const boxes = await db().select().from(creatorFrames).where(eq(creatorFrames.creatorId, creatorId)).orderBy(asc(creatorFrames.idx));
    return boxes.map((b) => {
      const plain = open(dek, b.box, frameAad(creatorId, b.idx));
      if (sha256(plain) !== c.framesSha256![b.idx]) throw new HttpError(500, `frame ${b.idx} does not match its recorded hash`);
      return new Uint8Array(plain);
    });
  } finally {
    dek.fill(0);
  }
}
