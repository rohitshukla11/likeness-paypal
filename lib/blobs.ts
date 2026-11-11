import "server-only";
/**
 * Files in Postgres (the blobs table), so a deploy needs no disk: generated renders and videos, and the private
 * assets uploaded by `pnpm seed:assets` (the demo creator's reference photo, sealed; the demo clip).
 * Sealed blobs use the vault's AES-256-GCM with a random data key wrapped by PHOTO_KEK; the blob key is the
 * additional data, so a sealed blob can't be moved to another key.
 */
import { createHash, randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { blobs, renderMedia } from "./db/schema";
import { open, seal, unwrapKey, wrapKey } from "./onboarding/vault";

export type Blob = { mime: string; sha256: string; bytes: Uint8Array };

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const ad = (key: string) => Buffer.from(`likeness-paypal|blob|${key}`);

export const renderKey = (renderId: string) => `render:${renderId}`;
/** Rohit's sealed reference photo (each seeded persona has its own: lib/personas.ts) and the demo clip. */
export const ASSETS = { reference: "asset:rohit-reference", demoClip: "asset:demo-video" } as const;

/** Stores a file once (later writes of the same key keep the first, like the render it belongs to). */
export async function putBlob(key: string, b: { kind: "render" | "asset"; mime: string; bytes: Uint8Array; sha256?: string }, opts: { replace?: boolean } = {}) {
  const row = { key, kind: b.kind, mime: b.mime, sha256: b.sha256 ?? sha256(b.bytes), bytes: Buffer.from(b.bytes), wrappedKey: null };
  const q = db().insert(blobs).values(row);
  await (opts.replace ? q.onConflictDoUpdate({ target: blobs.key, set: { mime: row.mime, sha256: row.sha256, bytes: row.bytes, wrappedKey: null } }) : q.onConflictDoNothing());
}

export async function getBlob(key: string): Promise<Blob | null> {
  const [b] = await db().select().from(blobs).where(eq(blobs.key, key));
  if (b && !b.wrappedKey) return { mime: b.mime, sha256: b.sha256, bytes: new Uint8Array(b.bytes) };
  if (b) return null; // sealed: use openSealedBlob
  // Renders stored before the blobs table existed.
  if (key.startsWith("render:")) {
    const [m] = await db().select().from(renderMedia).where(eq(renderMedia.renderId, key.slice(7)));
    if (m) return { mime: m.mime, sha256: m.sha256, bytes: new Uint8Array(m.bytes) };
  }
  return null;
}

/** Encrypts and stores (or replaces) a private asset. */
export async function putSealedBlob(key: string, mime: string, plain: Uint8Array) {
  const dek = new Uint8Array(randomBytes(32));
  try {
    const box = seal(dek, plain, ad(key));
    const row = { key, kind: "asset", mime, sha256: sha256(plain), bytes: box, wrappedKey: wrapKey(dek, key) };
    await db().insert(blobs).values(row).onConflictDoUpdate({ target: blobs.key, set: { mime, sha256: row.sha256, bytes: box, wrappedKey: row.wrappedKey } });
  } finally {
    dek.fill(0);
  }
}

/** Decrypts a sealed asset (null if absent). Checks the plaintext against its recorded sha256. */
export async function openSealedBlob(key: string): Promise<Blob | null> {
  const [b] = await db().select().from(blobs).where(eq(blobs.key, key));
  if (!b?.wrappedKey) return null;
  const dek = unwrapKey(b.wrappedKey, key);
  try {
    const plain = new Uint8Array(open(dek, b.bytes, ad(key)));
    if (sha256(plain) !== b.sha256) throw new Error(`blob ${key} does not match its recorded hash`);
    return { mime: b.mime, sha256: b.sha256, bytes: plain };
  } finally {
    dek.fill(0);
  }
}
