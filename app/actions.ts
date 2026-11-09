"use server";
/** Server actions for the demo personas. Every action acts only inside the visitor's own workspace. */
import { redirect } from "next/navigation";
import { createWorkspace } from "@/lib/demo";
import { getSession, setSession, type Role } from "@/lib/session";

/** "Continue as Brand / Creator": reuses the visitor's workspace, or makes one (seeded with Rohit and a demo brand). */
export async function continueAs(role: Role) {
  const s = await getSession();
  const id = s?.id ?? (await createWorkspace()).id;
  await setSession(id, role);
  redirect(role === "creator" ? "/creator" : "/brand");
}

/** "Reset demo": a fresh workspace. The old one stays in the database untouched (nothing is deleted). */
export async function resetDemo() {
  const s = await getSession();
  const ws = await createWorkspace();
  await setSession(ws.id, s?.role ?? "brand");
  redirect(s?.role === "creator" ? "/creator" : "/brand");
}
