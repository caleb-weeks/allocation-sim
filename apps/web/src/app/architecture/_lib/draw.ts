// Drawing primitives for the architecture diagrams: boxes, chips, zones, labeled edges and a small
// sequence-diagram layout engine. Output is static SVG markup styled by the `.diagram` rules in globals.css.

export const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CH = 6.7; // approx. width of one 11px monospace character, used to size label backgrounds

export type Line = string | { t: string; cls?: string };
export type Pt = [number, number];

function markers(id: string) {
  const m = (name: string, cls: string) =>
    `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="${cls}"/></marker>`;
  return `<defs>${m("a", "mk")}${m("acc", "mk-acc")}${m("amb", "mk-amb")}</defs>`;
}

export function box(x: number, y: number, w: number, h: number, title: string, subs: Line[] = [], cls = "") {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="bx ${cls}"/>`;
  s += `<text x="${x + 12}" y="${y + 21}" class="tt ${cls}">${esc(title)}</text>`;
  subs.forEach((t, i) => {
    const line = typeof t === "string" ? { t } : t;
    s += `<text x="${x + 12}" y="${y + 39 + i * 15}" class="ts ${line.cls ?? ""}">${esc(line.t)}</text>`;
  });
  return s;
}

export function chip(x: number, y: number, w: number, title: string, sub?: string | null, cls = "") {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${sub ? 40 : 26}" rx="4" class="ch ${cls}"/>`;
  s += `<text x="${x + 10}" y="${y + 17}" class="tc ${cls}">${esc(title)}</text>`;
  if (sub) s += `<text x="${x + 10}" y="${y + 32}" class="ts">${esc(sub)}</text>`;
  return s;
}

export function zone(x: number, y: number, w: number, h: number, label: string) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="zn"/><text x="${x + 14}" y="${y + 20}" class="tz">${esc(label)}</text>`;
}

const markerFor = (cls?: string) => (cls === "acc" ? "acc" : cls === "amb" ? "amb" : "a");

export function edge(id: string, pts: Pt[], { cls = "", both = false, dashed = false } = {}) {
  const mk = markerFor(cls);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return `<path d="${d}" class="eg ${cls} ${dashed ? "dash" : ""}" marker-end="url(#${id}-${mk})"${both ? ` marker-start="url(#${id}-${mk})"` : ""}/>`;
}

export function label(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", cls = "") {
  const w = text.length * CH + 8;
  const left = anchor === "middle" ? x - w / 2 : anchor === "start" ? x - 4 : x - w + 4;
  return `<rect x="${left}" y="${y - 11}" width="${w}" height="15" class="lb"/><text x="${x}" y="${y}" text-anchor="${anchor}" class="tl ${cls}">${esc(text)}</text>`;
}

export const svg = (id: string, w: number, h: number, aria: string, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}" style="min-width:${Math.min(w, 860)}px">${markers(id)}${body}</svg>`;


export type Participant = { key: string; label: string; sub: string; x?: number; cls?: string };
export type Step =
  | { msg: [string, string]; label: string | string[]; reply?: boolean; cls?: string }
  | { self: string; lines: string[]; cls?: string }
  | { frame: "alt" | "loop"; label: string; span: string[]; extra?: number }
  | { frame: "else"; label: string }
  | { frame: "end" };

type OpenFrame = { n: number; kind: string; label: string; x: number; w: number; y: number; elses: { n: number; y: number; label: string }[] };

export function sequence(id: string, parts: Participant[], steps: Step[], aria: string) {
  const W = 1000, top = 18, headH = 46;
  const gap = (W - 160) / (parts.length - 1);
  const X: Record<string, number> = Object.fromEntries(parts.map((p, i) => [p.key, p.x ?? 80 + i * gap]));
  const at = (k: string) => X[k] ?? 0;
  let y = top + headH + 26;
  let body = "";
  let frameSvg = "";
  let counter = 0;
  const frames: OpenFrame[] = [];
  for (const s of steps) {
    if ("msg" in s) {
      const [a, z] = s.msg;
      const lines = ([] as string[]).concat(s.label);
      y += (lines.length - 1) * 15;
      const x1 = at(a), x2 = at(z);
      const dir = Math.sign(x2 - x1);
      body += `<path d="M${x1},${y} L${x2 - dir * 2},${y}" class="eg ${s.reply ? "dash" : ""} ${s.cls ?? ""}" marker-end="url(#${id}-${markerFor(s.cls)})"/>`;
      lines.forEach((t, i) => (body += label((x1 + x2) / 2, y - 8 - (lines.length - 1 - i) * 15, t, "middle", s.cls ?? "")));
      y += 38;
    } else if ("self" in s) {
      const x = at(s.self);
      const h = 10 + s.lines.length * 15;
      body += `<path d="M${x},${y - 12} h18 v${h} h-16" class="eg ${s.cls ?? ""}" marker-end="url(#${id}-${markerFor(s.cls)})"/>`;
      s.lines.forEach((t, i) => (body += label(x + 26, y - 1 + i * 15, t, "start", i === 0 ? s.cls ?? "" : "")));
      y += h + 22;
    } else if (s.frame === "end") {
      const f = frames.pop();
      if (!f) throw new Error("unbalanced frame");
      // The frame outline goes behind everything; its tab and divider lines sit with the messages.
      frameSvg += `<rect x="${f.x}" y="${f.y}" width="${f.w}" height="${y - f.y - 18}" rx="4" class="fr"/>`;
      body = body.replace(
        `%%FRAME${f.n}%%`,
        `<path d="M${f.x},${f.y + 18} h${f.kind.length * CH + 14} l6,-6 v-12" class="frl"/><text x="${f.x + 6}" y="${f.y + 13}" class="tk">${esc(f.kind)}</text><text x="${f.x + f.kind.length * CH + 26}" y="${f.y + 13}" class="tl">${esc(f.label)}</text>`,
      );
      for (const e of f.elses)
        body = body.replace(`%%ELSE${e.n}%%`, `<line x1="${f.x}" x2="${f.x + f.w}" y1="${e.y}" y2="${e.y}" class="frd"/><text x="${f.x + 6}" y="${e.y + 14}" class="tl">${esc(e.label)}</text>`);
      y += 4;
    } else if (s.frame === "else") {
      const f = frames[frames.length - 1];
      if (!f) throw new Error("else outside a frame");
      const n = counter++;
      f.elses.push({ n, y: y - 20, label: s.label });
      body += `%%ELSE${n}%%`;
      y += 8;
    } else {
      const n = counter++;
      const xs = s.span.map(at);
      frames.push({ n, kind: s.frame, label: s.label, x: Math.min(...xs) - 40, w: Math.max(...xs) - Math.min(...xs) + 80 + (s.extra ?? 0), y: y - 22, elses: [] });
      body += `%%FRAME${n}%%`;
      y += 18;
    }
  }
  const H = y + 4;
  let head = "";
  for (const p of parts) {
    const x = at(p.key);
    head += `<line x1="${x}" x2="${x}" y1="${top + headH}" y2="${H - 8}" class="ll"/>`;
    head += `<rect x="${x - 72}" y="${top}" width="144" height="${headH}" rx="6" class="bx ${p.cls ?? ""}"/>`;
    head += `<text x="${x}" y="${top + 20}" text-anchor="middle" class="tt">${esc(p.label)}</text>`;
    head += `<text x="${x}" y="${top + 36}" text-anchor="middle" class="ts">${esc(p.sub)}</text>`;
  }
  return svg(id, W, H, aria, head + frameSvg + body);
}
