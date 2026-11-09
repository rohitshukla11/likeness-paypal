"use client";
/** The review window's countdown; at zero it refreshes the page, whose load settles the render (auto-accept). */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Countdown({ deadline }: { deadline: string }) {
  const router = useRouter();
  const end = new Date(deadline).getTime();
  const [left, setLeft] = useState(() => Math.max(0, end - Date.now()));

  useEffect(() => {
    const t = setInterval(() => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      if (ms === 0) {
        clearInterval(t);
        setTimeout(() => router.refresh(), 1500);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [end, router]);

  const s = Math.ceil(left / 1000);
  return (
    <span className="tnum text-xs font-semibold text-warn" aria-live="polite">
      {s > 0 ? `auto-accepts in ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : "settling…"}
    </span>
  );
}
