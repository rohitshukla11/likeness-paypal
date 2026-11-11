/**
 * Every video ad player: the video with a fixed "AI-generated · licensed likeness" overlay in its top-left corner
 * (top, so it never covers the player's controls). Videos aren't re-encoded here (no ffmpeg), so the label lives on
 * the player, in the receipt and in the content credential; images carry it in their pixels.
 */
export const VIDEO_LABEL = "AI-generated · licensed likeness";

export function LabelledVideo({ src, label, className = "", videoClassName = "" }: { src: string; label?: string; className?: string; videoClassName?: string }) {
  return (
    <div className={`relative overflow-hidden ${className}`}>
      <video src={src} controls muted playsInline preload="metadata" aria-label={label} className={`block h-full w-full object-cover ${videoClassName}`} />
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/65 px-2.5 py-1 text-[11px] font-semibold leading-none text-white" aria-hidden="true">
        {VIDEO_LABEL}
      </span>
      <span className="sr-only">{VIDEO_LABEL}</span>
    </div>
  );
}
