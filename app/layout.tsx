import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import { Suspense } from "react";
import { continueAs, resetDemo } from "./actions";
import "./globals.css";
import { getSession } from "@/lib/session";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Likeness × PayPal",
  description: "License your face to AI ads, paid with PayPal: approved once, charged per render, paid out per accepted ad.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh font-sans">
        <header className="sticky top-0 z-10 border-b border-line bg-white/90 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-2 px-4 py-3">
            <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-ink no-underline">
              <span aria-hidden="true" className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-brand text-sm text-white">
                L
              </span>
              Likeness <span className="font-medium text-muted">× PayPal</span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1.5 text-sm">
              <Suspense fallback={null}>
                <Personas />
              </Suspense>
              <Link href="/verify" className="rounded-lg px-2.5 py-1.5 font-medium text-muted hover:bg-paper hover:text-ink">
                Verify
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
        <footer className="mx-auto max-w-6xl px-4 pb-10 text-xs text-muted">
          PayPal sandbox only. Demo renders are pre-generated images (no AI calls). Built for the PayPal AI Hackathon.
        </footer>
      </body>
    </html>
  );
}

/** Persona switcher and Reset (reads the session cookie, so it streams in behind Suspense). */
async function Personas() {
  const s = await getSession();
  if (!s) return null;
  const tab = (role: "brand" | "creator", label: string) => (
    <form action={continueAs.bind(null, role)}>
      <button className={`rounded-lg px-2.5 py-1.5 font-medium ${s.role === role ? "bg-brand-soft text-brand" : "text-muted hover:bg-paper hover:text-ink"} cursor-pointer`}>{label}</button>
    </form>
  );
  return (
    <>
      {tab("brand", "Brand")}
      {s.role === "brand" && (
        <Link href="/brand/studio" className="rounded-lg px-2.5 py-1.5 font-medium text-muted hover:bg-paper hover:text-ink">
          Studio
        </Link>
      )}
      {tab("creator", "Creator")}
      <form action={resetDemo}>
        <button className="rounded-lg px-2.5 py-1.5 font-medium text-muted hover:bg-paper hover:text-bad cursor-pointer" title="Start a fresh demo workspace">
          Reset demo
        </button>
      </form>
    </>
  );
}
