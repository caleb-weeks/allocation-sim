import Link from "next/link";
import { C } from "./primitives";

// What changed between hosting versions, and why. Shown on every version's page.

const rows: [aspect: string, v1: React.ReactNode, v2: React.ReactNode, tradeoff: React.ReactNode][] = [
  ["Monthly cost", "≈ $3.60, for the VM's public IPv4 address", "$0", "Removed the only paid line item."],
  [
    "API host",
    <>Node 22 under systemd on a GCP e2-micro (free tier)</>,
    <>Render free web service, declared in <C>render.yaml</C></>,
    "No OS to patch or SSH into. Lost root access and the ability to run anything else on the box.",
  ],
  ["HTTPS", "Caddy + Let's Encrypt on the VM", "Render's edge", "Same result, now managed."],
  [
    "Database",
    "Postgres 15 on the same VM, over a unix socket with peer auth",
    "Neon Postgres 17, over TLS with a password",
    "Gave up a database with no network port and no password. Gained a managed database and point-in-time restore.",
  ],
  [
    "Backups",
    <>Nightly <C>pg_dump</C>, 14 kept, each checked readable</>,
    "Neon's 6-hour restore window",
    "A much shorter window, acceptable because the only data is demo data that's rebuilt nightly anyway.",
  ],
  [
    "Availability",
    "Always on",
    "API sleeps after 15 idle minutes (≈1 min to wake); database after 5",
    <>The biggest user-facing cost. Every page now warms the API on load and explains the wait (<C>ServerWaking.tsx</C>).</>,
  ],
  [
    "Deploys",
    <>Manual workflow: SSH in, run <C>deploy.sh</C></>,
    "Automatic once CI passes on main, only when API files change",
    "Migrations moved into the build, because pre-deploy steps are paid-only on Render.",
  ],
  [
    "Demo reset",
    "cron on the VM, 03:30",
    <>Scheduled GitHub Actions workflow, 03:30 UTC</>,
    "GitHub pauses schedules after 60 days without repo activity.",
  ],
  ["api DNS record", "A record → reserved static IP", "CNAME → the Render service", "Nothing to reserve or pay for."],
  [
    "Sample projects",
    "One: Guatemala literacy by department",
    "Five, picked on the landing page, plus your own list of projects",
    "More concrete examples to explore, each with its own pipeline, sources and assumptions to keep current.",
  ],
];

export function Changes() {
  return (
    <div className="space-y-5">
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[760px] border-collapse text-left text-sm">
          <thead className="bg-surface-2 text-xs uppercase tracking-wider text-muted">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">Aspect</th>
              <th scope="col" className="px-3 py-2 font-medium">
                <Link href="/architecture/v1" className="underline-offset-2 hover:underline">v1 · One GCP VM</Link>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">
                <Link href="/architecture/v2" className="underline-offset-2 hover:underline">v2 · Render + Neon</Link>
              </th>
              <th scope="col" className="px-3 py-2 font-medium">Trade-off</th>
            </tr>
          </thead>
          <tbody className="bg-surface align-top">
            {rows.map(([aspect, a, b, why]) => (
              <tr key={aspect} className="border-t border-border">
                <th scope="row" className="px-3 py-2.5 font-semibold">{aspect}</th>
                <td className="px-3 py-2.5 text-ink-2">{a}</td>
                <td className="px-3 py-2.5 text-ink-2">{b}</td>
                <td className="px-3 py-2.5 text-muted">{why}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="max-w-[72ch] list-disc space-y-1.5 pl-5 text-ink-2">
        <li>
          <strong className="text-ink">The application code didn&apos;t change.</strong> The engine, API routes, auth,
          cookies, permissions and realtime layer are identical in both versions. The move changed configuration, docs and
          comments, and added the &ldquo;waking up&rdquo; notice.
        </li>
        <li>
          <strong className="text-ink">The switch was staged.</strong> Render and Neon were added alongside the
          running VM, Neon was migrated and seeded, and the service was tested at its <C>onrender.com</C> address
          (sign-in, cookie flags, a cross-site request rejected, WebSocket join) before the <C>api</C> DNS record moved.
          The VM kept serving until the live site passed the same checks, then it was deleted.
        </li>
        <li>
          <strong className="text-ink">No data needed copying.</strong> The VM held only the seeded demo round and seven
          demo personas, so the new database was built from migrations and the seed script rather than a dump.
        </li>
      </ul>
    </div>
  );
}
