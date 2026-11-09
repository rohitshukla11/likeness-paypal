import { connection } from "next/server";
import { engineDeps, settle } from "@/lib/engine";

/**
 * Auto-accepts every render past its review window (payout + receipt) and retries stuck settlements. Called by a
 * cron job, and on dashboard loads. With CRON_SECRET set, the caller must send `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: Request) {
  await connection();
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return Response.json({ error: "unauthorized" }, { status: 401 });
  const settled = await settle(engineDeps());
  return Response.json({ settled: settled.map((r) => ({ id: r.id, status: r.status, decision: r.decision, payoutBatchId: r.payoutBatchId, refundId: r.refundId })) });
}
