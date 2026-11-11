// v2 hosting (since Nov 11, 2026): the API on Render's free plan, Postgres on Neon's free plan.
import { box, chip, edge, label, sequence, svg, zone } from "../_lib/draw";

/* ---------- architecture ---------- */
export function architecture() {
  const id = "ar";
  let b = "";
  b += box(20, 170, 230, 200, "Visitor's browser");
  b += chip(36, 202, 198, "Next.js pages", "React 19 · Tailwind 4");
  b += chip(36, 252, 198, "engine", "live preview while dragging", "acc");
  b += chip(36, 302, 198, "socket.io-client", "round:state · presence");
  b += box(20, 400, 230, 76, "DNS at Hover", ["allocation → Vercel (CNAME)", "api → Render (CNAME)"]);
  b += zone(330, 30, 240, 120, "Vercel · Hobby plan");
  b += box(345, 62, 210, 70, "Next.js app", ["allocation.calebweeks.com"]);
  b += zone(670, 30, 310, 120, "GitHub");
  b += box(690, 62, 110, 70, "repo", ["main"]);
  b += box(850, 62, 110, 70, "Actions", ["CI · reset"]);
  b += zone(330, 190, 420, 220, "Render · free web service");
  b += box(350, 252, 130, 80, "Render edge", [":443 · TLS", "wakes on request"]);
  b += box(510, 232, 230, 146, "allocation-api", ["one instance · Node 22"]);
  b += chip(524, 278, 202, "Express · REST routes");
  b += chip(524, 310, 202, "Socket.IO · rooms");
  b += chip(524, 342, 202, "engine · official results", null, "acc");
  b += zone(790, 190, 190, 170, "Neon · free tier");
  b += box(810, 240, 150, 90, "Postgres 17", ["sleeps when idle", "6h restore window"]);
  b += edge(id, [[135, 170], [135, 97], [345, 97]]);
  b += label(240, 90, "pages + JS");
  b += edge(id, [[250, 274], [350, 274]]);
  b += label(300, 266, "REST + cookie");
  b += edge(id, [[250, 310], [350, 310]], { both: true });
  b += label(300, 328, "WebSocket");
  b += edge(id, [[690, 97], [555, 97]]);
  b += label(622, 89, "build on push");
  b += edge(id, [[800, 97], [850, 97]]);
  b += edge(id, [[745, 132], [745, 172], [620, 172], [620, 232]]);
  b += label(682, 166, "deploy after CI");
  b += edge(id, [[480, 292], [510, 292]]);
  b += edge(id, [[740, 285], [810, 285]]);
  b += label(775, 277, "Prisma");
  b += edge(id, [[935, 132], [935, 240]]);
  b += label(935, 176, "nightly reset");
  return svg(id, 1000, 500, "Architecture: the browser loads the Next.js app from Vercel and talks to one Node process on Render over REST and a WebSocket. The API stores data in Neon Postgres, and GitHub Actions resets the demo nightly. The same engine package runs in the browser and on the server.", b);
}

export const ship = () =>
  sequence(
    "s3",
    [
      { key: "Y", label: "You", sub: "git push", x: 80 },
      { key: "G", label: "GitHub", sub: "repo + Actions", x: 300 },
      { key: "V", label: "Vercel", sub: "web app", x: 520 },
      { key: "R", label: "Render", sub: "render.yaml", x: 720 },
    ],
    [
      { msg: ["Y", "G"], label: "1. git push main" },
      { self: "G", lines: ["2. CI: typecheck · engine + web tests", "python + fixture --check", "api tests against postgres:17"] },
      { msg: ["G", "V"], label: "3. webhook: new commit" },
      { self: "V", lines: ["build engine, then next build", "promote → allocation.calebweeks.com", "doesn't wait for CI"] },
      { msg: ["G", "R"], label: ["4. CI passed on main", "(API, engine or lockfile changed)"] },
      { self: "R", lines: ["pnpm install · build", "prisma migrate deploy (Neon)", "start Node, wait for /health", "switch traffic to the new instance"] },
      { msg: ["R", "Y"], reply: true, label: "5. live, or the old instance keeps serving" },
    ],
    "Ship sequence: a push to main runs CI on GitHub Actions and, independently, a Vercel build of the web app. Render deploys the API only after CI passes, and only when API, engine or lockfile files changed: it builds, applies migrations to Neon, starts the new instance and switches traffic once /health answers.",
  );
