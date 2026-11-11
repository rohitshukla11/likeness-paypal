/**
 * The AI caps, through the one place every billed AI call reserves them (reserveAi): the daily image cap across
 * workspaces, the per-workspace cap, the video total, regenerations, all-or-nothing, and concurrent reservations.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MemoryQuota, reserveAi } from "../lib/ai/quota";

const caps = { imageDaily: 10, imagePerWorkspace: 3, videoTotal: 5 };
const now = new Date("2026-11-12T09:00:00Z");
const at = (workspaceId: string, when = now) => ({ workspaceId, now: when });

describe("reserveAi: the AI caps in one place", () => {
  it("the daily image cap stops the 11th image, across different workspaces", async () => {
    const q = new MemoryQuota();
    for (let i = 1; i <= 10; i++) assert.deepEqual(await reserveAi(q, "image", at(`ws_${i}`), caps), { ok: true }, `image ${i}`);
    assert.deepEqual(await reserveAi(q, "image", at("ws_11"), caps), { ok: false, reason: "AI image cap reached today (10/day)" });
    assert.equal(q.counts.get("image:ws:ws_11") ?? 0, 0, "the refused reservation took no workspace slot");
    assert.deepEqual(await reserveAi(q, "image", at("ws_11", new Date("2026-11-13T00:00:01Z")), caps), { ok: true }, "a new UTC day starts again");
  });

  it("the per-workspace cap stops the 4th image in one workspace, not in another", async () => {
    const q = new MemoryQuota();
    for (let i = 0; i < 3; i++) assert.equal((await reserveAi(q, "image", at("ws_a"), caps)).ok, true);
    assert.deepEqual(await reserveAi(q, "image", at("ws_a"), caps), { ok: false, reason: "AI image cap reached for this demo workspace (3 per workspace)" });
    assert.equal((await reserveAi(q, "image", at("ws_b"), caps)).ok, true);
    assert.equal(q.counts.get("image:day:2026-11-12"), 4, "the refused image took no daily slot");
  });

  it("the video total stops at the cap, and videos take no image slots", async () => {
    const q = new MemoryQuota();
    for (let i = 1; i <= 5; i++) assert.equal((await reserveAi(q, "video", at(`ws_${i}`), caps)).ok, true, `video ${i}`);
    assert.deepEqual(await reserveAi(q, "video", at("ws_6"), caps), { ok: false, reason: "AI video cap reached (5 in total)" });
    assert.deepEqual(await reserveAi(q, "video", at("ws_7", new Date("2027-01-01T00:00:00Z")), caps), { ok: false, reason: "AI video cap reached (5 in total)" }, "the total never resets");
    assert.equal(q.counts.get("image:day:2026-11-12") ?? 0, 0);
  });

  it("a face-check regeneration counts toward the image caps", async () => {
    const q = new MemoryQuota();
    await reserveAi(q, "image", at("ws_r"), caps);
    await reserveAi(q, "regeneration", at("ws_r"), caps);
    assert.equal(q.counts.get("image:ws:ws_r"), 2);
    assert.equal(q.counts.get("image:day:2026-11-12"), 2);
  });

  it("concurrent reservations never overshoot a cap", async () => {
    const q = new MemoryQuota();
    const images = await Promise.all(Array.from({ length: 25 }, (_, i) => reserveAi(q, "image", at(`ws_c${i}`), caps)));
    assert.equal(images.filter((r) => r.ok).length, 10);
    assert.equal(q.counts.get("image:day:2026-11-12"), 10);
    const videos = await Promise.all(Array.from({ length: 9 }, (_, i) => reserveAi(q, "video", at(`ws_v${i}`), caps)));
    assert.equal(videos.filter((r) => r.ok).length, 5);
    assert.equal(q.counts.get("video:total"), 5);
  });
});
