import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  InvalidCurveError,
  fundingAbove,
  fundingAtLeast,
  marginal,
  sumCurves,
  totalValue,
  validateCurve,
} from "../src/index.js";
import { curveArb } from "./arbitraries.js";

const ramp = { points: [{ x: 0, m: 4 }, { x: 100, m: 0 }] };

describe("curve basics", () => {
  it("interpolates and holds the last value", () => {
    expect(marginal(ramp, 0)).toBe(4);
    expect(marginal(ramp, 50)).toBe(2);
    expect(marginal(ramp, 500)).toBe(0);
  });

  it("integrates exactly", () => {
    expect(totalValue(ramp, 100)).toBe(200); // triangle: 4 * 100 / 2
    expect(totalValue(ramp, 50)).toBe(150); // trapezoid: (4 + 2) / 2 * 50
    expect(totalValue({ points: [{ x: 0, m: 3 }] }, 10)).toBe(30);
  });

  it("inverts", () => {
    expect(fundingAbove(ramp, 2)).toBe(50);
    expect(fundingAbove(ramp, 4)).toBe(0);
    expect(fundingAbove({ points: [{ x: 0, m: 3 }] }, 1)).toBe(Infinity);
  });

  it("separates strict and non-strict inverses on flat segments", () => {
    const flat = { points: [{ x: 0, m: 2 }, { x: 40, m: 2 }, { x: 60, m: 0 }] };
    expect(fundingAbove(flat, 2)).toBe(0);
    expect(fundingAtLeast(flat, 2)).toBe(40);
  });

  it("rejects bad curves", () => {
    expect(() => validateCurve({ points: [] })).toThrow(InvalidCurveError);
    expect(() => validateCurve({ points: [{ x: 1, m: 1 }] })).toThrow(/x = 0/);
    expect(() => validateCurve({ points: [{ x: 0, m: 1 }, { x: 10, m: 2 }] })).toThrow(/non-increasing/);
    expect(() => validateCurve({ points: [{ x: 0, m: -1 }] })).toThrow(/negative/);
  });
});

describe("curve properties", () => {
  it("generated curves are valid and non-increasing everywhere", () => {
    fc.assert(
      fc.property(curveArb, fc.double({ min: 0, max: 300_000, noNaN: true }), fc.double({ min: 0, max: 300_000, noNaN: true }), (c, a, b) => {
        validateCurve(c);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        expect(marginal(c, hi)).toBeLessThanOrEqual(marginal(c, lo) + 1e-9);
      }),
    );
  });

  it("the derivative of totalValue is the marginal value", () => {
    fc.assert(
      fc.property(curveArb, fc.double({ min: 1, max: 200_000, noNaN: true }), (c, x) => {
        const h = 1e-3;
        const numeric = (totalValue(c, x + h) - totalValue(c, x - h)) / (2 * h);
        // Exact except at kinks, where the central difference averages both sides.
        const between = [marginal(c, x - h), marginal(c, x + h)];
        expect(numeric).toBeGreaterThanOrEqual(Math.min(...between) - 1e-6);
        expect(numeric).toBeLessThanOrEqual(Math.max(...between) + 1e-6);
      }),
    );
  });

  it("fundingAbove is a right inverse of marginal", () => {
    fc.assert(
      fc.property(curveArb, fc.double({ min: 0, max: 10, noNaN: true }), (c, lambda) => {
        const x = fundingAbove(c, lambda);
        if (!Number.isFinite(x)) return;
        if (x > 1e-9) expect(marginal(c, x - 1e-6)).toBeGreaterThanOrEqual(lambda - 1e-6);
        expect(marginal(c, x + 1e-6)).toBeLessThanOrEqual(lambda + 1e-6);
      }),
    );
  });

  it("sumCurves is pointwise addition", () => {
    fc.assert(
      fc.property(curveArb, curveArb, fc.double({ min: 0, max: 300_000, noNaN: true }), (a, b, x) => {
        const s = sumCurves([{ curve: a, weight: 0.25 }, { curve: b, weight: 2 }]);
        expect(marginal(s, x)).toBeCloseTo(0.25 * marginal(a, x) + 2 * marginal(b, x), 6);
      }),
    );
  });
});
