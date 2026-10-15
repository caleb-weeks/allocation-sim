"use client";

import { useMemo, useRef, useState } from "react";
import { money, moneyExact, signedMoney } from "@/lib/format";

export interface ChartRecommender {
  id: string;
  name: string;
  color: string;
}

export interface GrantsChartProps {
  applications: { id: string; name: string; cap: number }[];
  grants: Record<string, number>;
  /** Who directed each dollar (round-robin only). Omit to draw one neutral series. */
  byRecommender?: Record<string, Record<string, number>>;
  recommenders: ChartRecommender[];
  /** A second result drawn as a tick on each row, e.g. the other method or the actual result. */
  compare?: { label: string; grants: Record<string, number> };
  /** Show a change column: grants minus compare. */
  showDelta?: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Applications others are currently looking at. */
  watchers?: Record<string, string[]>;
}

const NEUTRAL = "var(--ink-2)";
const BAR_PX = 16;

function shortName(name: string) {
  return name.replace(/^Literacy program — /, "");
}

export function GrantsChart(props: GrantsChartProps) {
  const { applications, grants, byRecommender, recommenders, compare, showDelta, selectedId, onSelect, watchers } = props;
  const [table, setTable] = useState(false);
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const rows = useMemo(
    () => [...applications].sort((a, b) => (grants[b.id] ?? 0) - (grants[a.id] ?? 0) || a.name.localeCompare(b.name)),
    [applications, grants],
  );
  const max = Math.max(1, ...applications.map((a) => a.cap));
  const pct = (v: number) => `${(Math.max(0, v) / max) * 100}%`;
  const stacked = byRecommender && recommenders.length > 0;

  function segments(appId: string) {
    if (!stacked) return [{ id: "total", color: NEUTRAL, value: grants[appId] ?? 0 }];
    return recommenders.map((r) => ({ id: r.id, color: r.color, value: byRecommender![r.id]?.[appId] ?? 0 })).filter((s) => s.value > 0.5);
  }

  function showTip(id: string, e: { clientX: number; clientY: number } | null, el?: HTMLElement) {
    const box = wrap.current?.getBoundingClientRect();
    if (!box) return;
    if (e) setTip({ id, x: e.clientX - box.left, y: e.clientY - box.top });
    else if (el) {
      const r = el.getBoundingClientRect();
      setTip({ id, x: r.left - box.left + r.width / 2, y: r.bottom - box.top });
    }
  }

  const tipApp = tip ? applications.find((a) => a.id === tip.id) : null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        {stacked &&
          recommenders.map((r) => (
            <span key={r.id} className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-3 rounded-[2px]" style={{ background: r.color }} aria-hidden />
              {r.name}
            </span>
          ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-5 rounded-[2px] bg-grid" aria-hidden />
          Most it can absorb
        </span>
        {compare && (
          <span className="inline-flex items-center gap-1.5">
            <span className="inline-block h-3 w-0.5 bg-ink" aria-hidden />
            {compare.label}
          </span>
        )}
        <button
          type="button"
          onClick={() => setTable((t) => !t)}
          className="ml-auto rounded-md border border-border px-2 py-1 text-ink-2 hover:text-ink"
          aria-pressed={table}
        >
          {table ? "Show chart" : "Show table"}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="tabular w-full text-sm">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-3 font-medium">Application</th>
                <th className="py-1.5 pr-3 text-right font-medium">Grant</th>
                {stacked && recommenders.map((r) => <th key={r.id} className="py-1.5 pr-3 text-right font-medium">{r.name}</th>)}
                {compare && <th className="py-1.5 pr-3 text-right font-medium">{compare.label}</th>}
                {showDelta && compare && <th className="py-1.5 pr-3 text-right font-medium">Change</th>}
                <th className="py-1.5 text-right font-medium">Cap</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id} className="border-b border-border">
                  <td className="py-1.5 pr-3">{shortName(a.name)}</td>
                  <td className="py-1.5 pr-3 text-right">{moneyExact(grants[a.id] ?? 0)}</td>
                  {stacked && recommenders.map((r) => <td key={r.id} className="py-1.5 pr-3 text-right">{moneyExact(byRecommender![r.id]?.[a.id] ?? 0)}</td>)}
                  {compare && <td className="py-1.5 pr-3 text-right">{moneyExact(compare.grants[a.id] ?? 0)}</td>}
                  {showDelta && compare && <td className="py-1.5 pr-3 text-right">{signedMoney((grants[a.id] ?? 0) - (compare.grants[a.id] ?? 0))}</td>}
                  <td className="py-1.5 text-right">{moneyExact(a.cap)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative" onPointerLeave={() => setTip(null)}>
          <ul className="space-y-0.5" aria-label="Grants by application">
            {rows.map((a) => {
              const value = grants[a.id] ?? 0;
              const segs = segments(a.id);
              const total = segs.reduce((acc, s) => acc + s.value, 0);
              let left = 0;
              const delta = compare ? value - (compare.grants[a.id] ?? 0) : 0;
              const others = watchers?.[a.id] ?? [];
              return (
                <li key={a.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(a.id)}
                    onPointerMove={(e) => showTip(a.id, e)}
                    onFocus={(e) => showTip(a.id, null, e.currentTarget)}
                    onBlur={() => setTip(null)}
                    aria-pressed={selectedId === a.id}
                    aria-label={`${shortName(a.name)}: ${moneyExact(value)}${compare ? `, ${compare.label} ${moneyExact(compare.grants[a.id] ?? 0)}` : ""}`}
                    className={`grid w-full items-center gap-3 rounded-md px-2 py-1 text-left text-sm ${
                      showDelta ? "grid-cols-[minmax(6rem,9rem)_1fr_4.5rem_5.5rem]" : "grid-cols-[minmax(6rem,9rem)_1fr_4.5rem]"
                    } ${selectedId === a.id ? "bg-surface-2" : "hover:bg-surface-2"}`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate">{shortName(a.name)}</span>
                      {others.length > 0 && (
                        <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-ink-2" title={`${others.join(", ")} looking`}>
                          {others.length} here
                        </span>
                      )}
                    </span>
                    <span className="relative block" style={{ height: BAR_PX }}>
                      {/* Track: how much this application could absorb. */}
                      <span className="absolute inset-y-0 left-0 rounded-r-[4px] bg-grid" style={{ width: pct(a.cap) }} />
                      {segs.map((s, i) => {
                        const isLast = i === segs.length - 1;
                        const style = {
                          left: pct(left),
                          // 2px surface gap between touching segments.
                          width: `calc(${pct(s.value)} - ${isLast ? 0 : 2}px)`,
                          background: s.color,
                        };
                        left += s.value;
                        return (
                          <span
                            key={s.id}
                            className={`absolute inset-y-0 ${isLast ? "rounded-r-[4px]" : ""}`}
                            style={style}
                          />
                        );
                      })}
                      {compare && (
                        <span
                          className="absolute -inset-y-1 w-0.5 bg-ink"
                          style={{ left: `calc(${pct(compare.grants[a.id] ?? 0)} - 1px)` }}
                          aria-hidden
                        />
                      )}
                      {total === 0 && <span className="sr-only">No grant</span>}
                    </span>
                    <span className="tabular whitespace-nowrap text-right text-ink">{money(value)}</span>
                    {showDelta && (
                      <span className={`tabular whitespace-nowrap text-right ${Math.abs(delta) < 500 ? "text-muted" : "text-ink-2"}`}>
                        <span
                          className="mr-1 inline-block h-2 w-2 rounded-full align-middle"
                          style={{ background: Math.abs(delta) < 500 ? "transparent" : delta > 0 ? "var(--gain)" : "var(--loss)" }}
                          aria-hidden
                        />
                        {signedMoney(delta)}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          {tip && tipApp && (
            <div
              role="tooltip"
              className="pointer-events-none absolute z-10 min-w-48 -translate-x-1/2 translate-y-3 rounded-md border border-border bg-surface p-3 text-xs shadow-lg"
              style={{ left: Math.min(Math.max(tip.x, 100), (wrap.current?.clientWidth ?? 400) - 100), top: tip.y }}
            >
              <div className="tabular text-base font-semibold text-ink">{moneyExact(grants[tipApp.id] ?? 0)}</div>
              <div className="mb-2 text-ink-2">{shortName(tipApp.name)}</div>
              {stacked &&
                recommenders.map((r) => (
                  <div key={r.id} className="flex items-center justify-between gap-4">
                    <span className="inline-flex items-center gap-1.5 text-ink-2">
                      <span className="inline-block h-0.5 w-3" style={{ background: r.color }} aria-hidden />
                      {r.name}
                    </span>
                    <span className="tabular text-ink">{moneyExact(byRecommender![r.id]?.[tipApp.id] ?? 0)}</span>
                  </div>
                ))}
              {compare && (
                <div className="mt-1 flex justify-between gap-4 border-t border-border pt-1">
                  <span className="text-ink-2">{compare.label}</span>
                  <span className="tabular text-ink">{moneyExact(compare.grants[tipApp.id] ?? 0)}</span>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <span className="text-ink-2">Most it can absorb</span>
                <span className="tabular text-ink">{moneyExact(tipApp.cap)}</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
