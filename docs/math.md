# The allocation model

This document describes the math behind the simulator: the model, the two
allocation algorithms, why they agree in one case and disagree in another, and
how the implementation is checked. The numbers in the examples come from the
demo scenario (`data/guatemala-literacy.json`) and can be reproduced with the
engine.

The mechanism follows the *public* description of the Survival and Flourishing
Fund's S-process: recommenders specify marginal value functions, funders decide
how much to defer to each recommender, and an algorithm turns that into grants.
This is an independent implementation built from that description.

## 1. Model

**Applications.** Each application $a$ has a cap $c_a$: the most it can
usefully absorb.

**Marginal value curves.** For each application, recommender $r$ specifies
$m_{r,a}(x) \ge 0$, the value of one more dollar once $x$ dollars have been
granted. Curves are piecewise-linear through control points
$(x_0 = 0, m_0), (x_1, m_1), \dots$ with $x$ strictly increasing. They hold
their last value past the final point and are **non-increasing**:

$$m_{r,a}(x) \ge m_{r,a}(y) \quad \text{for } x \le y.$$

The value of granting $x$ is the area under the curve,

$$V_{r,a}(x) = \int_0^x m_{r,a}(t)\,dt,$$

which is exact for piecewise-linear curves (a sum of trapezoids). Since $V' = m$
is non-increasing, $V$ is **concave**: diminishing returns. Concavity is the
property everything below depends on.

**Funders and trust.** Funder $f$ has budget $B_f$ and non-negative trust
weights $w_{f,r}$. The budget is delegated in proportion to trust:

$$D_{f,r} = B_f \cdot \frac{w_{f,r}}{\sum_{r'} w_{f,r'}},$$

and recommender $r$ directs a pool $P_r = \sum_f D_{f,r}$.

In the demo, North Star ($1M; trust Reach 1, Equity 2, Gender gap 1) and River
($500K; trust 2, 1, 0.5) give pools of $536K (Reach), $643K (Equity), and $321K
(Gender gap).

## 2. Round-robin (S-process style)

Recommenders take turns in a fixed order. On each turn, recommender $r$ places
$\Delta$ dollars (the *step*) on

$$a^* = \arg\max_a \; m_{r,a}(x_a) \quad \text{subject to } x_a < c_a,\; m_{r,a}(x_a) > 0,$$

where $x_a$ is the running total granted to $a$ **by anyone**. That coupling is
the important part: when one recommender funds an application, the next dollar
there is worth less to everyone, so overlapping priorities share the cost
instead of double-funding. A recommender stops when its pool is spent or nothing
has positive marginal value to it; leftover money stays with the funders. Each
dollar is attributed back to funders in proportion to what they still have in
that recommender's pool. Ties go to the first-listed application, so results
are deterministic.

## 3. Pooled (exact water-filling)

The alternative treats everyone as one decision-maker whose curve for $a$ is
the pool-weighted average of the recommenders' curves:

$$M_a(x) = \sum_r \frac{P_r}{B}\, m_{r,a}(x), \qquad B = \sum_r P_r .$$

It then maximizes $\sum_a \int_0^{x_a} M_a$ subject to $\sum_a x_a \le B$ and
$0 \le x_a \le c_a$. The objective is concave and the constraints are linear,
so the KKT conditions are necessary and sufficient. There is a level
$\lambda \ge 0$ (the "water level") such that

$$M_a(x_a) = \lambda \;\text{ if } 0 < x_a < c_a, \qquad M_a(0) \le \lambda \;\text{ if } x_a = 0, \qquad M_a(c_a^-) \ge \lambda \;\text{ if } x_a = c_a .$$

Writing $M_a^{-1}(\lambda) = \sup\{x : M_a(x) > \lambda\}$, the budget pins down
$\lambda$:

$$\sum_a \min\!\big(c_a,\; M_a^{-1}(\lambda)\big) = B .$$

If the left side is already $\le B$ at $\lambda = 0$, the budget isn't binding:
every dollar with positive value is funded and the rest is returned.

**Solving it.** The left side is monotone non-increasing in $\lambda$, so the
TypeScript engine bisects on $\lambda$. Two details matter:

* **Flat segments.** If a curve is flat exactly at $\lambda^*$, demand jumps,
  and no $\lambda$ hits the budget exactly. The solver funds everything strictly
  above $\lambda^*$, then splits the remaining dollars across the tied
  stretches in proportion to their length.
* **Zero-value dollars.** When $\lambda^* \to 0$, the tie step must only count
  dollars with *positive* value. Otherwise an application nobody values can
  receive leftovers. The property tests caught exactly this bug (§6).

## 4. When the two agree

With a **single recommender**, round-robin is greedy ascent on a separable
concave objective, and it converges to the water-filling optimum as
$\Delta \to 0$. Per-application grants need not converge when there are ties
(many allocations are optimal), but the **value** does. Near the optimum,
each application's last step is mis-sized by at most $\Delta$. With curve
slopes bounded by $s$, the value lost is $O(s\Delta^2)$ per application, so the
gap should shrink *quadratically* in the step.

Measured on the demo (Reach as the only recommender, $1.5M):

| step | value gap vs. exact | time |
|---:|---:|---:|
| $50,000 | 1.4% | <1 ms |
| $10,000 | 0.073% | 1 ms |
| $1,000 | 0.00064% | 5 ms |
| $100 | 0.0000059% | 23 ms |

Each 10× smaller step cuts the gap by about 100×, as predicted. The app uses
roughly budget/2,000 per step (≈$800 here), which is well inside "visually
exact".

## 5. When they disagree, and why it matters

With several recommenders the two methods answer different questions.

* **Pooled** maximizes one blended objective. A recommender who values a few
  applications intensely can pull the whole budget toward them.
* **Round-robin** guarantees each recommender's pool is spent on what *they*
  value. Breadth is protected.

On the demo:

| | Round-robin | Pooled |
|---|---:|---:|
| Applications funded (≥ $500) | 22 of 22 | 8 of 22 |
| Share to the top three departments | 65.5% | 78.5% |
| Value to Reach (own curves) | 13.10M | 12.18M (−7.0%) |
| Value to Equity | 31.01M | 34.53M (+11.4%) |
| Value to Gender gap | 31.12M | 34.73M (+11.6%) |

Pooling favors the two need-weighted lenses, whose curves are steep in a few
departments. Round-robin keeps Reach's share spread across every department.
Neither is "right". The point of the tool is to make the trade-off visible.

**Counterfactuals** ("what if we didn't have…") rerun the allocation with one
recommender removed and their funders' trust renormalized over the rest.
Removing Reach moves $384K and drops funding from 22 departments to 7. Removing
Gender gap moves only $61K: its curves nearly duplicate Equity's (both weight by
illiteracy, and female illiteracy tracks overall illiteracy closely), so it adds
little *independent* signal. That is a useful thing for a funding group to
notice.

## 6. How the implementation is checked

* **Property-based tests** (fast-check in TypeScript, Hypothesis in Python) on
  random curves, caps, budgets, and trust:
  - budget conservation: grants + unallocated = budget, per funder;
  - caps respected; no negative grants;
  - water-filling satisfies the KKT conditions above;
  - monotonicity: more budget never lowers any grant;
  - order independence (water-filling): permuting the applications doesn't change the result;
  - round-robin reaches the optimal *value* within the $O(\Delta)$ bound for a
    single recommender;
  - $\frac{d}{dx}V = m$ numerically, and $m^{-1}$ is a right inverse of $m$.
* **Two independent implementations.** The Python reference uses `numpy.interp`
  and solves water-filling *exactly*: it brackets $\lambda$ between consecutive
  breakpoint values and solves the linear demand equation on that interval,
  with no bisection. It writes 40 random scenarios plus its answers to a
  fixture that the TypeScript engine must reproduce to within $10^{-6}$ of the
  budget. CI fails if the fixture is stale.
* **Bugs this caught during development:**
  1. Leftover "tie" dollars at $\lambda \to 0$ went to applications with zero
     value (both implementations).
  2. The Python exact solver spread tie dollars across a whole breakpoint
     bracket instead of the flat segment at $\lambda^*$.
  3. A test that wrongly expected *grants* (not *value*) to converge under ties.
     The fix was to the claim, not the code.
  4. In the curve editor, rounding a dragged point's value to three decimals
     could put it a hair *below* its neighbor, which the server correctly
     rejected as an increasing curve.
* **The database enforces it too.** A Postgres `CHECK` constraint
  (`curve_points_valid`) rejects curves that start anywhere but 0, have
  non-increasing x, increase in m, or go negative, even if a code path skips the
  API.

## 7. Preview without leaking trust

Members can't see each other's trust weights, but the browser still previews
allocations instantly while a curve is dragged. This works because both
algorithms depend on trust *only through the pools* $P_r$. A scenario with one
synthetic funder per recommender, holding exactly $P_r$, produces identical
grants. So the server sends pools, not weights. A funder previewing their own
trust change recomputes only their own contribution to each pool. Both claims
are tested against the full computation.
