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
  it("renders with Gemini from the reference photo, a labelled JPEG (the prompt check now runs before payment, in the engine)", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps });
    const out = await p.render(input());
    assert.deepEqual(g.calls, ["gemini-nano-banana-2.1"]);
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
    assert.equal(out.note, "AI image cap reached for this demo workspace (3 per workspace): showing a demo stand-in. The PayPal payment is real (sandbox).");
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
    assert.equal(out.note, "AI image cap reached today (2/day): showing a demo stand-in. The PayPal payment is real (sandbox).");
  });

  it("no reference photo: the stub stands in, no AI call", async () => {
    const g = await fakeGemini();
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: async () => [], client: g.client, caps });
    const out = await p.render(input());
    assert.equal(g.calls.length, 0);
    assert.match(out.note!, /^No reference photo of this creator is on file: showing a demo stand-in\. The PayPal payment is real \(sandbox\)\.$/);
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

  it("a refused prompt is refused BEFORE payment: zero PayPal calls", async () => {
    const t = testEngine();
    t.deps.precheck = async () => ({ ok: false, reason: "prompt_refused", detail: "banned use (rules) — Political: “vote for”" });
    const r = await renderAndPay({ renderId: "rnd_ai2", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "Rohit says vote for X" }, t.deps);
    assert.equal(r.status, "refused");
    assert.equal(t.calls.length, 0);
    assert.equal(t.store.refusals[0].reason, "prompt_refused");
  });

  it("the vision check fails after render: the authorization is voided, never captured", async () => {
    const g = await fakeGemini();
    const t = testEngine({ provider: new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps }) });
    t.deps.compliance = { name: "vision", check: async () => ({ ok: false, reason: "vision check: 2 people visible (exactly one expected)" }) };
    const r = await renderAndPay({ renderId: "rnd_ai3", licenceId: "lic_1", mandateId: "man_1", kind: "image", use: "advertising", prompt: "Rohit with a coffee" }, t.deps);
    assert.equal(r.status, "voided");
    assert.deepEqual(
      t.calls.map((c) => c.op),
      ["createVaultOrder", "voidAuthorization"],
    );
    assert.equal(t.store.refusals[0].reason, "compliance_failed");
  });
});

describe("AI video (Gemini Omni Flash)", () => {
  /** A fake Interactions API: background create, then get() until `after` polls have passed. */
  function fakeOmni(opts: { after?: number; status?: string } = {}) {
    let polls = 0;
    const calls: string[] = [];
    const client = {
      models: { generateContent: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify({ banned: [], fitsCategory: true, reason: "ok" }) }] } }] }) },
      interactions: {
        create: async (p: { background?: boolean; response_format?: { duration?: string }; generation_config?: { video_config?: { task?: string } }; input?: { type: string; text?: string }[] }) => {
          calls.push(`create background=${p.background} duration=${p.response_format?.duration} task=${p.generation_config?.video_config?.task}`);
          calls.push(`text: ${p.input?.find((x) => x.type === "text")?.text?.split("\n")[0]}`);
          return { id: "v1_test", status: "in_progress" };
        },
        get: async () => {
          calls.push("get");
          polls++;
          if (polls < (opts.after ?? 2)) return { id: "v1_test", status: "in_progress" };
          return opts.status ? { id: "v1_test", status: opts.status } : { id: "v1_test", status: "completed", output_video: { data: Buffer.from("fake-mp4-bytes").toString("base64"), mime_type: "video/mp4" } };
        },
        cancel: async () => void calls.push("cancel"),
      },
    } as unknown as GenAiLike;
    return { client, calls };
  }

  it("runs in the background and polls until the video is done", async () => {
    const { imageToVideo } = await import("../lib/ai/render-video");
    const f = fakeOmni({ after: 3 });
    const out = await imageToVideo({ image: new Uint8Array([1, 2]), mime: "image/jpeg", prompt: "a slow push-in", seconds: 4, pollMs: 1 }, f.client);
    assert.equal(Buffer.from(out.bytes).toString(), "fake-mp4-bytes");
    assert.equal(out.model, "gemini-omni-1.2-flash");
    assert.deepEqual(f.calls, [
      "create background=true duration=4s task=image_to_video",
      "text: Use this image as the exact first frame of the video and animate the scene from it, keeping the person, their face and the setting as they are.",
      "get",
      "get",
      "get",
    ]);
  });

  it("times out: cancels the job and refuses (the engine then voids)", async () => {
    const { imageToVideo, VideoRefused } = await import("../lib/ai/render-video");
    const f = fakeOmni({ after: 1_000_000 });
    await assert.rejects(imageToVideo({ image: new Uint8Array([1]), mime: "image/jpeg", prompt: "x", timeoutMs: 20, pollMs: 5 }, f.client), VideoRefused);
    assert.ok(f.calls.includes("cancel"));
  });

  it("a failed job is refused", async () => {
    const { imageToVideo } = await import("../lib/ai/render-video");
    await assert.rejects(imageToVideo({ image: new Uint8Array([1]), mime: "image/jpeg", prompt: "x", pollMs: 1 }, fakeOmni({ after: 1, status: "failed" }).client), /ended the video as failed/);
  });

  it("over VIDEO_CAP_TOTAL the saved demo clip plays, labelled demo render, with no AI call", async () => {
    let videoCalls = 0;
    const g = await fakeGemini();
    const p = new AiProvider({
      quota: new MemoryQuota(),
      stub: new StubProvider(),
      references: ref,
      client: g.client,
      caps: { ...caps, videoTotal: 1 },
      demoClip: async () => new Uint8Array(Buffer.from("saved-clip")),
      firstFrame: async () => (await ref())[0],
      video: async () => (videoCalls++, { bytes: new Uint8Array([9]), mime: "video/mp4", model: "gemini-omni-1.2-flash" }),
    });
    const first = await p.render(input({ kind: "video" }));
    assert.equal(first.model, "gemini-omni-1.2-flash");
    const second = await p.render(input({ kind: "video", workspaceId: "ws_other" }));
    assert.equal(videoCalls, 1, "the cap is total, across workspaces");
    assert.equal(second.mime, "video/mp4");
    assert.equal(Buffer.from(second.bytes!).toString(), "saved-clip");
    assert.equal(second.note, "AI video cap reached (1 in total): playing the saved demo clip. The PayPal payment is real (sandbox).");
  });

  it("a video failure after the authorization voids it", async () => {
    const g = await fakeGemini();
    const t = testEngine({
      mandate: { stepUpThresholdCents: 1000 }, // $6.00 is under the threshold here, so it runs at once
      provider: new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps, firstFrame: async () => (await ref())[0], video: async () => Promise.reject(new Error("Omni Flash took longer than 300 s; cancelled")) }),
    });
    const r = await renderAndPay({ renderId: "rnd_v1", licenceId: "lic_1", mandateId: "man_1", kind: "video", use: "advertising", prompt: "Rohit with headphones" }, t.deps);
    assert.equal(r.status, "voided");
    assert.equal(r.amountCents, 600, "video is priced at 3× the per-render price");
    assert.deepEqual(
      t.calls.map((c) => c.op),
      ["createVaultOrder", "voidAuthorization"],
    );
  });
});

describe("AI video starts from the generated ad image", () => {
  it("passes the ad image (not the reference photo) as the first frame", async () => {
    const g = await fakeGemini();
    const ad = { bytes: new Uint8Array([7, 7, 7]), mime: "image/jpeg" as const };
    let got: Uint8Array | null = null;
    const p = new AiProvider({
      quota: new MemoryQuota(),
      stub: new StubProvider(),
      references: ref,
      client: g.client,
      caps,
      firstFrame: async (i) => (i.fromRenderId === "rnd_img" ? ad : null),
      video: async (_i, still) => ((got = still.bytes), { bytes: new Uint8Array([1]), mime: "video/mp4", model: "gemini-omni-1.2-flash" }),
    });
    await p.render(input({ kind: "video", fromRenderId: "rnd_img" }));
    assert.deepEqual(got, ad.bytes);
  });
  it("without a generated ad to start from: no AI call, a labelled stand-in", async () => {
    const g = await fakeGemini();
    let videoCalls = 0;
    const p = new AiProvider({ quota: new MemoryQuota(), stub: new StubProvider(), references: ref, client: g.client, caps, firstFrame: async () => null, demoClip: async () => null, video: async () => (videoCalls++, { bytes: new Uint8Array([1]), mime: "video/mp4", model: "x" }) });
    const out = await p.render(input({ kind: "video" }));
    assert.equal(videoCalls, 0);
    assert.equal(g.calls.length, 0);
    assert.match(out.note!, /^A video starts from one of your generated ad images under this licence, and there is none yet: showing a pre-made demo animation\./);
  });
});
