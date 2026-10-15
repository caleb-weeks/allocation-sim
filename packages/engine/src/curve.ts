/**
 * A marginal value curve: how much value one more dollar to an application is
 * worth, given `x` dollars already granted to it.
 *
 * Curves are piecewise-linear through `points` (sorted by `x`, starting at
 * x = 0) and must be non-increasing — each dollar is worth no more than the
 * one before it. Past the last point the curve holds its last value, so a
 * curve that should stop paying out must end at m = 0 (or the application's
 * cap stops it).
 */
export interface CurvePoint {
  /** Dollars already granted. */
  x: number;
  /** Marginal value per dollar at that funding level. */
  m: number;
}

export interface Curve {
  points: CurvePoint[];
}

export class InvalidCurveError extends Error {}

const EPS = 1e-12;

export function validateCurve(curve: Curve): void {
  const { points } = curve;
  if (points.length === 0) throw new InvalidCurveError("curve needs at least one point");
  if (points[0]!.x !== 0) throw new InvalidCurveError("first point must be at x = 0");
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.m)) throw new InvalidCurveError(`point ${i} is not finite`);
    if (p.m < 0) throw new InvalidCurveError(`point ${i} has negative marginal value`);
    if (i > 0) {
      const prev = points[i - 1]!;
      if (p.x <= prev.x) throw new InvalidCurveError(`point ${i} x must be strictly increasing`);
      if (p.m > prev.m + EPS) throw new InvalidCurveError(`point ${i} increases; curves must be non-increasing`);
    }
  }
}

/** Marginal value per dollar after `x` dollars. */
export function marginal(curve: Curve, x: number): number {
  const pts = curve.points;
  if (x <= 0) return pts[0]!.m;
  for (let i = 1; i < pts.length; i++) {
    const b = pts[i]!;
    if (x <= b.x) {
      const a = pts[i - 1]!;
      const t = (x - a.x) / (b.x - a.x);
      return a.m + t * (b.m - a.m);
    }
  }
  return pts[pts.length - 1]!.m;
}

/** Total value of granting `x` dollars: the area under the curve on [0, x]. */
export function totalValue(curve: Curve, x: number): number {
  if (x <= 0) return 0;
  const pts = curve.points;
  let area = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (x <= a.x) return area;
    const hi = Math.min(x, b.x);
    area += ((a.m + marginal(curve, hi)) / 2) * (hi - a.x);
    if (x <= b.x) return area;
  }
  const last = pts[pts.length - 1]!;
  return area + last.m * (x - last.x);
}

/**
 * The most funding at which the curve's marginal value is still strictly
 * above `lambda`: sup{x : m(x) > lambda}. Returns Infinity if the curve's
 * tail stays above `lambda` forever, and 0 if it never exceeds it.
 *
 * This is the inverse used by water-filling. Using the strict inequality means
 * a flat segment sitting exactly at `lambda` is excluded; the solver hands
 * those "tied" dollars out separately.
 */
export function fundingAbove(curve: Curve, lambda: number): number {
  const pts = curve.points;
  if (pts[0]!.m <= lambda) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (b.m <= lambda) {
      // a.m > lambda >= b.m: the crossing is inside this segment.
      if (a.m === b.m) return a.x;
      return a.x + ((a.m - lambda) / (a.m - b.m)) * (b.x - a.x);
    }
  }
  return Infinity;
}

/** sup{x : m(x) >= lambda} — like fundingAbove but includes flats at lambda. */
export function fundingAtLeast(curve: Curve, lambda: number): number {
  const pts = curve.points;
  if (pts[0]!.m < lambda) return 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    if (b.m < lambda) {
      if (a.m === b.m) return a.x;
      return a.x + ((a.m - lambda) / (a.m - b.m)) * (b.x - a.x);
    }
  }
  return Infinity;
}

/** Pointwise weighted sum of curves, exact for piecewise-linear inputs. */
export function sumCurves(curves: { curve: Curve; weight: number }[]): Curve {
  const xs = new Set<number>([0]);
  for (const { curve } of curves) for (const p of curve.points) xs.add(p.x);
  const sorted = [...xs].sort((a, b) => a - b);
  return {
    points: sorted.map((x) => ({
      x,
      m: curves.reduce((acc, { curve, weight }) => acc + weight * marginal(curve, x), 0),
    })),
  };
}
