/** The agent loop, its plain-words refusals and caps, step events, and the vision check — on fakes, no network. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { GenAiLike } from "../lib/ai/gemini";
import { visionCompliance } from "../lib/ai/vision";
import { agentKeys, plainWords } from "../lib/agent/brand";
import { runAgent, type AgentEvent, type AgentTool } from "../lib/agent/llm";
import { MemoryQuota } from "../lib/ai/quota";
import { renderAndPay, type StepEvent } from "../lib/engine/render-and-pay";
import { testEngine } from "./fakes";

/** A fake Gemini that plays back a script of responses (function calls, then text). */
function scripted(responses: object[]) {
  const seen: unknown[] = [];
  let i = 0;
  const client = {
    models: {
      generateContent: async (req: unknown) => {
        seen.push(req);
        const r = responses[Math.min(i++, responses.length - 1)];
        return { candidates: [{ content: { role: "model", parts: Array.isArray(r) ? r : [r] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 } };
      },
    },
  } as unknown as GenAiLike;
  return { client, seen };
}

describe("agent loop", () => {
  const echo: AgentTool = { name: "get_status", description: "status", parameters: { type: "object", properties: {} }, run: async () => ({ wallet: "saved" }), summarize: () => "wallet saved" };

  it("calls a tool, feeds the result back, and answers", async () => {
    const f = scripted([{ functionCall: { name: "get_status", args: {} } }, { text: "Your wallet is saved." }]);
    const events: AgentEvent[] = [];
    const r = await runAgent({ system: "s", history: [{ role: "user", text: "status?" }], tools: [echo], emit: (e) => events.push(e), client: f.client });
    assert.equal(r.text, "Your wallet is saved.");
    assert.deepEqual(
      events.map((e) => e.t),
      ["tool", "tool_result", "text", "done"],
    );
    assert.equal(f.seen.length, 2, "one tool round, then the answer");
    assert.ok(r.usage.costUsd > 0);
  });

  it("a refusal ends the turn with the tool's exact words (no paraphrase, no further model call)", async () => {
    const make: AgentTool = { name: "make_ad", description: "ad", parameters: { type: "object", properties: {} }, run: async () => ({ status: "refused", say: "Licence revoked: I didn't charge your PayPal." }), finalText: (r) => (r as { say?: string }).say };
    const f = scripted([{ functionCall: { name: "make_ad", args: { prompt: "another one" } } }, { text: "should never be used" }]);
    const r = await runAgent({ system: "s", history: [{ role: "user", text: "Make another one" }], tools: [make], emit: () => {}, client: f.client });
    assert.equal(r.text, "Licence revoked: I didn't charge your PayPal.");
    assert.equal(f.seen.length, 1);
  });

  it("a failing tool is reported to the model, not thrown", async () => {
    const bad: AgentTool = { name: "get_status", description: "x", parameters: { type: "object", properties: {} }, run: async () => Promise.reject(new Error("db down")) };
    const f = scripted([{ functionCall: { name: "get_status", args: {} } }, { text: "Sorry, I couldn't read your status." }]);
    const events: AgentEvent[] = [];
    await runAgent({ system: "s", history: [{ role: "user", text: "status" }], tools: [bad], emit: (e) => events.push(e), client: f.client });
    const tr = events.find((e) => e.t === "tool_result") as Extract<AgentEvent, { t: "tool_result" }>;
    assert.equal(tr.ok, false);
    assert.match(tr.summary, /db down/);
  });
});

describe("plain words", () => {
  it("says what happened and that nothing was charged", () => {
    assert.equal(plainWords({ status: "refused", amountCents: 0, error: "the creator revoked this licence" }, "licence_revoked"), "Licence revoked: I didn't charge your PayPal.");
    assert.match(plainWords({ status: "refused", amountCents: 0, error: null }, "daily_cap")!, /daily cap: I didn't charge your PayPal/);
    assert.match(plainWords({ status: "voided", amountCents: 200, error: "render_failed" }, null)!, /voided the authorization: you weren't charged/);
    assert.equal(plainWords({ status: "in_review", amountCents: 200, error: null }, null), undefined);
  });
  it("agent caps: 20 turns per workspace and a daily cap across the demo", async () => {
    const q = new MemoryQuota();
    const now = new Date("2026-11-11T10:00:00Z");
    const caps = { perWorkspace: 2, daily: 3 };
    assert.equal(await q.reserve(agentKeys("ws_a", now, caps)), true);
    assert.equal(await q.reserve(agentKeys("ws_a", now, caps)), true);
    assert.equal(await q.reserve(agentKeys("ws_a", now, caps)), false, "per workspace");
    assert.equal(await q.reserve(agentKeys("ws_b", now, caps)), true);
    assert.equal(await q.reserve(agentKeys("ws_c", now, caps)), false, "daily, across workspaces");
  });
});

describe("engine step events", () => {
  it("a paid render reports every step in order", async () => {
    const t = testEngine();
    const steps: StepEvent[] = [];
    t.deps.onStep = (e) => steps.push(e);
    t.deps.precheck = async () => ({ ok: true, detail: "rules" });
    await renderAndPay({ renderId: "rnd_s1", licenceId: "lic_1", mandateId: "man_1", kind: "image", aspect: "9:16", use: "advertising", prompt: "café ad" }, t.deps);
    assert.deepEqual(
      steps.map((s) => `${s.step}:${s.status}`),
      ["prompt_check:ok", "policy:ok", "authorize:ok", "render:ok", "compliance:ok", "capture:ok", "review:waiting"],
    );
    assert.equal((await t.store.getRender("rnd_s1"))!.aspect, "9:16");
  });
  it("a revoked licence reports the refusal, with zero PayPal calls", async () => {
    const t = testEngine({ licence: { status: "revoked", revokedAt: new Date("2026-11-10T11:00:00Z") } });
    const steps: StepEvent[] = [];
    t.deps.onStep = (e) => steps.push(e);
    await renderAndPay({ renderId: "rnd_s2", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "another one" }, t.deps);
    assert.deepEqual(
      steps.map((s) => `${s.step}:${s.status}`),
      ["policy:refused"],
    );
    assert.equal(steps[0].ids?.reason, "licence_revoked");
    assert.equal(t.calls.length, 0);
  });
});

describe("vision compliance", () => {
  const fake = (verdict: object) =>
    ({ models: { generateContent: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] }) } }) as unknown as GenAiLike;
  const out = (over: object = {}) => ({ outputRef: "", bytes: new Uint8Array([255, 216, 1]), sha256: "x", mime: "image/jpeg", model: "gemini-nano-banana-2.1", ...over });
  const refs = async () => [{ bytes: new Uint8Array([1]), mime: "image/jpeg" as const }];

  it("passes one adult who matches the creator", async () => {
    const v = visionCompliance({ references: refs, client: fake({ people: 1, adult: true, sameAsReference: true, banned: [], unexpectedTextOrLogos: false, reason: "ok" }) });
    const r = await v.check({ renderId: "r", use: "advertising", prompt: "p", output: out(), creatorPhotoRef: "/demo/rohit.svg" });
    assert.equal(r.ok, true);
  });
  it("fails a different person or banned content", async () => {
    const v = visionCompliance({ references: refs, client: fake({ people: 1, adult: true, sameAsReference: false, banned: ["political"], unexpectedTextOrLogos: false, reason: "rally" }) });
    const r = await v.check({ renderId: "r", use: "advertising", prompt: "p", output: out(), creatorPhotoRef: "/demo/rohit.svg" });
    assert.equal(r.ok, false);
    assert.match((r as { reason: string }).reason, /doesn't look like the licensed creator; banned content: political/);
  });
  it("fails closed when the check can't run", async () => {
    const broken = { models: { generateContent: async () => Promise.reject(new Error("timeout")) } } as unknown as GenAiLike;
    const r = await visionCompliance({ references: refs, client: broken }).check({ renderId: "r", use: "a", prompt: "p", output: out(), creatorPhotoRef: null });
    assert.equal(r.ok, false);
  });
  it("pre-made demo renders pass with a note, no model call", async () => {
    let called = false;
    const spy = { models: { generateContent: async () => ((called = true), {}) } } as unknown as GenAiLike;
    const r = await visionCompliance({ references: refs, client: spy }).check({ renderId: "r", use: "a", prompt: "p", output: out({ bytes: undefined, mime: "image/svg+xml", model: "stub-image (pre-generated)" }), creatorPhotoRef: null });
    assert.equal(r.ok, true);
    assert.equal(called, false);
  });
});
