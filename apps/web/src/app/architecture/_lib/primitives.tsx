// Small layout pieces shared by every version of the architecture page.

export function C({ children }: { children: React.ReactNode }) {
  return <code className="rounded bg-surface-2 px-1 font-mono text-[0.86em] [overflow-wrap:anywhere]">{children}</code>;
}

export function Figure({ title, svg, children }: { title?: string; svg: string; children: React.ReactNode }) {
  return (
    <figure className="space-y-3">
      {title && <h3 className="text-lg font-semibold">{title}</h3>}
      {/* Static SVG generated at build time from the diagram modules. */}
      <div className="diagram overflow-x-auto rounded-lg border border-border bg-surface p-3" dangerouslySetInnerHTML={{ __html: svg }} />
      <figcaption className="max-w-[80ch] text-sm text-muted">{children}</figcaption>
    </figure>
  );
}

export function Key({ items }: { items: ["acc" | "amb" | "dash", string][] }) {
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

export function Section({ id, title, intro, children }: { id: string; title: string; intro: React.ReactNode; children: React.ReactNode }) {
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

export function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <li>
      <strong className="text-ink">{title}</strong> {children}
    </li>
  );
}
