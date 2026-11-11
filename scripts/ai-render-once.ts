/**
 * ONE real AI render through the whole engine, for the confirm-gated checks. Dry run by default: prints what it
 * would do and the estimated cost, and makes NO Gemini call. With --confirm it makes exactly one render:
 *   image: a fresh demo workspace (shared sandbox demo wallet, an approved licence for "Rohit") → PayPal sandbox
 *     authorize → the gemini-3.5-flash-lite safety filter → gemini-nano-banana-2.1 from private/rohit.jpg → label,
 *     C2PA → capture → the brand accepts → payout 90% → receipt.
 *   video: the same, under the licence of an earlier AI image render (--from <render id>, default the newest),
 *     whose generated ad image is the video's FIRST FRAME (never the raw photo) → Gemini Omni Flash.
 * Prints the PayPal ids, the model and Gemini's reported token usage with the cost it implies, and saves the file
 * to private/out/ (git-ignored). Reports truncated ids only.
 *
 *   pnpm ai:once --kind image            # dry run
 *   pnpm ai:once --kind image --confirm  # one real Gemini image
 *   pnpm ai:once --kind video [--from rnd_…] --confirm  # one real Omni Flash video from that ad image
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { and, desc, eq, like } from "drizzle-orm";
import { c2paConfigured, embedManifest, readManifest } from "../lib/ai/c2pa";
import { veoPrompt } from "../lib/ai/creative";
import { geminiConfigured, geminiModels, genai, type GenAiLike } from "../lib/ai/gemini";
import { AiProvider } from "../lib/ai/provider";
import { aiCaps, MemoryQuota } from "../lib/ai/quota";
import { adImage, referencePath, referencePhotos } from "../lib/ai/reference";
import { estimatedVideoCostUsd, imageToVideo, videoSeconds } from "../lib/ai/render-video";
import { closeDb, db } from "../lib/db";
import { mandates, receipts, renderMedia, renders } from "../lib/db/schema";
import { createWorkspace } from "../lib/demo";
import { engineDeps } from "../lib/engine";
import { StubProvider } from "../lib/engine/providers";
import { accept, renderAndPay } from "../lib/engine/render-and-pay";
import { newId } from "../lib/errors";
import { decide, fileRequest } from "../lib/licences";
import { checkReceipt } from "../lib/receipts";
import { attachSharedDemoWallet } from "../lib/wallet";

const arg = (k: string) => process.argv.includes(k);
const kind = process.argv[process.argv.indexOf("--kind") + 1] === "video" ? "video" : "image";
const confirm = arg("--confirm");
const fromArg = process.argv.includes("--from") ? process.argv[process.argv.indexOf("--from") + 1] : null;
const short = (s?: string | null) => (!s ? "-" : s.length <= 12 ? s : `${s.slice(0, 6)}…${s.slice(-4)}`);
const line = (k: string, v: string) => console.log(`${k.padEnd(22)} ${v}`);
const PROMPT = {
  image: "Rohit holding a cup of cold brew coffee in a sunlit café, warm morning light, friendly smile, clean background",
  video: "Rohit lifts a cup of cold brew coffee and smiles at the camera in a sunlit café; gentle slow push-in",
};
// Gemini API list prices (2026-11), per 1M tokens: image model in $1.50, image out $30 (1K image = 1,120 tokens =
// $0.0336), text/thinking out $7.50; filter in $0.30, out $2.50; Omni Flash in $1.50, video out $12, text out $9.
const PRICE: Record<string, { in: number; out: number; thoughts: number }> = {
  "gemini-nano-banana-2.1": { in: 1.5, out: 30, thoughts: 7.5 },
  "gemini-3.5-flash-lite": { in: 0.3, out: 2.5, thoughts: 2.5 },
  "gemini-omni-1.2-flash": { in: 1.5, out: 12, thoughts: 9 },
  "gemini-omni-1.1-flash": { in: 1.5, out: 12, thoughts: 9 },
};

type Usage = { model: string; promptTokens?: number; outputTokens?: number; thoughtTokens?: number; raw?: unknown };

/** Records Gemini's usage for every call this run makes. */
function recording(real: GenAiLike, log: Usage[]): GenAiLike {
  const models = {
    generateContent: async (p: { model: string }) => {
      const r = await real.models.generateContent(p as never);
      const u = r.usageMetadata;
      log.push({ model: p.model, promptTokens: u?.promptTokenCount, outputTokens: u?.candidatesTokenCount ?? 0, thoughtTokens: u?.thoughtsTokenCount ?? 0, raw: u });
      return r;
    },
  };
  const ri = real.interactions as unknown as { create: (p: unknown, o?: unknown) => Promise<Record<string, unknown>>; get: (id: string, p?: unknown, o?: unknown) => Promise<Record<string, unknown>>; cancel: (id: string) => Promise<unknown> };
  const note = (it: Record<string, unknown>) => {
    if (it.status === "completed") {
      const u = (it.usage ?? {}) as Record<string, number | undefined>;
      log.push({ model: String(it.model ?? geminiModels.video()), promptTokens: u.total_input_tokens ?? u.input_tokens, outputTokens: u.total_output_tokens ?? u.output_tokens, thoughtTokens: u.total_thought_tokens ?? u.thought_tokens ?? 0, raw: it.usage });
    }
    return it;
  };
  const interactions = { create: async (p: unknown, o?: unknown) => note(await ri.create(p, o)), get: async (id: string, p?: unknown, o?: unknown) => note(await ri.get(id, p, o)), cancel: ri.cancel.bind(ri) };
  return { models, interactions, files: real.files } as unknown as GenAiLike;
}

const cost = (u: Usage) => {
  const p = PRICE[u.model];
  return p ? ((u.promptTokens ?? 0) * p.in + (u.outputTokens ?? 0) * p.out + (u.thoughtTokens ?? 0) * p.thoughts) / 1_000_000 : NaN;
};

async function main() {
  const ref = referencePath("/demo/rohit.svg")!;
  const refSize = await stat(ref).then((s) => s.size, () => 0);
  const clip = await stat(path.join(path.dirname(ref), "demo-video.mp4")).then((s) => s.size, () => 0);
  // Video: the AI image render whose generated ad is the first frame (--from, or the newest), and its licence.
  const [source] =
    kind === "video"
      ? await db()
          .select({ id: renders.id, licenceId: renders.licenceId, mandateId: renders.mandateId, status: renders.status, prompt: renders.prompt })
          .from(renders)
          .where(fromArg ? eq(renders.id, fromArg) : and(eq(renders.kind, "image"), like(renders.model, "gemini%")))
          .orderBy(desc(renders.createdAt))
          .limit(1)
      : [];
  const sourceImage = source ? await adImage(source.id, source.licenceId) : null;
  const estimate =
    kind === "image" ? 0.0336 + (1300 + 400) * 1.5e-6 + 0.0005 : estimatedVideoCostUsd() + 2000 * 1.5e-6 + 0.0005;

  console.log(`${confirm ? "RUN" : "DRY RUN"}: one ${kind} render through the engine (PayPal sandbox)`);
  line("model", kind === "image" ? `${geminiModels.image()} (1K, 1:1), filter ${geminiModels.filter()}` : `${geminiModels.video()} (Gemini Omni Flash), filter ${geminiModels.filter()}`);
  if (kind === "video") {
    line("video", `${videoSeconds()} s, 720p, 9:16; Omni task image_to_video; timeout ${Number(process.env.VIDEO_TIMEOUT_MS ?? 300000) / 1000} s`);
    line("first frame", sourceImage && source ? `the generated ad of render ${short(source.id)} (${Math.round(sourceImage.bytes.length / 1024)} KB, ${sourceImage.mime}, ${source.status}): "${source.prompt.slice(0, 60)}…"` : "MISSING: no AI image render to start from (run --kind image first)");
    line("licence", source ? `the same licence as that image (${short(source.licenceId)}), its mandate ${short(source.mandateId)}` : "-");
  }
  if (kind === "image") line("reference photo", refSize ? `${path.relative(process.cwd(), ref)} (${Math.round(refSize / 1024)} KB)` : `MISSING: put it at ${path.relative(process.cwd(), ref)}`);
  line("GEMINI_API_KEY", geminiConfigured() ? "set" : "MISSING: add it to .env.local");
  line("C2PA certificate", c2paConfigured() ? "present (test chain, private/c2pa)" : "none (no content credential)");
  if (kind === "video") line("demo clip (fallback)", clip ? `private/demo-video.mp4 (${Math.round(clip / 1024)} KB)` : "not there yet");
  line("prompt", `"${PROMPT[kind]}"`);
  line("PayPal (sandbox)", `authorize ${kind === "video" ? "$6.00 (3 × $2.00)" : "$2.00"} on the demo wallet, capture, brand accepts, payout 90%`);
  line("estimated cost", `about $${estimate.toFixed(3)} (Gemini API list prices, 2026-11)`);
  line("caps", `this run uses its own counter; the app's caps stay ${JSON.stringify(aiCaps())}`);
  if (!confirm) {
    console.log("\nNo Gemini call made. Re-run with --confirm to make exactly one render.");
    return;
  }
  if (!geminiConfigured() || (kind === "image" && !refSize) || (kind === "video" && !sourceImage)) throw new Error("missing an input (see above)");

  const usage: Usage[] = [];
  const client = recording(genai(), usage);
  const provider = new AiProvider({
    quota: new MemoryQuota(),
    stub: new StubProvider(),
    references: (i) => referencePhotos(i.creatorPhotoRef),
    client,
    firstFrame: (i) => adImage(i.fromRenderId, i.licenceId),
    video: (i, still) => imageToVideo({ image: still.bytes, mime: still.mime, prompt: veoPrompt(i.prompt, "9:16"), aspectRatio: "9:16" }, client),
    credential: c2paConfigured()
      ? (bytes, mime, i, model) =>
          embedManifest(bytes, mime, {
            protocol: "likeness-paypal/1",
            licenceId: i.licenceId ?? "",
            renderId: i.renderId,
            renderType: i.kind,
            use: i.use,
            payment: { provider: "PayPal", orderId: i.orderId ?? null, authorizationId: i.authorizationId ?? null },
            receipt: { store: "Postgres receipts, by render id", signedBy: "Ed25519 (GET /api/receipts/public-key)", verify: "/verify" },
            renderer: { provider: "Gemini API", model },
            promptSha256: "",
            createdAt: new Date().toISOString(),
          })
      : undefined,
  });

  let licenceId: string;
  let mandateId: string;
  if (kind === "video") {
    licenceId = source!.licenceId;
    mandateId = source!.mandateId;
  } else {
  const ws = await createWorkspace({ brandName: "AI check brand" });
  const mid = newId("man");
  await db().insert(mandates).values({ id: mid, brandId: ws.brandId, maxPerRenderCents: 1000, dailyCapCents: 3000, totalBudgetCents: 6000, stepUpThresholdCents: 1000, expiresAt: new Date(Date.now() + 30 * 864e5), status: "pending_wallet" });
  await attachSharedDemoWallet(ws.brandId);
  const req = await fileRequest(ws.brandId, { creatorId: ws.creatorId, uses: ["advertising"], days: 7, renderCap: 3, brief: "One real AI render to check the pipeline end to end." });
  const lic = await decide(ws.creatorId, req.id, true);
  licenceId = lic.id;
  mandateId = mid;
  }

  const t = Date.now();
  const deps = engineDeps({ provider });
  const r = await renderAndPay({ renderId: newId("rnd"), licenceId, mandateId, kind, fromRenderId: kind === "video" ? source!.id : null, use: "advertising", prompt: PROMPT[kind] }, deps);
  line("render", `${short(r.id)} ${r.status} in ${Math.round((Date.now() - t) / 1000)} s; model ${r.model ?? "-"}${r.renderNote ? ` (${r.renderNote})` : ""}${r.error ? `; ${r.error}` : ""}`);
  line("PayPal", `order ${short(r.orderId)}, authorization ${short(r.authorizationId)}, capture ${short(r.captureId)}`);
  if (r.status === "in_review") {
    const a = await accept(r.id, deps);
    const [rc] = await db().select().from(receipts).where(eq(receipts.renderId, r.id));
    line("brand accepts", `${a.status}; payout ${short(a.payoutBatchId)} $${(a.creatorPayoutCents / 100).toFixed(2)}; receipt ${short(rc?.id)} ${rc ? (checkReceipt({ canonical: rc.canonicalPayload, signature: rc.signature, keyId: rc.keyId }) ? "signature valid" : "INVALID") : ""}`);
    const [m] = await db().select().from(renderMedia).where(eq(renderMedia.renderId, r.id));
    if (m) {
      const out = path.join(path.dirname(ref), "out", `${r.id}.${m.mime === "video/mp4" ? "mp4" : "jpg"}`);
      await mkdir(path.dirname(out), { recursive: true });
      await writeFile(out, m.bytes);
      const cred = await readManifest(new Uint8Array(m.bytes), m.mime);
      line("output", `${path.relative(process.cwd(), out)} (${Math.round(m.bytes.length / 1024)} KB, ${m.mime}); C2PA ${cred.present ? `present, signature ${cred.signatureValid ? "valid" : "INVALID"}, test signer` : "none"}`);
    }
  }
  let total = 0;
  for (const u of usage) {
    const c = cost(u);
    total += Number.isFinite(c) ? c : 0;
    line(`usage ${u.model}`, `${u.promptTokens ?? "?"} in, ${u.outputTokens ?? "?"} out${u.thoughtTokens ? ` + ${u.thoughtTokens} thinking` : ""} → $${Number.isFinite(c) ? c.toFixed(4) : "?"}`);
  }
  line("actual cost", `$${total.toFixed(4)} (from Gemini's reported tokens at list prices; the billing console is authoritative)`);
}

main()
  .catch((e) => {
    console.error(`stopped: ${e instanceof Error ? e.message : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
