/**
 * Uploads the private demo assets into Postgres (blobs), so a deployed server with an empty disk has them:
 *   private/rohit.jpg       → asset:rohit-reference, SEALED (AES-256-GCM under a data key wrapped by PHOTO_KEK);
 *                             the deployed server needs the SAME PHOTO_KEK to open it.
 *   private/maya.jpg|png,   → asset:maya-reference, asset:theo-reference: the SYNTHETIC creators' AI-generated
 *   private/theo.jpg|png      portraits (fictional people; scripts/synthetic-portraits.ts), sealed the same way.
 *                             Skipped while missing.
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
import { PERSONAS } from "../lib/personas";

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

  for (const p of PERSONAS.filter((x) => x.synthetic)) {
    const jpg = await read(`${p.file}.jpg`);
    const bytes = jpg ?? (await read(`${p.file}.png`));
    if (!bytes) {
      console.log(`${p.asset.padEnd(24)} skipped: private/${p.file}.jpg (or .png) is missing (pnpm portraits:synthetic)`);
      continue;
    }
    await putSealedBlob(p.asset, jpg ? "image/jpeg" : "image/png", bytes);
    const b = await openSealedBlob(p.asset);
    console.log(`${p.asset.padEnd(24)} sealed ${Math.round(bytes.length / 1024)} KB (synthetic, AI-generated), sha256 ${sha(bytes).slice(0, 12)}…, read back ${b && sha(b.bytes) === sha(bytes) ? "ok" : "FAILED"}`);
  }

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
