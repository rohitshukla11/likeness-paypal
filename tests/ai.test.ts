/** The AI provider on a fake Gemini client: caps, stand-ins, the safety filter, the label, and the engine path. */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { ruleCheck } from "../lib/ai/filter";
import type { GenAiLike } from "../lib/ai/gemini";
import { AiProvider } from "../lib/ai/provider";
import { aiCaps, imageKeys, MemoryQuota } from "../lib/ai/quota";
import { StubProvider, type RenderInput } from "../lib/engine/providers";
import { renderAndPay } from "../lib/engine/render-and-pay";
import { testEngine } from "./fakes";

const caps = { imageDaily: 30, imagePerWorkspace: 3, videoTotal: 3 };
const input = (over: Partial<RenderInput> = {}): RenderInput => ({ renderId: "rnd_x", kind: "image", prompt: "Rohit holding a coffee cup, sunny café", use: "advertising", workspaceId: "ws_1", creatorPhotoRef: "/demo/rohit.svg", ...over });
const ref = async () => [{ bytes: new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c98d67" } }).jpeg().toBuffer()), mime: "image/jpeg" as const }];

/** A fake Gemini: the filter model answers JSON, the image model returns a PNG. Records every call. */
async function fakeGemini(opts: { banned?: string[] } = {}) {
  const png = (await sharp({ create: { width: 512, height: 512, channels: 3, background: "#8b5cf6" } }).png().toBuffer()).toString("base64");
  const calls: string[] = [];
  const client = {
    models: {
      generateContent: async ({ model }: { model: string }) => {
        calls.push(model);
        if (model.includes("flash-lite")) return { candidates: [{ content: { parts: [{ text: JSON.stringify({ banned: opts.banned ?? [], fitsCategory: true, reason: "fine" }) }] } }] };
        return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }], usageMetadata: { totalTokenCount: 1 } };
      },
    },
  } as unknown as GenAiLike;
  return { client, calls };
}

describe("AI caps", () => {
  it("reserve is all or nothing", async () => {
    const q = new MemoryQuota();
    const keys = [
      { key: "a", limit: 1 },
      { key: "b", limit: 2 },
    ];
    assert.equal(await q.reserve(keys), true);
    assert.equal(await q.reserve(keys), false, "a is full");
    assert.equal(q.counts.get("b"), 1, "b was not taken by the refused reservation");
  });
  it("defaults: 30 a day, 3 per workspace, 3 videos", () => {
    assert.deepEqual(aiCaps({} as NodeJS.ProcessEnv), { imageDaily: 30, imagePerWorkspace: 3, videoTotal: 3 });
    assert.deepEqual(
      imageKeys("ws_9", new Date("2026-11-11T10:00:00Z"), caps).map((k) => k.key),
      ["image:day:2026-11-11", "image:ws:ws_9"],
    );
  });
});

describe("safety filter rules", () => {
  it("refuses banned uses without any model call", () => {
    assert.match(ruleCheck("Rohit says vote for our candidate").join(), /Political/);
    assert.match(ruleCheck("a deepfake confession").join(), /Deception/);
    assert.deepEqual(ruleCheck("Rohit holding a coffee cup in a café"), []);
  });
});

describe("AiProvider (images)", () => {
  it("renders with Gemini from the reference photo, labelled JPEG, filter first", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps });
    const out = await p.render(input());
    assert.deepEqual(g.calls, ["gemini-3.5-flash-lite", "gemini-nano-banana-2.1"]);
    assert.equal(out.mime, "image/jpeg");
    assert.equal(out.model, "gemini-nano-banana-2.1");
    assert.ok(out.bytes && out.bytes.length > 1000);
    assert.equal(out.note, null);
    const meta = await sharp(Buffer.from(out.bytes!)).metadata();
    assert.equal(meta.format, "jpeg");
  });

  it("over the per-workspace cap: the stub stands in with a note, and Gemini is not called", async () => {
    const g = await fakeGemini();
    const quota = new MemoryQuota();
    const p = new AiProvider({ quota, stub: new StubProvider(), references: ref, client: g.client, caps });
    for (let i = 0; i < 3; i++) await p.render(input());
    const before = g.calls.length;
    const out = await p.render(input());
    assert.equal(g.calls.length, before, "no AI call over the cap");
    assert.match(out.model, /^stub/);
    assert.match(out.note!, /AI image cap is reached/);
    // another workspace still gets real renders
    const other = await p.render(input({ workspaceId: "ws_2" }));
    assert.equal(other.model, "gemini-nano-banana-2.1");
  });

  it("over the daily cap across workspaces: the stub stands in", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps: { ...caps, imageDaily: 2 } });
    await p.render(input({ workspaceId: "a" }));
    await p.render(input({ workspaceId: "b" }));
    const out = await p.render(input({ workspaceId: "c" }));
    assert.match(out.note!, /cap is reached \(2 a day/);
  });

  it("no reference photo: the stub stands in, no AI call", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: async () => [], client: g.client, caps });
    const out = await p.render(input());
    assert.equal(g.calls.length, 0);
    assert.match(out.note!, /no reference photo/);
  });

  it("the Gemini classifier refuses: the render throws (the engine then voids)", async () => {
    const g = await fakeGemini({ banned: ["impersonation"] });
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps });
    await assert.rejects(p.render(input()), /safety filter/);
    assert.deepEqual(g.calls, ["gemini-3.5-flash-lite"], "no image call after a refusal");
  });

  it("video without a video renderer or clip: a pre-made animation stands in, labelled", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps, demoClip: async () => null });
    const out = await p.render(input({ kind: "video" }));
    assert.equal(g.calls.length, 0);
    assert.match(out.note!, /demo/i);
  });
});

describe("engine with the AI provider", () => {
  it("stores the generated image and serves it at /media/<render id>", async () => {
    const g = await fakeGemini();
    const t = testEngine({ provider: new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps }) });
    const r = await renderAndPay({ renderId: "rnd_ai1", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "Rohit with a coffee cup" }, t.deps);
    assert.equal(r.status, "in_review");
    assert.equal(r.outputRef, "/media/rnd_ai1");
    assert.equal(r.outputMime, "image/jpeg");
    assert.equal(t.store.media.get("rnd_ai1")!.sha256, r.outputSha256);
  });

  it("a safety refusal after the authorization voids it", async () => {
    const g = await fakeGemini({ banned: ["political"] });
    const t = testEngine({ provider: new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps }) });
    const r = await renderAndPay({ renderId: "rnd_ai2", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "Rohit at a rally" }, t.deps);
    assert.equal(r.status, "voided");
    assert.deepEqual(
      t.calls.map((c) => c.op),
      ["createVaultOrder", "voidAuthorization"],
    );
    assert.equal(t.store.refusals[0].reason, "render_failed");
  });
});
