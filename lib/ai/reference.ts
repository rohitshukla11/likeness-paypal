import "server-only";
/**
 * The creator's reference photos, kept outside the repo in private/ (git-ignored):
 *   - the seeded demo creator "Rohit" (photo_ref /demo/rohit.svg, an illustration) uses private/rohit.jpg;
 *   - a creator whose photo_ref is "private:<file>" uses private/<file>.
 * No file, no reference: the AI provider then lets a demo render stand in.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Reference } from "./provider";

const PRIVATE = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PRIVATE_DIR || "private");

export function referencePath(photoRef: string | null): string | null {
  if (!photoRef) return null;
  if (photoRef === "/demo/rohit.svg") return path.join(PRIVATE(), "rohit.jpg");
  if (photoRef.startsWith("private:")) {
    const file = path.basename(photoRef.slice("private:".length));
    return file ? path.join(PRIVATE(), file) : null;
  }
  return null;
}

export async function referencePhotos(photoRef: string | null): Promise<Reference[]> {
  const p = referencePath(photoRef);
  if (!p) return [];
  try {
    const bytes = new Uint8Array(await readFile(p));
    const mime = p.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";
    return [{ bytes, mime }];
  } catch {
    return [];
  }
}

/** The saved real clip played back over the video cap, labelled "demo render". */
export async function demoClip(): Promise<Uint8Array | null> {
  try {
    return new Uint8Array(await readFile(path.join(PRIVATE(), "demo-video.mp4")));
  } catch {
    return null;
  }
}
