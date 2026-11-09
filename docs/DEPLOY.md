# Deploy notes: Render Workflows (research)

Research only (2026-11-09): nothing is installed or deployed. Items marked **unverified** were not confirmed in the
docs.

## Summary

- **Yes, there is an official TypeScript SDK:** `@renderinc/sdk`, with workflow helpers in `@renderinc/sdk/workflows`.
  The latest is 1.8.0 (2026-11-06); the docs ask for 1.7.0 or later. Python is also supported.
- **Two models:**
  - **Tasks** (`task()`, chained with `ctx.run()`): each run gets its own instance, with 3 retries by default.
  - **Flows** (`flow()` with `ctx.step()`, new in 1.7.0 on 2026-11-02): each step's result is saved, so a replay never
    redoes a finished step. Steps don't retry unless configured.
- **No durable sleep, timer or signal.** The 120 s review window is either a run that waits against the deadline
  stored in Postgres, or a cron job that calls `settle()`. The recommendation is both.
- **Status:** public beta since 2026-04-07. Whether it is now GA is **unverified**: no GA announcement was found, but
  the docs no longer say beta.

## SDK facts

- **npm `@renderinc/sdk`:** first published 2025-12-16; 1.0.0 on 2026-08-21; 1.7.0 on 2026-11-03; 1.8.0 on
  2026-11-06.
- **Task:** `task({ name, retry?, timeoutSeconds?, plan? }, async (ctx, ...args) => ...)`.
  - Arguments and results must be JSON-serializable, at most 4 MB of arguments.
  - One task calls another with `await ctx.run(otherTask, ...args)`. The child runs on a separate instance in the same
    workflow service; run children in parallel with `Promise.all`.
- **Flow:** `flow({ name, timeoutSeconds?, plan? }, async (ctx, ...args) => ...)`, with steps as
  `await ctx.step('name', fn, [args], { retry })`.
  - Flow code must be deterministic: I/O, randomness and clock reads go inside steps.
  - Steps run one after another, and a flow can't call tasks.
- **Retry policy:** `{ maxRetries, waitDurationMs, backoffScaling }`.
  - Tasks default to 3 retries (1 s, 2 s, 4 s). Each retry is a new instance with a fresh timeout.
  - Flow steps default to no retries.
- **Timeouts:** `timeoutSeconds` from 30 to 86400, default 2 h.
- **Compute plans:** `plan` is set per task: `flex` (the default) or `2c-4g` up to `8c-32g`.
- **Start a run from the app:** with `new Render()` (reads `RENDER_API_KEY`), call
  `render.workflows.startTask('<service>/processRender', [renderId], { idempotencyKey })`. `runTask` waits for the
  result; `getTaskRun` looks up a run.
  - A REST endpoint exists; its exact path is **unverified**.
- **Idempotency key:** the same key within 24 h returns the original run. It doesn't deduplicate retries inside a run.
- **Locally:** `render workflows dev -- <start command>` (Render CLI 2.35.0 or later).

## Limits, pricing, deployment

- **Duration:** up to 24 h per attempt.
- **Compute per minute:** Hobby 16 CPU / 64 GB, Pro 32 CPU / 128 GB. Runs over the limit are queued.
- **Rate limits:** chained runs 1,000 per minute; API calls 50 per minute on Hobby, 1,500 per minute on Pro.
- **Billing:** per second. `flex` is $0.20 per CPU-hour plus $0.05 per GB-hour, at most $0.40/h. How an idle wait is
  billed is **unverified**.
- **Deploy:** a `type: workflow` service in `render.yaml` (supported since 2026-09-16).
  - There's no `plan` field there; plans are set per task in code.
  - There's no built-in scheduler; use a Render cron job.

## Mapping D2–D6 (lib/engine/render-and-pay.ts)

The orchestrator task `processRender(renderId)`:

- runs with `maxRetries: 0` and is started with `idempotencyKey = renderId`
- calls child tasks with `ctx.run`

Each child first reads the render row and returns the stored result if its step is already done (the engine already
works this way).

| Step | Task | Retry policy | Idempotency key (as the engine uses it) |
|---|---|---|---|
| D2 order on vault_id, AUTHORIZE | `createAuthorizedOrder` | 3 retries, 1 s, ×2 | PayPal-Request-Id `<renderId>-order` (`-authorize` if PayPal didn't authorize at creation) |
| D3 render (RenderProvider) | `renderAsset` | 1 retry, `timeoutSeconds: 900` | provider job id stored on the render row before polling |
| D4 compliance hook | `checkCompliance` | 3 retries | render id plus output sha256 (no side effects) |
| D5 capture | `captureAuthorization` | 3 retries, 2 s, ×2 | `<renderId>-capture` |
| D5 failure (D3 or D4 failed) | `voidAndRefuse` | 5 retries | `<renderId>-void`; one refusal row per render |
| D6 deadline | `awaitReview` | 2 retries | waits for the stored `review_deadline`, then calls `settle()` |
| D6 accept or auto-accept | `settle` → payout | 3 retries | Payouts `sender_batch_id = <renderId>`. PayPal rejects a reused `sender_batch_id`. |
| D6 reject | `settle` → refund | 3 retries | `<renderId>-refund` |

- **Failure path:** the orchestrator wraps D3 and D4 in try/catch and runs `voidAndRefuse` on error. Whether a failed
  `ctx.run` can be caught is **unverified**.
- **Flow alternative:** one `ctx.step` per step. Replays never repeat a capture, but every step needs an explicit
  `retry`, and the feature is one week old.

## Review window (default 120 s)

- **Deadline:** at capture, the engine stores an absolute `review_deadline`. A retry must never restart the clock.
- **`awaitReview`:** waits until that stored deadline, checking the row every few seconds, then calls
  `settle()`.
- **Accept and Reject:** the buttons in the web app call the engine directly.
- **The race is harmless:** `settle()` and the accept and reject paths claim a render with one conditional update
  (`in_review` → `settling` / `refunding`), so the brand's click and the timer can't both pay out.
- **Backstop:** a cron job calling `GET /api/cron/settle`. Dashboard loads also call `settle()`. This is what runs
  today, with no workflow service at all.

## What stays in the web app (Next.js)

- **Browser flows:** all UI, the PayPal wallet setup (the buyer approves in a browser) and the vault return route.
- **Starting a render:** insert the render row, then `startTask(..., { idempotencyKey: renderId })`. Today the engine
  runs in-process instead.
- **Accept and reject:** shared engine code, which both services would import.
- **Status:** read from Postgres, the source of truth.
- **Secrets:** `RENDER_API_KEY` goes in the web service. The workflow service gets the PayPal keys, the provider keys
  and `DATABASE_URL`.

## Open questions and risks

- GA versus beta is **unverified**, and minor versions (1.3, 1.4, 1.5) had breaking changes.
- Flows are one week old.
- The Hobby API limit (50 per minute) caps bursts of render starts.
- The REST endpoint path, idle-wait billing and catching a failed `ctx.run` are all **unverified**.

## Sources (read 2026-11-09)

- https://render.com/docs/workflows
- https://render.com/docs/workflows-sdk-typescript
- https://render.com/docs/workflows-defining
- https://render.com/docs/workflows-defining-flows.md
- https://render.com/docs/workflows-running
- https://render.com/docs/workflows-limits
- https://render.com/blog/durability-as-code-introducing-render-workflows.md
- https://render.com/changelog
- https://render.com/changelog/added-blueprint-support-for-render-workflows.md
- https://github.com/render-oss/sdk/blob/main/typescript/README.md
- https://github.com/render-oss/sdk/blob/main/typescript/CHANGELOG.md
- https://registry.npmjs.org/@renderinc/sdk
