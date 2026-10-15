import fc from "fast-check";
import type { Curve, Scenario } from "../src/index.js";

/** A random valid non-increasing piecewise-linear curve. */
export const curveArb: fc.Arbitrary<Curve> = fc
  .record({
    start: fc.double({ min: 0, max: 10, noNaN: true }),
    segments: fc.array(
      fc.record({
        dx: fc.double({ min: 1, max: 50_000, noNaN: true }),
        drop: fc.double({ min: 0, max: 1, noNaN: true }),
      }),
      { minLength: 0, maxLength: 5 },
    ),
    endsAtZero: fc.boolean(),
  })
  .map(({ start, segments, endsAtZero }) => {
    const points = [{ x: 0, m: start }];
    let x = 0;
    let m = start;
    for (const { dx, drop } of segments) {
      x += dx;
      m = m * (1 - drop);
      points.push({ x, m });
    }
    if (endsAtZero) points.push({ x: x + 1000, m: 0 });
    return { points };
  });

export const scenarioArb: fc.Arbitrary<Scenario> = fc
  .record({
    nApps: fc.integer({ min: 1, max: 6 }),
    nRecs: fc.integer({ min: 1, max: 3 }),
    nFunders: fc.integer({ min: 1, max: 2 }),
  })
  .chain(({ nApps, nRecs, nFunders }) =>
    fc.record({
      caps: fc.array(fc.double({ min: 1000, max: 200_000, noNaN: true }), { minLength: nApps, maxLength: nApps }),
      budgets: fc.array(fc.double({ min: 0, max: 500_000, noNaN: true }), { minLength: nFunders, maxLength: nFunders }),
      trust: fc.array(fc.array(fc.double({ min: 0, max: 5, noNaN: true }), { minLength: nRecs, maxLength: nRecs }), {
        minLength: nFunders,
        maxLength: nFunders,
      }),
      curves: fc.array(fc.array(curveArb, { minLength: nApps, maxLength: nApps }), { minLength: nRecs, maxLength: nRecs }),
    }),
  )
  .map(({ caps, budgets, trust, curves }) => {
    const applications = caps.map((cap, i) => ({ id: `a${i}`, name: `App ${i}`, cap }));
    const recommenders = curves.map((_, i) => ({ id: `r${i}`, name: `Rec ${i}` }));
    return {
      applications,
      recommenders,
      funders: budgets.map((budget, i) => ({
        id: `f${i}`,
        name: `Funder ${i}`,
        budget,
        trust: Object.fromEntries(recommenders.map((r, j) => [r.id, trust[i]![j]!])),
      })),
      curves: Object.fromEntries(
        recommenders.map((r, j) => [r.id, Object.fromEntries(applications.map((a, i) => [a.id, curves[j]![i]!]))]),
      ),
    };
  });

export const sum = (xs: Record<string, number>) => Object.values(xs).reduce((a, b) => a + b, 0);
