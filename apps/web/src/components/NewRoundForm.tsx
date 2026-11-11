"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ApiError, type User, api } from "@/lib/api";
import { money } from "@/lib/format";

type SampleOption = { id: string; title: string; valueUnit: string; applications: { name: string; cap: number }[] };
type Row = { key: number; name: string; cap: string };

const MAX_PROJECTS = 50;
let nextKey = 0;
const row = (name = "", cap = ""): Row => ({ key: nextKey++, name, cap });

export function NewRoundForm({ samples }: { samples: SampleOption[] }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [title, setTitle] = useState("");
  const [start, setStart] = useState<string>("scratch");
  const [valueUnit, setValueUnit] = useState("");
  const [rows, setRows] = useState<Row[]>([row(), row()]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<{ user: User | null }>("/auth/me")
      .then((r) => setUser(r.user))
      .catch(() => setUser(null));
    const from = new URLSearchParams(window.location.search).get("from");
    if (from && samples.some((s) => s.id === from)) setStart(from);
  }, [samples]);

  const sample = samples.find((s) => s.id === start) ?? null;
  const next = `/rounds/new${sample ? `?from=${sample.id}` : ""}`;

  if (user === undefined) return <p className="text-sm text-muted">Loading…</p>;
  if (!user || user.isDemo) {
    return (
      <div className="max-w-xl space-y-3">
        <h1 className="text-2xl font-semibold">Start your own round</h1>
        <p className="text-ink-2">
          {user?.isDemo
            ? "You're signed in as a demo persona, which can't own rounds. Sign out, then create a free account."
            : "Your own rounds need a free account, so the people you invite can sign in to them."}
        </p>
        {!user?.isDemo && (
          <p className="flex gap-3">
            <Link href={`/register?next=${encodeURIComponent(next)}`} className="rounded-md bg-button px-3 py-2 font-medium text-button-ink">
              Create an account
            </Link>
            <Link href={`/login?next=${encodeURIComponent(next)}`} className="rounded-md border border-border px-3 py-2 font-medium">
              Sign in
            </Link>
          </p>
        )}
      </div>
    );
  }

  function copySample(s: SampleOption) {
    setValueUnit(s.valueUnit);
    setRows(s.applications.map((a) => row(a.name, String(a.cap))));
    setStart("scratch");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    let body: object;
    if (sample) {
      body = { title, template: sample.id };
    } else {
      const applications = rows.filter((r) => r.name.trim() || r.cap.trim()).map((r) => ({ name: r.name.trim(), cap: Math.round(Number(r.cap)) }));
      if (applications.length === 0) return setError("Add at least one project.");
      if (applications.some((a) => !a.name || !Number.isFinite(a.cap) || a.cap < 1)) return setError("Every project needs a name and an amount of at least $1.");
      body = { title, valueUnit, applications };
    }
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/rounds", { method: "POST", body });
      router.push(`/rounds/${id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the round.");
      setBusy(false);
    }
  }

  const input = "w-full rounded-md border border-border bg-surface px-3 py-2";
  return (
    <form onSubmit={submit} className="max-w-3xl space-y-8">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Start your own round</h1>
        <p className="text-ink-2">
          You&apos;ll be the owner. After it&apos;s created, add funders and recommenders from the round&apos;s People panel by
          the email they signed up with; recommenders then draw their own curves.
        </p>
      </header>

      <label className="block max-w-md space-y-1">
        <span className="text-sm font-medium">Round title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} placeholder="e.g. 2027 community grants" className={input} />
      </label>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium">Projects</legend>
        <div className="flex flex-wrap gap-2">
          {[{ id: "scratch", title: "My own list" }, ...samples].map((s) => (
            <label
              key={s.id}
              className={`cursor-pointer rounded-md border px-3 py-1.5 text-sm ${start === s.id ? "border-ink bg-surface-2 font-medium" : "border-border bg-surface text-ink-2"}`}
            >
              <input type="radio" name="start" value={s.id} checked={start === s.id} onChange={() => setStart(s.id)} className="sr-only" />
              {s.id === "scratch" ? s.title : `Sample: ${s.title}`}
            </label>
          ))}
        </div>

        {sample ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <p className="text-sm text-ink-2">
              Copies the sample&apos;s {sample.applications.length} projects, their caps and data notes. Value is measured in{" "}
              <span className="font-medium text-ink">{sample.valueUnit}</span>. Curves and people aren&apos;t copied.
            </p>
            <ul className="max-h-64 divide-y divide-border overflow-y-auto text-sm">
              {sample.applications.map((a) => (
                <li key={a.name} className="flex justify-between gap-4 py-1.5">
                  <span>{a.name}</span>
                  <span className="tabular text-ink-2">{money(a.cap)}</span>
                </li>
              ))}
            </ul>
            <button type="button" onClick={() => copySample(sample)} className="text-sm underline underline-offset-2">
              Edit this list instead
            </button>
          </div>
        ) : (
          <div className="space-y-4 rounded-lg border border-border bg-surface p-4">
            <label className="block max-w-md space-y-1">
              <span className="text-sm font-medium">What does a recommender&apos;s curve measure?</span>
              <input
                value={valueUnit}
                onChange={(e) => setValueUnit(e.target.value)}
                required
                maxLength={60}
                placeholder="e.g. students served per $1,000"
                className={input}
              />
            </label>
            <div className="space-y-2">
              <div className="grid grid-cols-[1fr_9rem_2rem] gap-2 text-xs text-muted">
                <span>Project</span>
                <span>Most it could use ($)</span>
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className="grid grid-cols-[1fr_9rem_2rem] gap-2">
                  <input
                    aria-label={`Project ${i + 1} name`}
                    value={r.name}
                    maxLength={80}
                    onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, name: e.target.value } : x)))}
                    className={input}
                  />
                  <input
                    aria-label={`Project ${i + 1} most it could use, in dollars`}
                    value={r.cap}
                    inputMode="numeric"
                    onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, cap: e.target.value.replace(/[^0-9]/g, "") } : x)))}
                    className={`${input} tabular`}
                  />
                  <button
                    type="button"
                    aria-label={`Remove project ${i + 1}`}
                    disabled={rows.length === 1}
                    onClick={() => setRows(rows.filter((x) => x.key !== r.key))}
                    className="rounded-md text-ink-2 hover:text-ink disabled:opacity-30"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                disabled={rows.length >= MAX_PROJECTS}
                onClick={() => setRows([...rows, row()])}
                className="text-sm underline underline-offset-2 disabled:opacity-50"
              >
                Add a project
              </button>
            </div>
          </div>
        )}
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-critical">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className="rounded-md bg-button px-4 py-2 font-medium text-button-ink disabled:opacity-60">
        {busy ? "Creating…" : "Create round"}
      </button>
    </form>
  );
}
