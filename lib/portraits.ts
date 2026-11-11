import "server-only";
/**
 * The seeded creators' portraits as served at /media/persona/<key>: opened from the sealed asset (`pnpm seed:assets`)
 * and resized to 640 px once per server process. One shared load per portrait (requests that arrive together wait
 * for the same download), and the server preloads them at start (instrumentation.ts), because each sealed original
 * is a ~650 KB read from the database. A failed load is forgotten, so the next request tries again.
 */
import sharp from "sharp";
import { openSealedBlob } from "./blobs";
import { PERSONAS } from "./personas";

type Jpeg = Uint8Array<ArrayBuffer>;
// On globalThis: instrumentation.ts and the route are bundled separately, so a module-level map wouldn't be shared.
const store = globalThis as typeof globalThis & { __likenessPortraits?: Map<string, Promise<Jpeg | null>> };
const loads = (store.__likenessPortraits ??= new Map<string, Promise<Jpeg | null>>());

export function portraitJpeg(key: string): Promise<Jpeg | null> {
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return Promise.resolve(null);
  let load = loads.get(p.key);
  if (!load) {
    load = (async () => {
      const b = await openSealedBlob(p.asset);
      if (!b) return null;
      const out = await sharp(Buffer.from(b.bytes)).rotate().resize({ width: 640, height: 640, fit: "cover", position: "attention" }).jpeg({ quality: 82 }).toBuffer();
      return new Uint8Array(out);
    })().catch(() => null);
    loads.set(p.key, load);
    void load.then((v) => {
      if (!v) loads.delete(p.key);
    });
  }
  return load;
}

/** Starts loading every portrait in the background (server start). */
export function warmPortraits() {
  for (const p of PERSONAS) void portraitJpeg(p.key);
}
