# Likeness × PayPal

License your face to AI ads, paid with PayPal: a brand saves its PayPal wallet once, each ad the creator approves
is authorized and captured, and the creator is paid out. Built for the PayPal AI Hackathon (November 2026).

**Status:** scaffold and PayPal sandbox spike. No UI and no AI calls yet.

## How payments work

- **The creator approves a licence once:** who may use their face, for what, until when, at what price.
- **The brand approves a mandate once:** its spending limits, and saving its PayPal wallet (a Vault payment token).
- **Per render:** policy check → authorize on the saved wallet → render → compliance check → capture → payout to the
  creator (90%).
  - The authorization is **voided** if the render or the compliance check fails.
  - The capture is **refunded** if the brand rejects the ad.
  - A revoked or expired licence, or an exceeded mandate, is **refused before any PayPal call**.

## Setup

```sh
pnpm install
cp .env.example .env.local   # fill in the PayPal sandbox app, a sandbox creator email, DATABASE_URL
pnpm typecheck && pnpm lint
pnpm smoke:paypal            # sandbox end-to-end: vault, authorize, capture, payout, void, refund
pnpm check:agent-toolkit     # @paypal/agent-toolkit loads and lists its tools (no LLM calls)
```

## Layout

| Path | What |
|---|---|
| `lib/paypal/` | PayPal REST client (plain fetch, server-only): OAuth token cache, PayPal-Request-Id on every POST, Vault v3 setup and payment tokens, Orders v2 with a saved wallet (authorize), capture, void, refund, Payouts |
| `lib/db/` | Drizzle schema and client (Neon Postgres) |
| `scripts/paypal-smoke.ts` | the sandbox end-to-end run |
| `docs/HACKATHON.md` | what's new for the hackathon and what was reused |

MIT licence ([LICENSE](LICENSE)).
