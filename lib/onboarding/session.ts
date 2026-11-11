import "server-only";
/** The onboarding creator of this visitor: the lk_onb cookie, checked against the visitor's workspace. */
import { cookies } from "next/headers";
import { getSession } from "../session";
import { getCreator } from "./creators";

export const ONB_COOKIE = "lk_onb";

export async function onboardingCreator() {
  const s = await getSession();
  if (!s) return { session: null, creator: null };
  const id = (await cookies()).get(ONB_COOKIE)?.value;
  const c = id ? await getCreator(id) : null;
  // Only a creator made by Google sign-in, in the visitor's own workspace: never a seeded demo creator.
  return { session: s, creator: c && c.googleSub && c.workspaceId === s.id ? c : null };
}

/** A data URL or bare base64 JPEG from the browser. */
export const b64bytes = (s: string) => new Uint8Array(Buffer.from(String(s).replace(/^data:[^;]+;base64,/, ""), "base64"));
