import { type Curve, validateCurve } from "./curve.js";

export interface Application {
  id: string;
  name: string;
  /** Most this application can usefully absorb, in dollars. */
  cap: number;
}

export interface Recommender {
  id: string;
  name: string;
}

export interface Funder {
  id: string;
  name: string;
  budget: number;
  /** Relative trust in each recommender. Missing entries count as 0. */
  trust: Record<string, number>;
}

export interface Scenario {
  applications: Application[];
  recommenders: Recommender[];
  funders: Funder[];
  /** curves[recommenderId][applicationId]. A missing curve means "no value". */
  curves: Record<string, Record<string, Curve>>;
}

export const ZERO_CURVE: Curve = { points: [{ x: 0, m: 0 }] };

export function curveFor(scenario: Scenario, recommenderId: string, applicationId: string): Curve {
  return scenario.curves[recommenderId]?.[applicationId] ?? ZERO_CURVE;
}

export class InvalidScenarioError extends Error {}

export function validateScenario(s: Scenario): void {
  const ids = (xs: { id: string }[], kind: string) => {
    const seen = new Set<string>();
    for (const { id } of xs) {
      if (seen.has(id)) throw new InvalidScenarioError(`duplicate ${kind} id ${id}`);
      seen.add(id);
    }
    return seen;
  };
  const apps = ids(s.applications, "application");
  const recs = ids(s.recommenders, "recommender");
  ids(s.funders, "funder");
  for (const a of s.applications) {
    if (!(a.cap > 0) || !Number.isFinite(a.cap)) throw new InvalidScenarioError(`application ${a.id} needs a finite positive cap`);
  }
  for (const f of s.funders) {
    if (!(f.budget >= 0) || !Number.isFinite(f.budget)) throw new InvalidScenarioError(`funder ${f.id} needs a finite non-negative budget`);
    for (const [r, w] of Object.entries(f.trust)) {
      if (!recs.has(r)) throw new InvalidScenarioError(`funder ${f.id} trusts unknown recommender ${r}`);
      if (!(w >= 0) || !Number.isFinite(w)) throw new InvalidScenarioError(`funder ${f.id} trust in ${r} must be finite and non-negative`);
    }
  }
  for (const [r, byApp] of Object.entries(s.curves)) {
    if (!recs.has(r)) throw new InvalidScenarioError(`curves for unknown recommender ${r}`);
    for (const [a, curve] of Object.entries(byApp)) {
      if (!apps.has(a)) throw new InvalidScenarioError(`curve for unknown application ${a}`);
      validateCurve(curve);
    }
  }
}

/**
 * How each funder's budget is delegated: delegation[funderId][recommenderId]
 * dollars, split in proportion to the funder's trust weights. A funder that
 * trusts nobody delegates nothing.
 */
export function delegation(s: Scenario): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  for (const f of s.funders) {
    const weights = s.recommenders.map((r) => f.trust[r.id] ?? 0);
    const total = weights.reduce((a, b) => a + b, 0);
    out[f.id] = {};
    s.recommenders.forEach((r, i) => {
      out[f.id]![r.id] = total > 0 ? (f.budget * weights[i]!) / total : 0;
    });
  }
  return out;
}

/** The same scenario with one recommender removed; funders re-split their trust among the rest. */
export function withoutRecommender(s: Scenario, recommenderId: string): Scenario {
  return {
    ...s,
    recommenders: s.recommenders.filter((r) => r.id !== recommenderId),
    funders: s.funders.map((f) => {
      const { [recommenderId]: _dropped, ...trust } = f.trust;
      return { ...f, trust };
    }),
    curves: Object.fromEntries(Object.entries(s.curves).filter(([r]) => r !== recommenderId)),
  };
}
