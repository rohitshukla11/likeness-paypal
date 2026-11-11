import "server-only";
/**
 * Server start (instrumentation.ts, Node.js runtime): four database connections opened in parallel (a page reads up to
 * four queries at once), then the seeded creators' portraits preloaded, so the first page waits for neither the
 * connection handshakes nor the downloads. Errors are only logged.
 */
import { sql } from "drizzle-orm";
import { db } from "./db";
import { warmPortraits } from "./portraits";

export async function warmUp() {
  try {
    await Promise.all(Array.from({ length: 4 }, () => db().execute(sql`select 1`)));
    warmPortraits();
  } catch (e) {
    console.error(`database warm-up: ${(e as Error).message}`);
  }
}
