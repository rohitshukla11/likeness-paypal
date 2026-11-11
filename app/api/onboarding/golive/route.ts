import { HttpError } from "@/lib/errors";
import { goLive } from "@/lib/onboarding/creators";
import { onboardingEnabled } from "@/lib/onboarding/google";
import { b64bytes, onboardingCreator } from "@/lib/onboarding/session";

/** "Protect my photos and go live": encrypt and store the matched frames, publish the creator in this workspace. */
export async function POST(req: Request) {
  if (!onboardingEnabled()) return Response.json({ error: "not found" }, { status: 404 });
  const { creator } = await onboardingCreator();
  if (!creator) return Response.json({ error: "sign in with Google first" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { frames?: string[]; adult?: boolean; consent?: boolean };
  try {
    const c = await goLive(creator.id, (b.frames ?? []).map(b64bytes), { adult: !!b.adult, consent: !!b.consent });
    return Response.json({ status: c.status, name: c.name });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof HttpError ? e.status : 500 });
  }
}
