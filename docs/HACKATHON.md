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

Each file arrived in two commits: a verbatim copy (`reuse: copy …`), then its adaptations.
