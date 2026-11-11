import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { creators } from "@/lib/db/schema";
import { getSession } from "@/lib/session";

/** A live creator's public photo, to its own workspace: 512 px, labelled "profile photo, not licensed for reuse". */
export async function GET(_req: Request, ctx: RouteContext<"/media/creator/[creatorId]">) {
  await connection();
  const { creatorId } = await ctx.params;
  if (!/^cre_[A-Za-z0-9_-]{10,40}$/.test(creatorId)) return new Response("not found", { status: 404 });
  const s = await getSession();
  const [c] = await db().select({ photo: creators.publicPhoto, status: creators.status, workspaceId: creators.workspaceId }).from(creators).where(eq(creators.id, creatorId));
  // Workspace-checked like every stored file: only the creator's own demo workspace sees the photo.
  if (!c?.photo || c.status !== "live" || !s || c.workspaceId !== s.id) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(c.photo), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
