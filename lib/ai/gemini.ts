import "server-only";
/**
 * The Gemini API (Google AI Studio), with GEMINI_API_KEY through @google/genai. Never Vertex AI, never a service
 * account, never the old Google Cloud project.
 * Models (Gemini API model catalogue, 2026-11): gemini-nano-banana-2.1 for image generation from reference photos
 * ($0.0336 per 1K image), gemini-3.5-flash-lite for the prompt safety filter, gemini-omni-1.2-flash for video
 * (Veo is no longer offered on the Gemini API: its previews were shut down on 2026-10-22).
 * Errors keep Google's HTTP status and message.
 */
import { ApiError, GoogleGenAI, type GenerateContentConfig, type GenerateContentResponse, type Content } from "@google/genai";

export const geminiModels = {
  image: () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1",
  filter: () => process.env.GEMINI_FILTER_MODEL || "gemini-3.5-flash-lite",
  video: () => process.env.GEMINI_VIDEO_MODEL || "gemini-omni-1.2-flash",
};

/** The Gemini API is usable when GEMINI_API_KEY is set (the key is checked on the first call). */
export const geminiConfigured = () => !!process.env.GEMINI_API_KEY;

export class GeminiError extends Error {
  constructor(
    readonly httpStatus: number,
    message: string,
  ) {
    super(message);
  }
}

let client: GoogleGenAI | undefined;

/** The shared client. Tests pass their own client to the functions below instead. */
export function genai(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiError(503, "GEMINI_API_KEY is not set (see .env.example)");
  return (client ??= new GoogleGenAI({ apiKey }));
}

/** The calls this app makes, so tests can substitute a fake. */
export type GenAiLike = Pick<GoogleGenAI, "models" | "interactions" | "files">;

/**
 * generateContent with retries: a 429 (rate limit) or 503 can be transient, so retry with backoff (5, 15, 30 s)
 * before giving up. Other errors are thrown at once.
 */
export async function generateContent(
  model: string,
  contents: Content[],
  config: GenerateContentConfig,
  opts: { timeoutMs?: number; client?: GenAiLike; backoffMs?: number[] } = {},
): Promise<GenerateContentResponse> {
  const ai = opts.client ?? genai();
  const backoff = opts.backoffMs ?? [5000, 15000, 30000];
  for (let attempt = 0; ; attempt++) {
    try {
      return await ai.models.generateContent({ model, contents, config: { ...config, httpOptions: { timeout: opts.timeoutMs ?? 120_000 } } });
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 0;
      if ((status === 429 || status === 503) && attempt < backoff.length) {
        await new Promise((r) => setTimeout(r, backoff[attempt]));
        continue;
      }
      throw new GeminiError(status, `Gemini ${model}: ${status ? `HTTP ${status}: ` : ""}${(e as Error).message}`);
    }
  }
}
