import "server-only";
/** The engine wired to the real world: Postgres, PayPal (sandbox or live per PAYPAL_ENV), the provider from env. */
import { newId } from "../errors";
import { authorizeOrder, captureAuthorization, createVaultOrder, refundCapture, voidAuthorization } from "../paypal/orders";
import { createPayout } from "../paypal/payouts";
import { signPayload } from "../receipts";
import { promptPrecheck } from "../ai/precheck";
import { visionCompliance } from "../ai/vision";
import { geminiConfigured } from "../ai/gemini";
import { stubCompliance } from "./compliance";
import { AiProvider, type AiProviderDeps } from "../ai/provider";
import { EthProvider } from "../ai/eth";
import { DrizzleQuota } from "../ai/quota-store";
import { createHash } from "node:crypto";
import { c2paConfigured, embedManifest } from "../ai/c2pa";
import { veoPrompt } from "../ai/creative";
import { adImage, demoClip, referencePhotos } from "../ai/reference";
import { imageToVideo } from "../ai/render-video";
import { StubProvider, type RenderInput, type RenderProvider } from "./providers";
import type { EngineDeps, PayPalPort } from "./render-and-pay";
import { DrizzleStore } from "./store";

/**
 * RENDER_PROVIDER:
 *   gemini  Gemini images and Gemini Omni Flash videos on the Gemini API (a video animates an earlier ad image);
 *   eth     likeness-eth's pipeline on the same Gemini API models (lib/ai/eth.ts): its prompt templates, a face check
 *           with one regeneration, and a video that makes its own 16:9 opening still, 8 s (VIDEO_SECONDS);
 *   anything else, or unset: the StubProvider (pre-made, no cost).
 * Both AI providers stay within the AI caps (over the video cap the saved demo clip plays) and use the same
 * reference photos, demo clip and content credentials.
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): RenderProvider {
  const stub = new StubProvider();
  if (env.RENDER_PROVIDER !== "gemini" && env.RENDER_PROVIDER !== "eth") return stub;
  const shared = {
    quota: new DrizzleQuota(),
    stub,
    references: (i: RenderInput) => referencePhotos(i.creatorPhotoRef, { renderId: i.renderId, licenceId: i.licenceId }),
    demoClip,
    credential: credentialFromEnv(env),
  };
  if (env.RENDER_PROVIDER === "eth") {
    return new EthProvider({ ...shared, video: (v) => imageToVideo({ image: v.image, mime: v.mime, prompt: v.prompt, seconds: v.seconds, aspectRatio: v.aspectRatio }) });
  }
  return new AiProvider({
    ...shared,
    firstFrame: (i) => adImage(i.fromRenderId, i.licenceId),
    video: (i, still) => imageToVideo({ image: still.bytes, mime: still.mime, prompt: veoPrompt(i.prompt, "9:16"), aspectRatio: "9:16" }),
  });
}

/** The C2PA content credential for AI output, when a signing certificate is configured. */
function credentialFromEnv(env: NodeJS.ProcessEnv): AiProviderDeps["credential"] {
  return c2paConfigured()
      ? (bytes, mime, i, model) =>
          embedManifest(bytes, mime, {
            protocol: "likeness-paypal/1",
            licenceId: i.licenceId ?? "",
            renderId: i.renderId,
            renderType: i.kind,
            use: i.use,
            payment: { provider: "PayPal", orderId: i.orderId ?? null, authorizationId: i.authorizationId ?? null },
            receipt: { store: "Postgres receipts, by render id", signedBy: "Ed25519 (GET /api/receipts/public-key)", verify: `${env.APP_BASE_URL ?? env.APP_URL ?? ""}/verify` },
            renderer: { provider: "Gemini API", model },
            promptSha256: createHash("sha256").update(i.prompt).digest("hex"),
            createdAt: new Date().toISOString(),
          })
    : undefined;
}

export const livePayPal: PayPalPort = { createVaultOrder, authorizeOrder, captureAuthorization, voidAuthorization, refundCapture, createPayout };

/** REVIEW_WINDOW_SECONDS (default 120): how long the brand has to accept or reject before auto-accept. */
export function reviewWindowSeconds(env: NodeJS.ProcessEnv = process.env) {
  const n = Number(env.REVIEW_WINDOW_SECONDS ?? 120);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 120;
}

export function engineDeps(overrides: Partial<EngineDeps> = {}): EngineDeps {
  return {
    store: new DrizzleStore(),
    paypal: livePayPal,
    provider: providerFromEnv(),
    // After render, before capture: Gemini looks at the output (stub renders pass with a note).
    compliance: geminiConfigured() && process.env.COMPLIANCE !== "stub" ? visionCompliance({ references: (ref) => referencePhotos(ref) }) : stubCompliance,
    // Before any money moves: the banned-use rules, plus the Gemini classifier when configured.
    precheck: process.env.PROMPT_PRECHECK === "off" ? undefined : promptPrecheck,
    sign: signPayload,
    now: () => new Date(),
    reviewWindowSeconds: reviewWindowSeconds(),
    newReceiptId: () => newId("rcp"),
    ...overrides,
  };
}

export * from "./render-and-pay";
