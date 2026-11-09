/** The ?ok= / ?error= banner after a form action (rendered inside a page's Suspense boundary). */
export function Notice({ ok, error }: { ok?: string | string[]; error?: string | string[] }) {
  const o = Array.isArray(ok) ? ok[0] : ok;
  const e = Array.isArray(error) ? error[0] : error;
  if (!o && !e) return null;
  return (
    <p role={e ? "alert" : "status"} className={`mb-4 rounded-xl px-4 py-3 text-sm font-medium ${e ? "bg-bad-soft text-bad" : "bg-good-soft text-good"}`}>
      {e ?? o}
    </p>
  );
}
