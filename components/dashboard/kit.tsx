/**
 * Dashboard building blocks, adapted from likeness-eth (FaceVisa)'s CreatorHome and BrandAgentConsole: white
 * surfaces on the off-white panel, a profile banner, a row of stat tiles (one dark accent), lime and dark panels,
 * small rule and fact tiles, and pill-outline actions. Server-safe (no hooks).
 */
import type { ReactNode } from "react";
import { SYNTHETIC_LABEL } from "@/lib/personas";

export const SURFACE = "rounded-[22px] bg-white text-ink ring-1 ring-black/[0.04]";
export const MUTED = "text-grey";
export const CHIP = "inline-flex max-w-full items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold";
export const OUTLINE =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 px-4 text-[14px] font-semibold text-ink no-underline transition-colors hover:border-ink cursor-pointer";
export const OUTLINE_BAD =
  "inline-flex min-h-11 items-center justify-center rounded-full border border-bad/40 px-4 text-[14px] font-semibold text-bad transition-colors hover:bg-bad-bg cursor-pointer";

/** The profile banner: a portrait or monogram tile, the name, a line about it, chips, and actions on the right. */
export function Banner({ visual, title, sub, chips, actions, label }: { visual: ReactNode; title: ReactNode; sub?: ReactNode; chips?: ReactNode; actions?: ReactNode; label: string }) {
  return (
    <section className={`${SURFACE} flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-6`} aria-label={label}>
      <div className="self-center sm:self-auto">{visual}</div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <h1 className="m-0 font-display text-[clamp(26px,4vw,36px)] font-extrabold leading-[1.05] tracking-[-0.01em]">{title}</h1>
        {sub && <p className={`m-0 max-w-2xl text-[14px] ${MUTED}`}>{sub}</p>}
        {chips && <div className="flex flex-wrap gap-2">{chips}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 sm:justify-end">{actions}</div>}
    </section>
  );
}

/** A portrait in the banner's rounded tile with a lime ring. */
export function FaceTile({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="relative h-28 w-28 overflow-hidden rounded-[26px] bg-paper ring-4 ring-lime">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={112} height={112} className="h-full w-full object-cover" />
    </div>
  );
}

/** A brand's monogram in the banner's tile. */
export function Monogram({ name }: { name: string }) {
  return (
    <span aria-hidden="true" className="flex h-28 w-28 shrink-0 items-center justify-center rounded-[26px] bg-ink font-display text-[48px] font-extrabold text-lime">
      {(name.trim()[0] ?? "?").toUpperCase()}
    </span>
  );
}

/** The stats row: 2 columns on phones, 5 from md up. */
export function StatsRow({ children, label = "Your numbers" }: { children: ReactNode; label?: string }) {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label={label}>
      {children}
    </section>
  );
}

export function Stat({ label, value, note, accent = false }: { label: string; value: ReactNode; note?: ReactNode; accent?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col gap-1 rounded-[20px] px-4 py-4 ${accent ? "col-span-2 bg-ink text-white md:col-span-1" : SURFACE}`}>
      <span className={`text-[12px] font-semibold uppercase tracking-[0.06em] ${accent ? "text-grey-dark" : MUTED}`}>{label}</span>
      <span className="tnum font-display text-[30px] font-extrabold leading-none">{value}</span>
      {note && <span className={`text-[12px] ${accent ? "text-grey-dark" : MUTED}`}>{note}</span>}
    </div>
  );
}

/** A section with a heading: plain (on the panel), lime (the one thing to do now), or dark. */
export function Panel({ title, action, tone = "plain", children, label, id }: { title: ReactNode; action?: ReactNode; tone?: "plain" | "lime" | "ink" | "surface"; children: ReactNode; label?: string; id?: string }) {
  const box = tone === "lime" ? "rounded-[22px] bg-lime p-5 text-ink sm:p-6" : tone === "ink" ? "on-dark rounded-[22px] bg-ink p-5 text-white sm:p-6" : tone === "surface" ? `${SURFACE} p-5 sm:p-6` : "";
  return (
    <section id={id} className={`flex min-w-0 scroll-mt-4 flex-col gap-3 ${box}`} aria-label={label ?? (typeof title === "string" ? title : undefined)}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className={`m-0 text-[20px] font-bold ${tone === "plain" ? "text-ink" : ""}`}>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[16px] bg-paper px-3 py-3">
      <span className={`text-[12px] ${MUTED}`}>{label}</span>
      <span className="tnum text-[18px] font-bold">{value}</span>
    </div>
  );
}

export function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className={`text-[11px] uppercase tracking-[0.06em] ${MUTED}`}>{label}</dt>
      <dd className="m-0 truncate font-semibold">{value}</dd>
    </div>
  );
}

/** A plain-words empty state inside a section. */
export function Empty({ children }: { children: ReactNode }) {
  return <p className={`m-0 rounded-[16px] bg-white/60 p-4 text-[14px] ${MUTED}`}>{children}</p>;
}

/** The label a synthetic creator (fictional person, AI-generated face) carries wherever it appears. */
export function SyntheticBadge({ className = "" }: { className?: string }) {
  return <span className={`${CHIP} self-start whitespace-normal bg-sky text-ink ${className}`}>{SYNTHETIC_LABEL}</span>;
}
