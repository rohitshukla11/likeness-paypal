import Link from "next/link";

export const SOURCE_URL = "https://github.com/rohitshukla11/likeness-paypal";

/** Footer from the landing mockup, shared by every page. */
export function SiteFooter() {
  return (
    <footer className="on-dark bg-ink text-white">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-12 px-4 pb-9 pt-[72px] sm:px-8">
        <div className="flex flex-wrap justify-between gap-8">
          <h2 className="m-0 font-display text-[clamp(22px,3vw,30px)] font-extrabold leading-[1.3]">
            THE FUTURE OF YOUR
            <br />
            LIKENESS IS YOURS
          </h2>
          <div className="flex max-w-[520px] flex-col gap-3 text-[15px] text-grey-dark">
            <span className="text-white">License your face to AI ads. Get paid per ad, through PayPal.</span>
            <span>PayPal sandbox only · demo renders are pre-generated images (no AI calls) · built for the PayPal AI Hackathon</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-4 border-t border-ink-line pt-6 text-[14px] text-grey-dark">
          <span className="flex flex-wrap gap-x-6 gap-y-1">
            <Link href="/#how" className="inline-flex min-h-11 items-center text-grey-dark hover:text-white">
              How it works
            </Link>
            <Link href="/verify" className="inline-flex min-h-11 items-center text-grey-dark hover:text-white">
              Verify an ad
            </Link>
            <a href="/api/receipts/public-key" className="inline-flex min-h-11 items-center text-grey-dark hover:text-white">
              Receipt public key
            </a>
            <a href={SOURCE_URL} className="inline-flex min-h-11 items-center text-grey-dark hover:text-white" target="_blank" rel="noreferrer">
              Source<span className="sr-only"> (opens GitHub)</span>
            </a>
          </span>
          <span className="inline-flex min-h-11 items-center">© 2026 Likeness</span>
        </div>
      </div>
    </footer>
  );
}
