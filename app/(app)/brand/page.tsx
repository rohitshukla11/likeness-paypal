import { redirect } from "next/navigation";
import { Suspense } from "react";
import { BrandHome } from "@/components/dashboard/BrandHome";
import { brandRenders, brandView } from "@/lib/queries";
import { getSession } from "@/lib/session";
import { demoWalletAvailable } from "@/lib/wallet";
import { Notice } from "@/app/notice";
import Loading from "../loading";

export default function BrandPage(props: PageProps<"/brand">) {
  return (
    <Suspense fallback={<Loading />}>
      <Brand {...props} />
    </Suspense>
  );
}

async function Brand({ searchParams }: PageProps<"/brand">) {
  const s = await getSession();
  if (!s) redirect("/");
  const q = await searchParams;
  const [v, renders] = await Promise.all([brandView(s.brandId), brandRenders(s.brandId)]);
  const picked = typeof q.creator === "string" ? q.creator : null;
  return <BrandHome v={v} renders={renders} notice={<Notice ok={q.ok} error={q.error} />} demoWallet={demoWalletAvailable()} picked={picked} />;
}
