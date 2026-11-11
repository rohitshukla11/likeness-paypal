/**
 * Creator onboarding, behind FEATURE_CREATOR_ONBOARDING (off by default: the demo personas are the default).
 * About two minutes, resumable (progress is saved server-side):
 *   1. Sign in with Google and connect YouTube (read-only): proves the channel is yours; its avatar must show a face.
 *   2. Live face check: blink and turn, three frames, matched to your channel avatar on the server.
 *   3. Self-declared 18+, consent, then "Protect my photos and go live".
 */
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { AppPage } from "@/components/ds";
import { Notice } from "@/app/notice";
import { CONSENT_TEXT, subscriberLabel } from "@/lib/model";
import { oauthClient, onboardingEnabled } from "@/lib/onboarding/google";
import { onboardingCreator } from "@/lib/onboarding/session";
import { OnboardFlow } from "./flow";

export default function OnboardPage(props: PageProps<"/creator/onboard">) {
  return (
    <Suspense fallback={<p className="px-4 py-8 text-sm text-grey">Loading…</p>}>
      <Onboard {...props} />
    </Suspense>
  );
}

async function Onboard({ searchParams }: PageProps<"/creator/onboard">) {
  const q = await searchParams;
  // Off (the live demo): no onboarding page and no Google sign-in anywhere; "Continue as Creator" is the demo persona.
  if (!onboardingEnabled()) notFound();
  const { creator } = await onboardingCreator();
  return (
    <AppPage title="Become a creator" description="Verify your likeness: Google sign-in, your YouTube channel, and a live face check. About two minutes.">
      <Notice ok={q.ok ? "Signed in and your channel is connected." : undefined} error={q.error} />
      {!oauthClient() && <Notice error="Google sign-in isn't configured on this server (GOOGLE_OAUTH_CLIENT_ID / GOOGLE_OAUTH_CLIENT_SECRET)." />}
      <OnboardFlow
        state={{
          signedIn: !!creator,
          channel: creator?.channel ? { title: creator.channel.title, subscribers: subscriberLabel(creator.channel.subscriberCount) } : null,
          live: creator?.status === "live",
          consentText: CONSENT_TEXT,
        }}
      />
    </AppPage>
  );
}
