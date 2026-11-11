import { Suspense } from "react";
import { pillClass } from "@/components/ds";
import { Landing } from "@/components/landing/Landing";
import { getSession } from "@/lib/session";
import { resetDemo } from "./actions";

export default function Home() {
  return (
    <Landing
      account={
        <Suspense fallback={null}>
          <Account />
        </Suspense>
      }
    />
  );
}

/** With a workspace already (cookie), the hero bar also offers Reset demo; reading the cookie streams in. */
async function Account() {
  const s = await getSession();
  if (!s) return null;
  return (
    <form action={resetDemo}>
      <button title="Start a fresh demo workspace (nothing is deleted)" className={pillClass("outline-dark", "cursor-pointer px-5 text-[14px]")}>
        Reset demo
      </button>
    </form>
  );
}
