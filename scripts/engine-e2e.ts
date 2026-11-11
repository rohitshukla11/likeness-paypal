/**
 * The render engine against the PayPal sandbox and the real database, with the StubProvider (no AI calls, no cost):
 * the accept, reject, deadline and revoke paths of lib/e2e.ts (the same code POST /api/e2e runs on a deployed server).
 * Wallet: E2E_VAULT_ID, else DEMO_VAULT_ID, else the first payment token of PayPal customer E2E_CUSTOMER_ID.
 * Prints truncated ids and statuses only (debug_id on PayPal errors). Sandbox only.
 *
 *   pnpm e2e:engine
 */
import { closeDb } from "../lib/db";
import { runEngineE2E } from "../lib/e2e";
import { listPaymentTokens } from "../lib/paypal/vault";

const short = (id: string | null | undefined) => (!id ? "-" : id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`);

async function vaultId(): Promise<string> {
  const id = process.env.E2E_VAULT_ID || process.env.DEMO_VAULT_ID;
  if (id) return id;
  if (process.env.E2E_CUSTOMER_ID) {
    const t = (await listPaymentTokens(process.env.E2E_CUSTOMER_ID)).payment_tokens?.[0];
    if (t) return t.id;
  }
  throw new Error("set DEMO_VAULT_ID, E2E_VAULT_ID or E2E_CUSTOMER_ID (run pnpm smoke:paypal to save a wallet)");
}

async function main() {
  const res = await runEngineE2E(await vaultId());
  console.log(`run ${res.run} (sandbox, StubProvider), workspace ${short(res.workspace)}, wallet ${short(res.vault)}`);
  for (const p of res.paths) {
    const ids = Object.entries(p.ids)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${short(v)}`)
      .join(", ");
    console.log(`${p.ok ? "ok  " : "FAIL"} ${p.path.padEnd(9)} ${p.status.padEnd(9)} ${p.detail}\n     ${ids}`);
  }
  console.log(res.ok ? "engine e2e: all paths passed" : "engine e2e: a path FAILED");
  if (!res.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(`engine e2e stopped: ${e instanceof Error ? e.toString() : String(e)}`);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
