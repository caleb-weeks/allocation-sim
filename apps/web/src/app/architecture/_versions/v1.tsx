import { C, Note } from "../_lib/primitives";
import type { HostingContent } from "../_lib/content";
import { architecture, pipeline, ship } from "./v1-diagrams";

export const v1: HostingContent = {
  apiSummary: "Express + Socket.IO on a GCP e2-micro",
  architectureIntro:
    "Two hosts serve the app. Vercel serves the web pages; one Node process on a small GCP VM serves both the REST API and the live WebSocket, behind Caddy, with Postgres on the same machine.",
  architectureSvg: architecture(),
  pipelineSvg: pipeline(),
  pipelineCaption: (
    <>
      The top row is the scenario pipeline in <C>python/pipeline</C>. The bottom row is how the math is verified: an
      independent NumPy solver writes expected answers that the TypeScript engine must reproduce. CI regenerates both
      JSON files and fails if either differs from the committed copy.
    </>
  ),
  notes: (
    <>
      <Note title="Caddy only terminates TLS.">
        It gets the Let&apos;s Encrypt certificate, adds HSTS and proxies everything to <C>127.0.0.1:4000</C>. Node never
        listens publicly.
      </Note>
      <Note title="Postgres has no network port.">
        The API connects over a unix socket with peer auth, so there&apos;s no database password to leak.
      </Note>
      <Note title="Cron keeps the demo tidy.">
        A nightly <C>pg_dump</C> (14 kept, each verified readable), then a demo reset that rebuilds the shared round.
      </Note>
    </>
  ),
  shipSvg: ship(),
  shipCaption: (
    <>
      Vercel deploys the web app on every push to <C>main</C>. The API deploys separately: the manual Deploy API workflow
      SSHes into the VM and runs <C>infra/vm/deploy.sh</C>, which can also be run by hand over <C>gcloud compute ssh</C>.
    </>
  ),
};
