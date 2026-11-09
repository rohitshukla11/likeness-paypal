"use client";
/**
 * "Save PayPal wallet" with the PayPal JS SDK v6, VAULT_WITHOUT_PAYMENT: the server creates the setup token, the SDK
 * runs the approval (popup or modal, presentationMode "auto"), and onApprove hands the vaultSetupToken to the server,
 * which creates the payment token. If the SDK can't load or PayPal isn't eligible, the approve-link fallback (a full
 * redirect to PayPal and back to /paypal/vault/return) still works.
 */
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type SaveSession = { start: (opts: { presentationMode: string }, setup: Promise<{ setupToken: string }>) => Promise<void> };
type SdkInstance = {
  findEligibleMethods: (o: { currencyCode: string; paymentFlow: string }) => Promise<{ isEligible: (m: string) => boolean }>;
  createPayPalSavePaymentSession: (o: {
    onApprove: (d: { vaultSetupToken?: string }) => Promise<void>;
    onCancel?: () => void;
    onError?: (e: unknown) => void;
  }) => SaveSession;
};
declare global {
  interface Window {
    paypal?: { createInstance: (o: { clientToken: string; components: string[]; pageType: string }) => Promise<SdkInstance> };
  }
}

const SDK = { sandbox: "https://www.sandbox.paypal.com/web-sdk/v6/core", live: "https://www.paypal.com/web-sdk/v6/core" };

function loadSdk(env: "sandbox" | "live") {
  return new Promise<void>((resolve, reject) => {
    if (window.paypal) return resolve();
    const s = document.createElement("script");
    s.src = SDK[env];
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("PayPal SDK failed to load"));
    document.head.appendChild(s);
  });
}

async function postJson<T>(url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string; debugId?: string };
  if (!res.ok) throw new Error(`${json.error ?? `HTTP ${res.status}`}${json.debugId ? ` (debug_id ${json.debugId})` : ""}`);
  return json;
}

export function WalletButton() {
  const router = useRouter();
  const session = useRef<SaveSession | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "fallback" | "busy" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let gone = false;
    (async () => {
      try {
        const res = await fetch("/api/paypal/client-token", { cache: "no-store" });
        const { accessToken, env } = (await res.json()) as { accessToken?: string; env?: "sandbox" | "live" };
        if (!accessToken) throw new Error("no client token");
        await loadSdk(env ?? "sandbox");
        const sdk = await window.paypal!.createInstance({ clientToken: accessToken, components: ["paypal-payments"], pageType: "checkout" });
        const methods = await sdk.findEligibleMethods({ currencyCode: "USD", paymentFlow: "VAULT_WITHOUT_PAYMENT" });
        if (!methods.isEligible("paypal")) throw new Error("PayPal save isn't eligible in this browser session");
        session.current = sdk.createPayPalSavePaymentSession({
          onApprove: async (data) => {
            try {
              await postJson("/api/paypal/payment-token", { vaultSetupToken: data.vaultSetupToken });
              router.push("/paypal/vault/return?saved=1");
            } catch (e) {
              setState("error");
              setMessage((e as Error).message);
            }
          },
          onCancel: () => {
            setState("ready");
            setMessage("Cancelled at PayPal. Nothing was saved.");
          },
          onError: (e) => {
            setState("error");
            setMessage(e instanceof Error ? e.message : "PayPal reported an error");
          },
        });
        if (!gone) setState("ready");
      } catch (e) {
        if (!gone) {
          setState("fallback");
          setMessage(`${(e as Error).message}. Use the PayPal page instead.`);
        }
      }
    })();
    return () => {
      gone = true;
    };
  }, [router]);

  function start() {
    if (!session.current) return;
    setState("busy");
    setMessage(null);
    // Don't await the setup token before start(): the click's user activation must reach the popup.
    const setup = postJson<{ id: string }>("/api/paypal/setup-token").then((t) => ({ setupToken: t.id }));
    session.current.start({ presentationMode: "auto" }, setup).catch((e: unknown) => {
      setState("error");
      setMessage(e instanceof Error ? e.message : "Could not start PayPal");
    });
  }

  async function redirectFallback() {
    setState("busy");
    try {
      const t = await postJson<{ approveUrl?: string }>("/api/paypal/setup-token");
      if (!t.approveUrl) throw new Error("PayPal returned no approve link");
      window.location.assign(t.approveUrl);
    } catch (e) {
      setState("error");
      setMessage((e as Error).message);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={start}
          disabled={state !== "ready" && state !== "error"}
          className="inline-flex items-center gap-2 rounded-xl bg-[#ffc439] px-4 py-2.5 text-sm font-bold text-[#111] shadow-sm hover:brightness-95 disabled:opacity-50 cursor-pointer"
        >
          {state === "loading" ? "Loading PayPal…" : state === "busy" ? "Waiting for PayPal…" : "Save PayPal wallet"}
        </button>
        <button onClick={redirectFallback} disabled={state === "busy"} className="text-sm font-medium text-brand underline disabled:opacity-50 cursor-pointer">
          or approve on the PayPal page
        </button>
      </div>
      {message && <p className={`text-xs ${state === "error" ? "text-bad" : "text-muted"}`}>{message}</p>}
      <p className="text-xs text-muted">Sandbox: log in with a sandbox personal (buyer) account. Nothing is charged now.</p>
    </div>
  );
}
