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
