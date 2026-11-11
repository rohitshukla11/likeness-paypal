/**
 * The AI render provider (RENDER_PROVIDER=gemini), in this order for an image:
 *   1. a reference photo of the creator must exist, else the stub stands in (note says why);
 *   2. the AI caps are reserved atomically (lib/ai/quota.ts), else the stub stands in: no AI call at all;
 *   3. the prompt safety filter (rules + Gemini classifier, fail closed): a refusal throws, so the engine voids;
 *   4. Gemini image generation from the reference photo, then the visible "AI-generated" label.
 * The engine stores the bytes and serves them at /media/<render id>. Any thrown error voids the authorization.
 * Video (Gemini Omni Flash) is wired in lib/ai/render-video.ts.
 */
import { createHash } from "node:crypto";
import type { RenderInput, RenderOutput, RenderProvider } from "../engine/providers";
import { checkPrompt } from "./filter";
import { geminiConfigured, type GenAiLike } from "./gemini";
import { labelRender } from "./label";
import { aiCaps, imageKeys, videoKeys, type AiCaps, type Quota } from "./quota";
import { geminiImage } from "./render-image";

export type Reference = { bytes: Uint8Array; mime: "image/jpeg" | "image/png" };

export interface AiProviderDeps {
  quota: Quota;
  /** Stands in for an image over the caps, without a reference photo, or without GEMINI_API_KEY. */
  stub: RenderProvider;
  /** The creator's reference photos for this render (empty: none on file). */
  references: (input: RenderInput) => Promise<Reference[]>;
  /** A real video (lib/ai/render-video.ts). Absent: videos always use the fallback. */
  video?: (input: RenderInput, still: Reference) => Promise<{ bytes: Uint8Array; mime: "video/mp4"; model: string }>;
  /** The saved demo clip played back over the video cap (private/demo-video.mp4), or null if there is none. */
  demoClip?: () => Promise<Uint8Array | null>;
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
    if (!this.deps.client && !geminiConfigured()) return this.standIn(input, "Demo render: Gemini isn't configured (GEMINI_API_KEY), so a pre-made image stands in.");
    const refs = await this.deps.references(input);
    if (!refs.length) return this.standIn(input, "Demo render: there is no reference photo of this creator on file, so a pre-made image stands in.");
    const caps = this.caps;
    if (!(await this.deps.quota.reserve(imageKeys(input.workspaceId, (this.deps.now ?? (() => new Date()))(), caps)))) {
      return this.standIn(input, `Demo render: the AI image cap is reached (${caps.imageDaily} a day, ${caps.imagePerWorkspace} per workspace), so a pre-made image stands in.`);
    }
    const filter = await checkPrompt(input.prompt, input.use, this.deps.client);
    if (!filter.allowed) throw new Error(`refused by the safety filter: ${filter.reasons.join("; ")}`);
    const out = await geminiImage({ prompt: input.prompt, references: refs, aspectRatio: "1:1" }, this.deps.client);
    const labelled = new Uint8Array(await labelRender(out.bytes));
    return { outputRef: "", bytes: labelled, sha256: sha(labelled), mime: "image/jpeg", model: out.model, note: null };
  }

  private async video(input: RenderInput): Promise<RenderOutput> {
    const clip = async (note: string): Promise<RenderOutput> => {
      const bytes = await this.deps.demoClip?.();
      if (!bytes) return this.standIn(input, `${note} The saved demo clip isn't there yet, so a pre-made animation stands in.`);
      return { outputRef: "", bytes, sha256: sha(bytes), mime: "video/mp4", model: "demo clip (pre-recorded)", note: `${note} A saved demo clip plays instead: demo render.` };
    };
    if (!this.deps.video) return clip("Demo render: AI video isn't enabled.");
    if (!this.deps.client && !geminiConfigured()) return clip("Demo render: Gemini isn't configured (GEMINI_API_KEY).");
    const refs = await this.deps.references(input);
    if (!refs.length) return clip("Demo render: there is no reference photo of this creator on file.");
    const caps = this.caps;
    if (!(await this.deps.quota.reserve(videoKeys(caps)))) return clip(`Demo render: the AI video cap (${caps.videoTotal} in total) is reached.`);
    const filter = await checkPrompt(input.prompt, input.use, this.deps.client);
    if (!filter.allowed) throw new Error(`refused by the safety filter: ${filter.reasons.join("; ")}`);
    const out = await this.deps.video(input, refs[0]);
    return { outputRef: "", bytes: out.bytes, sha256: sha(out.bytes), mime: out.mime, model: out.model, note: "AI-generated video. The AI label is shown with the video and in its receipt (no ffmpeg here to burn it in)." };
  }
}
