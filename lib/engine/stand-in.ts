/**
 * Why a demo stand-in was shown instead of an AI render, in plain words, for the render card, its receipt page and
 * the brand agent's step stream. Every note ends by saying the payment itself was real (PayPal sandbox), because
 * the stand-in changes only the picture, never the money. Pure: the providers and the UI share it.
 */

export const PAYMENT_REAL = "The PayPal payment is real (sandbox).";

/** The reasons, each the first half of a note. */
export const STAND_IN = {
  off: "Demo mode: AI generation is off on this server",
  noKey: "Demo mode: Gemini isn't configured on this server (GEMINI_API_KEY)",
  noReference: "No reference photo of this creator is on file",
  imageDaily: (perDay: number) => `AI image cap reached today (${perDay}/day)`,
  imageWorkspace: (perWorkspace: number) => `AI image cap reached for this demo workspace (${perWorkspace} per workspace)`,
  videoTotal: (total: number) => `AI video cap reached (${total} in total)`,
  videoOff: "AI video is off on this server",
  noFirstFrame: "A video starts from one of your generated ad images under this licence, and there is none yet",
} as const;

export type StandInShows = "image" | "clip" | "animation";
const SHOWS: Record<StandInShows, string> = {
  image: "showing a demo stand-in",
  clip: "playing the saved demo clip",
  animation: "showing a pre-made demo animation",
};

/** "AI image cap reached today (10/day): showing a demo stand-in. The PayPal payment is real (sandbox)." */
export const standInNote = (reason: string, shows: StandInShows = "image") => `${reason}: ${SHOWS[shows]}. ${PAYMENT_REAL}`;

/** A pre-made demo render or the saved demo clip (no AI call), not an AI output. */
export const isStandIn = (model: string | null | undefined) => !!model && (model.startsWith("stub") || model.startsWith("demo clip"));

/** The note to show for a render: its own, or (older demo renders stored without one) demo mode. */
export function standInReason(r: { model: string | null; renderNote: string | null; kind?: string }): string | null {
  if (!isStandIn(r.model)) return r.renderNote;
  return r.renderNote ?? standInNote(STAND_IN.off, r.kind === "video" ? "animation" : "image");
}
