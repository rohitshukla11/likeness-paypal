/** The database client (Drizzle over Neon's HTTP driver). Connects on first use, so builds don't need DATABASE_URL. */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

let client: ReturnType<typeof drizzle<typeof schema>> | undefined;

export function db() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set (see .env.example)");
    client = drizzle(neon(url), { schema });
  }
  return client;
}

export { schema };
