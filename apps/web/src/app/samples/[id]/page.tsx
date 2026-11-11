import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DemoPicker } from "@/components/DemoPicker";
import { money } from "@/lib/format";
import { getSample, getSamples } from "@/lib/samples";

export const dynamicParams = false;

export function generateStaticParams() {
  return getSamples().map((s) => ({ id: s.id }));
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const s = getSample((await params).id);
  return s ? { title: s.title, description: s.summary } : {};
}

export default async function SamplePage({ params }: Props) {
  const s = getSample((await params).id);
  if (!s) notFound();

  return (
    <div className="space-y-10">
      <header className="max-w-3xl space-y-3">
        <Link href="/" className="text-sm text-ink-2 hover:text-ink">
          ← All projects
        </Link>
        <h1 className="text-3xl font-semibold tracking-tight">{s.title}</h1>
        <p className="text-lg text-ink-2">{s.summary}</p>
        <dl className="flex flex-wrap gap-x-8 gap-y-2 pt-1 text-sm">
          {[
            ["Projects", String(s.applications.length)],
            ["Budget", money(s.totalBudget)],
            ["Could absorb", money(s.totalCaps)],
            ["Value measured in", s.valueUnit],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="text-muted">{k}</dt>
              <dd className="font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
      </header>

      <section className="space-y-3" aria-labelledby="try">
        <div>
          <h2 id="try" className="text-xl font-semibold">
            Try it as…
          </h2>
          <p className="text-sm text-ink-2">
            One click, no account. Everyone shares this sample&apos;s demo round, and it resets every night. Open two roles
            in two browsers to watch changes sync.
          </p>
        </div>
        <DemoPicker sample={s.id} />
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Three ways of seeing it</h2>
          <ul className="space-y-2">
            {s.recommenders.map((r) => (
              <li key={r.name} className="rounded-lg border border-border bg-surface px-4 py-3">
                <div className="font-semibold">{r.name}</div>
                <div className="text-sm text-ink-2">{r.lens}</div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-ink-2">
            Funders {s.funders.map((f) => `${f.name} (${money(f.budget)})`).join(" and ")} split their budgets across these
            recommenders by trust. The names are fictional.
          </p>
        </div>
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Where the numbers come from</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {s.sources.map((src) => (
              <li key={src.url}>
                <a href={src.url} className="underline underline-offset-2 [overflow-wrap:anywhere]">
                  {src.name}
                </a>
              </li>
            ))}
          </ul>
          {s.assumptionsNote && (
            <p className="text-sm text-ink-2">
              <span className="font-medium text-ink">Assumptions:</span> {s.assumptionsNote}
            </p>
          )}
          <p className="text-sm text-ink-2">
            Want to run this with your own group?{" "}
            <Link href={`/rounds/new?from=${s.id}`} className="underline underline-offset-2">
              Start your own round from this sample
            </Link>
            .
          </p>
        </div>
      </section>
    </div>
  );
}
