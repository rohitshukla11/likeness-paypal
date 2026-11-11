/**
 * likeness-eth's prompt templates (RENDER_PROVIDER=eth), adapted: the brand's brief, then the rules that keep the
 * creator faithful and the frame clean, including the wardrobe, accessory and pose rules (image models copy the
 * reference photo's clothes and its straight-on pose). A video gets its own opening still (16:9) and a motion
 * prompt. Pure, so the Studio can show the brand exactly what is sent before they pay.
 */

export type EthKind = "image" | "video";
export type EthAspect = "1:1" | "9:16" | "16:9";

const COMPOSITION: Record<EthAspect, string> = {
  "1:1": "Square advertising photo, the person as the clear subject.",
  "9:16": "Vertical 9:16 advertising photo for a phone screen, the person as the clear subject, head and shoulders in the upper two thirds.",
  "16:9": "Landscape 16:9 advertising photo, the person as the clear subject in the centre third.",
};

/** The brief, then the rules that keep the creator faithful and the frame clean. */
export function stillPrompt(brief: string, purpose: EthKind, aspect: EthAspect = "1:1"): string {
  return [
    "The image shows one real, consenting adult who has licensed their face for this advertising image.",
    "Generate a new photorealistic image of exactly this person, keeping their face, identity and appearance faithful to the reference photo.",
    "Their face is clearly visible, unobstructed and well lit; one person only.",
    purpose === "video"
      ? "Compose it as the opening frame of a short video ad: landscape 16:9, the person in the centre third with room to move, already in the middle of the brief's action (for example mid-stride if they are running), not posing for the camera."
      : COMPOSITION[aspect],
    "Do not add any text, logos, captions or watermarks.",
    "Clothing: as the brief describes; if it names none, plain, simple clothing with no logos, text, prints or brand marks. Never copy the clothing from the reference photo.",
    "Accessories: none from the reference photo (no earbuds, headphones, hats, bags, badges, microphones or jewellery from it) unless the brief asks for them.",
    "Pose and expression: doing what the brief describes, caught mid-movement when it has an action (for example mid-stride when running), otherwise natural and suited to the brief (for example relaxed and smiling in a café); never the reference photo's straight-on pose or neutral expression.",
    `Brief: ${brief.trim()}`,
  ].join("\n");
}

/** What the person does through the clip: continuous action, a tracking shot, the first frame's person and setting. */
export function motionPrompt(brief: string): string {
  return [
    `Action: ${brief.trim()}`,
    "The person performs the action in the brief continuously for the whole clip, with natural full-body movement (for example, if they are running, they keep running along the path at a steady pace); they never stop to stand or pose.",
    "The camera moves with them (a smooth tracking or follow shot) so they stay in frame. One continuous shot, no cuts.",
    "Keep exactly the person, product and setting of the first frame; their face stays visible and recognisable throughout.",
    "Photorealistic advertising footage. No text, captions, logos or watermarks.",
  ].join("\n");
}

/** The prompts sent for one render: an image's still, or a video's opening still and its motion. */
export function promptsFor(kind: EthKind, brief: string, aspect: EthAspect = "1:1"): { still: string; motion?: string } {
  return kind === "video" ? { still: stillPrompt(brief, "video"), motion: motionPrompt(brief) } : { still: stillPrompt(brief, "image", aspect) };
}

/** Both of a video's prompts as one text, as the Studio shows them. */
export function fullPrompt(kind: EthKind, p: { still: string; motion?: string }): string {
  return kind === "video" ? `Opening frame (image model):\n${p.still}\n\nMotion (video model):\n${p.motion ?? ""}` : p.still;
}
