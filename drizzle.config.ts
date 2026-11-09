import { defineConfig } from "drizzle-kit";

// drizzle-kit reads DATABASE_URL from .env.local (never committed).
try {
  process.loadEnvFile(".env.local");
} catch {
  // no .env.local: DATABASE_URL must come from the environment
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL ?? "" },
});
