"use client";

import type { AllocationResult, CurvePoint } from "@allocation-sim/engine";
import type { Method, RoundView } from "@allocation-sim/api/protocol";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CurveEditor, type EditorCurve } from "@/components/CurveEditor";
import { GrantsChart } from "@/components/GrantsChart";
import { ActivityPanel, Card, MembersPanel, SnapshotsPanel, StatTiles, TrustPanel } from "@/components/Panels";
import { ApiError, api } from "@/lib/api";
import { ROLE_LABEL, money } from "@/lib/format";
import { poolsWithTrust, runMethod, scenarioFromView } from "@/lib/preview";
import { useRound } from "@/lib/useRound";

// Recommenders take categorical slots in a fixed order (by membership order), never by rank.
const SLOTS = ["var(--series-1)", "var(--series-2)", "var(--series-3)"];
const FALLBACK = "var(--ink-2)";

const METHOD_LABEL: Record<Method, string> = { roundRobin: "Round-robin", pooled: "Pooled" };

export default function RoundPage() {
  const { id } = useParams<{ id: string }>();
  const { view, error, presence, connection, focus } = useRound(id);

  if (error) {
    return (
      <div className="space-y-2">
        <p className="text-critical">{error.status === 401 ? "Sign in to see this round." : error.status === 404 ? "This round doesn't exist or you're not in it." : error.message}</p>
        <Link href="/rounds" className="text-sm underline underline-offset-2">Back to your rounds</Link>
      </div>
    );
  }
  if (!view) return <p className="text-muted">Loading round…</p>;
  return <Workspace view={view} presence={presence} connection={connection} focus={focus} />;
}

function Workspace({
  view,
  presence,
  connection,
  focus,
}: {
  view: RoundView;
  presence: { membershipId: string; name: string; focus: string | null }[];
  connection: string;
  focus: (applicationId: string | null) => void;
}) {
  const recommenders = view.members.filter((m) => m.role === "RECOMMENDER");
  const colors = useMemo(() => Object.fromEntries(recommenders.map((r, i) => [r.id, SLOTS[i] ?? FALLBACK])), [recommenders]);
  const meId = view.me.membershipId;
  const isRecommender = view.me.role === "RECOMMENDER";
  const isFunder = view.me.role === "FUNDER";

  const [method, setMethod] = useState<Method>("roundRobin");
  const [exclude, setExclude] = useState<string>("");
  const [selected, setSelected] = useState<string | null>(null);
  const [draftCurve, setDraftCurve] = useState<{ applicationId: string; points: CurvePoint[] } | null>(null);
  const [draftTrust, setDraftTrust] = useState<Record<string, number> | null>(null);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [counterfactual, setCounterfactual] = useState<AllocationResult | null>(null);

  const selectedApp = view.applications.find((a) => a.id === selected) ?? null;

  // Counterfactuals come from the server, which can see every shared curve even when this member can't.
  useEffect(() => {
    if (!exclude) return setCounterfactual(null);
    let cancelled = false;
    api<AllocationResult>(`/rounds/${view.round.id}/allocation?method=${method}&exclude=${exclude}`)
      .then((r) => !cancelled && setCounterfactual(r))
      .catch(() => !cancelled && setCounterfactual(null));
    return () => {
      cancelled = true;
    };
  }, [exclude, method, view]);

  // Live preview while dragging a curve or a trust slider; otherwise the official result.
  const previewing = draftCurve !== null || draftTrust !== null;
  const current: AllocationResult = useMemo(() => {
    if (!previewing) return view.allocations[method];
    const me = view.members.find((m) => m.id === meId)!;
    const scenario = scenarioFromView(view, {
      curve: draftCurve ? { recommenderId: meId, applicationId: draftCurve.applicationId, curve: { points: draftCurve.points } } : undefined,
      pools: draftTrust ? poolsWithTrust(view, meId, me.budget ?? 0, draftTrust) : undefined,
    });
    return runMethod(scenario, method, view.step);
  }, [previewing, view, method, meId, draftCurve, draftTrust]);

  const other: Method = method === "roundRobin" ? "pooled" : "roundRobin";
  const shown = counterfactual ?? current;
  const compare = counterfactual
    ? { label: "Actual result", grants: current.grants }
    : { label: `${METHOD_LABEL[other]} result`, grants: view.allocations[other].grants };

  const totalBudget = view.members.reduce((acc, m) => acc + (m.role === "FUNDER" ? (m.budget ?? 0) : 0), 0);
  const allocated = Object.values(shown.grants).reduce((a, b) => a + b, 0);
  const funded = view.applications.filter((a) => (shown.grants[a.id] ?? 0) >= 500).length;

  const watchers = useMemo(() => {
    const out: Record<string, string[]> = {};
    for (const p of presence) if (p.focus && p.membershipId !== meId) (out[p.focus] ??= []).push(p.name);
    return out;
  }, [presence, meId]);
  const online = useMemo(() => new Set(presence.map((p) => p.membershipId)), [presence]);

  function select(appId: string) {
    setSelected(appId);
    focus(appId);
  }

  const editorCurves: EditorCurve[] = selectedApp
    ? view.curves
        .filter((c) => c.applicationId === selectedApp.id)
        .map((c) => ({
          recommenderId: c.recommenderId,
          name: recommenders.find((r) => r.id === c.recommenderId)?.displayName ?? "Recommender",
          color: colors[c.recommenderId] ?? FALLBACK,
          points: c.points,
          isShared: c.isShared,
        }))
    : [];
  const ownCurve = selectedApp ? view.curves.find((c) => c.applicationId === selectedApp.id && c.recommenderId === meId) : undefined;
  if (selectedApp && isRecommender && !ownCurve) {
    // No curve yet: start from a flat line the recommender can shape.
    editorCurves.push({ recommenderId: meId, name: view.me.displayName, color: colors[meId] ?? FALLBACK, points: [{ x: 0, m: 1 }, { x: Math.round(selectedApp.cap / 2), m: 1 }], isShared: false });
  }

  async function saveCurve(points: CurvePoint[]) {
    if (!selectedApp) return;
    try {
      await api(`/rounds/${view.round.id}/curves/${selectedApp.id}`, {
        method: "PUT",
        body: { points, expectedVersion: ownCurve?.version },
      });
      setStatus({ kind: "ok", text: ownCurve?.isShared ? "Saved. Everyone sees it." : "Saved as a draft. Only you see it." });
    } catch (e) {
      setStatus({
        kind: "error",
        text: e instanceof ApiError && e.status === 409 ? "Someone else saved this curve first. Showing the latest version." : e instanceof ApiError ? e.message : "Couldn't save",
      });
    } finally {
      setDraftCurve(null);
    }
  }

  async function toggleShare() {
    if (!selectedApp || !ownCurve) return;
    try {
      await api(`/rounds/${view.round.id}/curves/${selectedApp.id}/share`, { method: "POST", body: { shared: !ownCurve.isShared } });
      setStatus({ kind: "ok", text: ownCurve.isShared ? "Moved back to draft." : "Shared with the round." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Couldn't update" });
    }
  }

  async function saveTrust(trust: Record<string, number>) {
    try {
      const mine = Object.fromEntries(view.trust.filter((t) => t.funderId === meId).map((t) => [t.recommenderId, t.weight]));
      await Promise.all(
        Object.entries(trust)
          .filter(([r, w]) => (mine[r] ?? 0) !== w)
          .map(([r, w]) => api(`/rounds/${view.round.id}/trust/${r}`, { method: "PUT", body: { weight: w } })),
      );
      setStatus({ kind: "ok", text: "Trust saved." });
    } catch (e) {
      setStatus({ kind: "error", text: e instanceof ApiError ? e.message : "Couldn't save trust" });
    } finally {
      setDraftTrust(null);
    }
  }

  const sources = Array.isArray(view.round.sources) ? (view.round.sources as { name: string; url: string }[]) : [];
  const assumptions = (view.round.assumptions ?? {}) as { note?: string };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{view.round.title}</h1>
          <p className="text-sm text-ink-2">
            {view.me.displayName} · {ROLE_LABEL[view.me.role]} ·{" "}
            <span className={connection === "live" ? "text-good" : "text-muted"}>● {connection === "live" ? "Live" : connection === "offline" ? "Reconnecting…" : "Connecting…"}</span>
            {presence.length > 1 && <span> · {presence.length} people here</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div role="radiogroup" aria-label="Allocation method" className="inline-flex rounded-md border border-border p-0.5">
            {(["roundRobin", "pooled"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={method === m}
                onClick={() => setMethod(m)}
                className={`rounded px-3 py-1 ${method === m ? "bg-button text-button-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          <label className="inline-flex items-center gap-2">
            <span className="text-ink-2">What if we didn&apos;t have</span>
            <select value={exclude} onChange={(e) => setExclude(e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1">
              <option value="">— everyone included —</option>
              {recommenders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.displayName}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <StatTiles
        tiles={[
          { label: "Total budget", value: money(totalBudget) },
          { label: counterfactual ? "Allocated (what-if)" : "Allocated", value: money(allocated), note: previewing ? "Preview, not saved" : undefined },
          { label: "Left unallocated", value: money(Math.max(0, totalBudget - allocated)), note: "When no curve values more funding" },
          { label: "Applications funded", value: `${funded} of ${view.applications.length}` },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <div className="space-y-5">
          <Card
            title={counterfactual ? `Grants without ${recommenders.find((r) => r.id === exclude)?.displayName}` : `Grants · ${METHOD_LABEL[method]}`}
            aside={previewing ? <span className="text-xs text-ink-2">Previewing your change</span> : undefined}
          >
            <p className="mb-3 text-sm text-ink-2">
              {method === "roundRobin"
                ? "Recommenders take turns placing money where they value it most, given what's already been granted. Colors show who directed each dollar."
                : "Everyone's curves are blended, weighted by how much budget each recommender directs, and the budget is split exactly so every funded application ends at the same marginal value."}{" "}
              Select a row to see its curves.
            </p>
            <GrantsChart
              applications={view.applications}
              grants={shown.grants}
              byRecommender={method === "roundRobin" ? shown.byRecommender : undefined}
              recommenders={recommenders
                .filter((r) => !counterfactual || r.id !== exclude)
                .map((r) => ({ id: r.id, name: r.displayName, color: colors[r.id] ?? FALLBACK }))}
              compare={compare}
              showDelta={!!counterfactual}
              selectedId={selected}
              onSelect={select}
              watchers={watchers}
            />
          </Card>
        </div>

        <div className="space-y-5">
          <Card title={selectedApp ? selectedApp.name : "Curves"}>
            {!selectedApp ? (
              <p className="text-sm text-ink-2">Select an application to see how much each recommender values each extra dollar to it.</p>
            ) : view.me.role === "OBSERVER" ? (
              <p className="text-sm text-ink-2">Observers see results but not anyone&apos;s curves. This application received {money(shown.grants[selectedApp.id] ?? 0)}.</p>
            ) : (
              <div className="space-y-3">
                <ApplicationFacts app={selectedApp} />
                <CurveEditor
                  cap={selectedApp.cap}
                  valueUnit={view.round.valueUnit}
                  curves={editorCurves}
                  editableId={isRecommender ? meId : null}
                  grant={shown.grants[selectedApp.id] ?? 0}
                  onChange={(points) => setDraftCurve({ applicationId: selectedApp.id, points })}
                  onCommit={saveCurve}
                />
                {isRecommender && ownCurve && (
                  <div className="flex flex-wrap items-center gap-3 text-sm">
                    <button type="button" onClick={toggleShare} className="rounded-md border border-border px-3 py-1.5 hover:bg-surface-2">
                      {ownCurve.isShared ? "Move back to draft" : "Share with the round"}
                    </button>
                    <span className="text-ink-2">{ownCurve.isShared ? "Shared: counts toward the official result." : "Draft: only you can see it. It doesn't count yet."}</span>
                  </div>
                )}
              </div>
            )}
            {status && (
              <p role="status" className={`mt-3 text-sm ${status.kind === "ok" ? "text-good" : "text-critical"}`}>
                {status.kind === "ok" ? "✓ " : "⚠ "}
                {status.text}
              </p>
            )}
          </Card>

          {isFunder && <TrustPanel view={view} colors={colors} draft={draftTrust} onDraft={setDraftTrust} onSave={saveTrust} />}
          <MembersPanel view={view} colors={colors} online={online} />
          {(view.permissions.createSnapshot || view.me.role === "OWNER") && <SnapshotsPanel view={view} method={method} />}
          {view.permissions.viewAudit && <ActivityPanel roundId={view.round.id} version={view} />}
        </div>
      </div>

      <footer className="space-y-1 border-t border-border pt-4 text-xs text-ink-2">
        {sources.map((s) => (
          <p key={s.url}>
            Data:{" "}
            <a href={s.url} className="underline underline-offset-2" rel="noreferrer" target="_blank">
              {s.name}
            </a>
          </p>
        ))}
        {assumptions.note && <p>Assumptions: {assumptions.note}</p>}
      </footer>
    </div>
  );
}

/** Display-ready facts a sample attaches to each application (data.facts); custom rounds have none. */
function ApplicationFacts({ app }: { app: RoundView["applications"][number] }) {
  const facts = ((app.data ?? {}) as { facts?: { label: string; value: string }[] }).facts ?? [];
  if (facts.length === 0) return null;
  return (
    <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
      {facts.map((f) => (
        <div key={f.label}>
          <dt className="text-ink-2">{f.label}</dt>
          <dd className="tabular text-sm font-semibold">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}
