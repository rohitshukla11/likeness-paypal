"use server";
/** Studio actions: start a render (the engine runs to the review window), and the brand's decisions on it. */
import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { licences, mandates } from "@/lib/db/schema";
import { accept, approveStepUp, declineStepUp, engineDeps, reject, renderAndPay } from "@/lib/engine";
import { newId } from "@/lib/errors";
import { renderOfBrand } from "@/lib/queries";
import { getSession } from "@/lib/session";

const back = (q: Record<string, string> = {}) => redirect(`/brand/studio${Object.keys(q).length ? `?${new URLSearchParams(q)}` : ""}`);

async function me() {
  const s = await getSession();
  if (!s) redirect("/");
  return s;
}

export async function startRender(form: FormData) {
  const s = await me();
  const [licenceId, use] = String(form.get("licenceUse") ?? "").split("|");
  const kind = form.get("kind") === "video" ? "video" : "image";
  const fromRenderId = kind === "video" ? String(form.get("fromRenderId") ?? "") || null : null;
  const prompt = String(form.get("prompt") ?? "").trim();
  if (prompt.length < 5 || prompt.length > 1000) back({ error: "Write a prompt of 5 to 1000 characters" });
  const [l] = await db().select().from(licences).where(and(eq(licences.id, licenceId ?? ""), eq(licences.brandId, s.brandId)));
  if (!l) back({ error: "Choose one of your licences" });
  const [m] = await db().select().from(mandates).where(and(eq(mandates.brandId, s.brandId), ne(mandates.status, "revoked"))).orderBy(desc(mandates.createdAt)).limit(1);
  if (!m) back({ error: "Save a mandate on the brand page first" });
  if (kind === "video" && fromRenderId && !(await renderOfBrand(fromRenderId, s.brandId))) back({ error: "Choose one of your own ad images to start the video from" });
  const r = await renderAndPay({ renderId: newId("rnd"), licenceId: l.id, mandateId: m.id, kind, fromRenderId, use: use || l.allowedUses[0], prompt }, engineDeps());
  revalidatePath("/brand/studio");
  if (r.status === "refused") back({ error: `Refused before any PayPal call: ${r.error ?? "policy"}` });
  if (r.status === "needs_brand_approval") back({ ok: "This render is above your step-up threshold: approve it below to charge it." });
  if (r.status === "voided" || r.status === "failed") back({ error: `Not charged: ${r.error ?? r.status}` });
  back({ ok: "Rendered and captured. Accept or reject it before the review window closes." });
}

async function onMine(renderId: string, run: () => Promise<unknown>, ok: string) {
  const s = await me();
  if (!(await renderOfBrand(renderId, s.brandId))) back({ error: "Not your render" });
  try {
    await run();
  } catch (e) {
    back({ error: e instanceof Error ? e.toString().replace(/^Error: /, "") : "PayPal call failed" });
  }
  revalidatePath("/brand/studio");
  back({ ok });
}

export async function acceptRender(renderId: string) {
  await onMine(renderId, () => accept(renderId, engineDeps()), "Accepted: the creator is paid 90% through PayPal Payouts and the receipt is signed.");
}

export async function rejectRender(renderId: string) {
  await onMine(renderId, () => reject(renderId, engineDeps()), "Rejected: the capture is refunded to your PayPal and the creator isn't paid.");
}

export async function approveRender(renderId: string) {
  await onMine(renderId, () => approveStepUp(renderId, engineDeps()), "Approved above the step-up threshold: rendered and captured.");
}

export async function declineRender(renderId: string) {
  await onMine(renderId, () => declineStepUp(renderId, engineDeps()), "Declined. Nothing was charged.");
}
