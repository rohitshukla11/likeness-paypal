import { receiptPublicKey } from "@/lib/receipts";

/** The Ed25519 public key that checks every receipt: { alg, keyId, pem, jwk }. */
export async function GET() {
  return Response.json(receiptPublicKey(), { headers: { "Cache-Control": "public, max-age=300" } });
}
