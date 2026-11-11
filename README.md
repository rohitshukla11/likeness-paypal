# Likeness × PayPal

License your face to AI ads, paid with PayPal. A brand saves its PayPal wallet once. Each ad the creator has licensed is:

1. authorized on that wallet
2. rendered and checked
3. captured

Then the creator is paid 90% through PayPal Payouts when the brand accepts the ad. Built for the PayPal AI Hackathon
(November 2026).

**Live (PayPal sandbox):** https://likeness-r2t7.onrender.com

**Status:**

- **Working end to end in the PayPal sandbox:** the render engine, the Brand, Studio, Creator and Verify pages, and
  signed receipts.
- **Renders:** the StubProvider (pre-generated demo images, no cost) by default. With `RENDER_PROVIDER=gemini` and
  `GEMINI_API_KEY`, the AI provider makes real ads on the **Gemini API** (never Vertex AI); see "AI ads" below.
- **Content credentials (C2PA):** AI images and videos are signed with a locally made TEST certificate
  (`sh scripts/c2pa-testcert.sh`). No cloud project is involved, so this was ported. The test signer is reported
  untrusted, which is expected.
- **Creator onboarding:** built, but behind `FEATURE_CREATOR_ONBOARDING` (off). The seeded demo personas are the
  default.

## AI ads

| What | Model (Gemini API) | Caps | Over the cap |
|---|---|---|---|
| Image ads, from the creator's reference photo | `gemini-nano-banana-2.1`, 1K (about $0.034 per image) | `RENDER_CAP_DAILY`=30 per UTC day, `RENDER_CAP_PER_WORKSPACE`=3 | the labelled demo image stands in, and no AI call is made |
| Video ads, priced at 3× an image, starting from one of the brand's generated ad images (its first frame, never the raw photo) | `gemini-omni-1.2-flash`, 4 s at 720p, task `image_to_video` (about $0.28) | `VIDEO_CAP_TOTAL`=3 in total | the saved clip `private/demo-video.mp4` plays, labelled "demo render" |
| Prompt safety filter, run before every AI render | `gemini-3.5-flash-lite`, plus local banned-use rules; fails closed | – | – |

- **Video model:** video uses **Gemini Omni Flash**, not Veo. Veo's previews on the Gemini API were shut down on
  2026-10-22, and Veo GA is only on Google's enterprise platform (Vertex), which this app doesn't use.
- **Video jobs:** they run in the background and are polled with a timeout (`VIDEO_TIMEOUT_MS`, 300 s); a stuck job
  is cancelled. A failed render, video or filter refusal voids the PayPal authorization, so the brand is never
  charged for it.
- **Caps:** the caps are atomic counters in Postgres (`ai_quota`).
- **Storage:** generated files are stored with their render and served at `/media/<render id>`.
- **Reference photo:** the demo creator's photo is `private/rohit.jpg` (git-ignored).
- **One gated render:** `pnpm ai:once --kind image|video` makes exactly one render through the whole engine. It runs
  only with `--confirm`, and is a dry run otherwise.

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
| `pnpm ai:once --kind image\|video [--confirm]` | one real AI render through the engine; dry run (no Gemini call) without `--confirm` |
| `pnpm face:models` | download the face matcher's weights (onboarding only, ~260 MB, sha256-pinned) |
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
| `app/` | landing, and in the `(app)` route group `/brand`, `/brand/studio`, `/creator`, `/verify` and the PayPal vault return route; API routes |
| `components/`, `public/landing/` | the UI from likeness-ai: design system (`ds/`), header and footer, landing page, render card (see `docs/HACKATHON.md`) |
| `tests/`, `scripts/` | unit tests and sandbox scripts |
| `docs/HACKATHON.md` | what's new for the hackathon and what was reused |
| `docs/DEPLOY.md` | research: Render Workflows for the render steps |

MIT licence ([LICENSE](LICENSE)).
