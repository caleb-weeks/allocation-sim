"use client";

import { type CurvePoint, marginal, totalValue } from "@allocation-sim/engine";
import { useEffect, useMemo, useRef, useState } from "react";
import { money, num } from "@/lib/format";

export interface EditorCurve {
  recommenderId: string;
  name: string;
  color: string;
  points: CurvePoint[];
  isShared: boolean;
}

interface Props {
  cap: number;
  valueUnit: string;
  curves: EditorCurve[];
  /** The curve this user may edit (their own), if any. */
  editableId: string | null;
  /** Current grant to this application, marked on the x axis. */
  grant: number;
  onChange: (points: CurvePoint[]) => void;
  onCommit: (points: CurvePoint[]) => void;
}

const H = 280;
const M = { top: 16, right: 16, bottom: 32, left: 48 };
const MAX_POINTS = 12;

/** Keep a curve valid while one point moves: x stays between neighbours, m stays non-increasing and >= 0. */
function clampPoint(points: CurvePoint[], i: number, x: number, m: number, cap: number): CurvePoint[] {
  const prev = points[i - 1];
  const next = points[i + 1];
  const minGap = cap / 200;
  const nx = i === 0 ? 0 : Math.min(Math.max(x, prev!.x + minGap), next ? next.x - minGap : cap);
  const nm = Math.max(next ? next.m : 0, Math.min(m, prev ? prev.m : Infinity), 0);
  // Round x to whole dollars only when that can't collide with a neighbour. Never round m:
  // rounding 28.0091 to 28.009 would dip below the next point and break monotonicity.
  return points.map((p, j) => (j === i ? { x: minGap >= 1 ? Math.round(nx) : nx, m: nm } : p));
}

export function CurveEditor({ cap, valueUnit, curves, editableId, grant, onChange, onCommit }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [drag, setDrag] = useState<{ index: number; points: CurvePoint[] } | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(280, entry!.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const own = curves.find((c) => c.recommenderId === editableId);
  const ownPoints = drag?.points ?? own?.points ?? null;

  // Freeze the y scale while dragging so the axis doesn't move under the pointer.
  const yMaxRef = useRef(1);
  const yMax = useMemo(() => {
    if (drag) return yMaxRef.current;
    const top = Math.max(1, ...curves.flatMap((c) => c.points.map((p) => p.m)));
    yMaxRef.current = niceCeil(top * 1.2);
    return yMaxRef.current;
  }, [curves, drag]);

  const iw = width - M.left - M.right;
  const ih = H - M.top - M.bottom;
  const sx = (x: number) => M.left + (Math.min(x, cap) / cap) * iw;
  const sy = (m: number) => M.top + ih - (Math.min(m, yMax) / yMax) * ih;
  const invX = (px: number) => ((px - M.left) / iw) * cap;
  const invY = (py: number) => ((M.top + ih - py) / ih) * yMax;

  function path(points: CurvePoint[]) {
    const pts = [...points.filter((p) => p.x <= cap)];
    const last = pts[pts.length - 1]!;
    if (last.x < cap) pts.push({ x: cap, m: last.m }); // the curve holds its last value
    return pts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(1)},${sy(p.m).toFixed(1)}`).join("");
  }

  function areaUnder(points: CurvePoint[], upTo: number) {
    const xs = [0, ...points.map((p) => p.x).filter((x) => x > 0 && x < upTo), upTo];
    const top = xs.map((x) => `L${sx(x).toFixed(1)},${sy(marginal({ points }, x)).toFixed(1)}`).join("");
    return `M${sx(0)},${sy(0)}${top}L${sx(upTo).toFixed(1)},${sy(0)}Z`;
  }

  function svgPoint(e: React.PointerEvent) {
    const r = (e.currentTarget as SVGElement).ownerSVGElement?.getBoundingClientRect() ?? (e.currentTarget as SVGElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function startDrag(i: number, e: React.PointerEvent) {
    if (!own) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelected(i);
    setDrag({ index: i, points: own.points });
  }

  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const p = svgPoint(e);
    const points = clampPoint(drag.points, drag.index, invX(p.x), invY(p.y), cap);
    setDrag({ ...drag, points });
    onChange(points);
  }

  function endDrag() {
    if (!drag) return;
    onCommit(drag.points);
    setDrag(null);
  }

  function nudge(i: number, e: React.KeyboardEvent) {
    if (!own) return;
    const stepM = yMax / 50;
    const stepX = cap / 50;
    const p = own.points[i]!;
    const moves: Record<string, [number, number]> = {
      ArrowUp: [p.x, p.m + stepM],
      ArrowDown: [p.x, p.m - stepM],
      ArrowLeft: [p.x - stepX, p.m],
      ArrowRight: [p.x + stepX, p.m],
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    const points = clampPoint(own.points, i, move[0], move[1], cap);
    onChange(points);
    onCommit(points);
  }

  function addPoint() {
    if (!own || own.points.length >= MAX_POINTS) return;
    // Split the widest segment (treating the run out to the cap as a segment).
    const pts = own.points;
    const ends = [...pts.map((p) => p.x), cap];
    let best = 0;
    for (let i = 1; i < ends.length - 1; i++) if (ends[i + 1]! - ends[i]! > ends[best + 1]! - ends[best]!) best = i;
    const x = (ends[best]! + ends[best + 1]!) / 2;
    const points = [...pts.slice(0, best + 1), { x: Math.round(x), m: marginal({ points: pts }, x) }, ...pts.slice(best + 1)];
    setSelected(best + 1);
    onChange(points);
    onCommit(points);
  }

  function removePoint() {
    if (!own || selected === null || selected === 0 || own.points.length <= 1) return;
    const points = own.points.filter((_, i) => i !== selected);
    setSelected(null);
    onChange(points);
    onCommit(points);
  }

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * yMax);
  const xTicks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * cap);
  const hover = hoverX !== null && !drag ? Math.max(0, Math.min(cap, hoverX)) : null;

  return (
    <div className="space-y-2">
      <div ref={wrap} className="relative">
        <svg
          width={width}
          height={H}
          role="img"
          aria-label={`Marginal value curves, ${valueUnit}, from $0 to ${money(cap)}`}
          className="touch-none select-none"
          onPointerMove={(e) => {
            if (drag) moveDrag(e);
            else setHoverX(invX(svgPoint(e).x));
          }}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onPointerLeave={() => setHoverX(null)}
        >
          {/* Grid and axes: hairline, recessive. */}
          {yTicks.map((t) => (
            <g key={`y${t}`}>
              <line x1={M.left} x2={width - M.right} y1={sy(t)} y2={sy(t)} stroke="var(--grid)" strokeWidth={1} />
              <text x={M.left - 8} y={sy(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--muted)" className="tabular">
                {num(t, 1)}
              </text>
            </g>
          ))}
          <line x1={M.left} x2={width - M.right} y1={sy(0)} y2={sy(0)} stroke="var(--axis)" strokeWidth={1} />
          {xTicks.map((t, i) => (
            <text
              key={`x${t}`}
              x={sx(t)}
              y={H - M.bottom + 18}
              textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--muted)"
              className="tabular"
            >
              {money(t)}
            </text>
          ))}

          {/* Value created by the current grant, under the editable curve. */}
          {ownPoints && grant > 0 && <path d={areaUnder(ownPoints, Math.min(grant, cap))} fill={own!.color} opacity={0.1} />}

          {/* Current grant. */}
          {grant > 0 && (
            <g>
              <line x1={sx(grant)} x2={sx(grant)} y1={M.top} y2={sy(0)} stroke="var(--ink-2)" strokeWidth={1} />
              {/* Flip the label to the left of the line near the right edge so it never clips. */}
              <text
                x={sx(grant) > width - M.right - 110 ? sx(grant) - 4 : sx(grant) + 4}
                textAnchor={sx(grant) > width - M.right - 110 ? "end" : "start"}
                y={M.top + 10}
                fontSize={11}
                fill="var(--ink-2)"
              >
                granted {money(grant)}
              </text>
            </g>
          )}

          {curves.map((c) => {
            const pts = c.recommenderId === editableId && ownPoints ? ownPoints : c.points;
            return (
              <path
                key={c.recommenderId}
                d={path(pts)}
                fill="none"
                stroke={c.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            );
          })}

          {hover !== null && (
            <line x1={sx(hover)} x2={sx(hover)} y1={M.top} y2={sy(0)} stroke="var(--axis)" strokeWidth={1} pointerEvents="none" />
          )}

          {/* Control points for the editable curve: 8px+ markers with a surface ring and a 28px hit area. */}
          {ownPoints?.map((p, i) => (
            <g
              key={i}
              tabIndex={0}
              role="slider"
              aria-label={`Point ${i + 1}: ${num(p.m)} at ${money(p.x)}. Arrow keys move it.`}
              aria-valuenow={p.m}
              aria-valuemin={0}
              aria-valuemax={yMax}
              onPointerDown={(e) => startDrag(i, e)}
              onKeyDown={(e) => nudge(i, e)}
              onFocus={() => setSelected(i)}
              className="cursor-grab outline-none"
            >
              <circle cx={sx(p.x)} cy={sy(p.m)} r={14} fill="transparent" />
              <circle
                cx={sx(p.x)}
                cy={sy(p.m)}
                r={selected === i ? 7 : 5.5}
                fill={own!.color}
                stroke="var(--surface)"
                strokeWidth={2}
              />
            </g>
          ))}
        </svg>

        {hover !== null && (
          <div
            className="pointer-events-none absolute top-2 z-10 rounded-md border border-border bg-surface p-2 text-xs shadow"
            style={{ left: Math.min(sx(hover) + 12, width - 180) }}
          >
            <div className="mb-1 text-ink-2">after {money(hover)}</div>
            {curves.map((c) => (
              <div key={c.recommenderId} className="flex items-center justify-between gap-4">
                <span className="inline-flex items-center gap-1.5 text-ink-2">
                  <span className="inline-block h-0.5 w-3" style={{ background: c.color }} aria-hidden />
                  {c.name}
                </span>
                <span className="tabular font-semibold text-ink">
                  {num(marginal({ points: c.recommenderId === editableId && ownPoints ? ownPoints : c.points }, hover))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-2">
        {curves.map((c) => (
          <span key={c.recommenderId} className="inline-flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-4" style={{ background: c.color }} aria-hidden />
            {c.name}
            {c.recommenderId === editableId && <span className="text-muted">({c.isShared ? "yours, shared" : "yours, draft"})</span>}
          </span>
        ))}
        <span className="text-muted">y: {valueUnit}</span>
      </div>

      {own && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={addPoint} disabled={own.points.length >= MAX_POINTS} className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-50">
            Add point
          </button>
          <button
            type="button"
            onClick={removePoint}
            disabled={selected === null || selected === 0}
            className="rounded-md border border-border px-2 py-1 hover:bg-surface-2 disabled:opacity-50"
          >
            Remove selected point
          </button>
          <span className="text-muted">
            Drag points, or focus one and use arrow keys. Value of the current grant to you:{" "}
            <span className="tabular text-ink">{num(totalValue({ points: ownPoints! }, Math.min(grant, cap)) / 1000, 0)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

function niceCeil(v: number) {
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
