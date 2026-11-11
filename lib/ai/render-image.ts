import "server-only";
/**
 * Gemini image generation from the creator's reference photo (gemini-nano-banana-2.1 on the Gemini API). One
 * generateContent call: the reference photos as inline images, then the brand's brief and our framing rules, with
 * responseModalities ["IMAGE"]. The image comes back inline (base64), so nothing is fetched from a URL.
 * Google adds an invisible SynthID watermark to images these models generate; we add a visible label (label.ts)
 * and the signed receipt.
 */
import { stillRules, type Aspect } from "./creative";
import { generateContent, geminiModels, type GenAiLike } from "./gemini";
import type { GeneratedMedia, ImageRenderInput } from "./types";

const MAX_REFERENCES = 3;

/** The brief, then our framing rules for the aspect: always appended, so a short brief can't frame the face out. */
export function referencePrompt(prompt: string, n: number, aspect: Aspect = "1:1"): string {
  return [
    `The ${n === 1 ? "image shows" : `${n} images show`} one real, consenting adult who has licensed their likeness for this image.`,
    "Generate a new photorealistic image of exactly this person, keeping their face, identity and likeness faithful to the reference photos.",
    "Do not add text, logos or watermarks unless asked.",
    `Brief: ${prompt}`,
    stillRules(aspect),
  ].join("\n");
}

export async function geminiImage(input: ImageRenderInput, client?: GenAiLike): Promise<GeneratedMedia> {
  const model = geminiModels.image();
  const refs = input.references.slice(0, MAX_REFERENCES);
  if (!refs.length) throw new Error("no reference photo of the creator");
  const aspect = input.aspectRatio ?? "1:1";
  const res = await generateContent(
    model,
    [
      {
        role: "user",
        parts: [...refs.map((r) => ({ inlineData: { mimeType: r.mime, data: Buffer.from(r.bytes).toString("base64") } })), { text: referencePrompt(input.prompt, refs.length, aspect) }],
      },
    ],
    { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: aspect, imageSize: process.env.GEMINI_IMAGE_SIZE || "1K" } },
    { client },
  );
  if (res.promptFeedback?.blockReason) throw new Error(`Gemini blocked the request: ${res.promptFeedback.blockReason} ${res.promptFeedback.blockReasonMessage ?? ""}`.trim());
  const c = res.candidates?.[0];
  const image = c?.content?.parts?.find((p) => p.inlineData?.data && !p.thought)?.inlineData;
  if (!image?.data) throw new Error(`Gemini returned no image (finishReason ${c?.finishReason ?? "none"}${c?.finishMessage ? `: ${c.finishMessage}` : ""})`);
  const mime = image.mimeType === "image/jpeg" ? "image/jpeg" : "image/png";
  return { bytes: new Uint8Array(Buffer.from(image.data, "base64")), mime, model, usage: res.usageMetadata as Record<string, unknown> | undefined };
}
