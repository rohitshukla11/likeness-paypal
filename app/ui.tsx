/** Small shared UI pieces (server-safe: no hooks). */
import type { ReactNode } from "react";

export const usd = (cents: number) => `$${(cents / 100).toFixed(2)}`;
export const short = (id: string | null | undefined) => (!id ? "–" : id.length <= 14 ? id : `${id.slice(0, 7)}…${id.slice(-4)}`);
export const day = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "–");
export const when = (d: Date | null | undefined) => (d ? `${d.toISOString().slice(0, 16).replace("T", " ")} UTC` : "–");

export const btn = {
  primary: "inline-flex items-center justify-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50 cursor-pointer",
  dark: "inline-flex items-center justify-center gap-2 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-black disabled:opacity-50 cursor-pointer",
  ghost: "inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50 cursor-pointer",
  good: "inline-flex items-center justify-center gap-2 rounded-xl bg-good px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer",
  bad: "inline-flex items-center justify-center gap-2 rounded-xl bg-bad px-3.5 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50 cursor-pointer",
  small: "inline-flex items-center justify-center rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-semibold hover:bg-paper cursor-pointer",
};

export const input = "w-full min-w-0 rounded-xl border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-white p-4 shadow-[0_1px_2px_rgba(15,18,34,0.04)] sm:p-5 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          {title && <h2 className="text-base font-semibold">{title}</h2>}
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

const TONES = {
  good: "bg-good-soft text-good",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  brand: "bg-brand-soft text-brand",
  muted: "bg-paper text-muted",
} as const;

export function Badge({ tone = "muted", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONES[tone]}`}>{children}</span>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-xl bg-paper p-3">
      <span className="text-xs text-muted">{label}</span>
      <span className="tnum text-lg font-semibold">{value}</span>
      {sub && <span className="text-xs text-muted">{sub}</span>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-xl bg-paper p-4 text-sm text-muted">{children}</p>;
}

export function Mono({ children }: { children: ReactNode }) {
  return <span className="break-all font-mono text-xs">{children}</span>;
}

/** Status → badge tone for renders, licences and receipts. */
export function toneOf(status: string): keyof typeof TONES {
  if (["accepted", "active", "licensed", "Licensed", "saved"].includes(status)) return "good";
  if (["in_review", "needs_brand_approval", "pending", "settling", "refunding", "authorizing", "rendering", "capturing", "pending_wallet"].includes(status)) return "warn";
  if (["refused", "failed", "voided", "rejected", "revoked", "declined", "Revoked", "Refunded"].includes(status)) return "bad";
  return "muted";
}

export function PageTitle({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-sm text-muted">{sub}</p>}
      </div>
      {children}
    </div>
  );
}
