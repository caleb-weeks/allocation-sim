"use client";

import { useState } from "react";
import type { GlossaryGroup } from "./_lib/glossary";

export function Glossary({ groups: all }: { groups: GlossaryGroup[] }) {
  const total = all.reduce((n, g) => n + g.terms.length, 0);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const groups = all
    .map((g) => ({ ...g, terms: q ? g.terms.filter((t) => t.join(" ").toLowerCase().includes(q)) : g.terms }))
    .filter((g) => g.terms.length > 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <label htmlFor="gloss-filter" className="text-sm text-muted">
          Filter {total} terms
        </label>
        <input
          id="gloss-filter"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. trust, pool, cookie"
          autoComplete="off"
          className="w-full max-w-xs rounded-md border border-border bg-surface px-3 py-1.5 text-base"
        />
        {groups.length === 0 && <span className="text-sm text-muted">No terms match.</span>}
      </div>
      {groups.map((g) => (
        <div key={g.id} className="space-y-3">
          <h3 className="border-b border-border pb-2 font-mono text-xs font-medium uppercase tracking-widest text-muted">
            {g.title}
          </h3>
          <dl className="grid gap-x-10 gap-y-4 [grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr))]">
            {g.terms.map(([term, def, where]) => (
              <div key={term} className="min-w-0 space-y-0.5">
                <dt className="font-semibold">{term}</dt>
                <dd className="text-[15px] text-ink-2">
                  {def}
                  {where && (
                    <>
                      {" "}
                      <code className="rounded bg-surface-2 px-1.5 font-mono text-xs text-muted [overflow-wrap:anywhere]">
                        {where}
                      </code>
                    </>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
