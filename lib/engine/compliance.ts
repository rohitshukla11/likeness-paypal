/**
 * The compliance hook: checked after the render and before the capture. A failing check voids the authorization,
 * so the brand is never charged for an ad that can't be used. The stub passes everything; the real check (labels,
 * likeness match, banned content in the output) comes later.
 */
import type { RenderOutput } from "./providers";

export interface ComplianceInput {
  renderId: string;
  use: string;
  prompt: string;
  output: RenderOutput;
}

export type ComplianceResult = { ok: true } | { ok: false; reason: string };

export interface ComplianceHook {
  readonly name: string;
  check(input: ComplianceInput): Promise<ComplianceResult>;
}

export const stubCompliance: ComplianceHook = {
  name: "stub",
  async check() {
    return { ok: true };
  },
};
