"use client";

/**
 * The Creators page (/creators, opened with "Find creators" on the Brand page), adapted from likeness-eth
 * (FaceVisa)'s Creators page: a search box with a Search button, then a white header surface with
 * count chips, then a grid of creator cards (portrait, name, labels, Image / Video / Up to facts, terms, an action).
 * Added here: filters for niche, price per image, allowed use, video or images only and licence status, plus a name
 * search. The cards and the filter are lib/creator-browse.ts, the same ones the brand agent's list_creators uses.
 * FaceVisa's World ID, Arkiv and sign-in parts are dropped; synthetic creators carry their label on every card.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { btnClass, StatusPill } from "@/components/ds";
import { IconSearch } from "@/components/ds/icons";
import { filterCreators, termsSummary, type CreatorCard, type CreatorFilter } from "@/lib/creator-browse";
import { CHIP, MUTED, SURFACE, SyntheticBadge } from "./kit";

const usd = (c: number) => `$${(c / 100).toFixed(2)}`;
const PRICES = [200, 300, 500] as const;
const USES = ["advertising", "social", "editorial", "internal"] as const;
const selectClass = "min-h-11 w-full min-w-0 rounded-[14px] border border-field bg-white px-3 text-[14px] text-ink";

/** requestBase: where "Request a licence" goes, with the creator's id appended (e.g. "/brand?creator="). */
export function CreatorBrowse({ cards, requestBase, studioHref = "/brand/studio" }: { cards: CreatorCard[]; requestBase: string; studioHref?: string }) {
  const [f, setF] = useState<CreatorFilter>({});
  // The name search applies on Search (or Enter), like a search box; the dropdowns apply at once.
  const [draft, setDraft] = useState("");
  const set = (patch: Partial<CreatorFilter>) => setF((x) => ({ ...x, ...patch }));
  const shown = useMemo(() => filterCreators(cards, f), [cards, f]);
  const niches = useMemo(() => [...new Set(cards.map((c) => c.niche))].sort(), [cards]);
  const filtered = Object.values(f).some((v) => v !== undefined && v !== "");
  const licensed = cards.filter((c) => c.licence === "licensed").length;

  return (
    <section className="flex flex-col gap-3" aria-label="Creators">
      <div className={`${SURFACE} flex flex-col gap-4 p-5 sm:p-6`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-grey">License a face</span>
            <h2 className="m-0 font-display text-[clamp(22px,3.4vw,30px)] font-extrabold leading-[1.05] tracking-[-0.01em]">Creators</h2>
            <p className="m-0 max-w-[640px] text-[14px] text-grey">
              People who license their face for AI ads on their own terms: a price per image and video, the uses they allow, and how many renders over how many days. Request a licence; ads start once they approve.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span className={`${CHIP} bg-lime text-ink`}>{cards.length} creators</span>
            <span className={`${CHIP} bg-violet-soft text-wait`}>{licensed} licensed</span>
          </div>
        </div>

        <form
          role="search"
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: draft.trim() || undefined });
          }}
          aria-label="Search creators"
        >
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-[12px] font-semibold text-grey">Search creators</span>
            <input
              type="search"
              value={draft}
              onChange={(e) => {
                setDraft(e.target.value);
                if (!e.target.value) set({ q: undefined });
              }}
              placeholder="Name, e.g. Maya"
              className={selectClass}
            />
          </label>
          <button type="submit" className={btnClass("lime", "min-h-11 cursor-pointer gap-2 self-stretch px-6 sm:self-end")}>
            <IconSearch size={18} />
            Search
          </button>
        </form>
        <form className="grid grid-cols-2 gap-2 md:grid-cols-5" onSubmit={(e) => e.preventDefault()} aria-label="Filter creators">
          <Select label="Niche" value={f.niche ?? ""} onChange={(v) => set({ niche: v || undefined })} options={[["", "Any niche"], ...niches.map((n) => [n, n] as [string, string])]} />
          <Select
            label="Price per image"
            value={f.maxPriceCents === undefined ? "" : String(f.maxPriceCents)}
            onChange={(v) => set({ maxPriceCents: v ? Number(v) : undefined })}
            options={[["", "Any price"], ...PRICES.map((p) => [String(p), `Up to ${usd(p)}`] as [string, string])]}
          />
          <Select label="Allowed use" value={f.use ?? ""} onChange={(v) => set({ use: v || undefined })} options={[["", "Any use"], ...USES.map((u) => [u, u[0].toUpperCase() + u.slice(1)] as [string, string])]} />
          <Select
            label="Format"
            value={f.format ?? ""}
            onChange={(v) => set({ format: (v || undefined) as CreatorFilter["format"] })}
            options={[
              ["", "Image or video"],
              ["video", "Allows video"],
              ["image_only", "Images only"],
            ]}
          />
          <Select
            label="Licence"
            value={f.licence ?? ""}
            onChange={(v) => set({ licence: (v || undefined) as CreatorFilter["licence"] })}
            options={[
              ["", "Any"],
              ["licensed", "Licensed"],
              ["not_yet", "Not yet"],
            ]}
          />
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-[13px]" aria-live="polite">
          <span className={MUTED}>
            Showing {shown.length} of {cards.length}
          </span>
          {filtered && (
            <button
              type="button"
              onClick={() => {
                setF({});
                setDraft("");
              }}
              className="min-h-11 cursor-pointer rounded-full px-3 text-[13px] font-semibold text-ink underline">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {shown.length ? (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => (
            <li key={c.id} className={`${SURFACE} flex min-w-0 flex-col overflow-hidden`}>
              <div className="relative aspect-[4/3] w-full bg-paper">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={c.photo} alt={`${c.name}${c.synthetic ? " (synthetic creator, AI-generated face)" : ""}`} className="absolute inset-0 h-full w-full object-cover object-[50%_45%]" />
                <span className={`absolute left-3 top-3 ${CHIP} bg-white/90 text-ink`}>{c.niche}</span>
              </div>
              <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <b className="text-[17px] leading-snug">{c.name}</b>
                    {c.licence === "licensed" ? <StatusPill kind="licensed">Licensed</StatusPill> : c.licence === "requested" ? <StatusPill kind="waiting">Requested</StatusPill> : <StatusPill kind="neutral">Not yet</StatusPill>}
                  </div>
                  {c.synthetic && <SyntheticBadge />}
                </div>
                <dl className="m-0 grid grid-cols-3 gap-2 text-[13px]">
                  <Fact label="Image" value={usd(c.priceImageCents)} />
                  <Fact label="Video" value={c.priceVideoCents === null ? "No" : usd(c.priceVideoCents)} />
                  <Fact label="Up to" value={`${c.maxDays} days`} />
                </dl>
                <span className="text-[13px] text-grey">
                  {termsSummary(c)}
                  {c.accepting ? "" : " · not accepting requests"}
                </span>
                <div className="mt-auto">
                  {c.licence === "licensed" ? (
                    <Link href={studioHref} className={btnClass("ink", "min-h-11 self-start")}>
                      Make an ad
                    </Link>
                  ) : c.licence === "requested" ? (
                    <span className={`text-[13px] ${MUTED}`}>Waiting for {c.name} to approve</span>
                  ) : c.accepting ? (
                    <Link href={`${requestBase}${encodeURIComponent(c.id)}#request`} className={btnClass("lime", "min-h-11 self-start")} scroll={false}>
                      Request a licence
                    </Link>
                  ) : null}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className={`${SURFACE} flex flex-col items-start gap-2 p-5`}>
          <b className="text-[15px]">No creator matches these filters</b>
          <button
            type="button"
            onClick={() => {
              setF({});
              setDraft("");
            }}
            className={btnClass("lime", "min-h-11")}
          >
            Clear filters
          </button>
        </section>
      )}
    </section>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-[12px] font-semibold text-grey">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={selectClass}>
        {options.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-paper px-3 py-2">
      <dt className="text-[12px] text-grey">{label}</dt>
      <dd className="tnum m-0 truncate text-[15px] font-bold">{value}</dd>
    </div>
  );
}
