import { HttpError } from "@/lib/errors";
import { matchFrames } from "@/lib/onboarding/creators";
import { onboardingEnabled } from "@/lib/onboarding/google";
import { b64bytes, onboardingCreator } from "@/lib/onboarding/session";

/** Compare three live frames with the channel avatar. Only the frames' hashes are kept. */
export async function POST(req: Request) {
  if (!onboardingEnabled()) return Response.json({ error: "not found" }, { status: 404 });
  const { creator } = await onboardingCreator();
  if (!creator) return Response.json({ error: "sign in with Google first" }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { frames?: string[]; liveness?: { blinks: number; turnedLeft: boolean; turnedRight: boolean } };
  try {
    return Response.json(await matchFrames(creator.id, (b.frames ?? []).map(b64bytes), b.liveness ?? { blinks: 0, turnedLeft: false, turnedRight: false }));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: e instanceof HttpError ? e.status : 500 });
  }
}
