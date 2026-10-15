"""Independent reference implementation of the allocation engine.

This deliberately takes a different route from the TypeScript engine so the two
can catch each other's mistakes:

* curves are evaluated with ``numpy.interp`` instead of hand-rolled segment walks;
* water-filling finds lambda by sorting every curve breakpoint and solving the
  piecewise-linear demand equation exactly on the bracketing interval, instead of
  bisecting;
* round-robin is a straightforward transcription of the rules in docs/math.md.

``python -m reference.cross_check`` writes random scenarios plus this module's
answers to a fixture the TypeScript test suite replays.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass(frozen=True)
class Curve:
    xs: np.ndarray
    ms: np.ndarray

    @staticmethod
    def from_json(obj: dict) -> "Curve":
        pts = obj["points"]
        return Curve(np.array([p["x"] for p in pts], float), np.array([p["m"] for p in pts], float))

    def marginal(self, x: float) -> float:
        # np.interp clamps to the end values outside [xs[0], xs[-1]], which is
        # exactly "hold the last value" past the final point.
        return float(np.interp(x, self.xs, self.ms))

    def total_value(self, x: float) -> float:
        if x <= 0:
            return 0.0
        grid = np.concatenate([self.xs[self.xs < x], [x]])
        return float(np.trapezoid(np.interp(grid, self.xs, self.ms), grid))

    def funding_above(self, lam: float) -> float:
        """sup{x : m(x) > lam}."""
        if self.ms[0] <= lam:
            return 0.0
        if self.ms[-1] > lam:
            return float("inf")
        i = int(np.argmax(self.ms <= lam))  # first breakpoint at or below lam
        x0, x1, m0, m1 = self.xs[i - 1], self.xs[i], self.ms[i - 1], self.ms[i]
        return float(x0 if m0 == m1 else x0 + (m0 - lam) / (m0 - m1) * (x1 - x0))


ZERO = Curve(np.array([0.0]), np.array([0.0]))


def water_fill(items: list[tuple[str, Curve, float]], budget: float) -> dict:
    """Exact water-filling. items are (id, curve, cap)."""

    def demand(lam: float) -> float:
        return sum(min(cap, c.funding_above(lam)) for _, c, cap in items)

    if demand(0.0) <= budget:
        grants = {i: min(cap, c.funding_above(0.0)) for i, c, cap in items}
        return {"grants": grants, "lambda": 0.0, "unallocated": budget - sum(grants.values())}

    # Demand is piecewise-linear in lambda between "events": curve breakpoint
    # values and the marginal values at which each cap is reached. Find the
    # bracketing pair of events, then solve the linear equation on it.
    events = {0.0}
    for _, c, cap in items:
        events.update(float(m) for m in c.ms)
        events.add(c.marginal(cap))
    levels = sorted(events)
    lo, hi = 0.0, levels[-1]
    for a, b in zip(levels, levels[1:]):
        if demand(a) > budget >= demand(b):
            lo, hi = a, b
            break

    # On the open interval (lo, hi) demand is linear in lambda; it can jump at
    # lo itself if some curve is flat there. Fit the line from two interior
    # points and solve it, or land on lo when the budget falls inside the jump.
    p, q = lo + (hi - lo) / 3, lo + 2 * (hi - lo) / 3
    d_p, d_q = demand(p), demand(q)
    if d_p + (d_p - d_q) <= budget:  # right-limit at lo is already within budget
        lam = lo
    elif d_p == d_q:  # flat demand above budget all the way to hi: ties on flats at hi
        lam = hi
    else:
        lam = min(hi, p + (d_p - budget) / (d_p - d_q) * (q - p))

    base = {i: min(cap, c.funding_above(lam)) for i, c, cap in items}
    remainder = budget - sum(base.values())
    if remainder > 0:
        # Leftover dollars go first to ties: curves flat at exactly lam.
        room = {i: min(cap, _funding_at_least(c, lam)) - base[i] for i, c, cap in items}
        if sum(room.values()) < remainder * (1 - 1e-9):
            # Not a tie but float slop on a very steep segment: widen to
            # dollars valued in [lo, lam] (only positive-value ones at lo = 0).
            room = {
                i: min(cap, _funding_at_least(c, lo) if lo > 0 else c.funding_above(0.0)) - base[i]
                for i, c, cap in items
            }
    else:
        # Float slop the other way: take it back from dollars valued in (lam, hi].
        room = {i: base[i] - min(cap, c.funding_above(hi)) for i, c, cap in items}
    total = sum(room.values())
    if total > 0:
        base = {i: base[i] + remainder * room[i] / total for i in base}
    return {"grants": base, "lambda": lam, "unallocated": 0.0}


def _funding_at_least(c: Curve, lam: float) -> float:
    if c.ms[0] < lam:
        return 0.0
    if c.ms[-1] >= lam:
        return float("inf")
    i = int(np.argmax(c.ms < lam))
    x0, x1, m0, m1 = c.xs[i - 1], c.xs[i], c.ms[i - 1], c.ms[i]
    return float(x0 if m0 == m1 else x0 + (m0 - lam) / (m0 - m1) * (x1 - x0))


def delegation(s: dict) -> dict[str, dict[str, float]]:
    out = {}
    for f in s["funders"]:
        w = {r["id"]: f["trust"].get(r["id"], 0.0) for r in s["recommenders"]}
        total = sum(w.values())
        out[f["id"]] = {r: (f["budget"] * v / total if total > 0 else 0.0) for r, v in w.items()}
    return out


def _curve(s: dict, r: str, a: str) -> Curve:
    obj = s["curves"].get(r, {}).get(a)
    return Curve.from_json(obj) if obj else ZERO


def round_robin(s: dict, step: float = 1000.0) -> dict[str, float]:
    deleg = delegation(s)
    recs = sorted(r["id"] for r in s["recommenders"])
    left = {r: sum(deleg[f["id"]][r] for f in s["funders"]) for r in recs}
    granted = {a["id"]: 0.0 for a in s["applications"]}
    caps = {a["id"]: a["cap"] for a in s["applications"]}
    order = [a["id"] for a in s["applications"]]
    active = [r for r in recs if left[r] > 0]
    while active:
        still = []
        for r in active:
            best, best_m = None, 0.0
            for a in order:
                if caps[a] - granted[a] <= 1e-9:
                    continue
                m = _curve(s, r, a).marginal(granted[a])
                if m > best_m:
                    best, best_m = a, m
            if best is None or left[r] <= 1e-9:
                continue
            spend = min(step, left[r], caps[best] - granted[best])
            granted[best] += spend
            left[r] -= spend
            still.append(r)
        active = still
    return granted


def pooled(s: dict) -> dict[str, float]:
    deleg = delegation(s)
    per_rec = {r["id"]: sum(deleg[f["id"]][r["id"]] for f in s["funders"]) for r in s["recommenders"]}
    budget = sum(per_rec.values())
    items = []
    for a in s["applications"]:
        curves = [(_curve(s, r, a["id"]), per_rec[r] / budget if budget > 0 else 0.0) for r in per_rec]
        xs = np.unique(np.concatenate([[0.0], *[c.xs for c, _ in curves]]))
        ms = np.array([sum(w * c.marginal(x) for c, w in curves) for x in xs])
        items.append((a["id"], Curve(xs, ms), a["cap"]))
    return water_fill(items, budget)["grants"]
