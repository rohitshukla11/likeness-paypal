/**
 * The seeded demo creators. Every new demo workspace gets all three (lib/demo.ts); existing workspaces keep what
 * they have. A seeded creator's row points at its illustrated portrait (/demo/<key>.svg), and that photo_ref is how
 * the rest of the app finds its persona here: the niche, the synthetic label and the sealed reference portrait used for
 * renders (asset:<key>-reference, uploaded by `pnpm seed:assets`). All three are paid out to the same sandbox account,
 * PAYPAL_SANDBOX_CREATOR_EMAIL: the synthetic creators have no PayPal account of their own (SHARED_PAYOUT_NOTE).
 *   - Rohit: a real person, the project's author, who consented to the demo (reference photo private/rohit.jpg).
 *   - Maya Lindqvist and Theo Marlowe: SYNTHETIC creators, fictional people with AI-generated faces, labelled as
 *     such wherever they appear. They exist so the brand's creator filter has something to filter.
 * Pure (no I/O): the UI, the agent's list_creators tool and the seed all read it.
 */

export const SYNTHETIC_LABEL = "Synthetic creator: fictional person, AI-generated face";
/** Shown next to a synthetic creator's payouts (ledger, spend table, receipt). */
export const SHARED_PAYOUT_NOTE = "Synthetic creator: sandbox payout account shared with the demo";

export interface Persona {
  key: "rohit" | "maya" | "theo";
  name: string;
  /** The public illustrated portrait; also the creator row's photo_ref. */
  photo: string;
  /** The sealed reference portrait in blobs (renders use it; never served to a browser). */
  asset: string;
  /** The reference portrait on disk before `pnpm seed:assets` uploads it: private/<key>.jpg (or .png). */
  file: string;
  niche: string;
  synthetic: boolean;
  terms: { pricePerRenderCents: number; videoMultiplier: number; allowedUses: string[]; maxRendersPerLicence: number; maxDays: number };
  /** A licence the demo brand already holds in every new workspace (null: the brand starts without one). */
  seededLicence: { allowedUses: string[]; renderCap: number; days: number; brief: string } | null;
  /** How the synthetic portrait is generated (scripts/synthetic-portraits.ts, gated). */
  portrait?: string;
}

const NOT_REAL =
  "This is a fictional person who does not exist. The face must be entirely invented and must not resemble any real person, celebrity, public figure or famous person. No text, logos or watermarks.";

export const PERSONAS: readonly Persona[] = [
  {
    key: "rohit",
    name: "Rohit",
    photo: "/demo/rohit.svg",
    asset: "asset:rohit-reference",
    file: "rohit",
    niche: "Lifestyle & food",
    synthetic: false,
    terms: { pricePerRenderCents: 200, videoMultiplier: 3, allowedUses: ["advertising", "social"], maxRendersPerLicence: 10, maxDays: 30 },
    seededLicence: { allowedUses: ["advertising", "social"], renderCap: 10, days: 30, brief: "Demo: café and lifestyle ads (pre-approved by the demo creator)" },
  },
  {
    key: "maya",
    name: "Maya Lindqvist",
    photo: "/demo/maya.svg",
    asset: "asset:maya-reference",
    file: "maya",
    niche: "Fitness",
    synthetic: true,
    terms: { pricePerRenderCents: 250, videoMultiplier: 2, allowedUses: ["advertising", "social", "editorial"], maxRendersPerLicence: 8, maxDays: 21 },
    seededLicence: null,
    portrait: `A photorealistic head-and-shoulders portrait photo of a fictional adult woman in her late twenties, a fitness coach: athletic, friendly smile, light brown hair in a ponytail, a plain teal sports top, soft daylight, neutral light background, looking at the camera, sharp focus on the face. ${NOT_REAL}`,
  },
  {
    key: "theo",
    name: "Theo Marlowe",
    photo: "/demo/theo.svg",
    asset: "asset:theo-reference",
    file: "theo",
    niche: "Tech & gadgets",
    synthetic: true,
    terms: { pricePerRenderCents: 350, videoMultiplier: 0, allowedUses: ["advertising", "internal"], maxRendersPerLicence: 5, maxDays: 14 },
    seededLicence: { allowedUses: ["advertising", "internal"], renderCap: 5, days: 14, brief: "Demo: gadget launch stills for product pages (pre-approved by the synthetic creator)" },
    portrait: `A photorealistic head-and-shoulders portrait photo of a fictional adult man in his mid thirties, a tech reviewer: short dark hair, a trimmed beard, round glasses, a plain charcoal t-shirt, soft studio light, neutral warm background, looking at the camera, sharp focus on the face. ${NOT_REAL}`,
  },
];

/** The seeded persona a creator row belongs to (by its photo_ref), or null (an onboarded creator). */
export function personaOf(photoRef: string | null | undefined): Persona | null {
  return PERSONAS.find((p) => p.photo === photoRef) ?? null;
}

/**
 * The portrait a signed-in visitor sees: a seeded persona's photo from its sealed asset (/media/persona/<key>: Rohit's
 * real photo, or a synthetic creator's AI-generated face), else the row's own photo_ref.
 */
export const portraitUrl = (photoRef: string | null | undefined) => {
  const p = personaOf(photoRef);
  return p ? `/media/persona/${p.key}` : (photoRef ?? null);
};

/** Is this creator row a synthetic (fictional, AI-generated) creator? */
export const isSynthetic = (photoRef: string | null | undefined) => personaOf(photoRef)?.synthetic ?? false;

/** The creator's niche: the persona's, else "General" (e.g. a creator who onboarded with Google). */
export const nicheOf = (photoRef: string | null | undefined) => personaOf(photoRef)?.niche ?? "General";

/** Video allowed? A video multiplier of 0 means image only (the policy refuses video under such a licence). */
export const allowsVideo = (videoMultiplier: number) => videoMultiplier > 0;
