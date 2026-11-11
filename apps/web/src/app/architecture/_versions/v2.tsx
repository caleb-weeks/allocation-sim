import { C, Note } from "../_lib/primitives";
import type { HostingContent } from "../_lib/content";
import { architecture, ship } from "./v2-diagrams";

export const v2: HostingContent = {
  apiSummary: "Express + Socket.IO on Render, Postgres on Neon",
  architectureIntro:
    "Everything runs on free plans. Vercel serves the web pages; one Node process on Render serves both the REST API and the live WebSocket; Neon hosts Postgres; GitHub Actions runs CI and the nightly demo reset.",
  architectureSvg: architecture(),
  notes: (
    <>
      <Note title="Free tiers sleep.">
        The API sleeps after 15 idle minutes and the database after 5. The first visit after that waits up to a minute, so
        every page pings <C>/health</C> on load and shows a &ldquo;waking up&rdquo; notice if it&apos;s slow (
        <C>ServerWaking.tsx</C>).
      </Note>
      <Note title="Migrations run in the build.">
        Render&apos;s free plan has no pre-deploy step, so <C>prisma migrate deploy</C> runs at the end of each build,
        before the new instance takes traffic.
      </Note>
      <Note title="GitHub Actions keeps the demo tidy.">
        A scheduled workflow rebuilds the shared round every night at 03:30 UTC (<C>demo-reset.yml</C>).
      </Note>
    </>
  ),
  shipSvg: ship(),
  shipCaption: (
    <>
      Vercel deploys the web app on every push to <C>main</C>. Render deploys the API only after CI passes, and only when
      files it depends on changed (<C>buildFilter</C> in <C>render.yaml</C>). If the new instance never answers{" "}
      <C>/health</C>, the old one keeps serving.
    </>
  ),
};
