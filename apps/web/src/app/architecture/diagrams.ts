// Hand-laid SVG for the architecture page. Each export is a static SVG string rendered at build time;
// the marks are styled by the `.diagram` rules in globals.css so they follow the app's light/dark theme.

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const CH = 6.7; // approx. width of one 11px monospace character, used to size label backgrounds

type Line = string | { t: string; cls?: string };
type Pt = [number, number];

function markers(id: string) {
  const m = (name: string, cls: string) =>
    `<marker id="${id}-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="${cls}"/></marker>`;
  return `<defs>${m("a", "mk")}${m("acc", "mk-acc")}${m("amb", "mk-amb")}</defs>`;
}

function box(x: number, y: number, w: number, h: number, title: string, subs: Line[] = [], cls = "") {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" class="bx ${cls}"/>`;
  s += `<text x="${x + 12}" y="${y + 21}" class="tt ${cls}">${esc(title)}</text>`;
  subs.forEach((t, i) => {
    const line = typeof t === "string" ? { t } : t;
    s += `<text x="${x + 12}" y="${y + 39 + i * 15}" class="ts ${line.cls ?? ""}">${esc(line.t)}</text>`;
  });
  return s;
}

function chip(x: number, y: number, w: number, title: string, sub?: string | null, cls = "") {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${sub ? 40 : 26}" rx="4" class="ch ${cls}"/>`;
  s += `<text x="${x + 10}" y="${y + 17}" class="tc ${cls}">${esc(title)}</text>`;
  if (sub) s += `<text x="${x + 10}" y="${y + 32}" class="ts">${esc(sub)}</text>`;
  return s;
}

function zone(x: number, y: number, w: number, h: number, label: string) {
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" class="zn"/><text x="${x + 14}" y="${y + 20}" class="tz">${esc(label)}</text>`;
}

const markerFor = (cls?: string) => (cls === "acc" ? "acc" : cls === "amb" ? "amb" : "a");

function edge(id: string, pts: Pt[], { cls = "", both = false, dashed = false } = {}) {
  const mk = markerFor(cls);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x},${y}`).join(" ");
  return `<path d="${d}" class="eg ${cls} ${dashed ? "dash" : ""}" marker-end="url(#${id}-${mk})"${both ? ` marker-start="url(#${id}-${mk})"` : ""}/>`;
}

function label(x: number, y: number, text: string, anchor: "start" | "middle" | "end" = "middle", cls = "") {
  const w = text.length * CH + 8;
  const left = anchor === "middle" ? x - w / 2 : anchor === "start" ? x - 4 : x - w + 4;
  return `<rect x="${left}" y="${y - 11}" width="${w}" height="15" class="lb"/><text x="${x}" y="${y}" text-anchor="${anchor}" class="tl ${cls}">${esc(text)}</text>`;
}

const svg = (id: string, w: number, h: number, aria: string, body: string) =>
  `<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(aria)}" style="min-width:${Math.min(w, 860)}px">${markers(id)}${body}</svg>`;

/* ---------- architecture ---------- */
function architecture() {
  const id = "ar";
  let b = "";
  b += box(20, 170, 230, 200, "Visitor's browser");
  b += chip(36, 202, 198, "Next.js pages", "React 19 · Tailwind 4");
  b += chip(36, 252, 198, "engine", "live preview while dragging", "acc");
  b += chip(36, 302, 198, "socket.io-client", "round:state · presence");
  b += box(20, 400, 230, 76, "DNS at Hover", ["allocation → Vercel (CNAME)", "api → 34.29.103.145 (A)"]);
  b += zone(330, 30, 240, 120, "Vercel · Hobby plan");
  b += box(345, 62, 210, 70, "Next.js app", ["allocation.calebweeks.com"]);
  b += zone(670, 30, 310, 120, "GitHub");
  b += box(690, 62, 110, 70, "repo", ["main"]);
  b += box(850, 62, 110, 70, "Actions", ["CI · deploy"]);
  b += zone(330, 190, 650, 300, "GCP e2-micro VM · Debian 12 · us-central1-a");
  b += box(350, 252, 130, 80, "Caddy", [":443 · TLS", "Let's Encrypt"]);
  b += box(560, 232, 230, 146, "allocation-api", ["systemd · Node 22"]);
  b += chip(574, 278, 202, "Express · REST routes");
  b += chip(574, 310, 202, "Socket.IO · rooms");
  b += chip(574, 342, 202, "engine · official results", null, "acc");
  b += box(840, 262, 120, 80, "Postgres", ["unix socket", "peer auth"]);
  b += box(560, 410, 230, 66, "cron · nightly", ["03:15 pg_dump (keep 14)", "03:30 demo reset"]);
  b += edge(id, [[135, 170], [135, 97], [345, 97]]);
  b += label(240, 90, "pages + JS");
  b += edge(id, [[250, 274], [350, 274]]);
  b += label(300, 266, "REST + cookie");
  b += edge(id, [[250, 310], [350, 310]], { both: true });
  b += label(300, 328, "WebSocket");
  b += edge(id, [[690, 97], [555, 97]]);
  b += label(622, 89, "build on push");
  b += edge(id, [[800, 97], [850, 97]]);
  b += edge(id, [[905, 132], [905, 172], [675, 172], [675, 232]]);
  b += label(790, 166, "Deploy API: ssh → deploy.sh");
  b += edge(id, [[480, 292], [560, 292]]);
  b += label(520, 284, "→ :4000");
  b += edge(id, [[790, 302], [840, 302]]);
  b += label(815, 294, "Prisma");
  b += edge(id, [[790, 443], [900, 443], [900, 342]]);
  b += label(845, 436, "dump · reseed");
  return svg(id, 1000, 500, "Architecture: the browser loads the Next.js app from Vercel and talks to one Node process on a GCP VM over REST and a WebSocket, through Caddy. The same engine package runs in the browser and on the server.", b);
}

/* ---------- build-time data + verification ---------- */
function pipeline() {
  const id = "pl";
  let b = "";
  const xs = [20, 310, 600, 890] as const;
  const w = 170;
  b += `<text x="20" y="34" class="tz">Source data → demo round</text>`;
  b += box(xs[0], 50, w, 72, "CONALFA PDF", ["2023 projection", "22 departments"]);
  b += box(xs[1], 50, w, 72, "conalfa-2023.csv", ["counts + rates", "by sex"]);
  b += box(xs[2], 50, w, 72, "Scenario JSON", ["3 lenses · 2 funders", "cost assumptions"]);
  b += box(xs[3], 50, w, 72, "Postgres", ["demo round", "7 demo personas"]);
  const arrow = (i: 0 | 1 | 2, y: number, top: string, bottom: string | null, cls = "") => {
    const from = xs[i] + w;
    const to = xs[(i + 1) as 1 | 2 | 3];
    let s = edge(id, [[from, y], [to, y]], { cls });
    s += label((from + to) / 2, y - 8, top, "middle", cls);
    if (bottom) s += label((from + to) / 2, y + 18, bottom);
    return s;
  };
  b += arrow(0, 86, "extract_conalfa", "pdftotext");
  b += arrow(1, 86, "build_seed.py", "curve per lens");
  b += arrow(2, 86, "prisma/seed.ts", "demo:reset");
  b += `<text x="20" y="190" class="tz">Two implementations must agree</text>`;
  b += box(xs[0], 206, w, 72, "Python reference", ["solvers.py · NumPy", "exact breakpoints"]);
  b += box(xs[1], 206, w, 72, "cross-check.json", ["40 random cases", "seed 20261013"]);
  b += box(xs[2], 206, w, 72, "Engine tests", ["vitest · fast-check", "match within 1e-6"], "acc");
  b += box(xs[3], 206, w, 72, "GitHub Actions", ["fails if either", "JSON is stale"]);
  b += arrow(0, 242, "cross_check.py", "writes");
  b += arrow(1, 242, "replayed by", null);
  b += arrow(2, 242, "run in CI", null);
  b += edge(id, [[975, 206], [975, 160], [685, 160], [685, 122]], { dashed: true });
  b += label(830, 154, "build_seed --check");
  return svg(id, 1080, 292, "Data pipeline: the CONALFA PDF becomes a CSV, then a scenario JSON, then the seeded demo round. Separately, a Python reference solver writes a fixture of 40 cases that the TypeScript engine tests must reproduce, and CI fails if either JSON file is stale.", b);
}

/* ---------- runtime: what each member receives ---------- */
function runtime() {
  const id = "rt";
  let b = "";
  b += box(20, 70, 190, 150, "Postgres", [
    "memberships (role)",
    "applications (cap)",
    "curves (isShared, v)",
    { t: "trust (weights)", cls: "amb" },
    "audit_event",
  ]);
  b += box(270, 70, 200, 150, "compute(round)", ["once per change"]);
  b += chip(284, 116, 172, "official scenario", "shared curves only");
  b += chip(284, 164, 172, "engine · both methods", "pools per recommender", "acc");
  b += box(530, 70, 190, 150, "viewFor(member)", ["once per socket", "", "curves: can(curve:view)", { t: "trust: can(trust:view)", cls: "amb" }, "pools + grants: all"]);
  b += edge(id, [[210, 145], [270, 145]]);
  b += label(240, 137, "load");
  b += edge(id, [[470, 145], [530, 145]]);
  b += `<line x1="770" y1="30" x2="770" y2="440" class="eg dash"/>`;
  b += `<text x="762" y="44" text-anchor="end" class="tz">API</text><text x="778" y="44" class="tz">browsers</text>`;
  const members: [string, Line[]][] = [
    ["Owner", ["shared curves", { t: "every funder's trust", cls: "amb" }]],
    ["Funder", ["shared curves", { t: "own trust only", cls: "amb" }]],
    ["Recommender", ["own drafts + shared", "pools, no weights"]],
    ["Observer", ["grants + pools", "no curves"]],
  ];
  members.forEach(([name, subs], i) => {
    const y = 60 + i * 96;
    b += box(820, y, 180, 80, name, subs);
    b += edge(id, [[720, 145], [800, 145], [800, y + 40], [820, y + 40]]);
  });
  b += label(760, 137, "round:state");
  b += box(270, 280, 460, 96, "In the browser: scenarioFromView", [
    "one synthetic funder per recommender, holding pool P_r",
    "grants depend on trust only through P_r → same result",
    "dragging a curve reruns the engine locally",
  ], "acc");
  b += edge(id, [[820, 328], [730, 328]], { cls: "acc" });
  b += label(760, 320, "pools", "middle", "acc");
  return svg(id, 1020, 450, "Runtime data flow: the server computes the official result once per change, then viewFor filters it for each member. Trust weights reach only the owner and their own funder; everyone gets per-recommender pools, which are enough to preview grants exactly in the browser.", b);
}

/* ---------- sequence diagrams ---------- */
type Participant = { key: string; label: string; sub: string; x?: number; cls?: string };
type Step =
  | { msg: [string, string]; label: string | string[]; reply?: boolean; cls?: string }
  | { self: string; lines: string[]; cls?: string }
  | { frame: "alt" | "loop"; label: string; span: string[]; extra?: number }
  | { frame: "else"; label: string }
  | { frame: "end" };

type OpenFrame = { n: number; kind: string; label: string; x: number; w: number; y: number; elses: { n: number; y: number; label: string }[] };

function sequence(id: string, parts: Participant[], steps: Step[], aria: string) {
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

const signIn = () =>
  sequence(
    "s1",
    [
      { key: "B", label: "Browser", sub: "Next.js app" },
      { key: "A", label: "Express API", sub: "api.calebweeks.com" },
      { key: "S", label: "Socket.IO", sub: "same Node process" },
      { key: "D", label: "Postgres", sub: "via Prisma" },
    ],
    [
      { msg: ["B", "A"], label: "1. POST /auth/demo {email}" },
      { self: "A", lines: ["checkOrigin: must be the web app's origin", "demo persona → its user"] },
      { msg: ["A", "D"], label: "2. INSERT session id = sha256(token)" },
      { msg: ["A", "B"], reply: true, label: ["3. 200 + Set-Cookie sid", "HttpOnly · Secure · Lax · host-only"] },
      { msg: ["B", "A"], label: ["4. GET /rounds, then", "GET /rounds/:id (cookie)"] },
      { msg: ["A", "D"], label: "membership + round + trust" },
      { self: "A", lines: ["authorize(round:view): non-member → 404", "compute → viewFor(this member)"] },
      { msg: ["A", "B"], reply: true, label: "5. RoundView for this role" },
      { msg: ["B", "S"], label: "6. connect wss:// (cookie in handshake)" },
      { msg: ["S", "D"], label: "session lookup" },
      { msg: ["B", "S"], label: "7. round:join(roundId)" },
      { self: "S", lines: ["membership + can(round:view)", "join room round:<id>"] },
      { msg: ["S", "B"], reply: true, label: "8. ack {ok} → header shows ● Live", cls: "acc" },
      { msg: ["S", "B"], reply: true, label: "9. round:state · presence to the room" },
    ],
    "Sign-in sequence: the demo login sets a host-only session cookie; the page loads its role-filtered view over REST, then opens a WebSocket that authenticates with the same cookie and joins the round's room.",
  );

const editCurve = () =>
  sequence(
    "s2",
    [
      { key: "R", label: "Recommender", sub: "browser" },
      { key: "A", label: "Express API", sub: "rounds router" },
      { key: "D", label: "Postgres", sub: "one transaction" },
      { key: "S", label: "Socket.IO", sub: "publish()" },
      { key: "O", label: "Other members", sub: "everyone else" },
    ],
    [
      { self: "R", cls: "acc", lines: ["1. drag a point → draftCurve", "engine reruns in the browser", "no request while dragging"] },
      { msg: ["R", "A"], label: ["2. PUT /curves/:app", "{points, expectedVersion}"] },
      { self: "A", lines: ["checkOrigin · loadUser", "authorize(curve:edit, author = me)", "zod shape + validateCurve"] },
      { msg: ["A", "D"], label: "3. BEGIN · read curve" },
      { frame: "alt", label: "[version ≠ expectedVersion]", span: ["R", "D"], extra: 200 },
      { msg: ["A", "R"], reply: true, cls: "amb", label: "409 {currentVersion}" },
      { frame: "else", label: "[versions match]" },
      { msg: ["A", "D"], label: ["4. UPDATE curve, version + 1", "INSERT audit_event · COMMIT"] },
      { self: "D", lines: ["CHECK curve_points_valid", "rejects bad shapes even here"] },
      { msg: ["A", "R"], reply: true, label: "5. 200 {version}" },
      { frame: "end" },
      { msg: ["A", "S"], label: "6. notifyRoundChanged(roundId)" },
      { msg: ["S", "D"], label: "7. loadRound + trust" },
      { self: "S", lines: ["compute once: round-robin + pooled"] },
      { frame: "loop", label: "[each socket in round:<id>]", span: ["R", "O"] },
      { self: "S", lines: ["re-check membership", "removed → round:removed", "viewFor(member)"] },
      { msg: ["S", "R"], reply: true, label: "8. round:state" },
      { msg: ["S", "O"], reply: true, label: "8. round:state (each their own)" },
      { frame: "end" },
    ],
    "Curve edit sequence: dragging previews locally; on release the browser PUTs the curve with its expected version. The API authorizes and validates, then updates the curve and writes an audit event in one transaction, or returns 409 on a version conflict. Socket.IO recomputes once and pushes each member their own filtered view.",
  );

const ship = () =>
  sequence(
    "s3",
    [
      { key: "Y", label: "You", sub: "git push", x: 80 },
      { key: "G", label: "GitHub", sub: "repo + Actions", x: 300 },
      { key: "V", label: "Vercel", sub: "web app", x: 520 },
      { key: "M", label: "GCP VM", sub: "deploy.sh", x: 720 },
    ],
    [
      { msg: ["Y", "G"], label: "1. git push main" },
      { self: "G", lines: ["2. CI: typecheck · engine + web tests", "python + fixture --check", "api tests against postgres:17"] },
      { msg: ["G", "V"], label: "3. webhook: new commit" },
      { self: "V", lines: ["build engine, then next build", "promote → allocation.calebweeks.com", "doesn't wait for CI"] },
      { msg: ["Y", "G"], label: ["4. run Deploy API", "(manual, main only)"] },
      { msg: ["G", "M"], label: "5. ssh allocation@VM deploy.sh" },
      { self: "M", lines: ["git reset --hard origin/main", "pnpm install · build · migrate deploy", "systemctl restart allocation-api", "poll /health for up to 20s"] },
      { msg: ["M", "G"], reply: true, label: "6. deployed <sha>, or logs + exit 1" },
    ],
    "Ship sequence: a push to main runs CI on GitHub Actions and, independently, a Vercel build of the web app. The API deploys when the manual Deploy API workflow SSHes into the VM and runs deploy.sh, which pulls, builds, migrates, restarts and waits for the health check.",
  );

export const diagrams = {
  architecture: architecture(),
  pipeline: pipeline(),
  runtime: runtime(),
  signIn: signIn(),
  editCurve: editCurve(),
  ship: ship(),
};
