/**
 * Runs once when the server starts. With SETTLE_LOOP_SECONDS > 0 (the deploy sets 30), a loop calls settle()
 * on that interval, so renders past their review window are auto-accepted and paid out even when nobody loads a
 * dashboard. Runs one pass at a time; errors are logged and the next tick tries again. Node.js runtime only.
 * It also opens a few database connections and preloads the seeded creators' portraits at start, so the first page
 * doesn't wait for the handshakes or the downloads.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.DATABASE_URL) void import("./lib/warm").then((m) => m.warmUp());
  const seconds = Number(process.env.SETTLE_LOOP_SECONDS ?? 0);
  if (!(seconds > 0)) return;
  const { engineDeps, settle } = await import("./lib/engine");
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const done = await settle(engineDeps());
      if (done.length) console.log(`settle loop: settled ${done.length} render(s)`);
    } catch (e) {
      console.error(`settle loop: ${(e as Error).message}`);
    } finally {
      running = false;
    }
  };
  setInterval(tick, seconds * 1000).unref();
  console.log(`settle loop: every ${seconds} s`);
}

