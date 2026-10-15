import { type AllocationResult, type Curve, type Scenario, pooled, roundRobin, withoutRecommender } from "@allocation-sim/engine";
import type { Method, RoundView } from "@allocation-sim/api/protocol";

/**
 * Rebuild a scenario in the browser from what this member can see, so edits
 * can be previewed instantly while dragging.
 *
 * Members can't see each other's trust weights, but they don't need to: the
 * grants depend only on how many dollars each recommender directs (the
 * `pools`), so one synthetic funder per recommender reproduces the official
 * result exactly.
 */
export function scenarioFromView(
  view: RoundView,
  overrides: { curve?: { recommenderId: string; applicationId: string; curve: Curve }; pools?: Record<string, number> } = {},
): Scenario {
  const recommenders = view.members.filter((m) => m.role === "RECOMMENDER");
  const pools = overrides.pools ?? view.pools;
  const curves: Scenario["curves"] = {};
  for (const c of view.curves) {
    // Official results use shared curves only; the author's own draft counts only when previewing it.
    if (!c.isShared) continue;
    (curves[c.recommenderId] ??= {})[c.applicationId] = { points: c.points };
  }
  if (overrides.curve) {
    const { recommenderId, applicationId, curve } = overrides.curve;
    (curves[recommenderId] ??= {})[applicationId] = curve;
  }
  return {
    applications: view.applications.map((a) => ({ id: a.id, name: a.name, cap: a.cap })),
    recommenders: recommenders.map((r) => ({ id: r.id, name: r.displayName })),
    funders: recommenders.map((r) => ({ id: `pool:${r.id}`, name: r.displayName, budget: pools[r.id] ?? 0, trust: { [r.id]: 1 } })),
    curves,
  };
}

export function runMethod(s: Scenario, method: Method, step: number, exclude?: string): AllocationResult {
  const scenario = exclude ? withoutRecommender(s, exclude) : s;
  return method === "pooled" ? pooled(scenario) : roundRobin(scenario, { step });
}

/**
 * A funder previewing new trust weights: move their own budget between
 * recommenders and leave everyone else's delegation as it is.
 */
export function poolsWithTrust(view: RoundView, funderId: string, budget: number, newTrust: Record<string, number>): Record<string, number> {
  const pools = { ...view.pools };
  const oldTrust = Object.fromEntries(view.trust.filter((t) => t.funderId === funderId).map((t) => [t.recommenderId, t.weight]));
  const share = (trust: Record<string, number>) => {
    const total = Object.values(trust).reduce((a, b) => a + b, 0);
    return (r: string) => (total > 0 ? (budget * (trust[r] ?? 0)) / total : 0);
  };
  const before = share(oldTrust);
  const after = share(newTrust);
  for (const r of Object.keys(pools)) pools[r] = (pools[r] ?? 0) - before(r) + after(r);
  return pools;
}
