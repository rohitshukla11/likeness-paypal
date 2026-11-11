import { cookies } from "next/headers";
import { connection } from "next/server";
import { PERSONAS } from "@/lib/personas";
import { portraitJpeg } from "@/lib/portraits";
import { getSession } from "@/lib/session";

// Workspaces already checked by this process (ids are unguessable and never deleted): no database read per image.
const knownWorkspaces = new Set<string>();

/**
 * A seeded creator's portrait for the demo pages: Rohit's real photo (shown with his consent) or a synthetic
 * creator's AI-generated face, from its sealed asset, resized to 640 px (lib/portraits.ts).
 * Only to visitors with a demo session; without the sealed asset it falls back to the illustration.
 */
export async function GET(req: Request, ctx: RouteContext<"/media/persona/[key]">) {
  await connection();
  const { key } = await ctx.params;
  const p = PERSONAS.find((x) => x.key === key);
  if (!p) return new Response("not found", { status: 404 });
  const ws = (await cookies()).get("lk_ws")?.value ?? "";
  if (!knownWorkspaces.has(ws)) {
    const s = await getSession();
    if (!s) return new Response("not found", { status: 404 });
    knownWorkspaces.add(s.id);
  }
  const img = await portraitJpeg(p.key);
  if (!img) return Response.redirect(new URL(p.photo, req.url), 302);
  return new Response(img, { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Robots-Tag": "noindex" } });
}
