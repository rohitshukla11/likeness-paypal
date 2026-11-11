/**
 * The likeness-eth provider (RENDER_PROVIDER=eth) on a fake Gemini client: its prompt templates, the face check with
 * one regeneration (counted in the image caps), the video's own 16:9 opening still (covered by the video slot), 8 s
 * clips, the stand-ins over the caps, and the engine path (one authorization and one capture at the video price).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { EthProvider, ethVideoSeconds, geminiFaceCheck } from "../lib/ai/eth";
import { fullPrompt, motionPrompt, promptsFor, stillPrompt } from "../lib/ai/eth-prompts";
import type { GenAiLike } from "../lib/ai/gemini";
import { MemoryQuota } from "../lib/ai/quota";
import { StubProvider, type RenderInput } from "../lib/engine/providers";
import { renderAndPay } from "../lib/engine/render-and-pay";
import { testEngine } from "./fakes";

const caps = { imageDaily: 30, imagePerWorkspace: 3, videoTotal: 3 };
const input = (over: Partial<RenderInput> = {}): RenderInput => ({ renderId: "rnd_x", kind: "image", prompt: "Rohit running along a beach path at sunrise", use: "advertising", workspaceId: "ws_1", creatorPhotoRef: "/demo/rohit.svg", ...over });
const ref = async () => [{ bytes: new Uint8Array(await sharp({ create: { width: 64, height: 64, channels: 3, background: "#c98d67" } }).jpeg().toBuffer()), mime: "image/jpeg" as const }];
const imageCount = (q: MemoryQuota) => q.counts.get("image:ws:ws_1") ?? 0;

/** A fake Gemini: the image model returns a PNG; the face check answers from `faces` in order (default: a match). */
async function fakeGemini(faces: boolean[] = [], opts: { faceError?: boolean } = {}) {
  const png = (await sharp({ create: { width: 320, height: 180, channels: 3, background: "#8b5cf6" } }).png().toBuffer()).toString("base64");
  const calls: { model: string; text: string; aspect?: string }[] = [];
  const answers = [...faces];
  const client = {
    models: {
      generateContent: async ({ model, contents, config }: { model: string; contents: { parts: { text?: string }[] }[]; config?: { imageConfig?: { aspectRatio?: string } } }) => {
        calls.push({ model, text: contents[0].parts.map((p) => p.text ?? "").join("\n"), aspect: config?.imageConfig?.aspectRatio });
        if (model.includes("flash-lite")) {
          if (opts.faceError) throw new Error("model overloaded");
          const match = answers.length ? answers.shift()! : true;
          return { candidates: [{ content: { parts: [{ text: JSON.stringify({ people: 1, sameAsReference: match, reason: match ? "same person" : "a different face" }) }] } }] };
        }
        return { candidates: [{ content: { parts: [{ inlineData: { mimeType: "image/png", data: png } }] } }] };
      },
    },
  } as unknown as GenAiLike;
  return { client, calls, images: () => calls.filter((c) => !c.model.includes("flash-lite")), faceChecks: () => calls.filter((c) => c.model.includes("flash-lite")) };
}

const video = () => {
  const seen: { prompt: string; seconds: number; aspectRatio: string; mime: string }[] = [];
  return {
    seen,
    fn: async (v: { image: Uint8Array; mime: "image/jpeg"; prompt: string; seconds: number; aspectRatio: "16:9" }) => {
      seen.push({ prompt: v.prompt, seconds: v.seconds, aspectRatio: v.aspectRatio, mime: v.mime });
      return { bytes: new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]), mime: "video/mp4" as const, model: "gemini-omni-1.2-flash" };
    },
  };
};

describe("likeness-eth prompt templates", () => {
  it("keep the brief and add the wardrobe, accessory and pose rules", () => {
    const p = stillPrompt("Rohit in a café with our cold brew", "image");
    assert.match(p, /Brief: Rohit in a café with our cold brew$/);
    assert.match(p, /Never copy the clothing from the reference photo/);
    assert.match(p, /Accessories: none from the reference photo/);
    assert.match(p, /never the reference photo's straight-on pose/);
    assert.match(p, /Square advertising photo/);
    assert.match(stillPrompt("x", "image", "9:16"), /Vertical 9:16/);
  });
  it("a video gets a 16:9 opening still and a motion prompt", () => {
    const v = promptsFor("video", "running on the beach");
    assert.match(v.still, /opening frame of a short video ad: landscape 16:9/);
    assert.equal(v.motion, motionPrompt("running on the beach"));
    assert.match(v.motion!, /One continuous shot, no cuts/);
    assert.match(fullPrompt("video", v), /^Opening frame \(image model\):[\s\S]*Motion \(video model\):/);
    assert.equal(promptsFor("image", "x").motion, undefined);
  });
  it("videos last 8 s by default (VIDEO_SECONDS, 3 to 15)", () => {
    assert.equal(ethVideoSeconds({} as unknown as NodeJS.ProcessEnv), 8);
    assert.equal(ethVideoSeconds({ VIDEO_SECONDS: "6" } as unknown as NodeJS.ProcessEnv), 6);
    assert.equal(ethVideoSeconds({ VIDEO_SECONDS: "60" } as unknown as NodeJS.ProcessEnv), 15);
  });
});

describe("EthProvider (images)", () => {
  it("one image with likeness-eth's prompt, face-checked, labelled; one image slot", async () => {
    const g = await fakeGemini();
    const q = new MemoryQuota();
    const out = await new EthProvider({ quota: q, stub: new StubProvider(), references: ref, client: g.client, caps }).render(input({ aspect: "9:16" }));
    assert.equal(g.images().length, 1);
    assert.equal(g.images()[0].aspect, "9:16");
    assert.match(g.images()[0].text, /Never copy the clothing from the reference photo/);
    assert.equal(g.faceChecks().length, 1);
    assert.equal(out.mime, "image/jpeg");
    assert.equal(out.model, "gemini-nano-banana-2.1");
    assert.match(out.note!, /face check passed/);
    assert.equal(imageCount(q), 1);
  });

  it("a face mismatch is regenerated once, and the regeneration takes another image slot", async () => {
    const g = await fakeGemini([false, true]);
    const q = new MemoryQuota();
    const out = await new EthProvider({ quota: q, stub: new StubProvider(), references: ref, client: g.client, caps }).render(input());
    assert.equal(g.images().length, 2);
    assert.match(out.note!, /second try/);
    assert.equal(imageCount(q), 2);
  });

  it("two mismatches fail the render (the engine then voids the authorization)", async () => {
    const g = await fakeGemini([false, false]);
    await assert.rejects(new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps }).render(input()), /didn't match the creator twice/);
    assert.equal(g.images().length, 2);
  });

  it("no regeneration over the image cap: the render fails after one call", async () => {
    const g = await fakeGemini([false]);
    const p = new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps: { ...caps, imagePerWorkspace: 1 } });
    await assert.rejects(p.render(input()), /image cap is reached, so it wasn't regenerated/);
    assert.equal(g.images().length, 1);
  });

  it("over the image cap a demo image stands in, with no Gemini call", async () => {
    const g = await fakeGemini();
    const out = await new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps: { ...caps, imagePerWorkspace: 0 } }).render(input());
    assert.equal(g.calls.length, 0);
    assert.match(out.note!, /image cap is reached/);
  });

  it("a face check that can't run accepts the image (the engine's compliance check still judges it)", async () => {
    const g = await fakeGemini([], { faceError: true });
    const r = await geminiFaceCheck(g.client)(await ref(), (await ref())[0]);
    assert.deepEqual([r.ran, r.match], [false, true]);
  });
});

describe("EthProvider (video)", () => {
  it("its own 16:9 opening still, then 8 s of motion at 16:9; a video slot, no image slot", async () => {
    const g = await fakeGemini();
    const v = video();
    const q = new MemoryQuota();
    const out = await new EthProvider({ quota: q, stub: new StubProvider(), references: ref, client: g.client, caps, video: v.fn, seconds: 8 }).render(input({ kind: "video" }));
    assert.equal(g.images().length, 1);
    assert.equal(g.images()[0].aspect, "16:9");
    assert.match(g.images()[0].text, /opening frame of a short video ad/);
    assert.deepEqual(v.seen.map((x) => [x.seconds, x.aspectRatio, x.mime]), [[8, "16:9", "image/jpeg"]]);
    assert.match(v.seen[0].prompt, /^Action: Rohit running along a beach path at sunrise/);
    assert.equal(out.mime, "video/mp4");
    assert.equal(out.model, "gemini-nano-banana-2.1 + gemini-omni-1.2-flash");
    assert.equal(q.counts.get("video:total"), 1);
    assert.equal(imageCount(q), 0, "the opening still is part of the video");
  });

  it("the opening still's regeneration counts toward the image caps", async () => {
    const g = await fakeGemini([false, true]);
    const q = new MemoryQuota();
    await new EthProvider({ quota: q, stub: new StubProvider(), references: ref, client: g.client, caps, video: video().fn, seconds: 8 }).render(input({ kind: "video" }));
    assert.equal(g.images().length, 2);
    assert.equal(imageCount(q), 1);
  });

  it("over the video cap the saved demo clip plays, with no model call", async () => {
    const g = await fakeGemini();
    const v = video();
    const out = await new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps: { ...caps, videoTotal: 0 }, video: v.fn, demoClip: async () => new Uint8Array([1, 2, 3]) }).render(input({ kind: "video" }));
    assert.equal(g.calls.length, 0);
    assert.equal(v.seen.length, 0);
    assert.equal(out.model, "demo clip (pre-recorded)");
  });
});

describe("engine with the EthProvider", () => {
  it("a video is authorized and captured once, at the licence's video price (the opening still isn't charged)", async () => {
    const g = await fakeGemini();
    const t = testEngine({ mandate: { stepUpThresholdCents: 1000 }, provider: new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps, video: video().fn, seconds: 8 }) });
    const r = await renderAndPay({ renderId: "rnd_eth1", licenceId: "lic_1", mandateId: "man_1", kind: "video", use: "advertising", prompt: "Rohit running on the beach with our cold brew" }, t.deps);
    assert.equal(r.status, "in_review");
    assert.equal(r.amountCents, 600, "200 × video multiplier 3");
    assert.equal(r.outputMime, "video/mp4");
    assert.equal(t.calls.filter((c) => c.op === "createVaultOrder").length, 1, "one order (authorized on the saved wallet)");
    assert.equal(t.calls.filter((c) => c.op === "captureAuthorization").length, 1);
  });

  it("two face mismatches void the authorization: never captured", async () => {
    const g = await fakeGemini([false, false]);
    const t = testEngine({ provider: new EthProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps }) });
    const r = await renderAndPay({ renderId: "rnd_eth2", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "Rohit with a coffee cup" }, t.deps);
    assert.equal(r.status, "voided");
    assert.equal(t.calls.filter((c) => c.op === "captureAuthorization").length, 0);
    assert.equal(t.calls.filter((c) => c.op === "voidAuthorization").length, 1);
  });
});
