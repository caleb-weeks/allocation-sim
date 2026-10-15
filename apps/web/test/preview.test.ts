import { readFileSync } from "node:fs";
import { type Scenario, delegation, pooled, roundRobin } from "@allocation-sim/engine";
import type { RoundView } from "@allocation-sim/api/protocol";
import { describe, expect, it } from "vitest";
import { poolsWithTrust, runMethod, scenarioFromView } from "../src/lib/preview";

const seed = JSON.parse(readFileSync(new URL("../../../data/guatemala-literacy.json", import.meta.url), "utf8")) as Scenario;

/** What a recommender's view of the seeded round looks like: no trust rows, just pools. */
function viewOf(s: Scenario, trust: RoundView["trust"] = []): RoundView {
  const d = delegation(s);
  const pools = Object.fromEntries(s.recommenders.map((r) => [r.id, s.funders.reduce((acc, f) => acc + d[f.id]![r.id]!, 0)]));
  return {
    round: { id: "r", key: null, title: "t", valueUnit: "v", sources: [], assumptions: {} },
    me: { membershipId: s.recommenders[0]!.id, role: "RECOMMENDER", displayName: "me" },
    members: [
      ...s.funders.map((f) => ({ id: f.id, role: "FUNDER" as const, displayName: f.name, userName: f.name, budget: f.budget, lens: null })),
      ...s.recommenders.map((r) => ({ id: r.id, role: "RECOMMENDER" as const, displayName: r.name, userName: r.name, budget: null, lens: null })),
    ],
    applications: s.applications.map((a) => ({ id: a.id, key: a.id, name: a.name, cap: a.cap, data: {} })),
    curves: Object.entries(s.curves).flatMap(([r, byApp]) =>
      Object.entries(byApp).map(([a, c]) => ({ id: `${r}:${a}`, recommenderId: r, applicationId: a, points: c.points, isShared: true, version: 1, updatedAt: "" })),
    ),
    trust,
    pools,
    step: 800,
    allocations: { roundRobin: roundRobin(s, { step: 800 }), pooled: pooled(s) },
    permissions: { viewAudit: false, createSnapshot: false, manageMembers: false },
  };
}

describe("client-side preview", () => {
  it("reproduces the official allocation from pools alone, without seeing trust", () => {
    const view = viewOf(seed);
    const s = scenarioFromView(view);
    const rr = runMethod(s, "roundRobin", view.step).grants;
    const pl = runMethod(s, "pooled", view.step).grants;
    for (const a of seed.applications) {
      expect(rr[a.id]).toBeCloseTo(view.allocations.roundRobin.grants[a.id]!, 6);
      expect(pl[a.id]).toBeCloseTo(view.allocations.pooled.grants[a.id]!, 6);
    }
  });

  it("a funder's trust preview matches recomputing with their new trust", () => {
    const funder = seed.funders[0]!;
    const trust = Object.entries(funder.trust).map(([r, w]) => ({ funderId: funder.id, recommenderId: r, weight: w }));
    const view = viewOf(seed, trust);
    const newTrust = { "rec-reach": 5, "rec-equity": 0, "rec-gender": 1 };
    const previewed = runMethod(scenarioFromView(view, { pools: poolsWithTrust(view, funder.id, funder.budget, newTrust) }), "roundRobin", 800).grants;
    const truth = roundRobin({ ...seed, funders: seed.funders.map((f) => (f.id === funder.id ? { ...f, trust: newTrust } : f)) }, { step: 800 }).grants;
    for (const a of seed.applications) expect(previewed[a.id]).toBeCloseTo(truth[a.id]!, 6);
  });
});
