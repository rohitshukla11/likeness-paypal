import "server-only";
/**
 * A small tool-calling agent loop on the Gemini API (GEMINI_API_KEY): the model asks for tools, the server runs
 * them and reports every call and every engine step as an event, until the model answers in plain words.
 * A tool can end the turn with its own words (finalText), e.g. a refusal ("Licence revoked: I didn't charge your
 * PayPal."), so what the user reads is exactly what happened, not a paraphrase. At most `maxRounds` tool rounds.
 */
import type { Content, Part } from "@google/genai";
import { generateContent, type GenAiLike } from "../ai/gemini";

export const agentModel = () => process.env.AGENT_MODEL || "gemini-3.5-flash-lite";

export type AgentEvent =
  | { t: "tool"; name: string; args: Record<string, unknown> }
  | { t: "tool_result"; name: string; ok: boolean; summary: string }
  | { t: "step"; renderId: string; step: string; status: string; detail: string; ids?: Record<string, string | null> }
  | { t: "text"; text: string }
  | { t: "error"; message: string }
  | { t: "done"; usage: Usage };

export type Usage = { model: string; promptTokens: number; outputTokens: number; thoughtTokens: number; costUsd: number };

export interface AgentTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments (an object). */
  parameters: Record<string, unknown>;
  run(args: Record<string, unknown>): Promise<unknown>;
  /** Short line for the live tool display. */
  summarize?(result: unknown): string;
  /** If it returns text, the turn ends with exactly that text (no further model call). */
  finalText?(result: unknown): string | undefined;
}

// Gemini API list prices per 1M tokens (2026-11): gemini-3.5-flash-lite $0.30 in, $2.50 out (thinking included).
const PRICE: Record<string, { in: number; out: number }> = { "gemini-3.5-flash-lite": { in: 0.3, out: 2.5 }, "gemini-3.8-flash": { in: 0.75, out: 4.5 } };
export const costOf = (u: Omit<Usage, "costUsd">) => {
  const p = PRICE[u.model] ?? PRICE["gemini-3.5-flash-lite"];
  return (u.promptTokens * p.in + (u.outputTokens + u.thoughtTokens) * p.out) / 1_000_000;
};

export async function runAgent(input: {
  system: string;
  history: { role: "user" | "model"; text: string }[];
  tools: AgentTool[];
  emit: (e: AgentEvent) => void;
  client?: GenAiLike;
  maxRounds?: number;
}): Promise<{ text: string; usage: Usage }> {
  const model = agentModel();
  const usage = { model, promptTokens: 0, outputTokens: 0, thoughtTokens: 0 };
  const contents: Content[] = input.history.map((m) => ({ role: m.role, parts: [{ text: m.text }] }));
  const byName = new Map(input.tools.map((t) => [t.name, t]));
  const declarations = input.tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters }));
  const done = (text: string) => {
    const u = { ...usage, costUsd: costOf(usage) };
    input.emit({ t: "text", text });
    input.emit({ t: "done", usage: u });
    return { text, usage: u };
  };

  for (let round = 0; round <= (input.maxRounds ?? 6); round++) {
    const res = await generateContent(model, contents, { systemInstruction: input.system, temperature: 0.2, tools: [{ functionDeclarations: declarations }] }, { client: input.client, timeoutMs: 60_000 });
    const u = res.usageMetadata;
    usage.promptTokens += u?.promptTokenCount ?? 0;
    usage.outputTokens += u?.candidatesTokenCount ?? 0;
    usage.thoughtTokens += u?.thoughtsTokenCount ?? 0;
    const content = res.candidates?.[0]?.content;
    const calls = (content?.parts ?? []).filter((p: Part) => p.functionCall).map((p: Part) => p.functionCall!);
    if (!calls.length) {
      const text = (content?.parts ?? []).map((p: Part) => (p.thought ? "" : (p.text ?? ""))).join("").trim();
      return done(text || "I couldn't come up with an answer; try asking again.");
    }
    contents.push(content!);
    const responses: Part[] = [];
    for (const call of calls) {
      const tool = byName.get(call.name ?? "");
      const args = (call.args ?? {}) as Record<string, unknown>;
      input.emit({ t: "tool", name: call.name ?? "?", args });
      let result: unknown;
      let ok = true;
      try {
        if (!tool) throw new Error(`no tool named ${call.name}`);
        result = await tool.run(args);
      } catch (e) {
        ok = false;
        result = { error: (e as Error).message };
      }
      input.emit({ t: "tool_result", name: call.name ?? "?", ok, summary: ok ? (tool?.summarize?.(result) ?? "done") : (result as { error: string }).error });
      const final = ok ? tool?.finalText?.(result) : undefined;
      if (final) return done(final);
      responses.push({ functionResponse: { name: call.name, response: { result } } });
    }
    contents.push({ role: "user", parts: responses });
  }
  return done("I stopped after several steps without finishing; please ask again more specifically.");
}
