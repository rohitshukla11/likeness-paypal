import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";
import { creators } from "@/lib/db/schema";

/** A live creator's public photo: 512 px, labelled "profile photo, not licensed for reuse". */
export async function GET(_req: Request, ctx: RouteContext<"/media/creator/[creatorId]">) {
  await connection();
  const { creatorId } = await ctx.params;
  if (!/^cre_[A-Za-z0-9_-]{10,40}$/.test(creatorId)) return new Response("not found", { status: 404 });
  const [c] = await db().select({ photo: creators.publicPhoto, status: creators.status }).from(creators).where(eq(creators.id, creatorId));
  if (!c?.photo || c.status !== "live") return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(c.photo), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" } });
}
