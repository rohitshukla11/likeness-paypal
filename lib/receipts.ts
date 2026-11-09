import "server-only";
/**
 * Render receipts: canonical JSON (lib/canonical.ts) of what was made under which licence and which PayPal
 * transactions paid for it (capture, and then the creator's payout or the brand's refund), signed with Ed25519.
 * The key is RECEIPT_SIGNING_KEY (PKCS#8 DER, base64) in the environment; anyone can check a receipt with the public
 * key served at GET /api/receipts/public-key. The receipt's status (licensed | refunded) is part of what is signed.
 */
import { createHash, createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJson } from "./canonical";

export type ReceiptPayload = {
  v: 1;
  receiptId: string;
  renderId: string;
  licenceId: string;
  mandateId: string;
  creatorId: string;
  brandId: string;
  use: string;
  kind: "image" | "video";
  promptSha256: string;
  outputSha256: string;
  outputMime: string;
  model: string;
  amountCents: number;
  currency: string;
  creatorPayoutCents: number;
  platformFeeCents: number;
  /** licensed: accepted (or auto-accepted) and the creator paid; refunded: the brand rejected it. */
  status: "licensed" | "refunded";
  decision: "accept" | "reject" | "auto_accept";
  paypal: { orderId: string; authorizationId: string; captureId: string; payoutBatchId?: string; payoutSenderBatchId?: string; refundId?: string };
  renderedAt: string;
  settledAt: string;
};

export type SignedReceipt = { payload: ReceiptPayload; canonical: string; payloadSha256: string; signature: string; keyId: string; alg: "Ed25519" };

let keys: { privateKey: KeyObject; publicKey: KeyObject; keyId: string } | undefined;

function keyPair() {
  if (keys) return keys;
  const b64 = process.env.RECEIPT_SIGNING_KEY;
  if (!b64) throw new Error("RECEIPT_SIGNING_KEY is not set (see .env.example)");
  const privateKey = createPrivateKey({ key: Buffer.from(b64, "base64"), format: "der", type: "pkcs8" });
  if (privateKey.asymmetricKeyType !== "ed25519") throw new Error("RECEIPT_SIGNING_KEY must be an Ed25519 key");
  const publicKey = createPublicKey(privateKey);
  const keyId = createHash("sha256").update(publicKey.export({ format: "der", type: "spki" })).digest("hex").slice(0, 16);
  return (keys = { privateKey, publicKey, keyId });
}

/** The public key, for anyone checking receipts: PEM, JWK and its id (first 16 hex of sha256 of the SPKI DER). */
export function receiptPublicKey() {
  const { publicKey, keyId } = keyPair();
  return { alg: "Ed25519" as const, keyId, pem: publicKey.export({ format: "pem", type: "spki" }).toString(), jwk: publicKey.export({ format: "jwk" }) };
}

export function canonical(p: ReceiptPayload): string {
  return canonicalJson(p);
}

export function signPayload(p: ReceiptPayload): SignedReceipt {
  const { privateKey, keyId } = keyPair();
  const c = canonical(p);
  const signature = sign(null, Buffer.from(c), privateKey).toString("base64");
  return { payload: p, canonical: c, payloadSha256: createHash("sha256").update(c).digest("hex"), signature, keyId, alg: "Ed25519" };
}

/** Checks a stored receipt (its canonical JSON exactly as signed) against this server's public key. */
export function checkReceipt(r: { canonical: string; signature: string; keyId: string }): boolean {
  try {
    const { publicKey, keyId } = keyPair();
    if (r.keyId !== keyId) return false;
    return verify(null, Buffer.from(r.canonical), publicKey, Buffer.from(r.signature, "base64"));
  } catch {
    return false;
  }
}
