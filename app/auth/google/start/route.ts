import { cookies, headers } from "next/headers";
import { connection } from "next/server";
import { createWorkspace } from "@/lib/demo";
import { authUrl, newAuthRequest, oauthClient, onboardingEnabled } from "@/lib/onboarding/google";
import { getSession, setSession } from "@/lib/session";
import { appOrigin } from "@/lib/wallet";

/** Starts Google sign-in for creator onboarding (FEATURE_CREATOR_ONBOARDING). */
export async function GET() {
  await connection(); // per request: the flag and the OAuth client are read at request time
  if (!onboardingEnabled()) return new Response("not found", { status: 404 });
  const client = oauthClient();
  if (!client) return Response.redirect(new URL("/creator/onboard?error=Google+sign-in+isn%27t+configured+(GOOGLE_OAUTH_CLIENT_ID)", appOrigin(await headers())), 303);
  const s = await getSession();
  await setSession(s?.id ?? (await createWorkspace()).id, "creator");
  const origin = appOrigin(await headers());
  const r = newAuthRequest();
  (await cookies()).set("lk_oauth", `${r.state}.${r.verifier}`, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/auth/google", maxAge: 600 });
  return Response.redirect(authUrl(client.id, `${origin}/auth/google/callback`, r.state, r.challenge), 303);
}
