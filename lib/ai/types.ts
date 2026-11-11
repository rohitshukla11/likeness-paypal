/** What an AI renderer gets and returns. Reference photos are only held for the call. */
export type ImageAspect = "1:1" | "16:9" | "9:16";

export type ImageRenderInput = {
  prompt: string;
  /** The creator's reference photos (JPEG or PNG). The renderer must not keep them. */
  references: { bytes: Uint8Array; mime: "image/jpeg" | "image/png" }[];
  aspectRatio?: ImageAspect;
};

export type GeneratedMedia = {
  bytes: Uint8Array;
  mime: "image/jpeg" | "image/png" | "video/mp4";
  model: string;
  /** Provider-reported usage (Gemini usageMetadata), for cost accounting. */
  usage?: Record<string, unknown>;
};
