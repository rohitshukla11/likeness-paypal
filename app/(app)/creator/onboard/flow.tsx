"use client";
/**
 * The onboarding steps in the browser: (1) Google sign-in, which also connects YouTube (read-only), happens on
 * the server via /auth/google/start; (2) the live face check (MediaPipe, in the browser), matched on the server;
 * (3) self-declared 18+, consent, then "Protect my photos and go live".
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { Card, pillClass } from "@/components/ds";
import { LivenessCapture, type Capture } from "@/components/creator/LivenessCapture";

type Match = { ok: boolean; score: number; threshold: number; perFrame: number[] };
export type OnboardState = { signedIn: boolean; channel: { title: string; subscribers: string } | null; live: boolean; consentText: string };

async function post<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => ({}))) as T & { error?: string };
  if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
  return j;
}

export function OnboardFlow({ state }: { state: OnboardState }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [match, setMatch] = useState<Match | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [adult, setAdult] = useState(false);
  const [consent, setConsent] = useState(false);
  const [live, setLive] = useState(state.live);

  const onCaptured = useCallback((c: Capture) => {
    setCapture(c);
    setBusy("Matching your face to your channel…");
    setErr(null);
    post<Match>("/api/onboarding/match", c)
      .then(setMatch)
      .catch((e: Error) => setErr(e.message))
      .finally(() => setBusy(null));
  }, []);

  if (live)
    return (
      <Card tone="lime" title="You're live">
        <p className="m-0">Your photos are encrypted with your own key; only the render service can open them, and every opening is logged. Brands in this demo can now request a licence.</p>
        <Link href="/creator" className={pillClass("ink", "self-start")}>
          Go to your creator dashboard
        </Link>
      </Card>
    );

  const step = !state.signedIn || !state.channel ? 1 : !match?.ok ? 2 : 3;
  return (
    <>
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0 text-[14px] font-semibold" aria-label="Steps">
        {["Sign in and connect YouTube", "Live face check", "Go live"].map((l, i) => (
          <li key={l} aria-current={step === i + 1 ? "step" : undefined} className={`rounded-full px-3.5 py-1.5 ${step > i + 1 ? "bg-lime text-ink" : step === i + 1 ? "bg-ink text-white" : "bg-white text-grey"}`}>
            {i + 1}. {l}
          </li>
        ))}
      </ol>

      {step === 1 && (
        <Card title="Sign in with Google and connect your YouTube channel">
          <p className="m-0 text-[15px] text-grey">
            Google asks you to let Likeness <b>see your YouTube account</b> (read-only). We read your channel&apos;s name, avatar and subscriber count once, on the server,
            to show you own it. We can&apos;t post, edit or see anything private, and we don&apos;t keep the access.
          </p>
          <a href="/auth/google/start" className={pillClass("ink", "self-start")}>
            Sign in with Google
          </a>
        </Card>
      )}

      {step >= 2 && state.channel && (
        <Card title={`Channel: ${state.channel.title}`} action={<span className="text-[14px] text-grey">{state.channel.subscribers}</span>}>
          <p className="m-0 text-[14px] text-grey">Connected. Your channel avatar is what we match your live face against.</p>
        </Card>
      )}

      {step === 2 && (
        <Card title="Live face check">
          <p className="m-0 text-[15px] text-grey">Use your camera: look at it, blink, then turn slightly each way. We take three frames. Nothing is uploaded from your files.</p>
          {!capture ? (
            <LivenessCapture key={attempt} onDone={onCaptured} />
          ) : match && !match.ok ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="m-0 text-[15px] text-bad">
                Your live face didn&apos;t match your channel avatar closely enough (best match {match.score.toFixed(2)}, needs {match.threshold.toFixed(2)}). Check the light and
                that your avatar is a clear photo of you.
              </p>
              <button type="button" onClick={() => (setCapture(null), setMatch(null), setAttempt((a) => a + 1))} className={pillClass("ink", "self-start")}>
                Try again
              </button>
            </div>
          ) : (
            !match && !err && <p className="m-0 text-[15px]">Checking…</p>
          )}
          {err && capture && (
            <button type="button" onClick={() => (setCapture(null), setMatch(null), setErr(null), setAttempt((a) => a + 1))} className={pillClass("ink", "self-start")}>
              Try again
            </button>
          )}
        </Card>
      )}

      {step === 3 && capture && match && (
        <Card title="Go live">
          <p className="m-0 text-[15px] text-ok">Face matched to your channel (score {match.score.toFixed(2)}).</p>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" checked={adult} onChange={(e) => setAdult(e.target.checked)} className="mt-1 h-5 w-5" />
            <span>
              I am 18 or older <span className="text-grey">(self-declared)</span>.
            </span>
          </label>
          <label className="flex items-start gap-3 text-[15px]">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-5 w-5" />
            <span>{state.consentText}</span>
          </label>
          <p className="m-0 text-[14px] text-grey">
            Your three frames are encrypted with a key that belongs to you, itself encrypted with the server&apos;s key-encryption key. Only the render service can open
            them, and every opening is logged. The front frame becomes your public photo, labelled &ldquo;not licensed for reuse&rdquo;.
          </p>
          <button
            type="button"
            disabled={!adult || !consent || !!busy}
            onClick={() => {
              setBusy("Encrypting and going live…");
              setErr(null);
              post("/api/onboarding/golive", { frames: capture.frames, adult, consent })
                .then(() => setLive(true))
                .catch((e: Error) => setErr(e.message))
                .finally(() => setBusy(null));
            }}
            className={pillClass("lime", "self-start")}
          >
            Protect my photos and go live
          </button>
        </Card>
      )}

      {busy && (
        <p role="status" className="m-0 text-[15px] text-wait">
          {busy}
        </p>
      )}
      {err && (
        <p role="alert" className="m-0 text-[15px] text-bad">
          {err}
        </p>
      )}
    </>
  );
}
