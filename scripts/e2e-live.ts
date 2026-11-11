/**
 * End to end against the DEPLOYED app over HTTPS: health, the public pages, the workspace check on /media, then
 * POST /api/e2e (the engine's accept, reject, deadline and revoke paths on the live server, PayPal sandbox), then
 * waits for PayPal's webhooks for that run's captures, refunds and payouts to arrive verified.
 * Needs E2E_TOKEN (the same value as on the server). Prints truncated ids only.
 *
 *   pnpm e2e:live --url https://likeness.onrender.com
 */
const base = (process.argv[process.argv.indexOf("--url") + 1] ?? process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
const token = process.env.E2E_TOKEN ?? "";
const short = (id: string | null | undefined) => (!id ? "-" : id.length <= 12 ? id : `${id.slice(0, 6)}…${id.slice(-4)}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
type PathResult = { path: string; ok: boolean; status: string; ids: Record<string, string | null>; detail: string };

async function main() {
  if (!/^https:\/\//.test(base)) throw new Error("pass --url https://…");
  if (!token) throw new Error("set E2E_TOKEN (the same value as on the server)");
  const status = async (p: string, init?: RequestInit) => (await fetch(`${base}${p}`, { redirect: "manual", ...init })).status;
  console.log(`live app ${base}`);
  for (const p of ["/api/health", "/", "/verify", "/api/receipts/public-key", "/media/rnd_doesnotexist0000"]) console.log(`  GET ${p.padEnd(30)} ${await status(p)}`);

  const t = Date.now();
  const res = await fetch(`${base}/api/e2e`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  const body = (await res.json()) as { run: string; paths: PathResult[]; ok: boolean; error?: string };
  if (!res.ok) throw new Error(`POST /api/e2e: HTTP ${res.status} ${body.error ?? ""}`);
  console.log(`\nengine paths on the live server (run ${body.run}, ${Math.round((Date.now() - t) / 1000)} s)`);
  for (const p of body.paths) {
    const ids = Object.entries(p.ids)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k} ${short(v)}`)
      .join(", ");
    console.log(`  ${p.ok ? "ok  " : "FAIL"} ${p.path.padEnd(9)} ${p.status.padEnd(9)} ${p.detail}\n       ${ids}`);
  }

  const watch = body.paths.flatMap((p) => [p.ids.capture, p.ids.refund, p.ids.payout]).filter((x): x is string => !!x);
  let events: { type: string; resourceId: string; verified: boolean }[] = [];
  for (let i = 0; i < 18; i++) {
    await sleep(10_000);
    const r = await fetch(`${base}/api/e2e?ids=${watch.join(",")}`, { headers: { Authorization: `Bearer ${token}` } });
    events = ((await r.json()) as { events: typeof events }).events;
    if (watch.every((id) => events.some((e) => e.resourceId === id))) break;
  }
  console.log(`\nwebhooks received for this run (${events.length}, waited up to 3 min)`);
  for (const id of watch) {
    const got = events.filter((e) => e.resourceId === id);
    console.log(`  ${short(id).padEnd(12)} ${got.length ? got.map((e) => `${e.type}${e.verified ? " (verified)" : " (NOT verified)"}`).join(", ") : "none yet"}`);
  }
  console.log(body.ok ? "\nlive e2e: all engine paths passed" : "\nlive e2e: an engine path FAILED");
  if (!body.ok) process.exitCode = 1;
}

main().catch((e) => {
  console.error(`e2e:live stopped: ${(e as Error).message}`);
  process.exitCode = 1;
});
