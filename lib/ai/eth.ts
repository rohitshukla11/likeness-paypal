import "server-only";
/**
 * The likeness-eth render provider (RENDER_PROVIDER=eth), adapted from likeness-eth's agents/src/ai/generate.ts and
 * its pipeline's face check: the same image model (gemini-nano-banana-2.1), here on the Gemini API (GEMINI_API_KEY,
 * never Vertex AI), with likeness-eth's prompt templates (lib/ai/eth-prompts.ts: wardrobe, accessory and pose rules).
 *
 *   image  reference photos → still (the brief's aspect) → face check → one regeneration on a mismatch → label → C2PA
 *   video  reference photos → its own 16:9 opening still → face check (one regeneration) → Gemini Omni Flash,
 *          8 s (VIDEO_SECONDS) at 16:9, animated from that still → C2PA
 *
 * likeness-eth made its videos with Veo 3.1 Lite on Vertex AI; Veo isn't on the Gemini API, so Omni Flash (Google's
 * video model there) animates the still instead. No ffmpeg: a video's AI label is a fixed overlay on every player,
 * in its receipt and in its content credential; images carry it in the pixels (lib/ai/label.ts).
 *
 * Caps (lib/ai/quota.ts), as with the Gemini provider: an image reserves an image slot, a video a video slot (its
 * own opening still is part of the video, covered by the video's price, with no separate PayPal charge); a
 * regeneration after a failed face check reserves one more image slot. Over a cap the demo stand-ins play, as
 * before; a regeneration over the cap isn't made, and the render fails, so the engine voids the authorization.
 * Any thrown error voids it too.
 */
import { createHash } from "node:crypto";
import sharp from "sharp";
import type { RenderInput, RenderOutput, RenderProvider } from "../engine/providers";
import { promptsFor, type EthAspect } from "./eth-prompts";
import { generateContent, geminiConfigured, geminiModels, type GenAiLike } from "./gemini";
import { labelRender } from "./label";
import type { Reference } from "./provider";
import { STAND_IN, standInNote } from "../engine/stand-in";
import { aiCaps, imageCapReason, imageKeys, videoKeys, type AiCaps, type Quota } from "./quota";

export const ETH_VIDEO_ASPECT = "16:9" as const;
const MAX_REFERENCES = 3;
const sha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

/** Clip length: VIDEO_SECONDS, 8 by default (likeness-eth's), 3 to 15. */
export const ethVideoSeconds = (env: NodeJS.ProcessEnv = process.env) => Math.min(15, Math.max(3, Number(env.VIDEO_SECONDS ?? 8) || 8));

export type FaceResult = { ran: boolean; match: boolean; reason: string };

export interface EthProviderDeps {
  quota: Quota;
  /** Stands in for an image over the caps, without a reference photo, or without GEMINI_API_KEY. */
  stub: RenderProvider;
  references: (input: RenderInput) => Promise<Reference[]>;
  /** Animates the opening still (Omni Flash, lib/ai/render-video.ts). Absent: videos use the saved demo clip. */
  video?: (input: { image: Uint8Array; mime: "image/jpeg"; prompt: string; seconds: number; aspectRatio: typeof ETH_VIDEO_ASPECT }) => Promise<{ bytes: Uint8Array; mime: "video/mp4"; model: string }>;
  demoClip?: () => Promise<Uint8Array | null>;
  credential?: (bytes: Uint8Array, mime: "image/jpeg" | "video/mp4", input: RenderInput, model: string) => Uint8Array;
  /** Does the still show the creator? Default: a Gemini vision check (gemini-3.5-flash-lite). */
  faceCheck?: (refs: Reference[], still: Reference) => Promise<FaceResult>;
  client?: GenAiLike;
  caps?: AiCaps;
  now?: () => Date;
  seconds?: number;
}

/** One image of the person in the reference photos (up to three), from likeness-eth's still prompt. */
export async function ethImage(text: string, refs: Reference[], aspect: EthAspect, client?: GenAiLike): Promise<{ bytes: Uint8Array; mime: "image/jpeg" | "image/png"; model: string }> {
  const model = geminiModels.image();
  const res = await generateContent(
    model,
    [{ role: "user", parts: [...refs.slice(0, MAX_REFERENCES).map((r) => ({ inlineData: { mimeType: r.mime, data: Buffer.from(r.bytes).toString("base64") } })), { text }] }],
    { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: process.env.GEMINI_IMAGE_SIZE || "1K" } },
    { client },
  );
  if (res.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${res.promptFeedback.blockReason}`);
  const c = res.candidates?.[0];
  const img = c?.content?.parts?.find((p) => p.inlineData?.data && !p.thought)?.inlineData;
  if (!img?.data) throw new Error(`Gemini returned no image (${c?.finishReason ?? "no reason"}${c?.finishMessage ? `: ${c.finishMessage}` : ""})`);
  return { bytes: new Uint8Array(Buffer.from(img.data, "base64")), mime: img.mimeType === "image/jpeg" ? "image/jpeg" : "image/png", model };
}

const FACE_SCHEMA = {
  type: "object",
  properties: {
    people: { type: "integer", description: "How many people are visible in the generated image" },
    sameAsReference: { type: "boolean", description: "Is that person the same person as in the reference photo" },
    reason: { type: "string" },
  },
  required: ["people", "sameAsReference", "reason"],
};

/** The face check before a regeneration: one person, the creator. It can't run (an error): accepted, then judged by the engine's compliance check. */
export function geminiFaceCheck(client?: GenAiLike) {
  return async (refs: Reference[], still: Reference): Promise<FaceResult> => {
    try {
      const res = await generateContent(
        geminiModels.filter(),
        [
          {
            role: "user",
            parts: [
              { text: "Reference photo of the licensed creator:" },
              { inlineData: { mimeType: refs[0].mime, data: Buffer.from(refs[0].bytes).toString("base64") } },
              { text: "Generated advertising image:" },
              { inlineData: { mimeType: still.mime, data: Buffer.from(still.bytes).toString("base64") } },
            ],
          },
        ],
        { systemInstruction: "You compare faces for a likeness-licensing check. Clothing, setting, pose and lighting may differ; judge the face. Answer in JSON matching the schema.", temperature: 0, responseMimeType: "application/json", responseJsonSchema: FACE_SCHEMA },
        { client, timeoutMs: 60_000 },
      );
      const v = JSON.parse(res.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "{}") as { people?: number; sameAsReference?: boolean; reason?: string };
      const match = v.people === 1 && v.sameAsReference === true;
      return { ran: true, match, reason: v.reason ?? (match ? "matches" : "doesn't match") };
    } catch (e) {
      return { ran: false, match: true, reason: `the face check couldn't run (${(e as Error).message})` };
    }
  };
}

export class EthProvider implements RenderProvider {
  readonly name = "eth";
  constructor(private readonly deps: EthProviderDeps) {}

  private get caps() {
    return this.deps.caps ?? aiCaps();
  }
  private now() {
    return (this.deps.now ?? (() => new Date()))();
  }
  private async standIn(input: RenderInput, note: string): Promise<RenderOutput> {
    return { ...(await this.deps.stub.render(input)), note };
  }

  render(input: RenderInput): Promise<RenderOutput> {
    return input.kind === "video" ? this.video(input) : this.image(input);
  }

  /**
   * A still that shows the creator: generated, face-checked, and regenerated once on a mismatch. The regeneration
   * reserves one more image slot; over the cap, or a second mismatch, throws (the engine voids the authorization).
   */
  private async checkedStill(input: RenderInput, refs: Reference[], text: string, aspect: EthAspect) {
    const faceCheck = this.deps.faceCheck ?? geminiFaceCheck(this.deps.client);
    let face: FaceResult | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt === 1 && !(await this.deps.quota.reserve(imageKeys(input.workspaceId, this.now(), this.caps)))) {
        throw new Error(`the face didn't match the creator (${face?.reason}), and the AI image cap is reached, so it wasn't regenerated`);
      }
      const still = await ethImage(text, refs, aspect, this.deps.client);
      face = await faceCheck(refs, { bytes: still.bytes, mime: still.mime });
      if (face.match) return { ...still, face, attempts: attempt + 1 };
    }
    throw new Error(`the face didn't match the creator twice (${face?.reason})`);
  }

  private faceNote(face: FaceResult, attempts: number) {
    return face.ran ? `face check passed${attempts > 1 ? " on the second try (the first didn't match and was regenerated)" : ""}` : face.reason;
  }

  private async image(input: RenderInput): Promise<RenderOutput> {
    if (!this.deps.client && !geminiConfigured()) return this.standIn(input, standInNote(STAND_IN.noKey));
    const refs = await this.deps.references(input);
    if (!refs.length) return this.standIn(input, standInNote(STAND_IN.noReference));
    const caps = this.caps;
    const keys = imageKeys(input.workspaceId, this.now(), caps);
    if (!(await this.deps.quota.reserve(keys))) return this.standIn(input, standInNote(await imageCapReason(this.deps.quota, keys, caps)));
    const aspect = input.aspect ?? "1:1";
    const still = await this.checkedStill(input, refs, promptsFor("image", input.prompt, aspect).still, aspect);
    const labelled = new Uint8Array(await labelRender(still.bytes));
    const bytes = this.deps.credential ? this.deps.credential(labelled, "image/jpeg", input, still.model) : labelled;
    return { outputRef: "", bytes, sha256: sha(bytes), mime: "image/jpeg", model: still.model, note: `likeness-eth pipeline: ${this.faceNote(still.face, still.attempts)}.` };
  }

  private async video(input: RenderInput): Promise<RenderOutput> {
    const clip = async (reason: string): Promise<RenderOutput> => {
      const bytes = await this.deps.demoClip?.();
      if (!bytes) return this.standIn(input, standInNote(reason, "animation"));
      return { outputRef: "", bytes, sha256: sha(bytes), mime: "video/mp4", model: "demo clip (pre-recorded)", note: standInNote(reason, "clip") };
    };
    if (!this.deps.video) return clip(STAND_IN.videoOff);
    if (!this.deps.client && !geminiConfigured()) return clip(STAND_IN.noKey);
    const refs = await this.deps.references(input);
    if (!refs.length) return clip(STAND_IN.noReference);
    const caps = this.caps;
    if (!(await this.deps.quota.reserve(videoKeys(caps)))) return clip(STAND_IN.videoTotal(caps.videoTotal));
    // Its own opening still, from the reference photos (covered by the video's price and its video slot).
    const p = promptsFor("video", input.prompt);
    const still = await this.checkedStill(input, refs, p.still, ETH_VIDEO_ASPECT);
    const jpeg = new Uint8Array(await sharp(Buffer.from(still.bytes)).jpeg({ quality: 92 }).toBuffer());
    const seconds = this.deps.seconds ?? ethVideoSeconds();
    const out = await this.deps.video({ image: jpeg, mime: "image/jpeg", prompt: p.motion!, seconds, aspectRatio: ETH_VIDEO_ASPECT });
    const model = `${still.model} + ${out.model}`;
    const bytes = this.deps.credential ? this.deps.credential(out.bytes, "video/mp4", input, model) : out.bytes;
    return {
      outputRef: "",
      bytes,
      sha256: sha(bytes),
      mime: out.mime,
      model,
      note: `AI-generated video, ${seconds} s at ${ETH_VIDEO_ASPECT} from its own opening still (likeness-eth pipeline: ${this.faceNote(still.face, still.attempts)}). The AI label is a fixed overlay on the player and is in its receipt.`,
    };
  }
}
