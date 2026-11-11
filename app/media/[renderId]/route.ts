import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { renderMedia } from "@/lib/db/schema";

/**
 * A generated image or video, by its render id (random, unguessable). The bytes are exactly what the receipt's
 * output sha256 covers, so a downloaded file verifies at /verify.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[renderId]">) {
  await connection();
  const { renderId } = await ctx.params;
  if (!/^rnd_[A-Za-z0-9_-]{10,40}$/.test(renderId)) return new Response("not found", { status: 404 });
  const [m] = await db().select().from(renderMedia).where(eq(renderMedia.renderId, renderId));
  if (!m) return new Response("not found", { status: 404 });
  const ext = m.mime === "video/mp4" ? "mp4" : m.mime === "image/png" ? "png" : "jpg";
  return new Response(new Uint8Array(m.bytes), {
    headers: {
      "Content-Type": m.mime,
      "Content-Length": String(m.bytes.length),
      "Content-Disposition": `inline; filename="${renderId}.${ext}"`,
      "Cache-Control": "private, max-age=86400, immutable",
      ETag: `"${m.sha256}"`,
    },
  });
}
