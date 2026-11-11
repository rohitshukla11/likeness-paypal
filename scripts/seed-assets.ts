/**
 * Uploads the private demo assets into Postgres (blobs), so a deployed server with an empty disk has them:
 *   private/rohit.jpg       → asset:rohit-reference, SEALED (AES-256-GCM under a data key wrapped by PHOTO_KEK);
 *                             the deployed server needs the SAME PHOTO_KEK to open it.
 *   private/demo-video.mp4  → asset:demo-video (the clip played over the AI video cap; not secret)
 * Reads each back (decrypting the photo) and checks its sha256. Prints sizes and hashes only.
 *
 *   pnpm seed:assets
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { ASSETS, getBlob, openSealedBlob, putBlob, putSealedBlob } from "../lib/blobs";
import { closeDb } from "../lib/db";

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const dir = path.resolve(process.cwd(), process.env.PRIVATE_DIR || "private");
const read = (f: string) => readFile(path.join(dir, f)).then((b) => new Uint8Array(b), () => null);

async function main() {
  if (!process.env.PHOTO_KEK) throw new Error("PHOTO_KEK is not set: the photo is sealed with it (and the server needs the same one)");
  const photo = await read("rohit.jpg");
  if (!photo) throw new Error("private/rohit.jpg is missing");
  await putSealedBlob(ASSETS.reference, "image/jpeg", photo);
  const back = await openSealedBlob(ASSETS.reference);
  console.log(`${ASSETS.reference.padEnd(24)} sealed ${Math.round(photo.length / 1024)} KB, sha256 ${sha(photo).slice(0, 12)}…, read back ${back && sha(back.bytes) === sha(photo) ? "ok" : "FAILED"}`);

  const clip = await read("demo-video.mp4");
  if (!clip) console.log(`${ASSETS.demoClip.padEnd(24)} skipped: private/demo-video.mp4 is missing`);
  else {
    await putBlob(ASSETS.demoClip, { kind: "asset", mime: "video/mp4", bytes: clip }, { replace: true });
    const b = await getBlob(ASSETS.demoClip);
    console.log(`${ASSETS.demoClip.padEnd(24)} ${Math.round(clip.length / 1024)} KB, sha256 ${sha(clip).slice(0, 12)}…, read back ${b && b.sha256 === sha(clip) ? "ok" : "FAILED"}`);
  }
}

main()
  .catch((e) => {
    console.error(`seed:assets stopped: ${(e as Error).message}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
