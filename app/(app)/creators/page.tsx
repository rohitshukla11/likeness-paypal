import { redirect } from "next/navigation";
import { Suspense } from "react";
import { CreatorBrowse } from "@/components/dashboard/CreatorBrowse";
import { brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import Loading from "../loading";

/** Every creator the brand can license (like likeness-eth's /creators): search, filters, cards, Request a licence. */
export default function CreatorsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Creators />
    </Suspense>
  );
}

async function Creators() {
  const s = await getSession();
  if (!s) redirect("/");
  const v = await brandView(s.brandId);
  return (
    <div className="mx-auto flex w-full max-w-[1320px] flex-col gap-[18px] px-4 pb-12 pt-6 sm:px-8">
      <CreatorBrowse cards={v.cards} requestBase="/brand?creator=" />
    </div>
  );
}
