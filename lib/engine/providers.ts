/**
 * Render providers: what turns a licensed prompt into an image or video. The engine only sees RenderProvider.
 *  - StubProvider (default): picks a pre-generated demo image from public/demo by the prompt's hash. No cost, no
 *    network. Its output is labelled "AI-generated · demo render".
 *  - GeminiProvider: a skeleton only. It is used only when RENDER_PROVIDER=gemini, and it makes NO Gemini call yet:
 *    it throws, so the engine voids the authorization and records a refusal.
 */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

export interface RenderInput {
  renderId: string;
  kind: "image" | "video";
  prompt: string;
  /** The creator's reference photo (path under public/ or a storage key). */
  creatorPhotoRef: string | null;
}

export interface RenderOutput {
  /** Where the output is served from (a path under public/, or a storage key). */
  outputRef: string;
  sha256: string;
  mime: string;
  model: string;
}

export interface RenderProvider {
  readonly name: string;
  render(input: RenderInput): Promise<RenderOutput>;
}

const IMAGES = ["ad-1.svg", "ad-2.svg", "ad-3.svg", "ad-4.svg"];
const VIDEOS = ["ad-video-1.svg"];

export class StubProvider implements RenderProvider {
  readonly name = "stub";
  constructor(private readonly publicDir = path.join(process.cwd(), "public")) {}

  async render(input: RenderInput): Promise<RenderOutput> {
    const pool = input.kind === "video" ? VIDEOS : IMAGES;
    const pick = pool[parseInt(createHash("sha256").update(input.prompt).digest("hex").slice(0, 8), 16) % pool.length];
    const bytes = await readFile(path.join(this.publicDir, "demo", pick));
    return { outputRef: `/demo/${pick}`, sha256: createHash("sha256").update(bytes).digest("hex"), mime: "image/svg+xml", model: input.kind === "video" ? "stub-video (pre-generated)" : "stub-image (pre-generated)" };
  }
}

/** Skeleton for Gemini (images) and Veo (video). Disabled: no request is made until it is implemented and approved. */
export class GeminiProvider implements RenderProvider {
  readonly name = "gemini";
  async render(): Promise<RenderOutput> {
    throw new Error("GeminiProvider is not implemented yet (no Gemini or Veo calls are made)");
  }
}

/** RENDER_PROVIDER=gemini selects the Gemini skeleton; anything else (or unset) the stub. */
export function providerFromEnv(env: NodeJS.ProcessEnv = process.env): RenderProvider {
  return env.RENDER_PROVIDER === "gemini" ? new GeminiProvider() : new StubProvider();
}
