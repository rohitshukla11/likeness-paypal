/** Pure summaries of PayPal Agent Toolkit results for the brand agent (no I/O, unit-tested). */

export const REPORTING_LAG_NOTE = "PayPal's reporting can take a few hours to catch up.";

type Money = { value?: string; currency_code?: string };
type Payment = { id?: string; status?: string; amount?: Money };
type OrderLike = { id?: string; status?: string; purchase_units?: { amount?: Money; payments?: { authorizations?: Payment[]; captures?: Payment[]; refunds?: Payment[] } }[] };

const money = (m?: Money) => (m?.value ? `$${Number(m.value).toFixed(2)}${m.currency_code && m.currency_code !== "USD" ? ` ${m.currency_code}` : ""}` : null);

/** get_order's answer, as the facts the agent should say: status, the authorization and capture amounts, ids. */
export function summarizeOrder(raw: unknown) {
  const o = (typeof raw === "string" ? JSON.parse(raw) : raw) as OrderLike;
  const pu = o.purchase_units?.[0];
  const auth = pu?.payments?.authorizations?.[0];
  const cap = pu?.payments?.captures?.[0];
  const ref = pu?.payments?.refunds?.[0];
  return {
    orderId: o.id ?? null,
    orderStatus: o.status ?? null,
    orderAmount: money(pu?.amount),
    authorization: auth ? { id: auth.id ?? null, status: auth.status ?? null, amount: money(auth.amount) } : null,
    capture: cap ? { id: cap.id ?? null, status: cap.status ?? null, amount: money(cap.amount) } : null,
    refund: ref ? { id: ref.id ?? null, status: ref.status ?? null, amount: money(ref.amount) } : null,
  };
}

/** The note for list_transactions: only when PayPal doesn't show any of the brand's transactions yet. */
export const reportingNote = (foundInPayPal: number) => (foundInPayPal === 0 ? REPORTING_LAG_NOTE : null);
