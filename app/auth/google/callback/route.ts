import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { HttpError } from "@/lib/errors";
import { connectChannel, signIn } from "@/lib/onboarding/creators";
import { checkIdToken, exchangeCode, oauthClient, onboardingEnabled } from "@/lib/onboarding/google";
import { ONB_COOKIE } from "@/lib/onboarding/session";
import { getSession } from "@/lib/session";
import { appOrigin } from "@/lib/wallet";

/** Google sends the creator back here: check state + PKCE, sign in, connect the YouTube channel (token used once). */
export async function GET(req: Request) {
  await connection(); // per request: the flag and the OAuth client are read at request time
  if (!onboardingEnabled()) return new Response("not found", { status: 404 });
  const origin = appOrigin(await headers());
  const back = (q: string) => Response.redirect(`${origin}/creator/onboard?${q}`, 303);
  const jar = await cookies();
  const [state, verifier] = (jar.get("lk_oauth")?.value ?? "").split(".");
  jar.delete({ name: "lk_oauth", path: "/auth/google" });
  const url = new URL(req.url);
  if (url.searchParams.get("error")) return back(`error=${encodeURIComponent(`Google sign-in was cancelled (${url.searchParams.get("error")})`)}`);
  const client = oauthClient();
  const s = await getSession();
  if (!client || !s || !state || url.searchParams.get("state") !== state) return back("error=That+sign-in+link+expired%2C+please+try+again");
  try {
    const t = await exchangeCode({ code: url.searchParams.get("code") ?? "", verifier, redirectUri: `${origin}/auth/google/callback`, client });
    const claims = checkIdToken(t.idToken, client.id);
    const creator = await signIn(s.id, { sub: claims.sub, email: claims.email_verified ? (claims.email ?? null) : null, name: claims.name ?? null });
    jar.set(ONB_COOKIE, creator.id, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 86_400 });
    if (!t.scope.includes("youtube.readonly")) return back("error=Grant+%22See+your+YouTube+account%22+so+we+can+check+your+channel");
    await connectChannel(creator.id, t.accessToken);
    return back("ok=1");
  } catch (e) {
    return back(`error=${encodeURIComponent(e instanceof HttpError ? e.message : (e as Error).message)}`);
  }
}
