import { connection } from "next/server";
import { DrizzleQuota } from "@/lib/ai/quota-store";
import { geminiConfigured } from "@/lib/ai/gemini";
import { reviewLicence } from "@/lib/agent/creator";
import type { AgentEvent } from "@/lib/agent/llm";
import { HttpError } from "@/lib/errors";
import { getSession } from "@/lib/session";

/** The creator agent's review of a pending licence request, streamed as newline-delimited JSON events. */
export async function POST(req: Request) {
  await connection();
  const s = await getSession();
  if (!s) return Response.json({ error: "no session" }, { status: 401 });
  if (!geminiConfigured()) return Response.json({ error: "the agent needs GEMINI_API_KEY" }, { status: 503 });
  const { licenceId } = (await req.json().catch(() => ({}))) as { licenceId?: string };
  if (!licenceId) return Response.json({ error: "licenceId is required" }, { status: 400 });
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        const r = await reviewLicence({ workspaceId: s.id, creatorId: s.creatorId, licenceId, emit, quota: new DrizzleQuota() });
        controller.enqueue(enc.encode(`${JSON.stringify({ t: "review", ...r })}\n`));
      } catch (e) {
        emit({ t: "error", message: e instanceof HttpError ? e.message : (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
