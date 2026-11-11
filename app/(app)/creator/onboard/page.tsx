/**
 * Creator onboarding, behind FEATURE_CREATOR_ONBOARDING (off by default: the demo personas are the default).
 * About two minutes, resumable (progress is saved server-side):
 *   1. Sign in with Google and connect YouTube (read-only): proves the channel is yours; its avatar must show a face.
 *   2. Live face check: blink and turn, three frames, matched to your channel avatar on the server.
 *   3. Self-declared 18+, consent, then "Protect my photos and go live".
 */
import { Suspense } from "react";
import { AppPage, Card } from "@/components/ds";
import { Notice } from "@/app/notice";
import { CONSENT_TEXT, subscriberLabel } from "@/lib/model";
import { oauthClient, onboardingEnabled } from "@/lib/onboarding/google";
import { onboardingCreator } from "@/lib/onboarding/session";
import { OnboardFlow } from "./flow";

export default function OnboardPage(props: PageProps<"/creator/onboard">) {
  return (
    <AppPage title="Become a creator" description="Verify your likeness: Google sign-in, your YouTube channel, and a live face check. About two minutes.">
      <Suspense fallback={<p className="text-sm text-grey">Loading…</p>}>
        <Onboard {...props} />
      </Suspense>
    </AppPage>
  );
}

async function Onboard({ searchParams }: PageProps<"/creator/onboard">) {
  const q = await searchParams;
  if (!onboardingEnabled())
    return (
      <Card title="Creator onboarding is off in this demo">
        <p className="m-0 text-[15px] text-grey">
          The demo uses a seeded creator, Rohit. Real onboarding (Google sign-in, YouTube verification and a live face check) is built and turned on with
          FEATURE_CREATOR_ONBOARDING=1.
        </p>
      </Card>
    );
  const { creator } = await onboardingCreator();
  return (
    <>
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
    </>
  );
}
