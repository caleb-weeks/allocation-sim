import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type Scenario,
  delegation,
  marginal,
  pooled,
  roundRobin,
  valueByRecommender,
  waterFill,
  withoutRecommender,
} from "../src/index.js";
import { curveArb, scenarioArb, sum } from "./arbitraries.js";

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

describe("waterFill", () => {
  it("equalizes marginal values on a simple pair", () => {
    // m1 = 10 - x/10 on [0, 100], m2 = 6 - x/10 on [0, 60]. Budget 60:
    // 10 - x1/10 = 6 - x2/10 and x1 + x2 = 60  =>  x1 = 50, x2 = 10, lambda = 5.
    const r = waterFill(
      [
        { id: "a", cap: 1e9, curve: { points: [{ x: 0, m: 10 }, { x: 100, m: 0 }] } },
        { id: "b", cap: 1e9, curve: { points: [{ x: 0, m: 6 }, { x: 60, m: 0 }] } },
      ],
      60,
    );
    expect(r.grants.a).toBeCloseTo(50, 6);
    expect(r.grants.b).toBeCloseTo(10, 6);
    expect(r.lambda).toBeCloseTo(5, 6);
  });

  it("returns leftover budget when demand runs out", () => {
    const r = waterFill([{ id: "a", cap: 1e9, curve: { points: [{ x: 0, m: 1 }, { x: 10, m: 0 }] } }], 100);
    expect(r.grants.a).toBeCloseTo(10);
    expect(r.unallocated).toBeCloseTo(90);
  });

  it("splits ties on flat segments", () => {
    const flat = { points: [{ x: 0, m: 1 }, { x: 100, m: 1 }, { x: 101, m: 0 }] };
    const r = waterFill(
      [
        { id: "a", cap: 1e9, curve: flat },
        { id: "b", cap: 1e9, curve: flat },
      ],
      50,
    );
    expect(r.grants.a).toBeCloseTo(25);
    expect(r.grants.b).toBeCloseTo(25);
  });

  it("never funds zero-value dollars when splitting ties at the bottom", () => {
    const r = waterFill(
      [
        { id: "zero", cap: 1000, curve: { points: [{ x: 0, m: 0 }] } },
        { id: "one", cap: 1000, curve: { points: [{ x: 0, m: 1 }] } },
      ],
      1,
    );
    expect(r.grants.zero).toBe(0);
    expect(r.grants.one).toBeCloseTo(1);
  });

  it("gives tie dollars only to curves that are flat at lambda", () => {
    // "flat" is worth 1 forever; "steep" is worth 1 only at its very first dollar.
    const r = waterFill(
      [
        { id: "flat", cap: 1000, curve: { points: [{ x: 0, m: 1 }] } },
        { id: "steep", cap: 1000, curve: { points: [{ x: 0, m: 1 }, { x: 1, m: 0.5 }] } },
      ],
      1,
    );
    expect(r.grants.flat).toBeCloseTo(1, 6);
    expect(r.grants.steep).toBeCloseTo(0, 6);
  });

  const itemsArb = fc.array(
    fc.record({ curve: curveArb, cap: fc.double({ min: 1000, max: 200_000, noNaN: true }) }),
    { minLength: 1, maxLength: 8 },
  );

  it("conserves budget, respects caps, and equalizes interior marginals", () => {
    fc.assert(
      fc.property(itemsArb, fc.double({ min: 0, max: 1_000_000, noNaN: true }), (raw, budget) => {
        const items = raw.map((it, i) => ({ id: `i${i}`, ...it }));
        const r = waterFill(items, budget);
        expect(near(sum(r.grants) + r.unallocated, budget, 1e-6 * Math.max(1, budget))).toBe(true);
        for (const it of items) {
          const g = r.grants[it.id]!;
          expect(g).toBeGreaterThanOrEqual(-1e-9);
          expect(g).toBeLessThanOrEqual(it.cap + 1e-6);
          // KKT: an item funded below its cap can't be worth more at the margin than lambda,
          // and an item funded at all wasn't worth less than lambda just before its last dollar.
          if (g < it.cap - 1e-3) expect(marginal(it.curve, g + 1e-3)).toBeLessThanOrEqual(r.lambda + 1e-6);
          if (g > 1e-3) expect(marginal(it.curve, g - 1e-3)).toBeGreaterThanOrEqual(r.lambda - 1e-6);
        }
      }),
    );
  });

  it("never gives anyone less when the budget grows", () => {
    fc.assert(
      fc.property(itemsArb, fc.double({ min: 0, max: 500_000, noNaN: true }), fc.double({ min: 0, max: 500_000, noNaN: true }), (raw, b1, extra) => {
        const items = raw.map((it, i) => ({ id: `i${i}`, ...it }));
        const small = waterFill(items, b1);
        const big = waterFill(items, b1 + extra);
        for (const it of items) expect(big.grants[it.id]!).toBeGreaterThanOrEqual(small.grants[it.id]! - 1e-6 * Math.max(1, b1 + extra));
      }),
    );
  });

  it("doesn't depend on item order", () => {
    fc.assert(
      fc.property(itemsArb, fc.double({ min: 0, max: 500_000, noNaN: true }), (raw, budget) => {
        const items = raw.map((it, i) => ({ id: `i${i}`, ...it }));
        const fwd = waterFill(items, budget);
        const rev = waterFill([...items].reverse(), budget);
        for (const it of items) expect(near(fwd.grants[it.id]!, rev.grants[it.id]!, 1e-6 * Math.max(1, budget))).toBe(true);
      }),
    );
  });
});

describe("roundRobin", () => {
  it("conserves every funder's budget and respects caps", () => {
    fc.assert(
      fc.property(scenarioArb, (s) => {
        const r = roundRobin(s, { step: 2000 });
        for (const f of s.funders) {
          const spent = sum(r.byFunder[f.id]!);
          expect(near(spent + r.unallocated[f.id]!, f.budget, 1e-6 * Math.max(1, f.budget))).toBe(true);
        }
        for (const a of s.applications) expect(r.grants[a.id]!).toBeLessThanOrEqual(a.cap + 1e-6);
        expect(near(sum(r.grants), s.funders.reduce((acc, f) => acc + sum(r.byFunder[f.id]!), 0), 1e-6 * Math.max(1, sum(r.grants)))).toBe(true);
      }),
      { numRuns: 60 },
    );
  });

  it("reaches the optimal total value as the step shrinks (single recommender)", () => {
    // Grants themselves needn't match: with ties there are many optimal
    // allocations (greedy gives tied dollars to the first application, water-
    // filling splits them). The value achieved is what converges.
    fc.assert(
      fc.property(scenarioArb, (raw) => {
        const s: Scenario = { ...raw, recommenders: raw.recommenders.slice(0, 1), curves: { r0: raw.curves.r0! } };
        s.funders = s.funders.map((f) => ({ ...f, trust: { r0: 1 } }));
        const step = 50;
        const exact = valueByRecommender(s, pooled(s).grants).r0!;
        const greedy = valueByRecommender(s, roundRobin(s, { step }).grants).r0!;
        const mMax = Math.max(0, ...s.applications.map((a) => s.curves.r0![a.id]!.points[0]!.m));
        // Each application's last step can be off by at most one step's worth of value.
        expect(greedy).toBeGreaterThanOrEqual(exact - step * mMax * s.applications.length - 1e-6 * Math.max(1, exact));
        expect(greedy).toBeLessThanOrEqual(exact + 1e-6 * Math.max(1, exact));
      }),
      { numRuns: 60 },
    );
  });
});

describe("delegation and counterfactuals", () => {
  const base: Scenario = {
    applications: [
      { id: "a", name: "A", cap: 100 },
      { id: "b", name: "B", cap: 100 },
    ],
    recommenders: [
      { id: "r1", name: "R1" },
      { id: "r2", name: "R2" },
    ],
    funders: [{ id: "f", name: "F", budget: 100, trust: { r1: 3, r2: 1 } }],
    curves: {
      r1: { a: { points: [{ x: 0, m: 1 }] } },
      r2: { b: { points: [{ x: 0, m: 1 }] } },
    },
  };

  it("splits budgets by trust", () => {
    expect(delegation(base)).toEqual({ f: { r1: 75, r2: 25 } });
  });

  it("each recommender funds what they value", () => {
    const r = roundRobin(base, { step: 5 });
    expect(r.grants).toEqual({ a: 75, b: 25 });
    expect(r.byRecommender.r1!.a).toBe(75);
  });

  it("removing a recommender re-splits trust among the rest", () => {
    const cf = withoutRecommender(base, "r2");
    expect(delegation(cf)).toEqual({ f: { r1: 100 } });
    expect(roundRobin(cf, { step: 5 }).grants).toEqual({ a: 100, b: 0 });
  });

  it("scores allocations by each recommender's own curves", () => {
    expect(valueByRecommender(base, { a: 75, b: 25 })).toEqual({ r1: 75, r2: 25 });
  });

  it("pooled and round-robin can disagree", () => {
    // r1 loves a, r2 is lukewarm on everything; round-robin gives r2 a turn on b,
    // but pooling lets r1's strong preference dominate.
    const s: Scenario = {
      ...base,
      funders: [{ id: "f", name: "F", budget: 100, trust: { r1: 1, r2: 1 } }],
      curves: {
        r1: { a: { points: [{ x: 0, m: 10 }] } },
        r2: { a: { points: [{ x: 0, m: 1 }] }, b: { points: [{ x: 0, m: 2 }] } },
      },
    };
    expect(roundRobin(s, { step: 1 }).grants).toEqual({ a: 50, b: 50 });
    expect(pooled(s).grants.a).toBeCloseTo(100);
  });
});
