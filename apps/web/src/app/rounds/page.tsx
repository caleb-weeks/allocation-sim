"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABEL } from "@/lib/format";

interface RoundSummary {
  id: string;
  title: string;
  key: string | null;
  role: keyof typeof ROLE_LABEL;
  createdAt: string;
}

export default function RoundsPage() {
  const [rounds, setRounds] = useState<RoundSummary[] | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ rounds: RoundSummary[] }>("/rounds")
      .then((r) => setRounds(r.rounds))
      .catch((e) => (e instanceof ApiError && e.status === 401 ? setSignedOut(true) : setError("Couldn't load your rounds.")));
  }, []);

  if (signedOut) {
    return (
      <p className="text-ink-2">
        <Link href="/login" className="underline underline-offset-2">Sign in</Link> or{" "}
        <Link href="/" className="underline underline-offset-2">try the demo</Link> to see rounds.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold">Your rounds</h1>
        {error && <p className="text-sm text-critical">{error}</p>}
        {rounds === null ? (
          <p className="text-sm text-muted">Loading…</p>
        ) : rounds.length === 0 ? (
          <p className="text-sm text-ink-2">You aren&apos;t in any rounds yet. Start one, or ask an owner to add you.</p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {rounds.map((r) => (
              <li key={r.id}>
                <Link href={`/rounds/${r.id}`} className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-surface-2">
                  <span className="font-medium">{r.title}</span>
                  <span className="text-sm text-ink-2">{ROLE_LABEL[r.role]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {rounds !== null && !rounds.some((r) => r.key?.startsWith("demo-")) && (
        <p>
          <Link href="/rounds/new" className="rounded-md bg-button px-3 py-2 font-medium text-button-ink">
            Start a new round
          </Link>
        </p>
      )}
    </div>
  );
}
