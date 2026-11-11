import { Suspense } from "react";
import { AppHeader, HeaderBar } from "@/components/site/AppHeader";
import { getSession } from "@/lib/session";

/** Every app page: the dark nav bar, then compact content on the off-white ground. */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="bg-ink text-white">
        {/* The persona switcher reads the session cookie, so it streams in; until then the bar shows no persona. */}
        <Suspense fallback={<HeaderBar />}>
          <HeaderWithSession />
        </Suspense>
      </div>
      <main id="main" className="flex-1 text-ink">
        {children}
      </main>
    </div>
  );
}

async function HeaderWithSession() {
  const s = await getSession();
  return <AppHeader session={s ? { role: s.role } : null} />;
}
