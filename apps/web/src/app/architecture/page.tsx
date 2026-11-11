import type { Metadata } from "next";
import Link from "next/link";
import { diagrams } from "./diagrams";
import { Glossary } from "./Glossary";

export const metadata: Metadata = {
  title: "Architecture",
  description: "Where each part of the allocation simulator runs, how data moves through it, and a glossary of its terms.",
};

function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 font-mono text-[0.86em] [overflow-wrap:anywhere]">{children}</code>;
}

function Figure({ title, svg, children }: { title?: string; svg: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-3">
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      {/* Static SVG generated at build time from diagrams.ts. */}
      <div className="diagram overflow-x-auto rounded-lg border border-border bg-surface p-3" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="max-w-[80ch] text-sm text-muted">{children}</figcaption>
    </figure>
  );
}

function Key({ items }: { items: ["acc" | "amb" | "dash", string][] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-1.5 font-mono text-xs text-muted">
      {items.map(([kind, text]) => (
        <span key={text} className="flex items-center gap-1.5">
          <i className={`diagram-key diagram-key-${kind}`} aria-hidden />
          {text}
        </span>
      ))}
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: string; intro: React.ReactNode; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 space-y-5">
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
        <p className="max-w-[68ch] text-ink-2">{intro}</p>
      </div>
      {children}
    </section>
  );
}

const facts = [
  ["Web app", "allocation.calebweeks.com", "https://allocation.calebweeks.com", "Next.js on Vercel (Hobby)"],
  ["API", "api.calebweeks.com", "https://api.calebweeks.com/health", "Express + Socket.IO on a GCP e2-micro"],
  ["Code", "caleb-weeks/allocation-sim", "https://github.com/caleb-weeks/allocation-sim", "pnpm monorepo · TypeScript + Python"],
] as const;

export default function Architecture() {
  return (
    <article className="max-w-5xl space-y-14 leading-relaxed">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">How it&apos;s built</h1>
        <p className="max-w-[68ch] text-ink-2">
          Where each part of the app runs, how data moves from a government PDF to each member&apos;s screen, and what
          happens step by step when someone signs in, edits a curve, or ships a change. For the math itself, see{" "}
          <Link href="/how-it-works" className="underline underline-offset-2">
            How it works
          </Link>
          .
        </p>
        <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          {facts.map(([k, text, href, sub]) => (
            <div key={k} className="min-w-0 bg-surface px-4 py-3">
              <div className="font-mono text-[11px] uppercase tracking-wider text-muted">{k}</div>
              <a href={href} className="font-semibold underline-offset-2 [overflow-wrap:anywhere] hover:underline">
                {text}
              </a>
              <div className="text-sm text-muted">{sub}</div>
            </div>
          ))}
        </div>
        <nav aria-label="Sections" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium text-ink-2">
          {[
            ["#architecture", "Architecture"],
            ["#data-flow", "Data flow"],
            ["#sequences", "Sequences"],
            ["#glossary", "Glossary"],
          ].map(([href, text]) => (
            <a key={href} href={href} className="border-b border-axis hover:text-ink">
              {text}
            </a>
          ))}
        </nav>
      </header>

      <Section
        id="architecture"
        title="Architecture"
        intro="Two hosts serve the app. Vercel serves the web pages; one Node process on a small GCP VM serves both the REST API and the live WebSocket, behind Caddy, with Postgres on the same machine."
      >
        <Key items={[["acc", "the shared engine package"], ["dash", "hosting boundary"]]} />
        <Figure svg={diagrams.architecture}>
          The same <C>packages/engine</C> code runs in two places: on the server it produces the official result, and in
          the browser it previews a change while you drag. Both hostnames share calebweeks.com, so the session cookie,
          scoped to <C>api.calebweeks.com</C> only, still counts as same-site.
        </Figure>
        <ul className="max-w-[72ch] list-disc space-y-1.5 pl-5 text-ink-2">
          <li>
            <strong className="text-ink">One process, two protocols.</strong> Express routes and Socket.IO handlers live in
            the same Node process and share one permission function, <C>can()</C> in <C>apps/api/src/authz.ts</C>.
          </li>
          <li>
            <strong className="text-ink">Caddy only terminates TLS.</strong> It gets the Let&apos;s Encrypt certificate,
            adds HSTS and proxies everything to <C>127.0.0.1:4000</C>. Node never listens publicly.
          </li>
          <li>
            <strong className="text-ink">Postgres has no network port.</strong> The API connects over a unix socket with
            peer auth, so there&apos;s no database password to leak.
          </li>
          <li>
            <strong className="text-ink">Cron keeps the demo tidy.</strong> A nightly <C>pg_dump</C> (14 kept, each
            verified readable), then a demo reset that rebuilds the shared round.
          </li>
        </ul>
      </Section>

      <Section
        id="data-flow"
        title="Data flow"
        intro="Data moves twice: once at build time, from public data into the database, and on every change, from the database to each member's screen, filtered by role."
      >
        <Figure title="From source data to the demo round" svg={diagrams.pipeline}>
          The top row is the scenario pipeline in <C>python/pipeline</C>. The bottom row is how the math is verified: an
          independent NumPy solver writes expected answers that the TypeScript engine must reproduce. CI regenerates both
          JSON files and fails if either differs from the committed copy.
        </Figure>
        <Key items={[["acc", "engine"], ["amb", "trust weights (private to the owner and that funder)"]]} />
        <Figure title="From the database to each member's screen" svg={diagrams.runtime}>
          The result is computed once per change and filtered once per connected member. Trust weights never cross to
          recommenders or observers. Everyone receives per-recommender pools instead, and that turns out to be enough: the
          allocation depends on trust only through those pools, so the browser can rebuild the scenario and preview grants
          exactly (<C>apps/web/src/lib/preview.ts</C>).
        </Figure>
      </Section>

      <Section
        id="sequences"
        title="Sequences"
        intro="Three paths through the system, step by step. Solid arrows are requests; dashed arrows are replies and pushes."
      >
        <Figure title="Sign in with a demo role and go live" svg={diagrams.signIn}>
          The WebSocket handshake reuses the REST session cookie (<C>userFromCookieHeader</C> in <C>auth.ts</C>), so
          there&apos;s one login for both channels. A non-member asking for a round gets 404, not 403, so round ids
          can&apos;t be probed.
        </Figure>
        <Figure title="A recommender edits a curve" svg={diagrams.editCurve}>
          Steps 2–5 are <C>PUT /rounds/:roundId/curves/:applicationId</C> in <C>routes/rounds.ts</C>; steps 6–8 are{" "}
          <C>publish()</C> in <C>realtime.ts</C>. A saved draft changes only its author&apos;s view: official results
          count shared curves, and sharing is a separate <C>POST …/share</C> that triggers the same push.
        </Figure>
        <Figure title="Ship a change" svg={diagrams.ship}>
          Vercel deploys the web app on every push to <C>main</C>. The API deploys separately: the manual Deploy API
          workflow SSHes into the VM and runs <C>infra/vm/deploy.sh</C>, which can also be run by hand over{" "}
          <C>gcloud compute ssh</C>.
        </Figure>
      </Section>

      <Section
        id="glossary"
        title="Glossary"
        intro="Terms used across the app, the code and these diagrams, grouped by where you'll meet them. The grey tag after each definition says where it lives in the repo."
      >
        <Glossary />
      </Section>
    </article>
  );
}
