/**
 * Google sign-in for creator onboarding, with this app's own OAuth client in the NEW Google Cloud project (not the
 * old Firebase setup): the authorization-code flow with PKCE, scopes openid email profile + youtube.readonly. The
 * access token is used once, on the server, to read the creator's own channel; it is never stored or sent to the
 * browser. The ID token comes straight from Google's token endpoint over TLS, so its claims (aud, iss, exp) are
 * checked without a JWKS fetch (OpenID Connect Core 3.1.3.7).
 */
import { createHash, randomBytes } from "node:crypto";

export const onboardingEnabled = (env: NodeJS.ProcessEnv = process.env) => env.FEATURE_CREATOR_ONBOARDING === "1" || env.FEATURE_CREATOR_ONBOARDING === "true";

export const SCOPES = ["openid", "email", "profile", "https://www.googleapis.com/auth/youtube.readonly"];

export function oauthClient(env: NodeJS.ProcessEnv = process.env) {
  const id = env.GOOGLE_OAUTH_CLIENT_ID;
  const secret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

const b64url = (b: Buffer) => b.toString("base64url");

/** A fresh state and PKCE pair; state and verifier go in a short-lived httpOnly cookie. */
export function newAuthRequest() {
  const state = b64url(randomBytes(24));
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  return { state, verifier, challenge };
}

export function authUrl(clientId: string, redirectUri: string, state: string, challenge: string): string {
  const q = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    access_type: "online",
    include_granted_scopes: "true",
    prompt: "consent select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

export type IdClaims = { sub: string; email?: string; email_verified?: boolean; name?: string; aud: string; iss: string; exp: number };

/** Decodes an ID token received directly from Google's token endpoint and checks its audience, issuer and expiry. */
export function checkIdToken(idToken: string, clientId: string, now = Date.now()): IdClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("malformed ID token");
  const c = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as IdClaims;
  if (c.aud !== clientId) throw new Error("ID token audience mismatch");
  if (c.iss !== "https://accounts.google.com" && c.iss !== "accounts.google.com") throw new Error("ID token issuer mismatch");
  if (!c.exp || c.exp * 1000 < now) throw new Error("ID token expired");
  if (!c.sub) throw new Error("ID token has no subject");
  return c;
}

/** Exchanges the code (with the PKCE verifier) at Google's token endpoint. */
export async function exchangeCode(input: { code: string; verifier: string; redirectUri: string; client: { id: string; secret: string } }) {
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code: input.code, code_verifier: input.verifier, client_id: input.client.id, client_secret: input.client.secret, redirect_uri: input.redirectUri, grant_type: "authorization_code" }),
    signal: AbortSignal.timeout(15_000),
  });
  const j = (await r.json().catch(() => ({}))) as { access_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };
  if (!r.ok || !j.access_token || !j.id_token) throw new Error(`Google sign-in failed: ${j.error ?? r.status} ${j.error_description ?? ""}`.trim());
  return { accessToken: j.access_token, idToken: j.id_token, scope: j.scope ?? "" };
}
