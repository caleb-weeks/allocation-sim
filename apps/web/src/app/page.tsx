import Link from "next/link";
import { money } from "@/lib/format";
import { getSamples } from "@/lib/samples";

export default function Home() {
  const samples = getSamples();
  return (
    <div className="space-y-10">
      <section className="max-w-3xl space-y-4 pt-4">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Decide together how to split a budget.</h1>
        <p className="text-lg text-ink-2">
          Recommenders draw how much each extra dollar to each project is worth to them. Funders choose how much to trust
          each recommender. The simulator turns that into an allocation, live, and shows what would change without any
          one voice.{" "}
          <Link href="/how-it-works" className="text-base underline underline-offset-2 hover:text-ink">
            How the math works
          </Link>
        </p>
      </section>

      <section className="space-y-4" aria-labelledby="pick">
        <div className="space-y-1">
          <h2 id="pick" className="text-xl font-semibold">
            Pick a project to explore
          </h2>
          <p className="text-sm text-ink-2">
            Each sample is built from public data, with three recommenders who see it differently. Or bring your own list of
            projects.
          </p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {samples.map((s) => (
            <li key={s.id}>
              <Link
                href={`/samples/${s.id}`}
                className="flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-4 transition hover:border-ink-2"
              >
                <span className="font-semibold">{s.title}</span>
                <span className="text-sm text-ink-2">{s.summary}</span>
                <span className="mt-auto pt-1 font-mono text-xs text-muted">
                  {s.applications.length} projects · {money(s.totalBudget)} budget
                </span>
              </Link>
            </li>
          ))}
          <li>
            <Link
              href="/rounds/new"
              className="flex h-full flex-col gap-2 rounded-lg border border-dashed border-axis bg-page p-4 transition hover:border-ink-2"
            >
              <span className="font-semibold">Your own project</span>
              <span className="text-sm text-ink-2">
                List the things you&apos;re choosing between and how much each could use, then invite your funders and
                recommenders. Needs a free account.
              </span>
              <span className="mt-auto pt-1 font-mono text-xs text-muted">start from scratch or from a sample</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
