"use server";
/** The brand's actions: the mandate (limits) and licence requests. Renders are in studio/actions.ts. */
import { and, desc, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canonicalJson, sha256Hex } from "@/lib/canonical";
import { db } from "@/lib/db";
import { brands, mandates } from "@/lib/db/schema";
import { HttpError, newId } from "@/lib/errors";
import { fileRequest } from "@/lib/licences";
import { PayPalError } from "@/lib/paypal/http";
import { getSession } from "@/lib/session";
import { attachSharedDemoWallet } from "@/lib/wallet";

async function me() {
  const s = await getSession();
  if (!s) redirect("/");
  return s;
}

const back = (q: Record<string, string>) => redirect(`/brand?${new URLSearchParams(q)}`);
const dollars = (v: FormDataEntryValue | null) => Math.round(Number(v) * 100);

/** Saves the brand's mandate: updates the current one's limits (its spend is kept) or creates the first one. */
export async function saveMandate(form: FormData) {
  const s = await me();
  const perRender = dollars(form.get("perRender"));
  const daily = dollars(form.get("daily"));
  const budget = dollars(form.get("budget"));
  const stepUp = dollars(form.get("stepUp"));
  const days = Math.floor(Number(form.get("days")));
  if (!(perRender >= 50 && daily >= perRender && budget >= daily)) back({ error: "Limits must be per render ≥ $0.50, daily cap ≥ per render, budget ≥ daily cap" });
  if (!(stepUp >= 0 && stepUp <= perRender)) back({ error: "The step-up threshold must be between $0 and the per-render maximum" });
  if (!(days >= 1 && days <= 365)) back({ error: "The mandate must last 1 to 365 days" });
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const terms = { brandId: s.brandId, maxPerRenderCents: perRender, dailyCapCents: daily, totalBudgetCents: budget, stepUpThresholdCents: stepUp, expiresAt: expiresAt.toISOString() };
  const termsSha256 = sha256Hex(canonicalJson(terms));
  const [brand] = await db().select().from(brands).where(eq(brands.id, s.brandId));
  const wallet = brand?.paymentTokenId ? { paymentTokenId: brand.paymentTokenId } : null;
  const [current] = await db().select().from(mandates).where(and(eq(mandates.brandId, s.brandId), ne(mandates.status, "revoked"))).orderBy(desc(mandates.createdAt)).limit(1);
  const limits = { maxPerRenderCents: perRender, dailyCapCents: daily, totalBudgetCents: budget, stepUpThresholdCents: stepUp, expiresAt, termsSha256 };
  if (current) {
    await db()
      .update(mandates)
      .set({ ...limits, ...(wallet ? { paymentTokenId: wallet.paymentTokenId, status: "active" } : {}) })
      .where(eq(mandates.id, current.id));
  } else {
    await db().insert(mandates).values({ id: newId("man"), brandId: s.brandId, ...limits, paymentTokenId: wallet?.paymentTokenId ?? null, status: wallet ? "active" : "pending_wallet" });
  }
  revalidatePath("/brand");
  back({ ok: wallet ? "Mandate saved and active." : "Mandate saved. Save your PayPal wallet to activate it." });
}

export async function requestLicence(form: FormData) {
  const s = await me();
  try {
    await fileRequest(s.brandId, {
      creatorId: String(form.get("creatorId")),
      uses: form.getAll("uses").map(String),
      days: Number(form.get("days")),
      renderCap: Number(form.get("renderCap")),
      brief: String(form.get("brief") ?? ""),
    });
  } catch (e) {
    back({ error: e instanceof HttpError ? e.message : "Could not send the request" });
  }
  back({ ok: "Request sent. Switch to the Creator persona to approve it." });
}

/** Attach the shared sandbox demo wallet instead of saving one at PayPal. */
export async function attachDemoWallet() {
  const s = await me();
  try {
    await attachSharedDemoWallet(s.brandId);
  } catch (e) {
    back({ error: e instanceof HttpError ? e.message : e instanceof PayPalError ? e.toString() : "Could not attach the demo wallet" });
  }
  revalidatePath("/brand");
  back({ ok: "Demo wallet attached (a shared sandbox buyer). Your mandate charges it from now on." });
}
