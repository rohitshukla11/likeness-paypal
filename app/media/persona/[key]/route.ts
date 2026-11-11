import { connection } from "next/server";
import sharp from "sharp";
import { openSealedBlob } from "@/lib/blobs";
import { PERSONAS } from "@/lib/personas";
import { getSession } from "@/lib/session";

// Resized once per server process (the sealed originals are about 1024 px).
const cache = new Map<string, Uint8Array<ArrayBuffer>>();

/**
 * A seeded creator's portrait for the demo pages: Rohit's real photo (shown with his consent) or a synthetic
 * creator's AI-generated face, opened from its sealed asset (`pnpm seed:assets`) and resized to 640 px.
 * Only to visitors with a demo session; without the sealed asset it falls back to the illustration.
 */
export async function GET(req: Request, ctx: RouteContext<"/media/persona/[key]">) {
  await connection();
  const { key } = await ctx.params;
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return new Response("not found", { status: 404 });
  if (!(await getSession())) return new Response("not found", { status: 404 });
  let img = cache.get(p.key);
  if (!img) {
    const b = await openSealedBlob(p.asset).catch(() => null);
    if (!b) return Response.redirect(new URL(p.photo, req.url), 302);
    img = new Uint8Array(await sharp(Buffer.from(b.bytes)).rotate().resize({ width: 640, height: 640, fit: "cover", position: "attention" }).jpeg({ quality: 82 }).toBuffer());
    cache.set(p.key, img);
  }
  return new Response(img, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
}
