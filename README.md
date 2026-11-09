# Likeness × PayPal

License your face to AI ads, paid with PayPal. A brand saves its PayPal wallet once. Each ad the creator has licensed is:

1. authorized on that wallet
2. rendered and checked
3. captured

Then the creator is paid 90% through PayPal Payouts when the brand accepts the ad. Built for the PayPal AI Hackathon
(November 2026).

**Status:**

- **Working end to end in the PayPal sandbox:** the render engine, the Brand, Studio, Creator and Verify pages, and
  signed receipts.
- **Renders:** pre-generated demo images through the StubProvider. No AI calls yet; the Gemini provider is a
  skeleton.

## How payments work

- **The creator approves a licence once:** who may use their face, for which uses, how many renders, until when, at
  what price. Political, adult, minors, impersonation and deception uses are always banned.
- **The brand approves a mandate once:** a per-render maximum, a daily cap, a total budget and a step-up threshold.
  It also saves its PayPal wallet: a Vault payment token, `UNSCHEDULED_POSTPAID`, saved with the JS SDK v6
  `VAULT_WITHOUT_PAYMENT`.
- **Per render** (`lib/engine/render-and-pay.ts`, idempotent per render id):
  1. **Policy check** in one database transaction. Any refusal writes a refusal row and makes **no PayPal call**,
     including a revoked licence. Above the step-up threshold, the render waits for the brand's approval.
  2. **Order** on the saved `vault_id`, intent AUTHORIZE.
  3. **Render** through the RenderProvider.
  4. **Compliance hook.**
  5. **Capture.** If the render, the compliance check or the capture fails, the authorization is **voided** instead.
  6. **Review window** (`REVIEW_WINDOW_SECONDS`, default 120):
     - Accept: payout of 90% to the creator, with `sender_batch_id` set to the render id.
     - Reject: the capture is **refunded**.
     - No answer by the deadline: auto-accept through `settle()`, which runs from `GET /api/cron/settle` and on every
       dashboard load.
  7. **Receipt**, signed with Ed25519 over the canonical payload, including the PayPal order, authorization, capture
     and payout or refund ids.
- **Verify** (`/verify`, `/verify/<receipt id>`): Licensed, Expired, Revoked ("licensed when made"), Refunded or
  Unknown. The public key is at `GET /api/receipts/public-key`.

## Setup

```sh
pnpm install
cp .env.example .env.local   # PayPal sandbox app, a sandbox creator email, DATABASE_URL, RECEIPT_SIGNING_KEY
pnpm db:migrate              # additive migrations to Postgres (Neon)
pnpm dev                     # http://localhost:3000 → Continue as Brand / Creator
```

| Command | What |
|---|---|
| `pnpm test` | unit tests: policy refusals, and the engine on an in-memory store with a mocked PayPal |
| `pnpm e2e:engine` | the engine against the PayPal sandbox (StubProvider): accept, reject, deadline and revoke paths |
| `pnpm smoke:paypal` | raw PayPal sandbox run: vault, authorize, capture, payout, void, refund |
| `pnpm paypal:fresh-token` | terminate the cached sandbox token, fetch a new one, flag missing Vault or Payouts scopes |
| `pnpm typecheck && pnpm lint && pnpm build` | checks |

The demo gives each visitor their own workspace (a creator, Rohit, and a demo brand) through a cookie. **Reset demo**
starts a new workspace and deletes nothing.

## Layout

| Path | What |
|---|---|
| `lib/engine/` | `render-and-pay.ts` (the pipeline and its ports), `policy.ts` (the mandate checker), `store.ts` (Postgres), `providers.ts` (Stub, Gemini skeleton), `compliance.ts` |
| `lib/paypal/` | PayPal REST client (plain fetch): OAuth, Vault v3, Orders v2, Payments v2, Payouts v1, the browser-safe client token |
| `lib/db/` | Drizzle schema and client (Neon Postgres, Pool driver for transactions) |
| `lib/licences.ts`, `lib/receipts.ts`, `lib/verify.ts`, `lib/wallet.ts` | licences, Ed25519 receipts, verification, wallet saving |
| `app/` | landing, `/brand`, `/brand/studio`, `/creator`, `/verify`, the PayPal vault return route, API routes |
| `tests/`, `scripts/` | unit tests and sandbox scripts |
| `docs/HACKATHON.md` | what's new for the hackathon and what was reused |
| `docs/DEPLOY.md` | research: Render Workflows for the render steps |

MIT licence ([LICENSE](LICENSE)).
