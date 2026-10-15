import { type Curve, fundingAbove, fundingAtLeast, marginal, sumCurves, totalValue } from "./curve.js";
import { type Scenario, curveFor, delegation } from "./model.js";

export interface WaterFillItem {
  id: string;
  curve: Curve;
  cap: number;
}

export interface WaterFillResult {
  grants: Record<string, number>;
  /** The common marginal value every partly-funded item ends at (0 if budget wasn't binding). */
  lambda: number;
  unallocated: number;
}

/**
 * Exact allocation of one budget against one set of non-increasing marginal
 * value curves. At the optimum every item that's funded but not capped sits at
 * the same marginal value lambda, so we search for the lambda whose total
 * demand matches the budget:
 *
 *   sum_a min(cap_a, m_a^{-1}(lambda)) = budget
 *
 * Total demand is monotone in lambda, so bisection finds it. Dollars on flat
 * segments that sit exactly at lambda* are split in proportion to how much
 * each item has there.
 */
export function waterFill(items: WaterFillItem[], budget: number): WaterFillResult {
  const above = (lambda: number) => items.map((it) => Math.min(it.cap, fundingAbove(it.curve, lambda)));
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

  const positiveDemand = above(0);
  if (sum(positiveDemand) <= budget) {
    return {
      grants: Object.fromEntries(items.map((it, i) => [it.id, positiveDemand[i]!])),
      lambda: 0,
      unallocated: budget - sum(positiveDemand),
    };
  }

  // Invariant: demandAbove(lo) > budget >= demandAbove(hi).
  let lo = 0;
  let hi = Math.max(...items.map((it) => it.curve.points[0]!.m));
  for (let i = 0; i < 200 && hi - lo > 1e-15 * Math.max(1, hi); i++) {
    const mid = (lo + hi) / 2;
    if (sum(above(mid)) > budget) lo = mid;
    else hi = mid;
  }

  const base = above(hi);
  // At lo = 0 only dollars with positive value are eligible.
  const extra = items.map(
    (it, i) => Math.min(it.cap, lo > 0 ? fundingAtLeast(it.curve, lo) : fundingAbove(it.curve, 0)) - base[i]!,
  );
  const remainder = budget - sum(base);
  const extraTotal = sum(extra);
  const grants = items.map((_, i) => base[i]! + (extraTotal > 0 ? (remainder * extra[i]!) / extraTotal : 0));

  return {
    grants: Object.fromEntries(items.map((it, i) => [it.id, grants[i]!])),
    lambda: (lo + hi) / 2,
    unallocated: 0,
  };
}

export interface AllocationResult {
  method: "round-robin" | "pooled";
  /** Total dollars per application. */
  grants: Record<string, number>;
  /** grants split by the funder whose money it is: byFunder[funderId][applicationId]. */
  byFunder: Record<string, Record<string, number>>;
  /** Round-robin only: which recommender directed each dollar. */
  byRecommender: Record<string, Record<string, number>>;
  /** Dollars per funder left unspent because nothing had positive marginal value. */
  unallocated: Record<string, number>;
}

function emptyGrid(rows: { id: string }[], cols: { id: string }[]): Record<string, Record<string, number>> {
  return Object.fromEntries(rows.map((r) => [r.id, Object.fromEntries(cols.map((c) => [c.id, 0]))]));
}

export interface RoundRobinOptions {
  /** Dollars a recommender places per turn. Smaller is closer to continuous, but slower. */
  step?: number;
}

/**
 * S-process-style simulation. Each funder's budget is delegated to
 * recommenders in proportion to trust. Recommenders then take turns (in id
 * order) placing `step` dollars on whichever application they value most at
 * the margin, given everything granted so far by anyone. A recommender stops
 * when no application has positive marginal value to them.
 *
 * Ties go to the application listed first, so results are deterministic.
 */
export function roundRobin(s: Scenario, opts: RoundRobinOptions = {}): AllocationResult {
  const step = opts.step ?? 1000;
  if (!(step > 0)) throw new RangeError("step must be positive");

  const deleg = delegation(s);
  const recs = [...s.recommenders].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const apps = s.applications;

  // Each recommender spends a pool made of several funders' money; attribute
  // every dollar back to funders in proportion to what they have left in it.
  const pool = new Map(recs.map((r) => [r.id, new Map(s.funders.map((f) => [f.id, deleg[f.id]![r.id]!]))]));
  const remaining = (r: string) => [...pool.get(r)!.values()].reduce((a, b) => a + b, 0);

  const granted = new Map(apps.map((a) => [a.id, 0]));
  const byFunder = emptyGrid(s.funders, apps);
  const byRecommender = emptyGrid(recs, apps);
  const active = new Set(recs.map((r) => r.id).filter((r) => remaining(r) > 0));

  while (active.size > 0) {
    for (const r of recs) {
      if (!active.has(r.id)) continue;
      let best: { id: string; m: number; room: number } | null = null;
      for (const a of apps) {
        const x = granted.get(a.id)!;
        const room = a.cap - x;
        if (room <= 1e-9) continue;
        const m = marginal(curveFor(s, r.id, a.id), x);
        if (m > 0 && (best === null || m > best.m)) best = { id: a.id, m, room };
      }
      const left = remaining(r.id);
      if (best === null || left <= 1e-9) {
        active.delete(r.id);
        continue;
      }
      const spend = Math.min(step, left, best.room);
      const funders = pool.get(r.id)!;
      for (const [f, amt] of funders) {
        const share = (spend * amt) / left;
        funders.set(f, amt - share);
        byFunder[f]![best.id]! += share;
      }
      granted.set(best.id, granted.get(best.id)! + spend);
      byRecommender[r.id]![best.id]! += spend;
    }
  }

  const unallocated: Record<string, number> = Object.fromEntries(s.funders.map((f) => [f.id, 0]));
  for (const funders of pool.values()) for (const [f, amt] of funders) unallocated[f]! += amt;
  for (const f of s.funders) {
    const delegated = Object.values(deleg[f.id]!).reduce((a, b) => a + b, 0);
    unallocated[f.id]! += f.budget - delegated; // funders who trust nobody
  }

  return { method: "round-robin", grants: Object.fromEntries(granted), byFunder, byRecommender, unallocated };
}

/**
 * The "pooled" alternative: treat everyone as one decision-maker whose
 * marginal value for an application is the delegation-weighted average of the
 * recommenders' curves, and solve it exactly with water-filling.
 */
export function pooled(s: Scenario): AllocationResult {
  const deleg = delegation(s);
  const perRec = new Map(s.recommenders.map((r) => [r.id, s.funders.reduce((acc, f) => acc + deleg[f.id]![r.id]!, 0)]));
  const budget = [...perRec.values()].reduce((a, b) => a + b, 0);

  const items = s.applications.map((a) => ({
    id: a.id,
    cap: a.cap,
    curve: sumCurves(
      s.recommenders.map((r) => ({ curve: curveFor(s, r.id, a.id), weight: budget > 0 ? perRec.get(r.id)! / budget : 0 })),
    ),
  }));
  const wf = waterFill(items, budget);

  // Each funder pays for every grant in proportion to how much they delegated.
  const byFunder = emptyGrid(s.funders, s.applications);
  const unallocated: Record<string, number> = {};
  for (const f of s.funders) {
    const delegated = Object.values(deleg[f.id]!).reduce((a, b) => a + b, 0);
    const share = budget > 0 ? delegated / budget : 0;
    for (const a of s.applications) byFunder[f.id]![a.id] = wf.grants[a.id]! * share;
    unallocated[f.id] = f.budget - delegated + wf.unallocated * share;
  }

  return { method: "pooled", grants: wf.grants, byFunder, byRecommender: {}, unallocated };
}

/** How much total value each recommender sees in a set of grants, by their own curves. */
export function valueByRecommender(s: Scenario, grants: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    s.recommenders.map((r) => [
      r.id,
      s.applications.reduce((acc, a) => acc + totalValue(curveFor(s, r.id, a.id), grants[a.id] ?? 0), 0),
    ]),
  );
}

/** Per-application change from `base` to `other`. */
export function grantDeltas(base: Record<string, number>, other: Record<string, number>): Record<string, number> {
  const ids = new Set([...Object.keys(base), ...Object.keys(other)]);
  return Object.fromEntries([...ids].map((id) => [id, (other[id] ?? 0) - (base[id] ?? 0)]));
}
