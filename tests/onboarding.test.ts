/** Creator onboarding pieces that run without Google or face models: the vault, the OAuth request, the flag. */
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { describe, it } from "node:test";
import { authUrl, checkIdToken, newAuthRequest, onboardingEnabled, SCOPES } from "../lib/onboarding/google";
import { open, seal, unwrapKey, wrapKey } from "../lib/onboarding/vault";

const jwt = (claims: object) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;

describe("photo vault (AES-256-GCM, data key wrapped by PHOTO_KEK)", () => {
  const kek = randomBytes(32);
  it("seals and opens a frame; the wrong additional data fails", () => {
    const key = randomBytes(32);
    const box = seal(key, Buffer.from("frame-bytes"), Buffer.from("cre_1|0"));
    assert.equal(box[0], 1);
    assert.equal(open(key, box, Buffer.from("cre_1|0")).toString(), "frame-bytes");
    assert.throws(() => open(key, box, Buffer.from("cre_1|1")));
  });
  it("a wrapped data key only unwraps for the same creator", () => {
    const dek = new Uint8Array(randomBytes(32));
    const w = wrapKey(dek, "cre_a", kek);
    assert.deepEqual(unwrapKey(w, "cre_a", kek), dek);
    assert.throws(() => unwrapKey(w, "cre_b", kek), "moved to another creator");
    assert.throws(() => unwrapKey(w, "cre_a", randomBytes(32)), "another key-encryption key");
  });
});

describe("Google sign-in (new OAuth client)", () => {
  it("asks for openid, email, profile and youtube.readonly with PKCE S256", () => {
    const r = newAuthRequest();
    assert.equal(r.challenge, createHash("sha256").update(r.verifier).digest("base64url"));
    const u = new URL(authUrl("client-123", "http://localhost:3000/auth/google/callback", r.state, r.challenge));
    assert.equal(u.origin, "https://accounts.google.com");
    assert.equal(u.searchParams.get("scope"), SCOPES.join(" "));
    assert.ok(u.searchParams.get("scope")!.includes("youtube.readonly"));
    assert.equal(u.searchParams.get("code_challenge_method"), "S256");
    assert.equal(u.searchParams.get("state"), r.state);
  });
  it("checks the ID token's audience, issuer and expiry", () => {
    const now = Date.now();
    const ok = { sub: "1234", aud: "client-123", iss: "https://accounts.google.com", exp: Math.floor(now / 1000) + 300, email: "a@example.com", email_verified: true };
    assert.equal(checkIdToken(jwt(ok), "client-123", now).sub, "1234");
    assert.throws(() => checkIdToken(jwt({ ...ok, aud: "other" }), "client-123", now), /audience/);
    assert.throws(() => checkIdToken(jwt({ ...ok, iss: "https://evil.example" }), "client-123", now), /issuer/);
    assert.throws(() => checkIdToken(jwt({ ...ok, exp: Math.floor(now / 1000) - 1 }), "client-123", now), /expired/);
  });
  it("is off unless FEATURE_CREATOR_ONBOARDING is set", () => {
    assert.equal(onboardingEnabled({} as unknown as NodeJS.ProcessEnv), false);
    assert.equal(onboardingEnabled({ FEATURE_CREATOR_ONBOARDING: "1" } as unknown as NodeJS.ProcessEnv), true);
  });
});
