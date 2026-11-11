import "server-only";
/**
 * The creator's reference photos, kept outside the repo in private/ (git-ignored):
 *   - a seeded demo creator (photo_ref /demo/<key>.svg, an illustration; lib/personas.ts) uses its sealed upload
 *     asset:<key>-reference from `pnpm seed:assets`, or locally private/<key>.jpg (or .png): Rohit's real photo, or
 *     the AI-generated portrait of a synthetic creator;
 *   - a creator whose photo_ref is "private:<file>" uses private/<file>;
 *   - an onboarded creator (photo_ref /media/creator/<id>) uses their encrypted frames, opened for this render and
 *     logged (lib/onboarding/vault.ts).
 * No file, no reference: the AI provider then lets a demo render stand in.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { personaOf } from "../personas";
import type { Reference } from "./provider";

const PRIVATE = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PRIVATE_DIR || "private");

export function referencePath(photoRef: string | null): string | null {
  if (!photoRef) return null;
  const persona = personaOf(photoRef);
  if (persona) return path.join(PRIVATE(), `${persona.file}.jpg`);
  if (photoRef.startsWith("private:")) {
    const file = path.basename(photoRef.slice("private:".length));
    return file ? path.join(PRIVATE(), file) : null;
  }
  return null;
}

export async function referencePhotos(photoRef: string | null, purpose: { renderId?: string; licenceId?: string } = {}): Promise<Reference[]> {
  const persona = personaOf(photoRef);
  if (persona) {
    // Deployed: the sealed upload from `pnpm seed:assets` (blobs). Locally it may only be on disk (below).
    const { openSealedBlob } = await import("../blobs");
    const b = await openSealedBlob(persona.asset).catch(() => null);
    if (b) return [{ bytes: b.bytes, mime: b.mime === "image/png" ? "image/png" : "image/jpeg" }];
    for (const ext of ["jpg", "png"] as const) {
      const file = path.join(PRIVATE(), `${persona.file}.${ext}`);
      const bytes = await readFile(/*turbopackIgnore: true*/ file).catch(() => null);
      if (bytes) return [{ bytes: new Uint8Array(bytes), mime: ext === "png" ? "image/png" : "image/jpeg" }];
    }
    return [];
  }
  const onboarded = photoRef?.match(/^\/media\/creator\/(cre_[A-Za-z0-9_-]+)$/);
  if (onboarded) {
    const { openFrames } = await import("../onboarding/vault");
    const frames = await openFrames(onboarded[1], { renderId: purpose.renderId, licenceId: purpose.licenceId, by: "render-service" }).catch(() => []);
    return frames.map((bytes) => ({ bytes, mime: "image/jpeg" as const }));
  }
  const p = referencePath(photoRef);
  if (!p) return [];
  try {
    const bytes = new Uint8Array(await readFile(/*turbopackIgnore: true*/ p));
    const mime = p.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return [{ bytes, mime }];
  } catch {
    return [];
  }
}

/** The saved real clip played back over the video cap, labelled "demo render". */
export async function demoClip(): Promise<Uint8Array | null> {
  const { ASSETS, getBlob } = await import("../blobs");
  const b = await getBlob(ASSETS.demoClip).catch(() => null);
  if (b) return b.bytes;
  try {
    return new Uint8Array(await readFile(/*turbopackIgnore: true*/ path.join(PRIVATE(), "demo-video.mp4")));
  } catch {
    return null;
  }
}

/**
 * A video's first frame: the generated ad image of an earlier image render under the same licence (an AI image,
 * not a demo stand-in), as stored and served at /media/<render id>.
 */
export async function adImage(fromRenderId: string | null | undefined, licenceId: string | undefined): Promise<Reference | null> {
  if (!fromRenderId || !licenceId) return null;
  const { and, eq } = await import("drizzle-orm");
  const { db } = await import("../db");
  const { renders } = await import("../db/schema");
  const { getBlob, renderKey } = await import("../blobs");
  const [r] = await db()
    .select({ model: renders.model, kind: renders.kind })
    .from(renders)
    .where(and(eq(renders.id, fromRenderId), eq(renders.licenceId, licenceId)));
  if (!r || r.kind !== "image" || !r.model?.startsWith("gemini")) return null;
  const b = await getBlob(renderKey(fromRenderId));
  if (!b || (b.mime !== "image/jpeg" && b.mime !== "image/png")) return null;
  return { bytes: b.bytes, mime: b.mime };
}
