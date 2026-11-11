import "server-only";
/**
 * The creator's agent: reviews a pending licence request and recommends approve, decline or ask, with reasons in
 * plain words. It reads the request, the creator's own terms, the brand's history with this creator, and checks
 * the brief against the banned-use rules; one structured Gemini call then weighs it up. It only advises: the
 * creator still approves or declines. Counts against the same agent caps as the brand agent.
 */
import { and, eq } from "drizzle-orm";
import { generateContent, type GenAiLike } from "../ai/gemini";
import { ruleCheck } from "../ai/filter";
import type { Quota } from "../ai/quota";
import { db } from "../db";
import { brands, creators, licences, renders } from "../db/schema";
import { HttpError } from "../errors";
import { agentCaps, agentKeys } from "./brand";
import { agentModel, costOf, type AgentEvent } from "./llm";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const SCHEMA = {
  type: "object",
  properties: {
    recommendation: { type: "string", enum: ["approve", "decline", "ask"] },
    summary: { type: "string", description: "One sentence for the creator" },
    reasons: { type: "array", items: { type: "string" }, description: "Two to four short reasons in plain words" },
  },
  required: ["recommendation", "summary", "reasons"],
};

export async function reviewLicence(input: { workspaceId: string; creatorId: string; licenceId: string; emit: (e: AgentEvent) => void; quota: Quota; client?: GenAiLike; now?: () => Date }) {
  const step = (name: string, status: string, detail: string) => input.emit({ t: "step", renderId: input.licenceId, step: name, status, detail });
  const [row] = await db()
    .select({ l: licences, brand: brands.name, c: creators })
    .from(licences)
    .innerJoin(brands, eq(brands.id, licences.brandId))
    .innerJoin(creators, eq(creators.id, licences.creatorId))
    .where(and(eq(licences.id, input.licenceId), eq(licences.creatorId, input.creatorId)));
  if (!row) throw new HttpError(404, "no such request");
  if (!(await input.quota.reserve(agentKeys(input.workspaceId, (input.now ?? (() => new Date()))())))) {
    const c = agentCaps();
    const text = `The agent has reached its limit (${c.perWorkspace} turns per demo workspace, ${c.daily} a day). You can still decide yourself.`;
    input.emit({ t: "text", text });
    return { recommendation: "ask" as const, summary: text, reasons: [] };
  }
  const { l, c } = row;
  step("request", "ok", `${row.brand}: ${l.allowedUses.join(", ")}, ${l.renderCap} renders over ${l.days} days, "${l.brief ?? ""}"`);
  const outside = l.allowedUses.filter((u) => !c.allowedUses.includes(u));
  const tooLong = l.days > c.maxDays;
  const tooMany = l.renderCap > c.maxRendersPerLicence;
  step("terms", outside.length || tooLong || tooMany ? "failed" : "ok", outside.length || tooLong || tooMany ? `outside your terms: ${[outside.length ? `uses ${outside.join(", ")}` : "", tooLong ? `${l.days} days (max ${c.maxDays})` : "", tooMany ? `${l.renderCap} renders (max ${c.maxRendersPerLicence})` : ""].filter(Boolean).join("; ")}` : `within your terms (${usd(c.pricePerRenderCents)} per image, video ${c.videoMultiplier}×)`);
  const past = await db().select({ status: licences.status }).from(licences).where(and(eq(licences.brandId, l.brandId), eq(licences.creatorId, l.creatorId)));
  const pastRenders = await db().select({ status: renders.status }).from(renders).innerJoin(licences, eq(licences.id, renders.licenceId)).where(and(eq(licences.brandId, l.brandId), eq(licences.creatorId, l.creatorId)));
  const history = { licences: past.length - 1, revoked: past.filter((p) => p.status === "revoked").length, ads: pastRenders.length, rejected: pastRenders.filter((r) => r.status === "rejected").length };
  step("history", "ok", history.licences ? `${history.licences} earlier licence(s), ${history.revoked} revoked; ${history.ads} ad(s), ${history.rejected} rejected by the brand` : "first request from this brand");
  const hits = ruleCheck(l.brief ?? "");
  step("brief", hits.length ? "failed" : "ok", hits.length ? `banned-use words: ${hits.join("; ")}` : "no banned-use words in the brief");

  const facts = { brand: row.brand, uses: l.allowedUses, renders: l.renderCap, days: l.days, brief: l.brief, price: usd(c.pricePerRenderCents), creatorTerms: { uses: c.allowedUses, maxDays: c.maxDays, maxRenders: c.maxRendersPerLicence }, outsideTerms: { uses: outside, tooLong, tooMany }, brandHistory: history, bannedRuleHits: hits };
  const model = agentModel();
  const res = await generateContent(
    model,
    [{ role: "user", parts: [{ text: `Review this licence request for the creator:\n${JSON.stringify(facts, null, 2)}` }] }],
    {
      systemInstruction: "You advise a creator who licenses their face for AI ads. Recommend approve when the request is within their terms, the brief is an ordinary ad, and the brand's history is clean; decline when it breaks their terms or hits a banned use (political, adult, minors, impersonation, deception); ask when the brief is vague or unusual. Be brief and plain. JSON only.",
      temperature: 0,
      responseMimeType: "application/json",
      responseJsonSchema: SCHEMA,
    },
    { client: input.client, timeoutMs: 30_000 },
  );
  const text = res.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}";
  const out = JSON.parse(text) as { recommendation: "approve" | "decline" | "ask"; summary: string; reasons: string[] };
  // Hard rules win over the model: a banned word or a request outside the terms is never "approve".
  if ((hits.length || outside.length || tooLong || tooMany) && out.recommendation === "approve") out.recommendation = hits.length ? "decline" : "ask";
  step("recommendation", out.recommendation === "approve" ? "ok" : out.recommendation === "decline" ? "failed" : "waiting", `${out.recommendation}: ${out.summary}`);
  const u = res.usageMetadata;
  input.emit({ t: "text", text: out.summary });
  input.emit({ t: "done", usage: { model, promptTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0, thoughtTokens: u?.thoughtsTokenCount ?? 0, costUsd: costOf({ model, promptTokens: u?.promptTokenCount ?? 0, outputTokens: u?.candidatesTokenCount ?? 0, thoughtTokens: u?.thoughtsTokenCount ?? 0 }) } });
  return out;
}
