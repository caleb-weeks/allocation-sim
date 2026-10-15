"use client";

import type { RoundView } from "@allocation-sim/api/protocol";
import { useEffect, useState } from "react";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABEL, money, moneyExact, pct } from "@/lib/format";

export function Card({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function StatTiles({ tiles }: { tiles: { label: string; value: string; note?: string }[] }) {
  return (
    <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="rounded-lg border border-border bg-surface p-3">
          <dt className="text-xs text-ink-2">{t.label}</dt>
          <dd className="text-2xl font-semibold">{t.value}</dd>
          {t.note && <dd className="text-xs text-muted">{t.note}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** A funder's trust sliders. Changes preview live; releasing a slider saves it. */
export function TrustPanel({
  view,
  colors,
  draft,
  onDraft,
  onSave,
}: {
  view: RoundView;
  colors: Record<string, string>;
  draft: Record<string, number> | null;
  onDraft: (trust: Record<string, number>) => void;
  onSave: (trust: Record<string, number>) => void;
}) {
  const me = view.members.find((m) => m.id === view.me.membershipId)!;
  const recs = view.members.filter((m) => m.role === "RECOMMENDER");
  const saved = Object.fromEntries(recs.map((r) => [r.id, view.trust.find((t) => t.funderId === me.id && t.recommenderId === r.id)?.weight ?? 0]));
  const trust = draft ?? saved;
  const total = Object.values(trust).reduce((a, b) => a + b, 0);
  const budget = me.budget ?? 0;

  return (
    <Card title="Your trust" aside={<span className="text-sm text-ink-2">Budget {money(budget)}</span>}>
      <p className="mb-3 text-sm text-ink-2">Your budget is split across recommenders in proportion to how much you trust each one.</p>
      <ul className="space-y-3">
        {recs.map((r) => {
          const w = trust[r.id] ?? 0;
          const share = total > 0 ? w / total : 0;
          return (
            <li key={r.id}>
              <label className="block text-sm">
                <span className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: colors[r.id] }} aria-hidden />
                    {r.displayName}
                  </span>
                  <span className="tabular text-ink-2">
                    {w.toFixed(1)} · {pct(share)} · {money(budget * share)}
                  </span>
                </span>
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={0.5}
                  value={w}
                  className="mt-1 w-full accent-[var(--ink)]"
                  onChange={(e) => onDraft({ ...trust, [r.id]: Number(e.target.value) })}
                  onPointerUp={() => onSave(trust)}
                  onKeyUp={() => onSave(trust)}
                />
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

const ROLES = ["OWNER", "FUNDER", "RECOMMENDER", "OBSERVER"] as const;

export function MembersPanel({ view, colors, online }: { view: RoundView; colors: Record<string, string>; online: Set<string> }) {
  const [error, setError] = useState<string | null>(null);
  const manage = view.permissions.manageMembers;
  const base = `/rounds/${view.round.id}/members`;

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Something went wrong");
    }
  }

  return (
    <Card title="People">
      <ul className="space-y-2 text-sm">
        {view.members.map((m) => (
          <li key={m.id} className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-block h-2 w-2 rounded-full ${online.has(m.id) ? "bg-good" : "bg-axis"}`}
              title={online.has(m.id) ? "Online" : "Offline"}
              aria-label={online.has(m.id) ? "online" : "offline"}
            />
            {m.role === "RECOMMENDER" && <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: colors[m.id] }} aria-hidden />}
            <span className="font-medium">{m.displayName}</span>
            {m.id === view.me.membershipId && <span className="text-xs text-muted">(you)</span>}
            <span className="ml-auto text-xs text-ink-2">
              {manage && m.id !== view.me.membershipId ? (
                <select
                  aria-label={`Role for ${m.displayName}`}
                  value={m.role}
                  className="rounded border border-border bg-surface px-1 py-0.5"
                  onChange={(e) =>
                    run(() =>
                      confirm(`Change ${m.displayName} to ${e.target.value.toLowerCase()}? Their curves or trust for the old role are deleted.`)
                        ? api(`${base}/${m.id}`, { method: "PATCH", body: { role: e.target.value } })
                        : Promise.resolve(),
                    )
                  }
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </select>
              ) : (
                ROLE_LABEL[m.role]
              )}
              {m.role === "FUNDER" && m.budget !== null && ` · ${money(m.budget)}`}
            </span>
            {manage && m.id !== view.me.membershipId && (
              <button
                type="button"
                className="text-xs text-critical underline-offset-2 hover:underline"
                onClick={() => run(() => (confirm(`Remove ${m.displayName} from this round?`) ? api(`${base}/${m.id}`, { method: "DELETE" }) : Promise.resolve()))}
              >
                Remove
              </button>
            )}
            {m.lens && <p className="w-full pl-4 text-xs text-ink-2">{m.lens}</p>}
          </li>
        ))}
      </ul>
      {manage && (
        <form
          className="mt-4 grid gap-2 border-t border-border pt-4 text-sm"
          action={(form) =>
            run(async () => {
              const role = String(form.get("role"));
              await api(base, {
                method: "POST",
                body: {
                  email: form.get("email"),
                  displayName: form.get("displayName"),
                  role,
                  ...(role === "FUNDER" ? { budget: Number(form.get("budget") || 0) } : {}),
                },
              });
            })
          }
        >
          <span className="font-medium">Add someone</span>
          <input name="email" type="email" required placeholder="Their account email" className="rounded-md border border-border bg-surface px-2 py-1.5" />
          <input name="displayName" required placeholder="Name in this round" className="rounded-md border border-border bg-surface px-2 py-1.5" />
          <div className="flex gap-2">
            <select name="role" className="rounded-md border border-border bg-surface px-2 py-1.5">
              {ROLES.filter((r) => r !== "OWNER").map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
            <input name="budget" type="number" min={0} step={1000} placeholder="Budget (funders)" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5" />
          </div>
          <button type="submit" className="rounded-md bg-button px-3 py-1.5 font-medium text-button-ink">
            Add
          </button>
        </form>
      )}
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
    </Card>
  );
}

interface AuditEvent {
  id: string;
  action: string;
  createdAt: string;
  actor: { name: string };
}

export function ActivityPanel({ roundId, version }: { roundId: string; version: unknown }) {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  useEffect(() => {
    api<{ events: AuditEvent[] }>(`/rounds/${roundId}/audit`)
      .then((r) => setEvents(r.events.slice(0, 15)))
      .catch(() => setEvents([]));
  }, [roundId, version]);
  return (
    <Card title="Activity" aside={<span className="text-xs text-muted">Owners only</span>}>
      {events === null ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : events.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {events.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span>
                <span className="text-ink">{e.actor.name}</span> <span className="text-ink-2">{e.action.replace(".", " ")}</span>
              </span>
              <time className="tabular shrink-0 text-muted" dateTime={e.createdAt}>
                {new Date(e.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
              </time>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

interface Snapshot {
  id: string;
  label: string;
  method: string;
  createdAt: string;
  result: { grants: Record<string, number> };
}

export function SnapshotsPanel({ view, method }: { view: RoundView; method: "roundRobin" | "pooled" }) {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    api<{ snapshots: Snapshot[] }>(`/rounds/${view.round.id}/snapshots`)
      .then((r) => setSnapshots(r.snapshots))
      .catch(() => {});
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view.round.id]);

  return (
    <Card title="Saved results">
      {view.permissions.createSnapshot && (
        <form
          className="mb-3 flex gap-2 text-sm"
          action={async (form) => {
            setError(null);
            try {
              await api(`/rounds/${view.round.id}/snapshots`, { method: "POST", body: { label: form.get("label"), method } });
              await load();
            } catch (e) {
              setError(e instanceof ApiError ? e.message : "Couldn't save");
            }
          }}
        >
          <input name="label" required maxLength={120} placeholder="Label, e.g. After meeting 2" className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1.5" />
          <button type="submit" className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
            Save current
          </button>
        </form>
      )}
      {error && <p className="mb-2 text-sm text-critical">{error}</p>}
      {snapshots.length === 0 ? (
        <p className="text-sm text-muted">No saved results yet.</p>
      ) : (
        <ul className="space-y-1 text-sm">
          {snapshots.slice(0, 8).map((s) => (
            <li key={s.id} className="flex justify-between gap-2">
              <span>{s.label}</span>
              <span className="tabular text-xs text-ink-2">
                {s.method === "pooled" ? "Pooled" : "Round-robin"} · {moneyExact(Object.values(s.result.grants).reduce((a, b) => a + b, 0))}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
