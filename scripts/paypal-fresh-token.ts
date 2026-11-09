/**
 * Forces a fresh PayPal sandbox access token: terminates the token PayPal is currently handing out for this app
 * (PayPal keeps returning the same token, with the scopes it had when issued, until it expires), fetches a new one,
 * and prints only expires_in and the scopes, flagging missing Vault or Payouts scopes. Run it after enabling an app
 * feature in the developer dashboard. Never prints a token or a secret. Sandbox only.
 *
 *   pnpm paypal:fresh-token
 */
import { paypalConfig, type PayPalConfig } from "../lib/paypal/http";

const REQUIRED = [
  { label: "Vault payment tokens", scope: "https://uri.paypal.com/services/vault/payment-tokens/readwrite" },
  { label: "Payouts", scope: "https://uri.paypal.com/payments/payouts" },
];

type TokenBody = { access_token?: string; expires_in?: number; scope?: string; app_id?: string; error?: string; error_description?: string };

function form(config: PayPalConfig) {
  return {
    Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
    "Content-Type": "application/x-www-form-urlencoded",
  };
}

async function token(config: PayPalConfig): Promise<TokenBody & { access_token: string }> {
  const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, { method: "POST", headers: form(config), body: "grant_type=client_credentials" });
  const body = (await res.json().catch(() => ({}))) as TokenBody;
  if (!res.ok || !body.access_token) throw new Error(`token request failed: HTTP ${res.status} ${body.error ?? ""} ${body.error_description ?? ""} (debug_id ${res.headers.get("paypal-debug-id") ?? "-"})`);
  return body as TokenBody & { access_token: string };
}

async function main() {
  const config = paypalConfig();
  if (config.env !== "sandbox") throw new Error("runs only with PAYPAL_ENV=sandbox");
  console.log(`app: client id …${config.clientId.slice(-4)} (sandbox)`);

  const current = await token(config);
  console.log(`current token: expires_in ${current.expires_in}s`);
  const res = await fetch(`${config.baseUrl}/v1/oauth2/token/terminate`, {
    method: "POST",
    headers: form(config),
    body: new URLSearchParams({ token: current.access_token, token_type_hint: "ACCESS_TOKEN" }),
  });
  if (!res.ok) throw new Error(`terminate failed: HTTP ${res.status} (debug_id ${res.headers.get("paypal-debug-id") ?? "-"})`);
  console.log(`terminate: HTTP ${res.status} (debug_id ${res.headers.get("paypal-debug-id") ?? "-"})`);

  const fresh = await token(config);
  const scopes = (fresh.scope ?? "").split(" ").filter(Boolean).sort();
  console.log(`new token: expires_in ${fresh.expires_in}s, ${fresh.access_token === current.access_token ? "SAME token as before" : "a different token"}, app_id ${fresh.app_id ?? "-"}`);
  console.log(`${scopes.length} scopes:`);
  for (const s of scopes) console.log(`  ${s}`);

  let missing = 0;
  console.log("");
  for (const r of REQUIRED) {
    const ok = scopes.includes(r.scope);
    if (!ok) missing++;
    console.log(`${ok ? "ok     " : "MISSING"} ${r.label} (${r.scope})`);
  }
  if (missing) {
    console.log("\nEnable the feature for this app in the developer dashboard (Sandbox → Apps & Credentials → Features), wait a few minutes, and run this again.");
    process.exitCode = 2;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
