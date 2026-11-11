// v1 hosting (Nov 3–11, 2026): the API, Caddy and Postgres on one GCP e2-micro VM.
import { box, chip, edge, label, sequence, svg, zone } from "../_lib/draw";

/* ---------- architecture ---------- */
export function architecture() {
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

export const ship = () =>
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

/* ---------- build-time data + verification ---------- */
export function pipeline() {
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
