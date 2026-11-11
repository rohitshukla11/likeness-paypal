/**
 * The brand's view of the creators it can license, and the filter over them. One shape and one filter for both the
 * Creators page (/creators, "Find creators" on the Brand page) and the brand agent's list_creators tool, so "find me a fitness creator under $3"
 * gives the agent exactly what the page would show. Pure (no I/O): lib/queries.ts builds the cards.
 */
import { allowsVideo, nicheOf, personaOf, portraitUrl, SYNTHETIC_LABEL } from "./personas";

export type LicenceStatus = "licensed" | "requested" | "not_yet";

export interface CreatorCard {
  id: string;
  name: string;
  photo: string;
  niche: string;
  /** Fictional person, AI-generated face: shown with SYNTHETIC_LABEL wherever the creator appears. */
  synthetic: boolean;
  priceImageCents: number;
  /** null: images only. */
  priceVideoCents: number | null;
  uses: string[];
  maxRenders: number;
  maxDays: number;
  accepting: boolean;
  /** This brand's licence with the creator: an active one, a pending request, or neither. */
  licence: LicenceStatus;
}

export interface CreatorFilter {
  q?: string;
  niche?: string;
  /** At most this per image, in cents. */
  maxPriceCents?: number;
  use?: string;
  /** "video": allows video; "image_only": images only. */
  format?: "video" | "image_only";
  /** "not_yet" includes a request still waiting for the creator. */
  licence?: "licensed" | "not_yet";
}

type CreatorRow = { id: string; name: string; photoRef: string | null; pricePerRenderCents: number; videoMultiplier: number; allowedUses: string[]; maxRendersPerLicence: number; maxDays: number; acceptingLicences: boolean };

export function toCard(c: CreatorRow, licences: { creatorId: string; state: string }[]): CreatorCard {
  const mine = licences.filter((l) => l.creatorId === c.id);
  return {
    id: c.id,
    name: c.name,
    photo: portraitUrl(c.photoRef) ?? "/demo/rohit.svg",
    niche: nicheOf(c.photoRef),
    synthetic: personaOf(c.photoRef)?.synthetic ?? false,
    priceImageCents: c.pricePerRenderCents,
    priceVideoCents: allowsVideo(c.videoMultiplier) ? c.pricePerRenderCents * c.videoMultiplier : null,
    uses: [...c.allowedUses],
    maxRenders: c.maxRendersPerLicence,
    maxDays: c.maxDays,
    accepting: c.acceptingLicences,
    licence: mine.some((l) => l.state === "active") ? "licensed" : mine.some((l) => l.state === "pending") ? "requested" : "not_yet",
  };
}

const norm = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Does the niche match? Loose: "fitness" matches "Fitness", "tech" matches "Tech & gadgets". */
export const nicheMatches = (niche: string, wanted: string) => {
  const a = norm(niche);
  const b = norm(wanted);
  return !b || a === b || a.split(" ").some((w) => w && b.split(" ").includes(w)) || a.includes(b);
};

export function filterCreators(cards: CreatorCard[], f: CreatorFilter): CreatorCard[] {
  const q = norm(f.q ?? "");
  return cards.filter(
    (c) =>
      (!q || norm(c.name).includes(q)) &&
      (!f.niche || nicheMatches(c.niche, f.niche)) &&
      (f.maxPriceCents === undefined || c.priceImageCents <= f.maxPriceCents) &&
      (!f.use || c.uses.includes(f.use)) &&
      (!f.format || (f.format === "video" ? c.priceVideoCents !== null : c.priceVideoCents === null)) &&
      (!f.licence || (f.licence === "licensed" ? c.licence === "licensed" : c.licence !== "licensed")),
  );
}

/** One line of terms, as cards and the agent say it. */
export function termsSummary(c: CreatorCard): string {
  const usd = (n: number) => `$${(n / 100).toFixed(2)}`;
  return `${usd(c.priceImageCents)} per image, ${c.priceVideoCents === null ? "images only" : `${usd(c.priceVideoCents)} per video`}; ${c.uses.join(", ")}; up to ${c.maxRenders} renders over ${c.maxDays} days`;
}

export { SYNTHETIC_LABEL };
