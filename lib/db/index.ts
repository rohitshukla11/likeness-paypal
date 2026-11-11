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
    // Keep idle connections for 2 minutes (pg's default is 10 s): a new connection to Neon costs a TLS and auth
    // handshake, seconds when the database is far away, and every page reads several times. Under Neon's 5-minute
    // scale-to-zero, so a kept connection is rarely one the server has closed; if it is, the pool drops it (below).
    // Up to 10 connections: one page load reads in parallel next to its images, the agent and the settle loop.
    pool = new Pool({ connectionString: url, max: 10, idleTimeoutMillis: 120_000 });
    // An idle connection closed by the server emits "error" on the pool: log it (the pool discards that client)
    // instead of letting an unhandled "error" event stop the process.
    pool.on("error", (e: Error) => console.error(`database: idle connection closed (${e.message})`));
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
