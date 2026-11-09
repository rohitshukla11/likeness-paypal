# PayPal AI Hackathon: what's new and what's reused

## New since 1 Oct 2026

Everything in this repository is new work unless it is listed under "Reused code" below.

- Next.js app scaffold (App Router, TypeScript), Drizzle schema for PayPal records.
- `lib/paypal/`: the PayPal REST client (Vault v3, Orders v2, Payments v2, Payouts v1).
- `scripts/paypal-smoke.ts`: the sandbox end-to-end run.

## Reused code

Code copied from earlier projects, with its source and the original commit.

| File here | Source repo and path | Original commit (SHA, date) | Built for | Date copied | Changes here |
|---|---|---|---|---|---|
| `lib/canonical.ts` | [rohitshukla11/likeness-hsk](https://github.com/rohitshukla11/likeness-hsk) `agents/src/hsp/canonical.ts` | `4206116`, 2026-10-27 | HSK Chain Horizon Hackathon | 2026-11-09 | doc comment only (its use here); code unchanged |
| `lib/model.ts` | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/model.ts` | `9a907e3`, 2026-10-18 | AI Builder Cup 2026 | 2026-11-09 | dropped the `categories` import and its `useLabel` display helper; header comment |
| `lib/receipts.ts` (and `lib/kms.ts`, removed) | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/server/receipts.ts`, `web/lib/server/kms.ts` | `3e76308`, 2026-10-16 | AI Builder Cup 2026 | 2026-11-09 | Cloud KMS (EC P-256) replaced by a local Ed25519 key (`RECEIPT_SIGNING_KEY`); canonical JSON from `lib/canonical.ts`; the payload now carries the PayPal order, authorization, capture, payout and refund ids and the receipt status; public key at `GET /api/receipts/public-key`; `kms.ts` (envelope encryption, KMS signing) deleted |
| `lib/licences.ts` | [rohitshukla11/likeness-ai](https://github.com/rohitshukla11/likeness-ai) `web/lib/server/licences.ts` | `9a907e3`, 2026-10-18 | AI Builder Cup 2026 | 2026-11-09 | Firestore documents and transactions replaced by Drizzle on Postgres (`SELECT … FOR UPDATE` in each decision and revocation); a request is a `pending` licence row; several allowed uses per licence, fixed banned uses, render cap and expiry; price fixed at approval with the terms' sha256; demo auto-approve, video fields and the separate revocations collection dropped |

Each file arrived in two commits: a verbatim copy (`reuse: copy …`), then its adaptations.
