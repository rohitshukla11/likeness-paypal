/**
 * Checks that @paypal/agent-toolkit loads with the pinned `ai` 4.x and lists its tools in sandbox mode.
 * No LLM calls. Building the toolkit makes no request; credentials come from .env.local when present.
 *
 *   pnpm check:agent-toolkit
 */
import { ALL_TOOLS_ENABLED, PayPalAgentToolkit } from "@paypal/agent-toolkit/ai-sdk";
import { readFileSync } from "node:fs";

// Versions as installed (the toolkit doesn't export its package.json).
const version = (pkg: string) => (JSON.parse(readFileSync(`node_modules/${pkg}/package.json`, "utf8")) as { version: string }).version;

const toolkit = new PayPalAgentToolkit({
  clientId: process.env.PAYPAL_CLIENT_ID ?? "not-set",
  clientSecret: process.env.PAYPAL_CLIENT_SECRET ?? "not-set",
  configuration: { actions: ALL_TOOLS_ENABLED, context: { sandbox: true } },
});
const tools = Object.keys(toolkit.getTools()).sort();
console.log(`@paypal/agent-toolkit ${version("@paypal/agent-toolkit")} with ai ${version("ai")}: ${tools.length} tools, sandbox`);
console.log(tools.map((t) => `  ${t}`).join("\n"));
console.log(`base URL: ${toolkit.client.getBaseUrl()}`);
