/**
 * Small app primitives, in the Likeness design system (app/globals.css, components/ds): labelled fields, inputs,
 * status pills for licence states, and dates. Server-safe (no hooks), so the server pages and forms use them.
 */
import type { ReactNode } from "react";
import type { LicenceState } from "@/lib/licences";
import { StatusPill, type PillKind } from "./ds";

export const STATUS_LABEL: Record<LicenceState, string> = {
  active: "Licensed",
  pending: "Waiting for the creator",
  declined: "Declined",
  revoked: "Revoked",
  expired: "Expired",
  exhausted: "Used up",
};

const STATUS_KIND: Record<LicenceState, PillKind> = { active: "licensed", pending: "waiting", declined: "revoked", revoked: "revoked", expired: "expired", exhausted: "expired" };

export function StatusBadge({ status }: { status: LicenceState }) {
  return <StatusPill kind={STATUS_KIND[status]}>{STATUS_LABEL[status]}</StatusPill>;
}

/** A labelled control. `group` is for a set of buttons (chips): a fieldset, so the label never clicks the first one. */
export function Field({ label, children, hint, group }: { label: string; children: ReactNode; hint?: string; group?: boolean }) {
  if (group)
    return (
      <fieldset className="m-0 min-w-0 space-y-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-[14px] font-medium text-grey">{label}</legend>
        {children}
        {hint && <span className="block text-[13px] text-grey">{hint}</span>}
      </fieldset>
    );
  return (
    <label className="block min-w-0 space-y-1.5">
      <span className="text-[14px] font-medium text-grey">{label}</span>
      {children}
      {hint && <span className="block text-[13px] text-grey">{hint}</span>}
    </label>
  );
}

export const inputClass = "w-full min-w-0 min-h-11 rounded-[14px] border border-field bg-white px-4 py-2 text-[15px] text-ink placeholder:text-grey";

/** A checkbox or radio as a 44 px chip: the input stays a real, focusable control inside its label. */
export const chipClass =
  "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-field bg-white px-4 text-[14px] font-medium text-ink has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-white";

/** Dates come from Postgres as Date objects (UTC). */
export const fmtDay = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "–");
