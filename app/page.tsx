import Image from "next/image";
import { continueAs } from "./actions";
import { btn } from "./ui";

export default function Home() {
  return (
    <main id="main" className="bg-paper px-4 py-8">
    <div className="mx-auto flex max-w-6xl flex-col gap-10">
      <section className="grid items-center gap-8 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-5">
          <span className="w-fit rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-brand">PayPal sandbox demo</span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-5xl">License your face to AI ads. Get paid per ad, through PayPal.</h1>
          <p className="max-w-xl text-base text-muted">
            The creator approves a licence once. The brand approves a mandate once and saves its PayPal wallet. Every ad is then authorized, rendered,
            checked and captured, and the creator is paid 90% the moment the brand accepts it. Revoke the licence and the next render is refused before
            any money moves.
          </p>
          <div className="flex flex-wrap gap-3">
            <form action={continueAs.bind(null, "brand")}>
              <button className={btn.primary}>Continue as Brand</button>
            </form>
            <form action={continueAs.bind(null, "creator")}>
              <button className={btn.ghost}>Continue as Creator</button>
            </form>
          </div>
          <p className="text-xs text-muted">Each visitor gets a private demo workspace with a creator (Rohit) and a demo brand. No sign-up.</p>
        </div>
        <div className="relative mx-auto w-full max-w-sm">
          <Image src="/demo/ad-1.svg" alt="A demo ad render: a portrait next to a coffee cup, labelled AI-generated" width={720} height={720} priority className="w-full rounded-3xl shadow-lg" />
          <div className="absolute -bottom-4 -left-4 flex items-center gap-3 rounded-2xl border border-line bg-white p-3 shadow-md">
            <Image src="/demo/rohit.svg" alt="" width={40} height={50} className="h-10 w-10 rounded-full object-cover" />
            <div className="text-xs">
              <p className="font-semibold">Licensed · receipt signed</p>
              <p className="text-muted">Captured $2.00 · paid Rohit $1.80</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["1. Policy", "Licence active, use allowed, cap, the mandate's per-render, daily and total limits, all in one database transaction. Any refusal: no PayPal call."],
          ["2. Authorize", "An order on the brand's saved PayPal wallet (Vault), intent AUTHORIZE."],
          ["3. Render, check, capture", "The ad is rendered and checked; then captured. A failed render or check voids the authorization."],
          ["4. Review, payout, receipt", "Accept pays the creator 90% (PayPal Payouts); Reject refunds. No answer in time: auto-accept. Every outcome gets a signed receipt."],
        ].map(([t, d]) => (
          <div key={t} className="rounded-2xl border border-line bg-white p-4">
            <p className="font-semibold">{t}</p>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </div>
        ))}
      </section>
    </div>
    </main>
  );
}
