/**
 * The database client: Drizzle over Neon's serverless Pool (WebSockets; Node 22 has a global WebSocket), because the
 * render engine needs interactive transactions (SELECT … FOR UPDATE), which Neon's HTTP driver can't do.
 * Connects on first use, so builds don't need DATABASE_URL. Server-only: the app imports it from server code; scripts
 * run with `--conditions=react-server` so the `server-only` guard resolves to its no-op build.
 */
import "server-only";
import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

export type Db = ReturnType<typeof drizzle<typeof schema>>;
/** A transaction handle, or the database itself: anything that can run queries. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

let pool: Pool | undefined;
let client: Db | undefined;

export function db(): Db {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    pool = new Pool({ connectionString: url, max: 5 });
    client = drizzle(pool, { schema });
  }
  return client;
}

/** Closes the pool (scripts call this at the end so the process can exit). */
export async function closeDb() {
  await pool?.end();
  pool = undefined;
  client = undefined;
}

export { schema };
