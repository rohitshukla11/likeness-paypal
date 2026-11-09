import "server-only";
/**
 * Demo session: two cookies, the visitor's workspace id (random, unguessable, httpOnly) and the persona they are
 * playing (brand or creator). No accounts: a workspace is the visitor's private sandbox of rows.
 */
import { cookies } from "next/headers";
import { connection } from "next/server";
import { getWorkspace, type Workspace } from "./demo";

export type Role = "brand" | "creator";
const WS = "lk_ws";
const ROLE = "lk_role";
const MAX_AGE = 30 * 86_400;

export async function getSession(): Promise<(Workspace & { role: Role }) | null> {
  // Request time from here on: the database driver uses randomness when it connects, which Next.js won't prerender.
  await connection();
  const jar = await cookies();
  const id = jar.get(WS)?.value;
  if (!id || !/^ws_[A-Za-z0-9_-]{22}$/.test(id)) return null;
  const ws = await getWorkspace(id);
  if (!ws) return null;
  return { ...ws, role: jar.get(ROLE)?.value === "creator" ? "creator" : "brand" };
}

export async function setSession(workspaceId: string, role: Role) {
  const jar = await cookies();
  const opts = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/", maxAge: MAX_AGE };
  jar.set(WS, workspaceId, opts);
  jar.set(ROLE, role, opts);
}
