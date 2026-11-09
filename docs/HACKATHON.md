# PayPal AI Hackathon: what's new and what's reused

## New since 1 Oct 2026

Everything in this repository is new work unless it is listed under "Reused code" below.

- Next.js app scaffold (App Router, TypeScript), Drizzle schema for PayPal records.
- `lib/paypal/`: the PayPal REST client (Vault v3, Orders v2, Payments v2, Payouts v1, the JS SDK v6 client token).
- `scripts/paypal-smoke.ts`: the sandbox end-to-end run. `scripts/paypal-fresh-token.ts`: the token and scope check.
- The schema for creators, brands, licences, mandates, renders, receipts, refusals and demo workspaces (migration 0001).
- `lib/engine/`: the render-and-pay engine. It covers the policy transaction, authorize on the vault_id, render,
  compliance, capture or void, the review window, payout or refund, and the signed receipt. It also has its ports, the
  Postgres store, and the StubProvider with a Gemini skeleton. The mandate checker in `policy.ts` is adapted from
  reused code (below).
- The UI: the landing page, the Brand page (mandate, licence request, Save PayPal wallet with JS SDK v6), the Studio,
  the Creator page and Verify. The demo images in `public/demo/` were drawn for this project as SVG.
- `tests/` (unit tests) and `scripts/engine-e2e.ts` (the engine against the PayPal sandbox).
- `docs/DEPLOY.md`: research on Render Workflows.

## Reused code

Code copied from earlier projects, with its source and the original commit.

| File here | Source repo and path | Original commit (SHA, date) | Built for | Date copied | Changes here |
|---|---|---|---|---|---|
| `lib/canonical.ts` | [rohitshukla11/likeness-hsk](https://github.com/rohitshukla11/likeness-hsk) `agents/src/hsp/canonical.ts` | `4206116`, 2026-10-27 | HSK Chain Horizon Hackathon | 2026-11-09 | doc comment only (its use here); code unchanged |
| `lib/model.ts` | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/model.ts` | `9a907e3`, 2026-10-18 | AI Builder Cup 2026 | 2026-11-09 | dropped the `categories` import and its `useLabel` display helper; header comment |
| `lib/receipts.ts` (and `lib/kms.ts`, removed) | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/server/receipts.ts`, `web/lib/server/kms.ts` | `3e76308`, 2026-10-16 | AI Builder Cup 2026 | 2026-11-09 | Cloud KMS (EC P-256) replaced by a local Ed25519 key (`RECEIPT_SIGNING_KEY`); canonical JSON from `lib/canonical.ts`; the payload now carries the PayPal order, authorization, capture, payout and refund ids and the receipt status; public key at `GET /api/receipts/public-key`; `kms.ts` (envelope encryption, KMS signing) deleted |
| `lib/licences.ts` | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/server/licences.ts` | `9a907e3`, 2026-10-18 | AI Builder Cup 2026 | 2026-11-09 | Firestore documents and transactions replaced by Drizzle on Postgres (`SELECT … FOR UPDATE` in each decision and revocation); a request is a `pending` licence row; several allowed uses per licence, fixed banned uses, render cap and expiry; price fixed at approval with the terms' sha256; demo auto-approve, video fields and the separate revocations collection dropped |
| `lib/engine/policy.ts` | [rohitshukla11/likeness-hsk](https://github.com/rohitshukla11/likeness-hsk) `agents/src/brand-agent/policy.ts` | `b7b9dec`, 2026-11-04 | HSK Chain Horizon Hackathon | 2026-11-09 | became the mandate checker: one pure `checkRender(licence, mandate, ask)` (licence revoked, active, unexpired, use allowed and not banned, render cap; mandate active, unexpired, wallet saved, per-render max, daily cap, total budget; step-up threshold); stablecoin bigint amounts became cents; the in-memory daily `Budget` replaced by today's spend summed in the policy transaction |
| `lib/verify.ts`, `app/api/verify/route.ts` | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/server/verify.ts`, `web/app/api/verify/route.ts` | `58e64b7`, 2026-10-17 | AI Builder Cup 2026 | 2026-11-09 | Firestore lookups replaced by Postgres; KMS signature check replaced by Ed25519; verdicts Licensed / Expired / Revoked / Refunded / Unknown (Refunded is new: a rejected ad); lookup by receipt id or file sha256; C2PA manifest reading, SynthID notes and YouTube verification notes dropped |
| `app/verify/page.tsx` (and new `app/verify/result.tsx`, `app/verify/[receiptId]/page.tsx`) | [rohitshukla11/likeness-hsk](https://github.com/rohitshukla11/likeness-hsk) `web/app/(app)/verify/page.tsx` | `b7b9dec`, 2026-11-04 | HSK Chain Horizon Hackathon | 2026-11-09 | chain, HSP payment, transaction-link and licence-bundle fields dropped; shows the PayPal order, authorization, capture, payout or refund ids and the Ed25519 signature check; lookup by receipt id too; restyled with this app's Tailwind tokens (the hsk design-system components aren't here); the result moved to a shared component used by the new receipt page |

Each file arrived in two commits: a verbatim copy (`reuse: copy …`), then its adaptations.
