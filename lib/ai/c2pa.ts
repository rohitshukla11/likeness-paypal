import "server-only";
/**
 * C2PA content credentials for AI renders (@contentauth/c2pa-node 0.9.9, c2pa-rs underneath).
 *
 * Each AI image or video carries a signed manifest with:
 *  - c2pa.actions: "c2pa.created" by the model, with the IPTC digital source type for AI output;
 *  - c2pa.training-mining: AI training and mining not allowed;
 *  - xyz.likeness.licence: the licence, render, licensed use, the PayPal order and authorization behind it, and
 *    how to find the receipt. The Ed25519 receipt names the sha256 of this exact file (manifest included), so the
 *    manifest says where to look it up rather than carrying a signature that can't exist before the file does.
 *
 * Signed with a TEST certificate chain made locally (scripts/c2pa-testcert.sh, into private/c2pa/, or the PEMs in
 * C2PA_CERT_PEM / C2PA_KEY_PEM). It is not on the C2PA trust list, so validators report "signing certificate
 * untrusted". No cloud service is involved. Without a certificate, renders simply carry no manifest.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { Builder, LocalSigner, Reader } from "@contentauth/c2pa-node";
import { secretText } from "./secret";

export const LICENCE_ASSERTION = "xyz.likeness.licence";

export type LicenceAssertion = {
  protocol: "likeness-paypal/1";
  licenceId: string;
  renderId: string;
  renderType: "image" | "video";
  use: string;
  payment: { provider: "PayPal"; orderId: string | null; authorizationId: string | null };
  receipt: { store: "Postgres receipts, by render id"; signedBy: "Ed25519 (GET /api/receipts/public-key)"; verify: string };
  renderer: { provider: string; model: string };
  promptSha256: string;
  createdAt: string;
};

const dir = () => path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.PRIVATE_DIR || "private", "c2pa");

function credentials() {
  const cert = secretText("C2PA_CERT_PEM", "C2PA_CERT_FILE", path.join(dir(), "signer.pem"));
  const key = secretText("C2PA_KEY_PEM", "C2PA_KEY_FILE", path.join(dir(), "signer.key"));
  return cert && key ? { cert, key } : null;
}

/** Whether a signing certificate is available (env PEMs, or private/c2pa/ from scripts/c2pa-testcert.sh). */
export const c2paConfigured = () => !!process.env.C2PA_CERT_PEM || existsSync(path.join(dir(), "signer.pem"));

function signer() {
  const c = credentials();
  if (!c) throw Object.assign(new Error("C2PA signing certificate missing: run `sh scripts/c2pa-testcert.sh` (test certificate)"), { status: 503 });
  return LocalSigner.newSigner(Buffer.from(c.cert), Buffer.from(c.key), "es256");
}

const SOURCE_TYPE = "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

export function embedManifest(bytes: Uint8Array, mime: "image/jpeg" | "image/png" | "video/mp4", a: LicenceAssertion): Uint8Array {
  const builder = Builder.withJson({
    claim_generator_info: [{ name: "Likeness × PayPal render service", version: "0.1.0" }],
    title: `likeness-licence-${a.licenceId}-render-${a.renderId}.${mime === "image/png" ? "png" : mime === "video/mp4" ? "mp4" : "jpg"}`,
    format: mime,
    assertions: [
      { label: "c2pa.actions", data: { actions: [{ action: "c2pa.created", digitalSourceType: SOURCE_TYPE, softwareAgent: { name: a.renderer.model } }] } },
      {
        label: "c2pa.training-mining",
        data: {
          entries: {
            "c2pa.ai_generative_training": { use: "notAllowed" },
            "c2pa.ai_inference": { use: "notAllowed" },
            "c2pa.ai_training": { use: "notAllowed" },
            "c2pa.data_mining": { use: "notAllowed" },
          },
        },
      },
      { label: LICENCE_ASSERTION, data: a },
    ],
  } as never);
  const out: { buffer: Buffer | null } = { buffer: null };
  builder.sign(signer(), { buffer: Buffer.from(bytes), mimeType: mime }, out as never);
  if (!out.buffer) throw new Error("C2PA signing produced no output");
  return new Uint8Array(out.buffer);
}

export type ManifestRead =
  | { present: false; error?: string }
  | {
      present: true;
      licence: LicenceAssertion | null;
      signer: { issuer?: string; commonName?: string; alg?: string };
      /** c2pa-rs validation codes; "signingCredential.untrusted" is expected for the test certificate. */
      validation: { code: string; explanation?: string }[];
      signatureValid: boolean;
      trustedSigner: boolean;
      generator?: string;
    };

export async function readManifest(bytes: Uint8Array, mime: string): Promise<ManifestRead> {
  let reader;
  try {
    reader = await Reader.fromAsset({ buffer: Buffer.from(bytes), mimeType: mime });
  } catch (e) {
    return { present: false, error: (e as Error).message };
  }
  if (!reader) return { present: false };
  const store = reader.json() as unknown as {
    active_manifest?: string;
    manifests: Record<string, { assertions?: { label: string; data: unknown }[]; signature_info?: { issuer?: string; common_name?: string; alg?: string }; claim_generator_info?: { name?: string }[] }>;
    validation_status?: { code: string; explanation?: string }[];
  };
  const m = store.active_manifest ? store.manifests[store.active_manifest] : undefined;
  if (!m) return { present: false, error: "no active manifest" };
  const validation = store.validation_status ?? [];
  const failures = validation.filter((v) => v.code !== "signingCredential.untrusted");
  const licence = (m.assertions?.find((x) => x.label === LICENCE_ASSERTION)?.data as LicenceAssertion | undefined) ?? null;
  return {
    present: true,
    licence,
    signer: { issuer: m.signature_info?.issuer, commonName: m.signature_info?.common_name, alg: m.signature_info?.alg },
    validation,
    signatureValid: failures.length === 0,
    trustedSigner: !validation.some((v) => v.code === "signingCredential.untrusted"),
    generator: m.claim_generator_info?.[0]?.name,
  };
}
