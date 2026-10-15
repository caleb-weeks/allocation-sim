import {
  type AllocationResult,
  type Curve,
  type Scenario,
  delegation,
  pooled,
  roundRobin,
  withoutRecommender,
} from "@allocation-sim/engine";
import { type Actor, can } from "./authz.js";
import { prisma } from "./db.js";
import type { Method, RoundView } from "./protocol.js";

export const DEMO_ROUND_KEY = "demo-guatemala-literacy";

export type FullRound = NonNullable<Awaited<ReturnType<typeof loadRound>>>;

export function loadRound(roundId: string) {
  return prisma.round.findUnique({
    where: { id: roundId },
    include: {
      applications: { orderBy: { name: "asc" } },
      memberships: { include: { user: { select: { name: true } } }, orderBy: [{ role: "asc" }, { displayName: "asc" }] },
      curves: true,
      // Trust lives on the funder's membership.
    },
  });
}

async function loadTrust(roundId: string) {
  return prisma.trust.findMany({ where: { funder: { roundId } } });
}

/**
 * The official scenario: only shared curves, only current recommenders, and
 * trust only in current recommenders. Drafts never affect official results.
 */
export function officialScenario(round: FullRound, trust: { funderId: string; recommenderId: string; weight: number }[]): Scenario {
  const recommenders = round.memberships.filter((m) => m.role === "RECOMMENDER");
  const recIds = new Set(recommenders.map((r) => r.id));
  const curves: Record<string, Record<string, Curve>> = {};
  for (const c of round.curves) {
    if (!c.isShared || !recIds.has(c.recommenderId)) continue;
    (curves[c.recommenderId] ??= {})[c.applicationId] = { points: c.points as unknown as Curve["points"] };
  }
  return {
    applications: round.applications.map((a) => ({ id: a.id, name: a.name, cap: a.cap })),
    recommenders: recommenders.map((r) => ({ id: r.id, name: r.displayName })),
    funders: round.memberships
      .filter((m) => m.role === "FUNDER")
      .map((f) => ({
        id: f.id,
        name: f.displayName,
        budget: f.budget ?? 0,
        trust: Object.fromEntries(trust.filter((t) => t.funderId === f.id && recIds.has(t.recommenderId)).map((t) => [t.recommenderId, t.weight])),
      })),
    curves,
  };
}

/** Round-robin step: fine enough to be near-continuous, coarse enough to stay fast. */
export function stepFor(s: Scenario): number {
  const total = s.funders.reduce((acc, f) => acc + f.budget, 0);
  return Math.max(100, Math.round(total / 2000 / 100) * 100);
}

export function allocate(s: Scenario, method: Method, excludeRecommender?: string): AllocationResult {
  const scenario = excludeRecommender ? withoutRecommender(s, excludeRecommender) : s;
  return method === "pooled" ? pooled(scenario) : roundRobin(scenario, { step: stepFor(s) });
}

/** Total dollars each recommender directs. Enough for clients to preview allocations without seeing anyone's trust weights. */
export function poolsByRecommender(s: Scenario): Record<string, number> {
  const d = delegation(s);
  const out: Record<string, number> = Object.fromEntries(s.recommenders.map((r) => [r.id, 0]));
  for (const byRec of Object.values(d)) for (const [r, amt] of Object.entries(byRec)) out[r]! += amt;
  return out;
}

export interface Computed {
  scenario: Scenario;
  trust: { funderId: string; recommenderId: string; weight: number }[];
  allocations: Record<Method, AllocationResult>;
  pools: Record<string, number>;
  step: number;
}

export async function compute(round: FullRound): Promise<Computed> {
  const trust = await loadTrust(round.id);
  const scenario = officialScenario(round, trust);
  return {
    scenario,
    trust,
    allocations: { roundRobin: allocate(scenario, "roundRobin"), pooled: allocate(scenario, "pooled") },
    pools: poolsByRecommender(scenario),
    step: stepFor(scenario),
  };
}

/** Everything one member is allowed to see about a round. */
export function viewFor(round: FullRound, computed: Computed, membershipId: string): RoundView | null {
  const me = round.memberships.find((m) => m.id === membershipId);
  if (!me) return null;
  const actor: Actor = { membershipId: me.id, role: me.role };
  const recIds = new Set(round.memberships.filter((m) => m.role === "RECOMMENDER").map((m) => m.id));
  return {
    round: {
      id: round.id,
      key: round.key,
      title: round.title,
      valueUnit: round.valueUnit,
      sources: round.sources,
      assumptions: round.assumptions,
    },
    me: { membershipId: me.id, role: me.role, displayName: me.displayName },
    members: round.memberships.map((m) => ({
      id: m.id,
      role: m.role,
      displayName: m.displayName,
      userName: m.user.name,
      budget: m.budget,
      lens: m.lens,
    })),
    applications: round.applications.map((a) => ({ id: a.id, key: a.key, name: a.name, cap: a.cap, data: a.data })),
    curves: round.curves
      .filter((c) => recIds.has(c.recommenderId) && can(actor, { type: "curve:view", authorId: c.recommenderId, isShared: c.isShared }))
      .map((c) => ({
        id: c.id,
        recommenderId: c.recommenderId,
        applicationId: c.applicationId,
        points: c.points as unknown as RoundView["curves"][number]["points"],
        isShared: c.isShared,
        version: c.version,
        updatedAt: c.updatedAt,
      })),
    trust: computed.trust.filter((t) => can(actor, { type: "trust:view", funderId: t.funderId })),
    pools: computed.pools,
    step: computed.step,
    allocations: computed.allocations,
    permissions: {
      viewAudit: can(actor, { type: "round:viewAudit" }),
      createSnapshot: can(actor, { type: "snapshot:create" }),
      manageMembers: can(actor, { type: "members:manage" }) && round.key !== DEMO_ROUND_KEY,
    },
  };
}
