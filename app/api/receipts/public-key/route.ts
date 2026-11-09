import { connection } from "next/server";
import { receiptPublicKey } from "@/lib/receipts";

/** The Ed25519 public key that checks every receipt: { alg, keyId, pem, jwk }. Read at request time, not build time. */
export async function GET() {
  await connection();
  return Response.json(receiptPublicKey(), { headers: { "Cache-Control": "public, max-age=300" } });
}
