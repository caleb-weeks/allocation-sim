import Link from "next/link";
import { v1 } from "../_versions/v1";
import { v2 } from "../_versions/v2";
import { Glossary } from "../Glossary";
import { Changes } from "./Changes";
import type { HostingContent } from "./content";
import { glossaryFor } from "./glossary";
import { C, Figure, Key, Note, Section } from "./primitives";
import { editCurve, pipeline, runtime, signIn } from "./shared-diagrams";
import { LATEST, versionIds, versions, type ArchVersionId } from "./versions";

const hosting: Record<ArchVersionId, HostingContent> = { v1, v2 };

// The shared figures don't depend on the version, so draw them once per build.
const shared = { pipeline: pipeline(), runtime: runtime(), signIn: signIn(), editCurve: editCurve() };

function VersionPicker({ current }: { current: ArchVersionId }) {
  return (
    <nav aria-label="Architecture versions" className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
      {versionIds.map((id) => {
        const v = versions[id];
        const active = id === current;
        return (
          <Link
            key={id}
            href={id === LATEST ? "/architecture" : `/architecture/${id}`}
            aria-current={active ? "page" : undefined}
            className={`block px-4 py-3 ${active ? "bg-surface-2" : "bg-surface hover:bg-surface-2"}`}
          >
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold">
                {id} · {v.name}
              </span>
              {id === LATEST && <span className="font-mono text-[11px] uppercase tracking-wider text-good">current</span>}
            </div>
            <div className="text-sm text-muted">
              {v.period} · {v.cost}
            </div>
          </Link>
        );
      })}
    </nav>
  );
}

export function ArchitectureView({ version }: { version: ArchVersionId }) {
  const v = versions[version];
  const h = hosting[version];
  const facts = [
    ["Web app", "allocation.calebweeks.com", "https://allocation.calebweeks.com", "Next.js on Vercel (Hobby)"],
    ["API", "api.calebweeks.com", "https://api.calebweeks.com/health", h.apiSummary],
    ["Code", `allocation-sim · ${v.codeLabel}`, v.codeHref, "pnpm monorepo · TypeScript + Python"],
  ] as const;

  return (
    <article className="max-w-5xl space-y-14 leading-relaxed">
      <header className="space-y-4">
        <h1 className="text-3xl font-semibold tracking-tight">How it&apos;s built</h1>
        <p className="max-w-[68ch] text-ink-2">
          Where each part of the app runs, how data moves from a government PDF to each member&apos;s screen, and what
          happens step by step when someone signs in, edits a curve, or ships a change. The hosting has changed once, so
          each version is kept. For the math itself, see{" "}
          <Link href="/how-it-works" className="underline underline-offset-2">
            How it works
          </Link>
          .
        </p>
        <VersionPicker current={version} />
        {version !== LATEST && (
          <p role="note" className="rounded-md border border-border bg-surface-2 px-4 py-2.5 text-sm text-ink-2">
            You&apos;re viewing <strong className="text-ink">{version}</strong>, an earlier setup that is no longer running.
            The diagrams, notes and glossary describe the app as it was hosted then. See{" "}
            <Link href="/architecture" className="underline underline-offset-2">
              the current version
            </Link>{" "}
            or <a href="#changes" className="underline underline-offset-2">what changed</a>.
          </p>
        )}
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
            ["#changes", "Changes between versions"],
            ["#glossary", "Glossary"],
          ].map(([href, text]) => (
            <a key={href} href={href} className="border-b border-axis hover:text-ink">
              {text}
            </a>
          ))}
        </nav>
      </header>

      <Section id="architecture" title="Architecture" intro={h.architectureIntro}>
        <Key items={[["acc", "the shared engine package"], ["dash", "hosting boundary"]]} />
        <Figure svg={h.architectureSvg}>
          The same <C>packages/engine</C> code runs in two places: on the server it produces the official result, and in
          the browser it previews a change while you drag. Both hostnames share calebweeks.com, so the session cookie,
          scoped to <C>api.calebweeks.com</C> only, still counts as same-site.
        </Figure>
        <ul className="max-w-[72ch] list-disc space-y-1.5 pl-5 text-ink-2">
          <Note title="One process, two protocols.">
            Express routes and Socket.IO handlers live in the same Node process and share one permission function,{" "}
            <C>can()</C> in <C>apps/api/src/authz.ts</C>.
          </Note>
          {h.notes}
        </ul>
      </Section>

      <Section
        id="data-flow"
        title="Data flow"
        intro="Data moves twice: once at build time, from public data into the database, and on every change, from the database to each member's screen, filtered by role."
      >
        <Figure title="From source data to the demo round" svg={shared.pipeline}>
          The top row is the scenario pipeline in <C>python/pipeline</C>. The bottom row is how the math is verified: an
          independent NumPy solver writes expected answers that the TypeScript engine must reproduce. CI regenerates both
          JSON files and fails if either differs from the committed copy.
        </Figure>
        <Key items={[["acc", "engine"], ["amb", "trust weights (private to the owner and that funder)"]]} />
        <Figure title="From the database to each member's screen" svg={shared.runtime}>
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
        <Figure title="Sign in with a demo role and go live" svg={shared.signIn}>
          The WebSocket handshake reuses the REST session cookie (<C>userFromCookieHeader</C> in <C>auth.ts</C>), so
          there&apos;s one login for both channels. A non-member asking for a round gets 404, not 403, so round ids
          can&apos;t be probed.
        </Figure>
        <Figure title="A recommender edits a curve" svg={shared.editCurve}>
          Steps 2–5 are <C>PUT /rounds/:roundId/curves/:applicationId</C> in <C>routes/rounds.ts</C>; steps 6–8 are{" "}
          <C>publish()</C> in <C>realtime.ts</C>. A saved draft changes only its author&apos;s view: official results
          count shared curves, and sharing is a separate <C>POST …/share</C> that triggers the same push.
        </Figure>
        <Figure title="Ship a change" svg={h.shipSvg}>
          {h.shipCaption}
        </Figure>
      </Section>

      <Section
        id="changes"
        title="Changes between versions"
        intro="v1 ran everything on one free-tier VM. v2 moved the API to Render and the database to Neon to bring hosting to $0. Here's what that traded away."
      >
        <Changes />
      </Section>

      <Section
        id="glossary"
        title="Glossary"
        intro={`Terms used across the app, the code and these diagrams, grouped by where you'll meet them. The grey tag after each definition says where it lives in the repo${version === LATEST ? "" : ` (as of ${v.codeLabel})`}.`}
      >
        <Glossary groups={glossaryFor(version)} />
      </Section>
    </article>
  );
}
