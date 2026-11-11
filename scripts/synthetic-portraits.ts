/**
 * The two SYNTHETIC demo creators' reference portraits (lib/personas.ts): photorealistic faces of fictional adults,
 * generated with the Gemini image model from a text prompt alone (no reference photo; the prompt says the face must
 * not resemble any real or famous person). BILLABLE: one Gemini image call per portrait, so it is gated:
 *
 *   pnpm portraits:synthetic             dry run: prints the model, each prompt, the files and the estimated cost
 *   pnpm portraits:synthetic --confirm   generates them into private/<key>.jpg|png (git-ignored, never committed)
 *
 * Then `pnpm seed:assets` seals them (AES-256-GCM under PHOTO_KEK) into the blobs table, like Rohit's photo.
 * Existing files are kept unless --replace is given. Prints sizes and hashes only.
 */
import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateContent, geminiConfigured, geminiModels } from "../lib/ai/gemini";
import { PERSONAS } from "../lib/personas";

const EST_USD_PER_IMAGE = 0.034; // Gemini image model, one 1K image (README "AI ads"; under $0.04)
const dir = path.resolve(process.cwd(), process.env.PRIVATE_DIR || "private");
const exists = (f: string) => access(f).then(() => true, () => false);

async function main() {
  const confirm = process.argv.includes("--confirm");
  const replace = process.argv.includes("--replace");
  const model = geminiModels.image();
  const todo = [];
  for (const p of PERSONAS.filter((x) => x.synthetic && x.portrait)) {
    const have = (await exists(path.join(dir, `${p.file}.jpg`))) || (await exists(path.join(dir, `${p.file}.png`)));
    if (have && !replace) console.log(`${p.name}: private/${p.file}.* already exists, kept (pass --replace to make a new one)`);
    else todo.push(p);
  }
  console.log(`${confirm ? "Generating" : "DRY RUN (nothing is generated, nothing is billed)"}: ${todo.length} portrait(s) with ${model}, 1:1, ${process.env.GEMINI_IMAGE_SIZE || "1K"}`);
  for (const p of todo) console.log(`\n- ${p.name} (${p.niche}) → private/${p.file}.jpg|png\n  prompt: ${p.portrait}`);
  console.log(`\nEstimated cost: ${todo.length} × ~$${EST_USD_PER_IMAGE.toFixed(3)} ≈ $${(todo.length * EST_USD_PER_IMAGE).toFixed(2)}`);
  if (!confirm || !todo.length) {
    if (!confirm && todo.length) console.log("Run again with --confirm to generate them.");
    return;
  }
  if (!geminiConfigured()) throw new Error("GEMINI_API_KEY is not set");
  await mkdir(dir, { recursive: true });
  for (const p of todo) {
    const res = await generateContent(model, [{ role: "user", parts: [{ text: p.portrait! }] }], { responseModalities: ["IMAGE"], imageConfig: { aspectRatio: "1:1", imageSize: process.env.GEMINI_IMAGE_SIZE || "1K" } }, { timeoutMs: 120_000 });
    if (res.promptFeedback?.blockReason) throw new Error(`Gemini blocked ${p.name}'s portrait: ${res.promptFeedback.blockReason}`);
    const image = res.candidates?.[0]?.content?.parts?.find((x) => x.inlineData?.data && !x.thought)?.inlineData;
    if (!image?.data) throw new Error(`Gemini returned no image for ${p.name} (finishReason ${res.candidates?.[0]?.finishReason ?? "none"})`);
    const bytes = Buffer.from(image.data, "base64");
    const file = path.join(dir, `${p.file}.${image.mimeType === "image/jpeg" ? "jpg" : "png"}`);
    await writeFile(file, bytes, { mode: 0o600 });
    console.log(`${p.name}: ${path.relative(process.cwd(), file)}, ${Math.round(bytes.length / 1024)} KB, sha256 ${createHash("sha256").update(bytes).digest("hex").slice(0, 12)}…`);
  }
  console.log("\nNext: pnpm seed:assets (seals them into the database).");
}

main().catch((e) => {
  console.error(`portraits:synthetic stopped: ${(e as Error).message}`);
  process.exitCode = 1;
});
