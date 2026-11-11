import { connection } from "next/server";
import { DrizzleQuota } from "@/lib/ai/quota-store";
import { runBrandAgent } from "@/lib/agent/brand";
import { paypalReadTools } from "@/lib/agent/paypal-read";
import type { AgentEvent } from "@/lib/agent/llm";
import { geminiConfigured } from "@/lib/ai/gemini";
import { engineDeps } from "@/lib/engine";
import { getSession } from "@/lib/session";

export const maxDuration = 300;

/**
 * The brand agent, streamed: POST { messages: [{ role: "user" | "model", text }] } → newline-delimited JSON events
 * (tool calls, engine steps, the answer), so the page shows every step as it happens.
 */
export async function POST(req: Request) {
  await connection();
  const s = await getSession();
  if (!s) return Response.json({ error: "no session" }, { status: 401 });
  if (!geminiConfigured()) return Response.json({ error: "the agent needs GEMINI_API_KEY" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { messages?: { role?: string; text?: string }[] };
  const history = (body.messages ?? [])
    .filter((m) => typeof m.text === "string" && m.text.trim())
    .map((m) => ({ role: m.role === "model" ? ("model" as const) : ("user" as const), text: String(m.text).slice(0, 2000) }))
    .slice(-12);
  if (!history.length || history[history.length - 1].role !== "user") return Response.json({ error: "send the user's message last" }, { status: 400 });

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (e: AgentEvent) => controller.enqueue(enc.encode(`${JSON.stringify(e)}\n`));
      try {
        await runBrandAgent({ workspaceId: s.id, brandId: s.brandId, history, emit, deps: { engine: (onStep) => engineDeps({ onStep }), paypalRead: paypalReadTools(), quota: new DrizzleQuota() } });
      } catch (e) {
        emit({ t: "error", message: (e as Error).message });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
