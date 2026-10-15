import type { Metadata } from "next";

export const metadata: Metadata = { title: "How it works" };

function Eq({ children }: { children: React.ReactNode }) {
  return <div className="tabular my-3 overflow-x-auto rounded-md bg-surface-2 px-4 py-3 font-mono text-sm">{children}</div>;
}

export default function HowItWorks() {
  return (
    <article className="max-w-3xl space-y-6 leading-relaxed">
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold tracking-tight">How the allocation works</h1>
        <p className="text-ink-2">
          The mechanism follows the public description of the{" "}
          <a href="https://survivalandflourishing.fund/" className="underline underline-offset-2">
            Survival and Flourishing Fund
          </a>
          &apos;s S-process: recommenders describe marginal value, funders delegate by trust, and an algorithm turns that
          into grants. This is an independent implementation built from that description, not their software.
        </p>
      </header>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">1. Marginal value curves</h2>
        <p>
          For each application <i>a</i>, recommender <i>r</i> draws a curve <i>m</i>
          <sub>r,a</sub>(<i>x</i>): how much value one more dollar creates once <i>x</i> dollars are already granted. Curves
          are piecewise-linear and <b>non-increasing</b>. The first dollars are the most valuable, which is how
          diminishing returns show up. The total value of granting <i>x</i> is the area under the curve:
        </p>
        <Eq>V(x) = ∫₀ˣ m(t) dt</Eq>
        <p>
          Because <i>m</i> never increases, <i>V</i> is concave. That one property is what makes everything below
          well-behaved.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">2. Delegation by trust</h2>
        <p>
          Funder <i>f</i> with budget <i>B</i>
          <sub>f</sub> gives each recommender a trust weight <i>w</i>
          <sub>f,r</sub>. The funder&apos;s budget is split in proportion:
        </p>
        <Eq>D(f, r) = B_f · w(f, r) / Σ_r′ w(f, r′)</Eq>
        <p>Trust weights are private to each funder (and the round owner). Everyone else sees only the total each recommender directs.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3a. Round-robin (S-process style)</h2>
        <p>
          Recommenders take turns. On each turn a recommender places a small step (e.g. $800) on whichever application
          has the highest marginal value <i>to them</i>, given everything granted so far <i>by anyone</i>. They stop when
          nothing they value is left. Because every turn looks at the shared running total, one recommender&apos;s
          funding lowers the next dollar&apos;s value for everyone. Overlapping priorities share the cost instead of
          double-funding.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">3b. Pooled (exact water-filling)</h2>
        <p>
          The alternative treats the group as one decision-maker whose curve is the delegation-weighted average of the
          recommenders&apos; curves. For concave values, the optimum puts every partly funded application at the same
          marginal value λ, the &ldquo;water level&rdquo;:
        </p>
        <Eq>Σ_a min(cap_a, m_a⁻¹(λ)) = B</Eq>
        <p>
          The left side only decreases as λ rises, so bisection finds λ. Ties on flat stretches of a curve are split in
          proportion to how many dollars each application has at that exact level.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Why both?</h2>
        <p>
          With a single recommender, round-robin converges to the same total value as water-filling as the step shrinks.
          With several, they differ. Pooling lets intense preferences dominate: one recommender who values a program 10×
          can pull the whole budget toward it. Round-robin guarantees each recommender&apos;s delegated share gets spent
          on what <i>they</i> value. The gap between the two views, and the &ldquo;what if we didn&apos;t have…&rdquo;
          counterfactuals, are good things to discuss.
        </p>
      </section>

      <section className="space-y-2">
        <h2 className="text-xl font-semibold">How it&apos;s checked</h2>
        <ul className="list-disc space-y-1 pl-5">
          <li>
            Property-based tests on random curves and budgets: budgets are conserved, caps are respected, results don&apos;t
            depend on input order, more budget never lowers anyone&apos;s grant, and water-filling satisfies the
            optimality conditions.
          </li>
          <li>
            An independent Python implementation (NumPy, an exact breakpoint solver rather than bisection) generates
            fixtures that the TypeScript engine must match.
          </li>
          <li>The database itself rejects invalid curves with a CHECK constraint, even if the API is bypassed.</li>
        </ul>
      </section>
    </article>
  );
}
