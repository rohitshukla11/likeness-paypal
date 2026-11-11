/**
 * AI spend caps. A real (paid) render first reserves every key it counts against, all or nothing; over a cap the
 * render is made by the stub (images) or the saved demo clip (video) instead, with a visible label, and no AI call
 * is made at all.
 *   RENDER_CAP_DAILY (30)         Gemini images per UTC day, across all visitors
 *   RENDER_CAP_PER_WORKSPACE (3)  Gemini images per demo workspace
 *   VIDEO_CAP_TOTAL (3)           AI videos, ever
 */
export type QuotaKey = { key: string; limit: number };

export interface Quota {
  /** Takes one unit of every key, or none of them. True if it took them. */
  reserve(keys: QuotaKey[]): Promise<boolean>;
}

const num = (v: string | undefined, d: number) => {
  const n = Number(v ?? d);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : d;
};

export function aiCaps(env: NodeJS.ProcessEnv = process.env) {
  return {
    imageDaily: num(env.RENDER_CAP_DAILY, 30),
    imagePerWorkspace: num(env.RENDER_CAP_PER_WORKSPACE, 3),
    videoTotal: num(env.VIDEO_CAP_TOTAL, 3),
  };
}
export type AiCaps = ReturnType<typeof aiCaps>;

export const imageKeys = (workspaceId: string | null, now: Date, caps: AiCaps): QuotaKey[] => [
  { key: `image:day:${now.toISOString().slice(0, 10)}`, limit: caps.imageDaily },
  { key: `image:ws:${workspaceId ?? "none"}`, limit: caps.imagePerWorkspace },
];

export const videoKeys = (caps: AiCaps): QuotaKey[] => [{ key: "video:total", limit: caps.videoTotal }];

/** In-memory quota (tests, scripts). */
export class MemoryQuota implements Quota {
  counts = new Map<string, number>();
  async reserve(keys: QuotaKey[]) {
    if (keys.some((k) => (this.counts.get(k.key) ?? 0) >= k.limit)) return false;
    for (const k of keys) this.counts.set(k.key, (this.counts.get(k.key) ?? 0) + 1);
    return true;
  }
}
