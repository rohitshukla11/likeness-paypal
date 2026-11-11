import { eq } from "drizzle-orm";
import { getBlob, renderKey } from "@/lib/blobs";
import { db } from "@/lib/db";
import { brands, licences, renders } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

/**
 * A generated image or video, served from Postgres (blobs) to the workspace it belongs to: the visitor's session
 * workspace must own the render's licence (its brand and creator personas share one workspace). Anyone else gets a
 * 404, so the route doesn't tell whether a render exists. The bytes are exactly what the receipt's output sha256
 * covers, so a downloaded file verifies at /verify.
 */
export async function GET(_req: Request, ctx: RouteContext<"/media/[renderId]">) {
  const { renderId } = await ctx.params;
  const notFound = () => new Response("not found", { status: 404 });
  if (!/^rnd_[A-Za-z0-9_-]{10,40}$/.test(renderId)) return notFound();
  const s = await getSession(); // request time (connection) and the visitor's workspace
  if (!s) return notFound();
  const [owner] = await db()
    .select({ workspaceId: brands.workspaceId })
    .from(renders)
    .innerJoin(licences, eq(licences.id, renders.licenceId))
    .innerJoin(brands, eq(brands.id, licences.brandId))
    .where(eq(renders.id, renderId));
  if (!owner || owner.workspaceId !== s.id) return notFound();
  const m = await getBlob(renderKey(renderId));
  if (!m) return notFound();
  const ext = m.mime === "video/mp4" ? "mp4" : m.mime === "image/png" ? "png" : m.mime === "image/svg+xml" ? "svg" : "jpg";
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
