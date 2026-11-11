import "server-only";
/**
 * The prompt check BEFORE any money moves (the engine's precheck): the local banned-use rules always, plus the
 * Gemini classifier (gemini-3.5-flash-lite) when GEMINI_API_KEY is set, which also checks the prompt fits the
 * licensed use. Fails closed. A refusal is recorded as a refused render with zero PayPal calls.
 */
import type { RenderRequest } from "../engine/render-and-pay";
import { checkPrompt } from "./filter";

export async function promptPrecheck(req: RenderRequest): Promise<{ ok: true; detail: string } | { ok: false; reason: string; detail: string }> {
  const f = await checkPrompt(req.prompt, req.use);
  if (!f.allowed) return { ok: false, reason: "prompt_refused", detail: f.reasons.join("; ") };
  return { ok: true, detail: `passed: ${f.layers.filter((l) => l.ran).map((l) => l.name).join(" + ")}` };
}
