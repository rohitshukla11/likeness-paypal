"use server";
/** The creator's actions: terms, payout email, approve/decline requests, revoke licences. */
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { creators, USES } from "@/lib/db/schema";
import { HttpError } from "@/lib/errors";
import { decide, revoke } from "@/lib/licences";
import { getSession } from "@/lib/session";

async function me() {
  const s = await getSession();
  if (!s) redirect("/");
  return s;
}

const back = (q: Record<string, string>) => redirect(`/creator?${new URLSearchParams(q)}`);
const message = (e: unknown) => (e instanceof HttpError ? e.message : "Something went wrong");

export async function saveTerms(form: FormData) {
  const s = await me();
  const price = Math.round(Number(form.get("price")) * 100);
  const cap = Math.floor(Number(form.get("cap")));
  const days = Math.floor(Number(form.get("days")));
  const uses = form.getAll("uses").map(String).filter((u) => (USES as readonly string[]).includes(u));
  const email = String(form.get("email") ?? "").trim();
  if (!(price >= 50 && price <= 10_000)) back({ error: "Price per render must be $0.50 to $100.00" });
  if (!(cap >= 1 && cap <= 100)) back({ error: "Renders per licence must be 1 to 100" });
  if (!(days >= 1 && days <= 365)) back({ error: "Licence length must be 1 to 365 days" });
  if (!uses.length) back({ error: "Allow at least one use" });
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) back({ error: "That payout email doesn't look right" });
  await db()
    .update(creators)
    .set({ pricePerRenderCents: price, maxRendersPerLicence: cap, maxDays: days, allowedUses: uses, payoutPaypalEmail: email || null, acceptingLicences: form.get("accepting") === "on" })
    .where(eq(creators.id, s.creatorId));
  revalidatePath("/creator");
  back({ ok: "Terms saved. New requests use them; approved licences keep the price they were approved at." });
}

export async function decideRequest(licenceId: string, approve: boolean) {
  const s = await me();
  try {
    await decide(s.creatorId, licenceId, approve);
  } catch (e) {
    back({ error: message(e) });
  }
  back({ ok: approve ? "Licence approved. The brand can render now, within your terms." : "Request declined." });
}

export async function revokeLicence(licenceId: string) {
  const s = await me();
  try {
    await revoke(s.creatorId, licenceId);
  } catch (e) {
    back({ error: message(e) });
  }
  back({ ok: "Licence revoked. The brand's next render is refused before any PayPal call; earlier ads stay 'licensed when made'." });
}
