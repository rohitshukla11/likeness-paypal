/**
 * Registers the PayPal SANDBOX webhook for a deployed app: <base>/api/paypal/webhook with WEBHOOK_EVENTS.
 * Dry run by default (lists this app's existing webhooks and what would be registered). With --confirm it creates
 * the webhook (or reuses one already pointing at that URL) and writes PAYPAL_WEBHOOK_ID to .env.local; set the
 * same value in Render. Prints truncated ids only.
 *
 *   pnpm paypal:webhook --url https://likeness-r2t7.onrender.com [--confirm]
 */
import { readFile, writeFile } from "node:fs/promises";
import { paypalConfig } from "../lib/paypal/http";
import { createWebhook, listWebhooks, WEBHOOK_EVENTS } from "../lib/paypal/webhooks";

const short = (s: string) => (s.length <= 12 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`);

async function main() {
  if (paypalConfig().env !== "sandbox") throw new Error("sandbox only");
  const base = (process.argv[process.argv.indexOf("--url") + 1] ?? process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("pass --url https://… (PayPal only delivers webhooks to https URLs)");
  const url = `${base}/api/paypal/webhook`;
  const { webhooks } = await listWebhooks();
  console.log(`existing sandbox webhooks for this app: ${webhooks.length ? webhooks.map((w) => `${short(w.id)} → ${w.url}`).join("; ") : "none"}`);
  console.log(`webhook URL: ${url}`);
  console.log(`events (${WEBHOOK_EVENTS.length}): ${WEBHOOK_EVENTS.join(", ")}`);
  if (!process.argv.includes("--confirm")) {
    console.log("\nDry run: nothing registered. Re-run with --confirm.");
    return;
  }
  const existing = webhooks.find((w) => w.url === url);
  const hook = existing ?? (await createWebhook(url));
  console.log(`${existing ? "reused" : "registered"} webhook ${short(hook.id)} (${hook.event_types.length} events)`);
  const env = await readFile(".env.local", "utf8");
  const line = `PAYPAL_WEBHOOK_ID=${hook.id}`;
  const next = /^PAYPAL_WEBHOOK_ID=.*$/m.test(env) ? env.replace(/^PAYPAL_WEBHOOK_ID=.*$/m, line) : `${env.replace(/\n*$/, "\n")}\n# PayPal sandbox webhook for the deployed app (set the same value in Render)\n${line}\n`;
  await writeFile(".env.local", next, { mode: 0o600 });
  console.log("PAYPAL_WEBHOOK_ID written to .env.local");
}

main().catch((e) => {
  console.error(`paypal:webhook stopped: ${e instanceof Error ? e.toString() : String(e)}`);
  process.exitCode = 1;
});
