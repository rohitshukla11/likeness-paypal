import "server-only";
/**
 * AI video ads on the Gemini API (GEMINI_API_KEY), image to video: Gemini Omni Flash (gemini-omni-1.2-flash)
 * through the Interactions API, run in the background and polled until done or the timeout. The still is the
 * generated ad image, used as the first frame: the prompt says so, and video_config.task is "image_to_video"
 * (Omni's documented way to lock image-to-video when the role of an input image must not be inferred).
 *
 * Why not Veo: Veo's previews on the Gemini API (veo-3.1-*-preview) were shut down on 2026-10-22 and Veo 2.0 on
 * 2026-06-30; Veo GA is only on Google's enterprise platform (Vertex), which this app doesn't use. Omni Flash is
 * Google's video model on the Gemini API. Price (Gemini API pricing, 2026-11): about $0.07 per second at 720p
 * (5,792 output tokens per second at $12 per 1M), so a 4 s clip costs about $0.28. Durations 3–15 s; 16:9 or 9:16.
 * Google adds SynthID to every generated video. A refusal, failure or timeout is a VideoRefused, so the engine
 * voids the authorization.
 */
import { geminiModels, genai, type GenAiLike } from "./gemini";

export const videoModel = () => geminiModels.video();
export const videoSeconds = () => Math.min(15, Math.max(3, Number(process.env.VIDEO_SECONDS ?? 4) || 4));
export const videoTimeoutMs = () => Number(process.env.VIDEO_TIMEOUT_MS ?? 300_000) || 300_000;

/** Estimated cost in USD of one clip at 720p (for dry runs and the README; Google bills by output tokens). */
export const estimatedVideoCostUsd = (seconds = videoSeconds()) => Math.round(seconds * 5792 * 12) / 1_000_000;

export class VideoRefused extends Error {}

type Interaction = { id?: string; status?: string; output_video?: { data?: string; uri?: string; mime_type?: string } };
const DONE_BAD = new Set(["failed", "cancelled", "incomplete", "budget_exceeded"]);

export async function imageToVideo(
  input: { image: Uint8Array; mime: "image/jpeg" | "image/png"; prompt: string; seconds?: number; aspectRatio?: "16:9" | "9:16"; timeoutMs?: number; pollMs?: number },
  client?: GenAiLike,
): Promise<{ bytes: Uint8Array; mime: "video/mp4"; model: string; ms: number }> {
  const ai = client ?? genai();
  const model = videoModel();
  const t = Date.now();
  const limit = input.timeoutMs ?? videoTimeoutMs();
  const interactions = ai.interactions as unknown as {
    create: (p: unknown, o?: unknown) => Promise<Interaction>;
    get: (id: string, p?: unknown, o?: unknown) => Promise<Interaction>;
    cancel: (id: string) => Promise<unknown>;
  };
  let it: Interaction;
  try {
    it = await interactions.create(
      {
        model,
        input: [
          { type: "image", data: Buffer.from(input.image).toString("base64"), mime_type: input.mime },
          { type: "text", text: `Use this image as the exact first frame of the video and animate the scene from it, keeping the person, their face and the setting as they are.\n${input.prompt}` },
        ],
        generation_config: { video_config: { task: "image_to_video" } },
        response_format: { type: "video", duration: `${input.seconds ?? videoSeconds()}s`, resolution: "720p", aspect_ratio: input.aspectRatio ?? "9:16" },
        background: true,
      },
      { timeout_ms: 60_000 },
    );
  } catch (e) {
    throw new VideoRefused(`Omni Flash refused the request: ${(e as Error).message}`);
  }
  while (it.status !== "completed") {
    if (it.status && DONE_BAD.has(it.status)) throw new VideoRefused(`Omni Flash ended the video as ${it.status}`);
    if (Date.now() - t > limit) {
      if (it.id) await interactions.cancel(it.id).catch(() => undefined);
      throw new VideoRefused(`Omni Flash took longer than ${Math.round(limit / 1000)} s; cancelled`);
    }
    await new Promise((r) => setTimeout(r, input.pollMs ?? 5_000));
    if (!it.id) throw new VideoRefused("Omni Flash returned no interaction id to poll");
    it = await interactions.get(it.id, null, { timeout_ms: 30_000 });
  }
  const v = it.output_video;
  if (v?.data) return { bytes: new Uint8Array(Buffer.from(v.data, "base64")), mime: "video/mp4", model, ms: Date.now() - t };
  if (v?.uri) {
    // Larger clips come back as a Gemini Files URI, downloaded with the API key (never sent to the browser).
    const r = await fetch(v.uri, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY ?? "" }, signal: AbortSignal.timeout(60_000) });
    if (!r.ok) throw new VideoRefused(`downloading the video failed: HTTP ${r.status}`);
    return { bytes: new Uint8Array(await r.arrayBuffer()), mime: "video/mp4", model, ms: Date.now() - t };
  }
  throw new VideoRefused("Omni Flash declined to generate this video: no video returned");
}
