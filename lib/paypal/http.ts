/**
 * PayPal REST core: config from env, the OAuth token (cached), and one request helper that puts a
 * PayPal-Request-Id on every POST. Plain fetch, no SDK. Server-side only: the app imports it through
 * lib/paypal/index.ts (which is `server-only`); scripts import these modules directly.
 *
 * Nothing here logs or returns a token or the client secret. Errors carry PayPal's name, message and
 * debug_id, never request headers.
 */
import { randomUUID } from "node:crypto";

export type PayPalEnv = "sandbox" | "live";

const BASE_URL: Record<PayPalEnv, string> = {
  sandbox: "https://api-m.sandbox.paypal.com",
  live: "https://api-m.paypal.com",
};

export interface PayPalConfig {
  env: PayPalEnv;
  baseUrl: string;
  clientId: string;
  clientSecret: string;
}

/** Reads PAYPAL_ENV (default sandbox), PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET. Throws naming what's missing. */
export function paypalConfig(env: NodeJS.ProcessEnv = process.env): PayPalConfig {
  const name = (env.PAYPAL_ENV ?? "sandbox") as PayPalEnv;
  if (name !== "sandbox" && name !== "live") throw new Error(`PAYPAL_ENV must be "sandbox" or "live", not "${name}"`);
  const missing = ["PAYPAL_CLIENT_ID", "PAYPAL_CLIENT_SECRET"].filter((k) => !env[k]);
  if (missing.length) throw new Error(`missing in the environment: ${missing.join(", ")}`);
  return { env: name, baseUrl: BASE_URL[name], clientId: env.PAYPAL_CLIENT_ID!, clientSecret: env.PAYPAL_CLIENT_SECRET! };
}

/** A failed PayPal call: HTTP status, PayPal's error name and message, its debug_id, and the issue codes. */
export class PayPalError extends Error {
  constructor(
    readonly status: number,
    readonly name: string,
    message: string,
    readonly debugId: string | undefined,
    readonly issues: string[],
  ) {
    super(message);
  }
  override toString() {
    return `PayPal ${this.status} ${this.name}: ${this.message}${this.issues.length ? ` [${this.issues.join(", ")}]` : ""}${this.debugId ? ` (debug_id ${this.debugId})` : ""}`;
  }
}

let cached: { key: string; token: string; expiresAt: number } | undefined;
let inflight: Promise<string> | undefined;

/** An OAuth access token (client credentials), reused until 60 s before it expires. */
export async function accessToken(config: PayPalConfig = paypalConfig()): Promise<string> {
  const key = `${config.env}:${config.clientId}`;
  if (cached && cached.key === key && Date.now() < cached.expiresAt) return cached.token;
  inflight ??= (async () => {
    const res = await fetch(`${config.baseUrl}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
    const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string; error_description?: string };
    if (!res.ok || !body.access_token) {
      throw new PayPalError(res.status, body.error ?? "OAUTH_ERROR", body.error_description ?? "token request failed", res.headers.get("paypal-debug-id") ?? undefined, []);
    }
    cached = { key, token: body.access_token, expiresAt: Date.now() + ((body.expires_in ?? 0) - 60) * 1000 };
    return body.access_token;
  })().finally(() => {
    inflight = undefined;
  });
  return inflight;
}

export interface RequestOptions {
  /** Idempotency key for POSTs. A retry with the same key returns the original result. Default: a new UUID. */
  requestId?: string;
  /** Ask PayPal for the full resource in the response (Prefer: return=representation). Default true. */
  representation?: boolean;
  config?: PayPalConfig;
}

/** One PayPal REST call. Every POST carries PayPal-Request-Id. Returns the parsed JSON body (or undefined on 204). */
export async function paypalRequest<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const config = opts.config ?? paypalConfig();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${await accessToken(config)}`,
    "Content-Type": "application/json",
  };
  if (method === "POST") headers["PayPal-Request-Id"] = opts.requestId ?? randomUUID();
  if (opts.representation !== false) headers.Prefer = "return=representation";
  const res = await fetch(`${config.baseUrl}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const json = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!res.ok) {
    const details = Array.isArray(json.details) ? (json.details as { issue?: string }[]).map((d) => d.issue ?? "").filter(Boolean) : [];
    throw new PayPalError(res.status, String(json.name ?? "PAYPAL_ERROR"), String(json.message ?? res.statusText), (json.debug_id as string | undefined) ?? res.headers.get("paypal-debug-id") ?? undefined, details);
  }
  return json as T;
}

/** A link from a HATEOAS links array, by rel (e.g. "approve"). */
export function linkOf(links: { rel: string; href: string }[] | undefined, rel: string): string | undefined {
  return links?.find((l) => l.rel === rel)?.href;
}

/** Money as PayPal wants it: a currency code and a decimal string with two places. */
export function money(value: number | string, currency = "USD") {
  const v = typeof value === "number" ? value.toFixed(2) : value;
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new Error(`not an amount: ${v}`);
  return { currency_code: currency, value: v };
}
