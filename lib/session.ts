import "server-only";
/**
 * Demo session: two cookies, the visitor's workspace id (random, unguessable, httpOnly) and the persona they are
 * playing (brand or creator), plus which of the workspace's creators they play (lk_cre; Rohit unless they pick one).
 * No accounts: a workspace is the visitor's private sandbox of rows.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getWorkspace, type Workspace } from "./demo";

export type Role = "brand" | "creator";
const WS = "lk_ws";
const ROLE = "lk_role";
const CREATOR = "lk_cre";
const MAX_AGE = 30 * 86_400;

export async function getSession(): Promise<(Workspace & { role: Role }) | null> {
  // Request time from here on: the database driver uses randomness when it connects, which Next.js won't prerender.
  await connection();
  const jar = await cookies();
  const id = jar.get(WS)?.value;
  if (!id || !/^ws_[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const cre = jar.get(CREATOR)?.value;
  // Only honoured for a live creator of this same workspace (getWorkspace checks).
  const ws = await getWorkspace(id, cre && /^cre_[A-Za-z0-9_-]{22}$/.test(cre) ? cre : null);
  if (!ws) return null;
  return { ...ws, role: jar.get(ROLE)?.value === "creator" ? "creator" : "brand" };
}

const cookieOpts = () => ({ httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE });

export async function setSession(workspaceId: string, role: Role) {
  const jar = await cookies();
  const switching = jar.get(WS)?.value !== workspaceId;
  jar.set(WS, workspaceId, cookieOpts());
  jar.set(ROLE, role, cookieOpts());
  if (switching) jar.delete(CREATOR);
}

/** Which of the workspace's creators the visitor plays (validated on every read by getSession). */
export async function setPlayedCreator(creatorId: string) {
  (await cookies()).set(CREATOR, creatorId, cookieOpts());
}
