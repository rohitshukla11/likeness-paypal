import { sql } from "drizzle-orm";
import { connection } from "next/server";
import { db } from "@/lib/db";

/** Render's health check: the server answers and Postgres (Neon) does too. */
export async function GET() {
  await connection();
  try {
    await db().execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
