import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CreatorHome } from "@/components/dashboard/CreatorHome";
import { geminiConfigured } from "@/lib/ai/gemini";
import { engineDeps, settle } from "@/lib/engine";
import { onboardingEnabled } from "@/lib/onboarding/google";
import { creatorView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { Notice } from "@/app/notice";
import Loading from "../loading";

export default function CreatorPage(props: PageProps<"/creator">) {
  return (
    <Suspense fallback={<Loading />}>
      <Creator {...props} />
    </Suspense>
  );
}

async function Creator({ searchParams }: PageProps<"/creator">) {
  const s = await getSession();
  if (!s) redirect("/");
  await settle(engineDeps()).catch(() => []); // renders past their review window are auto-accepted on load
  const q = await searchParams;
  const v = await creatorView(s.creatorId);
  return <CreatorHome v={v} notice={<Notice ok={q.ok} error={q.error} />} reviewEnabled={geminiConfigured()} onboardingLink={onboardingEnabled() && !v.creator.googleSub} />;
}
