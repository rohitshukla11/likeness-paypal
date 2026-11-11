import { ErrorCard } from "@/components/ds";

/** The ?ok= / ?error= banner after a form action (rendered inside a page's Suspense boundary). */
export function Notice({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(error) ? error[0] : error;
  if (e) return <ErrorCard>{e}</ErrorCard>;
  if (!o) return null;
  return (
    <p role="status" className="m-0 rounded-[20px] bg-ok-bg p-[18px] text-[14px] font-medium text-ok sm:px-5">
      {o}
    </p>
  );
}
