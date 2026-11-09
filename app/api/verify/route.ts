import { createHash } from "node:crypto";
import { verifyHash, verifyReceipt } from "@/lib/verify";

/** Anyone can check a file: multipart field "file". It is hashed and dropped; nothing is stored. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return Response.json({ error: "attach a file" }, { status: 400 });
  if (file.size > 60 * 1024 * 1024) return Response.json({ error: "file is larger than 60 MB" }, { status: 413 });
  const sha = createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex");
  return Response.json(await verifyHash(sha));
}

/** GET /api/verify?receipt=<receipt id> or ?sha=<sha256 of the delivered file>. */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const receipt = q.get("receipt");
  if (receipt) return Response.json(await verifyReceipt(receipt));
  const sha = q.get("sha");
  if (sha) return Response.json(await verifyHash(sha));
  return Response.json({ error: "pass ?receipt= or ?sha=" }, { status: 400 });
}
