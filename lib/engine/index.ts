import "server-only";
/** The engine wired to the real world: Postgres, PayPal (sandbox or live per PAYPAL_ENV), the provider from env. */
import { newId } from "../errors";
import { authorizeOrder, captureAuthorization, createVaultOrder, refundCapture, voidAuthorization } from "../paypal/orders";
import { createPayout } from "../paypal/payouts";
import { signPayload } from "../receipts";
import { stubCompliance } from "./compliance";
import { AiProvider } from "../ai/provider";
import { DrizzleQuota } from "../ai/quota-store";
import { createHash } from "node:crypto";
import { c2paConfigured, embedManifest } from "../ai/c2pa";
import { veoPrompt } from "../ai/creative";
import { demoClip, referencePhotos } from "../ai/reference";
import { imageToVideo } from "../ai/render-video";
import { StubProvider, type RenderProvider } from "./providers";
import type { EngineDeps, PayPalPort } from "./render-and-pay";
import { DrizzleStore } from "./store";

/**
 * RENDER_PROVIDER=gemini: Gemini images and Gemini Omni Flash videos on the Gemini API, within the AI caps (over
 * the video cap the saved demo clip plays); anything else, or unset: the StubProvider (pre-made, no cost).
 */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): RenderProvider {
  const stub = new StubProvider();
  if (env.RENDER_PROVIDER !== "gemini") return stub;
  return new AiProvider({
    quota: new DrizzleQuota(),
    stub,
    references: (i) => referencePhotos(i.creatorPhotoRef),
    demoClip,
    video: (i, still) => imageToVideo({ image: still.bytes, mime: still.mime, prompt: veoPrompt(i.prompt, "9:16"), aspectRatio: "9:16" }),
    credential: c2paConfigured()
      ? (bytes, mime, i, model) =>
          embedManifest(bytes, mime, {
            protocol: "likeness-paypal/1",
            licenceId: i.licenceId ?? "",
            renderId: i.renderId,
            renderType: i.kind,
            use: i.use,
            payment: { provider: "PayPal", orderId: i.orderId ?? null, authorizationId: i.authorizationId ?? null },
            receipt: { store: "Postgres receipts, by render id", signedBy: "Ed25519 (GET /api/receipts/public-key)", verify: `${env.APP_URL ?? ""}/verify` },
            renderer: { provider: "Gemini API", model },
            promptSha256: createHash("sha256").update(i.prompt).digest("hex"),
            createdAt: new Date().toISOString(),
          })
      : undefined,
  });
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
    compliance: stubCompliance,
    sign: signPayload,
    now: () => new Date(),
    reviewWindowSeconds: reviewWindowSeconds(),
    newReceiptId: () => newId("rcp"),
    ...overrides,
  };
}

export * from "./render-and-pay";
