import "server-only";
/**
 * The visible "AI-generated · licensed likeness" label: small (24% of the width, at least 220 px),
 * semi-transparent, bottom-left in a 4% safe area. (likeness-ai moved it away from the face with its ONNX face
 * models; this app doesn't ship those models, so the label stays bottom-left.) Images only: there is no ffmpeg
 * here to burn it into video, so videos carry the label in the page, the receipt and the content credential.
 */
import sharp from "sharp";
import { LABEL_AI_RENDER, WATERMARK_PROFILE } from "./watermarks";

export const LABEL_OPACITY = 0.75;
export const labelWidth = (W: number) => Math.min(W - 16, Math.max(220, Math.round(W * 0.24)));

/** The label PNG at width w, its alpha scaled to LABEL_OPACITY. */
export async function labelPng(w: number): Promise<{ png: Buffer; w: number; h: number }> {
  const { data, info } = await sharp(LABEL_AI_RENDER).resize({ width: w }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * LABEL_OPACITY);
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { png, w: info.width, h: info.height };
}

/** Bottom-left inside a 4% safe area. */
export function labelSpot(W: number, H: number, label: { w: number; h: number }) {
  const m = Math.round(Math.min(W, H) * 0.04);
  return { x: m, y: Math.max(0, H - label.h - m) };
}

export async function labelRender(bytes: Uint8Array): Promise<Buffer> {
  const upright = await sharp(bytes).rotate().jpeg({ quality: 95 }).toBuffer();
  const { width = 1024, height = 1024 } = await sharp(upright).metadata();
  const label = await labelPng(labelWidth(width));
  const spot = labelSpot(width, height, label);
  return sharp(upright).composite([{ input: label.png, left: spot.x, top: spot.y }]).jpeg({ quality: 92 }).toBuffer();
}

async function stamp(bytes: Uint8Array, mark: Buffer, fraction: number): Promise<Buffer> {
  const img = sharp(bytes).rotate();
  const { width = 1024, height = 1024 } = await img.metadata();
  const w = Math.max(160, Math.round(width * fraction));
  const label = await sharp(mark).resize({ width: w }).png().toBuffer();
  const lh = (await sharp(label).metadata()).height ?? 40;
  const margin = Math.round(width * 0.025);
  return img.composite([{ input: label, left: Math.max(0, width - w - margin), top: Math.max(0, height - lh - margin) }]).jpeg({ quality: 92 }).toBuffer();
}

/** The creator's public photo: 512 px, metadata removed, labelled "profile photo, not licensed for reuse". */
export async function publicPhoto(front: Uint8Array): Promise<Buffer> {
  const small = await sharp(front).rotate().resize(512, 512, { fit: "cover" }).jpeg({ quality: 88 }).toBuffer();
  return stamp(small, WATERMARK_PROFILE, 0.62);
}
