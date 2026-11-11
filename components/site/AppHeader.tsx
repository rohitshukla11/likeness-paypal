"use client";

/**
 * The app header: home mark, destinations, and the demo persona (Brand or Creator) with Reset demo. The persona
 * tabs and Reset are forms posting the server actions in app/actions.ts, so they work before hydration too.
 * `session` is undefined while the session streams in, null without one. AppHeader reads the path for the current
 * tab; HeaderBar is the same bar without it, for Suspense fallbacks (the path is request data on dynamic routes).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { continueAs, resetDemo } from "@/app/actions";
import { pillClass } from "@/components/ds";
import { IconPerson } from "@/components/ds/icons";
import type { Role } from "@/lib/session";

const tab = (on: boolean) => `min-h-11 cursor-pointer bg-transparent px-0 py-3 font-medium no-underline ${on ? "border-b-2 border-lime text-lime" : "text-white hover:text-lime"}`;

export function AppHeader({ session }: { session?: { role: Role } | null }) {
  return <HeaderBar session={session} path={usePathname()} />;
}

export function HeaderBar({ session, path = "" }: { session?: { role: Role } | null; path?: string }) {
  const on = (href: string) => path === href || path.startsWith(`${href}/`);
  const role = session?.role;
  return (
    <header className="on-dark border-b border-ink-line text-white">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-7 gap-y-3 px-4 py-[18px] sm:px-8">
        <Link href="/" aria-label="Likeness × PayPal home" className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-raised text-white">
          <IconPerson size={20} />
        </Link>
        <nav aria-label="App" className="order-3 flex w-full flex-wrap items-center gap-x-5 gap-y-1 text-[14px] font-medium sm:order-none sm:w-auto sm:flex-1 sm:gap-x-7 sm:text-[15px]">
          {session ? (
            <>
              <form action={continueAs.bind(null, "brand")}>
                <button aria-current={path === "/brand" ? "page" : undefined} className={tab(path === "/brand" || on("/paypal"))}>
                  Brand
                </button>
              </form>
              {role === "brand" && (
                <Link href="/brand/studio" aria-current={on("/brand/studio") ? "page" : undefined} className={tab(on("/brand/studio"))}>
                  Studio
                </Link>
              )}
              <form action={continueAs.bind(null, "creator")}>
                <button aria-current={on("/creator") ? "page" : undefined} className={tab(on("/creator"))}>
                  Creator
                </button>
              </form>
            </>
          ) : (
            <Link href="/#how" className={tab(false)}>
              How it works
            </Link>
          )}
          <Link href="/verify" aria-current={on("/verify") ? "page" : undefined} className={tab(on("/verify"))}>
            Verify
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {session ? (
            <>
              <span className="hidden text-[14px] text-grey-dark sm:inline">{role === "creator" ? "Creator" : "Brand"} · demo workspace</span>
              <form action={resetDemo}>
                <button title="Start a fresh demo workspace (nothing is deleted)" className={pillClass("white", "min-h-11 cursor-pointer px-4 text-[14px]")}>
                  Reset demo
                </button>
              </form>
            </>
          ) : session === null ? (
            <form action={continueAs.bind(null, "brand")}>
              <button className={pillClass("lime", "min-h-11 cursor-pointer px-5 text-[14px]")}>Continue as Brand</button>
            </form>
          ) : null}
        </div>
      </div>
    </header>
  );
}
