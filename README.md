# Likeness × PayPal

## For judges

**Live (PayPal sandbox):** https://likeness-r2t7.onrender.com. No sign-up: each visitor gets a private demo workspace,
with a creator (Rohit) who has already approved one licence for the demo brand. For a fresh workspace, open the site
in a private or incognito window.

New workspaces also get two **synthetic creators**, so the Brand page's **Creators** section (a search box with a Search button, filters, and the results right
there) has something to filter. Rohit's card shows his real photo; the synthetic creators show their AI-generated faces:

| Creator | | Niche | Price | Allowed uses | Per licence | Demo brand |
|---|---|---|---|---|---|---|
| Rohit | real person (the author, consenting) | Lifestyle & food | $2.00 an image, video 3× | advertising, social | 10 renders, 30 days | licence pre-approved |
| Maya Lindqvist | **Synthetic creator: fictional person, AI-generated face** | Fitness | $2.50 an image, video 2× | advertising, social, editorial | 8 renders, 21 days | no licence: send a request, then see **Review with agent** as Maya |
| Theo Marlowe | **Synthetic creator: fictional person, AI-generated face** | Tech & gadgets | $3.50 an image, images only | advertising, internal | 5 renders, 14 days | licence pre-approved |

They are labelled the same way wherever they appear. They have no PayPal accounts of their own: their payouts go to
the same sandbox account as Rohit's (`PAYPAL_SANDBOX_CREATOR_EMAIL`), noted as "Synthetic creator: sandbox payout
account shared with the demo" in the ledger and on the receipt. Their reference portraits are AI-generated faces of fictional
adults (`pnpm portraits:synthetic`, gated), sealed into the database like Rohit's photo. Theo allows images only: a
video with Theo is refused before any PayPal call ("This creator allows images only, not video: I didn't charge your
PayPal.").

**The 3-minute path**

1. Open the live URL and choose **Continue as Brand**.
2. On the Brand page, save a PayPal wallet in one of two ways. Either is a sandbox PayPal Vault payment token, saved
   once with no purchase, and it activates your mandate (spending limits).
   - **Use demo wallet** (one click): attaches a shared sandbox buyer wallet.
   - **Save PayPal wallet** (PayPal JS SDK v6): log in with the **Judge buyer** sandbox account below.
3. Open **Studio** and ask the **Brand agent**: *"Make a 9:16 café ad with Rohit"*. Each step shows live:
   1. prompt check
   2. licence and mandate check
   3. authorize on your saved wallet
   4. render
   5. compliance check
   6. capture
4. On the new render card, press **Accept**. The creator is paid 90% through PayPal Payouts, and the receipt is
   signed.
5. Switch to **Creator**. The payout and its PayPal ids are in Earnings. **Revoke** the licence there.
6. Back in **Studio**, ask the agent *"Make another one"*. The answer is *"Licence revoked: I didn't charge your
   PayPal."*, with zero PayPal calls.
7. Optional:
   - Ask *"What did I spend this week?"*: the agent answers from the app's records and PayPal's
     `list_transactions`.
   - Check any receipt at **Verify**.

**Sandbox logins**

| Account | Email | Password |
|---|---|---|
| Judge buyer (sandbox personal: use it to save a wallet) | *(added by the author)* | *(added by the author)* |

**What's new and what's reused:** everything was built for this hackathon except the files listed in
[docs/HACKATHON.md](docs/HACKATHON.md). Those were copied from the author's earlier projects in a verbatim commit,
then adapted in a separate commit.

**PayPal APIs used**

| API | Used for |
|---|---|
| OAuth 2.0 (client credentials, plus a browser-safe client token) | every server call, and the JS SDK |
| JS SDK v6, `VAULT_WITHOUT_PAYMENT` | the brand saves its PayPal wallet without a purchase |
| Vault v3: setup tokens, payment tokens | the saved wallet (`vault_id`), `UNSCHEDULED_POSTPAID` |
| Orders v2 | one order per ad on the `vault_id`, intent AUTHORIZE |
| Payments v2: capture, void, refund | capture after render and compliance; void if either fails; refund if the brand rejects |
| Payouts v1 | 90% to the creator, `sender_batch_id` set to the render id |
| Webhooks: verify-webhook-signature | captures, refunds, payouts and vault events, verified before they're acted on |
| Agent Toolkit (`@paypal/agent-toolkit`): `list_transactions`, `get_order` | the brand agent's PayPal read tools |
| Transaction Search (reporting), through the toolkit | "What did I spend?" |

**Caps and fallbacks**

- **AI images:** `gemini-nano-banana-2.1` with likeness-eth's pipeline (`RENDER_PROVIDER=eth`: its prompt rules and a
  face check, regenerated once on a mismatch), at most 10 a day across the live demo and 3 per workspace (a
  regeneration takes one more).
- **AI videos:** 8 s at 16:9, Gemini Omni Flash animating the video's own opening still, at most 5 in total.
- **Over a cap:** a labelled pre-made demo image or the saved demo clip stands in, and no AI call is made.
- **Agent:** 20 turns per workspace and a daily cap across the demo.
- **Never charged:** refused prompts, licences or mandates are never charged. A render that fails its vision check
  has its authorization voided.

**Run it locally**

```sh
pnpm install
cp .env.example .env.local   # PayPal sandbox app, DATABASE_URL (Neon), RECEIPT_SIGNING_KEY, PHOTO_KEK, GEMINI_API_KEY
pnpm db:migrate
pnpm dev                     # http://localhost:3000
pnpm test && pnpm e2e:engine # unit tests; the engine against the PayPal sandbox
```

---

## About

License your face to AI ads, paid with PayPal. A brand saves its PayPal wallet once. Each ad the creator has licensed is:

1. authorized on that wallet
2. rendered and checked
3. captured

Then the creator is paid 90% through PayPal Payouts when the brand accepts the ad. Built for the PayPal AI Hackathon
(November 2026).

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
| Image ads, from the creator's reference photo (likeness-eth's prompt rules and face check on the live demo) | `gemini-nano-banana-2.1`, 1K (about $0.048 per image, one more on a regeneration) | `RENDER_CAP_DAILY` per UTC day (10 on the live demo, 30 by default), `RENDER_CAP_PER_WORKSPACE`=3 | the labelled demo image stands in, and no AI call is made |
| Video ads, priced at the licence's video multiplier (3× for Rohit, none for Theo): on the live demo (`eth`) the video makes its own 16:9 opening still from the reference photo; with `gemini` it starts from one of the brand's generated ad images | `gemini-omni-1.2-flash`, 8 s at 720p and 16:9 on the live demo (`VIDEO_SECONDS`), task `image_to_video` (about $0.61 with its still; 4 s with `gemini`, about $0.28) | `VIDEO_CAP_TOTAL`=5 in total on the live demo (3 by default) | the saved clip `private/demo-video.mp4` plays, labelled "demo render" |
| Prompt safety filter, run before every AI render | `gemini-3.5-flash-lite`, plus local banned-use rules; fails closed | – | – |

- **Video model:** video uses **Gemini Omni Flash**, not Veo. Veo's previews on the Gemini API were shut down on
  2026-10-22, and Veo GA is only on Google's enterprise platform (Vertex), which this app doesn't use.
- **Video jobs:** they run in the background and are polled with a timeout (`VIDEO_TIMEOUT_MS`, 300 s); a stuck job
  is cancelled. A failed render, video or filter refusal voids the PayPal authorization, so the brand is never
  charged for it.
- **Caps:** the caps are atomic counters in Postgres (`ai_quota`), reserved in one place (`reserveAi`): an image (or
  a face-check regeneration) takes a slot in the daily and the per-workspace image caps together, all or nothing; a
  video takes one from the video total. Concurrent renders can't overshoot a cap. Local runs and `pnpm ai:once`
  count against the same counters as the live demo.
- **Storage:** generated files are stored with their render and served at `/media/<render id>`.
- **Reference photo:** the demo creator's photo is `private/rohit.jpg` (git-ignored). The synthetic creators'
  portraits are `private/maya.jpg` and `private/theo.jpg` (AI-generated faces of fictional people, made by
  `pnpm portraits:synthetic`, a dry run unless `--confirm`); `pnpm seed:assets` seals all three into the database.
- **One gated render:** `pnpm ai:once --kind image|video` makes exactly one render through the whole engine. It runs
  only with `--confirm`, and is a dry run otherwise. Add `--provider eth` for the likeness-eth pipeline (below).

### The likeness-eth pipeline (`RENDER_PROVIDER=eth`)

likeness-eth's way of making ads, on the same Gemini API models (`lib/ai/eth.ts`). The live demo uses it
(`render.yaml`); `RENDER_PROVIDER=gemini` switches back.

- **Prompts:** likeness-eth's templates (`lib/ai/eth-prompts.ts`): the brief, then the rules that keep the creator
  faithful, including never copying the reference photo's clothing, accessories or straight-on pose. The Studio shows
  the exact prompt before the brand presses Render.
- **Face check:** the generated still is compared with the creator's reference photo (`gemini-3.5-flash-lite`); on a
  mismatch it is regenerated once, which takes one more slot in the image caps. A second mismatch, or no slot left,
  fails the render and the PayPal authorization is voided.
- **Video:** it makes its own 16:9 opening still from the reference photo (part of the video: covered by the video's
  price and its video slot, with no separate PayPal charge), then Gemini Omni Flash animates it for `VIDEO_SECONDS`
  (8) at 16:9. likeness-eth used Veo 3.1 Lite on Vertex AI; Veo isn't on the Gemini API, so Omni Flash stands in.
- **Label:** images carry "AI-generated · licensed likeness" in their pixels; every video player shows it as a fixed
  overlay (no ffmpeg re-encoding), and it is in the receipt and the content credential.
- **Cost (Gemini API, measured 2026-11-11 from reported tokens):** about $0.048 per image (one more on a
  regeneration), about $0.61 per 8 s video with its opening still.
- **Unchanged:** the prompt check before payment, authorize, render, vision compliance, capture or void; the caps and
  the demo stand-ins over them; C2PA; sealed reference photos from Neon; per-creator rules (Theo: images only).

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

The demo gives each visitor their own workspace (three creators: Rohit and the two synthetic creators, and a demo
brand) through a cookie, kept for 30 days. On the Creator page, pick which creator you play. Nothing is ever
deleted.

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
