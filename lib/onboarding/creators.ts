import "server-only";
/**
 * Creator onboarding (FEATURE_CREATOR_ONBOARDING), saved in Postgres so it can be resumed:
 *   0. signIn: a Google account (lib/onboarding/google.ts) makes a draft creator in the visitor's workspace.
 *   1. connectChannel: the user's own YouTube channel (proves the account is theirs); its avatar must show a face.
 *   2. matchFrames: three live frames (front, slight left, slight right) from the in-browser liveness check,
 *      compared with the channel avatar by the local face matcher (YuNet + AuraFace). Only the frames' sha256 are
 *      kept at this step; no image is stored.
 *   3. goLive: the same frames again (hashes must match), the self-declared 18+ and the consent text; the frames
 *      are encrypted (lib/onboarding/vault.ts) and stored, the front frame becomes the public photo, the price is
 *      set from the audience, and the creator becomes the workspace's creator persona.
 */
import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { creators } from "../db/schema";
import { HttpError, newId } from "../errors";
import { publicPhoto } from "../ai/label";
import { audiencePrice, CONSENT_TEXT } from "../model";
import { compareFaces, FaceMatchError, facesIn } from "./facematch";
import { sealFrames } from "./vault";
import { fetchAvatar, myChannel } from "./youtube";

const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
export const avatarThreshold = () => Number(process.env.FACE_MATCH_THRESHOLD ?? 0.5);

export type OnboardingCreator = typeof creators.$inferSelect;

export async function getCreator(id: string): Promise<OnboardingCreator | null> {
  const [c] = await db().select().from(creators).where(eq(creators.id, id));
  return c ?? null;
}

/** After Google sign-in: this Google account's creator in this workspace (a draft until it goes live). */
export async function signIn(workspaceId: string, google: { sub: string; email: string | null; name: string | null }): Promise<OnboardingCreator> {
  const [existing] = await db().select().from(creators).where(eq(creators.googleSub, google.sub));
  if (existing) {
    if (existing.workspaceId !== workspaceId) {
      // The same Google account in another demo workspace: move it here (one creator per Google account).
      await db().update(creators).set({ workspaceId }).where(eq(creators.id, existing.id));
    }
    return { ...existing, workspaceId };
  }
  const [c] = await db()
    .insert(creators)
    .values({ id: newId("cre"), workspaceId, name: google.name ?? "New creator", googleSub: google.sub, email: google.email, status: "draft", acceptingLicences: false, photoRef: null, payoutPaypalEmail: google.email })
    .returning();
  return c;
}

export async function connectChannel(creatorId: string, accessToken: string): Promise<OnboardingCreator> {
  const channel = await myChannel(accessToken);
  const others = (await db().select({ id: creators.id, channel: creators.channel }).from(creators)).filter((c) => c.channel?.channelId === channel.channelId && c.id !== creatorId);
  if (others.length) throw new HttpError(409, "This YouTube channel is already connected to another Likeness creator.");
  const avatar = await fetchAvatar(channel.avatarUrl);
  const faces = await facesIn(avatar).catch((e: Error) => {
    throw new HttpError(503, `face check unavailable: ${e.message}`);
  });
  if (faces.count === 0 || faces.best < 0.8)
    throw new HttpError(422, "Your channel avatar doesn't show a clear face, so we can't match it to you. Set a photo of yourself as your YouTube avatar, then connect again.");
  if (faces.count > 1) throw new HttpError(422, "Your channel avatar shows more than one face. Use a photo of just you, then connect again.");
  const [c] = await db().update(creators).set({ name: channel.title, channel }).where(eq(creators.id, creatorId)).returning();
  return c;
}

export async function matchFrames(
  creatorId: string,
  frames: Uint8Array[],
  liveness: { blinks: number; turnedLeft: boolean; turnedRight: boolean },
): Promise<{ ok: boolean; score: number; threshold: number; perFrame: number[] }> {
  const c = await getCreator(creatorId);
  if (!c?.channel) throw new HttpError(409, "connect your YouTube channel first");
  if (frames.length !== 3) throw new HttpError(400, "send exactly three frames: front, slight left, slight right");
  if (liveness.blinks < 1 || !liveness.turnedLeft || !liveness.turnedRight) throw new HttpError(422, "The liveness check wasn't completed: blink, then turn slightly left and right.");
  const avatar = await fetchAvatar(c.channel.avatarUrl);
  const perFrame: number[] = [];
  for (const f of frames) {
    try {
      perFrame.push(await compareFaces(f, avatar));
    } catch (e) {
      if (e instanceof FaceMatchError) throw new HttpError(e.status, `${e.message}. Try again in even light, with only your face in view.`);
      throw e;
    }
  }
  const threshold = avatarThreshold();
  const score = Math.max(...perFrame);
  const ok = score >= threshold;
  await db()
    .update(creators)
    .set({
      verification: {
        ...(c.verification ?? {}),
        faceMatch: { score, threshold, framesMatched: perFrame.filter((s) => s >= threshold).length, at: Date.now() },
        liveness: { ...liveness, method: "mediapipe-face-landmarker", at: Date.now() },
        pendingFrames: ok ? frames.map(sha256) : null,
      },
    })
    .where(eq(creators.id, creatorId));
  return { ok, score, threshold, perFrame };
}

export async function goLive(creatorId: string, frames: Uint8Array[], answers: { adult: boolean; consent: boolean }): Promise<OnboardingCreator> {
  const c = await getCreator(creatorId);
  const v = c?.verification;
  if (!c?.channel) throw new HttpError(409, "connect your YouTube channel first");
  if (!v?.faceMatch || v.faceMatch.score < v.faceMatch.threshold || !v.pendingFrames) throw new HttpError(409, "match your live face to your channel first");
  if (!answers.adult) throw new HttpError(422, "You must confirm you are 18 or older.");
  if (!answers.consent) throw new HttpError(422, "You must agree to the licensing terms to go live.");
  if (frames.length !== 3 || frames.map(sha256).join() !== v.pendingFrames.join()) throw new HttpError(409, "These aren't the frames that were matched. Take the face check again.");
  const sealed = await sealFrames(creatorId, frames, c.wrappedKey);
  const now = Date.now();
  const [live] = await db()
    .update(creators)
    .set({
      status: "live",
      acceptingLicences: true,
      wrappedKey: sealed.wrappedKey,
      framesSha256: sealed.sha256,
      publicPhoto: await publicPhoto(frames[0]),
      photoRef: `/media/creator/${creatorId}`,
      // Audience-based price (likeness-ai's demo credits are cents here): $0.50 to $10.00 per image.
      pricePerRenderCents: audiencePrice(c.channel.subscriberCount).image,
      verification: { ...v, pendingFrames: null, adultSelfDeclaredAt: now, consent: { at: now, text: CONSENT_TEXT } },
    })
    .where(eq(creators.id, creatorId))
    .returning();
  return live;
}
