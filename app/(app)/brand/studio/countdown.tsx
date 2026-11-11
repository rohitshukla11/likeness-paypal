"use client";
/**
 * The review window's countdown; at zero it refreshes the page, whose load settles the render (auto-accept).
 * The server render and the first client render show the same text (the deadline itself), and the ticking
 * countdown starts after hydration: computed from Date.now() during render, the server and the browser could land
 * on either side of a second boundary and disagree, which React reports as a hydration mismatch.
 */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export function Countdown({ deadline }: { deadline: string }) {
  const router = useRouter();
  const end = new Date(deadline).getTime();
  const [left, setLeft] = useState<number | null>(null); // null until mounted: identical on server and client

  useEffect(() => {
    const tick = () => {
      const ms = Math.max(0, end - Date.now());
      setLeft(ms);
      return ms;
    };
    const first = setTimeout(tick, 0);
    const t = setInterval(() => {
      if (tick() === 0) {
        clearInterval(t);
        setTimeout(() => router.refresh(), 1500);
      }
    }, 1000);
    return () => {
      clearTimeout(first);
      clearInterval(t);
    };
  }, [end, router]);

  const text =
    left === null
      ? `auto-accepts at ${deadline.slice(11, 19)} UTC`
      : left > 0
        ? `auto-accepts in ${Math.floor(Math.ceil(left / 1000) / 60)}:${String(Math.ceil(left / 1000) % 60).padStart(2, "0")}`
        : "settling…";
  return (
    <span className="tnum text-[13px] font-semibold text-wait" aria-live="polite">
      {text}
    </span>
  );
}
