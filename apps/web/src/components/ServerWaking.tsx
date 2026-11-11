"use client";

import { useEffect, useState } from "react";
import { API_URL } from "@/lib/api";

/**
 * The API runs on a free host that sleeps after 15 idle minutes and takes about a minute to wake.
 * Ping /health on load (which also starts the wake-up early) and, if it's slow, say why.
 */
export function ServerWaking() {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    let done = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const notice = setTimeout(() => !done && setSlow(true), 2500);

    async function ping() {
      try {
        const res = await fetch(`${API_URL}/health`, { cache: "no-store" });
        const body = (await res.json()) as { ok?: boolean };
        if (body.ok) {
          done = true;
          clearTimeout(notice);
          setSlow(false);
          return;
        }
      } catch {
        // Not up yet (or the host's wake-up page answered instead of the API).
      }
      if (!done) retry = setTimeout(ping, 3000);
    }
    void ping();

    return () => {
      done = true;
      clearTimeout(notice);
      clearTimeout(retry);
    };
  }, []);

  if (!slow) return null;
  return (
    <div role="status" className="border-b border-border bg-surface-2 px-4 py-2 text-center text-sm text-ink-2">
      Waking up the demo server. It sleeps when nobody&apos;s using it and takes up to a minute to start.
    </div>
  );
}
