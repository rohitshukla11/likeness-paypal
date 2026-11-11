import "server-only";
/**
 * Compliance after render, before capture: Gemini (gemini-3.5-flash-lite on the Gemini API) looks at the actual
 * output, next to the creator's reference photo when there is one, and answers in JSON: exactly one person, an
 * adult, the same person as the reference, no banned content (political, adult, minors, impersonation, deception),
 * no added text or logos beyond our label. A failure, or any error, voids the authorization (fail closed).
 * Pre-made demo renders (the SVG stubs) aren't AI output and pass with a note.
 */
import type { ComplianceHook } from "../engine/compliance";
import { generateContent, geminiModels, type GenAiLike } from "./gemini";
import type { Reference } from "./provider";

const SCHEMA = {
  type: "object",
  properties: {
    people: { type: "integer", description: "How many people are visible" },
    adult: { type: "boolean" },
    sameAsReference: { type: "boolean", description: "Is the person the same as in the reference photo (true if no reference was given)" },
    banned: { type: "array", items: { type: "string", enum: ["political", "adult", "minors", "impersonation", "deception"] } },
    unexpectedTextOrLogos: { type: "boolean", description: "Text, captions or logos other than a small 'AI-generated' label" },
    reason: { type: "string" },
  },
  required: ["people", "adult", "sameAsReference", "banned", "unexpectedTextOrLogos", "reason"],
};

const INSTRUCTION = `You check AI-generated ads before the brand is charged. The ad must show exactly one real-looking adult, who must be the same person as in the reference photo when one is given. Banned: political content, sexual content or nudity, minors, impersonating someone or presenting the person as endorsing something they did not say, deception (fake news, fake evidence, fake testimonials, crimes shown as real). A small "AI-generated" label in a corner is expected and fine. Answer in JSON matching the schema.`;

export function visionCompliance(deps: { references: (photoRef: string | null) => Promise<Reference[]>; client?: GenAiLike }): ComplianceHook {
  return {
    name: "gemini-vision",
    async check({ output, use, prompt, creatorPhotoRef }) {
      const bytes = output.bytes;
      const mime = output.mime;
      if (!bytes || !["image/jpeg", "image/png", "video/mp4"].includes(mime)) return { ok: true, note: "demo render (pre-made, not AI output): nothing to check" };
      if (output.model.startsWith("demo clip")) return { ok: true, note: "the saved demo clip (a real earlier AI render): not re-checked" };
      const refs = await deps.references(creatorPhotoRef ?? null);
      const parts = [
        ...(refs[0] ? [{ text: "Reference photo of the licensed creator:" }, { inlineData: { mimeType: refs[0].mime, data: Buffer.from(refs[0].bytes).toString("base64") } }] : []),
        { text: `The ad to check (${mime.startsWith("video") ? "a video" : "an image"}), made for "${use}" use from this brief: ${prompt}` },
        { inlineData: { mimeType: mime, data: Buffer.from(bytes).toString("base64") } },
      ];
      let v: { people: number; adult: boolean; sameAsReference: boolean; banned: string[]; unexpectedTextOrLogos: boolean; reason: string };
      try {
        const res = await generateContent(geminiModels.filter(), [{ role: "user", parts }], { systemInstruction: INSTRUCTION, temperature: 0, responseMimeType: "application/json", responseJsonSchema: SCHEMA }, { client: deps.client, timeoutMs: 60_000 });
        const text = res.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? "").join("") ?? "";
        v = JSON.parse(text);
      } catch (e) {
        return { ok: false, reason: `the vision check couldn't run (${(e as Error).message}), so the render isn't charged` };
      }
      const problems = [
        v.people !== 1 ? `${v.people} people visible (exactly one expected)` : "",
        !v.adult ? "the person may not be an adult" : "",
        refs[0] && !v.sameAsReference ? "the person doesn't look like the licensed creator" : "",
        v.banned?.length ? `banned content: ${v.banned.join(", ")}` : "",
        v.unexpectedTextOrLogos ? "unexpected text or logos" : "",
      ].filter(Boolean);
      if (problems.length) return { ok: false, reason: `vision check: ${problems.join("; ")} (${v.reason})` };
      return { ok: true, note: `vision check passed: one adult${refs[0] ? ", matches the creator" : ""}, no banned content` };
    },
  };
}
