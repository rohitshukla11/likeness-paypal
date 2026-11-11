import type { Metadata } from "next";
import Link from "next/link";
import { btnClass, NoticePage } from "@/components/ds";
import { HeaderBar } from "@/components/site/AppHeader";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="bg-ink text-white">
        <HeaderBar />
      </div>
      <main id="main" className="flex-1 text-ink">
        <NoticePage
          title="Nothing here"
          description="Page not found (404)"
          action={
            <>
              <Link href="/" className={btnClass("ink")}>
                Home
              </Link>
              <Link href="/verify" className={btnClass("outline")}>
                Verify an ad
              </Link>
            </>
          }
        >
          That page does not exist. If you followed a link to a receipt, check the address, or look the ad up on Verify.
        </NoticePage>
      </main>
    </div>
  );
}
