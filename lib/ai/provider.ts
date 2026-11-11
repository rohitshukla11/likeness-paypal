/**
 * The AI render provider (RENDER_PROVIDER=gemini), in this order for an image:
 *   1. a reference photo of the creator must exist, else the stub stands in (note says why);
 *   2. the AI caps are reserved atomically (lib/ai/quota.ts), else the stub stands in: no AI call at all;
 *   (the prompt safety filter now runs in the engine BEFORE payment: lib/ai/precheck.ts)
 *   4. Gemini image generation from the reference photo, the visible "AI-generated" label, and a C2PA content
 *      credential when a signing certificate is configured.
 * The engine stores the bytes and serves them at /media/<render id>. Any thrown error voids the authorization.
 * Video (Gemini Omni Flash) is wired in lib/ai/render-video.ts.
 */
import { createHash } from "node:crypto";
import type { RenderInput, RenderOutput, RenderProvider } from "../engine/providers";
import { geminiConfigured, type GenAiLike } from "./gemini";
import { labelRender } from "./label";
import { STAND_IN, standInNote } from "../engine/stand-in";
import { aiCaps, imageCapReason, imageKeys, videoKeys, type AiCaps, type Quota } from "./quota";
import { geminiImage } from "./render-image";

export type Reference = { bytes: Uint8Array; mime: "image/jpeg" | "image/png" };

export interface AiProviderDeps {
  quota: Quota;
  /** Stands in for an image over the caps, without a reference photo, or without GEMINI_API_KEY. */
  stub: RenderProvider;
  /** The creator's reference photos for this render (empty: none on file). */
  references: (input: RenderInput) => Promise<Reference[]>;
  /** Video: the generated ad image (an image render under the same licence) that is the first frame. */
  firstFrame?: (input: RenderInput) => Promise<Reference | null>;
  /** A real video (lib/ai/render-video.ts), started from `still`. Absent: videos always use the fallback. */
  video?: (input: RenderInput, still: Reference) => Promise<{ bytes: Uint8Array; mime: "video/mp4"; model: string }>;
  /** The saved demo clip played back over the video cap (private/demo-video.mp4), or null if there is none. */
  demoClip?: () => Promise<Uint8Array | null>;
  /** Embeds a C2PA content credential (lib/ai/c2pa.ts) when a signing certificate is configured. */
  credential?: (bytes: Uint8Array, mime: "image/jpeg" | "video/mp4", input: RenderInput, model: string) => Uint8Array;
  client?: GenAiLike;
  caps?: AiCaps;
  now?: () => Date;
}

const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

export class AiProvider implements RenderProvider {
  readonly name = "gemini";
  constructor(private readonly deps: AiProviderDeps) {}

  private get caps() {
    return this.deps.caps ?? aiCaps();
  }

  private async standIn(input: RenderInput, note: string): Promise<RenderOutput> {
    return { ...(await this.deps.stub.render(input)), note };
  }

  render(input: RenderInput): Promise<RenderOutput> {
    return input.kind === "video" ? this.video(input) : this.image(input);
  }

  private async image(input: RenderInput): Promise<RenderOutput> {
    if (!this.deps.client && !geminiConfigured()) return this.standIn(input, standInNote(STAND_IN.noKey));
    const refs = await this.deps.references(input);
    if (!refs.length) return this.standIn(input, standInNote(STAND_IN.noReference));
    const caps = this.caps;
    const keys = imageKeys(input.workspaceId, (this.deps.now ?? (() => new Date()))(), caps);
    if (!(await this.deps.quota.reserve(keys))) return this.standIn(input, standInNote(await imageCapReason(this.deps.quota, keys, caps)));
    const out = await geminiImage({ prompt: input.prompt, references: refs, aspectRatio: input.aspect ?? "1:1" }, this.deps.client);
    const labelled = new Uint8Array(await labelRender(out.bytes));
    const bytes = this.deps.credential ? this.deps.credential(labelled, "image/jpeg", input, out.model) : labelled;
    return { outputRef: "", bytes, sha256: sha(bytes), mime: "image/jpeg", model: out.model, note: null };
  }

  private async video(input: RenderInput): Promise<RenderOutput> {
    const clip = async (reason: string): Promise<RenderOutput> => {
      const bytes = await this.deps.demoClip?.();
      if (!bytes) return this.standIn(input, standInNote(reason, "animation"));
      return { outputRef: "", bytes, sha256: sha(bytes), mime: "video/mp4", model: "demo clip (pre-recorded)", note: standInNote(reason, "clip") };
    };
    if (!this.deps.video) return clip(STAND_IN.videoOff);
    if (!this.deps.client && !geminiConfigured()) return clip(STAND_IN.noKey);
    // A video starts from a generated ad image under the same licence (its first frame), never the raw photo.
    const still = (await this.deps.firstFrame?.(input)) ?? null;
    if (!still) return clip(STAND_IN.noFirstFrame);
    const caps = this.caps;
    if (!(await this.deps.quota.reserve(videoKeys(caps)))) return clip(STAND_IN.videoTotal(caps.videoTotal));
    const out = await this.deps.video(input, still);
    const bytes = this.deps.credential ? this.deps.credential(out.bytes, "video/mp4", input, out.model) : out.bytes;
    return { outputRef: "", bytes, sha256: sha(bytes), mime: out.mime, model: out.model, note: "AI-generated video. The AI label is shown with the video and in its receipt (no ffmpeg here to burn it in)." };
  }
}
