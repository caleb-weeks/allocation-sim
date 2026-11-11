"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Persona, api } from "@/lib/api";
import { announceAuthChange } from "@/lib/session";

const WHAT_YOU_CAN_DO: Record<Persona["role"], string> = {
  OWNER: "See everything, including every funder's trust weights and the activity log.",
  FUNDER: "Decide how much you trust each recommender. Your budget follows your trust.",
  RECOMMENDER: "Draw how much each extra dollar is worth to you for each project.",
  OBSERVER: "Watch the results update live. You don't see anyone's curves.",
};

/** One-click sign-in as a persona in a sample's shared demo round. */
export function DemoPicker({ sample }: { sample: string }) {
  const [demo, setDemo] = useState<{ roundId: string; personas: Persona[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    api<{ roundId: string; personas: Persona[] }>(`/auth/demo-personas?sample=${encodeURIComponent(sample)}`)
      .then(setDemo)
      .catch(() => setError("The demo server isn't reachable right now."));
  }, [sample]);

  async function enter(p: Persona) {
    if (!demo) return;
    setBusy(p.email);
    try {
      await api("/auth/demo", { method: "POST", body: { email: p.email } });
      announceAuthChange();
      router.push(`/rounds/${demo.roundId}`);
    } catch {
      setError("Couldn't start the demo. Try again in a moment.");
      setBusy(null);
    }
  }

  if (error) return <p className="text-sm text-critical">{error}</p>;
  if (!demo) return <p className="text-sm text-muted">Loading demo roles…</p>;

  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {demo.personas.map((p) => (
        <li key={p.email}>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => enter(p)}
            className="flex h-full w-full flex-col items-start gap-1 rounded-lg border border-border bg-surface p-4 text-left transition hover:border-ink-2 disabled:opacity-60"
          >
            <span className="text-xs font-medium uppercase tracking-wide text-muted">{p.role.toLowerCase()}</span>
            <span className="font-semibold">{p.displayName}</span>
            <span className="text-sm text-ink-2">{p.lens ?? WHAT_YOU_CAN_DO[p.role]}</span>
            {busy === p.email && <span className="text-xs text-muted">Signing in…</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
